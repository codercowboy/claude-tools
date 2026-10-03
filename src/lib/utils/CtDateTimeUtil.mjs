// ===== Begin CtDateTimeUtil (ES module) =====
/*
 * CtDateTimeUtil — duration formatters + timezone / calendar / date-math engine.
 * ---------------------------------------------------------------------------
 * One module, two titled sections (concatenated verbatim from the former
 * duration.mjs and timezone.mjs): "duration" and "jbcTimezone". Every function
 * is a named export AND a static on the `CtDateTimeUtil` class at the bottom
 * (statics REFERENCE the named functions — single implementation).
 */

// ----- Section: duration (formerly duration.mjs) -----
/*
 * duration formatters
 * ---------------------------------------------------------------------------
 * Two dependency-free ways to render a duration as human text — a fixed clock
 * readout and a compact largest-unit breakdown. Both are pure and DOM-free, so a
 * unit-tested source/logic.mjs can import them and `node --test` can load them.
 *
 *   formatDuration(seconds) -> string
 *     A media-style clock readout from a count of SECONDS: "m:ss" under an hour,
 *     "h:mm:ss" at or above one hour (minutes/seconds zero-padded to 2). Negative
 *     or non-finite input clamps to 0; seconds are rounded. E.g. 0 -> "0:00",
 *     65 -> "1:05", 3661 -> "1:01:01".
 *
 *   humanizeDuration(ms) -> string
 *     A compact breakdown from a count of MILLISECONDS: "1d 2h 3m 4s", largest
 *     unit to smallest, zero components omitted; a sub-second value renders as
 *     "500ms"; 0 renders "0ms"; a negative value keeps a leading "-". Non-finite
 *     input renders "". E.g. 0 -> "0ms", 500 -> "500ms", 90000 -> "1m 30s".
 *
 * Node-importable ES module. A tool whose pure, unit-tested source/logic.mjs
 * needs a duration readout imports this module directly (so `node --test` can
 * load it); the single-file build inlines this module body into the shipped
 * index.html — stripping the `export` — so the shipped tool stays
 * dependency-free and file://-openable. See the consuming repo's build docs
 * (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build. No hash to recompute.
 */
export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function humanizeDuration(ms) {
  if (!Number.isFinite(ms)) return '';
  let rem = Math.round(ms);
  if (rem === 0) return '0ms';
  const neg = rem < 0;
  rem = Math.abs(rem);
  const DAY = 86400000, HOUR = 3600000, MIN = 60000, SEC = 1000;
  const d = Math.floor(rem / DAY); rem -= d * DAY;
  const h = Math.floor(rem / HOUR); rem -= h * HOUR;
  const m = Math.floor(rem / MIN); rem -= m * MIN;
  const s = Math.floor(rem / SEC); rem -= s * SEC;
  const msPart = rem;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s) parts.push(s + 's');
  if (msPart) parts.push(msPart + 'ms');
  if (parts.length === 0) return '0ms';
  return (neg ? '-' : '') + parts.join(' ');
}

// ----- Section: jbcTimezone (formerly timezone.mjs) -----
/*
 * jbcTimezone — timezone / calendar / date-math engine built on Intl.
 * ---------------------------------------------------------------------------
 * A DOM-free, Node-importable ES module. Every zone behaviour is derived from
 * Intl.DateTimeFormat + formatToParts (no timezone database ships with the
 * module): zone offsets and DST-aware wall-clock conversion (zonedParts,
 * zoneOffsetMinutes, zonedTimeToUtc), a meeting-overlap planner (meetingGrid,
 * overlapWindows), a one-instant-into-many-zones converter (instantInZones),
 * DST state + next-transition detection (isDstInEffect, nextDstTransition,
 * zoneInfo), and naive (UTC-field) calendar arithmetic (parseNaive,
 * addCalendar, business-day math, ISO week, diffParts/formatDiff). The caller
 * supplies the IANA zone ids; this module carries no zone catalogue.
 *
 * A tool whose pure, unit-tested source/logic.mjs needs timezone/date math
 * imports this module directly (so `node --test` can load it); the single-file
 * build inlines this module body into the shipped index.html — stripping each
 * `export` — so the shipped tool stays dependency-free and file://-openable.
 * See the consuming repo's build docs (§ "Build-assembled tools" › import inlining).
 *
 * This is a shared component. Edit the canonical copy and re-vendor; every tool
 * picks it up on its next build.
 */

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Cache one formatter per zone (formatToParts is the hot path).
const _partsFmtCache = new Map();
function _partsFormatter(tz) {
  let f = _partsFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    });
    _partsFmtCache.set(tz, f);
  }
  return f;
}

