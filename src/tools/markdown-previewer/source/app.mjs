import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { debounce, onceFlag } from '../../../lib/utils/CtUtil.mjs';

  // =====================================================================
  // 1. Pure logic (DOM-free) — inlined by the build; imported by unit tests.
  // =====================================================================
<<ct:inline logic.mjs>>
  // =====================================================================
  // 2. DOM references
  // =====================================================================
  const editorEl = document.getElementById('editor');
  const previewEl = document.getElementById('preview');
  const splitEl = document.querySelector('.split');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const copyHtmlBtn = document.getElementById('copyHtmlBtn');
  const copyMdBtn = document.getElementById('copyMdBtn');
  const clearBtn = document.getElementById('clearBtn');
  const syncToggleBtn = document.getElementById('syncToggleBtn');
  const viewToggleBtn = document.getElementById('viewToggleBtn');

  const helpButtonEl = document.getElementById('help-button');

  // =====================================================================
  // 3. State & persistence — docs/conventions.md § "Persist UI state".
  // Versioned key holds the editor TEXT and the sync-scroll toggle only; the
  // rendered HTML is DERIVED (recomputed on load), never stored. Every
  // read/write is try/catch-wrapped and degrades silently.
  // =====================================================================
  const STORAGE_KEY = 'markdown-previewer:v1';
  const HELP_SEEN_KEY = 'markdown-previewer:help-seen:v1';

  // sideBySide === true → columns (default); false → stacked top/bottom.
  const state = { syncScroll: false, sideBySide: true };

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        text: editorEl.value,
        syncScroll: state.syncScroll,
        sideBySide: state.sideBySide,
      }));
    } catch (err) { /* best-effort — degrade to in-memory only */ }
  }

  function loadState() {
    const fallback = { text: '', syncScroll: false, sideBySide: true };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        text: parsed && typeof parsed.text === 'string' ? parsed.text : '',
        syncScroll: !!(parsed && parsed.syncScroll),
        // Default to side-by-side when the stored value is absent (old blob).
        sideBySide: parsed && typeof parsed.sideBySide === 'boolean' ? parsed.sideBySide : true,
      };
    } catch (err) { return fallback; }
  }

  // =====================================================================
  // 4. Render — the one place preview.innerHTML is assigned, and only ever
  // the tool's OWN generated HTML (mdToHtml escapes all raw user HTML, see
  // logic.mjs / DESIGN.md § "HTML safety").
  // =====================================================================
  function render() {
    previewEl.innerHTML = mdToHtml(editorEl.value, { allowImage: true });
  }

  // In-field copy button reveals only when the editor is non-empty
  // (docs/conventions.md § "In-field copy button").
  function updateMdCopyVisibility() {
    copyMdBtn.hidden = editorEl.value === '';
  }

  // Shared trailing-edge debounce (CtUtil in the shared lib, inlined as a global).

  const debouncedRenderAndSave = debounce(() => { render(); saveState(); }, 120);
  editorEl.addEventListener('input', () => {
    updateMdCopyVisibility();     // immediate — don't float the icon over placeholder
    debouncedRenderAndSave();
  });

  // =====================================================================
  // 5. Toolbar
  // =====================================================================
  loadSampleBtn.addEventListener('click', () => {
    editorEl.value = SAMPLE_MARKDOWN;
    render();
    updateMdCopyVisibility();
    saveState();
    editorEl.focus();
    editorEl.setSelectionRange(0, 0);
    editorEl.scrollTop = 0;
  });

  copyHtmlBtn.addEventListener('click', async () => {
    const html = previewEl.innerHTML.trim();
    if (!html) return;
    const ok = await copy(html);
    if (ok) flash(copyHtmlBtn, { label: 'Copied!', revertTo: 'Copy HTML' });
  });

  // In-field copy of the raw Markdown source.
  copyMdBtn.addEventListener('click', async () => {
    if (editorEl.value === '') return;
    const ok = await copy(editorEl.value);
    if (ok) flash(copyMdBtn, { label: '✅', revertTo: '📋' });
  });

  clearBtn.addEventListener('click', async () => {
    if (editorEl.value === '') return;
    // Editor content can be a lot of hand-written Markdown — the "substantial /
    // hard-to-recreate" case the confirm convention protects.
    if (!(await confirmDialog('Clear the editor? This will discard the current Markdown.'))) return;
    editorEl.value = '';
    render();
    updateMdCopyVisibility();
    saveState();
    editorEl.focus();
  });

  function setSyncScroll(on) {
    state.syncScroll = !!on;
    syncToggleBtn.setAttribute('aria-pressed', String(state.syncScroll));
    syncToggleBtn.classList.toggle('active', state.syncScroll);
  }

  syncToggleBtn.addEventListener('click', () => {
    setSyncScroll(!state.syncScroll);
    saveState();
  });

  // View mode: pressed (default) = side-by-side columns; unpressed = stacked
  // top/bottom (editor smaller, preview taller). Same accented "selected" look
  // as the Sync scroll toggle (both carry class="toggle" + aria-pressed).
  function setSideBySide(on) {
    state.sideBySide = !!on;
    viewToggleBtn.setAttribute('aria-pressed', String(state.sideBySide));
    viewToggleBtn.classList.toggle('active', state.sideBySide);
    splitEl.classList.toggle('split--stacked', !state.sideBySide);
  }

  viewToggleBtn.addEventListener('click', () => {
    setSideBySide(!state.sideBySide);
    saveState();
  });

  // =====================================================================
  // 6. Scroll sync (optional) — proportional editor <-> preview mapping,
  // re-entrancy guarded so the programmatic scroll of one pane doesn't loop
  // back through the other's scroll handler.
  // =====================================================================
  let syncing = false;
  function mirrorScroll(from, to) {
    if (!state.syncScroll || syncing) return;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 0) return;
    syncing = true;
    to.scrollTop = (from.scrollTop / fromMax) * toMax;
    requestAnimationFrame(() => { syncing = false; });
  }
  editorEl.addEventListener('scroll', () => mirrorScroll(editorEl, previewEl));
  previewEl.addEventListener('scroll', () => mirrorScroll(previewEl, editorEl));

  // =====================================================================
  // 7. Help modal — the shared jbcModal primitive (src/lib/components/CtModal.mjs), built
  // from the hidden #help-body template. Focus-trap / Esc + backdrop close /
  // focus-return / reduced-motion / scroll-top live in that primitive; `autoOpen`
  // rides the shared onceFlag so it auto-shows once on a fresh visit.
  // =====================================================================
  const help = createModal({
    testid: 'help',
    titleId: 'help-title',
    title: 'How the Markdown Previewer works',
    body: document.getElementById('help-body').content.cloneNode(true),
    autoOpen: onceFlag(HELP_SEEN_KEY),
  });
  helpButtonEl.addEventListener('click', () => help.open());

  // =====================================================================
  // 8. Init — restore persisted text + toggle, render derived preview.
  // =====================================================================
  (function init() {
    const loaded = loadState();
    editorEl.value = loaded.text;
    setSyncScroll(loaded.syncScroll);
    setSideBySide(loaded.sideBySide);
    render();
    updateMdCopyVisibility();
    // The Help modal auto-shows once on a fresh visit via jbcModal's autoOpen.
  })();

  // =====================================================================
  // 9. Test hook — inert namespace for Playwright-driven tests.
  // =====================================================================
  window.__markdownPreviewer = {
    // pure functions
    mdToHtml,
    parseInline,
    escapeHtmlForMarkdown,
    sanitizeUrl,
    // deterministic entry point
    render,
    // live state
    state,
  };
