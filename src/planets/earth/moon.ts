import { SphereGeometry, Mesh, MeshBasicMaterial, TextureLoader, BufferGeometry, LineBasicMaterial, Line, Vector3 } from 'three';
import { MOON_DISTANCE, MOON_RADIUS } from '../../constants/planets.const';

const textureLoader = new TextureLoader();
const texture = textureLoader.load('./assets/moon.jpg');

const geometry = new SphereGeometry(MOON_RADIUS, 32, 32);
const material = new MeshBasicMaterial({ map: texture });

geometry.rotateY(Math.PI);

export const moon = new Mesh(geometry, material);

const orbitPoints: Vector3[] = [];
for (let i = 0; i <= 128; i++) {
    const angle = (i / 128) * Math.PI * 2;
    orbitPoints.push(new Vector3(Math.cos(angle) * MOON_DISTANCE, 0, Math.sin(angle) * MOON_DISTANCE));
}
const orbitGeometry = new BufferGeometry();
orbitGeometry.setFromPoints(orbitPoints);
const orbitMaterial = new LineBasicMaterial({ 
    color: 0xffffff,
    transparent: true,
    opacity: 0.3
});
export const moonOrbit = new Line(orbitGeometry, orbitMaterial);