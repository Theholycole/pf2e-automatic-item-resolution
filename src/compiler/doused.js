// A snare that douses the creature in something others smell (2026-10-27, docs/needs.md): Appetizing Flavor Snare's "The first creature to enter
// the square must succeed at a DC 15 Reflex save or be doused with the substances. For 1 hour, animals attracted to the flavor (such as most
// predators, at the GM's discretion) can smell the creature from double the usual distance of their scent and are likely to approach to
// investigate the smell. A creature can wash away the appetizing flavor with 1 minute of vigorous scrubbing." The ability compiler reads no
// rows from it: its save, here, the failing rows' note Effect for the hour (who smells it and comes, the GM's), the snare's zone made of it as
// any snare's (src/compiler/snares.js snareZone). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";
import { isSnare } from "./snares.js";

const DOUSED = /\bThe first creature to enter the square must succeed at an? (?:@Check\[(reflex|fortitude)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?|DC (\d+) (Reflex|Fortitude)) save or be doused with the substances\. For (\d+) hours?, animals attracted to the flavor \(such as most predators, at the GM's discretion\) can smell the creature from double the usual distance of their scent and are likely to approach to investigate the smell\. A creature can wash away the appetizing flavor with (\d+) minutes? of vigorous scrubbing\./i;
const row = (noteEffects = []) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects });

// The item and its plan's base → the save the snare's zone plays, or null.
export function dousedRead(item, base) {
    if (!isSnare(item)) return null;
    const doused = DOUSED.exec(plainText(item?.system?.description?.value));
    if (!doused) return null;
    const statistic = String(doused[1] ?? doused[4]).toLowerCase();
    const dc = Number(doused[2] ?? doused[3]);
    const note = { label: "Doused with bait", text: `Doused with smells predators love: for the hour, animals drawn to it (most predators, as the GM decides) smell it from twice their scent's usual distance and are likely to come to investigate. ${doused[6]} minute${doused[6] === "1" ? "" : "s"} of vigorous scrubbing washes it off (remove this then).`, duration: { mode: "fixed", value: Number(doused[5]), unit: "hours", expiry: "turn-start", anchor: "effect-start" } };
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature that enters the snare's square", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: dc } }, outcomes: { criticalSuccess: row(), success: row(), failure: row([note]), criticalFailure: row([note]) } }
    };
}
