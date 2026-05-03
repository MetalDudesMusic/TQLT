'use strict';

const dns = require('dns');
// Force IPv4 - IPv6 times out on this server
dns.setDefaultResultOrder('ipv4first');

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\[COLOR[^\]]*\]/gi, '')
    .replace(/\[\/COLOR\]/gi, '')
    .replace(/\[B\]|\[\/B\]/gi, '')
    .replace(/\[I\]|\[\/I\]/gi, '')
    .replace(/---/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseLink(raw) {
  if (!raw || typeof raw !== 'string') return null;
  raw = raw.trim();
  if (!raw) return null;
  const match = raw.match(/^(magnet:[^\s(]+|https?:\/\/[^\s(]+)\s*(?:\(([^)]*)\))?/);
  if (!match) return null;
  const url = match[1].trim();
  const label = match[2] ? match[2].trim() : 'Watch';
  return { url, label };
}

function makeId(title) {
  return 'tql_' + title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
}

function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? require('https') : require('http');
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: timeoutMs,
      family: 4, // Force IPv4
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://racingondemand.xyz/'
      }
    };

    console.log('[fetch] GET ' + url);

    const req = lib.request(options, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 302 && res.headers.location) {
        console.log('[fetch] REDIRECT to ' + res.headers.location);
        return fetchJson(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      console.log('[fetch] STATUS ' + res.statusCode);
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log('[fetch] GOT ' + data.length + ' bytes');
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error('JSON parse error: ' + e.message));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after ' + timeoutMs + 'ms'));
    });

    req.on('error', (e) => {
      console.error('[fetch] ERROR: ' + e.code + ' - ' + e.message);
      reject(e);
    });

    req.end();
  });
}

module.exports = { cleanTitle, parseLink, makeId, fetchJson };
