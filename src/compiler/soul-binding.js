// A weapon that binds the souls of the powerful creatures it fells (2026-10-27, docs/needs.md; the user: unique items' effects all built):
// Whisperer of Souls' "While using the glaive as a weapon, whenever you reduce a sapient creature of 18th level or higher to 0 Hit Points or
// roll a critical success with a Strike against such a target, the creature must attempt a DC 50 Fortitude save", its rows Drained 1, 2 or
// 4 and "If the creature dies from the Strike or while drained in this way, the creature's soul is bound in the glaive". → the weapon's own
// riders (src/compiler/rune-strikes.js runeCritRiders, scripts/rune-strikes.js on a critical hit; scripts/soul-binding.js when its damage
// leaves the creature at 0 Hit Points), each only against a sapient creature of that level or higher (only { minLevel, sapient }): the
// ability module's save card, its Drained rows, and a note Effect of the soul's binding on the creature drained. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const OPENING = /\bWhile using the glaive as a weapon, whenever you reduce a sapient creature of (\d+)(?:st|nd|rd|th) level or higher to 0 Hit Points or roll a critical success with a Strike against such a target, the creature must attempt a @Check\[fortitude\|dc:(\d+)\] save\./i;
const ROWS = /\bCritical Success No additional effect\. Success The glaive siphons the creature's essence, rendering it Drained (\d+)\. If the creature dies from the Strike or while drained in this way, the creature's soul is bound in the glaive\. Failure As success, but the creature is Drained (\d+)\. Critical Failure As success, but the creature is Drained (\d+)\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
const BOUND = "If it dies from the Strike, or while drained this way, its soul is bound in the glaive: while imprisoned there it can't be returned to life by any means, freed only by a deed of great benevolence or selflessness.";

// The weapon's source → its soul-binding riders: [{ plan, optional, only, text, on }] (on: "critical" and "felled", the same plan).
export function soulBindingRiders(weapon) {
    const passive = String(weapon?.system?.description?.value ?? "").split(/<strong>\s*Activat/i)[0];
    const text = passive.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const opening = OPENING.exec(text);
    const rows = opening ? ROWS.exec(plain(passive)) : null;
    if (!opening || !rows) return [];
    const drained = (value) => ({ ...none(), effects: [{ kind: "condition", slug: "drained", value: Number(value), duration: null }], noteEffects: [{ label: "Soul at stake", text: BOUND, duration: null }] });
    const plan = {
        modelVersion: MODEL_VERSION,
        source: { name: weapon.name, slug: weapon.system?.slug ?? null, uuid: weapon.uuid ?? null, type: weapon.type },
        rank: 1,
        traits: [...(weapon.system?.traits?.value ?? [])],
        activation: { time: null, traits: [] },
        automation: { level: "automatic" },
        targeting: { target: "the creature struck", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: Number(opening[2]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: drained(rows[1]), failure: drained(rows[2]), criticalFailure: drained(rows[3]) } }
    };
    const only = { minLevel: Number(opening[1]), sapient: true };
    return ["critical", "felled"].map((on) => ({ plan, optional: false, only, text: opening[0], on }));
}

// Whether a creature is sapient, as PF2e has it: not mindless, and its Intelligence modifier –3 or higher when it has one. creature: { traits,
// int }.
export const isSapient = (creature = {}) => !(creature.traits ?? []).includes("mindless") && !(Number.isFinite(Number(creature.int)) && creature.int !== null && Number(creature.int) < -3);
