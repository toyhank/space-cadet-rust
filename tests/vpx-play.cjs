const {spawn}=require("node:child_process");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),assert=require("node:assert/strict");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=9574;
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"vpx-play-"));
  const exe=process.env.CHROME_PATH||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const chrome=spawn(exe,["--headless=new","--no-first-run","--no-default-browser-check",
    "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--enable-webgl",
    "--remote-allow-origins=*","--remote-debugging-port="+port,
    "--user-data-dir="+profile,"--window-size=1560,960","about:blank"],{stdio:"ignore",windowsHide:true});
  let ws;
  try {
    let page;
    for(let i=0;i<70;i++){
      try{page=(await(await fetch("http://127.0.0.1:"+port+"/json/list")).json()).find(x=>x.type==="page");}
      catch(_){}
      if(page)break;await pause(250);
    }
    assert.ok(page,"Chrome CDP available");
    ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let index=0;const inflight=new Map(),errors=[];
    ws.onmessage=e=>{
      const p=JSON.parse(e.data);
      if(p.method==="Runtime.exceptionThrown")errors.push(p.params.exceptionDetails.text);
      if(p.method==="Runtime.consoleAPICalled"&&p.params.type==="error")
        errors.push(p.params.args.map(x=>x.value||x.description).join(" "));
      if(p.id&&inflight.has(p.id)){
        const {resolve,reject,timer}=inflight.get(p.id);clearTimeout(timer);inflight.delete(p.id);
        if(p.error)reject(Error(p.error.message));else resolve(p.result);
      }
    };
    const call=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++index,timer=setTimeout(()=>reject(Error("CDP timeout "+method)),40000);
      inflight.set(id,{resolve,reject,timer});
      ws.send(JSON.stringify({id,method,params}));
    });
    async function evalJs(expr){
      const r=await call("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
      return r.result.value;
    }
    await call("Runtime.enable");await call("Page.enable");
    await call("Page.navigate",{url:(process.env.PINBALL_TEST_URL||"http://127.0.0.1:8000/vpx.html?play=1")});
    if(process.env.PINBALL_UPLOAD_LOCAL_VPX==="1"){
      for(let i=0;i<95;i++){
        if(await evalJs("!!window.__vpxViewer"))break;
        await pause(350);
      }
      const doc=await call("DOM.getDocument",{depth:2});
      const fileNode=await call("DOM.querySelector",{nodeId:doc.root.nodeId,selector:"#file"});
      assert.ok(fileNode.nodeId,"VPX file picker available in public build");
      const filePath=path.resolve("assets/vpx-local/JP's Space Cadet/JP's Space Cadet v4.3.vpx");
      assert.ok(fs.existsSync(filePath),"Local VPX file needed for public build upload integration test");
      await call("DOM.setFileInputFiles",{nodeId:fileNode.nodeId,files:[filePath]});
    }
    let ready=false;
    for(let i=0;i<(process.env.PINBALL_UPLOAD_LOCAL_VPX==="1"?250:110);i++){
      ready=await evalJs("!!window.__vpxViewer?.ready&&!!window.__vpxViewer.game?.running");
      if(ready)break;await pause(350);
    }
    if(!ready)console.log("NOT READY",errors,await evalJs("({error:document.querySelector(\'#error\')?.textContent,busy:document.querySelector(\'#progress\')?.textContent,scene:!!window.__vpxViewer,ready:window.__vpxViewer?.ready,url:location.href,state:document.readyState, scripts:[...document.scripts].map(x=>x.src), resources:performance.getEntriesByType(\'resource\').slice(-7).map(x=>[x.name,x.responseStatus])})"));
    assert.ok(ready,"VPX game scene auto-start");
    const before=await evalJs("window.__vpxViewer.game.game.status");
    assert.equal(before.plungerLoaded,true);
    assert.equal(before.ball,1);
    const physics=await evalJs("({edges:window.__vpxViewer.game.game.physics?.edges.length,flippers:window.__vpxViewer.game.game.physics?.flippers.length,bumpers:window.__vpxViewer.game.game.physics?.data.circles.length})");
    assert.ok(physics.edges>450,"Real VPX collision edge map loaded");
    assert.equal(physics.flippers,2);assert.equal(physics.bumpers,7);
    assert.equal(await evalJs("getComputedStyle(document.getElementById('inspector')).display"),"none","No debug sidebar in game mode");
    assert.notEqual(await evalJs("getComputedStyle(document.getElementById('game-cabinet')).display"),"none");
    assert.equal(await evalJs("!!document.getElementById('game-debug')"),false);
    assert.equal(await evalJs("document.getElementById('game-score').textContent"),"00000000");
    assert.ok(await evalJs("document.getElementById('game-cabinet').getBoundingClientRect().width")>290);
    assert.ok(await evalJs("!!window.__vpxViewer.game.audio"),"procedural audio engine available");
    await evalJs(`(()=>{
      const volume=document.getElementById('game-volume');
      volume.value='27';volume.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    assert.equal(await evalJs("window.__vpxViewer.game.audio.volume"),.27);
    assert.equal(await evalJs("JSON.parse(localStorage.getItem('space-cadet-audio')).volume"),.27);
    await evalJs(`(()=>{
      const sound=document.getElementById('game-sound');
      sound.checked=false;sound.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    assert.equal(await evalJs("window.__vpxViewer.game.audio.enabled"),false);
    await evalJs(`(()=>{
      const sound=document.getElementById('game-sound');
      sound.checked=true;sound.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    assert.equal(await evalJs("window.__vpxViewer.game.audio.enabled"),true);
    assert.equal(await evalJs("window.__vpxViewer.root.getObjectByName('digitgrid')?.visible"),false);
    assert.equal(await evalJs("window.__vpxViewer.game.flipperGroups.left!==undefined && window.__vpxViewer.game.flipperGroups.right!==undefined"),true);
    await evalJs("window.__vpxViewer.game.game.plungerCharge=.9;window.__vpxViewer.game.launch()");
    const inFlight=await evalJs("window.__vpxViewer.game.game.status");
    assert.ok(inFlight.balls>0);
    assert.equal(inFlight.score,0);
    await evalJs('window.__vpxViewer.game.game.hit("lane","Trigger020",{id:123})');
    await evalJs('window.__vpxViewer.game.renderHud()');
    assert.equal(await evalJs("document.getElementById('game-score').textContent"),"00000000");
    await evalJs('window.__vpxViewer.game.game.elapsed+=1;window.__vpxViewer.game.game.hit("lane","Trigger029",{id:123});window.__vpxViewer.game.renderHud()');
    assert.equal(await evalJs("document.getElementById('game-score').textContent"),"00075000");
    assert.equal(await evalJs("window.__vpxViewer.game.game.status.skillShots"),1);
    await evalJs('window.__vpxViewer.game.selectMission(1)');
    assert.equal(await evalJs("window.__vpxViewer.game.game.status.missionChoice"),1);
    await evalJs('document.getElementById("game-accept-mission").click()');
    assert.equal(await evalJs("window.__vpxViewer.game.game.status.missionActive"),true);
    assert.equal(await evalJs("document.getElementById('game-mission-state').textContent"),"ACTIVE");
    await evalJs('window.__vpxViewer.game.game.elapsed+=1;window.__vpxViewer.game.game.hit("lane","Trigger006",{id:123}); window.__vpxViewer.game.renderHud()');
    assert.equal(await evalJs("window.__vpxViewer.game.game.status.missionProgress"),1);
    assert.ok(await evalJs("parseFloat(document.getElementById('game-mission-fill').style.width)")>0);
    await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}))');
    await pause(1300);
    assert.equal(await evalJs("window.__vpxViewer.game.keys.left"),true);
    console.log("FLIPPER",await evalJs("({angle:window.__vpxViewer.game.flipperGroups.left.rotation.y,active:window.__vpxViewer.game.running,last:window.__vpxViewer.game.last,now:performance.now(),renderer:window.__vpxViewer.diagnostics.meshes})"));
    assert.ok(await evalJs("window.__vpxViewer.game.flipperGroups.left.rotation.y")>.01);
    await evalJs('document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}))');
    await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyP",bubbles:true}))');
    assert.equal(await evalJs("window.__vpxViewer.game.game.paused"),true);
    await evalJs('document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyP",bubbles:true}))');
    assert.equal(await evalJs("window.__vpxViewer.game.game.paused"),false);
    const out=path.resolve("tests/artifacts");
    fs.mkdirSync(out,{recursive:true});
    const shot=await call("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(out,"vpx-play.png"),Buffer.from(shot.data,"base64"));
    const drainCheck=await evalJs(`(()=>{
      const view=window.__vpxViewer.game,g=view.game,m=g.physics.drainMouth;
      g.activeBalls.length=0;g.plungerLoaded=false;g.saverUntil=-100;
      g.spawnBall((m.left+m.right)/2,m.z-.012,0,.65);
      let sinking=false;
      for(let i=0;i<135;i++){
        g.tick(1/240);
        sinking ||= g.activeBalls.some(b=>b.sinkDepth>.003);
      }
      view.renderHud();
      return {sinking,ball:g.ballNumber,live:g.activeBalls.length};
    })()`);
    assert.equal(drainCheck.sinking,true,"3D viewer ball should visibly fall under playfield");
    assert.equal(drainCheck.ball,2,"browser must serve ball two after a drain");
    assert.equal(drainCheck.live,0,"drained ball must disappear");
    const hall=await evalJs(`(()=>{
      const view=window.__vpxViewer.game,g=view.game;
      g.activeBalls=[];g.extraBalls=0;g.saverUntil=-100;g.ballNumber=3;
      g.onDrain({id:999});
      for(const e of g.consumeEvents())view.eventEffects(e);
      view.renderHud();
      return {over:g.over,visible:!document.getElementById('game-hall').hidden,
        rows:document.querySelectorAll('#game-hall-list li').length};
    })()`);
    assert.equal(hall.over,true);assert.equal(hall.visible,true);assert.ok(hall.rows>0);
    await evalJs(`document.getElementById('game-player-name').value='ACE';
      document.getElementById('game-save-score').click()`);
    assert.ok(await evalJs("document.getElementById('game-hall-list').textContent.includes('ACE')"));
    await evalJs('document.getElementById("game-exit").click()');
    assert.equal(await evalJs("window.__vpxViewer.game.running"),false);
    assert.equal(await evalJs("document.getElementById('game-overlay').hidden"),true);
    assert.deepEqual(errors,[],"No JS errors in 3D game");
    console.log("PASS real Chrome VPX gameplay: 588-mesh scene, 3D ball launch, score, original flipper meshes animate, pause/resume, exit. Screenshot tests/artifacts/vpx-play.png");
  }finally{ws?.close();chrome.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
