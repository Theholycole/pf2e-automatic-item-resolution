// The Strike card (src/compiler/strikes.js): an item used by Striking (Fear Gem, Duelist's Beacon, Mantle of the
// Tikbalang). Apply readies the user's next Strike this turn, an Effect that marks it — with PF2e's own rules for what
// the Strike adds (DamageDice, FlatModifier, DamageAlteration), so PF2e's rolls carry it; PF2e's attack roll then decides
// (scripts/strikes.js): a hit or a critical hit puts the riders for its degree on the target and posts the save the
// Strike calls for, and its damage roll spends it; a miss spends it. Pure; the ability module's classes.

import { saveText } from "./poison-card.js";
import { volleyLines } from "../compiler/volley.js";
import { ROLLED_CRITICAL } from "../compiler/rolled-critical.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "strikeRider";
export const isStrikeItem = (plan) => Boolean(plan?.strike) && plan.trigger?.event === "strike" && plan.resolution?.check?.roll === "attack";

// Whether a creature is made of metal or wears metal armor (Lodestone Pellet's bonus): the metal trait, or worn armor of a metal group —
// chain, plate, composite, not of leather, wood or ceramic — or of a metal material.
const METALS = new Set(["adamantine", "cold-iron", "dawnsilver", "djezet", "inubrix", "noqual", "orichalcum", "siccatite", "silver", "sovereign-steel", "abysium", "keep-stone", "steel", "iron"]);
export function isMetalTarget(actor) {
    const traits = actor?.traits ?? new Set(actor?.system?.traits?.value ?? []);
    if (traits.has?.("metal") || (Array.isArray(traits) && traits.includes("metal"))) return true;
    const armor = actor?.wornArmor ?? (actor?.itemTypes?.armor ?? []).find((item) => item.isEquipped && item.system?.category !== "shield");
    if (!armor) return false;
    const base = String(armor.system?.baseItem ?? "");
    return METALS.has(armor.system?.material?.type) || (["chain", "plate", "composite"].includes(String(armor.system?.group ?? armor.group ?? "")) && !/ceramic|leather|wood/.test(base));
}

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

// When an extra applies, in words: " against a prone target", " on a critical hit", " on a hit (not a critical hit)".
function whenText(entry) {
    const conditions = (entry?.predicate ?? []).filter((term) => typeof term === "string" && term.startsWith("target:condition:")).map((term) => term.slice("target:condition:".length).replace(/-/g, " "));
    const against = conditions.length ? ` against a ${conditions.join(" and ")} target` : "";
    const critical = entry?.critical === true ? " on a critical hit" : entry?.critical === false ? " on a hit (not a critical hit)" : "";
    // (Only when the roll itself was a critical hit, before its better degree: Pham Lê Ngọc's Ceremonial Sword's, 2026-10-28.)
    const rolled = (entry?.predicate ?? []).includes(ROLLED_CRITICAL) ? " when the roll itself was one (before its better degree)" : "";
    return `${against}${critical}${rolled}`;
}

// (Dice only when the roll itself was a critical hit, src/compiler/rolled-critical.js: after an attack roll whose unadjusted outcome — PF2e's
// context.unadjustedOutcome — was a critical success, the readied Effect's rules with the roll option those dice wait for; else null.)
export function rolledCriticalRules(plan, context, rules = []) {
    if (!plan?.strike?.rolledCritical || context?.unadjustedOutcome !== "criticalSuccess") return null;
    if (rules.some((rule) => rule?.key === "RollOption" && rule.option === ROLLED_CRITICAL)) return null;
    return [...rules, { key: "RollOption", domain: "all", option: ROLLED_CRITICAL }];
}

// A die in words: "4d6 mental", "1d4 persistent force", "1d8 precision", "1d6".
export const dieText = (entry) => [entry.dieSize ? `${entry.diceNumber}${entry.dieSize}` : `${entry.diceNumber} weapon ${entry.diceNumber === 1 ? "die" : "dice"}`, entry.category, entry.damageType].filter(Boolean).join(" ");

