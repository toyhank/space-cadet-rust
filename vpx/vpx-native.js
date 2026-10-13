/**
 * Experimental hybrid physics: a small GPL-3.0-or-later C++ subset adapted
 * from official VPX LineSeg::HitTestBasic and HitBall::Collide3DWall.
 *
 * Rigid wall CCD, flipper motor torque and ball-flipper normal/friction impulse are migrated.
 * Flipper capsule contact search, ramps, bumpers, gates and VBS scripts stay on the existing JS
 * solver. The original C++ source is in ./native/vpx_ccd.cpp.
 *
 * Enable manually: ?vpxccd=1. Never label this the full VPX engine.
 */
const wasmURL=new URL("./native/vpx_ccd.wasm",import.meta.url);
const base64URL=new URL("./native/vpx_ccd.wasm.base64",import.meta.url);
const noop=()=>null;
const cleanString=s=>s.replace(/\s/g,"");
async function getBytes(){
  const file=await fetch(wasmURL).catch(noop);
  if(file?.ok)return new Uint8Array(await file.arrayBuffer());
  const fallback=await fetch(base64URL).catch(noop);
  if(!fallback?.ok)throw Error("Native VPX CCD .wasm and .base64 unavailable");
  const encoded=cleanString(await fallback.text());
  return Uint8Array.from(atob(encoded),s=>s.charCodeAt(0));
}
export class VPXNativeCCD{
  constructor(wasm){
    if(!wasm?.exports?.memory||wasm.exports.vpx_version()!==2)
      throw Error("Unsupported VPX WASM ABI");
    this.wasm=wasm.exports;
    this.out=new Float32Array(this.wasm.memory.buffer,this.wasm.vpx_out(),12);
    this.backend="VPX C++ CCD v2 (walls + flipper motor/impulse)";
  }
  // Exact VPX FIX_PHYSICS shape inertia: tapered capsule as trapezoid,
  // major base circular segment, and minor end circular segment.
  // Return k² in GLB m², not moment of inertia in VPU.
  static inertiaShape(baseRadius,endRadius,length){
    const ratio=(baseRadius-endRadius)/length;
    if(!(length>0&&Math.abs(ratio)<1))return length*length/3;
    const fa=Math.asin(ratio),cos=Math.sqrt(1-ratio*ratio);
    const twoFa=2*fa,etheta=Math.PI-twoFa,btheta=Math.PI+twoFa;
    const sinE=Math.sin(twoFa),sinB=-sinE,c2=cos*cos;
    const a=2*endRadius*cos,b=2*baseRadius*cos,
      ht=length-ratio*(baseRadius-endRadius);
    const areaT=.5*ht*(a+b);
    const itc=ht*(16*ht*ht*a*b+4*ht*ht*(a*a+b*b)
      +3*a*a*a*a+6*a*a*b*b+6*a*b*(a*a+b*b)+3*b*b*b*b)/(144*(a+b));
    const centerT=baseRadius*ratio+ht*(2*a+b)/(3*(a+b));
    const it=itc+areaT*centerT*centerT;
    const areaB=.5*baseRadius**2*(btheta-sinB);
    const ib=.25*baseRadius**4*(btheta-sinB+(2/3)*sinB*c2);
    const areaE=.5*endRadius**2*(etheta-sinE);
    const ieLocal=.25*endRadius**4*(etheta-sinE+(2/3)*sinE*c2);
    const de=(4/3)*endRadius*cos*c2/(etheta-sinE);
    const ie=ieLocal+areaE*((length+de)**2-de*de);
    return (it+ib+ie)/(areaT+areaB+areaE);
  }
  stepFlipper(f,pressed,dt){
    if(f.nativeShape===undefined)
      f.nativeShape=VPXNativeCCD.inertiaShape(f.baseRadius,f.endRadius,f.length);
    this.wasm.vpx_flipper_step(f.angle,f.omega,f.nativeTorque||0,
      f.start,f.end,f.length,f.nativeShape,
      f.strength??3600,f.returnRatio??.04,f.rampUp??1,
      f.torqueDamping??1,f.torqueDampingAngle??0,
      dt,pressed?1:0);
    f.angle=this.out[0];
    f.omega=this.out[1];
    f.nativeTorque=this.out[2];
  }
  collideFlipper(ball,f,rx,rz,nx,nz){
    this.wasm.vpx_flipper_collide(
      ball.vx,ball.vz,ball.wy||0,f.omega,rx,rz,nx,nz,
      ball.r,f.nativeShape??VPXNativeCCD.inertiaShape(f.baseRadius,f.endRadius,f.length),
      f.restitution??.85,f.falloff??.5,f.friction??.25,
      f.nativeTorque||0,(Math.abs(f.angle-f.end)<.01||
        Math.abs(f.angle-f.start)<.01)?1:0);
    if(!this.out[6])return false;
    ball.vx=this.out[0];ball.vz=this.out[1];ball.wy=this.out[2];
    f.omega=this.out[3];
    return true;
  }
  lineTime(ball,edge,seconds,twoSided=true){
    const s=edge.source||edge;
    const time=this.wasm.vpx_line_toi(
      ball.x,ball.z,ball.y??ball.r,ball.vx,ball.vz,ball.vy||0,ball.r,
      edge.x1,edge.z1,edge.x2,edge.z2,
      s.bottom??0,s.top??.06,seconds,twoSided?1:0
    );
    if(!Number.isFinite(time)||time<0)return null;
    return {time,nx:this.out[1],nz:this.out[2],
      penetration:this.out[3],contact:!!this.out[4]};
  }
  bounce(ball,hit,source={}){
    this.wasm.vpx_wall_bounce(
      ball.vx,ball.vz,ball.vy||0,ball.wx||0,ball.wy||0,ball.wz||0,
      hit.nx,hit.nz,0,ball.r,
      source.restitution??.6,source.falloff??0,source.friction??.2,
      hit.penetration
    );
    ball.vx=this.out[0];ball.vz=this.out[1];ball.vy=this.out[2];
    ball.wx=this.out[3];ball.wy=this.out[4];ball.wz=this.out[5];
  }
}
export async function loadVPXNativeCCD(){
  const bytes=await getBytes();
  const {instance}=await WebAssembly.instantiate(bytes);
  const native=new VPXNativeCCD(instance);
  try{
    const {loadVPXFlipperTOI}=await import("./vpx-flipper-toi.js");
    native.flipperTOI=await loadVPXFlipperTOI();
  }catch(e){
    // Preserve the verified wall CCD + flipper impulse motor if new module
    // is not available; the JS flipper contact search remains a fallback.
    console.warn("VPX flipper CCD unavailable; retaining JS contact search",e);
  }
  return native;
}
