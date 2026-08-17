/**
 * Places to stand.
 *
 * Selenographic coordinates, positive east — the same convention `geo.ts` uses and
 * the same one the LROC mosaic in `public/textures/moon_color.jpg` is painted in, so
 * a site's latitude and longitude index straight into the map without a sign fix.
 *
 * The choice of site is not decoration. Three things fall out of these two numbers
 * alone, and none of them is written down anywhere else:
 *
 *  - **Where Earth is.** The Moon is tidally locked, so Earth does not rise or set —
 *    it hangs at a fixed point in the sky set purely by the observer's coordinates.
 *    Overhead at (0°, 0°), on the horizon at 90° of longitude, and never visible at
 *    all from the far side. Moscoviense is here to make that last case real.
 *  - **How high the Sun ever gets.** The Moon's axis is tilted only 1.54° to the
 *    ecliptic, so at Shackleton the Sun can never climb more than about a degree and
 *    a half above the horizon, and half of each month sits just below it. Permanent
 *    grazing light, shadows kilometres long, and — the reason anyone cares — crater
 *    floors that have not seen the Sun in two billion years.
 *  - **What the ground is made of.** Mare basalt is dark and comparatively young, so
 *    it is smooth; the highlands are bright, four billion years old, and cratered to
 *    saturation. The brightness comes from the mosaic; the crater density has to be
 *    said out loud, and that is what `craterDensity` is.
 *
 * ## Where the numbers come from
 *
 * The six Apollo coordinates are not the ones in the flight plans. They are the
 * positions LRO *photographed the hardware at* — Wagner et al. (2017) picked the
 * descent stages out of NAC frames and tied them to the LOLA control network — which
 * is why they run to five decimal places and why some of them moved by a kilometre or
 * more from what was believed at the time. Apollo 11's own crew did not know where
 * they were to better than a few kilometres for years afterwards.
 */

/** How the crew got about once they were more than a few hundred metres out. */
export type SiteTransport =
    /** Apollo 11, 12: on foot, and never more than about 400 m from the ladder. */
    | 'foot'
    /** Apollo 14's Modular Equipment Transporter — a two-wheeled hand cart. */
    | 'met'
    /** The Lunar Roving Vehicle, on the last three. Still parked where it was left. */
    | 'lrv';

/**
 * What was left behind, at the sites where anyone has been.
 *
 * Five of the eleven sites here have nothing on them and never have, and that is worth
 * saying out loud rather than quietly decorating every landing: walking out at
 * Copernicus and finding an untouched surface is the correct outcome, and the more
 * striking one for standing beside Eagle five minutes earlier.
 */
export interface SiteArtefacts {
    mission: string;
    /** The lunar module's name. Only the descent stage is still there. */
    lander: string;
    /** Landing date, for the read-out. */
    date: string;
    /**
     * Apollo 11's flag was knocked flat by the ascent engine on liftoff — Aldrin
     * watched it go over through the window. It is the only one of the six that fell,
     * and it is still lying where it landed.
     *
     * The later crews planted theirs further out for exactly this reason.
     */
    flagStanding: boolean;
    /**
     * Apollo 11 left EASEP — a seismometer and a retroreflector, running on solar
     * cells and dead within weeks. Every later mission left the full ALSEP, with a
     * plutonium generator that ran it for years and a central station to talk home.
     */
    science: 'easep' | 'alsep';
    transport: SiteTransport;
    /**
     * Apollo 15's *Fallen Astronaut*: a 8.5 cm aluminium figure laid face down beside
     * a plaque listing the fourteen astronauts and cosmonauts dead by then. Left
     * without telling anyone in advance. It is the only sculpture on another world.
     */
    memorial?: boolean;
    /**
     * Apollo 16's far-ultraviolet camera and spectrograph, stood in the LM's shadow
     * with its own tripod. The only astronomical telescope ever *operated* from the
     * surface of another world — everything since has been an orbiter.
     */
    telescope?: boolean;
    /** One line for the read-out. */
    note: string;
}

export interface LandingSite {
    id: string;
    label: string;
    /** One line for the read-out — what is worth looking at here. */
    note: string;
    latitude: number;
    /** Degrees, positive east. */
    longitude: number;
    /**
     * Crater production scaled against mare, which is 1. The lunar highlands carry
     * roughly four times the small-crater density of the maria, being some 700
     * million years older and never resurfaced.
     */
    craterDensity: number;
    /** Metre-scale regolith undulation, in metres. Rougher on old, gardened ground. */
    relief: number;
    /** Fixes the crater field, so a site looks the same every time you return to it. */
    seed: number;
    /** Present only where somebody has actually been. */
    artefacts?: SiteArtefacts;
}

