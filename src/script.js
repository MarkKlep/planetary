import { PerspectiveCamera, Scene, WebGLRenderer, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { earth, EARTH_ANGULAR_VELOCITY } from './planets/earth.js';
import { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime, updateInterval } from './iss.js';
import { sun } from './sun.js';

const container = document.getElementById('app');

// renderer
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new Scene();

const camera = new PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
);

scene.add(earth);
scene.add(iss);
scene.add(sun);
camera.position.z = 3;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Update ISS position every 2 seconds
setInterval(updateISSPosition, 2000);
updateISSPosition(); // Initial fetch

function animate() {
    requestAnimationFrame(animate);
    earth.rotation.y += EARTH_ANGULAR_VELOCITY;
    
    // Smooth interpolation between current and target position
    const elapsedTime = Date.now() - issLastUpdateTime;
    const progress = Math.min(elapsedTime / updateInterval, 1);
    iss.position.lerpVectors(issCurrentPos, issTargetPos, progress);
    
    // Point ISS towards Earth center
    const direction = new Vector3(0, 0, 0).sub(iss.position).normalize();
    iss.lookAt(iss.position.clone().add(direction));

    // sun positioning
    sun.position.x = 20;
    
    controls.update();
    renderer.render(scene, camera);
}

animate();
