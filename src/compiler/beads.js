// A necklace of beads that each detonate as a Fireball, of the dice the text lists: Necklace of Fireballs' "This necklace
// has one 6d6 fire damage and two 4d6 fire damage beads with a @Check[reflex|dc:21|basic] save … it detonates as a
// Fireball where it lands" — a basic Reflex save in a Fireball's 20-foot burst, the damage the bead's. Not a cast: no
// Fireball rank deals 4d6. The plan is the core's save family, its damage one choice per kind of bead
// (plan.damageChoices [{ label, formula }]); the save card picks the bead and posts the ability module's save card at the
// creatures the presser targets. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
// (Each "one 10d6 fire damage" or "one 10d6 fire", Necklace of Fireballs III's.)
const BEADS = /\bhas ((?:(?:one|two|three|four|five|six|\d+) \d+d\d+ \w+(?: damage)?(?:,? (?:and )?)?)+) beads? with an? @Check\[reflex\|dc:(\d+)\|basic[^\]]*\] save/i;

// The html → { choices: [{ label, formula, count }], dc } or null.
export function readBeads(html) {
    // (Its dice as words: "@Damage[10d6[fire]] damage" → "10d6 fire damage".)
    const text = plainText(html);
    // (The spell's name a link: "detonates as a @UUID[…]{Fireball}".)
    if (!/\bdetonates as an? (?:@UUID\[[^\]]*\]\{)?Fireball\b/i.test(text)) return null;
    const match = BEADS.exec(text);
    if (!match) return null;
    const choices = [...match[1].matchAll(/(one|two|three|four|five|six|\d+) (\d+d\d+) (\w+)(?: damage)?/gi)].map(([, count, dice, type]) => ({ label: `${dice} ${type.toLowerCase()} (${COUNT[count.toLowerCase()] ?? Number(count)} on a new necklace)`, formula: `${dice}[${type.toLowerCase()}]`, count: COUNT[count.toLowerCase()] ?? Number(count) }));
    return choices.length ? { choices, dc: Number(match[2]) } : null;
}

const row = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] });

// The plan: the first bead's damage, the others choices.
export function beadsPlan(html, base) {
    const read = readBeads(html);
    if (!read) return null;
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: null, range: "70 feet", area: { type: "burst", value: 20 } },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: read.dc } },
            sharedDamage: { rollOnce: true, components: [{ id: "0", formula: read.choices[0].formula, type: null, category: null }] },
            outcomes: { criticalSuccess: row(0), success: row(0.5), failure: row(1), criticalFailure: row(2) }
        },
        damageChoices: read.choices.map(({ label, formula }) => ({ label, formula })),
        notes: ["Hurled (an Interact action with the ranged trait) by the start of your next turn, it detonates where it lands; else it's a plain red bead."]
    };
}

// The plan with a bead's damage in place of the first's.
export function withDamageChoice(plan, index = 0) {
    const choice = plan?.damageChoices?.[index];
    if (!choice) return plan;
    const components = plan.resolution.sharedDamage.components.map((component, at) => (at === 0 ? { ...component, formula: choice.formula } : component));
    return { ...plan, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components } } };
}
