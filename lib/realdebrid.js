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

async function waitForDownload(torrentId, apiKey, maxWait = 60000) {
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

async function resolveWithRD(magnetUrl, apiKey) {
  const hashMatch = magnetUrl.match(/btih:([a-zA-Z0-9]+)/i);
  const cacheKey = (hashMatch ? hashMatch[1].toUpperCase() : magnetUrl) + ':' + apiKey.slice(-6);

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.log('[RD] cache hit');
    return cached.url;
  }

  console.log('[RD] adding magnet...');
  const added = await rdRequest('POST', '/torrents/addMagnet', apiKey, { magnet: magnetUrl });
  const torrentId = added.id;
  console.log('[RD] torrent id:', torrentId);

  await rdRequest('POST', '/torrents/selectFiles/' + torrentId, apiKey, { files: 'all' });
  console.log('[RD] files selected, waiting for download...');

  const info = await waitForDownload(torrentId, apiKey);
  if (!info.links || info.links.length === 0) throw new Error('No links from RD');

  const unrestricted = await rdRequest('POST', '/unrestrict/link', apiKey, { link: info.links[0] });
  const directUrl = unrestricted.download;
  console.log('[RD] resolved:', directUrl.substring(0, 50) + '...');

  cache.set(cacheKey, { url: directUrl, time: Date.now() });
  return directUrl;
}

module.exports = { resolveWithRD };