// Its degree adjustment in words (PF2e's AdjustDegreeOfSuccess): "one degree better" for all, else each step it makes ("a failure is a
// success and a success a critical success", Ice Zuggle Orb's supercharged throw — 2026-10-28).
const DEGREE_NAMES = { criticalFailure: "a critical failure", failure: "a failure", success: "a success", criticalSuccess: "a critical success" };
const DEGREE_STEPS = ["criticalFailure", "failure", "success", "criticalSuccess"];
function degreeLine(degree) {
    if (degree?.all === "one-degree-better") return "Its attack roll's outcome is one degree better";
    if (degree?.all === "one-degree-worse") return "Its attack roll's outcome is one degree worse";
    const steps = DEGREE_STEPS.filter((step) => degree?.[step]).map((step) => {
        const at = DEGREE_STEPS.indexOf(step);
        const to = { "one-degree-better": at + 1, "one-degree-worse": at - 1, "two-degrees-better": at + 2, "two-degrees-worse": at - 2 }[degree[step]] ?? DEGREE_STEPS.indexOf(degree[step]);
        return `${DEGREE_NAMES[step]} is ${DEGREE_NAMES[DEGREE_STEPS[Math.max(0, Math.min(3, to))]]}`;
    });
    return steps.length ? `On its attack roll ${steps.join(" and ")}` : "Its attack roll's outcome is one degree better";
}

