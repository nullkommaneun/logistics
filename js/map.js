import { bus } from './bus.js';
import { state, setMapImage, setStartPoint, upsertSite, removeSite } from './data.js';
import { nav, initNavGrid, saveNavGrid, brushCellsBetween, isBlocked } from './navgrid.js';

let canvas, ctx;
let img = null;

let mode = 'idle'; // 'idle' | 'calibrate' | 'start' | 'addSite' | 'walls' | 'zone' | 'door'
let calPoints = []; // {x,y}
let drawing = false;
let lastPt = null;

// Zoom & Pan
let scale = 1, offsetX = 0, offsetY = 0;
let panning = false;
let panStart = null, panOffset0 = null;

let pendingSite = null; // {x,y, existing?:site}

export function initMap(canvasEl){
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  initNavGrid(canvas.width, canvas.height, 20);
  draw();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // Rad-Zoom (Desktop)
  canvas.addEventListener('wheel', onWheel, { passive:false });

  // iOS: Pinch-Zoom der Seite sicher unterbinden
  ['gesturestart','gesturechange','gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault())
  );

  bus.on('map:image', draw);
  bus.on('sites:updated', draw);
  bus.on('start:changed', draw);
  bus.on('routing:draw', ({ route }) => drawRoute(route));

  // Standort-Overlay Controls
  document.getElementById('siteSave').onclick = onSiteSave;
  document.getElementById('siteDelete').onclick = onSiteDelete;
  document.getElementById('siteCancel').onclick = closeSiteOverlay;
}

function canvasToScreen(ev){
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height)
  };
}
function screenToWorld(p){ return { x:(p.x - offsetX)/scale, y:(p.y - offsetY)/scale }; }

function findSiteNearWorld(x,y, r=10){
  let best=null, bestd=1e9;
  for (const s of state.sites){
    const d = Math.hypot(x-s.x, y-s.y);
    if (d<r && d<bestd){ best=s; bestd=d; }
  }
  return best;
}

function onPointerDown(ev){
  const pScreen = canvasToScreen(ev);
  const p = screenToWorld(pScreen);

  if (mode === 'calibrate'){
    calPoints.push(p);
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
    setStartPoint(p.x,p.y);
    mode = 'idle';
    draw();
    bus.emit('status:msg', {type:'info', text:'Startpunkt gesetzt.'});
    setTimeout(()=>bus.emit('status:clear',{}), 1200);
    return;
  }

  if (mode === 'addSite'){
    pendingSite = { x: p.x, y: p.y, existing: null };
    openSiteOverlay({ id: nextFreeId(), name:'', isNew:true });
    return;
  }

  if (mode === 'walls' || mode === 'door' || mode === 'zone'){
    drawing = true;
    lastPt = {x:p.x,y:p.y};
    applyBrush(p.x,p.y);
    return;
  }

  // idle: Pan oder Standort bearbeiten
  const near = findSiteNearWorld(p.x,p.y, 12);
  if (near){
    pendingSite = { x: near.x, y: near.y, existing: near };
    openSiteOverlay({ id: near.id, name: near.halle||'', isNew:false });
  } else {
    panning = true;
    panStart = pScreen;
    panOffset0 = { x: offsetX, y: offsetY };
  }
}
function onPointerMove(ev){
  const pScreen = canvasToScreen(ev);
  const p = screenToWorld(pScreen);
  if (drawing){
    applyBrush(p.x,p.y);
    return;
  }
  if (panning && panStart){
    const dx = pScreen.x - panStart.x;
    const dy = pScreen.y - panStart.y;
    offsetX = panOffset0.x + dx;
    offsetY = panOffset0.y + dy;
    draw();
  }
}
function onPointerUp(){ 
  if (drawing){ drawing=false; saveNavGrid(); }
  panning = false; panStart = null; panOffset0 = null;
}

