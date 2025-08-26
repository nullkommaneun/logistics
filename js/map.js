import { bus } from './bus.js';
import { state, setMapImage, setStartPoint, upsertSite, removeSite } from './data.js';

let canvas, ctx;
let img = null;

let mode = 'idle'; // 'idle' | 'calibrate' | 'start' | 'addSite'
let calPoints = []; // {x,y}

let pendingSite = null; // {x,y, existing?:site}

export function initMap(canvasEl){
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  draw();

  canvas.addEventListener('pointerdown', onPointerDown);

  bus.on('map:image', draw);
  bus.on('sites:updated', draw);
  bus.on('start:changed', draw);
  bus.on('routing:draw', ({ route }) => drawRoute(route));

  // Overlay Buttons
  document.getElementById('siteSave').onclick = onSiteSave;
  document.getElementById('siteDelete').onclick = onSiteDelete;
  document.getElementById('siteCancel').onclick = closeSiteOverlay;
}

function canvasToLocal(ev){
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return {x,y};
}

function findSiteNear(x,y, r=10){
  let best=null, bestd=1e9;
  for (const s of state.sites){
    const d = Math.hypot(x-s.x, y-s.y);
    if (d<r && d<bestd){ best=s; bestd=d; }
  }
  return best;
}

function onPointerDown(ev){
  const {x,y} = canvasToLocal(ev);

  if (mode === 'calibrate'){
    calPoints.push({x,y});
    if (calPoints.length === 1){
      bus.emit('status:msg', {type:'info', text:'Kalibrierung aktiv: Punkt 1 gesetzt. Tippe **Punkt 2**.'});
    }
    draw();
    if (calPoints.length === 2){
      const ov = document.getElementById('calOverlay');
      const input = document.getElementById('calMeters');
      const ok = document.getElementById('calOk');
      const cancel = document.getElementById('calCancel');
      ov.hidden = false; input.value = '';
      bus.emit('status:msg', {type:'info', text:'Kalibrierung: **Distanz in Metern** eingeben und bestätigen.'});

      const apply = ()=>{
        const meters = Number(input.value);
        if (!meters || meters<=0 || !isFinite(meters)) {
          ov.hidden = true; bus.emit('status:msg', {type:'error', text:'Kalibrierung abgebrochen: ungültiger Meter‑Wert.'}); return;
        }
        const dx = calPoints[0].x - calPoints[1].x;
        const dy = calPoints[0].y - calPoints[1].y;
        const px = Math.hypot(dx, dy);
        const ppm = px / meters;
        state.settings.px_per_meter = ppm;
        localStorage.setItem('bn_settings_json', JSON.stringify(state.settings));
        bus.emit('map:calibrated', { px_per_meter: ppm });
        bus.emit('status:msg', {type:'info', text:`Kalibrierung gespeichert: ${ppm.toFixed(2)} px/m.`});
        ov.hidden = true;
      };
      const cleanup = ()=>{ ok.onclick = null; cancel.onclick = null; };
      ok.onclick = ()=>{ apply(); calPoints = []; mode='idle'; draw(); cleanup(); bus.emit('status:clear',{}); };
      cancel.onclick = ()=>{ calPoints = []; mode='idle'; draw(); cleanup(); ov.hidden=true; bus.emit('status:msg',{type:'error', text:'Kalibrierung abgebrochen.'}); setTimeout(()=>bus.emit('status:clear',{}), 1200); };
    }
    return;
  }

  if (mode === 'start'){
    setStartPoint(x,y);
    mode = 'idle';
    draw();
    bus.emit('status:msg', {type:'info', text:'Startpunkt gesetzt.'});
    setTimeout(()=>bus.emit('status:clear',{}), 1200);
    return;
  }

  if (mode === 'addSite'){
    pendingSite = { x, y, existing: null };
    openSiteOverlay({ id: nextFreeId(), name:'', isNew:true });
    return;
  }

  // idle: Tippen auf vorhandenen Standort -> bearbeiten
  const near = findSiteNear(x,y, 12);
  if (near){
    pendingSite = { x: near.x, y: near.y, existing: near };
    openSiteOverlay({ id: near.id, name: near.halle||'', isNew:false });
  }
}

function nextFreeId(){
  const used = new Set(state.sites.map(s=>Number(s.id)));
  for (let i=1;i<1000;i++){ if (!used.has(i)) return i; }
  return Math.floor(Math.random()*900)+100;
}

