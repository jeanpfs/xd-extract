---
name: xd-inventory
description: "List and search the nodes of an Adobe XD design (share link or .xd file) without extracting anything: artboards, top-level nodes, bounding boxes, dominant colours and warnings, plus an HTML contact sheet. Use when the user asks what is in an XD file or link, wants to find 'the orange illustration' or 'the cart icon', or needs to pick which node to export."
---

# XD inventory

Answer "what is in this design?" and "which node is the one I mean?" without extracting yet.

```bash
npx -y xd-extract inventory <source> --json
```

`<source>` is a share link (`https://xd.adobe.com/view/...`), a `.xd` file, or a `document.json` from `xd redact`. Needs Node >= 22.

## Useful forms

| Goal | Command |
|---|---|
| Everything, machine-readable | `xd inventory <source> --json` |
| Everything, readable | `xd inventory <source>` |
| One artboard | `xd inventory <source> --artboard "<name or id>"` |
| By name (substring, case-insensitive) | `xd inventory <source> --find cart` |
| By colour (closest dominant fill first) | `xd inventory <source> --find "#ff9c29"` |
| Let the user choose visually | `xd inventory <source> --preview /tmp/xd-preview.html`, then `open /tmp/xd-preview.html` |

## Reading the output

Each entry is a top-level node of an artboard: `artboard`, `name`, `kind` (`group` or `shape`), `bbox` (`x,y wxh` in artboard space, including half the stroke), `dominantColor` (the solid fill with the largest area), `shapes` (count) and `warnings` (codes such as `skipped-text`, `unsupported-fill:gradient`).

- A node with `unsupported-fill:*` will not extract faithfully: tell the user before they pick it.
- The `pasteboard` artboard holds loose objects outside any artboard; icons are sometimes there.
- Colour search matches the **dominant** fill only. A node whose largest fill is white will not match its accent colour. Search by name or use the preview instead.
- The preview shows the first 60 matches, each converted with the same rules as `extract`.

## Rules

- Never paste the whole inventory of a large design into the conversation; filter with `--find` or `--artboard` and show a short table.
- To export the chosen node, continue with the `xd-extract-svg` skill.
- If the link is a raster-only prototype the tool stops with `NoVectorPayload`: tell the user; there is nothing to list.
