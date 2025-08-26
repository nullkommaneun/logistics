const PF = new URLSearchParams(location.search).get('pf') === '1';

window.addEventListener('error', (e)=>{ panic('Unerwarteter Fehler: ' + (e.message || 'unbekannt')); });
window.addEventListener('unhandledrejection', (e)=>{ 
  const msg = e?.reason?.message || String(e.reason||'');
  panic('Programmfehler: ' + msg);
});

document.addEventListener('DOMContentLoaded', ()=>{ bootstrap().catch(panic); });

async function bootstrap(){
  try{
    const dataMod = await import('./data.js');
    const { bus } = await import('./bus.js');
    const { initPreflight } = await import('./preflight.js');
    const uiMod  = await import('./ui.js');
    const mapMod = await import('./map.js');

    dataMod.initFromLocalStorage();
    await uiMod.initUI();
    initPreflight(PF);

    const canvas = document.getElementById('mapCanvas');
    mapMod.initMap(canvas);

    // Plan laden
    const planInput = document.getElementById('planFile');
    if (planInput){
      planInput.addEventListener('change', (e)=>{
        const f = e.target.files && e.target.files[0];
        if (f) mapMod.loadPlanFromFile(f);
      });
    }

    // Kalibrieren / Standort / Start
    document.getElementById('btnCalibrate').addEventListener('click', ()=>mapMod.setModeCalibrate());
    document.getElementById('btnAddSite').addEventListener('click', ()=>mapMod.setModeAddSite());
    document.getElementById('btnSetStart').addEventListener('click', ()=>mapMod.setModeStart());

    if (!dataMod.state.start && dataMod.state.sites.length){
      dataMod.setStartPointFromSite(dataMod.state.sites[0].id);
    }

    // PWA-Install
    let deferredPrompt = null;
    const installBtn = document.getElementById('installBtn');
    if (installBtn){
      installBtn.style.display = 'none';
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); deferredPrompt = e;
        installBtn.style.display = 'inline-block';
        const s = document.getElementById('installStatus'); if (s) s.textContent = 'Installierbar';
      });
      installBtn.addEventListener('click', async ()=>{
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        const s = document.getElementById('installStatus');
        if (s) s.textContent = outcome==='accepted' ? 'Installiert' : 'Installation abgelehnt';
        deferredPrompt = null;
      });
    }

    // Service Worker
    if ('serviceWorker' in navigator){
      try{ await navigator.serviceWorker.register('sw.js'); }
      catch(err){ if (PF) panic('Service Worker konnte nicht registriert werden.'); }
    }

    // Initiale Events
    bus.emit('containers:updated', {count: dataMod.state.containers.length, warnings: []});
    bus.emit('sites:updated', {count: dataMod.state.sites.length});
    bus.emit('settings:updated', {obj: dataMod.state.settings});
  }catch(err){
    console.error(err);
    panic('Kritischer Ladefehler. Seite neu laden oder Cache leeren.');
    if (PF){ try{ const { initPreflight } = await import('./preflight.js'); initPreflight(true); }catch(_){} }
    throw err;
  }
}

function panic(message){
  const el = document.getElementById('statusArea');
  if (el){
    el.className = 'status-area error';
    el.innerHTML = '<ul><li>'+escapeHtml(String(message||'Unbekannter Fehler'))+'</li></ul>';
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }