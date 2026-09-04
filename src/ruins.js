// System 4 — Procedural Stone Ruins
// Builds an ancient ruined temple complex in the clearing near the
// end of the trail. All geometry is procedural: noise-displaced stone
// blocks, broken columns, cracked walls, eroded steps, partially
// collapsed platforms. Stones get vertex-color weather staining
// (greys/browns/greens) and moss coverage on horizontal surfaces.
//
// Layout: a small rectangular temple footprint in the clearing,
// with a stepped platform, two broken columns, a few standing walls,
// and rubble scattered around. The whole thing is intended to look
// like the temple has been in the jungle for centuries.

import * as THREE from 'three';
import { TRAIL, terrainHeight, WORLD } from './world.js';
import { makeNoise } from './world.js';
const N = makeNoise(7777);

// ---------- noise-displaced block ----------
// A box geometry with each vertex pushed in/out by FBM noise, so the
// surface looks weathered rather than perfect-cuboid. Vertex colors
// are a mix of base stone, dirt, and moss.
function makeStoneBlock(w, h, d, seed, moss = 0.0) {
  // higher subdivision so the normal map has fine surface detail
  // to play against. The (6, 5, 6) segments give the box 6*5*2 + 6*6*2
  // + 5*6*2 = 60+72+60 = 192 quads = 384 triangles, plenty for the
  // normal-map effect.
  const geo = new THREE.BoxGeometry(w, h, d, 6, 5, 6);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // stronger noise displacement so the box surface has visible
    // 3D relief, not just a flat decal
    const n =
      N.fbm(v.x * 2.0 + seed, v.y * 2.0 + seed, 3) * 0.22 +
      N.fbm(v.y * 3.5 + seed, v.z * 3.5, 3) * 0.10;
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // vertex colors: stone with weathering and moss
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // base stone
    let r = 0.52, g = 0.48, b = 0.36;
    const weathered = N.fbm(x * 1.2 + seed, z * 1.2 + seed, 3) * 0.5 + 0.5;
    r += (weathered - 0.5) * 0.18;
    g += (weathered - 0.5) * 0.16;
    b += (weathered - 0.5) * 0.14;
    // dirt accumulation in crevices (low-y edges)
    if (Math.abs(y) < h * 0.2) {
      r -= 0.05; g -= 0.06; b -= 0.04;
    }
    // moss on top
    if (moss > 0 && y > h * 0.3) {
      const mossN = N.fbm(x * 3 + seed + 9, z * 3 + seed + 5, 2) * 0.5 + 0.5;
      if (mossN > 0.55) {
        const k = Math.min((mossN - 0.55) * 3, 1) * moss;
        r = r * (1 - k) + 0.20 * k;
        g = g * (1 - k) + 0.42 * k;
        b = b * (1 - k) + 0.18 * k;
      }
    }
    // darker wet stain at base
    if (y < -h * 0.3) {
      r *= 0.7; g *= 0.68; b *= 0.65;
    }
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ---------- broken column ----------
// A vertical stone cylinder, possibly broken at the top with a jagged
// break. Vertices near the top are pushed down to simulate breakage.
function makeColumn(radius, height, breakT, seed) {
  const radial = 14;
  const segs = 8;
  const positions = [];
  const indices = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const y = t * height;
    // if above the break point, push down
    const yEff = (t > breakT) ? breakT * height + Math.sin(t * 13 + seed) * 0.3 : y;
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      // perimeter wobble for organic shape
      const wob = 1 + N.fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2 + t * 4, 3) * 0.07;
      // fluting: slight grooves in the column surface
      const flute = 1 - Math.cos(ang * 6) * 0.03;
      const r = radius * wob * flute;
      positions.push(Math.cos(ang) * r, yEff, Math.sin(ang) * r);
    }
  }
  for (let s = 0; s < segs; s++) for (let a = 0; a < radial; a++) {
    const a2 = (a + 1) % radial;
    const i0 = s * radial + a, i1 = s * radial + a2;
    const i2 = (s + 1) * radial + a2, i3 = (s + 1) * radial + a;
    indices.push(i0, i1, i2, i0, i2, i3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // stone column colors
  const colors = new Float32Array(positions.length / 3 * 3);
  for (let i = 0; i < positions.length / 3; i++) {
    const y = positions[i * 3 + 1];
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    let r = 0.52, g = 0.48, b = 0.36;
    const weathered = N.fbm(x * 1.5 + seed, z * 1.5 + seed, 3) * 0.5 + 0.5;
    r += (weathered - 0.5) * 0.14;
    g += (weathered - 0.5) * 0.12;
    b += (weathered - 0.5) * 0.10;
    // moss near the base
    if (y < height * 0.2) {
      const m = N.fbm(x * 4 + seed + 9, z * 4 + seed + 5, 2) * 0.5 + 0.5;
      if (m > 0.55) {
        const k = Math.min((m - 0.55) * 2.5, 1) * 0.6;
        r = r * (1 - k) + 0.22 * k;
        g = g * (1 - k) + 0.42 * k;
        b = b * (1 - k) + 0.18 * k;
      }
    }
    // dampness
    if (y < height * 0.1) { r *= 0.7; g *= 0.68; b *= 0.65; }
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ---------- procedural stone normal map ----------
// Cracks + chip pattern for the stone material. The cracks are a
// high-frequency noise field thresholded into thin lines; the chips
// are low-frequency variation. The map is a normal map (RGB =
// surface normal in tangent space).
function makeStoneNormalTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // base normal: (0, 0, 1) in tangent space → (128, 128, 255)
      let nx = N.fbm(u * 8, v * 8, 3) * 0.8;
      let ny = N.fbm(u * 8 + 7, v * 8 + 7, 3) * 0.8;
      // big cracks: low-frequency noise thresholded into wider lines
      // so they're visible at 20m+ distance
      const crackNoise1 = N.fbm(u * 6, v * 6, 4);
      const crackMask1 = Math.max(0, 0.08 - Math.abs(crackNoise1));
      const crackDir1 = Math.atan2(
        N.noise2(u * 6 + 11, v * 6 + 11),
        N.noise2(u * 6 + 17, v * 6 + 17),
      );
      nx += Math.cos(crackDir1) * crackMask1 * 8;
      ny += Math.sin(crackDir1) * crackMask1 * 8;
      // fine cracks: high-frequency noise for surface detail
      const crackNoise2 = N.fbm(u * 30, v * 30, 4);
      const crackMask2 = Math.max(0, 0.04 - Math.abs(crackNoise2));
      const crackDir2 = Math.atan2(
        N.noise2(u * 30 + 11, v * 30 + 11),
        N.noise2(u * 30 + 17, v * 30 + 17),
      );
      nx += Math.cos(crackDir2) * crackMask2 * 4;
      ny += Math.sin(crackDir2) * crackMask2 * 4;
      // pack to 0-255
      const r = Math.max(0, Math.min(255, 128 + nx * 50));
      const g = Math.max(0, Math.min(255, 128 + ny * 50));
      const b = 255;
      const i = (y * S + x) * 4;
      img.data[i]     = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}
const STONE_NORMAL = makeStoneNormalTexture();

// ---------- stone material (shared) ----------
// Now uses MeshStandardMaterial with a procedural normal map for
// proper PBR-style surface detail. The vertex colors still drive
// the per-block weathering and moss tinting.
function stoneMat() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: STONE_NORMAL,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.85,
    metalness: 0.0,
    flatShading: false,
  });
}

