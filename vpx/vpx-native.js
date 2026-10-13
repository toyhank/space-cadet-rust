/**
 * Experimental hybrid physics: a small GPL-3.0-or-later C++ subset adapted
 * from official VPX LineSeg::HitTestBasic and HitBall::Collide3DWall.
 *
 * Only rigid static wall time-of-impact and wall impulse are migrated.
 * Flippers, ramps, bumpers, gates and VBS scripts stay on the existing JS
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
    if(!wasm?.exports?.memory||wasm.exports.vpx_version()!==1)
      throw Error("Unsupported VPX WASM ABI");
    this.wasm=wasm.exports;
    this.out=new Float32Array(this.wasm.memory.buffer,this.wasm.vpx_out(),12);
    this.backend="VPX C++ CCD v1 (walls only)";
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
  return new VPXNativeCCD(instance);
}
