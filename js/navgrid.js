// NavGrid: Rasterbasierte Hindernisse (Wände/Sperrzonen) für Dijkstra/A*
// Persistiert in localStorage.

export const NAV_LS = 'bn_navgrid';

export const nav = {
  cell: 20,       // Pixel pro Zelle
  cols: 50,
  rows: 35,
  walls: new Set(), // 'cx_cy'
  zones: new Set()  // 'cx_cy'
};

export function initNavGrid(width, height, cell=20){
  nav.cell = cell;
  nav.cols = Math.max(4, Math.floor(width / cell));
  nav.rows = Math.max(4, Math.floor(height / cell));
  loadNavGrid();
}
export function loadNavGrid(){
  try{
    const obj = JSON.parse(localStorage.getItem(NAV_LS) || '{}');
    if (obj){
      nav.cell = obj.cell || nav.cell;
      nav.cols = obj.cols || nav.cols;
      nav.rows = obj.rows || nav.rows;
      if (obj.blocked && !obj.walls && !obj.zones){
        nav.walls = new Set(obj.blocked);
        nav.zones = new Set();
      } else {
        nav.walls = new Set(obj.walls || []);
        nav.zones = new Set(obj.zones || []);
      }
    }
  }catch{ nav.walls = new Set(); nav.zones = new Set(); }
}
export function saveNavGrid(){
  const obj = { cell: nav.cell, cols: nav.cols, rows: nav.rows,
                walls: Array.from(nav.walls), zones: Array.from(nav.zones) };
  localStorage.setItem(NAV_LS, JSON.stringify(obj));
}

export function importNavJSON(text){
  let o = JSON.parse(text);
  if (Array.isArray(o)) o = { walls:o, zones:[] };
  nav.cell = Number(o.cell)||nav.cell;
  nav.cols = Number(o.cols)||nav.cols;
  nav.rows = Number(o.rows)||nav.rows;
  nav.walls = new Set(o.walls||[]);
  nav.zones = new Set(o.zones||[]);
  saveNavGrid();
}
export function exportNavJSON(){
  const obj = { cell: nav.cell, cols: nav.cols, rows: nav.rows,
                walls: Array.from(nav.walls), zones: Array.from(nav.zones) };
  return new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
}

export function cellKey(cx,cy){ return cx+'_'+cy; }
export function isBlocked(cx,cy){ return nav.walls.has(cellKey(cx,cy)) || nav.zones.has(cellKey(cx,cy)); }

export function setWall(cx,cy, val=true){
  if (cx<0||cy<0||cx>=nav.cols||cy>=nav.rows) return;
  const key = cellKey(cx,cy);
  if (val) nav.walls.add(key); else nav.walls.delete(key);
}
export function setZone(cx,cy, val=true){
  if (cx<0||cy<0||cx>=nav.cols||cy>=nav.rows) return;
  const key = cellKey(cx,cy);
  if (val) nav.zones.add(key); else nav.zones.delete(key);
}
export function clearCell(cx,cy){
  const key = cellKey(cx,cy);
  nav.walls.delete(key); nav.zones.delete(key);
}

export function toCell(x,y){
  return {
    cx: Math.max(0, Math.min(nav.cols-1, Math.floor(x / nav.cell))),
    cy: Math.max(0, Math.min(nav.rows-1, Math.floor(y / nav.cell)))
  };
}
export function cellCenter(cx,cy){ return { x: cx*nav.cell + nav.cell/2, y: cy*nav.cell + nav.cell/2 }; }

// Linie „malen“; brush=Radius in Zellen; type: 'wall' | 'zone' | 'clear'
export function brushCellsBetween(ax,ay,bx,by, brush=1, type='wall'){
  const A = toCell(ax,ay), B = toCell(bx,by);
  let x0=A.cx, y0=A.cy, x1=B.cx, y1=B.cy;
  const dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  const sx = x0<x1?1:-1, sy = y0<y1?1:-1;
  let err = dx - dy;
  while(true){
    for(let ox=-brush; ox<=brush; ox++){
      for(let oy=-brush; oy<=brush; oy++){
        const cx=x0+ox, cy=y0+oy;
        if (type==='clear') clearCell(cx,cy);
        else if (type==='zone') setZone(cx,cy,true);
        else setWall(cx,cy,true);
      }
    }
    if (x0===x1 && y0===y1) break;
    const e2 = 2*err;
    if (e2 > -dy){ err -= dy; x0 += sx; }
    if (e2 < dx){ err += dx; y0 += sy; }
  }
}

