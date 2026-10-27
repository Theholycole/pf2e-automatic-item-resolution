// Curses that bind a mind (2026-10-27, docs/needs.md "afflictions"), the user's rulings for minds and out of combat — a note Effect on whom
// it binds, the rest lines of the card:
// - Rose of Loves Lost's "If the target accepts the gift, they must succeed at a DC 27 Will save or be affected by Charm with an unlimited
//   duration. Every 24 hours, the victim attempts another Will save to break the spell. If they fail three consecutive Will saves, they become
//   Doomed 1 …" → the save card at the creature given it; on a failure Charm's own (its attitude Friendly toward the giver, PF2e's attitude
//   condition granted by the note Effect; Helpful if it was Friendly; no hostile actions against the giver) with no end, the daily saves and
//   the wasting doom in its words (out of combat, the GM's).
// - Tablet of Chained Souls' Spirit Carving, "The tablet's words resolve into a cryptic but accurate clue about the spirit's unfinished business.
//   Upon reading the tablet's words, you're subject to a Geas that requires you to right that wrong and lay the ghost to rest. If you die without
//   completing the task, you become a ghost …" → the clue a line of the card (the GM's to give), the Geas a note Effect on its user with no end:
//   the ritual's Sickened while it's kept from its task, and the ghost it becomes if it dies first. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const ROSE = [
    /^Activate\s*(?:\[[^\]]*\]\s*)?(?:1\s*)?\(manipulate\) No thorns are visible on this ruby-red crystal rose, which seems to grant a boon to a loved one, but it draws three beads of blood when first bestowed upon an unwitting recipient\./i,
    /^Hags delight in using the rose's curse to ruin young lovers, but it can be found anywhere\s*[-–—]\s*even buried innocently in a treasure hoard\./i,
    /^You activate the rose of loves lost by giving it to someone toward whom you feel romantic attraction\./i,
    /^This item functions only if you feel genuine attraction and desire, and it doesn't function if you know the item's curse\./i,
    /^If the target accepts the gift, they must succeed at a @Check\[will\|dc:(\d+)[^\]]*\] save or be affected by Charm with an unlimited duration\./i,
    /^Every 24 hours, the victim attempts another Will save to break the spell\./i,
    /^If they fail three consecutive Will saves, they become Doomed 1, as the rose inflicts a lethal wasting disease\./i,
    /^This value can't decrease while the curse continues\./i,
    /^Instead, it worsens every 3 days the victim fails to break the rose's spell, until the victim either dies or shakes off the curse\./i,
    /^A successful saving throw or Cleanse Affliction \(of 4th rank or higher\) ends the charm and enables the victim to begin decreasing their doomed value\./i
];
const FRIENDLY = "Compendium.pf2e.conditionitems.Item.v66R7FdOf11l94im";
const TABLET = /^Effect You present the tablet to a ghost or lay it on a haunted site\. The tablet's words resolve into a cryptic but accurate clue about the spirit's unfinished business\. Upon reading the tablet's words, you're subject to a Geas that requires you to right that wrong and lay the ghost to rest\. If you die without completing the task, you become a ghost, cursed to remain until another recovers the tablet and discharges your duty\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// Each pattern in turn from the start of the text → the matches, or null when anything's left over.
function readAll(text, patterns) {
    let rest = String(text ?? "").trim();
    const found = [];
    for (const pattern of patterns) {
        const match = pattern.exec(rest);
        if (!match) return null;
        found.push(match);
        rest = rest.slice(match[0].length).trim();
    }
    return rest ? null : found;
}

// A consumable's plan, its html and its base plan → the rose's save card, or the same plan.
export function withRoseCurse(plan, html, base = null) {
    const found = !plan && base ? readAll(plainText(html), ROSE) : null;
    if (!found) return plan;
    const dc = Number(found[4][1]);
    const charmed = { ...none(), noteEffects: [{ label: "Charmed by the rose", text: `As Charm with no end: Friendly toward the one who gave it the rose (Helpful if it already was), and it can't use hostile actions against them. Every 24 hours it attempts another DC ${dc} Will save to break it; after three failures in a row it's Doomed 1 (a wasting disease), which can't decrease while the curse lasts and rises by 1 every 3 days it fails to break free, until it dies or shakes off the curse. A successful save, or Cleanse Affliction of rank 4 or higher, ends the charm; then its Doomed can decrease.`, duration: null, rules: [{ key: "GrantItem", uuid: FRIENDLY, inMemoryOnly: true }] }] };
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: "touch", area: null },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: charmed, criticalFailure: charmed } },
        notes: ["Given to someone its giver feels real romantic attraction to, who accepts it; it does nothing if its giver knows its curse."],
        item: { ...(base.item ?? {}), recipient: "user" }
    };
}

// An activation's plan (none read) and its entry → the Geas's note Effect and the clue's line, or the same plan.
export function withTabletGeas(plan, item, entry) {
    const text = plainText(entry?.activation?.html).replace(/^.*?(?=\bEffect\b)/s, "").trim();
    if (plan || !TABLET.test(text)) return plan;
    const activation = entry.activation;
    const geas = { label: "Geas: lay the ghost to rest", text: "Bound by a Geas to right the spirit's wrong and lay the ghost to rest: each day it's kept from that task it's Sickened 1 more (up to 4), gone once it takes up the task again. If it dies before it's done, it becomes a ghost until another takes up the tablet and its duty.", duration: null };
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${item.name}${activation.name ? `: ${activation.name}` : ""}`, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits: [...(item.system?.traits?.value ?? [])],
        activation: { time: activation.time ?? null, traits: activation.traits ?? [] },
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(activation.frequency?.max ? { frequency: activation.frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [geas] } } },
        notes: ["Shown a ghost or laid on a haunted site, the tablet gives a cryptic but accurate clue to the spirit's unfinished business: the GM's to tell."],
        item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: "user", activation: { index: entry.index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }, links: 0 }
    };
}
