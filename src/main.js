// First-person walk along the trail. No UI, no HUD, no objectives.
import { buildScene, TRAIL, terrainHeight } from './world.js';
import * as THREE from 'three';

const { scene, camera, renderer } = await buildScene();
window.__scene = scene; // debug hook for render harness
window.__camera = camera;
window.__renderer = renderer;
// expose THREE for debug
import * as __THREE from 'three';
window.__THREE = __THREE;

// render-harness hook (no gameplay effect)
window.__setT = v => { t = Math.min(Math.max(v, 0.0), 0.985); };

// player walks the trail spline with head-bob-free smooth motion
let t = 0.02;
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const speed = (keys['ShiftLeft'] ? 4.2 : 1.7);
  if (keys['KeyW'] || keys['ArrowUp']) t += dt * speed / 320;
  if (keys['KeyS'] || keys['ArrowDown']) t -= dt * speed / 320;
  t = THREE.MathUtils.clamp(t, 0.0, 0.985);

  const p = TRAIL.getPointAt(t);
  const ahead = TRAIL.getPointAt(Math.min(t + 0.01, 1));
  const lookT = Math.min(t + 0.025, 1);
  const look = TRAIL.getPointAt(lookT);
  camera.position.set(p.x, terrainHeight(p.x, p.z) + 1.68, p.z);
  // ease yaw toward path direction
  const targetLook = new THREE.Vector3(look.x, terrainHeight(look.x, look.z) + 1.5, look.z);
  camera.lookAt(targetLook);
  void ahead;

  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
