import { bus } from './bus.js';
import { state, setMapImage, setStartPoint, upsertSite, removeSite } from './data.js';
import { nav, initNavGrid, saveNavGrid, brushCellsBetween, isBlocked } from './navgrid.js';

let canvas, ctx;
let img = null;

let mode = 'idle'; // 'idle' | 'calibrate' | 'start' | 'addSite' | 'walls' | 'door'
let calPoints = []; // {x,y}
let drawing = false;
let lastPt = null;

let pendingSite = null; // {x,y, existing?:site}

export function initMap(canvasEl){
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  initNavGrid(canvas.width, canvas.height, 20);
  draw();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  bus.on('map:image', draw);
  bus.on('sites:updated', draw);
  bus.on('start:changed', draw);
  bus.on('routing:draw', ({ route }) => drawRoute(route));

  // Standort-Overlay Controls
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

  if (mode === 'walls' || mode === 'door'){
    drawing = true;
    lastPt = {x,y};
    applyBrush(x,y);
    return;
  }

  // idle: Tippen auf vorhandenen Standort -> bearbeiten
  const near = findSiteNear(x,y, 12);
  if (near){
    pendingSite = { x: near.x, y: near.y, existing: near };
    openSiteOverlay({ id: near.id, name: near.halle||'', isNew:false });
  }
}
function onPointerMove(ev){
  if (!drawing) return;
  const {x,y} = canvasToLocal(ev);
  applyBrush(x,y);
}
function onPointerUp(){ 
  if (drawing){ drawing=false; saveNavGrid(); }
}

function applyBrush(x,y){
  if (!lastPt){ lastPt={x,y}; }
  const block = (mode==='walls');
  brushCellsBetween(lastPt.x, lastPt.y, x, y, 1, block);
  lastPt = {x,y};
  draw();
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
  mode='calibrate'; calPoints = [];
  bus.emit('status:msg', {type:'info', text:'Kalibrierung aktiv: tippe **Punkt 1**.'});
  draw();
}
export function setModeStart(){ mode='start'; bus.emit('status:msg',{type:'info', text:'Startpunkt wählen: tippe den Start im Plan.'}); draw(); }
export function setModeAddSite(){ mode='addSite'; bus.emit('status:msg',{type:'info', text:'Standort hinzufügen: tippe die gewünschte Position im Plan.'}); draw(); }
export function setModeWalls(){ mode='walls'; bus.emit('status:msg',{type:'info', text:'Wände zeichnen: über den Korridoren **nicht** zeichnen.'}); draw(); }
export function setModeDoor(){ mode='door'; bus.emit('status:msg',{type:'info', text:'Tor (Öffnung) ziehen: gesperrte Zellen wieder freigeben.'}); draw(); }

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

  // Hintergrundbild (optional)
  if (!img && state.mapImage){
    img = new Image(); img.onload = ()=>{ draw(); }; img.src = state.mapImage; return;
  }
  if (img){ ctx.drawImage(img, 0,0,canvas.width,canvas.height); }

  // Raster/Blocked
  // Zellen leicht andeuten
  ctx.strokeStyle = '#132033'; ctx.lineWidth = 1;
  for (let x=0; x<canvas.width; x+=20){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=20){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  // Blockierte Zellen rot
  ctx.fillStyle = 'rgba(255,80,80,.28)';
  for (let cx=0; cx<nav.cols; cx++){
    for (let cy=0; cy<nav.rows; cy++){
      if (isBlocked(cx,cy)){
        ctx.fillRect(cx*nav.cell, cy*nav.cell, nav.cell, nav.cell);
      }
    }
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
  if (!route || !route.steps?.length) return;
  ctx.strokeStyle = '#a4b9ff'; ctx.lineWidth = 2;
  for (const step of route.steps){
    if (Array.isArray(step.path) && step.path.length>1){
      ctx.beginPath();
      ctx.moveTo(step.path[0].x, step.path[0].y);
      for (let i=1;i<step.path.length;i++){ ctx.lineTo(step.path[i].x, step.path[i].y); }
      ctx.stroke();
    }
  }
}