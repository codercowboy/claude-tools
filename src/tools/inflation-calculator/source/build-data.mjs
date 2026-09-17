#!/usr/bin/env node
/*
 * build-data.mjs — refresh source/cpi-data.json from the BLS CPI-U series.
 *
 * DATA: BLS Consumer Price Index for All Urban Consumers (CPI-U), U.S. city
 * average, all items — series CUUR0000SA0, base 1982-84=100. Annual averages
 * (BLS period "M13"). This is a U.S. Government work — PUBLIC DOMAIN.
 * Source: https://www.bls.gov/cpi/
 *
 * This script is a build-TIME utility. It is NOT part of `npm run build` or
 * `npm test` — the shipped tool bundles the committed cpi-data.json and never
 * hits the network at runtime. Run it manually to refresh:
 *
 *     npm run build:data            # v1 API (recent years) merged into snapshot
 *     BLS_API_KEY=xxxx npm run build:data   # v2 API, full 1913->present range
 *
 * Why two paths: the flat file at download.bls.gov blocks non-interactive
 * clients ("Access Denied"), and the keyless v1 API ignores startyear/endyear
 * and only returns the latest ~3 years. A registration key (free, from
 * https://data.bls.gov/registrationEngine/) unlocks the v2 API, which honors a
 * year range (up to 20 years per request) and can rebuild the full history.
 * Without a key this script fetches the recent years via v1 and MERGES them
 * into the existing committed snapshot (updating the tail, preserving history).
 *
 * Dependency-free: uses global fetch (Node >= 20) and node:fs only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'cpi-data.json');
const SERIES = 'CUUR0000SA0';
const START_YEAR = 1913;

function annualFromSeriesRows(rows) {
  // Prefer the published annual average (M13); otherwise average the 12 months.
  const byYear = new Map();
  const months = new Map();
  for (const r of rows) {
    const year = Number(r.year);
    const val = Number(r.value);
    if (!Number.isFinite(year) || !Number.isFinite(val)) continue;
    if (r.period === 'M13') {
      byYear.set(year, val);
    } else if (/^M(0[1-9]|1[0-2])$/.test(r.period)) {
      if (!months.has(year)) months.set(year, []);
      months.get(year).push(val);
    }
  }
  // Fill any year missing an M13 but with all 12 months.
  for (const [year, ms] of months) {
    if (!byYear.has(year) && ms.length === 12) {
      byYear.set(year, ms.reduce((a, b) => a + b, 0) / 12);
    }
  }
  return byYear;
}

async function fetchV1() {
  const url = `https://api.bls.gov/publicAPI/v1/timeseries/data/${SERIES}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS v1: ${json.status} ${JSON.stringify(json.message)}`);
  return annualFromSeriesRows(json.Results.series[0].data);
}

async function fetchV2(key) {
  const nowYear = new Date().getFullYear();
  const all = new Map();
  for (let s = START_YEAR; s <= nowYear; s += 20) {
    const e = Math.min(s + 19, nowYear);
    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesid: [SERIES], startyear: String(s), endyear: String(e), annualaverage: true, registrationkey: key }),
    });
    const json = await res.json();
    if (json.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS v2 (${s}-${e}): ${json.status} ${JSON.stringify(json.message)}`);
    for (const [year, val] of annualFromSeriesRows(json.Results.series[0].data)) all.set(year, val);
  }
  return all;
}

function round(v) {
  // Keep BLS's precision: recent values are 3-decimal, older ones 1-decimal.
  return Math.round(v * 1000) / 1000;
}

async function main() {
  const key = process.env.BLS_API_KEY;
  const nowYear = new Date().getFullYear();

  let existing = { data: {} };
  try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first run */ }

  let fetched;
  if (key) {
    console.log('Fetching full CPI-U history via BLS API v2 …');
    fetched = await fetchV2(key);
  } else {
    console.log('No BLS_API_KEY — fetching recent years via v1 and merging into the snapshot.');
    fetched = await fetchV1();
  }

  const merged = { ...(existing.data || {}) };
  for (const [year, val] of fetched) {
    // Only keep COMPLETE calendar years (skip the in-progress current year
    // unless BLS already published its annual M13).
    if (year >= nowYear && !fetched.has(year)) continue;
    merged[String(year)] = round(val);
  }
  // Drop the current in-progress year if it has no finalized annual value.
  if (!fetched.has(nowYear)) delete merged[String(nowYear)];

  const years = Object.keys(merged).map(Number).sort((a, b) => a - b);
  const ordered = {};
  for (const y of years) ordered[String(y)] = merged[String(y)];

  const doc = {
    series: SERIES,
    seriesTitle: 'CPI for All Urban Consumers (CPI-U), U.S. city average, all items',
    base: '1982-84=100',
    source: 'U.S. Bureau of Labor Statistics',
    sourceUrl: 'https://www.bls.gov/cpi/',
    note: 'Annual average index (BLS period M13). Public domain (U.S. Government work).',
    lastUpdated: new Date().toISOString().slice(0, 10),
    data: ordered,
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${years.length} years (${years[0]}–${years[years.length - 1]}).`);
  console.log('Now run `npm run build` to re-inline the data and commit both files.');
}

main().catch((err) => { console.error('Refresh failed:', err.message); process.exit(1); });
