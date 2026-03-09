// src/tracking/locationQueue.js
const KEY = "sky_loc_queue_v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr));
}

export function enqueue(point) {
  const q = load();
  const withId = { _id: `${Date.now()}_${Math.random()}`, ...point };
  q.push(withId);

  // keep last 500 points max
  const trimmed = q.slice(-500);
  save(trimmed);
}

export function drain() {
  const q = load();
  save([]);
  return q;
}

export function peek(n = 20) {
  const q = load();
  return q.slice(0, n);
}

export function markSent(id) {
  if (!id) return;
  const q = load().filter((p) => p._id !== id);
  save(q);
}
