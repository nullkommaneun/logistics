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

function hasGrid(){
  try{
    const raw = localStorage.getItem('bn_navgrid'); if (!raw) return false;
    const o = JSON.parse(raw);
    return !!o && (Array.isArray(o.walls) || Array.isArray(o.blocked) || Array.isArray(o.zones));
  }catch{ return false; }
}

function evaluate(){
  const msgs = [];

  if (volatileMsg && volatileMsg.text) { msgs.push({type:'error', text: volatileMsg.text}); }

  if (!hasGrid()){
    msgs.push({type:'error', text:'Noch **keine Karte** geladen. Tippe **„Map‑Bundle laden“** und wähle die Datei aus dem Editor.'});
  }
  if (!state.settings?.px_per_meter){
    msgs.push({type:'error', text:'**Kalibrierung fehlt**. Bitte im **Editor** kalibrieren und das Bundle erneut exportieren.'});
  }
  if (!state.sites?.length){
    msgs.push({type:'error', text:'Im Bundle sind **keine Standorte** enthalten. Bitte den Editor verwenden, um Standorte zu setzen.'});
  }
  if (!state.start){
    msgs.push({type:'error', text:'**Startpunkt fehlt**. Tippe **„Startpunkt“** und markiere deinen Start im Plan.'});
  }
  if (!state.containers?.length){
    msgs.push({type:'error', text:'Es sind noch **keine Behälterdaten** geladen. Lade die Container‑CSV unter **Daten → CSV Container**.'});
  }

  for (const w of (state.warnings?.containers||[])){
    msgs.push({type:'error', text:String(w)});
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