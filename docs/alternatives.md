# Alternatives & the wider world

## 1. The closest analogs — other developer/designer tool collections

- **[DevToys](https://github.com/DevToys-app/DevToys)** - a native desktop app billed as "A Swiss Army knife for developers," with dozens of encoders, formatters, and converters, on Windows, macOS, and Linux.
  **Pick it instead when:** you want one installed desktop app with a big tool drawer and don't mind that it isn't a browser page.
- **[IT-Tools](https://github.com/CorentinTh/it-tools)** ([it-tools.tech](https://it-tools.tech)) - "Collection of handy online tools for developers, with great UX." A polished web app you can use hosted or self-host via Docker.
  **Pick it instead when:** you want a large suite covering far more than these nine and you're happy running a server or trusting the hosted instance.
- **[CyberChef](https://github.com/gchq/CyberChef)** - GCHQ's "Cyber Swiss Army Knife," a client-side web app for encryption, encoding, compression, and data analysis where you chain operations into a "recipe."
  **Pick it instead when:** you're wrangling data through multiple steps at once (decode, then decompress, then extract) and want to pipe operations together.
- **[Omatsuri](https://github.com/rtivital/omatsuri)** ([omatsuri.app](https://omatsuri.app)) - "PWA with 12 open source frontend focused tools," installable and browser-based.
  **Pick it instead when:** you want an installable progressive web app of frontend helpers rather than loose HTML files.
- **[10015 Tools](https://10015.io/)** - a free all-in-one online toolbox spanning text, image, CSS, color, and coding utilities, with browser extensions.
  **Pick it instead when:** you want one hosted site for a huge range of tools, including image and CSS generators these nine don't touch.
- **[transform.tools](https://transform.tools/)** - a web collection of converters (JSON to TypeScript, SVG to JSX, HTML to Pug, and many more).
  **Pick it instead when:** your job is converting between code and data formats, which is exactly its lane and not really mine.


## 2. The broader ecosystem — single-purpose sites each tool replaces

- **QR generator → [goQR.me](https://goqr.me/)** - a free online QR generator with vCard, wifi, and other data types, exporting PNG/JPEG/SVG/EPS.
- **base64-tool → [base64encode.org](https://www.base64encode.org/)** - an online box that encodes and decodes Base64, with charset, URL-safe, and line-wrap options.
- **cron-builder → [crontab.guru](https://crontab.guru/)** - "the quick and simple editor for cron schedule expressions," the reference nearly everyone links.
- **color-designer → [Coolors](https://coolors.co/)** and **[Adobe Color](https://color.adobe.com/create/color-wheel/)** - Coolors is a fast palette generator with contrast checks and image extraction; Adobe Color builds harmonies off a color wheel.
- **color-picker → [Image Color Picker](https://imagecolorpicker.com/)** - upload, paste, or link an image and read off HEX/RGB/HSL/HSV.g local files.
- **uuid-generator → [uuidgenerator.net](https://www.uuidgenerator.net/)** - generates UUID v1/v4/v7 (and nil) online, defaulting to secure v4.
- **network-toolkit → [ipcalc](https://jodies.de/ipcalc)** (Krischan Jodies) - the classic subnet calculator: netmask, wildcard, network, broadcast, host range, with a colored bit breakdown.
- **inflation-calculator → [BLS CPI Inflation Calculator](https://data.bls.gov/cgi-bin/cpicalc.pl)** and **[US Inflation Calculator](https://www.usinflationcalculator.com/)** - the BLS calculator is the authoritative source itself; the other site adds monthly granularity and history commentary.

## 3. Adjacent — command line and native tools

- **[libqrencode / qrencode](https://fukuchi.org/works/qrencode/)** (Kentaro Fukuchi) - a fast C library and `qrencode` command-line tool for generating QR codes.
- **`uuidgen` and `base64`** - standard commands on macOS and most Linux boxes (`uuidgen` for a UUID, `base64` for encode/decode).

## 4. Vanilla / official specs and data

My tools mostly just implement someone else's standard. These are the canonical sources they're built against, worth a bookmark if you want the real rules.

- **[RFC 9562](https://datatracker.ietf.org/doc/rfc9562/)** - "Universally Unique IDentifiers (UUIDs)," which defines v4 (random) and v7 (time-ordered) and obsoletes the older RFC 4122. This is what the UUID generator follows.
- **[RFC 4648](https://datatracker.ietf.org/doc/html/rfc4648)** - "The Base16, Base32, and Base64 Data Encodings," including the URL-safe Base64URL alphabet the base64 tool emits.
- **[The ULID spec](https://github.com/ulid/spec)** and **[nanoid](https://github.com/ai/nanoid)** - the canonical definitions behind the UUID generator's ULID and nanoid modes.
- **[crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html)** - the Unix man page defining the five cron fields (minute, hour, day-of-month, month, day-of-week) that the cron builder parses.
- **[CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/)** - the W3C spec for `rgb()`, `hsl()`, and hex notation that the color tools read and write.
- **[BLS Consumer Price Index (CPI-U)](https://data.bls.gov/cgi-bin/cpicalc.pl)** - the US Bureau of Labor Statistics data (series `CUUR0000SA0`) the inflation calculator bundles.

The QR generator implements the QR Code standard, ISO/IEC 18004. The [libqrencode](https://fukuchi.org/works/qrencode/) project above is a good open reference implementation to compare against.

## 5. Community libraries / directories — where to find more

When you want more tools than any one collection ships, the "awesome" lists are where people browse. Quality varies, so bring a critical eye.

- **[t18n/awesome-dev-tools](https://github.com/t18n/awesome-dev-tools)** - "A curated list of awesome development tools and resources for software developers."
- There are several other repos named some variant of **awesome-devtools** (I found them by search rather than by vetting each one), so treat that whole cluster as a starting point, not a seal of quality.
- The big collections in section 1 (IT-Tools, DevToys, CyberChef) double as directories in their own right - if you like one, its tool list is a map of the space.

## 6. Communities

If you want to argue about tools, ask for help, or just watch the space move, these are the gathering spots. Reddit blocks fetching in our research setup, so these are listed by their known canonical URLs rather than confirmed by loading each page.

- **[r/webdev](https://www.reddit.com/r/webdev/)** - the general web-development subreddit, where tools like these get shared and picked apart.
- **[r/selfhosted](https://www.reddit.com/r/selfhosted/)** - the crowd running their own IT-Tools instance and similar self-hosted utilities.
- **[Hacker News](https://news.ycombinator.com/)** - where a lot of these tools get their first serious kicking-of-the-tires.

## How this list was compiled / Sources

Claude researched and verified this list on **2026-09-16**. Method, in short: every tool, spec, and data source was confirmed to actually exist by loading its real page, and each carries a canonical link (repo, official homepage, or spec) and an honest "when to pick it instead." **Star counts and adoption metrics are omitted** as unreliable. Anything I couldn't confirm was **dropped** rather than guessed at. Reddit blocks direct fetching in our research environment, so the communities were listed by their canonical URLs rather than by loading each subreddit.

**Pages consulted**

Actually loaded / fetched:
- https://github.com/DevToys-app/DevToys
- https://github.com/CorentinTh/it-tools · https://it-tools.tech
- https://github.com/gchq/CyberChef
- https://github.com/rtivital/omatsuri · https://omatsuri.app
- https://10015.io/
- https://transform.tools/
- https://goqr.me/
- https://www.base64encode.org/
- https://crontab.guru/
- https://coolors.co/
- https://color.adobe.com/create/color-wheel/
- https://imagecolorpicker.com/
- https://www.uuidgenerator.net/
- https://jodies.de/ipcalc
- https://data.bls.gov/cgi-bin/cpicalc.pl
- https://www.usinflationcalculator.com/
- https://fukuchi.org/works/qrencode/
- https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
- https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa
- https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper
- https://datatracker.ietf.org/doc/rfc9562/
- https://datatracker.ietf.org/doc/html/rfc4648
- https://github.com/ulid/spec
- https://github.com/ai/nanoid
- https://man7.org/linux/man-pages/man5/crontab.5.html
- https://www.w3.org/TR/css-color-4/
- https://github.com/t18n/awesome-dev-tools

Search-derived / not individually vetted (verify again if you quote them):
- the broader "awesome-devtools" cluster of repos on GitHub
- the subreddits above (Reddit fetches are blocked in our setup): r/webdev, r/selfhosted
- https://news.ycombinator.com/

Questions, comments, kudos, criticisms — all welcome, and if I've mischaracterized your tool, tell me and I'll fix it.
