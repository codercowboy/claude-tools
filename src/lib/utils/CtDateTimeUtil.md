# CtDateTimeUtil

Duration formatters plus a timezone / calendar / date-math engine built on [`Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/API/Intl/DateTimeFormat).

`src/lib/utils/CtDateTimeUtil.mjs` — part of the `ct` lib the tools share (inlined into a tool's `index.html` at build time via the `<<ct:module>>` token).

## Overview

One module, two sections concatenated from the former `duration.mjs` and `timezone.mjs`. The first gives two ways to render a duration as human text. The second is a timezone engine: zone offsets and [DST](https://en.wikipedia.org/wiki/Daylight_saving_time)-aware wall-clock conversion, a meeting-overlap planner, a one-instant-into-many-zones converter, DST state and next-transition detection, and naive calendar arithmetic (business-day math, [ISO week](https://en.wikipedia.org/wiki/ISO_week_date), date diffs).

Every zone behavior is derived from `Intl.DateTimeFormat` and [`formatToParts`](https://developer.mozilla.org/en-US/docs/Web/API/Intl/DateTimeFormat/formatToParts). No [IANA time-zone database](https://en.wikipedia.org/wiki/Tz_database) ships with the module. The caller supplies the IANA zone ids (e.g. `"America/Los_Angeles"`); the module carries no zone catalogue.

The whole module is DOM-free and Node-importable, so a unit-tested `logic.mjs` can use it and `node --test` can load it. The "naive" date-math functions treat a `Date` as a bag of UTC fields: they read/write `getUTC*`/`setUTC*`, so the typed wall-clock values are manipulated directly without the host's local zone creeping in.

Two naming conventions to keep straight. Every function and `WEEKDAY_NAMES` is exported both as a named export and as a static on the `CtDateTimeUtil` class (statics reference the named functions). And `formatDuration`/`humanizeDuration` are declared with `export function`; the rest are collected in a single `export { ... }` block.

## API — duration

### `formatDuration(seconds) → string`

A media-style clock readout from a count of SECONDS: `"m:ss"` under an hour, `"h:mm:ss"` at or above one hour (minutes and seconds zero-padded to 2).

- `seconds` — the duration in seconds. Negative or non-finite input clamps to `0`. Seconds are rounded.

```js
import { formatDuration } from './CtDateTimeUtil.mjs';

formatDuration(0);     // "0:00"
formatDuration(65);    // "1:05"
formatDuration(3661);  // "1:01:01"
```

### `humanizeDuration(ms) → string`

A compact breakdown from a count of MILLISECONDS: `"1d 2h 3m 4s"`, largest unit to smallest, zero components omitted.

- `ms` — the duration in milliseconds.
- A sub-second value renders as `"500ms"`. `0` renders `"0ms"`. A negative value keeps a leading `"-"`. Non-finite input renders `""`.

```js
import { humanizeDuration } from './CtDateTimeUtil.mjs';

humanizeDuration(0);      // "0ms"
humanizeDuration(500);    // "500ms"
humanizeDuration(90000);  // "1m 30s"
```

## API — zone offsets and wall-clock parts

### `zonedParts(date, tz) → object`

Returns the wall-clock fields a given instant has in a given zone.

- `date` — a `Date` (the instant).
- `tz` — an IANA zone id.
- Returns `{ year, month, day, hour, minute, second, weekday, weekdayName }`. `month` is 1-based, `hour` is 0..23 (an engine's `24` for midnight is normalized to `0`), `weekday` is 0 (Sunday) .. 6 (Saturday), `weekdayName` is the full English name.

```js
import { zonedParts } from './CtDateTimeUtil.mjs';

zonedParts(new Date('2026-07-01T12:00:00Z'), 'America/Los_Angeles');
// { year: 2026, month: 7, day: 1, hour: 5, minute: 0, second: 0, weekday: 3, weekdayName: 'Wednesday' }
```

### `zoneOffsetMinutes(date, tz) → number`

The minutes to add to UTC to get the wall-clock time in `tz` at `date`, DST-aware. `+05:30` → `330`, `-08:00` → `-480`.

```js
import { zoneOffsetMinutes } from './CtDateTimeUtil.mjs';

zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Kolkata'); // 330
```

### `formatOffset(minutes) → string`

Formats an offset in minutes as `"±HH:MM"`. `330` → `"+05:30"`, `0` → `"+00:00"`, `-480` → `"-08:00"`.

```js
import { formatOffset } from './CtDateTimeUtil.mjs';

formatOffset(-480); // "-08:00"
```

### `zonedTimeToUtc(y, mo, d, h, mi, s, tz) → Date`

Inverts a wall-clock time in `tz` to the UTC instant it names, DST-aware.

- `y, mo, d, h, mi, s` — the wall-clock fields (`mo` 1-based; `s` optional, defaults to `0`).
- `tz` — the IANA zone id.
- Returns a `Date`.

A candidate instant is accepted only when it round-trips (its own offset reproduces the requested wall time). For a spring-forward gap, a wall time that does not exist, neither candidate round-trips; the function then follows the "compatible"/forward-shift convention used by Temporal, Luxon, and java.time and returns the later instant. So `02:30` on a US spring-forward day resolves forward to `03:30` local, not back to `01:30`. The rule is offset-sign-agnostic, so it also holds for southern-hemisphere zones.

```js
import { zonedTimeToUtc } from './CtDateTimeUtil.mjs';

zonedTimeToUtc(2026, 6, 1, 9, 0, 0, 'America/New_York'); // the UTC Date for 9am NY
```

### `formatInZone(date, tz, opts?) → string`

A thin `Intl.DateTimeFormat` wrapper for display strings.

- `date` — the instant.
- `tz` — the IANA zone id.
- `opts` — `Intl.DateTimeFormat` options; `opts.locale` picks the locale (default `'en-US'`), the rest are passed through alongside `timeZone`.
- Returns the formatted string.

```js
import { formatInZone } from './CtDateTimeUtil.mjs';

formatInZone(new Date(), 'Europe/Paris', { hour: '2-digit', minute: '2-digit' });
```

### `zoneAbbrev(date, tz) → string`

The short zone name for an instant (`"PDT"`, `"IST"`, or `"GMT+5:30"` depending on the engine). Returns `""` if the lookup throws.

```js
import { zoneAbbrev } from './CtDateTimeUtil.mjs';

zoneAbbrev(new Date('2026-07-01T00:00:00Z'), 'America/Los_Angeles'); // "PDT" (engine-dependent)
```

## API — meeting planner

### `isWorkingHour(hour, workHours) → boolean`

Is a local hour-of-day inside working hours?

- `hour` — the local hour (0..23).
- `workHours` — `{ start, end }` in hours; defaults to `9`/`17` when missing or non-finite. A window where `start > end` wraps past midnight (e.g. `22`–`06`). `start === end` is an empty window (always `false`).

```js
import { isWorkingHour } from './CtDateTimeUtil.mjs';

isWorkingHour(14, { start: 9, end: 17 }); // true
isWorkingHour(23, { start: 22, end: 6 }); // true (wraps midnight)
```

### `meetingGrid(zones, workHours, refZone, refDateStr) → object`

Builds a 24-column grid keyed on the reference zone's local hours 00..23 for the given date. Each column carries every zone's local state at that instant.

- `zones` — an array of IANA zone ids.
- `workHours` — `{ start, end }` passed to `isWorkingHour`.
- `refZone` — the reference IANA zone id.
- `refDateStr` — `"YYYY-MM-DD"`.
- Returns `{ refZone, refDateStr, columns }`, where each column is `{ hour, instant, cells, allWorking }` and each cell is `{ tz, localHour, localMinute, working, dayDelta, offsetMinutes }`. `dayDelta` is the whole-day difference between the cell's local date and the reference date. `allWorking` is true only when there is at least one zone and every zone is working at that column.

```js
import { meetingGrid } from './CtDateTimeUtil.mjs';

const grid = meetingGrid(['America/New_York', 'Europe/London'], { start: 9, end: 17 }, 'UTC', '2026-06-01');
grid.columns[14].allWorking; // boolean
```

### `overlapWindows(zones, workHours, refZone?, refDateStr?) → Array`

Contiguous ranges, in reference-zone local hours, where every zone is inside working hours.

- `zones`, `workHours` — as for `meetingGrid`.
- `refZone` — defaults to `'UTC'`.
- `refDateStr` — defaults to today's UTC date (`"YYYY-MM-DD"`).
- Returns an array of `{ startHour, endHour }` with `endHour` exclusive (e.g. `{ startHour: 14, endHour: 17 }` means 14–17).

```js
import { overlapWindows } from './CtDateTimeUtil.mjs';

overlapWindows(['America/New_York', 'Europe/London'], { start: 9, end: 17 });
// e.g. [{ startHour: 14, endHour: 17 }]
```

## API — converter

### `instantInZones(date, zones) → Array`

Renders one instant into many zones at once.

- `date` — the instant.
- `zones` — an array of IANA zone ids.
- Returns one entry per zone: `{ tz, parts, offsetMinutes, offsetLabel, abbrev, weekdayName, dayDelta, local }`. `parts` is the `zonedParts` object, `offsetLabel` is the `formatOffset` string, `abbrev` is `zoneAbbrev`, `dayDelta` is the day difference versus UTC's date for the same instant, and `local` is a formatted `"MMM DD, YYYY, HH:MM:SS"` display string.

```js
import { instantInZones } from './CtDateTimeUtil.mjs';

instantInZones(new Date(), ['America/New_York', 'Asia/Tokyo']);
```

## API — zone info

### `isDstInEffect(tz, date?) → boolean`

Is DST in effect in `tz` at `date`?

- `tz` — the IANA zone id.
- `date` — defaults to `new Date()`.
- Compares the current offset against the zone's standard offset (the smaller of the January and July offsets). Works for both hemispheres and returns `false` for zones without DST.

```js
import { isDstInEffect } from './CtDateTimeUtil.mjs';

isDstInEffect('America/Los_Angeles', new Date('2026-07-01T00:00:00Z')); // true
```

### `nextDstTransition(tz, from?, maxDays?) → object | null`

The next offset change at or after `from`.

- `tz` — the IANA zone id.
- `from` — defaults to `new Date()`.
- `maxDays` — the forward search horizon, default `400`.
- Returns `{ at, offsetBefore, offsetAfter }` (`at` is a `Date`, offsets in minutes), or `null` if no change falls within `maxDays`. It scans forward in 6-hour steps for a change, then binary-searches down to the second.

```js
import { nextDstTransition } from './CtDateTimeUtil.mjs';

nextDstTransition('Europe/London'); // { at, offsetBefore, offsetAfter } or null
```

### `zoneInfo(tz, date?) → object`

A rollup for one zone at one instant.

- `tz` — the IANA zone id.
- `date` — defaults to `new Date()`.
- Returns `{ tz, offsetMinutes, offsetLabel, abbrev, dst, next, parts }`, where `dst` is `isDstInEffect`, `next` is `nextDstTransition`, and `parts` is `zonedParts`.

```js
import { zoneInfo } from './CtDateTimeUtil.mjs';

zoneInfo('Asia/Kolkata');
```

## API — naive calendar math

These treat a `Date` as its UTC fields. Build inputs with `Date.UTC(...)` or `parseNaive` so the fields you typed are the fields the math sees.

### `parseNaive(str) → Date | null`

Parses a datetime-local string into a UTC-based naive `Date` (the typed fields are treated as the literal date/time).

- `str` — `"YYYY-MM-DDTHH:mm[:ss]"` or a plain `"YYYY-MM-DD"` (a space may stand in for `T`).
- Returns the `Date`, or `null` on invalid input. Out-of-range components that `Date.UTC` would silently roll over (month 13, day 32, Feb 30, hour 25) are rejected: the fields must survive a round-trip unchanged.

```js
import { parseNaive } from './CtDateTimeUtil.mjs';

parseNaive('2026-02-29'); // null (2026 is not a leap year)
parseNaive('2026-06-01T09:30'); // a Date
```

### `weekdayName(date) → string`

The full English weekday name for a naive `Date` (via `getUTCDay`).

```js
import { weekdayName, parseNaive } from './CtDateTimeUtil.mjs';

weekdayName(parseNaive('2026-06-01')); // "Monday"
```

### `dayOfYear(date) → number`

The day-of-year, 1..365/366, by UTC fields.

```js
import { dayOfYear, parseNaive } from './CtDateTimeUtil.mjs';

dayOfYear(parseNaive('2026-01-01')); // 1
```

### `quarter(date) → number`

The calendar quarter, 1..4, by UTC month.

```js
import { quarter, parseNaive } from './CtDateTimeUtil.mjs';

quarter(parseNaive('2026-07-15')); // 3
```

### `isoWeek(date) → number`

The ISO 8601 week number (1..53). Week starts Monday; week 1 contains the year's first Thursday.

```js
import { isoWeek, parseNaive } from './CtDateTimeUtil.mjs';

isoWeek(parseNaive('2026-01-01')); // ISO week number
```

### `isoWeekYear(date) → number`

The ISO week-numbering year, which can differ from the calendar year near Jan 1 / Dec 31.

```js
import { isoWeekYear, parseNaive } from './CtDateTimeUtil.mjs';

isoWeekYear(parseNaive('2027-01-01')); // may be 2026
```

### `businessDaysBetween(a, b) → number`

The signed count of business days (Mon–Fri) strictly between two dates, by calendar date. From a Monday to the next Friday of the same week is `4`. Negative when `b` precedes `a`.

```js
import { businessDaysBetween, parseNaive } from './CtDateTimeUtil.mjs';

businessDaysBetween(parseNaive('2026-06-01'), parseNaive('2026-06-05')); // 4
```

### `addBusinessDays(date, n) → Date`

Moves `n` business days from `date` (`n` may be negative), preserving the time-of-day. Weekends are skipped. Returns a new `Date`.

```js
import { addBusinessDays, parseNaive } from './CtDateTimeUtil.mjs';

addBusinessDays(parseNaive('2026-06-05T12:00'), 1); // the following Monday, noon
```

### `addCalendar(date, amount, unit) → Date`

Calendar add/subtract, preserving the naive model. Returns a new `Date`.

- `date` — the base date.
- `amount` — the quantity, coerced with `Number`; a non-finite amount returns a copy of `date` unchanged.
- `unit` — one of `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `business-days`. `years`/`months` use `setUTCFullYear`/`setUTCMonth` (so month overflow rolls over the usual way); `business-days` delegates to `addBusinessDays`; any other unit returns a copy unchanged.

```js
import { addCalendar, parseNaive } from './CtDateTimeUtil.mjs';

addCalendar(parseNaive('2026-01-31'), 1, 'months'); // rolls per setUTCMonth
addCalendar(parseNaive('2026-06-01'), 5, 'business-days');
```

### `diffParts(a, b) → object`

The difference `b - a`, broken into components and totals.

- Returns `{ sign, totalMs, days, hours, minutes, seconds, milliseconds, totalSeconds, totalMinutes, totalHours, totalDays }`. `sign` is `-1`/`0`/`1`. The component fields (`days`..`milliseconds`) are the absolute breakdown; the `total*` fields are signed floating values.

```js
import { diffParts, parseNaive } from './CtDateTimeUtil.mjs';

const d = diffParts(parseNaive('2026-06-01T00:00'), parseNaive('2026-06-02T01:30'));
d.days;    // 1
d.hours;   // 1
d.minutes; // 30
```

### `formatDiff(parts) → string`

A compact `"1d 2h 3m 4s"` string from a `diffParts` result, sign-prefixed.

- `parts` — a `diffParts` object.
- Zero components are omitted. `sign === 0` returns `"0s"`. A sub-second diff that rounds to zero whole seconds returns `"0s"` with no sign (never `"-0s"`).

```js
import { formatDiff, diffParts, parseNaive } from './CtDateTimeUtil.mjs';

formatDiff(diffParts(parseNaive('2026-06-01T00:00'), parseNaive('2026-06-02T01:30'))); // "1d 1h 30m"
```

### `toNaiveInput(date, withSeconds?) → string`

A `"YYYY-MM-DDTHH:mm"` naive string for a UTC-based `Date`, for feeding a `datetime-local` input.

- `date` — the naive `Date`.
- `withSeconds` — `true` appends `":ss"`. Default `false`.

```js
import { toNaiveInput, parseNaive } from './CtDateTimeUtil.mjs';

toNaiveInput(parseNaive('2026-06-01T09:30:15'));        // "2026-06-01T09:30"
toNaiveInput(parseNaive('2026-06-01T09:30:15'), true);  // "2026-06-01T09:30:15"
```

### `WEEKDAY_NAMES`

A constant array of the seven full English weekday names, Sunday first: `['Sunday', 'Monday', ..., 'Saturday']`.

```js
import { WEEKDAY_NAMES } from './CtDateTimeUtil.mjs';

WEEKDAY_NAMES[1]; // "Monday"
```

### `class CtDateTimeUtil`

An aggregator class. Every static member references one of the named exports above (no reimplementation): `formatDuration`, `humanizeDuration`, `zoneOffsetMinutes`, `formatOffset`, `zonedParts`, `zonedTimeToUtc`, `formatInZone`, `zoneAbbrev`, `isWorkingHour`, `meetingGrid`, `overlapWindows`, `instantInZones`, `isDstInEffect`, `nextDstTransition`, `zoneInfo`, `parseNaive`, `addCalendar`, `businessDaysBetween`, `addBusinessDays`, `isoWeek`, `isoWeekYear`, `quarter`, `dayOfYear`, `weekdayName`, `diffParts`, `formatDiff`, `toNaiveInput`, `WEEKDAY_NAMES`.

```js
import { CtDateTimeUtil } from './CtDateTimeUtil.mjs';

CtDateTimeUtil.formatDuration(3661);            // "1:01:01"
CtDateTimeUtil.zoneOffsetMinutes(new Date(), 'UTC'); // 0
```

## Notes

- Zone correctness rides entirely on the host's `Intl` and its bundled time-zone data. `zoneAbbrev`'s exact string is engine-dependent (`"PDT"` on one engine, `"GMT-7"` on another).
- The naive calendar functions operate on UTC fields. Passing a `Date` built from a local-time constructor will read that date's UTC components, not its local ones. Build inputs with `parseNaive` or `Date.UTC(...)`.
- `nextDstTransition` scans at a 6-hour granularity for the first change, so a hypothetical offset change shorter than 6 hours could be missed. Real zones don't do that.
- `_partsFormatter` caches one `Intl.DateTimeFormat` per zone because `formatToParts` is the hot path for `zonedParts` and everything built on it.
- `parseNaive`'s regex needs a 4-digit year, so dates outside years 1000–9999 are rejected by format.
