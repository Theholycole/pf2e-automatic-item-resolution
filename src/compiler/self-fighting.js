// A weapon released to fight on its own (2026-10-27, docs/needs.md): Animated's Set Free, "You Release the weapon and it flutters through the
// air, fighting on its own against the last enemy you attacked … At the end of your turn each round, the weapon can Fly up to its fly Speed of
// 40 feet, and then can either Fly again or Strike one creature within its reach … While it's activated, an animated weapon makes Strikes with
// an attack modifier of +24 plus its item bonus to attack rolls. It uses the weapon's normal damage but has a +0 Strength modifier … Each round,
// when the weapon finishes using its actions, attempt a DC 6 flat check. On a failure, the activation ends. The weapon falls to the ground and
// can't be Set Free again for 10 minutes." — and Vine Whip's rooted whip, "+22 plus its item bonus", two actions on its user's turn, the same
// flat check and 10 minutes. → plan.again: the weapon's Strike card, kept open while it fights — its attack the text's modifier and the
// weapon's potency, its damage the weapon's own dice and type with no Strength (and its elemental runes' 1d6), filled in from the weapon as
// it's pressed —, then the flat check: a failure closes it, and the activation waits its minutes from then (plan.selfFighting,
// scripts/poisons.js). Its flying, and what it can't do (block, flank, react), lines of the card. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const ANIMATED = /\bYou Release the weapon and it flutters through the air, fighting on its own against the last enemy you attacked, or the nearest enemy to it if your target has been defeated\. At the end of your turn each round, the weapon can Fly up to its fly Speed of (\d+) feet, and then can either Fly again or Strike one creature within its reach\..*?\bWhile it's activated, an animated weapon makes Strikes with an attack modifier of (?:\[\[\/r 1d20\+(\d+)\]\]|\+(\d+)) plus its item bonus to attack rolls\. It uses the weapon's normal damage but has a \+0 Strength modifier\..*?\bEach round, when the weapon finishes using its actions, attempt a (?:@Check\[flat\|dc:(\d+)\]|DC (\d+) flat check)\. On a failure, the activation ends\. The weapon falls to the ground and can't be Set Free again for (\d+) minutes\./is;
const ROOTED = /\bYou Release the weapon and plant it in the ground, where it takes root and fights on its own against the last enemy you attacked or the nearest enemy to it if your target has been defeated\. The weapon has a space of 5 feet, acts on your initiative, and gains (two|three) actions\..*?\bWhile Activated, a vine whip makes Strikes with an attack modifier of \+(\d+) plus its item bonus to attack rolls(?: \(normally \+\d+ total\))?\. It uses the weapon's normal damage but has a \+0 Strength modifier\..*?\bEach round, when the vine whip is finished using its actions, attempt a (?:@Check\[flat\|dc:(\d+)\]|DC (\d+) flat check)\. On a failure, the Activation ends and the vine whip becomes inanimate\. You can't Activate the item again for (\d+) minutes\./is;
const ACTIONS = { two: 2, three: 3 };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const hit = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["weapon"] }, effects: [], modifiers: [] });

// Its Strike's plan: at the text's modifier (the weapon's potency added as it's pressed), its damage the weapon's.
export function weaponStrikePlan({ name, modifier, flat, wait, index }) {
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${name}: its Strike` },
        automation: { level: "automatic" },
        targeting: { target: "1 creature within its reach", range: null, area: null },
        trigger: { event: "use" },
        ownCheck: { kind: "attack", modifier },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier }, sharedDamage: { rollOnce: true, components: [{ id: "weapon", formula: "0", type: null, category: null }] }, outcomes: { criticalSuccess: hit(2), success: hit(1), failure: none(), criticalFailure: none() } },
        selfFighting: { base: modifier, flat, wait, index }
    };
}

// The activation's plan (its text's note), its html, the item and its activation → its plan, or the same plan.
export function withSelfFighting(plan, html, { item = null, activation = null, index = 0 } = {}) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ");
    const animated = ANIMATED.exec(text);
    const rooted = animated ? null : ROOTED.exec(text);
    if ((!animated && !rooted) || !plan?.noteOnly) return plan;
    const modifier = Number(animated ? animated[2] ?? animated[3] : rooted[2]);
    const flat = Number(animated ? animated[4] ?? animated[5] : rooted[3] ?? rooted[4]);
    const minutes = Number(animated ? animated[6] : rooted[5]);
    const name = String(plan.source?.name ?? item?.name ?? "The weapon");
    const lines = animated
        ? [`Released, it fights on its own against the last enemy its user attacked (or the nearest one). At the end of its user's turn each round it Flies up to ${animated[1]} feet, then Flies again or Strikes one creature within its reach (its Strike card, then its DC ${flat} flat check). It doesn't block, impede or flank, can't move through an enemy's space, can't use reactions, and its Flies trigger none; it can't be activated or benefit from its user's abilities while animated.`]
        : [`Only with soil or sand within its user's reach. Planted, it fights on its own against the last enemy its user attacked (or the nearest one), with ${ACTIONS[rooted[1].toLowerCase()]} actions on its user's turn (its Strike card for each, then its DC ${flat} flat check). It doesn't block, impede or flank, and can't use reactions; while rooted it has fast healing 1, and pulling it out takes an Interact action.`];
    const { noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { level: "automatic" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [...lines, "Its property runes' on-hit effects still work: the elemental ones' 1d6 is on its Strike card, the rest by their own rules."],
        again: { plan: weaponStrikePlan({ name, modifier, flat, wait: { value: minutes, unit: "minutes" }, index: activation?.index ?? index }), later: true, repeat: true }
    };
}