export function neighbors(cx,cy){
  const res=[];
  for (let dx=-1; dx<=1; dx++){
    for (let dy=-1; dy<=1; dy++){
      if (dx===0 && dy===0) continue;
      const nx=cx+dx, ny=cy+dy;
      if (nx<0||ny<0||nx>=nav.cols||ny>=nav.rows) continue;
      if (isBlocked(nx,ny)) continue;
      res.push({cx:nx, cy:ny, cost: (dx!==0 && dy!==0) ? Math.SQRT2 : 1});
    }
  }
  return res;
}
export function nearestOpenCell(cx,cy,maxR=6){
  if (!isBlocked(cx,cy)) return {cx,cy};
  for(let r=1; r<=maxR; r++){
    for(let dx=-r; dx<=r; dx++){
      for(let dy=-r; dy<=r; dy++){
        const nx=cx+dx, ny=cy+dy;
        if (nx>=0 && ny>=0 && nx<nav.cols && ny<nav.rows && !isBlocked(nx,ny)) return {cx:nx,cy:ny};
      }
    }
  }
  return null;
}

/* Dijkstra: Pfad in Pixelpunkten + Länge in Pixel */
export function pathfind(x0,y0,x1,y1){
  const a = toCell(x0,y0), b = toCell(x1,y1);
  const start = nearestOpenCell(a.cx,a.cy) || a;
  const goal  = nearestOpenCell(b.cx,b.cy) || b;
  const startKey = cellKey(start.cx,start.cy), goalKey = cellKey(goal.cx,goal.cy);

  const dist = new Map([[startKey,0]]);
  const prev = new Map();
  const visited = new Set();
  let frontier = [start];

  while(frontier.length){
    // Nächster mit minimaler Distanz
    let idx=0, u=frontier[0], uKey=cellKey(u.cx,u.cy), best=dist.get(uKey);
    for(let i=1;i<frontier.length;i++){
      const k=cellKey(frontier[i].cx,frontier[i].cy);
      const d=dist.get(k);
      if (d<best){ best=d; idx=i; u=frontier[i]; uKey=k; }
    }
    frontier.splice(idx,1);
    if (visited.has(uKey)) continue;
    visited.add(uKey);
    if (uKey===goalKey) break;

    for (const nb of neighbors(u.cx,u.cy)){
      const vKey=cellKey(nb.cx,nb.cy);
      const alt = dist.get(uKey)+nb.cost;
      if (!dist.has(vKey) || alt<dist.get(vKey)){
        dist.set(vKey, alt);
        prev.set(vKey, uKey);
        if (!visited.has(vKey)) frontier.push({cx:nb.cx,cy:nb.cy});
      }
    }
  }

  if (!prev.has(goalKey) && startKey!==goalKey){ return { points: [], lengthPx: Infinity }; }

  // Rekonstruktion
  const cells=[];
  let k=goalKey;
  const [gx,gy]=goalKey.split('_').map(Number);
  cells.push({cx:gx, cy:gy});
  while(k!==startKey){
    const pk=prev.get(k);
    if (!pk) break;
    const [cx,cy]=pk.split('_').map(Number);
    cells.push({cx,cy}); k=pk;
  }
  const [sx,sy]=startKey.split('_').map(Number);
  cells.push({cx:sx, cy:sy});
  cells.reverse();

  const pts = cells.map(c => cellCenter(c.cx,c.cy));

  // Vereinfachen (kollinear entfernen)
  const simplified=[pts[0]];
  for(let i=1;i<pts.length-1;i++){
    const a=pts[i-1], b=pts[i], c=pts[i+1];
    const cross=(b.y - a.y)*(c.x - b.x) - (b.x - a.x)*(c.y - b.y);
    if (Math.abs(cross)>1e-6) simplified.push(b);
  }
  simplified.push(pts[pts.length-1]);

  // Länge in Pixel
  let length=0;
  for(let i=1;i<simplified.length;i++){
    const dx=simplified[i].x - simplified[i-1].x;
    const dy=simplified[i].y - simplified[i-1].y;
    length += Math.hypot(dx,dy);
  }
  return { points: simplified, lengthPx: length };
}