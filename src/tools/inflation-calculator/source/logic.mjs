
  // =====================================================================
  // Inflation Calculator — pure logic (DOM-free, unit-tested)
  //
  // No document / window / localStorage in this file. app.mjs inlines it at
  // build time; tests/unit/*.test.mjs import it directly. Every function is
  // deterministic given a passed `cpi` map: { year: annualIndex } where the
  // year keys may be numbers or numeric strings. See DESIGN.md § "Pure logic".
  // =====================================================================

  // Min / max year present in a CPI map.
  function dataRange(cpi) {
    const years = Object.keys(cpi || {})
      .map((y) => Number(y))
      .filter((y) => Number.isInteger(y));
    if (years.length === 0) throw new Error('No CPI data available.');
    return { minYear: Math.min(...years), maxYear: Math.max(...years) };
  }

  // The index for a year, or a friendly throw when it's outside the data.
  function cpiFor(year, cpi) {
    const y = Number(year);
    if (!Number.isInteger(y)) throw new Error('Enter a whole year.');
    const v = cpi[y] != null ? cpi[y] : cpi[String(y)];
    if (v == null || !Number.isFinite(Number(v))) {
      const { minYear, maxYear } = dataRange(cpi);
      throw new Error(`No CPI data for ${y}. Data covers ${minYear}–${maxYear}.`);
    }
    return Number(v);
  }

  // What `amount` (a Number) from `fromYear` is worth in `toYear`.
  function adjust(amount, fromYear, toYear, cpi) {
    const n = Number(amount);
    if (!Number.isFinite(n)) throw new Error('Enter a valid amount.');
    return n * (cpiFor(toYear, cpi) / cpiFor(fromYear, cpi));
  }

  // Cumulative inflation over the span, as a percent (e.g. 146.32 for +146.32%).
  function cumulativeInflation(fromYear, toYear, cpi) {
    return (cpiFor(toYear, cpi) / cpiFor(fromYear, cpi) - 1) * 100;
  }

  // Average annual inflation rate (CAGR) over the span, as a percent.
  // 0 when the years match. Direction-agnostic: n = to - from, so a reversed
  // span yields the same-magnitude rate as the forward span.
  function annualRate(fromYear, toYear, cpi) {
    const from = cpiFor(fromYear, cpi);
    const to = cpiFor(toYear, cpi);
    const years = Number(toYear) - Number(fromYear);
    if (years === 0) return 0;
    return (Math.pow(to / from, 1 / years) - 1) * 100;
  }

  // ---------------------------------------------------------------------
  // Display formatting (shared so the sentence, tiles, and copy all agree)
  // ---------------------------------------------------------------------

  // USD with thousands grouping and 2 decimals; keeps a leading "-" for
  // negatives (e.g. "-$5.00"). Non-finite -> "".
  function formatUSD(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    const neg = x < 0;
    const abs = Math.abs(x);
    const [intPart, fracPart] = abs.toFixed(2).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${neg ? '-' : ''}$${grouped}.${fracPart}`;
  }

  // A percent with sign and up to 2 decimals (trailing zeros trimmed), e.g.
  // "+146.32%", "-8.4%", "0%". Non-finite -> "".
  function formatPercent(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    const rounded = Math.round(x * 100) / 100;
    if (rounded === 0) return '0%';
    let s = Math.abs(rounded).toFixed(2);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return `${rounded > 0 ? '+' : '-'}${s}%`;
  }

  export {
    dataRange,
    cpiFor,
    adjust,
    cumulativeInflation,
    annualRate,
    formatUSD,
    formatPercent,
  };
