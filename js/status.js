// Status-Engine: zeigt Klartext-Hinweise in Rot im #statusArea
import { bus } from './bus.js';
import { state } from './data.js';

let areaEl;
let volatileMsg = null; // temporäre Hinweise (z. B. "Kalibrierung aktiv …")

export function initStatus(el){
  areaEl = el;
  const evts = [
    'containers:updated','sites:updated','settings:updated','map:calibrated','map:image',
    'start:changed','cart:changed','routing:draw','warnings:update',
    'status:msg','status:clear'
  ];
  evts.forEach(e => bus.on(e, (_,evt)=>onAny(evt)));
  render(evaluate());
}

function onAny(evt){
  if (evt === 'status:msg') {
    // detail.text, detail.type ('info'|'error')
    const last = bus.getHistory().slice(-1)[0];
    volatileMsg = { type: last?.detail?.type || 'info', text: last?.detail?.text || '' };
  } else if (evt === 'status:clear') {
    volatileMsg = null;
  }
  render(evaluate());
}

function evaluate(){
  const msgs = [];

  // Temporäre Meldung ganz oben (z. B. während Kalibrierung)
  if (volatileMsg && volatileMsg.text) {
    msgs.push({type: 'error', text: volatileMsg.text});
  }

  // Grundzustand
  if (!state.containers || state.containers.length === 0){
    msgs.push({type:'error', text:'Keine Behälterdaten gefunden. Lade unter **Daten → CSV Container** eine Komma‑CSV mit Header `typ,farbe,standort,flags,klasse,stapelbar,gewicht_kg`.'});
  }
  if (!state.sites || state.sites.length === 0){
    msgs.push({type:'error', text:'Keine Standorte vorhanden. Lade **CSV Standorte** mit Spalten `id,x,y,halle,tags,kapazitaet,verbot_klassen`.'});
  }

  // Referenz-Validierung Container → Sites
  if (state.sites?.length && state.containers?.length){
    const known = new Set(state.sites.map(s=>Number(s.id)));
    let invalid = 0;
    for (const c of state.containers){
      if (c.standort!==undefined && c.standort!=='' && !known.has(Number(c.standort))) invalid++;
    }
    if (invalid>0){
      msgs.push({type:'error', text:`${invalid} Behälter verweisen auf unbekannte Standort‑IDs. Prüfe das Feld **standort** in \`containers.csv\` gegen \`sites.csv\`.`});
    }
  }

  if (!state.mapImage){
    msgs.push({type:'error', text:'Kein Plan geladen. Lade über **Plan laden** ein Werksplan‑Bild (PNG/JPG).'});
  }
  if (!state.settings?.px_per_meter){
    msgs.push({type:'error', text:'Kalibrierung fehlt. Tippe **Kalibrieren**, markiere **2 Punkte** und gib die Distanz in **m** ein.'});
  }
  if (!state.start){
    msgs.push({type:'error', text:'Startpunkt nicht gesetzt. Tippe **Startpunkt** und markiere den Start im Plan.'});
  }
  if (!state.cart?.length){
    msgs.push({type:'error', text:'Keine Ziele in der Tourliste. Gib eine **6‑stellige Behälter‑Nr.** ein und füge sie hinzu.'});
  }

  // Import-Warnungen (in Rot, wie gewünscht)
  for (const arr of [state.warnings?.containers||[], state.warnings?.sites||[], state.warnings?.settings||[]]){
    for (const w of arr){ msgs.push({type:'error', text:String(w)}); }
  }

  return msgs;
}

function render(msgs){
  if (!areaEl) return;
  if (!msgs || msgs.length===0){
    areaEl.className = 'status-area';
    areaEl.innerHTML = '';
    return;
  }
  areaEl.className = 'status-area error';
  areaEl.innerHTML = '<ul>'+ msgs.map(m=>'<li>'+escapeHtml(m.text)+'</li>').join('') +'</ul>';
}

function escapeHtml(s){ return String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }