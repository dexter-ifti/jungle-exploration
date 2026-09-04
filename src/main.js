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

// HUD: start at full opacity, fade to barely-visible after 6s, hide
// entirely on first keypress so it doesn't compete with the view.
const hud = document.getElementById('hud');
if (hud) {
  setTimeout(() => hud.classList.add('fade'), 6000);
  const dismiss = () => { hud.classList.add('gone'); };
  addEventListener('keydown', dismiss, { once: true });
  addEventListener('mousedown', dismiss, { once: true });
}

// player walks the trail spline with organic humanoid motion:
// - continuous velocity acceleration & momentum deceleration
// - full lateral strafe & roaming across the path (non-springy)
// - mouse look (pointer lock + drag) and arrow key turning
// - human gait biomechanics: smooth double-harmonic vertical bob,
//   single-harmonic lateral hip sway, head roll banking, heel-strike pitch dip
// - living idle motion (breathing & relaxed postural sway)
let t = 0.02;
let strafe = 0;              // lateral offset perpendicular to the path (metres)
let strafeVel = 0;           // lateral velocity (metres per second)
const STRAFE_MAX = 5.5;      // walkable trail corridor width
const STRAFE_SPEED_WALK = 2.4;
const STRAFE_SPEED_RUN = 4.0;

// velocity along the trail (t per second), with smooth accel/decel
let trailVel = 0;            // t-units per second (positive = forward)
const TRAIL_MAX_WALK = 0.0042; // ~1.3 m/s on a 320m world
const TRAIL_MAX_RUN  = 0.010;  // ~3.2 m/s
const TRAIL_ACCEL = 0.007;
const TRAIL_DECEL = 0.012;

let smoothSpeed = 0;         // smoothed ground speed in m/s for gait transitions
let stepPhase = 0;           // gait cycle: 0..2*PI (one full stride = 2 steps)
let lastStepHalf = 0;        // 0 = left step, 1 = right step

// Free-look camera controls (yaw & pitch offsets relative to trail tangent)
let lookYaw = 0;
let lookPitch = 0;
let lastLookInputTime = 0;
let isPointerLocked = false;
let isDragging = false;
let prevMouseX = 0;
let prevMouseY = 0;

// Pointer lock for immersive first-person look on click
renderer.domElement.addEventListener('click', () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
});

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = (document.pointerLockElement === renderer.domElement);
});

// Mouse look: supports both pointer-lock and drag
addEventListener('mousemove', e => {
  if (isPointerLocked) {
    lookYaw -= e.movementX * 0.0022;
    lookPitch -= e.movementY * 0.0022;
    lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI * 0.42, Math.PI * 0.42);
    lastLookInputTime = performance.now();
  } else if (isDragging) {
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    lookYaw -= dx * 0.003;
    lookPitch -= dy * 0.003;
    lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI * 0.42, Math.PI * 0.42);
    lastLookInputTime = performance.now();
  }
});

addEventListener('mousedown', e => {
  if (e.button === 0 && !isPointerLocked) {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }
});

addEventListener('mouseup', () => {
  isDragging = false;
});

const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

// render-harness hook (no gameplay effect) — resets state for deterministic renders
window.__setT = v => {
  t = ((v % 1) + 1) % 1;
  trailVel = 0;
  strafe = 0;
  strafeVel = 0;
  smoothSpeed = 0;
  stepPhase = 0;
  lookYaw = 0;
  lookPitch = 0;
};

