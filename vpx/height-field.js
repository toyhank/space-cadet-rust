/**
 * Layered VPX ramp surfaces, with a real vertical ball coordinate.
 *
 * The VPX drag points are a swept centerline. Each is sampled by arc length
 * to preserve curves and interpolate the actual height_bottom/height_top.
 * Narrow (wire/edge) ramps are NOT considered walkable surfaces.
 *
 * Units are GLB meters, with Y up.
 * This is an approximated contact solver, not the native VPX engine.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const EPS=1e-6;
const GRAVITY=4.6;
function sampleSegments(ramp,x,z){
  let best=null;
  for(let i=0;i<ramp.segments.length;i++){
    const s=ramp.segments[i];
    const raw=((x-s.ax)*s.dx+(z-s.az)*s.dz)/s.l2;
    const t=clamp(raw,0,1);
    const cx=s.ax+s.dx*t,cz=s.az+s.dz*t;
    const d2=(cx-x)**2+(cz-z)**2;
    if(best&&best.d2<=d2)continue;
    const along=s.offset+t*s.length;
    best={ramp,cx,cz,d2,distance:Math.sqrt(d2),tx:s.dx/s.length,
      tz:s.dz/s.length,along,
      fraction:clamp(along/ramp.length,0,1),
      y:ramp.bottom+(ramp.top-ramp.bottom)*clamp(along/ramp.length,0,1),
      grade:(ramp.top-ramp.bottom)/ramp.length,
      beyondStart:i===0&&raw<0,
      beyondEnd:i===ramp.segments.length-1&&raw>1};
  }
  return best;
}
export class LayeredRampWorld{
  constructor(input=[]){
    this.ramps=(input||[]).filter(o=>o.points?.length>=2&&
      Number.isFinite(o.bottom)&&Number.isFinite(o.top)&&o.width>.012)
      .map(r=>{
        const segments=[];let offset=0;
        for(let i=0;i<r.points.length-1;i++){
          const [ax,az]=r.points[i],[bx,bz]=r.points[i+1];
          const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;
          if(l2<EPS**2)continue;
          const length=Math.sqrt(l2);
          segments.push({ax,az,dx,dz,l2,length,offset});
          offset+=length;
        }
        return {...r,segments,length:offset};
      }).filter(r=>r.segments.length>0);
    this.byName=new Map(this.ramps.map(r=>[r.name,r]));
  }
  sample(name,x,z){
    const ramp=this.byName.get(name);
    return ramp?sampleSegments(ramp,x,z):null;
  }
  candidates(ball){
    return this.ramps.map(r=>sampleSegments(r,ball.x,ball.z))
      .filter(s=>s&&!s.beyondStart&&!s.beyondEnd&&
        s.distance<=s.ramp.width*.5+ball.r*.15);
  }
  update(ball,previousY,game,dt){
    const r=ball.r||.0122;
    // Existing ramp: retain support as long as inside the swept surface.
    if(ball.onRamp){
      const s=this.sample(ball.onRamp,ball.x,ball.z);
      if(s&&!s.beyondStart&&!s.beyondEnd&&
         s.distance<=s.ramp.width*.5+r*.15){
        const sideRadius=Math.max(.001,s.ramp.width*.5-r*.42);
        if(s.distance>sideRadius&&s.distance>1e-7){
          // Guide rail: prevent side penetration and bounce lateral speed
          // without changing along-ramp momentum.
          const nx=(ball.x-s.cx)/s.distance,nz=(ball.z-s.cz)/s.distance;
          const penetration=s.distance-sideRadius;
          ball.x-=nx*penetration;ball.z-=nz*penetration;
          const lateral=ball.vx*nx+ball.vz*nz;
          if(lateral>0){
            ball.vx-=1.30*lateral*nx;
            ball.vz-=1.30*lateral*nz;
            game?.send?.('rampRail',{name:s.ramp.name,ball:ball.id});
          }
        }
        const speedAlong=ball.vx*s.tx+ball.vz*s.tz;
        // Normal gravity component on an inclined rolling surface.
        const acceleration=-GRAVITY*s.grade/(1+s.grade*s.grade);
        ball.vx+=s.tx*acceleration*dt;
        ball.vz+=s.tz*acceleration*dt;
        ball.y=s.y+r;ball.vy=0;
        ball.surfaceY=s.y;
        ball.roll=true;
        return 'ramp';
      }
      // The ball has left an edge: preserve height and its vertical
      // tangent velocity; do not teleport it down onto the floor.
      const former=this.sample(ball.onRamp,ball.x,ball.z);
      if(former)ball.vy=clamp((ball.vx*former.tx+ball.vz*former.tz)*former.grade,-.5,.5);
      const departed=ball.onRamp;
      ball.onRamp=null;ball.roll=false;
      game?.send?.('rampExit',{name:departed,ball:ball.id});
      return 'air';
    }
    // Land only when descending from ABOVE a layer. An overhead ramp
    // cannot capture balls traveling on the lower table or below it.
    if(ball.vy<=0){
      const hits=this.candidates(ball)
        .filter(s=>previousY-r>=s.y-.001&&ball.y-r<=s.y+.0005)
        .sort((a,b)=>b.y-a.y);
      if(hits.length){
        const s=hits[0];
        const impact=Math.abs(ball.vy);
        ball.onRamp=s.ramp.name;ball.surfaceY=s.y;
        ball.y=s.y+r;ball.vy=0;ball.roll=true;
        game?.send?.('rampLand',{name:s.ramp.name,ball:ball.id,speed:impact});
        return 'ramp';
      }
    }
    // Table plane is Y=0. Rest on it or make a low energy bounce on impact.
    if(ball.y<=r){
      const impact=-ball.vy;
      ball.y=r;ball.surfaceY=0;ball.roll=true;
      if(impact>.31){
        ball.vy=Math.min(.42,impact*.22);
        game?.send?.('ballBounce',{ball:ball.id,speed:impact});
      }else ball.vy=0;
      return 'floor';
    }
    ball.surfaceY=0;ball.roll=false;
    return 'air';
  }
  advanceVertical(ball,dt){
    if(!Number.isFinite(ball.y))ball.y=ball.r||.0122;
    if(!Number.isFinite(ball.vy))ball.vy=0;
    if(!ball.onRamp){
      ball.vy-=GRAVITY*dt;
      ball.y+=ball.vy*dt;
    }
  }
}
