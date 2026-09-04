// System 4 — Procedural Stone Ruins
// Builds an ancient ruined temple complex in the clearing near the
// end of the trail. All geometry is procedural: noise-displaced stone
// blocks, broken columns, cracked walls, eroded steps, partially
// collapsed platforms. Stones get vertex-color weather staining
// (greys/browns/greens) and moss coverage on horizontal surfaces.
//
// Layout: a stepped temple platform in the clearing with colonnade,
// lintel beam, hanging vines, altar stone, and weathered stelae.

import * as THREE from 'three';
import { TRAIL, terrainHeight, WORLD } from './world.js';
import { makeNoise } from './world.js';
const N = makeNoise(7777);

// ---------- noise-displaced block ----------
function makeStoneBlock(w, h, d, seed, moss = 0.0) {
  const geo = new THREE.BoxGeometry(w, h, d, 6, 5, 6);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      N.fbm(v.x * 2.0 + seed, v.y * 2.0 + seed, 3) * 0.22 +
      N.fbm(v.y * 3.5 + seed, v.z * 3.5, 3) * 0.10;
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let r = 0.52, g = 0.48, b = 0.36;
    const weathered = N.fbm(x * 1.2 + seed, z * 1.2 + seed, 3) * 0.5 + 0.5;
    r += (weathered - 0.5) * 0.18;
    g += (weathered - 0.5) * 0.16;
    b += (weathered - 0.5) * 0.14;
    if (Math.abs(y) < h * 0.2) {
      r -= 0.05; g -= 0.06; b -= 0.04;
    }
    if (moss > 0 && y > h * 0.3) {
      const mossN = N.fbm(x * 3 + seed + 9, z * 3 + seed + 5, 2) * 0.5 + 0.5;
      if (mossN > 0.55) {
        const k = Math.min((mossN - 0.55) * 3, 1) * moss;
        r = r * (1 - k) + 0.20 * k;
        g = g * (1 - k) + 0.42 * k;
        b = b * (1 - k) + 0.18 * k;
      }
    }
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

// ---------- column ----------
function makeColumn(radius, height, breakT, seed) {
  const radial = 14;
  const segs = 8;
  const positions = [];
  const indices = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const y = t * height;
    const yEff = (t > breakT) ? breakT * height + Math.sin(t * 13 + seed) * 0.3 : y;
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      const wob = 1 + N.fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2 + t * 4, 3) * 0.07;
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
    if (y < height * 0.2) {
      const m = N.fbm(x * 4 + seed + 9, z * 4 + seed + 5, 2) * 0.5 + 0.5;
      if (m > 0.55) {
        const k = Math.min((m - 0.55) * 2.5, 1) * 0.6;
        r = r * (1 - k) + 0.22 * k;
        g = g * (1 - k) + 0.42 * k;
        b = b * (1 - k) + 0.18 * k;
      }
    }
    if (y < height * 0.1) { r *= 0.7; g *= 0.68; b *= 0.65; }
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ---------- procedural stone normal map ----------
function makeStoneNormalTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let nx = N.fbm(u * 8, v * 8, 3) * 0.8;
      let ny = N.fbm(u * 8 + 7, v * 8 + 7, 3) * 0.8;
      const crackNoise1 = N.fbm(u * 6, v * 6, 4);
      const crackMask1 = Math.max(0, 0.08 - Math.abs(crackNoise1));
      const crackDir1 = Math.atan2(
        N.noise2(u * 6 + 11, v * 6 + 11),
        N.noise2(u * 6 + 17, v * 6 + 17),
      );
      nx += Math.cos(crackDir1) * crackMask1 * 8;
      ny += Math.sin(crackDir1) * crackMask1 * 8;
      const crackNoise2 = N.fbm(u * 30, v * 30, 4);
      const crackMask2 = Math.max(0, 0.04 - Math.abs(crackNoise2));
      const crackDir2 = Math.atan2(
        N.noise2(u * 30 + 11, v * 30 + 11),
        N.noise2(u * 30 + 17, v * 30 + 17),
      );
      nx += Math.cos(crackDir2) * crackMask2 * 4;
      ny += Math.sin(crackDir2) * crackMask2 * 4;
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

function placeBlock(scene, x, z, w, h, d, ry, seed, moss = 0) {
  const y = terrainHeight(x, z);
  const geo = makeStoneBlock(w, h, d, seed, moss);
  const mesh = new THREE.Mesh(geo, stoneMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = ry;
  mesh.position.set(x, y + h * 0.5 - 0.05, z);
  scene.add(mesh);
  return mesh;
}

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

function addHangingRuinVine(scene, x, startY, z, len, seed) {
  const segs = 10;
  const pts = [];
  for (let s = 0; s <= segs; s++) {
    const ts = s / segs;
    const sway = Math.sin(ts * Math.PI * 1.2 + seed) * 0.15;
    pts.push(new THREE.Vector3(x + sway, startY - ts * len, z + sway * 0.5));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 10, 0.025, 4, false);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x364a22,
    roughness: 0.85,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

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
export function placeRuins(scene) {
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

  // Hanging vines draping from lintel beam
  addHangingRuinVine(scene, lintelX - 1.1, lintelY - 0.3, lintelZ, 3.2, 101);
  addHangingRuinVine(scene, lintelX + 0.2, lintelY - 0.3, lintelZ, 2.5, 102);
  addHangingRuinVine(scene, lintelX + 1.2, lintelY - 0.3, lintelZ, 3.8, 103);
  addHangingRuinVine(scene, cx - 4.2, terrainHeight(cx - 4.2, cz - 3.4) + 4.6, cz - 3.4, 2.8, 104);

  // Central ancient altar table on top of platform
  const altarY = terrainHeight(cx, cz + 1.2) + 2.1;
  const altarGeo = makeStoneBlock(2.2, 0.7, 1.6, 1300, 0.6);
  const altarMesh = new THREE.Mesh(altarGeo, stoneMat());
  altarMesh.position.set(cx, altarY, cz + 1.2);
  altarMesh.castShadow = true; altarMesh.receiveShadow = true;
  scene.add(altarMesh);
  placed.push(altarMesh);

  // Standing stone stelae flanking front stairs
  placed.push(placeBlock(scene, cx - 3.0, cz - 5.5, 0.7, 2.2, 0.6, 0.08, 1400, 0.5));
  placed.push(placeBlock(scene, cx + 3.0, cz - 5.5, 0.7, 1.8, 0.6, -0.12, 1401, 0.5));

  // A back wall of weathered blocks
  for (let i = 0; i < 4; i++) {
    const bx = cx - 2.8 + i * 1.8;
    const bz = cz + 3.0;
    const bw = 1.6;
    const bh = 2.2 + N.noise2(300 + i, 1) * 0.8;
    const bd = 0.9;
    const ry = (N.noise2(300 + i, 3) - 0.5) * 0.2;
    placed.push(placeBlock(scene, bx, bz, bw, bh, bd, ry, 300 + i, 0.55));
  }

  // A side wall fragment
  for (let i = 0; i < 2; i++) {
    const sx = cx + 4.5;
    const sz = cz - 1.0 + i * 1.6;
    const sw = 0.8;
    const sh = 1.5 + N.noise2(400 + i, 1) * 0.6;
    const sd = 1.1;
    const ry = Math.PI / 2 + (N.noise2(400 + i, 3) - 0.5) * 0.2;
    placed.push(placeBlock(scene, sx, sz, sw, sh, sd, ry, 400 + i, 0.5));
  }

  // Toppled columns lying on the ground
  for (let i = 0; i < 2; i++) {
    const tx = cx - 1.0 + i * 4;
    const tz = cz + 0.5;
    const tlen = 2.5 + N.noise2(500 + i, 1) * 1.0;
    const geo = makeColumn(0.35, tlen, 1.0, 500 + i);
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

  // Rubble: small blocks scattered around the platform
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

  // Moss patches on top of the platform blocks
  for (let i = 0; i < 8; i++) {
    const mx = cx + (rng() - 0.5) * 6;
    const mz = cz + (rng() - 0.5) * 5;
    const my = terrainHeight(mx, mz) + 0.62 + rng() * 0.4;
    addMossPatch(scene, mx, my, mz, 0.4 + rng() * 0.4, 700 + i);
  }

  return { placedCount: placed.length, center: { x: cx, z: cz } };
}
