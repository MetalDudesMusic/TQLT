'use strict';

const https = require('https');
const RD_BASE = 'api.real-debrid.com';

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function rdRequest(method, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? new URLSearchParams(body).toString() : '';
    const options = {
      hostname: RD_BASE,
      path: '/rest/1.0' + path,
      method: method,
      family: 4,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('RD ' + method + ' ' + path + ' failed ' + res.statusCode + ': ' + data));
        }
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch(e) {
          reject(new Error('RD JSON parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const VIDEO_EXTS = /\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|mpeg|mpg|m4v)$/i;

// Extract just the most useful part of a filename
function shortLabel(filename) {
  const base = filename.split('/').pop().split('\\').pop();
  // Remove extension
  let name = base.replace(/\.[^.]+$/, '');
  // Replace dots/underscores with spaces
  name = name.replace(/[._]/g, ' ');
  // Try to extract session name keywords
  const keywords = name.match(/(practice|qualifying|quali|sprint|race|fp\d|p\d|q\d|warm.?up|press|conference|shootout)/i);
  if (keywords) {
    return keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1).toLowerCase();
  }
  // Fallback: trim to 20 chars
  return name.trim().substring(0, 20);
}

async function waitForDownload(torrentId, apiKey, maxWait = 90000) {
  const interval = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const info = await rdRequest('GET', '/torrents/info/' + torrentId, apiKey, null);
    console.log('[RD] status:', info.status);
    if (info.status === 'downloaded') return info;
    if (['error', 'virus', 'dead', 'magnet_error'].includes(info.status)) {
      throw new Error('Torrent failed: ' + info.status);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Torrent timed out');
}

async function resolveWithRD(magnetUrl, apiKey, label) {
  const hashMatch = magnetUrl.match(/btih:([a-zA-Z0-9]+)/i);
  const cacheKey = (hashMatch ? hashMatch[1].toUpperCase() : magnetUrl) + ':' + apiKey.slice(-6);

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.log('[RD] cache hit');
    return cached.streams;
  }

  console.log('[RD] adding magnet...');
  const added = await rdRequest('POST', '/torrents/addMagnet', apiKey, { magnet: magnetUrl });
  const torrentId = added.id;

  await rdRequest('POST', '/torrents/selectFiles/' + torrentId, apiKey, { files: 'all' });
  console.log('[RD] waiting for download...');

  const info = await waitForDownload(torrentId, apiKey);
  if (!info.links || info.links.length === 0) throw new Error('No links from RD');

  console.log('[RD] got', info.links.length, 'links');

  const selectedFiles = (info.files || [])
    .filter(f => f.selected === 1 && VIDEO_EXTS.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const unrestricted = await Promise.all(
    info.links.map(link =>
      rdRequest('POST', '/unrestrict/link', apiKey, { link })
        .catch(e => { console.error('[RD] unrestrict failed:', e.message); return null; })
    )
  );

  const validLinks = unrestricted.filter(Boolean);

  // Extract quality from label eg "1080p RD" -> "1080p"
  const qualMatch = label.match(/(4k|4K|1080p|720p|480p|2160p)/i);
  const quality = qualMatch ? qualMatch[1].toUpperCase() : 'RD';

  const streams = [];

  if (selectedFiles.length > 0 && selectedFiles.length === validLinks.length) {
    for (let i = 0; i < selectedFiles.length; i++) {
      const session = shortLabel(selectedFiles[i].path);
      streams.push({
        url: validLinks[i].download,
        name: '🔴 ' + quality,
        description: session,
        behaviorHints: { notWebReady: false }
      });
    }
  } else {
    for (let i = 0; i < validLinks.length; i++) {
      streams.push({
        url: validLinks[i].download,
        name: '🔴 ' + quality,
        description: validLinks.length > 1 ? 'File ' + (i + 1) : label,
        behaviorHints: { notWebReady: false }
      });
    }
  }

  cache.set(cacheKey, { streams, time: Date.now() });
  return streams;
}

module.exports = { resolveWithRD };
