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

// Video file extensions we care about
const VIDEO_EXTS = /\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|mpeg|mpg|m4v)$/i;

// Clean up a filename into a readable label
function cleanFilename(filename) {
  // Get just the filename without path
  const base = filename.split('/').pop().split('\\').pop();
  // Remove extension
  return base.replace(/\.[^.]+$/, '')
    .replace(/[._]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function waitForDownload(torrentId, apiKey, maxWait = 90000) {
  const interval = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const info = await rdRequest('GET', '/torrents/info/' + torrentId, apiKey, null);
    console.log('[RD] torrent status:', info.status);
    if (info.status === 'downloaded') return info;
    if (['error', 'virus', 'dead', 'magnet_error'].includes(info.status)) {
      throw new Error('Torrent failed: ' + info.status);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Torrent timed out');
}

// Resolve a magnet and return ALL video files as separate stream objects
async function resolveWithRD(magnetUrl, apiKey, label) {
  const hashMatch = magnetUrl.match(/btih:([a-zA-Z0-9]+)/i);
  const cacheKey = (hashMatch ? hashMatch[1].toUpperCase() : magnetUrl) + ':' + apiKey.slice(-6);

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.log('[RD] cache hit for', cacheKey.substring(0, 16));
    return cached.streams;
  }

  console.log('[RD] adding magnet...');
  const added = await rdRequest('POST', '/torrents/addMagnet', apiKey, { magnet: magnetUrl });
  const torrentId = added.id;
  console.log('[RD] torrent id:', torrentId);

  // Select all files
  await rdRequest('POST', '/torrents/selectFiles/' + torrentId, apiKey, { files: 'all' });
  console.log('[RD] files selected, waiting...');

  const info = await waitForDownload(torrentId, apiKey);
  if (!info.links || info.links.length === 0) throw new Error('No links from RD');

  console.log('[RD] got', info.links.length, 'links,', (info.files || []).length, 'files');

  // Get the selected video files in order
  const selectedFiles = (info.files || [])
    .filter(f => f.selected === 1 && VIDEO_EXTS.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Unrestrict all links in parallel
  const unrestricted = await Promise.all(
    info.links.map(link =>
      rdRequest('POST', '/unrestrict/link', apiKey, { link })
        .catch(e => { console.error('[RD] unrestrict failed:', e.message); return null; })
    )
  );

  const validLinks = unrestricted.filter(Boolean);
  console.log('[RD] unrestricted', validLinks.length, 'links');

  // Build stream objects — one per file
  const streams = [];

  if (selectedFiles.length > 0 && selectedFiles.length === validLinks.length) {
    // We have file names — use them as labels
    for (let i = 0; i < selectedFiles.length; i++) {
      const fileLabel = cleanFilename(selectedFiles[i].path);
      streams.push({
        url: validLinks[i].download,
        name: 'Torquelite',
        description: '🔴 RD | ' + label + ' | ' + fileLabel,
        behaviorHints: { notWebReady: false }
      });
    }
  } else {
    // Fallback: just number the links
    for (let i = 0; i < validLinks.length; i++) {
      streams.push({
        url: validLinks[i].download,
        name: 'Torquelite',
        description: '🔴 RD | ' + label + (validLinks.length > 1 ? ' | File ' + (i + 1) : ''),
        behaviorHints: { notWebReady: false }
      });
    }
  }

  cache.set(cacheKey, { streams, time: Date.now() });
  return streams;
}

module.exports = { resolveWithRD };
