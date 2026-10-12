const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(r => setTimeout(r, ms));
const before = process.argv.includes('--before');
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spacecadet-orbit-'));
  const proc = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--remote-debugging-port=9538', '--user-data-dir=' + profile, '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws;
  try {
    let page;
    for (let i = 0; i < 50; i++) { try { page = (await (await fetch('http://127.0.0.1:9538/json/list')).json()).find(p => p.type === 'page'); } catch {} if (page) break; await pause(200); }
    assert.ok(page); ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let next = 0; const pending = new Map(), errors = [];
    ws.onmessage = e => { const p = JSON.parse(e.data);
      if (p.method === 'Runtime.exceptionThrown') errors.push(p.params.exceptionDetails.exception?.description || p.params.exceptionDetails.text);
      if (p.method === 'Runtime.consoleAPICalled' && p.params.type === 'error') errors.push(p.params.args.map(a => a.value || a.description).join(' '));
      const h = pending.get(p.id); if (h) { pending.delete(p.id); clearTimeout(h.timer); p.error ? h.reject(Error(p.error.message)) : h.resolve(p.result); }
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 60000);
      pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description); return r.result.value; };
    await call('Runtime.enable'); await call('Page.enable'); await call('Page.navigate', { url: 'http://127.0.0.1:8000/vpx.html?inspect=1&test=orbit' });
    for (let i = 0; i < 100; i++) { if (await evaluate('!!window.__vpxViewer?.ready')) break; await pause(300); }
    assert.ok(await evaluate('window.__vpxViewer?.ready'), 'Scene loaded');
    await evaluate(`document.getElementById('lamp-glow').checked=false;document.getElementById('lamp-mode').value='off';document.getElementById('lamp-mode').dispatchEvent(new Event('change'));document.getElementById('lighting').value='neutral';document.getElementById('lighting').dispatchEvent(new Event('change'));`);
    const info = await evaluate(`(()=>{const a=window.__vpxViewer;return {repairs:a.materialRepairs,singleSided:a.meshes.filter(m=>[].concat(m.material).some(t=>t.side===0)).length,transparentDepthWriters:a.meshes.filter(m=>[].concat(m.material).some(t=>t.transparent&&t.depthWrite)).map(m=>m.name)}})()`);
    console.log(before ? 'BEFORE' : 'AFTER', JSON.stringify(info));
    const out = path.resolve('tests/artifacts'); fs.mkdirSync(out, { recursive: true });
    for (const [name, view] of [['front', 'table'], ['side', 'low']]) {
      await evaluate(`window.__vpxViewer.setView('${view}')`);
      // A half-turn tests the opposite side while the scene remains the same.
      if (name === 'side') await evaluate(`(()=>{const a=window.__vpxViewer;if(a.controls){const t=a.controls.target;const p=a.camera.position;p.x=2*t.x-p.x;p.z=2*t.z-p.z;a.controls.update();}})()`);
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, `vpx-orbit-${before ? 'before' : 'after'}-${name}.png`), Buffer.from(shot.data, 'base64'));
    }
    if (!before) {
      assert.ok(info.repairs.doubleSided > 0, 'Open surfaces repaired');
      assert.ok(info.repairs.opaque > 0, 'False transparent solid materials repaired');
      assert.deepEqual(info.transparentDepthWriters, [], 'Transparent overlays do not hide models behind them');
      const hits = await evaluate(`(async()=>{const T=await import('three');const a=window.__vpxViewer;const m=a.meshes.find(x=>x.userData.viewerBackfaceRepair&&[].concat(x.material).every(t=>t.side===T.DoubleSide&&t.opacity>0));if(!m)return null;const p=m.geometry.attributes.position, ix=m.geometry.index;for(let i=0;i+2<(ix?.count||p.count);i+=3){const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(m.matrixWorld));const n=new T.Vector3().crossVectors(v[1].clone().sub(v[0]),v[2].clone().sub(v[0]));if(n.length()<1e-9)continue;n.normalize();const c=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);const ray=new T.Raycaster();ray.set(c.clone().addScaledVector(n,-.0001),n);const back=ray.intersectObject(m,false).length;const mats=[].concat(m.material),old=mats.map(t=>t.side);mats.forEach(t=>t.side=T.FrontSide);const culled=ray.intersectObject(m,false).length;mats.forEach((t,i)=>t.side=old[i]);return {name:m.name,back,culled};}return null})()`);
      assert.ok(hits?.back > 0, 'Real exported surface remains visible from its back');
      assert.equal(hits.culled, 0, 'The same real surface disappears under its original front-only setting');
      console.log('BACK-SIDE', JSON.stringify(hits));
    }
    assert.deepEqual(errors, []); console.log('PASS: orbit views captured and visibility checks passed.');
  } finally { ws?.close(); proc.kill(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
