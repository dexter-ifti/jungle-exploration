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

// player walks the trail spline. Realistic human motion:
// - smooth velocity acceleration/deceleration (not instant)
// - vertical head bob (1.7Hz walk, 2.5Hz run)
// - lateral hip sway
// - head leads body slightly when starting
let t = 0.02;
let strafe = 0;          // lateral offset perpendicular to the path, in metres
const STRAFE_MAX = 4.0;  // clip so the player can't run off the side of the trail
// velocity along the trail (t per second), with smooth accel/decel
let trailVel = 0;       // t-units per second (positive = forward)
const TRAIL_MAX_WALK = 0.0042;   // ~1.3 m/s on a 320m world
const TRAIL_MAX_RUN  = 0.010;     // ~3.2 m/s
const TRAIL_ACCEL = 0.006;        // how fast vel reaches max
const TRAIL_DECEL = 0.012;        // how fast vel drops to 0 (faster stop)
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

// step phase: increments by 2*PI per second when moving. Drives the
// vertical bob and lateral sway. At walk speed (1.7Hz) the cycle is
// ~0.6s. Bob amplitude scales with speed.
let stepPhase = 0;

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

  // -------- input → desired velocity (target) --------
  const wantFwd = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
  const wantBack = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
  const wantStrafeL = (keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0;
  const wantStrafeR = (keys['KeyD'] || keys['ArrowRight']) ? 1 : 0;
  const running = !!keys['ShiftLeft'];

  // target trail velocity (t-units/s)
  const maxV = running ? TRAIL_MAX_RUN : TRAIL_MAX_WALK;
  const dir = wantFwd - wantBack;
  const targetVel = dir * maxV;

  // -------- smooth accel/decel of trail velocity --------
  // accelerate when input present, decelerate (faster) when not
  if (targetVel !== 0) {
    // ramping up
    const sign = Math.sign(targetVel - trailVel);
    if (sign > 0) trailVel += TRAIL_ACCEL * dt;
    else if (sign < 0) trailVel -= TRAIL_ACCEL * dt;
  } else {
    // ramping down toward 0
    if (trailVel > 0) {
      trailVel = Math.max(0, trailVel - TRAIL_DECEL * dt);
    } else if (trailVel < 0) {
      trailVel = Math.min(0, trailVel + TRAIL_DECEL * dt);
    }
  }
  // clamp to max
  trailVel = Math.max(-maxV, Math.min(maxV, trailVel));

  // -------- strafe with same accel/decel model --------
  const strafeMax = running ? 4.0 : 2.4;
  const strafeAccel = 6.0;
  let strafeTarget = (wantStrafeR - wantStrafeL) * strafeMax;
  // pull-back-to-centre when no strafe input
  if (strafeTarget === 0) strafeTarget = -strafe * 0.4;  // gentle spring-back
  // spring toward target
  strafe += (strafeTarget - strafe) * Math.min(1, dt * strafeAccel);
  strafe = THREE.MathUtils.clamp(strafe, -STRAFE_MAX, STRAFE_MAX);

  // -------- advance t by velocity (closed loop) --------
  t = ((t + trailVel * dt + 1) % 1 + 1) % 1;

  // -------- compute body position along the trail --------
  const p = TRAIL.getPointAt(t);
  // look ahead a small distance for the camera direction. The look-ahead
  // is slightly larger when moving faster (head leads body more at speed).
  const lookAhead = 0.012 + Math.abs(trailVel) * 1.4;
  const lookT = t + Math.sign(trailVel || 0.001) * lookAhead;
  const look = TRAIL.getPointAt(((lookT % 1) + 1) % 1);

  // forward direction in the xz plane (ignore y), then right = forward x up
  _forward.set(look.x - p.x, 0, look.z - p.z).normalize();
  _right.crossVectors(_forward, _up).normalize();
  // apply strafe offset
  const sx = p.x + _right.x * strafe;
  const sz = p.z + _right.z * strafe;
  const groundY = terrainHeight(sx, sz);

  // -------- body bob & sway (only when actually moving) --------
  // speed (m/s) for the bob frequency: walk ~1.3, run ~3.2
  const speedAbs = Math.abs(trailVel) * 320;  // convert t-vel to approx m/s
  // step frequency scales with speed (1.7Hz walk, 2.5Hz run)
  const stepHz = 1.5 + Math.min(speedAbs / 1.5, 1.0) * 0.9;
  stepPhase += dt * stepHz * Math.PI * 2;
  if (stepPhase > Math.PI * 2) stepPhase -= Math.PI * 2;
  // bob amplitude: 4cm at walk, 9cm at run
  const bobAmp = (Math.min(speedAbs, 3.2) / 1.3) * 0.04 + 0.02;
  const headBob = Math.abs(Math.sin(stepPhase)) * bobAmp;
  // lateral sway: 1.5cm at walk, 2.5cm at run
  const swayAmp = (Math.min(speedAbs, 3.2) / 1.3) * 0.015 + 0.01;
  // sway is twice the step freq (each step shifts weight to other side)
  const headSway = Math.sin(stepPhase * 2) * swayAmp;
  // sway is along the right vector (lateral shift)
  const swayX = _right.x * headSway;
  const swayZ = _right.z * headSway;

  // -------- camera position --------
  // eye height 1.68m, plus bob
  camera.position.set(sx + swayX, groundY + 1.68 + headBob, sz + swayZ);
  // camera look: same look point but slightly down when bobbed (head
  // bobs down so the eye line tilts down briefly)
  const eyeDrop = headBob * 0.3;  // small downward tilt on each down-step
  const targetLook = new THREE.Vector3(
    look.x + swayX,
    terrainHeight(look.x, look.z) + 1.5 - eyeDrop,
    look.z + swayZ
  );
  camera.lookAt(targetLook);

  // -------- trigger footstep sounds on each step --------
  // detect the moment the step phase crosses PI (i.e. each footfall)
  if (sound && speedAbs > 0.2) {
    if (Math.sin(stepPhase) < -0.95 && (sound._lastStepT === undefined || clock.elapsedTime - sound._lastStepT > 0.3)) {
      sound.step(running ? 'run' : 'walk');
      sound._lastStepT = clock.elapsedTime;
    }
  }

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
