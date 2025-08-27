import { bus } from './bus.js';
import { state, featureFlags, importContainersCSV, importSettingsJSON, exportAllJSON, importSitesJSON, exportSitesJSON } from './data.js';
import { searchContainers } from './search.js';
import { addToCart, removeFromCart, clearCart, getCartItems, getUniqueSiteIds } from './cart.js';
import { computeKPIs } from './analytics.js';          // ✅ statischer, sicherer Import
import { exportNavJSON } from './navgrid.js';

let els = {};
let routeCache = null;

function mPerS(){ const v = state.settings.speed_kmh_default || 7; return (v*1000)/3600; }
function distMetersFromStart(site){
  if (!state.start || !site) return null;
  const dx = (state.start.x||0) - site.x;
  const dy = (state.start.y||0) - site.y;
  const px = Math.hypot(dx, dy);
  const ppm = state.settings.px_per_meter;
  if (!ppm) return null;
  return px/ppm;
}

export async function initUI(){
  els = {
    searchInput: document.getElementById('searchInput'),
    addBtn: document.getElementById('addBtn'),
    acList: document.getElementById('acList'),
    cartList: document.getElementById('cartList'),
    exportTourBtn: document.getElementById('exportTourBtn'),
    clearCartBtn: document.getElementById('clearCartBtn'),
    kpiBar: document.getElementById('kpiBar'),
    stepBar: document.getElementById('stepBar'),
    distTotal: document.getElementById('distTotal'),
    etaTotal: document.getElementById('etaTotal'),
    fileMapBundle: document.getElementById('fileMapBundle'), // optional je nach HTML
    fileContainers: document.getElementById('fileContainers'),
    fileSitesJson: document.getElementById('fileSitesJson'),
    filePlanJson: document.getElementById('filePlanJson'),
    exportPlanBtn: document.getElementById('exportPlanBtn'),
    fileSettings: document.getElementById('fileSettings'),
    exportSitesBtn: document.getElementById('exportSitesBtn'),
    exportAllBtn: document.getElementById('exportAllBtn'),
    resetBtn: document.getElementById('resetBtn'),
    sumContainers: document.getElementById('sumContainers'),
    sumSites: document.getElementById('sumSites'),
    sumSchema: document.getElementById('sumSchema'),
    sumCal: document.getElementById('sumCal'),
    sumStart: document.getElementById('sumStart'),
    snackbar: document.getElementById('snackbar'),
    statusArea: document.getElementById('statusArea')
  };

  // Klartext-Status (fehlerresistent laden)
  try { (await import('./status.js')).initStatus(els.statusArea); }
  catch (e) { console.warn('status.js fehlt – weiter ohne Klartext-Status.', e); }

  els.searchInput.addEventListener('input', onSearchInput);
  els.searchInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ tryAddTopOrExact(); } });
  els.addBtn.addEventListener('click', tryAddTopOrExact);

  els.cartList.addEventListener('click', (e)=>{
    const li = e.target.closest('li[data-nr]'); if (!li) return;
    if (e.target.matches('button.remove')){ removeFromCart(li.dataset.nr); }
  });
  els.clearCartBtn.addEventListener('click', ()=>{ clearCart(); });

  els.exportTourBtn.addEventListener('click', exportTour);

  // --- Map-Bundle laden (falls vorhanden) ---
  if (els.fileMapBundle){
    els.fileMapBundle.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const txt = await f.text();
      const { importMapBundle } = await import('./bundle.js');
      const warnings = importMapBundle(txt) || [];
      snack('Map-Bundle geladen' + (warnings.length? ' – mit Hinweisen' : ''));
      refreshSummaries(); renderCart(); recomputeRoute();
    });
  }

  // --- Einzelimporte (weiterhin möglich) ---
  if (els.fileContainers){
    els.fileContainers.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const txt = await f.text();
      const warnings = importContainersCSV(txt);
      snack('Container importiert' + (warnings.length? ' – Warnungen vorhanden': ''));
      refreshSummaries(); renderCart(); recomputeRoute();
    });
  }
  if (els.fileSitesJson){
    els.fileSitesJson.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const txt = await f.text();
      importSitesJSON(txt);
      snack('Standorte geladen'); refreshSummaries(); recomputeRoute();
    });
  }
  if (els.filePlanJson){
    els.filePlanJson.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const txt = await f.text();
      const { importNavJSON } = await import('./navgrid.js'); // optional
      importNavJSON(txt);
      snack('Werksplan (Wände/Tore) geladen'); recomputeRoute();
    });
  }
  if (els.exportPlanBtn){
    els.exportPlanBtn.addEventListener('click', ()=>{
      const blob = exportNavJSON(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'bn-werksplan.json'; a.click(); URL.revokeObjectURL(url);
    });
  }
  if (els.exportSitesBtn){
    els.exportSitesBtn.addEventListener('click', ()=>{
      const blob = exportSitesJSON(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'bn-sites.json'; a.click(); URL.revokeObjectURL(url);
    });
  }
  if (els.fileSettings){
    els.fileSettings.addEventListener('change', async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const txt = await f.text();
      importSettingsJSON(txt);
      snack('Einstellungen geladen'); refreshSummaries(); recomputeRoute();
    });
  }

  if (els.exportAllBtn) els.exportAllBtn.addEventListener('click', exportAll);
  if (els.resetBtn) els.resetBtn.addEventListener('click', ()=>{ if(confirm('Alle lokalen Daten löschen?')){ localStorage.clear(); location.reload(); } });

  bus.on('cart:changed', ()=>{ renderCart(); recomputeRoute(); });
  bus.on('containers:updated', refreshSummaries);
  bus.on('sites:updated', ()=>{ refreshSummaries(); renderCart(); recomputeRoute(); });
  bus.on('settings:updated', refreshSummaries);
  bus.on('map:calibrated', refreshSummaries);
  bus.on('start:changed', ()=>{ refreshSummaries(); renderCart(); recomputeRoute(); });

  refreshSummaries();
  renderCart();
}

