import * as THREE from 'three';
import roster from '../characters/roster.free.json';

const PROXIMITY_RADIUS = 2.2;

// Placeholder capsule meshes stand in for real rigged character models until
// GLTF assets are sourced (Ready Player Me / Mixamo / CC0 packs — see plan,
// Phase 1 step 4). Swap loadPlaceholderMesh() for a GLTFLoader call per
// character.modelAsset once assets are in client/public/assets/characters/.
function loadPlaceholderMesh(character) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xcc5577 })
  );
  body.position.y = 1;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xe0b090 })
  );
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);

  group.userData.character = character;
  group.position.set(...character.spawnPoint);
  return group;
}

export function spawnNPCs(scene) {
  const npcs = roster.map((character) => {
    const mesh = loadPlaceholderMesh(character);
    scene.add(mesh);
    return { character, mesh };
  });
  return npcs;
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
