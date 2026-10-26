// An item that moves or changes another item of its user's, or itself (2026-10-25, docs/needs.md "Objects and the item itself"): the objects
// card (builtin "objects", src/live/objects-card.js, scripts/objects.js) — what it does to which of its user's items, picked on the card:
// - store: Retrieval Belt's "One item you're holding with a Bulk of 1 or less vanishes into the belt's extradimensional space" (the belt a
//   PF2e container: the item in it);
// - retrieve: "The item stored in the belt appears in your hand" (out of it, held);
// - hand: an item to its user's hand — itself (Lady's Knife's "The lady's knife instantly teleports to your hand", Blackaxe's "appears in your
//   hands"), or one picked (Retrieval Prism's attuned item "of 1 Bulk or less", Called's item);
// - don: Crushing Coils' "The armor wraps around you, allowing you to don it" (itself worn);
// - repair: The Forge's "restore the object to its full Hit Point total, removing the broken condition" (one of its user's of up to 4 Bulk).
// Its other rule sentences are notes. Pure.

const BULK = (words) => (/^light$/i.test(words) ? 0.1 : /^negligible$/i.test(words) ? 0 : Number(words));
const STORE = /\bOne item you(?:'re| are) holding with a Bulk of (\d+|light) or less vanishes into the [\w' -]+?(?:'s)? extradimensional space\b/i;
const RETRIEVE = /\bThe item stored in the [\w' -]+? appears in your hand\b/i;
const SELF_HAND = (name) => new RegExp(String.raw`\b(?:The )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s*\([^)]*\)$/, "")} (?:instantly )?(?:teleports to your hand|appears in your hands?)\b`, "i");
const PICKED_HAND = /\b(?:the attuned item|any item in your possession of (\d+|light) Bulk or less) (?:immediately |instantly )?teleports into your hand\b|\bThe item teleports to a free hand\b/i;
const ATTUNED_BULK = /\battune it to a single item of (\d+|light) Bulk or less\b/i;
const DON = /\bThe armor wraps around you, allowing you to don it\b/i;
const REPAIR = /\brestore the object to its full Hit Point total, removing the broken condition\b/i;
const REPAIR_BULK = /\bobject \([^)]*\) of up to (\d+) Bulk\b|\bobject[^.]*?of up to (\d+) Bulk\b/i;
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|damage|condition|can't be activated again|can be activated again|can't Retrieve Item again)\b/i;
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// The activation's plain text (from its Effect on), the item's name and type, the item's whole text → { op, maxBulk?, self?, said } or null.
export function readObjects(body, { name = "", type = null, whole = "" } = {}) {
    const text = String(body ?? "");
    const store = STORE.exec(text);
    if (store && type === "backpack") return { op: "store", maxBulk: BULK(store[1]), said: store[0] };
    if (RETRIEVE.test(text) && type === "backpack") return { op: "retrieve", said: RETRIEVE.exec(text)[0] };
    if (name && SELF_HAND(name).test(text)) return { op: "hand", self: true, said: SELF_HAND(name).exec(text)[0] };
    const picked = PICKED_HAND.exec(text);
    if (picked) {
        const bulk = picked[1] ?? ATTUNED_BULK.exec(String(whole ?? ""))?.[1] ?? null;
        return { op: "hand", ...(bulk !== null ? { maxBulk: BULK(bulk) } : {}), said: picked[0] };
    }
    if (DON.test(text)) return { op: "don", self: true, said: DON.exec(text)[0] };
    if (REPAIR.test(text)) {
        const bulk = REPAIR_BULK.exec(text);
        return { op: "repair", ...(bulk ? { maxBulk: Number(bulk[1] ?? bulk[2]) } : {}), said: REPAIR.exec(text)[0] };
    }
    return null;
}

// The activation's (or the item's) html, its base, the item → the objects card's plan, or null.
export function objectsPlan(html, base, item = {}) {
    const plain = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const body = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const whole = String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const read = readObjects(body, { name: item?.name ?? "", type: item?.type ?? null, whole });
    if (!read) return null;
    const notes = SENTENCES(body).filter((sentence) => !sentence.includes(read.said) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence));
    const { said, ...objects } = read;
    return {
        ...base,
        builtin: "objects",
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        objects,
        ...(notes.length ? { notes, partial: true } : {})
    };
}
