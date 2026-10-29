// A consumable used as part of its user's own move (2026-10-28, docs/needs.md "Moving creatures and the user"), the installed modules' plants:
//   SWIM   Buoyant Hyacinth (Lesser): activated with a Swim, which it lengthens by 5 feet; underwater its user rises 30 feet as each of its turns
//          ends (an Interact pauses or restarts it), for up to 10 minutes or until it stops swimming. PF2e's Swim action card (scripts/item-
//          actions.js, as before), and the rest words on its user's note Effect for those minutes (plan.userEffects, the user's ruling 1) —
//          the rising is the map's, as Bracelet of Buoyancy's Float is.
//   CRAWL  Surfing Grass: activated with a Crawl, 10 feet longer, its user then free to stand. The move card for the longer Crawl (plan.item.move,
//          the teleport card's own move within 15 feet, beside the item card — scripts/live.js), and the item card's Prone removed when its
//          user applies it (plan.item.reduce, as read before): standing is its user's choice, the card's button.
//   SHOVE  Splitting Tree Splatter's grades: activated with a Shove (its Athletics modifier the higher of its user's and the flower's, its
//          user's own with an item bonus — the Shove card's minimum, read before); a creature shoved against a barrier or an object is stuck
//          there, Off-Guard until it moves off that surface or spends an Interact on the sap. The Shove's success rows get a note Effect on
//          the creature granting PF2e's Off-Guard until it's deleted (as it moves away or pulls free); whether the shove met a surface is the
//          map's — its words on that note: deleted at once when it met none.
// Every sentence of the item one of these, its flavour none: else the plan as it was. Their words stay theirs: the regexes split by \s+. Pure.

import { sentencesOf } from "./lasting.js";

// (Its flavour after the activation's own words, "Activate Swim": no rule word in it.)
const flavour = (verb) => new RegExp(String.raw`^Activate ${verb} (?:This|These) (?:(?!\b(?:bonus|penalty|feet|DC|check|damage)\b)[^.\d])*\.$`, "i");
const SWIM = /^You can Activate this item as\s+part of your Swim action, and\s+you increase the distance\s+you Swim by (\d+) feet\.$/i;
const RISE = /^If you are underwater, you rise (\d+) feet at the\s+end of each of your turns, though\s+you can suppress and resume\b[^.]*\bInteract\b[^.]*\.$/i;
const LASTS = /^This effect lasts up to (\d+) (minutes?|hours?) or until you\s+are no longer swimming, whichever\s+comes first\.$/i;
const CRAWL_PART = /^You can Activate the item as\s+part of your Crawl\b[^.]*\.$/i;
const CRAWL = /^You increase the distance you\s+move with your Crawl by (\d+) feet\.$/i;
const STAND = /^At the end of this movement, you\s+can choose to have the grass\s+push you to your feet, ending\s+the Prone condition\.$/i;
const SHOVE_PART = /^You can Activate the flower as\s+part of your Shove\b[^.]*\.$/i;
const SHOVE_AT = /^You can use a \+(\d+) Athletics modifier for your Shove\s+instead of your Athletics modifier\b[^.]*\.$/i;
const OWN_BONUS = /^If you use your own Athletics modifier\s+you gain a \+(\d+) item bonus to your check\.$/i;
const STUCK = /^If the creature makes contact with a\s+barrier or object, the globule\b[^.]*\bOff-Guard condition until the\s+target moves away\b[^.]*\bInteract\b[^.]*\.$/i;
// (PF2e's Off-Guard, granted while the note lasts.)
const OFF_GUARD = "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg";
const every = (sentences, patterns) => sentences.every((sentence) => patterns.some((pattern) => pattern.test(sentence)));
const found = (sentences, pattern) => sentences.map((sentence) => pattern.exec(sentence)).find(Boolean) ?? null;

