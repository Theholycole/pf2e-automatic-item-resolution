// A consumable used in more than one way, each its own Activate block: Toadskin Salve's two reactions once it's applied
// (flinging mucus at the creature you hit, or dulling a blow), Thrice-Fried Mudwings' meal and the reaction its wings give.
// Each block is compiled as a permanent item's activation is (src/compiler/permanent.js), and the plan is the item module's
// builtin "ways": live play posts a card to pick a way, which posts that way's own card (scripts/ways.js) as often as the
// text allows — the card stays open. Only when every block reads something a card plays. Pure.

import { compileActivations } from "./permanent.js";

// A way's name: its own, else what its Trigger says ("When you hit a creature with a melee Strike"), else its place.
function wayName(activation, index) {
    if (activation.name) return activation.name;
    if (activation.trigger) return `When ${activation.trigger.charAt(0).toLowerCase()}${activation.trigger.slice(1).replace(/[.;]\s*$/, "")}`;
    return index === 0 ? "On use" : `Way ${index + 1}`;
}

const plays = (plan) => Boolean(plan) && !plan.noteOnly && plan.builtin !== "no-effect" && plan.builtin !== "ways";

// The item → { builtin: "ways", ways: [{ name, plan, html }] } (from base), or null.
export function waysPlan(item, base, options = {}) {
    if (item?.type !== "consumable") return null;
    const entries = compileActivations({ ...item, type: "equipment" }, options);
    if (entries.length < 2 || !entries.every((entry) => plays(entry.plan))) return null;
    const ways = entries.map((entry, index) => ({ name: wayName(entry.activation, index), html: entry.activation.html, plan: { ...entry.plan, item: { ...(entry.plan.item ?? {}), type: item.type } } }));
    const partial = ways.some((way) => way.plan.partial);
    return { ...base, builtin: "ways", automation: { level: partial ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(partial ? { partial: true } : {}) };
}
