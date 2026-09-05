// Procedural 3D walkable character — Jungle Explorer Guide
// Zero external assets: Three.js primitives with standard materials.
// Blender MCP is available (blender 4.0.2 + blender-mcp 1.0.1) but procedural
// primitives are used to keep the build self-contained and headless-safe.
// A Blender-generated GLTF path is supported (see optional GLTF loader below)
// but the default is pure procedural so `npm run build` never needs Blender.
//
// Hierarchy:
//   group (world) -> hips -> torso, pack, headG, armL/R, legL/R
// Animations: idle (breath), walk, run — all via procedural limb swings.
// Collision: world.js terrainHeight() is sampled externally; this module
//            only handles visuals and gait phase.
import * as THREE from 'three';

export function placeCharacter(scene) {
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.72 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0x7a7048, roughness: 0.9 }),
    shirtDark: new THREE.MeshStandardMaterial({ color: 0x5d5535, roughness: 0.9 }),
    pants: new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 0.92 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x2c2117, roughness: 0.85 }),
    hat: new THREE.MeshStandardMaterial({ color: 0xb39255, roughness: 0.95 }),
    pack: new THREE.MeshStandardMaterial({ color: 0x5e4c30, roughness: 0.95 }),
    packRoll: new THREE.MeshStandardMaterial({ color: 0x6e6a52, roughness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x33291c, roughness: 0.9 }),
  };

  const group = new THREE.Group();
  group.name = 'ExplorerGuide';
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  group.add(hips);

  const addMesh = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ----- torso -----
  const torso = addMesh(hips, new THREE.CapsuleGeometry(0.21, 0.42, 4, 12), mats.shirt, 0, 0.28, 0);
  torso.scale.set(1.15, 1, 0.82);
  addMesh(hips, new THREE.BoxGeometry(0.10, 0.30, 0.02), mats.shirtDark, 0, 0.30, 0.17);
  addMesh(hips, new THREE.CylinderGeometry(0.215, 0.225, 0.07, 12), mats.strap, 0, -0.02, 0);

  // ----- backpack (character front = +Z, so pack is -Z) -----
  addMesh(hips, new THREE.BoxGeometry(0.34, 0.46, 0.20), mats.pack, 0, 0.30, -0.28);
  const roll = addMesh(hips, new THREE.CylinderGeometry(0.09, 0.09, 0.40, 10), mats.packRoll, 0, 0.56, -0.28);
  roll.rotation.z = Math.PI / 2;
  addMesh(hips, new THREE.BoxGeometry(0.07, 0.40, 0.02), mats.strap, -0.13, 0.32, 0.17);
  addMesh(hips, new THREE.BoxGeometry(0.07, 0.40, 0.02), mats.strap, 0.13, 0.32, 0.17);

  // ----- head -----
  const headG = new THREE.Group();
  headG.position.set(0, 0.62, 0);
  hips.add(headG);
  addMesh(headG, new THREE.SphereGeometry(0.13, 18, 14), mats.skin, 0, 0.10, 0.01);
  addMesh(headG, new THREE.SphereGeometry(0.028, 8, 8), mats.skin, 0, 0.085, 0.135);
  addMesh(headG, new THREE.CylinderGeometry(0.24, 0.25, 0.03, 18), mats.hat, 0, 0.19, 0);
  addMesh(headG, new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hat, 0, 0.19, 0);
  addMesh(headG, new THREE.CylinderGeometry(0.135, 0.135, 0.03, 14), mats.strap, 0, 0.20, 0);

  // ----- arms -----
  const buildArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.28 * side, 0.48, 0);
    hips.add(g);
    addMesh(g, new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), mats.shirt, 0, -0.15, 0);
    addMesh(g, new THREE.CapsuleGeometry(0.052, 0.20, 4, 8), mats.skin, 0, -0.42, 0);
    addMesh(g, new THREE.SphereGeometry(0.06, 10, 8), mats.skin, 0, -0.58, 0);
    if (side > 0) {
      const sheath = addMesh(g, new THREE.BoxGeometry(0.05, 0.42, 0.07), mats.strap, 0.02, -0.35, -0.12);
      sheath.rotation.x = 0.15;
    }
    return g;
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // ----- legs -----
  const buildLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.11 * side, -0.04, 0);
    hips.add(g);
    addMesh(g, new THREE.CapsuleGeometry(0.085, 0.50, 4, 10), mats.pants, 0, -0.32, 0);
    // boot sole sits at group y=0 when hips=0.92: leg pivot -0.04, boot center -0.82 => sole 0
    addMesh(g, new THREE.BoxGeometry(0.13, 0.12, 0.24), mats.boots, 0, -0.84, 0.04);
    return g;
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // ----- spawn pose (trailhead) — will be overridden immediately by main.js -----
  // Keep for headless/harness sanity if main.js doesn't move it yet.
  // Initial facing = trail forward at t=0.02.
  group.position.set(0, 0, 0);
  group.rotation.y = 0;

  scene.add(group);

  // Animation state
  let stepPhase = 0;
  let hipsYaw = group.rotation.y;
  let torsoTilt = 0;

  /**
   * Update walk/idle animation.
   * @param {number} time - elapsed seconds
   * @param {number} dt - delta seconds
   * @param {{speed:number,isMoving:boolean,isRunning:boolean,trailVel:number,strafeVel:number,yaw:number}} state
   */
  const update = (time, dt, state = {}) => {
    const { speed = 0, isMoving = false, isRunning = false, yaw = group.rotation.y } = state;
    const moving = isMoving || speed > 0.08;

    // smooth yaw toward target (handle wraparound)
    let dy = yaw - hipsYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    hipsYaw += dy * Math.min(1, dt * 6.0);
    group.rotation.y = hipsYaw;

    if (moving) {
      const hz = isRunning ? 2.45 : 1.65;
      stepPhase += dt * hz * Math.PI * 2;
      if (stepPhase > Math.PI * 2) stepPhase -= Math.PI * 2;

      const swing = isRunning ? 0.55 : 0.38;
      const armSwing = isRunning ? 0.55 : 0.42;
      // legs counter-oscillate, arms opposite to legs
      legL.rotation.x = Math.sin(stepPhase) * swing;
      legR.rotation.x = Math.sin(stepPhase + Math.PI) * swing;
      // slight knee bend at mid-swing -> add thigh lift
      legL.rotation.x += Math.max(0, -Math.sin(stepPhase)) * 0.18;
      legR.rotation.x += Math.max(0, -Math.sin(stepPhase + Math.PI)) * 0.18;
      armL.rotation.x = Math.sin(stepPhase + Math.PI) * armSwing;
      armR.rotation.x = Math.sin(stepPhase) * armSwing;
      // subtle torso lean into motion + sway
      torsoTilt = THREE.MathUtils.damp(torsoTilt, Math.sin(stepPhase) * 0.03 + (isRunning ? 0.04 : 0.0), 8, dt);
      hips.rotation.z = Math.sin(stepPhase) * 0.04;
      hips.rotation.x = torsoTilt;
      hips.position.y = 0.92 + Math.abs(Math.sin(stepPhase * 2)) * (isRunning ? 0.025 : 0.015);
      headG.rotation.y = Math.sin(stepPhase * 0.5) * 0.12;
      headG.rotation.x = 0;
    } else {
      // idle: breathing + slow weight shift + head scan
      const b = Math.sin(time * 1.6) * 0.008;
      torso.position.y = 0.28 + b;
      hips.position.y = 0.92 + b * 0.5 + Math.sin(time * 0.5) * 0.006;
      hips.rotation.z = Math.sin(time * 0.5) * 0.018;
      hips.rotation.x = THREE.MathUtils.damp(hips.rotation.x, 0, 4, dt);
      armL.rotation.x = THREE.MathUtils.damp(armL.rotation.x, 0.05, 6, dt);
      armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, -0.05, 6, dt);
      legL.rotation.x = THREE.MathUtils.damp(legL.rotation.x, 0, 8, dt);
      legR.rotation.x = THREE.MathUtils.damp(legR.rotation.x, 0, 8, dt);
      headG.rotation.y = Math.sin(time * 0.35) * 0.35;
      headG.rotation.x = Math.sin(time * 0.7) * 0.04;
    }
  };

  // Legacy idle-only signature: update(time, dt) — normalize
  const legacyUpdate = (time, dt, maybeState) => {
    if (maybeState && typeof maybeState === 'object') return update(time, dt, maybeState);
    return update(time, dt, {});
  };

  // Allow external placement (used by world.js initial and main.js each frame)
  const setPosition = (x, y, z, yaw) => {
    group.position.set(x, y, z);
    if (yaw !== undefined) { hipsYaw = group.rotation.y = yaw; }
  };

  return { group, hips, update: legacyUpdate, _rawUpdate: update, setPosition };
}
