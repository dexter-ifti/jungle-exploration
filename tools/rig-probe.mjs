// Deep rig probe: bone parents + which axis/sign swings a child in local +Z.
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__scene, { timeout: 90000 });
await page.waitForFunction(() => window.__scene?.getObjectByName('FabQuantumCharacter') != null, { timeout: 120000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const T = window.__THREE, scene = window.__scene;
  const fab = scene.getObjectByName('FabQuantumCharacter');
  let skinned = null;
  fab.traverse(o => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) return { error: 'no skinned mesh' };
  const bones = skinned.skeleton.bones;
  const bone = n => bones.find(b => b.name === n);
  const skin = skinned.skeleton;

  // force a known orientation so world deltas == model-local deltas
  fab.position.set(0, 0, 0);
  fab.rotation.set(0, 0, 0);
  scene.updateMatrixWorld(true);

  function parents(moveBone) {
    const b = bone(moveBone);
    const chain = [];
    let cur = b;
    while (cur) { chain.push(cur.name); cur = cur.parent; }
    return chain;
  }

  function axisMov(moveBone, readBone, axis, ang) {
    const b = bone(moveBone), child = bone(readBone);
    if (!b || !child) return null;
    const rest = b.quaternion.clone();
    const e = axis === 'x' ? [ang, 0, 0] : axis === 'y' ? [0, ang, 0] : [0, 0, ang];
    const q = new T.Quaternion().setFromEuler(new T.Euler(...e));
    b.quaternion.copy(rest);
    skin.update();
    scene.updateMatrixWorld(true);
    const base = child.getWorldPosition(new T.Vector3());
    b.quaternion.copy(rest).multiply(q);
    skin.update();
    scene.updateMatrixWorld(true);
    const after = child.getWorldPosition(new T.Vector3());
    b.quaternion.copy(rest);
    skin.update();
    scene.updateMatrixWorld(true);
    return { axis, ang, dx: +(after.x - base.x).toFixed(4), dy: +(after.y - base.y).toFixed(4), dz: +(after.z - base.z).toFixed(4), d: +(Math.hypot(after.x - base.x, after.y - base.y, after.z - base.z)).toFixed(4) };
  }

  return {
    thighParents: parents('thigh_l'),
    calfParents: parents('calf_l'),
    upperarmParents: parents('upperarm_l'),
    lowerarmParents: parents('lowerarm_l'),
    pelX: axisMov('thigh_l', 'foot_l', 'x', 0.4),
    pelX_neg: axisMov('thigh_l', 'foot_l', 'x', -0.4),
    pelY: axisMov('thigh_l', 'foot_l', 'y', 0.4),
    pelZ: axisMov('thigh_l', 'foot_l', 'z', 0.4),
    calX: axisMov('calf_l', 'foot_l', 'x', 0.6),
    calX_neg: axisMov('calf_l', 'foot_l', 'x', -0.6),
    calZ: axisMov('calf_l', 'foot_l', 'z', 0.6),
    upX: axisMov('upperarm_l', 'hand_l', 'x', 0.5),
    upX_neg: axisMov('upperarm_l', 'hand_l', 'x', -0.5),
    upZ: axisMov('upperarm_l', 'hand_l', 'z', 0.5),
    loX: axisMov('lowerarm_l', 'hand_l', 'x', 0.6),
    loX_neg: axisMov('lowerarm_l', 'hand_l', 'x', -0.6),
    loZ: axisMov('lowerarm_l', 'hand_l', 'z', 0.6),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();