// The Swim action's plan, the item's plain text → its user's note Effect beside it, or the same plan.
export function withBuoyedSwim(plan, text, name) {
    if (plan?.builtin !== "item-action" || plan.action?.slug !== "swim") return plan;
    const sentences = sentencesOf(text);
    const swim = found(sentences, SWIM);
    const rise = found(sentences, RISE);
    const lasts = found(sentences, LASTS);
    if (!swim || !rise || !lasts || !every(sentences, [flavour("Swim"), SWIM, RISE, LASTS])) return plan;
    const unit = /^min/i.test(lasts[2]) ? "minutes" : "hours";
    const note = { kind: "note", label: `${name}: afloat`, text: `Each Swim goes ${swim[1]} feet farther. Underwater, it floats up ${rise[1]} feet as each of its turns ends; an Interact action stops the rising or starts it again. It ends early once it's no longer swimming.`, duration: { mode: "fixed", value: Number(lasts[1]), unit, expiry: "turn-start", anchor: "effect-start" } };
    return { ...plan, automation: { level: "automatic" }, action: { ...plan.action, after: "" }, userEffects: [...(plan.userEffects ?? []), note], partial: undefined };
}

// The item card's plan (its Prone removed), the item's plain text → the longer Crawl's move card beside it, or the same plan.
export function withLongerCrawl(plan, text) {
    if (!plan?.resolution || plan.builtin || !(plan.reduce ?? plan.item?.reduce ?? []).some((entry) => entry.slug === "prone")) return plan;
    const sentences = sentencesOf(text);
    const crawl = found(sentences, CRAWL);
    if (!crawl || !found(sentences, CRAWL_PART) || !found(sentences, STAND) || !every(sentences, [flavour("Crawl"), CRAWL_PART, CRAWL, STAND])) return plan;
    // (PF2e's Crawl is 5 feet.)
    const within = 5 + Number(crawl[1]);
    const move = { within, from: "self", move: { verb: "Crawl", lines: ["Its user's Crawl, while Prone"] } };
    return {
        ...plan,
        automation: { level: "automatic" },
        notes: [`The move card takes the Crawl, ${within} feet with it (PF2e's 5 and ${crawl[1]} more); then apply this card to stand up, if its user chooses (no Prone).`],
        item: { ...(plan.item ?? {}), move },
        partial: undefined
    };
}

// The Shove action's plan, the item's plain text → its success rows' sap note, or the same plan.
export function withStickyShove(plan, text, name) {
    if (plan?.builtin !== "item-action" || plan.action?.slug !== "shove" || !plan.action.basic?.resolution?.outcomes) return plan;
    const sentences = sentencesOf(text);
    const at = found(sentences, SHOVE_AT);
    const own = found(sentences, OWN_BONUS);
    if (!at || !found(sentences, SHOVE_PART) || !found(sentences, STUCK) || !every(sentences, [flavour("Shove"), SHOVE_PART, SHOVE_AT, OWN_BONUS, STUCK])) return plan;
    // (The minimum and its own bonus the card reads already: the same numbers, or not this reading.)
    if (Number(plan.action.minimum?.value) !== Number(at[1]) || (own ? Number(plan.action.minimum?.ownBonus?.value) !== Number(own[1]) : Boolean(plan.action.minimum?.ownBonus))) return plan;
    const note = {
        label: `${name}: stuck`,
        text: "Shoved against a barrier or an object, it's stuck to it with sap: Off-Guard until it moves away from that surface or spends an Interact action to pull the sap off — delete this then. If the shove pressed it against nothing, delete this now (the map's).",
        duration: null,
        rules: [{ key: "GrantItem", uuid: OFF_GUARD, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }]
    };
    const outcomes = { ...plan.action.basic.resolution.outcomes };
    for (const degree of ["criticalSuccess", "success"]) outcomes[degree] = { ...outcomes[degree], noteEffects: [...(outcomes[degree]?.noteEffects ?? []), note] };
    return { ...plan, automation: { level: "automatic" }, action: { ...plan.action, after: "", basic: { ...plan.action.basic, resolution: { ...plan.action.basic.resolution, outcomes } } }, partial: undefined };
}
