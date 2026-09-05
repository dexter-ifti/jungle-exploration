// System 1 — Terrain and Path Geometry
// Procedural jungle terrain: winding trail, riverbed, cliff, ruins clearing.
import * as THREE from 'three';

export const WORLD = {
  size: 640,          // terrain extent (m)
  seg: 256,           // resolution
  waterfallZ: -255,   // cliff face location (negative Z = forward)
};

// ---------- deterministic value noise ----------
function makeNoise(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return x - y; case 2: return -x + y;
      case 3: return -x - y; case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      THREE.MathUtils.lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v);
  }
  function fbm(x, y, oct = 5, lac = 2.02, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * noise2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }
  return { noise2, fbm, rand };
}

const N = makeNoise(1337);
export { makeNoise };

// ---------- trail spline: a closed loop where the player can walk
// in either direction and end up at the same point. The trail is a
// circuit: start at the trailhead, meander through the jungle, reach
// the falls (the midpoint of the loop), continue around the back
// side of the world, and return to the trailhead. Walking in either
// direction brings you to the falls.
function buildTrail() {
  const pts = [];
  const n = 280;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const zPhase = (1 - Math.cos(t * Math.PI * 2)) * 0.5;
    const z = THREE.MathUtils.lerp(60, WORLD.waterfallZ + 18, zPhase);
    const baseMeander =
      Math.sin(t * Math.PI * 2.35 + 0.7) * 32 +
      Math.sin(t * Math.PI * 7.1 + 2.3) * 7 +
      Math.sin(t * Math.PI * 13.7) * 2.0 +
      (N.fbm(t * 3.1, 11.3, 3) * 5);
    let x;
    if (t <= 0.5) {
      x = baseMeander;
    } else {
      const returnT = (t - 0.5) / 0.5;
      const returnArc = Math.sin(returnT * Math.PI) * 60;
      const blend = 1 - returnT;
      x = -baseMeander * blend + baseMeander * (1 - blend) + returnArc;
    }
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}

export const TRAIL = buildTrail();
const trailPtsCache = TRAIL.getSpacedPoints(600);

// closest distance from (x,z) to the trail centerline (approx via spaced points)
const grid = new Map();
const CELL = 8;
function key(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }
for (let i = 0; i < trailPtsCache.length; i++) {
  const p = trailPtsCache[i];
  const k = key(p.x, p.z);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(i);
}
export function distToTrail(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = Infinity, bestIdx = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const arr = grid.get(`${cx + dx},${cz + dz}`);
    if (!arr) continue;
    for (const i of arr) {
      const p = trailPtsCache[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) { best = d; bestIdx = i; }
    }
  }
  if (best === Infinity) {
    // fallback coarse scan
    for (let i = 0; i < trailPtsCache.length; i += 4) {
      const p = trailPtsCache[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) { best = d; bestIdx = i; }
    }
  }
  return { dist: Math.sqrt(best), idx: bestIdx };
}
export function trailProgress(x, z) { return distToTrail(x, z).idx / (trailPtsCache.length - 1); }

