// Procedural 3D character — Jungle Explorer Guide
// Zero external assets: all geometry is Three.js primitives with
// standard materials. Placed beside the trailhead so the player
// sees a human scale reference on spawn.
//
// Hierarchy (all pivots for idle animation):
//   group (ground) -> hips -> torso, backpack, head group, armL/R, legL/R
import * as THREE from 'three';
import { TRAIL, terrainHeight } from './world.js';

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

  // ----- torso (shirt) -----
  const torso = addMesh(hips, new THREE.CapsuleGeometry(0.21, 0.42, 4, 12), mats.shirt, 0, 0.28, 0);
  torso.scale.set(1.15, 1, 0.82);
  // shirt collar / placket detail
  addMesh(hips, new THREE.BoxGeometry(0.1, 0.3, 0.02), mats.shirtDark, 0, 0.3, 0.17);
  // belt
  addMesh(hips, new THREE.CylinderGeometry(0.215, 0.225, 0.07, 12), mats.strap, 0, -0.02, 0);

  // ----- backpack (behind, -z is back when facing +z) -----
  const pack = addMesh(hips, new THREE.BoxGeometry(0.34, 0.46, 0.2), mats.pack, 0, 0.3, -0.28);
  pack.geometry.translate(0, 0, 0); // keep pivot centered
  // bedroll on top of pack
  const roll = addMesh(hips, new THREE.CylinderGeometry(0.09, 0.09, 0.4, 10), mats.packRoll, 0, 0.56, -0.28);
  roll.rotation.z = Math.PI / 2;
  // straps over shoulders
  addMesh(hips, new THREE.BoxGeometry(0.07, 0.4, 0.02), mats.strap, -0.13, 0.32, 0.17);
  addMesh(hips, new THREE.BoxGeometry(0.07, 0.4, 0.02), mats.strap, 0.13, 0.32, 0.17);

  // ----- head -----
  const headG = new THREE.Group();
  headG.position.set(0, 0.62, 0);
  hips.add(headG);
  addMesh(headG, new THREE.SphereGeometry(0.13, 18, 14), mats.skin, 0, 0.1, 0.01);
  // nose hint
  addMesh(headG, new THREE.SphereGeometry(0.028, 8, 8), mats.skin, 0, 0.085, 0.135);
  // safari hat: brim + crown
  addMesh(headG, new THREE.CylinderGeometry(0.24, 0.25, 0.03, 18), mats.hat, 0, 0.19, 0);
  addMesh(headG, new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hat, 0, 0.19, 0);
  addMesh(headG, new THREE.CylinderGeometry(0.135, 0.135, 0.03, 14), mats.strap, 0, 0.2, 0);

  // ----- arms (pivot at shoulder) -----
  const buildArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.28 * side, 0.48, 0);
    hips.add(g);
    // sleeve (upper)
    addMesh(g, new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), mats.shirt, 0, -0.15, 0);
    // forearm skin
    addMesh(g, new THREE.CapsuleGeometry(0.052, 0.2, 4, 8), mats.skin, 0, -0.42, 0);
    // hand
    addMesh(g, new THREE.SphereGeometry(0.06, 10, 8), mats.skin, 0, -0.58, 0);
    // machete sheath on right hip side only
    if (side > 0) {
      const sheath = addMesh(g, new THREE.BoxGeometry(0.05, 0.42, 0.07), mats.strap, 0.02, -0.35, -0.12);
      sheath.rotation.x = 0.15;
    }
    return g;
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);
  armL.rotation.z = 0.12;
  armR.rotation.z = -0.12;

  // ----- legs (pivot at hip) -----
  const buildLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.11 * side, -0.04, 0);
    hips.add(g);
    // thigh + shin (pants)
    addMesh(g, new THREE.CapsuleGeometry(0.085, 0.5, 4, 10), mats.pants, 0, -0.32, 0);
    // boot (sole at y=0: hips 0.92 - 0.04 - 0.82 - 0.06 = 0)
    addMesh(g, new THREE.BoxGeometry(0.13, 0.12, 0.24), mats.boots, 0, -0.82, 0.04);
    return g;
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // ----- placement: trailhead, offset to the side, facing the player -----
  // t=0.02 is spawn. Stand ~4m ahead and ~2.2m to the right of center
  // so the camera sees the guide immediately without blocking the path.
  const tGuide = 0.028;
  const p = TRAIL.getPointAt(tGuide);
  const tangent = TRAIL.getTangentAt(tGuide);
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const px = p.x + normal.x * 2.2;
  const pz = p.z + normal.z * 2.2;
  const py = terrainHeight(px, pz);
  group.position.set(px, py, pz);
  // face back toward the trail start (toward incoming player).
  // Object3D.lookAt points the object's +Z at the target, and the
  // character's front (face, shirt placket, shoulder straps) is +Z.
  // Verified numerically: facing dot with direction-to-player ≈ +1.
  const lookBack = TRAIL.getPointAt(0.015);
  group.lookAt(lookBack.x, py, lookBack.z);

  scene.add(group);

  // ----- idle animation: breathing, weight shift, arm sway, head scan -----
  const update = (time) => {
    const b = Math.sin(time * 1.6) * 0.008;          // breathing
    torso.position.y = 0.28 + b;
    hips.position.y = 0.92 + b * 0.5 + Math.sin(time * 0.5) * 0.006; // weight shift
    hips.rotation.z = Math.sin(time * 0.5) * 0.02;
    armL.rotation.x = Math.sin(time * 1.6) * 0.06;
    armR.rotation.x = -Math.sin(time * 1.6) * 0.06;
    headG.rotation.y = Math.sin(time * 0.35) * 0.4;  // slow look around
    headG.rotation.x = Math.sin(time * 0.7) * 0.05;
    legL.rotation.x = 0;
    legR.rotation.x = 0;
  };

  return { group, update };
}
