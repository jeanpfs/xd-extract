# Changelog

## 0.1.1 (2026-10-05)

- Fix: a top-level node that is a single shape (rect, path, ellipse...) was drawn outside its own `viewBox` whenever the shape carried a translate, which gave an empty or half-empty SVG. The frame is measured in the root's own coordinates, so the root's transform is now ignored for shapes too, as it already was for groups. Found on a real share link (6 of 13 single-shape roots); `xd validate` reported it as `render-empty` or `edge-band-drift`.
- Verified on a real share link that carries vector data (6 artboards, 120 top-level nodes, XD 2.33, AGC 1.5.0): the page, the manifest and every AGC were fetched on the first try. The manifest URL was in the static HTML, and the AGC revision is the component's own `version`.

## 0.1.0 (2026-10-05)

- `xd inventory`, `xd extract`, `xd validate`, `xd redact` (with `--exclude <node>` to drop top-level nodes before anonymising).
- Sources: Adobe XD share link (pure HTTP, optional `--browser` fallback) and `.xd` files.
- AGC to SVG: groups, rect (with corner radii), path (evenodd), compound, line, circle, ellipse, solid fills and strokes, mask groups to `clipPath`, frame by plate or content box, mask-drift snap.
- Reported, not converted: gradient and pattern fills, shadows and blur, text, inside-aligned strokes.
- Validation: static lint and resvg raster checks.
- Skills: `xd-extract-svg`, `xd-inventory`, `xd-validate-svg`.
- The CLI exits quietly when its output pipe is closed early (`xd inventory ... | head`).
