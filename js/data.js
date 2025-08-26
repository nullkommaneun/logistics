import { bus } from './bus.js';

export const LS_KEYS = {
  containers: 'bn_containers_csv',
  sites: 'bn_sites_csv',
  settings: 'bn_settings_json',
  mapImage: 'bn_map_image',
  start: 'bn_start',
  featureFlags: 'bn_feature_flags',
  cart: 'bn_cart',
  tourLogs: 'bn_tour_logs'
};

export const defaults = {
  settings: {
    schema: '1.1',
    updatedAt: new Date().toISOString().slice(0,10),
    px_per_meter: null,
    speed_kmh_default: 7,
    hallen: {},
    featureFlags: { routing:'nearest', capacity:'none', uiDensity:'comfort' }
  },
  featureFlags: { routing:'nearest', capacity:'none', uiDensity:'comfort' }
};

export const state = {
  containers: [],
  sites: [],
  settings: structuredClone(defaults.settings),
  start: null,
  mapImage: null,
  cart: [],
  warnings: { containers:[], sites:[], settings:[] } // 🔴 menschenlesbare Import-Warnungen
};

export let featureFlags = loadFlags();

function loadFlags(){
  try{
    const s = localStorage.getItem(LS_KEYS.featureFlags);
    if (s) return JSON.parse(s);
  }catch(e){}
  return structuredClone(defaults.featureFlags);
}
export function saveFlags(){ localStorage.setItem(LS_KEYS.featureFlags, JSON.stringify(featureFlags)); }

export function initFromLocalStorage(){
  try{
    const c = localStorage.getItem(LS_KEYS.containers);
    const s = localStorage.getItem(LS_KEYS.sites);
    const j = localStorage.getItem(LS_KEYS.settings);
    const m = localStorage.getItem(LS_KEYS.mapImage);
    const st = localStorage.getItem(LS_KEYS.start);
    const cart = localStorage.getItem(LS_KEYS.cart);
    if (c){ state.containers = parseContainersCSV(c).rows; }
    if (s){ state.sites = parseSitesCSV(s).rows; }
    if (j){
      state.settings = migrateSettings(JSON.parse(j));
      if (state.settings.featureFlags) featureFlags = state.settings.featureFlags;
    }
    if (m) state.mapImage = m;
    if (st) state.start = JSON.parse(st);
    if (cart) state.cart = JSON.parse(cart);
  }catch(err){
    console.warn('initFromLocalStorage', err);
  }
}

export function resetAll(){ Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k)); }
export function getLocalStorageSummary(){
  const out = {};
  for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); out[k] = (localStorage.getItem(k)||'').length + ' bytes'; }
  return out;
}
export function dumpState(){
  return {
    containers: state.containers.slice(0,5).concat(state.containers.length>5?['…']:[]),
    sites: state.sites.slice(0,5).concat(state.sites.length>5?['…']:[]),
    settings: state.settings, start: state.start, flags: featureFlags, cart: state.cart
  };
}

// ---------- CSV parsing & validation (robust, menschenlesbare Warnungen) ----------
function detectDelimiter(text){
  const sample = text.slice(0, 2000);
  const c = (sample.match(/,/g)||[]).length;
  const s = (sample.match(/;/g)||[]).length;
  return s > c ? ';' : ',';
}
function splitSmart(line, delim){ return line.split(delim).map(x=>x.trim()); }

export function parseContainersCSV(text){
  const warnings = [];
  const delim = detectDelimiter(text);
  if (delim === ';') warnings.push('CSV mit **Semikolon** erkannt. Import funktioniert, empfohlen ist **Komma** als Trennzeichen.');

  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim().length>0);
  if (!lines.length) return { headers:[], rows:[], warnings: warnings.concat(['Datei ist leer.']) };

  const headers = splitSmart(lines.shift(), delim);
  const expected = ['typ','farbe','standort','flags','klasse','stapelbar','gewicht_kg'];
  const hasNrAlias = headers.includes('nr') && !headers.includes('typ');
  if (hasNrAlias) warnings.push('Spalte **typ** fehlt – **nr** wird als Behälter‑Nr. verwendet.');
  expected.forEach(h=>{ if(!headers.includes(h) && !(h==='typ' && hasNrAlias)) warnings.push('Spalte **'+h+'** fehlt.'); });

  const rows = [];
  let rowIdx = 1;
  for (const line of lines){
    rowIdx++;
    const parts = splitSmart(line, delim);
    const rec = {};
    headers.forEach((h,i)=>rec[h]=parts[i]);
    rec.nr = rec.typ || rec.nr; // alias
    if (rec.nr) rec.nr = String(rec.nr).trim();

    if (rec.standort!==undefined) {
      const n = Number(rec.standort);
      if (Number.isNaN(n)) { warnings.push(`Zeile ${rowIdx}: **standort** ist keine Zahl.`); }
      rec.standort = n;
    }

    if (rec.stapelbar!==undefined) {
      rec.stapelbar = String(rec.stapelbar).toLowerCase()==='true' ? 'true' : 'false';
    }

    if (rec.gewicht_kg!==undefined && rec.gewicht_kg!==''){
      const g = Number(rec.gewicht_kg);
      if (Number.isNaN(g)) warnings.push(`Zeile ${rowIdx}: **gewicht_kg** ist keine Zahl (Dezimalpunkt verwenden).`);
      rec.gewicht_kg = g;
    }

    rows.push(rec);
  }
  return { headers, rows, warnings };
}

