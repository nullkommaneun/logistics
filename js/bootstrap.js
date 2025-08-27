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

    dataMod.initFromLocalStorage();
    await uiMod.initUI();
    initPreflight(PF);

    // Map: nur Start & Zoom
    const mapMod = await import('./map.js');
    const pick = (name) => mapMod[name] || (mapMod.default && mapMod.default[name]);

    const initMap = pick('initMap');
    if (typeof initMap !== 'function') {
      throw new Error('map.initMap nicht verfügbar (veralteter Cache?). Bitte Seite zweimal neu laden.');
    }

    const canvas = document.getElementById('mapCanvas');
    initMap(canvas);

    // Buttons
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('btnSetStart', ()=>pick('setModeStart') && pick('setModeStart')());
    bind('btnZoomIn',   ()=>pick('zoomIn') && pick('zoomIn')());
    bind('btnZoomOut',  ()=>pick('zoomOut') && pick('zoomOut')());
    bind('btnZoomReset',()=>pick('zoomReset') && pick('zoomReset')());

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
    panic('Kritischer Ladefehler. Seite neu laden (ggf. 2×) oder Cache leeren.');
    try{ const { initPreflight } = await import('./preflight.js'); initPreflight(true); }catch(_){}
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