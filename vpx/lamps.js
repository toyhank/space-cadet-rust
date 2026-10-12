import * as THREE from 'three';

function playfieldProjection(playfield) {
  const geometry = playfield?.geometry, position = geometry?.attributes.position, uv = geometry?.attributes.uv;
  if (!position || !uv) return null;
  const index = geometry.index;
  for (let i = 0; i + 2 < (index?.count || position.count); i += 3) {
    const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
    const p = ids.map(id => new THREE.Vector3().fromBufferAttribute(position, id));
    const t = ids.map(id => new THREE.Vector2().fromBufferAttribute(uv, id));
    const x1 = p[1].x - p[0].x, z1 = p[1].z - p[0].z;
    const x2 = p[2].x - p[0].x, z2 = p[2].z - p[0].z;
    const det = x1 * z2 - z1 * x2;
    if (Math.abs(det) < 1e-12) continue;
    const inverse = playfield.matrixWorld.clone().invert();
    return world => {
      const point = world.clone().applyMatrix4(inverse);
      const x = point.x - p[0].x, z = point.z - p[0].z;
      const a = (x * z2 - z * x2) / det, b = (z * x1 - x * z1) / det;
      return t[0].clone().addScaledVector(t[1].clone().sub(t[0]), a).addScaledVector(t[2].clone().sub(t[0]), b);
    };
  }
  return null;
}

