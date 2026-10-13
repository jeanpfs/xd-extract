# Reference

Companion to the [README](../README.md): errors, warnings, validation findings and file formats. Check `xd --version` first when reporting a problem.

## Errors and exit codes

Errors print `<Code>: <message>` on stderr and exit with the code below.

| Exit | Code | Meaning | What to do |
|---|---|---|---|
| 1 | (validation) | `xd validate` found at least one error | Read the findings; fix the SVG or the source |
| 2 | `Usage` | Bad flags, missing `<source>`, unreadable `--map`, `--browser`/`--record` on a non-link | `xd --help` |
| 10 | `NoVectorPayload` | Link is a raster-only prototype (no `graphicContent.agc`) | Nothing to extract; ask the author for a vector link or the `.xd` file |
| 11 | `TokenExpired` | Manifest or AGC request refused (HTTP 401/403) | Link tokens expire: open the link again, retry. If it keeps failing the link is private |
| 12 | `PrivateLink` | Page refused (401/403), or no manifest URL in the page | Private or password-protected links are not supported. If you think it is public, retry with `--browser` |
| 13 | `LinkNotFound` | Page answered 404 or similar | Check the URL; the link may have been revoked |
| 14 | `FetchFailed` | Network error, other HTTP error, manifest not JSON, AGC not found in any tried revision | Retry; try `--record <dir>` to capture the responses and inspect them |
| 20 | `NotAnXdFile` | Not a ZIP, no Adobe mimetype entry, or no manifest | Is it an `.xd` file saved by Adobe XD? |
| 21 | `InvalidAgc` | AGC is not valid JSON or `document.json` is malformed | Re-export; for `document.json` use one made by `xd redact` |
| 30 | `BrowserUnavailable` | `--browser` used but `agent-browser` is missing or failed | Install [agent-browser](https://github.com/vercel-labs/agent-browser) or drop `--browser` |
| 40 | `TargetNotFound` | `--node` / `--artboard` matches nothing | Use `xd inventory` to list names and ids; `id:ID` selects by id |
| 41 | `AmbiguousTarget` | More than one match | Add `--artboard`, or use `id:ID` |
| 42 | `NoPaintedGeometry` | The node has no convertible shape | Usually everything inside is text or unsupported; check the inventory warnings |
| 70 | (unexpected) | Bug | Open an issue with the stack trace |

## Warnings

Every extraction records warnings in the report (`<file>.svg.report.json`) and prints them. Each has a `count` and the first node name as `example`. Warnings that mean art is **missing** make `xd validate` fail.

| Code | Fails `validate` | Meaning |
|---|---|---|
| `unsupported-fill:<type>` | yes | Fill is not a solid RGB colour (`gradient`, `pattern`, ...) |
| `unsupported-fill:color-mode-<mode>` | yes | Solid fill in a colour mode other than RGB |
| `unsupported-stroke:<type>` / `...color-mode-<mode>` | yes | Same, for strokes |
| `unsupported-shape:<type>` | yes | Shape type not converted |
| `unsupported-node:<type>` | yes | Node type not converted |
| `skipped-text` | no | Text nodes are skipped |
| `unsupported-style:filters` | no | Shadows and blur are not converted |
| `unsupported-style:clipPath` | no | Repeat-grid mask is not converted |
| `stroke-align-ignored:<align>` | no | Alignment other than centre on a line, an open path or an unknown value: drawn centred. Inside and outside on closed shapes are converted |
| `path-bbox-approximate` | no | Path uses commands other than absolute M/L/C/Z; the frame is approximate |
| `agc-version-untested:<v>` | no | Only AGC 1.x has been observed |

## Validation findings

`xd validate` prints `<file>: error|warn <code>: <message>`; `--json` gives the same data. Exit `1` if any error.

Errors: `xml-invalid`, `not-svg`, `no-viewbox`, `empty-svg`, `shape-missing-fill`, `group-in-clippath`, `line-without-stroke`, `nan-number`, `render-failed`, `render-empty`, `frame-mismatch` (with `--expect-same-frame`), plus the fatal extraction warnings above.

Warnings: `edge-band-drift` (one edge band empty, the opposite painted: possible mask drift or off-centre frame), `tight-frame` (content touches all four edges of a content-box frame; strokes may be clipped, often a false alarm for full-width stacks), plus the non-fatal extraction warnings above.

## Files

### `--map map.json`

```json
[
  { "file": "cart.svg", "node": "cart" },
  { "file": "logo.svg", "node": "id:abc123", "artboard": "Home" }
]
```

`file` is relative to `-d <dir>` (default: the current directory). `node` is a top-level node name or `id:ID`. All jobs are converted before anything is written; if one fails nothing is written. Each SVG gets its own report; `--json` prints all reports as one array.

### `<file>.svg.report.json`

```json
{
  "source": { "...": "link or file the design came from" },
  "artboard": "Home",
  "node": "cart",
  "frame": { "x": 0, "y": 0, "w": 24, "h": 24 },
  "rule": "plate | content",
  "snaps": [{ "clip": "id", "mask": "id", "dx": 0.4, "dy": 0 }],
  "clips": 1,
  "warnings": [{ "code": "skipped-text", "message": "...", "count": 5, "example": "Title" }]
}
```

`frame` is the SVG `viewBox`; `rule` says whether it came from a background plate or the tight content box. `snaps` lists masks nudged back onto the art (mask drift).

### `xd redact` output

`<dir>/document.json`: an anonymised design (names, text and ids replaced) that every command accepts as `<source>`. See [Privacy](../README.md#privacy).

## Troubleshooting

- **`PrivateLink` on a link that opens in your browser:** try `--browser`. If it still fails, the link needs a login; export an `.xd` file instead.
- **`TokenExpired`:** tokens in share-link manifests are short-lived. Re-run; do not cache recordings.
- **Empty or half-empty SVG:** run `xd validate`; `render-empty` or `edge-band-drift` points at the frame. Open an issue with the redacted document.
- **Text missing:** text is not converted yet (`skipped-text`).
- **Output differs in gradients, shadows, images:** not converted yet; see the warnings in the report.
