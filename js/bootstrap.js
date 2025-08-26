
import { initPreflight } from './preflight.js';
import { initUI } from './ui.js';
import { initFromLocalStorage, state, setStartPointFromSite } from './data.js';
import { initMap, loadPlanFromFile, usePlanDataUrl, setModeCalibrate, setModeStart } from './map.js';
import { bus } from './bus.js';

const PF = new URLSearchParams(location.search).get('pf') === '1';

// Error handling (only minimal when no pf=1)
window.addEventListener('error', (e)=>{ if (!PF) console.warn('Error', e.message); });
window.addEventListener('unhandledrejection', (e)=>{ if (!PF) console.warn('Rejection', e.reason); });

window.addEventListener('DOMContentLoaded', async () => {
  initFromLocalStorage();
  initUI();
  initPreflight(PF);

  const canvas = document.getElementById('mapCanvas');
  initMap(canvas);

  // Map controls
  document.getElementById('planFile').addEventListener('change', (e)=>{
    const f = e.target.files[0]; if (f) loadPlanFromFile(f);
  });
  document.getElementById('btnUseSamplePlan').addEventListener('click', async ()=>{
    const res = await fetch('assets/sample-plan.png'); const blob = await res.blob();
    const fr = new FileReader(); fr.onload = ()=>usePlanDataUrl(fr.result); fr.readAsDataURL(blob);
  });
  document.getElementById('btnCalibrate').addEventListener('click', ()=>{ setModeCalibrate(); });
  document.getElementById('btnSetStart').addEventListener('click', ()=>{ setModeStart(); });

  // If no start yet but sites exist, default to site 1
  if (!state.start && state.sites.length){
    setStartPointFromSite(state.sites[0].id);
  }

  // Install prompt
  let deferredPrompt = null;
  const installBtn = document.getElementById('installBtn');
  installBtn.style.display = 'none';
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-block';
    document.getElementById('installStatus').textContent = 'Installierbar';
  });
  installBtn.addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    document.getElementById('installStatus').textContent = outcome==='accepted' ? 'Installiert' : 'Installation abgelehnt';
    deferredPrompt = null;
  });

  // Service worker
  if ('serviceWorker' in navigator){
    try{
      const reg = await navigator.serviceWorker.register('sw.js');
      console.log('SW registered', reg.scope);
    }catch(err){ console.warn('SW register failed', err); }
  }

  // Update UI sums
  bus.emit('containers:updated', {count: state.containers.length, warnings: []});
  bus.emit('sites:updated', {count: state.sites.length, warnings: []});
  bus.emit('settings:updated', {obj: state.settings});
});
