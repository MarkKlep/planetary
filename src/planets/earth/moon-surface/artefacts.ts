import {
    BoxGeometry,
    BufferGeometry,
    CanvasTexture,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    MathUtils,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    PlaneGeometry,
    Quaternion,
    RepeatWrapping,
    SRGBColorSpace,
    TorusGeometry,
    Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from './colliders';
import { foilNormalMap } from './foil';
import type { LandingSite } from './sites';

/**
 * What was left behind.
 *
 * Six of the eleven landing sites have anything on them at all, and the rest are bare —
 * which is the point. Nothing here is scattered around every site as set dressing; it is
 * placed where it actually is, and Copernicus is empty because nobody has ever been to
 * Copernicus.
 *
 * ## The six are not six copies of each other
 *
 * This is the thing most worth getting right, because the temptation is to build one
 * Apollo site and stamp it out. The programme changed enormously across three and a half
 * years, and what is lying on the ground says so:
 *
 *  - **Apollo 11** left EASEP — a seismometer and a retroreflector on solar cells, dead
 *    within weeks. Armstrong and Aldrin were outside for 2 hours 31 minutes, never went
 *    more than about 60 m from the ladder, and planted the flag close in.
 *  - **Apollo 12 onward** left the full **ALSEP**, run by a plutonium generator that
 *    kept the instruments reporting until they were switched off in 1977. The RTG is the
 *    one object at these sites that was still doing something a decade after it was set
 *    down, and it looks like nothing else there: a finned cask, warm to this day.
 *  - **Apollo 14** brought the **MET**, a two-wheeled hand cart the crew pulled like a
 *    rickshaw. It is the only wheeled thing left at that site and the last mission that
 *    had to walk.
 *  - **Apollo 15, 16 and 17** brought the **LRV**, and the character of the whole thing
 *    changes: kilometres instead of hundreds of metres.
 *
 * ## Everything here stands on the ground it is actually over
 *
 * The cluster spreads about 25 m, and over 25 m of a cratered surface the ground moves
 * through a metre or more. So there is no single datum: the group is anchored under the
 * lander, and every separate thing in it — each instrument, the cask, each geophone, the
 * flag, the cart — is lifted by `heightAt` **at its own position**. Anything sharing one
 * datum with the lander is a thing that would be floating over a bowl or buried in a rim
 * the moment the crater field moved under it, which it does at every site.
 *
 * The descent stage is the one thing that cannot be placed by a single height either,
 * because it does not stand at a point — it stands on four pads 9.4 m apart. So it is
 * **settled on those four**, exactly the way `drive.ts` settles the rover on its wheels:
 * the mean sets how high it rides and the least-squares slope through them sets which way
 * it leans. Apollo 11 came down about 4.5° out of level and 15 landed on the edge of a
 * crater at 11°, so the lean is the normal case rather than the failure case — and
 * `MAX_TILT` is there because a lander pitched further than any of them actually were
 * reads as a bug however honestly the arithmetic arrived at it.
 *
 * ## And you cannot walk through any of it
 *
 * `colliders.ts` carries the argument for why the obstacles are upright cylinders and
 * nothing more. What is worth noting here is the choice of *which* things get one. Not
 * everything does: a footpad is 16 cm tall, a geophone is 9 cm, a ribbon cable is a
 * centimetre, and being stopped dead by any of those on a surface where you can jump
 * 80 cm would be far more wrong than walking over them. So the rule is the obstacle's
 * height, and it is the same rule for a boulder.
 *
 * ## What is actually still there
 *
 * Only the **descent stage**. The ascent stage is what left — what you walk up to is a
 * four-legged octagon with a hole in the top where the rest of the spacecraft used to be,
 * wrapped in the amber Kapton that kept it from cooking. That blanket is the one
 * unmistakable colour on the Moon and it is *crumpled*, which is what `foil.ts` exists
 * for: hand-taped over a structure it did not fit, with no air to pull it smooth.
 *
 * The **flag at Tranquility Base is lying flat**, and that is not a mistake — nor is it
 * hard-coded. It fell because it was planted about 8 m from the engine that was about to
 * fire; the later crews planted theirs well clear, and theirs are still standing. So the
 * flag's distance from the LM is the *cause*, `blast()` knocks over whatever is inside
 * the radius, and Apollo 11's being the only one of the six to fall comes out of the
 * arithmetic rather than out of a flag.
 *
 * All of them, standing or not, have been bleached by fifty years of unfiltered
 * ultraviolet — there is no ozone up there and no night long enough to matter — so the
 * colours are rendered well faded.
 *
 * ## Cost
 *
 * Static geometry merges to one buffer per material, and there are five materials, so a
 * fully-equipped site is about a dozen draw calls including the flag and the cart —
 * which are separate because they are placed, rotated and (in the flag's case) *moved* as
 * units. The whole cluster sits in a `Group` whose bounds are tens of metres across, so
 * it culls cleanly whenever the observer looks the other way. At a site with no
 * artefacts, none of this is built at all.
 */

// --- materials -------------------------------------------------------------

/**
 * Amber Kapton over the descent stage — and the one place where the honest number is the
 * wrong one, for a reason worth writing down because it applies to every metal here.
 *
 * Aluminised film is metal, and its real metalness is very nearly 1. But this scene has
 * **no environment map**: `moon-surface.ts` builds a bare `Scene` with a sun, a bounce
 * light and nothing else. In three.js's standard model a metal takes essentially all of
 * its appearance from what it reflects, and its diffuse response is scaled by
 * `1 − metalness` — so a fully metallic surface with no environment is a black shape with
 * one specular glint on it. Pushed to 0.9 the descent stage renders as a dark octagon,
 * which is the opposite of what the blanket is for.
 *
 * What is actually missing is a specific reflection rather than reflection in general:
 * the regolith is a bright hemisphere filling half the sky under the vehicle, and the
 * scene represents it as a `HemisphereLight` — which contributes diffuse and nothing
 * else. So dropping the metalness is not a fudge away from the physics; it is putting the
 * ground-bounce back into the one channel this renderer will evaluate. The film's
 * *character* is then carried where it belongs, by the crumple map's glints.
 */
export const kaptonMaterial = new MeshStandardMaterial({
    color: 0xc98f2e,
    metalness: 0.62,
    roughness: 0.38,
});
/** Bare and painted structure: struts, footpads, ladder, instrument cases. */
export const structureMaterial = new MeshStandardMaterial({
    color: 0xa8aab0,
    metalness: 0.38,
    roughness: 0.48,
});
/** Black thermal blanket and the shaded panels between the Kapton. Creased likewise. */
export const darkMaterial = new MeshStandardMaterial({
    color: 0x2a2a31,
    metalness: 0.26,
    roughness: 0.7,
});
/**
 * Hardware the surface has got to: the skirt under the engine, the base of everything
 * that was set down on the regolith, and the mound a flag pole was driven into.
 *
 * Lunar dust is electrostatically charged and abrasive and it clung to everything the
 * crews touched; the descent engine put a sheet of it sideways across the ground at
 * landing, so the underside of the stage came out of it grey rather than gold. Matte and
 * non-metallic, because that is the one surface in the cluster that is powder.
 */
export const dustedMaterial = new MeshStandardMaterial({
    color: 0x8b8377,
    metalness: 0.03,
    roughness: 0.97,
});

/**
 * Applied once, here, rather than at each construction site — the map is a singleton and
 * so are the materials, so this runs on the first landing and never again.
 */
function creaseFoil(): void {
    if (kaptonMaterial.normalMap) return;
    const map = foilNormalMap();
    kaptonMaterial.normalMap = map;
    kaptonMaterial.normalScale.set(0.9, 0.9);
    darkMaterial.normalMap = map;
    // Half strength: the black blankets were pulled tighter than the gold ones, and a
    // crease only shows in a surface that is reflecting something to begin with.
    darkMaterial.normalScale.set(0.45, 0.45);
    // Per-face UVs run 0..1 whatever the face measures, so a fixed repeat lands the
    // creases at very different scales on a 4 m blanket and a 20 cm box. Three is the
    // compromise that keeps the big panels from looking smooth without turning the small
    // boxes into gravel.
    map.repeat.set(3, 3);
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    kaptonMaterial.needsUpdate = true;
    darkMaterial.needsUpdate = true;
}

const MATERIALS = {
    kapton: kaptonMaterial,
    structure: structureMaterial,
    dark: darkMaterial,
    dusted: dustedMaterial,
} as const;

export type MaterialKey = keyof typeof MATERIALS;

/** A bag of geometry sorted by material, merged into one mesh each at the end. */
export class PartSet {
    private readonly groups = new Map<MaterialKey, BufferGeometry[]>();

    add(key: MaterialKey, geometry: BufferGeometry, x = 0, y = 0, z = 0): void {
        geometry.translate(x, y, z);
        const existing = this.groups.get(key);
        if (existing) existing.push(geometry);
        else this.groups.set(key, [geometry]);
    }

    build(target: Object3D): BufferGeometry[] {
        const built: BufferGeometry[] = [];
        for (const [key, geometries] of this.groups) {
            const merged = mergeGeometries(geometries, false);
            if (!merged) continue;
            const mesh = new Mesh(merged, MATERIALS[key]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            target.add(mesh);
            built.push(merged);
        }
        return built;
    }
}

export const UP = new Vector3(0, 1, 0);

/** A tube between two points — most of a lunar module is these. */
export function strut(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    radius: number
): BufferGeometry {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const geometry = new CylinderGeometry(radius, radius, length, 6);
    // A cylinder is built along +Y; rotate that onto the strut's own direction.
    const orientation = new Quaternion().setFromUnitVectors(
        UP,
        new Vector3(dx, dy, dz).divideScalar(length)
    );
    geometry.applyQuaternion(orientation);
    geometry.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    return geometry;
}

/**
 * Where the ground is, in the cluster's own frame — and the reason nothing floats.
 *
 * Zero under the lander by construction, and emphatically not zero anywhere else.
 */
type LocalGround = (x: number, z: number) => number;

/** Registers something you cannot walk through. See `colliders.ts`. */
type Solidify = (x: number, z: number, radius: number, top: number) => void;

// --- the descent stage -----------------------------------------------------

/**
 * Circumradius, so 4.22 m corner to corner — the figure the octagon is actually quoted
 * at. `CylinderGeometry`'s radius is the circumradius too, so this goes in unchanged and
 * the apothem below is what anything lying flat against a face needs.
 */
const DESCENT_RADIUS_M = 2.11;
const DESCENT_APOTHEM_M = DESCENT_RADIUS_M * Math.cos(Math.PI / 8);
const DESCENT_HEIGHT_M = 1.65;
/** Footpad to footpad, diagonally. The legs splay a long way out. */
const LEG_SPAN_M = 9.4;
const FOOTPAD_RADIUS_M = 0.47;
/** How high the body rides once the gear has taken the landing. */
const DECK_Y = 1.5;
/**
 * Top of the descent stage, which is the plane the ascent stage bolted to. Exported so
 * that anything putting the other half back has one number to put it at.
 */
export const DESCENT_DECK_Y = DECK_Y + DESCENT_HEIGHT_M;

/**
 * Which way each face of the octagon points, and the one piece of bookkeeping in this
 * file that is easy to get subtly wrong.
 *
 * `CylinderGeometry` lays its vertices at `(r·sin θ, r·cos θ)`, so after the `rotateY`
 * that puts a flat toward the camera, the **face centres** land on exact multiples of
 * `π/4` in that same parametrisation. Even indices are the four equipment bays; the odd
 * ones are the four the legs hang off, which is how the real vehicle is divided too.
 */
function faceAngle(index: number): number {
    return (index * Math.PI) / 4;
}

/** A slab lying flat against one face, its outward normal along that face's. */
function facePanel(
    parts: PartSet,
    key: MaterialKey,
    index: number,
    width: number,
    height: number,
    y: number,
    thickness: number,
    outset = 0
): void {
    const theta = faceAngle(index);
    const panel = new BoxGeometry(width, height, thickness);
    // `rotateY(θ)` carries the box's +Z onto `(sin θ, 0, cos θ)`, which is the face's own
    // outward direction — so the panel is square to the face rather than merely near it.
    panel.rotateY(theta);
    const radius = DESCENT_APOTHEM_M + thickness / 2 + outset;
    parts.add(key, panel, Math.sin(theta) * radius, y, Math.cos(theta) * radius);
}

/** The bay on the same quadrant as the ladder, for the MESA. */
const MESA_FACE = 2;
/** Which way the leg carrying the ladder points, measured as `atan2(z, x)`. */
const LADDER_BEARING = Math.PI / 4;

function buildDescentStage(parts: PartSet, solid: Solidify): void {
    const radius = DESCENT_RADIUS_M;

    // --- the octagonal body ---
    // Eight sides wrapped in Kapton, with the blanket seams and the vertical corner
    // battens that hold it on. Bare, the octagon is a drum; it is the seams and the
    // battens that make it read as a wrapped structure rather than as a turned solid.
    const body = new CylinderGeometry(radius, radius, DESCENT_HEIGHT_M, 8);
    body.rotateY(Math.PI / 8);
    parts.add('kapton', body, 0, DECK_Y + DESCENT_HEIGHT_M / 2, 0);

    for (const seamY of [DECK_Y + 0.42, DECK_Y + 1.16]) {
        const seam = new CylinderGeometry(radius + 0.012, radius + 0.012, 0.05, 8);
        seam.rotateY(Math.PI / 8);
        parts.add('dark', seam, 0, seamY, 0);
    }
    // Corner battens, on the eight vertices rather than the eight faces — offset by half
    // a face from `faceAngle`, which is what a vertex is.
    for (let i = 0; i < 8; i++) {
        const theta = faceAngle(i) + Math.PI / 8;
        const batten = new BoxGeometry(0.07, DESCENT_HEIGHT_M - 0.06, 0.07);
        batten.rotateY(theta);
        parts.add(
            'structure',
            batten,
            Math.sin(theta) * (radius - 0.02),
            DECK_Y + DESCENT_HEIGHT_M / 2,
            Math.cos(theta) * (radius - 0.02)
        );
    }

    // The dusted skirt. The descent engine threw regolith flat across the ground at
    // landing rather than digging a crater — there is no air to make a plume — and the
    // stage came out of that with its lower foot of blanket grey instead of gold.
    const skirt = new CylinderGeometry(radius + 0.02, radius + 0.02, 0.34, 8);
    skirt.rotateY(Math.PI / 8);
    parts.add('dusted', skirt, 0, DECK_Y + 0.17, 0);

    // --- the quadrant bays ---
    // Four of the eight faces are equipment bays and four carry the legs. The bays are
    // recessed dark panels in a light frame; the MESA sits in the one next to the ladder.
    // Sized and placed to sit *between* the two seams rather than across them, which is
    // both what a panel bolted into a bay does and what keeps the seam bands from
    // emerging through the middle of one.
    const BAY_Y = DECK_Y + 0.79;
    for (const index of [0, 4, 6]) {
        facePanel(parts, 'structure', index, 1.44, 0.8, BAY_Y, 0.05);
        facePanel(parts, 'dark', index, 1.26, 0.62, BAY_Y, 0.04, 0.05);
    }

    // The MESA: the equipment bay that hinged down beside the ladder, and where the
    // television camera that filmed the first step was mounted, pointing back at it.
    const mesaTheta = faceAngle(MESA_FACE);
    const mesaX = Math.sin(mesaTheta);
    const mesaZ = Math.cos(mesaTheta);
    // Framed rather than panelled: this quadrant is a cavity with its door hanging open,
    // so what should be on the face is the surround and a shadowed recess, not a slab.
    facePanel(parts, 'dark', MESA_FACE, 1.3, 1.0, DECK_Y + 0.9, 0.04, -0.03);
    for (const edge of [-0.52, 0.52]) {
        const post = new BoxGeometry(0.1, 1.06, 0.07);
        post.rotateY(mesaTheta);
        parts.add(
            'structure',
            post,
            mesaX * (DESCENT_APOTHEM_M + 0.035) + mesaZ * edge,
            DECK_Y + 0.9,
            mesaZ * (DESCENT_APOTHEM_M + 0.035) - mesaX * edge
        );
    }
    for (const edge of [-0.51, 0.51]) {
        const rail = new BoxGeometry(1.14, 0.09, 0.07);
        rail.rotateY(mesaTheta);
        parts.add(
            'structure',
            rail,
            mesaX * (DESCENT_APOTHEM_M + 0.035),
            DECK_Y + 0.9 + edge,
            mesaZ * (DESCENT_APOTHEM_M + 0.035)
        );
    }
    const shelf = new BoxGeometry(1.24, 0.05, 0.62);
    shelf.rotateY(mesaTheta);
    parts.add(
        'dark',
        shelf,
        mesaX * (DESCENT_APOTHEM_M + 0.32),
        DECK_Y + 0.36,
        mesaZ * (DESCENT_APOTHEM_M + 0.32)
    );
    // The two stays that held the shelf out level once it was dropped.
    for (const side of [-1, 1]) {
        const acrossX = mesaZ * side * 0.55;
        const acrossZ = -mesaX * side * 0.55;
        parts.add(
            'structure',
            strut(
                mesaX * DESCENT_APOTHEM_M + acrossX,
                DECK_Y + 0.94,
                mesaZ * DESCENT_APOTHEM_M + acrossZ,
                mesaX * (DESCENT_APOTHEM_M + 0.58) + acrossX,
                DECK_Y + 0.38,
                mesaZ * (DESCENT_APOTHEM_M + 0.58) + acrossZ,
                0.02
            )
        );
    }

    // --- the open deck ---
    // Where the ascent stage was. A flat top with the ring of hardpoints it bolted to,
    // the severed umbilical stubs, and nothing above them.
    const deck = new CylinderGeometry(radius * 0.94, radius * 0.94, 0.1, 8);
    deck.rotateY(Math.PI / 8);
    parts.add('dark', deck, 0, DESCENT_DECK_Y, 0);
    for (let i = 0; i < 4; i++) {
        const theta = faceAngle(i * 2) + Math.PI / 8;
        parts.add(
            'structure',
            new BoxGeometry(0.2, 0.24, 0.2),
            Math.sin(theta) * radius * 0.72,
            DESCENT_DECK_Y + 0.12,
            Math.cos(theta) * radius * 0.72
        );
    }
    // The cut umbilicals, which is the detail that says something was taken off here
    // rather than never fitted.
    for (const [ux, uz] of [[0.36, 0.5], [-0.5, 0.28]] as const) {
        parts.add('structure', new CylinderGeometry(0.05, 0.05, 0.22, 7), ux, DESCENT_DECK_Y + 0.15, uz);
        parts.add('dark', new CylinderGeometry(0.028, 0.028, 0.34, 5), ux, DESCENT_DECK_Y + 0.3, uz);
    }

    // --- the descent engine ---
    // The bell hangs below the stage into the ground it scoured. Open at the mouth, with
    // a cone set inside it: a one-sided open cylinder shows nothing at all from below,
    // and looking up into the engine and seeing daylight is worse than any saving.
    parts.add('structure', new CylinderGeometry(0.4, 0.4, 0.3, 14), 0, DECK_Y - 0.13, 0);
    parts.add('dark', new CylinderGeometry(0.34, 0.75, 1.2, 16, 1, true), 0, 0.88, 0);
    // The exit plane, and it is a closed disc rather than an opening for two reasons. An
    // open cylinder in a front-facing material shows nothing at all from underneath, so
    // the alternative is looking up into the engine and seeing sky; and the mouth hung
    // about 30 cm off the ground with the engine firing into it, so what is actually
    // there is caked in the dust it laid down.
    parts.add('dusted', new CylinderGeometry(0.75, 0.75, 0.05, 16), 0, 0.3, 0);

    // --- the landing gear ---
    // Each leg is a primary strut down to the footpad, a pair of secondary struts bracing
    // it back to the outriggers on either side, and the deployment truss above it. The
    // primary is drawn as two concentric tubes because that is what it is: an outer
    // cylinder over an inner piston packed with crushable aluminium honeycomb, which took
    // the landing by being permanently shortened by it.
    const reach = LEG_SPAN_M / 2;
    for (let i = 0; i < 4; i++) {
        const bearing = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const dirX = Math.cos(bearing);
        const dirZ = Math.sin(bearing);
        const padX = dirX * reach;
        const padZ = dirZ * reach;
        const hipX = dirX * DESCENT_APOTHEM_M;
        const hipZ = dirZ * DESCENT_APOTHEM_M;
        const hipY = DECK_Y + 0.24;
        // Across the leg, for the outriggers and the secondary struts' feet.
        const acrossX = -dirZ;
        const acrossZ = dirX;

        // The outrigger the leg hangs off, and the two secondary struts down to the
        // primary. These are what stop the gear reading as four sticks.
        for (const side of [-1, 1]) {
            const outX = hipX + acrossX * side * 0.62;
            const outZ = hipZ + acrossZ * side * 0.62;
            parts.add('structure', new BoxGeometry(0.16, 0.2, 0.16), outX, hipY, outZ);
            parts.add(
                'structure',
                strut(outX, hipY, outZ, dirX * reach * 0.62, 0.5, dirZ * reach * 0.62, 0.038)
            );
        }

        // Primary strut: outer cylinder from the hip, inner piston to the pad.
        const kneeX = MathUtils.lerp(hipX, padX, 0.5);
        const kneeZ = MathUtils.lerp(hipZ, padZ, 0.5);
        const kneeY = MathUtils.lerp(hipY, FOOTPAD_RADIUS_M * 0.5, 0.5);
        parts.add('structure', strut(hipX, hipY, hipZ, kneeX, kneeY, kneeZ, 0.09));
        parts.add('structure', strut(kneeX, kneeY, kneeZ, padX, FOOTPAD_RADIUS_M * 0.5, padZ, 0.062));

        // The deployment truss, from the top of the body out over the leg. The gear was
        // folded against the stage inside the launch shroud and swung out on this.
        parts.add(
            'structure',
            strut(hipX * 0.9, DECK_Y + DESCENT_HEIGHT_M * 0.92, hipZ * 0.9, kneeX, kneeY + 0.12, kneeZ, 0.032)
        );

        // The footpad. Dished rather than flat — 94 cm of shallow bowl with a rolled rim,
        // designed to spread the load over regolith nobody was sure would take it.
        parts.add(
            'dusted',
            new CylinderGeometry(FOOTPAD_RADIUS_M, FOOTPAD_RADIUS_M * 0.6, 0.14, 16),
            padX,
            0.09,
            padZ
        );
        const rim = new TorusGeometry(FOOTPAD_RADIUS_M - 0.02, 0.035, 5, 18);
        rim.rotateX(Math.PI / 2);
        parts.add('structure', rim, padX, 0.16, padZ);

        // The contact probe that hung a metre and a half below three of the four. When
        // one touched, a light came on in the cabin and the crew shut the engine down —
        // which is why the last thing said before the landing was "contact light". They
        // are bent now: they hit first and folded under the pad.
        if (i !== 0) {
            parts.add(
                'structure',
                strut(padX, 0.14, padZ, padX + dirX * 1.35, 0.06, padZ + dirZ * 1.35, 0.015)
            );
            parts.add('structure', new CylinderGeometry(0.05, 0.05, 0.04, 8), padX + dirX * 1.4, 0.05, padZ + dirZ * 1.4);
        }

        // Solid: the leg, and the pad you can step over. The primary strut is a slanting
        // tube, so the cylinder is fitted around its middle rather than its foot — being
        // stopped a little early beside a landing leg is not something anyone notices.
        solid(kneeX, kneeZ, 0.34, kneeY + 0.5);
    }

    // The body, and one circle really does do it here: an octagon's corners stand only
    // 8% further out than its flats, so the shape it is being approximated by is already
    // very nearly the shape it is. Split the difference between apothem and circumradius
    // and the error either way is under 9 cm — against a suited crewman who is the better
    // part of a metre deep front to back and could never have got his visor onto the skin
    // anyway. Four fitted circles were tried first and bought nothing a boot could tell.
    solid(0, 0, (DESCENT_APOTHEM_M + DESCENT_RADIUS_M) / 2, DECK_Y + DESCENT_HEIGHT_M);

    buildLadder(parts);
}

/**
 * The ladder on the forward leg, the porch at the top of it, and the plaque.
 *
 * Nine rungs, and the bottom one is a long way off the ground — the gear was expected to
 * crush on landing and mostly did not, which is why Armstrong had to describe the last
 * step down as a three-foot drop and why he tested getting back *up* before letting go.
 */
function buildLadder(parts: PartSet): void {
    const dirX = Math.cos(LADDER_BEARING);
    const dirZ = Math.sin(LADDER_BEARING);
    // Across the ladder rather than along it. Anything laid horizontally here — a rung,
    // the porch, the plaque — has to be turned onto this, and it is the one place in the
    // file where the sign is genuinely easy to get wrong in a way that still looks like
    // geometry: `rotateY(φ)` carries a box's +X onto `(cos φ, −sin φ)`, so the angle that
    // lands on the tangent is `π/2 − bearing`, and `−bearing` lands on the radius — a
    // ladder whose rungs all point away from the vehicle.
    const acrossX = -dirZ;
    const acrossZ = dirX;
    const ACROSS = Math.PI / 2 - LADDER_BEARING;
    const RAIL_HALF = 0.23;

    // The ladder hangs from the porch down the forward leg, leaning out with the strut it
    // is bolted to. Its bottom rung is the best part of a metre above the pad, because the
    // crushable struts were expected to take most of that on landing and at Tranquility
    // they barely compressed at all — which is why Armstrong described the last step down
    // as a three-foot drop and tried getting back *up* before letting go of the ladder.
    const TOP_Y = DESCENT_DECK_Y - 0.05;
    const BOTTOM_Y = 0.92;
    const TOP_R = DESCENT_APOTHEM_M + 0.34;
    const BOTTOM_R = DESCENT_APOTHEM_M + 1.06;

    for (const side of [-1, 1]) {
        const offsetX = acrossX * side * RAIL_HALF;
        const offsetZ = acrossZ * side * RAIL_HALF;
        parts.add(
            'structure',
            strut(
                dirX * BOTTOM_R + offsetX, BOTTOM_Y, dirZ * BOTTOM_R + offsetZ,
                dirX * TOP_R + offsetX, TOP_Y, dirZ * TOP_R + offsetZ,
                0.022
            )
        );
    }

    const RUNGS = 9;
    for (let i = 0; i < RUNGS; i++) {
        const along = i / (RUNGS - 1);
        const radius = MathUtils.lerp(BOTTOM_R, TOP_R, along);
        const rung = new CylinderGeometry(0.017, 0.017, RAIL_HALF * 2, 6);
        // Standing up Y, laid across the ladder, then turned onto its bearing.
        rung.rotateZ(Math.PI / 2);
        rung.rotateY(ACROSS);
        parts.add(
            'structure',
            rung,
            dirX * radius,
            MathUtils.lerp(BOTTOM_Y, TOP_Y, along),
            dirZ * radius
        );
    }

    // The porch — the small platform outside the hatch, where Armstrong stopped to pull
    // the MESA down and start the television camera before going any further, so that the
    // first step onto the surface was watched live by about a fifth of the people alive.
    const porch = new BoxGeometry(0.9, 0.05, 0.66);
    porch.rotateY(ACROSS);
    parts.add(
        'structure',
        porch,
        dirX * (DESCENT_APOTHEM_M + 0.22),
        TOP_Y,
        dirZ * (DESCENT_APOTHEM_M + 0.22)
    );
    for (const side of [-1, 1]) {
        parts.add(
            'structure',
            strut(
                dirX * (DESCENT_APOTHEM_M + 0.5) + acrossX * side * 0.38,
                TOP_Y - 0.03,
                dirZ * (DESCENT_APOTHEM_M + 0.5) + acrossZ * side * 0.38,
                dirX * DESCENT_APOTHEM_M * 0.94 + acrossX * side * 0.3,
                DESCENT_DECK_Y - 0.55,
                dirZ * DESCENT_APOTHEM_M * 0.94 + acrossZ * side * 0.3,
                0.018
            )
        );
    }

    // The plaque, on the leg below the ladder: "Here men from the planet Earth first set
    // foot upon the Moon. July 1969 A.D. We came in peace for all mankind." It is bolted
    // to the strut rather than to the stage, and it is still legible.
    const plaque = new BoxGeometry(0.46, 0.24, 0.015);
    plaque.rotateY(ACROSS);
    parts.add(
        'structure',
        plaque,
        dirX * (DESCENT_APOTHEM_M + 0.52) + acrossX * 0.3,
        1.42,
        dirZ * (DESCENT_APOTHEM_M + 0.52) + acrossZ * 0.3
    );
}

/**
 * Settle the stage onto its four pads.
 *
 * The same argument `drive.ts` makes for the rover, and for the same reason: a body
 * standing on four points is not placed by a height, it is placed by a plane. The mean
 * of the four sets how high it rides and the least-squares slope through them sets which
 * way it leans — and because the pads sit on the diagonals, the two sums separate and the
 * fit is two divisions rather than a solve.
 */
const MAX_TILT = MathUtils.degToRad(7);

function settleLander(lander: Object3D, ground: LocalGround): void {
    const reach = LEG_SPAN_M / 2;
    let mean = 0;
    let momentX = 0;
    let momentZ = 0;
    let spread = 0;

    for (let i = 0; i < 4; i++) {
        const bearing = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(bearing) * reach;
        const z = Math.sin(bearing) * reach;
        const height = ground(x, z);
        mean += height * 0.25;
        momentX += x * height;
        momentZ += z * height;
        spread += x * x; // and z·z, which is the same by symmetry on the diagonals
    }

    lander.position.y = mean;

    const slopeX = momentX / spread;
    const slopeZ = momentZ / spread;
    // The normal to the fitted plane, and the rotation that carries the vehicle's own up
    // onto it. Clamped rather than applied outright: the arithmetic is happy to lie a
    // lander on its side if it lands across a crater rim, and no Apollo LM was ever more
    // than 11° out.
    const normal = new Vector3(-slopeX, 1, -slopeZ).normalize();
    const tilt = Math.acos(MathUtils.clamp(normal.y, -1, 1));
    if (tilt < 1e-4) return;
    const axis = new Vector3().crossVectors(UP, normal).normalize();
    lander.quaternion.setFromAxisAngle(axis, Math.min(tilt, MAX_TILT));
}

// --- the flag --------------------------------------------------------------

const FLAG_WIDTH_M = 1.52;
const FLAG_HEIGHT_M = 0.91;
const FLAG_POLE_M = 2.4;

/**
 * The flag, drawn onto a canvas rather than loaded — and drawn *faded*.
 *
 * Fifty-odd years of unfiltered ultraviolet, with no ozone to stop any of it and no
 * night long enough to matter, have bleached all six of them. The nylon is intact; the
 * dye is not. What is up there now is very nearly a white flag, and rendering it in
 * fresh red and blue would be the one dishonest thing in this whole scene.
 */
const FLAG_FADE = 0.55;

/** A five-pointed star, points up, centred on the origin of the current transform. */
function star(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    context.beginPath();
    for (let i = 0; i < 10; i++) {
        // Alternating outer and inner vertices is what makes it a star rather than a
        // pentagon; the inner radius of a regular five-pointed star is 0.382 of the outer.
        const r = i % 2 === 0 ? radius : radius * 0.382;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
}

function buildFlagTexture(): CanvasTexture {
    // Large enough that the fly is drawn at about 4 mm a texel, which is what it takes
    // for fifty five-pointed stars to still be stars at arm's length.
    const width = 512;
    const height = 269;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;

    const faded = (r: number, g: number, b: number) => {
        const mix = (channel: number) => Math.round(channel + (255 - channel) * FLAG_FADE);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    };

    // Thirteen stripes, seven of them red.
    const stripe = height / 13;
    context.fillStyle = faded(255, 255, 255);
    context.fillRect(0, 0, width, height);
    context.fillStyle = faded(178, 34, 52);
    for (let i = 0; i < 13; i += 2) {
        context.fillRect(0, i * stripe, width, stripe + 0.5);
    }

    // The union: two fifths of the fly, seven stripes deep.
    const unionWidth = width * 0.4;
    const unionHeight = stripe * 7;
    context.fillStyle = faded(60, 59, 110);
    context.fillRect(0, 0, unionWidth, unionHeight);

    // Fifty stars, in the nine alternating rows they actually go in.
    context.fillStyle = faded(255, 255, 255);
    for (let row = 0; row < 9; row++) {
        const count = row % 2 === 0 ? 6 : 5;
        for (let column = 0; column < count; column++) {
            const x = ((column + (row % 2 === 0 ? 0.5 : 1)) / 6) * unionWidth;
            const y = ((row + 0.5) / 9) * unionHeight;
            star(context, x, y, unionHeight / 22);
        }
    }

    // The bleaching is not uniform. The fly has hung in the same attitude for half a
    // century, so the side that faces the Sun has gone further than the hem in the
    // shadow of its own hoist — a soft wash rather than an even wash.
    const bleach = context.createLinearGradient(0, 0, width, height * 0.4);
    bleach.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    bleach.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
    context.fillStyle = bleach;
    context.fillRect(0, 0, width, height);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

let flagTexture: CanvasTexture | null = null;

/**
 * The assembly: a telescoping pole with a horizontal crossbar along the top, because
 * there is no air to hold a flag out. On Apollo 11 the crossbar would not extend the
 * last few inches, which left a permanent ripple in the nylon — and is the entire
 * reason the flag in the photographs looks like it is flying.
 *
 * The pole is drawn in its two telescoped sections with the joint showing, and driven
 * into a small mound, because it was: the crews found the regolith solid a few
 * centimetres down and could not get the poles in more than about 15 cm, which is the
 * other half of why the first one went over so easily.
 */
function buildFlag(): Object3D {
    flagTexture ??= buildFlagTexture();

    const assembly = new Group();
    const parts = new PartSet();

    // Lower section, thicker, and the upper one telescoped out of it with the collar
    // between. One tube reads as a broom handle; two read as the stowable hardware it is.
    parts.add('structure', new CylinderGeometry(0.021, 0.021, 1.3, 7), 0, 0.6, 0);
    parts.add('structure', new CylinderGeometry(0.028, 0.028, 0.06, 8), 0, 1.24, 0);
    parts.add('structure', new CylinderGeometry(0.015, 0.015, FLAG_POLE_M - 1.22, 7), 0, 1.27 + (FLAG_POLE_M - 1.22) / 2, 0);
    // The elbow at the top and the crossbar out along the fly.
    parts.add('structure', new CylinderGeometry(0.022, 0.022, 0.07, 8), 0, FLAG_POLE_M, 0);
    const crossbar = new CylinderGeometry(0.011, 0.011, FLAG_WIDTH_M, 5);
    crossbar.rotateZ(Math.PI / 2);
    parts.add('structure', crossbar, FLAG_WIDTH_M / 2, FLAG_POLE_M, 0);
    // Disturbed regolith where it was driven in, and it is a mound rather than a hole:
    // a pole pushed into packed dust brings the dust up around itself.
    parts.add('dusted', new ConeGeometry(0.17, 0.07, 12), 0, 0.03, 0);
    parts.build(assembly);

    const cloth = new Mesh(
        // Segmented in both directions now: the crimp runs across the fly and the hem
        // falls away down it, and a single row of quads cannot hold the second one.
        new PlaneGeometry(FLAG_WIDTH_M, FLAG_HEIGHT_M, 24, 8),
        new MeshStandardMaterial({
            map: flagTexture,
            side: DoubleSide,
            roughness: 0.94,
            metalness: 0,
        })
    );
    const position = cloth.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        // 0 at the hoist, 1 at the free end; 0 at the top hem, 1 at the bottom.
        const across = position.getX(i) / FLAG_WIDTH_M + 0.5;
        const down = 0.5 - position.getY(i) / FLAG_HEIGHT_M;
        // The crimp left by a crossbar that never fully extended. It is a property of the
        // top edge, so it grows down the fly rather than being uniform.
        const crimp = Math.sin(across * Math.PI * 2.4) * 0.05 * across * (0.35 + down * 0.65);
        // And the free corner hangs. In a sixth of a gravity nylon still falls, just
        // slowly and without ever having been shaken out — so the bottom outer corner
        // curls back and down, which is the shape in every photograph of them.
        const curl = across * across * down * down * 0.16;
        position.setZ(i, crimp + curl);
        position.setY(i, position.getY(i) - curl * 0.4);
    }
    position.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    cloth.position.set(FLAG_WIDTH_M / 2, FLAG_POLE_M - FLAG_HEIGHT_M / 2 - 0.02, 0);
    cloth.castShadow = true;
    assembly.add(cloth);

    return assembly;
}

// --- science stations ------------------------------------------------------

/**
 * The corner-cube array, built as 64 actual cubes rather than painted on.
 *
 * This is the one place in the cluster where the geometry earns its triangles over a
 * texture, because the panel's whole behaviour is what the recesses do with light: a
 * corner cube sends a ray back exactly where it came from, so from anywhere but straight
 * on the array is a grid of shadowed pits, and from straight on it lights up. A painted
 * grid is the same grey from every angle, which is precisely the property the object does
 * not have.
 *
 * It is also why the thing still works. Observatories on Earth are still bouncing lasers
 * off it half a century later and timing the return — it is how we know the Moon is
 * receding 3.8 cm a year, and it is the only Apollo experiment still returning data,
 * because it needs no power and has no moving parts.
 */
function cornerCubeArray(size: number): BufferGeometry {
    const cells: BufferGeometry[] = [];
    const count = 8;
    const pitch = size / count;
    for (let row = 0; row < count; row++) {
        for (let column = 0; column < count; column++) {
            const cube = new BoxGeometry(pitch * 0.76, 0.026, pitch * 0.76);
            cube.translate(
                (column - (count - 1) / 2) * pitch,
                0,
                (row - (count - 1) / 2) * pitch
            );
            cells.push(cube);
        }
    }
    return mergeGeometries(cells, false)!;
}

/** The retroreflector, tilted up at Earth on its own levelling base. */
function buildRetroreflector(
    parts: PartSet,
    ground: LocalGround,
    solid: Solidify,
    atX: number,
    atZ: number
): void {
    const y = ground(atX, atZ);
    const TILT = -0.9;

    // The base it stands on, and the frame around the array.
    parts.add('structure', new BoxGeometry(0.54, 0.04, 0.54), atX, y + 0.08, atZ);
    parts.add('structure', new CylinderGeometry(0.03, 0.03, 0.14, 6), atX, y + 0.15, atZ);

    const frame = new BoxGeometry(0.5, 0.05, 0.5);
    frame.rotateX(TILT);
    parts.add('dark', frame, atX, y + 0.26, atZ);

    const cubes = cornerCubeArray(0.42);
    cubes.rotateX(TILT);
    // Proud of the frame by half its own thickness, along the frame's own normal.
    parts.add('structure', cubes, atX, y + 0.26 + Math.cos(TILT) * 0.035, atZ - Math.sin(TILT) * 0.035);

    // The carry handle, which is how it got here — it was lifted off the MESA by hand.
    const handle = new TorusGeometry(0.09, 0.011, 5, 12, Math.PI);
    handle.rotateX(TILT);
    parts.add('structure', handle, atX, y + 0.32, atZ + 0.2);

    solid(atX, atZ, 0.4, y + 0.36);
}

/**
 * EASEP, which only Apollo 11 left: a seismometer and a laser retroreflector, both on
 * solar cells, both set down within a few dozen metres of the LM because there was no
 * time to walk further.
 *
 * The seismometer ran for three weeks. It is drawn with the reflective shroud that
 * covered it, the two solar wings that were all the power it ever had, and the gnomon
 * the crew levelled it against — there is no plumb line on the Moon that is any easier
 * to read than one here, but there is also no other way to do it.
 */
function buildEasep(
    parts: PartSet,
    ground: LocalGround,
    solid: Solidify,
    atX: number,
    atZ: number
): void {
    const y = ground(atX, atZ);

    // The levelling skirt, then the body under its shroud.
    parts.add('structure', new BoxGeometry(0.78, 0.02, 0.72), atX, y + 0.05, atZ);
    parts.add('kapton', new BoxGeometry(0.56, 0.3, 0.5), atX, y + 0.22, atZ);
    parts.add('dark', new BoxGeometry(0.6, 0.03, 0.54), atX, y + 0.38, atZ);
    // The dome the sensors sit under, and the shorting-plug handle on top of it.
    parts.add('structure', new CylinderGeometry(0.12, 0.14, 0.1, 12), atX, y + 0.44, atZ);
    parts.add('structure', new CylinderGeometry(0.012, 0.012, 0.22, 5), atX + 0.2, y + 0.5, atZ);
    parts.add('structure', new BoxGeometry(0.07, 0.012, 0.012), atX + 0.2, y + 0.61, atZ);

    // Two solar wings, hinged out and slightly up. They face opposite ways for the same
    // reason a sundial has one gnomon: whichever way the Sun crosses, one of them is lit.
    for (const side of [-1, 1]) {
        const panel = new BoxGeometry(0.66, 0.016, 0.44);
        panel.rotateZ(side * 0.2);
        parts.add('dark', panel, atX + side * 0.64, y + 0.36, atZ);
        parts.add(
            'structure',
            strut(atX + side * 0.28, y + 0.34, atZ, atX + side * 0.62, y + 0.3, atZ, 0.012)
        );
    }

    solid(atX, atZ, 0.55, y + 0.5);
    buildRetroreflector(parts, ground, solid, atX + 2.4, atZ + 0.5);
}

/**
 * ALSEP, on all five later missions, and a different order of thing from EASEP.
 *
 * The reason is the **RTG**: 2.6 kg of plutonium-238 in a finned beryllium cask, putting
 * out 70 W and — the part that mattered — not caring in the least about the fourteen-day
 * night that killed everything running on solar cells. The stations ran continuously
 * until NASA switched them off in September 1977, by which point Apollo 12's had been
 * reporting for nearly eight years.
 *
 * The cask ran at a few hundred degrees the whole time, which is why it is drawn with
 * its fins bare: it was the one object at these sites that had to *lose* heat.
 */
function buildAlsep(
    parts: PartSet,
    ground: LocalGround,
    solid: Solidify,
    atX: number,
    atZ: number
): void {
    const y = ground(atX, atZ);

    // Central station: a flat box with the sunshade lid raised off it on its corner
    // posts, which is what the thermal design came down to — hold a reflector over it
    // and let the sides see nothing but black sky.
    parts.add('kapton', new BoxGeometry(0.94, 0.38, 0.58), atX, y + 0.3, atZ);
    for (const dx of [-0.44, 0.44]) {
        for (const dz of [-0.28, 0.28]) {
            parts.add('structure', new CylinderGeometry(0.012, 0.012, 0.16, 5), atX + dx, y + 0.54, atZ + dz);
        }
    }
    parts.add('structure', new BoxGeometry(1.08, 0.025, 0.74), atX, y + 0.62, atZ);

    // The steerable helical antenna that pointed at Earth, on its short mast, and the
    // levelling gnomon beside it.
    parts.add('structure', new CylinderGeometry(0.016, 0.016, 0.8, 5), atX, y + 1.0, atZ);
    parts.add('structure', new CylinderGeometry(0.09, 0.09, 0.24, 9, 1, true), atX, y + 1.46, atZ);
    parts.add('structure', new CylinderGeometry(0.02, 0.02, 0.06, 8), atX, y + 1.6, atZ);

    solid(atX, atZ, 0.6, y + 0.66);

    // The generator, set well away from the station so its heat and its neutrons were
    // somebody else's problem. Finned, because it had nothing but radiation to cool it.
    const caskX = atX - 1.8;
    const caskZ = atZ + 0.5;
    const caskY = ground(caskX, caskZ);
    parts.add('structure', new BoxGeometry(0.54, 0.02, 0.54), caskX, caskY + 0.05, caskZ);
    parts.add('structure', new CylinderGeometry(0.026, 0.026, 0.22, 6), caskX, caskY + 0.16, caskZ);
    parts.add('structure', new CylinderGeometry(0.2, 0.2, 0.48, 12), caskX, caskY + 0.5, caskZ);
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const fin = new BoxGeometry(0.24, 0.44, 0.012);
        fin.rotateY(-angle);
        parts.add(
            'structure',
            fin,
            caskX + Math.cos(angle) * 0.3,
            caskY + 0.5,
            caskZ + Math.sin(angle) * 0.3
        );
    }
    solid(caskX, caskZ, 0.42, caskY + 0.74);

    // The passive seismometer, on its own skirt and under its own thermal shroud.
    const seismoX = atX + 2.2;
    const seismoZ = atZ - 1.2;
    const seismoY = ground(seismoX, seismoZ);
    parts.add('structure', new BoxGeometry(0.94, 0.02, 0.94), seismoX, seismoY + 0.05, seismoZ);
    parts.add('kapton', new CylinderGeometry(0.26, 0.28, 0.34, 14), seismoX, seismoY + 0.24, seismoZ);
    parts.add('dark', new CylinderGeometry(0.42, 0.42, 0.02, 16), seismoX, seismoY + 0.43, seismoZ);
    solid(seismoX, seismoZ, 0.42, seismoY + 0.44);

    buildRetroreflector(parts, ground, solid, atX + 2.5, atZ + 1.4);

    // Geophones on a line, and the ribbon cable that fed them. The cables were flat and
    // stiff enough to hold the curl they were coiled in, which is exactly how they lie
    // in the photographs — nothing about lunar regolith flattens a cable out. Left
    // without colliders on purpose: they are ankle-high and you step over them.
    for (let i = 0; i < 3; i++) {
        const gx = atX + 1.0 + i * 1.35;
        const gz = atZ + 2.4 + i * 0.5;
        const gy = ground(gx, gz);
        parts.add('structure', new CylinderGeometry(0.05, 0.05, 0.18, 8), gx, gy + 0.09, gz);
        parts.add('structure', new CylinderGeometry(0.012, 0.012, 0.16, 5), gx, gy + 0.24, gz);
        parts.add('dark', new BoxGeometry(1.3, 0.008, 0.035), gx - 0.65, ground(gx - 0.65, gz - 0.25) + 0.02, gz - 0.25);
    }
}

/**
 * The Modular Equipment Transporter, which only Apollo 14 had: a two-wheeled cart the
 * crew pulled by a handle, carrying tools, film and core tubes.
 *
 * It is the pivot of the whole programme. Shepard and Mitchell dragged it up the flank of
 * Cone Ridge, could not tell where the rim was, and turned back about 30 m short of it —
 * on television, out of breath, hauling a handcart. Every mission after theirs had a car.
 *
 * Returned as its own object rather than merged in, because it is placed and turned as a
 * unit — which is also what lets it stand on its own patch of ground.
 */
function buildMet(): Object3D {
    const cart = new PartSet();
    const trackHalf = 0.43;

    // The A-frame chassis and the tray it carried.
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, 0, 0.022));
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, -trackHalf * 0.8, 0.018));
    cart.add('structure', strut(-0.5, 0.72, 0, 0.55, 0.5, trackHalf * 0.8, 0.018));
    cart.add('structure', new BoxGeometry(0.62, 0.03, 0.72), 0.34, 0.52, 0);
    cart.add('kapton', new BoxGeometry(0.44, 0.24, 0.5), 0.34, 0.65, 0);
    // The tool pallet across the back, and the core tubes standing in it.
    cart.add('structure', new BoxGeometry(0.06, 0.2, 0.66), 0.62, 0.62, 0);
    for (const dz of [-0.16, 0, 0.16]) {
        cart.add('structure', new CylinderGeometry(0.017, 0.017, 0.4, 6), 0.56, 0.78, dz);
    }
    // The handle, which is what makes it read as a cart rather than a trailer.
    const grip = new CylinderGeometry(0.02, 0.02, 0.34, 6);
    grip.rotateX(Math.PI / 2);
    cart.add('structure', grip, -0.54, 0.75, 0);

    // Two wire-mesh wheels on a common axle, and the tyres really were that fat — they
    // were inflated, the only pneumatic tyres ever used off Earth.
    for (const side of [-1, 1]) {
        const wheel = new TorusGeometry(0.2, 0.075, 8, 18);
        wheel.rotateY(Math.PI / 2);
        cart.add('dark', wheel, 0.42, 0.2, side * trackHalf);
        const hub = new CylinderGeometry(0.055, 0.055, 0.07, 9);
        hub.rotateZ(Math.PI / 2);
        cart.add('structure', hub, 0.42, 0.2, side * trackHalf);
        // Spokes, so a wheel viewed side-on is not a solid ring.
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI;
            const spoke = new CylinderGeometry(0.008, 0.008, 0.38, 4);
            spoke.rotateX(Math.PI / 2);
            spoke.rotateY(Math.PI / 2);
            spoke.rotateX(angle);
            cart.add('structure', spoke, 0.42, 0.2, side * trackHalf);
        }
    }
    const axle = new CylinderGeometry(0.014, 0.014, trackHalf * 2, 6);
    axle.rotateZ(Math.PI / 2);
    cart.add('structure', axle, 0.42, 0.2, 0);

    const assembly = new Group();
    cart.build(assembly);
    return assembly;
}

