// The Strike card (src/compiler/strikes.js): an item used by Striking (Fear Gem, Duelist's Beacon, Mantle of the
// Tikbalang). Apply readies the user's next Strike this turn, an Effect that marks it — with PF2e's own rules for what
// the Strike adds (DamageDice, FlatModifier, DamageAlteration), so PF2e's rolls carry it; PF2e's attack roll then decides
// (scripts/strikes.js): a hit or a critical hit puts the riders for its degree on the target and posts the save the
// Strike calls for, and its damage roll spends it; a miss spends it. Pure; the ability module's classes.

import { saveText } from "./poison-card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "strikeRider";
export const isStrikeItem = (plan) => Boolean(plan?.strike) && plan.trigger?.event === "strike" && plan.resolution?.check?.roll === "attack";

export function createStrikeCard({ plan, item, user }) {
    return { kind: "strike", status: "open", plan, item, user, results: [] };
}

// A row in words: "Frightened 1", "Blinded for 1 round", "−10 to land-speed".
function rowText(row) {
    const conditions = (row?.effects ?? []).filter((effect) => effect.kind === "condition").map((effect) => `${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}`);
    const modifiers = (row?.modifiers ?? []).map((modifier) => `${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} to ${modifier.selector}`);
    return [...conditions, ...modifiers].join(", ");
}

// A die in words: "4d6 mental", "1d4 persistent force", "1d8 precision", "1d6".
export const dieText = (entry) => [`${entry.diceNumber}${entry.dieSize}`, entry.category, entry.damageType].filter(Boolean).join(" ");

// What the Strike carries, as lines: "On a hit: frightened 1", "On a critical hit: frightened 2", "On a hit: DC 22 Fortitude
// save", "+4d6 mental damage", "+1 status bonus to the attack roll", "All its damage is fire", "Also: …" (what's left to the
// table).
export function strikeLines(plan) {
    const outcomes = plan.resolution.outcomes;
    const hit = rowText(outcomes.success);
    const critical = rowText(outcomes.criticalSuccess);
    const strike = plan.strike;
    return [
        strike.attack ? `+${strike.attack.value} ${strike.attack.type} bonus to the attack roll` : null,
        strike.alteration ? `All its damage is ${strike.alteration}` : null,
        ...(strike.damage ?? []).map((entry) => `+${dieText(entry)} damage`),
        hit ? `On a hit: ${hit}` : null,
        critical && critical !== hit ? `On a critical hit: ${critical}` : null,
        strike.save ? `On a hit: ${saveText(strike.save)} for the target` : null,
        ...(strike.notes ?? []).map((note) => `Also: ${note}`)
    ].filter(Boolean);
}

const RANGE_WORDS = { melee: "melee Strike", ranged: "ranged Strike" };
export const strikeWord = (plan) => (plan.strike?.unarmed ? "unarmed Strike" : RANGE_WORDS[plan.strike?.range] ?? "Strike");
const UNTIL_WORDS = { "turn-end": "this turn", "next-turn-end": "before the end of the next turn", minute: "within a minute" };

// The card's hint: which Strike carries it and what spends it.
export function strikeHint(plan, name) {
    const strike = plan.strike ?? {};
    if (strike.hit) return `${name}'s Strike already hit: its damage roll carries it.`;
    const which = strike.uses === 2 ? `next two ${strikeWord(plan)}s` : `next ${strikeWord(plan)}`;
    return `${name}'s ${which} ${UNTIL_WORDS[strike.until] ?? "this turn"} ${strike.uses === 2 ? "carry" : "carries"} it; ${strike.missKeeps ? "only a hit spends it" : "a miss spends it"}.`;
}

export function strikeCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const lines = strikeLines(state.plan).map((line) => `<li>${escape(line)}</li>`).join("");
    const hint = open ? `<p class="aar-hint">${escape(strikeHint(state.plan, state.user.name))}</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Ready the ${escape(strikeWord(state.plan))}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${escape(strikeWord(state.plan))}</span></header><ul class="aar-notes">${lines}</ul>${hint}${results}${controls}</section>`;
}

