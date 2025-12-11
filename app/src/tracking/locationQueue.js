const KEY = "sky_location_queue_v2";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function enqueue(point) {
  const q = load();
  q.push(point);
  if (q.length > 2000) q.shift();
  save(q);
}

export function drain() {
  const q = load();
  save([]);
  return q;
}

export function getQueue() {
  return load();
}
