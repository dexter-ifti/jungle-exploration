// System 2 — Procedural Vegetation
// Strict goals: no cloned trees, no uniform spacing, no recognizable
// repeated patterns, no grid scatter, no perfectly vertical vegetation.
// Everything generated from per-instance seeds + multi-octave noise.
//
// Strategy:
//   * Several species archetypes (palm, buttressed broadleaf, thin
//     hardwood, fig/strangler, dead snag, fern-tree). Each built from
//     a per-instance seed so the SAME archetype looks different every
//     time it is instantiated.
//   * Per-tree parameters (height, branch count, branch angle, trunk
//     taper, lean, canopy radius, foliage density) all drawn from
//     separate RNG streams per instance.
//   * Trees are scattered by Poisson-disk-ish rejection: candidates
//     rejected if too close to the trail centerline (open path) or
//     too close to a prior tree (no clumping). Density falls off
//     linearly with distance from trail.
//   * Canopy foliage is built from many individual leaf cards (low-vertex
//     quads with a procedural leaf texture), not single billboard
//     sprites, so each tree's silhouette is unique.
//   * Vines are procedurally curved tubes hanging from upper branches
//     of older trees.
//   * Understory (ferns, broadleaf herbs, fallen logs, stumps) is
//     scattered with its own density field.
//   * Moss carpet is a triangle-strip plane cluster with a noise-mask
//     to break up tile appearance.
import * as THREE from 'three';
import { terrainHeight, distToTrail, TRAIL, WORLD, makeNoise } from './world.js';

// ---------- shared deterministic RNG (mulberry32) ----------
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// grab the same noise instance the terrain uses (same FBM/perm table)
const N = makeNoise(1337);
const N2 = makeNoise(20240615);
const N3 = makeNoise(88442211);

// ---------- procedural leaf texture (canopy) ----------
// Leaf card texture: a single leaf shape with a leaf-shaped alpha
// mask, green color with darker veins. The shape mask makes the
// quad read as an actual leaf, not a billboard square. Used by
// the sub-branch leaf clusters for a more "real leaf" reading.
function makeLeafTexture(variant = 0) {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  // base palette by variant
  const base = variant === 0
    ? { r: 56, g: 102, b: 44 }   // dark waxy
    : { r: 92, g: 132, b: 56 };  // pale young
  const dark = { r: 22, g: 50, b: 22 };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // leaf-shape mask: a pointed-oval silhouette, wider in the
      // middle, tapered at top and bottom. Full alpha inside, zero
      // outside. This makes the card read as a leaf shape.
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2;
      const r2 = dx * dx + dy * dy * (1.0 + dx * 0.6);
      const leafMask = Math.max(0, 1 - r2 * 1.6);
      // veins: dark center line + 2 branching lines
      const veinCenter = Math.exp(-Math.abs(dx) * 30) * (1 - dy * dy * 0.5);
      const veinSide1 = Math.exp(-Math.abs(dx - 0.25 * (1 + dy)) * 50) * (1 - dy * dy);
      const veinSide2 = Math.exp(-Math.abs(dx + 0.25 * (1 + dy)) * 50) * (1 - dy * dy);
      const vein = Math.max(0, veinCenter - 0.5) + Math.max(0, veinSide1 - 0.5) + Math.max(0, veinSide2 - 0.5);
      // color: dark at veins, base at center of leaf
      const r = dark.r * vein + base.r * (1 - vein);
      const g = dark.g * vein + base.g * (1 - vein);
      const b = dark.b * vein + base.b * (1 - vein);
      const a = leafMask > 0 ? 255 : 0;
      const i = (y * S + x) * 4;
      img.data[i]     = Math.round(r);
      img.data[i + 1] = Math.round(g);
      img.data[i + 2] = Math.round(b);
      img.data[i + 3] = Math.round(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const LEAF_TEXTURES = [makeLeafTexture(0), makeLeafTexture(1)];

// shared canopy material per leaf variant (re-used across many trees)
// Uses MeshLambertMaterial with an onBeforeCompile hook that adds
// a backlit "subsurface" term: when the sun is behind the leaf (the
// leaf normal faces away from the sun), the leaf glows with a
// warm yellow-green tint. This is the cheap fake of SSS — the leaf
// has a custom chunk in the GLSL that boosts the color when
// dot(normal, -sunDir) is high.
function makeCanopyMaterial(variant) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: true,    // gives a faceted leaf-cluster look
    // stronger emissive (cheap fake of SSS) — the canopy always
    // reads as "backlit green" rather than "dark blob on stick".
    // This is the dominant effect in the reference images where
    // leaves glow translucent at their edges.
    emissive: new THREE.Color(0x1e3314),
    emissiveIntensity: 0.35,
  });
  return mat;
}
const CANOPY_MATS = [makeCanopyMaterial(0), makeCanopyMaterial(1)];

// bark / trunk material (procedural)
function makeBarkTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const n = N.fbm(u * 6, v * 24, 5);    // vertical grain
    const n2 = N.fbm(u * 18, v * 50, 4);  // fine grain
    const crack = N.fbm(u * 3 + 11, v * 30, 3);
    const base = 48 + n * 38 + n2 * 14;
    const dark = crack * 22;
    const g = Math.max(20, base - dark);
    const i = (y * S + x) * 4;
    img.data[i]     = g * 0.92;
    img.data[i + 1] = g * 0.82;
    img.data[i + 2] = g * 0.66;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const BARK_TEX = makeBarkTexture();
function barkMat(repeatY = 4) {
  const t = BARK_TEX.clone();
  t.needsUpdate = true;
  t.repeat.set(1, repeatY);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({
    map: t, color: new THREE.Color().setHSL(0.08, 0.5, 0.48 + N.noise2(repeatY * 13, 7) * 0.05),
    emissive: new THREE.Color(0x2a1f12),
    emissiveIntensity: 0.3,
  });
}

