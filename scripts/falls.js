// What a creature's own items ease its falls by, for PF2e Automatic Environment Resolution (2026-10-26, its session's contract):
// api.fallEases(actor) → [{ shorter?, noDamage?, source }], synchronous — the environment module asks it as it rolls falling damage, beside
// the Effects flagged `fall` (an activation's or a consumable's, scripts/live.js). Its items' passive words (src/compiler/falls.js), while
// they're in use as PF2e has them equipped: Gliding Membranes' "Treat falls as 25 feet shorter", Angelic Opera Cloak's "never take falling
// damage"; a sheet toggle's picked passage, Shawl of Seasons' Fall; not Daredevil Boots' when its user has Cat Fall, which the boots improve
// instead.

import { passiveFallOf, plainOf } from "../src/compiler/falls.js";
import { inUse, passageOf, picked } from "./temperature.js";

const PHYSICAL = new Set(["equipment", "armor", "weapon", "shield", "backpack", "treasure"]);
const cache = new Map();

// The item's fall when it's in use, read once (its text and its toggle the key).
export function fallReadingOf(item) {
    const html = String(item?.system?.description?.value ?? "");
    const toggle = picked(item);
    const key = `${item?.uuid ?? item?.id}|${html.length}|${toggle?.name ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    const text = plainOf(html);
    const fromToggle = toggle ? passageOf(text, toggle.name, toggle.names) : null;
    const reading = fromToggle ? passiveFallOf(fromToggle) : toggle ? null : passiveFallOf(text);
    // (Daredevil Boots' "or, if you have the Cat Fall feat, …": the feat's, not the shorter fall.)
    const result = reading ? { ...reading, ...(/\bor, if you have the Cat Fall feat\b/i.test(text) ? { unlessFeat: "cat-fall" } : {}) } : null;
    cache.set(key, result);
    return result;
}

export function fallEases(actor) {
    if (!actor) return [];
    const feats = new Set((actor.itemTypes?.feat ?? []).map((feat) => feat.slug ?? feat.system?.slug).filter(Boolean));
    const out = [];
    for (const item of [...(actor.items ?? [])].filter((entry) => PHYSICAL.has(entry.type))) {
        const reading = fallReadingOf(item);
        if (!reading || !inUse(item, "equipped") || (reading.unlessFeat && feats.has(reading.unlessFeat))) continue;
        out.push({ ...(reading.shorter ? { shorter: reading.shorter } : {}), ...(reading.noDamage ? { noDamage: true } : {}), source: item.name });
    }
    return out;
}

// (Its fall reactions offered as it falls — the environment module's hook, called on the active GM's client as a creature's degree on one
// of its cards means a fall, before the GM applies it: a line whispered to the GMs and the creature's owners, naming the reactions its
// items have (Tumbler's Belt's Land With Grace, Aerial Cloak's Fall Gently, Dragonaut's Wingsuit's Descend, a Jade Cat), to use from the
// sheet before Apply, and what its worn items already ease.)
const FALLING = /\b(?:You're|You are) falling\b|\bYou (?:begin to )?fall\b/i;
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// compile: { activations(item) → [{ activation, plan }], consumable(item) → plan }; isActiveGM, fallLine: the module's.
export function setUpFallOffers({ activations, consumable, isActiveGM, fallLine }) {
    Hooks.on("pf2e-automatic-environment-resolution.falling", (data) => {
        if (!isActiveGM()) return;
        offerFallReactions(data, { activations, consumable, fallLine }).catch((error) => console.error("pf2e-automatic-item-resolution | fall reactions", error));
    });
}

export async function offerFallReactions({ token, feet } = {}, { activations, consumable, fallLine }) {
    const actor = token?.actor;
    if (!actor) return null;
    const offers = [];
    for (const item of actor.items ?? []) {
        if (item.type === "consumable") {
            const plan = consumable(item);
            if (plan?.fall && FALLING.test(String(item.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))) offers.push(`${item.name}: ${fallLine(plan.fall)}`);
            continue;
        }
        for (const { activation, plan } of activations(item) ?? []) {
            if (plan?.fall && FALLING.test(String(activation?.trigger ?? ""))) offers.push(`${item.name}${activation?.name ? ` (${activation.name})` : ""}: ${fallLine(plan.fall)}`);
        }
    }
    if (!offers.length) return null;
    const worn = fallEases(actor).map((entry) => `${entry.source} (${entry.noDamage ? "no damage" : `${entry.shorter} feet shorter`})`);
    const whisper = game.users.filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER")).map((user) => user.id);
    const name = token.name ?? actor.name;
    const content = `<p><strong>${escape(name)}</strong> is falling${Number(feet) > 0 ? ` ${Number(feet)} feet` : ""}. Its reactions: ${offers.map(escape).join("; ")}. Use one from the sheet's Activate before the GM applies the card.${worn.length ? ` Already eased by ${worn.map(escape).join(", ")}.` : ""}</p>`;
    return ChatMessage.create({ content, whisper, speaker: ChatMessage.getSpeaker({ actor }) });
}
