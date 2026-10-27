// The Deck of Many Things (2026-10-27, src/compiler/relic-readings.js plan.deck): "You declare how many cards you will draw facedown from the
// deck, then draw your first card. … Any further cards must be drawn within the next hour, and any card you don't voluntarily draw flits off
// the deck and affects you anyway. You can never activate the same deck of many things again." Its cards are PF2e's own Deck of Many Things
// table (drawn with replacement, as the deck shuffles itself); each card drawn posts its own card when the readers find one (Throne's and
// Euryale's PF2e Effects, Moon's Wishes, Vizier's and the Void's whispers), and the deck's card plays what the table's words say of the
// draws and its user: the Fool's and the Jester's choice of XP or two more cards, the Dullard's extra card and lowered Intelligence, the
// Sun's 1,000 XP, the Gem's treasure, the Knight's loyal Palace Guard, Talons', Ruin's and Donjon's lost possessions (the GM's press), the
// Donjon and the Void ending the draws; the Jester and the Dullard gone from that deck for good. What's left is the GM's (the card's line).
// Pure: the deck's state and each card's rule.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isDeck = (plan) => plan?.builtin === "deck" && Boolean(plan.deck?.uuid);

// A drawn row's card name: "Fool. You lose …" → "Fool"; "Euryale (curse). A medusa's …" → "Euryale"; "The Fates. …" → "The Fates".
export const cardName = (text) => String(text ?? "").trim().split(/[.(]/)[0].trim();

// What the deck's card plays for each card, beside the card's own: xp (a formula, or a choice of it against two more draws), more draws,
// stop, gone (from this deck for good), treasure (a choice), ally (a creature beside its user), lose (its user's possessions, the GM's
// press), attribute (lowered), and the GM's words for the rest.
export const DECK_RULES = {
    Fool: { choice: [{ label: "Lose 1d10×100 XP", xp: "-1d10*100" }, { label: "Draw two more cards", more: 2 }] },
    Jester: { gone: true, choice: [{ label: "Gain 1d10×100 XP", xp: "1d10*100" }, { label: "Draw two more cards", more: 2 }] },
    Dullard: { gone: true, more: 1, attribute: { slug: "int", formula: "1d4+1" } },
    Sun: { xp: "1000", gm: "and a beneficial permanent magic item of 6th to 11th level, the GM's pick" },
    Comet: { gm: "if it alone defeats the next low-threat or harder foes it meets, enough XP to reach its next level (the GM's)" },
    Gem: { choice: [{ label: "25 pieces of jewelry worth 200 gp each", treasure: { name: "Jewelry (Deck of Many Things)", count: 25, gp: 200, category: "art-object" } }, { label: "50 gems worth 100 gp each", treasure: { name: "Gem (Deck of Many Things)", count: 50, gp: 100, category: "gem" } }] },
    Knight: { ally: { uuid: "Compendium.pf2e.pathfinder-npc-core.Actor.94fOoBeUT8PgTywH", name: "Palace Guard" } },
    Talons: { lose: "magic", gm: "every magic item it has is gone for good, but the deck and any artifact of a higher level than the deck" },
    Ruin: { lose: "nonmagic", gm: "every nonmagical possession it has is gone, its wealth and property too" },
    Donjon: { stop: true, lose: "all", gm: "imprisoned by a 10th-rank Imprisonment ritual (its prison, often in a distant part of the world: the GM's), all its items gone" },
    "The Void": { stop: true },
    Key: { gm: "a magic weapon of 12th level or higher, its runes the GM's pick" },
    Skull: { gm: "it must battle a Lesser Death at once (the GM places it); slain in that battle, only a deity can revive it" },
    Star: { gm: "an ability boost it must use at once, on an attribute it picks (its own sheet)" },
    Balance: { gm: "its alignment becomes a radically different one; failing to keep to it costs a level and that level's benefits (its XP stays)" },
    "The Fates": { gm: "once, whenever it chooses, the Fates undo any one event to save it alone, a past one too, even one that would slay it" },
    Flames: { gm: "a fiend comes to hate it until one of them dies, attacking or foiling it within 1d20 days" },
    Rogue: { gm: "one NPC ally turns against it for good, perhaps hiding that until the moment suits" }
};

// Whether the card drawn posts its own card too (Throne's and Euryale's Effects, Moon's Wishes, Vizier's and the Void's whispers): not one
// the deck's rule plays or leaves to the GM.
export const postsOwnCard = (name) => {
    const rule = DECK_RULES[name];
    return !rule || !(rule.choice || rule.xp || rule.lose || rule.ally || rule.attribute || rule.gm);
};

// The deck's state as it's posted. used: its user drew from it before (never again).
export function createDeckCard({ plan, item, user, used = false }) {
    return { kind: "deck", status: used ? "applied" : "open", step: "declare", plan, item, user, declared: 0, more: 0, drawn: [], deadline: null, choice: null, results: used ? [`${user.name} can never activate this deck again.`] : [] };
}

// Draws still to make: declared + extra − drawn (none once stopped).
export const drawsLeft = (state) => (state.stopped ? 0 : Math.max(0, (Number(state.declared) || 0) + (Number(state.more) || 0) - (state.drawn ?? []).length));

// The state after a card is drawn (its name): its extra draws and its stop; a choice waits for its user (step "choice").
export function afterDraw(state, name) {
    const rule = DECK_RULES[name] ?? {};
    const drawn = [...(state.drawn ?? []), name];
    const next = { ...state, drawn, more: (Number(state.more) || 0) + (Number(rule.more) || 0), stopped: Boolean(state.stopped || rule.stop) };
    if (rule.choice) return { ...next, step: "choice", choice: name };
    const then = drawsLeft(next) ? "draw" : "done";
    // (Its possessions lost first, the GM's press: then on.)
    if (rule.lose) return { ...next, step: "lose", losing: rule.lose, then, choice: null };
    return { ...next, step: then, choice: null };
}

// The state once the GM has removed what it lost.
export const afterLose = (state) => ({ ...state, step: state.then ?? (drawsLeft(state) ? "draw" : "done"), losing: null, then: null });

// What of its user's items it loses: [{ id, magical, level, artifact, physical }] → their ids. The deck itself is never among them; Talons
// keeps an artifact of a higher level than the deck.
export function lostItems(items, losing, { deckId, deckLevel = 0 }) {
    return (items ?? []).filter((item) => item.physical && item.id !== deckId && (losing === "all" || (losing === "magic" ? item.magical && !(item.artifact && Number(item.level) > Number(deckLevel)) : !item.magical))).map((item) => item.id);
}

// The state after its user's choice (its index) of the card waiting: two more draws, or none.
export function afterChoice(state, index) {
    const option = DECK_RULES[state.choice]?.choice?.[Number(index) || 0] ?? null;
    const next = { ...state, more: (Number(state.more) || 0) + (Number(option?.more) || 0), choice: null };
    return { ...next, step: drawsLeft(next) ? "draw" : "done" };
}

// Its Intelligence lowered: the legacy score's 1d4+1 as a modifier, half of it rounded down (at least 1) — the GM may change it.
export const attributeDrop = (rolled) => Math.max(1, Math.floor((Number(rolled) || 0) / 2));

export function deckCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const notes = open && state.step === "declare" && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const drawn = (state.drawn ?? []).length ? `<p class="aar-actions">Drawn: ${escape(state.drawn.join(", "))}${drawsLeft(state) ? `; ${drawsLeft(state)} more to draw${state.deadline ? " within the hour (any not drawn by then affects it anyway)" : ""}` : ""}.</p>` : "";
    let field = "";
    let button = "";
    if (open && canApply && state.step === "declare") {
        field = `<p class="aar-actions">Cards declared: <input type="number" min="1" max="22" step="1" data-air-field="count" value="1"></p>`;
        button = "Declare and draw the first";
    } else if (open && canApply && state.step === "choice") {
        const options = DECK_RULES[state.choice]?.choice ?? [];
        field = `<p class="aar-actions">${escape(state.choice)}: <select data-air-field="choice">${options.map((option, index) => `<option value="${index}">${escape(option.label)}</option>`).join("")}</select></p>`;
        button = "Choose";
    } else if (open && canApply && state.step === "draw") button = "Draw the next card";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    // (Its user's possessions lost, Talons', Ruin's, Donjon's: the GM's press.)
    if (open && canApply && state.step === "lose") button = "Remove them (the GM)";
    const controls = button ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${button}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${(state.drawn ?? []).length} of ${(Number(state.declared) || 0) + (Number(state.more) || 0) || "?"} cards</span></header>${notes}${drawn}${field}${results}${controls}</section>`;
}