/**
 * *Fallen Astronaut*, at Hadley: an 8.5 cm aluminium figure laid face down in the dust
 * beside a plaque naming the fourteen astronauts and cosmonauts dead by August 1971 —
 * Americans and Soviets on one list, in the middle of the space race.
 *
 * Scott set it down without clearing it with anyone and mentioned it at the post-flight
 * press conference. It is the only sculpture on another world, and at this scale it is
 * three centimetres of geometry that most people will walk straight past, which is about
 * right.
 */
function buildMemorial(parts: PartSet, ground: LocalGround, atX: number, atZ: number): void {
    const y = ground(atX, atZ);
    parts.add('structure', new BoxGeometry(0.085, 0.014, 0.03), atX, y + 0.014, atZ);
    // Arms and legs, which is all it takes for a figure to read as one at 8.5 cm.
    parts.add('structure', new BoxGeometry(0.045, 0.01, 0.012), atX + 0.005, y + 0.012, atZ + 0.022);
    parts.add('structure', new BoxGeometry(0.045, 0.01, 0.012), atX + 0.005, y + 0.012, atZ - 0.022);
    const plaqueY = ground(atX + 0.13, atZ + 0.01);
    parts.add('structure', new BoxGeometry(0.13, 0.005, 0.09), atX + 0.13, plaqueY + 0.007, atZ + 0.01);
}

