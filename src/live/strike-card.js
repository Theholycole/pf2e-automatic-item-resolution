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
    // ("pushed 5 feet away": the core's forced movement.)
    const moved = row?.forcedMovement ? [`${row.forcedMovement.kind === "pull" ? "pulled" : "pushed"} ${row.forcedMovement.distance} feet ${row.forcedMovement.kind === "pull" ? "closer" : "away"}`] : [];
    return [...conditions, ...modifiers, ...moved].join(", ");
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
        strike.degree ? "Its attack roll's outcome is one degree better" : null,
        ...(strike.options ?? []).map((option) => (/^ignore-range-penalty:(\d+)$/.exec(option) ? `No range penalty out to its ${["", "first", "second", "third", "fourth", "fifth"][Number(/\d+$/.exec(option)[0])] ?? option.split(":")[1]} range increment` : `Roll option ${option}`)),
        ...(strike.suppress ?? []).map((penalty) => `No ${penalty} penalty`),
        strike.splash ? `+${strike.splash.value} ${strike.splash.damageType} splash damage` : null,
        strike.runes ? `Its weapon is a +${strike.runes.potency} ${["", "", "greater ", "major "][strike.runes.striking] ?? ""}striking weapon for it (PF2e keeps the weapon's own runes when they're better)` : null,
        ...(strike.damage ?? []).map((entry) => `+${dieText(entry)} damage`),
        // (Damage in place of the weapon's, Big Rock Bullet's: the card's own roll.)
        strike.instead?.hit ? `On a hit: ${strike.instead.hit.formula} ${strike.instead.hit.type} damage in place of the weapon's (doubled on a critical hit)` : null,
        strike.instead?.failure ? `On a failure (not a critical failure): ${strike.instead.failure.formula} ${strike.instead.failure.type} damage` : null,
        hit ? `On a hit: ${hit}` : null,
        critical && critical !== hit ? `On a critical hit: ${critical}` : null,
        strike.save ? `On a hit: ${saveText(strike.save)} for the target` : null,
        strike.cast ? `On a hit: ${strike.cast.name}${strike.cast.rank ? ` (rank ${strike.cast.rank}` : ""}${strike.cast.dc ? `${strike.cast.rank ? ", " : " ("}DC ${strike.cast.dc}` : ""}${strike.cast.rank || strike.cast.dc ? ")" : ""} cast at the target${strike.cast.saveFirst ? ` if it fails a DC ${strike.cast.saveFirst.dc} ${strike.cast.saveFirst.statistic} save` : ""}${strike.cast.attackFromHit ? ", the hit for its attack roll" : ""}` : null,
        // (A maneuver after the hit, Iron Cube's Trip: its own card.)
        strike.follow ? `On a hit: its ${strike.follow.action?.name ?? strike.follow.action?.slug ?? "maneuver"} card at the creature hit${strike.follow.action?.damage ? " (with its damage on a success)" : ""}` : null,
        ...(strike.follow?.notes ?? []).map((note) => `Also: ${note}`),
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
    if (strike.instead) return `${name}'s ${which} ${UNTIL_WORDS[strike.until] ?? "this turn"} carries it; its attack roll posts the damage to roll, so don't roll the weapon's own.`;
    return `${name}'s ${which} ${UNTIL_WORDS[strike.until] ?? "this turn"} ${strike.uses === 2 ? "carry" : "carries"} it; ${strike.missKeeps ? "only a hit spends it" : "a miss spends it"}.`;
}

