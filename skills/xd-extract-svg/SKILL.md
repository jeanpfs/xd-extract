---
name: xd-extract-svg
description: "Extract SVG vector art (icons, illustrations, logos, whole screens) from an Adobe XD share link (xd.adobe.com/view/...) or a .xd file, then validate it. Use when the user sends an XD link or file and wants SVG, says the download is disabled or the page is a canvas, or a screenshot is too low quality. Handles inventory, node selection by name or colour, frame (viewBox) selection and validation. Not for Figma or other formats."
---

# XD to SVG

Pull **vector** art out of an Adobe XD design. The art is never in the viewer's canvas: it arrives as a scene-graph JSON (AGC) that the viewer only draws. The `xd` CLI downloads that JSON (or reads it from a `.xd` file), converts the node tree to SVG and validates the result.

Output is **SVG only**. Gradients, shadows, blur, text and embedded images are not converted yet; the tool reports each one as a warning instead of dropping it silently.

## Run the CLI

```bash
npx -y xd-extract <command>      # or `xd <command>` when installed globally
```

Needs Node >= 22. Commands: `inventory`, `extract`, `validate`, `redact`. `xd --help` lists every flag.

## Inputs to ask for

Ask for both in **one round**:

1. **The source**: a share link (`https://xd.adobe.com/view/...`) or a path to a `.xd` file.
2. **What to extract** and **how to name each output file**. Accept loose descriptions ("the orange illustration", "the cart icon"); resolve them to node names during inventory and confirm the mapping in the report.

## Procedure

1. **Inventory.** `xd inventory <source> --json` lists every top-level node per artboard with its bbox, dominant fill colour, shape count and warning codes. Never print the whole AGC into the context; the inventory is the projection.
   - Loose description by colour: `xd inventory <source> --find "#ff9c29"` ranks nodes by dominant fill.
   - Several candidates or an ambiguous request: `xd inventory <source> --preview /tmp/xd-preview.html`, open it for the user (`open /tmp/xd-preview.html` on macOS) and let them pick. Cheaper than guessing.
2. **Extract.** One node: `xd extract <source> --node "<name>" -o out/<file>.svg`. Several: write a `map.json` (`[{"file":"cart.svg","node":"cart"}]`) and run `xd extract <source> --map map.json -d out`. If the same node name exists on several artboards, add `--artboard "<name>"`.
3. **Validate.** `xd validate out/*.svg` (add `--expect-same-frame` when the set should share one frame). Exit code 1 means at least one `error`. Read `references/defects.md` for what each finding means.
4. **Look at the pixels.** Validation does not prove correctness. Open the preview in the user's own browser and check every export; see `references/defects.md` for what a defect looks like. Never skip this.
5. **Report**, for every file: source node, artboard, output path, `viewBox`, frame rule (`plate` or `content`), every mask snap, and every warning. Name the exact source so the extraction can be re-run after a design update.

## When it fails

| Error | Meaning | Do |
|---|---|---|
| `NoVectorPayload` | The link is a raster-only prototype: no AGC exists to convert. | Tell the user and stop. Do **not** screenshot, trace or redraw. |
| `PrivateLink` | The page exposes no manifest (private, password, or an unseen layout). | Retry once with `--browser` (needs `agent-browser`). If it still fails, ask for a public link or the `.xd` file. |
| `TokenExpired` | The manifest or an AGC request was refused. | Ask for a fresh link; retry with `--browser`. |
| `LinkNotFound` | The link answers 404/410. | Ask for the right link. |
| `TargetNotFound` / `AmbiguousTarget` | The node name does not match, or matches several nodes. | The error lists the available names or candidates: pick one, add `--artboard`. |
| `NoPaintedGeometry` | The node has no painted shapes (text only, or everything hidden). | Pick another node. |

## Warnings

`unsupported-fill:gradient|pattern`, `unsupported-stroke:*`, `unsupported-shape:*`, `unsupported-node:*` mean art is **missing** from the SVG and validation fails on them. Report it to the user; do not hand-draw the missing part. `skipped-text`, `unsupported-style:filters` (shadows, blur), `unsupported-style:clipPath` and `stroke-align-ignored:*` are visible differences from the design; list them in the report.

## References

- `references/rules.md` : why each conversion rule exists, and how the frame (`viewBox`) is chosen.
- `references/defects.md` : defect to cause table, mapped to validator codes.
- `references/canvas-viewers.md` : the generic method for design viewers that render into a `<canvas>`, for formats the CLI does not cover.

## Hard rules

- **Never** deliver a canvas screenshot, a traced bitmap or a hand-drawn approximation as if it were the extracted vector. If the vector payload is unreachable, say so and stop.
- **Never** skip the visual check. XML-valid and correct are unrelated properties.
- Write exports to a dedicated directory (for example `xd-export/`). Do not overwrite project assets unless asked; replacing a raster with an SVG usually also needs code changes (for example React Native `<Image source={require(...)}>` to an SVG component).
- Do not commit exports or preview pages without being asked.
- `--record` and `redact` operate on the user's design. Recorded files contain the full design JSON; never commit them. `redact` keeps geometry, so the artwork itself must be cleared for publication.
