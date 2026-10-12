const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const PORT = 9535, exe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = 'http://127.0.0.1:8000/3d.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-hd-'));
  const proc = spawn(exe, [
    '--headless=new', '--no-sandbox', '--remote-allow-origins=*',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, url
  ], { stdio: 'ignore' });

  try {
    let pages;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
        if (r.ok) { pages = await r.json(); break; }
      } catch(_) {}
      await sleep(200);
    }
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let counter = 1;
    const pending = new Map();
    ws.onmessage = e => {
      const p = JSON.parse(e.data);
      if (p.id && pending.has(p.id)) {
        const h = pending.get(p.id);
        pending.delete(p.id);
        p.error ? h.reject(Error(p.error.message)) : h.resolve(p.result);
      }
    };

    function call(method, params = {}) {
      const id = counter++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await call("Page.enable");
    await call("Runtime.enable");

    const script = `
      (async () => {
        const img = new Image();
        img.src = './hd_table.png';
        await new Promise(r => img.onload = r);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        const getP = (x, y) => {
          const i = (y * img.width + x) * 4;
          return [d[i], d[i+1], d[i+2], d[i+3]];
        };

        // Let's analyze bounding boxes:
        // 1. Where does the table start and end horizontally and vertically?
        // Let's sample horizontal row at y = 540 (middle height of 1086)
        const row540 = [];
        for (let x = 0; x < img.width; x += 5) {
          const p = getP(x, 540);
          row540.push({ x, lum: 0.299*p[0] + 0.587*p[1] + 0.114*p[2] });
        }

        // 2. Sample vertical col at x = 500 (inside table)
        const col500 = [];
        for (let y = 0; y < img.height; y += 5) {
          const p = getP(500, y);
          col500.push({ y, lum: 0.299*p[0] + 0.587*p[1] + 0.114*p[2] });
        }

        // 3. Search for backglass box (top right)
        // Find left border of backglass at y = 200
        const row200 = [];
        for (let x = 900; x < img.width; x += 5) {
          const p = getP(x, 200);
          row200.push({ x, lum: 0.299*p[0] + 0.587*p[1] + 0.114*p[2] });
        }

        return {
          w: img.width,
          h: img.height,
          row540,
          col500,
          row200
        };
      })()
    `;

    const res = await call('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
    console.log('Result w, h:', res.value?.w, res.value?.h);
    fs.writeFileSync('hd_scan.json', JSON.stringify(res.value, null, 2));
    console.log('Saved hd_scan.json');
  } finally {
    proc.kill();
  }
}
main();