function refreshSummaries(){
  els.sumContainers.textContent = state.containers.length||'–';
  els.sumSites.textContent = state.sites.length||'–';
  els.sumSchema.textContent = state.settings.schema||'–';
  els.sumCal.textContent = state.settings.px_per_meter ? (state.settings.px_per_meter.toFixed(2)+' px/m') : 'unkalibriert';
  els.sumStart.textContent = state.start ? state.start.label : 'nicht gesetzt';
}

function onSearchInput(){
  const term = els.searchInput.value;
  const res = searchContainers(term, 20);
  renderAutocomplete(res);
}
function renderAutocomplete(list){
  const ac = els.acList; ac.innerHTML = '';
  list.forEach((c,i)=>{
    const div = document.createElement('div');
    div.setAttribute('role','option');
    div.setAttribute('aria-selected', i===0 ? 'true' : 'false');
    const alt = (c.standorte && c.standorte.length>1) ? ` · ALT:${c.standorte.join('|')}` : '';
    div.textContent = `${c.nr} · Ort ${c.standort??(c.standorte?.[0]??'–')} · ${c.farbe||'–'}${c.flags ? ' · '+c.flags : ''}${alt}`;
    div.addEventListener('click', ()=>{ addToCart(c.nr); els.searchInput.focus(); });
    ac.appendChild(div);
  });
}
function tryAddTopOrExact(){
  const term = els.searchInput.value.trim(); if (!term) return;
  const res = searchContainers(term, 20);
  const exact = res.find(c=>String(c.nr)===term);
  if (exact){ addToCart(exact.nr); snack('Hinzugefügt: '+exact.nr); }
  else if (res[0]){ addToCart(res[0].nr); snack('Hinzugefügt: '+res[0].nr); }
  else { snack('Keine Treffer'); }
  els.searchInput.select(); els.searchInput.focus();
}

