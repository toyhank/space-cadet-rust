const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9537, url = 'http://127.0.0.1:8000/vpx.html?inspect=1';
const output = path.resolve('tests/artifacts');
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spacecadet-vpx-'));
  const exe = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(exe, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1600,1100', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  let ws;
  try {
    let page;
    for (let i = 0; i < 50; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(p => p.type === 'page'); } catch {}
      if (page) break; await pause(200);
    }
    assert.ok(page, 'Chrome debug page available');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let counter = 0; const pending = new Map(), errors = [];
    ws.onmessage = e => {
      const p = JSON.parse(e.data);
      if (p.method === 'Log.entryAdded' && p.params.entry.level === 'error' && !p.params.entry.url?.includes('favicon')) errors.push(p.params.entry.text);
      if (p.method === 'Runtime.exceptionThrown') errors.push(p.params.exceptionDetails.exception?.description || p.params.exceptionDetails.text);
      if (p.method === 'Runtime.consoleAPICalled' && p.params.type === 'error') errors.push(p.params.args.map(a => a.value || a.description).join(' '));
      if (p.id && pending.has(p.id)) { const h = pending.get(p.id); pending.delete(p.id); clearTimeout(h.timer); p.error ? h.reject(Error(p.error.message)) : h.resolve(p.result); }
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++counter;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 60000);
      pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      return res.result.value;
    };
    await call('Runtime.enable'); await call('Page.enable'); await call('Log.enable'); await call('Page.navigate', { url });
    let ready = false;
    for (let i = 0; i < 100; i++) { ready = await evaluate('!!window.__vpxViewer?.ready'); if (ready) break; await pause(300); }
    if (!ready) throw Error('Scene not ready: ' + JSON.stringify(errors) + await evaluate('document.getElementById("error").textContent'));
    const diagnostics = await evaluate('window.__vpxViewer.diagnostics');
    assert.ok(diagnostics.meshes > 100); assert.ok(diagnostics.textures > 10);
    assert.equal(diagnostics.cameras, 3);
    console.log('LOADED', JSON.stringify(diagnostics));
    const lampInfo = await evaluate('window.__vpxViewer.lamps.snapshot');
    assert.ok(lampInfo.total > 100, 'Actual VPX inserts recognized');
    await evaluate(`document.getElementById('lamp-mode').value='off'; document.getElementById('lamp-mode').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate('window.__vpxViewer.lamps.snapshot.lit'), 0);
    await evaluate(`document.getElementById('lamp-mode').value='all'; document.getElementById('lamp-mode').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate('window.__vpxViewer.lamps.snapshot.lit'), lampInfo.total);
    fs.mkdirSync(output, { recursive: true });
    async function screenshot(name) {
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
    }
    await screenshot('vpx-table');
    await screenshot('vpx-lamps-on');
    await evaluate(`document.getElementById('lamp-mode').value='off'; document.getElementById('lamp-mode').dispatchEvent(new Event('change'))`);
    await screenshot('vpx-lamps-off');
    await evaluate(`document.getElementById('lamp-mode').value='wave'; document.getElementById('lamp-mode').dispatchEvent(new Event('change'))`);
    await evaluate(`document.querySelector('[data-mode="clay"]').click()`);
    assert.equal(await evaluate('window.__vpxViewer.mode'), 'clay');
    assert.equal(await evaluate('window.__vpxViewer.lamps.snapshot.enabled'), false);
    await screenshot('vpx-clay');
    await evaluate(`document.querySelector('[data-mode="pbr"]').click(); window.__vpxViewer.selectObject(window.__vpxViewer.meshes.find(m=>/bumper.*cap/i.test(m.name)) || window.__vpxViewer.meshes.find(m=>/bumper/i.test(m.name)), true)`);
    assert.equal(await evaluate('document.getElementById("focus").disabled'), false);
    await screenshot('vpx-bumper');
    await evaluate('document.getElementById("isolate").click()');
    assert.equal(await evaluate('window.__vpxViewer.meshes.filter(m=>m.visible).length'), 1);
    await evaluate('document.getElementById("fit").click()');
    assert.ok(await evaluate('window.__vpxViewer.meshes.filter(m=>m.visible).length > 100'));
    // Bad local input must leave the working scene usable and report an error.
    await evaluate('window.__vpxViewer.openFile(new File([new Uint8Array(32)], "broken.glb"))');
    assert.equal(await evaluate('document.getElementById("error").hidden'), false);
    assert.ok(await evaluate('window.__vpxViewer.ready'));
    // Run the Rust/WASM worker on the real VPX, not just the preconverted GLB.
    await evaluate(`(async()=>{const b=await(await fetch("./assets/vpx-local/JP's%20Space%20Cadet/JP's%20Space%20Cadet%20v4.3.vpx")).blob(); await window.__vpxViewer.openFile(new File([b], 'JP Space Cadet v4.3.vpx'));})()`);
    for (let i = 0; i < 120; i++) { ready = await evaluate('!!window.__vpxViewer.ready'); if (ready) break; await pause(250); }
    assert.ok(ready, 'Browser worker conversion completed');
    assert.equal(await evaluate('window.__vpxViewer.report.converter'), '@francisdb/vpin-wasm 0.38.4');
    assert.equal(await evaluate('window.__vpxViewer.report.meshes'), 588);
    assert.equal(await evaluate('window.__vpxViewer.lamps.snapshot.total'), lampInfo.total, 'Lamps rebuilt on new VPX load');
    assert.equal(await evaluate('document.getElementById("error").hidden'), true);
    assert.deepEqual(errors, [], 'No browser runtime / rendering errors');
    console.log('PASS: real GLB rendering; actual lamp on/off; clay, focus, isolation; VPX worker conversion. Screenshots:', output);
    ws.close();
  } finally { ws?.close(); proc.kill(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