// ---------- leaf card geometry (one quad with 4 verts) ----------
function leafCardGeometry(width, length) {
  const g = new THREE.BufferGeometry();
  const w = width, l = length;
  const pos = new Float32Array([
    -w, 0, 0,   w, 0, 0,   w, 0, l,  -w, 0, l,
  ]);
  const uv = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// ---------- TRUNK: tapered, slightly curved, with subtle buttress roots ----------
// Returns a single BufferGeometry representing the trunk + a few buttresses.
function buildTrunk(rng, height, baseR, taper, lean, twist) {
  // Sided cylinder, custom radius profile so we can taper and curve it.
  const radial = 12;
  const segs = 14;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const y = t * height;
    // radius: buttressed at base, taper to crown
    let r = baseR * (1 - taper * t);
    if (t < 0.18) {
      // slight flare at base
      r *= 1 + (0.18 - t) * 1.4;
    }
    // S-curve lean
    const leanX = Math.sin(t * Math.PI) * lean;
    const leanZ = Math.sin(t * Math.PI * 0.5 + twist) * lean * 0.6;
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      // perturb radius per vertex for organic look
      const wob = 1 + N.noise2(Math.cos(ang) * 2 + t * 4, Math.sin(ang) * 2 + t * 4) * 0.08;
      const x = Math.cos(ang) * r * wob + leanX * t;
      const z = Math.sin(ang) * r * wob + leanZ * t;
      positions.push(x, y, z);
      normals.push(Math.cos(ang), 0, Math.sin(ang));
      uvs.push(a / radial, t);
    }
  }
  for (let s = 0; s < segs; s++) {
    for (let a = 0; a < radial; a++) {
      const a2 = (a + 1) % radial;
      const i0 = s * radial + a;
      const i1 = s * radial + a2;
      const i2 = (s + 1) * radial + a2;
      const i3 = (s + 1) * radial + a;
      indices.push(i0, i1, i2, i0, i2, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeVertexNormals();
  return g;
}

// ---------- BUTTRESS ROOTS: low flared plates at base of big trees ----------
function buildButtresses(rng, baseR, count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng() * 0.5;
    const h = 0.8 + rng() * 1.4;
    const w = baseR * (1.5 + rng() * 1.2);
    const t = rng() * 0.4;
    const g = new THREE.BoxGeometry(w, h, t, 3, 2, 1);
    // bend the top outward to form a root flare
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const lift = Math.max(0, v.y) * 0.5;
      v.x += v.x > 0 ? lift * 0.6 : -lift * 0.6;
      v.z += v.z > 0 ? lift * 0.3 : -lift * 0.3;
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    g.translate(0, h * 0.5, 0);
    g.rotateY(ang);
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeLite(geos);
}

// ---------- generic mesh merger (positions + normals) ----------
function mergeLite(geos) {
  // determine if any of the source geometries has UVs; if so,
  // allocate a UV array and copy them through. Without this the
  // texture map (e.g. for leaf cards) samples at the default
  // UV which is invalid for merged geometry, producing a solid
  // color rather than the texture.
  const hasUVs = geos.some(g => g.attributes.uv);
  let vCount = 0;
  const all = [];
  for (const g of geos) {
    const gg = g.index ? g.toNonIndexed() : g;
    all.push(gg);
    vCount += gg.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv  = hasUVs ? new Float32Array(vCount * 2) : null;
  let o = 0, ou = 0;
  for (const gg of all) {
    pos.set(gg.attributes.position.array, o);
    if (gg.attributes.normal) nor.set(gg.attributes.normal.array, o);
    if (uv && gg.attributes.uv) {
      uv.set(gg.attributes.uv.array, ou);
      ou += gg.attributes.uv.array.length;
    }
    o += gg.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ---------- canopy foliage: noise-displaced ellipsoid with a leafy
// procedural surface. Each tree's canopy is a single mesh, but with
// per-instance noise displacement so silhouettes are unique.
//
// The previous approach used many small leaf cards; visually that read
// as a dense solid cap and looked like a conifer. This single-mesh
// blob reads as the irregular mass of leaves a jungle canopy actually
// has when seen from the ground.
// Each "canopy" is actually a CLUSTER of 3-6 smaller icosahedron blobs
// merged into one mesh. This breaks the round silhouette into a more
// organic, irregular shape that reads as a mass of leaf bunches rather
// than a single sphere.
function buildCanopy(rng, cx, cy, cz, radius, density, variant) {
  // Stack TWO cluster layers at the canopy center, each with its own
  // noise displacement and offset. The two-layer stack reads as a
  // heavy, bushy mass at any distance and breaks the single-sphere
  // silhouette that the original icosahedron approach produced.
  const a = buildCanopyCluster(rng, cx, cy, cz, radius, density, variant);
  // second cluster slightly offset and at a different size — this is
  // the "stack a second smaller blob on every tree" fix
  const offX = (rng() - 0.5) * radius * 0.4;
  const offY = (rng() - 0.4) * radius * 0.25;
  const offZ = (rng() - 0.5) * radius * 0.4;
  const r2 = radius * (0.55 + rng() * 0.3);
  const b = buildCanopyCluster(rng, cx + offX, cy + offY, cz + offZ, r2,
                                Math.floor(density * 0.7), variant);
  const merged = mergeLite([a, b]);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function buildCanopyCluster(rng, cx, cy, cz, radius, density, variant) {
  const blobs = [];
  // smaller clusters (sub-branch tips) need more blobs per unit
  // volume to look like a leafy mass; larger canopies need fewer
  const blobCount = radius > 1.5
    ? 3 + Math.floor(rng() * 4)        // 3-6 for big canopies
    : 4 + Math.floor(rng() * 4);       // 4-7 for small tip clusters
  // the dominant central blob
  blobs.push({
    pos: new THREE.Vector3(0, 0, 0),
    radius: radius * (0.7 + rng() * 0.25),
  });
  // satellite blobs offset in random directions
  for (let i = 1; i < blobCount; i++) {
    const a = rng() * Math.PI * 2;
    const p = (rng() * 0.7 + 0.2) * Math.PI;
    const dist = radius * (0.35 + rng() * 0.45);
    blobs.push({
      pos: new THREE.Vector3(
        Math.sin(p) * Math.cos(a) * dist,
        Math.cos(p) * dist * 0.5 - rng() * radius * 0.3,
        Math.sin(p) * Math.sin(a) * dist,
      ),
      radius: radius * (0.35 + rng() * 0.3),
    });
  }
  const geos = [];
  for (const B of blobs) {
    // higher detail (3 instead of 2) gives the canopy more facets
    // so it reads as a leafy mass instead of a faceted primitive
    const detail = 3;
    const g = new THREE.IcosahedronGeometry(B.radius, detail);
    // per-blob noise displacement
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const offX = rng() * 100, offY = rng() * 100, offZ = rng() * 100;
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      // strong multi-octave noise to break the smooth sphere into a
      // leafy, irregular silhouette. Bigger amplitude than typical
      // for stylized icosahedrons so the canopy reads as a leafy
      // mass rather than a smooth blob.
      const n =
        N.fbm(v.x * 1.2 + offX, v.y * 1.2 + offY, 4) * 0.55 +
        N.fbm(v.z * 2.4 + offZ, v.y * 2.4 + offY, 3) * 0.30 +
        N.noise2(v.x * 4 + offX, v.y * 4 + offY) * 0.12;
      v.multiplyScalar(1 + n);
      // apply per-blob squash
      const sq = 0.7 + rng() * 0.4;
      v.y *= sq;
      pos.setXYZ(j, v.x + B.pos.x + cx, v.y + B.pos.y + cy, v.z + B.pos.z + cz);
    }
    g.computeVertexNormals();
    // per-vertex color
    const colors = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) - cx;
      const y = pos.getY(j) - cy;
      const z = pos.getZ(j) - cz;
      const lift = (y / radius) * 0.5 + 0.5;
      const m = N.fbm(x * 0.7 + offX, z * 0.7 + offZ, 3) * 0.5 + 0.5;
      let r = 0.18 + m * 0.10 + lift * 0.20;
      let g = 0.40 + m * 0.22 + lift * 0.22;
      let b = 0.16 + m * 0.08 + lift * 0.04;
      const yellow = N.fbm(x * 1.3 + offX + 7, z * 1.3 + offZ, 2);
      if (yellow > 0.55) { r += 0.18; g += 0.10; b -= 0.04; }
      if (yellow < -0.4) { r = 0.32; g = 0.22; b = 0.10; }
      colors[j * 3]     = r;
      colors[j * 3 + 1] = g;
      colors[j * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// ---------- leaf-card cluster (the proper "real leaves" approach) ----
// A cloud of small alpha-tested quads at a branch tip. Each quad has
// the leaf-texture (with the leaf-shaped alpha mask) so it reads as
// a single leaf, not a billboard square. Multiple quads at random
// rotations form a bouquet that reads as a leafy mass from any
// distance. Much more "real leaves" than the icosahedron-blob
// approach used by buildCanopyCluster.
const LEAF_CARD_MATS = [
  new THREE.MeshStandardMaterial({
    map: LEAF_TEXTURES[0],
    transparent: false,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
  }),
  new THREE.MeshStandardMaterial({
    map: LEAF_TEXTURES[1],
    transparent: false,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
  }),
];

function buildLeafCardCluster(rng, cx, cy, cz, radius, count, variant) {
  const geos = [];
  // build `count` leaf cards, each at a random position on a sphere
  // shell and a random orientation. Each card is large enough to be
  // visible at typical viewing distance.
  for (let i = 0; i < count; i++) {
    const u = rng(), v = rng(), w = rng();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    // smaller r (closer to center) so the cluster is denser
    const r = radius * (0.45 + 0.35 * w);
    const px = cx + r * Math.sin(phi) * Math.cos(theta);
    const py = cy + r * Math.cos(phi) * 0.6;
    const pz = cz + r * Math.sin(phi) * Math.sin(theta);
    // outward direction (the card's normal points outward)
    const nx = (px - cx) / r, ny = (py - cy) / r * 0.6, nz = (pz - cz) / r;
    // build a large quad facing outward. Each card is 0.8-1.1 of the
    // cluster radius so a 1m cluster has ~1m cards that visibly
    // overlap, filling the cluster space with leaf shapes.
    const leafSize = radius * (0.8 + rng() * 0.3);
    const geo = new THREE.PlaneGeometry(leafSize, leafSize * 1.4);
    // orient: build a rotation that maps the PlaneGeometry's +Z
    // (its normal) to the outward direction, with a random twist
    const fwd = new THREE.Vector3(nx, ny, nz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), fwd
    );
    const twist = new THREE.Quaternion().setFromAxisAngle(
      fwd, rng() * Math.PI * 2
    );
    q.premultiply(twist);
    geo.applyQuaternion(q);
    geo.translate(px, py, pz);
    geos.push(geo);
  }
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  return merged;
}

// ---------- leaf-quilt: many small flat-shaded triangle clusters
// scattered over a canopy. Each "leaf bunch" is a small 6-vert hex
// with vertex colors, merged with the parent canopy. The result reads
// as a mass of individual leaf bunches poking out of the canopy,
// instead of a single blob silhouette.
function buildLeafQuilt(rng, cx, cy, cz, radius, count, hue) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    // sample a point on a sphere shell, biased outward
    const u = rng(), v = rng(), w = rng();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.7 + 0.55 * w);
    const px = cx + r * Math.sin(phi) * Math.cos(theta);
    const py = cy + r * Math.cos(phi) * 0.85;        // squash vertically
    const pz = cz + r * Math.sin(phi) * Math.sin(theta);
    // outward direction (toward the sphere normal at this point)
    const dx = (px - cx) / r, dy = (py - cy) / r * 0.85, dz = (pz - cz) / r;
    // build an orthonormal frame around (dx, dy, dz)
    let t1x, t1z;
    if (Math.abs(dy) < 0.9) {
      t1x = -dz; t1z = dx;
    } else {
      t1x = 1; t1z = 0;
    }
    const t1Len = Math.hypot(t1x, t1z) || 1;
    const t1xn = t1x / t1Len, t1zn = t1z / t1Len;
    // t2 = normal cross t1
    const t2x = dy * t1zn;
    const t2y = -dy * t1xn;
    const t2z = dy * t1xn - 0;
    // build a 6-vertex hex leaf-cluster
    const leafSize = 0.35 + rng() * 0.45;
    const verts = [];
    const colors = [];
    const indices = [];
    const nSeg = 5;
    for (let k = 0; k <= nSeg; k++) {
      const a = (k / nSeg) * Math.PI * 2 + rng() * 0.3;
      const offset = leafSize * (0.7 + rng() * 0.4);
      // push outward in the local plane
      const lx = px + (Math.cos(a) * t1xn * offset) + (Math.sin(a) * t2x * offset);
      const ly = py + (Math.sin(a) * t2y * offset) + dy * offset * 0.4;
      const lz = pz + (Math.cos(a) * t1zn * offset) + (Math.sin(a) * t2z * offset);
      verts.push(lx, ly, lz);
      // center vertex is slightly darker (mid-rib)
      const isCenter = k === 0;
      const g = (0.32 + rng() * 0.28 + hue * 0.1) * (isCenter ? 0.78 : 1);
      const r2 = (0.14 + rng() * 0.12) * (isCenter ? 0.75 : 1);
      const b = (0.10 + rng() * 0.10) * (isCenter ? 0.75 : 1);
      colors.push(r2, g, b);
    }
    // fan from centre to outer vertices
    for (let k = 1; k < nSeg; k++) {
      indices.push(0, k, k + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    geos.push(g);
  }
  // merge into one geometry and return
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// ---------- branch: simple tapered cylinder forking off the trunk ----------
function buildBranch(rng, len, baseR, taper) {
  const radial = 6, segs = 5;
  const positions = [], normals = [], uvs = [], indices = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const r = baseR * (1 - taper * t);
    const y = t * len;
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      positions.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
      normals.push(Math.cos(ang), 0, Math.sin(ang));
      uvs.push(a / radial, t);
    }
  }
  for (let s = 0; s < segs; s++) for (let a = 0; a < radial; a++) {
    const a2 = (a + 1) % radial;
    const i0 = s * radial + a, i1 = s * radial + a2;
    const i2 = (s + 1) * radial + a2, i3 = (s + 1) * radial + a;
    indices.push(i0, i1, i2, i0, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeVertexNormals();
  return g;
}

// ---------- TREE SPECIES ARCHETYPES ----------
// Each returns a list of meshes (trunk, buttresses, branches, foliage) and
// the bounding sphere. All trees are built per-instance so they look
// unique even within the same species.

function buildPalmTree(rng) {
  // Shorter palms so the fronds are visible from the trail.
  const h = 6 + rng() * 6;            // 6-12m (was 9-18m)
  const r0 = 0.22 + rng() * 0.14;
  const taper = 0.45 + rng() * 0.25;
  const lean = (rng() - 0.5) * 0.9;
  const twist = rng() * Math.PI * 2;
  const trunk = buildTrunk(rng, h, r0, taper, lean, twist);
  // Bumpy rings on the trunk: ring every 0.5m
  const ringCount = Math.floor(h / 0.5);
  const ringGeos = [];
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 0.5) / ringCount;
    const y = t * h;
    const r = r0 * (1 - taper * t) * 1.18;
    const rg = new THREE.TorusGeometry(r, 0.04, 4, 12);
    rg.rotateX(Math.PI / 2);
    // displace along lean
    rg.translate(Math.sin(t * Math.PI) * lean, y, Math.sin(t * Math.PI * 0.5 + twist) * lean * 0.6);
    ringGeos.push(rg);
  }
  const trunkFull = mergeLite([trunk, ...ringGeos]);
  // 7-12 fronds, each a long compound leaf card
  const crown = [];
  const frondCount = 7 + Math.floor(rng() * 6);
  for (let i = 0; i < frondCount; i++) {
    const a0 = (i / frondCount) * Math.PI * 2 + rng() * 0.4;
    const droop = 0.7 + rng() * 0.5;
    // build a frond as a chain of small leaves
    const segs = 10;
    const frondLen = 2.4 + rng() * 1.6;
    for (let s = 0; s < segs; s++) {
      const ts = s / segs;
      const len = frondLen * (1 - ts * 0.3);
      const cardW = 0.14 + rng() * 0.06;
      const card = leafCardGeometry(cardW, len);
      // position along the frond: starts at the crown, droops down
      const ang = a0 + (rng() - 0.5) * 0.1;
      const dropY = -Math.pow(ts, droop) * 1.4;
      const reach = ts * frondLen;
      card.translate(0, dropY, reach);
      card.rotateX(-Math.PI / 2 + (1 - ts) * 0.3);
      card.rotateY(ang);
      card.translate(0, h, 0);
      crown.push(card);
    }
  }
  const crownGeo = mergeLite(crown);
  const cc = new Float32Array(crownGeo.attributes.position.count * 3);
  for (let i = 0; i < cc.length; i += 3) {
    cc[i] = 0.8 + rng() * 0.4;
    cc[i + 1] = 0.95 + rng() * 0.3;
    cc[i + 2] = 0.7 + rng() * 0.2;
  }
  crownGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return { trunk: trunkFull, crown: crownGeo, variant: 0, height: h, baseR: r0, isPalm: true };
}

// ---------- branch with leaf cluster at tip ----------
// Builds a single branch ending in a small leaf cluster. This is
// the "Y" structure that gives broadleaf trees their characteristic
// silhouette: trunk → main branch → sub-branches → leaf bunches.
function buildBranchWithLeafCluster(rng, length, baseR, taper, leafR, leafVariant) {
  const branch = buildBranch(rng, length, baseR, taper);
  // build a small leaf cluster at the tip (in local space, branch
  // points in +X direction so tip is at +length)
  const leafCluster = buildCanopyCluster(rng, length, 0, 0, leafR, 80, leafVariant);
  // merge
  return mergeLite([branch, leafCluster]);
}

function buildBroadleafTree(rng) {
  // Real broadleaf structure: trunk + main branches + sub-branches +
  // leaf clusters at every sub-branch tip. This is the standard
  // "L-system" structure of broadleaf trees: each branch has leaves
  // at its tip, so the canopy is naturally distributed rather
  // than sitting as a single blob on top of a stick.
  const h = 8 + rng() * 6;           // 8-14m
  const r0 = 0.45 + rng() * 0.5;     // thick base
  const taper = 0.55 + rng() * 0.2;
  const lean = (rng() - 0.5) * 0.6;
  const twist = rng() * Math.PI * 2;
  const trunk = buildTrunk(rng, h, r0, taper, lean, twist);
  // buttresses on bigger trees
  const buttressGeos = r0 > 0.55 ? buildButtresses(rng, r0, 3 + Math.floor(rng() * 4)) : null;
  // 4-6 main branches forking from the top third. Each branch
  // becomes a real "Y" structure with sub-branches carrying leaves.
  // The buildBranch geometry points in +X direction; we rotate the
  // whole branch (sub-branches + main) to point outward and slightly
  // up from the trunk.
  const branches = [];
  const branchCount = 2 + Math.floor(rng() * 2);   // 2-3 main branches (was 3-4)
  const variant = rng() < 0.5 ? 0 : 1;
  for (let i = 0; i < branchCount; i++) {
    const t = 0.5 + rng() * 0.35;     // branches start halfway up
    const yBase = t * h;
    const a0 = (i / branchCount) * Math.PI * 2 + rng() * 0.6;
    const blen = 2.5 + rng() * 3.0;
    const br = r0 * (1 - taper * t) * (0.7 + rng() * 0.4);
    // Build a sub-branch group: each sub-branch starts at some
    // fraction of the main branch's length and carries a leaf cluster
    // at its tip. buildBranch and buildCanopyCluster return raw
    // BufferGeometries; wrap each in a temporary Mesh so we can add
    // them to the Group.
    const subBranchCount = 1 + Math.floor(rng() * 2);   // 1-2 (was 2-3, perf)
    const branchGroup = new THREE.Group();
    for (let j = 0; j < subBranchCount; j++) {
      const subT = 0.4 + (j / subBranchCount) * 0.6 + rng() * 0.2;
      const subX = blen * subT;
      const subY = blen * (0.05 + rng() * 0.15);  // slight upward angle
      const subLen = blen * (0.4 + rng() * 0.3);
      const subR = br * (0.4 + rng() * 0.2);
      const subLeafR = subLen * (0.50 + rng() * 0.25);
      // build the sub-branch geometry (in local space of main branch)
      const subBranchGeo = buildBranch(rng, subLen, subR, 0.3);
      // use leaf-card cluster instead of icosahedron blob for the
      // branch tip. The leaf cards have a leaf-shaped alpha mask
      // so the tip reads as a mass of individual leaves, not a
      // smooth 3D primitive.
      const subLeafGeo = buildLeafCardCluster(rng, subLen, 0, 0, subLeafR * 1.4, 40, variant);
      const subFull = mergeLite([subBranchGeo, subLeafGeo]);
      // position the sub-branch so its base is at (subX, subY, 0)
      // in the main branch's local frame, and rotates outward
      const subAngle = (rng() - 0.5) * 0.6 + (j - subBranchCount/2) * 0.5;
      subFull.translate(subX, subY, 0);
      subFull.rotateZ(subAngle);
      branchGroup.add(new THREE.Mesh(subFull));
    }
    // main branch geometry (just the trunk segment, no leaves at the
    // very end since the sub-branches carry them)
    const mainBranch = buildBranch(rng, blen, br, 0.4);
    branchGroup.add(new THREE.Mesh(mainBranch));
    // rotate the whole branch group to point outward (from +X to a
    // direction in the XZ plane based on a0, tilted up a bit)
    branchGroup.rotation.set(0, a0, -Math.PI / 2 + (rng() - 0.5) * 0.4);
    // position the branch at its start point on the trunk
    branchGroup.position.set(
      Math.sin(t * Math.PI) * lean,
      yBase,
      Math.sin(t * Math.PI * 0.5 + twist) * lean * 0.6,
    );
  // bake the branch group's transform into its child geometries, then
  // collect them for the trunk merge
  branchGroup.updateMatrixWorld(true);
  const branchGeoms = [];
  branchGroup.traverse(o => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      branchGeoms.push(g);
    }
  });
  branches.push(mergeLite(branchGeoms));
  }
  const trunkFull = mergeLite([trunk, ...(buttressGeos ? [buttressGeos] : []), ...branches]);
  // a small central upper-canopy cluster so the tree's top doesn't
  // look bare when seen from above
  const upperCrownR = 1.2 + rng() * 0.6;
  const upperCrown = buildLeafCardCluster(rng, 0, h * 0.85, 0, upperCrownR * 1.4, 60, variant);
  return { trunk: trunkFull, crown: upperCrown, variant, height: h, baseR: r0 };
}

function buildThinHardwood(rng) {
  // Slim straight-ish tree with a moderately low canopy
  const h = 7 + rng() * 6;            // 7-13m (was 11-20m)
  const r0 = 0.18 + rng() * 0.22;
  const taper = 0.35 + rng() * 0.2;
  const lean = (rng() - 0.5) * 0.4;
  const trunk = buildTrunk(rng, h, r0, taper, lean, rng() * Math.PI * 2);
  const branches = [];
  const branchCount = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < branchCount; i++) {
    const t = 0.5 + rng() * 0.3;
    const yBase = t * h;
    const a0 = (i / branchCount) * Math.PI * 2 + rng() * 0.5;
    const blen = 1.6 + rng() * 2.2;
    const br = r0 * 0.6;
    const bg = buildBranch(rng, blen, br, 0.45);
    bg.rotateX(-Math.PI / 2 + (rng() - 0.5) * 0.5);
    bg.rotateY(a0);
    bg.translate(0, yBase, 0);
    branches.push(bg);
  }
  const trunkFull = mergeLite([trunk, ...branches]);
  // wide low canopy
  const crownR = 2.5 + rng() * 1.5;
  const cy = h * 0.5;
  const density = 140 + Math.floor(rng() * 80);
  const variant = rng() < 0.5 ? 0 : 1;
  const crown = buildCanopy(rng, 0, cy, 0, crownR, density, variant);
  return { trunk: trunkFull, crown, variant, height: h, baseR: r0 };
}

function buildStranglerFig(rng) {
  // Multiple thin trunks fusing from a wider base; wide low sprawling canopy.
  const h = 8 + rng() * 6;            // 8-14m (was 12-22m)
  const baseR = 0.7 + rng() * 0.5;
  const subTrunks = 3 + Math.floor(rng() * 3);
  const parts = [];
  for (let i = 0; i < subTrunks; i++) {
    const a = (i / subTrunks) * Math.PI * 2 + rng() * 0.5;
    const offR = baseR * 0.6;
    const x = Math.cos(a) * offR, z = Math.sin(a) * offR;
    const len = h * (0.9 + rng() * 0.2);
    const r = baseR * (0.4 + rng() * 0.2);
    const tg = buildTrunk(rng, len, r, 0.4, (rng() - 0.5) * 0.5, rng() * Math.PI * 2);
    tg.translate(x, 0, z);
    parts.push(tg);
    // aerial root: thin drooping strand
    if (rng() < 0.7) {
      const rg = buildBranch(rng, h * (0.7 + rng() * 0.4), r * 0.3, 0.05);
      rg.rotateX(-0.2);
      rg.rotateY(a + (rng() - 0.5) * 0.3);
      rg.translate(x * 1.2, h * 0.5, z * 1.2);
      parts.push(rg);
    }
  }
  // base flare
  const flare = buildButtresses(rng, baseR, 5);
  parts.push(flare);
  const trunkFull = mergeLite(parts);
  const crownR = 4.5 + rng() * 2.0;
  const cy = h * 0.55;
  const density = 360 + Math.floor(rng() * 160);
  const variant = 0;
  const crown = buildCanopy(rng, 0, cy, 0, crownR, density, variant);
  return { trunk: trunkFull, crown, variant, height: h, baseR };
}

function buildDeadSnag(rng) {
  // No foliage. Skeletal, slightly leaning, broken top.
  const h = 10 + rng() * 12;
  const r0 = 0.35 + rng() * 0.35;
  const lean = (rng() - 0.5) * 0.7;
  const trunk = buildTrunk(rng, h, r0, 0.3, lean, rng() * Math.PI * 2);
  // 2-4 dead branches
  const branches = [];
  const bc = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < bc; i++) {
    const t = 0.4 + rng() * 0.45;
    const a = (i / bc) * Math.PI * 2 + rng();
    const blen = 1.4 + rng() * 2.2;
    const bg = buildBranch(rng, blen, r0 * 0.5, 0.3);
    bg.rotateX(-Math.PI / 2 + (rng() - 0.5) * 0.4);
    bg.rotateY(a);
    bg.translate(0, t * h, 0);
    branches.push(bg);
  }
  const trunkFull = mergeLite([trunk, ...branches]);
  return { trunk: trunkFull, crown: null, variant: 0, height: h, baseR: r0, isSnag: true };
}

