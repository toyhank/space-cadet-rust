// SPDX-License-Identifier: GPL-3.0-or-later
// VPX HitFlipperFace/End tapered swept collision WASM wrapper. The native
// impulse and motor remain in vpx-native.js (separate WASM module).
const wasmURL=new URL('./native/vpx_flipper_ccd.wasm',import.meta.url);
const compressedURL=new URL('./native/vpx_flipper_ccd.wasm.deflate.base64',import.meta.url);
export class VPXFlipperTOI{
  constructor(exports){
    if(exports.vpx_flipper_toi_version?.()!==1||!exports.memory)
      throw Error("Incorrect native VPX flipper CCD ABI");
    this.wasm=exports;
    this.out=new Float32Array(exports.memory.buffer,exports.vpx_flipper_toi_out(),12);
  }
  find(ball,f,angle,omega,dt){
    if(!Number.isFinite(angle)||!Number.isFinite(omega))return null;
    const t=this.wasm.vpx_flipper_toi(
      ball.x,ball.z,ball.y??ball.r,ball.vx,ball.vz,ball.vy||0,ball.r,
      f.x,f.z,angle,omega,f.start,f.end,
      f.length,f.baseRadius,f.endRadius,dt);
    if(!Number.isFinite(t)||t<0||t>dt)return null;
    return {time:t,nx:this.out[1],nz:this.out[2],
      rx:this.out[3],rz:this.out[4],
      kind:["face1","face2","tip","base"][Math.round(this.out[5])],
      depth:this.out[6],relativeSpeed:this.out[7]};
  }
}
export async function loadVPXFlipperTOI(){
  let bytes=null;
  try{
    const response=await fetch(wasmURL);
    if(response.ok)bytes=await response.arrayBuffer();
  }catch(_){}
  if(!bytes){
    const response=await fetch(compressedURL);
    if(!response.ok)throw Error("VPX flipper WASM artifact unavailable");
    if(typeof DecompressionStream!=="function")
      throw Error("Browser lacks deflate DecompressionStream");
    const encoded=(await response.text()).replace(/\s/g,'');
    const compressed=Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
    bytes=await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))
    ).arrayBuffer();
  }
  const {instance}=await WebAssembly.instantiate(bytes);
  return new VPXFlipperTOI(instance.exports);
}
