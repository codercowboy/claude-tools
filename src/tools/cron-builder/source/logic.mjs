
  // =====================================================================
  // Cron Builder — pure logic (DOM-free, unit-tested)
  //
  // No document / window / localStorage in this file. app.mjs inlines it at
  // build time; tests/unit/*.test.mjs import it directly.
  //
  // FLAVOR-AWARE. Each supported cron flavor (Standard/Unix, Unix-with-seconds,
  // Quartz, Spring @Scheduled, AWS EventBridge) differs in field layout
  // (5/6/7 fields, seconds-leading vs year-trailing), allowed special chars
  // (`?` `L` `W` `#`, macros), and day-of-week numbering (unix 0–7 with 7=Sun,
  // vs quartz/aws 1–7 with 1=Sun). See DESIGN.md § "Flavors".
  //
  // Internal normalization: every day-of-week value is normalized to the
  // JavaScript convention (0=Sunday … 6=Saturday) inside `valueSet`, so
  // `nextRuns` date math is correct regardless of flavor. Term objects keep the
  // *literal* cron numbers (for serialization + editor round-trips).
  //
  // Model shape (from parseCron):
  //   { flavor:string, seconds:boolean, hasYear:boolean, order:string[],
  //     second?:Field, minute:Field, hour:Field, dom:Field, month:Field,
  //     dow:Field, year?:Field }
  //   Field = { raw, terms:Term[], wildcard:boolean, question:boolean,
  //             special:boolean, values:number[], valueSet:Set }
  //   Term  = { type:'every' }
  //         | { type:'step', step }            // */n over the whole range
  //         | { type:'stepFrom', from, step }  // a/n
  //         | { type:'single', value }
  //         | { type:'range', from, to }
  //         | { type:'rangeStep', from, to, step }
  //         | { type:'lastDom' }               // L (day-of-month = last day)
  //         | { type:'lastDomOffset', offset } // L-n
  //         | { type:'lastWeekday' }           // LW (last weekday of month)
  //         | { type:'nearestWeekday', dom }   // 15W
  //         | { type:'nthDow', dow, jsDow, nth }// 6#3
  //         | { type:'lastDow', dow, jsDow }   // 5L (last given weekday)
  // =====================================================================

  // ===== BEGIN PURE-LOGIC =====

  const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const MONTH_ABBR = [
    '', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const MONTH_ALIASES = Object.fromEntries(
    MONTH_ABBR.map((n, i) => [n, i]).filter(([n]) => n)
  );

  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DOW_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; // index = JS day (0=Sun)

  // Two day-of-week alias tables, one per numbering convention.
  //  unix:   SUN=0 … SAT=6   (and a literal 7 also = Sunday)
  //  quartz: SUN=1 … SAT=7   (1 = Sunday)
  const DOW_ALIASES_UNIX = Object.fromEntries(DOW_ABBR.map((n, i) => [n, i]));
  const DOW_ALIASES_QUARTZ = Object.fromEntries(DOW_ABBR.map((n, i) => [n, i + 1]));

  // Recognized name tokens (uppercase), used to tell a real name like JUL / WED
  // apart from a special token that merely contains an L or W.
  const NAME_TOKENS = new Set([...MONTH_ABBR.filter(Boolean), ...DOW_ABBR]);

  // ---------------------------------------------------------------------
  // Flavors
  // ---------------------------------------------------------------------
  //  dowNumbering: 'unix' (0–7, 7=Sun) | 'quartz' (1–7, 1=Sun)
  //  requireQuestionRule: 'exactlyOne' — exactly one of dom/dow must be `?`.
  const FLAVORS = {
    standard: {
      id: 'standard', label: 'Standard / Unix',
      dowNumbering: 'unix',
      allowQuestion: false, allowL: false, allowW: false, allowHash: false,
      allowMacros: true, requireQuestionRule: null,
    },
    unixSeconds: {
      id: 'unixSeconds', label: 'Unix with seconds',
      dowNumbering: 'unix',
      allowQuestion: false, allowL: false, allowW: false, allowHash: false,
      allowMacros: false, requireQuestionRule: null,
    },
    quartz: {
      id: 'quartz', label: 'Quartz (Java)',
      dowNumbering: 'quartz',
      allowQuestion: true, allowL: true, allowW: true, allowHash: true,
      allowMacros: false, requireQuestionRule: 'exactlyOne',
    },
    spring: {
      id: 'spring', label: 'Spring @Scheduled',
      dowNumbering: 'unix',
      allowQuestion: true, allowL: true, allowW: false, allowHash: true,
      allowMacros: false, requireQuestionRule: null,
    },
    aws: {
      id: 'aws', label: 'AWS EventBridge',
      dowNumbering: 'quartz',
      allowQuestion: true, allowL: true, allowW: true, allowHash: true,
      allowMacros: false, requireQuestionRule: 'exactlyOne',
    },
  };

  const FLAVOR_IDS = Object.keys(FLAVORS);

  function getFlavor(id) {
    return FLAVORS[id] || FLAVORS.standard;
  }

  // Resolve the flavor from parse options. Back-compat: `{ seconds:true }`
  // (the pre-flavor API) maps to the Unix-with-seconds flavor.
  function resolveFlavor(opts = {}) {
    if (opts.flavor && FLAVORS[opts.flavor]) return FLAVORS[opts.flavor];
    if (opts.seconds === true) return FLAVORS.unixSeconds;
    return FLAVORS.standard;
  }

  // ---------------------------------------------------------------------
  // Field specs (flavor-tuned dow + optional year)
  // ---------------------------------------------------------------------
  //  min/validMax — bounds for a literal value or range endpoint.
  //  wildMax      — top of the range used to expand `*` / `*/n`.
  //  dowOffset    — subtracted to map a literal dow to the JS day (0=Sun).
  //  wrap7        — unix dow only: a literal 7 is an alias for Sunday (0).
  function buildFieldSpecs(flavor) {
    const dowUnix = flavor.dowNumbering === 'unix';
    return {
      second: { key: 'second', label: 'Seconds',      min: 0, validMax: 59, wildMax: 59 },
      minute: { key: 'minute', label: 'Minutes',      min: 0, validMax: 59, wildMax: 59 },
      hour:   { key: 'hour',   label: 'Hours',        min: 0, validMax: 23, wildMax: 23 },
      dom:    { key: 'dom',    label: 'Day of month', min: 1, validMax: 31, wildMax: 31,
                allowQuestion: flavor.allowQuestion, allowL: flavor.allowL, allowW: flavor.allowW, allowHash: false },
      month:  { key: 'month',  label: 'Month',        min: 1, validMax: 12, wildMax: 12, aliases: MONTH_ALIASES },
      dow:    { key: 'dow',    label: 'Day of week',
                min: dowUnix ? 0 : 1, validMax: 7, wildMax: dowUnix ? 6 : 7,
                aliases: dowUnix ? DOW_ALIASES_UNIX : DOW_ALIASES_QUARTZ,
                dowOffset: dowUnix ? 0 : 1, wrap7: dowUnix,
                allowQuestion: flavor.allowQuestion, allowL: flavor.allowL, allowW: false, allowHash: flavor.allowHash },
      year:   { key: 'year',   label: 'Year',         min: 1970, validMax: 2199, wildMax: 2199 },
    };
  }

  const SPECS_CACHE = {};
  function specsForFlavor(id) {
    if (!SPECS_CACHE[id]) SPECS_CACHE[id] = buildFieldSpecs(getFlavor(id));
    return SPECS_CACHE[id];
  }

  // Backward-compatible static export (Standard / Unix numbering).
  const FIELD_SPECS = specsForFlavor('standard');

  // Field order in a standard 5-field expression (compat export/helper).
  const BASE_FIELD_ORDER = ['minute', 'hour', 'dom', 'month', 'dow'];

  // Compat: the old two-arg field order (false = 5-field, true = 6-field seconds).
  function fieldOrder(seconds) {
    return seconds ? ['second', ...BASE_FIELD_ORDER] : BASE_FIELD_ORDER;
  }

  // The field order for a flavor. Quartz is 6 or 7 fields (year optional).
  function orderForFlavor(id, withYear = false) {
    switch (id) {
      case 'standard':    return ['minute', 'hour', 'dom', 'month', 'dow'];
      case 'unixSeconds': return ['second', 'minute', 'hour', 'dom', 'month', 'dow'];
      case 'quartz':      return withYear
        ? ['second', 'minute', 'hour', 'dom', 'month', 'dow', 'year']
        : ['second', 'minute', 'hour', 'dom', 'month', 'dow'];
      case 'spring':      return ['second', 'minute', 'hour', 'dom', 'month', 'dow'];
      case 'aws':         return ['minute', 'hour', 'dom', 'month', 'dow', 'year'];
      default:            return ['minute', 'hour', 'dom', 'month', 'dow'];
    }
  }

  // Resolve the order used to parse `n` whitespace-separated fields for a flavor,
  // or throw a friendly field-count error.
  function resolveOrder(flavor, n) {
    const id = flavor.id;
    if (id === 'quartz') {
      if (n === 6) return orderForFlavor('quartz', false);
      if (n === 7) return orderForFlavor('quartz', true);
      throw new Error(
        `${flavor.label}: expected 6 or 7 fields (seconds minutes hours day-of-month month day-of-week [year]) but found ${n}.`
      );
    }
    const order = orderForFlavor(id);
    if (n !== order.length) {
      throw new Error(
        `${flavor.label}: expected ${order.length} fields (${order.join(' ')}) but found ${n}.`
      );
    }
    return order;
  }

  const MACROS = {
    '@yearly':   '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly':  '0 0 1 * *',
    '@weekly':   '0 0 * * 0',
    '@daily':    '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly':   '0 * * * *',
  };

  // ---------------------------------------------------------------------
  // Token / term parsing
  // ---------------------------------------------------------------------
  function resolveToken(tok, spec) {
    const t = String(tok == null ? '' : tok).trim();
    if (t === '') throw new Error(`${spec.label}: empty value.`);
    const upper = t.toUpperCase();
    if (spec.aliases && Object.prototype.hasOwnProperty.call(spec.aliases, upper)) {
      return spec.aliases[upper];
    }
    if (!/^\d+$/.test(t)) {
      throw new Error(`${spec.label}: "${t}" is not a valid value.`);
    }
    const n = parseInt(t, 10);
    if (n < spec.min || n > spec.validMax) {
      throw new Error(`${spec.label}: ${n} is out of range (${spec.min}–${spec.validMax}).`);
    }
    return n;
  }

  function parseStep(str, spec) {
    if (!/^\d+$/.test(str)) throw new Error(`${spec.label}: step "${str}" is not a number.`);
    const n = parseInt(str, 10);
    if (n < 1) throw new Error(`${spec.label}: step must be 1 or greater.`);
    return n;
  }

  // Special tokens (L / W / #) — only in day-of-month / day-of-week. Returns a
  // special Term, or null if `str` is not a special token. Throws if the token
  // is special but disallowed by the field/flavor.
  function parseSpecialTerm(str, spec, flavor) {
    const U = str.toUpperCase();
    let m;

    // nth weekday: `6#3`, `FRI#3` (day-of-week only).
    if ((m = U.match(/^(\d+|[A-Z]{3})#(\d+)$/))) {
      if (spec.key !== 'dow') throw new Error(`${spec.label}: "#" is only valid in day-of-week.`);
      if (!flavor.allowHash) throw new Error(`${flavor.label} does not support "#".`);
      const lit = resolveToken(m[1], spec);
      const nthN = parseInt(m[2], 10);
      if (nthN < 1 || nthN > 5) throw new Error(`${spec.label}: "#n" must be between 1 and 5.`);
      return { type: 'nthDow', dow: lit, jsDow: normalizeValue(lit, spec), nth: nthN };
    }

    if (spec.key === 'dom') {
      if (U === 'LW') {
        if (!flavor.allowL || !flavor.allowW) throw new Error(`${flavor.label} does not support "LW".`);
        return { type: 'lastWeekday' };
      }
      if ((m = U.match(/^(\d+)W$/))) {
        if (!flavor.allowW) throw new Error(`${flavor.label} does not support "W".`);
        const dv = resolveToken(m[1], spec);
        return { type: 'nearestWeekday', dom: dv };
      }
      if (U === 'L') {
        if (!flavor.allowL) throw new Error(`${flavor.label} does not support "L".`);
        return { type: 'lastDom' };
      }
      if ((m = U.match(/^L-(\d+)$/))) {
        if (!flavor.allowL) throw new Error(`${flavor.label} does not support "L".`);
        const off = parseInt(m[1], 10);
        if (off < 0 || off > 30) throw new Error(`${spec.label}: "L-n" offset out of range.`);
        return { type: 'lastDomOffset', offset: off };
      }
    }

    if (spec.key === 'dow') {
      if ((m = U.match(/^(\d+|[A-Z]{3})L$/))) {
        if (!flavor.allowL) throw new Error(`${flavor.label} does not support "L".`);
        const lit = resolveToken(m[1], spec);
        return { type: 'lastDow', dow: lit, jsDow: normalizeValue(lit, spec) };
      }
      if (U === 'L') {
        if (!flavor.allowL) throw new Error(`${flavor.label} does not support "L".`);
        // Bare L in day-of-week = Saturday (the last day of the week).
        const satLit = spec.dowOffset ? 7 : 6;
        return { type: 'single', value: satLit };
      }
    }

    return null;
  }

  function parseTerm(part, spec, flavor) {
    const str = part.trim();
    if (str === '') throw new Error(`${spec.label}: empty term.`);

    if (spec.key === 'dom' || spec.key === 'dow') {
      const sp = parseSpecialTerm(str, spec, flavor);
      if (sp) return sp;
    }

    if (str.includes('/')) {
      const bits = str.split('/');
      if (bits.length !== 2) throw new Error(`${spec.label}: malformed step in "${str}".`);
      const head = bits[0].trim();
      const step = parseStep(bits[1].trim(), spec);
      if (head === '*') return { type: 'step', step };
      if (head.includes('-')) {
        const [a, b] = splitRange(head, spec);
        return { type: 'rangeStep', from: a, to: b, step };
      }
      return { type: 'stepFrom', from: resolveToken(head, spec), step };
    }

    if (str === '*') return { type: 'every' };

    if (str.includes('-')) {
      const [a, b] = splitRange(str, spec);
      return { type: 'range', from: a, to: b };
    }

    return { type: 'single', value: resolveToken(str, spec) };
  }

  function splitRange(str, spec) {
    const bits = str.split('-');
    if (bits.length !== 2) throw new Error(`${spec.label}: malformed range "${str}".`);
    const a = resolveToken(bits[0].trim(), spec);
    const b = resolveToken(bits[1].trim(), spec);
    if (a > b) throw new Error(`${spec.label}: range start ${a} is after end ${b}.`);
    return [a, b];
  }

  // Map a literal cron value to the internal (JS-day for dow) value.
  function normalizeValue(v, spec) {
    if (spec && spec.key === 'dow') {
      if (spec.wrap7 && v === 7) return 0;
      return v - (spec.dowOffset || 0);
    }
    return v;
  }

  const SPECIAL_TYPES = new Set([
    'lastDom', 'lastDomOffset', 'lastWeekday', 'nearestWeekday', 'nthDow', 'lastDow',
  ]);

  function expandTerm(term, spec) {
    const out = [];
    switch (term.type) {
      case 'every':
        for (let v = spec.min; v <= spec.wildMax; v++) out.push(normalizeValue(v, spec));
        break;
      case 'step':
        for (let v = spec.min; v <= spec.wildMax; v += term.step) out.push(normalizeValue(v, spec));
        break;
      case 'stepFrom':
        for (let v = term.from; v <= spec.wildMax; v += term.step) out.push(normalizeValue(v, spec));
        break;
      case 'single':
        out.push(normalizeValue(term.value, spec));
        break;
      case 'range':
        for (let v = term.from; v <= term.to; v++) out.push(normalizeValue(v, spec));
        break;
      case 'rangeStep':
        for (let v = term.from; v <= term.to; v += term.step) out.push(normalizeValue(v, spec));
        break;
      default:
        // Special terms contribute no static values (matched date-by-date).
        break;
    }
    return out;
  }

  function parseField(text, spec, flavor = FLAVORS.standard) {
    const raw = String(text == null ? '' : text).trim();
    if (raw === '') throw new Error(`${spec.label}: empty field.`);

    if (raw === '?') {
      if (!spec.allowQuestion) {
        if (!flavor.allowQuestion) throw new Error(`${flavor.label} does not support "?".`);
        throw new Error(`${spec.label}: "?" is only allowed for day-of-month and day-of-week.`);
      }
      const values = [];
      for (let v = spec.min; v <= spec.wildMax; v++) values.push(normalizeValue(v, spec));
      return {
        raw, terms: [{ type: 'every' }], wildcard: false, question: true,
        special: false, values, valueSet: new Set(values),
      };
    }
    if (raw.includes('?')) {
      throw new Error(`${spec.label}: "?" must stand alone.`);
    }

    const parts = raw.split(',');
    const terms = parts.map((p) => parseTerm(p, spec, flavor));
    const valueSet = new Set();
    for (const term of terms) {
      for (const v of expandTerm(term, spec)) valueSet.add(v);
    }
    const values = Array.from(valueSet).sort((x, y) => x - y);
    const wildcard = terms.length === 1 && terms[0].type === 'every';
    const special = terms.some((t) => SPECIAL_TYPES.has(t.type));
    return { raw, terms, wildcard, question: false, special, values, valueSet };
  }

  // ---------------------------------------------------------------------
  // Serialize
  // ---------------------------------------------------------------------
  function serializeTerm(t) {
    switch (t.type) {
      case 'every':          return '*';
      case 'step':           return `*/${t.step}`;
      case 'stepFrom':       return `${t.from}/${t.step}`;
      case 'single':         return `${t.value}`;
      case 'range':          return `${t.from}-${t.to}`;
      case 'rangeStep':      return `${t.from}-${t.to}/${t.step}`;
      case 'lastDom':        return 'L';
      case 'lastDomOffset':  return `L-${t.offset}`;
      case 'lastWeekday':    return 'LW';
      case 'nearestWeekday': return `${t.dom}W`;
      case 'nthDow':         return `${t.dow}#${t.nth}`;
      case 'lastDow':        return `${t.dow}L`;
      default:               return '*';
    }
  }

  function buildField(field) {
    if (field.question) return '?';
    return field.terms.map(serializeTerm).join(',');
  }

  // ---------------------------------------------------------------------
  // parseCron / buildCron
  // ---------------------------------------------------------------------
  function checkSpecialChars(text, flavor) {
    const bad = [];
    const upper = text.toUpperCase();
    const toks = upper.match(/[A-Z0-9]+/g) || [];
    let hasL = false, hasW = false;
    for (const tok of toks) {
      if (/L/.test(tok) && !NAME_TOKENS.has(tok)) hasL = true;
      if (/W/.test(tok) && !NAME_TOKENS.has(tok)) hasW = true;
    }
    if (hasL && !flavor.allowL) bad.push('L');
    if (hasW && !flavor.allowW) bad.push('W');
    if (text.includes('#') && !flavor.allowHash) bad.push('#');
    if (bad.length) {
      throw new Error(`${flavor.label} does not support ${bad.join(', ')} in a cron expression.`);
    }
  }

  function parseCron(expr, opts = {}) {
    const flavor = resolveFlavor(opts);
    const specs = specsForFlavor(flavor.id);
    let text = String(expr == null ? '' : expr).trim();
    if (text === '') throw new Error('Enter a cron expression.');

    // Macro shortcuts (@daily, …) — flavor must allow them; always 5-field.
    const macroKey = text.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MACROS, macroKey)) {
      if (!flavor.allowMacros) {
        throw new Error(`${flavor.label} does not support the "${text}" macro.`);
      }
      text = MACROS[macroKey];
    } else if (text[0] === '@') {
      throw new Error(`Unknown macro "${text}".`);
    }

    // Reject special chars this flavor doesn't allow (guarding real names like
    // JUL / WED that merely contain an L or W).
    checkSpecialChars(text, flavor);

    const parts = text.split(/\s+/);
    const order = resolveOrder(flavor, parts.length);

    const model = {
      flavor: flavor.id,
      seconds: order.includes('second'),
      hasYear: order.includes('year'),
      order,
    };
    order.forEach((key, i) => {
      model[key] = parseField(parts[i], specs[key], flavor);
    });

    // Quartz / AWS: exactly one of day-of-month / day-of-week must be `?`.
    if (flavor.requireQuestionRule === 'exactlyOne') {
      const cnt = (model.dom.question ? 1 : 0) + (model.dow.question ? 1 : 0);
      if (cnt !== 1) {
        throw new Error(
          `${flavor.label}: exactly one of day-of-month and day-of-week must be "?" (the other a specific value or *).`
        );
      }
    }

    return model;
  }

  function buildCron(model) {
    const order = model.order || orderForFlavor(model.flavor || (model.seconds ? 'unixSeconds' : 'standard'), model.hasYear);
    return order.map((key) => buildField(model[key])).join(' ');
  }

  // ---------------------------------------------------------------------
  // Matching / next runs
  // ---------------------------------------------------------------------
  function isRestricted(field) {
    return !field.wildcard && !field.question;
  }

  function lastDayOfMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  // The day-of-month a `W` (nearest weekday) resolves to for `dom` in date's
  // month — never crossing into an adjacent month.
  function nearestWeekdayDom(y, m, dom) {
    const dim = lastDayOfMonth(y, m);
    let day = Math.min(dom, dim);
    const wd = new Date(y, m, day).getDay();
    if (wd === 6) {            // Saturday
      day = (day === 1) ? day + 2 : day - 1;
    } else if (wd === 0) {     // Sunday
      day = (day === dim) ? day - 2 : day + 1;
    }
    return day;
  }

  function lastWeekdayOfMonth(y, m) {
    let day = lastDayOfMonth(y, m);
    const wd = new Date(y, m, day).getDay();
    if (wd === 6) day -= 1;
    else if (wd === 0) day -= 2;
    return day;
  }

  function domSpecialMatch(t, date) {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    switch (t.type) {
      case 'lastDom':        return d === lastDayOfMonth(y, m);
      case 'lastDomOffset':  return d === lastDayOfMonth(y, m) - t.offset;
      case 'lastWeekday':    return d === lastWeekdayOfMonth(y, m);
      case 'nearestWeekday': return d === nearestWeekdayDom(y, m, t.dom);
      default:               return false;
    }
  }

  function dowSpecialMatch(t, date) {
    switch (t.type) {
      case 'nthDow': {
        if (date.getDay() !== t.jsDow) return false;
        const occ = Math.floor((date.getDate() - 1) / 7) + 1;
        return occ === t.nth;
      }
      case 'lastDow': {
        if (date.getDay() !== t.jsDow) return false;
        return date.getDate() + 7 > lastDayOfMonth(date.getFullYear(), date.getMonth());
      }
      default: return false;
    }
  }

  function domOk(field, date) {
    if (field.valueSet.has(date.getDate())) return true;
    if (field.special) {
      for (const t of field.terms) if (domSpecialMatch(t, date)) return true;
    }
    return false;
  }

  function dowOk(field, date) {
    if (field.valueSet.has(date.getDay())) return true;
    if (field.special) {
      for (const t of field.terms) if (dowSpecialMatch(t, date)) return true;
    }
    return false;
  }

  // Vixie-cron dom/dow rule: if both restricted -> OR; else the restricted one
  // (if any) constrains, otherwise every day matches. `?` is not restricted.
  function dayMatches(model, date) {
    const domR = isRestricted(model.dom);
    const dowR = isRestricted(model.dow);
    const dOk = domOk(model.dom, date);
    const wOk = dowOk(model.dow, date);
    if (domR && dowR) return dOk || wOk;
    if (domR) return dOk;
    if (dowR) return wOk;
    return true;
  }

  function nextRuns(model, from, count = 5) {
    const results = [];
    if (!(from instanceof Date) || Number.isNaN(from.getTime())) return results;
    const useSeconds = model.seconds;
    const yearField = model.hasYear ? model.year : null;
    const yearRestricted = yearField && isRestricted(yearField);
    const maxYear = yearRestricted ? yearField.values[yearField.values.length - 1] : Infinity;

    const d = new Date(from.getTime());
    d.setMilliseconds(0);
    if (useSeconds) {
      d.setSeconds(d.getSeconds() + 1);
    } else {
      d.setSeconds(0);
      d.setMinutes(d.getMinutes() + 1);
    }

    const horizon = new Date(from.getTime());
    horizon.setFullYear(horizon.getFullYear() + 5);

    let guard = 0;
    while (results.length < count && d.getTime() <= horizon.getTime()) {
      if (++guard > 4000000) break;

      if (yearRestricted && !yearField.valueSet.has(d.getFullYear())) {
        if (d.getFullYear() > maxYear) break;
        d.setFullYear(d.getFullYear() + 1, 0, 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }
      if (!model.month.valueSet.has(d.getMonth() + 1)) {
        d.setMonth(d.getMonth() + 1, 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }
      if (!dayMatches(model, d)) {
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        continue;
      }
      if (!model.hour.valueSet.has(d.getHours())) {
        d.setHours(d.getHours() + 1, 0, 0, 0);
        continue;
      }
      if (!model.minute.valueSet.has(d.getMinutes())) {
        d.setMinutes(d.getMinutes() + 1, 0, 0);
        continue;
      }
      if (useSeconds && !model.second.valueSet.has(d.getSeconds())) {
        d.setSeconds(d.getSeconds() + 1, 0);
        continue;
      }

      results.push(new Date(d.getTime()));
      if (useSeconds) d.setSeconds(d.getSeconds() + 1, 0);
      else d.setMinutes(d.getMinutes() + 1, 0, 0);
    }
    return results;
  }

  // ---------------------------------------------------------------------
  // Describe (plain English)
  // ---------------------------------------------------------------------
  function pad(n) { return String(n).padStart(2, '0'); }
  function capitalize(s) { return s.length ? s[0].toUpperCase() + s.slice(1) : s; }

  function joinList(arr) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
  }

  function asSingle(field) {
    if (field.question) return null;
    if (field.terms.length === 1 && field.terms[0].type === 'single') return field.terms[0].value;
    return null;
  }
  function asStep(field) {
    if (field.terms.length === 1 && field.terms[0].type === 'step') return field.terms[0].step;
    return null;
  }
  function asSingleTerm(field) {
    return field.terms.length === 1 ? field.terms[0] : null;
  }
  function stepPhrase(field, unit, fmt = String) {
    const t = asSingleTerm(field);
    if (!t) return null;
    if (t.type === 'rangeStep') return `every ${nth(t.step)} ${unit} from ${fmt(t.from)} through ${fmt(t.to)}`;
    if (t.type === 'stepFrom') return `every ${nth(t.step)} ${unit} from ${fmt(t.from)} on`;
    return null;
  }

  function termText(t, fmt) {
    switch (t.type) {
      case 'single':    return fmt(t.value);
      case 'range':     return `${fmt(t.from)} through ${fmt(t.to)}`;
      case 'rangeStep': return `every ${nth(t.step)} value from ${fmt(t.from)} through ${fmt(t.to)}`;
      case 'stepFrom':  return `every ${nth(t.step)} value from ${fmt(t.from)} on`;
      case 'step':      return `every ${nth(t.step)} value`;
      case 'every':     return 'every value';
      default:          return '';
    }
  }

  function nth(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function fieldListText(field, fmt) {
    return joinList(field.terms.map((t) => termText(t, fmt)));
  }

  function describeTimeClause(model) {
    const useSec = model.seconds;
    const min = model.minute;
    const hr = model.hour;
    const sec = useSec ? model.second : null;

    const minS = asSingle(min);
    const hrS = asSingle(hr);
    const secS = useSec ? asSingle(sec) : 0;

    if (minS != null && hrS != null && (!useSec || secS != null)) {
      const ss = useSec ? `:${pad(secS)}` : '';
      return `At ${pad(hrS)}:${pad(minS)}${ss}`;
    }

    const segments = [];

    if (useSec) {
      if (sec.wildcard) segments.push('every second');
      else {
        const st = asStep(sec);
        const sp = stepPhrase(sec, 'second');
        if (st != null) segments.push(`every ${nth(st)} second`);
        else if (sp) segments.push(sp);
        else segments.push(`at second ${fieldListText(sec, String)}`);
      }
    }

    if (min.wildcard) {
      if (!useSec) segments.push('every minute');
    } else {
      const st = asStep(min);
      const sp = stepPhrase(min, 'minute');
      if (st != null) segments.push(`every ${nth(st)} minute`);
      else if (minS != null) segments.push(`at minute ${minS}`);
      else if (sp) segments.push(sp);
      else segments.push(`at minute ${fieldListText(min, String)}`);
    }

    if (!hr.wildcard) {
      const st = asStep(hr);
      const sp = stepPhrase(hr, 'hour');
      if (st != null) segments.push(`every ${nth(st)} hour`);
      else if (hrS != null) segments.push(`past hour ${hrS}`);
      else if (sp) segments.push(sp);
      else segments.push(`past hour ${fieldListText(hr, String)}`);
    }

    if (segments.length === 0) return 'Every minute';
    return capitalize(segments.join(', '));
  }

  // Text for a special day-of-month term.
  function domSpecialText(t) {
    switch (t.type) {
      case 'lastDom':        return 'the last day of the month';
      case 'lastDomOffset':  return t.offset === 0 ? 'the last day of the month' : `${nth(t.offset)}-to-last day of the month`;
      case 'lastWeekday':    return 'the last weekday of the month';
      case 'nearestWeekday': return `the nearest weekday to day ${t.dom}`;
      default:               return '';
    }
  }

  function dowSpecialText(t) {
    switch (t.type) {
      case 'nthDow':  return `the ${nth(t.nth)} ${DOW_NAMES[t.jsDow]} of the month`;
      case 'lastDow': return `the last ${DOW_NAMES[t.jsDow]} of the month`;
      default:        return '';
    }
  }

  function describeDomClause(field) {
    if (!isRestricted(field)) return '';
    if (field.special) {
      const parts = field.terms.map((t) =>
        SPECIAL_TYPES.has(t.type) ? domSpecialText(t) : `day ${termText(t, String)}`);
      return `on ${joinList(parts)}`;
    }
    const st = asStep(field);
    if (st != null) return `on every ${nth(st)} day of the month`;
    return `on day ${fieldListText(field, String)} of the month`;
  }

  function describeDowClause(field, dowSpec) {
    if (!isRestricted(field)) return '';
    const fmt = (v) => DOW_NAMES[normalizeValue(v, dowSpec)];
    if (field.special) {
      const parts = field.terms.map((t) =>
        SPECIAL_TYPES.has(t.type) ? dowSpecialText(t) : termText(t, fmt));
      return `on ${joinList(parts)}`;
    }
    const st = asStep(field);
    if (st != null) return `on every ${nth(st)} day of the week`;
    return `on ${fieldListText(field, fmt)}`;
  }

  function describeMonthClause(field) {
    if (!isRestricted(field)) return '';
    const st = asStep(field);
    const fmt = (v) => MONTH_NAMES[v];
    if (st != null) return `in every ${nth(st)} month`;
    return `in ${fieldListText(field, fmt)}`;
  }

  function describeYearClause(field) {
    if (!field || !isRestricted(field)) return '';
    const st = asStep(field);
    if (st != null) return `in every ${nth(st)} year`;
    return `in ${fieldListText(field, String)}`;
  }

  function describeCron(model) {
    const specs = specsForFlavor(model.flavor || (model.seconds ? 'unixSeconds' : 'standard'));
    const time = describeTimeClause(model);
    const domClause = describeDomClause(model.dom);
    const dowClause = describeDowClause(model.dow, specs.dow);
    const monthClause = describeMonthClause(model.month);
    const yearClause = model.hasYear ? describeYearClause(model.year) : '';

    const bothRestricted = isRestricted(model.dom) && isRestricted(model.dow);

    let out = time;
    const dayParts = [];
    if (domClause) dayParts.push(domClause);
    if (dowClause) dayParts.push(dowClause);
    if (dayParts.length) {
      out += ', ' + dayParts.join(bothRestricted ? ' or ' : ' and ');
    }
    if (monthClause) out += ', ' + monthClause;
    if (yearClause) out += ', ' + yearClause;
    return out;
  }

  // ---------------------------------------------------------------------
  // Editor mode (drives the app's per-field pickers)
  // ---------------------------------------------------------------------
  function fieldEditorMode(field) {
    // '?' and '*' both read as "Every" in the editor (semantically identical).
    if (field.question || field.wildcard) return { mode: 'every' };
    // Special tokens (L/W/#) round-trip through the raw Custom editor.
    if (field.special) return { mode: 'custom', text: buildField(field) };
    if (field.terms.length === 1) {
      const t = field.terms[0];
      if (t.type === 'step') return { mode: 'step', step: t.step };
      if (t.type === 'range') return { mode: 'range', from: t.from, to: t.to };
    }
    if (field.terms.every((t) => t.type === 'single')) {
      return { mode: 'specific', values: field.terms.map((t) => t.value) };
    }
    return { mode: 'custom', text: buildField(field) };
  }

  // ---------------------------------------------------------------------
  // Flavor conversion (for switching flavors in the app; pure + testable)
  // ---------------------------------------------------------------------
  const DEFAULTS = {
    standard:    '0 9 * * 1-5',
    unixSeconds: '0 0 9 * * 1-5',
    quartz:      '0 0 9 ? * 2-6',   // Mon–Fri in Quartz numbering (2–6), dom = ?
    spring:      '0 0 9 * * 1-5',
    aws:         '0 9 ? * 2-6 *',   // min hour dom month dow year; Mon–Fri, dom = ?
  };

  function sameDowNumbering(a, b) {
    return (a.dowOffset || 0) === (b.dowOffset || 0) && !!a.wrap7 === !!b.wrap7;
  }

  function domTextForTarget(field, toFlavor) {
    if (field.question) return toFlavor.allowQuestion ? '?' : '*';
    if (field.wildcard) return '*';
    if (field.special) {
      const bad = field.terms.some((t) =>
        (t.type === 'nearestWeekday' && !toFlavor.allowW) ||
        (t.type === 'lastWeekday' && (!toFlavor.allowL || !toFlavor.allowW)) ||
        ((t.type === 'lastDom' || t.type === 'lastDomOffset') && !toFlavor.allowL));
      if (bad) return '*';
    }
    return buildField(field);
  }

  function dowTextForTarget(field, fromDowSpec, toDowSpec, toFlavor) {
    if (field.question) return toFlavor.allowQuestion ? '?' : '*';
    if (field.wildcard) return '*';

    const hasHash = field.terms.some((t) => t.type === 'nthDow');
    const hasL = field.terms.some((t) => t.type === 'lastDow');
    const specialsOk = (!hasHash || toFlavor.allowHash) && (!hasL || toFlavor.allowL);

    if (sameDowNumbering(fromDowSpec, toDowSpec) && specialsOk) {
      return buildField(field);
    }

    // Cross-numbering (or unsupported special): re-emit as a flat, always-valid
    // list of the target's day numbers, degrading unsupported specials to the
    // plain weekday.
    const toOff = toDowSpec.dowOffset || 0;
    const parts = [];
    const plain = [...field.valueSet].sort((a, b) => a - b).map((js) => js + toOff);
    if (plain.length) parts.push(...plain.map(String));
    for (const t of field.terms) {
      if (t.type === 'nthDow') {
        parts.push(toFlavor.allowHash ? `${t.jsDow + toOff}#${t.nth}` : String(t.jsDow + toOff));
      } else if (t.type === 'lastDow') {
        parts.push(toFlavor.allowL ? `${t.jsDow + toOff}L` : String(t.jsDow + toOff));
      }
    }
    const uniq = [...new Set(parts)];
    return uniq.length ? uniq.join(',') : '*';
  }

  // Convert a cron expression from one flavor to another, keeping the schedule's
  // meaning as far as each flavor allows. Always returns a string that parses in
  // `toId` (falling back to that flavor's default if the input can't be parsed).
  function convertExpr(expr, fromId, toId) {
    if (fromId === toId) return expr;
    if (!FLAVORS[toId]) return expr;
    let model;
    try { model = parseCron(expr, { flavor: fromId }); }
    catch (e) { return DEFAULTS[toId]; }

    const from = getFlavor(fromId), to = getFlavor(toId);
    const fromSpecs = specsForFlavor(fromId), toSpecs = specsForFlavor(toId);

    const txt = {};
    txt.second = model.second ? buildField(model.second) : '0';
    txt.minute = buildField(model.minute);
    txt.hour = buildField(model.hour);
    txt.month = buildField(model.month);
    txt.dom = domTextForTarget(model.dom, to);
    txt.dow = dowTextForTarget(model.dow, fromSpecs.dow, toSpecs.dow, to);
    txt.year = model.year ? buildField(model.year) : '*';

    // Quartz / AWS: exactly one of dom/dow must be `?`.
    if (to.requireQuestionRule === 'exactlyOne') {
      const domQ = txt.dom === '?', dowQ = txt.dow === '?';
      const cnt = (domQ ? 1 : 0) + (dowQ ? 1 : 0);
      if (cnt === 0) {
        if (txt.dom === '*') txt.dom = '?';
        else if (txt.dow === '*') txt.dow = '?';
        else txt.dom = '?';                // both restricted: keep dow, blank dom
      } else if (cnt === 2) {
        txt.dow = '*';                     // keep dom = ?
      }
    }

    const withYear = toId === 'quartz' && !!model.year;
    const order = orderForFlavor(toId, withYear);
    const out = order.map((k) => txt[k]).join(' ');

    // Final safety net: if the conversion somehow didn't parse, use the default.
    try { parseCron(out, { flavor: toId }); return out; }
    catch (e) { return DEFAULTS[toId]; }
  }

  // ===== END PURE-LOGIC =====

  export {
    MONTH_NAMES,
    MONTH_ABBR,
    MONTH_ALIASES,
    DOW_NAMES,
    DOW_ABBR,
    DOW_ALIASES_UNIX,
    DOW_ALIASES_QUARTZ,
    FIELD_SPECS,
    BASE_FIELD_ORDER,
    FLAVORS,
    FLAVOR_IDS,
    getFlavor,
    resolveFlavor,
    specsForFlavor,
    orderForFlavor,
    MACROS,
    DEFAULTS,
    resolveToken,
    parseTerm,
    parseSpecialTerm,
    expandTerm,
    parseField,
    serializeTerm,
    buildField,
    fieldOrder,
    parseCron,
    buildCron,
    convertExpr,
    isRestricted,
    dayMatches,
    domOk,
    dowOk,
    nextRuns,
    describeCron,
    fieldEditorMode,
    normalizeValue,
    lastDayOfMonth,
    nearestWeekdayDom,
    lastWeekdayOfMonth,
    nth,
    pad,
  };
