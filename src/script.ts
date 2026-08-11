import { PerspectiveCamera, Scene, WebGLRenderer, Vector3, Mesh, Group, Raycaster, Vector2, AmbientLight, ACESFilmicToneMapping } from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { earth, earthSunDirectionView } from './planets/earth/earth';
import { clouds } from './planets/earth/clouds';
import { atmosphere, atmosphereSunDirection } from './planets/earth/atmosphere';
import { sun, sunDirection, updateSunPosition } from './sun';
import { backgroundTexture } from './background/background';
import { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime } from './iss';
import { moon, moonTidalRotation } from './planets/earth/moon';
import { EARTH_ANGULAR_VELOCITY, MOON_DISTANCE, MOON_ANGULAR_VELOCITY, ISS_UPDATE_INTERVAL, CLOUD_ANGULAR_VELOCITY_SCALE } from './constants/planets.const';

export function initScene() {
    const container = document.getElementById('app') as HTMLElement;

    if (!container) {
        return;
    }

    // If React remounts or HMR calls init again, clear previous renderers.
    container.innerHTML = '';

    const getSize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        return { width, height };
    };

    const { width: initialWidth, height: initialHeight } = getSize();

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Filmic tone mapping keeps the sunlit face from clipping to flat white where
    // deserts and cloud tops are brightest.
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // 2D label renderer (for moon label)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(initialWidth, initialHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    const scene = new Scene();

    const camera = new PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 10000);

    scene.add(earth);
    scene.add(clouds);
    scene.add(atmosphere);
    scene.add(iss);
    scene.add(moon);
    scene.add(backgroundTexture);

    // The sun. Its target must live in the scene graph for the light to aim.
    scene.add(sun);
    scene.add(sun.target);
    // Just enough fill to keep the night side from crushing to pure black — real
    // night sides catch starlight and, for the Moon, earthshine. Any more than this
    // and the terminator stops reading.
    scene.add(new AmbientLight(0x2a3a55, 0.05));

    // Moon label (CSS2D)
    const moonLabelEl = document.createElement('div');
    moonLabelEl.textContent = 'Moon';
    moonLabelEl.style.color = 'white';
    moonLabelEl.style.fontSize = '14px';
    moonLabelEl.style.padding = '2px 6px';
    moonLabelEl.style.background = 'rgba(0, 0, 0, 0.45)';
    moonLabelEl.style.borderRadius = '4px';
    moonLabelEl.style.opacity = '0';
    moonLabelEl.style.transition = 'opacity 0.1s linear';
    moonLabelEl.style.pointerEvents = 'none';
    const moonLabel = new CSS2DObject(moonLabelEl);
    moonLabel.position.set(0, 0.18, 0);
    moon.add(moonLabel);

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

        switch (event.key.toLowerCase()) {
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
        const intersects = raycaster.intersectObjects([moon, earth]);

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
            if (hoveredObject === moon) {
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
        const intersects = raycaster.intersectObjects([moon, earth]);

        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;

            let targetObject: Mesh | null = null;
            if (clickedObject === moon) {
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

    // Navigation panel functionality
    let rotationEnabled = true;

    // Object focus buttons
    const navButtons = document.querySelectorAll('.nav-btn[data-target]');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-target');

            // Remove active class from all buttons
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            switch (target) {
                case 'earth':
                    focusOnObject(earth, 3, 1500);
                    break;
                case 'moon':
                    focusOnObject(moon, 3, 1500);
                    break;
                case 'iss':
                    focusOnObject(iss, 0.5, 1500);
                    break;
            }
        });
    });

    // Reset camera button
    const resetCameraBtn = document.getElementById('reset-camera');
    resetCameraBtn?.addEventListener('click', () => {
        navButtons.forEach(btn => btn.classList.remove('active'));
        focusOnObject(earth, 70, 2000);
    });

    // Toggle rotation button
    const toggleRotationBtn = document.getElementById('toggle-rotation');
    toggleRotationBtn?.addEventListener('click', () => {
        rotationEnabled = !rotationEnabled;
        if (toggleRotationBtn) {
            toggleRotationBtn.textContent = rotationEnabled ? 'Pause Rotation' : 'Resume Rotation';
        }
    });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        if (rotationEnabled) {
            earth.rotation.y += EARTH_ANGULAR_VELOCITY;
            clouds.rotation.y += EARTH_ANGULAR_VELOCITY * CLOUD_ANGULAR_VELOCITY_SCALE;
        }

        // Re-aim the sun at the subsolar point for the current instant. The Earth's
        // spin is passed in so the terminator stays locked to real geography rather
        // than sliding across the continents as the mesh turns.
        updateSunPosition(new Date(), earth.rotation.y);
        atmosphereSunDirection.copy(sunDirection);
        // The Earth shader compares the sun against a view-space normal, so the
        // direction has to be carried into view space alongside it.
        earthSunDirectionView.copy(sunDirection).transformDirection(camera.matrixWorldInverse);

        // Smooth interpolation between current and target position
        const elapsedTime = Date.now() - issLastUpdateTime;
        const progress = Math.min(elapsedTime / ISS_UPDATE_INTERVAL, 1);
        iss.position.lerpVectors(issCurrentPos, issTargetPos, progress);

        // Point ISS towards Earth center
        const direction = new Vector3(0, 0, 0).sub(iss.position).normalize();
        iss.lookAt(iss.position.clone().add(direction));

        // moon orbital motion
        if (rotationEnabled) {
            moonOrbitalAngle += MOON_ANGULAR_VELOCITY / 60; // Assuming 60 FPS
        }
        moon.position.x = Math.cos(moonOrbitalAngle) * MOON_DISTANCE;
        moon.position.z = Math.sin(moonOrbitalAngle) * MOON_DISTANCE;
        // Tidal lock: one rotation per orbit, so the near side always faces Earth.
        moon.rotation.y = moonTidalRotation(moonOrbitalAngle);

        // The label hides once the camera is actually parked on the Moon — at that
        // point the object speaks for itself and the tag just sits in the way.
        const moonViewingDistance = camera.position.distanceTo(moon.position);
        const moonTargetDistance = controls.target.distanceTo(moon.position);
        const isObservingMoon = moonTargetDistance < 1 && moonViewingDistance < 10;

        const targetLabelOpacity = isObservingMoon ? 0 : 1;
        const currentLabelOpacity = parseFloat(moonLabelEl.style.opacity || '0');
        const newLabelOpacity = currentLabelOpacity + (targetLabelOpacity - currentLabelOpacity) * 0.15;
        moonLabelEl.style.opacity = newLabelOpacity.toFixed(2);
        moonLabel.visible = newLabelOpacity > 0.02;

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
        labelRenderer.render(scene, camera);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        const { width, height } = getSize();
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labelRenderer.setSize(width, height);
    });

    animate();
}