/**
 * Apollo 16's far-ultraviolet camera and spectrograph: a 22 kg gold-plated Schmidt
 * telescope on a tripod, stood in the LM's shadow because it could not be allowed to
 * warm up.
 *
 * The only astronomical telescope ever *operated* from the surface of another world. It
 * photographed the Earth's geocorona in Lyman-alpha, which cannot be done from inside the
 * geocorona, and it is still standing there pointed at where the sky was in April 1972.
 */
function buildTelescope(
    parts: PartSet,
    ground: LocalGround,
    solid: Solidify,
    atX: number,
    atZ: number
): void {
    const y = ground(atX, atZ);
    const TIP = 0.55;

    const barrel = new CylinderGeometry(0.16, 0.16, 0.66, 14);
    barrel.rotateZ(TIP);
    parts.add('kapton', barrel, atX, y + 0.64, atZ);
    // The open aperture at the top of the tube, and the film cassette at the bottom.
    parts.add('dark', new CylinderGeometry(0.165, 0.165, 0.05, 14), atX + 0.18, y + 0.79, atZ);
    parts.add('structure', new BoxGeometry(0.16, 0.14, 0.16), atX - 0.15, y + 0.5, atZ);

    // The tripod, with the battery pack hung under the apex.
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + 0.4;
        parts.add(
            'structure',
            strut(
                atX,
                y + 0.44,
                atZ,
                atX + Math.cos(angle) * 0.36,
                ground(atX + Math.cos(angle) * 0.36, atZ + Math.sin(angle) * 0.36),
                atZ + Math.sin(angle) * 0.36,
                0.014
            )
        );
        parts.add(
            'structure',
            new CylinderGeometry(0.035, 0.035, 0.02, 8),
            atX + Math.cos(angle) * 0.36,
            ground(atX + Math.cos(angle) * 0.36, atZ + Math.sin(angle) * 0.36) + 0.01,
            atZ + Math.sin(angle) * 0.36
        );
    }
    parts.add('dark', new BoxGeometry(0.2, 0.1, 0.14), atX, y + 0.34, atZ);

    solid(atX, atZ, 0.32, y + 0.9);
}

