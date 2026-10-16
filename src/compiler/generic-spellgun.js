// The generic spellgun (packs/_source/items, the user's request of 2026-10-16): a spellgun that holds the spell its owner
// picks when it first goes into an inventory (scripts/generic-items.js). It works as PF2e's spellguns do
// (src/compiler/spellguns.js): an attack against the target's AC with its user's choice of spell attack or firearm attack,
// and the spell's results on a hit and a critical hit:
// - a spell attack spell (Ray of Frost): its own rows, which are the attack's degrees already;
// - a save spell (Fear, Fireball): a hit is the target's failed save, a critical hit its critical failure, a miss nothing;
// - a spell with damage and neither: its damage on a hit, double on a critical hit (Force Barrage's shards, all at the
//   target), else the rest a note.
// A spellgun's Activate is 2 actions, so the spell is the spell cast with 2 actions (the simulator session's finding,
// 2026-10-16): PF2e's 2-action version where the actions change it (Disorienting Flash's 2d10, Blazing Bolt's ray, Heal's
// range), and Force Barrage's 2 shards a rank.
// The spell's plan is the spell module's (through the core, in live play), heightened here to the rank picked, so the plan
// stored on the item (flags[MODULE_ID].genericSpellgun) needs neither module again: compileItem returns it, live play and
// the Combat Simulator alike. The spell's area becomes the one creature the spellgun aims at. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { addSteps, parseDamage } from "../../../pf2e-resolution-core/src/model/dice.js";
import { sharedComponentsAt } from "../../../pf2e-resolution-core/src/families/save.js";
import { planWithActions, sharedDamageOf } from "../../../pf2e-resolution-core/src/families/shared.js";
import { missileCount } from "../../../pf2e-resolution-core/src/families/direct-damage.js";

export const MODULE_ID = "pf2e-automatic-item-resolution";
// flags[MODULE_ID][GENERIC_SPELLGUN]: { spell: null } until a spell is picked; then { spell: { uuid, name, rank }, rank, plan }.
export const GENERIC_SPELLGUN = "genericSpellgun";

// A scroll's price by rank (PF2e's), which a spellgun of that rank costs too: Torrent Spellgun (Lesser), level 3, 12 gp.
export const PRICES = Object.freeze({ 1: 4, 2: 12, 3: 30, 4: 70, 5: 150, 6: 300, 7: 600, 8: 1300, 9: 3000, 10: 8000 });
export const RANGE = "30 feet";
// A spellgun's Activate: 2 actions, so the spell as cast with 2.
export const ACTIONS = 2;

// The traits a spell's cast has that the spellgun doesn't.
const CAST_TRAITS = new Set(["concentrate", "manipulate", "cantrip", "focus", "arcane", "divine", "occult", "primal"]);
const ROW_PARTS = ["effects", "nativeEffects", "modifiers", "noteEffects", "followUps"];
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], nativeEffects: [], modifiers: [], followUps: [], decisions: [], manualInstructions: [], terminal: null });

export const isPending = (item) => Boolean(item?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]) && !item.flags[MODULE_ID][GENERIC_SPELLGUN].spell;
export const loadedPlan = (item) => item?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]?.plan ?? null;

// A spell's data damage that is damage (PF2e lists a healing spell's healing there too, of the kind "healing").
const damageEntries = (spell) => Object.entries(spell?.system?.damage ?? {}).filter(([, entry]) => entry?.formula && (entry.kinds ?? ["damage"]).includes("damage"));

// A spell the picker offers (from its compendium index entry): not a ritual, and with a save, damage or the attack trait.
export function pickable(entry) {
    if (entry?.type !== "spell" || entry.system?.ritual) return false;
    const traits = entry.system?.traits?.value ?? [];
    return Boolean(entry.system?.defense?.save) || damageEntries(entry).length > 0 || traits.includes("attack");
}

// The lowest rank a spell can be loaded at: its own (a cantrip's 1).
export const lowestRank = (spell) => Math.max(1, Math.min(10, Number(spell?.system?.level?.value) || 1));

// --- Heightening, done once for the rank picked ---

// An instance as a formula: its dice summed by die, its constant, its category and type as flavor ("8d6", "(1d4)[persistent,fire]").
function formulaOf(instance, { flavor = true } = {}) {
    const byDie = new Map();
    for (const term of instance.dice ?? []) byDie.set(term.die, (byDie.get(term.die) ?? 0) + term.count * (term.factor ?? 1));
    const parts = [...byDie].filter(([, count]) => count).map(([die, count]) => `${count}d${die}`);
    if (instance.constant) parts.push(String(instance.constant));
    const body = parts.join("+").replace(/\+-/g, "-") || "0";
    const words = [instance.category, instance.type].filter(Boolean).join(",");
    return flavor && words ? `(${body})[${words}]` : body;
}