export const LANDING_SITES: LandingSite[] = [
    {
        id: 'tranquility',
        label: 'Tranquility Base',
        note: 'Apollo 11. Dark mare basalt, and Earth near the zenith.',
        latitude: 0.67416,
        longitude: 23.47314,
        craterDensity: 1,
        relief: 0.35,
        seed: 1969,
        artefacts: {
            mission: 'Apollo 11',
            lander: 'Eagle',
            date: '20 July 1969',
            flagStanding: false,
            science: 'easep',
            transport: 'foot',
            note: "Eagle's descent stage, EASEP, and the fallen flag.",
        },
    },
    {
        id: 'surveyor',
        label: 'Surveyor crater',
        note: 'Apollo 12, in Oceanus Procellarum — a pinpoint landing 155 m from a probe already there.',
        latitude: -3.01239,
        longitude: -23.42157,
        craterDensity: 1.1,
        relief: 0.4,
        seed: 1112,
        artefacts: {
            mission: 'Apollo 12',
            lander: 'Intrepid',
            date: '19 November 1969',
            flagStanding: true,
            science: 'alsep',
            transport: 'foot',
            note: "Intrepid's descent stage and the first full ALSEP.",
        },
    },
    {
        id: 'framauro',
        label: 'Fra Mauro',
        note: "Apollo 14. Ejecta from the Imbrium impact, and the hill they never quite reached the top of.",
        latitude: -3.64589,
        longitude: -17.47194,
        craterDensity: 1.9,
        relief: 0.7,
        seed: 1114,
        artefacts: {
            mission: 'Apollo 14',
            lander: 'Antares',
            date: '5 February 1971',
            flagStanding: true,
            science: 'alsep',
            transport: 'met',
            note: "Antares' descent stage, the MET hand cart, and two golf balls.",
        },
    },
    {
        id: 'hadley',
        label: 'Hadley–Apennine',
        note: 'Apollo 15, at the foot of the Apennine front.',
        latitude: 26.13239,
        longitude: 3.6333,
        craterDensity: 1.4,
        relief: 0.6,
        seed: 1971,
        artefacts: {
            mission: 'Apollo 15',
            lander: 'Falcon',
            date: '30 July 1971',
            flagStanding: true,
            science: 'alsep',
            transport: 'lrv',
            memorial: true,
            note: "Falcon's descent stage, the first rover, and the Fallen Astronaut.",
        },
    },
    {
        id: 'descartes',
        label: 'Descartes Highlands',
        note: 'Apollo 16. Bright highland crust, four billion years old and cratered to saturation.',
        latitude: -8.97341,
        longitude: 15.50019,
        craterDensity: 2.4,
        relief: 0.85,
        seed: 1116,
        artefacts: {
            mission: 'Apollo 16',
            lander: 'Orion',
            date: '21 April 1972',
            flagStanding: true,
            science: 'alsep',
            transport: 'lrv',
            telescope: true,
            note: "Orion's descent stage and the only telescope ever run from the Moon.",
        },
    },
    {
        id: 'taurus',
        label: 'Taurus–Littrow',
        note: 'Apollo 17, the last. A deep valley with walls higher than the Grand Canyon.',
        latitude: 20.1908,
        longitude: 30.77168,
        craterDensity: 1.6,
        relief: 0.65,
        seed: 1117,
        artefacts: {
            mission: 'Apollo 17',
            lander: 'Challenger',
            date: '11 December 1972',
            flagStanding: true,
            science: 'alsep',
            transport: 'lrv',
            note: "Challenger's descent stage, and the last bootprints anyone has left.",
        },
    },
    {
        id: 'copernicus',
        label: 'Copernicus',
        note: 'An 800-million-year-old impact basin, 93 km across.',
        latitude: 9.62,
        longitude: -20.08,
        craterDensity: 2.2,
        relief: 0.8,
        seed: 1667,
    },
    {
        id: 'tycho',
        label: 'Tycho',
        note: 'The youngest big crater on the near side — bright, raw ejecta.',
        latitude: -43.31,
        longitude: -11.36,
        craterDensity: 2.6,
        relief: 0.9,
        seed: 1108,
    },
    {
        id: 'shackleton',
        label: 'Shackleton rim',
        note: 'The south pole. The Sun never rises more than 1.5° — and often not at all.',
        latitude: -89.9,
        longitude: 0,
        craterDensity: 3.4,
        relief: 0.75,
        seed: 1909,
    },
    {
        id: 'mouton',
        label: 'Mons Mouton',
        note: 'One of the nine regions Artemis III may land in. Nobody has been — yet.',
        latitude: -84.6,
        longitude: 31,
        craterDensity: 3.1,
        relief: 0.8,
        seed: 2026,
    },
    {
        id: 'moscoviense',
        label: 'Mare Moscoviense',
        note: 'Far side. Earth is 49° below the horizon and never comes up.',
        latitude: 27.3,
        longitude: 147.9,
        craterDensity: 2.8,
        relief: 0.7,
        seed: 1959,
    },
];

export const DEFAULT_SITE = LANDING_SITES[0];

export function findSite(id: string): LandingSite {
    return LANDING_SITES.find((site) => site.id === id) ?? DEFAULT_SITE;
}

/**
 * The site nearest a direction in the Moon mesh's own local frame — used when a click
 * lands on the globe, so "put me down there" picks the closest place worth standing
 * rather than inventing a nameless one.
 */
export function nearestSite(localDirection: {
    x: number;
    y: number;
    z: number;
}): LandingSite {
    let best = DEFAULT_SITE;
    let bestDot = -Infinity;

    for (const site of LANDING_SITES) {
        const lat = (site.latitude * Math.PI) / 180;
        const lon = (site.longitude * Math.PI) / 180;
        const cosLat = Math.cos(lat);
        // Same mapping as `latLonToDirection`, negative z included.
        const dot =
            cosLat * Math.cos(lon) * localDirection.x +
            Math.sin(lat) * localDirection.y +
            -cosLat * Math.sin(lon) * localDirection.z;
        if (dot > bestDot) {
            bestDot = dot;
            best = site;
        }
    }

    return best;
}
