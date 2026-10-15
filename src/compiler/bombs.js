// Alchemical bombs (PF2e weapon items of group "bomb"). PF2e Strikes with them
// and rolls their damage, persistent damage and splash itself (8.6.1 adds one
// splash-only roll per damage type to the damage message). What it leaves to
// the table, and this reads:
//   - the splash on the creatures within 5 feet of the target (the card's; the
//     amount is PF2e's own splash roll, with the thrower's splash feats);
//   - the riders on a hit and a critical hit: "On a hit, the target becomes
//     off-guard until the start of your next turn", "Frightened 1, or
//     Frightened 2 on a critical hit", "On a critical hit, the target is
//     knocked prone", "a -15-foot status penalty to its Speeds".
// A rider in a sentence that says when or if ("a living creature taking
// persistent fire damage …", "against a prepared spellcaster") is left out, as
// are saves (the ability module's save card, later). Pure.

import { STAGE_CONDITIONS, readConditions, readDuration } from "../../../pf2e-automatic-ability-resolution/src/compiler/inline.js";
import { readPenalties } from "../../../pf2e-automatic-ability-resolution/src/compiler/checks.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

export const isBomb = (item) => item?.type === "weapon" && item.system?.group === "bomb";

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"]);
const CONDITIONAL = /\b(?:if|unless|while|against (?:a|an)\b|in contact with|living creature|made of|wearing|using|that is|who is|whose)\b/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// "until the end of its next turn" is the target's turn here (the ability compiler, written for monsters, reads "its"
// as the creature using the ability); "your next turn" stays the thrower's.
function fitDuration(duration, text) {
    if (!duration || duration.anchor !== "source-turn") return duration;
    return /\b(?:its|their|the target's|the creature's) next turn\b/i.test(text) ? { ...duration, anchor: "target-turn" } : duration;
}

// What a rider's words give the target: conditions (valued ones only with a value) and penalties.
function riderRow(text) {
    const row = none();
    const sentence = `The target ${text.replace(/^(?:the target|that creature|it)\s+/i, "")}`;
    // (Every condition named in words: the text's links are plain words by now.)
    for (const effect of readConditions(sentence, { plain: STAGE_CONDITIONS })) {
        if (effect.recipient === "self") continue;
        if (VALUED.has(effect.slug) && !Number.isFinite(effect.value)) continue;
        row.effects.push({ kind: "condition", slug: effect.slug, value: effect.value ?? null, duration: fitDuration(effect.duration ?? null, sentence) });
    }
    for (const modifier of readPenalties(sentence)) row.modifiers.push({ ...modifier, duration: fitDuration(modifier.duration ?? readDuration(sentence), sentence) });
    return row;
}

const merge = (...rows) => rows.reduce((all, row) => ({ ...all, effects: [...all.effects, ...row.effects], modifiers: [...all.modifiers, ...row.modifiers] }), none());

// The bomb's riders: { success, criticalSuccess } rows, from its "On a hit" and "On a critical hit" sentences.
export function bombRiders(item) {
    const text = plainText(item?.system?.description?.value);
    let hit = none();
    let critical = null;
    let criticalExtra = none();
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const onHit = /^(?:On a hit|On a successful Strike),\s*(.+)$/i.exec(sentence) ?? /^When you hit a creature with an? [\w' -]+?, that creature\s+(.+)$/i.exec(sentence);
        const onCritical = /^On a critical hit,\s*(.+)$/i.exec(sentence);
        if (onHit && !CONDITIONAL.test(onHit[1])) {
            // "…, or becomes Sickened 1 on a critical hit" / "Frightened 1, or Frightened 2 on a critical hit": the critical hit's instead.
            const [ordinary, instead] = onHit[1].split(/,\s*or\s+(?=[^,]*\bon a critical hit\b)/i);
            hit = merge(hit, riderRow(ordinary));
            if (instead) critical = riderRow(instead.replace(/\s*on a critical hit\b/i, ""));
        } else if (onCritical && !CONDITIONAL.test(onCritical[1])) {
            criticalExtra = merge(criticalExtra, riderRow(onCritical[1].replace(/^(?:the target )?also\s+/i, "")));
        }
    }
    // A critical hit: its own row in place of the hit's, else the hit's; and what a critical hit adds.
    const criticalRow = merge(critical ?? hit, criticalExtra);
    return { success: hit, criticalSuccess: criticalRow };
}

const hasRow = (row) => Boolean(row.effects.length || row.modifiers.length);

// A bomb → { plan for its riders, splash } or null when PF2e does it all (no splash, no rider read). The plan is the
// core's save family with the Strike as its roll (degrees from the thrower's side); live play takes the degree PF2e
// rolled. It has no damage: PF2e's own Strike deals that.
export function compileBomb(item) {
    if (!isBomb(item)) return null;
    const riders = bombRiders(item);
    const splash = Number(item.system?.splashDamage?.value) || 0;
    if (!splash && !hasRow(riders.success) && !hasRow(riders.criticalSuccess)) return null;
    return {
        modelVersion: MODEL_VERSION,
        source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits: [...(item.system?.traits?.value ?? [])],
        activation: { time: "1", traits: ["manipulate"] },
        automation: { level: "automatic" },
        targeting: { target: "the creature the bomb hits", range: Number(item.system?.range) || null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: riders.criticalSuccess, success: riders.success, failure: none(), criticalFailure: none() }
        },
        item: { type: item.type, group: "bomb", level: Number(item.system?.level?.value) || 0, splash: splash ? { value: splash, type: item.system?.damage?.damageType ?? "untyped" } : null }
    };
}