// --- assembly --------------------------------------------------------------

export interface Artefacts {
    readonly object: Object3D;
    /** Where the lander stands, for aiming the first look at it. */
    readonly landerPosition: Vector3;
    /**
     * World position of the descent stage's top deck — where the ascent stage was
     * bolted, and so where it has to be put back before it can leave again.
     */
    readonly ascentOrigin: Vector3;
    /** Everything here you cannot walk through, in the surface's own metre frame. */
    readonly obstacles: readonly Collider[];
    /**
     * The ascent engine firing. Knocks over any flag close enough to the blast, which is
     * how Apollo 11's went and why none of the others did.
     */
    blast(): void;
    /** Stand the flag back up, for a re-run. */
    restore(): void;
    update(realDeltaSeconds: number): void;
    dispose(): void;
}

/** Where the cluster sits relative to the landing point, metres. */
const LANDER_X = 11;
const LANDER_Z = -23;

/**
 * How far out the flag was planted, and the one number that decides whether it survives.
 *
 * Apollo 11's went in close to the LM — the first crew had two and a half hours outside
 * and no reason to walk the flag anywhere — and it was inside the ascent engine's blast.
 * Every later crew planted theirs well clear, having watched what happened to the first
 * one. Nothing here says "Apollo 11's flag falls"; it says how far each flag is from the
 * engine, and `FLAG_BLAST_RADIUS_M` does the rest.
 */
