# xd-extract: notes for contributors and agents

- Commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm leakcheck`, `pnpm skills:check`, `pnpm build`. Run `pnpm format` before committing.
- Layout: `packages/core` is pure (no network, no disk). `packages/sources` and `packages/cli` do I/O. Skills in `skills/` are thin and call the CLI.
- Every conversion rule has a test with a minimal synthetic fixture in `test-support/`. Add the failing test first.
- Unsupported content must become a warning in the report. Never drop nodes, shapes or fills silently.
- **Never** add a private design, a private share link or anything derived from one (screenshots, goldens, AGC, ids) to the repo. The private test tier reads `XD_PRIVATE_FIXTURE_DIR` locally. `pnpm leakcheck` also reads a local, gitignored `.leakcheck` denylist.
- Recordings (`--record`) contain a full design; commit one only if the design is public and `pnpm leakcheck` passes.
- Goldens are SVG text. Do not add pixel goldens (they break across resvg versions). Look at the rendered output before accepting a golden change.
