// A world setting (the user's answer of 2026-10-19): saves against an item's own DC — and the DCs of the spells it casts — use its user's
// class DC or spell DC instead when that's higher (src/compiler/item-data.js raiseItemDCs). Off by default. Applied as each card is posted,
// so the DC is its user's as it is then; its user's own saves (a drawback's, an elixir's "you must attempt") keep the item's. A poison
// too, and +4 on top for a user with Potent Poisoner (the user's answers of 2026-10-19: past the feat's own cap of their class DC).
// Whatever the setting, PF2e's Powerful Alchemy: an infused alchemical item's DC at its alchemist's class DC, as PF2e's own inline checks
// have it (its AdjustModifier on "inline-dc" for item:trait:infused).

import { raiseItemDCs } from "../src/compiler/item-data.js";
import { isOwnSave } from "../src/live/poison-card.js";
import { MODULE_ID, ownerDCsOf } from "./foundry.js";

export const USER_DCS = "itemDCsFromUser";

export function registerItemDCSettings() {
    game.settings.register(MODULE_ID, USER_DCS, {
        name: "Item DCs from their user",
        hint: "Saves against an item's own DC, and the DCs of spells it casts, use the user's class DC or spell DC instead when that's higher. Poisons too, +4 on top for a user with Potent Poisoner.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
}

const enabled = () => {
    try {
        return game.settings.get(MODULE_ID, USER_DCS) === true;
    } catch {
        return false;
    }
};
const SELF = /^(?:you|yourself|self|the user|the drinker|its user)$/i;

// A poison: PF2e's poison category, or the poison trait with how it's delivered (contact, ingested, inhaled, injury).
export const isPoison = (item) => item?.system?.category === "poison" || ((item?.system?.traits?.value ?? []).includes("poison") && (item?.system?.traits?.value ?? []).some((trait) => ["contact", "ingested", "inhaled", "injury"].includes(trait)));

// Its user's feat or class feature by slug (Potent Poisoner, Powerful Alchemy).
const hasFeature = (actor, slug) => [...(actor?.itemTypes?.feat ?? []), ...(actor?.items?.contents ?? [])].some((entry) => (entry?.system?.slug ?? entry?.slug) === slug);
// An alchemist's class DC, as Powerful Alchemy's rule reads it (@actor.classDCs.alchemist).
const alchemistDC = (actor) => Number(actor?.classDCs?.alchemist?.dc?.value ?? actor?.classDCs?.alchemist?.value) || null;

// The plan as its card plays it (item: the one used): raised when the setting is on — a poison +4 more with Potent Poisoner — or, setting or
// not, for an alchemist's infused item under Powerful Alchemy; not its user's own save.
export function withUserDCs(plan, actor, text = "", item = null) {
    if (!plan || !actor) return plan;
    const setting = enabled();
    const infused = (item?.system?.traits?.value ?? []).includes("infused") && hasFeature(actor, "powerful-alchemy") ? alchemistDC(actor) : null;
    if (!setting && !infused) return plan;
    if (isOwnSave(plan, text) || (plan.resolution?.check?.roll === "save" && SELF.test(String(plan.targeting?.target ?? "").trim()))) return plan;
    let dcs = setting ? ownerDCsOf(actor) : {};
    if (infused && !(Number(dcs.class) >= infused) && !(Number(dcs.spell) >= infused)) dcs = { ...dcs, class: infused };
    const potent = setting && isPoison(item) && hasFeature(actor, "potent-poisoner") ? { value: 4, name: "Potent Poisoner" } : null;
    const reason = [setting ? "the world setting" : null, infused ? "Powerful Alchemy, an infused item" : null].filter(Boolean).join("; ");
    return raiseItemDCs(plan, dcs, { plus: potent, reason, label: infused && !setting ? "alchemist class" : null }).plan;
}

// --- PF2e's own DC links (2026-11-17) ---------------------------------------------------------------------------------------------
// The setting raised only the module's own cards; PF2e's own links to an item's saves — the "DC 19 Reflex" in the item's chat card
// after Use or when sent to chat, on its sheet, in an inventory row's description — still said, and rolled, the item's printed DC. Under
// the setting, those links too: each save link (Fortitude, Reflex or Will at a set DC, not one already against its user's own DC) of a
// physical item a creature carries, shown and rolled at its user's class DC or spell DC when higher (+4 for a poison with Potent Poisoner),
// unless its sentence is its user's own save ("you must attempt", "the drinker attempts"). Read as the link is drawn, and again as it's
// clicked, so it's its user's DC as it is then.

const SAVES = new Set(["fortitude", "reflex", "will"]);
// (The words before the link in its sentence: the item's user is the one who attempts it.)
const OWN_SUBJECT = /(?:^|[,;:]\s*|\b(?:then|and|or)\s+)(?:you|the (?:drinker|wearer|wielder|user|imbiber|bearer|holder|reader|eater)|its (?:user|wearer|wielder|drinker))\b(?![^,]*\bcreatures?\b)[^.!?]*$/i;
const OWN_PHRASE = /\b(?:you|the drinker|the wearer|its user)\s+(?:must\s+|can\s+|then\s+)?(?:attempt|succeed|roll|make)s?\b[^.!?]*$/i;
export const isOwnSaveWords = (before = "") => {
    const sentence = String(before ?? "").split(/(?<=[.!?])\s+/).pop() ?? "";
    return OWN_PHRASE.test(sentence) || (OWN_SUBJECT.test(sentence) && /\b(?:attempt|succeed|roll|save)\b/i.test(sentence));
};

// A link's DC under the setting → { dc, which } when it's raised, else null. Pure.
// (check: PF2e's data-pf2-check; dc: its data-pf2-dc; before: its sentence's words up to it; dcs: ownerDCsOf(user); plus: Potent Poisoner's +4.)
export function inlineDCFor({ check, dc, before = "", dcs = {}, plus = 0 }) {
    const from = Number(dc);
    if (!SAVES.has(String(check ?? "").toLowerCase()) || !Number.isFinite(from) || from <= 0 || isOwnSaveWords(before)) return null;
    const best = [["class", Number(dcs.class)], ["spell", Number(dcs.spell)]].filter(([, value]) => Number.isFinite(value) && value > 0).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const to = Math.max(from, best[1]) + (Number(plus) || 0);
    return to > from ? { dc: to, which: best[0], from } : null;
}

const PHYSICAL = new Set(["armor", "backpack", "book", "consumable", "equipment", "shield", "treasure", "weapon"]);
const itemOfLink = (link) => {
    try {
        return link?.dataset?.itemUuid ? fromUuidSync(link.dataset.itemUuid) : null;
    } catch {
        return null;
    }
};
// (The words of the link's block before it.)
const wordsBefore = (link) => {
    const block = link.closest("p, li, td, div") ?? link.parentElement;
    if (!block) return "";
    try {
        const range = document.createRange();
        range.setStart(block, 0);
        range.setEndBefore(link);
        return range.toString();
    } catch {
        return "";
    }
};

// One link: raised in place (its data-pf2-dc, the number in its label, a tooltip saying why). Its printed DC kept on it, so drawing it
// again starts from that.
// (fallback: the chat message's { actor, item } for an item gone since — a potion's last dose, used up.)
export function raiseInlineLink(link, fallback = null) {
    if (!enabled() || !link?.dataset || link.dataset.against || !link.classList?.contains("inline-check")) return;
    const item = itemOfLink(link) ?? fallback?.item ?? null;
    const actor = item?.actor ?? fallback?.actor ?? null;
    if (!item || !actor || !(item.isOfType?.("physical") ?? PHYSICAL.has(item.type))) return;
    const printed = link.dataset.airPrintedDc ?? link.dataset.pf2Dc;
    const plus = isPoison(item) && hasFeature(actor, "potent-poisoner") ? 4 : 0;
    const raised = inlineDCFor({ check: link.dataset.pf2Check, dc: printed, before: wordsBefore(link), dcs: ownerDCsOf(actor), plus });
    if (!raised) return;
    const shown = link.dataset.pf2Dc;
    link.dataset.airPrintedDc = String(printed);
    link.dataset.pf2Dc = String(raised.dc);
    const label = link.querySelector("span.label");
    if (label && shown !== String(raised.dc)) label.innerHTML = label.innerHTML.replace(new RegExp(`\\b${shown}\\b`), String(raised.dc));
    link.dataset.tooltip = `DC ${raised.dc}: ${actor.name}'s ${raised.which} DC${plus ? " + 4 (Potent Poisoner)" : ""}, over the item's own ${raised.from} (Item DCs from their user).`;
}
const raiseAll = (root, fallback = null) => {
    const element = root instanceof HTMLElement ? root : root?.[0];
    if (!element?.querySelectorAll) return;
    for (const link of element.querySelectorAll("a.inline-check[data-item-uuid][data-pf2-dc]")) {
        try {
            raiseInlineLink(link, fallback);
        } catch (error) {
            console.error(`${MODULE_ID} | item DC link`, error);
        }
    }
};

export function setUpInlineDCs() {
    // (A chat card's item gone since — used up: the one its message names, as PF2e posted it, and its speaker.)
    Hooks.on("renderChatMessageHTML", (message, html) => {
        const origin = message?.flags?.pf2e?.origin;
        const fallback = message?.actor && origin?.type && PHYSICAL.has(origin.type) ? { actor: message.actor, item: { type: origin.type, system: message.item?.system ?? {} } } : null;
        raiseAll(html, fallback);
    });
    for (const hook of ["renderItemSheet", "renderActorSheet", "renderJournalPageSheet"]) Hooks.on(hook, (app, html) => raiseAll(html));
    // (And as it's clicked, before PF2e's own listener reads it: any link drawn elsewhere — a tooltip, a sheet section drawn later.)
    document.addEventListener("click", (event) => {
        const link = event.target?.closest?.("a.inline-check[data-item-uuid][data-pf2-dc]");
        if (link) raiseInlineLink(link);
    }, true);
}
