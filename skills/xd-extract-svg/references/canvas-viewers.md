# Design viewers that render into a canvas

For XD, use the CLI: it already finds and downloads the payload. This file is the **generic method** for other design viewers (canvas or WebGL prototype viewers) where right-click and download give nothing usable. The CLI's converter does not apply to other formats; only the method does.

A canvas is a dead end: `toDataURL()` on a context created without `preserveDrawingBuffer` returns transparent black, and even when it works you get raster, not paths. The art is never in the canvas. It arrives as a **scene-graph JSON** over the network and the renderer just draws it.

1. **Open and capture traffic.** `agent-browser open "<url>"`, `agent-browser wait --load networkidle`, then `agent-browser network requests --filter <guess>`. Always filter; never read the whole list. Probes in order of yield: format names (`.agc`, `graphicContent`, `manifest`, `document`, `scene`, `artboard`), `XHR`/`Fetch` to a CDN host repeated once per screen, a `HEAD`/`OPTIONS` preflight to a URL with a `component_id`-like parameter.
2. **Index first, then payload.** Viewers are two-level: a manifest (screens to component ids) and one payload per screen. Fetch both from inside the page so cookies, `Authorization` and query tokens the viewer holds are reused. `agent-browser eval --stdin` takes a single expression and forbids bare top-level `await`: wrap the script in `(async () => { ... })()` and return a JSON string. Cache payloads on `window.__*`.
3. **Checks that cost time when skipped.**
   - Mirror the exact URL shape the viewer used, including versioning (`;revision=N`). Dropping it returned HTTP 400 with a valid token. Read the version from the manifest entry instead of guessing.
   - Do not send `credentials: 'include'` to a CDN that answers `Access-Control-Allow-Origin: *`; the request fails with `Failed to fetch`. Omit credentials.
   - The id in a share URL is not necessarily a node id. Search every string field of every manifest node, not `id ===`.
   - The screen in the URL is often the wrong source: in a carousel it may hold a subset of the art. Scan all payloads for the wanted node names.
4. **Locate nodes by projection**, never by dumping JSON: names, types, bounding data, colours. Resolve loose descriptions by dominant fill colour.
5. **Convert and validate.** For a new format you must write the converter; reuse the rules in `rules.md` (they are format-independent in intent) and the validation approach in `defects.md`.

If the scene-graph JSON is genuinely unreachable (server-side rendering, an encrypted or schema-less binary payload), say so and stop. Never substitute a screenshot or a traced bitmap.
