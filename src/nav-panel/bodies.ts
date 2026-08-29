/**
 * What each body in the object list has hanging off it, and the one place it is
 * written down.
 *
 * Its own module because two components read it and neither can own it: `nav-panel.tsx`
 * needs to know *whether* a row has anything to show, and `system-sheet.tsx` needs to
 * know *what*. Importing one from the other would be a cycle, since the panel also
 * renders the sheet.
 */

/**
 * A button sitting beside a row that switches something rather than flying to it.
 * `script.ts` owns the label and the state outright — same reasoning as free flight's
 * button: several paths (this button, a keyboard shortcut, a click in the scene) all
 * have to be able to drive it, and none of them should have to fight React state to
 * do it. Everything here does is put it on the page with the right initial label, so
 * there is no flash of the wrong one before `initScene`'s deferred effect runs.
 */
export interface Toggle {
  toggleId: string;
  initialLabel: string;
  /** Renders dimmed, matching the "currently off" state script.ts starts it in. */
  startsOff?: boolean;
}

export interface Satellite {
  id: string;
  label: string;
  toggle?: Toggle;
  /**
   * Rows that live in this satellite's *own* sheet, collapsed behind its own
   * expand chevron — the same pattern a `Planet` gets, one level deeper.
   *
   * Not rendered as an always-visible row beside the satellite's own button: a bare
   * "Show" sitting next to a row labelled "ISS" reads as showing the ISS, the same trap
   * Saturn's "Titan haze" row was pulled out to avoid, and an always-open sub-row would
   * also permanently cost Earth's own sheet a row of height for something most
   * visits to Earth have no reason to touch. Tucking it behind its own chevron keeps it
   * reachable without either problem.
   */
  nested?: Array<Toggle & { label: string }>;
}

/**
 * A top-level row in the object list: the eight planets, and Pluto.
 *
 * Named for what the list holds rather than `Planet`, because since 2006 one of these is
 * not one — and a constant called `PLANETS` with Pluto in it would be the sort of quiet
 * inaccuracy the rest of this project goes out of its way to avoid.
 */
export interface Body {
  id: string;
  label: string;
  satellites: Satellite[];
  /**
   * Draws a hairline above this row. Set on the first planet, so the eight are divided
   * from the Sun, and on Pluto, which is a dwarf planet and belongs to neither group.
   */
  startsGroup?: boolean;
  /**
   * A row that toggles something rather than flying to it. Venus has no moons, so its
   * sheet would otherwise be empty — what belongs in there is the cloud deck, which is
   * the only thing on any of these planets you can take off. `toggleId` is looked up by
   * script.ts, which owns the button's label and state outright, the same way it owns
   * the analemma's and the orbits'.
   *
   * The same `Toggle` the satellite rows carry, plus the label that says what it acts
   * on — because a bare "Hide" next to a row named Saturn reads as hiding Saturn.
   */
  toggle?: Toggle & { label: string };
}

