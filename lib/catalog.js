'use strict';

const { cleanTitle, makeId, fetchJson } = require('./utils');

// Use HTTPS - server redirects http to https
const BASE = 'https://racingondemand.xyz/noneofyourebusiness/json';

const CATALOG_SOURCES = [
  { id: 'tql_formula', name: 'Formula Racing',   url: BASE + '/roadrace/formula/Formula1.json' },
  { id: 'tql_motogp',  name: 'MotoGP & Bikes',   url: BASE + '/roadrace/moto/Motogp.json'      },
  { id: 'tql_nascar',  name: 'NASCAR',            url: BASE + '/roadrace/usa/cupseries.json'    },
  { id: 'tql_aussie',  name: 'Australian Racing', url: BASE + '/roadrace/aussie/v8supercars.json'}
];

const catalogCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function itemToMeta(item) {
  if (!item || item.type !== 'item') return null;
  if (!item.link || item.link === 'link') return null;
  const title = cleanTitle(item.title || 'Untitled');
  if (!title) return null;
  return {
    id: makeId(title),
    type: 'channel',
    name: title,
    poster: item.thumbnail || 'https://i.imgur.com/V1bQAOS.png',
    background: item.fanart || null,
    description: item.summary || '',
    _links: Array.isArray(item.link) ? item.link : [item.link]
  };
}

async function fetchCatalog(catalogId) {
  const source = CATALOG_SOURCES.find(s => s.id === catalogId);
  if (!source) return [];
  const now = Date.now();
  const cached = catalogCache.get(catalogId);
  if (cached && now - cached.time < CACHE_TTL) return cached.metas;
  let data;
  try {
    data = await fetchJson(source.url);
  } catch (e) {
    console.error('Failed to fetch catalog ' + catalogId + ': ' + e.message);
    return cached ? cached.metas : [];
  }
  const items = (data && data.items) ? data.items : [];
  const metas = items.map(itemToMeta).filter(Boolean);
  catalogCache.set(catalogId, { metas, time: now });
  return metas;
}

async function findMetaById(id) {
  for (const source of CATALOG_SOURCES) {
    const metas = await fetchCatalog(source.id);
    const found = metas.find(m => m.id === id);
    if (found) return found;
  }
  return null;
}

module.exports = { CATALOG_SOURCES, fetchCatalog, findMetaById };
