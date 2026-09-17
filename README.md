# claude-tools

A collection of small, single-file web tools that run entirely in your browser.

![](docs/images/tools-preview.gif)

Try the tools yourself here: [https://www.codercowboy.com/demo/claude-tools/](https://www.codercowboy.com/demo/claude-tools/)

## Who it's for

Developers and designers who want quick, offline, no-signup utilities that run in the browser and never phone home.

If you'd rather have these as a CLI, a browser extension, or a polished hosted app with accounts and history, this isn't that. The [Alternatives](docs/alternatives.md) doc points you at tools that might fit better.

## The tools

| Tool | What it does |
| --- | --- |
| [base64-tool](src/tools/base64-tool/) | Base64 / data-URI encoder and decoder. Text or a file in; Base64, Base64URL, a `data:` URI, or a JS snippet out, and decode back. |
| [color-converter](src/tools/color-converter/) | Batch-convert a pile of mixed `rgba()`/hex colors into one format. Paste them, see a swatch of each, copy them out. |
| [color-designer](src/tools/color-designer/) | Color-scheme generator from HSL harmonies, optionally flavored by a mood. Roll five schemes, expand into a live demo, copy them out. |
| [color-picker](src/tools/color-picker/) | Sample exact pixel colors out of an image. Load it, pan and zoom, eyedrop the pixel as `rgba()` and hex. |
| [cron-builder](src/tools/cron-builder/) | Build, parse, and understand a cron expression. Synced field pickers and raw editor, a plain-English explanation, and the next 5 fire times. |
| [inflation-calculator](src/tools/inflation-calculator/) | What a US dollar amount from one year is worth in another, using bundled [BLS](https://www.bls.gov/cpi/) CPI-U annual data. |
| [network-toolkit](src/tools/network-toolkit/) | Transfer-time math, CIDR/subnet math, IPv4/IPv6 conversion, and netmask ⇄ prefix. No DNS, no network calls. |
| [qr-generator](src/tools/qr-generator/) | Generate a QR code from text or a URL with a QR encoder hand-rolled in vanilla JS. Download it as PNG or SVG. |
| [uuid-generator](src/tools/uuid-generator/) | Generate and inspect identifiers - UUID v4/v7, ULID, nanoid, and random tokens - bulk generate and copy, plus an inspector. |

The whole set also has a little landing gallery at [`src/tools/index.html`](src/tools/index.html).

## 60-second quickstart

Simply download this project's source code from github, and open [`src/tools/index.html`](src/tools/index.html) in your browser by double clicking on it in your file explorer (or `finder`), or drag it onto your browser window. If you have Node installed, `npx ct run` opens that gallery for you.

## Development

Want to rebuild the tools, run the tests, or use `claude-tools` as a baseline for your own project? You'll need [Node.js](https://nodejs.org) 20+. Everything runs through `ct`, the repo's small command runner, driven straight from a clone with `npx`.

```bash
# Clone and install (this pulls each tool's dev/test deps into its own node_modules)
git clone https://github.com/codercowboy/claude-tools.git
cd claude-tools
npm install

# Then drive it with ct:
npx ct build      # assemble every tool's index.html from its source/ (the committed ones are already built)
npx ct test       # run the whole test suite
npx ct serve      # serve the gallery at http://localhost:8080
npx ct run        # open the built gallery in your default browser
npx ct install    # (re)install every tool's dependencies
```

`npx ct` with no verb prints the menu. You only need `npx ct build` after editing a tool's `source/` - the committed `index.html` files are already built.

## Host it yourself

The built tools are static `index.html` files with everything inlined, so once you're happy with one you can drop it on any static host - GitHub Pages, an S3 bucket, Netlify, a folder on your own web server - and it'll run there the same way it runs from `file://`. Nothing to configure, no backend to stand up.

## Why it works

Each tool is authored in pieces under a `source/` folder and assembled by a small Node build (`scripts/build-tool.mjs`) into the single committed `index.html`. The result inlines all its own CSS and JS, so there's nothing to fetch at runtime and nothing to install to use it. There are zero packaged runtime dependencies - the only dev dependency is the test harness, and it never ships in the tool.

The full write-up - the build pipeline, the per-tool packages, the shared includes, the two-layer testing, and the dependency breakdown and toolkit - lives in [Technical details](docs/technical.md).

## Alternatives

These aren't the only offline browser tools out there, and for some jobs a CLI or a purpose-built app beats a single HTML file. If one of these isn't your fit, the [Alternatives](docs/alternatives.md) doc names the closest analogs, the online tools they replace, and where to look when you want more.

## Credit

**Code & docs:** [Claude](https://www.anthropic.com/claude) (Anthropic). Full transparency, Claude wrote all of it.

**Concept & direction, the ideas guy:** [Jason Baker](https://github.com/codercowboy).

## License

[MIT](LICENSE) - it's a great license because it gets out of your way: use it however you want, commercial or not, just keep the notice. **My code should work, but I'm not liable if it goes sideways on you.**

Questions, comments, kudos, criticisms - all welcome.
— Coder Cowboy