// ---------- place a single ruin block at (x,z) with given size/rotation ----------
function placeBlock(scene, x, z, w, h, d, ry, seed, moss = 0) {
  const y = terrainHeight(x, z);
  const geo = makeStoneBlock(w, h, d, seed, moss);
  const mesh = new THREE.Mesh(geo, stoneMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = ry;
  mesh.position.set(x, y + h * 0.5 - 0.05, z);  // sink base slightly
  scene.add(mesh);
  return mesh;
}

// ---------- place a column at (x,z) with given height and break point ----------
function placeColumn(scene, x, z, height, breakT, seed) {
  const y = terrainHeight(x, z);
  const geo = makeColumn(0.35 + N.noise2(seed, 1) * 0.08, height, breakT, seed);
  const mesh = new THREE.Mesh(geo, stoneMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y - 0.05, z);
  scene.add(mesh);
  return mesh;
}

// ---------- moss patch on stone ----------
function addMossPatch(scene, x, y, z, radius, seed) {
  const segs = 10;
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const r = radius * (0.85 + N.noise2(Math.cos(a) * 3 + seed, Math.sin(a) * 3) * 0.25);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    const py = (N.noise2(px * 4 + seed, pz * 4) - 0.5) * 0.06;
    positions.push(px, py, pz);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segs; i++) indices.push(0, 1 + i, 2 + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < positions.length / 3; i++) {
    const v = 0.6 + N.noise2(positions[i * 3] * 5 + seed, positions[i * 3 + 2] * 5) * 0.5;
    colors[i * 3]     = 0.18 * v;
    colors[i * 3 + 1] = 0.40 * v;
    colors[i * 3 + 2] = 0.16 * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

// ---------- main entry ----------
// Place a small ruined temple complex in the clearing near the trail
// end. Returns metadata about what was placed.
export function placeRuins(scene) {
  // center of the clearing
  const cx = -20;
  const cz = WORLD.waterfallZ + 28;
  const placed = [];

  // temple footprint: a 4-tier stepped stone platform
  for (let tier = 0; tier < 4; tier++) {
    const t = tier / 3;
    const w = 13 - t * 2.5;
    const d = 10 - t * 2.0;
    const h = 0.65;
    const x = cx;
    const z = cz + t * 0.4;
    placed.push(placeBlock(scene, x, z, w, h, d, 0.02 * tier, 1000 + tier, 0.45));
  }

  // Stone steps leading up the front
  for (let step = 0; step < 3; step++) {
    const sw = 4.2;
    const sd = 0.8;
    const sh = 0.25;
    const sx = cx;
    const sz = cz - 4.8 - step * 0.7;
    placed.push(placeBlock(scene, sx, sz, sw, sh, sd, 0, 1100 + step, 0.3));
  }

  // Columns: colonnade / temple portico
  const colPositions = [
    { x: cx - 4.2, z: cz - 3.4, h: 4.8, breakT: 1.0 },
    { x: cx - 1.4, z: cz - 3.4, h: 4.8, breakT: 1.0 },
    { x: cx + 1.4, z: cz - 3.4, h: 4.8, breakT: 0.75 },
    { x: cx + 4.2, z: cz - 3.4, h: 4.8, breakT: 0.5 },
    { x: cx - 4.2, z: cz + 1.8, h: 4.2, breakT: 0.6 },
    { x: cx + 4.2, z: cz + 1.8, h: 4.2, breakT: 0.85 },
  ];
  for (let i = 0; i < colPositions.length; i++) {
    const c = colPositions[i];
    placed.push(placeColumn(scene, c.x, c.z, c.h, c.breakT, 200 + i));
  }

  // Lintel beam spanning the two intact standing columns
  const lintelW = 3.6, lintelH = 0.6, lintelD = 0.8;
  const lintelX = (cx - 4.2 + cx - 1.4) * 0.5;
  const lintelZ = cz - 3.4;
  const lintelY = terrainHeight(lintelX, lintelZ) + 4.8 + lintelH * 0.5;
  const lintelGeo = makeStoneBlock(lintelW, lintelH, lintelD, 1250, 0.4);
  const lintelMesh = new THREE.Mesh(lintelGeo, stoneMat());
  lintelMesh.position.set(lintelX, lintelY, lintelZ);
  lintelMesh.castShadow = true; lintelMesh.receiveShadow = true;
  scene.add(lintelMesh);
  placed.push(lintelMesh);

  // a back wall of weathered blocks
  for (let i = 0; i < 4; i++) {
    const bx = cx - 2.8 + i * 1.8;
    const bz = cz + 3.0;
    const bw = 1.6;
    const bh = 2.2 + N.noise2(300 + i, 1) * 0.8;
    const bd = 0.9;
    const ry = (N.noise2(300 + i, 3) - 0.5) * 0.2;
    placed.push(placeBlock(scene, bx, bz, bw, bh, bd, ry, 300 + i, 0.55));
  }

  // a side wall fragment
  for (let i = 0; i < 2; i++) {
    const sx = cx + 4.5;
    const sz = cz - 1.0 + i * 1.6;
    const sw = 0.8;
    const sh = 1.5 + N.noise2(400 + i, 1) * 0.6;
    const sd = 1.1;
    const ry = Math.PI / 2 + (N.noise2(400 + i, 3) - 0.5) * 0.2;
    placed.push(placeBlock(scene, sx, sz, sw, sh, sd, ry, 400 + i, 0.5));
  }

  // a toppled column (lying on the ground)
  for (let i = 0; i < 2; i++) {
    const tx = cx - 1.0 + i * 4;
    const tz = cz + 0.5;
    const tlen = 2.5 + N.noise2(500 + i, 1) * 1.0;
    const geo = makeColumn(0.35, tlen, 1.0, 500 + i);
    // squash it horizontal by scaling y small and rotating
    geo.scale(1, 0.5, 1);
    const mesh = new THREE.Mesh(geo, stoneMat());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const ry = N.noise2(500 + i, 5) * Math.PI;
    mesh.rotation.set(Math.PI / 2, ry, 0);
    mesh.position.set(tx, terrainHeight(tx, tz) + 0.2, tz);
    scene.add(mesh);
    placed.push(mesh);
  }

  // rubble: small blocks scattered around the platform
  const rng = (() => { let s = 0xBEEF; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + rng() * 5;
    const rx = cx + Math.cos(a) * r;
    const rz = cz + Math.sin(a) * r * 0.8;
    const rw = 0.3 + rng() * 0.5;
    const rh = 0.2 + rng() * 0.4;
    const rd = 0.3 + rng() * 0.5;
    placed.push(placeBlock(scene, rx, rz, rw, rh, rd, rng() * Math.PI * 2, 600 + i, 0.3));
  }

  // moss patches on top of the platform blocks
  for (let i = 0; i < 8; i++) {
    const mx = cx + (rng() - 0.5) * 6;
    const mz = cz + (rng() - 0.5) * 5;
    const my = terrainHeight(mx, mz) + 0.62 + rng() * 0.4;
    addMossPatch(scene, mx, my, mz, 0.4 + rng() * 0.4, 700 + i);
  }

  return { placedCount: placed.length, center: { x: cx, z: cz } };
}
