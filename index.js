'use strict';

require('dotenv').config();
const express = require('express');
const { CATALOG_SOURCES, fetchCatalog, findMetaById } = require('./lib/catalog');
const { getStreams } = require('./lib/streams');

const PORT = process.env.PORT || 11470;
// On Railway this will be set automatically, locally it uses 127.0.0.1
const HOST = process.env.RAILWAY_PUBLIC_DOMAIN
  ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN
  : 'http://127.0.0.1:' + PORT;

function buildManifest(rdKey) {
  const base = rdKey ? HOST + '/' + rdKey : HOST;
  return {
    id: 'au.torquelite.motorsport',
    version: '1.0.0',
    name: 'Torquelite Motorsport',
    description: 'Formula 1, MotoGP, NASCAR, V8 Supercars and more. Add your Real-Debrid key for 1080p & 4K streams.',
    logo: HOST + '/static/icon.png',
    background: HOST + '/static/fanart.jpg',
    resources: [
      'catalog',
      { name: 'stream', types: ['channel'], idPrefixes: ['tql_'] },
      { name: 'meta',   types: ['channel'], idPrefixes: ['tql_'] }
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
      configurable: true,
      configurationRequired: false
    }
  };
}

const app = express();
app.use('/static', express.static(__dirname + '/static'));

// ── CONFIGURE PAGE ──────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/configure'));
app.get('/:rdKey?/configure', (req, res) => {
  const rdKey = req.params.rdKey && req.params.rdKey !== 'configure' ? req.params.rdKey : '';
  const installBase = rdKey ? HOST + '/' + rdKey : HOST;
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Torquelite Motorsport - Configure</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f0f; color: #eee; font-family: 'Segoe UI', Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #1a1a1a; border: 1px solid #333; border-top: 3px solid #e8320a; border-radius: 12px; padding: 40px; max-width: 500px; width: 100%; margin: 20px; }
  .logo { text-align: center; margin-bottom: 24px; }
  .logo img { width: 120px; border-radius: 12px; }
  h1 { text-align: center; font-size: 22px; color: #fff; margin-bottom: 6px; }
  .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 32px; }
  label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
  input { width: 100%; background: #0f0f0f; border: 1px solid #333; border-radius: 6px; padding: 12px 14px; color: #fff; font-size: 14px; outline: none; transition: border 0.2s; }
  input:focus { border-color: #e8320a; }
  .hint { font-size: 12px; color: #666; margin-top: 6px; }
  .hint a { color: #e8320a; text-decoration: none; }
  .btn { display: block; width: 100%; margin-top: 24px; padding: 14px; background: #e8320a; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; transition: background 0.2s; }
  .btn:hover { background: #ff4a1a; }
  .btn-free { background: #333; margin-top: 10px; font-size: 14px; font-weight: 400; }
  .btn-free:hover { background: #444; }
  .features { margin-top: 28px; border-top: 1px solid #222; padding-top: 20px; }
  .feature { display: flex; gap: 10px; margin-bottom: 10px; font-size: 13px; color: #888; }
  .feature span:first-child { font-size: 16px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo"><img src="${HOST}/static/icon.png" alt="Torquelite"></div>
  <h1>Torquelite Motorsport</h1>
  <p class="subtitle">Formula 1 · MotoGP · NASCAR · V8 Supercars · and more</p>

  <label>Real-Debrid API Key (optional)</label>
  <input type="text" id="rdKey" placeholder="Paste your Real-Debrid API key here" value="${rdKey}">
  <p class="hint">Get your key at <a href="https://real-debrid.com/apitoken" target="_blank">real-debrid.com/apitoken</a></p>

  <a class="btn" id="installBtn" href="#">Install with Real-Debrid 🔴</a>
  <a class="btn btn-free" id="freeBtn" href="stremio://${HOST.replace('http://','').replace('https://','')}/manifest.json">Install Free Streams Only</a>

  <div class="features">
    <div class="feature"><span>🏎</span><span>Free VK streams for all events</span></div>
    <div class="feature"><span>🔴</span><span>Real-Debrid gives you 1080p &amp; 4K direct streams</span></div>
    <div class="feature"><span>🔄</span><span>Content updates automatically when you add to your JSON files</span></div>
    <div class="feature"><span>📺</span><span>Formula 1, MotoGP, NASCAR, Australian Racing</span></div>
  </div>
</div>
<script>
  const input = document.getElementById('rdKey');
  const btn = document.getElementById('installBtn');
  const hostBase = '${HOST.replace('http://','').replace('https://','')}';
  function update() {
    const key = input.value.trim();
    if (key) {
      btn.href = 'stremio://' + hostBase + '/' + encodeURIComponent(key) + '/manifest.json';
      btn.textContent = 'Install with Real-Debrid 🔴';
    } else {
      btn.href = 'stremio://' + hostBase + '/manifest.json';
      btn.textContent = 'Install (no RD key entered)';
    }
  }
  input.addEventListener('input', update);
  update();
</script>
</body>
</html>`);
});

// ── MANIFEST ────────────────────────────────────────────────────────────────
app.get('/:rdKey/manifest.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json(buildManifest(req.params.rdKey));
});
app.get('/manifest.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json(buildManifest(''));
});

// ── CATALOG ──────────────────────────────────────────────────────────────────
async function handleCatalog(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const { type, id } = req.params;
  const skip = parseInt((req.query && req.query.skip) || 0, 10);
  if (type !== 'channel') return res.json({ metas: [] });
  const metas = await fetchCatalog(id);
  const page = metas.slice(skip, skip + 50).map(({ _links, ...rest }) => rest);
  res.json({ metas: page });
}
app.get('/:rdKey/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id.json', handleCatalog);

// ── META ─────────────────────────────────────────────────────────────────────
async function handleMeta(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const { type, id } = req.params;
  if (type !== 'channel') return res.json({ meta: null });
  const meta = await findMetaById(id);
  if (!meta) return res.json({ meta: null });
  const { _links, ...clean } = meta;
  res.json({ meta: clean });
}
app.get('/:rdKey/meta/:type/:id.json', handleMeta);
app.get('/meta/:type/:id.json', handleMeta);

// ── STREAMS ───────────────────────────────────────────────────────────────────
async function handleStream(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const { rdKey, type, id } = req.params;
  if (type !== 'channel') return res.json({ streams: [] });
  const streams = await getStreams(type, id, rdKey || '');
  res.json({ streams });
}
app.get('/:rdKey/stream/:type/:id.json', handleStream);
app.get('/stream/:type/:id.json', (req, res) => {
  req.params.rdKey = '';
  handleStream(req, res);
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        TORQUELITE MOTORSPORT - STREMIO ADDON          ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Configure : ' + HOST + '/configure');
  console.log('║  Manifest  : ' + HOST + '/manifest.json');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
});
