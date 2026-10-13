// SPDX-License-Identifier: GPL-3.0-or-later
// Triangle barycentric tests adapted from VPX collideex.cpp HitTriangle.
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
        const grade=(r.top-r.bottom)/offset;
        // Two physically oriented triangles per VPX drag-point segment.
        // This is a strip approximation; the rendered VPX ramp can contain
        // additional ribs, side walls, and original baked mesh curvature.
        const triangles=[];
        for(const seg of segments){
          const nx=-seg.dz/seg.length,nz=seg.dx/seg.length;
          const width=r.width*.5,h0=r.bottom+grade*seg.offset,
            h1=r.bottom+grade*(seg.offset+seg.length);
          const p0=[seg.ax+nx*width,h0,seg.az+nz*width],
            p1=[seg.ax-nx*width,h0,seg.az-nz*width],
            p2=[seg.ax+seg.dx+nx*width,h1,seg.az+seg.dz+nz*width],
            p3=[seg.ax+seg.dx-nx*width,h1,seg.az+seg.dz-nz*width];
          triangles.push([p0,p1,p2],[p1,p3,p2]);
        }
        const faces=triangles.map(vertices=>{
          const [p0,p1,p2]=vertices;
          const e0=p2.map((v,i)=>v-p0[i]),e1=p1.map((v,i)=>v-p0[i]);
          const cx=e0[1]*e1[2]-e0[2]*e1[1],
            cy=e0[2]*e1[0]-e0[0]*e1[2],
            cz=e0[0]*e1[1]-e0[1]*e1[0],
            len=Math.hypot(cx,cy,cz)||1;
          const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
          const d00=dot(e0,e0),d01=dot(e0,e1),d11=dot(e1,e1);
          return {p0,e0,e1,nx:cx/len,ny:cy/len,nz:cz/len,
            d00,d01,d11,invDenom:1/(d00*d11-d01*d01)};
        });
        return {...r,segments,length:offset,grade,triangles,faces};
      }).filter(r=>r.segments.length>0);
    this.byName=new Map(this.ramps.map(r=>[r.name,r]));
  }
  sample(name,x,z){
    const ramp=this.byName.get(name);
    return ramp?sampleSegments(ramp,x,z):null;
  }
  /**
   * Swept ball/triangle-strip TOI, adapting the plane + bounds portion of
   * VPX Hit3DPoly contact tests to the ramp centerline metadata we possess.
   * Each segment has two height-interpolated deck triangles. The calculation
   * is quadratic because the ball is falling under constant acceleration.
   * It does NOT stand in for VPX's full 3D mesh or original triangle BVH.
   */
  findLanding(ball,dt,gravity=GRAVITY){
    if(ball.onRamp||ball.vy>1.0||dt<=0)return null;
    let best=null;
    for(const ramp of this.ramps){
      for(const face of ramp.faces){
        // HitTriangle::HitTest: the ball's contact point must lie inside the
        // actual 3D triangle, not just near a projected 2D centerline.
        const {nx,ny,nz,p0,e0,e1}=face;
        const b=ball.vx*nx+ball.vy*ny+ball.vz*nz;
        const c=(ball.x-p0[0])*nx+(ball.y-p0[1])*ny+
          (ball.z-p0[2])*nz-ball.r;
        if(c<-.0001)continue; // overhead geometry is not a trampoline
        const a=-gravity*ny*.5,disc=b*b-4*a*c;
        if(disc<0||a===0)continue;
        const sqrt=Math.sqrt(disc);
        for(const t of [(-b+sqrt)/(2*a),(-b-sqrt)/(2*a)]){
          if(t<0||t>dt||b-gravity*ny*t>=-.00001)continue;
          const x=ball.x+ball.vx*t,
            y=ball.y+ball.vy*t-.5*gravity*t*t,
            z=ball.z+ball.vz*t;
          const hx=x-ball.r*nx-p0[0],
            hy=y-ball.r*ny-p0[1],
            hz=z-ball.r*nz-p0[2];
          const d02=e0[0]*hx+e0[1]*hy+e0[2]*hz,
            d12=e1[0]*hx+e1[1]*hy+e1[2]*hz;
          const u=(face.d11*d02-face.d01*d12)*face.invDenom,
            v=(face.d00*d12-face.d01*d02)*face.invDenom;
          if(u<-.00001||v<-.00001||u+v>1.00001)continue;
          const height=p0[1]+e0[1]*u+e1[1]*v;
          if(!best||t<best.time)best={type:'ramp',time:t,ramp,
            height,nx,ny,nz,x,z,triangle:face};
        }
      }
    }
    return best;
  }
  /** Project the real 3D triangle-strip normal and friction response. */
  landAt(ball,impact,game){
    const norm=Math.hypot(impact.nx,impact.ny,impact.nz);
    const nx=impact.nx/norm,ny=impact.ny/norm,nz=impact.nz/norm;
    const vn=ball.vx*nx+ball.vy*ny+ball.vz*nz;
    if(vn<0){
      const restitution=Math.min(.18,impact.ramp.restitution??.14);
      ball.vx-=(1+restitution)*vn*nx;
      ball.vy-=(1+restitution)*vn*ny;
      ball.vz-=(1+restitution)*vn*nz;
      const friction=Math.max(0,Math.min(.9,impact.ramp.friction??.2));
      ball.vx*=1-friction*.12;
      ball.vz*=1-friction*.12;
    }
    ball.onRamp=impact.ramp.name;
    ball.y=impact.height+ball.r;ball.vy=0;
    ball.surfaceY=impact.height;ball.roll=true;
    game?.send?.('rampLand',{name:impact.ramp.name,ball:ball.id,speed:Math.abs(vn)});
  }
  /**
   * Swept contact with the raised sides of a VPX ramp deck. The original
   * two thin guide ramps do not provide a closed mesh in metadata, so these
   * become vertical inward-facing guards extruded from the ramp strip.
   * Only balls ON a deck are eligible; airborne balls may fly over them.
   */
  findRailHit(ball,dt){
    if(!ball.onRamp||dt<=0)return null;
    const ramp=this.byName.get(ball.onRamp);
    if(!ramp)return null;
    let earliest=null;
    for(const seg of ramp.segments){
      const tx=seg.dx/seg.length,tz=seg.dz/seg.length;
      const sideX=-tz,sideZ=tx;
      const qx=ball.x-seg.ax,qz=ball.z-seg.az;
      const lateral=qx*sideX+qz*sideZ;
      const moving=ball.vx*sideX+ball.vz*sideZ;
      const safe=Math.max(.001,ramp.width*.5-ball.r*.42);
      for(const sign of [-1,1]){
        if(sign*moving<=.0001)continue;
        const t=(sign*safe-lateral)/moving;
        if(t<0||t>dt)continue;
        const along=qx*tx+qz*tz+(ball.vx*tx+ball.vz*tz)*t;
        if(along<0||along>seg.length)continue;
        const y=ramp.bottom+ramp.grade*(seg.offset+along);
        if(Math.abs(ball.y-y-ball.r)>ball.r*.8)continue;
        if(!earliest||t<earliest.time)
          earliest={type:'rail',time:t,ramp,ball,
            nx:-sign*sideX,nz:-sign*sideZ};
      }
    }
    return earliest;
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