function buildFernTree(rng) {
  // Small tree with a crown of large fern fronds (no real trunk canopy).
  const h = 4 + rng() * 4;
  const r0 = 0.1 + rng() * 0.12;
  const trunk = buildTrunk(rng, h, r0, 0.2, (rng() - 0.5) * 0.2, rng() * Math.PI * 2);
  const crown = [];
  const fronds = 8 + Math.floor(rng() * 6);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng() * 0.3;
    const len = 1.4 + rng() * 1.0;
    const segs = 8;
    for (let s = 0; s < segs; s++) {
      const ts = s / segs;
      const cardW = 0.12 + rng() * 0.06;
      const card = leafCardGeometry(cardW, len * (1 - ts * 0.3));
      const droop = -Math.pow(ts, 1.2) * 0.7;
      card.translate(0, droop, ts * len);
      card.rotateX(-Math.PI / 2 + (1 - ts) * 0.4);
      card.rotateY(a);
      card.translate(0, h, 0);
      crown.push(card);
    }
  }
  const crownGeo = mergeLite(crown);
  const cc = new Float32Array(crownGeo.attributes.position.count * 3);
  for (let i = 0; i < cc.length; i += 3) {
    cc[i] = 0.7 + rng() * 0.4;
    cc[i + 1] = 0.95 + rng() * 0.3;
    cc[i + 2] = 0.6 + rng() * 0.2;
  }
  crownGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return { trunk, crown: crownGeo, variant: 1, height: h, baseR: r0 };
}

