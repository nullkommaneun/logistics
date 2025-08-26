import { bus } from './bus.js';
import { state, LS_KEYS } from './data.js';

function chooseSiteIdForContainer(cont){
  const candidates = Array.isArray(cont.standorte) && cont.standorte.length
    ? Array.from(new Set(cont.standorte.map(Number).filter(Number.isFinite)))
    : (Number.isFinite(cont.standort) ? [Number(cont.standort)] : []);

  if (!candidates.length) return null;
  const start = state.start ? { x: state.start.x, y: state.start.y } : null;

  const siteObjs = candidates
    .map(id => state.sites.find(s => Number(s.id) === id))
    .filter(Boolean);

  if (!siteObjs.length) return null;

  if (!start) return siteObjs[0].id;

  siteObjs.sort((a,b)=>{
    const da = Math.hypot(start.x - a.x, start.y - a.y);
    const db = Math.hypot(start.x - b.x, start.y - b.y);
    return da - db;
  });
  return siteObjs[0].id;
}
function persist(){ localStorage.setItem(LS_KEYS.cart, JSON.stringify(state.cart)); }

function normalizeCart(){
  let changed = false;
  state.cart = state.cart.map(entry=>{
    if (typeof entry === 'string'){
      const c = state.containers.find(x=>String(x.nr)===entry);
      const siteId = c ? chooseSiteIdForContainer(c) : null;
      changed = true;
      return { nr: entry, siteId };
    }
    return entry;
  });
  if (changed) persist();
}
function reassignSites(){
  let changed = false;
  state.cart = state.cart.map(entry=>{
    const c = state.containers.find(x=>String(x.nr)===entry.nr);
    if (!c) return entry;
    const newSite = chooseSiteIdForContainer(c);
    if (newSite && newSite !== entry.siteId){ changed = true; return { nr: entry.nr, siteId: newSite }; }
    return entry;
  });
  if (changed){ persist(); bus.emit('cart:changed', {}); }
}
bus.on('start:changed', reassignSites);
bus.on('sites:updated', reassignSites);
bus.on('containers:updated', ()=>{ normalizeCart(); reassignSites(); });

export function addToCart(nr){
  nr = String(nr||'').trim();
  if (!nr) return;
  const cont = state.containers.find(c=>String(c.nr)===nr);
  if (!cont) { bus.emit('cart:error', {msg:'Unbekannte Nummer'}); return; }
  const siteId = chooseSiteIdForContainer(cont);
  state.cart.push({ nr, siteId });
  persist();
  bus.emit('cart:add', {nr, siteId});
  bus.emit('cart:changed', {});
}
export function removeFromCart(nr){
  const idx = state.cart.findIndex(e => (typeof e==='string' ? e===nr : e.nr===nr));
  if (idx>=0){ state.cart.splice(idx,1); persist(); bus.emit('cart:remove',{nr}); bus.emit('cart:changed',{}); }
}
export function clearCart(){
  state.cart = []; persist(); bus.emit('cart:clear',{}); bus.emit('cart:changed',{});
}
export function getCartItems(){
  normalizeCart();
  return state.cart.map(entry=>{
    const cont = state.containers.find(c=>String(c.nr)=== (typeof entry==='string'? entry : entry.nr));
    const siteId = (typeof entry==='string') ? (cont? chooseSiteIdForContainer(cont) : null) : entry.siteId;
    return cont ? { entry: { nr: cont.nr, siteId }, container: cont } : null;
  }).filter(Boolean);
}
export function getUniqueSiteIds(){
  const items = getCartItems();
  const set = new Set();
  for (const it of items){ if (Number.isFinite(it.entry.siteId)) set.add(Number(it.entry.siteId)); }
  return Array.from(set);
}