// What the Strike carries, as lines: "On a hit: frightened 1", "On a critical hit: frightened 2", "On a hit: DC 22 Fortitude
// save", "+4d6 mental damage", "+1 status bonus to the attack roll", "All its damage is fire", "Also: …" (what's left to the
// table).
export function strikeLines(plan) {
    const outcomes = plan.resolution.outcomes;
    const hit = rowText(outcomes.success);
    const critical = rowText(outcomes.criticalSuccess);
    const strike = plan.strike;
    return [
        // (Several at once, src/compiler/volley.js: how many, at whom, and what the text says of them.)
        ...volleyLines(strike.volley, { uses: strike.uses }),
        // (Only against a kind of creature: "Only against a plant or wood creature".)
        strike.against?.length ? `Only against a ${strike.against.join(" or ")} creature (another target spends it)` : null,
        // (Damage its own PF2e rules add, Gravebane Ammunition's: said, PF2e's to roll.)
        ...(strike.ownRules ?? []).map((words) => `PF2e's own rules add ${words}`),
        // (A line of its own beside the Strike, Void Sickle's lights put out.)
        ...(strike.lines ?? []),
        // (What its user has until then, its readied Effect's own rules: Sawtooth Reaper's fog.)
        strike.userWords ?? null,
        // (A volley's penalty is its own line.)
        strike.attack && !(strike.volley?.penalty && strike.attack.value === strike.volley.penalty) ? (strike.attack.value < 0 ? `${strike.attack.value} ${strike.attack.type === "untyped" ? "" : `${strike.attack.type} `}penalty to the attack roll` : `+${strike.attack.value} ${strike.attack.type} bonus to the attack roll${strike.attack.against === "metal" ? ` against a creature made of metal or wearing metal armor${strike.attack.metalTarget === true ? " (its target is)" : strike.attack.metalTarget === false ? " (its target isn't: only against a metal creature)" : ""}` : ""}`) : null,
        strike.alteration ? `All its ${strike.alterationFrom ? `${strike.alterationFrom} ` : ""}damage is ${strike.alteration}` : null,
        // (A trait it gains, the Agglomerative Cannonball's razing; or its own traits changed for it, Ice Zuggle Orb's after a spell of another
        // trait: PF2e's AdjustStrike — 2026-10-28.)
        ...(Array.isArray(strike.traits) ? strike.traits.map((trait) => `It gains the ${trait} trait`) : []),
        strike.traits && !Array.isArray(strike.traits) ? `Its traits for it: ${[...(strike.traits.add ?? []).map((trait) => `${trait} added`), ...(strike.traits.remove ?? []).map((trait) => `${trait} gone`)].join(", ")}` : null,
        // (A wider splash, Ice Zuggle Orb's supercharged one: the splash card's creatures within that many feet of the target — 2026-10-28.)
        strike.splashRadius ? `Its splash reaches the creatures within ${strike.splashRadius} feet of the target` : null,
        strike.withoutRune ? `No ${strike.withoutRune} rune damage on it, nor that rune's critical effect, from a weapon with one${strike.runeDC ? ` (its save is DC ${strike.runeDC.dc} then)` : ""}` : null,
        strike.material ? `It's treated as ${strike.material.replace(/-/g, " ")}` : null,
        strike.degree ? degreeLine(strike.degree) : null,
        strike.offGuard ? "Its target is Off-Guard to it" : null,
        ...(strike.options ?? []).map((option) => (option === "ignore-range-penalty" ? "No range increment penalty on it" : /^ignore-range-penalty:(\d+)$/.exec(option) ? `No range penalty out to its ${["", "first", "second", "third", "fourth", "fifth"][Number(/\d+$/.exec(option)[0])] ?? option.split(":")[1]} range increment` : `Roll option ${option}`)),
        ...(strike.suppress ?? []).map((penalty) => `No ${penalty} penalty`),
        strike.splash ? `+${strike.splash.value} ${strike.splash.damageType} splash damage` : null,
        // (Hardness it ignores: PF2e subtracts no creature's Hardness itself.)
        strike.ignoresHardness ? `Its damage ignores the target's Hardness if that's ${strike.ignoresHardness} or lower (a higher Hardness still applies)` : null,
        strike.runes ? `Its weapon is a +${strike.runes.potency} ${["", "", "greater ", "major "][strike.runes.striking] ?? ""}striking weapon for it (PF2e keeps the weapon's own runes when they're better)` : null,
        ...(strike.damage ?? []).map((entry) => `+${dieText(entry)} damage${whenText(entry)}`),
        ...(strike.flat ?? []).map((entry) => `+${entry.value} ${entry.type} damage${entry.perDie ? " per weapon damage die" : ""}${whenText(entry)}`),
        ...(strike.runeDice ?? []).map((entry) => `No ${entry.rune} rune dice on it${whenText(entry)}: its own above instead`),
        // (Damage in place of the weapon's, Big Rock Bullet's: the card's own roll.)
        strike.instead?.hit ? `On a hit: ${strike.instead.hit.formula} ${strike.instead.hit.type} damage in place of the weapon's (doubled on a critical hit)` : null,
        strike.instead?.failure ? `On a failure (not a critical failure): ${strike.instead.failure.formula} ${strike.instead.failure.type} damage` : null,
        strike.failDice ? `On a failure (not a critical failure): ${strike.failDice} weapon damage ${strike.failDice === 1 ? "die" : "dice"} as damage` : null,
        strike.featDie ? `With the ${strike.featDie.name} feat: ${strike.featDie.diceNumber} more weapon damage ${strike.featDie.diceNumber === 1 ? "die" : "dice"} on a hit and on a failure` : null,
        strike.turnEnds ? "After the Strike, its user's turn ends" : null,
        strike.failHalf ? `On a failure (not a critical failure): half of its ${strike.failHalf.formula} ${strike.failHalf.type} damage` : null,
        hit ? `On a hit: ${hit}` : null,
        critical && critical !== hit ? `On a critical hit: ${critical}` : null,
        strike.save ? `On a hit: ${saveText(strike.save)} for the target${strike.saveOnly === "void-healing" ? " (one with void healing)" : ""}` : null,
        // (Temporary Hit Points from the damage the hit deals, Reaper's Toll's: the creature hit marked, scripts/strikes.js.)
        strike.drain ? `On a hit: its user gains ${{ 0.5: "half", 2: "twice" }[strike.drain.fraction] ?? `${strike.drain.fraction} times`} the damage the Strike deals the creature hit (after its resistances) as temporary Hit Points${strike.drain.duration?.mode === "fixed" ? `, for ${strike.drain.duration.value} ${strike.drain.duration.value === 1 ? strike.drain.duration.unit.replace(/s$/, "") : strike.drain.duration.unit}` : ""}` : null,
        strike.save && strike.criticalDC ? `After a critical hit, its DC is ${strike.criticalDC}` : null,
        strike.save && strike.criticalSaveBonus ? `After a critical hit, ${strike.criticalSaveBonus.value} ${strike.criticalSaveBonus.type} to that save` : null,
        strike.save && (strike.criticalWorse ?? []).length ? `After a critical hit, ${strike.criticalWorse.join(" and ")} on the save's success too (only its critical success escapes)` : null,
        ...(strike.around ?? []).map((entry) => `On a hit: ${saveText(entry.plan)} for the creatures within ${entry.radius} feet of the target${entry.includeTarget ? " and the target" : ""}`),
        // (A zone made where the creature hit stands, Godsbreath Bow's vortex: its own line, strike.lines.)
        strike.zone && strike.zoneAt !== "target" ? `On a hit: a ${strike.zone.area.value}-foot aura on the target for ${strike.zone.lasts?.value ?? "?"} ${strike.zone.lasts?.unit ?? ""}, the same save for the others in it` : null,
        strike.cast ? `On a hit: ${strike.cast.name}${strike.cast.rank ? ` (rank ${strike.cast.rank}` : ""}${strike.cast.dc ? `${strike.cast.rank ? ", " : " ("}DC ${strike.cast.dc}` : ""}${strike.cast.rank || strike.cast.dc ? ")" : ""} cast at the target${strike.cast.saveFirst ? ` if it fails a DC ${strike.cast.saveFirst.dc} ${strike.cast.saveFirst.statistic} save` : ""}${strike.cast.attackFromHit ? ", the hit for its attack roll" : ""}` : null,
        // (A maneuver after the hit, Iron Cube's Trip: its own card.)
        strike.follow ? `On a hit: its ${strike.follow.action?.name ?? strike.follow.action?.slug ?? "maneuver"} card at the creature hit${strike.follow.action?.damage ? " (with its damage on a success)" : ""}` : null,
        ...(strike.follow?.notes ?? []).map((note) => `Also: ${note}`),
        ...(strike.requires ?? []).map((line) => `Its target: ${line.charAt(0).toLowerCase()}${line.slice(1).replace(/\.$/, "")}`),
        strike.missRefund ? "On a miss: the activation's use is given back (it doesn't count against its frequency)" : null,
        strike.readied ? "Readied (its user's Ready action): made when its trigger happens, before the start of its user's next turn; if it isn't, the activation's use is given back" : null,
        strike.reach ? (strike.reach.feet ? `Reach ${strike.reach.feet} feet for this Strike` : `Reach ${strike.reach.more} feet more for this Strike`) : null,
        // (What it says of PF2e's multiple attack penalty, whose buttons are the user's to pick.)
        strike.map === "double" ? "Your multiple attack penalty rises two steps after it (it counts as two attacks)" : null,
        strike.map === "none" ? "It doesn't count toward your multiple attack penalty: the Strike after it is at the step you were at before it" : null,
        strike.map === "held" && !strike.volley?.mapHeld ? "Roll them all at the multiple attack penalty you're at now (the same PF2e button); it rises only after the last" : null,
        // (Two Strikes on one roll, Coldstar Pistols'.)
        strike.volley?.twin ? "Its two Strikes at one target are one attack roll, rolled twice and the higher kept; that result is both Strikes'. On a hit, the second Strike's damage is rolled too" : null,
        strike.volley?.twin ? "Your multiple attack penalty rises two steps after them (they're two attacks)" : null,
        ...(strike.notes ?? []).map((note) => `Also: ${note}`)
    ].filter(Boolean);
}

const RANGE_WORDS = { melee: "melee Strike", ranged: "ranged Strike" };
export const strikeWord = (plan) => (plan.strike?.unarmed ? "unarmed Strike" : RANGE_WORDS[plan.strike?.range] ?? "Strike");
const UNTIL_WORDS = { "turn-end": "this turn", "next-turn-end": "before the end of the next turn", "next-turn-start": "before the start of the next turn", minute: "within a minute" };
const EVERY_WORDS = { "turn-end": "for the rest of this turn", "next-turn-end": "until the end of the next turn", "next-turn-start": "until the start of the next turn", minute: "for the next minute" };
// (Or its own time, Power Gauntlet's 10 minutes to a day — strike.lasts { value, unit }, 2026-10-28.)
const untilWords = (strike) => (strike?.lasts ? `within ${strike.lasts.value} ${strike.lasts.value === 1 ? strike.lasts.unit.replace(/s$/, "") : strike.lasts.unit}` : UNTIL_WORDS[strike?.until] ?? "this turn");

// The card's hint: which Strike carries it and what spends it.
// (uses: how many it readied, a volley at each creature targeted.)
const NUMBER_WORDS = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };
export function strikeHint(plan, name, { uses = null } = {}) {
    const strike = plan.strike ?? {};
    if (strike.hit) return `${name}'s Strike already hit: its damage roll carries it.`;
    // (2026-10-27: every Strike for a while, strike.every — Nightmare Cudgel's minute, Whip of Compliance's turn: none spends it.)
    if (strike.every) return `${name}'s ${strikeWord(plan)}s ${EVERY_WORDS[strike.until] ?? "this turn"} each carry it on a hit; none spends it.`;
    const count = uses ?? strike.uses;
    if (strike.volley?.oneRoll) return `${name}'s next ${strikeWord(plan)} ${untilWords(strike)}, at ${Number.isFinite(strike.volley.oneRoll.count) ? `${strike.volley.oneRoll.upTo ? "up to " : "the "}${strike.volley.oneRoll.count} creatures` : "each creature"} targeted when it's readied: its one attack roll is each one's${strike.volley.oneRoll.naturalFirst ? " (a natural 20 only the first one's)" : ""}.`;
    if (strike.volley?.each && !count) return `${name}'s next ${strikeWord(plan)}s this turn, one at each ${strike.volley.each} targeted when it's readied, carry it; a miss spends that one.`;
    const which = count > 1 ? `next ${NUMBER_WORDS[count] ?? count} ${strikeWord(plan)}s` : `next ${strikeWord(plan)}`;
    if (strike.volley && count > 1) return `${name}'s ${which} ${untilWords(strike)} carry it${strike.volley.each ? `, one at each ${strike.volley.each} targeted` : strike.volley.different ? ", each at a different creature" : ""}; a miss spends that one.`;
    if (strike.instead) return `${name}'s ${which} ${untilWords(strike)} carries it; its attack roll posts the damage to roll, so don't roll the weapon's own.`;
    return `${name}'s ${which} ${untilWords(strike)} ${count > 1 ? "carry" : "carries"} it; ${strike.missKeeps ? "only a hit spends it" : "a miss spends it"}.`;
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
            // (Half of it, Energizing Lattice's failure: entry.multiplier.)
            outcomes: { criticalSuccess: none(), success: { damage: { mode: "shared", multiplier: outcome === "criticalSuccess" ? 2 : entry.multiplier ?? 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] }, failure: none(), criticalFailure: none() }
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
        // (No size, a weapon die: PF2e takes the weapon's.)
        ...(entry.dieSize ? { dieSize: entry.dieSize } : {}),
        ...(entry.damageType ? { damageType: entry.damageType } : {}),
        ...(entry.category ? { category: entry.category } : {}),
        // (Only against some creatures: Bane Ammunition's type, "target:trait:dragon".)
        ...(entry.predicate ? { predicate: entry.predicate } : {}),
        // (Only on a hit, or only on a critical hit, Minotaur Chair's prone bleed: PF2e's critical flag — a critical hit's own dice aren't doubled.)
        ...(typeof entry.critical === "boolean" ? { critical: entry.critical } : {})
    }));
    // (A bonus to its damage per weapon damage die, Minotaur Chair's against a prone foe: PF2e's FlatModifier of the weapon's dice.)
    for (const [index, entry] of (strike.flat ?? []).entries()) rules.push({ key: "FlatModifier", selector: damageSelector, slug: `${slug}-flat-${index + 1}`, ...(label ? { label } : {}), type: entry.type, value: entry.perDie ? (entry.value === 1 ? "@weapon.system.damage.dice" : `${entry.value}*@weapon.system.damage.dice`) : entry.value, ...(entry.predicate ? { predicate: entry.predicate } : {}) });
    // (A property rune's own dice taken off when its own take their place, Minotaur Chair's wounding against a prone foe: PF2e slugs them by the rune.)
    for (const entry of strike.runeDice ?? []) rules.push({ key: "DamageAlteration", selectors: [damageSelector], mode: "override", property: "dice-number", value: 0, slug: entry.rune, ...(entry.predicate ? { predicate: entry.predicate } : {}) });
    // (A feat's own extra die, Iron Cudgel's Brutal Finish: only with PF2e's roll option for that feat.)
    if (strike.featDie) rules.push({ key: "DamageDice", selector: damageSelector, slug: `${slug}-${strike.featDie.slug}`, ...(label ? { label } : {}), diceNumber: strike.featDie.diceNumber, predicate: [`feat:${strike.featDie.slug}`] });
    // (Two Strikes on one roll, Coldstar Pistols': the attack rolled twice, the higher kept.)
    if (strike.volley?.twin) rules.push({ key: "RollTwice", selector: attackSelector, keep: "higher", removeAfterRoll: true });
    // (Only against metal, Lodestone Pellet's: its target, seen when it was readied, made of metal or in metal armor — else PF2e's
    // "target:trait:metal" alone, as its armor isn't a roll option of PF2e's.)
    const metalOnly = strike.attack?.against === "metal" && strike.attack.metalTarget !== true ? ["target:trait:metal"] : [];
    if (strike.attack) rules.push({ key: "FlatModifier", selector: attackSelector, slug: `${slug}-attack`, ...(label ? { label } : {}), type: strike.attack.type, value: strike.attack.value, ...(weaponId && range ? { predicate: [`item:${range}`, ...metalOnly] } : metalOnly.length ? { predicate: metalOnly } : {}) });
    // (Only the damage of the type it replaces, Grisly Scythe's slashing: PF2e's predicate on each die's and modifier's own type, so a rune's
    // persistent bleed stays bleed — 2026-10-28, from the case writers' reading; and only a weapon of a base, strike.base, the strike group's.)
    const altered = [...(strike.alterationFrom ? [`damage:type:${strike.alterationFrom}`] : []), ...(strike.base ? [`item:base:${strike.base}`] : [])];
    if (strike.alteration) rules.push({ key: "DamageAlteration", selectors: [damageSelector], mode: "override", property: "damage-type", value: strike.alteration, ...(altered.length ? { predicate: altered } : {}) });
    // (A property rune it doesn't benefit from, Storm Arrow's shock: that rune's dice — PF2e slugs them by the rune — none.)
    if (strike.withoutRune) rules.push({ key: "DamageAlteration", selectors: [damageSelector], mode: "override", property: "dice-number", value: 0, slug: strike.withoutRune });
    // (A precious material for it: PF2e's AdjustStrike on the Strikes it's for.)
    if (strike.material) rules.push({ key: "AdjustStrike", mode: "add", property: "materials", value: strike.material, definition: weaponId ? [`item:id:${weaponId}`] : strike.unarmed ? ["item:category:unarmed"] : range ? [`item:${range}`] : [] });
    // (A trait for it, the Agglomerative Cannonball's razing: PF2e's AdjustStrike on the weapon firing the round — by the round's id, PF2e's
    // weapon options' "item:ammo:id:…" or the roll's "ammo:id:…" — or the Strikes it's for, 2026-10-28. strike.traits a list of traits it
    // gains, or { add, remove } — the Ice Zuggle Orb's, below: two groups' shapes, both read since the merge.)
    for (const trait of Array.isArray(strike.traits) ? strike.traits : []) rules.push({ key: "AdjustStrike", mode: "add", property: "weapon-traits", value: trait, definition: ammoId ? [{ or: [`item:ammo:id:${ammoId}`, `ammo:id:${ammoId}`] }] : weaponId ? [`item:id:${weaponId}`] : strike.unarmed ? ["item:category:unarmed"] : range ? [`item:${range}`] : [] });
    if (strike.degree) rules.push({ key: "AdjustDegreeOfSuccess", selector: attackSelector, adjustment: strike.degree, ...(label ? { label } : {}), ...(weaponId && range ? { predicate: [`item:${range}`] } : {}) });
    // (Its own weapon's traits for it, Ice Zuggle Orb's after a spell of another trait: PF2e's AdjustStrike on that weapon alone — 2026-10-28.)
    if (strike.traits && !Array.isArray(strike.traits) && weaponId) for (const [mode, traits] of [["remove", strike.traits.remove], ["add", strike.traits.add]]) for (const trait of traits ?? []) rules.push({ key: "AdjustStrike", mode, property: "weapon-traits", value: trait, definition: [`item:id:${weaponId}`] });
    // (A wider splash, Ice Zuggle Orb's supercharged one: a roll option on that Strike's damage roll, which the splash card reads — scripts/bombs.js
    // splashRadiusOf, 2026-10-28.)
    if (strike.splashRadius) rules.push({ key: "RollOption", domain: damageSelector, option: `splash-radius:${strike.splashRadius}` });
    // (Its roll options for the attack — "ignore-range-penalty:2", Sniper's Bead —, a trait's penalty suppressed — kickback, Alchemist's
    // Damper —, flat splash damage — Jistkan War Crossbow.)
    for (const option of strike.options ?? []) rules.push({ key: "RollOption", domain: attackSelector, option });
    for (const penalty of strike.suppress ?? []) rules.push({ key: "AdjustModifier", selector: attackSelector, slug: penalty, suppress: true });
    // (Its target Off-Guard to it: PF2e's EphemeralEffect of the condition on the attack.)
    if (strike.offGuard) rules.push({ key: "EphemeralEffect", affects: "target", selectors: [attackSelector], uuid: "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg" });
    // (Cover it ignores: PF2e's Effect that suppresses the target's cover bonus to AC — Effect: Alchemist Goggles, whose only rule it is —
    // for a target in that cover.)
    if (strike.ignoresCover?.length) rules.push({ key: "EphemeralEffect", affects: "target", selectors: [attackSelector], predicate: [{ or: strike.ignoresCover.map((level) => `target:cover-level:${level}`) }], uuid: "Compendium.pf2e.equipment-effects.Item.SZWxyXOTZtGvZbN7" });
    if (strike.splash) rules.push({ key: "FlatModifier", selector: damageSelector, slug: `${slug}-splash`, ...(label ? { label } : {}), value: strike.splash.value, damageType: strike.splash.damageType, damageCategory: "splash" });
    // (Its runes for the Strike, Weapon Shot's: PF2e's rune upgrade on the weapon loaded with it — the better of the two.)
    if (strike.runes) for (const [property, value] of [["runes-potency", strike.runes.potency], ["runes-striking", strike.runes.striking]]) {
        if (value) rules.push({ key: "ItemAlteration", itemType: "weapon", mode: "upgrade", property, value, predicate: ammoId ? [`item:ammo:id:${ammoId}`] : range ? [`item:${range}`] : [] });
    }
    // (Its user's own while the Strike is readied, Sawtooth Reaper's Bloodmist Whirl: Concealed until it Strikes — the Effect's, gone with it,
    // 2026-10-27.)
    for (const rule of strike.userRules ?? []) rules.push({ ...rule });
    return rules;
}

