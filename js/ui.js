
import { bus } from './bus.js';
import { state, featureFlags, saveFlags, initFromLocalStorage, importContainersCSV, importSitesCSV, importSettingsJSON, exportAllJSON, setStartPointFromSite } from './data.js';
import { searchContainers } from './search.js';
import { addToCart, removeFromCart, clearCart, getCartContainers, getUniqueSiteIds } from './cart.js';
import { computeKPIs, logTour } from './analytics.js';

let els = {};
let routeCache = null;

  const ppm = state.settings.px_per_meter;
  const speed_kmh = state.settings.speed_kmh_default || 7;
  const m_per_s = (speed_kmh * 1000) / 3600;
  function distFromStartMeters(site){
    if (!state.start || !site) return null;
    const dx = (state.start.x || 0) - site.x;
    const dy = (state.start.y || 0) - site.y;
    const px = Math.hypot(dx, dy);
    if (!ppm) return null;
    return px / ppm;
  }

export function initUI(){
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
    // data
    fileContainers: document.getElementById('fileContainers'),
    fileSites: document.getElementById('fileSites'),
    fileSettings: document.getElementById('fileSettings'),
    exportAllBtn: document.getElementById('exportAllBtn'),
    resetBtn: document.getElementById('resetBtn'),
    sumContainers: document.getElementById('sumContainers'),
    sumSites: document.getElementById('sumSites'),
    sumSchema: document.getElementById('sumSchema'),
    sumCal: document.getElementById('sumCal'),
    sumStart: document.getElementById('sumStart'),
    snackbar: document.getElementById('snackbar'),
  };

  document.body.classList.toggle('density-compact', featureFlags.uiDensity==='compact');

  els.searchInput.addEventListener('input', onSearchInput);
  els.searchInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){ tryAddTopOrExact(); }
  });
  els.addBtn.addEventListener('click', tryAddTopOrExact);

  els.cartList.addEventListener('click', (e)=>{
    const li = e.target.closest('li[data-nr]'); if (!li) return;
    if (e.target.matches('button.remove')){ removeFromCart(li.dataset.nr); }
  });
  els.clearCartBtn.addEventListener('click', ()=>{ clearCart(); });
  els.exportTourBtn.addEventListener('click', exportTour);

  // Import handlers
  els.fileContainers.addEventListener('change', async (e)=>{
    const txt = await e.target.files[0].text(); const warnings = importContainersCSV(txt); snack('Container importiert' + (warnings.length? ' – Warnungen: '+warnings.join('; '):'')); refreshSummaries(); renderCart(); recomputeRoute();
  });
  els.fileSites.addEventListener('change', async (e)=>{
    const txt = await e.target.files[0].text(); const warnings = importSitesCSV(txt); snack('Standorte importiert' + (warnings.length? ' – Warnungen: '+warnings.join('; '):'')); refreshSummaries(); recomputeRoute();
  });
  els.fileSettings.addEventListener('change', async (e)=>{
    const txt = await e.target.files[0].text(); importSettingsJSON(txt); snack('Einstellungen geladen'); refreshSummaries(); recomputeRoute();
  });
  els.exportAllBtn.addEventListener('click', exportAll);
  els.resetBtn.addEventListener('click', ()=>{ if(confirm('Alle lokalen Daten löschen?')){ localStorage.clear(); location.reload(); } });

  bus.on('cart:changed', ()=>{ renderCart(); recomputeRoute(); });
  bus.on('containers:updated', refreshSummaries);
  bus.on('sites:updated', refreshSummaries);
  bus.on('settings:updated', refreshSummaries);
  bus.on('map:calibrated', refreshSummaries);
  bus.on('start:changed', refreshSummaries);

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
  const ac = els.acList;
  ac.innerHTML = '';
  list.forEach((c,i)=>{
    const div = document.createElement('div');
    div.setAttribute('role','option');
    div.setAttribute('aria-selected', i===0 ? 'true' : 'false');
    div.textContent = `${c.nr} · Ort ${c.standort} · ${c.farbe}${c.flags ? ' · '+c.flags : ''}`;
    div.addEventListener('click', ()=>{ addToCart(c.nr); els.searchInput.focus(); });
    ac.appendChild(div);
  });
}

