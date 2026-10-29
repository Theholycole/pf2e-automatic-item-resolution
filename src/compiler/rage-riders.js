// A crown's rules for its user's rage against one kind of foe (2026-10-28, docs/needs.md "strike"): Instinct Crown (Wrecker)'s second
// activation — its user's melee Strikes ignore that much physical resistance (its level) against constructs, and a critical hit on a creature
// its Rage hits harder (a construct, or one its instinct's toggle names) calls for a save against its class DC or Slowed for a round.
// → plan.item.attackRiders (src/compiler/attack-riders.js, scripts/attack-riders.js): the watch Effect on its user, gone when its Rage ends
// (untilRage; a minute at most, a rage's), carrying the resolution core's ignoreResistance (its user's level, set live) and a save rider —
// on a critical hit at a creature its predicate fits, the ability module's save card at it, the DC its user's class DC. Its war cry
// ("destroy warmachines") is flavor. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };

const CRY = /^Destroy warmachines\.$/;
const IGNORES = /^Your melee Strikes ignore physical\s+resistance equal to your level\s+against (constructs)\.$/;
const CRITICAL = /^When you critically succeed at\s+a Strike against a creature that\s+would qualify for your heightened\s+damage from Rage, that target must\s+attempt a (Fortitude|Reflex|Will) save\s+against your Class DC or it\s+becomes (slowed|stunned|frightened|sickened) (\d+) for (\d+) rounds?\.$/i;
// (A Strike's, not a spell attack's: PF2e's item type on the roll. And the instinct's own toggle for the creatures its Rage hits harder
// beside constructs: the Barbarians+ Wrecker Instinct's "machine-rage".)
const INSTINCT_TOGGLES = { constructs: "machine-rage" };

export function withRageRiders(plan, { kind, text, base, info, item, options }) {
    if (kind !== "activation" || (plan && !plan.noteOnly)) return plan;
    const sentences = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const ignores = sentences.map((sentence) => IGNORES.exec(sentence)).find(Boolean);
    const critical = sentences.map((sentence) => CRITICAL.exec(sentence)).find(Boolean);
    if (!ignores || !critical || sentences.some((sentence) => !CRY.test(sentence) && sentence !== ignores[0] && sentence !== critical[0])) return plan;
    const [, statistic, slug, value, rounds] = critical;
    // (The save as the ability module reads it, at a DC live play sets to its user's class DC.)
    const words = `The target must succeed at a @Check[${statistic.toLowerCase()}|dc:10] save or become ${slug.charAt(0).toUpperCase()}${slug.slice(1).toLowerCase()} ${value} for ${rounds} round${Number(rounds) === 1 ? "" : "s"}.`;
    const save = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> ${words}</p>` }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    if (save?.resolution?.kind !== "save" || !(save.resolution.outcomes?.failure?.effects ?? []).length) return plan;
    const toggle = INSTINCT_TOGGLES[ignores[1].toLowerCase()];
    const riders = [{
        on: ["criticalSuccess"],
        melee: false,
        save: { plan: { ...save, trigger: { event: "use" }, targeting: { target: "the creature hit", range: null, area: null } }, dc: "class", predicate: [{ or: ["target:trait:construct", ...(toggle ? [toggle] : [])] }, { not: "item:type:spell" }] },
        words: `On a critical hit at a construct${toggle ? " (or a creature its instinct's toggle is on for)" : ""}: a ${statistic} save against your class DC or ${slug.toLowerCase()} ${value} for ${rounds} round${Number(rounds) === 1 ? "" : "s"}`
    }];
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        item: {
            ...(info ?? {}),
            recipient: "user",
            attackRiders: { riders, duration: MINUTE, untilRage: true, ignoreResistance: { perLevel: 1, types: ["physical", "bludgeoning", "piercing", "slashing"], predicate: ["item:melee", "target:trait:construct"] } }
        },
        notes: ["For its user's rage, a minute at most: its Effect ends with the Rage."]
    };
}