const DURATIONS = {
    "turn-end": { value: 0, unit: "rounds", expiry: "turn-end" },
    "next-turn-end": { value: 1, unit: "rounds", expiry: "turn-end" },
    "next-turn-start": { value: 1, unit: "rounds", expiry: "turn-start" },
    minute: { value: 1, unit: "minutes", expiry: "turn-start" }
};

// The Effect on the user that marks the readied Strike, until the end of the turn (or as long as the text says). Its flag
// counts the Strikes left (uses) and whether a hit's damage roll is still to come (awaiting); a volley's, the creatures targeted for it
// (targets) and those it has struck (struck).
// (2026-10-27: resistance its damage ignores in part, Boughshatter's 10 against plants, fungi and wood creatures — strike.ignoreResistance { value,
// types, predicate }: the resolution core's flag on the readied Effect, which the core stamps onto its user's Strike damage rolls that fit its
// predicate while it lasts — the weapon's own Strikes only. Ammunition's, its shot's id the predicate: strikeEffectSource's ignores, below.)
export function ignoredResistanceFlag(strike, { weaponId = null, ammoId = null } = {}) {
    const entry = strike?.ignoreResistance;
    if (!entry || ammoId || !entry.predicate) return {};
    return { "pf2e-resolution-core": { ignoreResistance: { ...entry, predicate: [...entry.predicate, ...(weaponId ? [`item:id:${weaponId}`] : [])] } } };
}

