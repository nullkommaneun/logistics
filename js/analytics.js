import { state, } from './data.js';

export function computeKPIs(route, cartItems){
  const stops = route?.order?.length || 0;
  const behaelter = cartItems.length;
  const cluster = computeClusterScore(cartItems);
  const dist_m = route?.total_m ?? 0;
  const eta_s = route?.total_s ?? 0;
  const tei = dist_m ? (behaelter / (dist_m/1000)) : 0;
  return { stops, behaelter, dist_m, eta_s, tei, cluster, uncalibrated: !!route?.uncalibrated };
}

// Cluster: größter Anteil gleicher Ziel-Standorte
function computeClusterScore(items){
  if (!items.length) return 0;
  const bySite = new Map();
  for (const it of items){
    const k = it.entry.siteId ?? null;
    bySite.set(k, (bySite.get(k)||0)+1);
  }
  const maxGroup = Math.max(...bySite.values());
  return maxGroup / items.length;
}