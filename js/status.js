import { bus } from './bus.js';
import { state } from './data.js';

let areaEl;
let volatileMsg = null;

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
    const last = bus.getHistory().slice(-1)[0];
    volatileMsg = { type: last?.detail?.type || 'info', text: last?.detail?.text || '' };
  } else if (evt === 'status:clear') {
    volatileMsg = null;
  }
  render(evaluate());
}

function evaluate(){
  const msgs = [];

  if (volatileMsg && volatileMsg.text) { msgs.push({type:'error', text: volatileMsg.text}); }

  if (!state.mapImage){
    msgs.push({type:'error', text:'Noch kein Werksplanbild geladen. **Optional:** Tippe „Plan laden“, um eine Grafik zu hinterlegen. Für die Wegberechnung reicht das **Raster** mit Wänden/Toren.'});
  }
  if (!state.settings?.px_per_meter){
    msgs.push({type:'error', text:'Kalibrierung fehlt. Tippe **„Kalibrieren“**, markiere **zwei Punkte** und gib die Distanz in **Metern** ein.'});
  }
  if (!state.sites?.length){
    msgs.push({type:'error', text:'Auf dem Plan sind noch **keine Standorte** gesetzt. Tippe **„Standort+“** und setze die Punkte dort, wo die Behälter stehen.'});
  }
  if (!state.start){
    msgs.push({type:'error', text:'Startpunkt fehlt. Tippe **„Startpunkt“** und markiere deinen Start im Plan.'});
  }
  if (!state.containers?.length){
    msgs.push({type:'error', text:'Es sind noch **keine Behälterdaten** geladen. Lade die Container‑CSV unter **Daten → CSV Container**.'});
  }

  // Import-Warnungen (Container)
  for (const w of (state.warnings?.containers||[])){
    if (String(w).includes('Semikolon')) {
      msgs.push({type:'error', text:'Die Container‑Datei wirkt mit **Semikolons** exportiert. Besser: **Komma** als Trennzeichen.'});
    } else {
      msgs.push({type:'error', text:String(w)});
    }
  }

  return msgs;
}

function render(msgs){
  if (!areaEl) return;
  if (!msgs || msgs.length===0){ areaEl.className = 'status-area'; areaEl.innerHTML = ''; return; }
  areaEl.className = 'status-area error';
  areaEl.innerHTML = '<ul>'+ msgs.map(m=>'<li>'+escapeHtml(m.text)+'</li>').join('') +'</ul>';
}
function escapeHtml(s){ return String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }