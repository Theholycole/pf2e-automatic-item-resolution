// Saves for the creatures around the creature a Strike hits: Dispersing Bullet's "When an activated dispersing bullet hits a target …
// All creatures in a @Template[type:emanation|distance:10] around the target of the attack (not including the target) must succeed at a
// @Check[fortitude|dc:21] save or be pushed 10 feet from the target (15 feet on a critical failure)", Singularity Ammunition's pull
// toward the creature hit and then "The singularity then explodes, dealing @Damage[7d12[bludgeoning]] damage to the original target and
// all creatures in a @Template[emanation|distance:5] (@Check[reflex|dc:28|basic])". The ammunition's Strike, its hit's strike.around:
// [{ radius, includeTarget, plan }] — live play posts each save card at the creatures within that distance of the creature hit. A push or
// pull away from or toward that creature (not its user) is the card's note. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const HIT = /\b(?:When an activated [\w' -]+? hits a (?:target|creature)|centered on the creature hit)\b/i;
const AROUND = /\bAll creatures in an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? (?:around|from) the target(?: of the attack)?( \(not including the target\))? must succeed at an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save or be ((?:pushed|pulled) [^.]+)\./i;
const EXPLODES = /\bThe [\w ]+? then explodes, dealing @Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})? damage to the original target and all creatures in an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? \((@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})?(?: save)?\)\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// One save sentence as the ability compiler reads it, on "the target" (each creature the card is posted at).
function savePlan(item, sentence, options) {
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> ${sentence}</p>` }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    return read?.resolution?.kind === "save" && read.resolution.check?.against?.dc === "fixed" ? { ...read, trigger: { event: "use" } } : null;
}

// The activation's html, its base, the item → the Strike plan with strike.around, or null.
export function hitAroundPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const around = AROUND.exec(text);
    const explodes = EXPLODES.exec(text);
    if (!HIT.test(text) || (!around && !explodes)) return null;
    const entries = [];
    if (around) {
        // (Its save with no rows of its own: what a failure does is moving the creature, from or to the one hit — the card's note.)
        const check = /@Check\[(fortitude|reflex|will)\|dc:(\d+)/i.exec(around[3]);
        if (!check) return null;
        const moved = around[4].replace(/\s*\(([^)]*) on a critical failure\)/i, "; $1 on a critical failure");
        const plan = {
            ...base,
            modelVersion: MODEL_VERSION,
            automation: { level: "guided" },
            targeting: { target: "1 creature", range: null, area: null },
            trigger: { event: "use" },
            resolution: { kind: "save", check: { roll: "save", statistic: check[1].toLowerCase(), basic: false, against: { dc: "fixed", value: Number(check[2]) } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
            notes: [`On a failure, it's ${moved} (move its token).`]
        };
        // (Not the creature hit itself: it's the one the others are pushed from or pulled toward.)
        entries.push({ radius: Number(around[1]), includeTarget: false, plan });
    }
    if (explodes) {
        const plan = savePlan(item, `The target takes @Damage[${explodes[1]}] damage (${explodes[3]} save).`, options);
        if (!plan) return null;
        entries.push({ radius: Number(explodes[2]), includeTarget: true, plan });
    }
    const ammo = item?.type === "ammo" || item?.type === "consumable";
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "guided" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        strike: { range: "ranged", save: null, ...(ammo ? { ammo: true } : {}), around: entries, notes: [] },
        partial: Boolean(around)
    };
}

// Saves for the allies of the creature an activation hurts, beside its own row (a third-party blade's judgment after a critical hit: the
// target's own damage and Slowed, then a basic save for "the target's allies" within some feet, Slowed 1 on a critical failure): the
// targeted card's plan.around — live play posts that save card at the creatures within that distance of the creature targeted, of its
// side. → [{ radius, includeTarget: false, allies: true, plan }] and the sentences read, or null.
const ALLIES = /\bAll the target(?:'|’|&#39;)s allies[^.]*?within (\d+) feet take (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage with an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\bbasic\b[^\]]*\])(?:\{[^}]*\})?(?: (?:Fortitude|Reflex|Will))? save\./i;
const ALLIES_WORSE = /^\s*Creatures who critically fail[^.]*?are slowed (\d)\./i;
export function aroundAllies(html, item, options = {}) {
    const text = String(html ?? "");
    const allies = ALLIES.exec(text);
    if (!allies) return null;
    const plan = savePlan(item, `The target takes ${allies[2]} damage (${allies[3]} save).`, options);
    if (!plan) return null;
    const worse = ALLIES_WORSE.exec(text.slice(allies.index + allies[0].length).replace(/^(?:\s|<[^>]+>)+/, " "));
    const failure = plan.resolution.outcomes.criticalFailure ?? none();
    const resolution = worse ? { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, criticalFailure: { ...failure, effects: [...(failure.effects ?? []), { kind: "condition", slug: "slowed", value: Number(worse[1]), duration: null }] } } } : plan.resolution;
    return { entries: [{ radius: Number(allies[1]), includeTarget: false, allies: true, plan: { ...plan, resolution } }], said: [allies[0], ...(worse ? [worse[0].trim()] : [])] };
}

// One creature's damage and condition with no save, then a save for every other creature near it — Staff of Sun Wukong's Meteor Slam,
// "dealing @Damage[10d10[bludgeoning]] damage to a single creature within 120 feet and making it Enfeebled 1 for 1 day. All other creatures
// within 10 feet of the target (except the staff's wielder) take @Damage[8d10[sonic]] damage (@Check[reflex|dc:43|basic] save)" (2026-10-25):
// the card at the creature targeted, its damage and condition automatic, and plan.around's save card at the creatures within that distance of
// it, of any side, but not its user (notUser). → the plan, or null.
const ONE_THEN_AROUND = /\bdealing (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage to a single creature within (\d+) feet and making it @UUID\[Compendium\.pf2e\.conditionitems\.Item\.[^\]]+\]\{(\w+)(?: (\d))?\} for (\d+|one|an?) (rounds?|minutes?|hours?|days?)\. All other creatures within (\d+) feet of the target \(except the [\w' -]+?(?:'|’|&#39;)s wielder\) take (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage \((@Check\[(?:fortitude|reflex|will)\|[^\]]*\bbasic\b[^\]]*\])(?:\{[^}]*\})? save\)\./i;
const DAMAGE_LINK = /^@Damage\[(\d+d\d+(?:\+\d+)?)\[(\w+)\](?:\|[^\]]*)?\]$/i;
const UNIT = { round: "rounds", minute: "minutes", hour: "hours", day: "days" };
export function oneThenAroundPlan(html, base, item, options = {}) {
    const match = ONE_THEN_AROUND.exec(String(html ?? ""));
    if (!match) return null;
    const [, damage, range, condition, value, count, unit, radius, aroundDamage, check] = match;
    const own = DAMAGE_LINK.exec(damage);
    const around = savePlan(item, `The target takes ${aroundDamage} damage (${check} save).`, options);
    if (!own || !around) return null;
    const duration = { mode: "fixed", value: /^\d+$/.test(count) ? Number(count) : 1, unit: UNIT[unit.toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" };
    const hit = { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [{ kind: "condition", slug: condition.toLowerCase(), value: value ? Number(value) : null, duration }], modifiers: [] };
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: `${range} feet`, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${own[1]}[${own[2].toLowerCase()}]`, type: own[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: none(), success: hit, failure: none(), criticalFailure: none() } },
        around: [{ radius: Number(radius), includeTarget: false, allies: false, notUser: true, plan: around }]
    };
}
