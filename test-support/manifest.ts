export interface ManifestArtboardSpec {
  id: string;
  name: string;
  version?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

const graphics = (key: string, version?: string) => ({
  id: `graphics-${key}`,
  name: 'graphics',
  path: 'graphics',
  components: [
    {
      id: `cmp-${key}`,
      path: 'graphicContent.agc',
      rel: 'primary',
      type: 'application/vnd.adobe.agc.graphicsTree+json',
      ...(version === undefined ? {} : { version }),
    },
  ],
});

export function buildManifest(artboards: ManifestArtboardSpec[], extra: Record<string, unknown> = {}) {
  return {
    id: 'doc-id',
    ...extra,
    children: [
      {
        id: 'dir-artwork',
        name: 'artwork',
        path: 'artwork',
        children: [
          {
            id: 'dir-pasteboard',
            name: 'pasteboard',
            path: 'pasteboard',
            children: [graphics('pasteboard')],
          },
          ...artboards.map((a) => ({
            id: `dir-${a.id}`,
            name: a.name,
            path: `artboard-${a.id}`,
            ...(a.bounds ? { 'uxdesign#bounds': a.bounds } : {}),
            children: [graphics(a.id, a.version)],
          })),
        ],
      },
    ],
  };
}
