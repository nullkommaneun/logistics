// KPIs + Tour-Logging
import { appendTourLog } from './data.js';

export function computeKPIs(route, cartItems){
  // cartItems: [{ entry:{nr, siteId}, container:{...} }, ...]
  const stops = route?.order?.length || 0;
  const behaelter = Array.isArray(cartItems) ? cartItems.length : 0;
  const cluster = computeClusterScore(cartItems);
  const dist_m = route?.total_m ?? 0;
  const eta_s = route?.total_s ?? 0;
  const tei = dist_m ? (behaelter / (dist_m / 1000)) : 0; // Behälter pro 1000 m
  return { stops, behaelter, dist_m, eta_s, tei, cluster, uncalibrated: !!route?.uncalibrated };
}

export function logTour(kpis){
  // kpis stammt aus computeKPIs; erweitern um Zeitstempel
  appendTourLog({ ts: new Date().toISOString(), ...kpis });
}

// größter Anteil gleicher Ziel-Standorte (Cluster-Score 0..1)
function computeClusterScore(items){
  if (!Array.isArray(items) || items.length === 0) return 0;
  const bySite = new Map();
  for (const it of items){
    const key = it?.entry?.siteId ?? null;
    bySite.set(key, (bySite.get(key) || 0) + 1);
  }
  const maxGroup = Math.max(...bySite.values());
  return maxGroup / items.length;
}