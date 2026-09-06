import * as THREE from 'three';

const MOVE_SPEED = 4.5; // meters/second
const LOOK_SENSITIVITY = 0.0022;
const WORLD_BOUND = 45;

export function createPlayerController(camera, domElement) {
  const keys = new Set();
  let yaw = 0;
  let pitch = 0;
  let pointerLocked = false;

  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  domElement.addEventListener('click', () => {
    if (!pointerLocked) domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === domElement;
  });
  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    yaw -= e.movementX * LOOK_SENSITIVITY;
    pitch -= e.movementY * LOOK_SENSITIVITY;
    pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, pitch));
  });

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    forward.set(Math.sin(yaw), 0, Math.cos(yaw)).negate();
    right.set(forward.z, 0, -forward.x);

    const move = new THREE.Vector3();
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyD')) move.add(right);
    if (keys.has('KeyA')) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
      camera.position.add(move);
      camera.position.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, camera.position.x));
      camera.position.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, camera.position.z));
      camera.position.y = 1.6;
    }
  }

  return { update };
}
