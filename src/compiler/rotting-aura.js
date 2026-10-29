// An aura that sickens the creatures ending their turns in it, more each turn (2026-10-28, docs/needs.md "reader"): Magic+'s Scepter of
// Sickening's Rotting Aura, paid with a spell slot of 3rd rank or higher (the ways card's pick of the slot, src/compiler/slot-cost.js):
// a 20-foot emanation round its user for as many rounds as the slot's rank, a creature ending its turn in it Sickened 1 or 1 more (Sickened 4
// at most), and none inside able to lower its Sickened below 1. Before, each slot's way was a note. Now each is the ability module's zone on
// its user's token for its rounds: as each creature's turn in it ends, an automatic card raising its Sickened by 1 (from 1, at most 4: the
// condition's stack), and inside it a note Effect saying it can't lower its Sickened below 1 (zone.inside text, while it's there). Pure.

import { timeOf, zoneOf } from "./area-readings.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const EXUDES = /\bEffect You exude a putrid aura\s+in a @Template\[distance:(\d+)\|type:(emanation)\]\.\s+The aura lasts for (\d+) rounds\.\s+Creatures that end their turn\s+within the area become Sickened 1\s+or increase the value of\s+their sickened condition by 1,\s+to a maximum of sickened (\d)\.\s+Creatures in the area cannot reduce\s+their sickened condition below 1\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// One slot's way (its note-only plan) → its zone, or null.
function auraOf(way) {
    const plan = way?.plan;
    const note = plan?.noteOnly ? (plan.resolution?.outcomes?.success?.noteEffects ?? []).find((entry) => EXUDES.test(said(entry))) : null;
    const found = note ? EXUDES.exec(said(note)) : null;
    const rank = Number(plan?.spend?.spellSlot?.rank);
    if (!found || Number(found[3]) !== rank) return null;
    const [radius, rounds, most] = [Number(found[1]), Number(found[3]), Number(found[4])];
    const sicken = {
        modelVersion: plan.modelVersion,
        source: plan.source,
        rank: plan.rank,
        traits: plan.traits,
        activation: plan.activation,
        automation: { level: "automatic" },
        targeting: { target: "a creature that ends its turn in the aura", range: null, area: null },
        trigger: { event: "zone" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects: [{ kind: "condition", slug: "sickened", value: 1, duration: null, stack: { by: 1, max: most } }] } } }
    };
    const zone = zoneOf({
        area: { type: "emanation", value: radius },
        centre: "self",
        lasts: timeOf(rounds, "rounds"),
        saves: [{ when: ["end"], plan: sicken }],
        inside: [{ label: "in the putrid aura", text: "Inside the putrid aura, it can't lower its Sickened condition below 1 (Retching or otherwise)." }],
        notes: [`The aura moves with its user for ${rounds} rounds (the slot's rank). A creature ending its turn in it is Sickened 1, or 1 more, Sickened ${most} at most.`]
    });
    const { noteOnly, partial, resolution, ...rest } = plan;
    return { ...way, plan: { ...rest, builtin: "zone", actions: null, automation: { ...(plan.automation ?? {}), level: "automatic" }, targeting: { target: null, range: null, area: zone.area }, zone } };
}

// The ways card of a slot's ranks → each way its zone, the card no longer partial; or the same plan.
export function withRottingAura(plan) {
    if (plan?.builtin !== "ways" || !(plan.ways ?? []).length || !plan.ways.every((way) => way?.plan?.spend?.spellSlot)) return plan;
    const ways = plan.ways.map(auraOf);
    if (ways.some((way) => !way)) return plan;
    const { partial, ...rest } = plan;
    return { ...rest, ways, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}