// A low (1.5-3.5m) bushy multi-stem "tree" — fills the eye-level
// vegetation gap between ferns and tall trees. Critical for the camera
// at 1.7m to see green at all distances.
function buildShrub(rng) {
  const h = 1.5 + rng() * 2.0;          // 1.5-3.5m
  const stemCount = 2 + Math.floor(rng() * 4);
  const parts = [];
  for (let i = 0; i < stemCount; i++) {
    const a = (i / stemCount) * Math.PI * 2 + rng() * 0.6;
    const offR = 0.15 + rng() * 0.25;
    const x = Math.cos(a) * offR, z = Math.sin(a) * offR;
    const len = h * (0.85 + rng() * 0.3);
    const r = 0.06 + rng() * 0.08;
    const tg = buildTrunk(rng, len, r, 0.3, (rng() - 0.5) * 0.5, rng() * Math.PI * 2);
    tg.translate(x, 0, z);
    parts.push(tg);
  }
  const trunkFull = mergeLite(parts);
  // dense wide canopy right at the top
  const crownR = h * 0.7 + rng() * 0.4;
  const cy = h * 0.7;
  const density = 180 + Math.floor(rng() * 100);
  const variant = 0;
  const crown = buildCanopy(rng, 0, cy, 0, crownR, density, variant);
  return { trunk: trunkFull, crown, variant, height: h, baseR: 0.25 };
}