function renderCart(){
  const items = getCartItems();
  els.cartList.innerHTML = '';
  for (const it of items){
    const c = it.container;
    const site = state.sites.find(s=>s.id===Number(it.entry.siteId));
    const dm = site ? distMetersFromStart(site) : null;
    const eta = dm!=null ? Math.round(dm / mPerS()) + ' s' : '–';
    const dmTxt = dm!=null ? Math.round(dm)+' m' : '–';
    const alt = (c.standorte && c.standorte.length>1) ? ` · ALT:${c.standorte.join('|')}` : '';
    const li = document.createElement('li');
    li.dataset.nr = c.nr;
    li.innerHTML = `
      <div>
        <div><strong>${c.nr}</strong> <span class="badge">${c.farbe||'–'}</span> ${c.flags?'<span class="badge">'+c.flags+'</span>':''}</div>
        <div class="meta">Ort ${it.entry.siteId??'–'}${alt} · Klasse ${c.klasse||'–'} · ${c.stapelbar==='true'?'stapelbar':'nicht stapelbar'} · ${(c.gewicht_kg||'–')} kg · <strong>${dmTxt}</strong> · ETA ${eta}</div>
      </div>
      <div><button class="btn remove">Entfernen</button></div>
    `;
    els.cartList.appendChild(li);
  }
}

async function recomputeRoute(){
  const uniqueSiteIds = getUniqueSiteIds();
  if (!state.start || uniqueSiteIds.length===0){
    routeCache = null; renderSteps(); renderKPIs(); return;
  }
  const start = { x: state.start.x, y: state.start.y, label: state.start.label };
  let computeRoute;
  if (featureFlags.routing === 'nearest'){
    ({ computeRoute } = await import('./routing/nearest.js')); // Luftlinie (Fallback)
  } else {
    ({ computeRoute } = await import('./routing/dijkstra.js')); // Wege-Routing + 2-Opt
  }
  const route = computeRoute(start, state.sites, uniqueSiteIds);
  routeCache = route;
  (await import('./bus.js')).bus.emit('routing:draw', { route });
  renderSteps(); renderKPIs();
}

function renderSteps(){
  const el = document.getElementById('stepBar');
  if (!routeCache){ el.textContent = 'Route: –'; return; }
  const parts = routeCache.steps.map(s=>{
    const m = s.dist_m!=null ? Math.round(s.dist_m) + ' m' : Math.round(s.dist_px) + ' px';
    return `→ Ort ${s.to} · ${m}`;
  });
  el.textContent = parts.length ? parts.join('  ') : 'Route: –';
  const total_m = routeCache.total_m!=null ? Math.round(routeCache.total_m)+' m' : Math.round(routeCache.totalPx)+' px';
  document.getElementById('distTotal').textContent = 'Distanz: ' + total_m;
  const total_s = routeCache.total_s!=null ? Math.round(routeCache.total_s) + ' s' : '–';
  document.getElementById('etaTotal').textContent = 'ETA: ' + total_s;
}

function renderKPIs(){
  const items = getCartItems();
  const k = computeKPIs(routeCache||{}, items);    // ✅ sicherer Funktionsaufruf
  const kpis = [
    ['Stops', k.stops],
    ['Behälter', k.behaelter],
    ['TEI', (k.tei*1000).toFixed(2)],
    ['Cluster', (k.cluster*100).toFixed(0)+'%'],
  ];
  els.kpiBar.innerHTML = kpis.map(([n,v])=>`<div class="kpi"><div>${n}</div><div><strong>${v}</strong></div></div>`).join('');
}

async function exportAll(){
  const blob = exportAllJSON();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'bn-export.json'; a.click(); URL.revokeObjectURL(url);
}
async function exportTour(){
  const { exportTourCSV } = await import('./data.js');
  const blob = exportTourCSV();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'bn-tourlogs.csv'; a.click(); URL.revokeObjectURL(url);
}
function snack(msg){
  const s = document.getElementById('snackbar');
  s.textContent = msg; s.classList.add('show'); setTimeout(()=>s.classList.remove('show'), 1600);
}