// Runtime states use the VPX names kept in glTF extras. No VBScript is evaluated.
export class LampController {
  constructor(root) {
    this.lamps = [];
    this.mode = 'wave';
    this.enabled = true;
    this.strength = 1;
    this.startTime = 0;
    this.lastTime = null;
    this.giMasks = [];
    const metadata = new Map(), meshes = new Map();
    root.traverse(object => {
      if (object.isMesh && object.userData.is_bulb_light !== undefined && object.userData.name)
        metadata.set(object.userData.name, object.userData);
      if (object.isMesh) meshes.set(object.name, object);
    });
    const playfield = meshes.get('playfield_mesh');
    const map = [].concat(playfield?.material || []).find(mat => mat.map)?.map;
    const projectUv = playfieldProjection(playfield);
    // GI falloff areas are illumination masks, not plastic inserts. They must not
    // become opaque glowing discs; the separate source-light option controls GI.
    for (const [name, mesh] of meshes) if (/^gi\d+_insert$/i.test(name)) {
      const original = mesh.material;
      const materials = [].concat(original).map(mat => { const copy = mat.clone(); copy.transparent = true; copy.opacity = 0; copy.depthWrite = false; return copy; });
      this.giMasks.push({ mesh, original, materials });
    }
    for (const [name, data] of metadata) {
      const surfaces = [meshes.get(`${name}_insert`), meshes.get(`${name}_bulb`)].filter(Boolean);
      if (!surfaces.length) continue;
      const color = new THREE.Color(data.color2 || data.color || '#fffce0');
      const bindings = [];
      for (const mesh of surfaces) {
        const original = mesh.material;
        const originalGeometry = mesh.geometry;
        let geometry = null;
        if (data.image === 'pf' && map && projectUv && /_insert$/i.test(mesh.name)) {
          geometry = mesh.geometry.clone();
          const positions = geometry.attributes.position, coordinates = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
            const uv = projectUv(point); coordinates[i * 2] = uv.x; coordinates[i * 2 + 1] = uv.y;
          }
          geometry.setAttribute('uv', new THREE.BufferAttribute(coordinates, 2));
        }
        const materials = [].concat(original).map(source => {
          const mat = source.clone();
          if (!mat.emissive) return mat;
          mat.color.copy(color);
          mat.emissive.copy(color);
          if (geometry) { mat.map = map; mat.emissiveMap = map; }
          mat.emissiveIntensity = 0;
          mat.transparent = true;
          mat.opacity = 0;
          mat.depthWrite = false;
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = -2;
          mat.polygonOffsetUnits = -2;
          return mat;
        });
        bindings.push({ mesh, original, materials, originalGeometry, geometry });
      }
      const position = new THREE.Box3().setFromObject(surfaces[0]).getCenter(new THREE.Vector3());
      this.lamps.push({ name, color, data, bindings, position, level: 0, state: data.state ?? data.state_u32 ?? 0 });
    }
    this.lamps.sort((a, b) => a.position.z - b.position.z || a.name.localeCompare(b.name));
    this.byName = new Map(this.lamps.map(lamp => [lamp.name.toLowerCase(), lamp]));
    this.zMin = Math.min(...this.lamps.map(lamp => lamp.position.z));
    this.zMax = Math.max(...this.lamps.map(lamp => lamp.position.z));
    this.setEnabled(true);
  }

  setEnabled(enabled, wireframe = false) {
    this.enabled = enabled;
    if (enabled) {
      for (const lamp of this.lamps) for (const binding of lamp.bindings) {
        binding.mesh.material = Array.isArray(binding.original) ? binding.materials : binding.materials[0];
        if (binding.geometry) binding.mesh.geometry = binding.geometry;
        binding.materials.forEach(mat => { mat.wireframe = wireframe; });
      }
      for (const binding of this.giMasks)
        binding.mesh.material = Array.isArray(binding.original) ? binding.materials : binding.materials[0];
    }
  }

  setMode(mode, now = 0) {
    if (!['wave', 'all', 'off', 'saved', 'manual'].includes(mode)) throw new Error('Unknown lamp mode: ' + mode);
    this.mode = mode; this.startTime = now; this.lastTime = null;
    this.update(now, true);
  }

  // Future gameplay can drive an individual lamp: 0 = off, 1 = on, 2 = blinking.
  setState(name, state, color) {
    const lamp = this.byName.get(name.toLowerCase());
    if (!lamp) return false;
    if (![0, 1, 2].includes(state)) throw new Error('Lamp state must be 0, 1 or 2');
    lamp.state = state;
    if (color) {
      lamp.color.set(color);
      for (const binding of lamp.bindings) for (const mat of binding.materials) {
        mat.color.copy(lamp.color); mat.emissive?.copy(lamp.color);
      }
    }
    this.mode = 'manual';
    return true;
  }

  target(lamp, elapsed) {
    if (this.mode === 'off') return 0;
    if (this.mode === 'all') return 1;
    if (this.mode === 'wave') {
      const z = (lamp.position.z - this.zMin) / Math.max(this.zMax - this.zMin, 0.001);
      const phase = (elapsed % 3.6) / 3.6;
      // A soft travelling band reveals inserts without flashing the entire table.
      const distance = Math.abs(((z - phase + 1.5) % 1) - 0.5);
      return Math.max(0, 1 - distance / 0.16);
    }
    const state = this.mode === 'saved' ? (lamp.data.state ?? lamp.data.state_u32 ?? 0) : lamp.state;
    if (state === 2) {
      const pattern = String(lamp.data.blink_pattern || '10');
      const interval = Math.max(0.03, (lamp.data.blink_interval || 125) / 1000);
      return pattern[Math.floor(elapsed / interval) % pattern.length] === '1' ? 1 : 0;
    }
    return state === 1 ? 1 : 0;
  }

  update(now, immediate = false) {
    const elapsed = Math.max(0, now - this.startTime);
    const dt = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const fade = immediate ? 1 : 1 - Math.exp(-dt * 16);
    for (const lamp of this.lamps) {
      lamp.level += (this.target(lamp, elapsed) - lamp.level) * fade;
      const sourceStrength = THREE.MathUtils.clamp(Math.sqrt((lamp.data.intensity || 80) / 80), 0.5, 1.8);
      for (const binding of lamp.bindings) for (const mat of binding.materials) {
        if (!mat.emissive) continue;
        mat.emissiveIntensity = lamp.level * 4 * this.strength * sourceStrength;
        mat.opacity = lamp.level > 0.005 ? 0.85 * lamp.level : 0;
      }
    }
  }

  get snapshot() {
    return { mode: this.mode, enabled: this.enabled, total: this.lamps.length,
      lit: this.lamps.filter(lamp => lamp.level > 0.05).length,
      levels: this.lamps.map(lamp => ({ name: lamp.name, level: lamp.level })) };
  }

  dispose() {
    for (const lamp of this.lamps) for (const binding of lamp.bindings) {
      binding.mesh.material = binding.original;
      binding.mesh.geometry = binding.originalGeometry;
      binding.geometry?.dispose();
      binding.materials.forEach(mat => mat.dispose());
    }
    for (const binding of this.giMasks) {
      binding.mesh.material = binding.original;
      binding.materials.forEach(mat => mat.dispose());
    }
    this.lamps = []; this.byName.clear();
  }
}
