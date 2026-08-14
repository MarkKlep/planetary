import { Mesh, BoxGeometry, MeshStandardMaterial, Group, CylinderGeometry, SphereGeometry, Vector3 } from 'three';
import { earth } from './planets/earth/earth';
import { latLonToDirection, toWorldFrame } from './geo';
import { ISS_ORBITAL_RADIUS } from './constants/planets.const';

// The station is deliberately enlarged a few times beyond literal scale: at one
// Earth-radius scene unit its real 109 m span is only 0.017 units wide, which would
// disappear at the closest useful camera distance. The proportions and silhouette,
// rather than the screen-space exaggeration, follow the actual ISS layout.
const iss = new Group();
iss.name = 'International Space Station';

const trussMaterial = new MeshStandardMaterial({ color: 0x707986, roughness: 0.42, metalness: 0.86 });
const moduleMaterial = new MeshStandardMaterial({ color: 0xd2d4d7, roughness: 0.43, metalness: 0.52 });
const nodeMaterial = new MeshStandardMaterial({ color: 0xb7bec7, roughness: 0.34, metalness: 0.68 });
const solarMaterial = new MeshStandardMaterial({
    color: 0x123d88,
    emissive: 0x06162f,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.72,
});
const solarGridMaterial = new MeshStandardMaterial({ color: 0x91a6c7, roughness: 0.38, metalness: 0.88 });
const radiatorMaterial = new MeshStandardMaterial({ color: 0xdce5eb, roughness: 0.5, metalness: 0.7 });
const goldMaterial = new MeshStandardMaterial({ color: 0xb89755, roughness: 0.42, metalness: 0.75 });

function addBox(width: number, height: number, depth: number, material: MeshStandardMaterial, x = 0, y = 0, z = 0): Mesh {
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    iss.add(mesh);
    return mesh;
}

function addXAlignedCylinder(radius: number, length: number, material: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 12), material);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y, z);
    iss.add(mesh);
    return mesh;
}

// Integrated truss: the long, silver backbone running across the station.
addXAlignedCylinder(0.0021, 0.085, trussMaterial, 0, 0.004, 0);
for (const x of [-0.032, -0.011, 0.011, 0.032]) {
    const mast = new Mesh(new CylinderGeometry(0.00115, 0.00115, 0.013, 8), trussMaterial);
    mast.position.set(x, 0.004, 0);
    iss.add(mast);
}

// Pressurized module chain, cupola-side node, and end docking adapters.
addXAlignedCylinder(0.0062, 0.026, moduleMaterial, -0.007, -0.004, 0);
addXAlignedCylinder(0.0054, 0.022, moduleMaterial, 0.020, -0.004, 0);
addXAlignedCylinder(0.0048, 0.019, moduleMaterial, -0.029, -0.004, 0);

for (const x of [-0.020, 0.006]) {
    const node = new Mesh(new SphereGeometry(0.0072, 12, 8), nodeMaterial);
    node.position.set(x, -0.004, 0);
    iss.add(node);
}

for (const x of [-0.043, 0.036]) {
    addXAlignedCylinder(0.0042, 0.010, goldMaterial, x, -0.004, 0);
    const dockingRing = new Mesh(new CylinderGeometry(0.0051, 0.0051, 0.0014, 12), nodeMaterial);
    dockingRing.rotation.z = Math.PI / 2;
    dockingRing.position.set(x + (x < 0 ? -0.005 : 0.005), -0.004, 0);
    iss.add(dockingRing);
}

// Four paired solar-array wings. Cell seams and aluminium edge rails keep the panels
// readable as arrays rather than solid blue rectangles when viewed up close.
function addSolarWing(x: number, side: -1 | 1): void {
    const z = side * 0.026;
    addBox(0.014, 0.00038, 0.038, solarMaterial, x, 0.005, z);

    // Root boom from the truss and a narrow aluminium frame around the wing.
    const boom = new Mesh(new CylinderGeometry(0.00085, 0.00085, 0.026, 8), trussMaterial);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(x, 0.005, side * 0.012);
    iss.add(boom);
    addBox(0.0145, 0.00062, 0.0007, solarGridMaterial, x, 0.0051, z - side * 0.019);
    addBox(0.0145, 0.00062, 0.0007, solarGridMaterial, x, 0.0051, z + side * 0.019);

    for (const offset of [-0.0095, 0, 0.0095]) {
        addBox(0.0134, 0.00062, 0.00038, solarGridMaterial, x, 0.0051, z + offset);
    }
}

for (const x of [-0.030, -0.010, 0.010, 0.030]) {
    addSolarWing(x, -1);
    addSolarWing(x, 1);
}

// White radiator blankets hang below the truss, visually separate from the blue
// photovoltaic wings. The small gold box reads as exposed thermal insulation.
for (const x of [-0.022, 0.022]) {
    addBox(0.018, 0.00045, 0.012, radiatorMaterial, x, -0.012, -0.013);
    addBox(0.018, 0.00045, 0.012, radiatorMaterial, x, -0.012, 0.013);
    const support = new Mesh(new CylinderGeometry(0.0007, 0.0007, 0.010, 8), trussMaterial);
    support.position.set(x, -0.004, -0.013);
    iss.add(support);
}
addBox(0.011, 0.007, 0.006, goldMaterial, 0.012, -0.012, 0);

// Position ISS in orbit
iss.position.set(ISS_ORBITAL_RADIUS, 0, 0);

// Convert lat/lon to a 3D position, carried into the Earth mesh's current frame.
//
// This previously negated both the longitude term and the rotation angle. The two
// errors cancelled for the *rotation*, so the ISS tracked the spinning globe
// correctly, but the net result placed it at a mirrored longitude — over the wrong
// hemisphere. Both now go through the shared helper, which the sun also uses, so
// the station and the daylight terminator agree on where a place is.
function latLonToPosition(latitude: number, longitude: number, radius = ISS_ORBITAL_RADIUS): Vector3 {
    const direction = latLonToDirection(latitude, longitude);
    toWorldFrame(direction, earth.rotation.y);
    return direction.multiplyScalar(radius);
}

let issCurrentPos = new Vector3(ISS_ORBITAL_RADIUS, 0, 0);
let issTargetPos = new Vector3(ISS_ORBITAL_RADIUS, 0, 0);
let issLastUpdateTime = Date.now();

async function updateISSPosition() {
    try {
        const response = await fetch('http://api.open-notify.org/iss-now.json');
        const data = await response.json();
        
        if (data.iss_position) {
            const lat = parseFloat(data.iss_position.latitude);
            const lon = parseFloat(data.iss_position.longitude);
            
            issTargetPos = latLonToPosition(lat, lon);
            issCurrentPos.copy(iss.position);
            issLastUpdateTime = Date.now();
        }
    } catch (error) {
        console.error('Error fetching ISS position:', error);
    }
}

export { iss, updateISSPosition, issCurrentPos, issTargetPos, issLastUpdateTime };
