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
import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { plainText } from "./rows.js";
import { asAbility } from "./ability-shape.js";
import { guardValues } from "./guards.js";

export const isBomb = (item) => item?.type === "weapon" && item.system?.group === "bomb";

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"]);
const CONDITIONAL = /\b(?:if|unless|while|against (?:a|an)\b|in contact with|living creature|made of|wearing|using|that is|who is|whose)\b/i;
// (A rider behind a save — "the target must succeed at a DC 22 Fortitude save or be Blinded" — is the save's, not the hit's.)
const SAVED = /\b(?:must (?:succeed|attempt)|saving throw|save)\b|@Check\[/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// "until the end of its next turn" is the target's turn here (the ability compiler, written for monsters, reads "its"
// as the creature using the ability); "your next turn" stays the thrower's.
function fitDuration(duration, text) {
    if (!duration || duration.anchor !== "source-turn") return duration;
    return /\b(?:its|their|the target's|the creature's) next turn\b/i.test(text) ? { ...duration, anchor: "target-turn" } : duration;
}

// What a rider's words give the target: conditions (valued ones only with a value) and penalties.
export function riderRow(text) {
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
export const bombRiders = (item) => hitRiders(plainText(item?.system?.description?.value));

// A Strike's riders in words (a bomb's, an item's "make a melee Strike. If you hit and deal damage, the target is
// Frightened 1, or Frightened 2 on a critical hit"): { success, criticalSuccess } rows.
const ON_HIT = /^(?:On a hit|On a successful Strike|If (?:you|it|the Strike) hits?(?: and deals? damage)?|If you hit and deal damage|If you successfully deal damage to (?:your|the) target),\s*(.+)$/i;
export function hitRiders(text) {
    let hit = none();
    let critical = null;
    let criticalExtra = none();
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const onHit = ON_HIT.exec(sentence) ?? /^When you hit a creature with an? [\w' -]+?, that creature\s+(.+)$/i.exec(sentence);
        const onCritical = /^On a critical hit,\s*(.+)$/i.exec(sentence);
        if (onHit && !CONDITIONAL.test(onHit[1]) && !SAVED.test(onHit[1])) {
            // "…, or becomes Sickened 1 on a critical hit" / "Frightened 1, or Frightened 2 on a critical hit": the critical hit's instead.
            const [ordinary, instead] = onHit[1].split(/,\s*or\s+(?=[^,]*\bon a critical hit\b)/i);
            hit = merge(hit, riderRow(ordinary));
            if (instead) critical = riderRow(instead.replace(/\s*on a critical hit\b/i, ""));
        } else if (onCritical && !CONDITIONAL.test(onCritical[1]) && !SAVED.test(onCritical[1])) {
            criticalExtra = merge(criticalExtra, riderRow(onCritical[1].replace(/^(?:the target )?also\s+/i, "")));
        }
    }
    // A critical hit: its own row in place of the hit's, else the hit's; and what a critical hit adds.
    const criticalRow = merge(critical ?? hit, criticalExtra);
    return { success: hit, criticalSuccess: criticalRow };
}

export const hasRow = (row) => Boolean(row.effects.length || row.modifiers.length);

// Who a bomb's save is for: "Any creature hit by the bomb or in its splash area" (scope "splash": the target and the
// creatures splashed), "each creature within 10 feet of where the bomb exploded" ("burst", radius), "A creature struck
// by a dwarven daisy", "the target must" ("target", on a hit).
function saveScope(text) {
    if (/\b(?:hit by the bomb|the target) or in (?:its|the) splash area\b/i.test(text)) return { scope: "splash" };
    const burst = /\beach creature within (\d+) feet of (?:where|the space in which|the (?:spot|square|point) where) the (?:bomb|stone|vial|grenade|\w+) (?:exploded|explodes|landed|hits?)\b/i.exec(text);
    if (burst) return { scope: "burst", radius: Number(burst[1]) };
    if (/\b(?:a creature (?:struck|hit) (?:by|with)|the (?:primary )?target must)\b/i.test(text)) return { scope: "target" };
    return null;
}

// "… must succeed at a DC 18 Fortitude save or become Dazzled for 1 round", "… or be Deafened until the end of its next
// turn": a save whose failure (and critical failure) gives the condition, when the ability compiler read none.
function plainSave(html, text) {
    const check = /@Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\]/i.exec(html);
    const worded = text.replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $2 $1");
    const or = /\bmust succeed at a (?:DC \d+ )?(?:Fortitude|Reflex|Will)? ?(?:save|saving throw)?(?: with the listed DC)? or (?:be|become) ([^.]+)\./i.exec(worded);
    if (!check || !or) return null;
    const row = riderRow(or[1]);
    if (!row.effects.length && !row.modifiers.length) return null;
    return {
        check: { roll: "save", statistic: check[1].toLowerCase(), basic: false, against: { dc: "fixed", value: Number(check[2]) } },
        outcomes: { criticalSuccess: none(), success: none(), failure: row, criticalFailure: { ...row, effects: row.effects.map((effect) => ({ ...effect })), modifiers: [...row.modifiers] } }
    };
}

// A bomb's save: { plan, scope, radius? } — the ability compiler's save plan when it reads one (a fixed DC and rows
// that do something), else the plain "save or become X" form; null when its save is for a narrower set of creatures
// or does something the module doesn't read (Silver Orb's lingering cloud, Blightburn's sickness).
export function bombSave(item, { scope: given = null } = {}) {
    const html = String(item?.system?.description?.value ?? "");
    if (!/@Check\[(?:fortitude|reflex|will)\|/i.test(html)) return null;
    const text = plainText(html);
    // (given: an item's Strike, whose save is for the creature it hits.)
    const scope = given ?? saveScope(text);
    if (!scope) return null;
    let read = null;
    try {
        read = compileAbility(asAbility(item), {});
    } catch {
        read = null;
    }
    // (An area the ability compiler read is fine for a burst: the card finds the creatures in it.)
    const resolution = read?.resolution?.kind === "save" && read.resolution.check?.against?.dc === "fixed" && (!read.targeting?.area || scope.scope === "burst")
        && Object.values(read.resolution.outcomes ?? {}).some((row) => (row?.effects ?? []).length || (row?.modifiers ?? []).length)
        ? { check: read.resolution.check, outcomes: read.resolution.outcomes, ...(read.resolution.afflictionHandoff ? { afflictionHandoff: read.resolution.afflictionHandoff } : {}) }
        : plainSave(html, text);
    if (!resolution) return null;
    return {
        ...scope,
        plan: {
            modelVersion: MODEL_VERSION,
            source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
            rank: 1,
            traits: [...(item.system?.traits?.value ?? [])],
            activation: { time: "free", traits: [] },
            automation: { level: "automatic" },
            targeting: { target: scope.scope === "target" ? "the creature the bomb hits" : "the creatures the bomb affects", range: null, area: null },
            trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
            resolution: { kind: "save", ...resolution }
        }
    };
}

// A bomb → { plan for its riders, splash } or null when PF2e does it all (no splash, no rider read). The plan is the
// core's save family with the Strike as its roll (degrees from the thrower's side); live play takes the degree PF2e
// rolled. It has no damage: PF2e's own Strike deals that.
export function compileBomb(item) {
    if (!isBomb(item)) return null;
    const riders = bombRiders(item);
    const splash = Number(item.system?.splashDamage?.value) || 0;
    const save = bombSave(item);
    if (!splash && !save && !hasRow(riders.success) && !hasRow(riders.criticalSuccess)) return null;
    return guardValues({
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
        item: { type: item.type, group: "bomb", level: Number(item.system?.level?.value) || 0, splash: splash ? { value: splash, type: item.system?.damage?.damageType ?? "untyped" } : null, save }
    });
}
