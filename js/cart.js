
import { bus } from './bus.js';
import { state, LS_KEYS } from './data.js';

export function addToCart(nr){
  nr = String(nr||'').trim();
  if (!nr) return;
  const exists = state.containers.find(c=>String(c.nr)===nr);
  if (!exists) { bus.emit('cart:error', {msg:'Unbekannte Nummer'}); return; }
  state.cart.push(nr);
  persist();
  bus.emit('cart:add', {nr});
  bus.emit('cart:changed', {});
}
export function removeFromCart(nr){
  const idx = state.cart.findIndex(x=>x===nr);
  if (idx>=0){ state.cart.splice(idx,1); persist(); bus.emit('cart:remove',{nr}); bus.emit('cart:changed',{}); }
}
export function clearCart(){
  state.cart = []; persist(); bus.emit('cart:clear',{}); bus.emit('cart:changed',{});
}
export function getCartContainers(){
  return state.cart.map(nr => state.containers.find(c=>String(c.nr)===nr)).filter(Boolean);
}
function persist(){ localStorage.setItem(LS_KEYS.cart, JSON.stringify(state.cart)); }

export function getUniqueSiteIds(){
  const set = new Set();
  for (const c of getCartContainers()){
    if (c && Number.isFinite(c.standort)) set.add(Number(c.standort));
  }
  return Array.from(set);
}
