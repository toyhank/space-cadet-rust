import * as THREE from 'three';

// Weld UV seams by position when looking for open edges. Imported parts often
// have separate vertices at each face, so raw index pairs cannot identify a shell.
export function hasOpenEdges(geometry) {
  const positions = geometry.attributes.position;
  if (!positions || positions.count < 3) return false;
  geometry.computeBoundingBox();
  const epsilon = Math.max(geometry.boundingBox.getSize(new THREE.Vector3()).length() * 1e-6, 1e-10);
  const vertices = Array.from({ length: positions.count }, (_, i) =>
    [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => Math.round(v / epsilon)).join(','));
  const edges = new Map(), index = geometry.index;
  for (let i = 0; i + 2 < (index?.count || positions.count); i += 3) {
    const face = [0, 1, 2].map(k => vertices[index ? index.getX(i + k) : i + k]);
    if (new Set(face).size < 3) continue;
    for (let k = 0; k < 3; k++) {
      const a = face[k], b = face[(k + 1) % 3], key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return [...edges.values()].some(count => count === 1);
}

export function imageAlpha(image) {
  if (!image?.width || !image?.height) return 'unknown';
  let data = image.data;
  if (!data) {
    try {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(image.width, image.height) : document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      data = context.getImageData(0, 0, image.width, image.height).data;
    } catch { return 'unknown'; }
  }
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== image.width * image.height * 4) return 'unknown';
  let holes = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0 && data[i] < 255) return 'blend';
    if (data[i] === 0) holes = true;
  }
  return holes ? 'cutout' : 'opaque';
}

export function createMaterialPreview(meshes) {
  const materials = new Set(), assignments = new Map(), geometries = new WeakMap(), alpha = new WeakMap();
  const cache = new Map();
  const stats = { doubleSided: 0, opaque: 0, cutout: 0, transparent: 0 };
  for (const mesh of meshes) {
    let open = geometries.get(mesh.geometry);
    if (open === undefined) { open = hasOpenEdges(mesh.geometry); geometries.set(mesh.geometry, open); }
    mesh.userData.viewerOpenSurface = open;
    const originals = [].concat(mesh.material);
    mesh.userData.viewerBackfaceRepair = open && originals.some(mat => mat.side !== THREE.DoubleSide);
    const mapped = originals.map(original => {
      const key = `${original.uuid}:${open}`;
      if (cache.has(key)) return cache.get(key);
      const mat = original.clone();
      if (open && mat.side !== THREE.DoubleSide) {
        mat.side = THREE.DoubleSide; stats.doubleSided++;
      }
      if (mat.transparent && !(mat.transmission > 0)) {
        let kind = 'opaque';
        if (mat.map) {
          const image = mat.map.image;
          kind = image && alpha.get(image);
          if (!kind) { kind = imageAlpha(image); if (image) alpha.set(image, kind); }
        }
        if (mat.opacity >= 0.998 && !mat.alphaMap && kind === 'opaque') {
          mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; stats.opaque++;
        } else if (mat.opacity >= 0.998 && !mat.alphaMap && kind === 'cutout') {
          mat.transparent = false; mat.opacity = 1; mat.alphaTest = Math.max(mat.alphaTest, 0.5);
          mat.depthWrite = true; stats.cutout++;
        } else {
          // Transparent surfaces blend with what's behind them, without masking
          // later transparent surfaces through an invisible depth write.
          mat.depthWrite = false; stats.transparent++;
        }
      }
      cache.set(key, mat); materials.add(mat);
      return mat;
    });
    const material = Array.isArray(mesh.material) ? mapped : mapped[0];
    assignments.set(mesh, material); mesh.material = material;
    mesh.castShadow = mapped.every(mat => !mat.transparent && !(mat.transmission > 0));
  }
  return { assignments, stats, dispose() { materials.forEach(mat => mat.dispose()); } };
}