// The readied Strike's PF2e rules: its extra dice on that Strike's damage, its bonus on that Strike's attack roll, its
// damage type. The Strike is the item's own weapon (by its id on the actor), an unarmed one, or any melee or ranged one.
export function strikeRules(plan, { weaponId = null, label = null } = {}) {
    const strike = plan.strike ?? {};
    const range = strike.range ?? null;
    const damageSelector = weaponId ? (range ? `${weaponId}-${range}-damage` : `${weaponId}-damage`) : strike.unarmed ? "unarmed-damage" : range ? `${range}-strike-damage` : "strike-damage";
    const attackSelector = weaponId ? `${weaponId}-attack` : strike.unarmed ? "unarmed-attack-roll" : range ? `${range}-strike-attack-roll` : "strike-attack-roll";
    const slug = String(label ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
    const rules = (strike.damage ?? []).map((entry, index) => ({
        key: "DamageDice",
        selector: damageSelector,
        slug: `${slug}-extra-${index + 1}`,
        ...(label ? { label } : {}),
        diceNumber: entry.diceNumber,
        dieSize: entry.dieSize,
        ...(entry.damageType ? { damageType: entry.damageType } : {}),
        ...(entry.category ? { category: entry.category } : {})
    }));
    if (strike.attack) rules.push({ key: "FlatModifier", selector: attackSelector, slug: `${slug}-attack`, ...(label ? { label } : {}), type: strike.attack.type, value: strike.attack.value, ...(weaponId && range ? { predicate: [`item:${range}`] } : {}) });
    if (strike.alteration) rules.push({ key: "DamageAlteration", selectors: [damageSelector], mode: "override", property: "damage-type", value: strike.alteration });
    return rules;
}

const DURATIONS = {
    "turn-end": { value: 0, unit: "rounds", expiry: "turn-end" },
    "next-turn-end": { value: 1, unit: "rounds", expiry: "turn-end" },
    minute: { value: 1, unit: "minutes", expiry: "turn-start" }
};

// The Effect on the user that marks the readied Strike, until the end of the turn (or as long as the text says). Its flag
// counts the Strikes left (uses) and whether a hit's damage roll is still to come (awaiting).
export function strikeEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId, weaponId = null }) {
    const strike = state.plan.strike ?? {};
    return {
        name: `${state.item.name}: next ${strikeWord(state.plan)}`,
        type: "effect",
        img: img ?? "icons/svg/sword.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { plan: state.plan, item: state.item, user: state.user, weaponId, uses: strike.uses ?? 1, awaiting: Boolean(strike.hit) } } },
        system: {
            description: { value: `<p>${escape(strikeHint(state.plan, "Its user"))} ${escape(strikeLines(state.plan).join("; "))}.</p>` },
            duration: { ...(DURATIONS[strike.until] ?? DURATIONS["turn-end"]), sustained: false },
            start: { value: worldTime, initiative },
            rules: strikeRules(state.plan, { weaponId, label: state.item.name })
        }
    };
}

// Whether a Strike takes the readied rider: its range ("melee": not a ranged weapon), its weapon (the item's own, by the
// roll's "item:id:…"; an unarmed one, "item:category:unarmed"), and what its degree does — "hit" (the riders for that
// degree), "keep" (a miss, when only a hit spends it), else "spend".
export function riderFor(plan, { ranged = false, outcome, options = [], weaponId = null } = {}) {
    if (plan.strike?.range === "melee" && ranged) return null;
    if (plan.strike?.range === "ranged" && !ranged) return null;
    if (weaponId && !options.includes(`item:id:${weaponId}`)) return null;
    if (plan.strike?.unarmed && !options.includes("item:category:unarmed")) return null;
    if (outcome === "success" || outcome === "criticalSuccess") return "hit";
    return plan.strike?.missKeeps ? "keep" : "spend";
}

// The item's id on its actor, from its uuid ("Actor.abc.Item.def" → "def").
export const itemIdOf = (uuid) => /\.Item\.([A-Za-z0-9]+)$/.exec(String(uuid ?? ""))?.[1] ?? null;