function tryAddTopOrExact(){
  const term = els.searchInput.value.trim();
  if (!term) return;
  const res = searchContainers(term, 20);
  const exact = res.find(c=>String(c.nr)===term);
  if (exact){ addToCart(exact.nr); snack('Hinzugefügt: '+exact.nr); }
  else if (res[0]){ addToCart(res[0].nr); snack('Hinzugefügt: '+res[0].nr); }
  else { snack('Keine Treffer'); }
  els.searchInput.select(); els.searchInput.focus();
}

function renderCart(){
  const list = getCartContainers();
  els.cartList.innerHTML = '';
  for (const c of list){
    const li = document.createElement('li');
    li.dataset.nr = c.nr;
    const site = state.sites.find(s=>s.id===Number(c.standort));
    const dm = distFromStartMeters(site);
    const eta = dm!=null ? Math.round(dm / m_per_s) + ' s' : '–';
    const dmTxt = dm!=null ? Math.round(dm)+' m' : '–';
    li.innerHTML = `
      <div>
        <div><strong>${c.nr}</strong> <span class="badge">${c.farbe||'–'}</span> ${c.flags?'<span class="badge">'+c.flags+'</span>':''}</div>
        <div class="meta">Ort ${c.standort} · Klasse ${c.klasse||'–'} · ${c.stapelbar==='true'?'stapelbar':'nicht stapelbar'} · ${(c.gewicht_kg||'–')} kg · <strong>${dmTxt}</strong> · ETA ${eta}</div>
      </div>
      <div>
        <button class="btn remove">Entfernen</button>
      </div>
    `;
    els.cartList.appendChild(li);
  }
}

async function recomputeRoute(){
  // dynamic routing import based on feature flag
  const uniqueSiteIds = getUniqueSiteIds();
  if (!state.start || uniqueSiteIds.length===0){
    routeCache = null;
    renderSteps(); renderKPIs();
    return;
  }
  const start = { x: state.start.x, y: state.start.y, label: state.start.label };
  let computeRoute;
  if (featureFlags.routing === 'nearest'){
    ({ computeRoute } = await import('./routing/nearest.js'));
  } else {
    ({ computeRoute } = await import('./routing/dijkstra.js'));
  }
  const route = computeRoute(start, state.sites, uniqueSiteIds);
  routeCache = route;
  // notify map to draw polyline
  bus.emit('routing:draw', { route });
  renderSteps();
  renderKPIs();
}

function renderSteps(){
  const el = document.getElementById('stepBar');
  if (!routeCache){ el.textContent = 'Route: –'; return; }
  const parts = routeCache.steps.map(s=>{
    const m = s.dist_m!=null ? Math.round(s.dist_m) + ' m' : Math.round(s.dist_px) + ' px';
    return `→ Ort ${s.to} · ${m}`;
  });
  el.textContent = parts.length ? parts.join('  ') : 'Route (Stub): Reihenfolge ohne Distanzen';
  const total_m = routeCache.total_m!=null ? Math.round(routeCache.total_m)+' m' : Math.round(routeCache.totalPx)+' px';
  document.getElementById('distTotal').textContent = 'Distanz: ' + total_m;
  const total_s = routeCache.total_s!=null ? Math.round(routeCache.total_s) + ' s' : '–';
  document.getElementById('etaTotal').textContent = 'ETA: ' + total_s;
}

function renderKPIs(){
  const list = getCartContainers();
  const k = computeKPIs(routeCache||{}, list);
  const kpis = [
    ['Stops', k.stops],
    ['Behälter', k.behaelter],
    ['TEI', (k.tei*1000).toFixed(2)], // Behälter je 1000 m
    ['Cluster', (k.cluster*100).toFixed(0)+'%'],
  ];
  els.kpiBar.innerHTML = kpis.map(([n,v])=>`<div class="kpi"><div>${n}</div><div><strong>${v}</strong></div></div>`).join('');
  if (k.behaelter && k.stops){ logTour(k); }
}

function snack(msg){
  const s = document.getElementById('snackbar');
  s.textContent = msg;
  s.classList.add('show');
  setTimeout(()=>s.classList.remove('show'), 1600);
}

async function exportAll(){
  const blob = exportAllJSON();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bn-export.json'; a.click();
  URL.revokeObjectURL(url);
}

async function exportTour(){
  const { exportTourCSV } = await import('./data.js');
  const blob = exportTourCSV();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bn-tourlogs.csv'; a.click();
  URL.revokeObjectURL(url);
}

