const PF = new URLSearchParams(location.search).get('pf') === '1';

function panic(msg){
  const el = document.getElementById('statusArea');
  if (el){ el.className = 'status-area error'; el.innerHTML = `<ul><li>${msg}</li></ul>`; }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { initFromLocalStorage } = await import('./data.js');
    const { bus } = await import('./bus.js');
    const { initPreflight } = await import('./preflight.js');   // dyn
    const ui = await import('./ui.js');                         // dyn
    const map = await import('./map.js');                       // dyn

    initFromLocalStorage();
    ui.initUI();
    initPreflight(PF); // bei Fehlern bleibt das Overlay erreichbar

    const canvas = document.getElementById('mapCanvas');
    map.initMap(canvas);
    // … (Buttons verkabeln, SW registrieren)
  } catch (e) {
    panic('Kritischer Ladefehler. Seite neu laden oder Cache leeren.');
    if (PF) { try { (await import('./preflight.js')).initPreflight(true); } catch(_){} }
    console.error(e);
  }
});