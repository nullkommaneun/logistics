import { bus } from './bus.js';
import { state, setStartPoint } from './data.js';
import { nav } from './navgrid.js';

let canvas, ctx;
let img = null;

let mode = 'idle'; // 'idle' | 'start'

// Zoom & Pan
let scale = 1, offsetX = 0, offsetY = 0;
let panning = false;
let panStart = null, panOffset0 = null;

export function initMap(canvasEl){
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  draw();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive:false });

  // iOS: Pinch-Zoom der Seite verhindern (wir zoomen nur im Canvas)
  ['gesturestart','gesturechange','gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive:false })
  );

  bus.on('map:image', draw);
  bus.on('sites:updated', draw);
  bus.on('start:changed', draw);
  bus.on('routing:draw', ({ route }) => drawRoute(route));
}

function canvasToScreen(ev){
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height)
  };
}
function screenToWorld(p){ return { x:(p.x - offsetX)/scale, y:(p.y - offsetY)/scale }; }

function onPointerDown(ev){
  const pScreen = canvasToScreen(ev);
  const p = screenToWorld(pScreen);

  if (mode === 'start'){
    setStartPoint(p.x,p.y);
    mode = 'idle';
    draw();
    bus.emit('status:msg', {type:'info', text:'Startpunkt gesetzt.'});
    setTimeout(()=>bus.emit('status:clear',{}), 1200);
    return;
  }

  // Pan
  panning = true; panStart = pScreen; panOffset0 = { x: offsetX, y: offsetY };
}
function onPointerMove(ev){
  if (!panning) return;
  const pScreen = canvasToScreen(ev);
  const dx = pScreen.x - panStart.x;
  const dy = pScreen.y - panStart.y;
  offsetX = panOffset0.x + dx;
  offsetY = panOffset0.y + dy;
  draw();
}
function onPointerUp(){ panning = false; }

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
export function setModeStart(){ mode='start'; bus.emit('status:msg',{type:'info', text:'Startpunkt wählen: tippe den Start im Plan.'}); }

/* ---- Zeichnen ---- */
export function draw(){
  // Hintergrund
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // Welt-Transform
  ctx.save();
  ctx.setTransform(scale,0,0,scale, offsetX, offsetY);

  // Planbild (optional aus Bundle)
  if (!img && state.mapImage){
    img = new Image(); img.onload = ()=>{ draw(); }; img.src = state.mapImage;
  }
  if (img){ ctx.drawImage(img, 0,0,canvas.width,canvas.height); }

  // Raster
  const cell = nav.cell || 10;
  ctx.strokeStyle = '#132033'; ctx.lineWidth = 1;
  for (let x=0; x<canvas.width; x+=cell){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=cell){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  // Gesperrte Zellen (Wände rot, Zonen gelb)
  ctx.fillStyle = 'rgba(255,80,80,.28)';
  for (const key of (nav.walls||new Set())){
    const [cx,cy] = key.split('_').map(Number);
    ctx.fillRect(cx*cell, cy*cell, cell, cell);
  }
  ctx.fillStyle = 'rgba(255,206,86,.28)';
  for (const key of (nav.zones||new Set())){
    const [cx,cy] = key.split('_').map(Number);
    ctx.fillRect(cx*cell, cy*cell, cell, cell);
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

  ctx.restore();
}
function drawDot(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }

/* Route-Layer */
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

export default { initMap, setModeStart, zoomIn, zoomOut, zoomReset, draw };