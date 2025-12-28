import { Mesh, BoxGeometry, MeshBasicMaterial, Group, CylinderGeometry, Vector3 } from 'three';
import { earth } from './planets/earth/earth';
import { ISS_ORBITAL_RADIUS, ISS_UPDATE_INTERVAL } from './constants/planets.const';

// Create ISS as a more realistic model
const iss = new Group();

// Main truss structure (central backbone)
const trussGeometry = new CylinderGeometry(0.002, 0.002, 0.025, 6);
const trussMaterial = new MeshBasicMaterial({ color: 0x888888 });
const truss = new Mesh(trussGeometry, trussMaterial);
iss.add(truss);

// Pressurized modules along the truss
const moduleGeometry = new BoxGeometry(0.003, 0.003, 0.008);
const moduleMaterial = new MeshBasicMaterial({ color: 0xaaaaaa });
for (let i = -1; i <= 1; i++) {
    const module = new Mesh(moduleGeometry, moduleMaterial);
    module.position.z = i * 0.006;
    iss.add(module);
}

// Solar panel array - Port (left) side
const portPanelGeometry = new BoxGeometry(0.035, 0.00015, 0.008);
const panelMaterial = new MeshBasicMaterial({ color: 0x1a4d99 });

const portPanel = new Mesh(portPanelGeometry, panelMaterial);
portPanel.position.set(-0.023, 0.005, 0);
iss.add(portPanel);

// Solar panel array - Starboard (right) side
const starboardPanel = new Mesh(portPanelGeometry, panelMaterial);
starboardPanel.position.set(0.023, 0.005, 0);
iss.add(starboardPanel);

// Radiators (golden-bronze color)
const radiatorGeometry = new BoxGeometry(0.015, 0.00015, 0.008);
const radiatorMaterial = new MeshBasicMaterial({ color: 0xb8860b });

const portRadiator = new Mesh(radiatorGeometry, radiatorMaterial);
portRadiator.position.set(-0.015, -0.005, 0);
iss.add(portRadiator);

const starboardRadiator = new Mesh(radiatorGeometry, radiatorMaterial);
starboardRadiator.position.set(0.015, -0.005, 0);
iss.add(starboardRadiator);

// Position ISS in orbit
iss.position.set(ISS_ORBITAL_RADIUS, 0, 0);

// Function to convert lat/lon to 3D coordinates, accounting for Earth's rotation
function latLonToPosition(latitude, longitude, radius = ISS_ORBITAL_RADIUS) {
    const lat = (latitude * Math.PI) / 180;
    const lon = (longitude * Math.PI) / 180;
    
    const x = radius * Math.cos(lat) * Math.cos(lon);
    const y = radius * Math.sin(lat);
    const z = radius * Math.cos(lat) * Math.sin(lon);
    
    // Rotate position vector by Earth's current rotation
    const rotationAxis = new Vector3(0, 1, 0);
    const position = new Vector3(x, y, z);
    position.applyAxisAngle(rotationAxis, -earth.rotation.y);
    
    return position;
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