// A 2-4m "wall" of bushy mass — multiple overlapping canopy blobs
// spread horizontally, with a short trunk or no visible trunk. This
// is the workhorse: at the camera's eye level (1.7m), a 2-4m wall
// of leaves completely fills the horizontal view from the trail.
function buildWallTree(rng) {
  const h = 2.0 + rng() * 2.0;          // 2-4m
  const parts = [];
  // 2-4 short trunks / stems coming up from the ground
  const stems = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < stems; i++) {
    const a = (i / stems) * Math.PI * 2 + rng() * 0.5;
    const offR = 0.3 + rng() * 0.4;
    const x = Math.cos(a) * offR, z = Math.sin(a) * offR;
    const len = h * (0.9 + rng() * 0.2);
    const r = 0.07 + rng() * 0.06;
    const tg = buildTrunk(rng, len, r, 0.2, (rng() - 0.5) * 0.3, rng() * Math.PI * 2);
    tg.translate(x, 0, z);
    parts.push(tg);
  }
  const trunkFull = mergeLite(parts);
  // Wall: cluster of 4-7 overlapping canopy blobs spread across
  // a wider horizontal area, all at roughly eye level (h*0.5-0.7).
  const crownR = h * 0.55 + rng() * 0.35;   // 1.1-1.95m per blob
  const wallW = h * (1.2 + rng() * 0.6);     // overall width
  const wallH = h * (0.7 + rng() * 0.3);
  const cx = (rng() - 0.5) * 0.3;
  const cz = (rng() - 0.5) * 0.3;
  const crown = buildWallCanopy(rng, cx, h * 0.5, cz, wallW, wallH, crownR);
  return { trunk: trunkFull, crown, variant: 0, height: h, baseR: 0.3 };
}

