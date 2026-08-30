// Isolate the vegetation module and test render it
import * as THREE from 'three';
import { makeNoise } from '../src/world.js';
import { populateVegetation } from '../src/vegetation.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x99aabb);

const camera = new THREE.PerspectiveCamera(66, 1280/720, 0.1, 200);
camera.position.set(0, 5, 10);
camera.lookAt(0, 5, 0);

const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 5);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

// ground
const g = new THREE.PlaneGeometry(50, 50);
g.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x665544 }));
scene.add(ground);

// height function stub for vegetation: flat 0
globalThis.distToTrail = (x, z) => ({ dist: Math.hypot(x, z) - 5, idx: 0 });
globalThis.terrainHeight = () => 0;
globalThis.TRAIL = { getPoint: (t) => new THREE.Vector3(0, 0, -10) };
globalThis.WORLD = { size: 50, waterfallZ: -10 };

// populate
const r = populateVegetation(scene);
console.log('populated:', r);

// render
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1280, 720);
// we can't actually run this in node; just print scene info
console.log('children:', scene.children.length);
let meshCount = 0;
scene.traverse(o => { if (o.isMesh) meshCount++; });
console.log('meshes:', meshCount);
