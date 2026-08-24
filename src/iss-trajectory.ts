import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    Line,
    LineBasicMaterial,
    Matrix4,
    Vector3,
} from 'three';
import { issOrbitFrame } from './iss';
import {
    EARTH_SIDEREAL_DAY,
    ISS_ORBITAL_PERIOD_S,
    ISS_ORBITAL_RADIUS,
} from './constants/planets.const';

/**
 * Where the station has to go next, drawn two ways.
 *
 * These are the same orbit seen in the two frames that matter, and the pair is the
 * point — neither one alone says what an orbit is:
 *
 *  - **The orbit path** is the circle the station is actually flying, in inertial
 *    space. It does not turn with the Earth, and over the course of a day the planet
 *    rotates inside it.
 *  - **The ground track** is where that circle passes over, drawn on the surface. It is
 *    *not* the orbit projected downwards, because the ground moves: by the time the
 *    station gets back round, 92.6 minutes later, the Earth has turned 23.2° eastwards
 *    underneath it and the track lands that much further west. That westward march is
 *    the whole reason a station in a fixed plane eventually flies over most of the
 *    planet, and it falls out here of one rotation per sample rather than being drawn
 *    in.
 *
 * Both are rebuilt from `issOrbitFrame` and nothing else, so the drawn orbit cannot
 * disagree with the station sitting on it.
 */

/** 1.4° of arc per segment: the chord error is 6e-5 of the radius, well under a pixel. */
const SAMPLES = 256;
/** Just clear of the cloud deck at 1.006, and far under the atmosphere shell at 1.035. */
const GROUND_TRACK_RADIUS = 1.009;
/**
 * How far round the trailing end of each curve fades.
 *
 * Not decoration: a circle drawn at one brightness says nothing about which way round it
 * is being flown. Both curves start at the station and the colour ramps down all the way
 * back to it, so the bright end is always the next few minutes.
 */
const HEAD_BRIGHTNESS = 1;
const TAIL_BRIGHTNESS = 0.06;

const Y_AXIS = new Vector3(0, 1, 0);

/** Per-vertex brightness ramp, which is how each curve says which way it is going. */
function buildColours(tint: readonly [number, number, number]): BufferAttribute {
    const colours = new Float32Array((SAMPLES + 1) * 3);
    for (let i = 0; i <= SAMPLES; i++) {
        const fade = HEAD_BRIGHTNESS + (TAIL_BRIGHTNESS - HEAD_BRIGHTNESS) * (i / SAMPLES);
        colours[i * 3] = tint[0] * fade;
        colours[i * 3 + 1] = tint[1] * fade;
        colours[i * 3 + 2] = tint[2] * fade;
    }
    return new BufferAttribute(colours, 3);
}

function buildLine(tint: readonly [number, number, number]): Line {
    const geometry = new BufferGeometry();
    // A plain `BufferAttribute`, never a `Float32BufferAttribute`: the latter's
    // constructor copies the array it is handed, and the ground track writes into this
    // one every frame. See the same warning in `moon-surface/dust.ts`.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array((SAMPLES + 1) * 3), 3));
    geometry.setAttribute('color', buildColours(tint));

    const line = new Line(
        geometry,
        new LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.92,
            // Additive, so the ramp to the tail *is* a fade to the background and no
            // blend factor has to be carried in a fourth channel. Depth writes off so
            // neither line can z-fight the surface it hugs — but depth *testing* stays
            // on, which is what hides the far half of both curves behind the globe and
            // is most of what makes them read as three-dimensional.
            blending: AdditiveBlending,
            depthWrite: false,
            // Diagrammatic rather than lit: tone mapping would drag these along with
            // whatever exposure the rest of the scene is being developed at.
            toneMapped: false,
        })
    );
    // The ground track's vertices are rewritten every frame, so any bounding sphere
    // computed from them is a frame stale — and both curves are only ever drawn while
    // the camera is at Earth, where there is nothing to cull them against anyway.
    line.frustumCulled = false;
    line.visible = false;
    return line;
}

/**
 * The circle the station is flying, in the inertial frame — a child of `earthTilt`,
 * *not* of the Earth mesh, because the plane does not turn with the ground.
 *
 * The vertices are written once, as a unit circle in the XY plane, and never touched
 * again: the orbit is a circle of a fixed radius, so all that changes frame to frame is
 * which way the plane faces, and that is one quaternion. Vertex zero sits at the
 * station because the basis is built from its own position, which is what anchors the
 * brightness ramp to the direction of travel.
 */
