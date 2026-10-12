const assert = require('node:assert/strict');
(async () => {
  const THREE = await import('three');
  const { LampController } = await import('../vpx/lamps.js');
  const root = new THREE.Group(), original = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const texture = new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2);
  const playfield = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texture }));
  playfield.name = 'playfield_mesh'; root.add(playfield);
  const inserts = [], originalGeometry = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03).rotateX(-Math.PI / 2), original);
    mesh.name = `li00${i + 1}_insert`; mesh.position.z = i / 3;
    mesh.userData = { name: `li00${i + 1}`, is_bulb_light: true, color2: '#00aaff', state_u32: 0,
      blink_pattern: '10', blink_interval: 125, intensity: 80, image: 'pf' };
    root.add(mesh);
    inserts.push(mesh); originalGeometry.push(mesh.geometry);
  }
  root.updateMatrixWorld(true);
  const lamps = new LampController(root);
  assert.equal(lamps.lamps.length, 4);
  lamps.setMode('all');
  assert.equal(lamps.snapshot.lit, 4);
  assert.ok(lamps.lamps[0].bindings[0].materials[0].emissiveIntensity > 1);
  assert.equal(inserts[0].material.emissiveMap, texture, 'Actual playfield art supplies lamp colors');
  for (let i = 0; i < 4; i++) {
    const uv = inserts[i].geometry.attributes.uv, p = inserts[i].geometry.attributes.position;
    for (let vertex = 0; vertex < uv.count; vertex++) {
      assert.ok(Math.abs(uv.getX(vertex) - (p.getX(vertex) + 1) / 2) < 1e-6);
      assert.ok(Math.abs(uv.getY(vertex) - (1 - p.getZ(vertex) - inserts[i].position.z) / 2) < 1e-6);
    }
  }
  assert.equal(original.emissiveIntensity, 1, 'Original GLB material stays intact');
  lamps.setMode('off');
  assert.equal(lamps.snapshot.lit, 0);
  assert.equal(inserts[0].material.opacity, 0, 'Off inserts stop covering playfield');
  lamps.setMode('saved'); assert.equal(lamps.snapshot.lit, 0);
  lamps.setState('LI001', 2); lamps.update(0, true);
  assert.equal(lamps.snapshot.levels[0].level, 1);
  lamps.update(0.13, true); assert.equal(lamps.snapshot.levels[0].level, 0);
  assert.equal(lamps.setState('missing', 1), false);
  lamps.setMode('wave', 0); const first = lamps.snapshot.levels.map(l => l.level);
  lamps.update(1.2, true); assert.notDeepEqual(lamps.snapshot.levels.map(l => l.level), first);
  lamps.dispose(); assert.ok(inserts.every(m => m.material === original));
  assert.ok(inserts.every((m, i) => m.geometry === originalGeometry[i]));
  console.log('PASS: lamp on/off, blinking, travelling pattern, playfield UV projection, material preservation and disposal.');
})().catch(e => { console.error(e); process.exitCode = 1; });
