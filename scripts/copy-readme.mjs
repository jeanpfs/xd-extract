// Runs from packages/cli as `prepack`: npm only packs files inside the package directory, and the
// README lives at the repo root. The copy is gitignored.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../README.md', import.meta.url), new URL('../packages/cli/README.md', import.meta.url));
