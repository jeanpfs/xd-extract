# xd-extract

[![ci](https://github.com/jeanpfs/xd-extract/actions/workflows/ci.yml/badge.svg)](https://github.com/jeanpfs/xd-extract/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/xd-extract)](https://www.npmjs.com/package/xd-extract)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/jeanpfs/xd-extract/blob/main/LICENSE)

Extract **SVG** vector art from Adobe XD designs, from a public share link (`xd.adobe.com/view/...`) or a local `.xd` file. List the nodes, pick one, export it, and check the result.

XD share links draw into a `<canvas>`, so right-click and download give you nothing usable, and a screenshot is raster. The vector data travels as a scene-graph JSON (AGC) that the viewer only paints. `xd-extract` reads that JSON directly and converts the node tree to SVG.

## Status: 0.1.1, early

- **Verified:** `.xd` files (one public sample), and a **real share link that carries vector data** (an XD 2.33 design with 6 artboards and 120 top-level nodes): the page, the manifest and every artboard were fetched on the first try, all 117 nodes with geometry converted, and the 26 exports that use masks (`clipPath`) validate. Only one such link has been tested.
- **Not verified on real data:** the mask-drift correction (it never triggered; it has synthetic tests only), `/spec/` links, password-protected links, and AGC versions other than `1.5.0`. The only *public* link we could find (an Adobe sample) is raster-only. If a link fails, `xd inventory <link> --record dir` captures the exchange (see [Privacy](#privacy)) and an issue with the error code helps a lot.
- **SVG only.** Gradients, shadows, blur, text, embedded images and inside-aligned strokes are **not converted**. Each is reported as a warning; nothing is dropped silently. See [What is converted](#what-is-converted).
- Developed and tested on macOS; CI runs on Linux. Windows is untested.

## Quick start

Needs Node.js 22 or newer.

```bash
npx -y xd-extract inventory design.xd            # what is in the design?
npx -y xd-extract extract design.xd --node "Sign Up form" -o out/sign-up.svg
npx -y xd-extract validate out/sign-up.svg
```

A real session on a public sample (`single.xd` from [xd2svg](https://github.com/L2jLiga/xd2svg), MIT):

```text
$ xd inventory design.xd
artboard | node | kind | bbox | colour | shapes | warnings
Artboard – 1 | Group 26 | group | 0,1080 1920x4205 | rgb(255,255,255) | 52 | stroke-align-ignored:inside
Artboard – 1 | Footer | group | 0,5342 1920x821 | rgb(61,13,13) | 6 | stroke-align-ignored:inside,unsupported-fill:pattern,skipped-text
Artboard – 1 | Market watch | group | 796.3,4890.901 327.2x255.216 | rgb(255,255,255) | 4 | skipped-text,stroke-align-ignored:inside
…

$ xd extract design.xd --node "Sign Up form" -o out/sign-up.svg
out/sign-up.svg  viewBox="1174 417 371.8 198" rule=content snaps=0 clips=0 warnings=2
  warning skipped-text (5x): text nodes are skipped (text is not implemented)
  warning stroke-align-ignored:inside (3x): stroke align "inside" is rendered centred

$ xd validate out/sign-up.svg
out/sign-up.svg: warn extraction:skipped-text: text nodes are skipped (text is not implemented) (5x, e.g. "Read our Regulatory Compilances")
out/sign-up.svg: warn extraction:stroke-align-ignored:inside: stroke align "inside" is rendered centred (3x, e.g. "Rectangle 17")
out/sign-up.svg: warn tight-frame: content reaches all four edges of a content-box frame: strokes may be clipped
1 file(s): 0 error(s), 3 warning(s)
```

`validate` exits `0`: warnings are hints, not verdicts. Here `tight-frame` is a false alarm (the node really is a stack of full-width rectangles); the two others are real differences from the design. Open the SVG and **look at it**: validation removes obvious failures, it does not prove the art is right.

For a share link, pass the URL instead of the file: `xd inventory https://xd.adobe.com/view/<id>/`.

## Commands

| Command | Does |
|---|---|
| `xd inventory <source> [--artboard k] [--find <name\|colour>] [--json] [--preview file.html]` | Lists artboards and top-level nodes with bounding box, dominant colour, shape count and warnings. `--find "#ff9c29"` ranks nodes by dominant fill; `--preview` writes an HTML contact sheet. |
| `xd extract <source> --node <name\|id:ID> [--artboard k] -o file.svg` | Exports one node. Also writes `file.svg.report.json`. |
| `xd extract <source> --map map.json [-d dir]` | Exports several nodes from `[{"file": "cart.svg", "node": "cart"}]`. Nothing is written if one job fails. |
| `xd validate <svg...> [--expect-same-frame] [--json]` | Static and raster checks. Exit `1` on any error. |
| `xd redact <source> -o dir [--exclude <node>]...` | Writes an anonymised `document.json` (see [Privacy](#privacy)). |

`<source>` is a share link, a `.xd` file, or a `document.json` from `xd redact`. Exit codes: `0` ok, `1` validation errors, `2` usage, `10-14` link errors, `20-21` file errors, `30` browser, `40-42` target errors, `70` unexpected.

## What is converted

| Converted | Reported as a warning, not converted |
|---|---|
| Groups and nested transforms, rectangles (with corner radii), paths (including even-odd), compound shapes, lines, circles, ellipses | Gradient and image (pattern) fills, shadows and blur, text |
| Solid fills and strokes with alpha, caps, joins, miter limits, dashes | Inside- or outside-aligned strokes (drawn centred) |
| Masks as `clipPath`, including masks nudged off the art by a few pixels | `style.clipPath` (repeat-grid masks) |
| The frame (`viewBox`): the background plate when there is one, else the tight content box | |

Warnings that mean **art is missing** (`unsupported-fill:*`, `unsupported-stroke:*`, `unsupported-shape:*`, `unsupported-node:*`) make `validate` fail. The others (`skipped-text`, `unsupported-style:*`, `stroke-align-ignored:*`) are listed so you know what differs from the design.

Only AGC `1.x` has been seen (files from 2017-2019). Newer versions produce an `agc-version-untested` warning.

## Share links

The page's static HTML contains the URL of the design manifest, so a link needs **no browser**. If a link does not expose it (private, password protected, or a layout this tool has not seen), retry with `--browser`, which uses [agent-browser](https://github.com/vercel-labs/agent-browser) to find the manifest and then downloads it the same way.

A **raster-only** prototype (no vector payload, only rendered images) stops with `NoVectorPayload`: there is nothing to extract, and the tool will not substitute a screenshot or a traced bitmap.

## Validation

- **Static:** XML parses, `viewBox` present, shapes present, no shape without explicit fill (it would render black), no `<g>` inside a `clipPath`, every `<line>` has a stroke, no `NaN`, plus every extraction warning.
- **Raster** (resvg): empty render, the edge-band signature of a drifted mask, tight frames, and the frame size across a set (`--expect-same-frame`).

The raster thresholds are initial values and have not been tuned on many designs.

## Agent skills

Three skills for AI coding agents (the [agentskills.io](https://agentskills.io) format) drive the CLI:

```bash
npx skills add jeanpfs/xd-extract --list
npx skills add jeanpfs/xd-extract --skill xd-extract-svg -g
```

Claude Code plugin: `/plugin marketplace add jeanpfs/xd-extract`, then `/plugin install xd-extract@xd-extract`.

| Skill | Use |
|---|---|
| `xd-extract-svg` | The whole flow: inventory, pick, extract, validate, preview |
| `xd-inventory` | List and search nodes; pick visually |
| `xd-validate-svg` | Validate exports and interpret findings |

## Privacy

- The CLI only fetches the link you give it and the CDN URLs that page names. With `--browser` the page is opened in a real browser, so the page's own scripts (including Adobe's analytics) run as they would for any visitor.
- `--record <dir>` saves every HTTP response, **including the full design JSON**, with access tokens stripped. Do not commit a recording of a private design.
- `xd redact` removes names, ids, text and fonts so a design can become a public test fixture. It **keeps the geometry**: the artwork itself must be yours to publish. Use `--exclude "<node name>"` to drop top-level nodes (a client logo, say) before anonymising; a name that matches nothing is an error.
- Designs often contain other companies' logos. The MIT license of this tool and of the sample files does not cover third-party marks.

## Development

```bash
pnpm install
pnpm build                     # also needed once for the binary test (it is skipped without a build)
pnpm test                      # unit, public fixture, recorded
pnpm lint && pnpm typecheck && pnpm leakcheck && pnpm skills:check
```

Tests come in tiers: a synthetic fixture per rule, one public fixture (anonymised `single.xd`, see [fixtures/public/NOTICE](https://github.com/jeanpfs/xd-extract/blob/main/fixtures/public/NOTICE)), recorded HTTP (tokens stripped), a live check against the Adobe sample (`pnpm test:live`, nightly), and a private tier driven by `XD_PRIVATE_FIXTURE_DIR` that never leaves your machine. Contributor and agent notes are in [AGENTS.md](https://github.com/jeanpfs/xd-extract/blob/main/AGENTS.md).

## License

MIT. Third-party sample material: see [NOTICE](https://github.com/jeanpfs/xd-extract/blob/main/NOTICE).
