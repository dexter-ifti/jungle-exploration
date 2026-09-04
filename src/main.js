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

// System 6: procedural sound (needs a user gesture to start; clicks,
// keypresses, or mobile touches anywhere on the page will start audio)
let sound = null;
import('./sound.js').then(mod => {
  sound = new mod.JungleSound(camera);
  const start = () => {
    sound.start();
    removeEventListener('click', start);
    removeEventListener('keydown', start);
    removeEventListener('touchstart', start);
  };
  addEventListener('click', start);
  addEventListener('keydown', start);
  addEventListener('touchstart', start, { passive: true });
});

// Mobile vs Desktop input detection & HUD setup
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const hudDesktop = document.getElementById('hud-desktop');
const hudMobile = document.getElementById('hud-mobile');
const mobileHints = document.getElementById('mobile-hints');

if (isTouchDevice) {
  if (hudDesktop) hudDesktop.style.display = 'none';
  if (hudMobile) hudMobile.style.display = 'block';
  if (mobileHints) mobileHints.style.display = 'flex';
}

// HUD: start at full opacity, fade to barely-visible after 6s, hide
// entirely on first user interaction so it doesn't compete with the view.
const hud = document.getElementById('hud');
if (hud) {
  setTimeout(() => hud.classList.add('fade'), 6000);
  const dismiss = () => {
    hud.classList.add('gone');
    if (mobileHints) mobileHints.classList.add('gone');
  };
  addEventListener('keydown', dismiss, { once: true });
  addEventListener('mousedown', dismiss, { once: true });
  addEventListener('touchstart', dismiss, { once: true, passive: true });
}

// player walks the trail spline with organic humanoid motion:
// - continuous velocity acceleration & momentum deceleration
// - full lateral strafe & roaming across the path (non-springy)
// - mouse look (pointer lock + drag) and arrow key turning (PC)
// - dynamic virtual thumbstick and smooth touch-swipe look (Mobile)
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

// Pointer lock for immersive first-person look on click (desktop)
renderer.domElement.addEventListener('click', () => {
  if (!isTouchDevice && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
});

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = (document.pointerLockElement === renderer.domElement);
});

// Desktop mouse look: supports both pointer-lock and drag
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

// Desktop keyboard controls
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);

// ---------- Mobile Touch Controls ----------
// Dual-zone touch system:
// Left half of screen = dynamic virtual joystick (walk / strafe / sprint)
// Right half of screen = touch drag camera look (yaw & pitch)
let moveTouchId = null;
let lookTouchId = null;
const moveOrigin = { x: 0, y: 0 };
const moveVec = { x: 0, y: 0 }; // x: strafe (-1..1), y: forward/back (-1..1)
let moveIsRunning = false;
let prevTouchLookX = 0;
let prevTouchLookY = 0;

const joystickEl = document.getElementById('touch-joystick');
const knobEl = document.getElementById('touch-knob');
const JOYSTICK_MAX_RADIUS = 46; // maximum joystick handle travel in px

addEventListener('touchstart', e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const halfWidth = window.innerWidth * 0.5;

    // Left half: movement joystick
    if (touch.clientX < halfWidth) {
      if (moveTouchId === null) {
        moveTouchId = touch.identifier;
        moveOrigin.x = touch.clientX;
        moveOrigin.y = touch.clientY;
        moveVec.x = 0;
        moveVec.y = 0;
        moveIsRunning = false;
        if (joystickEl && knobEl) {
          joystickEl.style.left = `${touch.clientX}px`;
          joystickEl.style.top = `${touch.clientY}px`;
          joystickEl.style.display = 'block';
          knobEl.style.transform = `translate(0px, 0px)`;
        }
      }
    } else {
      // Right half: camera look
      if (lookTouchId === null) {
        lookTouchId = touch.identifier;
        prevTouchLookX = touch.clientX;
        prevTouchLookY = touch.clientY;
      }
    }
  }
}, { passive: false });

addEventListener('touchmove', e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];

    if (touch.identifier === moveTouchId) {
      const dx = touch.clientX - moveOrigin.x;
      const dy = touch.clientY - moveOrigin.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      if (knobEl) {
        knobEl.style.transform = `translate(${kx}px, ${ky}px)`;
      }

      const normDist = clampedDist / JOYSTICK_MAX_RADIUS;
      // dx > 0 = strafe right (+x), dy < 0 = forward (+y)
      moveVec.x = kx / JOYSTICK_MAX_RADIUS;
      moveVec.y = -ky / JOYSTICK_MAX_RADIUS;
      moveIsRunning = (normDist > 0.82);
    } else if (touch.identifier === lookTouchId) {
      const dx = touch.clientX - prevTouchLookX;
      const dy = touch.clientY - prevTouchLookY;
      prevTouchLookX = touch.clientX;
      prevTouchLookY = touch.clientY;

      lookYaw -= dx * 0.0042;
      lookPitch -= dy * 0.0036;
      lookPitch = THREE.MathUtils.clamp(lookPitch, -Math.PI * 0.42, Math.PI * 0.42);
      lastLookInputTime = performance.now();
    }
  }
}, { passive: false });

const handleTouchEnd = e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    if (touch.identifier === moveTouchId) {
      moveTouchId = null;
      moveVec.x = 0;
      moveVec.y = 0;
      moveIsRunning = false;
      if (joystickEl) {
        joystickEl.style.display = 'none';
      }
    } else if (touch.identifier === lookTouchId) {
      lookTouchId = null;
    }
  }
};
addEventListener('touchend', handleTouchEnd, { passive: true });
addEventListener('touchcancel', handleTouchEnd, { passive: true });

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

  // -------- combined movement input (keyboard + mobile touch) --------
  let fwdInput = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  let strafeInput = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  let running = !!(keys['ShiftLeft'] || keys['ShiftRight']);

  if (moveTouchId !== null) {
    if (Math.abs(moveVec.y) > 0.06) fwdInput = moveVec.y;
    if (Math.abs(moveVec.x) > 0.06) strafeInput = moveVec.x;
    if (moveIsRunning) running = true;
  }

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
  const isMovingForward = fwdInput > 0.2;
  if (isMovingForward && performance.now() - lastLookInputTime > 2000) {
    lookYaw = THREE.MathUtils.damp(lookYaw, 0, 1.2, dt);
    lookPitch = THREE.MathUtils.damp(lookPitch, 0, 1.5, dt);
  }

  // -------- forward/backward trail motion --------
  const maxV = running ? TRAIL_MAX_RUN : TRAIL_MAX_WALK;
  const targetVel = fwdInput * maxV;

  if (targetVel !== 0) {
    const sign = Math.sign(targetVel - trailVel);
    trailVel += sign * TRAIL_ACCEL * dt;
  } else {
    if (trailVel > 0) trailVel = Math.max(0, trailVel - TRAIL_DECEL * dt);
    else if (trailVel < 0) trailVel = Math.min(0, trailVel + TRAIL_DECEL * dt);
  }
  trailVel = THREE.MathUtils.clamp(trailVel, -maxV, maxV);

  // -------- lateral strafe motion (persistent, non-springy) --------
  const maxStrafeV = running ? STRAFE_SPEED_RUN : STRAFE_SPEED_WALK;
  const targetStrafeVel = strafeInput * maxStrafeV;
  const strafeRate = strafeInput !== 0 ? 10.0 : 12.0;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
  postprocess.setSize(innerWidth, innerHeight);
});