// Damage in place of the weapon's for the attack's degree (Big Rock Bullet's): the ability module's card of it — the check
// family with no roll, the damage shared, doubled on a critical hit — or null when that degree deals none.
export function insteadDamagePlan(plan, outcome) {
    const instead = plan?.strike?.instead;
    const entry = outcome === "success" || outcome === "criticalSuccess" ? instead?.hit : outcome === "failure" ? instead?.failure : null;
    if (!entry) return null;
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    return {
        modelVersion: plan.modelVersion,
        source: plan.source,
        rank: plan.rank ?? 1,
        traits: plan.traits ?? [],
        activation: plan.activation,
        automation: { level: "automatic" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "check",
            check: { roll: "automatic", statistic: "automatic" },
            sharedDamage: { rollOnce: true, components: [{ id: "0", formula: entry.formula, type: entry.type, category: null }] },
            outcomes: { criticalSuccess: none(), success: { damage: { mode: "shared", multiplier: outcome === "criticalSuccess" ? 2 : 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] }, failure: none(), criticalFailure: none() }
        },
        directDamage: { formula: entry.formula, type: entry.type, category: null }
    };
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
export function strikeRules(plan, { weaponId = null, ammoId = null, label = null } = {}) {
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
    if (strike.degree) rules.push({ key: "AdjustDegreeOfSuccess", selector: attackSelector, adjustment: strike.degree, ...(label ? { label } : {}), ...(weaponId && range ? { predicate: [`item:${range}`] } : {}) });
    // (Its roll options for the attack — "ignore-range-penalty:2", Sniper's Bead —, a trait's penalty suppressed — kickback, Alchemist's
    // Damper —, flat splash damage — Jistkan War Crossbow.)
    for (const option of strike.options ?? []) rules.push({ key: "RollOption", domain: attackSelector, option });
    for (const penalty of strike.suppress ?? []) rules.push({ key: "AdjustModifier", selector: attackSelector, slug: penalty, suppress: true });
    if (strike.splash) rules.push({ key: "FlatModifier", selector: damageSelector, slug: `${slug}-splash`, ...(label ? { label } : {}), value: strike.splash.value, damageType: strike.splash.damageType, damageCategory: "splash" });
    // (Its runes for the Strike, Weapon Shot's: PF2e's rune upgrade on the weapon loaded with it — the better of the two.)
    if (strike.runes) for (const [property, value] of [["runes-potency", strike.runes.potency], ["runes-striking", strike.runes.striking]]) {
        if (value) rules.push({ key: "ItemAlteration", itemType: "weapon", mode: "upgrade", property, value, predicate: ammoId ? [`item:ammo:id:${ammoId}`] : range ? [`item:${range}`] : [] });
    }
    return rules;
}

const DURATIONS = {
    "turn-end": { value: 0, unit: "rounds", expiry: "turn-end" },
    "next-turn-end": { value: 1, unit: "rounds", expiry: "turn-end" },
    minute: { value: 1, unit: "minutes", expiry: "turn-start" }
};

// The Effect on the user that marks the readied Strike, until the end of the turn (or as long as the text says). Its flag
// counts the Strikes left (uses) and whether a hit's damage roll is still to come (awaiting).
export function strikeEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId, weaponId = null, ammoId = null }) {
    const strike = state.plan.strike ?? {};
    return {
        name: `${state.item.name}: next ${strikeWord(state.plan)}`,
        type: "effect",
        img: img ?? "icons/svg/sword.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { plan: state.plan, item: state.item, user: state.user, weaponId, ammoId, uses: strike.uses ?? 1, awaiting: Boolean(strike.hit) } } },
        system: {
            description: { value: `<p>${escape(strikeHint(state.plan, "Its user"))} ${escape(strikeLines(state.plan).join("; "))}.</p>` },
            duration: { ...(DURATIONS[strike.until] ?? DURATIONS["turn-end"]), sustained: false },
            start: { value: worldTime, initiative },
            rules: strikeRules(state.plan, { weaponId, ammoId, label: state.item.name })
        }
    };
}

// Whether a Strike takes the readied rider: its range ("melee": not a ranged weapon), its weapon (the item's own, by the
// roll's "item:id:…"; an unarmed one, "item:category:unarmed"; activated ammunition's, "ammo:id:…"), and what its degree does — "hit" (the riders for that
// degree), "keep" (a miss, when only a hit spends it), else "spend".
export function riderFor(plan, { ranged = false, outcome, options = [], weaponId = null, ammoId = null } = {}) {
    if (plan.strike?.range === "melee" && ranged) return null;
    if (plan.strike?.range === "ranged" && !ranged) return null;
    if (weaponId && !options.includes(`item:id:${weaponId}`)) return null;
    // (Activated ammunition: a Strike with that ammunition, when PF2e's roll names its ammunition.)
    // ("ammo:id:…", or PF2e's weapon options' "item:ammo:id:…".)
    if (ammoId && options.some((option) => /(?:^|:)ammo:id:/.test(option)) && !options.some((option) => option === `ammo:id:${ammoId}` || option.endsWith(`:ammo:id:${ammoId}`))) return null;
    if (plan.strike?.unarmed && !options.includes("item:category:unarmed")) return null;
    if (outcome === "success" || outcome === "criticalSuccess") return "hit";
    // (A failure that still deals damage in place of the weapon's: Big Rock Bullet's.)
    if (outcome === "failure" && plan.strike?.instead?.failure) return "failure";
    return plan.strike?.missKeeps ? "keep" : "spend";
}

// The item's id on its actor, from its uuid ("Actor.abc.Item.def" → "def").
export const itemIdOf = (uuid) => /\.Item\.([A-Za-z0-9]+)$/.exec(String(uuid ?? ""))?.[1] ?? null;
