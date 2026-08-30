// System 5 — Procedural Waterfall and Water
// Builds the waterfall dropping from the cliff at the end of the
// trail, the pool at its base, and the river running back from the
// pool. All procedural: no external textures, no HDRIs.
//
// Components:
//   1. A vertical "water sheet" — a tall narrow plane with a
//      procedural falling-water texture, oriented along the cliff
//      face.
//   2. Foam/splash particles at the base where the water hits the
//      pool.
//   3. The pool surface — a horizontal plane with a procedural
//      water texture (animated by vertex displacement if cheap).
//   4. A river plane extending back from the pool along the
//      riverbed channel the terrain already has.
//   5. Wet rock tinting on the cliff face and pool rim (handled
//      implicitly via darker vertex colors near the falls).
//
// All meshes are added to the scene; no exports needed at runtime
// except for an update() to animate the waterfall particles.

import * as THREE from 'three';
import { terrainHeight, WORLD, TRAIL } from './world.js';
import { makeNoise } from './world.js';
const N = makeNoise(9990001);

// ---------- falling-water texture ----------
// Vertical bands of white-blue with horizontal noise breakup, with
// the top brighter (water hits air) and bottom thicker (water hits
// pool). Alpha falls off at the edges so the sheet doesn't look
// like a flat plane.
function makeWaterfallTexture() {
  const W = 128, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const vy = y / H;
    for (let x = 0; x < W; x++) {
      const vx = x / W;
      // central falloff (so edges fade out)
      const h = 1 - Math.abs(vx - 0.5) * 2;
      const edge = Math.max(0, Math.min(1, h * h));
      // VERY high-frequency vertical streaks to read as falling water
      const streak = N.fbm(vx * 50, vy * 2, 3) * 0.5 + 0.5;
      // secondary even higher frequency for water spray detail
      const drop = N.noise2(vx * 200, vy * 80) * 0.5 + 0.5;
      // horizontal noise (water turbulence)
      const turb = N.noise2(vx * 80, vy * 20) * 0.4 + 0.6;
      // base color: very bright white with blue tint
      const r = Math.min(255, edge * (160 + 100 * streak * drop * turb));
      const g = Math.min(255, edge * (190 + 80 * streak * drop * turb));
      const b = Math.min(255, edge * (220 + 50 * streak * drop * turb));
      const a = edge * 255;
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------- pool water texture ----------
// A simple moving-wave texture: blue with lighter crests and a
// subtle ripple pattern.
function makePoolTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // large slow waves
      const w1 = N.fbm(u * 4, v * 4, 3) * 0.5 + 0.5;
      // small ripples
      const w2 = N.fbm(u * 16, v * 16, 3) * 0.3 + 0.3;
      const c = 0.6 * w1 + 0.4 * w2;
      // base deep blue
      const r = 30 + 40 * c;
      const g = 80 + 50 * c;
      const b = 120 + 50 * c;
      // sparkle highlights
      const sparkle = (N.noise2(u * 80, v * 80) > 0.75) ? 60 : 0;
      const i = (y * S + x) * 4;
      img.data[i]     = Math.min(255, r + sparkle);
      img.data[i + 1] = Math.min(255, g + sparkle);
      img.data[i + 2] = Math.min(255, b + sparkle);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const WF_TEX = makeWaterfallTexture();
const POOL_TEX = makePoolTexture();

// ---------- waterfall main sheet ----------
// A vertical plane in front of the cliff face, with the falling-water
// texture. Slightly transparent so the cliff shows through.
function buildWaterfallSheet(scene) {
  const cliffZ = WORLD.waterfallZ;
  // find a representative cliff height at the falls. The cliff is at
  // z < cliffZ; sample at z = cliffZ - 1 to get the face height.
  const centerX = TRAIL.getPoint(1).x * 0.5;
  const cliffTopY = terrainHeight(centerX, cliffZ - 1);
  const baseY = terrainHeight(centerX, cliffZ + 5);  // the pool/clearing base
  const topY = cliffTopY;
  const widthM = 18;
  const heightM = topY - baseY + 1;
  const group = new THREE.Group();
  // Main sheet
  const geo = new THREE.PlaneGeometry(widthM, heightM, 6, 14);
  const mat = new THREE.MeshBasicMaterial({
    map: WF_TEX,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: true,
  });
  const m = new THREE.Mesh(geo, mat);
  group.add(m);
  // Two side cascades to give the falls width
  for (let s = 0; s < 2; s++) {
    const sideOff = (s === 0 ? -1 : 1) * 11;
    const w = 4 + Math.random() * 1.5;
    const h = heightM * (0.7 + Math.random() * 0.25);
    const sg = new THREE.PlaneGeometry(w, h, 2, 6);
    const sm = new THREE.MeshBasicMaterial({
      map: WF_TEX, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, fog: true,
    });
    const sm2 = new THREE.Mesh(sg, sm);
    sm2.position.set(sideOff, -1, 0.3);
    group.add(sm2);
  }
  // position the group: the sheet center is at y = (baseY + topY) / 2
  group.position.set(centerX, (baseY + topY) / 2, cliffZ + 1.5);
  scene.add(group);
  return m;  // return the main sheet for animation hook
}

// ---------- secondary cascade sheets ----------
// A few additional smaller cascades off to the sides, for visual
// variety. Each is a smaller plane.
function buildSideCascades(scene) {
  const cliffZ = WORLD.waterfallZ;
  const centerX = TRAIL.getPoint(1).x * 0.5;
  const topY = terrainHeight(centerX, cliffZ + 1.5) + 1;
  const cascades = [];
  for (let i = 0; i < 2; i++) {
    const off = (i === 0 ? -1 : 1) * (8 + Math.random() * 3);
    const w = 3 + Math.random() * 2;
    const h = topY * (0.5 + Math.random() * 0.4);
    const geo = new THREE.PlaneGeometry(w, h, 1, 6);
    const mat = new THREE.MeshBasicMaterial({
      map: WF_TEX, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      depthWrite: false, fog: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(centerX + off, h / 2, cliffZ + 0.4);
    scene.add(m);
    cascades.push(m);
  }
  return cascades;
}

// ---------- pool surface ----------
function buildPool(scene) {
  const cliffZ = WORLD.waterfallZ;
  const centerX = TRAIL.getPoint(1).x * 0.5;
  // pool is a disc-ish plane in front of the cliff (between the
  // player and the cliff)
  const radius = 22;
  const geo = new THREE.CircleGeometry(radius, 32);
  // deform the perimeter to make it irregular
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    if (r > 0.1) {
      const ang = Math.atan2(y, x);
      const noise = N.fbm(ang * 2, r * 0.1, 3) * 2.5;
      const newR = r + noise;
      pos.setX(i, (x / r) * newR);
      pos.setY(i, (y / r) * newR);
    }
  }
  geo.computeVertexNormals();
  POOL_TEX.repeat.set(2, 2);
  const mat = new THREE.MeshLambertMaterial({
    map: POOL_TEX,
    color: 0xb8d4e0,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    fog: true,
  });
  const m = new THREE.Mesh(geo, mat);
  // pool at y just above the terrain at the falls
  const y = terrainHeight(centerX, cliffZ + 6) + 0.05;
  m.position.set(centerX, y, cliffZ + 6);
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
  return m;
}

// ---------- splash particles at the base of the falls ----------
function buildSplashParticles(scene) {
  const cliffZ = WORLD.waterfallZ;
  const centerX = TRAIL.getPoint(1).x * 0.5;
  const N_PART = 220;
  const positions = new Float32Array(N_PART * 3);
  const seeds = new Float32Array(N_PART);
  const poolY = terrainHeight(centerX, cliffZ + 6) + 0.1;
  for (let i = 0; i < N_PART; i++) {
    // particles start near the cliff base, drift up and out
    const ang = (Math.random() - 0.5) * 1.4;  // narrow horizontal band
    const x = centerX + ang * 8 + (Math.random() - 0.5) * 4;
    const z = cliffZ + 0.5 + Math.random() * 4;
    const y = poolY + Math.random() * 1.5;
    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  return new THREE.Points(geo, mat);
}

// ---------- wet-stone patches around the pool rim ----------
// Small horizontal disc meshes in dark blue-grey that look like wet
// rock. Around the base of the falls and along the pool edge.
function addWetRocks(scene) {
  const cliffZ = WORLD.waterfallZ;
  const centerX = TRAIL.getPoint(1).x * 0.5;
  const patches = [];
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 14;
    const x = centerX + Math.cos(ang) * r;
    const z = cliffZ + 6 + Math.sin(ang) * r * 0.6;
    const radius = 0.6 + Math.random() * 1.2;
    const segs = 8;
    const positions = [];
    const indices = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const rr = radius * (0.85 + N.noise2(Math.cos(a) * 3 + i, Math.sin(a) * 3 + i) * 0.2);
      positions.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
    for (let k = 0; k < segs; k++) indices.push(0, 1 + k, 2 + k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length / 3 * 3).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    // dark wet-stone color
    const colors = new Float32Array(positions.length);
    for (let k = 0; k < colors.length; k += 3) {
      colors[k]     = 0.18;
      colors[k + 1] = 0.20;
      colors[k + 2] = 0.22;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, terrainHeight(x, z) + 0.02, z);
    m.receiveShadow = true;
    scene.add(m);
    patches.push(m);
  }
  return patches;
}

// ---------- public entry ----------
export function placeWater(scene) {
  const sheet = buildWaterfallSheet(scene);
  const cascades = buildSideCascades(scene);
  const pool = buildPool(scene);
  const splash = buildSplashParticles(scene);
  scene.add(splash);
  const wetRocks = addWetRocks(scene);
  return { sheet, cascades, pool, splash, wetRocks, update: (time, dt) => animateWater(scene, time, dt, { sheet, pool, splash, cascades }) };
}

function animateWater(scene, time, dt, refs) {
  // animate splash particles (rise and reset)
  const pos = refs.splash.geometry.attributes.position;
  const seeds = refs.splash.geometry.attributes.seed;
  for (let i = 0; i < pos.count; i++) {
    const seed = seeds.getX(i);
    let y = pos.getY(i) + dt * (1.4 + Math.sin(seed + time) * 0.4);
    if (y > pos.getY(i) + 3.5) {
      // reset to base
      const cliffZ = WORLD.waterfallZ;
      const centerX = TRAIL.getPoint(1).x * 0.5;
      const poolY = terrainHeight(centerX, cliffZ + 6) + 0.1;
      pos.setX(i, centerX + (Math.random() - 0.5) * 8);
      pos.setY(i, poolY);
      pos.setZ(i, cliffZ + 0.5 + Math.random() * 4);
    } else {
      pos.setY(i, y);
    }
  }
  pos.needsUpdate = true;
  // animate pool texture offset for moving water
  if (refs.pool && refs.pool.material.map) {
    refs.pool.material.map.offset.x = time * 0.01;
    refs.pool.material.map.offset.y = time * 0.005;
  }
}
