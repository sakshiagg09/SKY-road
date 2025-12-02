// srv/stop-events-api.js
const fs = require('fs').promises;
const path = require('path');

const DATA_PATH = path.resolve(__dirname, '..', 'data', 'stop-events.json');

let cache = {
  mtimeMs: 0,
  value: null
};

async function loadData(force = false) {
  try {
    const stat = await fs.stat(DATA_PATH);
    if (!force && cache.value && cache.mtimeMs === stat.mtimeMs) {
      return cache.value;
    }
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cache.value = parsed;
    cache.mtimeMs = stat.mtimeMs;
    return parsed;
  } catch (e) {
    console.error('Failed to read stop-events.json:', e);
    return []; // fallback: empty
  }
}

/**
 * Register endpoint(s) onto the Express app that cds exposes
 * call this from srv/server.js or require it from existing tracking.js using cds.on('bootstrap')
 */
module.exports = function (app) {
  // GET all mappings
  app.get('/api/stop-events', async (req, res) => {
    try {
      const list = await loadData();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load stop events' });
    }
  });

  // GET mapping for a specific stopType: /api/stop-events/F
  app.get('/api/stop-events/:type', async (req, res) => {
    try {
      const type = String(req.params.type || '').toUpperCase();
      const list = await loadData();
      const found = list.find(item => (item.stopType || '').toUpperCase() === type);
      if (!found) return res.status(404).json({ error: 'Not found' });
      res.json(found);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load stop events' });
    }
  });

  // Optional: admin endpoint to reload data (no auth here; for local use only)
  app.post('/api/stop-events/reload', async (req, res) => {
    try {
      await loadData(true);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
};
