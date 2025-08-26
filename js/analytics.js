
import { state, appendTourLog } from './data.js';

export function computeKPIs(route, cartContainers){
  const stops = route?.order?.length || 0;
  const behaelter = cartContainers.length;
  const cluster = computeClusterScore(cartContainers);
  const dist_m = route?.total_m ?? 0;
  const eta_s = route?.total_s ?? 0;
  const tei = dist_m ? (behaelter / (dist_m/1000)) : 0; // per 1000m -> multiply later
  return { stops, behaelter, dist_m, eta_s, tei: tei, cluster, uncalibrated: !!route?.uncalibrated };
}

function computeClusterScore(conts){
  if (!conts.length) return 0;
  const total = conts.length;
  const bySite = new Map();
  for (const c of conts){
    const k = c.standort;
    bySite.set(k, (bySite.get(k)||0)+1);
  }
  const maxGroup = Math.max(...bySite.values());
  return maxGroup / total; // Anteil größter Cluster
}

export function logTour(kpis){
  appendTourLog({ ts: new Date().toISOString(), ...kpis });
}
