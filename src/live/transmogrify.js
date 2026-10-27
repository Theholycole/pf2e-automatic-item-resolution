// Transmogrifying mutagens (2026-10-27, src/compiler/relic-readings.js plan.transmogrify: Philosopher's Extractor's Essence Transmogrification).
// Made: up to 10 at once from the body of the creature its user targets, each a consumable in its user's inventory flagged with that
// creature (flags.<module>.transmogrify { creature }). Drunk: the GM picks one of that creature's abilities on the card — a sense, a Speed,
// an immunity or resistance, or one of its own actions and abilities (its spells and spellcasting never listed) —, given to the drinker for
// 1 hour by an Effect: PF2e's own rule for a sense, Speed, immunity or resistance, or a copy of the action on the drinker for as long as the
// Effect lasts, its DCs the drinker's class DC or spell DC, the higher. Another mutagen of the same creature while one is active: one more
// ability, and every Effect of that creature an hour longer; drunk while any is active, a flat check against the number of active ones
// (this one counted) — failed, the drinker turns into that creature, the GM's to play (a note Effect, the card's line). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isTransmogrify = (plan) => plan?.builtin === "transmogrify" && Boolean(plan.transmogrify);

// The mutagen's item: a consumable drunk with an Interact action, flagged with its creature { uuid, name, level, traits, img }.
export function mutagenSource(creature, { count = 1, level = 0, moduleId = "pf2e-automatic-item-resolution", from = "Philosopher's Extractor" } = {}) {
    return {
        name: `Transmogrifying Mutagen (${creature.name})`,
        type: "consumable",
        img: "icons/consumables/potions/potion-tube-corked-bubbling-green.webp",
        flags: { [moduleId]: { transmogrify: { creature, from } } },
        system: {
            category: "mutagen",
            quantity: Math.max(1, Math.min(10, Number(count) || 1)),
            uses: { value: 1, max: 1, autoDestroy: true },
            level: { value: Number(level) || 0 },
            traits: { value: ["alchemical", "consumable", "elixir", "mutagen"], rarity: "unique" },
            description: { value: `<p><strong>Activate</strong> <span class="action-glyph">A</span> (manipulate)</p><hr /><p>Made by ${escape(from)} from a ${escape(creature.name)}. Drinking it gives one of that creature's abilities based on its physiology, picked by the GM, for 1 hour; it uses your class DC or spell DC (whichever is higher). Another made from the same kind of creature adds one more ability and an hour to them all; drunk while another is active, a flat check against the number active, or you turn into that creature.</p>` }
        }
    };
}

// The creature's abilities a mutagen can give, from its actor's data: [{ kind, label, ... }] — senses, Speeds, immunities, resistances,
// and its actions and abilities (not spells, nor a spellcasting entry).
const SPELLISH = /\b(?:spells?|spellcasting|rituals?)\b/i;
export function abilityChoices(creature) {
    const out = [];
    for (const sense of creature?.senses ?? []) out.push({ kind: "sense", label: `${sense.label ?? sense.type}${sense.acuity && sense.acuity !== "precise" ? ` (${sense.acuity})` : ""}${Number(sense.range) > 0 && Number.isFinite(Number(sense.range)) ? ` ${sense.range} feet` : ""}`, selector: sense.type, acuity: sense.acuity ?? null, range: Number.isFinite(Number(sense.range)) ? Number(sense.range) : null });
    for (const [type, value] of Object.entries(creature?.speeds ?? {})) if (type !== "land" && Number(value) > 0) out.push({ kind: "speed", label: `${type} Speed ${value} feet`, selector: type, value: Number(value) });
    for (const type of creature?.immunities ?? []) out.push({ kind: "immunity", label: `immunity to ${type}`, type });
    for (const { type, value } of creature?.resistances ?? []) out.push({ kind: "resistance", label: `resistance ${value} to ${type}`, type, value: Number(value) });
    for (const action of creature?.actions ?? []) if (!SPELLISH.test(action.name) && action.type !== "spell" && action.type !== "spellcastingEntry") out.push({ kind: "action", label: action.name, uuid: action.uuid, id: action.id });
    return out;
}

