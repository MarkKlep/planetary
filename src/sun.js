import { Mesh, SphereGeometry, MeshBasicMaterial } from 'three';

const geometry = new SphereGeometry(1, 32, 32);
const material = new MeshBasicMaterial({ color: 0xffff00 });

export const sun = new Mesh(geometry, material);