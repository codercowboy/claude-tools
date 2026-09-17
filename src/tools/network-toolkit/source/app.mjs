
  // =====================================================================
  // Network Toolkit — app (DOM wiring, render, persistence).
  // The pure engine is inlined below; nothing here touches localStorage or
  // the DOM inside logic.mjs.
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 1. State & persistence
  // =====================================================================
  const DEFAULTS = {
    transfer: { size: '1', sizeUnit: 'GB', rate: '100', rateUnit: 'Mbps', base: 1000 },
    cidr: { ip: '192.168.1.10', prefix: '24' },
    ipv4: { dotted: '192.168.1.10' },
    ipv6: { compressed: '2001:db8::1' },
    netmask: { mask: '255.255.255.0', prefix: '24' },
  };

  const state = {
    transfer: { ...DEFAULTS.transfer },
    ipv4: { int: 0 },      // canonical unsigned 32-bit int
    ipv6: { value: 0n },   // canonical 128-bit BigInt
  };

  const STORAGE_KEY = 'network-toolkit:v1';
  const HELP_SEEN_KEY = 'network-toolkit:help-seen:v1';

  function hasSeenHelp() {
    try { return localStorage.getItem(HELP_SEEN_KEY) === '1'; }
    catch (err) { return true; }
  }
  function markHelpSeen() {
    try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch (err) { /* best-effort */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        transfer: {
          size: transferSizeEl.value,
          sizeUnit: state.transfer.sizeUnit,
          rate: transferRateEl.value,
          rateUnit: state.transfer.rateUnit,
          base: state.transfer.base,
        },
        cidr: { ip: cidrIpEl.value, prefix: cidrPrefixEl.value },
        ipv4: { dotted: ipv4Fields.dotted.value },
        ipv6: { compressed: ipv6Fields.compressed.value },
        netmask: { mask: netmaskMaskEl.value, prefix: netmaskPrefixEl.value },
      }));
    } catch (err) { /* best-effort: in-memory only */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredDefaults();
      const p = JSON.parse(raw) || {};
      const t = p.transfer || {};
      const c = p.cidr || {};
      const v4 = p.ipv4 || {};
      const v6 = p.ipv6 || {};
      const nm = p.netmask || {};
      return {
        transfer: {
          size: typeof t.size === 'string' ? t.size : DEFAULTS.transfer.size,
          sizeUnit: SIZE_UNIT_BY_KEY[t.sizeUnit] ? t.sizeUnit : DEFAULTS.transfer.sizeUnit,
          rate: typeof t.rate === 'string' ? t.rate : DEFAULTS.transfer.rate,
          rateUnit: RATE_UNIT_BY_KEY[t.rateUnit] ? t.rateUnit : DEFAULTS.transfer.rateUnit,
          base: t.base === 1024 ? 1024 : 1000,
        },
        cidr: {
          ip: typeof c.ip === 'string' ? c.ip : DEFAULTS.cidr.ip,
          prefix: typeof c.prefix === 'string' ? c.prefix : DEFAULTS.cidr.prefix,
        },
        ipv4: { dotted: typeof v4.dotted === 'string' ? v4.dotted : DEFAULTS.ipv4.dotted },
        ipv6: { compressed: typeof v6.compressed === 'string' ? v6.compressed : DEFAULTS.ipv6.compressed },
        netmask: {
          mask: typeof nm.mask === 'string' ? nm.mask : DEFAULTS.netmask.mask,
          prefix: typeof nm.prefix === 'string' ? nm.prefix : DEFAULTS.netmask.prefix,
        },
      };
    } catch (err) {
      return structuredDefaults();
    }
  }
  function structuredDefaults() {
    return {
      transfer: { ...DEFAULTS.transfer },
      cidr: { ...DEFAULTS.cidr },
      ipv4: { ...DEFAULTS.ipv4 },
      ipv6: { ...DEFAULTS.ipv6 },
      netmask: { ...DEFAULTS.netmask },
    };
  }

  // =====================================================================
  // 2. DOM references
  // =====================================================================
  const helpButtonEl = document.getElementById('help-button');
  const helpOverlayEl = document.querySelector('[data-testid="help-overlay"]');
  const helpDialogEl = document.querySelector('[data-testid="help-modal"]');
  const helpCloseXBtn = helpDialogEl.querySelector('[data-testid="modal-close-x"]');

  // Card 1
  const transferSizeEl = document.getElementById('transfer-size');
  const transferSizeUnitEl = document.getElementById('transfer-size-unit');
  const transferRateEl = document.getElementById('transfer-rate');
  const transferRateUnitEl = document.getElementById('transfer-rate-unit');
  const transferBase1000Btn = document.getElementById('transfer-base-1000');
  const transferBase1024Btn = document.getElementById('transfer-base-1024');
  const transferErrorEl = document.querySelector('[data-testid="transfer-error"]');
  const transferTimeEl = document.querySelector('[data-testid="transfer-time"]');
  const transferSecondsEl = document.querySelector('[data-testid="transfer-seconds"]');
  const transferRefBodyEl = document.querySelector('[data-testid="transfer-ref-body"]');
  const transferCopyAllBtn = document.getElementById('transfer-copy-all');

  // Card 2
  const cidrIpEl = document.getElementById('cidr-ip');
  const cidrPrefixEl = document.getElementById('cidr-prefix');
  const cidrErrorEl = document.querySelector('[data-testid="cidr-error"]');
  const cidrResultsEl = document.querySelector('[data-testid="cidr-results"]');
  const cidrCopyAllBtn = document.getElementById('cidr-copy-all');

  // Card 3
  const ipv4Fields = {
    dotted: document.getElementById('ipv4-dotted'),
    int: document.getElementById('ipv4-int'),
    hex: document.getElementById('ipv4-hex'),
    bin: document.getElementById('ipv4-bin'),
  };
  const ipv4ErrorEl = document.querySelector('[data-testid="ipv4-error"]');
  const ipv6Fields = {
    compressed: document.getElementById('ipv6-compressed'),
    expanded: document.getElementById('ipv6-expanded'),
    hex: document.getElementById('ipv6-hex'),
  };
  const ipv6ErrorEl = document.querySelector('[data-testid="ipv6-error"]');

  // Card 4
  const netmaskMaskEl = document.getElementById('netmask-mask');
  const netmaskPrefixEl = document.getElementById('netmask-prefix');
  const netmaskErrorEl = document.querySelector('[data-testid="netmask-error"]');
  const netmaskOutPrefixEl = document.querySelector('[data-testid="netmask-out-prefix"]');
  const netmaskOutMaskEl = document.querySelector('[data-testid="netmask-out-mask"]');
  const netmaskOutWildcardEl = document.querySelector('[data-testid="netmask-out-wildcard"]');

  // small error helpers
  function showErr(el, msg) { el.textContent = msg; el.hidden = false; }
  function hideErr(el) { el.hidden = true; el.textContent = ''; }

  // =====================================================================
  // 3. Card 1 — Transfer time & rate
  // =====================================================================
  function unitLabel(u) { return `${u.name} (${u.abbr})`; }

  function populateTransferSelects() {
    transferSizeUnitEl.innerHTML = '';
    for (const key of SIZE_UNIT_ORDER) {
      const u = SIZE_UNIT_BY_KEY[key];
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = unitLabel(u);
      transferSizeUnitEl.appendChild(opt);
    }
    transferSizeUnitEl.value = state.transfer.sizeUnit;

    transferRateUnitEl.innerHTML = '';
    for (const u of RATE_UNITS) {
      const opt = document.createElement('option');
      opt.value = u.key;
      opt.textContent = unitLabel(u);
      transferRateUnitEl.appendChild(opt);
    }
    transferRateUnitEl.value = state.transfer.rateUnit;
  }

  function renderTransfer() {
    hideErr(transferErrorEl);
    const sizeRaw = transferSizeEl.value.trim();
    const rateRaw = transferRateEl.value.trim();
    const base = state.transfer.base;

    // Reference table depends only on the speed — render whenever the rate is valid.
    let refDone = false;
    if (rateRaw !== '' && Number.isFinite(Number(rateRaw)) && Number(rateRaw) > 0) {
      try {
        const refs = referenceTransferTimes(rateRaw, state.transfer.rateUnit, base);
        transferRefBodyEl.innerHTML = '';
        for (const r of refs) {
          const tr = document.createElement('tr');
          const td1 = document.createElement('td');
          td1.textContent = r.label;
          const td2 = document.createElement('td');
          td2.textContent = humanizeSeconds(r.seconds);
          tr.append(td1, td2);
          transferRefBodyEl.appendChild(tr);
        }
        refDone = true;
      } catch (err) { /* fall through */ }
    }
    if (!refDone) transferRefBodyEl.innerHTML = '';

    if (sizeRaw === '' && rateRaw === '') {
      transferTimeEl.textContent = '';
      transferSecondsEl.textContent = '';
      return;
    }
    let seconds;
    try {
      seconds = transferTime(sizeRaw, state.transfer.sizeUnit, rateRaw, state.transfer.rateUnit, base);
    } catch (err) {
      showErr(transferErrorEl, err.message);
      transferTimeEl.textContent = '';
      transferSecondsEl.textContent = '';
      return;
    }
    transferTimeEl.textContent = humanizeSeconds(seconds);
    transferSecondsEl.textContent = formatNumber(seconds) + ' s';
  }

  transferSizeEl.addEventListener('input', () => { renderTransfer(); saveState(); });
  transferRateEl.addEventListener('input', () => { renderTransfer(); saveState(); });
  transferSizeUnitEl.addEventListener('change', () => {
    state.transfer.sizeUnit = transferSizeUnitEl.value;
    renderTransfer(); saveState();
  });
  transferRateUnitEl.addEventListener('change', () => {
    state.transfer.rateUnit = transferRateUnitEl.value;
    renderTransfer(); saveState();
  });
  function setTransferBase(base) {
    state.transfer.base = base === 1024 ? 1024 : 1000;
    transferBase1000Btn.setAttribute('aria-pressed', String(state.transfer.base === 1000));
    transferBase1024Btn.setAttribute('aria-pressed', String(state.transfer.base === 1024));
    renderTransfer(); saveState();
  }
  transferBase1000Btn.addEventListener('click', () => setTransferBase(1000));
  transferBase1024Btn.addEventListener('click', () => setTransferBase(1024));

  transferCopyAllBtn.addEventListener('click', () => {
    const lines = [];
    const time = transferTimeEl.textContent.trim();
    const secs = transferSecondsEl.textContent.trim();
    if (time) lines.push(`Time: ${time}`);
    if (secs) lines.push(`Exact seconds: ${secs}`);
    for (const tr of transferRefBodyEl.querySelectorAll('tr')) {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 2) lines.push(`${cells[0].textContent.trim()}: ${cells[1].textContent.trim()}`);
    }
    copyLines(transferCopyAllBtn, lines);
  });

  // =====================================================================
  // 4. Card 2 — CIDR / subnet
  // =====================================================================
  // Fixed row set (label, testid, key into cidrInfo result, optional formatter).
  const CIDR_ROWS = [
    ['Network', 'cidr-network', 'network'],
    ['Netmask', 'cidr-netmask', 'netmask'],
    ['Wildcard', 'cidr-wildcard', 'wildcard'],
    ['Broadcast', 'cidr-broadcast', 'broadcast'],
    ['First host', 'cidr-first', 'firstHost'],
    ['Last host', 'cidr-last', 'lastHost'],
    ['Usable hosts', 'cidr-usable', 'usableHosts'],
    ['Total addresses', 'cidr-total', 'totalHosts'],
    ['CIDR', 'cidr-cidr', 'cidr'],
  ];

  function buildCidrRows() {
    cidrResultsEl.innerHTML = '';
    for (const [label, testid] of CIDR_ROWS) {
      const row = document.createElement('div');
      row.className = 'out-row';
      const lab = document.createElement('span');
      lab.className = 'out-label';
      lab.textContent = label;
      const field = document.createElement('div');
      field.className = 'ct-field';
      const out = document.createElement('output');
      out.className = 'out-value';
      out.setAttribute('data-testid', testid);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'ct-copy-btn';
      copy.setAttribute('data-copy-target', testid);
      copy.setAttribute('data-testid', testid + '-copy');
      copy.setAttribute('aria-label', 'Copy ' + label);
      copy.setAttribute('title', 'Copy ' + label);
      copy.textContent = '📋';
      field.append(out, copy);
      row.append(lab, field);
      cidrResultsEl.appendChild(row);
    }
    // A note row for /31, /32 edge cases.
    const noteRow = document.createElement('div');
    noteRow.className = 'out-row';
    const note = document.createElement('p');
    note.className = 'out-note';
    note.setAttribute('data-testid', 'cidr-note');
    note.hidden = true;
    noteRow.appendChild(note);
    cidrResultsEl.appendChild(noteRow);
  }

  function renderCidr() {
    hideErr(cidrErrorEl);
    let info;
    try {
      info = cidrInfo(cidrIpEl.value, cidrPrefixEl.value);
    } catch (err) {
      showErr(cidrErrorEl, err.message);
      for (const [, testid] of CIDR_ROWS) {
        const el = cidrResultsEl.querySelector(`[data-testid="${testid}"]`);
        if (el) el.textContent = '';
      }
      const note = cidrResultsEl.querySelector('[data-testid="cidr-note"]');
      if (note) note.hidden = true;
      return;
    }
    for (const [, testid, key] of CIDR_ROWS) {
      const el = cidrResultsEl.querySelector(`[data-testid="${testid}"]`);
      if (!el) continue;
      const v = info[key];
      el.textContent = typeof v === 'number' ? formatNumber(v) : String(v);
    }
    const note = cidrResultsEl.querySelector('[data-testid="cidr-note"]');
    if (note) {
      if (info.prefix === 32) {
        note.textContent = '/32 is a single host — network, broadcast, and host are the same address.';
        note.hidden = false;
      } else if (info.prefix === 31) {
        note.textContent = '/31 (RFC 3021) is a point-to-point link — both addresses are usable; there is no reserved broadcast.';
        note.hidden = false;
      } else {
        note.textContent = '';
        note.hidden = true;
      }
    }
  }

  cidrIpEl.addEventListener('input', () => { renderCidr(); saveState(); });
  cidrPrefixEl.addEventListener('input', () => { renderCidr(); saveState(); });

  cidrCopyAllBtn.addEventListener('click', () => {
    const lines = [];
    for (const [label, testid] of CIDR_ROWS) {
      const el = cidrResultsEl.querySelector(`[data-testid="${testid}"]`);
      const v = el ? el.textContent.trim() : '';
      if (v) lines.push(`${label}: ${v}`);
    }
    copyLines(cidrCopyAllBtn, lines);
  });

  // =====================================================================
  // 5. Card 3 — IP converter (single source of truth per family)
  // =====================================================================
  function renderIpv4(exceptEl) {
    const int = state.ipv4.int;
    if (ipv4Fields.dotted !== exceptEl) ipv4Fields.dotted.value = intToIpv4(int);
    if (ipv4Fields.int !== exceptEl) ipv4Fields.int.value = String(int >>> 0);
    if (ipv4Fields.hex !== exceptEl) ipv4Fields.hex.value = ipv4ToHex(int);
    if (ipv4Fields.bin !== exceptEl) ipv4Fields.bin.value = ipv4ToBinary(int);
    for (const k of Object.keys(ipv4Fields)) refreshEditableCopy(ipv4Fields[k]);
  }

  const IPV4_PARSERS = {
    dotted: ipv4ToInt,
    int: parseIpv4Decimal,
    hex: parseIpv4Hex,
    bin: parseIpv4Binary,
  };

  for (const key of Object.keys(ipv4Fields)) {
    ipv4Fields[key].addEventListener('input', () => {
      if (ipv4Fields[key].value.trim() === '') { hideErr(ipv4ErrorEl); return; }
      let int;
      try {
        int = IPV4_PARSERS[key](ipv4Fields[key].value);
      } catch (err) {
        showErr(ipv4ErrorEl, err.message);
        return;
      }
      hideErr(ipv4ErrorEl);
      state.ipv4.int = int >>> 0;
      renderIpv4(ipv4Fields[key]);
      refreshEditableCopy(ipv4Fields[key]);
      saveState();
    });
  }

  function renderIpv6(exceptEl) {
    const v = state.ipv6.value;
    if (ipv6Fields.compressed !== exceptEl) ipv6Fields.compressed.value = bigIntToIpv6Compressed(v);
    if (ipv6Fields.expanded !== exceptEl) ipv6Fields.expanded.value = bigIntToIpv6Expanded(v);
    if (ipv6Fields.hex !== exceptEl) ipv6Fields.hex.value = '0x' + v.toString(16).padStart(32, '0');
    for (const k of Object.keys(ipv6Fields)) refreshEditableCopy(ipv6Fields[k]);
  }

  const IPV6_PARSERS = {
    compressed: ipv6ToBigInt,
    expanded: ipv6ToBigInt,
    hex: hexToIpv6BigInt,
  };

  for (const key of Object.keys(ipv6Fields)) {
    ipv6Fields[key].addEventListener('input', () => {
      if (ipv6Fields[key].value.trim() === '') { hideErr(ipv6ErrorEl); return; }
      let v;
      try {
        v = IPV6_PARSERS[key](ipv6Fields[key].value);
      } catch (err) {
        showErr(ipv6ErrorEl, err.message);
        return;
      }
      hideErr(ipv6ErrorEl);
      state.ipv6.value = v;
      renderIpv6(ipv6Fields[key]);
      refreshEditableCopy(ipv6Fields[key]);
      saveState();
    });
  }

  // =====================================================================
  // 6. Card 4 — Netmask <-> prefix
  // =====================================================================
  function renderNetmaskOutputs(prefix) {
    netmaskOutPrefixEl.textContent = '/' + prefix;
    netmaskOutMaskEl.textContent = prefixToMask(prefix);
    const maskInt = ipv4ToInt(prefixToMask(prefix));
    netmaskOutWildcardEl.textContent = intToIpv4((~maskInt) >>> 0);
  }
  function clearNetmaskOutputs() {
    netmaskOutPrefixEl.textContent = '';
    netmaskOutMaskEl.textContent = '';
    netmaskOutWildcardEl.textContent = '';
  }

  function renderFromMask() {
    hideErr(netmaskErrorEl);
    if (netmaskMaskEl.value.trim() === '') { clearNetmaskOutputs(); return; }
    let prefix;
    try {
      prefix = maskToPrefix(netmaskMaskEl.value);
    } catch (err) {
      showErr(netmaskErrorEl, err.message);
      clearNetmaskOutputs();
      return;
    }
    netmaskPrefixEl.value = String(prefix);
    renderNetmaskOutputs(prefix);
  }

  function renderFromPrefix() {
    hideErr(netmaskErrorEl);
    const raw = netmaskPrefixEl.value.trim();
    if (raw === '') { clearNetmaskOutputs(); return; }
    let mask;
    try {
      mask = prefixToMask(raw);
    } catch (err) {
      showErr(netmaskErrorEl, err.message);
      clearNetmaskOutputs();
      return;
    }
    netmaskMaskEl.value = mask;
    refreshEditableCopy(netmaskMaskEl);
    renderNetmaskOutputs(Number(raw));
  }

  netmaskMaskEl.addEventListener('input', () => { renderFromMask(); saveState(); });
  netmaskPrefixEl.addEventListener('input', () => { renderFromPrefix(); saveState(); });

  // =====================================================================
  // 7. Copy buttons (delegated; covers dynamically-built CIDR buttons)
  // =====================================================================
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.ct-copy-btn');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-target');
    const el = document.querySelector(`[data-testid="${targetId}"]`);
    if (!el) return;
    const tag = el.tagName;
    const text = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') ? el.value : el.textContent;
    if (!text) return;
    const ok = await ctCopy(text);
    if (!ok) return;
    ctFlash(btn, { label: '✅', revertTo: '📋' });
  });

  async function copyLines(triggerBtn, lines) {
    if (!lines || lines.length === 0) return;
    const ok = await ctCopy(lines.join('\n'));
    if (!ok) return;
    ctFlash(triggerBtn, { label: 'Copied!', revertTo: 'Copy all' });
  }

  // In-field copy on an EDITABLE input is revealed only when non-empty.
  function wireEditableCopy(inputEl) {
    if (!inputEl) return;
    const btn = inputEl.parentElement?.querySelector('.ct-copy-btn');
    if (!btn) return;
    const sync = () => { btn.hidden = inputEl.value.trim() === ''; };
    inputEl.addEventListener('input', sync);
    inputEl.__ctCopySync = sync;
    sync();
  }
  function refreshEditableCopy(inputEl) {
    if (inputEl && typeof inputEl.__ctCopySync === 'function') inputEl.__ctCopySync();
  }

  // =====================================================================
  // 8. Help modal
  // =====================================================================
  let helpPreviouslyFocused = null;
  function getHelpFocusable() {
    return Array.from(
      helpDialogEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
  }
  function onHelpKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeHelp(); return; }
    if (e.key !== 'Tab') return;
    const focusable = getHelpFocusable();
    if (focusable.length === 0) return;
    e.preventDefault();
    const idx = focusable.indexOf(document.activeElement);
    let next = e.shiftKey ? idx - 1 : idx + 1;
    if (next < 0) next = focusable.length - 1;
    if (next >= focusable.length) next = 0;
    focusable[next].focus();
  }
  function openHelp() {
    helpPreviouslyFocused = document.activeElement;
    helpOverlayEl.hidden = false;
    document.addEventListener('keydown', onHelpKeydown, true);
    helpDialogEl.scrollTop = 0;
    helpCloseXBtn.focus({ preventScroll: true });
  }
  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    document.removeEventListener('keydown', onHelpKeydown, true);
    if (helpPreviouslyFocused && typeof helpPreviouslyFocused.focus === 'function') {
      try { helpPreviouslyFocused.focus(); } catch (e) { /* ignore */ }
    }
    helpPreviouslyFocused = null;
  }
  helpButtonEl.addEventListener('click', () => openHelp());
  helpCloseXBtn.addEventListener('click', () => closeHelp());
  helpOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target !== helpOverlayEl) return;
    e.preventDefault();
    closeHelp();
  });

  // =====================================================================
  // 9. Init — restore persisted state, render every card
  // =====================================================================
  (function init() {
    const loaded = loadState();

    // Card 1
    state.transfer.sizeUnit = loaded.transfer.sizeUnit;
    state.transfer.rateUnit = loaded.transfer.rateUnit;
    state.transfer.base = loaded.transfer.base;
    transferSizeEl.value = loaded.transfer.size;
    transferRateEl.value = loaded.transfer.rate;
    transferBase1000Btn.setAttribute('aria-pressed', String(state.transfer.base === 1000));
    transferBase1024Btn.setAttribute('aria-pressed', String(state.transfer.base === 1024));
    populateTransferSelects();
    renderTransfer();

    // Card 2
    cidrIpEl.value = loaded.cidr.ip;
    cidrPrefixEl.value = loaded.cidr.prefix;
    buildCidrRows();
    renderCidr();

    // Card 3 — IPv4: seed canonical int from the persisted dotted value.
    try { state.ipv4.int = ipv4ToInt(loaded.ipv4.dotted) >>> 0; }
    catch (err) { state.ipv4.int = ipv4ToInt(DEFAULTS.ipv4.dotted) >>> 0; }
    renderIpv4(null);

    // Card 3 — IPv6: seed canonical BigInt from the persisted compressed value.
    try { state.ipv6.value = ipv6ToBigInt(loaded.ipv6.compressed); }
    catch (err) { state.ipv6.value = ipv6ToBigInt(DEFAULTS.ipv6.compressed); }
    renderIpv6(null);

    // Card 4
    netmaskMaskEl.value = loaded.netmask.mask;
    netmaskPrefixEl.value = loaded.netmask.prefix;
    renderFromMask(); // derives prefix + outputs from the mask (canonical)

    // In-field copy reveal on editable inputs.
    wireEditableCopy(transferSizeEl);
    wireEditableCopy(transferRateEl);
    wireEditableCopy(cidrIpEl);
    for (const k of Object.keys(ipv4Fields)) wireEditableCopy(ipv4Fields[k]);
    for (const k of Object.keys(ipv6Fields)) wireEditableCopy(ipv6Fields[k]);
    wireEditableCopy(netmaskMaskEl);

    if (!hasSeenHelp()) {
      markHelpSeen();
      openHelp();
    }
  })();

  // =====================================================================
  // 10. Test hook — inert namespace
  // =====================================================================
  window.__networkToolkit = {
    // pure — formatting
    formatNumber, expToPlain, humanizeSeconds,
    // pure — transfer / rate
    SIZE_UNITS, SIZE_UNIT_BY_KEY, SIZE_UNIT_ORDER, RATE_UNITS, RATE_UNIT_BY_KEY, REFERENCE_SIZES,
    sizeToBits, rateToBitsPerSec, transferTime, referenceTransferTimes,
    // pure — IPv4
    ipv4ToInt, intToIpv4, ipv4ToHex, ipv4ToBinary, parseIpv4Decimal, parseIpv4Hex, parseIpv4Binary,
    // pure — CIDR
    cidrInfo,
    // pure — netmask
    prefixToMask, maskToPrefix,
    // pure — IPv6
    IPV6_MAX, ipv6ToBigInt, bigIntToIpv6Expanded, bigIntToIpv6Compressed,
    ipv6Expand, ipv6Compress, ipv6ToHex, hexToIpv6BigInt, hexToIpv6,
    // deterministic entry points
    renderTransfer, renderCidr, setTransferBase, renderFromMask, renderFromPrefix,
    // live state
    state,
  };
