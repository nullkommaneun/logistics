
import { state } from './data.js';

export function searchContainers(term, limit=10){
  const q = String(term||'').trim();
  if (!q) return [];
  const isNumeric = /^\d+$/.test(q);
  const hay = state.containers;
  let res = [];
  if (isNumeric){
    res = hay.filter(c=>String(c.nr).includes(q));
  } else {
    // allow search by flags or farbe
    const tq = q.toLowerCase();
    res = hay.filter(c=>(c.flags||'').toLowerCase().includes(tq) || (c.farbe||'').toLowerCase().includes(tq));
  }
  return res.slice(0,limit);
}
