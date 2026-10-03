// layout.mjs — e2e helpers for viewport presets and horizontal-overflow checks.
// Dependency-free (never imports @playwright/test); throws on failure.

/** Named viewport presets. wide/ultrawide cover the 1400-1700 desktop range. */
export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  narrow: { width: 380, height: 800 },
  tablet: { width: 768, height: 1024 },
  wide: { width: 1400, height: 900 },
  ultrawide: { width: 1700, height: 1000 },
};

/** Resolve a preset name or `{width,height?}` to `{width,height}`. */
export function resolveViewport(v) {
  if (typeof v === 'string') {
    if (!VIEWPORTS[v]) throw new Error(`unknown viewport preset "${v}"`);
    return { ...VIEWPORTS[v] };
  }
  if (v && typeof v.width === 'number') return { width: v.width, height: v.height ?? 800 };
  throw new Error('resolveViewport: pass a preset name or {width,height}');
}

/** page.setViewportSize from a preset name or size. Returns the applied size. */
export async function setViewport(page, v) {
  const size = resolveViewport(v);
  await page.setViewportSize(size);
  return size;
}

/** Measure horizontal overflow: `{ scrollWidth, clientWidth, overflow }` (overflow in px, may be <= 0). */
export async function measureOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const se = document.scrollingElement || de;
    const scrollWidth = Math.max(se.scrollWidth, de.scrollWidth, document.body ? document.body.scrollWidth : 0);
    return { scrollWidth, clientWidth: de.clientWidth, overflow: scrollWidth - de.clientWidth };
  });
}

/**
 * Throw if the page scrolls horizontally. Optionally switch viewport first
 * (`viewport`: preset name or {width,height}). `tolerance` px of slack (default 2).
 * Returns the measurement.
 */
export async function expectNoOverflow(page, { viewport, tolerance = 2 } = {}) {
  if (viewport) await setViewport(page, viewport);
  const m = await measureOverflow(page);
  if (m.overflow > tolerance) {
    throw new Error(`horizontal overflow: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth} (+${tolerance})`);
  }
  return m;
}