// ---------- terrain heightfield ----------
export function baseHeight(x, z) {
  // gentle valley roll + medium hills + fine bumps
  let h = 0;
  h += N.fbm(x * 0.008, z * 0.008, 4) * 14;
  h += N.fbm(x * 0.03, z * 0.03, 5) * 3.2;
  h += N.fbm(x * 0.12, z * 0.12, 3) * 0.55;
  h += N.fbm(x * 0.45, z * 0.45, 2) * 0.12;

  // trail corridor: carve a smooth depression along the spline
  const { dist } = distToTrail(x, z);
  const halfW = 2.6 + N.noise2(z * 0.05, 7.7) * 0.8;   // varying width
  if (dist < halfW * 3.5) {
    const t = THREE.MathUtils.clamp(dist / (halfW * 3.5), 0, 1);
    const carve = (1 - t * t) * 1.5;
    h -= carve;
    // micro ruts and footpath unevenness on the tread itself
    if (dist < halfW) h += N.fbm(x * 0.9, z * 0.9, 2) * 0.09;
  }

  // riverbed: runs from the pool at the falls back toward the east/south edge
  const riverX = 46 + N.fbm(z * 0.012, 3.3, 3) * 26;
  const rd = Math.abs(x - riverX);
  const rw = 7 + N.noise2(z * 0.04, 21.2) * 2.5;
  if (rd < rw * 3 && z < 40) {
    const t = THREE.MathUtils.clamp(rd / (rw * 3), 0, 1);
    h -= (1 - t * t * t) * 6.5;
  }

  // ruins/waterfall clearing: broad flat basin near the end of the trail
  const cz = WORLD.waterfallZ + 26, cx = -20;
  const cd = Math.hypot(x - cx, (z - cz) * 0.8);
  if (cd < 62) {
    const t = THREE.MathUtils.smoothstep(cd, 20, 62);
    h = THREE.MathUtils.lerp(h * 0.25 + 1.2, h, t);
  }
  return h;
}

// cliff wall behind the falls
export function cliffHeight(x, z) {
  const front = WORLD.waterfallZ;
  if (z > front + 2) return null;
  // amphitheater-shaped cliff wrapping the clearing
  const cx = 0;
  const spread = Math.max(0, 1 - Math.abs(x - cx) / 130);
  if (spread <= 0) return null;
  // irregular crest: multiple noise octaves so the skyline is jagged, not smooth
  const topY = 40 +
    N.fbm(x * 0.02, 0.5, 3) * 14 +
    N.fbm(x * 0.075, 4.2, 4) * 6 +
    N.fbm(x * 0.22, 8.8, 3) * 1.8;
  const depth = front - z; // how far "into" the wall
  const wallHalf = 16 + N.fbm(x * 0.05, 9.1, 3) * 7;
  if (depth < -wallHalf || depth > wallHalf * 2.4) {
    if (z < front - wallHalf) {
      const t = THREE.MathUtils.clamp((front - wallHalf - z) / 30, 0, 1);
      return topY * THREE.MathUtils.smoothstep(t, 0, 1) * spread;
    }
    return null;
  }
  const t = THREE.MathUtils.clamp(depth / wallHalf, 0, 1.6);
  const yTop = topY * spread;
  const prof = Math.pow(Math.sin(Math.min(t, 1) * Math.PI * 0.5), 0.65);
  // buttresses and gullies: ridged noise across x modulates the face in/out
  const buttress = Math.sin(x * 0.14 + N.fbm(x * 0.03, 2.2, 3) * 4) * 3.2
                 + N.fbm(x * 0.09, z * 0.05, 4) * 4.5;
  const rough = N.fbm(x * 0.11, z * 0.11, 4) * 2.6 + N.fbm(x * 0.4, z * 0.4, 2) * 0.7;
  const base = yTop * prof + buttress * spread * (1 - t * 0.5) + rough * spread
             + (depth > 1 ? yTop * (depth - 1) * 0.35 : 0);
  return base;
}

export function terrainHeight(x, z) {
  const c = cliffHeight(x, z);
  if (c !== null && c > baseHeight(x, z)) return c;
  return baseHeight(x, z);
}

