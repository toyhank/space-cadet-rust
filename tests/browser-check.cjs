const {spawn}=require("node:child_process");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const PORT=9531,exe="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url="http://127.0.0.1:8000/3d.html?rev=projectionbumper2";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sc3d-cdp-"));
 const proc=spawn(exe,["--headless=new","--no-sandbox","--use-gl=angle",
  "--use-angle=swiftshader","--enable-unsafe-swiftshader","--enable-webgl",
  "--no-first-run","--no-default-browser-check","--disable-extensions",
  "--remote-allow-origins=*","--remote-debugging-port="+PORT,
  "--user-data-dir="+profile,"--window-size=1400,940",url],{stdio:"ignore"});
 try{
  let pages;
  for(let i=0;i<100;i++){
   try{const r=await fetch("http://127.0.0.1:"+PORT+"/json/list");
    if(r.ok){pages=await r.json();if(pages.some(x=>x.url?.includes("3d.html")))break;}}
   catch(_){}
   await sleep(200);
  }
  const page=pages?.find(x=>x.url?.includes("3d.html"));
  if(!page)throw Error("Chrome CDP page unavailable");
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   ws.addEventListener("open",resolve,{once:true});
   ws.addEventListener("error",reject,{once:true});
  });
  let counter=1;const pending=new Map();
  ws.onmessage=e=>{
   const p=JSON.parse(e.data);
   if(p.id&&pending.has(p.id)){
    const h=pending.get(p.id);pending.delete(p.id);
    p.error?h.reject(Error(p.error.message)):h.resolve(p.result);
   }
  };
  function call(method,params={}){
   const id=counter++;
   return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
   });
  }
  await call("Page.enable");await call("Runtime.enable");
  const expr='(()=>{const a=window.__spaceCadet3D;if(!a)return null;return {snapshot:a.snapshot,bumperProfiles:a.world.bumpers.map(b=>({name:b.source,projected:b.projected,shift:b.shaftShift}))};})()';
  let model=null;
  for(let i=0;i<70;i++){
   const r=await call("Runtime.evaluate",{expression:expr,returnByValue:true});
   model=r.result?.value;
   if(model)break;
   await sleep(500);
  }
  if(!model)throw Error("Scene failed to initialize");
  if(model.bumperProfiles.length!==7||model.bumperProfiles.some(x=>!x.projected))
   throw Error("Bumper projections absent");
  const shot=await call("Page.captureScreenshot",{format:"png"});
  const output=path.join(os.tmpdir(),"spacecadet-bumper-projection.png");
  fs.writeFileSync(output,Buffer.from(shot.data,"base64"));
  console.log("PASS live Chrome 3D:",JSON.stringify(model));
  console.log("SCREENSHOT:",output,fs.statSync(output).size);
  // Isolate the cause of any long triangle artifacts before shipping.
  const detail=await call("Runtime.evaluate",{expression:
   '(()=>{const m=[];window.__spaceCadet3D.world.scene.traverse(o=>{if(o.name==="calibrated-bumper-band"||o.name==="calibrated-bumper-core"){const p=o.geometry.attributes.position;let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z)}m.push({name:o.name,x0,x1,z0,z1,count:p.count,position:o.position.toArray(),normalY:o.geometry.attributes.normal?.getY(0)})}});return m})()',
   returnByValue:true});
  console.log("GEOMETRY:",JSON.stringify(detail.result?.value?.slice(0,7)));
  const calibrated=detail.result?.value||[];
  const cores=calibrated.filter(g=>g.name==="calibrated-bumper-core");
  if(cores.length!==7)throw Error("Missing 7 projected cap meshes");
  for(const g of cores){
    if(Math.max(Math.abs(g.x0),Math.abs(g.x1),Math.abs(g.z0),Math.abs(g.z1))>1)
      throw Error("Cap vertices wrongly offset: "+JSON.stringify(g));
    if(g.normalY<.5)throw Error("Bumper top is facing DOWN: "+JSON.stringify(g));
  }
  await call("Runtime.evaluate",{expression:
   'window.__spaceCadet3D.world.scene.traverse(o=>{if(o.name==="calibrated-bumper-band")o.visible=false;});'});
  await sleep(900);
  const clearBand=await call("Page.captureScreenshot",{format:"png"});
  const clearPath=path.join(os.tmpdir(),"spacecadet-bumper-nobands.png");
  fs.writeFileSync(clearPath,Buffer.from(clearBand.data,"base64"));
  console.log("NO BANDS SCREENSHOT:",clearPath);
  ws.close();
 }finally{proc.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