// The Effect's rules for an ability that's PF2e's own (an action's is a copy instead: none).
export function abilityRules(choice) {
    if (choice?.kind === "sense") return [{ key: "Sense", selector: choice.selector, ...(choice.acuity ? { acuity: choice.acuity } : {}), ...(Number.isFinite(choice.range) && choice.range > 0 ? { range: choice.range } : {}) }];
    if (choice?.kind === "speed") return [{ key: "BaseSpeed", selector: choice.selector, value: choice.value }];
    if (choice?.kind === "immunity") return [{ key: "Immunity", type: choice.type }];
    if (choice?.kind === "resistance") return [{ key: "Resistance", type: choice.type, value: choice.value }];
    return [];
}

// An action's copy with the drinker's DC: each inline check's dc and each "DC N" in its words.
export function withOwnDC(html, dc) {
    if (!Number.isFinite(Number(dc))) return String(html ?? "");
    return String(html ?? "").replace(/(@Check\[[^\]]*?\bdc:)\d+/gi, `$1${dc}`).replace(/\bDC \d+\b/g, `DC ${dc}`);
}

// The flat check when another mutagen is active: its DC, the number active with this one. none: no other active, no check.
export const transformDC = (active) => (Number(active) > 0 ? Number(active) + 1 : null);

// The card: the make step's (the creature targeted, how many) or the drink step's (the GM's pick of an ability).
export function createTransmogrifyCard({ plan, item, user, creature = null, choices = [], active = 0, sameKind = 0 }) {
    return { kind: "transmogrify", status: "open", plan, item, user, creature, choices, pick: 0, count: 1, active, sameKind, results: [] };
}

export function transmogrifyCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const step = state.plan.transmogrify.step;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    let body;
    let button;
    if (step === "make") {
        body = `<p class="aar-actions">Transmogrifying mutagens from the body of the creature targeted (at least two-thirds of it), up to ${state.plan.transmogrify.most} at once if there's enough of it.</p>${open && canApply ? `<p class="aar-actions">How many: <input type="number" min="1" max="${state.plan.transmogrify.most}" step="1" data-air-field="count" value="${escape(state.count ?? 1)}"></p>` : ""}`;
        button = "Make them";
    } else {
        const pick = !state.choices.length ? `<p class="aar-hint">${escape(state.creature?.name ?? "The creature")} wasn't found: the GM gives its ability by hand.</p>`
            : open && canApply ? `<p class="aar-actions">The GM picks its ability: <select data-air-field="pick">${state.choices.map((choice, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select></p>`
                : `<p class="aar-hint">The GM picks which of ${escape(state.creature?.name ?? "its creature")}'s abilities it gives.</p>`;
        const check = transformDC(state.active) ? `<p class="aar-hint">Another is active: a DC ${transformDC(state.active)} flat check as it's drunk${state.sameKind ? `, and ${state.creature?.name ?? "that creature"}'s abilities last an hour longer` : ""}.</p>` : "";
        body = `<p class="aar-actions">${escape(state.user.name)} gains one of ${escape(state.creature?.name ?? "its creature")}'s abilities for 1 hour, its DCs ${escape(state.user.name)}'s class or spell DC, the higher.</p>${pick}${check}`;
        button = "Give it";
    }
    const ready = step === "make" || state.choices.length;
    // (The drink step's Apply is the GM's: a player's press is refused on the GM's client.)
    const controls = open && canApply && ready ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${button}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${step === "make" ? `${escape(state.user.name)}'s player or ` : ""}the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${step === "make" ? "mutagens made" : "mutagen drunk"}</span></header>${body}${notes}${results}${controls}</section>`;
}

// The drink step's plan, from the mutagen's flag.
export function mutagenPlan(flag) {
    return { builtin: "transmogrify", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, transmogrify: { step: "drink", creature: flag?.creature ?? null, lasts: { value: 1, unit: "hours" } }, source: { name: `Transmogrifying Mutagen (${flag?.creature?.name ?? "creature"})` } };
}
