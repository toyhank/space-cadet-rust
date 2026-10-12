const assert = require('node:assert/strict');
(async () => {
  const T = await import('three');
  const { hasOpenEdges, createMaterialPreview } = await import('../vpx/materials.js');
  const open = new T.PlaneGeometry(1, 1), closed = new T.BoxGeometry(1, 1, 1);
  assert.equal(hasOpenEdges(open), true);
  assert.equal(hasOpenEdges(closed), false, 'UV seams on a closed solid are not open edges');
  const original = new T.MeshStandardMaterial({ transparent: true, opacity: 1 });
  const plane = new T.Mesh(open, original), cube = new T.Mesh(closed, original);
  const alphaTexture = data => new T.DataTexture(new Uint8Array(data), 1, data.length / 4);
  const cutout = new T.Mesh(open, new T.MeshStandardMaterial({ transparent: true, map: alphaTexture([255,255,255,0,255,255,255,255]) }));
  const glass = new T.Mesh(open, new T.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
  const preview = createMaterialPreview([plane, cube, cutout, glass]);
  assert.equal(plane.material.side, T.DoubleSide);
  assert.equal(cube.material.side, T.FrontSide);
  assert.equal(plane.material.transparent, false);
  assert.equal(cutout.material.transparent, false); assert.equal(cutout.material.alphaTest, 0.5);
  assert.equal(glass.material.transparent, true); assert.equal(glass.material.opacity, 0.4); assert.equal(glass.material.depthWrite, false);
  assert.equal(original.side, T.FrontSide); assert.equal(original.transparent, true, 'Source stays unmodified');
  // Geometry must remain hittable from behind after the visibility repair.
  const ray = new T.Raycaster(new T.Vector3(0, 0, -1), new T.Vector3(0, 0, 1));
  assert.ok(ray.intersectObject(plane).length > 0);
  plane.material = original; assert.equal(ray.intersectObject(plane).length, 0);
  preview.dispose();
  console.log('PASS: front/back visibility, welded closed shells, opaque/cutout/true transparency, source preservation.');
})().catch(e => { console.error(e); process.exitCode = 1; });
