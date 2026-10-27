// An item that casts one of a kind of PF2e's spells, its user's pick (2026-10-27, docs/needs.md "Spells and the user's resources"): the cast
// card (builtin "cast-spell", src/live/cast-card.js) with a choice of each such spell (options.spells, PF2e's spells by name):
// - Cantrip Deck's "The deck casts that cantrip as a 1st-rank spell, with a DC of 15 and a spell attack modifier of +5": the Full Pack's "one of
//   each cantrip in Player Core" (its 25 common cantrips), the 5-pack's "5 cards of a single common cantrip" (any common cantrip, the pack's the
//   user's to pick); "This activation takes the same number of actions as the cantrip you chose" and the card crumbling, lines of the card.
// - Mage's Hat (Greater)'s "a specific 4th-rank summon spell from the arcane list woven into its fabric, typically Summon Animal or Summon
//   Elemental" (its activation's "You cast the spell stored in the hat"): each arcane summon spell that can be cast at 4th rank, the typical
//   ones first.
// - Bleachguard Doll's "casts one of its available cantrips or spells" — "light (3rd rank), prestidigitation, and one other 3rd-rank cantrip,
//   along with one spell (at 3rd rank) that can be cast once per day … which can't require an attack roll or saving throw": Light and
//   Prestidigitation, then each common cantrip with neither for its other one, at 3rd rank. Its once-a-day spell is any of hundreds its
//   creator chose: a note, the plan partial.
// The plan castWordsPlan's (src/compiler/cast-words.js) shape; src/compiler/permanent.js and index.js take it where nothing else read a cast.
// Pure.

const DECK = /\bThe deck casts that cantrip as an? (\d+)(?:st|nd|rd|th)-rank spell, with a DC of (\d+) and a spell attack modifier of \+(\d+)\./i;
const DECK_LINES = [/^This activation takes the same number of actions as the cantrip\b[^.]*\.$/i, /^The card crumbles into dust\b[^.]*\.$/i];
const HAT = /\bhas a specific (\d+)(?:st|nd|rd|th)-rank summon spell from the (arcane|divine|occult|primal) list woven into its fabric, typically ([A-Z][\w' -]+?) or ([A-Z][\w' -]+?)\./;
const HAT_CAST = /\bYou cast the spell stored in the [\w' ]+?\./i;
const DOLL = /\bcan cast the cantrips ([a-z][\w' -]+?) \((\d+)(?:st|nd|rd|th) rank\), ([a-z][\w' -]+?), and one other (\d+)(?:st|nd|rd|th)-rank cantrip, along with one spell \(at \d+(?:st|nd|rd|th) rank\) that can be cast once per day\b/i;
const DOLL_CAST = /\bThe [\w' ]+? casts one of its available cantrips or spells\./i;

const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sentences = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).filter(Boolean);
const isCantrip = (spell) => spell.traits.includes("cantrip") && !spell.traits.includes("focus");
// (A target that's no creature — Light's "1 object" — isn't one to target first.)
const choiceOf = (spell, rank, extra = {}) => ({ spell: { uuid: spell.uuid, name: spell.name }, rank, area: spell.area, targets: spell.targets && /\b(?:creature|ally|enemy|you)\b/i.test(spell.target ?? ""), ...extra });
const byName = (a, b) => a.name.localeCompare(b.name);
const plan = (item, choices, { dc = null, attack = null, notes = [], castLines = [], partial = false } = {}) => ({
    builtin: "cast-spell",
    source: { name: item.name, uuid: item.uuid ?? null, slug: item.system?.slug ?? null },
    spell: choices[0].spell,
    rank: choices[0].rank,
    dc,
    attack,
    tradition: null,
    self: false,
    ...(notes.length ? { notes } : {}),
    area: choices.every((choice) => choice.area),
    targets: choices.some((choice) => choice.targets),
    choices,
    ...(castLines.length ? { castLines } : {}),
    ...(partial ? { partial: true, automation: { level: "guided" } } : {})
});

// part: the activation's item (its html the description), or the consumable; whole: the item's own text (a permanent item's, for what it
// says beside its activations); options.spells: PF2e's spells by name.
export function spellPickPlan(part, options = {}, whole = null) {
    const spells = Object.values(options.spells ?? {});
    if (!spells.length) return null;
    const text = plain(part?.system?.description?.value);
    const all = whole ? plain(whole) : text;
    const deck = DECK.exec(text);
    if (deck) {
        const core = /\bone of each cantrip in Player Core\b/i.test(text);
        const common = /\bcards? of a single common cantrip\b/i.test(text);
        if (!core && !common) return null;
        const list = spells.filter((spell) => isCantrip(spell) && spell.rarity === "common" && (!core || /^Pathfinder Player Core$/.test(spell.book ?? ""))).sort(byName);
        if (list.length < 2) return null;
        const castLines = sentences(text).filter((sentence) => DECK_LINES.some((pattern) => pattern.test(sentence)));
        return plan(part, list.map((spell) => choiceOf(spell, Number(deck[1]))), { dc: Number(deck[2]), attack: Number(deck[3]), castLines });
    }
    const hat = HAT_CAST.test(text) ? HAT.exec(all) : null;
    if (hat) {
        const rank = Number(hat[1]);
        const typical = [hat[3], hat[4]].map((name) => name.toLowerCase());
        const list = spells.filter((spell) => spell.traits.includes("summon") && !spell.traits.includes("focus") && !spell.ritual && spell.traditions.includes(hat[2]) && Number(spell.rank) <= rank)
            .sort((a, b) => (typical.includes(b.name.toLowerCase()) - typical.includes(a.name.toLowerCase())) || byName(a, b));
        if (list.length < 2 || !typical.every((name) => list.some((spell) => spell.name.toLowerCase() === name))) return null;
        return plan(part, list.map((spell) => choiceOf(spell, rank)), { castLines: [`The hat's spell is the one woven into it, typically ${hat[3]} or ${hat[4]}: its user picks it on the card.`] });
    }
    const doll = DOLL_CAST.test(text) ? DOLL.exec(all) : null;
    if (doll) {
        const rank = Number(doll[2]);
        const named = [doll[1], doll[3]].map((name) => spells.find((spell) => spell.name.toLowerCase() === name.toLowerCase()));
        if (named.some((spell) => !spell)) return null;
        // (Its other cantrip: one with no attack roll or saving throw, as its creator must choose.)
        const others = spells.filter((spell) => isCantrip(spell) && spell.rarity === "common" && !spell.save && !spell.traits.includes("attack") && !named.includes(spell)).sort(byName);
        // (Light at its rank, Prestidigitation at its caster's cantrip rank — the text gives it none.)
        const choices = [choiceOf(named[0], rank), choiceOf(named[1], null), ...others.map((spell) => choiceOf(spell, Number(doll[4]), { when: "its other cantrip" }))];
        return plan(part, choices, { notes: [`Its once-a-day spell, at rank ${rank}, is the one its creator chose (no attack roll or save): not one of these.`], partial: true });
    }
    return null;
}
