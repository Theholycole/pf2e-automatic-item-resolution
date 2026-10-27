// A growth its item's own PF2e Effect already is, and a Trample while it lasts (2026-10-27, docs/needs.md): Dinosaur Boots' "You grow, gaining
// the effects of Enlarge for 1 minute. During that time, you gain dinosaur features … You gain a foot unarmed attack that has the same statistics
// as your fist unarmed attack, except its damage die is increased from 1d4 to 1d6. Once during the duration, you can use the Trample 3-action
// activity to Trample creatures one size smaller than you or smaller. This deals an amount of damage to each creature equal to that of your foot
// unarmed attack (including any extra weapon damage dice, bonuses, or additional damage as normal), with a DC 27 basic Reflex save. You can
// Dismiss the activation." PF2e's Effect: Dinosaur Boots is Enlarge's size, reach, damage bonus and clumsy with the foot's Strike (a d8 for the
// Greater, Huge): the item card gives it, not a cast of Enlarge. Its Trample is plan.again, a basic Reflex save card kept for the minute — used
// once, or again and again for the Greater's "During the duration" —, its damage the foot Strike's as PF2e rolls it when it's used
// (plan.strikeDamage.slug, scripts/poisons.js). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const GROW = /^You grow(?: to size (Huge) if you choose)?, (?:gaining|with) the effects of (?:\d+(?:st|nd|rd|th)-rank )?Enlarge for (\d+) minutes?\.$/i;
const FEATURES = /^During that time, you gain dinosaur features; your legs and feet transform into a dinosaur's\.$/i;
const FOOT = /^You gain a foot unarmed attack that has the same statistics as your fist unarmed attack, except its damage die is increased from 1d4 to 1d(\d+)\.$/i;
const TRAMPLE = /^(Once during|During) the duration, you can use the Trample 3-action activity to Trample creatures one size smaller than you or smaller\.$/i;
const DAMAGE = /^This deals an amount of damage to each creature equal to that of your foot unarmed attack \(including any extra weapon damage dice, bonuses, or additional damage as normal\), with a DC (\d+) basic Reflex save\.$/i;
const DISMISS = /^You can Dismiss the activation\.(?: Effect: [\w' ()-]+)?$/i;
const LINK = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.\w+)\]\{(Effect: [^}]+)\}/;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();
const row = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["strike"] : [] }, effects: [] });

// The Trample's save: basic Reflex at its DC, its damage the foot Strike's (filled in when it's used).
export function tramplePlan({ dc, name, slug }) {
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${name}: Trample` },
        automation: { level: "automatic" },
        targeting: { target: "each creature whose space its user enters", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: dc } },
            sharedDamage: { rollOnce: true, components: [{ id: "strike", formula: "0", type: "bludgeoning", category: null }] },
            outcomes: { criticalSuccess: row(0), success: row(0.5), failure: row(1), criticalFailure: row(2) }
        },
        strikeDamage: { slug, label: "foot", fallback: "bludgeoning", rows: { success: 0.5, failure: 1, criticalFailure: 2 } },
        notes: ["Trample (3 actions): Stride up to double your Speed through the spaces of creatures one size smaller than you or smaller, then target each one whose space you entered (each once)."]
    };
}

// The cast's plan, the activation's html, the item and its activation → the item card's plan (its own Effect, the Trample after it), or the
// same plan.
export function withTrample(plan, html, { item = null, activation = null } = {}) {
    if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Enlarge") return plan;
    const notes = plan.notes ?? [];
    const find = (pattern) => notes.find((note) => pattern.test(said(note)));
    const [grow, features, foot, trample, damage, dismiss] = [GROW, FEATURES, FOOT, TRAMPLE, DAMAGE, DISMISS].map(find);
    const link = LINK.exec(String(html ?? ""));
    if (!grow || !foot || !trample || !damage || !link) return plan;
    const left = notes.filter((note) => ![grow, features, foot, trample, damage, dismiss].includes(note));
    const repeat = /^During\b/i.test(said(trample));
    const huge = Boolean(GROW.exec(said(grow))[1]);
    const name = String(plan.source?.name ?? "The item");
    const { builtin, spell, rank, dc, attack, tradition, self, area, targets, choices, castDuration, notes: _, partial, ...rest } = plan;
    return {
        modelVersion: MODEL_VERSION,
        ...rest,
        source: { ...(plan.source ?? {}), type: item?.type ?? "equipment" },
        rank: 1,
        traits: [...(item?.system?.traits?.value ?? [])],
        activation: { time: activation?.time ?? plan.item?.activation?.time ?? null, traits: activation?.traits ?? [] },
        automation: { ...(plan.automation ?? {}), level: left.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: link[1], label: link[2], recipients: "self" }] },
        again: { plan: tramplePlan({ dc: Number(DAMAGE.exec(said(damage))[1]), name, slug: `${String(plan.source?.slug ?? "dinosaur-boots").replace(/-greater$/, "")}-foot-attack` }), later: true, ...(repeat ? { repeat: true } : {}), time: { value: Number(GROW.exec(said(grow))[2]), unit: "minutes" } },
        notes: [
            ...(huge ? ["PF2e's Effect makes its user Huge (4th-rank Enlarge); to stay Large, its user changes its size by hand."] : []),
            `Its Trample: a save card kept for the minute${repeat ? ", used each time" : ", used once"}.`,
            ...(dismiss ? ["Its user can Dismiss it: remove its Effect."] : []),
            ...left
        ],
        ...(left.length ? { partial: true } : {})
    };
}
