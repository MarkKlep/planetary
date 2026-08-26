import { Vector3 } from 'three';
import { getSimulatedDate, getTimeSpeed, isPaused } from '../simulation';
import { BODY_LABELS, sceneState } from '../scene-bridge';
import { findSite } from '../planets/earth/moon-surface/sites';
import {
    earthOrbitPosition,
    jupiterOrbitPosition,
    marsOrbitPosition,
    mercuryOrbitPosition,
    moonEclipticLongitude,
    saturnOrbitPosition,
    solarPosition,
    uranusOrbitPosition,
    venusOrbitPosition,
} from '../orbits';
import {
    EARTH_ORBIT_RADIUS,
    EARTH_RADIUS_KM,
    MOON_DISTANCE_KM,
} from '../constants/planets.const';

/**
 * The block of live simulation state handed to the assistant with every message.
 *
 * Supplied as *context* rather than exposed as a set of tools on purpose. A 7B model
 * reads a small table reliably; deciding to call `get_distance(a, b)`, getting both
 * arguments right and then interpreting the result is a much worse bet, and it costs a
 * round trip each time. Everything here is derived from the same ephemeris the scene is
 * drawn from, so the chat cannot quote a number that disagrees with what is on screen.
 */

const PLANETS: Array<[string, (date: Date, target?: Vector3) => Vector3]> = [
    ['Mercury', mercuryOrbitPosition],
    ['Venus', venusOrbitPosition],
    ['Earth', earthOrbitPosition],
    ['Mars', marsOrbitPosition],
    ['Jupiter', jupiterOrbitPosition],
    ['Saturn', saturnOrbitPosition],
    ['Uranus', uranusOrbitPosition],
];

const TWO_PI = Math.PI * 2;

/** Names the phase from the Moon's elongation from the Sun, in radians. */
function moonPhaseName(elongation: number): string {
    const turns = elongation / TWO_PI;
    if (turns < 0.03 || turns > 0.97) return 'new';
    if (turns < 0.22) return 'waxing crescent';
    if (turns < 0.28) return 'first quarter';
    if (turns < 0.47) return 'waxing gibbous';
    if (turns < 0.53) return 'full';
    if (turns < 0.72) return 'waning gibbous';
    if (turns < 0.78) return 'last quarter';
    return 'waning crescent';
}

function formatDistance(sceneUnits: number): string {
    const au = sceneUnits / EARTH_ORBIT_RADIUS;
    const millionKm = (sceneUnits * EARTH_RADIUS_KM) / 1e6;
    return `${au.toFixed(3)} AU (${millionKm.toFixed(1)} million km)`;
}

export function buildSceneContext(): string {
    const date = getSimulatedDate();
    const lines: string[] = [];

    lines.push(`Simulated date and time: ${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`);

    const speed = getTimeSpeed();
    if (isPaused()) {
        lines.push('The simulation clock is paused.');
    } else if (speed !== 1) {
        lines.push(`Time is running at ${speed}x real time.`);
    }

    // Where the user is, which is the whole point of "what am I looking at?".
    if (sceneState.mode === 'surface') {
        const site = sceneState.surfaceSite ? findSite(sceneState.surfaceSite) : null;
        lines.push(
            site
                ? `The user is standing on the Moon at ${site.label} (${site.latitude.toFixed(2)}°N, ${site.longitude.toFixed(2)}°E). ${site.note}`
                : 'The user is standing on the surface of the Moon.'
        );
    } else if (sceneState.mode === 'free-flight') {
        lines.push(
            `The user is flying the camera manually (free flight). The last body they focused was ${BODY_LABELS[sceneState.focusedBody]}.`
        );
    } else {
        lines.push(`The camera is currently looking at ${BODY_LABELS[sceneState.focusedBody]}.`);
    }

    // Live geometry. Distances from Earth are the ones people actually ask about, and
    // they are the ones that change most — Mars swings over more than a factor of six.
    const earthPosition = earthOrbitPosition(date, new Vector3());
    const scratch = new Vector3();

    lines.push('', 'Live positions at that instant, computed from this simulation:');
    for (const [name, positionOf] of PLANETS) {
        const position = positionOf(date, scratch.clone());
        const fromSun = formatDistance(position.length());
        if (name === 'Earth') {
            lines.push(`- Earth: ${fromSun} from the Sun.`);
        } else {
            const fromEarth = formatDistance(position.distanceTo(earthPosition));
            lines.push(`- ${name}: ${fromSun} from the Sun, ${fromEarth} from Earth.`);
        }
    }

    // The Moon's longitude here is a mean one, so the phase cycle is right but the
    // angle can be a degree or two out — stated rather than quietly implied.
    const elongation = ((moonEclipticLongitude(date) - solarPosition(date).eclipticLongitude) % TWO_PI + TWO_PI) % TWO_PI;
    const illuminated = (1 - Math.cos(elongation)) / 2;
    lines.push(
        `- The Moon: ${MOON_DISTANCE_KM.toLocaleString('en-US')} km from Earth, ${moonPhaseName(elongation)}, ${(illuminated * 100).toFixed(0)}% illuminated.`
    );

    return lines.join('\n');
}
