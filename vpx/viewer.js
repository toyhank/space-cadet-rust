import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { inspectGlb } from './conversion.js';
import { LampController } from './lamps.js';
import { createMaterialPreview } from './materials.js';
import { VPXGameView } from './game-view.js';

const $ = id => document.getElementById(id);
const inspectionMode = new URLSearchParams(location.search).has('inspect');
document.body.classList.toggle('inspection',inspectionMode);
const stage = $('stage'), canvas = $('viewport');
let renderer, scene, camera, controls, root, floor, environment, gltfCameras = [];
let lampController, composer, bloom;
let materialPreview, gameplay;
let meshes = [], sourceLights = [], selected = null, isolated = false;
let glbBytes, report = {}, worker, pendingFetch, loadId = 0, mode = 'pbr';
let bounds = new THREE.Box3(), tableBounds = new THREE.Box3(), renderCount = 0, lastStats = 0;
const originalMaterials = new Map(), alternateMaterials = new Map();
const studio = new THREE.Group();
const raycaster = new THREE.Raycaster();
const lights = {};

function error(message) { $('error').textContent = message; $('error').hidden = false; }
function busy(message) { $('error').hidden = true; $('busy').hidden = false; $('progress').textContent = message; }
function idle() { $('busy').hidden = true; }
function stopLoading() {
  ++loadId;
  worker?.terminate(); worker = null;
  pendingFetch?.abort(); pendingFetch = null;
  idle();
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function statsMaterials() {
  const mats = new Set(), textures = new Set();
  for (const mesh of meshes) for (const mat of [].concat(originalMaterials.get(mesh))) {
    mats.add(mat);
    for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
  }
  return { materials: mats.size, textures: textures.size };
}
function disposeRoot(object) {
  if (!object) return;
  const geo = new Set(), mats = new Set(), tex = new Set();
  object.traverse(o => {
    if (o.geometry) geo.add(o.geometry);
    if (o.material) for (const mat of [].concat(originalMaterials.get(o) || o.material)) {
      mats.add(mat);
      for (const v of Object.values(mat)) if (v?.isTexture) tex.add(v);
    }
  });
  geo.forEach(v => v.dispose()); mats.forEach(v => v.dispose());
  tex.forEach(t => { t.dispose(); t.source?.data?.close?.(); });
}

function setLighting(name) {
  const presets = {
    arcade: { hemi: 0.4, key: 0.7, fill: 0.25, env: 0.32, color: 0xfff1d9, pos: [-1, 2, 0.8] },
    studio: { hemi: 1.2, key: 2.3, fill: 0.8, env: 0.65, color: 0xfff1d9, pos: [-1, 2, 0.8] },
    neutral: { hemi: 2.2, key: 0.8, fill: 0.6, env: 0.45, color: 0xffffff, pos: [0, 3, 0.1] },
    raking: { hemi: 0.5, key: 3.2, fill: 0.15, env: 0.5, color: 0xffedce, pos: [-2, 0.25, 0.3] },
  };
  const p = presets[name] || presets.studio;
  lights.hemi.intensity = p.hemi; lights.key.intensity = p.key; lights.fill.intensity = p.fill;
  lights.key.color.setHex(p.color); scene.environmentIntensity = p.env;
  const c = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const size = bounds.isEmpty() ? 1 : Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  lights.key.position.copy(c).add(new THREE.Vector3(...p.pos).multiplyScalar(size));
  lights.key.target.position.copy(c);
  lights.fill.position.copy(c).add(new THREE.Vector3(1, 1, -1).multiplyScalar(size));
  lights.fill.target.position.copy(c);
  for (const edge of ['left', 'bottom']) lights.key.shadow.camera[edge] = -size;
  for (const edge of ['right', 'top']) lights.key.shadow.camera[edge] = size;
  lights.key.shadow.camera.far = size * 8;
  lights.key.shadow.camera.near = 0.001;
  lights.key.shadow.camera.updateProjectionMatrix();
  lights.key.shadow.normalBias = size * 0.0002;
}

function fitBox(box, view = 'table') {
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.005);
  camera.fov = 36;
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const direction = new THREE.Vector3(...({ table: [0.08, 1.35, 1.1], top: [0, 1, 0.0001], low: [0.8, 0.55, 1.15] }[view] || [0, 1.35, 1.1])).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  let distance = 0;
  // Fit all eight corners in camera space, avoiding a distant bounding-sphere view.
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).sub(center);
    distance = Math.max(distance, Math.abs(p.dot(right)) / Math.tan(horizontal) + p.dot(direction),
      Math.abs(p.dot(up)) / Math.tan(vertical) + p.dot(direction));
  }
  distance = Math.max(distance * 1.24, radius * 1.2);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(radius / 1000, 0.0001); camera.far = Math.max(distance * 50, 100);
  camera.up.set(0, 1, 0); camera.updateProjectionMatrix();
  controls.target.copy(center); controls.minDistance = radius * 0.08; controls.maxDistance = distance * 5;
  controls.update();
  $('camera').value = '';
}