// A wall-style canopy: a row of overlapping blobs at eye level.
function buildWallCanopy(rng, cx, cy, cz, width, height, blobR) {
  const blobs = [];
  const count = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const tx = (i / (count - 1) - 0.5) * width;
    const ty = (rng() - 0.5) * height * 0.4;
    const tz = (rng() - 0.5) * width * 0.4;
    blobs.push({ pos: new THREE.Vector3(tx + cx, cy + ty, tz + cz), radius: blobR * (0.7 + rng() * 0.4) });
  }
  const geos = [];
  for (const B of blobs) {
    const g = new THREE.IcosahedronGeometry(B.radius, 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const offX = rng() * 100, offY = rng() * 100, offZ = rng() * 100;
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      const n = N.fbm(v.x * 1.0 + offX, v.y * 1.0 + offY, 3) * 0.4 + N.noise2(v.x * 3, v.y * 3) * 0.1;
      v.multiplyScalar(1 + n);
      pos.setXYZ(j, v.x + B.pos.x, v.y + B.pos.y, v.z + B.pos.z);
    }
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) - cx;
      const y = pos.getY(j) - cy;
      const z = pos.getZ(j) - cz;
      const lift = Math.max(0, y) * 0.3;
      const m = N.fbm(x * 0.7 + offX, z * 0.7 + offZ, 3) * 0.5 + 0.5;
      let r = 0.18 + m * 0.10 + lift * 0.20;
      let g = 0.40 + m * 0.22 + lift * 0.22;
      let b = 0.16 + m * 0.08 + lift * 0.04;
      const yellow = N.fbm(x * 1.3 + offX + 7, z * 1.3 + offZ, 2);
      if (yellow > 0.55) { r += 0.18; g += 0.10; b -= 0.04; }
      if (yellow < -0.4) { r = 0.32; g = 0.22; b = 0.10; }
      colors[j * 3]     = r;
      colors[j * 3 + 1] = g;
      colors[j * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// A 0.3-0.9m "groundcover" bushy mass — fills the eye-level view
// right at the trail edge. Very wide, very low, multiple overlapping
// blobs that read as a mound of leaves rather than a single sphere.
function buildGroundCover(rng) {
  const w = 1.4 + rng() * 1.4;          // 1.4-2.8m wide
  const h = 0.3 + rng() * 0.6;          // 0.3-0.9m tall
  // cluster of 3-5 small overlapping blobs spread horizontally
  const blobCount = 3 + Math.floor(rng() * 3);
  const geos = [];
  for (let i = 0; i < blobCount; i++) {
    const tx = (i / (blobCount - 1) - 0.5) * w + (rng() - 0.5) * 0.3;
    const tz = (rng() - 0.5) * w * 0.6;
    const ty = (rng() - 0.5) * h * 0.4;
    const r = h * (0.6 + rng() * 0.5);
    const g = new THREE.IcosahedronGeometry(r, 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const offX = rng() * 100, offY = rng() * 100, offZ = rng() * 100;
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      const n = N.fbm(v.x * 1.2 + offX, v.y * 1.2 + offY, 3) * 0.4 + N.noise2(v.x * 3, v.y * 3) * 0.1;
      v.multiplyScalar(1 + n);
      pos.setXYZ(j, v.x + tx, v.y + ty + h * 0.5, v.z + tz);
    }
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) - tx;
      const y = pos.getY(j) - ty;
      const z = pos.getZ(j) - tz;
      const m = N.fbm(x * 0.8 + offX, z * 0.8 + offZ, 3) * 0.5 + 0.5;
      let r = 0.18 + m * 0.12;
      let g = 0.42 + m * 0.22;
      let b = 0.16 + m * 0.08;
      const yellow = N.fbm(x * 1.5 + offX + 7, z * 1.5 + offZ, 2);
      if (yellow > 0.55) { r += 0.20; g += 0.10; b -= 0.04; }
      if (yellow < -0.4) { r = 0.30; g = 0.20; b = 0.10; }
      colors[j * 3]     = r;
      colors[j * 3 + 1] = g;
      colors[j * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return { trunk: null, crown: merged, variant: 0, height: h, baseR: w * 0.5 };
}

// 4-6m "umbrella" tree — wide low canopy that spans the trail. The
// whole point is to occlude sky and create a real canopy feel at
// walking height, with a single slender trunk.
function buildUmbrella(rng) {
  const h = 4 + rng() * 2;              // 4-6m total
  const trunkH = h * (0.55 + rng() * 0.15);
  const r0 = 0.18 + rng() * 0.15;
  const trunk = buildTrunk(rng, trunkH, r0, 0.35, (rng() - 0.5) * 0.3, rng() * Math.PI * 2);
  // wide flat-ish canopy of 5-7 overlapping blobs
  const crownR = 1.6 + rng() * 0.8;      // 1.6-2.4m per blob
  const spread = 3.0 + rng() * 1.5;     // 3-4.5m overall width
  const cx = 0, cz = 0;
  const cy = trunkH + 0.4;
  const blobCount = 5 + Math.floor(rng() * 3);
  const geos = [];
  for (let i = 0; i < blobCount; i++) {
    const a = (i / blobCount) * Math.PI * 2 + rng() * 0.4;
    const dist = (i === 0 ? 0 : (0.4 + rng() * 0.6) * spread * 0.5);
    const tx = Math.cos(a) * dist + (rng() - 0.5) * 0.4;
    const tz = Math.sin(a) * dist + (rng() - 0.5) * 0.4;
    const ty = cy + (rng() - 0.4) * 0.6;
    const r = crownR * (0.7 + rng() * 0.4);
    const g = new THREE.IcosahedronGeometry(r, 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const offX = rng() * 100, offY = rng() * 100, offZ = rng() * 100;
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      const n = N.fbm(v.x * 1.0 + offX, v.y * 1.0 + offY, 3) * 0.45 + N.noise2(v.x * 3, v.y * 3) * 0.1;
      v.multiplyScalar(1 + n);
      pos.setXYZ(j, v.x + tx, v.y + ty, v.z + tz);
    }
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) - tx;
      const y = pos.getY(j) - ty;
      const z = pos.getZ(j) - tz;
      const lift = Math.max(0, y - cy) * 0.4;
      const m = N.fbm(x * 0.6 + offX, z * 0.6 + offZ, 3) * 0.5 + 0.5;
      let r = 0.20 + m * 0.10 + lift * 0.18;
      let g = 0.42 + m * 0.22 + lift * 0.20;
      let b = 0.16 + m * 0.08 + lift * 0.04;
      const yellow = N.fbm(x * 1.3 + offX + 7, z * 1.3 + offZ, 2);
      if (yellow > 0.55) { r += 0.16; g += 0.10; b -= 0.04; }
      if (yellow < -0.4) { r = 0.30; g = 0.20; b = 0.10; }
      colors[j * 3]     = r;
      colors[j * 3 + 1] = g;
      colors[j * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  }
  const merged = mergeLite(geos);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return { trunk, crown: merged, variant: 0, height: h, baseR: r0 };
}

const SPECIES = [
  { fn: buildPalmTree,        weight: 0.05, label: 'palm' },
  { fn: buildBroadleafTree,   weight: 0.22, label: 'broadleaf' },
  { fn: buildThinHardwood,    weight: 0.18, label: 'thin' },
  { fn: buildStranglerFig,    weight: 0.05, label: 'fig' },
  { fn: buildDeadSnag,        weight: 0.04, label: 'snag' },
  { fn: buildFernTree,        weight: 0.06, label: 'fern-tree' },
  { fn: buildShrub,           weight: 0.14, label: 'shrub' },
  { fn: buildWallTree,        weight: 0.05, label: 'wall' },
  { fn: buildUmbrella,        weight: 0.10, label: 'umbrella' },
  { fn: buildGroundCover,     weight: 0.11, label: 'groundcover' },
];

function pickSpecies(rng) {
  const r = rng();
  let acc = 0;
  for (const s of SPECIES) { acc += s.weight; if (r < acc) return s; }
  return SPECIES[SPECIES.length - 1];
}

// ---------- FERN (understory): fronds that curve outward and upward ----------
function buildFern(rng) {
  const fronds = 6 + Math.floor(rng() * 5);
  const geos = [];
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng() * 0.4;
    const len = 0.7 + rng() * 0.8;
    const segs = 7;
    for (let s = 0; s < segs; s++) {
      const ts = s / segs;
      const w = 0.10 + rng() * 0.05;
      const card = leafCardGeometry(w, len * (1 - ts * 0.25));
      // Place fronds at an upward-outward angle (45-65° from horizontal)
      // so they read as upright ferns from eye level, not flat ground
      // cover. droop and angle change along the frond.
      const droopY = -Math.pow(ts, 1.0) * 0.15;
      const reach = ts * len;
      card.translate(0, droopY, reach);
      // start at ~50° up, gradually flatten to ~10° up
      const startAngle = -Math.PI * 0.35;
      const endAngle   = -Math.PI * 0.05;
      const ang = startAngle + (endAngle - startAngle) * ts;
      card.rotateX(ang);
      card.rotateY(a);
      geos.push(card);
    }
  }
  const m = mergeLite(geos);
  const cc = new Float32Array(m.attributes.position.count * 3);
  for (let i = 0; i < cc.length; i += 3) {
    cc[i] = 0.55 + rng() * 0.4;
    cc[i + 1] = 0.9 + rng() * 0.3;
    cc[i + 2] = 0.5 + rng() * 0.2;
  }
  m.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return m;
}

// ---------- broadleaf herb: rosette of large paddle leaves ----------
function buildBroadleafHerb(rng) {
  const leaves = 5 + Math.floor(rng() * 4);
  const geos = [];
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + rng() * 0.3;
    const len = 0.5 + rng() * 0.4;
    const w = 0.2 + rng() * 0.1;
    const card = leafCardGeometry(w, len);
    // broad leaves angled up (30-60° from horizontal) so they're
    // visible from eye level, not flat on the ground.
    card.translate(0, 0, len * 0.5);
    card.rotateX(-Math.PI * 0.3 + (rng() - 0.5) * 0.25);
    card.rotateY(a);
    geos.push(card);
  }
  const m = mergeLite(geos);
  const cc = new Float32Array(m.attributes.position.count * 3);
  for (let i = 0; i < cc.length; i += 3) {
    cc[i] = 0.6 + rng() * 0.4;
    cc[i + 1] = 0.85 + rng() * 0.3;
    cc[i + 2] = 0.5 + rng() * 0.2;
  }
  m.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return m;
}