/* ---- Standort-Overlay ---- */
function openSiteOverlay({id, name, isNew}){
  document.getElementById('siteOverlayTitle').textContent = isNew ? 'Standort hinzufügen' : 'Standort bearbeiten';
  const idEl = document.getElementById('siteId');
  const nmEl = document.getElementById('siteName');
  idEl.value = id || '';
  nmEl.value = name || '';
  document.getElementById('siteDelete').style.display = isNew ? 'none' : 'inline-block';
  document.getElementById('siteOverlay').hidden = false;
}
function closeSiteOverlay(){ document.getElementById('siteOverlay').hidden = true; pendingSite = null; }

function onSiteSave(){
  const id = Number(document.getElementById('siteId').value);
  const name = document.getElementById('siteName').value||'';
  if (!pendingSite){ closeSiteOverlay(); return; }
  if (!Number.isFinite(id) || id<1){ bus.emit('status:msg',{type:'error', text:'Bitte eine gültige **ID** (1–999) eingeben.'}); return; }
  upsertSite({ id, x: pendingSite.x, y: pendingSite.y, halle: name });
  closeSiteOverlay();
  bus.emit('status:msg',{type:'info', text:`Standort ${id} gespeichert.`});
  setTimeout(()=>bus.emit('status:clear',{}), 1200);
}
function onSiteDelete(){
  if (!pendingSite || !pendingSite.existing) { closeSiteOverlay(); return; }
  removeSite(pendingSite.existing.id);
  closeSiteOverlay();
  bus.emit('status:msg',{type:'info', text:`Standort ${pendingSite.existing.id} gelöscht.`});
  setTimeout(()=>bus.emit('status:clear',{}), 1200);
}

/* ---- Modus-Schalter ---- */
export function setModeCalibrate(){
  if (!state.mapImage){
    bus.emit('status:msg', {type:'error', text:'Lade zuerst deinen **Werksplan** über „Plan laden“.'});
    setTimeout(()=>bus.emit('status:clear',{}), 2000);
    return;
  }
  mode='calibrate'; calPoints = [];
  bus.emit('status:msg', {type:'info', text:'Kalibrierung aktiv: tippe **Punkt 1**.'});
  draw();
}
export function setModeStart(){ mode='start'; bus.emit('status:msg',{type:'info', text:'Startpunkt wählen: tippe den Start im Plan.'}); draw(); }
export function setModeAddSite(){
  if (!state.mapImage){
    bus.emit('status:msg', {type:'error', text:'Lade zuerst deinen **Werksplan** über „Plan laden“.'});
    setTimeout(()=>bus.emit('status:clear',{}), 2000);
    return;
  }
  mode='addSite';
  bus.emit('status:msg',{type:'info', text:'Standort hinzufügen: tippe die gewünschte Position im Plan.'});
  draw();
}

/* ---- Zeichnen ---- */
export function loadPlanFromFile(file){
  const fr = new FileReader();
  fr.onload = () => { img = new Image(); img.onload = ()=>{ setMapImage(fr.result); draw(); }; img.src = fr.result; };
  fr.readAsDataURL(file);
}
export function usePlanDataUrl(dataUrl){
  img = new Image(); img.onload = ()=>{ setMapImage(dataUrl); draw(); }; img.src = dataUrl;
}

export function draw(){
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  if (!img && state.mapImage){
    img = new Image(); img.onload = ()=>{ draw(); }; img.src = state.mapImage; return;
  }
  if (img){ ctx.drawImage(img, 0,0,canvas.width,canvas.height); }
  else {
    ctx.strokeStyle = '#132033'; ctx.lineWidth = 1;
    for (let x=0; x<canvas.width; x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y=0; y<canvas.height; y+=50){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  }

  // Standorte
  ctx.fillStyle = '#7aa2f7'; ctx.strokeStyle = '#2a3b51';
  for (const s of state.sites){
    drawDot(s.x, s.y, 6);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#9fb0c0'; ctx.fillText(String(s.id) + (s.halle? ' '+s.halle:''), s.x+8, s.y-8);
    ctx.fillStyle = '#7aa2f7';
  }

  // Start
  if (state.start){
    ctx.fillStyle = '#4fb477'; drawDot(state.start.x, state.start.y, 7);
    ctx.font = '12px system-ui'; ctx.fillStyle = '#9fd3b4'; ctx.fillText('Start', state.start.x+8, state.start.y+12);
  }

  // Kalibrierpunkte
  if (mode==='calibrate'){
    ctx.fillStyle = '#f6c177';
    calPoints.forEach(p=>drawDot(p.x,p.y,6));
  }
}
function drawDot(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

function drawRoute(route){
  draw();
  if (!route || !route.order?.length) return;
  const start = state.start;
  let prev = {x:start.x, y:start.y};
  ctx.strokeStyle = '#a4b9ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(prev.x, prev.y);
  for (const s of route.order){ ctx.lineTo(s.x, s.y); prev = s; }
  ctx.stroke();
}