function setView(view) {
  restoreIsolation(); fitBox(tableBounds.isEmpty() ? bounds : tableBounds, view);
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  for (const mesh of meshes) {
    const originals = [].concat(materialPreview.assignments.get(mesh));
    const mapped = originals.map(original => {
      let mat = original;
      if (mode !== 'pbr') {
        const key = original.uuid + mode;
        if (!alternateMaterials.has(key)) {
          mat = mode === 'clay'
            ? new THREE.MeshStandardMaterial({ color: 0x777d7a, roughness: 0.8, metalness: 0, side: original.side })
            : new THREE.MeshBasicMaterial({ color: original.color || 0xffffff, map: original.map,
              alphaMap: original.alphaMap, alphaTest: original.alphaTest,
              opacity: original.opacity, transparent: original.transparent, side: original.side, depthWrite: original.depthWrite });
          alternateMaterials.set(key, mat);
        }
        mat = alternateMaterials.get(key);
      }
      mat.wireframe = $('wireframe').checked;
      return mat;
    });
    mesh.material = Array.isArray(materialPreview.assignments.get(mesh)) ? mapped : mapped[0];
  }
  lampController?.setEnabled(mode === 'pbr', $('wireframe').checked);
}

function populateObjects() {
  const query = $('search').value.toLowerCase();
  $('objects').replaceChildren(new Option('选取零件或双击模型', ''));
  meshes.forEach((mesh, i) => {
    if ((mesh.name || '').toLowerCase().includes(query)) $('objects').add(new Option(mesh.name || `Mesh ${i}`, String(i)));
  });
  if (selected) $('objects').value = String(meshes.indexOf(selected));
}
function selectObject(mesh, focus = false) {
  if (!mesh) return;
  if (isolated) restoreIsolation();
  selected = mesh;
  const materials = [].concat(originalMaterials.get(mesh));
  const tex = materials.find(m => m.map)?.map?.image;
  const textureText = tex ? ` · 贴图 ${tex.width} × ${tex.height}` : ' · 无颜色贴图';
  $('selected').textContent = `${mesh.name} · ${materials.map(m => m.name || m.type).join(', ')}${textureText}`;
  $('focus').disabled = $('isolate').disabled = false;
  $('objects').value = String(meshes.indexOf(mesh));
  if (focus) fitBox(new THREE.Box3().setFromObject(mesh));
}
function restoreIsolation() {
  if (!isolated) return;
  for (const mesh of meshes) mesh.visible = mesh.userData.viewerVisible;
  isolated = false; $('isolate').textContent = '单独查看';
}
function isolateSelected() {
  if (!selected) return;
  if (isolated) { restoreIsolation(); return; }
  for (const mesh of meshes) { mesh.userData.viewerVisible = mesh.visible; mesh.visible = mesh === selected; }
  isolated = true; $('isolate').textContent = '显示全部';
  fitBox(new THREE.Box3().setFromObject(selected));
}