// (Resistance its damage ignores in part, Awakened Adamantine Shot's 20: the resolution core's ignoreResistance on this Effect, predicated on the
// shot's id — the core stamps an Effect's entry onto the damage rolls its predicate fits (core 321af5b) —, so only the readied Strike with that
// shot has it, gone with the Effect: not on the shot, whose stack and loaded rounds would keep it for every later shot — 2026-10-27.)
export function strikeEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId, weaponId = null, ammoId = null, uses = null, targets = null, coreId = "pf2e-resolution-core" }) {
    const strike = state.plan.strike ?? {};
    const ignores = strike.ignoreResistance && ammoId ? { [coreId]: { ignoreResistance: { ...strike.ignoreResistance, predicate: [...(strike.ignoreResistance.predicate ?? []), { or: [`item:ammo:id:${ammoId}`, `ammo:id:${ammoId}`] }] } } } : {};
    return {
        name: `${state.item.name}: next ${strikeWord(state.plan)}`,
        type: "effect",
        img: img ?? "icons/svg/sword.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { plan: state.plan, item: state.item, user: state.user, weaponId, ammoId, uses: uses ?? strike.uses ?? 1, awaiting: Boolean(strike.hit), ...(strike.volley ? { targets: targets ?? [], struck: [] } : {}) } }, ...ignores, ...ignoredResistanceFlag(strike, { weaponId, ammoId }) },
        system: {
            description: { value: `<p>${escape(strikeHint(state.plan, "Its user", { uses }))} ${escape(strikeLines(state.plan).join("; "))}.</p>` },
            duration: { ...(strike.lasts ? { value: strike.lasts.value, unit: strike.lasts.unit, expiry: "turn-start" } : DURATIONS[strike.until] ?? DURATIONS["turn-end"]), sustained: false },
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
    // (Only with a weapon of that base, Power Gauntlet's gauntlet: PF2e's "item:base:…", 2026-10-28.)
    if (plan.strike?.base && !options.includes(`item:base:${plan.strike.base}`)) return null;
    // (Activated ammunition: a Strike with that ammunition, when PF2e's roll names its ammunition.)
    // ("ammo:id:…", or PF2e's weapon options' "item:ammo:id:…".)
    if (ammoId && options.some((option) => /(?:^|:)ammo:id:/.test(option)) && !options.some((option) => option === `ammo:id:${ammoId}` || option.endsWith(`:ammo:id:${ammoId}`))) return null;
    if (plan.strike?.unarmed && !options.includes("item:category:unarmed")) return null;
    // (Only against a kind of creature, Carver-cutter's plants: another creature's Strike spends it, no riders.)
    // (2026-10-27: every Strike for a while, strike.every — Whip of Compliance's animals this turn: another creature's Strike keeps it.)
    if (plan.strike?.against?.length && !plan.strike.against.some((trait) => options.includes(`target:trait:${trait}`))) return plan.strike.every ? "keep" : "spend";
    if (outcome === "success" || outcome === "criticalSuccess") return "hit";
    // (A failure that still deals damage in place of the weapon's: Big Rock Bullet's.)
    if (outcome === "failure" && plan.strike?.instead?.failure) return "failure";
    // (Or the weapon's own dice on a failure: Brutal Finish's.)
    if (outcome === "failure" && plan.strike?.failDice) return "failure";
    if (outcome === "failure" && plan.strike?.failHalf) return "failure";
    // (Or a failure's own row, Extinguishing Ball's splash nearby: played as a hit's is.)
    if (outcome === "failure" && plan.strike?.failRow) return "failure";
    // (Every Strike for a while, strike.every: a miss keeps it too.)
    return plan.strike?.missKeeps || plan.strike?.every ? "keep" : "spend";
}

// A maneuver's damage at the Strike's weapon's die, Iron Cube's prone damage with Slam Down (follow.featDie { slug, atLeast }): when its user has
// the feat and the weapon's die is bigger than the one the text gives, that die in place in its damage plans' formulas; else the follow as it is.
const FACES = (die) => Number(/^d(\d+)$/.exec(String(die ?? ""))?.[1]) || 0;
export function withFeatDie(follow, { hasFeat = false, weaponDie = null } = {}) {
    const feat = follow?.featDie;
    if (!feat || !hasFeat || FACES(weaponDie) <= FACES(feat.atLeast)) return follow;
    const bigger = (plan) => (plan?.resolution?.sharedDamage?.components ? { ...plan, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: plan.resolution.sharedDamage.components.map((component) => ({ ...component, formula: String(component.formula).replace(new RegExp(`(\\d+)${feat.atLeast}\\b`, "g"), `$1${weaponDie}`) })) } } } : plan);
    const damage = Object.fromEntries(Object.entries(follow.action?.damage ?? {}).map(([degree, plan]) => [degree, bigger(plan)]));
    return { ...follow, action: { ...follow.action, damage } };
}