// An outcome's own formulas (Grim Tendrils' "(@item.level)[persistent,bleed]") at the rank: plain dice, no heightening left.
function formulasAt(formulas, base, rank) {
    return (formulas ?? []).map((entry) => {
        let instances = parseDamage(entry.formula, { rank });
        const heightening = entry.heightening;
        if (heightening?.type === "interval" && heightening.interval > 0 && heightening.formula) instances = addSteps(instances, parseDamage(heightening.formula, { rank }), Math.max(0, Math.floor((rank - base) / heightening.interval)));
        const { heightening: _, ...rest } = entry;
        return { ...rest, formula: instances.map((instance) => formulaOf(instance)).join(",") };
    });
}

function rowAt(row, base, rank) {
    const damage = row?.damage;
    if (damage?.mode === "formulas") return { ...row, damage: { ...damage, formulas: formulasAt(damage.formulas, base, rank) } };
    if (damage?.mode === "mixed") return { ...row, damage: { ...damage, formulas: formulasAt(damage.formulas, base, rank) } };
    return row;
}

// Shared damage or healing ({ components, heightening }) at the rank: its components as plain formulas.
function componentsAt(shared, base, rank) {
    if (!shared?.components?.length) return [];
    return sharedComponentsAt(shared, base, rank).map(({ id, instances }) => {
        const component = shared.components.find((entry) => entry.id === id) ?? {};
        const typed = instances.length === 1 && (instances[0].type ?? null) === (component.type ?? null) && (instances[0].category ?? null) === (component.category ?? null);
        return { id: String(id), formula: instances.map((instance) => formulaOf(instance, { flavor: !typed })).join(","), type: component.type ?? null, category: component.category ?? null, ...(component.materials?.length ? { materials: component.materials } : {}) };
    });
}

// The plan at the rank picked, as its base rank: the heightened version's rows, the damage's dice added (the native damage
// first, as the core rolls it), its healing's and its outcomes' formulas worked out. What the core would apply again is left
// out of the native part: the action versions, the damage, the missiles, the unsupported family's check and rows. (Its rank
// is then the rank picked, so "@item.level" still reads it.)
export function atRank(plan, rank) {
    const base = Number(plan?.rank ?? 1) || 1;
    const resolution = plan?.resolution ?? {};
    const variant = (resolution.heightenedVariants ?? []).filter((entry) => rank >= Number(entry.minRank)).at(-1);
    const outcomes = variant?.outcomes ?? resolution.outcomes ?? {};
    const { heightenedVariants: _, sharedDamage: __, native = {}, ...rest } = resolution;
    const components = componentsAt(sharedDamageOf(plan), base, rank);
    const { sharedDamage: _damage, byActions: _actions, missiles: _missiles, check: _check, outcomes: _rows, variants: _variants, healing, ...nativeRest } = native;
    const healingAt = healing?.components?.length ? { ...(({ heightening, ...entry }) => entry)(healing), components: componentsAt(healing, base, rank) } : null;
    const kept = { ...nativeRest, ...(healingAt ? { healing: healingAt } : {}) };
    return {
        ...plan,
        rank,
        resolution: {
            ...rest,
            ...(Object.keys(kept).length ? { native: kept } : {}),
            ...(components.length ? { sharedDamage: { rollOnce: true, components } } : {}),
            outcomes: Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, rowAt(row, base, rank)]))
        }
    };
}