const clock = new THREE.Clock();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
let camY = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // System 3: animate lighting / atmosphere
  lighting.update(clock.elapsedTime, dt);
  // System 5: animate water (splash particles, pool texture)
  water.update(clock.elapsedTime, dt);
  // System 6: update sound (spatial volumes based on player t)
  if (sound) sound.update(t, dt);

  // -------- keyboard input --------
  const wantFwd = keys['KeyW'] ? 1 : 0;
  const wantBack = keys['KeyS'] ? 1 : 0;
  const wantStrafeL = keys['KeyA'] ? 1 : 0;
  const wantStrafeR = keys['KeyD'] ? 1 : 0;
  const running = !!(keys['ShiftLeft'] || keys['ShiftRight']);

  // Keyboard camera turning (Arrow keys or Q/E)
  const turnSpeed = 1.8;
  if (keys['ArrowLeft'] || keys['KeyQ']) {
    lookYaw += turnSpeed * dt;
    lastLookInputTime = performance.now();
  }
  if (keys['ArrowRight'] || keys['KeyE']) {
    lookYaw -= turnSpeed * dt;
    lastLookInputTime = performance.now();
  }
  if (keys['ArrowUp']) {
    lookPitch += turnSpeed * dt * 0.6;
    lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI * 0.42, Math.PI * 0.42);
    lastLookInputTime = performance.now();
  }
  if (keys['ArrowDown']) {
    lookPitch -= turnSpeed * dt * 0.6;
    lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI * 0.42, Math.PI * 0.42);
    lastLookInputTime = performance.now();
  }

  // Gentle auto-recenter when moving forward without active look input
  if (wantFwd && performance.now() - lastLookInputTime > 2000) {
    lookYaw = THREE.MathUtils.damp(lookYaw, 0, 1.2, dt);
    lookPitch = THREE.MathUtils.damp(lookPitch, 0, 1.5, dt);
  }

  // -------- forward/backward trail motion --------
  const maxV = running ? TRAIL_MAX_RUN : TRAIL_MAX_WALK;
  const dir = wantFwd - wantBack;
  const targetVel = dir * maxV;

  if (targetVel !== 0) {
    const sign = Math.sign(targetVel - trailVel);
    trailVel += sign * TRAIL_ACCEL * dt;
  } else {
    if (trailVel > 0) trailVel = Math.max(0, trailVel - TRAIL_DECEL * dt);
    else if (trailVel < 0) trailVel = Math.min(0, trailVel + TRAIL_DECEL * dt);
  }
  trailVel = THREE.MathUtils.clamp(trailVel, -maxV, maxV);

  // -------- lateral strafe motion (persistent, non-springy) --------
  const wantStrafe = wantStrafeR - wantStrafeL;
  const maxStrafeV = running ? STRAFE_SPEED_RUN : STRAFE_SPEED_WALK;
  const targetStrafeVel = wantStrafe * maxStrafeV;
  const strafeRate = wantStrafe !== 0 ? 10.0 : 12.0;

  strafeVel = THREE.MathUtils.damp(strafeVel, targetStrafeVel, strafeRate, dt);
  strafe += strafeVel * dt;

  // Soft boundary constraint so player doesn't clip into world boundary
  if (Math.abs(strafe) > STRAFE_MAX) {
    const excess = Math.abs(strafe) - STRAFE_MAX;
    strafe -= Math.sign(strafe) * excess * Math.min(1.0, dt * 6.0);
    strafeVel *= 0.7;
  }

  // -------- advance t along closed trail --------
  t = ((t + trailVel * dt + 1) % 1 + 1) % 1;

  // -------- compute position & orientation along trail --------
  const p = TRAIL.getPointAt(t);
  const lookAhead = 0.012 + Math.abs(trailVel) * 1.4;
  const lookT = t + Math.sign(trailVel || 0.001) * lookAhead;
  const look = TRAIL.getPointAt(((lookT % 1) + 1) % 1);

  _forward.set(look.x - p.x, 0, look.z - p.z).normalize();
  _right.crossVectors(_forward, _up).normalize();

  const sx = p.x + _right.x * strafe;
  const sz = p.z + _right.z * strafe;
  const groundY = terrainHeight(sx, sz);

  // -------- realistic humanoid gait & head motion --------
  const speedMps = Math.abs(trailVel) * 320 + Math.abs(strafeVel);
  smoothSpeed = THREE.MathUtils.damp(smoothSpeed, speedMps, 7.0, dt);

  // Step frequency (Hz): ~1.6Hz walk, ~2.5Hz run
  const stepHz = 1.4 + Math.min(smoothSpeed / 2.2, 1.0) * 1.0;
  if (smoothSpeed > 0.08) {
    stepPhase += dt * stepHz * Math.PI * 2;
    if (stepPhase > Math.PI * 2) stepPhase -= Math.PI * 2;
  }

  // Double-harmonic smooth vertical head bob (inverted pendulum)
  const bobFactor = Math.min(smoothSpeed / 1.3, 2.4);
  const bobAmp = 0.024 + bobFactor * 0.032;
  const bobWave = (1.0 - Math.cos(stepPhase * 2.0)) * 0.5;
  const headBob = bobWave * bobAmp;

  // Single-harmonic lateral hip sway (one cycle per stride: left on step 1, right on step 2)
  const swayAmp = 0.014 + bobFactor * 0.020;
  const swayWave = Math.sin(stepPhase);
  const headSway = swayWave * swayAmp;

  // Natural head roll (cervical balance compensation + banking into turns/strafe)
  const rollFromSway = -swayWave * (0.010 + bobFactor * 0.012);
  const rollFromStrafe = -(strafeVel / (running ? STRAFE_SPEED_RUN : STRAFE_SPEED_WALK)) * 0.020;
  const headRoll = rollFromSway + rollFromStrafe;

  // Subtle nodding pitch dip on heel strike
  const pitchDip = Math.sin(stepPhase * 2.0) * (0.003 + bobFactor * 0.007);

  // Organic idle motion when resting (breathing and gentle weight shifts)
  const idleWeight = Math.max(0, 1.0 - smoothSpeed / 0.4);
  const breatheY = Math.sin(clock.elapsedTime * 1.6) * 0.009 * idleWeight;
  const idleSwayX = Math.sin(clock.elapsedTime * 0.8) * 0.005 * idleWeight;
  const idlePitch = Math.sin(clock.elapsedTime * 1.6) * 0.003 * idleWeight;

  const totalSwayX = _right.x * (headSway + idleSwayX);
  const totalSwayZ = _right.z * (headSway + idleSwayX);

  // Camera height with smooth ground following (damps terrain mesh polygon seams)
  const targetCamY = groundY + 1.68 + headBob + breatheY;
  if (camY === 0) camY = targetCamY;
  else camY = THREE.MathUtils.damp(camY, targetCamY, 15.0, dt);

  camera.position.set(sx + totalSwayX, camY, sz + totalSwayZ);

  // Base look direction facing forward along the trail
  const targetLook = new THREE.Vector3(
    look.x + totalSwayX,
    terrainHeight(look.x, look.z) + 1.5,
    look.z + totalSwayZ
  );
  camera.lookAt(targetLook);

  // Apply free-look yaw/pitch and head roll on top
  camera.rotateOnWorldAxis(_up, lookYaw);
  camera.rotateX(lookPitch + pitchDip + idlePitch);
  camera.rotateZ(headRoll);

  // -------- footstep audio triggering on actual footfalls --------
  if (sound && smoothSpeed > 0.3) {
    const currentHalf = Math.floor((stepPhase / Math.PI) % 2);
    if (currentHalf !== lastStepHalf && (clock.elapsedTime - (sound._lastStepT || 0) > 0.24)) {
      sound.step(running ? 'run' : 'walk');
      sound._lastStepT = clock.elapsedTime;
      lastStepHalf = currentHalf;
    }
  }

  // System 7: render through post-processing composer
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
