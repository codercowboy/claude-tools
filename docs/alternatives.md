# Alternatives & the wider world

## 1. The closest analogs — other developer/designer tool collections

- **[DevToys](https://github.com/DevToys-app/DevToys)** - a native desktop app billed as "A Swiss Army knife for developers," with dozens of encoders, formatters, and converters, on Windows, macOS, and Linux.
  **Pick it instead when:** you want one installed desktop app with a big tool drawer and don't mind that it isn't a browser page.
- **[IT-Tools](https://github.com/CorentinTh/it-tools)** ([it-tools.tech](https://it-tools.tech)) - "Collection of handy online tools for developers, with great UX." A polished web app you can use hosted or self-host via Docker.
  **Pick it instead when:** you want a large suite covering far more than these twenty-two and you're happy running a server or trusting the hosted instance.
- **[CyberChef](https://github.com/gchq/CyberChef)** - GCHQ's "Cyber Swiss Army Knife," a client-side web app for encryption, encoding, compression, and data analysis where you chain operations into a "recipe."
  **Pick it instead when:** you're wrangling data through multiple steps at once (decode, then decompress, then extract) and want to pipe operations together.
- **[Omatsuri](https://github.com/rtivital/omatsuri)** ([omatsuri.app](https://omatsuri.app)) - "PWA with 12 open source frontend focused tools," installable and browser-based.
  **Pick it instead when:** you want an installable progressive web app of frontend helpers rather than loose HTML files.
- **[10015 Tools](https://10015.io/)** - a free all-in-one online toolbox spanning text, image, CSS, color, and coding utilities, with browser extensions.
  **Pick it instead when:** you want one hosted site for a huge range of tools, including image and CSS generators these twenty-two don't touch.
- **[transform.tools](https://transform.tools/)** - a web collection of converters (JSON to TypeScript, SVG to JSX, HTML to Pug, and many more).
  **Pick it instead when:** your job is converting between code and data formats, which is exactly its lane and not really mine.


## 2. The broader ecosystem — single-purpose sites each tool replaces

- **QR generator → [goQR.me](https://goqr.me/)** - a free online QR generator with vCard, wifi, and other data types, exporting PNG/JPEG/SVG/EPS.
- **base64-tool → [base64encode.org](https://www.base64encode.org/)** - an online box that encodes and decodes Base64, with charset, URL-safe, and line-wrap options.
- **barcode-generator → [TEC-IT Online Barcode Generator](https://barcode.tec-it.com/en)** - a free web generator that demonstrates the vendor's TBarCode SDK. It covers 60+ formats, including 2D codes (QR, Data Matrix, PDF417, Aztec), GS1, and postal codes, and it computes check digits for formats such as EAN-13 and UPC-A. Its page says barcodes are generated server-side, that the free tier exports GIF, JPG, and PNG with SVG for subscribers, and that unregistered use is limited to 10 barcodes per batch. **Pick it instead when** you need a 2D code or a format outside the four here. barcode-generator covers only Code 128 (with automatic code sets), EAN-13, UPC-A, and Code 39, but it encodes in the browser, so the text you enter is never sent anywhere, and it exports SVG and PNG with no subscription, with a contrast warning for low or inverted colors.
- **batch-watermark → [iLoveIMG Watermark](https://www.iloveimg.com/watermark-image)** - a free online tool to "Watermark JPG, PNG or GIF images" that stamps image or text over multiple pictures at once, with font choice, size, color, shadow, and opacity controls. Its page shows a "Stamping images..." progress step and does not say whether the images are uploaded or processed locally, and it does not mention tiling or rotation. **Pick it instead when** you want a polished hosted editor with the rest of the iLoveIMG toolbox beside it. batch-watermark runs entirely in the browser, so the images stay on your machine. It sizes the mark, margin, and spacing as a percentage of each image's short side so one setting fits photos of any resolution, adds a nine-point anchor grid with tiling and rotation, exports PNG, JPEG, or WebP with a quality slider, and downloads the batch as one zip.
- **hasher → [Online Tools (emn178)](https://emn178.github.io/online-tools/)** - computes MD5, the SHA family, CRC-32, and keyed HMAC from text or a file, with a pile of other encoders and ciphers alongside.
- **hat-picker → [Wheel of Names](https://wheelofnames.com/)** - a free spinning-wheel picker for names, raffles, and decisions, with weighted entries, custom colors and sounds, and shareable wheels.
- **diff-viewer → [Diffchecker](https://www.diffchecker.com/)** - a free online text and code comparer with side-by-side and unified views and live editing, plus a paid Pro tier and an offline desktop app that also compares documents, images, and folders. This one is a single page with no account and no upload.
- **pretty-printer → [Prettier](https://prettier.io/)** - "An opinionated code formatter" covering JavaScript, TypeScript, JSON, CSS, HTML, YAML, Markdown, and more, with a "Try It Online" playground in the browser. It is something you install into a project and run on save, where this is a page you paste into.
- **format-converter → [ConvertCSV.com](https://www.convertcsv.com/)** - a free browser-based converter between CSV, JSON, XML, YAML, TSV, SQL, and more, which says its tools run client-side so your data never leaves your computer. It is deeper on tabular data, with a validator and a template engine, where this one adds `.properties` and auto-detects the source format.
- **markdown-previewer → [Dillinger](https://dillinger.io/)** - a free browser Markdown editor with a live synchronized preview, export to Markdown, HTML, or PDF, and sync to GitHub, Dropbox, Google Drive, and others. It works offline once loaded and needs no account. It is built on the Monaco editor with Vim and Emacs keybindings, where this one is a plain textarea with a preview and no cloud sync.
- **ascii-art → [ASCII Art Creator (ascii-art-generator.org)](https://www.ascii-art-generator.org/)** - a free online converter from JPG, PNG, BMP, and GIF images to monochrome or color ASCII art, plus text banners. It exports more formats than this does, including HTML, IRC, SVG, and Targa, but caps uploads at 5 MB and 4000x4000 pixels. Its page does not say where the image is processed, where this one runs entirely in the browser and adds half-block and Braille modes.
- **social-card-maker → [Vercel OG Image Playground](https://og-playground.vercel.app/)** - the playground for [Satori](https://github.com/vercel/satori), Vercel's open-source library that renders HTML and JSX to SVG for generating social and Open Graph images. It is a developer tool for building dynamic images in code, where this is a form: set the title, background, and logo, export PNG, JPEG, or WebP, and copy the matching meta tags. Its page shows little beyond navigation links, so its export options and where it renders are not confirmed here.
- **dither-studio → [Dither it!](https://ditherit.com/)** - a free online image dithering tool with Floyd-Steinberg, Atkinson, and Bayer ordered dithering, palette presets, color-count and selection options, custom palette import and export, animated GIF output, and a pixel-scale setting. **Pick it instead when** you want animated-GIF output or its palette presets. dither-studio covers the same core dithering algorithms and adds an indexed PNG-8 export and a before/after wipe; it also runs entirely in the browser, which Dither it!'s page doesn't state either way.
- **http-headers → [MDN HTTP Observatory](https://developer.mozilla.org/en-US/observatory)** - Mozilla's scanner for a site's HTTP headers and security configuration. You enter a public hostname, it fetches the site itself, and it returns a grade and score. Its FAQ says it is built for websites rather than API endpoints, and that anyone can scan any domain and the scan history is public. **Pick it instead when** you want a live scan of a deployed public site with a grade. http-headers works on pasted text instead, so it handles headers from a private, local, or not-yet-deployed server and sends nothing anywhere. It explains each header, shows pass/warn/fail counts with no letter grade, and builds a header set with nginx, Apache, and Express snippets.
- **invisible-chars → [Unicode Non-Printable Character Detection Tool (SoSci Survey)](https://www.soscisurvey.de/tools/view-chars.php)** - a free page that reveals hidden characters in pasted text, such as zero-width spaces and bidirectional markers, and shows each one's hexadecimal code, Unicode designation, and byte representation along with total character and byte counts. Its page says processing happens in the browser and that it stores nothing, and it links the source on GitHub. **Pick it instead when** you only need a quick readout of what is hidden in a string. Its page describes detection and display and mentions no cleaning. invisible-chars also runs in the browser and adds a category-colored reveal, a per-character inspector with UTF-16 units and line and column, decoding of tag characters, an opt-in flag for look-alike letters and mixed-script words, and a clean step that normalizes, converts spaces, and strips chosen categories before copying the result.
- **cron-builder → [crontab.guru](https://crontab.guru/)** - "the quick and simple editor for cron schedule expressions," the reference nearly everyone links.
- **color-designer → [Coolors](https://coolors.co/)** and **[Adobe Color](https://color.adobe.com/create/color-wheel/)** - Coolors is a fast palette generator with contrast checks and image extraction; Adobe Color builds harmonies off a color wheel.
- **color-picker → [Image Color Picker](https://imagecolorpicker.com/)** - upload, paste, or link an image and read off HEX/RGB/HSL/HSV.g local files.
- **uuid-generator → [uuidgenerator.net](https://www.uuidgenerator.net/)** - generates UUID v1/v4/v7 (and nil) online, defaulting to secure v4.
- **network-toolkit → [ipcalc](https://jodies.de/ipcalc)** (Krischan Jodies) - the classic subnet calculator: netmask, wildcard, network, broadcast, host range, with a colored bit breakdown.
- **inflation-calculator → [BLS CPI Inflation Calculator](https://data.bls.gov/cgi-bin/cpicalc.pl)** and **[US Inflation Calculator](https://www.usinflationcalculator.com/)** - the BLS calculator is the authoritative source itself; the other site adds monthly granularity and history commentary.

## 3. Adjacent — command line and native tools

- **[libqrencode / qrencode](https://fukuchi.org/works/qrencode/)** (Kentaro Fukuchi) - a fast C library and `qrencode` command-line tool for generating QR codes.
- **`uuidgen` and `base64`** - standard commands on macOS and most Linux boxes (`uuidgen` for a UUID, `base64` for encode/decode).
- **`md5` / `shasum` / `sha256sum`** - the stock command-line hashers that ship on macOS and most Linux boxes (`md5` or `md5sum` for MD5, `shasum -a 256` or `sha256sum` for SHA-256), handy for checksumming a file without a page open.

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

Claude researched and verified this list on **2026-09-16** (the `hasher` entry was added and verified on **2026-10-04**, the `hat-picker` entry on **2026-10-05**, the `pretty-printer` entry on **2026-10-05**, the `diff-viewer` entry on **2026-10-05**, the `format-converter` entry on **2026-10-05**, the `markdown-previewer` entry on **2026-10-05**, the `ascii-art` entry on **2026-10-05**, the `social-card-maker` entry on **2026-10-05**, the `dither-studio` entry on **2026-10-05**, the `http-headers` entry on **2026-10-05**, the `invisible-chars` entry on **2026-10-05**, the `barcode-generator` entry on **2026-10-05**, and the `batch-watermark` entry on **2026-10-05**). Method, in short: every tool, spec, and data source was confirmed to actually exist by loading its real page, and each carries a canonical link (repo, official homepage, or spec) and an honest "when to pick it instead." **Star counts and adoption metrics are omitted** as unreliable. Anything I couldn't confirm was **dropped** rather than guessed at. Reddit blocks direct fetching in our research environment, so the communities were listed by their canonical URLs rather than by loading each subreddit.

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
- https://emn178.github.io/online-tools/
- https://barcode.tec-it.com/en
- https://www.iloveimg.com/watermark-image
- https://www.watermark.ws/ (consulted, not used as the analog)
- https://dillinger.io/
- https://www.ascii-art-generator.org/
- https://og-playground.vercel.app/
- https://ditherit.com/
- https://developer.mozilla.org/en-US/observatory · https://developer.mozilla.org/en-US/observatory/docs/faq
- https://github.com/vercel/satori
- https://wheelofnames.com/
- https://prettier.io/
- https://www.diffchecker.com/
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
