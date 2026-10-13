import {VPXCollisionWorld} from "./collision-world.js";
import {RANKS,MISSIONS,MISSION_RULES,missionTier,stageMatches} from "./original-rules.js";
/**
 * JP's Space Cadet v4.3-inspired gameplay layer.
 * NOT a Visual Pinball X physics/VBScript interpreter. Uses exported VPX
 * object coordinates, a deterministic fixed-step solver and original-style
 * progress/award rules. Zero dependencies so it is unit-testable in Node.
 */
export {MISSIONS} from "./original-rules.js";
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const length=(dx,dz)=>Math.hypot(dx,dz);
const zeroBank=()=>new Set();
const ballRadius=.0122;
const POS={
  launcher:[.484,.997],leftFlipper:[.187,.908],rightFlipper:[.346,.908],
  leftSling:[.155,.782],rightSling:[.374,.782],
  ramp:[.124,.383],hyper:[.412,.23],
  wormholes:[[.10,.10],[.287,.31],[.44,.29]],
};

export function extractPositions(nodes=[]){
  const out={};
  for(const entry of nodes){
    if(!entry?.name||!entry.position)continue;
    out[entry.name]={
      x:entry.position.x,
      z:entry.position.z,
      y:entry.position.y||0,
    };
  }
  return out;
}
export class CadetGame{
  constructor(positions={},options={}){
    this.positions=positions;
    this.events=[];
    this.rng=options.random||Math.random;
    this.physics=options.physics?new VPXCollisionWorld(options.physics,{nativeCCD:options.nativeCCD}):null;
    this.start();
  }
  getPoint(name,fallback) {
    const p=this.positions[name];return p?[p.x,p.z]:fallback;
  }
  send(type,data={}){
    this.events.push({type,...data});
    if(this.events.length>80)this.events.shift();
  }
  consumeEvents(){return this.events.splice(0);}
  addPoints(points,message){
    const earned=Math.round(points*this.multiplier);
    this.score+=earned;
    if(this.jackpotActive)this.jackpot+=Math.max(0,earned);
    if(message)this.send("message",{text:message,points:earned});
    this.send("score",{amount:earned,total:this.score});
    return earned;
  }
  start(){
    this.score=0;this.ballNumber=1;this.extraBalls=0;this.over=false;this.paused=false;
    this.elapsed=0;this.ballElapsed=0;this.multiplier=1;
    this.rank=0;this.progress=0;this.fuel=6;this.missionChoice=0;
    this.mission=null;this.missionProgress=0;this.missionGoal=0;
    this.missionTargets=new Set();
    this.recentEvents=[];this.missionShots=0;
    this.combos=0;this.lastRamp=-99;this.skillShots=0;
    this.skillShotArmed=true;this.skillShotValue=0;this.weaponLanes=new Set();
    this.engineLanes=new Set();this.attackLevel=0;this.engineLevel=0;
    this.banks={booster:zeroBank(),medal:zeroBank(),fuel:zeroBank(),
      mission:zeroBank(),comet:zeroBank(),radiation:zeroBank(),
      multiplier:zeroBank()};
    this.bankCycles={booster:0,medal:0};
    this.bonus=0;this.bonusHeld=false;this.jackpot=20000;this.jackpotActive=false;
    this.wormholeSequence=0;this.wormholeCooldown=0;
    this.wormholeColor=0;this.lockedBalls=0;this.multiballActive=false;
    this.lockReleaseQueue=[];
    this.hyperSpaceHits=0;this.hyperLast=0;
    this.activeBalls=[];this.nextBallId=1;this.plungerCharge=0;
    this.savedBallPending=false;this.extraAwardedThisBall=false;
    this.kicked={left:0,right:0};this.tiltWarnings=0;this.tilted=false;
    this.saverUntil=0;this.saves=0;this.timeSinceHit=new Map();
    this.flippers={left:0,right:0};this.plungerLoaded=true;
    this.physics?.reset();
    this.send("newGame");this.send("message",{text:"CADET — 按住 SPACE 蓄力，松开发球"});
  }
  get status(){
    return {score:this.score,ball:this.ballNumber,balls:this.activeBalls.length,
      remaining:Math.max(0,3-this.ballNumber),extraBalls:this.extraBalls,over:this.over,
      paused:this.paused,rank:RANKS[this.rank],progress:this.progress,
      fuel:this.fuel,multiplier:this.multiplier,bonus:this.bonus,
      jackpot:this.jackpot,jackpotActive:this.jackpotActive,
      mission:this.mission?.name||"",missionProgress:this.missionProgress,
      missionGoal:this.missionGoal,selectedMission:this.choiceName(),
      plungerLoaded:this.plungerLoaded,ballSaver:this.elapsed<this.saverUntil,
      tilted:this.tilted,scoreMultiplier:this.multiplier,
      missionChoice:this.missionChoice,missionActive:!!this.mission,
      combo:this.combos,skillShots:this.skillShots,
      bankProgress:Object.fromEntries(Object.entries(this.banks)
        .map(([name,set])=>[name,set.size])),rankLevel:this.rank,
      missionKind:this.mission?.rule?.stages[this.mission.stage]?.type||"",
      missionStage:this.mission?.stage||0,missionStageText:this.mission?.rule?.stages[this.mission.stage]?.description||"",
      lockedBalls:this.lockedBalls,multiballActive:this.multiballActive,
      hyperspaceHits:this.hyperSpaceHits};
  }
  choiceName(){
    return MISSIONS[missionTier(this.rank)][this.missionChoice];
  }
  spawnBall(x,z,vx,vz){
    const ball={id:this.nextBallId++,x,z,vx,vz,r:ballRadius,
      // Y-up 3D physics; the floor is Y=0 and the ball rests at radius.
      y:ballRadius,vy:0,onRamp:null,surfaceY:0,roll:true,
      trail:[],lastContact:new Map(),age:0,portalUntil:0};
    this.activeBalls.push(ball);
    this.send("spawn",{id:ball.id,x,z});
    return ball;
  }
  launch(charge=this.plungerCharge){
    if(this.over||this.paused||!this.plungerLoaded)return false;
    const power=clamp(charge,.08,1);
    // In VPX the ball rests ABOVE the plunger head, at swPlungerRest.
    // Starting it at the *visible tip* put it on the opposite side of
    // Wall348's stopper and reflected the launch straight into the drain.
    const [x,z]=this.physics
      ? this.getPoint("swPlungerRest",[.485,.957])
      : this.getPoint("PlungerTip",POS.launcher);
    const launchZ=this.physics?z-ballRadius*1.55:clamp(z,.94,1.028);
    this.spawnBall(clamp(x,.474,.490),launchZ,
      this.physics?0:-.035-.08*power,-1.22-1.22*power);
    this.plungerLoaded=false;
    if(this.activeBalls.length===1){
      if(!this.savedBallPending){
        this.skillShotArmed=true;
        this.ballElapsed=0;this.saverUntil=this.elapsed+12;
        this.saves=0;
      }
      this.savedBallPending=false;
    }
    // JP VPX awards the skill shot when the actual upper launch-lane
    // trigger is reached; charging the plunger alone earns no points.
    this.send("launch",{power});
    return true;
  }
  serveIfEmpty(){
    if(this.over||this.plungerLoaded||this.activeBalls.length)return;
    this.plungerLoaded=true;
    this.send("serve",{ball:this.ballNumber});
  }
  nudge(direction=1){
    if(this.over||this.paused)return;
    this.tiltWarnings++;
    if(this.tiltWarnings>3){
      this.tilted=true;
      this.send("message",{text:"TILT — 挡板和计分失效，直到下颗球"});
      return;
    }
    for(const b of this.activeBalls)b.vx+=clamp(direction,-1,1)*.21;
    this.send("nudge");
  }
  setFlipper(side,pressed){if(side in this.flippers)this.flippers[side]=pressed?1:0;}
  selectMission(index){
    if(this.mission)return;
    this.missionChoice=clamp(index,0,3);
    this.send("missionSelected",{name:this.choiceName()});
  }
  beginMission(){
    if(this.mission||this.fuel<=0)return false;
    const name=this.choiceName(),rule=MISSION_RULES[name];
    if(!rule)return false;
    const stage=rule.stages[0];
    this.mission={name,rule,stage:0};
    this.missionProgress=0;this.missionGoal=stage.goal;
    this.bonus=Math.max(this.bonus,25000); // VPX AcceptMission crash bonus base
    this.addPoints(rule.accept,"MISSION ACCEPTED: "+name.toUpperCase());
    this.send("missionStart",{name,goal:stage.goal,stage:stage.description});
    this.send("message",{text:stage.description.toUpperCase()});
    return true;
  }
  progressMission(event,name=""){
    if(!this.mission||this.tilted||this.fuel<=0)return false;
    const {rule,stage:stageIndex}=this.mission;
    const stage=rule.stages[stageIndex];
    if(!stageMatches(stage,event,name))return false;
    this.missionProgress++;
    this.send("missionProgress",{name:rule.name,progress:this.missionProgress,
      goal:this.missionGoal,stage:stageIndex});
    if(this.missionProgress>=stage.goal){
      if(stageIndex<rule.stages.length-1){
        this.mission.stage++;
        const next=rule.stages[this.mission.stage];
        this.missionProgress=0;this.missionGoal=next.goal;
        this.send("missionStage",{name:rule.name,stage:this.mission.stage,
          description:next.description,goal:next.goal});
        this.send("message",{text:"NEXT: "+next.description.toUpperCase()});
      }else this.completeMission();
    }
    return true;
  }
  completeMission(){
    if(!this.mission)return false;
    const {name,rule}=this.mission;
    this.addPoints(rule.award,name.toUpperCase()+" COMPLETE!");
    this.progress+=rule.progress;
    this.mission=null;this.missionProgress=0;this.missionGoal=0;
    // JP VPX AddProgress promotes at >= 17, then clears all 18 lights.
    if(this.progress>=17){
      this.progress=0;
      this.rank=Math.min(8,this.rank+1);
      this.send("rank",{rank:RANKS[this.rank]});
    }
    this.missionChoice=0;this.missionTargets.clear();
    if(name==="Maelstrom"){
      const [x,z]=this.getPoint("swPlungerRest",[.485,.957]);
      for(let i=0;i<3;i++)this.spawnBall(x,z-.04-i*.1,0,-1.4);
      this.send("multiball",{count:this.activeBalls.length});
    }
    this.send("missionComplete",{name,award:rule.award,progress:rule.progress});
    return true;
  }
  hit(kind,name,ball){
    if(this.tilted)return;
    const id=name||kind;
    const key=ball?ball.id+":"+id:id;
    const cooldown=kind==="target"?.28:kind==="bumper"?.095:.35;
    if(this.elapsed-(this.timeSinceHit.get(key)??-999)<cooldown)return;
    this.timeSinceHit.set(key,this.elapsed);
    if(kind==="bumper"){
      const attack=/^Bumper[1-3]$/.test(name);
      this.addPoints(attack?500+500*this.attackLevel:1500+1000*this.engineLevel);
      this.progressMission("bumper",name);
      this.send("bumper",{name});
    }else if(kind==="sling"){
      this.addPoints(500);
      this.send("sling",{name});
    }else if(kind==="target"){
      const num=Number(name?.match(/\d+$/)?.[0]);
      // The JP VPX drop banks are 14-16 MEDAL, 17-19 FIELD X,
      // 20-22 BOOSTER. Targets 8-10 COMET and 11-13 RADIATION
      // are NOT booster/hazard targets (an error in the old clone).
      const family=num>=2&&num<=4?"mission":
        num>=5&&num<=7?"fuel":
        num>=8&&num<=10?"comet":
        num>=11&&num<=13?"radiation":
        num>=14&&num<=16?"medal":
        num>=17&&num<=19?"multiplier":
        num>=20&&num<=22?"booster":null;
      if(family!=="mission")this.addPoints(num>=14?500:750);
      if(num===1&&!this.mission){this.wormholeColor=1;this.send("wormholesArmed",{color:1});}
      if(family)this.bank(family,num);
      this.progressMission(num>=14&&num<=22?"drop":"target",name);
      this.send("target",{name,family});
    }else if(kind==="lane"){
      const n=Number(name?.match(/\d+$/)?.[0])||0;
      if(n>=6&&n<=8){
        this.addPoints(2000);
        this.weaponLanes.add(n);
        if(this.weaponLanes.size===3){
          this.weaponLanes.clear();
          this.attackLevel=Math.min(3,this.attackLevel+1);
          this.send("weaponUpgrade",{level:this.attackLevel});
          this.progressMission("bank","weapon");
        }
      }else if(n>=9&&n<=11){
        this.addPoints(500);
        this.engineLanes.add(n);
        if(this.engineLanes.size===3){
          this.engineLanes.clear();
          this.engineLevel=Math.min(3,this.engineLevel+1);
          this.send("engineUpgrade",{level:this.engineLevel});
          this.progressMission("bank","engine");
        }
      }else if(n>=12&&n<=17){
        if(n===17){
          this.fuel=6;this.addPoints(500);
          this.progressMission("fuelChute",name);
          this.send("message",{text:"SHIP REFUELED"});
        }else if(n>=13){
          this.fuel=Math.max(this.fuel,Math.min(6,n-11));
          this.addPoints(500);
        }
      }else if(n>=18&&n<=23){
        // The original switches only set the value. Trigger029 collects it.
        if(this.skillShotArmed){
          const values={18:15000,19:30000,20:75000,
            21:30000,22:15000,23:7500};
          this.skillShotValue=values[n]||0;
          this.send("skillShotLit",{value:this.skillShotValue});
        }
      }else if(n===29){
        if(this.skillShotArmed&&this.skillShotValue>0){
          this.addPoints(this.skillShotValue,"SKILL SHOT!");
          this.skillShots++;this.skillShotArmed=false;
          this.send("skillShot",{value:this.skillShotValue});
        }
      }else if(n===28){
        this.addPoints(10000);
        this.progressMission("spaceWarp",name);
      }else if(n===1||n===5)this.addPoints(20000);
      else if(n===2)this.addPoints(10000);
      else if(n===3||n===4)this.addPoints(5000);
      else this.addPoints(500);
      this.progressMission("lane",name);
      this.send("lane",{name});
    }else if(kind==="ramp"){
      const now=this.elapsed;
      this.addPoints(5000);
      if(now-this.lastRamp<5){
        this.combos++;
        this.addPoints(25000,"REFLEX SHOT · COMBO ×"+this.combos);
        this.send("combo",{value:this.combos});
      }else this.combos=0;
      this.lastRamp=now;this.fuel=Math.min(6,this.fuel+1);
      if(!this.mission){if(this.missionTargets.size>0)this.beginMission();}
      else this.progressMission("ramp",name);
      this.send("ramp",{name});
    }else if(kind==="hyper"){
      // JP v4.3 HyperSpaceHole_Hit: 10k,20k,20k,50k,150k,
      // then the counter resets. The gravity well is a separate feature.
      this.hyperSpaceHits=this.hyperSpaceHits%5+1;
      this.hyperLast=this.elapsed;
      const awards=[0,10000,20000,20000,50000,150000];
      this.addPoints(awards[this.hyperSpaceHits],"HYPERSPACE "+this.hyperSpaceHits+"/5");
      if(this.hyperSpaceHits===4)this.send("extraBallAvailable");
      if(this.hyperSpaceHits===5)this.hyperSpaceHits=0;
      if(this.jackpotActive){
        this.addPoints(this.jackpot,"JACKPOT!");
        this.jackpotActive=false;this.jackpot=20000;
      }
      this.progressMission("hyper",name);
      this.send("hyper",{name});
    }else if(kind==="blackHole"){
      this.addPoints(20000,"BLACK HOLE");
      this.progressMission("blackHole",name);
      this.send("blackHole",{name});
    }else if(kind==="spinner"){
      this.addPoints(this.bankCycles.booster>0?2500:500);
      this.progressMission("spinner",name);
      if(this.wormholeColor>0)this.wormholeColor=this.wormholeColor%3+1;
      this.send("spinner",{name});
    }else if(kind==="wormhole"){
      const idNum=Number(name?.match(/\d+$/)?.[0])||1;
      this.wormholeSequence=idNum===(this.wormholeSequence%3)+1?this.wormholeSequence+1:1;
      this.addPoints(this.wormholeColor===0?2000:
        idNum===this.wormholeColor?5000:7500,"WORMHOLE");
      this.progressMission("wormhole",name);
      // JP table requires three BALL LOCKS (matching an armed wormhole),
      // not one arbitrary visit. Physical capture/trough replacement remains
      // approximated until the VPX kicker lifecycle is ported.
      if(this.wormholeColor===idNum&&!this.multiballActive){
        this.lockedBalls=Math.min(3,this.lockedBalls+1);
        this.send("ballLocked",{count:this.lockedBalls});
        this.wormholeColor=0;
        if(ball){
          ball.locked=true;
          // The fallback solver does not have named VPX kicker volumes.
          if(!this.physics)this.onWormholeCaptured(ball);
        }
        if(this.lockedBalls===3){
          // Pending single-ball replacements become the three-hole release.
          this.lockReleaseQueue=[];
          this.lockReleaseQueue.push({at:this.elapsed+1,final:true});
        }else this.lockReleaseQueue.push({at:this.elapsed+1,final:false});
      }
      this.send("wormhole",{name});
    }
  }
  onWormholeCaptured(ball){
    // VPX's Wormhole*_Hit destroys the captured ball; LockBall later
    // auto-serves its replacement. The ball is not counted as drained.
    const index=this.activeBalls.findIndex(b=>b.id===ball.id);
    if(index>=0)this.activeBalls.splice(index,1);
    this.send("ballCaptured",{id:ball.id});
  }
  processLockedBalls(){
    const ready=this.lockReleaseQueue.filter(item=>item.at<=this.elapsed);
    this.lockReleaseQueue=this.lockReleaseQueue.filter(item=>item.at>this.elapsed);
    for(const item of ready){
      if(item.final){
        this.multiballActive=true;this.lockedBalls=0;
        const holes=this.physics?.data.kickers.filter(k=>/^Wormhole[123]$/.test(k.name))||[];
        const fallbacks=[[.10,.10],[.287,.31],[.44,.29]];
        const missing=Math.max(0,3-this.activeBalls.length);
        for(let i=0;i<missing;i++){
          const hole=holes.find(k=>k.name==="Wormhole"+(i+1));
          const [x,z]=hole?[hole.x,hole.z]:fallbacks[i%3];
          const spawned=this.spawnBall(x,z+.026,(i-1)*.25,.54);
          spawned.portalUntil=this.elapsed+1.5;
        }
        this.saverUntil=Math.max(this.saverUntil,this.elapsed+20);
        this.send("multiball",{count:this.activeBalls.length});
        this.send("message",{text:"WORMHOLE MULTIBALL ×3"});
      }else{
        // JP's AddMultiball 1 serves and autoplunges a replacement.
        const [x,z]=this.physics?
          this.getPoint("swPlungerRest",[.485,.957]):
          [.484,.956];
        this.spawnBall(x,z-.019,0,-1.78);
        this.plungerLoaded=false;
        this.send("autoPlunge");
      }
    }
  }
  bank(family,id){
    const set=this.banks[family];if(!set)return;
    set.add(id);
    if(family==="mission"&&!this.mission){
      // Top=Target004 selects Launch (index 0), middle Target003
      // selects Re-entry (1), lower Target002 selects Practice (2).
      this.missionTargets.add(id);
      this.selectMission(set.size===3?3:4-id);
    }
    if(set.size<3)return;
    set.clear();this.send("bankComplete",{family});
    this.progressMission("bank",family);
    if(family==="fuel"){this.fuel=6;this.send("message",{text:"SHIP REFUELED"});}
    else if(family==="medal"){
      this.bankCycles.medal++;
      if(this.bankCycles.medal%3===1){
        this.addPoints(10000,"LEVEL 1 COMMENDATION");
        this.saverUntil=Math.max(this.saverUntil,this.elapsed+10);
      }else if(this.bankCycles.medal%3===2){
        this.addPoints(50000,"LEVEL 2 COMMENDATION");
        this.saverUntil=Math.max(this.saverUntil,this.elapsed+20);
      }else if(this.bankCycles.medal%3===0){
        if(!this.extraAwardedThisBall){
          this.extraBalls=Math.min(5,this.extraBalls+1);
          this.extraAwardedThisBall=true;
          this.send("extraBall");this.send("message",{text:"COMMENDATION — EXTRA BALL"});
        }else this.addPoints(50000,"COMMENDATION — EXTRA BALL LIMIT");
      }
    }else if(family==="booster"){
      this.bankCycles.booster++;
      if(this.bankCycles.booster===1)this.send("message",{text:"FLAGS UPGRADED"});
      if(this.bankCycles.booster===2)this.jackpotActive=true;
      if(this.bankCycles.booster>=3){
        this.bonus+=25000;
        this.send("message",{text:"BOOSTER BONUS +25,000"});
      }
      if(this.bankCycles.booster>=4)this.bonusHeld=true;
    }else if(family==="multiplier"){
      this.multiplier=[1,2,3,5,10][Math.min(4,[1,2,3,5,10].indexOf(this.multiplier)+1)];
      this.send("message",{text:"FIELD MULTIPLIER ×"+this.multiplier});
    }else if(family==="mission"){
      if(!this.mission)this.selectMission(3);
    }else if(family==="comet"||family==="radiation"){
      this.send("message",{text:(family==="comet"?"COMET":"RADIATION")+" LIGHTS COMPLETE"});
    }
  }
  onDrain(ball){
    this.send("drain",{id:ball.id});
    if(this.multiballActive&&this.activeBalls.length<=1)this.multiballActive=false;
    // A drained ball during multiball is not a new ball and must not
    // invoke saver, advance the ball counter, or replace another live ball.
    if(this.activeBalls.length)return;
    if(this.elapsed<this.saverUntil&&this.saves<1&&!this.tilted){
      this.saves++;this.plungerLoaded=true;this.savedBallPending=true;
      this.send("save",{text:"BALL SAVED"});return;
    }
    this.savedBallPending=false;
    if(this.mission){
      this.send("missionAbort",{name:this.mission.name});
      this.mission=null;this.missionProgress=0;this.missionGoal=0;
    }
    if(!this.tilted && this.bonus)this.addPoints(this.bonus,"END-OF-BALL BONUS");
    if(!this.bonusHeld)this.bonus=0;
    this.multiplier=1;this.fuel=6;this.tilted=false;this.tiltWarnings=0;
    this.skillShotArmed=true;this.skillShotValue=0;this.combos=0;
    this.weaponLanes.clear();this.engineLanes.clear();
    if(this.extraBalls>0){
      this.extraBalls--;this.send("message",{text:"EXTRA BALL — SHOOT AGAIN"});
    }else{
      this.ballNumber++;
      if(this.ballNumber>3){
        this.over=true;this.ballNumber=3;
        this.send("gameOver",{score:this.score});
        this.send("message",{text:"GAME OVER — 按 R 重新开始"});
        return;
      }
    }
    this.extraAwardedThisBall=false;
    this.plungerLoaded=true;this.send("serve",{ball:this.ballNumber});
  }
  getCoords(kind){
    return Object.entries(this.positions).filter(([name])=>new RegExp(kind,"i").test(name));
  }
  closestDistance(ball,x,z){return Math.hypot(ball.x-x,ball.z-z);}
  collide(ball,x,z,r,impulse=.0){
    const dx=ball.x-x,dz=ball.z-z,d=length(dx,dz),limit=r+ball.r;
    if(d>=limit)return false;
    let nx=dx/(d||1),nz=dz/(d||1);
    if(d<.00001){nx=0;nz=-1;}
    ball.x=x+nx*(limit+.0001);ball.z=z+nz*(limit+.0001);
    const vn=ball.vx*nx+ball.vz*nz;
    if(vn<0){ball.vx-=1.83*vn*nx;ball.vz-=1.83*vn*nz;}
    ball.vx+=nx*impulse;ball.vz+=nz*impulse;
    return true;
  }
  collideFlipper(ball,side){
    const left=side==="left",pressed=this.flippers[side]>0;
    const [cx,cz]=this.getPoint(left?"LeftFlipperBase":"RightFlipperBase",
      left?POS.leftFlipper:POS.rightFlipper);
    const len=.087,dir=left?1:-1;
    const theta=pressed?-.78:.31;
    const ex=cx+dir*Math.cos(theta)*len;
    const ez=cz+Math.sin(theta)*len;
    const dx=ex-cx,dz=ez-cz;
    const t=clamp(((ball.x-cx)*dx+(ball.z-cz)*dz)/(len*len),0,1);
    const px=cx+dx*t,pz=cz+dz*t;
    if(!this.collide(ball,px,pz,.013))return;
    if(pressed&&!this.tilted){
      ball.vz=-Math.max(.78+2.1*t,-ball.vz);
      ball.vx+=dir*(.26+.32*t);
      this.send("flipperHit",{side,ball:ball.id});
    }else if(ball.vz>.05)ball.vz=-Math.abs(ball.vz)*.6;
  }
  // Contact objects from VPX's named transforms, not from an invented 2D art map.
  physicsStep(dt){
    for(const ball of [...this.activeBalls]){
      ball.age+=dt;
      ball.vz+=.96*dt;
      const damping=Math.exp(-.22*dt);
      ball.vx*=damping;ball.vz*=damping;
      ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;
      if(ball.x<.015+ball.r){ball.x=.015+ball.r;ball.vx=Math.abs(ball.vx)*.85;}
      if(ball.x>.512-ball.r){ball.x=.512-ball.r;ball.vx=-Math.abs(ball.vx)*.82;}
      if(ball.z<.024+ball.r){ball.z=.024+ball.r;ball.vz=Math.abs(ball.vz)*.84;}
      // Shooter lane rail; release at the upper arch.
      if(ball.x>.449&&ball.z>.15&&ball.z<1.0&&ball.vx<0){
        ball.x=.449+ball.r;ball.vx=Math.abs(ball.vx)*.7;
      }
      // Shooter-lane arch: the exported VPX launcher transitions behind
      // the top guide rail into the main table. Without this directed
      // transfer the simplified solver sends the ball back down the lane
      // before it can contact any bumpers.
      if(ball.z<.145&&ball.x>.44&&ball.vz<0){
        ball.x=.421;ball.z=.14;
        ball.vx=-Math.max(.71,Math.abs(ball.vx));
        ball.vz=Math.max(.42,Math.abs(ball.vz)*.49);
        this.send("laneExit");
      }
      for(let i=1;i<=7;i++){
        const name="Bumper"+i;
        const [x,z]=this.getPoint(name+"Base",
          [.12+(i%3)*.09,.25+(i%4)*.09]);
        if(this.collide(ball,x,z,i<=4?.031:.025,.52)){
          this.hit("bumper",name,ball);
        }
      }
      for(const name of ["LeftSling001","RightSling001"]){
        const [x,z]=this.getPoint(name,name==="LeftSling001"?POS.leftSling:POS.rightSling);
        if(this.collide(ball,x,z,.030,.20))this.hit("sling",name,ball);
      }
      // VPX drop/spot target local events
      // Rounded posts/pegs are VPX primitives. Contact with them prevents
      // the ball crossing the real-world lower guides as if they were empty.
      for(const [name,p] of Object.entries(this.positions)){
        if(!/^(?:PegPlasticT|rpeg|Rubber0)/i.test(name))continue;
        if(name==="RightFlipperRubber"||name==="LeftFlipperRubber")continue;
        this.collide(ball,p.x,p.z,/^Rubber/i.test(name)?.013:.011,.035);
      }
      for(let i=1;i<=22;i++){
        const name="Target"+String(i).padStart(3,"0"),p=this.positions[name];
        if(!p)continue;
        if(this.collide(ball,p.x,p.z,.012,.06))this.hit("target",name,ball);
      }
      for(let i=1;i<=11;i++){
        const name="Trigger"+String(i).padStart(3,"0"),p=this.positions[name];
        if(p&&this.closestDistance(ball,p.x,p.z)<.025)this.hit("lane",name,ball);
      }
      // In VPX these are ramp/saucer events; simplified entry volumes.
      if(ball.z<.37&&ball.z>.32&&ball.x>.085&&ball.x<.13&&ball.vz<0){
        this.hit("ramp","LaunchRamp",ball);
        ball.x=.22;ball.z=.19;ball.vx=.10;ball.vz=.31;
      }
      if(ball.z<.28&&ball.z>.23&&ball.x>.395&&ball.x<.447&&ball.vz<0){
        this.hit("hyper","Hyperspace",ball);
        ball.x=.36;ball.z=.20;ball.vx=-.4;ball.vz=.32;
      }
      if(ball.z<.34&&ball.z>.28&&ball.x>.22&&ball.x<.31&&ball.age>1.0){
        if(this.elapsed>ball.portalUntil){
          ball.portalUntil=this.elapsed+7;
          this.hit("wormhole","Wormhole"+(1+(this.wormholeSequence%3)),ball);
          ball.vx=-.35;ball.vz=.35;
        }
      }
      this.collideFlipper(ball,"left");this.collideFlipper(ball,"right");
      // Side outlanes and central drain
      if(ball.z>1.025){
        const side=ball.x<.16?"left":ball.x>.38?"right":null;
        if(side&&this.kicked[side]){
          this.kicked[side]=0;ball.z=.89;ball.vz=-.92;ball.vx=side==="left"?.4:-.4;
          this.send("kickback",{side});
        }else{
          this.activeBalls=this.activeBalls.filter(b=>b.id!==ball.id);
          this.onDrain(ball);
        }
      }
      const speed=length(ball.vx,ball.vz);
      if(speed>3.4){ball.vx*=3.4/speed;ball.vz*=3.4/speed;}
      if(this.elapsed-(ball.lastTrail||0)>.035){
        ball.trail.push([ball.x,ball.z]);
        if(ball.trail.length>14)ball.trail.shift();
        ball.lastTrail=this.elapsed;
      }
    }
  }
  tick(dt){
    if(this.paused||this.over)return;
    dt=clamp(dt,0,.05);
    this.elapsed+=dt;
    this.processLockedBalls();
    if(this.activeBalls.length)this.ballElapsed+=dt;
    const previousFuel=Math.floor((this.elapsed-dt)/15);
    if(this.mission&&Math.floor(this.elapsed/15)>previousFuel){
      this.fuel=Math.max(0,this.fuel-1);
      if(this.fuel===0){
        this.send("missionAbort",{name:this.mission.name});
        this.mission=null;this.missionProgress=0;this.missionGoal=0;
        this.send("message",{text:"MISSION ABORTED — OUT OF FUEL"});
      }
    }
    const n=Math.max(1,Math.ceil(dt/(1/240)));
    for(let i=0;i<n;i++){
      if(this.physics)this.physics.step(this,dt/n);
      else this.physicsStep(dt/n);
    }
    if(this.timeSinceHit.size>1400)this.timeSinceHit.clear();
  }
}