const _WD_SHORT = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ---------------------------------------------------------------------
// Zone offsets & wall-clock parts (via Intl)
// ---------------------------------------------------------------------

// The wall-clock fields an instant has in a given zone.
function zonedParts(date, tz) {
  const parts = _partsFormatter(tz).formatToParts(date);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  let hour = Number(m.hour);
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour,
    minute: Number(m.minute),
    second: Number(m.second),
    weekday: _WD_SHORT[m.weekday] ?? 0,
    weekdayName: WEEKDAY_NAMES[_WD_SHORT[m.weekday] ?? 0],
  };
}

// Minutes to add to UTC to get the wall-clock time in `tz` at `date`
// (DST-aware). +05:30 -> 330, -08:00 -> -480.
function zoneOffsetMinutes(date, tz) {
  const p = zonedParts(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - date.getTime()) / MINUTE);
}

// 330 -> "+05:30", 0 -> "+00:00", -480 -> "-08:00".
function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Invert a wall-clock in `tz` to the UTC instant it names, DST-aware. A candidate is accepted only
// when it round-trips (its own offset reproduces the requested wall time). For a spring-forward GAP
// (a nonexistent wall time) NEITHER candidate round-trips; we then follow the "compatible"/forward-shift
// convention used by Temporal/Luxon/java.time and return the later instant — e.g. 02:30 on a US spring
// day resolves forward to 03:30 local, not back to 01:30 (#1014-O.1).
function zonedTimeToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  const off1 = zoneOffsetMinutes(new Date(guess), tz);
  const ts1 = guess - off1 * MINUTE;
  if (zoneOffsetMinutes(new Date(ts1), tz) === off1) return new Date(ts1); // consistent (normal case)
  const off2 = zoneOffsetMinutes(new Date(ts1), tz);
  const ts2 = guess - off2 * MINUTE;
  if (zoneOffsetMinutes(new Date(ts2), tz) === off2) return new Date(ts2); // valid time beside a transition
  // Gap: neither candidate exists on the wall clock → forward-shift to the later UTC instant. This is
  // offset-sign-agnostic (holds for southern-hemisphere zones whose DST offset is positive).
  return new Date(Math.max(ts1, ts2));
}

// Thin Intl.DateTimeFormat wrapper for display strings.
function formatInZone(date, tz, opts = {}) {
  return new Intl.DateTimeFormat(opts.locale || 'en-US', {
    timeZone: tz,
    ...opts,
  }).format(date);
}

// Short zone name for an instant ("PDT", "IST", or "GMT+5:30" per engine).
function zoneAbbrev(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', timeZoneName: 'short',
    }).formatToParts(date);
    const tzn = parts.find((p) => p.type === 'timeZoneName');
    return tzn ? tzn.value : '';
  } catch (err) {
    return '';
  }
}

// ---------------------------------------------------------------------
// Meeting planner — working hours & overlap
// ---------------------------------------------------------------------

// Is a local hour-of-day inside working hours? Supports a window that wraps
// past midnight (start > end, e.g. 22–06).
function isWorkingHour(hour, workHours) {
  const start = workHours && Number.isFinite(workHours.start) ? workHours.start : 9;
  const end = workHours && Number.isFinite(workHours.end) ? workHours.end : 17;
  if (start === end) return false;      // empty window
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;   // wraps midnight
}

