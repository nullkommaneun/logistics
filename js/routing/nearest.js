
import { state } from '../data.js';

function distPx(a, b){
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function computeRoute(start, sites, siteIds){
  // start: {x,y,label}
  const siteMap = new Map(sites.map(s=>[s.id, s]));
  const targets = siteIds.map(id=>siteMap.get(id)).filter(Boolean);
  const visited = new Set();
  const order = [];
  let current = { x:start.x, y:start.y, id: null, label: start.label || 'Start' };
  let totalPx = 0;
  const steps = [];

  while (visited.size < targets.length){
    let best = null, bestD = Infinity;
    for (const s of targets){
      if (visited.has(s.id)) continue;
      const d = distPx(current, s);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) break;
    steps.push({ from: current.id, to: best.id, dist_px: bestD });
    totalPx += bestD;
    current = { x: best.x, y: best.y, id: best.id, label: 'Ort '+best.id };
    order.push(current);
    visited.add(best.id);
  }

  // compute meters and eta
  const ppm = state.settings.px_per_meter;
  const speed_kmh = state.settings.speed_kmh_default || 7;
  const m_per_s = (speed_kmh * 1000) / 3600;
  let total_m = null, total_s = null, uncalibrated = false;
  if (ppm){
    total_m = totalPx / ppm;
    total_s = total_m / m_per_s;
    steps.forEach(s => { s.dist_m = s.dist_px / ppm; s.eta_s = s.dist_m / m_per_s; });
  } else {
    uncalibrated = true;
    steps.forEach(s => { s.dist_m = null; s.eta_s = null; });
  }

  return { order, steps, totalPx, total_m, total_s, uncalibrated };
}
