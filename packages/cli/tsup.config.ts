import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  tsconfig: '../../tsconfig.json',
  banner: { js: '#!/usr/bin/env node' },
  // resvg is a native module: keep it external and install it as a runtime dependency.
  external: ['@resvg/resvg-js'],
  // bundle the workspace packages and the pure-JS dependencies (fflate, @xmldom/xmldom)
  noExternal: [/^@xd-extract\//],
});
