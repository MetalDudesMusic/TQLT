'use strict';

const { CATALOG_SOURCES } = require('./lib/catalog');

function buildManifest(rdKey) {
  return {
    id: 'au.torquelite.motorsport',
    version: '1.0.0',
    name: 'Torquelite Motorsport',
    description: 'Your premier motorsport addon. Formula 1, MotoGP, NASCAR, V8 Supercars and more. Supports free streams and Real-Debrid.',
    logo: 'http://127.0.0.1:11470/torquelite/icon.png',
    background: 'http://127.0.0.1:11470/torquelite/fanart.jpg',
    resources: [
      'catalog',
      {
        name: 'stream',
        types: ['channel'],
        idPrefixes: ['tql_']
      },
      {
        name: 'meta',
        types: ['channel'],
        idPrefixes: ['tql_']
      }
    ],
    types: ['channel'],
    catalogs: CATALOG_SOURCES.map(src => ({
      type: 'channel',
      id: src.id,
      name: src.name,
      extra: [{ name: 'skip', isRequired: false }]
    })),
    behaviorHints: {
      adult: false,
      configurable: false
    }
  };
}

module.exports = { buildManifest };
