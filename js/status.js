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
    msgs.push({type:'error', text:'Noch kein Werksplan geladen. Tippe **„Plan laden“** und wähle ein Bild (PNG/JPG).'});
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

  // Container, die auf nicht vorhandene Standort-IDs verweisen
  if (state.sites?.length && state.containers?.length){
    const known = new Set(state.sites.map(s=>Number(s.id)));
    let invalid = 0;
    for (const c of state.containers){
      const ids = c.standorte?.length ? c.standorte : (Number.isFinite(c.standort)? [c.standort] : []);
      if (!ids.length) continue;
      const ok = ids.some(id => known.has(Number(id)));
      if (!ok) invalid++;
    }
    if (invalid>0){
      msgs.push({type:'error', text:`In der Containerliste verweisen **${invalid} Einträge** auf nicht vorhandene Standort‑IDs. Bitte IDs prüfen oder die passenden Standorte auf dem Plan setzen.`});
    }
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