async function showModel(buffer, metadata, id) {
  const bytes = new Uint8Array(buffer);
  const content = inspectGlb(bytes);
  if (content.meshes === 0) throw new Error('GLB 不包含可显示的网格');
  busy('正在载入贴图与三维场景…');
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  if (id !== loadId) { disposeRoot(gltf.scene); return; }
  // Check before replacing a working model.
  const nextBounds = new THREE.Box3().setFromObject(gltf.scene);
  if (nextBounds.isEmpty() || ![...nextBounds.min.toArray(), ...nextBounds.max.toArray()].every(Number.isFinite)) {
    disposeRoot(gltf.scene); throw new Error('模型包围盒无效');
  }
  gameplay?.destroy(); gameplay = null;
  lampController?.dispose(); lampController = null;
  scene.remove(root); disposeRoot(root);
  materialPreview?.dispose(); materialPreview = null;
  alternateMaterials.forEach(m => m.dispose()); alternateMaterials.clear(); originalMaterials.clear();
  root = gltf.scene; meshes = []; sourceLights = []; selected = null; isolated = false;
  gltfCameras = gltf.cameras; root.updateMatrixWorld(true);
  root.traverse(o => {
    if (o.isMesh) {
      meshes.push(o); originalMaterials.set(o, o.material);
      const material = [].concat(o.material);
      o.castShadow = material.every(m => !m.transparent && !(m.transmission > 0));
      o.receiveShadow = true;
      for (const m of material) for (const v of Object.values(m)) if (v?.isTexture)
        v.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    }
    if (o.isLight) { sourceLights.push(o); o.visible = false; }
  });
  materialPreview = createMaterialPreview(meshes);
  bounds.copy(nextBounds); scene.add(root);
  lampController = new LampController(root);
  lampController.strength = Number($('lamp-strength').value);
  lampController.setMode($('lamp-mode').value, performance.now() / 1000);
  $('lamp-count').textContent = `${lampController.lamps.length} 盏`;
  for (const name of ['lamp-mode', 'lamp-strength', 'lamp-glow']) $(name).disabled = lampController.lamps.length === 0;
  const playfield = meshes.find(m => m.name === 'playfield_mesh');
  tableBounds.copy(playfield ? new THREE.Box3().setFromObject(playfield) : bounds);
  tableBounds.min.y = bounds.min.y; tableBounds.max.y = bounds.max.y;
  floor.position.copy(bounds.getCenter(new THREE.Vector3()));
  floor.position.y = bounds.min.y - Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.025, 0.01);
  floor.scale.setScalar(bounds.getSize(new THREE.Vector3()).length() * 8);
  report = { ...metadata, ...content }; glbBytes = bytes;
  const title = metadata.tableInfo?.table_name || (metadata.source || 'GLB 桌台').replace(/\.(glb|vpx)$/i, '');
  $('table-title').textContent = title;
  $('source-label').textContent = metadata.source || 'GLB 场景';
  $('mesh-count').textContent = meshes.length.toLocaleString();
  $('material-count').textContent = statsMaterials().materials.toLocaleString();
  $('texture-count').textContent = content.textures.toLocaleString();
  $('camera').replaceChildren(new Option('自由视角', ''));
  gltfCameras.forEach((c, i) => $('camera').add(new Option(c.name || `Camera ${i + 1}`, String(i))));
  $('focus').disabled = $('isolate').disabled = true;
  $('isolate').textContent = '单独查看'; $('search').value = '';
  $('selected').textContent = '近看倒角、接缝、材质和贴图清晰度。';
  $('source-lights').checked = false;
  $('source-lights').disabled = sourceLights.length === 0;
  $('empty').hidden = true;
  for (const name of ['save-glb', 'screenshot', 'report']) $(name).disabled = false;
  populateObjects(); setLighting($('lighting').value); setMode(mode); setView('table');
  gameplay = new VPXGameView(root,lampController,{physics: metadata.physics,
    onBegin:()=>{
      controls.autoRotate=false;$('rotate').checked=false;
      setView('table');
      // The legacy VPX inspector reserves wide safety margins. In the
      // player cabinet composition the table should fill the viewport.
      camera.position.lerp(controls.target,.19);
      controls.update();
    },
  });
  if(!inspectionMode)gameplay.begin();
  renderScene(); idle();
  if (metadata.warnings?.length) $('notice').textContent = `转换器报告 ${metadata.warnings.length} 条提醒，可下载报告查看。已有可玩模式，但规则和物理尚未完整移植 VPX。`;
  else $('notice').textContent = '已从本机 VPX 导入可碰撞 Wall/Target/Gate、Bumper、Trigger 和真实挡板几何；斜坡三维高度物理和完整 VBS 规则仍在移植。';;
}

