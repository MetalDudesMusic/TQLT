'use strict';

const { parseLink } = require('./utils');
const { resolveWithRD } = require('./realdebrid');
const { findMetaById } = require('./catalog');

// Build Stremio stream objects from a raw links array
async function buildStreams(rawLinks, rdKey) {
  const streams = [];

  for (const raw of rawLinks) {
    const parsed = parseLink(raw);
    if (!parsed) continue;

    const { url, label } = parsed;

    if (url.startsWith('magnet:')) {
      if (rdKey) {
        try {
          const directUrl = await resolveWithRD(url, rdKey);
          streams.push({
            url: directUrl,
            name: 'Torquelite',
            description: `🔴 RD | ${label}`,
            behaviorHints: { notWebReady: false }
          });
        } catch (e) {
          console.error(`RD resolve failed for "${label}":`, e.message);
          // Don't add failed RD streams
        }
      }
      // If no RD key, skip magnets silently
    } else if (url.startsWith('http')) {
      streams.push({
        url,
        name: 'Torquelite',
        description: `▶ Free | ${label}`,
        behaviorHints: { notWebReady: false }
      });
    }
  }

  return streams;
}

// Main stream handler - called by the addon
async function getStreams(type, id, rdKey) {
  const meta = await findMetaById(id);
  if (!meta || !meta._links) return [];
  return buildStreams(meta._links, rdKey);
}

module.exports = { getStreams };