// A formula n times over, as one instance (Force Barrage's shards at one target, combined): "1d4+1" × 4 → "4d4+4".
function timesFormula(formula, n, rank) {
    return parseDamage(formula, { rank }).map((instance) => formulaOf({ ...instance, dice: instance.dice.map((term) => ({ ...term, count: term.count * n })), constant: instance.constant * n }, { flavor: /\[/.test(formula) })).join(",");
}

// --- The spellgun's plan ---

// Whether a row does something the core resolves.
export const carries = (row) => Boolean(row) && ((row.damage?.mode ?? "none") !== "none" || ROW_PARTS.some((part) => (row[part] ?? []).length) || Boolean(row.forcedMovement || row.affliction || row.terminal || row.conditionFloor));

// The spell's own damage, from its data, as shared damage (a spell whose plan has no save or attack: Force Barrage).
function dataDamage(spell) {
    const entries = damageEntries(spell);
    if (!entries.length) return null;
    const heightening = spell.system?.heightening;
    return {
        rollOnce: true,
        components: entries.map(([id, entry]) => ({ id: String(id), formula: entry.formula, type: entry.type ?? null, category: entry.category ?? null })),
        ...(heightening?.type === "interval" || heightening?.type === "fixed" ? { heightening } : {})
    };
}

const hit = (row, multiplier, ids) => ({ ...none(), ...row, damage: ids.length ? { mode: "shared", multiplier, sourceComponentIds: ids } : none().damage });

// The spellgun's plan from the spell's plan (null when the spell module has none) and the spell's data.
// spell: { uuid, name, img, system } (its source); rank: the rank picked. → a plan, or null when a hit would carry nothing.
export function spellgunFromSpell(given, { spell, rank }) {
    const castRank = Math.max(lowestRank(spell), Math.min(10, Number(rank) || lowestRank(spell)));
    // (Its 2-action version, where its actions change it.)
    const spellPlan = given?.resolution?.native?.byActions?.[ACTIONS] ? planWithActions(given, ACTIONS) : given;
    const native = spellPlan?.resolution?.native ?? {};
    // (A plan the core plays from PF2e's data, kind "unsupported", reads as the core reads it: its native check and rows —
    // Blazing Bolt's ray, a spell attack.)
    const read = spellPlan?.resolution?.kind === "unsupported" && native.check && native.outcomes
        ? { ...spellPlan, resolution: { ...spellPlan.resolution, kind: "save", check: native.check, outcomes: native.outcomes } }
        : spellPlan;
    const resolution = read?.resolution;
    const statistic = resolution?.kind === "save" ? resolution.check?.statistic : null;
    const notes = [];
    let mapping = null;
    let at = null;
    let outcomes = null;
    if (statistic === "spell-attack") {
        mapping = "attack";
        at = atRank(read, castRank);
        outcomes = { criticalSuccess: at.resolution.outcomes.criticalSuccess ?? none(), success: at.resolution.outcomes.success ?? none(), failure: at.resolution.outcomes.failure ?? none(), criticalFailure: at.resolution.outcomes.criticalFailure ?? none() };
    } else if (["fortitude", "reflex", "will"].includes(statistic)) {
        mapping = "save";
        at = atRank(read, castRank);
        outcomes = { criticalSuccess: at.resolution.outcomes.criticalFailure ?? none(), success: at.resolution.outcomes.failure ?? none(), failure: none(), criticalFailure: none() };
    }
    let missiles = null;
    if (!outcomes || (!carries(outcomes.criticalSuccess) && !carries(outcomes.success))) {
        // (Its damage alone: a hit deals it, a critical hit double. Missiles, as the core counts them for 2 actions, all at the
        // one target — Force Barrage's 2 shards, 4 at rank 3; else its data's damage, and the rest a note.)
        missiles = native.missiles ? missileCount(spellPlan, ACTIONS, castRank) : null;
        const damage = missiles ? sharedDamageOf(spellPlan) : dataDamage(spell);
        if (!damage?.components?.length) return null;
        mapping = "damage";
        at = atRank({ rank: missiles ? Number(spellPlan.rank) || lowestRank(spell) : lowestRank(spell), resolution: { kind: "save", sharedDamage: damage, outcomes: {} } }, castRank);
        if (missiles > 1) at.resolution.sharedDamage.components = at.resolution.sharedDamage.components.map((component) => ({ ...component, formula: timesFormula(component.formula, missiles, castRank) }));
        const ids = at.resolution.sharedDamage.components.map((component) => component.id);
        outcomes = { criticalSuccess: hit({}, 2, ids), success: hit({}, 1, ids), failure: none(), criticalFailure: none() };
        if (!missiles) notes.push(`The rest of ${spell.name} (beyond its damage) is the GM's.`);
    }
    const { kind: _, check: __, outcomes: ___, degreeAdjustment, ...kept } = at.resolution;
    const traits = [...new Set(["attack", "consumable", "magical", "spellgun", ...(spell.system?.traits?.value ?? []).filter((trait) => !CAST_TRAITS.has(trait))])];
    return {
        modelVersion: MODEL_VERSION,
        source: { name: nameFor(spell, castRank), slug: null, uuid: null, type: "consumable" },
        rank: castRank,
        traits,
        activation: { time: "2", traits: [] },
        automation: { level: notes.length || spellPlan?.automation?.level === "guided" ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: RANGE, area: null },
        trigger: { event: "use" },
        ownCheck: { kind: "attack", modifier: null, choose: ["spell", "firearm"] },
        resolution: {
            ...(mapping === "save" ? withoutSaveParts(kept) : kept),
            // (A save spell's degree adjustments are the save's, not the attack's.)
            ...(mapping === "attack" && degreeAdjustment ? { degreeAdjustment } : {}),
            kind: "check",
            check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" } },
            outcomes
        },
        spellgun: { spell: { uuid: spell.uuid ?? null, name: spell.name, rank: lowestRank(spell) }, mapping, actions: ACTIONS, ...(missiles ? { missiles } : {}) },
        ...(notes.length ? { notes, partial: true } : {})
    };
}

// (What only a save reads: its basic-save flag and the like.)
function withoutSaveParts(resolution) {
    const { attackAdjustment, basic, ...rest } = resolution;
    return rest;
}

export const nameFor = (spell, rank) => `${spell.name} Spellgun (Rank ${rank})`;

// --- The item ---

// The spell's degree text, for the description: "<strong>Failure</strong> …" up to the next paragraph.
function degreeText(html, degree) {
    const match = new RegExp(`<strong>\\s*${degree}\\s*</strong>\\s*([\\s\\S]*?)</p>`, "i").exec(String(html ?? ""));
    return match?.[1]?.trim() || null;
}

// The description of a loaded spellgun.
export function descriptionFor(spell, rank, plan) {
    const link = spell.uuid ? `@UUID[${spell.uuid}]{${spell.name}}` : spell.name;
    const mapping = plan?.spellgun?.mapping;
    const html = spell.system?.description?.value ?? "";
    const rows = mapping === "attack"
        ? [degreeText(html, "Critical Success"), degreeText(html, "Success")]
        : mapping === "save"
            ? [degreeText(html, "Critical Failure"), degreeText(html, "Failure")]
            : [null, null];
    const basic = mapping === "damage" || (mapping === "save" && !rows[0] && !rows[1]);
    const critical = rows[0] ?? (basic ? "The target takes double damage." : `As the spell's ${mapping === "attack" ? "critical success" : "critical failure"}.`);
    const success = rows[1] ?? (basic ? "The target takes full damage." : `As the spell's ${mapping === "attack" ? "success" : "failure"}.`);
    const dice = (plan?.resolution?.sharedDamage?.components ?? []).map((component) => `${component.formula}${/\[/.test(component.formula) ? "" : `${component.category ? ` ${component.category}` : ""}${component.type && component.type !== "untyped" ? ` ${component.type}` : ""}`}`).join(" plus ");
    return [
        `<p><strong>Activate</strong> <span class="action-glyph">2</span> Strike</p>`,
        `<hr />`,
        `<p>This spellgun is loaded with ${link} at rank ${rank}. You Activate it by aiming it at one creature and making your choice of a spell attack roll or a firearm attack roll against the target's AC. It has a range increment of ${RANGE}. A hit affects only the target, ${mapping === "attack" ? "as the spell's hit does" : mapping === "save" ? "as if it had failed its save against the spell" : "with the spell's damage"}; then the spellgun crumbles.${/\b(?:to|or)\b/.test(String(spell.system?.time?.value ?? "")) ? ` It's the spell as cast with ${ACTIONS} actions${plan?.spellgun?.missiles ? `: all ${plan.spellgun.missiles} of its shards hit the target, their damage combined` : ""}.` : ""}</p>`,
        ...(dice ? [`<p><strong>Damage</strong> ${dice}</p>`] : []),
        `<hr />`,
        `<p><strong>Critical Success</strong> ${critical}</p>`,
        `<p><strong>Success</strong> ${success}</p>`,
        ...(plan?.notes?.length ? [`<p>${plan.notes.join(" ")}</p>`] : [])
    ].join("\n");
}

// The item's update for a spell loaded at a rank: its name, level, price, traits, description, and the plan in its flag.
export function loadedUpdate(spell, rank, plan) {
    return {
        name: nameFor(spell, rank),
        "system.level.value": Math.max(1, 2 * rank - 1),
        "system.price.value": { pp: 0, gp: PRICES[rank] ?? PRICES[1], sp: 0, cp: 0 },
        "system.traits.value": plan.traits,
        "system.traits.rarity": spell.system?.traits?.rarity ?? "common",
        "system.description.value": descriptionFor(spell, rank, plan),
        // (Its slug from its new name, as PF2e makes one.)
        "system.slug": null,
        [`flags.${MODULE_ID}.${GENERIC_SPELLGUN}`]: { spell: { uuid: spell.uuid ?? null, name: spell.name, rank: lowestRank(spell) }, rank, plan }
    };
}
