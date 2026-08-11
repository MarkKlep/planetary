import { Mesh, BoxGeometry, MeshStandardMaterial, Group, CylinderGeometry, Vector3 } from 'three';
import { earth } from './planets/earth/earth';
import { latLonToDirection, toWorldFrame } from './geo';
import { ISS_ORBITAL_RADIUS } from './constants/planets.const';

// Create ISS as a more realistic model
const iss = new Group();

// Main truss structure (central backbone)
const trussGeometry = new CylinderGeometry(0.002, 0.002, 0.025, 6);
const trussMaterial = new MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6, metalness: 0.8 });
const truss = new Mesh(trussGeometry, trussMaterial);
iss.add(truss);

// Pressurized modules along the truss
const moduleGeometry = new BoxGeometry(0.003, 0.003, 0.008);
const moduleMaterial = new MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.3 });
for (let i = -1; i <= 1; i++) {
    const module = new Mesh(moduleGeometry, moduleMaterial);
    module.position.z = i * 0.006;
    iss.add(module);
}

// Solar panel array - Port (left) side
const portPanelGeometry = new BoxGeometry(0.035, 0.00015, 0.008);
const panelMaterial = new MeshStandardMaterial({ color: 0x1a3f77, roughness: 0.25, metalness: 0.7 });

const portPanel = new Mesh(portPanelGeometry, panelMaterial);
portPanel.position.set(-0.023, 0.005, 0);
iss.add(portPanel);

// Solar panel array - Starboard (right) side
const starboardPanel = new Mesh(portPanelGeometry, panelMaterial);
starboardPanel.position.set(0.023, 0.005, 0);
iss.add(starboardPanel);

// Radiators (golden-bronze color)
const radiatorGeometry = new BoxGeometry(0.015, 0.00015, 0.008);
const radiatorMaterial = new MeshStandardMaterial({ color: 0xc9922a, roughness: 0.35, metalness: 0.85 });

const portRadiator = new Mesh(radiatorGeometry, radiatorMaterial);
portRadiator.position.set(-0.015, -0.005, 0);
iss.add(portRadiator);

const starboardRadiator = new Mesh(radiatorGeometry, radiatorMaterial);
starboardRadiator.position.set(0.015, -0.005, 0);
iss.add(starboardRadiator);

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