// 24-column grid keyed on the reference zone's local hours 00..23 for the
// given date. Each column carries every zone's local state at that instant.
// refDateStr is "YYYY-MM-DD".
function meetingGrid(zones, workHours, refZone, refDateStr) {
  const [Y, Mo, D] = String(refDateStr).split('-').map(Number);
  const columns = [];
  for (let h = 0; h < 24; h++) {
    const inst = zonedTimeToUtc(Y, Mo, D, h, 0, 0, refZone);
    const cells = zones.map((tz) => {
      const p = zonedParts(inst, tz);
      const off = zoneOffsetMinutes(inst, tz);
      // Day delta relative to the reference date at this column.
      const refDayN = Date.UTC(Y, Mo - 1, D);
      const cellDayN = Date.UTC(p.year, p.month - 1, p.day);
      const dayDelta = Math.round((cellDayN - refDayN) / DAY);
      return {
        tz,
        localHour: p.hour,
        localMinute: p.minute,
        working: isWorkingHour(p.hour, workHours),
        dayDelta,
        offsetMinutes: off,
      };
    });
    columns.push({
      hour: h,
      instant: inst,
      cells,
      allWorking: cells.length > 0 && cells.every((c) => c.working),
    });
  }
  return { refZone, refDateStr, columns };
}

// Contiguous ranges (in reference-zone local hours) where every zone is
// inside working hours. Defaults: UTC reference, today. Each range is
// {startHour, endHour} with endHour exclusive (e.g. 14..17 => 14–17).
function overlapWindows(zones, workHours, refZone = 'UTC', refDateStr = _todayStr()) {
  const grid = meetingGrid(zones, workHours, refZone, refDateStr);
  const ranges = [];
  let open = null;
  for (const col of grid.columns) {
    if (col.allWorking) {
      if (open == null) open = col.hour;
    } else if (open != null) {
      ranges.push({ startHour: open, endHour: col.hour });
      open = null;
    }
  }
  if (open != null) ranges.push({ startHour: open, endHour: 24 });
  return ranges;
}

function _todayStr() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Converter — one instant into every zone
// ---------------------------------------------------------------------
function instantInZones(date, zones) {
  // Day-delta is computed against the browser-local (or UTC) date of the
  // instant so a "next day" marker is meaningful; here we compare each zone
  // to UTC's date for determinism.
  const utc = zonedParts(date, 'UTC');
  const utcDayN = Date.UTC(utc.year, utc.month - 1, utc.day);
  return zones.map((tz) => {
    const p = zonedParts(date, tz);
    const off = zoneOffsetMinutes(date, tz);
    const dayN = Date.UTC(p.year, p.month - 1, p.day);
    return {
      tz,
      parts: p,
      offsetMinutes: off,
      offsetLabel: formatOffset(off),
      abbrev: zoneAbbrev(date, tz),
      weekdayName: p.weekdayName,
      dayDelta: Math.round((dayN - utcDayN) / DAY),
      local: formatInZone(date, tz, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
      }),
    };
  });
}

// ---------------------------------------------------------------------
// Zone info — DST state & next transition
// ---------------------------------------------------------------------

// DST in effect when the current offset exceeds the zone's standard offset
// (the smaller of the Jan and Jul offsets). Works for both hemispheres and
// returns false for zones without DST.
function isDstInEffect(tz, date = new Date()) {
  const y = zonedParts(date, tz).year;
  const jan = zoneOffsetMinutes(new Date(Date.UTC(y, 0, 1)), tz);
  const jul = zoneOffsetMinutes(new Date(Date.UTC(y, 6, 1)), tz);
  if (jan === jul) return false;
  const std = Math.min(jan, jul);
  return zoneOffsetMinutes(date, tz) > std;
}

// Next offset change at or after `from`. Coarse 6-hour forward scan for a
// change, then binary search to the second. null if none within maxDays.
function nextDstTransition(tz, from = new Date(), maxDays = 400) {
  const start = from.getTime();
  const end = start + maxDays * DAY;
  const step = 6 * HOUR;
  let t = start;
  let prevOff = zoneOffsetMinutes(new Date(t), tz);
  while (t < end) {
    const next = Math.min(t + step, end);
    const off = zoneOffsetMinutes(new Date(next), tz);
    if (off !== prevOff) {
      let lo = t, hi = next; // change occurs in (lo, hi]
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (zoneOffsetMinutes(new Date(mid), tz) === prevOff) lo = mid;
        else hi = mid;
      }
      return {
        at: new Date(hi),
        offsetBefore: prevOff,
        offsetAfter: zoneOffsetMinutes(new Date(hi), tz),
      };
    }
    prevOff = off;
    t = next;
    if (next >= end) break;
  }
  return null;
}

