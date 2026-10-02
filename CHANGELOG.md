# Changelog

## 0.1.0 (unreleased)

- `xd inventory`, `xd extract`, `xd validate`, `xd redact` (with `--exclude <node>` to drop top-level nodes before anonymising).
- Sources: Adobe XD share link (pure HTTP, optional `--browser` fallback) and `.xd` files.
- AGC to SVG: groups, rect (with corner radii), path (evenodd), compound, line, circle, ellipse, solid fills and strokes, mask groups to `clipPath`, frame by plate or content box, mask-drift snap.
- Reported, not converted: gradient and pattern fills, shadows and blur, text, inside-aligned strokes.
- Validation: static lint and resvg raster checks.
- Skills: `xd-extract-svg`, `xd-inventory`, `xd-validate-svg`.
- The CLI exits quietly when its output pipe is closed early (`xd inventory ... | head`).
