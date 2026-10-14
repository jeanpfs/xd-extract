export interface ManifestArtboard {
  id: string;
  name: string;
  dir: string;
  bounds?: { x: number; y: number; width: number; height: number };
  /** Every string in the artboard's manifest subtree (ids, paths, names). */
  aliases: string[];
  agc: { componentId: string; version?: string };
}

interface ManifestComponent {
  id?: string;
  path?: string;
  version?: string;
}

interface ManifestNode {
  name?: string;
  path?: string;
  children?: ManifestNode[];
  components?: ManifestComponent[];
  'uxdesign#bounds'?: { x: number; y: number; width: number; height: number };
}

function strings(n: unknown, acc: string[] = []): string[] {
  if (typeof n === 'string') acc.push(n);
  else if (Array.isArray(n)) for (const x of n) strings(x, acc);
  else if (n && typeof n === 'object') for (const x of Object.values(n)) strings(x, acc);
  return acc;
}

/** Image components of the document, by the `uid` pattern fills use (the component's path). */
export function parseImages(
  manifest: unknown,
): Map<string, { componentId: string; version?: string; type?: string }> {
  const tree = manifest as ManifestNode | null;
  const dir = tree?.children?.find((c) => c.path === 'resources');
  const out = new Map<string, { componentId: string; version?: string; type?: string }>();
  for (const c of dir?.components ?? []) {
    const type = (c as { type?: string }).type;
    if (!c.id || !c.path || !type?.startsWith('image/')) continue;
    out.set(c.path, {
      componentId: c.id,
      ...(c.version !== undefined ? { version: c.version } : {}),
      type,
    });
  }
  return out;
}

/** The document-wide `resources/graphics/graphicContent.agc` (symbol masters, gradients), when listed. */
export function parseResources(manifest: unknown): { componentId: string; version?: string } | null {
  const tree = manifest as ManifestNode | null;
  const dir = tree?.children?.find((c) => c.path === 'resources');
  const graphics = dir?.children?.find((c) => c.path === 'graphics');
  const comp = graphics?.components?.find((c) => c.path === 'graphicContent.agc');
  if (!comp?.id) return null;
  return { componentId: comp.id, ...(comp.version !== undefined ? { version: comp.version } : {}) };
}

/**
 * The share-link manifest and the `manifest` file inside a `.xd` ZIP share one tree:
 * artwork -> <dir> -> graphics -> components[graphicContent.agc]. Directories without an
 * AGC (raster-only prototypes) are skipped.
 */
export function parseManifest(manifest: unknown): ManifestArtboard[] {
  const tree = manifest as ManifestNode | null;
  const artwork = tree?.children?.find((c) => c.path === 'artwork');
  const out: ManifestArtboard[] = [];
  for (const dir of artwork?.children ?? []) {
    const graphics = dir.children?.find((c) => c.path === 'graphics');
    const comp = graphics?.components?.find((c) => c.path === 'graphicContent.agc');
    if (!comp?.id || !dir.path) continue;
    out.push({
      id: dir.path.startsWith('artboard-') ? dir.path.slice('artboard-'.length) : dir.path,
      name: dir.name || dir.path,
      dir: dir.path,
      ...(dir['uxdesign#bounds'] ? { bounds: dir['uxdesign#bounds'] } : {}),
      aliases: strings(dir),
      agc: { componentId: comp.id, ...(comp.version !== undefined ? { version: comp.version } : {}) },
    });
  }
  return out;
}
