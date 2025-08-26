
import { bus } from './bus.js';
import { state, featureFlags, saveFlags, dumpState, resetAll, getLocalStorageSummary } from './data.js';

export function initPreflight(PF) {
  if (!PF) return;

  // Error overlay
  window.addEventListener('error', (ev) => {
    showOverlay();
    addLog('JS Error: ' + ev.message + '\n' + (ev.error?.stack||''));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    showOverlay();
    addLog('Promise Rejection: ' + ev.reason);
  });

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'pf-overlay';
  overlay.innerHTML = `
    <div class="pf-header">
      <strong>Preflight / Debug</strong>
      <div>
        <button id="pfToggle" class="btn">Schließen</button>
      </div>
    </div>
    <div class="pf-tabs">
      <button data-tab="state">State</button>
      <button data-tab="events">Events</button>
      <button data-tab="perf">Perf</button>
      <button data-tab="storage">Storage</button>
      <button data-tab="flags">Flags</button>
      <button data-tab="checks">Checks</button>
    </div>
    <div class="pf-body" id="pfBody"></div>
  `;
  document.body.appendChild(overlay);

  function showOverlay(){ overlay.classList.add('show'); }
  function hideOverlay(){ overlay.classList.remove('show'); }
  document.getElementById('pfToggle').onclick = hideOverlay;

  // Toggle with long press on app title (easier on mobile)
  let pressTimer;
  document.querySelector('.appbar h1').addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => showOverlay(), 600);
  });
  document.querySelector('.appbar h1').addEventListener('touchend', () => clearTimeout(pressTimer));

  // Tabs
  overlay.querySelectorAll('.pf-tabs button').forEach(btn => {
    btn.addEventListener('click', () => renderTab(btn.dataset.tab));
  });

  // FPS meter
  let frames = 0, last = performance.now(), fps = 0;
  function loop() {
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      fps = Math.round(frames * 1000 / (now - last));
      frames = 0; last = now;
    }
    requestAnimationFrame(loop);
  }
  loop();

  function renderTab(tab){
    const body = overlay.querySelector('#pfBody');
    if (tab === 'state') {
      body.innerHTML = `
        <div class="pf-row"><span>Containers</span><span>${state.containers.length}</span></div>
        <div class="pf-row"><span>Sites</span><span>${state.sites.length}</span></div>
        <div class="pf-row"><span>Schema</span><span>${state.settings.schema||'–'}</span></div>
        <div class="pf-row"><span>px_per_meter</span><span>${state.settings.px_per_meter||'–'}</span></div>
        <div class="pf-row"><span>Startpunkt</span><span>${state.start?.label||'–'}</span></div>
        <div class="hr"></div>
        <pre class="pf-log">${escapeHtml(JSON.stringify(dumpState(), null, 2))}</pre>
      `;
    } else if (tab === 'events') {
      body.innerHTML = `<pre class="pf-log">${escapeHtml(bus.getHistory().map(e=>e.ts+' '+e.event+' '+JSON.stringify(e.detail)).join('\n'))}</pre>`;
    } else if (tab === 'perf') {
      body.innerHTML = `
        <div class="pf-row"><span>FPS</span><span>${fps}</span></div>
        <div class="pf-row"><span>Paints</span><span>–</span></div>
      `;
    } else if (tab === 'storage') {
      const sum = getLocalStorageSummary();
      body.innerHTML = `
        <div class="pf-row"><span>Keys</span><span>${Object.keys(sum).length}</span></div>
        <div class="hr"></div>
        <pre class="pf-log">${escapeHtml(JSON.stringify(sum, null, 2))}</pre>
        <div class="hr"></div>
        <button id="pfReset" class="btn danger">localStorage leeren</button>
      `;
      body.querySelector('#pfReset').onclick = () => {
        if(confirm('Wirklich alle lokalen Daten löschen?')){ resetAll(); location.reload(); }
      };
    } else if (tab === 'flags') {
      body.innerHTML = `
        <div class="pf-row"><span>routing</span>
          <select id="pfRouting">
            <option value="nearest"${featureFlags.routing==='nearest'?' selected':''}>nearest</option>
            <option value="dijkstra"${featureFlags.routing==='dijkstra'?' selected':''}>dijkstra (stub)</option>
          </select>
        </div>
        <div class="pf-row"><span>capacity</span>
          <select id="pfCapacity">
            <option value="none"${featureFlags.capacity==='none'?' selected':''}>none</option>
            <option value="forklift_2p5t"${featureFlags.capacity==='forklift_2p5t'?' selected':''}>forklift_2p5t (stub)</option>
          </select>
        </div>
        <div class="pf-row"><span>uiDensity</span>
          <select id="pfUiDensity">
            <option value="comfort"${featureFlags.uiDensity==='comfort'?' selected':''}>comfort</option>
            <option value="compact"${featureFlags.uiDensity==='compact'?' selected':''}>compact</option>
          </select>
        </div>
      `;
      body.querySelector('#pfRouting').onchange = (e)=>{ featureFlags.routing = e.target.value; saveFlags(); bus.emit('routing:recompute'); };
      body.querySelector('#pfCapacity').onchange = (e)=>{ featureFlags.capacity = e.target.value; saveFlags(); bus.emit('cart:changed'); };
      body.querySelector('#pfUiDensity').onchange = (e)=>{
        featureFlags.uiDensity = e.target.value; saveFlags();
        document.body.classList.toggle('density-compact', featureFlags.uiDensity==='compact');
      };
    } else if (tab === 'checks') {
      const checks = runChecks();
      body.innerHTML = Object.entries(checks).map(([k,v])=>`<div class="pf-row"><span>${k}</span><span>${v ? 'ok' : 'fehlt'}</span></div>`).join('');
    }
  }

  function addLog(msg){
    const body = overlay.querySelector('#pfBody');
    const pre = document.createElement('pre');
    pre.className = 'pf-log';
    pre.textContent = msg + '\n';
    body.appendChild(pre);
  }

  function escapeHtml(s){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function runChecks(){
    return {
      Canvas: !!document.createElement('canvas').getContext,
      Storage: !!window.localStorage,
      'Pointer Events': 'PointerEvent' in window,
      'Service Worker': 'serviceWorker' in navigator,
      'Memory Budget?': true
    };
  }

  // Keyboard shortcut: Ctrl+.
  window.addEventListener('keydown', (e)=>{
    if(e.ctrlKey && e.key === '.') { overlay.classList.toggle('show'); }
  });

  // If ?pf=1 initially, open overlay once
  setTimeout(()=>renderTab('checks'), 50);
  setTimeout(()=>overlay.classList.add('show'), 100);
}