// ---------- procedural ground texture (canvas, no assets) ----------
function makeGroundTexture() {
  const S = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const soil = [68, 50, 34], soilDark = [44, 32, 22], litter = [92, 70, 42],
        mossC = [66, 84, 40], clay = [88, 64, 42];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n1 = N.fbm(u * 24, v * 24, 4);
      const n2 = N.fbm((u - 1) * 24, v * 24, 4);
      const n3 = N.fbm(u * 24, (v - 1) * 24, 4);
      const n4 = N.fbm((u - 1) * 24, (v - 1) * 24, 4);
      const bx = THREE.MathUtils.smoothstep(u, 0.75, 1);
      const by = THREE.MathUtils.smoothstep(v, 0.75, 1);
      const n = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(n1, n2, bx),
        THREE.MathUtils.lerp(n3, n4, by), by ? Math.max(by, 0) : by);
      const grain = N.noise2(x * 0.9, y * 0.9) * 0.5;
      let r, g, b;
      if (n < -0.15) {
        const t = (n + 0.15) / 0.35;
        r = THREE.MathUtils.lerp(soil[0], soilDark[0], -t);
        g = THREE.MathUtils.lerp(soil[1], soilDark[1], -t);
        b = THREE.MathUtils.lerp(soil[2], soilDark[2], -t);
      } else if (n < 0.1) {
        const t = (n + 0.15) / 0.25;
        r = THREE.MathUtils.lerp(soil[0], clay[0], t);
        g = THREE.MathUtils.lerp(soil[1], clay[1], t);
        b = THREE.MathUtils.lerp(soil[2], clay[2], t);
      } else {
        const t = Math.min((n - 0.1) / 0.25, 1);
        r = THREE.MathUtils.lerp(clay[0], litter[0], t);
        g = THREE.MathUtils.lerp(clay[1], litter[1], t);
        b = THREE.MathUtils.lerp(clay[2], litter[2], t);
      }
      // sparse moss speckle
      const m = N.fbm(u * 60, v * 60, 2);
      if (m > 0.32) {
        const k = Math.min((m - 0.32) * 4, 1) * 0.6;
        r = THREE.MathUtils.lerp(r, mossC[0], k);
        g = THREE.MathUtils.lerp(g, mossC[1], k);
        b = THREE.MathUtils.lerp(b, mossC[2], k);
      }
      const d = 1 + grain * 0.28;
      const i = (y * S + x) * 4;
      img.data[i] = r * d; img.data[i + 1] = g * d; img.data[i + 2] = b * d; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Procedural ground normal map for dirt relief, pebbles, and root fibers