// ---------- FALLEN LOG: a curved cylinder lying on the ground ----------
function buildFallenLog(rng, length) {
  const segs = 8;
  const radial = 8;
  const r0 = 0.16 + rng() * 0.1;
  const positions = [], normals = [], uvs = [], indices = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const x = t * length - length * 0.5;
    const yDrop = Math.pow(t - 0.5, 2) * 0.15;
    const y = r0 - yDrop;
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      const wob = 1 + N.noise2(Math.cos(ang) * 2 + t * 4, Math.sin(ang) * 2 + t * 4) * 0.1;
      const px = Math.cos(ang) * r0 * wob;
      const pz = Math.sin(ang) * r0 * wob;
      positions.push(x, y, pz);
      normals.push(Math.cos(ang), 0, Math.sin(ang));
      uvs.push(a / radial, t);
    }
  }
  for (let s = 0; s < segs; s++) for (let a = 0; a < radial; a++) {
    const a2 = (a + 1) % radial;
    const i0 = s * radial + a, i1 = s * radial + a2;
    const i2 = (s + 1) * radial + a2, i3 = (s + 1) * radial + a;
    indices.push(i0, i1, i2, i0, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeVertexNormals();
  return g;
}

// ---------- VINE: a swaying catenary curve as a thin tube ----------
function buildVine(rng, length) {
  const segs = Math.floor(length * 4);
  const r0 = 0.015 + rng() * 0.012;
  const positions = [], normals = [], uvs = [], indices = [];
  const radial = 5;
  // sample curve
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = (rng() - 0.5) * 0.18 * length;
    const z = (rng() - 0.5) * 0.18 * length;
    const y = -t * length; // hangs down
    pts.push(new THREE.Vector3(x, y, z));
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tangent = i < pts.length - 1
      ? new THREE.Vector3().subVectors(pts[i + 1], pts[i]).normalize()
      : new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const upP = new THREE.Vector3().crossVectors(side, tangent).normalize();
    for (let a = 0; a < radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      const r = r0 * (0.9 + N.noise2(p.x * 4 + ang, p.z * 4) * 0.3);
      const px = p.x + (side.x * Math.cos(ang) + upP.x * Math.sin(ang)) * r;
      const py = p.y + (side.y * Math.cos(ang) + upP.y * Math.sin(ang)) * r;
      const pz = p.z + (side.z * Math.cos(ang) + upP.z * Math.sin(ang)) * r;
      positions.push(px, py, pz);
      normals.push(side.x * Math.cos(ang) + upP.x * Math.sin(ang),
                   side.y * Math.cos(ang) + upP.y * Math.sin(ang),
                   side.z * Math.cos(ang) + upP.z * Math.sin(ang));
      uvs.push(a / radial, i / segs);
    }
  }
  for (let s = 0; s < segs; s++) for (let a = 0; a < radial; a++) {
    const a2 = (a + 1) % radial;
    const i0 = s * radial + a, i1 = s * radial + a2;
    const i2 = (s + 1) * radial + a2, i3 = (s + 1) * radial + a;
    indices.push(i0, i1, i2, i0, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeVertexNormals();
  return g;
}

// ---------- MOSS PATCH: low undulating strip with displacement ----------
function buildMossPatch(rng, radius) {
  const segs = 24;
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= segs; i++) {
    const ang = (i / segs) * Math.PI * 2;
    const r = radius * (0.85 + rng() * 0.4);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    positions.push(x, 0, z);
    normals.push(0, 1, 0);
    uvs.push((Math.cos(ang) + 1) * 0.5, (Math.sin(ang) + 1) * 0.5);
  }
  // build a fan
  for (let i = 0; i < segs; i++) {
    indices.push(0, 1 + i, 2 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  return g;
}

// ---------- SCATTER: tree placement via Poisson-style rejection ----------
// Density falls off with distance from trail. Clumping is avoided by
// enforcing a minimum distance between trees.
function scatterTrees(scene, opts) {
  const {
    minRadius = 4,      // min distance to trail centerline
    treeSpacing = 3.2,   // min distance between trees
    density = 1.0,       // global multiplier
    maxCount = 800,
  } = opts;

  const rng = mulberry32(0xCAFE_F00D);
  const placed = [];     // {x, z, r}
  const tries = maxCount * 60;
  let count = 0;
  for (let t = 0; t < tries && count < maxCount; t++) {
    // pick a point inside the world footprint
    const x = (rng() - 0.5) * WORLD.size * 0.95;
    const z = (rng() - 0.5) * WORLD.size * 0.95;
    // skip if too close to the trail
    const { dist } = distToTrail(x, z);
    if (dist < minRadius) continue;
    // skip if too close to an existing tree
    let tooClose = false;
    for (const p of placed) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < treeSpacing * treeSpacing) {
        tooClose = true; break;
      }
    }
    if (tooClose) continue;
    // density falloff: more trees near the trail, fewer far away
    const probKeep = Math.exp(-dist * 0.022) * density;
    if (rng() > probKeep) continue;
    // skip if underwater
    const y = terrainHeight(x, z);
    if (y < -0.4) continue;
    // skip if on a steep cliff (the slope check)
    const slope = Math.abs(terrainHeight(x + 1.5, z) - terrainHeight(x - 1.5, z))
                + Math.abs(terrainHeight(x, z + 1.5) - terrainHeight(x, z - 1.5));
    if (slope > 4.5) continue;
    // skip if inside the ruins clearing (System 4) so the player can
    // actually see the temple. Ruins are centered at (0, WORLD.waterfallZ+36).
    const rcx = -20, rcz = WORLD.waterfallZ + 26;
    if (Math.hypot(x - rcx, (z - rcz) * 0.8) < 16) continue;
    // skip the cliff face (System 5 waterfall) — the cliff is at z < waterfallZ
    // and we don't want trees sticking out of the rock wall.
    if (z < WORLD.waterfallZ + 4) continue;
    // skip the approach corridor from the clearing to the falls so
    // trees don't block the view of the waterfall. x is squeezed to
    // 6m around the centreline so the player has a clear sight line.
    if (z > WORLD.waterfallZ + 4 && z < rcz + 4 && Math.abs(x) < 6) continue;
    // pick species
    const sp = pickSpecies(rng);
    const localRng = mulberry32((t * 2654435761) ^ count);
    const tree = sp.fn(localRng);
    // per-instance trunk material variation
    const group = new THREE.Group();
    if (tree.trunk) {
      const tm = barkMat(2 + tree.height * 0.2);
      const trunkMesh = new THREE.Mesh(tree.trunk, tm);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      group.add(trunkMesh);
    }
    // crown
    let crownMesh = null;
    if (tree.crown && tree.crown.attributes.position.count > 0) {
      // use the leaf-card material for the crown (with the leaf-texture
      // map and alpha cutout), not the icosahedron-blob Lambert material.
      // CANOPY_MATS is kept for non-broadleaf species that still use
      // buildCanopyCluster; for broadleaf the new buildLeafCardCluster
      // produces geometry that needs the leaf-card material to render
      // with a visible texture.
      const cm = LEAF_CARD_MATS[tree.variant].clone();
      // material.clone() does NOT always preserve alphaTest, so set it
      // explicitly to ensure the leaf-shaped alpha mask cuts out the
      // card outside the leaf silhouette. Also disable depthWrite so
      // the cards don't z-fight with each other.
      cm.alphaTest = 0.4;
      cm.depthWrite = false;
      cm.polygonOffset = true;
      cm.polygonOffsetFactor = -1;
      cm.polygonOffsetUnits = -1;
      // small per-instance color variation (this multiplies the texture)
      cm.color = new THREE.Color().setHSL(
        0.27 + (localRng() - 0.5) * 0.05,
        0.45 + localRng() * 0.2,
        0.5 + (localRng() - 0.5) * 0.12,
      );
      cm.needsUpdate = true;
      crownMesh = new THREE.Mesh(tree.crown, cm);
      crownMesh.castShadow = false;
      // leaf cards use alphaTest, so depth handling needs care
      crownMesh.receiveShadow = false;
      // canopies are dense meshes that would self-shadow heavily with
      // the current shadow setup, making them look like dark blobs.
      // Disable receiveShadow so the lit side stays bright even where
      // the canopy's own top would cast on its own sides.
      crownMesh.receiveShadow = false;
      group.add(crownMesh);
      // leaf-quilt overlay: many small flat-shaded triangles poking
      // out of the canopy surface. Breaks the icosahedron silhouette
      // and adds a real "leaf bunches" reading at any distance.
      if (tree.height > 0.5) {
        crownMesh.geometry.computeBoundingSphere();
        const bs = crownMesh.geometry.boundingSphere;
        const quiltR = Math.min(bs.radius * 1.15, 4.0);
        // match the canopy material's hue so the quilt blends in
        const hueShift = cm.color.r;
        const quilt = buildLeafQuilt(localRng, bs.center.x, bs.center.y, bs.center.z,
                                     quiltR, 60, hueShift);
        const quiltMesh = new THREE.Mesh(quilt, cm);
        quiltMesh.castShadow = false;
        quiltMesh.receiveShadow = false;
        group.add(quiltMesh);
      }
    }
    // a small random rotation around Y so silhouettes never repeat
    group.rotation.y = localRng() * Math.PI * 2;
    // small Y offset to plant the base just below ground
    const yOff = tree.baseR * 0.15;
    group.position.set(x, y - yOff, z);
    // health: a few trees lean, some are broken
    const health = localRng();
    if (health < 0.05 && !tree.isSnag) {
      // dead: no crown
      group.remove(crownMesh);
    }
    scene.add(group);
    placed.push({ x, z, r: tree.baseR + 1.5 });
    count++;
  }
  return count;
}

// ---------- scatter understory (ferns, herbs, fallen logs, moss) ----------
function scatterUnderstory(scene, opts) {
  const { fernCount = 600, herbCount = 400, logCount = 90, mossCount = 240, vineCount = 80 } = opts;
  const rng = mulberry32(0xA1B2_C3D4);

  // pool geometries
  const fernGeos = [];
  for (let i = 0; i < 8; i++) fernGeos.push(buildFern(mulberry32(2000 + i)));
  const fernMat = new THREE.MeshLambertMaterial({
    map: LEAF_TEXTURES[1], transparent: true, alphaTest: 0.4,
    side: THREE.DoubleSide, vertexColors: true, color: 0x6ea83e,
    depthWrite: true,
  });

  const herbGeos = [];
  for (let i = 0; i < 6; i++) herbGeos.push(buildBroadleafHerb(mulberry32(3000 + i)));
  const herbMat = new THREE.MeshLambertMaterial({
    map: LEAF_TEXTURES[0], transparent: true, alphaTest: 0.4,
    side: THREE.DoubleSide, vertexColors: true, color: 0x4e8a2a,
    depthWrite: true,
  });

  const logGeos = [];
  for (let i = 0; i < 10; i++) logGeos.push(buildFallenLog(mulberry32(4000 + i), 1.4 + rng() * 1.6));
  const logMat = new THREE.MeshStandardMaterial({
    map: BARK_TEX, color: 0x4a3a25, roughness: 0.95, metalness: 0,
  });

  // moss material (low poly plane, color varies)
  const mossColor = new THREE.Color(0x3a5a2a);
  const mossMat = new THREE.MeshStandardMaterial({
    color: mossColor, vertexColors: true, roughness: 0.85, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });

  // vines
  const vineGeos = [];
  for (let i = 0; i < 8; i++) vineGeos.push(buildVine(mulberry32(5000 + i), 2 + rng() * 3));
  const vineMat = new THREE.MeshStandardMaterial({
    color: 0x3a4a22, roughness: 0.9, metalness: 0,
  });

  // ---------- ferns ----------
  const fernPlaced = [];
  for (let i = 0; i < fernCount; i++) {
    const x = (rng() - 0.5) * WORLD.size * 0.95;
    const z = (rng() - 0.5) * WORLD.size * 0.95;
    const { dist } = distToTrail(x, z);
    if (dist < 0.8) continue;                       // right at trail edge
    if (rng() > Math.exp(-dist * 0.012)) continue;  // more permissive falloff
    const slope = Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z))
                + Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
    if (slope > 3.0) continue;
    const y = terrainHeight(x, z);
    if (y < -0.2) continue;
    let tooClose = false;
    for (const p of fernPlaced) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.8 * 0.8) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const geo = fernGeos[Math.floor(rng() * fernGeos.length)];
    const s = 1.8 + rng() * 1.2;            // larger ferns for eye-level coverage
    const mesh = new THREE.Mesh(geo, fernMat);
    mesh.scale.setScalar(s);
    mesh.rotation.y = rng() * Math.PI * 2;
    mesh.position.set(x, y - 0.05, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    fernPlaced.push({ x, z });
  }

  // ---------- broadleaf herbs ----------
  for (let i = 0; i < herbCount; i++) {
    const x = (rng() - 0.5) * WORLD.size * 0.95;
    const z = (rng() - 0.5) * WORLD.size * 0.95;
    const { dist } = distToTrail(x, z);
    if (dist < 2.0) continue;
    if (rng() > Math.exp(-dist * 0.025)) continue;
    const y = terrainHeight(x, z);
    if (y < -0.2) continue;
    const slope = Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z))
                + Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
    if (slope > 3.5) continue;
    const geo = herbGeos[Math.floor(rng() * herbGeos.length)];
    const s = 0.6 + rng() * 0.5;
    const mesh = new THREE.Mesh(geo, herbMat);
    mesh.scale.setScalar(s);
    mesh.rotation.y = rng() * Math.PI * 2;
    mesh.position.set(x, y - 0.04, z);
    scene.add(mesh);
  }

  // ---------- fallen logs ----------
  for (let i = 0; i < logCount; i++) {
    const x = (rng() - 0.5) * WORLD.size * 0.9;
    const z = (rng() - 0.5) * WORLD.size * 0.9;
    const { dist } = distToTrail(x, z);
    if (dist < 1.6) continue;
    if (rng() > Math.exp(-dist * 0.022)) continue;
    const y = terrainHeight(x, z);
    if (y < -0.3) continue;
    const geo = logGeos[Math.floor(rng() * logGeos.length)];
    const mesh = new THREE.Mesh(geo, logMat);
    mesh.rotation.y = rng() * Math.PI * 2;
    mesh.position.set(x, y - 0.08, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---------- moss patches ----------
  for (let i = 0; i < mossCount; i++) {
    const x = (rng() - 0.5) * WORLD.size * 0.95;
    const z = (rng() - 0.5) * WORLD.size * 0.95;
    const { dist } = distToTrail(x, z);
    if (dist < 2.2) continue;
    // prefer near trail edges, riverbed, low spots
    const y = terrainHeight(x, z);
    const prefer = y < 1.2 ? 1.4 : 1.0;
    if (rng() > Math.exp(-dist * 0.04) * prefer) continue;
    if (y < -0.2) continue;
    const radius = 0.5 + rng() * 1.2;
    const geo = buildMossPatch(rng, radius);
    // per-vertex color
    const cc = new Float32Array(geo.attributes.position.count * 3);
    for (let k = 0; k < cc.length; k += 3) {
      const v = 0.7 + rng() * 0.5;
      cc[k]     = 0.35 * v + 0.05;
      cc[k + 1] = 0.6  * v;
      cc[k + 2] = 0.2  * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const mesh = new THREE.Mesh(geo, mossMat);
    mesh.rotation.y = rng() * Math.PI * 2;
    // slight vertical jitter to prevent z-fighting
    mesh.position.set(x, y + 0.005 + rng() * 0.015, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---------- vines: hang from upper branches of older trees ----------
  // We'll just hang them at random valid tree-like positions; they'd look
  // out of place floating, so we attach them to rocks or trunks we
  // already drew. Simplest: hang them from spots that are tree-trunk-like
  // by querying a density map (skip for now to avoid floating vines).
  void vineCount; void vineGeos; void vineMat;
}

// ---------- public entry ----------
export function populateVegetation(scene) {
  // trees - dense scatter with broadleaf and thin hardwood as the
  // primary species. minRadius 2.5 keeps trees away from the trail
  // edge so the player can see forward; treeSpacing 1.4 prevents
  // overlapping canopies.
  const treeCount = scatterTrees(scene, {
    minRadius: 2.5,
    treeSpacing: 1.4,
    density: 1.0,
    maxCount: 600,
  });
  // understory
  scatterUnderstory(scene, {
    fernCount: 1800,
    herbCount: 1200,
    logCount: 150,
    mossCount: 400,
    vineCount: 0,
  });
  return { treeCount };
}
