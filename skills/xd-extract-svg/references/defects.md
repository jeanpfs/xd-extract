# Defect to cause

What you see, what causes it, and which validator finding catches it (if any).

| What you see | Cause | Validator finding |
|---|---|---|
| Empty or nearly empty file | Root `opacity: 0` honoured at the root, wrong node name, or only unsupported shapes | `render-empty`, `empty-svg` |
| Black blobs over the art | Stroke-only shapes missing `fill="none"` | `shape-missing-fill` |
| Background covers everything | Paint order reversed | none: visual check only |
| White band on one edge and art cut on the opposite edge | Frame taken from a drifted mask | `edge-band-drift` (warn: can be legitimate art) |
| Art visible but strokes missing | Line colour in `fill` not mapped to `stroke` | `line-without-stroke` |
| Uniformly clipped edges | Frame from a bounding box without stroke half-width, or an outer loose mask used as frame | `tight-frame` (warn, content-box frames only) |
| Part of the art missing, flat or hollow areas | Gradient or image fill not converted | `extraction:unsupported-fill:*` |
| Shadows, blur or text absent | Not implemented | `extraction:unsupported-style:filters`, `extraction:skipped-text` |
| Set of icons with different sizes | The frame rule misfired on one of them | `frame-mismatch` (with `--expect-same-frame`) |
| File does not open | Malformed XML, `NaN` in numbers, `<g>` inside a `clipPath` | `xml-invalid`, `render-failed`, `nan-number`, `group-in-clippath` |

Findings marked "visual check only" have no automated detector. Findings that are `warn` are suspicions, not verdicts: look at the preview before acting.
