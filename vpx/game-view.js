import * as THREE from "three";
import {CadetGame,extractPositions} from "./gameplay.js";
import {ArcadeAudio} from "./arcade-audio.js";

const $=id=>document.getElementById(id);
const keyMap={KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right"};
export class VPXGameView {
  constructor(sceneRoot,lamps,options={}){
    this.options=options;
    this.root=sceneRoot;this.lamps=lamps;
    const coordinates=[];
    sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse(o=>{
      if(!o.isMesh||!o.name)return;
      const point=o.getWorldPosition(new THREE.Vector3());
      coordinates.push({name:o.name,position:{x:point.x,y:point.y,z:point.z}});
    });
    this.game=new CadetGame(extractPositions(coordinates),{physics:options.physics});
    const physical=this.game.physics;
    // Physics diagnostics are available only in the separate inspection mode.
    if($("game-physics-info"))$("game-physics-info").textContent=physical?
      `${physical.edges.length} VPX collider segments`:"Simplified collisions";
    this.running=false;this.last=performance.now();
    this.keys={left:false,right:false,space:false};
    this.ballModels=new Map();this.bumperFlash=new Map();
    this.flipperGroups={};this.flipperNodes=[];this.bumperMeshes={};this.gateMeshes=[];
    this.lastHud=-1;this.lastLampSync=-1;this.originalParents=new Map();
    this.lastScore=0;
    let audioSettings={enabled:true,volume:.4};
    try{
      const saved=JSON.parse(localStorage.getItem("space-cadet-audio")||"{}");
      if(typeof saved.enabled==="boolean")audioSettings.enabled=saved.enabled;
      if(typeof saved.volume==="number"&&Number.isFinite(saved.volume))
        audioSettings.volume=Math.max(0,Math.min(1,saved.volume));
    }catch(_){}
    this.audio=new ArcadeAudio(audioSettings);
    this.dmdUntil=0;this.dmdTitle="";this.dmdSubtitle="";
    this.originalTransforms=new Map();
    this.onKeyDown=e=>this.keyDown(e);
    this.onKeyUp=e=>this.keyUp(e);
    this.onBlur=()=>{this.keys.left=this.keys.right=this.keys.space=false;this.syncKeys();};
    this.originalDmdMeshes=[];
    this.setupObjects();this.setupBindings();
    this.showBestScore();
  }
  setupObjects(){
    this.root.updateMatrixWorld(true);
    for(const side of ["left","right"]){
      const cap=side==="left"?"LeftFlipper":"RightFlipper";
      const nodes=[cap+"Base",cap+"Rubber",cap+"Top"].map(n=>this.root.getObjectByName(n)).filter(Boolean);
      const base=nodes[0];if(!base)continue;
      const origin=base.getWorldPosition(new THREE.Vector3());
      const group=new THREE.Group();
      group.name="Game"+cap;group.position.copy(origin);this.root.add(group);
      group.updateWorldMatrix(true,false);
      for(const node of nodes){
        this.originalParents.set(node,node.parent);
        group.attach(node);this.flipperNodes.push(node);
      }
      this.flipperGroups[side]=group;
    }
    for(let i=1;i<=7;i++){
      const ring=this.root.getObjectByName("Bumper"+i+"Ring");
      if(ring){
        this.bumperMeshes["Bumper"+i]=ring;
        this.originalTransforms.set(ring,{position:ring.position.clone(),scale:ring.scale.clone()});
      }
    }
    this.ballGeometry=new THREE.SphereGeometry(.0122,24,16);
    this.ballMaterial=new THREE.MeshPhysicalMaterial({
      color:0xedf5ff,metalness:1,roughness:.115,clearcoat:.8,clearcoatRoughness:.07,
      envMapIntensity:1.3,
    });
    for(const gate of this.game.physics?.gates||[]){
      const wire=this.root.getObjectByName(gate.name+"Wire");
      if(wire)this.gateMeshes.push({gate,wire,rotation:wire.rotation.clone()});
    }
    this.plungerParts=["PlungerRod","PlungerSpring","PlungerRing","PlungerTip"]
      .map(name=>this.root.getObjectByName(name)).filter(Boolean);
    for(const part of this.plungerParts)
      this.originalTransforms.set(part,{position:part.position.clone(),scale:part.scale.clone()});
    this.debugCollision=new THREE.Group();
    this.debugCollision.name="VPXColliderDebug";
    this.debugCollision.visible=false;
    if(this.game.physics){
      const edges=this.game.physics.edges,vertices=[];
      for(const edge of edges)
        vertices.push(edge.x1,.033,edge.z1,edge.x2,.033,edge.z2);
      const geom=new THREE.BufferGeometry();
      geom.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      const lines=new THREE.LineSegments(geom,new THREE.LineBasicMaterial({
        color:0x52f6c5,transparent:true,opacity:.8,depthTest:false
      }));
      this.debugCollision.add(lines);
      for(const c of this.game.physics.data.circles){
        const circle=new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(Array.from({length:42},(_,i)=>{
            const a=2*Math.PI*i/42;
            return new THREE.Vector3(c.x+Math.cos(a)*c.radius,.034,
              c.z+Math.sin(a)*c.radius);
          })),
          new THREE.LineBasicMaterial({color:0xffcb4a,depthTest:false}));
        this.debugCollision.add(circle);
      }
    }
    this.root.add(this.debugCollision);
    this.shadowGeometry=new THREE.CircleGeometry(.014,24);
    this.shadowMaterial=new THREE.MeshBasicMaterial({color:0x000000,
      transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
  }
  setupBindings(){
    document.addEventListener("keydown",this.onKeyDown);
    document.addEventListener("keyup",this.onKeyUp);
    window.addEventListener("blur",this.onBlur);
    this.listeners=[];
    for(const [id,key] of [["game-left","left"],["game-right","right"],["game-launch","space"]]){
      const element=$(id);if(!element)continue;
      const down=e=>{
        e.preventDefault();this.audio.unlock();
        if(key!=="space"&&!this.keys[key])this.playSound("flipperHit");
        this.keys[key]=true;
        element.setPointerCapture(e.pointerId);this.syncKeys();
      };
      const up=e=>{
        e.preventDefault();
        if(key==="space"&&this.keys.space)this.launch();
        this.keys[key]=false;this.syncKeys();
      };
      element.addEventListener("pointerdown",down);
      element.addEventListener("pointerup",up);
      element.addEventListener("pointercancel",up);
      this.listeners.push([element,"pointerdown",down],[element,"pointerup",up],[element,"pointercancel",up]);
    }
    $("game-new").onclick=()=>{this.audio.unlock();this.restart();};
    $("game-pause").onclick=()=>this.togglePause();
    $("game-nudge").onclick=()=>this.game.nudge(this.game.rng()<.5?-1:1);
    $("game-start").onclick=()=>{this.audio.unlock();this.begin();};
    $("game-sound").checked=this.audio.enabled;
    $("game-volume").value=String(Math.round(this.audio.volume*100));
    $("game-volume-label").textContent=Math.round(this.audio.volume*100)+"%";
    $("game-sound").onchange=()=>{
      this.audio.setEnabled($("game-sound").checked);
      if(this.audio.enabled)this.audio.unlock();
      this.saveAudioSettings();
    };
    $("game-volume").oninput=()=>{
      this.audio.setVolume(Number($("game-volume").value)/100);
      $("game-volume-label").textContent=$("game-volume").value+"%";
      this.saveAudioSettings();
    };
    $("game-test-sound").onclick=()=>{
      this.audio.unlock().then(ok=>{if(ok)this.playSound("missionStart");});
    };
    if($("game-debug"))$("game-debug").onchange=e=>{this.debugCollision.visible=e.target.checked;};
    $("game-select-prev").onclick=()=>this.selectMission(-1);
    $("game-select-next").onclick=()=>this.selectMission(1);
    $("game-accept-mission").onclick=()=>this.acceptMission();
    $("game-save-score").onclick=()=>this.registerScore();
    $("game-exit").onclick=()=>this.stop();
    $("game-dashboard").hidden=false;
  }
  saveAudioSettings(){
    try{localStorage.setItem("space-cadet-audio",JSON.stringify({
      enabled:this.audio.enabled,volume:this.audio.volume
    }));}catch(_){}
  }
  selectMission(delta){
    if(!this.running||this.game.over||this.game.mission)return;
    this.game.selectMission((this.game.missionChoice+delta+4)%4);
    this.announce("MISSION SELECTED",this.game.choiceName(),1600);
    this.renderHud();
  }
  acceptMission(){
    if(!this.running||this.game.over||this.game.paused||this.game.mission)return;
    // Accessible equivalent of the JP VPX mission-accept shot. Physical
    // LaunchRamp can also start missions when hit.
    if(!this.game.activeBalls.length){
      this.announce("LAUNCH A BALL","THEN START A MISSION",1900);
      return;
    }
    if(this.game.beginMission())this.renderHud();
  }
  announce(headline,subtitle="",duration=2300){
    this.dmdTitle=headline;this.dmdSubtitle=subtitle;
    this.dmdUntil=performance.now()+duration;
    $("game-dmd-line1").textContent=headline;
    $("game-dmd-line2").textContent=subtitle;
  }
  begin(){
    // Original VPX exports its separate DMD score mesh as floating "digit"
    // geometry beside the table. The cabinet now owns this display, so
    // hide the duplicate mesh while playing (inspector still has the source).
    this.root.traverse(o=>{
      if(o.isMesh&&/^(?:digit\d+|digitgrid)$/i.test(o.name)){
        if(!this.originalDmdMeshes.some(v=>v.object===o))
          this.originalDmdMeshes.push({object:o,visible:o.visible});
        o.visible=false;
      }
    });
    this.running=true;this.restart();
    this.options.onBegin?.();
    document.body.classList.add("playing");
    $("game-start").hidden=true;$("game-exit").hidden=false;
    $("game-overlay").hidden=false;$("game-pause").disabled=false;
    $("game-pause").textContent="暂停";
    $("game-message").textContent="READY · 按住 SPACE 蓄力，松开发射";
    this.setLamps();this.last=performance.now();
  }
  stop(){
    this.running=false;this.game.paused=true;
    document.body.classList.remove("playing");
    $("game-start").hidden=false;$("game-exit").hidden=true;
    $("game-pause").disabled=true;$("game-overlay").hidden=true;
    this.keys.left=this.keys.right=this.keys.space=false;
    this.clearBalls();
    for(const item of this.originalDmdMeshes)item.object.visible=item.visible;
    this.lamps?.setMode($("lamp-mode").value,performance.now()/1000);
    this.options.onExit?.();
  }
  restart(){
    this.game.start();this.clearBalls();
    this.keys.left=this.keys.right=this.keys.space=false;
    this.last=performance.now();this.dmdUntil=0;this.dmdTitle="";
    this.pendingScoreToken=null;$("game-hall").hidden=true;
    $("game-save-score").disabled=false;
    $("game-player-name").value="";
    this.renderHud(true);this.setLamps();
  }
  togglePause(){
    if(!this.running)return;
    this.game.paused=!this.game.paused;
    $("game-pause").textContent=this.game.paused?"继续":"暂停";
    $("game-message").textContent=this.game.paused?"PAUSED — P 继续":"继续游戏";
    this.last=performance.now();
  }
  keyDown(e){
    if(!this.running)return;
    if(["INPUT","TEXTAREA","SELECT"].includes(e.target?.tagName)||e.ctrlKey||e.metaKey)return;
    this.audio.unlock();
    const side=keyMap[e.code];
    if(side){if(!this.keys[side])this.playSound("flipperHit");
      this.keys[side]=true;this.syncKeys();e.preventDefault();}
    if(e.code==="Space"){if(!e.repeat)this.keys.space=true;e.preventDefault();}
    if(e.code==="KeyR"&&!e.repeat){this.restart();e.preventDefault();}
    if(e.code==="KeyP"&&!e.repeat){this.togglePause();e.preventDefault();}
    if(e.code==="KeyQ"&&!e.repeat){this.game.nudge(-1);e.preventDefault();}
    if(e.code==="KeyE"&&!e.repeat){this.game.nudge(1);e.preventDefault();}
    if(e.code==="KeyZ"&&!e.repeat){this.selectMission(-1);e.preventDefault();}
    if(e.code==="KeyX"&&!e.repeat){this.selectMission(1);e.preventDefault();}
    if(e.code==="KeyM"&&!e.repeat){this.acceptMission();e.preventDefault();}
  }
  keyUp(e){
    if(!this.running)return;
    const side=keyMap[e.code];
    if(side){this.keys[side]=false;this.syncKeys();e.preventDefault();}
    if(e.code==="Space"){
      if(this.keys.space)this.launch();
      this.keys.space=false;e.preventDefault();
    }
  }
  syncKeys(){
    this.game.setFlipper("left",this.keys.left);
    this.game.setFlipper("right",this.keys.right);
  }
  launch(){this.game.launch(this.game.plungerCharge);this.game.plungerCharge=0;}
  addBall(obj){
    const ball=new THREE.Mesh(this.ballGeometry,this.ballMaterial);
    ball.castShadow=true;ball.name="ActiveBall"+obj.id;
    const shadow=new THREE.Mesh(this.shadowGeometry,this.shadowMaterial);
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.003;
    this.root.add(ball,shadow);
    this.ballModels.set(obj.id,{mesh:ball,shadow});
  }
  clearBalls(){
    for(const {mesh,shadow} of this.ballModels.values())this.root.remove(mesh,shadow);
    this.ballModels.clear();
  }
  syncBalls(){
    const live=new Set(this.game.activeBalls.map(b=>b.id));
    if(this.game.plungerLoaded&&this.game.activeBalls.length===0)live.add(-1);
    for(const [id,ref] of this.ballModels){
      if(!live.has(id)){this.root.remove(ref.mesh,ref.shadow);this.ballModels.delete(id);}
    }
    const toRender=[...this.game.activeBalls];
    if(live.has(-1)){
      const [x,z]=this.game.physics
        ?this.game.getPoint("swPlungerRest",[.485,.957])
        :[.484,1.006];
      toRender.push({id:-1,x,z:this.game.physics?z-.0122*1.55:z,vx:0,vz:0});
    }
    for(const b of toRender){
      if(!this.ballModels.has(b.id))this.addBall(b);
      const {mesh,shadow}=this.ballModels.get(b.id);
      mesh.position.set(b.x,b.y??b.r??.0122,b.z);
      shadow.position.set(b.x,.0015,b.z);
      const altitude=Math.max(0,(b.y??.0122)-(b.r??.0122));
      shadow.visible=!b.sinking;
      // Shadow disperses on high ramps / during a jump. Its footprint
      // remains projected onto the playfield floor.
      const shadowScale=1+Math.min(2,altitude*13);
      shadow.scale.setScalar(shadowScale);
      // Ball spin follows travelled distance, not render FPS. A 90Hz display
      // must not make it appear to rotate faster than a 30Hz display.
      const prev=mesh.userData.previousPosition;
      if(prev){
        const r=Math.max(.001,b.r||.0122);
        mesh.rotation.x+=(b.z-prev.z)/r;
        mesh.rotation.z-=(b.x-prev.x)/r;
      }
      mesh.userData.previousPosition={x:b.x,z:b.z};
    }
  }
  animateGates(){
    for(const {gate,wire,rotation} of this.gateMeshes){
      const state=this.game.physics?.gateStates.get(gate.name);
      if(state){
        wire.rotation.copy(rotation);
        wire.rotation.x+=state.angle*.65;
      }
    }
  }
  animatePlunger(){
    for(const part of this.plungerParts){
      const base=this.originalTransforms.get(part);
      if(base)part.position.set(base.position.x,base.position.y,
        base.position.z+this.game.plungerCharge*.047);
    }
  }
  animateBumpers(dt){
    for(const [name,mesh] of Object.entries(this.bumperMeshes)){
      const next=Math.max(0,(this.bumperFlash.get(name)||0)-dt);
      this.bumperFlash.set(name,next);
      const base=this.originalTransforms.get(mesh);
      if(base){
        mesh.scale.copy(base.scale).multiplyScalar(1+next*.3);
        mesh.position.copy(base.position);mesh.position.y+=next*.002;
      }
    }
  }
  animateFlippers(dt){
    for(const side of ["left","right"]){
      const group=this.flipperGroups[side];if(!group)continue;
      const physical=this.game.physics?.flippers.find(f=>f.name.toLowerCase()===side+"flipper");
      if(physical){
        const angle=-(physical.angle-physical.start);
        group.rotation.y=angle;
      }else{
        const key=this.keys[side]&&!this.game.tilted?1:0;
        const value=group.userData.angle??0;
        const next=value+(key-value)*Math.min(1,dt*21);
        group.userData.angle=next;
        group.rotation.y=(side==="left"?1:-1)*next*.86;
      }
    }
  }
  playSound(kind){this.audio.play(kind);}
  readScores(){
    try{
      const saved=JSON.parse(localStorage.getItem("space-cadet-vpx-scores")||"[]");
      if(!Array.isArray(saved))return [];
      return saved.map((s,i)=>typeof s==="number"?
        {id:"legacy-"+i,name:"CADET",score:s}:
        {id:s.id||"legacy-"+i,name:String(s.name||"CADET").slice(0,8),
          score:Number(s.score)||0}).filter(s=>Number.isFinite(s.score)&&s.score>=0)
        .sort((a,b)=>b.score-a.score).slice(0,5);
    }catch(_){return [];}
  }
  showBestScore(){
    const records=this.readScores();
    $("game-best").textContent=(records[0]?.score||0).toLocaleString();
    const list=$("game-hall-list");
    list.replaceChildren();
    records.forEach((record,i)=>{
      const item=document.createElement("li");
      const name=document.createElement("span");
      const score=document.createElement("strong");
      name.textContent=(i+1)+". "+record.name;
      score.textContent=record.score.toLocaleString();
      item.append(name,score);list.append(item);
    });
  }
  saveBestScore(score){
    this.pendingScoreToken="match-"+Date.now()+"-"+Math.floor(Math.random()*1e6);
    const list=this.readScores();
    list.push({id:this.pendingScoreToken,name:"CADET",score});
    list.sort((a,b)=>b.score-a.score);
    try{localStorage.setItem("space-cadet-vpx-scores",JSON.stringify(list.slice(0,5)));}catch(_){}
    this.showBestScore();$("game-hall").hidden=false;
  }
  registerScore(){
    const name=String($("game-player-name").value||"CADET").trim()
      .replace(/[^\p{L}\p{N} _-]/gu,"").slice(0,8).toUpperCase()||"CADET";
    const records=this.readScores();
    const record=records.find(s=>s.id===this.pendingScoreToken);
    if(record){
      record.name=name;
      try{localStorage.setItem("space-cadet-vpx-scores",JSON.stringify(records));}catch(_){}
    }
    this.showBestScore();
    this.announce("SCORE REGISTERED",name,3500);
    $("game-save-score").disabled=true;
  }
  eventEffects(event){
    if(["launch","bumper","flipperHit","target","sling","falling","drain",
      "missionStart","missionStage","missionComplete","missionAbort","extraBall",
      "rank","skillShot","gateOpen","gateBlock","spinner","ballLocked",
      "autoPlunge","multiball","gameOver","save","ballSearch",
      "rampLand","rampRail","rampExit","ballBounce","slingFire"].includes(event.type))
      this.playSound(event.type);
    if(event.type==="message"){
      $("game-message").textContent=event.text;
      if(/JACKPOT/i.test(event.text))this.playSound("jackpot");
      if(event.points||/MISSION|PROMOTED|JACKPOT|BALL SAVED|BONUS|EXTRA BALL|TILT/i.test(event.text))
        this.announce(event.text.slice(0,34),event.points?("+"+event.points.toLocaleString()):"",2600);
    }
    if(event.type==="missionStart")this.announce("MISSION ACCEPTED",event.name,3200);
    if(event.type==="missionStage")this.announce("NEXT MISSION STAGE",event.description,2700);
    if(event.type==="ballLocked")this.announce("BALL "+event.count+" LOCKED","LOCK THREE FOR MULTIBALL",2700);
    if(event.type==="skillShotLit")this.announce("SKILL SHOT LIT",event.value.toLocaleString()+" · HIT COLLECT LANE",1200);
    if(event.type==="skillShot")this.announce("SKILL SHOT!",event.value.toLocaleString(),2500);
    if(event.type==="missionComplete")this.announce("MISSION COMPLETE",event.name,3300);
    if(event.type==="missionAbort")this.announce("MISSION FAILED","TRY AGAIN",2600);
    if(event.type==="rank")this.announce("PROMOTED",event.rank,3300);
    if(event.type==="serve")this.announce("BALL "+event.ball,"READY TO LAUNCH",1800);
    if(event.type==="save")this.announce("BALL SAVED","SHOOT AGAIN",2200);
    if(event.type==="extraBall")this.announce("EXTRA BALL!","COMMENDATION",3000);
    if(event.type==="weaponUpgrade")this.announce("RE-ENTRY COMPLETE","WEAPONS UPGRADED",2600);
    if(event.type==="combo")this.announce("RAMP COMBO","×"+event.value,1600);
    if(event.type==="bumper")this.bumperFlash.set(event.name,.13);
    if(event.type==="falling")$("game-message").textContent="BALL DRAINING";
    if(event.type==="multiball"){
      $("game-message").textContent="MULTIBALL · 3 BALLS!";
      this.announce("WORMHOLE MULTIBALL","3 BALLS IN PLAY",3200);
    }
    if(event.type==="gameOver"){
      this.saveBestScore(event.score);
      $("game-message").textContent="GAME OVER · "+event.score.toLocaleString()+" · R 重新开始";
      this.announce("GAME OVER","FINAL SCORE "+event.score.toLocaleString(),100000);
      $("game-pause").disabled=true;
    }
    if(["target","missionProgress","bankComplete","missionStart","extraBall","rank","missionComplete","missionAbort"].includes(event.type))
      this.lastLampSync=-1;
  }
  setLamps(){
    if(!this.lamps||!this.running)return;
    // Drive actual VPX lamp insert meshes by named events and coordinates.
    this.lamps.setMode("manual",this.game.elapsed);
    const ball=this.game.activeBalls[0],chosen=new Set();
    for(const lamp of this.lamps.lamps){
      const p=lamp.position;
      if(lamp.name==="LightShootAgain"&&this.game.extraBalls>0)chosen.add(lamp.name);
      if(ball&&Math.hypot(p.x-ball.x,p.z-ball.z)<.035)chosen.add(lamp.name);
      for(const i of this.game.banks.mission){
        const target=this.game.positions["Target"+String(i).padStart(3,"0")];
        if(target&&Math.hypot(p.x-target.x,p.z-target.z)<.022)
          chosen.add(lamp.name);
      }
    }
    for(const lamp of this.lamps.lamps)
      this.lamps.setState(lamp.name,chosen.has(lamp.name)?1:0);
  }
  renderHud(){
    const s=this.game.status;
    $("game-score").textContent=String(s.score).padStart(8,"0");
    $("game-mode").textContent=s.over?"GAME OVER":s.paused?"PAUSED":s.tilted?"TILT":s.balls>1?"MULTIBALL":s.plungerLoaded?"READY TO LAUNCH":"BALL IN PLAY";
    $("game-ball").textContent=s.ball+" / 3";
    $("game-rank").textContent=s.rank+" · "+s.progress+"/18";
    $("game-rank-fill").style.width=Math.min(100,s.progress/18*100)+"%";
    $("game-fuel").textContent="●".repeat(s.fuel)+"○".repeat(6-s.fuel);
    $("game-multiplier").textContent="×"+s.multiplier;
    $("game-extra").textContent=String(s.extraBalls);
    $("game-mission").textContent=s.mission||s.selectedMission;
    $("game-mission-state").textContent=s.mission?"ACTIVE":"SELECT";
    $("game-mission-fill").style.width=s.mission?
      Math.min(100,s.missionProgress/Math.max(1,s.missionGoal)*100)+"%":"0%";
    const missionAvailable=!s.over&&!s.mission&&!s.paused;
    $("game-select-prev").disabled=!missionAvailable;
    $("game-select-next").disabled=!missionAvailable;
    $("game-accept-mission").disabled=!missionAvailable||s.balls===0;
    $("game-accept-mission").textContent=s.mission?"任务进行中":"辅助接受任务";
    $("game-progress").textContent=s.mission?
      s.missionStageText+" · "+s.missionProgress+" / "+s.missionGoal:
      "命中任务目标，经过发射坡道接受任务";
    $("game-jackpot").textContent=s.jackpotActive?s.jackpot.toLocaleString():"—";
    $("game-active-balls").textContent=s.balls+" 颗";
    $("game-charge").style.width=Math.round(this.game.plungerCharge*100)+"%";
    $("game-bonus").textContent=s.bonus.toLocaleString();
    $("game-combo").textContent=String(s.combo);
    for(const [name,key] of Object.entries({
      fuel:"fuel",booster:"booster",medal:"medal",
      comet:"comet",radiation:"radiation",multiplier:"multiplier"})){
      const lamp=$("game-bank-"+name);
      lamp.classList.toggle("lit",(s.bankProgress[key]||0)>0||
        (key==="booster"&&s.jackpotActive));
      lamp.title=key+": "+(s.bankProgress[key]||0)+"/3";
    }
    if(!this.dmdUntil||performance.now()>this.dmdUntil){
      $("game-dmd-line1").textContent=s.over?"GAME OVER":
        s.paused?"PAUSED":s.tilted?"TILT":s.mission?"MISSION IN PROGRESS":
        s.balls>1?"MULTIBALL":s.plungerLoaded?"READY TO LAUNCH":"SPACE CADET";
      $("game-dmd-line2").textContent=s.mission?
        s.missionStageText+"  "+s.missionProgress+"/"+s.missionGoal:
        s.plungerLoaded?"HOLD SPACE · RELEASE TO SHOOT":
        "HIT TARGETS · EARN POINTS";
    }
    $("game-dmd-points").textContent=s.jackpotActive?
      "JACKPOT ARMED · "+s.jackpot.toLocaleString():
      s.ballSaver?"● BALL SAVER ACTIVE ●":"● PLAYER 1 · "+s.rank.toUpperCase()+" ●";
    $("game-save").textContent=s.ballSaver?"BALL SAVER":s.plungerLoaded?"READY":s.over?"GAME OVER":"";
  }
  update(now){
    if(!this.running)return;
    const dt=Math.min(.05,Math.max(0,(now-this.last)/1000||1/60));this.last=now;
    if(this.keys.space&&!this.game.paused&&!this.game.over&&this.game.plungerLoaded)
      this.game.plungerCharge=Math.min(1,this.game.plungerCharge+dt*.72);
    this.game.tick(dt);
    this.animateFlippers(dt);this.animateBumpers(dt);this.animateGates();this.animatePlunger();this.syncBalls();
    for(const event of this.game.consumeEvents())this.eventEffects(event);
    if(now-this.lastHud>70){this.renderHud();this.lastHud=now;}
    if(now-this.lastLampSync>450){this.setLamps();this.lastLampSync=now;}
  }
  destroy(){
    this.stop();
    document.removeEventListener("keydown",this.onKeyDown);
    document.removeEventListener("keyup",this.onKeyUp);
    window.removeEventListener("blur",this.onBlur);
    for(const [element,type,fn] of this.listeners)element.removeEventListener(type,fn);
    for(const node of this.flipperNodes){
      const original=this.originalParents.get(node);if(original)original.attach(node);
    }
    for(const group of Object.values(this.flipperGroups))group.parent?.remove(group);
    for(const {wire,rotation} of this.gateMeshes)wire.rotation.copy(rotation);
    for(const [mesh,base] of this.originalTransforms){
      mesh.position.copy(base.position);mesh.scale.copy(base.scale);
    }
    this.ballGeometry.dispose();this.ballMaterial.dispose();
    this.shadowGeometry.dispose();this.shadowMaterial.dispose();
    this.root.remove(this.debugCollision);
    this.debugCollision.traverse(o=>{
      o.geometry?.dispose();o.material?.dispose();
    });
    this.audio.destroy();
  }
}
