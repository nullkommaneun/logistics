import { state, pxToMeters } from '../data.js';
import { pathfind } from '../navgrid.js';

// Start: {x,y}, sites: Array<{id,x,y}>, siteIds: Ziel-IDs (eindeutig)
export function computeRoute(start, sites, siteIds){
  const siteMap = new Map(sites.map(s=>[Number(s.id), s]));
  const targets = siteIds.map(id=>siteMap.get(Number(id))).filter(Boolean);
  if (!start || !targets.length) return { order: [], steps: [], total_m:0, total_s:0, uncalibrated: !state.settings.px_per_meter };

  const ppm = state.settings.px_per_meter || null;
  const v = (state.settings.speed_kmh_default||7) * 1000 / 3600; // m/s

  let cur = { x:start.x, y:start.y, id:'start' };
  const remaining = new Set(targets.map(t=>t.id));
  const order=[], steps=[];
  let totalPx = 0;

  while(remaining.size){
    // Nächstes Ziel mit kürzestem Dijkstra-Pfad
    let best=null, bestId=null, bestLen=Infinity;
    for (const id of remaining){
      const t = siteMap.get(id);
      const pf = pathfind(cur.x, cur.y, t.x, t.y);
      if (pf.lengthPx < bestLen){
        best = { target:t, path: pf.points, lenPx: pf.lengthPx };
        bestLen = pf.lengthPx; bestId = id;
      }
    }
    if (!best) break;
    order.push({ id: best.target.id, x: best.target.x, y: best.target.y });
    steps.push({
      from: cur.id==='start' ? 'start' : cur.id,
      to: best.target.id,
      dist_px: best.lenPx,
      dist_m: ppm ? best.lenPx/ppm : null,
      path: best.path
    });
    totalPx += best.lenPx;
    cur = best.target;
    remaining.delete(bestId);
  }

  const total_m = ppm ? totalPx/ppm : null;
  const total_s = total_m!=null ? (total_m / v) : null;

  return {
    order,
    steps,
    totalPx,
    total_m,
    total_s,
    uncalibrated: !ppm
  };
}