function makeGroundNormalTexture() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const hMap = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n1 = N.fbm(u * 28, v * 28, 4) * 0.45;
      const n2 = N.fbm(u * 72, v * 72, 3) * 0.25;
      const pebbles = Math.pow(Math.max(0, N.noise2(x * 1.4, y * 1.4)), 3) * 0.35;
      hMap[y * S + x] = n1 + n2 + pebbles;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xL = (x - 1 + S) % S, xR = (x + 1) % S;
      const yT = (y - 1 + S) % S, yB = (y + 1) % S;
      const dx = (hMap[y * S + xR] - hMap[y * S + xL]) * 2.8;
      const dy = (hMap[yB * S + x] - hMap[yT * S + x]) * 2.8;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = dz / len;
      const i = (y * S + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeRockTexture() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const n = N.fbm(u * 10, v * 10, 5);
    const strata = Math.sin(v * 40 + N.fbm(u * 6, v * 6, 3) * 5) * 0.5;
    const g = 78 + n * 52 + strata * 14 + N.noise2(x * 1.7, y * 1.7) * 12;
    const i = (y * S + x) * 4;
    img.data[i] = g * 1.02; img.data[i + 1] = g * 0.98; img.data[i + 2] = g * 0.9; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- rocks (terrain-relevant) ----------
function makeRockGeometry(rng, scale) {
  // deformed icosahedron with ridged noise displacement
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seed = rng() * 100;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      N.fbm(v.x * 1.4 + seed, v.y * 1.4 + seed, 4) * 0.42 +
      N.fbm(v.z * 3.2 + seed, v.y * 3.2, 3) * 0.16;
    v.multiplyScalar(1 + n);
    v.y *= 0.72; // squat
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.scale(scale, scale * (0.6 + rng() * 0.5), scale);
  return geo;
}

function scatterRocks(scene, count) {
  const rng = (() => { let s = 777; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const mat = new THREE.MeshStandardMaterial({ map: makeRockTexture(), roughness: 0.95, metalness: 0 });
  const geos = [];
  for (let i = 0; i < count; i++) {
    // bias placement: along trail edges, riverbed banks, and cliff base
    let x, z;
    const mode = rng();
    if (mode < 0.45) {
      const t = rng();
      const p = TRAIL.getPoint(t);
      const side = rng() < 0.5 ? -1 : 1;
      const off = (2.8 + rng() * 6) * side;
      const tangent = TRAIL.getTangent(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      x = p.x + normal.x * off; z = p.z + normal.z * off;
    } else if (mode < 0.75 && rng() < 0.8) {
      z = THREE.MathUtils.lerp(WORLD.waterfallZ, 35, rng());
      x = 46 + N.fbm(z * 0.012, 3.3, 3) * 26 + (rng() - 0.5) * 26;
    } else {
      x = (rng() - 0.5) * WORLD.size * 0.9;
      z = (rng() - 0.5) * WORLD.size * 0.9;
    }
    const y = terrainHeight(x, z);
    // keep big rocks off the trail tread
    const { dist: dTrail } = distToTrail(x, z);
    let s = 0.25 + Math.pow(rng(), 2.2) * 2.6;
    if (dTrail < 5 && s > 0.9) { s *= 0.45; }
    const g = makeRockGeometry(rng, s);
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(rng() * 0.5 - 0.25, rng() * Math.PI * 2, rng() * 0.5 - 0.25))
      .setPosition(x, y - s * 0.22, z); // slightly sunk
    geos.push({ g, m });
  }
  const merged = mergeGeometries(geos.map(({ g, m }) => {
    const gg = g.clone().applyMatrix4(m);
    return gg;
  }));
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- surface roots along trail ----------
function makeRootGeometry(rng, length, radius) {
  const segs = 14;
  const radial = 7;
  const pts = [];
  const baseAngle = rng() * Math.PI * 2;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const x = t * length;
    const curve = Math.sin(t * Math.PI * 1.4 + baseAngle) * (length * 0.2);
    const yWave = Math.sin(t * Math.PI * 2) * 0.05;
    pts.push(new THREE.Vector3(x, yWave, curve));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 14, radius, radial, false);
  geo.scale(1.0, 0.45, 1.0); // flatten vertically into ground
  geo.computeVertexNormals();
  return geo;
}

function scatterTrailRoots(scene, count = 50) {
  const rng = (() => { let s = 9991; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const rootMat = new THREE.MeshStandardMaterial({
    color: 0x3d2f21,
    roughness: 0.92,
    metalness: 0.02,
  });
  const geos = [];
  for (let i = 0; i < count; i++) {
    const t = 0.02 + rng() * 0.94;
    const p = TRAIL.getPoint(t);
    const tangent = TRAIL.getTangent(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const side = rng() < 0.5 ? -1 : 1;
    const off = (1.2 + rng() * 2.2) * side;
    const startX = p.x + normal.x * off;
    const startZ = p.z + normal.z * off;
    const rootLen = 2.0 + rng() * 2.5;
    const rootR = 0.09 + rng() * 0.11;
    const g = makeRootGeometry(rng, rootLen, rootR);
    const rotY = Math.atan2(-normal.z * side, -normal.x * side) + (rng() - 0.5) * 0.8;
    const m = new THREE.Matrix4()
      .makeRotationY(rotY)
      .setPosition(startX, terrainHeight(startX, startZ) + 0.03, startZ);
    geos.push({ g, m });
  }
  if (geos.length > 0) {
    const merged = mergeGeometries(geos.map(({ g, m }) => g.clone().applyMatrix4(m)));
    const mesh = new THREE.Mesh(merged, rootMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// minimal geometry merger (positions/normals/uv, non-indexed)
function mergeGeometries(geos) {
  const nonIndexed = geos.map(g => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  });
  let vCount = 0;
  for (const g of nonIndexed) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  let o = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, o);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeVertexNormals();
  return out;
}

// ---------- main build ----------
export async function buildScene() {
  const scene = new THREE.Scene();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  // expose renderer on scene so modules can tune exposure etc.
  scene.userData.renderer = renderer;

  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 900);

  // ----- System 3: lighting and atmosphere (replaces the placeholder) -----
  const { JungleLighting } = await import('./lighting.js');
  const lighting = new JungleLighting(scene);

  // ----- terrain mesh -----
  const size = WORLD.size, seg = WORLD.seg;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // ground texture repeats in world space
  const groundTex = makeGroundTexture();
  groundTex.repeat.set(size / 9, size / 9);

  const groundNorm = makeGroundNormalTexture();
  groundNorm.repeat.set(size / 9, size / 9);

  const cTrail = new THREE.Color(0x9c8262);       // worn earth
  const cLitter = new THREE.Color(0x5d4a2f);      // leaf-litter soil
  const cMoss = new THREE.Color(0x4a5c33);        // mossy ground
  const cWet = new THREE.Color(0x39301f);         // damp dark soil
  const cRiverbed = new THREE.Color(0x4f4636);    // river stones/silt

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    const { dist } = distToTrail(x, z);
    const halfW = 2.6 + N.noise2(z * 0.05, 7.7) * 0.8;
    const riverX = 46 + N.fbm(z * 0.012, 3.3, 3) * 26;
    const rd = Math.abs(x - riverX);
    const slope = Math.abs(terrainHeight(x + 1.2, z) - terrainHeight(x - 1.2, z)) +
                  Math.abs(terrainHeight(x, z + 1.2) - terrainHeight(x, z - 1.2));

    let c = new THREE.Color().copy(cLitter);
    // moss where damper/low and off-trail
    const mossNoise = N.fbm(x * 0.06, z * 0.06, 4);
    if (mossNoise > 0.05 && dist > halfW) c.lerp(cMoss, Math.min((mossNoise - 0.05) * 3.2, 0.85));
    // wet darkening near riverbed and low spots
    if (rd < 16 && z < 40) c.lerp(cWet, Math.min((16 - rd) / 16 * 0.8, 0.8));
    if (y < 1.4) c.lerp(cWet, Math.min((1.4 - y) * 0.4, 0.7));
    // trail tread: clearly worn, compacted, lighter earth with edge transition
    if (dist < halfW * 1.6) {
      const edge = THREE.MathUtils.smoothstep(dist / halfW, 0.75, 1.6);
      c.lerp(cTrail, (1 - edge) * 0.97);
      // puddle darkening in trail dips
      const dip = N.fbm(x * 0.35, z * 0.35, 3);
      if (dip < -0.12 && dist < halfW * 0.8) c.lerp(cWet, Math.min((-dip - 0.12) * 3, 0.65));
      // scattered dry leaves on tread margins
      if (dist > halfW * 0.7) {
        const leaf = N.fbm(x * 0.8 + 40, z * 0.8, 2);
        if (leaf > 0.15) c.lerp(new THREE.Color(0x7a5c34), Math.min((leaf - 0.15) * 2.5, 0.5));
      }
    }
    // rocky tint on steep slopes
    if (slope > 3.4) c.lerp(new THREE.Color(0x6e6a5c), Math.min((slope - 3.4) * 0.12, 0.6));
    // riverbed interior
    if (rd < 7 && z < 40 && y < 0.5) c.lerp(cRiverbed, 0.7);

    // subtle per-vertex value jitter to kill banding
    const j = 1 + (N.noise2(x * 2.3, z * 2.3)) * 0.07;
    colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    normalMap: groundNorm,
    normalScale: new THREE.Vector2(0.85, 0.85),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true; ground.castShadow = false;
  scene.add(ground);

  // ----- cliff wall mesh (separate, rocky material) -----
  const cgeo = new THREE.PlaneGeometry(size, size, seg, seg);
  cgeo.rotateX(-Math.PI / 2);
  const cpos = cgeo.attributes.position;
  const ccolors = new Float32Array(cpos.count * 3);
  let cliffCount = 0;
  for (let i = 0; i < cpos.count; i++) {
    const x = cpos.getX(i), z = cpos.getZ(i);
    const y = terrainHeight(x, z);
    cpos.setY(i, y);
    // detect steep faces via slope
    const sx = Math.abs(terrainHeight(x + 1.2, z) - terrainHeight(x - 1.2, z));
    const sz = Math.abs(terrainHeight(x, z + 1.2) - terrainHeight(x, z - 1.2));
    const steep = Math.max(sx, sz) > 2.4;
    if (steep) {
      cliffCount++;
      const rockTexN = N.fbm(x * 0.09, z * 0.09, 5);
      const g = 0.42 + rockTexN * 0.3 + N.noise2(x * 0.7, z * 0.7) * 0.06;
      // faint green tint low on the wall (damp algae), grey higher up
      const algae = THREE.MathUtils.clamp((14 - y) / 12, 0, 1) * 0.35;
      ccolors[i * 3] = g * (1 - algae * 0.3);
      ccolors[i * 3 + 1] = g * (1 - algae * 0.05);
      ccolors[i * 3 + 2] = g * (1 - algae * 0.45);
    } else {
      ccolors[i * 3] = 1; ccolors[i * 3 + 1] = 1; ccolors[i * 3 + 2] = 1;
    }
  }
  void cliffCount;
  cgeo.setAttribute('color', new THREE.BufferAttribute(ccolors, 3));
  cgeo.computeVertexNormals();
  const rockTex = makeRockTexture();
  rockTex.repeat.set(size / 7, size / 7);
  const cliffMat = new THREE.MeshStandardMaterial({
    map: rockTex, vertexColors: true, roughness: 0.98, metalness: 0,
  });
  const cliffMesh = new THREE.Mesh(cgeo, cliffMat);
  cliffMesh.receiveShadow = true; cliffMesh.castShadow = false;
  scene.add(cliffMesh);

  // ----- scattered terrain rocks -----
  scatterRocks(scene, 260);

  // ----- surface roots winding across trail -----
  scatterTrailRoots(scene, 50);

  // ----- System 2: vegetation (trees, ferns, herbs, logs, moss) -----
  // Imported lazily to avoid a circular import.
  const { populateVegetation } = await import('./vegetation.js');
  populateVegetation(scene);

  // ----- System 4: procedural stone ruins in the clearing -----
  const { placeRuins } = await import('./ruins.js');
  placeRuins(scene);

  // ----- System 5: waterfall, pool, and water effects -----
  const { placeWater } = await import('./water.js');
  const water = placeWater(scene);

  // ----- Walkable guide character at the trailhead -----
  // Procedural Three.js primitives; Blender MCP (blender 4.0.2 + blender-mcp 1.0.1)
  // is installed and can generate a GLTF alternative, but primitives are used
  // to keep zero-external-assets and headless-safe. See src/character.js.
  const { placeCharacter } = await import('./character.js');
  const character = placeCharacter(scene);
  // place at trailhead spawn; main.js will take over positioning each frame
  {
    const p = TRAIL.getPointAt(0.02);
    const y = terrainHeight(p.x, p.z);
    // character faces along trail forward (toward t=0.99 side) so motion is natural
    const f = TRAIL.getTangentAt(0.02);
    const yaw = Math.atan2(f.x, f.z);
    character.setPosition(p.x, y, p.z, yaw);
  }

  // ----- System 7: post-processing (bloom, color grade, vignette) -----
  const { JunglePostprocess } = await import('./postprocess.js');
  const postprocess = new JunglePostprocess(renderer, scene, camera);

  return { scene, camera, renderer, ground, lighting, water, character, postprocess };
}
