import { bus } from './bus.js';
import { nav, saveNavGrid } from './navgrid.js';
import { state, LS_KEYS } from './data.js';

/**
 * Importiert ein bn-mapbundle-JSON und schreibt Grid, Standorte, Kalibrierung, Bild.
 * @returns {string[]} Warnungen (lesbar)
 */
export function importMapBundle(text){
  const warnings = [];
  let obj;
  try{
    obj = JSON.parse(text);
  }catch(e){
    warnings.push('Map‑Bundle: ungültiges JSON.');
    bus.emit('status:msg', {type:'error', text:'Die Map‑Datei ist kein gültiges JSON.'});
    return warnings;
  }

  // Schema prüfen (tolerant)
  const schema = String(obj.schema||'');
  if (!schema.startsWith('bn-mapbundle-')){
    warnings.push('Unbekanntes Schema – Datei wird dennoch eingelesen.');
  }

  // Grid
  if (obj.grid && Number.isFinite(obj.grid.cell) && Number.isFinite(obj.grid.cols) && Number.isFinite(obj.grid.rows)){
    nav.cell = Number(obj.grid.cell);
    nav.cols = Number(obj.grid.cols);
    nav.rows = Number(obj.grid.rows);
    const walls = Array.isArray(obj.grid.walls_cells) ? obj.grid.walls_cells : [];
    const zones = Array.isArray(obj.grid.zones_cells) ? obj.grid.zones_cells : [];
    nav.walls = new Set(walls);
    nav.zones = new Set(zones);
    saveNavGrid();
  } else {
    warnings.push('Grid‑Informationen unvollständig (cell/cols/rows fehlen).');
  }

  // Kalibrierung
  const ppm = obj?.calibration?.px_per_meter;
  if (Number.isFinite(ppm)){
    state.settings.px_per_meter = Number(ppm);
    localStorage.setItem(LS_KEYS.settings, JSON.stringify(state.settings));
    bus.emit('map:calibrated', { px_per_meter: state.settings.px_per_meter });
  } else {
    warnings.push('Kalibrierung fehlt. ETA/Distanz sind unkalibriert.');
  }

  // Standorte
  if (Array.isArray(obj.sites)){
    const cleaned = [];
    for (const s of obj.sites){
      const id = Number(s.id), x = Number(s.x), y = Number(s.y);
      if (!Number.isFinite(id) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      cleaned.push({ id, x, y, halle: String(s.name||s.halle||'') });
    }
    state.sites = cleaned;
    localStorage.setItem(LS_KEYS.sites, JSON.stringify(state.sites));
    bus.emit('sites:updated', { count: state.sites.length });
  } else {
    warnings.push('Keine Standorte im Bundle gefunden.');
  }

  // Bild (optional)
  if (obj.image && obj.image.dataUrl){
    try{
      state.mapImage = String(obj.image.dataUrl);
      localStorage.setItem(LS_KEYS.mapImage, state.mapImage);
      bus.emit('map:image', {});
    }catch{ warnings.push('Planbild konnte nicht übernommen werden.'); }
  }

  // Zusammenfassung / Status
  if (warnings.length){
    bus.emit('status:msg', {type:'error', text:'Map‑Bundle geladen – mit Hinweisen. Details siehe unten.'});
  } else {
    bus.emit('status:msg', {type:'info', text:'Map‑Bundle erfolgreich geladen.'});
    setTimeout(()=>bus.emit('status:clear',{}), 1200);
  }
  return warnings;
}