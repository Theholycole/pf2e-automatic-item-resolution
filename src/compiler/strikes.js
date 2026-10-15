// An item whose use is a Strike with riders (Fear Gem's "make a melee Strike. If you hit and deal damage, the target is
// Frightened 1, or Frightened 2 on a critical hit"; Duelist's Beacon's "Attempt a melee Strike … On a hit, the target
// must succeed at a DC 22 Fortitude save or be Dazzled"): the bombs' readers (src/compiler/bombs.js) on its text. The
// plan is the core's save family with the Strike as its roll, like a bomb's: live play readies the user's next Strike
// (scripts/strikes.js) and takes the degree PF2e rolls. PF2e's own Strike deals the damage. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { bombSave, hasRow, hitRiders } from "./bombs.js";
import { plainText } from "./rows.js";

const STRIKE = /\b(?:make|makes|attempt|attempts) an? (melee |ranged )?Strike\b/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The text's Strike: { range: "melee" | "ranged" | null, after } — after, the text from that Strike on — or null. Not one
// of several Strikes ("Make up to four Strikes", "make a Strike against each creature in the area"), nor one it makes for
// you with its own modifier (an item's attack, "with an attack modifier of +14").
export function readStrike(text) {
    const match = STRIKE.exec(text);
    if (!match) return null;
    const after = text.slice(match.index);
    const sentence = after.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
    if (/\b(?:against each|each (?:against|at) a different|up to \w+ Strikes|two Strikes|Strikes? with an attack modifier|attack modifier of)\b/i.test(sentence)) return null;
    return { range: match[1]?.trim().toLowerCase() ?? null, after };
}

// The item (or an activation's block as its description) → its Strike plan, or null when no rider or save is read.
export function compileStrike(item, base) {
    const html = String(item?.system?.description?.value ?? "");
    const strike = readStrike(plainText(html));
    if (!strike) return null;
    const riders = hitRiders(strike.after);
    // (A save for the creature the Strike hits: "On a hit, the target must succeed at a DC 22 Fortitude save or be Dazzled".)
    const hitSentence = /(?:On a hit|If (?:you|it|the Strike) hits?|If you hit and deal damage|If you successfully deal damage)[^.]*\b(?:save|saving throw)\b|@Check\[(?:fortitude|reflex|will)/i.test(strike.after);
    const save = hitSentence ? bombSave({ ...item, system: { ...(item.system ?? {}), description: { value: html } } }, { scope: { scope: "target" } }) : null;
    if (!hasRow(riders.success) && !hasRow(riders.criticalSuccess) && !save) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: riders.criticalSuccess, success: riders.success, failure: none(), criticalFailure: none() }
        },
        strike: { range: strike.range, save: save ? save.plan : null }
    };
}

// The plan to keep: the Strike's over nothing, a note alone or the GM's fallback, and over a save that's the Strike's
// own on a hit (Aurochs' Might Tattoo's "If the Strike hits and deals damage, the target attempts a DC 24 Fortitude
// save": not a save at whoever's targeted, Strike or no Strike).
export function strikeOver(plan, strike) {
    if (!strike) return plan;
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") return strike;
    return plan.resolution?.kind === "save" && plan.resolution.check?.roll === "save" && strike.strike?.save ? strike : plan;
}
