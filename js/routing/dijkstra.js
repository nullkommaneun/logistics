
// Stub for future graph-based routing (v3)
export function computeRoute(start, sites, siteIds){
  // For now, just delegate to Nearest Neighbor semantics by returning straight order
  const siteMap = new Map(sites.map(s=>[s.id, s]));
  const order = siteIds.map(id=>siteMap.get(id)).filter(Boolean);
  // Return minimal structure compatible with nearest.js for UI reuse
  return { order, steps: [], totalPx: 0, total_m: null, total_s: null, uncalibrated: true };
}
