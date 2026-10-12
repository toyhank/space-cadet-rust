const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const PORT = 9540, exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:8000/3d.html";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sc3d-hd-"));
  const proc = spawn(exe, [
    "--headless=new", "--no-sandbox", "--remote-allow-origins=*",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, url
  ], { stdio: "ignore" });

  try {
    let pages;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
        if (r.ok) { pages = await r.json(); break; }
      } catch (_) {}
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

    // Load hd_table.png, analyze layout coordinates
    const code = `
      (async () => {
        const img = new Image();
        img.src = './hd_table.png';
        await new Promise(r => img.onload = r);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Find table outer bounding box:
        // Table is on the left side, backglass is on the right.
        // Let's sample horizontal brightness in the top, middle, bottom
        // Return PNG dataUrl of the whole image or cropped table
        return {
          width: img.width,
          height: img.height
        };
      })()
    `;

    const res = await call("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true });
    console.log("HD Image loaded:", res.value);
  } finally {
    proc.kill();
  }
}
main();
