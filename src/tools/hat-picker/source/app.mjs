import { copy, flash } from '../../../lib/components/CtClipboardUtil.mjs';
import { createModal } from '../../../lib/components/CtModal.mjs';
import { confirmDialog } from '../../../lib/components/CtConfirm.mjs';
import { CtLicense } from '../../../lib/components/CtLicense.mjs';
import { restartAnimation, prefersReducedMotion, setupHiDPICanvas, onceFlag } from '../../../lib/utils/CtUtil.mjs';

<<ct:inline logic.mjs>>
    // =====================================================================
    // 3. State
    // =====================================================================

    /** @type {{id: string, text: string}[]} */
    let entries = [];

    let settings = {
      removeWinnerAfterDraw: false,
    };

    let drawState = {
      phase: 'idle', // 'idle' | 'cycling' | 'revealed'
      winnerId: null,
      winnerText: '',
      cycleHandle: null,
    };

    let confettiParticles = [];
    let confettiRafHandle = null;

    // DOM refs
    const els = {
      form: document.getElementById('add-form'),
      input: document.getElementById('entry-input'),
      addButton: document.getElementById('add-button'),
      charCounter: document.getElementById('char-counter'),
      entryList: document.getElementById('entry-list'),
      entryCount: document.getElementById('entry-count'),
      emptyState: document.getElementById('empty-state'),
      pullButton: document.getElementById('pull-button'),
      drawAgainButton: document.getElementById('draw-again-button'),
      removeWinnerToggle: document.getElementById('remove-winner-toggle'),
      clearAllButton: document.getElementById('clear-all'),
      winnerReveal: document.getElementById('winner-reveal'),
      winnerCopy: document.getElementById('winner-copy'),
      winnerAnnounce: document.getElementById('winner-announce'),
      confettiCanvas: document.getElementById('confetti-canvas'),
      helpButton: document.getElementById('help-button'),
    };

    const confettiCtx = els.confettiCanvas.getContext('2d');

    // =====================================================================
    // 4. Persistence
    // =====================================================================

    function saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, settings }));
      } catch (err) {
        // Best-effort: localStorage unavailable (file://, private mode, quota,
        // browser policy). Degrade silently to in-memory only.
      }
    }

    function loadState() {
      const fallback = { entries: [], settings: { removeWinnerAfterDraw: false } };
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        const loadedEntries = Array.isArray(parsed.entries)
          ? parsed.entries.filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string')
          : [];
        const loadedSettings = {
          removeWinnerAfterDraw: !!(parsed.settings && parsed.settings.removeWinnerAfterDraw),
        };
        return { entries: loadedEntries, settings: loadedSettings };
      } catch (err) {
        return fallback;
      }
    }

    // =====================================================================
    // 5. Rendering
    // =====================================================================

    function renderCounter() {
      const len = els.input.value.length;
      els.charCounter.textContent = `${len} / ${MAX_LEN}`;
      els.charCounter.classList.toggle('near-limit', len >= 70);
    }

    function renderEntries() {
      els.entryList.innerHTML = '';
      const hasEntries = entries.length > 0;
      els.emptyState.hidden = hasEntries;
      els.entryList.hidden = !hasEntries;

      for (const entry of entries) {
        const li = document.createElement('li');
        li.dataset.testid = 'entry-row';
        li.dataset.id = entry.id;

        const span = document.createElement('span');
        span.className = 'entry-text';
        span.textContent = entry.text; // never innerHTML — no markup injection

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.dataset.testid = 'entry-remove';
        removeBtn.setAttribute('aria-label', `Remove ${entry.text}`);
        removeBtn.title = 'Remove entry';
        removeBtn.textContent = '×';

        li.append(span, removeBtn);
        els.entryList.appendChild(li);
      }

      els.entryCount.textContent = `${entries.length} in the hat`;
    }

    function renderDrawButtons() {
      const busy = drawState.phase === 'cycling';
      const canDraw = entries.length >= 2 && !busy;
      const hasDrawnBefore = drawState.phase === 'revealed';

      els.pullButton.hidden = hasDrawnBefore;
      els.drawAgainButton.hidden = !hasDrawnBefore;
      els.pullButton.disabled = !canDraw;
      els.drawAgainButton.disabled = !canDraw;
    }

    function renderAll() {
      renderCounter();
      renderEntries();
      renderDrawButtons();
    }

    // =====================================================================
    // 6. Entry mutations
    // =====================================================================

    function shakeInput() {
      // Restart the shake animation even on rapid re-triggers (remove class,
      // force reflow, re-add) via the shared helper.
      restartAnimation(els.input, 'shake');
      setTimeout(() => els.input.classList.remove('shake'), SHAKE_DURATION_MS);
    }

    // crypto.randomUUID() is SECURE-CONTEXT ONLY (HTTPS / localhost / file://).
    // Served over plain HTTP on a LAN it is `undefined` and throws, which would
    // silently break adding entries. Build an id from crypto.getRandomValues
    // (available in any context) with a Math.random fallback, so Add works
    // everywhere the tool might be hosted.
    function newId() {
      try {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
    }

    function addEntry(rawText) {
      const text = clampText(String(rawText ?? ''));
      if (isBlank(text)) {
        shakeInput();
        return false;
      }
      const isDuplicate = isDuplicateText(entries, text);
      if (isDuplicate) {
        shakeInput();
        return false;
      }

      entries.push({ id: newId(), text });
      els.input.value = '';
      saveState();
      renderAll();
      // Blur (not focus) on a successful add: there's no dedicated API to
      // dismiss the on-screen mobile keyboard — it follows DOM focus, so
      // blurring the input is what hides it after tapping Add on iOS/Android.
      // A REJECTED add (blank/duplicate, above) does NOT blur — the input
      // keeps focus so the user can immediately fix and resubmit.
      els.input.blur();
      return true;
    }

    function removeEntry(id) {
      entries = removeEntryById(entries, id);
      // If the removed entry was the revealed winner, keep showing the
      // captured winnerText — do not blank the reveal card.
      saveState();
      renderAll();
    }

    function clearAll() {
      cancelInFlightAnimations();
      entries = [];
      drawState = { phase: 'idle', winnerId: null, winnerText: '', cycleHandle: null };
      els.winnerReveal.textContent = 'Ready when you are!';
      els.winnerReveal.setAttribute('aria-hidden', 'true');
      els.winnerReveal.classList.remove('bounce');
      // Back to the placeholder state — hide the in-field copy button again.
      els.winnerCopy.hidden = true;
      saveState();
      renderAll();
    }

    function cancelInFlightAnimations() {
      if (drawState.cycleHandle != null) {
        cancelAnimationFrame(drawState.cycleHandle);
        drawState.cycleHandle = null;
      }
      stopConfetti();
    }

    // =====================================================================
    // 7. Draw logic
    // =====================================================================

    function lockUI(locked) {
      els.input.disabled = locked;
      els.addButton.disabled = locked;
      els.clearAllButton.disabled = locked;
      els.removeWinnerToggle.disabled = locked;
      for (const btn of els.entryList.querySelectorAll('[data-testid="entry-remove"]')) {
        btn.disabled = locked;
      }
      if (locked) {
        els.pullButton.disabled = true;
        els.drawAgainButton.disabled = true;
      } else {
        renderDrawButtons();
      }
    }

    function setReelText(text) {
      els.winnerReveal.textContent = text;
    }

    function triggerBounce() {
      restartAnimation(els.winnerReveal, 'bounce');
      els.winnerReveal.addEventListener(
        'animationend',
        () => els.winnerReveal.classList.remove('bounce'),
        { once: true }
      );
    }

    function revealWinner(entry) {
      drawState.phase = 'revealed';
      drawState.winnerId = entry.id;
      drawState.winnerText = entry.text;
      els.winnerReveal.textContent = entry.text;
      els.winnerReveal.removeAttribute('aria-hidden');
      // Reveal the in-field copy button now that there's a real winner value to
      // copy (it stays hidden over the idle "Ready when you are!" placeholder).
      els.winnerCopy.hidden = false;
      // Announced exactly once per draw, here only — not per animation frame.
      // Mirrors winner-reveal's text exactly (winner-reveal and
      // winner-announce are separate elements, but must always agree).
      els.winnerAnnounce.textContent = entry.text;
      renderDrawButtons();
    }

    // Time-based RAF cycle: starts fast, decelerates (ease-out cubic), and
    // lands exactly on winnerEntry.text. Resolves once landing text + bounce
    // have started, not after the full bounce keyframe finishes.
    function runCycleAnimation(winnerEntry) {
      return new Promise((resolve) => {
        const startTime = performance.now();
        let lastStepTime = startTime;
        let cursorIndex = 0;

        function frame(now) {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / CYCLE_DURATION_MS, 1);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          const currentStepMs = CYCLE_MIN_STEP_MS + (CYCLE_MAX_STEP_MS - CYCLE_MIN_STEP_MS) * eased;

          if (now - lastStepTime >= currentStepMs) {
            lastStepTime = now;
            // Cosmetic-only display index. Math.random() is fine here — this
            // never touches the actual winner decision, which was already
            // fixed via pickIndex() before this function was called. Do not
            // confuse this with selection logic.
            const step = entries.length > 1 ? 1 + Math.floor(Math.random() * (entries.length - 1)) : 1;
            cursorIndex = (cursorIndex + step) % entries.length;
            setReelText(entries[cursorIndex].text);
          }

          if (t >= 1) {
            setReelText(winnerEntry.text); // guarantee exact landing text
            triggerBounce();
            resolve();
            return;
          }
          drawState.cycleHandle = requestAnimationFrame(frame);
        }
        drawState.cycleHandle = requestAnimationFrame(frame);
      });
    }

    async function draw({ instant = false, forceIndex } = {}) {
      if (drawState.phase === 'cycling') return; // guard re-entry
      if (entries.length < 2) return; // guard (button should already be disabled)

      if (
        forceIndex !== undefined &&
        (forceIndex < 0 || forceIndex >= entries.length || !Number.isInteger(forceIndex))
      ) {
        return; // invalid forceIndex — forgiving no-op for test convenience
      }

      const winnerIndex = forceIndex ?? pickIndex(entries.length, defaultRng);
      const winner = entries[winnerIndex];
      if (!winner) return;

      lockUI(true);
      drawState.phase = 'cycling';
      drawState.winnerId = null;

      // Checked fresh on every draw (not cached at module load) so a
      // mid-session OS setting change is honored on the next draw.
      const reducedMotion = prefersReducedMotion();

      if (instant || reducedMotion) {
        revealWinner(winner);
      } else {
        await runCycleAnimation(winner);
        revealWinner(winner);
        startConfetti();
      }

      lockUI(false);

      if (settings.removeWinnerAfterDraw) {
        removeEntry(winner.id); // keeps drawState.winnerText intact
      }
    }

    // =====================================================================
    // 8. Confetti
    // =====================================================================

    function resizeConfettiCanvas() {
      // Shared HiDPI canvas setup (CtUtil.mjs). Sizes the backing store
      // to window CSS px * dpr, sets the CSS pixel size, and applies the dpr
      // transform to the 2d context (same context object as confettiCtx).
      setupHiDPICanvas(els.confettiCanvas, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    function makeParticle(originX, originY) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4, // slight upward bias for a "burst"
        gravity: 0.15 + Math.random() * 0.08,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        size: 5 + Math.random() * 5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 1,
        decay: 0.006 + Math.random() * 0.006,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      };
    }

    function startConfetti() {
      const rect = els.winnerReveal.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      for (let i = 0; i < CONFETTI_PARTICLE_COUNT; i++) {
        confettiParticles.push(makeParticle(originX, originY));
      }
      if (confettiRafHandle == null) {
        confettiRafHandle = requestAnimationFrame(confettiTick);
      }
    }

    function confettiTick() {
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      confettiParticles = confettiParticles.filter((p) => {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.life -= p.decay;
        return p.life > 0 && p.y < window.innerHeight + 40;
      });

      for (const p of confettiParticles) {
        confettiCtx.save();
        confettiCtx.globalAlpha = Math.max(p.life, 0);
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.fillStyle = p.color;
        if (p.shape === 'rect') {
          confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          confettiCtx.beginPath();
          confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          confettiCtx.fill();
        }
        confettiCtx.restore();
      }

      if (confettiParticles.length === 0) {
        stopConfetti();
        return;
      }
      confettiRafHandle = requestAnimationFrame(confettiTick);
    }

    function stopConfetti() {
      if (confettiRafHandle != null) {
        cancelAnimationFrame(confettiRafHandle);
        confettiRafHandle = null;
      }
      confettiParticles = [];
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    // =====================================================================
    // 8b. Help modal -- purely informational (what the tool does + how to use
    // it). Built by the shared jbcModal primitive (lib/components/CtModal.mjs) from
    // the hidden #help-body template. The whole focus-trap / Esc + backdrop
    // close / focus-return / reduced-motion / scroll-top contract lives in that
    // one primitive now (was hand-rolled here). `testid: 'help'` keeps the
    // help-overlay / help-modal / modal-close-x test hooks; `titleId` pins the
    // aria-labelledby target; `autoOpen` rides the shared onceFlag so
    // the modal auto-shows once on a fresh visit and never again.
    // =====================================================================

    const help = createModal({
      testid: 'help',
      titleId: 'help-title',
      title: 'How Hat Picker works',
      body: document.getElementById('help-body').content.cloneNode(true),
      autoOpen: onceFlag(HELP_SEEN_KEY),
    });

    // =====================================================================
    // 9. Event wiring
    // =====================================================================
    // Destructive actions (per-entry remove, Clear all) confirm via the
    // shared confirmDialog(message) component (lib/components/CtConfirm.mjs, pasted
    // above as a classic <script>) rather than a bespoke modal — see
    // docs/conventions.md's "Destructive actions require confirmation".
    // window.__hatPicker.removeEntry(id)/clear() remain direct, non-modal
    // calls (used here only after confirmDialog resolves true, and by tests).

    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      addEntry(els.input.value);
    });

    els.input.addEventListener('input', renderCounter);

    // Event delegation for remove buttons — simpler than per-row listeners.
    els.entryList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-testid="entry-remove"]');
      if (!btn || btn.disabled) return;
      const li = btn.closest('[data-testid="entry-row"]');
      if (!li) return;
      const { id } = li.dataset;
      if (await confirmDialog('Remove this entry?')) removeEntry(id);
    });

    els.pullButton.addEventListener('click', () => draw());
    els.drawAgainButton.addEventListener('click', () => draw());

    // In-field copy for the winner value (docs/conventions.md "In-field copy
    // button"). Uses the shared copy/flash (CtClipboardUtil.mjs). winnerText is the
    // exact revealed winner, so it stays correct even after "remove winner
    // after draw" takes the entry out of the hat.
    els.winnerCopy.addEventListener('click', async () => {
      const text = drawState.winnerText || els.winnerReveal.textContent.trim();
      if (!text) return;
      const ok = await copy(text);
      if (!ok) return;
      flash(els.winnerCopy, { label: '✅', revertTo: '📋' });
    });

    els.removeWinnerToggle.addEventListener('change', () => {
      settings.removeWinnerAfterDraw = els.removeWinnerToggle.checked;
      saveState();
    });

    els.clearAllButton.addEventListener('click', async () => {
      if (entries.length === 0) return; // nothing to clear
      if (await confirmDialog('Remove all entries?')) clearAll();
    });

    window.addEventListener('resize', resizeConfettiCanvas);

    els.helpButton.addEventListener('click', () => help.open());

    // =====================================================================
    // 10. Init
    // =====================================================================

    (function init() {
      const loaded = loadState();
      entries = loaded.entries;
      settings = loaded.settings;
      els.removeWinnerToggle.checked = settings.removeWinnerAfterDraw;
      resizeConfettiCanvas();
      renderAll();
      // The Help modal auto-shows itself once on a fresh visit — jbcModal's
      // `autoOpen` handle (above) owns that "once" gate now.
    })();

    // =====================================================================
    // 11. Test hooks — inert for normal use, enables deterministic
    // Playwright assertions.
    // =====================================================================
    window.__hatPicker = {
      get entries() {
        return entries.map((e) => ({ ...e }));
      },
      get settings() {
        return { ...settings };
      },
      get drawState() {
        return { ...drawState };
      },
      addEntry,
      removeEntry,
      clear: clearAll,
      pickIndex,
      defaultRng,
      draw,
    };
  