# Conversion rules and frame selection

Each rule below is implemented and tested in `packages/core`; this file explains **why** it exists. Each one fixed a visible defect.

| Rule | Why |
|---|---|
| Emit each node's own matrix as `transform="matrix(a b c d tx ty)"` on a nested `<g>` or shape | Nesting gives composition, rotation and inherited stroke scaling for free. Flattening matrices by hand is where rotated nodes break. |
| Stroke-only shapes get explicit `fill="none"` | SVG's default fill is black. A payload with 120 stroke-only outlines renders as black blobs without it. |
| A `line` node may carry its colour in `fill` | `<line fill="...">` paints nothing. Move fill to stroke and default the width to 1. |
| Copy `stroke-width`, `linecap`, `linejoin`, `miterlimit`, `dasharray` | Missing joins and caps show up as spiky or clipped corners at small sizes. |
| Convert the colour model explicitly, keeping alpha | Alpha lives beside the colour (`color.alpha`), not on the node; dropping it silently loses translucency. |
| Rect corner radii come from `r`, an array of 4 | One value for equal corners (`rx`), a path for unequal ones. Reading `rx` instead loses every rounded corner. |
| `path.winding: "evenodd"` becomes `fill-rule="evenodd"` | Holes (letter counters, rings) fill solid otherwise. |
| `compound` shapes use their resolved `path` | The boolean-operation result is precomputed; the children are the operands. |
| Mask groups become `<clipPath>` in `<defs>`, referenced with `clip-path` | The flag is `meta.ux.isMaskGroup` with geometry in `meta.ux.clipPathResources`, **not** in a global table (that table can be empty while masks are in use). |
| `clipPath` children are shapes only | No `<g>` inside. Fold any correction transform into each shape's own matrix. |
| `opacity: 0` and `visible: false`: drop inside, **ignore on the exported root** | Carousel and variant slides are toggled by opacity 0 on the top-level group. Honouring it at the root produces an empty file. |
| Document order is paint order | Verify: the first child should be the background. If it ends up on top, the format is back-to-front and must be reversed. |
| Skip text, report it | Text needs the font; an illustration export with live text is a liability. |
| Stroke `align: inside` is rendered centred, and reported | SVG has no inside-stroke attribute; faking it needs clip paths and changes the geometry. |

## Choosing the frame (`viewBox`)

The most error-prone step. Do not trust a mask as the frame, and do not trust the union of all geometry (art usually bleeds outside the frame on purpose).

1. **Plate.** The largest shape with its own solid (or unsupported) fill is the background card of the asset. If it covers at least 50% of the painted content box, it is the frame. Rule reported as `plate`.
2. **Content.** Otherwise the frame is the tight bounding box of all painted geometry, including half the stroke width on each side. Rule reported as `content`. A plate covering under 50% is just a glyph, not a background.

### Mask drift

If a mask's silhouette matches the frame **size** (within 1.5 px) but its origin differs, the source file has the mask nudged off the art. The converter snaps the mask onto the frame and records `{clip, mask, dx, dy}` in the report; `dx` and `dy` are world-space, the snap itself is applied in the mask's local space so it stays correct under scaled groups.

That single defect is what a user sees as "white band at the top and cut off at the bottom": the frame was taken from a mask sitting 29 px above the background card, so 29 px of empty space entered at the top and 29 px of card fell outside at the bottom. Two same-sized silhouettes with different origins is the signature.

## Comparing against an existing asset

If the project already ships a raster of the same art, compare, but **do not "fix" the vector to match it**. Verify the difference is real: the shared design file is often an older revision. Check the source node for the feature you think is missing (is there a stroke on that node, or only a fill?) and report "the source has no stroke on this node; the PNG in the repo is a different revision". Never invent strokes, shadows or geometry the payload does not contain. State framing differences too: exported rasters usually carry extra margin the vector frame does not.
