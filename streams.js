'use strict';

const { parseLink } = require('./utils');
const { resolveWithRD } = require('./realdebrid');
const { findMetaById } = require('./catalog');

async function buildStreams(rawLinks, rdKey) {
  const streams = [];

  for (const raw of rawLinks) {
    const parsed = parseLink(raw);
    if (!parsed) continue;

    const { url, label } = parsed;

    if (url.startsWith('magnet:')) {
      if (rdKey) {
        try {
          // resolveWithRD now returns an ARRAY of stream objects (one per file)
          const rdStreams = await resolveWithRD(url, rdKey, label);
          streams.push(...rdStreams);
        } catch (e) {
          console.error('RD resolve failed for "' + label + '":', e.message);
        }
      }
    } else if (url.startsWith('http')) {
      streams.push({
        url,
        name: 'Torquelite',
        description: '▶ Free | ' + label,
        behaviorHints: { notWebReady: false }
      });
    }
  }

  return streams;
}

async function getStreams(type, id, rdKey) {
  const meta = await findMetaById(id);
  if (!meta || !meta._links) return [];
  return buildStreams(meta._links, rdKey);
}

module.exports = { getStreams };