// One attack roll's degree against another creature's AC (Hippopotamus Klar's one roll at two): PF2e's degrees, ±10 a step, a natural 20 a step
// better and a natural 1 a step worse. → "criticalSuccess" … "criticalFailure", or null without the numbers.
const STEPS = ["criticalFailure", "failure", "success", "criticalSuccess"];
export function degreeAgainst({ total, natural = null, dc }) {
    if (total === null || total === undefined || dc === null || dc === undefined || !Number.isFinite(Number(total)) || !Number.isFinite(Number(dc))) return null;
    const by = Number(total) - Number(dc);
    let step = by >= 10 ? 3 : by >= 0 ? 2 : by > -10 ? 1 : 0;
    if (Number(natural) === 20) step = Math.min(3, step + 1);
    if (Number(natural) === 1) step = Math.max(0, step - 1);
    return STEPS[step];
}
const DEGREE_WORDS = { criticalSuccess: "a critical hit", success: "a hit", failure: "a miss", criticalFailure: "a critical miss" };
export const degreeWords = (degree) => DEGREE_WORDS[degree] ?? "unknown";

// The item's id on its actor, from its uuid ("Actor.abc.Item.def" → "def").
export const itemIdOf = (uuid) => /\.Item\.([A-Za-z0-9]+)$/.exec(String(uuid ?? ""))?.[1] ?? null;