async function loadDefault() {
  stopLoading(); const id = loadId;
  pendingFetch = new AbortController(); const signal = pendingFetch.signal;
  busy('读取已转换的 JP’s Space Cadet…');
  try {
    const res = await fetch('./assets/vpx-local/space-cadet.glb', { signal });
    if (!res.ok) throw new Error('尚无本地示例。请选择 .vpx 或 .glb 文件，或运行 README 中的转换命令。');
    const meta = await fetch('./assets/vpx-local/space-cadet.report.json', { signal }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const physics = await fetch('./assets/vpx-local/space-cadet.physics.json', { signal })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    if(physics)meta.physics=physics;
    const buffer = await res.arrayBuffer();
    if (id !== loadId) return;
    await showModel(buffer, meta, id);
  } catch (e) { if (id === loadId && e.name !== 'AbortError') { idle(); error(e.message); } }
}

async function openFile(file) {
  if (!file) return;
  stopLoading(); const id = loadId;
  if (!/\.(vpx|glb)$/i.test(file.name)) { error('请先解压 ZIP / 7z，打开其中的 .vpx，或选择内嵌贴图的 .glb'); return; }
  if (file.size > 512 * 1024 * 1024) { error('文件超过 512 MB，请先用桌面工具导出较小 GLB'); return; }
  busy('读取本地文件…');
  try {
    const buffer = await file.arrayBuffer();
    if (id !== loadId) return;
    if (/\.glb$/i.test(file.name)) { await showModel(buffer, { source: file.name }, id); return; }
    worker = new Worker('./vpx/convert-worker.js', { type: 'module' });
    worker.onerror = e => { if (id === loadId) { worker?.terminate(); worker = null; idle(); error(e.message || 'VPX 转换线程失败'); } };
    worker.onmessage = async ({ data }) => {
      if (id !== loadId) return;
      if (data.type === 'progress') $('progress').textContent = data.message;
      else if (data.type === 'error') { worker?.terminate(); worker = null; idle(); error(data.message); }
      else if (data.type === 'done') {
        worker?.terminate(); worker = null;
        try { await showModel(data.buffer, data.report, id); }
        catch (e) { if (id === loadId) { idle(); error(e.message); } }
      }
    };
    worker.postMessage({ name: file.name, buffer }, [buffer]);
  } catch (e) { if (id === loadId) { idle(); error(e.message); } }
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  composer?.setSize(w, h);
}

function renderScene() {
  renderer.info.reset();
  if (composer && mode === 'pbr' && $('lamp-glow').checked && lampController?.lamps.length) composer.render();
  else renderer.render(scene, camera);
}

function initialize() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d1419);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  camera = new THREE.PerspectiveCamera(36, 1, 0.001, 100);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.25, 0.9);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  camera.position.set(0, 1, 2);
  controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49; controls.autoRotateSpeed = 0.7;
  lights.hemi = new THREE.HemisphereLight(0xeaf2ff, 0x424039, 1.2);
  lights.key = new THREE.DirectionalLight(0xfff1d9, 2.3); lights.key.castShadow = true;
  lights.key.shadow.mapSize.set(2048, 2048); lights.key.shadow.bias = -0.0001;
  lights.fill = new THREE.DirectionalLight(0xbdd8ff, 0.8);
  studio.add(lights.hemi, lights.key, lights.key.target, lights.fill, lights.fill.target); scene.add(studio);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  new ResizeObserver(resize).observe(stage); resize(); setLighting($('lighting').value);
  renderer.setAnimationLoop(now => {
    gameplay?.update(now);
    controls.update(); lampController?.update(now / 1000); renderScene(); renderCount++;
    if (now - lastStats > 1000) {
      $('render-stats').textContent = `${Math.round(renderCount * 1000 / (now - lastStats))} FPS · ${(renderer.info.render.triangles / 1000).toFixed(0)}k triangles`;
      renderCount = 0; lastStats = now;
    }
  });
  $('open').onclick = $('empty-open').onclick = () => $('file').click();
  $('file').onchange = () => { openFile($('file').files[0]); $('file').value = ''; };
  $('reload').onclick = loadDefault; $('cancel').onclick = stopLoading;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('lighting').onchange = () => setLighting($('lighting').value);
  $('exposure').oninput = () => { renderer.toneMappingExposure = Number($('exposure').value); $('exposure-value').textContent = renderer.toneMappingExposure.toFixed(2); };
  $('rotate').onchange = () => { controls.autoRotate = $('rotate').checked; };
  $('wireframe').onchange = () => setMode(mode);
  $('lamp-mode').onchange = () => lampController?.setMode($('lamp-mode').value, performance.now() / 1000);
  $('lamp-strength').oninput = () => {
    if (lampController) lampController.strength = Number($('lamp-strength').value);
    $('lamp-strength-value').textContent = Number($('lamp-strength').value).toFixed(1);
  };
  $('source-lights').onchange = () => {
    sourceLights.forEach((light, i) => { light.visible = $('source-lights').checked && i < 8; });
    $('notice').textContent = $('source-lights').checked
      ? '当前叠加最多 8 盏导出灯光。VPX 与 glTF 光强单位可能不同，如过曝请关闭此项；不代表原版灯光已还原。'
      : '摄影棚照明用于检查材质；当前为静态视觉，尚未执行 VPX 脚本和玩法。';
  };
  $('camera').onchange = () => {
    if ($('camera').value === '') { setView('table'); return; }
    const src = gltfCameras[Number($('camera').value)];
    if (!src) return;
    controls.autoRotate = false; $('rotate').checked = false;
    src.updateWorldMatrix(true, false);
    src.getWorldPosition(camera.position); src.getWorldQuaternion(camera.quaternion);
    camera.fov = src.fov; camera.near = src.near; camera.far = src.far; camera.updateProjectionMatrix();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, Math.max(bounds.getSize(new THREE.Vector3()).length(), 0.1));
    controls.update();
  };
  $('search').oninput = populateObjects;
  $('objects').onchange = () => { if ($('objects').value !== '') selectObject(meshes[Number($('objects').value)]); };
  $('focus').onclick = () => { if (selected) fitBox(new THREE.Box3().setFromObject(selected)); };
  $('isolate').onclick = isolateSelected; $('fit').onclick = () => setView('table');
  canvas.ondblclick = e => {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
    const hit = raycaster.intersectObjects(meshes.filter(m => m.visible), false)[0];
    if (hit) selectObject(hit.object, true);
  };
  $('save-glb').onclick = () => saveBlob(new Blob([glbBytes], { type: 'model/gltf-binary' }), 'space-cadet.glb');
  $('report').onclick = () => saveBlob(new Blob([JSON.stringify({ ...report, viewer: { three: THREE.REVISION, mode, lighting: $('lighting').value, exposure: renderer.toneMappingExposure, sourceLights: $('source-lights').checked, lamps: lampController?.snapshot, glow: $('lamp-glow').checked } }, null, 2)], { type: 'application/json' }), 'space-cadet-report.json');
  $('screenshot').onclick = () => { renderScene(); canvas.toBlob(blob => { if (blob) saveBlob(blob, 'space-cadet-web.png'); }); };
  window.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); openFile(e.dataTransfer.files[0]); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); error('显卡上下文丢失，请刷新页面重新载入模型。'); });
  window.__vpxViewer = {
    get ready() { return !!root && $('busy').hidden; },
    get root() { return root; }, get camera() { return camera; }, get meshes() { return meshes; },
    get report() { return report; }, get mode() { return mode; },
    get lamps() { return lampController; },
    get game() { return gameplay; },
    get controls() { return controls; },
    get materialRepairs() { return materialPreview?.stats; },
    get diagnostics() { return { bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, meshes: meshes.length, ...statsMaterials(), sourceLights: sourceLights.length, cameras: gltfCameras.length }; },
    setView, setMode, selectObject, openFile, loadDefault, stopLoading,
  };
  loadDefault();
}

try { initialize(); } catch (e) { idle(); error('无法初始化 3D 预览：' + e.message); console.error(e); }
