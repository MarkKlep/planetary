import { BufferGeometry, BufferAttribute, Points, PointsMaterial } from 'three';

const starCount = 5000;
const geometry = new BufferGeometry();
const positions = new Float32Array(starCount * 3);
const colors = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
  // Spherical distribution
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);
  const radius = 800;
  
  positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
  positions[i * 3 + 2] = radius * Math.cos(phi);
  
  // Vary star colors (white, blue, yellow tints)
  const colorVariation = Math.random();
  if (colorVariation < 0.6) {
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
  } else if (colorVariation < 0.8) {
    colors[i * 3] = 0.8;
    colors[i * 3 + 1] = 0.9;
    colors[i * 3 + 2] = 1;
  } else {
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.9;
    colors[i * 3 + 2] = 0.7;
  }
}

geometry.setAttribute('position', new BufferAttribute(positions, 3));
geometry.setAttribute('color', new BufferAttribute(colors, 3));

const material = new PointsMaterial({
  size: 2,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.95
});

export const backgroundTexture = new Points(geometry, material);
