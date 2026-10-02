# xd-extract

Extract **SVG** vector art from Adobe XD designs: from a public share link (`xd.adobe.com/view/...`) or a local `.xd` file. Inventory the nodes, pick one, export it, and validate the result.

XD share links render into a `<canvas>`, so right-click and download give nothing usable. The vector data travels as a scene-graph JSON; this tool reads that JSON directly instead of screenshotting.

> Output is SVG only. Gradients, shadows, blur, text and embedded images are not converted yet: each one is reported as a warning, never dropped silently.

## Use it

```bash
npx -y xd-extract inventory https://xd.adobe.com/view/<id>/ --json
npx -y xd-extract inventory design.xd --find "#ff9c29"
npx -y xd-extract extract design.xd --node "cart-icon" -o out/cart.svg
npx -y xd-extract validate out/*.svg --expect-same-frame
```

Needs Node >= 22. Exit codes: `0` ok, `1` validation errors, `2` usage, `10-14` link errors, `20-21` file errors, `30` browser, `40-42` target errors, `70` unexpected.

Share links need no browser: the manifest URL is in the page's static HTML. If a link exposes none (private, password protected, unseen layout) retry with `--browser` (uses [agent-browser](https://github.com/vercel-labs/agent-browser)).

A **raster-only** prototype (no vector payload) stops with `NoVectorPayload`; there is nothing to extract.

## Agent skills

```bash
npx skills add jeanpfs/xd-extract --list
npx skills add jeanpfs/xd-extract --skill xd-extract-svg -g
```

Claude Code plugin: `/plugin marketplace add jeanpfs/xd-extract`, then `/plugin install xd-extract@xd-extract`.

| Skill | Use |
|---|---|
| `xd-extract-svg` | The whole flow: inventory, pick, extract, validate, preview |
| `xd-inventory` | List and search nodes; pick visually |
| `xd-validate-svg` | Validate exports; interpret findings |

## What validation checks

Static: XML parses, `viewBox`, shapes present, no shape without explicit fill (renders black), no `<g>` in a `clipPath`, `<line>` has a stroke, no `NaN`, plus every extraction warning. Raster (resvg): empty render, mask-drift edge bands, tight frames, frame size across a set. It removes obvious failures; it does not prove the art is right, so look at the preview.

## Development

```bash
pnpm install
pnpm test          # unit, public fixtures, recorded
pnpm lint && pnpm typecheck && pnpm leakcheck
pnpm build
```

Test tiers: synthetic fixtures (one per rule), public fixtures (anonymised, from MIT-licensed `.xd` files, see `fixtures/public/NOTICE`), recorded HTTP (tokens stripped), live (`pnpm test:live`, nightly) and a private tier driven by `XD_PRIVATE_FIXTURE_DIR` that never leaves your machine.

`xd redact <source> -o dir` anonymises a design for use as a public fixture: names, ids, text and fonts are removed, **geometry is kept**. Confirm the artwork itself is publishable first.

## License

MIT. Third-party fixtures: see `NOTICE`.