function zoneInfo(tz, date = new Date()) {
  const off = zoneOffsetMinutes(date, tz);
  return {
    tz,
    offsetMinutes: off,
    offsetLabel: formatOffset(off),
    abbrev: zoneAbbrev(date, tz),
    dst: isDstInEffect(tz, date),
    next: nextDstTransition(tz, date),
    parts: zonedParts(date, tz),
  };
}

// ---------------------------------------------------------------------
// Date math — naive (UTC-field) wall-clock arithmetic
// ---------------------------------------------------------------------

// Parse a datetime-local string ("YYYY-MM-DDTHH:mm[:ss]") into a UTC-based
// naive Date (the typed fields are treated as the literal date/time). Also
// accepts a plain "YYYY-MM-DD". Returns null on invalid input.
function parseNaive(str) {
  if (typeof str !== 'string' || str.trim() === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(str.trim());
  if (!m) return null;
  const [, Y, Mo, D, h, mi, s] = m;
  const yy = +Y, mo = +Mo, dd = +D, hh = +(h || 0), mm = +(mi || 0), ss = +(s || 0);
  const d = new Date(Date.UTC(yy, mo - 1, dd, hh, mm, ss));
  if (Number.isNaN(d.getTime())) return null;
  // Reject out-of-range components that Date.UTC would silently roll over
  // (month 13, day 32, Feb 30, hour 25, …): the fields must survive the
  // round-trip unchanged, else the input names no real date/time.
  if (d.getUTCFullYear() !== yy || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dd
    || d.getUTCHours() !== hh || d.getUTCMinutes() !== mm || d.getUTCSeconds() !== ss) {
    return null;
  }
  return d;
}

function weekdayName(date) {
  return WEEKDAY_NAMES[date.getUTCDay()];
}

// Day-of-year, 1..365/366.
function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const cur = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((cur - start) / DAY) + 1;
}

function quarter(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

// ISO 8601 week number (1..53). Week starts Monday; week 1 contains the
// year's first Thursday.
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // to the Thursday of this week
  const firstThursday = Date.UTC(d.getUTCFullYear(), 0, 4);
  const ft = new Date(firstThursday);
  const ftDayNum = (ft.getUTCDay() + 6) % 7;
  ft.setUTCDate(ft.getUTCDate() - ftDayNum + 3);
  return 1 + Math.round((d.getTime() - ft.getTime()) / (7 * DAY));
}

// The ISO week-numbering year (can differ from the calendar year near
// Jan 1 / Dec 31).
function isoWeekYear(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week
  return d.getUTCFullYear();
}

const isWeekend = (dow) => dow === 0 || dow === 6;

// Signed count of business days (Mon–Fri) strictly between two dates, by
// calendar date. From a Monday to the next Friday of the same week = 4.
// Negative when b precedes a.
function businessDaysBetween(a, b) {
  let start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  let end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  if (start === end) return 0;
  const sign = end > start ? 1 : -1;
  if (sign < 0) { const t = start; start = end; end = t; }
  let count = 0;
  for (let t = start + DAY; t <= end; t += DAY) {
    if (!isWeekend(new Date(t).getUTCDay())) count++;
  }
  return sign * count;
}

// Move `n` business days from `date` (n may be negative), preserving the
// time-of-day. Landing on a weekend is skipped.
function addBusinessDays(date, n) {
  const d = new Date(date.getTime());
  let remaining = Math.abs(Math.trunc(n));
  const step = n < 0 ? -1 : 1;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (!isWeekend(d.getUTCDay())) remaining--;
  }
  return d;
}

// Calendar add/subtract, preserving the naive model. unit ∈
// years|months|weeks|days|hours|minutes|business-days.
function addCalendar(date, amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return new Date(date.getTime());
  const d = new Date(date.getTime());
  switch (unit) {
    case 'years': d.setUTCFullYear(d.getUTCFullYear() + n); return d;
    case 'months': d.setUTCMonth(d.getUTCMonth() + n); return d;
    case 'weeks': return new Date(d.getTime() + n * 7 * DAY);
    case 'days': return new Date(d.getTime() + n * DAY);
    case 'hours': return new Date(d.getTime() + n * HOUR);
    case 'minutes': return new Date(d.getTime() + n * MINUTE);
    case 'business-days': return addBusinessDays(d, n);
    default: return d;
  }
}

