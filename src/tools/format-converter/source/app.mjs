import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { showError, hideError } from '../../../lib/components/CtComponents.mjs';
import { onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // Format Converter — app (DOM wiring, render, persistence).
  // The pure engine is inlined below; nothing here touches localStorage or
  // the DOM inside logic.mjs.
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 1. Constants, state & persistence
  // =====================================================================
  const FORMAT_LABEL = {
    json: 'JSON', csv: 'CSV', tsv: 'TSV', yaml: 'YAML',
    properties: '.properties', xml: 'XML',
  };

  const SAMPLES = {
    json: '{\n  "name": "Ada Lovelace",\n  "born": 1815,\n  "fields": ["mathematics", "computing"],\n  "active": false,\n  "address": {\n    "city": "London",\n    "country": "UK"\n  }\n}',
    csv: 'name,born,city\nAda Lovelace,1815,London\nGrace Hopper,1906,"New York, NY"\nAlan Turing,1912,London',
    tsv: 'name\tborn\tcity\nAda Lovelace\t1815\tLondon\nGrace Hopper\t1906\tNew York\nAlan Turing\t1912\tLondon',
    yaml: '# A sample YAML document\nname: Ada Lovelace\nborn: 1815\nfields:\n  - mathematics\n  - computing\naddress:\n  city: London\n  country: UK\npeople:\n  - name: Grace Hopper\n    born: 1906\n  - name: Alan Turing\n    born: 1912',
    properties: 'name=Ada Lovelace\nborn=1815\nfields.0=mathematics\nfields.1=computing\naddress.city=London\naddress.country=UK',
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<person id="1">\n  <name>Ada Lovelace</name>\n  <born>1815</born>\n  <fields>\n    <field>mathematics</field>\n    <field>computing</field>\n  </fields>\n  <address>\n    <city>London</city>\n    <country>UK</country>\n  </address>\n</person>',
  };

  const STORAGE_KEY = 'format-converter:v1';
  const HELP_SEEN_KEY = 'format-converter:help-seen:v1';

  const state = {
    from: 'auto',
    to: 'yaml',
    input: '',
    opts: {
      delimiter: ',',
      header: true,
      indent: 2,
      xmlRoot: 'root',
      xmlAttrs: false,
      xmlDecl: true,
      propsUnicode: false,
    },
  };


  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        from: state.from, to: state.to, input: inputEl.value, opts: state.opts,
      }));
    } catch (err) { /* best-effort: in-memory only */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      const valid = new Set(['auto', 'json', 'csv', 'tsv', 'yaml', 'properties', 'xml']);
      if (valid.has(p.from)) state.from = p.from;
      if (valid.has(p.to) && p.to !== 'auto') state.to = p.to;
      if (typeof p.input === 'string') state.input = p.input;
      const o = p && p.opts || {};
      if (typeof o.delimiter === 'string') state.opts.delimiter = o.delimiter;
      if (typeof o.header === 'boolean') state.opts.header = o.header;
      if ([0, 2, 4].includes(o.indent)) state.opts.indent = o.indent;
      if (typeof o.xmlRoot === 'string') state.opts.xmlRoot = o.xmlRoot;
      if (typeof o.xmlAttrs === 'boolean') state.opts.xmlAttrs = o.xmlAttrs;
      if (typeof o.xmlDecl === 'boolean') state.opts.xmlDecl = o.xmlDecl;
      if (typeof o.propsUnicode === 'boolean') state.opts.propsUnicode = o.propsUnicode;
    } catch (err) { /* ignore unreadable state */ }
  }

  // =====================================================================
  // 2. DOM references
  // =====================================================================
  const helpButtonEl = document.getElementById('help-button');

  const fromSelect = document.getElementById('from-format');
  const toSelect = document.getElementById('to-format');
  const swapBtn = document.getElementById('swap-btn');
  const detectStatusEl = document.querySelector('[data-testid="detect-status"]');

  const inputEl = document.getElementById('input');
  const outputEl = document.getElementById('output');
  const errorEl = document.querySelector('[data-testid="error"]');
  const clearBtn = document.getElementById('clear-btn');
  const sampleBtn = document.getElementById('sample-btn');
  const copyBtn = document.getElementById('copy-btn');
  const inputCopyBtn = document.getElementById('input-copy-btn');

  const optGroupCsv = document.querySelector('[data-testid="opt-group-csv"]');
  const optGroupIndent = document.querySelector('[data-testid="opt-group-indent"]');
  const optGroupXml = document.querySelector('[data-testid="opt-group-xml"]');
  const optGroupProps = document.querySelector('[data-testid="opt-group-properties"]');
  const optEmpty = document.querySelector('[data-testid="opt-empty"]');

  const optDelimiter = document.getElementById('opt-delimiter');
  const optHeader = document.getElementById('opt-header');
  const optIndent = document.getElementById('opt-indent');
  const optXmlRoot = document.getElementById('opt-xml-root');
  const optXmlAttrs = document.getElementById('opt-xml-attrs');
  const optXmlDecl = document.getElementById('opt-xml-decl');
  const optPropsUnicode = document.getElementById('opt-props-unicode');

  // =====================================================================
  // 3. Options visibility + build opts object
  // =====================================================================
  function involves(fmt) {
    return state.from === fmt || state.to === fmt;
  }

  function updateOptionsVisibility() {
    const csv = involves('csv') || involves('tsv');
    const indent = state.to === 'json' || state.to === 'yaml';
    const xml = state.to === 'xml';
    const props = state.to === 'properties';

    optGroupCsv.hidden = !csv;
    optGroupIndent.hidden = !indent;
    optGroupXml.hidden = !xml;
    optGroupProps.hidden = !props;
    optEmpty.hidden = csv || indent || xml || props;

    // Delimiter only meaningful for CSV; TSV is always tab.
    const csvInvolved = involves('csv');
    optDelimiter.disabled = !csvInvolved;
    if (!csvInvolved && csv) optDelimiter.title = 'TSV always uses a tab delimiter';
    else optDelimiter.title = '';
  }

  function buildOpts() {
    const delimiter = state.opts.delimiter.replace(/\\t/g, '\t') || ',';
    return {
      csv: { delimiter, header: state.opts.header },
      tsv: { header: state.opts.header },
      json: { indent: state.opts.indent },
      yaml: { indent: state.opts.indent },
      xml: {
        rootName: state.opts.xmlRoot,
        attributes: state.opts.xmlAttrs,
        declaration: state.opts.xmlDecl,
        indent: state.opts.indent || 2,
      },
      properties: { escapeUnicode: state.opts.propsUnicode },
    };
  }

  // =====================================================================
  // 4. Render
  // =====================================================================
  function showErrorBanner(msg) { showError(errorEl, msg); outputEl.value = ''; }
  function hideErrorBanner() { hideError(errorEl); errorEl.textContent = ''; }

  // In-field copy button reveals only when the input is non-empty (an icon must
  // never float over placeholder text). Output's copy button shows always.
  function updateInputCopyVisibility() {
    inputCopyBtn.hidden = inputEl.value === '';
  }

  function render() {
    updateOptionsVisibility();
    updateInputCopyVisibility();
    const text = inputEl.value;
    if (text.trim() === '') {
      hideErrorBanner();
      outputEl.value = '';
      detectStatusEl.innerHTML = state.from === 'auto'
        ? 'Source format is auto-detected from what you paste.' : '';
      return;
    }
    let result;
    try {
      result = convert(text, state.from, state.to, buildOpts());
    } catch (err) {
      showErrorBanner(err.message || String(err));
      if (state.from === 'auto') {
        const guess = detectFormat(text);
        detectStatusEl.innerHTML = guess
          ? `Detected <strong>${FORMAT_LABEL[guess]}</strong>`
          : 'Could not auto-detect the format.';
      } else {
        detectStatusEl.innerHTML = '';
      }
      return;
    }
    hideErrorBanner();
    outputEl.value = result.output;
    detectStatusEl.innerHTML = state.from === 'auto'
      ? `Detected <strong>${FORMAT_LABEL[result.detected]}</strong>`
      : '';
  }

  // =====================================================================
  // 5. Event wiring
  // =====================================================================
  fromSelect.addEventListener('change', () => {
    state.from = fromSelect.value;
    render();
    saveState();
  });
  toSelect.addEventListener('change', () => {
    state.to = toSelect.value;
    render();
    saveState();
  });

  swapBtn.addEventListener('click', () => {
    // Swap From/To. If From is Auto-detect, resolve it to the detected format
    // first so the swap is meaningful.
    let from = state.from;
    if (from === 'auto') from = detectFormat(inputEl.value) || 'json';
    const newFrom = state.to;
    const newTo = from;
    state.from = newFrom;
    state.to = newTo;
    // Feed the current output back in as the new input (round-trip friendly).
    if (outputEl.value) inputEl.value = outputEl.value;
    fromSelect.value = state.from;
    toSelect.value = state.to;
    render();
    saveState();
  });

  inputEl.addEventListener('input', () => { render(); saveState(); });

  clearBtn.addEventListener('click', async () => {
    if (inputEl.value.trim() !== '') {
      const ok = await confirmDialog('Clear the input? This can’t be undone.');
      if (!ok) return;
    }
    inputEl.value = '';
    render();
    saveState();
    document.activeElement?.blur();
    inputEl.focus();
  });

  sampleBtn.addEventListener('click', async () => {
    let fmt = state.from;
    if (fmt === 'auto') fmt = 'json';
    const sample = SAMPLES[fmt] || SAMPLES.json;
    if (inputEl.value.trim() !== '' && inputEl.value !== sample) {
      const ok = await confirmDialog('Replace the input with a sample document?');
      if (!ok) return;
    }
    inputEl.value = sample;
    render();
    saveState();
  });

  copyBtn.addEventListener('click', async () => {
    if (!outputEl.value) return;
    const ok = await copy(outputEl.value);
    if (!ok) return;
    flash(copyBtn, { label: '✅', revertTo: '📋' });
  });

  inputCopyBtn.addEventListener('click', async () => {
    if (!inputEl.value) return;
    const ok = await copy(inputEl.value);
    if (!ok) return;
    flash(inputCopyBtn, { label: '✅', revertTo: '📋' });
  });

  // Option inputs
  optDelimiter.addEventListener('input', () => {
    state.opts.delimiter = optDelimiter.value;
    render();
    saveState();
  });
  optHeader.addEventListener('change', () => {
    state.opts.header = optHeader.checked;
    render();
    saveState();
  });
  optIndent.addEventListener('change', () => {
    state.opts.indent = Number(optIndent.value);
    render();
    saveState();
  });
  optXmlRoot.addEventListener('input', () => {
    state.opts.xmlRoot = optXmlRoot.value;
    render();
    saveState();
  });
  optXmlAttrs.addEventListener('change', () => {
    state.opts.xmlAttrs = optXmlAttrs.checked;
    render();
    saveState();
  });
  optXmlDecl.addEventListener('change', () => {
    state.opts.xmlDecl = optXmlDecl.checked;
    render();
    saveState();
  });
  optPropsUnicode.addEventListener('change', () => {
    state.opts.propsUnicode = optPropsUnicode.checked;
    render();
    saveState();
  });

  // =====================================================================
  // 6. Help modal
  // =====================================================================
  // The Help dialog is the shared jbcModal primitive (lib/components/CtModal.mjs),
  // built from the hidden #help-body template. Focus-trap / Esc + backdrop
  // close / focus return / reduced-motion all live in the primitive.
  // `testid: 'help'` keeps the help-overlay / help-modal / modal-close-x hooks;
  // `titleId` pins aria-labelledby; `autoOpen` rides the shared onceFlag
  // so Help auto-shows once on a fresh visit.
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'Format Converter',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // =====================================================================
  // 7. Init
  // =====================================================================
  (function init() {
    loadState();

    fromSelect.value = state.from;
    toSelect.value = state.to;
    inputEl.value = state.input;
    optDelimiter.value = state.opts.delimiter;
    optHeader.checked = state.opts.header;
    optIndent.value = String(state.opts.indent);
    optXmlRoot.value = state.opts.xmlRoot;
    optXmlAttrs.checked = state.opts.xmlAttrs;
    optXmlDecl.checked = state.opts.xmlDecl;
    optPropsUnicode.checked = state.opts.propsUnicode;

    render();

    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // =====================================================================
  // 8. Test hook — inert namespace for Playwright / unit-driven tests
  // =====================================================================
  window.__formatConverter = {
    // pure functions
    FORMATS,
    parseJSON, emitJSON,
    parseYAML, emitYAML,
    parseCSV, emitCSV,
    parseTSV, emitTSV,
    parseProperties, emitProperties,
    parseXML, emitXML,
    detectFormat, convert,
    // deterministic entry points
    render, buildOpts,
    // live state
    state,
  };
