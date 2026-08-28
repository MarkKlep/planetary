import { SEMI_MAJOR_AXIS_AU } from '../orbits';

/**
 * How far out each body orbits, drawn as a strip plot down the object list.
 *
 * This is the one thing in the nav panel that carries a measurement, and it is here
 * because the object list was the only surface in the app that said nothing about scale.
 * Everywhere else the project refuses to fudge it — the orbits are at true scale, the
 * exposure is derived from d², and CLAUDE.md says outright not to "fix" an invisible body
 * by scaling its mesh up. Then the panel drew Mercury and Neptune as identical rows,
 * evenly spaced, for a system where one orbit is 78 times the other.
 *
 * ## Why the ticks and not the gaps
 *
 * The obvious way to put true distance into a list is to space the rows by it. That was
 * rejected: rows are touch targets and have to stay a uniform, thumb-sized height, and
 * spacing them logarithmically would make the list *longer* — which is the opposite of
 * what it needed. So the rows stay evenly spaced and the tick moves horizontally instead.
 * Reading down the column, the ticks march right, and the distance between consecutive
 * ticks is the real thing.
 *
 * What falls out of that is the whole reason it earns its width. Normalised over the
 * track, the seven gaps run 0.131, 0.068, 0.088, **0.258**, 0.127, 0.147, 0.094 — the
 * jump from Mars to Jupiter is 1.76 times the next largest, so the asteroid belt becomes
 * the most conspicuous feature of the list without anything being drawn for it.
 *
 * ## Cyan, and why that is not a free choice
 *
 * `variables.scss` sets a strict rule that the rest of the chrome keeps: `--signal`
 * (amber) means *a control or a state*, `--telemetry` (cyan) means *a measurement*, so a
 * glance separates the two without reading a label. A distance is a measurement. The Sun
 * is the one exception on this axis and it proves the rule — it is not a data point, it
 * is the origin every one of these is measured from, so it is drawn in the colour that
 * stands for the light it casts, and it gets no track.
 *
 * ## The numbers are not typed out here
 *
 * `SEMI_MAJOR_AXIS_AU` is derived in `orbits.ts` from the same element sets
 * `keplerianPosition` flies the planets by. One value per planet, two readers, so the
 * scale on screen cannot drift from where the planet actually is.
 */

/**
 * The plotted range, in AU. Not the data's own extent: anchoring the left end at Mercury
 * would put it hard against the origin mark, which would read as Mercury being at the
 * Sun. A log axis has no zero to anchor to, so the ends are a stated plot range with
 * Mercury and Neptune inset a little from both.
 */
const TRACK_MIN_AU = 0.3;
const TRACK_MAX_AU = 35;

const LOG_MIN = Math.log10(TRACK_MIN_AU);
const LOG_SPAN = Math.log10(TRACK_MAX_AU) - LOG_MIN;

/** Where a body sits along the track, 0 at the left end and 1 at the right. */
export function rangeFraction(au: number): number {
    return (Math.log10(au) - LOG_MIN) / LOG_SPAN;
}

/**
 * The row's accessible name, which is where the actual figure lives.
 *
 * The tick is a 2px mark and cannot be read, so it is `aria-hidden` and the number is
 * spoken instead — "astronomical units" rather than "AU", which a screen reader would
 * otherwise spell out. Bodies with no distance (the Sun, the system view) fall back to
 * the plain label rather than being given a meaningless one.
 */
export function rangeLabel(id: string, label: string): string {
    const au = SEMI_MAJOR_AXIS_AU[id];
    if (au === undefined) return label;
    return `${label}, ${au.toFixed(2)} astronomical units from the Sun`;
}

interface RangeTickProps {
    /** The body's nav id. Anything without an entry renders an empty column. */
    id: string;
}

/**
 * One row's mark on the axis.
 *
 * A body with no distance gets nothing at all rather than an empty column. Drawing the
 * track without a mark on it would say "this is somewhere on the axis and we are not
 * telling you", which is false for the only row it applies to: the system view is a
 * place to look *from*, not a body at a distance from the Sun. Nothing is lost by
 * omitting it, either — the rail is pushed right by `margin-left: auto` rather than
 * sitting in a fixed column, so the labels beside it were never lined up against it.
 */
export function RangeTick({ id }: RangeTickProps) {
    const au = SEMI_MAJOR_AXIS_AU[id];

    if (id === 'sun') {
        return (
            <span className="nav-range nav-range--origin" aria-hidden="true">
                <span className="nav-range__mark" />
            </span>
        );
    }

    if (au === undefined) return null;

    return (
        <span className="nav-range" aria-hidden="true">
            <span
                className="nav-range__mark"
                style={{ left: `${(rangeFraction(au) * 100).toFixed(2)}%` }}
            />
        </span>
    );
}