// Difference between two instants, broken into components + totals.
function diffParts(a, b) {
  const ms = b.getTime() - a.getTime();
  const sign = ms < 0 ? -1 : (ms > 0 ? 1 : 0);
  let rem = Math.abs(ms);
  const days = Math.floor(rem / DAY); rem -= days * DAY;
  const hours = Math.floor(rem / HOUR); rem -= hours * HOUR;
  const minutes = Math.floor(rem / MINUTE); rem -= minutes * MINUTE;
  const seconds = Math.floor(rem / 1000); rem -= seconds * 1000;
  const totalAbs = Math.abs(ms);
  return {
    sign,
    totalMs: ms,
    days, hours, minutes, seconds, milliseconds: rem,
    totalSeconds: totalAbs / 1000 * sign,
    totalMinutes: totalAbs / MINUTE * sign,
    totalHours: totalAbs / HOUR * sign,
    totalDays: totalAbs / DAY * sign,
  };
}

// Compact "1d 2h 3m 4s" from diffParts components (sign-prefixed).
function formatDiff(parts) {
  if (parts.sign === 0) return '0s';
  const bits = [];
  if (parts.days) bits.push(parts.days + 'd');
  if (parts.hours) bits.push(parts.hours + 'h');
  if (parts.minutes) bits.push(parts.minutes + 'm');
  if (parts.seconds) bits.push(parts.seconds + 's');
  // A sub-second diff rounds to zero whole seconds → "0s" with no sign (never "-0s") (#1014-O).
  if (bits.length === 0) return '0s';
  return (parts.sign < 0 ? '-' : '') + bits.join(' ');
}

// "YYYY-MM-DDTHH:mm" naive string for a UTC-based Date (for datetime-local).
function toNaiveInput(date, withSeconds = false) {
  const p = zonedParts(date, 'UTC');
  const base = `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return withSeconds ? `${base}:${String(p.second).padStart(2, '0')}` : base;
}

export {
  // offsets & parts
  zoneOffsetMinutes, formatOffset, zonedParts, zonedTimeToUtc, formatInZone, zoneAbbrev,
  // meeting
  isWorkingHour, meetingGrid, overlapWindows,
  // converter
  instantInZones,
  // zone info
  isDstInEffect, nextDstTransition, zoneInfo,
  // date math
  parseNaive, addCalendar, businessDaysBetween, addBusinessDays,
  isoWeek, isoWeekYear, quarter, dayOfYear, weekdayName, diffParts, formatDiff,
  toNaiveInput,
  // constants
  WEEKDAY_NAMES,
};

// ----- Aggregator -----
export class CtDateTimeUtil {
  static formatDuration = formatDuration;
  static humanizeDuration = humanizeDuration;
  static zoneOffsetMinutes = zoneOffsetMinutes;
  static formatOffset = formatOffset;
  static zonedParts = zonedParts;
  static zonedTimeToUtc = zonedTimeToUtc;
  static formatInZone = formatInZone;
  static zoneAbbrev = zoneAbbrev;
  static isWorkingHour = isWorkingHour;
  static meetingGrid = meetingGrid;
  static overlapWindows = overlapWindows;
  static instantInZones = instantInZones;
  static isDstInEffect = isDstInEffect;
  static nextDstTransition = nextDstTransition;
  static zoneInfo = zoneInfo;
  static parseNaive = parseNaive;
  static addCalendar = addCalendar;
  static businessDaysBetween = businessDaysBetween;
  static addBusinessDays = addBusinessDays;
  static isoWeek = isoWeek;
  static isoWeekYear = isoWeekYear;
  static quarter = quarter;
  static dayOfYear = dayOfYear;
  static weekdayName = weekdayName;
  static diffParts = diffParts;
  static formatDiff = formatDiff;
  static toNaiveInput = toNaiveInput;
  static WEEKDAY_NAMES = WEEKDAY_NAMES;
}
// ===== end CtDateTimeUtil (ES module) =====
