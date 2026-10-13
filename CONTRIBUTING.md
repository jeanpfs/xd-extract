# Contributing

Setup and commands are in the [README](README.md#development); conventions are in [AGENTS.md](AGENTS.md). In short:

1. Add the failing test first, with a minimal synthetic fixture in `test-support/`.
2. Anything the converter cannot handle must surface as a warning in the report, never be dropped silently.
3. Run `pnpm format`, then `pnpm lint && pnpm typecheck && pnpm leakcheck && pnpm skills:check && pnpm test`.

## Privacy rules (hard)

- Never commit a private design, a private share link, or anything derived from one: screenshots, goldens, AGC, ids.
- Public fixtures must not contain third-party marks (logos, brand names). Look at the rendered output of every node. Use `xd redact --exclude` or choose another sample.
- Goldens are SVG text; no pixel goldens.

## Releasing (maintainers)

1. Update `version` in `packages/cli/package.json` and add a `## X.Y.Z (date)` section to `CHANGELOG.md`.
2. Commit, then `git tag vX.Y.Z && git push --tags`.
3. `.github/workflows/release.yml` checks the tag against the version, runs every check, publishes to npm with provenance (needs the `NPM_TOKEN` repo secret) and creates the GitHub release from the CHANGELOG section.