function onWheel(e){
  e.preventDefault();
  const pScreen = canvasToScreen(e);
  const world = screenToWorld(pScreen);
  const factor = (e.deltaY < 0) ? 1.12 : 0.89;
  zoomAt(world.x, world.y, factor);
}
function zoomAt(wx, wy, factor){
  const newScale = Math.max(0.5, Math.min(4, scale * factor));
  const sx = wx * scale + offsetX, sy = wy * scale + offsetY;
  scale = newScale;
  offsetX = sx - wx * scale;
  offsetY = sy - wy * scale;
  draw();
}
export function zoomIn(){ zoomAt(canvas.width/2, canvas.height/2, 1.12); }
export function zoomOut(){ zoomAt(canvas.width/2, canvas.height/2, 0.89); }
export function zoomReset(){ scale = 1; offsetX = 0; offsetY = 0; draw(); }

function applyBrush(x,y){
  if (!lastPt){ lastPt={x,y}; }
  const type = (mode==='door') ? 'clear' : (mode==='zone' ? 'zone' : 'wall');
  const brush = (mode==='zone') ? 3 : 1;
  brushCellsBetween(lastPt.x, lastPt.y, x, y, brush, type);
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
export function setModeCalibrate(){ mode='calibrate'; calPoints = []; bus.emit('status:msg', {type:'info', text:'Kalibrierung aktiv: tippe **Punkt 1**.'}); draw(); }
export function setModeStart(){ mode='start'; bus.emit('status:msg',{type:'info', text:'Startpunkt wählen: tippe den Start im Plan.'}); draw(); }
export function setModeAddSite(){ mode='addSite'; bus.emit('status:msg',{type:'info', text:'Standort hinzufügen: tippe die gewünschte Position im Plan.'}); draw(); }
export function setModeWalls(){ mode='walls'; bus.emit('status:msg',{type:'info', text:'Wände zeichnen: über den Korridoren **nicht** zeichnen.'}); draw(); }
export function setModeZone(){ mode='zone'; bus.emit('status:msg',{type:'info', text:'Sperrzone zeichnen: Fläche großzügig ausmalen.'}); draw(); }
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
  // Bildschirm zurücksetzen
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Welt-Transform
  ctx.save();
  ctx.setTransform(scale,0,0,scale, offsetX, offsetY);

  // Hintergrundbild (optional)
  if (!img && state.mapImage){
    img = new Image(); img.onload = ()=>{ draw(); }; img.src = state.mapImage; 
  }
  if (img){ ctx.drawImage(img, 0,0,canvas.width,canvas.height); }

  // Raster
  ctx.strokeStyle = '#132033'; ctx.lineWidth = 1;
  for (let x=0; x<canvas.width; x+=20){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=20){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  // Gesperrte Zellen (Wände rot, Zonen gelb)
  // Wände
  ctx.fillStyle = 'rgba(255,80,80,.28)';
  for (const key of nav.walls){
    const [cx,cy] = key.split('_').map(Number);
    ctx.fillRect(cx*nav.cell, cy*nav.cell, nav.cell, nav.cell);
  }
  // Zonen
  ctx.fillStyle = 'rgba(255,206,86,.28)';
  for (const key of nav.zones){
    const [cx,cy] = key.split('_').map(Number);
    ctx.fillRect(cx*nav.cell, cy*nav.cell, nav.cell, nav.cell);
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

  ctx.restore(); // Welt-Transform Ende
}
function drawDot(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

function drawRoute(route){
  draw();
  if (!route || !route.steps?.length) return;
  ctx.save();
  ctx.setTransform(scale,0,0,scale, offsetX, offsetY);
  ctx.strokeStyle = '#a4b9ff'; ctx.lineWidth = 2;
  for (const step of route.steps){
    if (Array.isArray(step.path) && step.path.length>1){
      ctx.beginPath();
      ctx.moveTo(step.path[0].x, step.path[0].y);
      for (let i=1;i<step.path.length;i++){ ctx.lineTo(step.path[i].x, step.path[i].y); }
      ctx.stroke();
    }
  }
  ctx.restore();
}