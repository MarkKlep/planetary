import { Mesh, SphereGeometry, MeshBasicMaterial, TextureLoader } from 'three';

const textureLoader = new TextureLoader();
const texture = textureLoader.load('./assets/bluemarble-2048.png');

const geometry = new SphereGeometry(1, 32, 32);
const material = new MeshBasicMaterial({
    map: texture,
});

export const earth = new Mesh(geometry, material);
const EARTH_SIDEREAL_DAY = 86164.1;
export const EARTH_ANGULAR_VELOCITY = (2 * Math.PI) / EARTH_SIDEREAL_DAY;
