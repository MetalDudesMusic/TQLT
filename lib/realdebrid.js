'use strict';

const fetch = require('node-fetch');

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';

// Simple in-memory cache so we don't hammer RD for the same magnet
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function rdPost(path, apiKey, body) {
  const params = new URLSearchParams(body);
  const res = await fetch(`${RD_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RD POST ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function rdGet(path, apiKey) {
  const res = await fetch(`${RD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RD GET ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

// Poll torrent info until downloaded or timeout
async function waitForDownload(torrentId, apiKey, maxWait = 30000) {
  const interval = 2000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const info = await rdGet(`/torrents/info/${torrentId}`, apiKey);
    if (info.status === 'downloaded') return info;
    if (['error', 'virus', 'dead', 'magnet_error'].includes(info.status)) {
      throw new Error(`Torrent ${torrentId} failed: ${info.status}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Torrent ${torrentId} timed out`);
}

// Resolve a magnet link through RD and return a direct stream URL
async function resolveWithRD(magnetUrl, apiKey) {
  // Normalise magnet - extract hash for cache key
  const hashMatch = magnetUrl.match(/btih:([a-zA-Z0-9]+)/i);
  const cacheKey = hashMatch ? hashMatch[1].toUpperCase() : magnetUrl;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.url;
  }

  // 1. Add magnet
  const added = await rdPost('/torrents/addMagnet', apiKey, { magnet: magnetUrl });
  const torrentId = added.id;

  // 2. Select all files
  await rdPost(`/torrents/selectFiles/${torrentId}`, apiKey, { files: 'all' });

  // 3. Wait for download
  const info = await waitForDownload(torrentId, apiKey);

  if (!info.links || info.links.length === 0) {
    throw new Error('No links returned from RD');
  }

  // 4. Unrestrict the first link (main video file)
  const unrestricted = await rdPost('/unrestrict/link', apiKey, { link: info.links[0] });
  const directUrl = unrestricted.download;

  cache.set(cacheKey, { url: directUrl, time: Date.now() });
  return directUrl;
}

module.exports = { resolveWithRD };
