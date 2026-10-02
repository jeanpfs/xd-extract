---
name: xd-validate-svg
description: "Validate SVG files extracted from Adobe XD: XML and structure checks plus a resvg raster check that catches empty renders, black blobs, missing strokes, mask-drift bands and mismatched frames across a set. Use after extracting SVGs from XD, or when an exported SVG looks wrong (empty, black, cut off, with a white band)."
---

# Validate extracted SVG

```bash
npx -y xd-extract validate out/*.svg [--expect-same-frame] [--json]
```

Exit code `0`: no errors (warnings may remain). Exit code `1`: at least one `error`. Needs Node >= 22.

`xd extract` writes a sidecar `<file>.svg.report.json`; `validate` reads it automatically, so extraction warnings and the frame rule feed the checks. Keep the sidecar next to the SVG.

## Findings

| Code | Severity | Meaning |
|---|---|---|
| `xml-invalid`, `not-svg`, `render-failed` | error | The file is not a renderable SVG |
| `no-viewbox`, `empty-svg`, `render-empty` | error | No frame, no shapes, or nothing painted |
| `shape-missing-fill` | error | A shape has no explicit fill and renders black |
| `line-without-stroke` | error | A `<line>` paints nothing |
| `group-in-clippath` | error | `<g>` inside a `clipPath` (shapes only are allowed) |
| `nan-number` | error | `NaN` or `Infinity` in an attribute |
| `frame-mismatch` | error | With `--expect-same-frame`: a size differs by more than 1.5 px |
| `extraction:unsupported-fill:*` (also `-stroke`, `-shape`, `-node`) | error | Art is missing from the SVG |
| `edge-band-drift` | warn | One edge band is empty while the opposite is painted: possible mask drift or off-centre frame |
| `tight-frame` | warn | A content-box frame touches all four edges: strokes may be clipped |
| `extraction:<other>` | warn | Text skipped, shadows or blur not converted, inside-stroke rendered centred |

`warn` findings are suspicions: they can be legitimate art. Look before acting.

## Workflow

1. Run `validate`. Fix errors first; each has one cause (see the table above and `defects.md` in the `xd-extract-svg` skill).
2. For `edge-band-drift`, check the report's `snaps` (a mask snap was applied if the file has one) and look at the preview: a white band on one edge with art cut on the opposite edge is the mask-drift signature.
3. **Always look at the pixels** before calling it done: `xd inventory <source> --preview ...` or open the SVG in the user's browser. Validation removes obvious failures; it does not prove the art is right.

## Rules

- Do not "fix" a vector to match an existing PNG. Verify whether the source node really has the feature; the PNG may be an older revision.
- Never silence an `extraction:unsupported-*` error by editing the SVG by hand; report the missing art to the user.
