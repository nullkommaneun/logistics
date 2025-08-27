import { state } from '../data.js';
import { pathfind } from '../navgrid.js';

export function computeRoute(start, sites, siteIds){
  const siteMap = new Map(sites.map(s=>[Number(s.id), s]));
  const targets = siteIds.map(id=>siteMap.get(Number(id))).filter(Boolean);
  if (!start || !targets.length) return { order: [], steps: [], total_m:0, total_s:0, uncalibrated: !state.settings.px_per_meter };

  const ppm = state.settings.px_per_meter || null;
  const v = (state.settings.speed_kmh_default||7) * 1000 / 3600; // m/s

  // ---- Distanz-Cache (Pixel) zwischen allen Knoten ----
  const nodes = [{ id:'start', x:start.x, y:start.y }].concat(targets);
  const cache = new Map();
  const key = (i,j)=>i+'_'+j;
  function dist(i,j){
    const k = key(i,j);
    if (cache.has(k)) return cache.get(k);
    const a = nodes[i], b = nodes[j];
    const pf = pathfind(a.x, a.y, b.x, b.y);
    cache.set(k, pf.lengthPx);
    return pf.lengthPx;
  }

  // ---- Initiale Reihenfolge: Nearest-Neighbor ab Start ----
  const remaining = new Set(targets.map((_,idx)=>idx+1)); // Indizes in nodes
  const orderIdx = [];
  let cur = 0;
  while(remaining.size){
    let best=null, bestD=Infinity;
    for (const idx of remaining){
      const d = dist(cur, idx);
      if (d < bestD){ best=idx; bestD=d; }
    }
    orderIdx.push(best);
    remaining.delete(best);
    cur = best;
  }

  // ---- 2-Opt (offene Tour, nicht zum Start zurück) ----
  const n = orderIdx.length;
  let improved = true;
  while(improved){
    improved = false;
    for (let i=0; i<n-1; i++){
      const Ai = (i===0) ? 0 : orderIdx[i-1];
      const Bi = orderIdx[i];
      for (let k=i+1; k<n; k++){
        const Ck = orderIdx[k];
        const Dk = (k===n-1) ? null : orderIdx[k+1];
        const before = dist(Ai, Bi) + (Dk!=null ? dist(Ck, Dk) : 0);
        const after  = dist(Ai, Ck) + (Dk!=null ? dist(Bi, Dk) : 0);
        if (after + 1e-6 < before){
          // Segment [i..k] umdrehen
          const seg = orderIdx.slice(i,k+1).reverse();
          orderIdx.splice(i, seg.length, ...seg);
          improved = true;
        }
      }
    }
  }

  // ---- Schritte mit echten Pfaden ----
  let totalPx = 0;
  const steps = [];
  let prevIdx = 0;
  for (const idx of orderIdx){
    const a = nodes[prevIdx], b = nodes[idx];
    const pf = pathfind(a.x, a.y, b.x, b.y);
    steps.push({
      from: prevIdx===0 ? 'start' : nodes[prevIdx].id,
      to: nodes[idx].id,
      dist_px: pf.lengthPx,
      dist_m: ppm ? pf.lengthPx/ppm : null,
      path: pf.points
    });
    totalPx += pf.lengthPx;
    prevIdx = idx;
  }

  const order = orderIdx.map(i => ({ id: nodes[i].id, x: nodes[i].x, y: nodes[i].y }));
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