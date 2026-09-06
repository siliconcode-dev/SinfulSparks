import * as THREE from 'three';

// Simple day/night cycle: a full cycle takes DAY_LENGTH_SECONDS of real time.
const DAY_LENGTH_SECONDS = 240;

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 20, 80);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.getElementById('app').appendChild(renderer.domElement);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sun/moon directional light, driven by the day/night cycle
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x404050, 0.6));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let elapsed = 0;
  function updateDayNightCycle(dt) {
    elapsed += dt;
    const t = (elapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS; // 0..1
    const angle = t * Math.PI * 2;
    const height = Math.sin(angle);

    sunLight.position.set(Math.cos(angle) * 50, Math.max(height, 0.05) * 50, 20);
    sunLight.intensity = Math.max(0.15, height) * 1.2;

    const dayColor = new THREE.Color(0x87ceeb);
    const nightColor = new THREE.Color(0x0a0a2a);
    const skyColor = nightColor.clone().lerp(dayColor, Math.max(0, height));
    scene.background = skyColor;
    scene.fog.color = skyColor;
  }

  return { scene, camera, renderer, updateDayNightCycle };
}