export const issOrbitPath = buildLine([0.44, 0.88, 0.79]);
{
    const positions = issOrbitPath.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i <= SAMPLES; i++) {
        const angle = (i / SAMPLES) * Math.PI * 2;
        positions.setXYZ(i, Math.cos(angle) * ISS_ORBITAL_RADIUS, Math.sin(angle) * ISS_ORBITAL_RADIUS, 0);
    }
    positions.needsUpdate = true;
}

/**
 * ...and where that passes over the ground: a child of the Earth **mesh**, so the
 * scene graph's own spin carries a curve built in the surface's frame, exactly the
 * trick `analemma.ts` uses.
 */
export const issGroundTrack = buildLine([0.98, 0.62, 0.28]);

/**
 * The two tables the ground track is swept out with, both fixed for the life of the
 * page: how far round the orbit each sample is, and how far the Earth has turned by the
 * time the station gets there. Only the *frame* changes per frame, so the per-sample
 * trigonometry is paid once here rather than 256 times every frame.
 */
const orbitCos = new Float32Array(SAMPLES + 1);
const orbitSin = new Float32Array(SAMPLES + 1);
const spinCos = new Float32Array(SAMPLES + 1);
const spinSin = new Float32Array(SAMPLES + 1);
for (let i = 0; i <= SAMPLES; i++) {
    const fraction = i / SAMPLES;
    const orbitAngle = fraction * Math.PI * 2;
    orbitCos[i] = Math.cos(orbitAngle);
    orbitSin[i] = Math.sin(orbitAngle);
    // Backwards, because this undoes the rotation the ground will have made: 6.45% of a
    // sidereal day per orbit, i.e. the 23.2° the track shifts west each time round.
    const spinAngle = (-fraction * ISS_ORBITAL_PERIOD_S * Math.PI * 2) / EARTH_SIDEREAL_DAY;
    spinCos[i] = Math.cos(spinAngle);
    spinSin[i] = Math.sin(spinAngle);
}

const basis = new Matrix4();
const localPosition = new Vector3();
const localVelocity = new Vector3();

/**
 * Rebuild both curves for this frame.
 *
 * Skipped outright while they are hidden, which is the usual case — and while they are
 * shown, the orbit path costs one quaternion and the ground track 257 vertices of
 * linear algebra with no trigonometry in it at all.
 *
 * @param earthRotationY the Earth mesh's current spin, for undoing it
 */
export function updateISSTrajectory(earthRotationY: number): void {
    if (!issOrbitPath.visible && !issGroundTrack.visible) return;

    if (issOrbitPath.visible) {
        // The station's own frame, as a rotation: local +X onto the position, +Y onto
        // the direction of travel, +Z onto the orbit normal. That is a right-handed
        // triad — position × velocity is the normal — so it is a pure rotation, and it
        // puts vertex zero of the circle exactly under the station.
        basis.makeBasis(issOrbitFrame.position, issOrbitFrame.velocity, issOrbitFrame.normal);
        issOrbitPath.quaternion.setFromRotationMatrix(basis);
    }

    if (!issGroundTrack.visible) return;

    // The orbit frame lives in `earthTilt` coordinates; the ground track is drawn as a
    // child of the Earth mesh, which is one spin further in.
    localPosition.copy(issOrbitFrame.position).applyAxisAngle(Y_AXIS, -earthRotationY);
    localVelocity.copy(issOrbitFrame.velocity).applyAxisAngle(Y_AXIS, -earthRotationY);

    const positions = issGroundTrack.geometry.attributes.position as BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i <= SAMPLES; i++) {
        // Where the station will be, i/SAMPLES of an orbit from now...
        const x = localPosition.x * orbitCos[i] + localVelocity.x * orbitSin[i];
        const y = localPosition.y * orbitCos[i] + localVelocity.y * orbitSin[i];
        const z = localPosition.z * orbitCos[i] + localVelocity.z * orbitSin[i];
        // ...and where the ground under it will have got to by then.
        array[i * 3] = (x * spinCos[i] + z * spinSin[i]) * GROUND_TRACK_RADIUS;
        array[i * 3 + 1] = y * GROUND_TRACK_RADIUS;
        array[i * 3 + 2] = (-x * spinSin[i] + z * spinCos[i]) * GROUND_TRACK_RADIUS;
    }
    positions.needsUpdate = true;
}