export const BODIES: Body[] = [
  // The one entry with nothing to expand: Mercury has no moons, no cloud deck and no
  // atmosphere, so it gets a plain full-width button and no chevron.
  {
    id: 'mercury',
    label: 'Mercury',
    satellites: [],
  },
  {
    id: 'venus',
    label: 'Venus',
    satellites: [],
    toggle: { label: 'Clouds', toggleId: 'toggle-venus-clouds', initialLabel: 'Hide' },
  },
  {
    id: 'earth',
    label: 'Earth',
    satellites: [
      // The only row here that switches the app into a different mode rather than
      // pointing the camera somewhere. Its label reads Land / Leave, not Show / Hide,
      // because there is nowhere in the solar-system scene that "the lunar surface"
      // could be — at true scale an astronaut's eye is 2.7e-7 of a scene unit off the
      // ground, so it gets its own scene, in metres.
      { id: 'moon', label: 'Moon', toggle: { toggleId: 'toggle-moon-surface', initialLabel: 'Land', startsOff: true } },
      // The one satellite with a sheet of its own: the orbit the station is flying
      // and the ground track under that. Both are diagram rather than scenery, so they
      // start off, and they live behind ISS's own chevron rather than as a row that
      // is always open — see `Satellite.nested`.
      {
        id: 'iss',
        label: 'ISS',
        nested: [
          { label: 'Trajectory', toggleId: 'toggle-iss-trajectory', initialLabel: 'Show', startsOff: true },
        ],
      },
      { id: 'analemma', label: 'Analemma', toggle: { toggleId: 'toggle-analemma', initialLabel: 'Show', startsOff: true } },
    ],
  },
  {
    id: 'mars',
    label: 'Mars',
    satellites: [
      { id: 'phobos', label: 'Phobos' },
      { id: 'deimos', label: 'Deimos' },
    ],
  },
  // The only entry whose satellites are worth flying to in their own right: all four
  // are larger than Pluto and Ganymede is larger than Mercury, which is four rows up.
  // Listed inward-out, the order Galileo numbered them in and the order they are
  // locked in — Io twice round for Europa's one, Europa twice for Ganymede's.
  {
    id: 'jupiter',
    label: 'Jupiter',
    satellites: [
      { id: 'io', label: 'Io' },
      { id: 'europa', label: 'Europa' },
      { id: 'ganymede', label: 'Ganymede' },
      { id: 'callisto', label: 'Callisto' },
    ],
  },
  // The longest sheet here, and the only planet whose list carries both kinds of row
  // at once: seven moons to fly to, and — under Titan — the one toggle in the outer
  // system, which is Venus's cloud row again for the only other body whose surface is
  // hidden by its own atmosphere. Listed inward-out like Jupiter's, which is also
  // discovery order for five of the seven: Huygens found Titan in 1655, Cassini the four
  // between 1671 and 1684, and Herschel the two innermost in a single fortnight of 1789.
  {
    id: 'saturn',
    label: 'Saturn',
    satellites: [
      { id: 'mimas', label: 'Mimas' },
      { id: 'enceladus', label: 'Enceladus' },
      { id: 'tethys', label: 'Tethys' },
      { id: 'dione', label: 'Dione' },
      { id: 'rhea', label: 'Rhea' },
      { id: 'titan', label: 'Titan' },
      { id: 'iapetus', label: 'Iapetus' },
    ],
    // Venus's cloud row again, and it has to be the *planet*-level toggle rather than
    // one hanging off Titan's row: a bare "Hide" sitting beside a button labelled Titan
    // reads as hiding Titan. This one gets to say what it takes off.
    toggle: { label: 'Titan haze', toggleId: 'toggle-titan-haze', initialLabel: 'Hide' },
  },
  // Back to a plain full-width button with no chevron, which Mercury is the only other
  // entry to get — and for the opposite reason. Mercury has nothing to expand because
  // there is nothing there; Uranus has five moons worth flying to and a set of rings,
  // and they are simply not modelled yet. An empty sheet would say the wrong one of
  // those two things, so it does not get one until there is something to put in it.
  {
    id: 'uranus',
    label: 'Uranus',
    satellites: [],
  },
  // The last planet — plain button, no chevron, for Uranus's reason exactly: Triton and
  // the ring arcs are worth having and are not modelled yet, and an empty sheet would
  // say there is nothing there rather than nothing yet.
  {
    id: 'neptune',
    label: 'Neptune',
    satellites: [],
  },
  /**
   * And Pluto, which is not a planet and gets a rule above it saying so.
   *
   * It has been a dwarf planet since August 2006 on one criterion of three: it orbits the
   * Sun and it is round, and it has not cleared its neighbourhood — it shares that
   * neighbourhood with the whole Kuiper belt, and with a moon half its own diameter.
   *
   * No chevron, for Uranus's and Neptune's reason exactly: Charon is real and worth
   * having and is not modelled yet, and an empty sheet would say there is nothing
   * there rather than nothing yet.
   */
  {
    id: 'pluto',
    label: 'Pluto',
    startsGroup: true,
    satellites: [],
  },
];

/**
 * The wide shot's own group. Not a body, and it is in this list for the one thing it
 * has in common with the five that are: something worth switching that is not worth a
 * row of the list's own height. The orbit lines are a diagram over the scene rather
 * than part of it, so they start off.
 */
export const SYSTEM_GROUP: Body = {
  id: 'system',
  label: 'Solar system',
  satellites: [],
  toggle: { label: 'Orbits', toggleId: 'toggle-orbits', initialLabel: 'Show', startsOff: true },
};

/**
 * Whether a row has a sheet behind it.
 *
 * Read off the data rather than flagged by hand, so a body that gains its first moon
 * gets its opener the same commit — and, more to the point, a body that has none does
 * not get a button that opens an empty dialog. Four rows are in that position on
 * purpose and for two different reasons: Mercury has nothing to show because there is
 * nothing there, while Uranus, Neptune and Pluto have moons and rings that are real,
 * worth having, and simply not modelled yet.
 */
export function hasSheet(body: Body): boolean {
  return body.satellites.length > 0 || body.toggle !== undefined;
}

/** Every group that gets one, in list order, with the wide shot last. */
export const SHEET_GROUPS: Body[] = [...BODIES, SYSTEM_GROUP].filter(hasSheet);
