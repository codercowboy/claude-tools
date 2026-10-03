// source/app.mjs — DOM wiring, rendering, persistence, and the Help modal for
// __TOOL_TITLE__. The build inlines this into a single `<script type="module">`
// in the shipped index.html via the template's app.mjs inline token.
//
// The pure engine is folded in right below by a jbc:inline token — logic.mjs
// keeps its `export`s (harmless in an inline module script; nothing imports
// them) and the unit tests import the same file. See build-pipeline.md and
// testing.md. (Only the token on the next line is real; comments avoid the
// literal token syntax so the build doesn't re-expand them into a cycle.)
<<jbc:inline logic.mjs>>

const $ = (sel) => document.querySelector(sel);

const STATE_KEY = '__TOOL_NAME__:v1';
const HELP_SEEN_KEY = '__TOOL_NAME__:help-seen:v1';

const input = $('[data-testid="input"]');
const output = $('[data-testid="output"]');
const stats = $('[data-testid="stats"]');

// --- best-effort localStorage (may be unavailable / throw; degrade silently) ---
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// --- render: derive output + stats from the single source of truth (the input) ---
function render() {
  const text = input.value;
  output.value = transform(text);
  const { chars, words } = summarize(text);
  stats.textContent = `${chars} character${chars === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`;
  saveState({ text });
}

input.addEventListener('input', render);

// Restore persisted state, then do the first render.
const saved = loadState();
if (saved && typeof saved.text === 'string') input.value = saved.text;
render();

// --- Help modal: accessible, first-load auto-show, then reachable via the ? button ---
const helpModal = $('[data-testid="help-modal"]');
const helpBtn = $('[data-testid="help-btn"]');
let lastFocus = null;

function openHelp() {
  lastFocus = document.activeElement;
  // Fullscreen tools must re-parent overlays into document.fullscreenElement; this
  // skeleton isn't fullscreen, but keep the pattern in mind (see ethos.md).
  helpModal.hidden = false;
  helpModal.querySelector('[data-testid="modal-close-x"]').focus();
  try { localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* ignore */ }
}
function closeHelp() {
  helpModal.hidden = true;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

helpBtn.addEventListener('click', openHelp);
helpModal.addEventListener('click', (e) => {
  // Backdrop click closes; a click inside the dialog does not.
  if (e.target === helpModal) closeHelp();
});
helpModal.querySelector('[data-testid="modal-close-x"]').addEventListener('click', closeHelp);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpModal.hidden) closeHelp();
});

// Auto-show once, on the first visit. If storage throws, degrade to NOT showing
// rather than nagging every load (see ethos.md § First-load help popup).
try {
  if (!localStorage.getItem(HELP_SEEN_KEY)) openHelp();
} catch { /* storage unavailable → skip the auto-show */ }

// --- Test hook: inert for real users, a namespace the e2e suite can drive. ---
// (See ethos.md § Testability hooks — window.__<toolName>.)
window.__TOOL_HOOK__ = {
  transform,
  summarize,
  render,
  setInput(value) { input.value = value; render(); },
  getOutput() { return output.value; },
  openHelp,
  closeHelp,
};
