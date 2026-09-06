import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import roster from '../characters/roster.free.json';

const PROXIMITY_RADIUS = 2.2;

// Quaternius's CC0 "Universal Base Characters" + "Universal Animation
// Library" (see plan: Phase 1, 3D Character Assets) — same 65-bone humanoid
// skeleton across the character, hairstyle, and animation files, so
// retargeting is just a matter of matching bone names, not real
// mesh-to-mesh retargeting math.
const ANIMATION_ASSET = '/assets/characters/anim/UAL1_Standard.glb';
const EYEBROWS_ASSET = '/assets/characters/shared/Eyebrows_Female.gltf';
const OUTFIT_MATERIAL_NAME = 'MI_Superhero_Female';

const loader = new GLTFLoader();
function loadGLTF(path) {
  return new Promise((resolve, reject) => loader.load(path, resolve, undefined, reject));
}

const baseModelCache = new Map();
function getBaseModel(path) {
  if (!baseModelCache.has(path)) {
    baseModelCache.set(path, loadGLTF(path).then((gltf) => gltf.scene));
  }
  return baseModelCache.get(path);
}

let animationClipsPromise = null;
function getAnimationClips() {
  if (!animationClipsPromise) {
    animationClipsPromise = loadGLTF(ANIMATION_ASSET).then((gltf) => gltf.animations);
  }
  return animationClipsPromise;
}

let eyebrowsPromise = null;
function getEyebrows() {
  if (!eyebrowsPromise) {
    eyebrowsPromise = loadGLTF(EYEBROWS_ASSET).then((gltf) => gltf.scene);
  }
  return eyebrowsPromise;
}

// Rebinds a skinned part (hair, eyebrows) loaded from a separate glTF onto
// the character's own skeleton, matched by bone name — this is exactly what
// Quaternius's "modular" pack is designed for (shared skeleton across
// swappable parts), not a general-purpose retargeting solution.
function attachSkinnedPart(root, partScene) {
  const boneByName = new Map();
  root.traverse((obj) => {
    if (obj.isBone) boneByName.set(obj.name, obj);
  });

  partScene.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    const newBones = obj.skeleton.bones.map((b) => boneByName.get(b.name) || b);
    const newSkeleton = new THREE.Skeleton(newBones, obj.skeleton.boneInverses);
    const mesh = obj.clone();
    mesh.material = obj.material.clone();
    mesh.bind(newSkeleton, obj.bindMatrix);
    root.add(mesh);
  });
}

async function buildCharacterMesh(character) {
  const [baseTemplate, hairGltf, eyebrowsTemplate, clips] = await Promise.all([
    getBaseModel(character.modelAsset),
    loadGLTF(character.hairAsset),
    getEyebrows(),
    getAnimationClips(),
  ]);

  const root = cloneSkeleton(baseTemplate);
  root.userData.character = character;

  // Distinct outfit tint per character (clone materials first so the tint
  // doesn't bleed onto other characters sharing the same cached template).
  const tint = new THREE.Color(parseInt(character.tintColor, 16));
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      obj.material = obj.material.clone();
      if (obj.material.name === OUTFIT_MATERIAL_NAME) {
        obj.material.color.copy(tint);
      }
    }
  });

  attachSkinnedPart(root, hairGltf.scene);
  attachSkinnedPart(root, eyebrowsTemplate);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const name of ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Hit_Head']) {
    const clip = clips.find((c) => c.name === name);
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  actions.Idle_Loop?.play();

  return { root, mixer, actions, currentAction: actions.Idle_Loop };
}

// Crossfades to a named action (see buildCharacterMesh's `actions` keys).
// Falls back to a no-op if the requested clip isn't available.
export function setNPCAction(npc, name, { loop = THREE.LoopRepeat, fadeDuration = 0.3 } = {}) {
  const next = npc.actions[name];
  if (!next || next === npc.currentAction) return;
  next.reset().setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  next.clampWhenFinished = loop === THREE.LoopOnce;
  next.play();
  next.crossFadeFrom(npc.currentAction, fadeDuration, false);
  npc.currentAction = next;
}

export async function spawnNPCs(scene) {
  const npcs = await Promise.all(
    roster.map(async (character) => {
      const { root, mixer, actions, currentAction } = await buildCharacterMesh(character);
      root.position.set(...character.spawnPoint);
      root.traverse((obj) => {
        if (obj.isMesh) obj.castShadow = true;
      });
      scene.add(root);
      return { character, mesh: root, mixer, actions, currentAction };
    })
  );
  return npcs;
}

export function updateNPCs(npcs, dt) {
  for (const npc of npcs) npc.mixer.update(dt);
}

// Returns the nearest NPC within talking range of the camera, or null.
export function findNearbyNPC(npcs, cameraPosition) {
  let closest = null;
  let closestDist = PROXIMITY_RADIUS;
  for (const npc of npcs) {
    const dist = cameraPosition.distanceTo(npc.mesh.position);
    if (dist < closestDist) {
      closest = npc;
      closestDist = dist;
    }
  }
  return closest;
}
