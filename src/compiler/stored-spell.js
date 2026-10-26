// A spell an item holds for later (2026-10-26, docs/needs.md "Spells and the user's resources" — "stored spell"): Furnace of Endings' "you
// can immolate a scroll containing a 1st-rank spell with the fire or void trait that takes no more than three actions to cast. Doing so stores
// the scroll's magic … You cast the stored spell as if you were activating the scroll", Spell Bastion's spell cast into the shield and
// unleashed at the attacker its Shield Block was against, Ring of Counterspells' and Spell Bastion's "You harmlessly expend the stored spell".
// The objects card (builtin "objects"): op "cast-stored" — with a spell held, it's cast through the spell module (its user's targets), the
// item emptied; with none, the card picks what to store (its user's spells, or scrolls, that fit) —, op "ready-stored" (an Effect on its
// user to the start of its next turn) and op "expend-stored", the item emptied. Storing a spell from a slot leaves the slot and the casting time to its user (a line of the card); a scroll is burned. Pure.

const RANKS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const COUNT = { one: 1, two: 2, three: 3 };
const numberOf = (words) => COUNT[String(words).toLowerCase()] ?? RANKS[String(words).toLowerCase()] ?? Number(words);

// The item's whole text → what it can store: { from: "scroll" | "cast", maxRank?, traits?, maxActions?, otherTarget? } or null.
const SCROLL = /\bimmolate a scroll containing an? (\d+)(?:st|nd|rd|th)-rank spell(?: or lower)? with the (\w+) or (\w+) trait that takes no more than (\w+) actions to cast\b/i;
const CAST_INTO = /\bA spellcaster can (?:spend 1 minute to )?(?:@UUID\[[^\]]*\]\{)?[Cc]ast (?:a|a single) [Ss]pell\}?(?: of (\d+)(?:st|nd|rd|th) (?:rank|level) or lower)? into (?:this|the) [\w-]+\b/i;
const ACTIONS = /\bThe spell must (?:require|take) (\d|one|two|three) actions? or fewer\b/i;
const OTHER = /\bmust be able to target a creature other than the caster\b/i;
// (One cantrip, not one cast as a free action or a reaction, Archaic Wayfinder's "acts as a repository for one cantrip cast into it".)
const CANTRIP = /\bacts as a repository for one cantrip cast into it\b/i;
const NOT_FREE = /\bthe spell cannot be one that is normally cast as a free action or reaction\b/i;
export function readStore(whole) {
    const text = String(whole ?? "");
    if (CANTRIP.test(text)) return { from: "cast", cantrip: true, ...(NOT_FREE.test(text) ? { maxActions: 3 } : {}) };
    const scroll = SCROLL.exec(text);
    if (scroll) return { from: "scroll", maxRank: Number(scroll[1]), traits: [scroll[2].toLowerCase(), scroll[3].toLowerCase()], maxActions: numberOf(scroll[4]) };
    const cast = CAST_INTO.exec(text);
    if (!cast) return null;
    const actions = ACTIONS.exec(text);
    return { from: "cast", ...(cast[1] ? { maxRank: Number(cast[1]) } : {}), ...(actions ? { maxActions: numberOf(actions[1]) } : {}), ...(OTHER.test(text) ? { otherTarget: true } : {}) };
}

const CAST = /^You cast the stored spell as if you were activating the scroll\.$|^Activating an? [\w' -]+? is the same as the casting for the relevant spell\.$/i;
const EMPTY_AFTER = /^Once it has been activated, it becomes empty again\.$/i;
const UNLEASH = /^You unleash the stored spell, which uses the target of the triggering attack as the target of the spell\./i;
const EXPEND = /^(?:You )?[Hh]armlessly expend the stored spell\b/;
// (Its use readied first, Spell Bastion's "You prepare to unleash the stored spell on any foe that hits you until your next turn": an Effect on
// its user to the start of its next turn, refused with nothing stored.)
const READY = /^You prepare to unleash the stored spell on any foe that hits you until your next turn\.$/i;
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// The activation's plain text (from its Effect on) and the item's whole text → { op, store, at?, said } or null.
export function readStoredSpell(body, whole) {
    const store = readStore(whole);
    if (!store) return null;
    for (const sentence of SENTENCES(body)) {
        if (CAST.test(sentence)) return { op: "cast-stored", store, said: [sentence, ...SENTENCES(body).filter((one) => EMPTY_AFTER.test(one))] };
        if (UNLEASH.test(sentence)) return { op: "cast-stored", store, at: "attacker", said: SENTENCES(body).filter((one) => UNLEASH.test(one) || /^This empties the spell from the [\w-]+ and allows a spell to be cast into it again\.$/i.test(one)) };
        if (READY.test(sentence)) return { op: "ready-stored", store, said: [sentence] };
        if (EXPEND.test(sentence)) return { op: "expend-stored", store, said: SENTENCES(body).filter((one) => EXPEND.test(one) || /^This frees the [\w-]+ to have a new spell cast into it\.$/i.test(one)) };
    }
    return null;
}

// Which of its user's spells or scrolls fit what it stores: a spell's { rank, actions, traits, target } (rank the base rank; actions 1–3, or
// none for a longer one).
export function storable(store, { rank, actions, traits = [], target = "" }) {
    // (A cantrip store takes cantrips only; the others, none.)
    if (Boolean(store.cantrip) !== traits.includes("cantrip")) return false;
    if (Number.isFinite(store.maxRank) && rank > store.maxRank) return false;
    if (Number.isFinite(store.maxActions) && !(actions >= 1 && actions <= store.maxActions)) return false;
    if (store.traits?.length && !store.traits.some((trait) => traits.includes(trait))) return false;
    if (store.otherTarget && (!target || /^you$/i.test(String(target).trim()))) return false;
    return true;
}
