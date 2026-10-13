// SPDX-License-Identifier: GPL-3.0-or-later
// Control-flow adaptation of Visual Pinball X PhysicsEngine.cpp.
/**
 * Experimental VPX-style chronological collision queue for a fixed tick.
 * Ported CONTROL FLOW from PhysicsEngine::UpdatePhysics:
 *   search earliest TOI -> advance ALL bodies -> resolve -> resume remaining.
 * Existing native VPX WASM routines provide wall/flipper TOI and impulses.
 *
 * Ramp deck geometry uses triangulated, interpolated JP VPX drag points;
 * ball-ball uses analytic 3D sphere TOI. This is an approximation of VPX's
 * complete dynamic kd-tree/contact iterations, not the full original engine.
 */
const EPS=1e-6;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const objectIds=new WeakMap();let nextObjectId=0;
const keyFor=(n,x)=>{
  if(x&&typeof x==='object'){
    if(!objectIds.has(x))objectIds.set(x,++nextObjectId);
    return n+":"+objectIds.get(x);
  }
  return n+":"+String(x);
};
export class VPXContactScheduler{
  constructor(world){
    this.world=world;
    this.maxEvents=24; // VPX has iteration caps to avoid zero-time loops.
  }
  wallCandidates(ball,remaining,blocked){
    const w=this.world,n=w.nativeCCD;
    if(!n?.lineTime||Math.hypot(ball.vx,ball.vz)<.055||
       (ball.x>.455&&ball.z>.15)||ball.kickAt)return null;
    const x0=Math.floor((Math.min(ball.x,ball.x+ball.vx*remaining)-ball.r)/.055);
    const x1=Math.floor((Math.max(ball.x,ball.x+ball.vx*remaining)+ball.r)/.055);
    const z0=Math.floor((Math.min(ball.z,ball.z+ball.vz*remaining)-ball.r)/.055);
    const z1=Math.floor((Math.max(ball.z,ball.z+ball.vz*remaining)+ball.r)/.055);
    let best=null;const seen=new Set();
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      for(const edge of w.cells.get(x+","+z)||[]){
        if(seen.has(edge))continue;
        seen.add(edge);
        const source=edge.source;
        if(source.type!=="Wall"||source.slingshot||source.name==="Wall317"||
           blocked.has(keyFor(ball.id,edge)))continue;
        const hit=n.lineTime(ball,edge,remaining,true);
        if(!hit||hit.contact||hit.time<0||hit.time>remaining)continue;
        if(!best||hit.time<best.time)best={type:'wall',time:hit.time,
          ball,edge,...hit};
      }
    }
    return best;
  }
  flipperCandidates(ball,remaining,offset,total,blocked){
    const native=this.world.nativeCCD;
    if(!native?.flipperTOI||!native?.collideFlipper)return null;
    let best=null;
    for(const f of this.world.flippers){
      if(blocked.has(keyFor(ball.id,f)))continue;
      const elapsedAngle=total>0?offset/total:0;
      const angle=(f.previousAngle??f.angle)+(f.angle-(f.previousAngle??f.angle))*elapsedAngle;
      const sweep=f.sweepOmega??f.omega;
      const hit=native.flipperTOI.find(ball,f,angle,sweep,remaining);
      if(!hit)continue;
      if(!best||hit.time<best.time)best={type:'flipper',time:hit.time,
        ball,flipper:f,...hit};
    }
    return best;
  }
  pairCandidate(a,b,dt,blocked){
    if(blocked.has(keyFor(a.id,b.id))||blocked.has(keyFor(b.id,a.id)))return null;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    const vx=b.vx-a.vx,vy=(b.vy||0)-(a.vy||0),vz=b.vz-a.vz;
    const radius=a.r+b.r;
    const c=dx*dx+dy*dy+dz*dz-radius*radius;
    if(c<=0)return null; // initial overlap handled by discrete safety net
    const av=vx*vx+vy*vy+vz*vz;
    const bv=2*(dx*vx+dy*vy+dz*vz);
    if(bv>=0||av<1e-9)return null;
    const disc=bv*bv-4*av*c;
    if(disc<0)return null;
    const t=(-bv-Math.sqrt(disc))/(2*av);
    return t>=0&&t<=dt?{type:'pair',time:t,a,b}:null;
  }
  floorCandidate(ball,dt){
    if(ball.onRamp||ball.vy>0&&ball.y<=ball.r+.00001)return null;
    const c=ball.y-ball.r;
    if(c<-.00001)return null;
    if(c<=EPS&&ball.vy<=0)return null; // stable table support
    const gravity=4.6;
    const disc=ball.vy*ball.vy+2*gravity*Math.max(0,c);
    const t=(ball.vy+Math.sqrt(disc))/gravity;
    return t>=0&&t<=dt&&ball.vy-gravity*t<-.00001?
      {type:'floor',time:t,ball}:null;
  }
  earliest(balls,remaining,elapsed,total,blocked){
    let best=null;
    const offer=h=>{
      if(!h||h.time<0||h.time>remaining)return;
      if(!best||h.time<best.time-1e-8||
         (Math.abs(h.time-best.time)<=1e-8&&
          ['pair','flipper','ramp','rail','wall','floor'].indexOf(h.type)<
          ['pair','flipper','ramp','rail','wall','floor'].indexOf(best.type)))best=h;
    };
    for(const ball of balls){
      offer(this.wallCandidates(ball,remaining,blocked));
      offer(this.flipperCandidates(ball,remaining,elapsed,total,blocked));
      if(ball.onRamp){
        const rail=this.world.heightField.findRailHit(ball,remaining);
        if(rail&&!blocked.has(keyFor(ball.id,"rail:"+rail.ramp.name)))
          offer(rail);
      }
      if(!ball.onRamp){
        const ramp=this.world.heightField.findLanding(ball,remaining);
        if(ramp&&!blocked.has(keyFor(ball.id,ramp.ramp)))
          offer({...ramp,ball});
      }
      if(!blocked.has(keyFor(ball.id,'floor')))
        offer(this.floorCandidate(ball,remaining));
    }
    for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)
      offer(this.pairCandidate(balls[i],balls[j],remaining,blocked));
    return best;
  }
  move(balls,seconds,game){
    if(seconds<=0)return;
    for(const ball of balls){
      const oldY=ball.y;
      // Preserve the original VPX-derived ramp support and side rail logic.
      this.world.heightField.advanceVertical(ball,seconds);
      ball.x+=ball.vx*seconds;ball.z+=ball.vz*seconds;
      // Falling at constant gravity: use midpoint velocity in the
      // displacement, rather than an Euler error at each collision slice.
      if(!ball.onRamp)ball.y+=4.6*seconds*seconds*.5;
      this.world.heightField.update(ball,oldY,game,seconds);
    }
  }
  resolve(hit,game){
    const w=this.world,n=w.nativeCCD;
    if(hit.type==='wall'){
      const {ball,edge}=hit;
      ball.x+=hit.nx*.000065;ball.z+=hit.nz*.000065;
      n.bounce(ball,hit,edge.source);
      w.stats.contacts++;w.stats.wallHits++;
      w.stats.nativeHits=(w.stats.nativeHits||0)+1;
      ball._scheduledWallNames??=new Set();
      ball._scheduledWallNames.add(edge.source.name);
      game?.send?.('wallCCD',{name:edge.source.name,ball:ball.id,time:hit.time});
    }else if(hit.type==='flipper'){
      const {ball,flipper:f}=hit;
      const ok=n.collideFlipper(ball,f,hit.rx,hit.rz,hit.nx,hit.nz);
      if(!ok)return false;
      ball.x+=hit.nx*.000065;ball.z+=hit.nz*.000065;
      ball._nativeFlipperStep=game.elapsed;
      w.stats.nativeFlipperHits=(w.stats.nativeFlipperHits||0)+1;
      w.stats.nativeFlipperCCD=(w.stats.nativeFlipperCCD||0)+1;
      const side=/^left/i.test(f.name)?'left':'right';
      const key='flipper'+side+ball.id;
      if(game.elapsed-(game.timeSinceHit.get(key)??-999)>.09){
        game.timeSinceHit.set(key,game.elapsed);
        game.send('flipperHit',{side,ball:ball.id,native:true,
          contact:hit.kind,ccd:true,time:hit.time});
      }
    }else if(hit.type==='ramp'){
      w.heightField.landAt(hit.ball,hit,game);
      w.stats.rampTOI=(w.stats.rampTOI||0)+1;
    }else if(hit.type==='rail'){
      const {ball,nx,nz,ramp}=hit;
      const lateral=ball.vx*nx+ball.vz*nz;
      // The one-way inward normal points back toward the ramp center.
      if(lateral<0){
        ball.vx-=1.3*lateral*nx;
        ball.vz-=1.3*lateral*nz;
      }
      ball.x+=nx*.00006;ball.z+=nz*.00006;
      w.stats.rampRailTOI=(w.stats.rampRailTOI||0)+1;
      game?.send?.('rampRail',{name:ramp.name,ball:ball.id,ccd:true});
    }else if(hit.type==='floor'){
      const b=hit.ball,impact=-b.vy;
      b.y=b.r;b.roll=true;b.surfaceY=0;
      if(impact>.31){
        b.vy=Math.min(.42,impact*.22);
        game?.send?.('ballBounce',{ball:b.id,speed:impact});
      }else b.vy=0;
      w.stats.floorTOI=(w.stats.floorTOI||0)+1;
    }else if(hit.type==='pair'){
      const {a,b}=hit;
      const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz)||1;
      const nx=dx/d,ny=dy/d,nz=dz/d;
      const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz;
      if(vn>=0)return false;
      const impulse=-.91*vn;
      a.vx-=nx*impulse;a.vy-=ny*impulse;a.vz-=nz*impulse;
      b.vx+=nx*impulse;b.vy+=ny*impulse;b.vz+=nz*impulse;
      // Contact separation prevents the next TOI solving the same pair.
      a.x-=nx*.000025;a.y-=ny*.000025;a.z-=nz*.000025;
      b.x+=nx*.000025;b.y+=ny*.000025;b.z+=nz*.000025;
      w.stats.ballBallTOI=(w.stats.ballBallTOI||0)+1;
    }
    return true;
  }
  /**
   * Run all in-play balls through a single minimum-hit-time queue.
   * All balls advance to the SAME event time, just like VPX PhysicsEngine.
   * The queue has a strict iteration limit, disallowing zero-time loops.
   */
  step(balls,dt,game){
    if(!balls.length)return;
    const blocked=new Set();
    let remaining=dt,elapsed=0,events=0;
    for(const b of balls)b._scheduledWallNames=new Set();
    while(remaining>1e-7&&events<this.maxEvents){
      const hit=this.earliest(balls,remaining,elapsed,dt,blocked);
      if(!hit){this.move(balls,remaining,game);remaining=0;break;}
      const traveled=clamp(hit.time,0,remaining);
      if(traveled>0){
        this.move(balls,traveled,game);
        remaining-=traveled;elapsed+=traveled;
      }
      // A collider can be hit AGAIN later in the same step after the ball
      // rebounds from something else. Keep the zero-time suppression only
      // while contacts are simultaneous; re-arm after real travel time.
      if(traveled>.0002)blocked.clear();
      this.resolve(hit,game);
      if(hit.type==='pair'){
        blocked.add(keyFor(hit.a.id,hit.b.id));
        blocked.add(keyFor(hit.b.id,hit.a.id));
      }else{
        const object=hit.edge||hit.flipper||(hit.type==="rail"?"rail:"+hit.ramp.name:hit.ramp)||hit.type;
        blocked.add(keyFor(hit.ball.id,object));
      }
      events++;
      if(remaining<=1e-7)break;
      // On repeated zero-time contacts, move past the contact by a very
      // small physical time, bounded by remaining timestep.
      if(traveled<1e-6){
        const nudge=Math.min(.000015,remaining);
        this.move(balls,nudge,game);
        remaining-=nudge;elapsed+=nudge;
      }
    }
    if(remaining>1e-7)this.move(balls,remaining,game);
    this.world.stats.scheduleEvents=(this.world.stats.scheduleEvents||0)+events;
    this.world.stats.scheduleCaps=(this.world.stats.scheduleCaps||0)+
      (events>=this.maxEvents?1:0);
  }
}
