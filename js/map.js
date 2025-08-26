
import { bus } from './bus.js';
import { state, setMapImage, setStartPoint, setStartPointFromSite, pxToMeters } from './data.js';

let canvas, ctx;
let img = null;
let scale = 1, offsetX = 0, offsetY = 0;

let mode = 'idle'; // 'idle' | 'calibrate' | 'start'
let calPoints = [];

export function initMap(canvasEl){
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  draw();

  canvas.addEventListener('pointerdown', onPointerDown);

  bus.on('map:image', draw);
  bus.on('sites:updated', draw);
  bus.on('start:changed', draw);
  bus.on('routing:draw', ({ route }) => drawRoute(route));
}

function onPointerDown(ev){
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);

  if (mode === 'calibrate'){
    calPoints.push({x,y});
    draw();
    if (calPoints.length === 2){
      // show inline non-modal overlay
      const ov = document.getElementById('calOverlay');
      const input = document.getElementById('calMeters');
      const ok = document.getElementById('calOk');
      const cancel = document.getElementById('calCancel');
      ov.hidden = false; input.value = '';
      const apply = ()=>{
        const meters = Number(input.value);
        if (!meters || meters<=0 || !isFinite(meters)) { ov.hidden = true; return; }
        const dx = calPoints[0].x - calPoints[1].x;
        const dy = calPoints[0].y - calPoints[1].y;
        const px = Math.hypot(dx, dy);
        const ppm = px / meters;
        state.settings.px_per_meter = ppm;
        localStorage.setItem('bn_settings_json', JSON.stringify(state.settings));
        bus.emit('map:calibrated', { px_per_meter: ppm });
        ov.hidden = true;
      };
      const cleanup = ()=>{ ov.hidden = true; ok.onclick = null; cancel.onclick = null; };
      ok.onclick = ()=>{ apply(); calPoints = []; mode='idle'; draw(); cleanup(); };
      cancel.onclick = ()=>{ calPoints = []; mode='idle'; draw(); cleanup(); };

    }
  } else if (mode === 'start'){
    setStartPoint(x,y);
    mode = 'idle';
    draw();
  }
}

export function setModeCalibrate(){ mode='calibrate'; calPoints = []; draw(); }
export function setModeStart(){ mode='start'; draw(); }

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
    img = new Image();
    img.onload = ()=>{ draw(); };
    img.src = state.mapImage;
    return;
  }
  if (img){
    ctx.drawImage(img, 0,0,canvas.width,canvas.height);
  } else {
    // grid
    ctx.strokeStyle = '#132033';
    ctx.lineWidth = 1;
    for (let x=0; x<canvas.width; x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y=0; y<canvas.height; y+=50){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  }

  // sites
  ctx.fillStyle = '#7aa2f7';
  ctx.strokeStyle = '#2a3b51';
  for (const s of state.sites){
    drawDot(s.x, s.y, 6);
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#9fb0c0';
    ctx.fillText(String(s.id), s.x+8, s.y-8);
    ctx.fillStyle = '#7aa2f7';
  }

  // start
  if (state.start){
    ctx.fillStyle = '#4fb477';
    drawDot(state.start.x, state.start.y, 7);
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#9fd3b4';
    ctx.fillText('Start', state.start.x+8, state.start.y+12);
  }

  // calibration points
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
  ctx.strokeStyle = '#a4b9ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(prev.x, prev.y);
  for (const s of route.order){
    ctx.lineTo(s.x, s.y);
    prev = s;
  }
  ctx.stroke();
}