const FLAG_CLOSE_M = 7;
const FLAG_CLEAR_M = 21;
/** How far the exhaust could still push over a pole standing in loose regolith. */
const FLAG_BLAST_RADIUS_M = 11;
/** Seconds for a pole in one sixth of Earth's gravity to go over. */
const FLAG_FALL_SECONDS = 1.6;

export function createArtefacts(
    site: LandingSite,
    heightAt: (x: number, z: number) => number
): Artefacts | null {
    if (!site.artefacts) return null;
    const record = site.artefacts;
    creaseFoil();

    const object = new Group();
    const parts = new PartSet();
    const obstacles: Collider[] = [];

    /**
     * The ground under the cluster, in the cluster's own frame. The group is anchored at
     * the lander, so this is zero there and nowhere else — which is the whole reason
     * nothing here floats over a bowl or sinks into a rim.
     */
    const baseY = heightAt(LANDER_X, LANDER_Z);
    const ground: LocalGround = (x, z) => heightAt(LANDER_X + x, LANDER_Z + z) - baseY;

    /** Collect an obstacle, converting out of the cluster's frame into the surface's. */
    const solid: Solidify = (x, z, radius, top) => {
        obstacles.push({ x: LANDER_X + x, z: LANDER_Z + z, radius, top: baseY + top });
    };

    // The descent stage is its own group because it is the one thing here that is placed
    // by a plane rather than by a point — see `settleLander`.
    const lander = new Group();
    const landerParts = new PartSet();
    buildDescentStage(landerParts, solid);
    const landerGeometries = landerParts.build(lander);
    settleLander(lander, ground);
    object.add(lander);

    // What the mission actually left, rather than a generic scatter.
    if (record.science === 'easep') buildEasep(parts, ground, solid, -7.5, 4);
    else buildAlsep(parts, ground, solid, -9, 5.5);
    if (record.memorial) buildMemorial(parts, ground, 2.6, 4.4);
    if (record.telescope) buildTelescope(parts, ground, solid, -2.4, 3.6);

    const merged = parts.build(object);

    const flagDistance = record.flagStanding ? FLAG_CLEAR_M : FLAG_CLOSE_M;
    const flagBearing = 0.55;
    const flagX = Math.cos(flagBearing) * flagDistance;
    const flagZ = Math.sin(flagBearing) * flagDistance;
    const flag = buildFlag();
    flag.position.set(flagX, ground(flagX, flagZ), flagZ);
    object.add(flag);
    // Only while it is up. A flag lying on the ground is something you walk over, and
    // the one at Tranquility Base has been lying there since 1969.
    if (record.flagStanding) solid(flagX, flagZ, 0.16, ground(flagX, flagZ) + FLAG_POLE_M);

    if (record.transport === 'met') {
        const cart = buildMet();
        cart.position.set(-3.4, ground(-3.4, 5.2), 5.2);
        cart.rotation.y = 2.1;
        object.add(cart);
        solid(-3.4, 5.2, 0.7, ground(-3.4, 5.2) + 0.8);
    }

    object.position.set(LANDER_X, baseY, LANDER_Z);

    /**
     * How far over the flag is, 0 standing and 1 flat. Held rather than baked into the
     * transform so a re-run can put it back up — and so the fall can be *watched*, which
     * is the entire reason Apollo 11's flag is interesting.
     */
    let fall = record.flagStanding ? 0 : 1;
    let falling = false;
    const flagBaseY = ground(flagX, flagZ);

    /**
     * Over on its side about the base, still attached to its pole, exactly the way Aldrin
     * described it going.
     *
     * **It has to tip about X and not about Z**, and that is not a matter of which way it
     * happens to land. The crossbar runs out along the assembly's own +X, so tipping about
     * Z — the axis the crossbar lies on — swings the flag itself straight down and buries
     * two thirds of it in the regolith. Tipping about X carries the pole over into Z and
     * leaves the crossbar where it was: horizontal, with the nylon lying flat on the
     * ground beside it, which is where it has been since July 1969.
     *
     * The yaw is applied through `rotation.y` in three.js's default XYZ order, so it is
     * composed *inside* the tip — the flag is spun while it is still upright and then laid
     * over, rather than being laid over and then swung through the ground.
     */
    function applyFall(): void {
        flag.rotation.x = (Math.PI / 2 - 0.06) * fall;
        flag.rotation.y = 0.7 * fall;
        flag.position.y = flagBaseY + 0.04 * fall;
    }
    applyFall();

    return {
        object,
        obstacles,
        landerPosition: new Vector3(LANDER_X, 0, LANDER_Z),
        ascentOrigin: new Vector3(
            LANDER_X,
            baseY + lander.position.y + DESCENT_DECK_Y,
            LANDER_Z
        ),

        blast() {
            // Inside the radius or not. Apollo 11's flag is 7 m out and goes; the others
            // are 21 m out and stand there watching, which is what they did.
            if (Math.hypot(flagX, flagZ) <= FLAG_BLAST_RADIUS_M) falling = true;
        },

        restore() {
            falling = false;
            fall = 0;
            applyFall();
        },

        update(realDeltaSeconds) {
            if (!falling || fall >= 1) return;
            fall = Math.min(1, fall + realDeltaSeconds / FLAG_FALL_SECONDS);
            applyFall();
        },

        dispose() {
            for (const geometry of merged) geometry.dispose();
            for (const geometry of landerGeometries) geometry.dispose();
            // The merged buffers above are covered twice over by the traverse below,
            // which also catches the flag's own pole and cloth and the cart's. Materials
            // are only disposed when they are not one of the four shared, long-lived
            // ones — the cloth's own material (wrapping the cached, cross-site
            // `flagTexture`) is the one thing per landing that actually needs it.
            object.traverse((child) => {
                if (!(child instanceof Mesh)) return;
                child.geometry.dispose();
                const material = child.material as MeshStandardMaterial;
                if (
                    material !== kaptonMaterial &&
                    material !== structureMaterial &&
                    material !== darkMaterial &&
                    material !== dustedMaterial
                ) {
                    material.dispose();
                }
            });
        },
    };
}
