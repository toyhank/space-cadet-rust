/**
 * Zero-dependency static build. Output works on GitHub Pages (subpaths).
 *
 * Default: no third-party VPX game files/assets in dist (upload in browser).
 * --with-local-assets: private local build including the user's converted VPX.
 * NEVER commit a dist created with --with-local-assets.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const includePrivate=process.argv.includes('--with-local-assets');
const copy=async(src,dest)=>{
  await fs.mkdir(path.dirname(path.join(out,dest)),{recursive:true});
  await fs.cp(path.join(root,src),path.join(out,dest),{recursive:true});
};
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
await Promise.all([
  copy('vpx','vpx'),
  copy('vpx.html','vpx.html'),
  copy('node_modules/three/build/three.module.js','node_modules/three/build/three.module.js'),
  copy('node_modules/three/build/three.core.js','node_modules/three/build/three.core.js'),
  copy('node_modules/three/examples/jsm','node_modules/three/examples/jsm'),
  copy('node_modules/@francisdb/vpin-wasm/vpin.js','node_modules/@francisdb/vpin-wasm/vpin.js'),
  copy('node_modules/@francisdb/vpin-wasm/vpin_bg.wasm',
    'node_modules/@francisdb/vpin-wasm/vpin_bg.wasm'),
]);
// GitHub Pages serves index.html at the repository root. Existing source uses
// relative paths, so no special base path config or bundler rewriting is needed.
// Ship a genuine .wasm MIME-friendly binary. The checked-in base64 copy
// allows WebAssembly builds without requiring clang/Emscripten in CI.
const nativeEncoded=await fs.readFile(path.join(root,'vpx/native/vpx_ccd.wasm.base64'),'utf8');
const nativeBytes=Buffer.from(nativeEncoded.replace(/\s/g,''),'base64');
if(!WebAssembly.validate(nativeBytes))throw Error('Invalid VPX native CCD WASM artifact');
await fs.writeFile(path.join(out,'vpx/native/vpx_ccd.wasm'),nativeBytes);
await fs.copyFile(path.join(out,'vpx.html'),path.join(out,'index.html'));
await fs.writeFile(path.join(out,'.nojekyll'),'');
if(includePrivate){
  for(const file of ['space-cadet.glb','space-cadet.physics.json','space-cadet.report.json']){
    await copy('assets/vpx-local/'+file,'assets/vpx-local/'+file);
  }
}else{
  await fs.mkdir(path.join(out,'assets/vpx-local'),{recursive:true});
  // Publishing an extracted VPX/GLB must be a separate deliberate decision
  // by the asset copyright holder. Public builds require local user import.
}
const files=[];
const scan=async(dir)=>{
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
    const p=path.join(dir,item.name);
    if(item.isDirectory())await scan(p);else files.push(path.relative(out,p));
  }
};
await scan(out);
const stats=await Promise.all(files.map(p=>fs.stat(path.join(out,p))));
console.log(JSON.stringify({
  output:out,
  mode:includePrivate?'private-local':'public-source-only',
  files:files.length,
  totalMB:Math.round(stats.reduce((total,s)=>total+s.size,0)/1024/1024*10)/10,
  includesVPXAssets:includePrivate,
  entry:'dist/index.html'
},null,2));
