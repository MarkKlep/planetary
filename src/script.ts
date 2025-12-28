import { PerspectiveCamera, Scene, WebGLRenderer, Vector3, Mesh, Group, Raycaster, Vector2 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { earth } from './planets/earth/earth';
import { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime } from './iss';
import { moon, moonOrbit } from './planets/earth/moon';
import { EARTH_ANGULAR_VELOCITY, MOON_DISTANCE, MOON_ANGULAR_VELOCITY, ISS_UPDATE_INTERVAL } from './constants/planets.const';

const container = document.getElementById('app') as HTMLElement;

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new Scene();

const camera = new PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 10000
);

scene.add(earth);
scene.add(iss);
scene.add(moon);
scene.add(moonOrbit);

camera.position.z = 3;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1;
controls.maxDistance = 200;
controls.enablePan = true;

// Camera focus animation state
let focusAnimation: {
    startPosition: Vector3;
    startTarget: Vector3;
    finalPosition: Vector3;
    finalTarget: Vector3;
    startTime: number;
    duration: number;
} | null = null;

// Moon orbital angle
let moonOrbitalAngle = 0;

// Function to smoothly focus camera on a target object
function focusOnObject(target: Mesh | Group, distance = 5, duration = 2000) {
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    
    const targetPosition = target.position.clone();
    
    // Calculate direction from current camera to target
    let directionToTarget = new Vector3().subVectors(camera.position, targetPosition);
    const distanceToTarget = directionToTarget.length();
    
    if (distanceToTarget < 0.01) {
        // If camera is already at target, use a default direction
        directionToTarget = new Vector3(0, 0.3, 1).normalize();
    } else {
        directionToTarget.normalize();
    }
    
    // Position camera at specified distance from target
    const finalPosition = targetPosition.clone().addScaledVector(directionToTarget, distance);
    
    const startTime = Date.now();
    
    focusAnimation = {
        startPosition,
        startTarget,
        finalPosition,
        finalTarget: targetPosition,
        startTime,
        duration
    };
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event && (event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
    }
    
    switch(event.key.toLowerCase()) {
        case '1':
            focusOnObject(earth, 3, 1500);
            break;
        case '2':
            focusOnObject(moon, 3, 1500);
            break;
        case '3':
            focusOnObject(iss, 0.5, 1500);
            break;
        case '0':
            focusOnObject(earth, 70, 2000);
            break;
    }
});

// Raycaster for mouse clicks and hover
const raycaster = new Raycaster();
const mouse = new Vector2();
let hoveredObject: Mesh | any = null;

renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([moon, earth, moonOrbit]);
    
    // Reset previous hover
    if (hoveredObject) {
        hoveredObject = null;
        renderer.domElement.style.cursor = 'default';
    }
    
    // Apply hover highlight
    if (intersects.length > 0) {
        hoveredObject = intersects[0].object;
        
        // Check if already focused
        let targetObject: Mesh | null = null;
        if (hoveredObject === moon || hoveredObject === moonOrbit) {
            targetObject = moon;
        } else if (hoveredObject === earth) {
            targetObject = earth;
        }
        
        const distanceToTarget = targetObject ? camera.position.distanceTo(targetObject.position) : 1000;
        const isAlreadyFocused = targetObject && controls.target.distanceTo(targetObject.position) < 1 && distanceToTarget < 10;
        
        if (!isAlreadyFocused) {
            renderer.domElement.style.cursor = 'pointer';
        } else {
            renderer.domElement.style.cursor = 'default';
            hoveredObject = null;
        }
    }
});

renderer.domElement.addEventListener('click', (event: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([moon, earth, moonOrbit]);
    
    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        
        let targetObject: Mesh | null = null;
        if (clickedObject === moon || clickedObject === moonOrbit) {
            targetObject = moon;
        } else if (clickedObject === earth) {
            targetObject = earth;
        }
        
        // Only focus if we're not already observing this object
        if (targetObject) {
            const distanceToTarget = camera.position.distanceTo(targetObject.position);
            const isAlreadyFocused = controls.target.distanceTo(targetObject.position) < 1 && distanceToTarget < 10;
            
            if (!isAlreadyFocused) {
                focusOnObject(targetObject, 3, 1500);
            }
        }
    }
});

// Update ISS position
setInterval(updateISSPosition, ISS_UPDATE_INTERVAL);
updateISSPosition(); // Initial fetch

function animate() {
    requestAnimationFrame(animate);
    earth.rotation.y += EARTH_ANGULAR_VELOCITY;
    
    // Smooth interpolation between current and target position
    const elapsedTime = Date.now() - issLastUpdateTime;
    const progress = Math.min(elapsedTime / ISS_UPDATE_INTERVAL, 1);
    iss.position.lerpVectors(issCurrentPos, issTargetPos, progress);
    
    // Point ISS towards Earth center
    const direction = new Vector3(0, 0, 0).sub(iss.position).normalize();
    iss.lookAt(iss.position.clone().add(direction));

    // moon orbital motion
    moonOrbitalAngle += MOON_ANGULAR_VELOCITY / 60; // Assuming 60 FPS
    moon.position.x = Math.cos(moonOrbitalAngle) * MOON_DISTANCE;
    moon.position.z = Math.sin(moonOrbitalAngle) * MOON_DISTANCE;
    
    // Handle camera focus animation
    if (focusAnimation) {
        const elapsed = Date.now() - focusAnimation.startTime;
        const progress = Math.min(elapsed / focusAnimation.duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        
        camera.position.lerpVectors(focusAnimation.startPosition, focusAnimation.finalPosition, easeProgress);
        controls.target.lerpVectors(focusAnimation.startTarget, focusAnimation.finalTarget, easeProgress);
        
        if (progress >= 1) {
            focusAnimation = null;
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

animate();
