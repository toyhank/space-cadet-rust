const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const PORT = 9532, exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:8000/3d.html?rev=" + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sc3d-test-"));
  const proc = spawn(exe, [
    "--headless=new", "--no-sandbox", "--use-gl=angle",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--remote-allow-origins=*", "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + profile, "--window-size=1600,1000", url
  ], { stdio: "ignore" });

  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
        if (r.ok) {
          pages = await r.json();
          if (pages.some(x => x.url?.includes("3d.html"))) break;
        }
      } catch (_) {}
      await sleep(200);
    }

    const page = pages?.find(x => x.url?.includes("3d.html"));
    if (!page) throw Error("Chrome CDP page unavailable");

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let counter = 1;
    const pending = new Map();
    ws.onmessage = e => {
      const p = JSON.parse(e.data);
      if (p.method === "Runtime.consoleAPICalled") {
        console.log("BROWSER LOG:", p.params.type, p.params.args.map(a => a.value || a.description).join(" "));
      }
      if (p.method === "Runtime.exceptionThrown") {
        console.log("BROWSER ERR:", p.params.exceptionDetails?.exception?.description || p.params.exceptionDetails?.text);
      }
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
    await call("Page.navigate", { url });

    // Wait for window.__spaceCadet3D to be ready
    const expr = `(() => {
      const a = window.__spaceCadet3D;
      if (!a) return null;
      return {
        ready: true,
        bumpers: a.sceneComponents.bumpers.length,
        targets: a.sceneComponents.targets.length,
        lights: a.sceneComponents.lights.length,
        ballActive: a.simulation.ball.active,
        ballPos: { x: a.simulation.ball.x, y: a.simulation.ball.y, z: a.simulation.ball.z },
        flippers: !!a.sceneComponents.leftFlipper && !!a.sceneComponents.rightFlipper
      };
    })()`;

    let info = null;
    for (let i = 0; i < 60; i++) {
      const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true });
      info = r.result?.value;
      if (info) break;
      await sleep(300);
    }

    if (!info) throw Error("3D Scene failed to initialize in browser");
    console.log("3D Scene Status:", JSON.stringify(info));

    // Capture screenshot of authentic view
    const shot1 = await call("Page.captureScreenshot", { format: "png" });
    const out1 = path.join(os.tmpdir(), "spacecadet-3d-authentic.png");
    fs.writeFileSync(out1, Buffer.from(shot1.data, "base64"));
    console.log("SCREENSHOT (Authentic):", out1, fs.statSync(out1).size);

    // Switch to Orbit view and capture
    await call("Runtime.evaluate", { expression: `window.__spaceCadet3D.setCameraView("orbit")` });
    await sleep(500);
    const shot2 = await call("Page.captureScreenshot", { format: "png" });
    const out2 = path.join(os.tmpdir(), "spacecadet-3d-orbit.png");
    fs.writeFileSync(out2, Buffer.from(shot2.data, "base64"));
    console.log("SCREENSHOT (Orbit 3D):", out2, fs.statSync(out2).size);

    // Test launch
    await call("Runtime.evaluate", { expression: `window.__spaceCadet3D.simulation.launch()` });
    await sleep(1000);
    const shot3 = await call("Page.captureScreenshot", { format: "png" });
    const out3 = path.join(os.tmpdir(), "spacecadet-3d-play.png");
    fs.writeFileSync(out3, Buffer.from(shot3.data, "base64"));
    console.log("SCREENSHOT (Ball in play):", out3, fs.statSync(out3).size);

    ws.close();
  } finally {
    proc.kill();
  }
}

main().catch(e => {
  console.error("Test failed:", e);
  process.exitCode = 1;
});
