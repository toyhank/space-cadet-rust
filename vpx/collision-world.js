import {LayeredRampWorld} from "./height-field.js";
/**
 * VPX 3D layered contact solver (projected walls + elevated ramp surfaces).
 *
 * This is not the native VPX 3D engine: it uses genuine table hit boundaries,
 * gate/target edges, bumper circles, physical heights and flipper articulation.
 * Elevated ramps cannot be resolved with 2D ball coordinates; they are kept
 * in metadata for the future 3D phase, not treated as phantom ground walls.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dist2=(x,z)=>x*x+z*z;
const BALL=0.0122,EPS=1e-6;
const CELL=.055;
function gridKey(x,z){return x+","+z;}
const finite=v=>Number.isFinite(v);
function closest(x,z,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,ss=dx*dx+dz*dz||1;
  const t=clamp(((x-ax)*dx+(z-az)*dz)/ss,0,1);
  return [ax+t*dx,az+t*dz,t];
}
function makeEdge(a,b,source){
  const [x1,z1]=a,[x2,z2]=b;
  const len2=dist2(x2-x1,z2-z1);
  if(len2<1e-10)return null;
  return {x1,z1,x2,z2,source,minX:Math.min(x1,x2),maxX:Math.max(x1,x2),
    minZ:Math.min(z1,z2),maxZ:Math.max(z1,z2),length:Math.sqrt(len2)};
}
export class VPXCollisionWorld {
  constructor(data,options={}){
    if(!data||data.version!==1||!Array.isArray(data.segments))
      throw Error("Missing VPX collision geometry");
    this.data=data;this.edges=[];this.cells=new Map();
    this.nativeCCD=options.nativeCCD||null;
    this.heightField=new LayeredRampWorld(data.ramps||[]);
    // One-way hinges are solved dynamically, not inserted as rigid walls.
    // A stationary 2D line at their location would trap the launch ball.
    this.gates=(data.segments||[]).filter(o=>o.type==="Gate"&&!o.twoWay);
    this.gateStates=new Map(this.gates.map(g=>[g.name,{
      openUntil:0,angle:0,lastHit:-999
    }]));
    this.flippers=data.flippers.map(f=>({...f,angle:f.start,omega:0}));
    this.drain=data.kickers.find(k=>k.name==="Drain")||null;
    // Between the idle flipper tips is the real out-of-play lane. In VPX,
    // the ball then leaves the 3D playfield and drops to the Drain kicker.
    // A 2D solver cannot otherwise cross the Wall317 trough geometry.
    const left=this.flippers.find(f=>f.name==="LeftFlipper");
    const right=this.flippers.find(f=>f.name==="RightFlipper");
    if(left&&right&&this.drain){
      const tip=f=>({
        x:f.x+Math.sin(f.start)*f.length,
        z:f.z-Math.cos(f.start)*f.length
      });
      const a=tip(left),b=tip(right);
      this.drainMouth={
        left:Math.min(a.x,b.x)+Math.max(left.endRadius,right.endRadius)+BALL*.58,
        right:Math.max(a.x,b.x)-Math.max(left.endRadius,right.endRadius)-BALL*.58,
        // Once the ball's centre passes the pivot line by one radius,
        // it is already between the bats and cannot be rescued by a
        // static 2D outline of the drain throat.
        z:Math.max(left.z,right.z)+BALL*.95,
      };
    }else this.drainMouth=null;
    this.stats={contacts:0,edgeChecks:0,bumperHits:0,wallHits:0,triggerHits:0};
    for(const object of data.segments){
      if(!object.points||object.points.length<2)continue;
      // A VPX one-way gate is a rotating hinge, not a static segment.
      // Until hinge-state simulation is implemented, exclude its rigid
      // contact rather than creating invisible traps where the ball meets
      // a wall and an always-closed pawl.
      if(object.type==="Gate"&&!object.twoWay)continue;
      // Geometry height is in glTF meters, ball rests at Y=ball radius.
      if(object.bottom>2*BALL+.001||object.top<0)continue;
      const pts=object.points;
      const count=object.closed?pts.length:pts.length-1;
      for(let i=0;i<count;i++){
        const edge=makeEdge(pts[i],pts[(i+1)%pts.length],object);
        if(!edge)continue;
        this.edges.push(edge);
        const pad=BALL+.006;
        const x0=Math.floor((edge.minX-pad)/CELL),x1=Math.floor((edge.maxX+pad)/CELL),
          z0=Math.floor((edge.minZ-pad)/CELL),z1=Math.floor((edge.maxZ+pad)/CELL);
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
          const key=gridKey(x,z);
          if(!this.cells.has(key))this.cells.set(key,[]);
          this.cells.get(key).push(edge);
        }
      }
    }
  }
  reset(){
    for(const f of this.flippers){f.angle=f.start;f.omega=0;f.nativeTorque=0;}
    for(const state of this.gateStates.values()){
      state.openUntil=0;state.angle=0;state.lastHit=-999;
    }
    this.stats={contacts:0,edgeChecks:0,bumperHits:0,wallHits:0,triggerHits:0};
  }
  updateFlippers(dt,pressed){
    for(const f of this.flippers){
      if(this.nativeCCD?.stepFlipper){
        const side=/^left/i.test(f.name)?"left":"right";
        this.nativeCCD.stepFlipper(f,!!pressed[side],dt);
        continue;
      }
      const side=/^left/i.test(f.name)?"left":"right";
      const target=pressed[side]?f.end:f.start;
      const old=f.angle,delta=target-old;
      const rate=pressed[side]?18:12;
      f.angle+=clamp(delta,-rate*dt,rate*dt);
      f.omega=(f.angle-old)/Math.max(dt,1e-6);
    }
  }
  resolve(ball,px,pz,r,elasticity=.65,impulse=0,tag=""){
    const dx=ball.x-px,dz=ball.z-pz,ss=dx*dx+dz*dz;
    const limit=ball.r+r;
    if(ss>=limit*limit)return false;
    const distance=Math.sqrt(ss);
    let nx=dx/(distance||1),nz=dz/(distance||1);
    if(distance<EPS){
      const speed=Math.hypot(ball.vx,ball.vz)||1;
      nx=-ball.vx/speed;nz=-ball.vz/speed;
    }
    // Discrete penetration correction with position slop.
    const push=limit-distance+.00002;
    ball.x+=nx*push;ball.z+=nz*push;
    const approach=ball.vx*nx+ball.vz*nz;
    if(approach<0){
      const bounce=Math.min(elasticity,1.05);
      ball.vx-=(1+bounce)*approach*nx;
      ball.vz-=(1+bounce)*approach*nz;
    }
    if(impulse){
      ball.vx+=nx*impulse;ball.vz+=nz*impulse;
    }
    this.stats.contacts++;
    return true;
  }
  /**
   * Phase 1 VPX C++ WASM hybrid: continuous time-of-impact ONLY for ordinary
   * rigid static VPX Wall line faces. Non-walls, endpoints, slingshots, ramps,
   * flippers, gate hinges and scoring still use the existing JS solver.
   *
   * oldX/Z/Y are positions at the start of this fixed physics substep.
   * Broadphase covers all grid cells swept through, not just the endpoint.
   */
  resolveNativeWallSweep(ball,oldX,oldZ,oldY,dt,game){
    if(!this.nativeCCD||!Number.isFinite(oldX)||!Number.isFinite(oldZ)||
       !Number.isFinite(dt)||dt<=0)return false;
    // The shooter and scoop trough walls have special VPX hit direction/
    // moveable gate state that is not present in the exported GLB polygons.
    // Don't let a two-sided native line face seal those one-way launch lanes.
    if((oldX>.455&&oldZ>.15)||ball.kickAt||
       Math.hypot(ball.vx,ball.vz)<.055)return false;
    const x0=Math.floor((Math.min(oldX,ball.x)-ball.r)/CELL);
    const x1=Math.floor((Math.max(oldX,ball.x)+ball.r)/CELL);
    const z0=Math.floor((Math.min(oldZ,ball.z)-ball.r)/CELL);
    const z1=Math.floor((Math.max(oldZ,ball.z)+ball.r)/CELL);
    const candidates=new Set();
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      for(const edge of this.cells.get(gridKey(x,z))||[])candidates.add(edge);
    }
    const start={x:oldX,z:oldZ,y:oldY,
      vx:ball.vx,vz:ball.vz,vy:ball.vy||0,r:ball.r};
    let earliest=null;
    for(const edge of candidates){
      const source=edge.source;
      if(source.type!=="Wall"||source.slingshot||source.name==="Wall317")continue;
      const hit=this.nativeCCD.lineTime(start,edge,dt,true);
      if(!hit||hit.contact||hit.time<0||hit.time>dt)continue;
      if(!earliest||hit.time<earliest.time)earliest={...hit,edge};
    }
    if(!earliest)return false;
    const {time,nx,nz,edge}=earliest;
    // Advance to native VPX contact instead of overshooting the wall.
    // Small outward separation avoids a second, discrete rebound.
    ball.x=oldX+start.vx*time+nx*.000065;
    ball.z=oldZ+start.vz*time+nz*.000065;
    this.nativeCCD.bounce(ball,earliest,edge.source);
    const remaining=Math.max(0,dt-time);
    ball.x+=ball.vx*remaining;
    ball.z+=ball.vz*remaining;
    this.stats.contacts++;
    this.stats.wallHits++;
    this.stats.nativeHits=(this.stats.nativeHits||0)+1;
    game?.send?.("wallCCD",{name:edge.source.name,ball:ball.id,time});
    return true;
  }
  solveEdges(ball,game){
    const cell=gridKey(Math.floor(ball.x/CELL),Math.floor(ball.z/CELL));
    const found=this.cells.get(cell)||[];
    const touched=new Set(),poweredSlings=new Map();
    let count=0;
    // Two passes handle acute vertices without permanent overlap.
    for(let pass=0;pass<2;pass++){
      for(const edge of found){
        const source=edge.source,name=source.name;
        // The 2D projected wall only has contact when its vertical span
        // intersects the actual 3D ball. Elevated balls can clear it.
        if((ball.y??ball.r)-ball.r>source.top+.001||
           (ball.y??ball.r)+ball.r<source.bottom-.001)continue;
        // VPX gate pawls are one-way. Shooter-lane gates open under a
        // rising ball; resolving them like a rigid wall reverses every
        // launch before the ball has reached the table.
        if(source.type==="Gate"&&!source.twoWay&&ball.vz<0)continue;
        if(ball.x<edge.minX-ball.r-.004||ball.x>edge.maxX+ball.r+.004||
          ball.z<edge.minZ-ball.r-.004||ball.z>edge.maxZ+ball.r+.004)continue;
        this.stats.edgeChecks++;
        const [cx,cz]=closest(ball.x,ball.z,edge.x1,edge.z1,edge.x2,edge.z2);
        if(!this.resolve(ball,cx,cz,source.type==="HitTarget"?.0025:.0017,source.restitution||.5,0,name))continue;
        count++;
        if(!touched.has(name)){
          touched.add(name);
          this.stats.wallHits++;
          if(source.type==="HitTarget")game.hit("target",name,ball);
          else if(source.slingshot){
            // These named VPX walls are ACTUATED solenoid slingshots,
            // not inert passive rubber. Previously they merely scored and
            // played audio: the ball could never be kicked up the table.
            const key="slingcoil:"+ball.id+":"+name;
            if(game.elapsed-(game.timeSinceHit.get(key)??-999)>.18){
              poweredSlings.set(name,{upper:/2$/.test(name),
                side:/^left/i.test(name)?1:-1});
              game.timeSinceHit.set(key,game.elapsed);
              game.hit("sling",name,ball);
              game.send("slingFire",{name,ball:ball.id});
            }
          }else if(source.type==="Gate")game.hit("gate",name,ball);
        }
      }
    }
    // Apply solenoid energy AFTER all projected edge corrections. Otherwise
    // a neighboring edge in pass #2 can cancel the newly added velocity.
    for(const {upper,side} of poweredSlings.values()){
      ball.vz=Math.min(ball.vz,upper?-1.15:-1.58);
      ball.vx=clamp(ball.vx+side*(upper?.22:.38),-2.4,2.4);
    }
    return count;
  }
  solveGates(ball,game){
    const contacts=ball.contacts||(ball.contacts=new Set());
    for(const gate of this.gates){
      if((ball.y??ball.r)-ball.r>gate.top+.001)continue;
      const a=gate.points[0],b=gate.points[1];
      const [x,z]=closest(ball.x,ball.z,a[0],a[1],b[0],b[1]);
      const inRange=dist2(ball.x-x,ball.z-z)<(ball.r+.0015)**2;
      const key="gate:"+gate.name;
      if(!inRange){contacts.delete(key);continue;}
      const dx=b[0]-a[0],dz=b[1]-a[1],norm=Math.hypot(dx,dz)||1;
      const nx=-dz/norm,nz=dx/norm;
      const towardNormal=ball.vx*nx+ball.vz*nz;
      const state=this.gateStates.get(gate.name);
      if(towardNormal<-.005){
        // Positive rotation of gate's VPX local hinge lets the ball pass
        // from the permitted side; then it springs shut gradually.
        state.openUntil=game.elapsed+.2;
        state.angle=Math.min(.7,state.angle+.23);
        if(!contacts.has(key)){
          game.send("gateOpen",{name:gate.name,ball:ball.id});
          contacts.add(key);
        }
      }else if(game.elapsed>=state.openUntil &&
         this.resolve(ball,x,z,.0015,gate.restitution||.45,0,gate.name)){
        if(!contacts.has(key)){
          game.send("gateBlock",{name:gate.name,ball:ball.id});
          contacts.add(key);
        }
      }
    }
  }
  updateGates(dt,now){
    for(const state of this.gateStates.values()){
      if(now>=state.openUntil)state.angle=Math.max(0,state.angle-dt*4.4);
    }
  }
  solveBumpers(ball,game){
    for(const c of this.data.circles){
      if((ball.y??ball.r)-ball.r>(c.top??.05)+.002)continue;
      if(Math.abs(ball.x-c.x)>ball.r+c.radius||Math.abs(ball.z-c.z)>ball.r+c.radius)continue;
      const dx=ball.x-c.x,dz=ball.z-c.z;
      const rr=c.radius+ball.r;
      if(dist2(dx,dz)>=rr*rr)continue;
      // Bounce on contact, but emit ONE solenoid kick per approach, not
      // every physics substep while the ball overlaps the rubber.
      // Continuous impulses previously made the small left bumpers behave
      // like solid rocket engines and defeated the left kicker.
      const distance=Math.hypot(dx,dz)||1;
      const normalX=dx/distance,normalZ=dz/distance;
      const approach=ball.vx*normalX+ball.vz*normalZ;
      if(this.resolve(ball,c.x,c.z,c.radius,c.restitution||.65,0)){
        if(approach<-.03 &&
           game.elapsed-(game.timeSinceHit.get("coil:"+ball.id+":"+c.name)??-999)>.09){
          const impulse=clamp(c.force||.12,.055,.23);
          ball.vx+=normalX*impulse;
          ball.vz+=normalZ*impulse;
          game.timeSinceHit.set("coil:"+ball.id+":"+c.name,game.elapsed);
          this.stats.bumperHits++;
          game.hit("bumper",c.name,ball);
        }
      }
    }
  }
  solveFlippers(ball,game){
    for(const f of this.flippers){
      if((ball.y??ball.r)-ball.r>.027)continue;
      const tipx=f.x+Math.sin(f.angle)*f.length;
      const tipz=f.z-Math.cos(f.angle)*f.length;
      const [px,pz,t]=closest(ball.x,ball.z,f.x,f.z,tipx,tipz);
      const radius=f.baseRadius*(1-t)+f.endRadius*t;
      if(dist2(ball.x-px,ball.z-pz)>=(ball.r+radius)**2)continue;
      const side=/^left/i.test(f.name)?"left":"right";
      // Contact surface velocity due to flipper angular motion, projected
      // to the collision normal. This prevents a permanent upward impulse
      // when flipper is only held stationary.
      const separation=Math.hypot(ball.x-px,ball.z-pz)||1;
      const nx=(ball.x-px)/separation,nz=(ball.z-pz)/separation;
      const rx=px-f.x,rz=pz-f.z;
      const surfaceVX=Math.cos(f.angle)*f.omega*f.length*t;
      const surfaceVZ=Math.sin(f.angle)*f.omega*f.length*t;
      const surfaceNormal=surfaceVX*nx+surfaceVZ*nz;
      const relative=(ball.vx-surfaceVX)*nx+(ball.vz-surfaceVZ)*nz;
      if(this.nativeCCD?.collideFlipper){
        // Contact SEARCH remains the JS tapered-capsule approximation;
        // contact RESPONSE uses the actual native VPX HitFlipper impulse,
        // recoil into angular momentum and tangent friction / ball spin.
        const penetration=ball.r+radius-separation;
        ball.x+=nx*(penetration+.00002);
        ball.z+=nz*(penetration+.00002);
        const bounced=this.nativeCCD.collideFlipper(ball,f,rx,rz,nx,nz);
        if(bounced){
          this.stats.nativeFlipperHits=(this.stats.nativeFlipperHits||0)+1;
          const key="flipper"+side+ball.id;
          if(game.elapsed-(game.timeSinceHit.get(key)??-999)>.09){
            game.timeSinceHit.set(key,game.elapsed);
            game.send("flipperHit",{side,ball:ball.id,native:true});
          }
        }
        continue;
      }
      const bounced=this.resolve(ball,px,pz,radius,Math.min(1,f.restitution||.85));
      if(!bounced)continue;
      if(game.flippers[side]&&!game.tilted &&
         Math.abs(f.omega)>.6&&surfaceNormal>.03){
        // Only the MOVING front face transfers coil energy. A stationary
        // held flipper must behave as a rubber wall, not repeatedly add
        // "free" impulses while the ball is trapped against it.
        const gained=clamp(surfaceNormal-Math.min(0,relative)*.22,0,1.65);
        ball.vx+=nx*gained;ball.vz+=nz*gained;
        if(gained>.32&&ball.y<ball.r+.025){
          // Small transient lift instead of the old unrealistic high arc
          // applied to every held-flipper contact.
          ball.vy=Math.max(ball.vy||0,Math.min(.40,.11+gained*.17));
          ball.onRamp=null;
        }
        const hitKey="flipper"+side+ball.id;
        if(game.elapsed-(game.timeSinceHit.get(hitKey)??-999)>.09){
          game.timeSinceHit.set(hitKey,game.elapsed);
          game.send("flipperHit",{side,ball:ball.id});
        }
      }
    }
  }
  solveBallPairs(balls){
    for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
      const a=balls[i],b=balls[j];
      const dx=b.x-a.x,dy=(b.y??b.r)-(a.y??a.r),dz=b.z-a.z;
      const rr=a.r+b.r,d=Math.hypot(dx,dy,dz);
      if(d>=rr||d<1e-9)continue;
      const nx=dx/d,ny=dy/d,nz=dz/d,penetration=(rr-d)/2+.00001;
      a.x-=nx*penetration;a.y-=ny*penetration;a.z-=nz*penetration;
      b.x+=nx*penetration;b.y+=ny*penetration;b.z+=nz*penetration;
      const vx=b.vx-a.vx,vy=(b.vy||0)-(a.vy||0),vz=b.vz-a.vz;
      const relative=vx*nx+vy*ny+vz*nz;
      if(relative>=0)continue;
      const impulse=-relative*.91;
      a.vx-=nx*impulse;a.vy-=ny*impulse;a.vz-=nz*impulse;
      b.vx+=nx*impulse;b.vy+=ny*impulse;b.vz+=nz*impulse;
    }
  }
  checkTriggers(ball,game){
    const contacts=ball.contacts||(ball.contacts=new Set());
    for(const trigger of this.data.triggers){
      // Floor-level switches must not fire from a ball passing on an upper
      // rail. Ramp-exit triggers are left active on the elevated track.
      if((ball.y??ball.r)-ball.r>.025&&trigger.name!=="Trigger030")continue;
      const dx=ball.x-trigger.x,dz=ball.z-trigger.z;
      const inside=dist2(dx,dz)<Math.pow(trigger.radius+ball.r*.25,2);
      const key="trigger:"+trigger.name;
      if(inside&&!contacts.has(key)){
        contacts.add(key);this.stats.triggerHits++;
        if((trigger.name==="RightKickerRest"||trigger.name==="LeftKickerRest")&&
          game.elapsed>=(ball.kickCooldown||0)&&!ball.kickAt){
          ball.kickAt=game.elapsed+1.5;
          ball.kickSide=trigger.name.startsWith("Right")?"right":"left";
          game.send("kickbackArmed",{side:ball.kickSide,ball:ball.id});
        }
        if(/^Trigger\d+$/i.test(trigger.name)){
          const n=Number(trigger.name.match(/\d+/)?.[0]||0);
          // Preserve the original VPX script's top-lane/fuel/skill-shot
          // numbering; generic trigger volumes are not all score lanes.
          if((n>=1&&n<=11)||(n>=13&&n<=17)||
             (n>=18&&n<=23&&ball.vz<0)||
             n===28||n===29)game.hit("lane",trigger.name,ball);
          // JP VBS Trigger030_Hit is the end of the Launch Ramp;
          // Trigger028 is SPACE WARP, not the ramp (old port was reversed).
          if(n===30)game.hit("ramp","LaunchRamp",ball);
        }
        game.send("trigger",{name:trigger.name,ball:ball.id});
      }else if(!inside)contacts.delete(key);
    }
  }
  checkSpinners(ball,game){
    const contacts=ball.contacts||(ball.contacts=new Set());
    for(const name of ["Spinner001Plate","Spinner002Plate"]){
      const p=game.positions?.[name];
      if(!p)continue;
      // A near-field pass through a VPX spinner plate represents one spin.
      // The original plate angular-velocity solver is not available in 2D.
      const inside=Math.abs(ball.x-p.x)<.016&&Math.abs(ball.z-p.z)<.013;
      const key="spinner:"+name;
      if(inside&&!contacts.has(key)){
        contacts.add(key);
        game.hit("spinner",name,ball);
      }else if(!inside)contacts.delete(key);
    }
  }
  inDrainMouth(ball){
    if((ball.y??ball.r)-ball.r>.017)return false;
    const m=this.drainMouth;
    return !!m&&m.left<m.right&&ball.z>=m.z &&
      ball.x>=m.left&&ball.x<=m.right&&ball.vz>.025;
  }
  beginSink(ball,game){
    if(ball.sinking)return;
    ball.sinking=.000001;
    ball.vx=0;ball.vz=0;
    ball.kickAt=0;ball.kickSide=null;
    game.send("falling",{ball:ball.id});
  }
  checkKickers(ball,game){
    if(ball.portalUntil>game.elapsed||(ball.y??ball.r)-ball.r>.026)return false;
    for(const kicker of this.data.kickers){
      if(Math.hypot(ball.x-kicker.x,ball.z-kicker.z)>kicker.radius*.80)continue;
      const n=kicker.name;
      if(n==="Drain"){this.beginSink(ball,game);return false;}
      if(/^Wormhole/.test(n)){
        game.hit("wormhole",n,ball);
        if(ball.locked){
          game.onWormholeCaptured(ball);
          return false;
        }
        ball.x=.28;ball.z=.43;ball.vx=.29;ball.vz=.20;
      }else if(n==="HyperSpaceHole"||n==="BlackHole"){
        game.hit(n==="BlackHole"?"blackHole":"hyper",n,ball);
        ball.x=.37;ball.z=.42;ball.vx=-.31;ball.vz=.21;
      }
      ball.portalUntil=game.elapsed+1.25;
      game.send("kicker",{name:n,ball:ball.id});
      return false;
    }
    return false;
  }
  step(game,dt){
    this.updateFlippers(dt,game.flippers);
    this.updateGates(dt,game.elapsed);
    const dead=[];
    // Accumulate floor gravity and friction in actual GLB meters.
    for(const ball of game.activeBalls){
      ball.age+=dt;
      if(!Number.isFinite(ball.y))ball.y=ball.r;
      if(!Number.isFinite(ball.vy))ball.vy=0;
      if(ball.sinking){
        ball.sinking+=dt;
        // The physical drain is beneath the playfield: once below the
        // flipper-tip lane, transition to the native VPX Drain coordinates.
        if(this.drain){
          const k=clamp(dt*5,0,1);
          ball.x+=(this.drain.x-ball.x)*k;
          ball.z+=(this.drain.z-ball.z)*k;
        }
        ball.sinkDepth=.045*clamp(ball.sinking/.32,0,1);
        ball.y=Math.max(-.04,ball.r-ball.sinkDepth);
        if(ball.sinking>=.32)dead.push(ball);
        continue;
      }
      if(ball.kickAt&&game.elapsed<ball.kickAt){
        // In JP's table the kicker cup captures the ball before the
        // 1500 ms impulse solenoid fires; it is not a bouncing wall.
        ball.vx=0;ball.vz=0;
        continue;
      }
      if(!ball.searchAt){
        ball.searchAt=game.elapsed;
        ball.searchX=ball.x;ball.searchZ=ball.z;
      }else if(game.elapsed-ball.searchAt>1.0){
        const drift=Math.hypot(ball.x-ball.searchX,ball.z-ball.searchZ);
        if(drift<.006&&Math.hypot(ball.vx,ball.vz)<.09&&!ball.kickAt)
          ball.stillSeconds=(ball.stillSeconds||0)+1;
        else ball.stillSeconds=0;
        ball.searchX=ball.x;ball.searchZ=ball.z;ball.searchAt=game.elapsed;
        if(ball.stillSeconds>=4){
          // VPX-style ball search for a trapped ball. Apply force instead of
          // relocating it or silently ending its turn.
          const towardCenter=ball.x<.266?.15:-.15;
          ball.vx+=towardCenter;
          ball.vz-=1.45+Math.min(3,ball.searchRetries||0)*.18;
          ball.searchRetries=(ball.searchRetries||0)+1;
          ball.stillSeconds=0;
          game.send("ballSearch",{ball:ball.id,attempt:ball.searchRetries});
          if(ball.searchRetries>=3){
            // Some VPX pockets have moving actuators not represented by
            // static GLB walls. After multiple futile solenoid attempts,
            // the emergency ball-search feeder returns the same live ball
            // to a safe open spot; it does not award points or an extra ball.
            ball.x=.266;ball.z=.68;ball.y=ball.r;
            ball.vx=.10;ball.vz=-1.06;ball.vy=.24;
            ball.onRamp=null;ball.searchRetries=0;
            ball.searchAt=game.elapsed;
            ball.searchX=ball.x;ball.searchZ=ball.z;
            game.send("ballSearchRelease",{ball:ball.id});
          }
        }
      }
      if(ball.kickAt&&game.elapsed>=ball.kickAt){
        // Match the original JP VBS: *KickerRest_Hit schedules
        // left/right impulse plunger AutoFire after 1500 ms.
        ball.vx=0;
        // The left kickback runs up a narrow lane whose VPX Bumper7 occupies
        // the projected floor. In 3D the firing mechanism must pop the
        // ball OVER its low bumper and guide; otherwise it rebounds at
        // z≈.668 forever. The right lane is open and needs no comparable lift.
        const left=ball.kickSide==="left";
        ball.vz=left?-2.05:-1.8;
        ball.vy=Math.max(ball.vy||0,left?.84:.12);
        ball.onRamp=null;
        ball.kickCooldown=game.elapsed+2.3;
        game.send("kickbackFire",{side:ball.kickSide,ball:ball.id});
        ball.kickAt=0;ball.kickSide=null;
      }
      ball.vz+=.96*dt;
      const horizontalDamping=ball.onRamp?.24:ball.roll?.19:.07;
      ball.vx*=Math.exp(-horizontalDamping*dt);
      ball.vz*=Math.exp(-horizontalDamping*dt);
      const previousY=ball.y,previousX=ball.x,previousZ=ball.z;
      this.heightField.advanceVertical(ball,dt);
      ball.x+=ball.vx*dt;
      ball.z+=ball.vz*dt;
      this.heightField.update(ball,previousY,game,dt);
      this.resolveNativeWallSweep(ball,previousX,previousZ,previousY,dt,game);
      // Resolve the one-way exit *before* projecting out of Wall317 or a
      // flipper tip. Otherwise an already-draining ball receives an upward
      // collision impulse and can never cross this plane.
      if(this.inDrainMouth(ball)){
        this.beginSink(ball,game);
        continue;
      }
      this.solveEdges(ball,game);
      this.solveGates(ball,game);
      this.solveBumpers(ball,game);
      this.solveFlippers(ball,game);
      // A ball that has already passed between the real flipper tips
      // cannot be bounced back by Wall317's projected trough edges.
      if(this.inDrainMouth(ball)){
        this.beginSink(ball,game);
        continue;
      }
      this.checkTriggers(ball,game);
      this.checkSpinners(ball,game);
    }
    this.solveBallPairs(game.activeBalls.filter(b=>!b.sinking&&!b.kickAt));
    for(const ball of game.activeBalls){
      if(ball.sinking)continue;
      this.checkKickers(ball,game);
      if(!ball.sinking&&(ball.z>1.10||ball.x<-.025||ball.x>.55||ball.z<-.045)){
        // Out-of-bounds is a safety net for geometries not represented
        // in the 2D layer, not the main definition of an in-play drain.
        dead.push(ball);
      }
      // Never permit arbitrarily high velocities from overlapping contacts.
      const speed=Math.hypot(ball.vx,ball.vz);
      if(speed>3){ball.vx*=3/speed;ball.vz*=3/speed;}
    }
    for(const ball of dead){
      const index=game.activeBalls.findIndex(b=>b.id===ball.id);
      if(index<0)continue;
      game.activeBalls.splice(index,1);
      game.onDrain(ball);
    }
  }
}