export function parseSitesCSV(text){
  const warnings = [];
  const delim = detectDelimiter(text);
  if (delim === ';') warnings.push('Standorte: Semikolon erkannt. Empfohlen ist **Komma** als Trennzeichen.');

  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim().length>0);
  if (!lines.length) return { headers:[], rows:[], warnings: warnings.concat(['Datei ist leer.']) };

  const headers = splitSmart(lines.shift(), delim);
  const expected = ['id','x','y','halle','tags','kapazitaet','verbot_klassen'];
  expected.forEach(h=>{ if(!headers.includes(h)) warnings.push('Spalte **'+h+'** fehlt.'); });

  const rows = [];
  let rowIdx = 1;
  for (const line of lines){
    rowIdx++;
    const parts = splitSmart(line, delim);
    const rec = {};
    headers.forEach((h,i)=>rec[h]=parts[i]);

    rec.id = Number(rec.id);
    rec.x = Number(rec.x);
    rec.y = Number(rec.y);
    if (Number.isNaN(rec.id)) warnings.push(`Zeile ${rowIdx}: **id** ist keine Zahl.`);
    if (Number.isNaN(rec.x) || Number.isNaN(rec.y)) warnings.push(`Zeile ${rowIdx}: **x/y** sind keine Zahlen.`);

    rows.push(rec);
  }
  return { headers, rows, warnings };
}

export function migrateSettings(s){
  const out = { ...defaults.settings, ...s };
  if (!out.schema) out.schema = '1.0';
  if (out.schema === '1.0') { if (out.px_per_meter == null) out.px_per_meter = null; out.schema = '1.1'; }
  if (!out.featureFlags) out.featureFlags = structuredClone(defaults.featureFlags);
  return out;
}

// ---------- persistence helpers ----------
export function importContainersCSV(text){
  const {rows, warnings} = parseContainersCSV(text);
  state.containers = rows;
  state.warnings.containers = warnings;
  localStorage.setItem(LS_KEYS.containers, text);
  bus.emit('containers:updated', { count: rows.length, warnings });
  bus.emit('warnings:update', {});
  return warnings;
}
export function importSitesCSV(text){
  const {rows, warnings} = parseSitesCSV(text);
  state.sites = rows;
  state.warnings.sites = warnings;
  localStorage.setItem(LS_KEYS.sites, text);
  bus.emit('sites:updated', { count: rows.length, warnings });
  bus.emit('warnings:update', {});
  return warnings;
}
export function importSettingsJSON(text){
  const obj = migrateSettings(JSON.parse(text));
  state.settings = obj;
  state.warnings.settings = []; // hier könnten schema/migrations-Warnungen ergänzt werden
  featureFlags = obj.featureFlags || featureFlags;
  saveFlags();
  localStorage.setItem(LS_KEYS.settings, JSON.stringify(obj));
  bus.emit('settings:updated', { obj });
  bus.emit('warnings:update', {});
}

export function setMapImage(dataUrl){
  state.mapImage = dataUrl;
  localStorage.setItem(LS_KEYS.mapImage, dataUrl);
  bus.emit('map:image', {});
}
export function setStartPointFromSite(siteId){
  const site = state.sites.find(s=>s.id===siteId);
  if (!site) return;
  state.start = { type:'site', id: site.id, x: site.x, y: site.y, label: 'Ort '+site.id };
  localStorage.setItem(LS_KEYS.start, JSON.stringify(state.start));
  bus.emit('start:changed', { start: state.start });
}
export function setStartPoint(x, y){
  state.start = { type:'point', x, y, label: 'Start ('+Math.round(x)+','+Math.round(y)+')' };
  localStorage.setItem(LS_KEYS.start, JSON.stringify(state.start));
  bus.emit('start:changed', { start: state.start });
}

export function pxToMeters(px){
  const ppm = state.settings.px_per_meter;
  if (!ppm) return null;
  return px / ppm;
}

// ---------- Export ----------
export function exportAllJSON(){
  const out = {
    containers_csv: localStorage.getItem(LS_KEYS.containers)||'',
    sites_csv: localStorage.getItem(LS_KEYS.sites)||'',
    settings_json: localStorage.getItem(LS_KEYS.settings)||JSON.stringify(state.settings),
    map_image: localStorage.getItem(LS_KEYS.mapImage)||null
  };
  return new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
}

// ---------- Tour logs ----------
export function appendTourLog(log){
  const key = LS_KEYS.tourLogs;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e){}
  list.push(log);
  localStorage.setItem(key, JSON.stringify(list));
}
export function exportTourCSV(){
  const key = LS_KEYS.tourLogs;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e){}
  const headers = ['ts','stops','behaelter','dist_m','eta_s','tei','cluster','uncalibrated'];
  const lines = [headers.join(',')];
  for (const r of list){
    lines.push([r.ts, r.stops, r.behaelter, Math.round(r.dist_m||0), Math.round(r.eta_s||0), (r.tei||0).toFixed(2), (r.cluster||0).toFixed(2), r.uncalibrated?'1':'0'].join(','));
  }
  return new Blob([lines.join('\n')], {type:'text/csv'});
}