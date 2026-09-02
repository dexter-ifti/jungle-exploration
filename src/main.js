// First-person walk along the trail. No UI, no HUD, no objectives.
import { buildScene, TRAIL, terrainHeight } from './world.js';
import * as THREE from 'three';

const { scene, camera, renderer, lighting, water, postprocess } = await buildScene();
window.__scene = scene; // debug hook for render harness
window.__camera = camera;
window.__renderer = renderer;
// expose THREE for debug
import * as __THREE from 'three';
window.__THREE = __THREE;
// System 6: procedural sound (needs a user gesture to start; clicks
// anywhere on the page will start the audio context)
let sound = null;
import('./sound.js').then(mod => {
  sound = new mod.JungleSound(camera);
  const start = () => {
    sound.start();
    removeEventListener('click', start);
    removeEventListener('keydown', start);
  };
  addEventListener('click', start);
  addEventListener('keydown', start);
});

// render-harness hook (no gameplay effect) — t wraps mod 1 since
// the trail is now a closed loop
window.__setT = v => { t = ((v % 1) + 1) % 1; };

// HUD: start at full opacity, fade to barely-visible after 6s, hide
// entirely on first keypress so it doesn't compete with the view.
const hud = document.getElementById('hud');
if (hud) {
  setTimeout(() => hud.classList.add('fade'), 6000);
  const dismiss = () => { hud.classList.add('gone'); };
  addEventListener('keydown', dismiss, { once: true });
  addEventListener('mousedown', dismiss, { once: true });
}

// player walks the trail spline with head-bob-free smooth motion
let t = 0.02;
let strafe = 0;          // lateral offset perpendicular to the path, in metres
const STRAFE_MAX = 4.0;  // clip so the player can't run off the side of the trail
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

const clock = new THREE.Clock();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  // System 3: animate lighting / atmosphere
  lighting.update(clock.elapsedTime, dt);
  // System 5: animate water (splash particles, pool texture)
  water.update(clock.elapsedTime, dt);
  // System 6: update sound (spatial volumes based on player t)
  if (sound) sound.update(t, dt);
  const speed = (keys['ShiftLeft'] ? 4.2 : 1.7);
  if (keys['KeyW'] || keys['ArrowUp']) t += dt * speed / 320;
  if (keys['KeyS'] || keys['ArrowDown']) t -= dt * speed / 320;
  // Closed loop: t wraps mod 1 so the player can walk all the way
  // around the circuit and end up at the same point. Walking in
  // either direction brings you to the falls (t=0.5) at some point.
  t = ((t % 1) + 1) % 1;
  // lateral movement (A/D or Left/Right) — strafe perpendicular to the
  // current path direction. Decays toward 0 so the player doesn't drift
  // off and forget where they are.
  const strafeSpeed = 3.2;
  if (keys['KeyA'] || keys['ArrowLeft'])  strafe -= dt * strafeSpeed;
  if (keys['KeyD'] || keys['ArrowRight']) strafe += dt * strafeSpeed;
  // soft pull back toward the trail centre so the player doesn't end up
  // permanently off the path. 25%/s decay.
  strafe = THREE.MathUtils.clamp(strafe, -STRAFE_MAX, STRAFE_MAX);
  strafe -= strafe * Math.min(1, dt * 0.25);

  const p = TRAIL.getPointAt(t);
  const ahead = TRAIL.getPointAt(t + 0.01);
  const lookT = t + 0.025;
  const look = TRAIL.getPointAt(lookT);
  // forward direction in the xz plane (ignore y), then right = forward x up
  _forward.set(look.x - p.x, 0, look.z - p.z).normalize();
  _right.crossVectors(_forward, _up).normalize();
  // apply strafe offset
  const sx = p.x + _right.x * strafe;
  const sz = p.z + _right.z * strafe;
  camera.position.set(sx, terrainHeight(sx, sz) + 1.68, sz);
  // ease yaw toward path direction (uses the un-strafed forward so
  // the camera always faces along the trail, not the offset)
  const targetLook = new THREE.Vector3(look.x, terrainHeight(look.x, look.z) + 1.5, look.z);
  camera.lookAt(targetLook);
  void ahead;

  // System 7: render through the post-processing composer.
  // Pass the visible sun disk's world position (the bright sphere that
  // the screen-space god rays need to project from) rather than the
  // directional light's nominal position.
  const sunWorldPos = (lighting && lighting.sunDisk)
    ? lighting.sunDisk.position.clone()
    : new THREE.Vector3(-50, 130, -30);
  postprocess.render(clock.elapsedTime, sunWorldPos);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postprocess.setSize(innerWidth, innerHeight);
});
