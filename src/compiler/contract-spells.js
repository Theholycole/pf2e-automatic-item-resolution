// A contract that casts the spells its signer selected (2026-10-27, docs/needs.md "spells"; the user's of the same day: a unique item's or an
// artifact's effects all built): Limitless Power's "When you gain this contract, select … a common divine cantrip, and one common divine spell
// of each spell rank except 10th" and its Unleash Power, "The contract casts one of the selected spells (spell attack modifier +30, DC 40). The
// contract can cast each non-cantrip spell only once per day. You use the same number of actions for this activation as the selected spell
// normally takes". The cast card (builtin "cast-spell") with every common divine cantrip (at a rank of half the item's level rounded up, 10th
// at most) and every common divine spell of 1st to 9th rank at its own rank, its DC and attack; plan.contract { slots, oncePerDay } — the
// first cast of each slot records the signer's selection on the item, after which that slot offers only it, and a non-cantrip cast today is
// left out until the next day (scripts/casts.js, src/live/contract-spells.js). Pure.

const isCantrip = (spell) => (spell.traits ?? []).includes("cantrip") && !(spell.traits ?? []).includes("focus");
const byName = (a, b) => a.name.localeCompare(b.name);

// The reading's matches (src/compiler/whole-artifacts.js), the item's whole text, options.spells and its item part → the cast card, or null.
export function contractSpellsOf([cast], item, spells, info) {
    const selection = /\bselect one weapon in your possession, an? (common) (divine) cantrip, and one common divine spell of each spell rank except 10th\b/i.exec(String(item ?? ""));
    const list = Object.values(spells ?? {});
    if (!selection || !list.length) return null;
    const [rarity, tradition] = [selection[1].toLowerCase(), selection[2].toLowerCase()];
    const fits = (spell) => spell.rarity === rarity && (spell.traditions ?? []).includes(tradition) && !spell.ritual;
    const cantripRank = Math.min(10, Math.max(1, Math.ceil((Number(info?.level) || 0) / 2)));
    const choiceOf = (spell, rank, slot) => ({ spell: { uuid: spell.uuid, name: spell.name }, rank, slot, area: spell.area, targets: spell.targets && /\b(?:creature|ally|enemy|you)\b/i.test(spell.target ?? "") });
    const cantrips = list.filter((spell) => fits(spell) && isCantrip(spell)).sort(byName).map((spell) => choiceOf(spell, cantripRank, "cantrip"));
    const ranked = [];
    for (let rank = 1; rank <= 9; rank++) ranked.push(...list.filter((spell) => fits(spell) && !isCantrip(spell) && spell.rank === rank && !(spell.traits ?? []).includes("focus")).sort(byName).map((spell) => choiceOf(spell, rank, String(rank))));
    const choices = [...cantrips, ...ranked];
    if (choices.length < 10) return null;
    return {
        builtin: "cast-spell",
        targeting: { target: null, range: null, area: null },
        spell: choices[0].spell,
        rank: choices[0].rank,
        dc: Number(cast[2]),
        attack: Number(cast[1]),
        tradition,
        self: false,
        area: choices.every((choice) => choice.area),
        targets: choices.some((choice) => choice.targets),
        choices,
        contract: { slots: ["cantrip", "1", "2", "3", "4", "5", "6", "7", "8", "9"], oncePerDay: "non-cantrip" },
        castLines: ["Its spells are the ones its signer selected on gaining it — a cantrip and one spell of each rank, 1st to 9th: the first cast of each records it, and after that only it is offered", "Each non-cantrip once a day (one cast today isn't offered until the next)", "The activation takes as many actions as the spell does"],
        notes: ["Once a day the devil holding the contract may have a spell its user casts with it target them instead, or centre its area on them (the GM's call)"],
        item: { ...info }
    };
}
