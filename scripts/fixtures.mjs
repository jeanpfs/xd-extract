// Public fixtures: upstream files pinned by commit and sha256, redacted by `xd redact` into fixtures/public/<name>.
// Add a file only after rendering every node and checking for third-party marks (see AGENTS.md), then
// record its licence in fixtures/public/NOTICE.
export const FIXTURES = [
  {
    name: 'single',
    file: 'single.xd',
    // Only single.xd (a generic website template). multi.xd is a banking-app mockup full of third-party
    // brand logos, so it is deliberately NOT redistributed, not even anonymised.
    url: 'https://raw.githubusercontent.com/L2jLiga/xd2svg/937365e71fe735751053e918b3ba02cfa546ce7a/test/input/single.xd',
    sha256: 'a664b4938f146a541335e60bf0870e63733d0ba422a8bd9b278eccec89956f19',
    exclude: [],
  },
  {
    // Adobe's own test suite for its XD-to-Flutter plugin: synthetic shapes, every gradient type, blend
    // modes, polygons, repeat grids, symbols, blur, shadows and area text.
    name: 'tests-suite',
    file: 'tests_suite.xd',
    url: 'https://raw.githubusercontent.com/AdobeXD/xd-to-flutter-plugin/16e22745ce9e9f67c2c6458be24420a8047be7be/test_suite/tests_suite.xd',
    sha256: 'b3612d16789c77cb4ec971d49bbf54b75442ae506b30148cb4f0935e6fc72630',
    exclude: [],
  },
  {
    // Adobe's example app for the same plugin (a fictional brand drawn by Adobe).
    name: 'campvibes',
    file: 'Campvibes.xd',
    url: 'https://raw.githubusercontent.com/AdobeXD/xd-to-flutter-plugin/16e22745ce9e9f67c2c6458be24420a8047be7be/adobe_xd/example/Campvibes.xd',
    sha256: '9e8b7560a015e46988d88741629752dce29f164fb6e8ef3880d60d02ff6fc1ff',
    exclude: [],
  },
];
