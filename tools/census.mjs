#!/usr/bin/env node
// Census of PF2e's consumables: what each one does, and what the item compiler
// makes of it today (a plan the core resolves with no gaps, one with gaps, an
// ability-module builtin, or nothing).
//
// Usage: node tools/census.mjs [packsDirectory]
// Reads the PF2e system's packs straight from LevelDB (no Foundry login) and
// writes reports/census.json and docs/census.md.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { SPELL_MODULE_CATEGORIES, compileItem, handlesItem, spellEffectIndex } from "../src/compiler/index.js";
import { compileBomb } from "../src/compiler/bombs.js";
import { routeOf } from "../src/live/route.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDirectory = path.resolve(process.argv[2] ?? `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`);

const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);

const spellEffects = spellEffectIndex(readDocuments(path.join(packsDirectory, "spell-effects")).filter((doc) => doc.collection === "items"));
const basicActions = compileBasicActions(readDocuments(path.join(packsDirectory, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));

// What an item does, read from its data and text (several at once).
const EFFECT_LINK = /@UUID\[Compendium\.pf2e\.(?:equipment-effects|other-effects|spell-effects|feat-effects|bestiary-effects|campaign-effects)\.Item\.[^\]]+\]/;
export const MECHANISMS = {
    heal: (item, text) => item.system?.damage?.kind === "healing" || /\bregains?\b[^.]{0,60}\bHit Points\b/i.test(text),
    "temp-hp": (item, text) => /\btemporary Hit Points\b/i.test(text),
    damage: (item, text) => item.system?.damage?.kind === "damage" || /@Damage\[/.test(item.system?.description?.value ?? "") && !/\bStage 1\b/i.test(text),
    "linked-effect": (item) => EFFECT_LINK.test(item.system?.description?.value ?? ""),
    "fixed-dc": (item) => /@Check\[[^\]]*\bdc:\s*\d+/i.test(item.system?.description?.value ?? "") || /\bDC \d+\b/.test(item.system?.description?.value ?? ""),
    affliction: (item, text) => /\bStage 1\b/i.test(text),
    "casts-spell": (item) => Boolean(item.system?.spell) || /\bcasts?\b[^.]{0,80}@UUID\[Compendium\.pf2e\.spells-srd\./i.test(item.system?.description?.value ?? ""),
    strike: (item, text) => /\bActivat\w*\s*\[?\w?\]?\s*Strike\b/.test(text) || /\bmake a (?:ranged |melee )?Strike\b/i.test(text),
    "on-weapon": (item, text) => (item.system?.traits?.value ?? []).includes("injury") || /\b(?:apply|applied|coat|smear)\w*\b[^.]{0,60}\b(?:weapon|ammunition|blade|arrow|bolt)s?\b/i.test(text),
    trigger: (item) => /<strong>\s*Trigger\s*<\/strong>/i.test(item.system?.description?.value ?? ""),
    counteract: (item, text) => /\bcounteract/i.test(text),
    area: (item, text) => /\b\d+-foot(?:-radius)? (?:burst|cone|line|emanation|radius|cube|square)\b/i.test(text),
    condition: (item) => /@UUID\[Compendium\.pf2e\.conditionitems\./.test(item.system?.description?.value ?? ""),
    duration: (item, text) => /\bfor (?:\d+|one|an?) (?:rounds?|minutes?|hours?|days?)\b|\bDuration\b/i.test(text)
};

const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<span class="action-glyph">([^<]*)<\/span>/g, "[$1]").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// The plan at each degree through the core: its gaps, or the error it throws.
function resolveGaps(plan) {
    const family = registry.familyFor(plan.resolution?.kind);
    if (!family) return { registered: false, gaps: [{ what: `kind:${plan.resolution?.kind}` }] };
    const context = { caster: { id: "user", side: "party" }, targets: [{ id: "target", side: "foes" }], statistic: () => ({ modifier: 10, dc: 20 }), allied: (a, b) => a?.side === b?.side };
    const gaps = new Map();
    for (const degree of ["criticalFailure", "failure", "success", "criticalSuccess"]) {
        try {
            const result = registry.resolveSync(plan, context, { roll: () => ({ degree, natural: 10, total: 20 }), damage: () => 1, choose: (decision) => decision.default ?? decision.options?.[0]?.value });
            for (const gap of result.gaps ?? family.gaps?.(plan) ?? []) gaps.set(gap.what ?? gap.path, gap);
        } catch (error) {
            gaps.set(`error: ${error.message}`, { what: `error: ${error.message.slice(0, 120)}` });
        }
    }
    return { registered: true, gaps: [...gaps.values()] };
}

function classify(item, text) {
    let plan = null;
    try {
        plan = compileItem(item, { basicActions, spellEffects });
    } catch (error) {
        return { result: "error", error: error.message.slice(0, 160) };
    }
    if (!plan) return { result: "none" };
    const live = routeOf(plan, text);
    return { ...classifyPlan(plan), live };
}

function classifyPlan(plan) {
    if (plan.builtin) return { result: `builtin:${plan.builtin}`, kind: null };
    const { registered, gaps } = resolveGaps(plan);
    if (plan.noteOnly && registered && !gaps.length) return { result: "note-only", kind: plan.resolution?.kind ?? null };
    if (plan.partial && registered && !gaps.length) return { result: "partial", kind: plan.resolution?.kind ?? null, unread: plan.unread };
    return { result: !registered ? "unregistered" : gaps.length ? "gaps" : "resolves", kind: plan.resolution?.kind ?? null, gaps: gaps.map((gap) => gap.what) };
}

const equipment = readDocuments(path.join(packsDirectory, "equipment")).filter((doc) => doc.collection === "items");
const consumables = equipment.filter((doc) => doc.type === "consumable");
const bombs = equipment.filter((doc) => doc.type === "weapon" && doc.system?.group === "bomb");
const activated = equipment.filter((doc) => !["consumable", "treasure", "kit"].includes(doc.type) && /<strong>\s*Activat/i.test(doc.system?.description?.value ?? ""));

// Bombs: a card for the splash on the creatures near the target and the riders the module reads (src/compiler/bombs.js).
const bombPlans = bombs.map((item) => compileBomb(item)).filter(Boolean);
const riderCount = (plan) => ["success", "criticalSuccess"].reduce((sum, degree) => sum + (plan.resolution.outcomes[degree].effects.length + plan.resolution.outcomes[degree].modifiers.length), 0);
const bombTotals = { bombs: bombs.length, cards: bombPlans.length, splash: bombPlans.filter((plan) => plan.item.splash).length, riders: bombPlans.filter((plan) => riderCount(plan) > 0).length };

const rows = [];
for (const item of consumables) {
    const text = plain(item.system?.description?.value);
    const mechanisms = Object.entries(MECHANISMS).filter(([, test]) => test(item, text)).map(([name]) => name);
    const row = { name: item.name, category: item.system?.category ?? "other", level: Number(item.system?.level?.value) || 0, traits: item.system?.traits?.value ?? [], mechanisms };
    if (!handlesItem(item)) rows.push({ ...row, result: "spell-module" });
    else rows.push({ ...row, ...classify(item, text) });
}

const tally = (list, key) => list.reduce((counts, row) => ({ ...counts, [key(row)]: (counts[key(row)] ?? 0) + 1 }), {});
const RESULTS = ["resolves", "partial", "note-only", "gaps", "builtin:zone", "builtin:cast-spell", "builtin:no-effect", "builtin:save-bonus", "none", "error", "unregistered"];
const ours = rows.filter((row) => row.result !== "spell-module");
const categories = Object.entries(tally(rows, (row) => row.category)).sort((a, b) => b[1] - a[1]).map(([category]) => category);

const byCategory = {};
for (const category of categories) {
    const list = ours.filter((row) => row.category === category);
    if (!list.length) continue;
    byCategory[category] = { count: list.length, results: tally(list, (row) => row.result), mechanisms: tally(list.flatMap((row) => row.mechanisms.map((name) => ({ name }))), (entry) => entry.name) };
}
const mechanismCoverage = {};
for (const name of Object.keys(MECHANISMS)) {
    const list = ours.filter((row) => row.mechanisms.includes(name));
    mechanismCoverage[name] = { count: list.length, resolves: list.filter((row) => row.result === "resolves").length, gaps: list.filter((row) => row.result === "gaps").length, none: list.filter((row) => row.result === "none").length };
}
// What each item gets in live play (src/live/route.js), by category.
const LIVE = ["item", "coat", "expose", "save", "later", "cast"];
const liveByCategory = Object.fromEntries(Object.keys(byCategory).map((category) => [category, tally(ours.filter((row) => row.category === category), (row) => row.live ?? "none")]));
const liveTotals = tally(ours, (row) => row.live ?? "none");
// Why an item has no card yet.
const NO_CARD = {
    "no-plan": "nothing read yet (one-offs: a talisman's trigger, an out-of-combat use)",
    gm: "the ability compiler's GM fallback (\"no-effect\")",
    snare: "a snare: placed in a square, set off by the first creature to enter it (needs Regions)",
    zone: "a lasting area (needs Regions)",
    triggered: "a save on a trigger or a passive (an aura, a reaction)",
    other: "another plan not played yet"
};
const noCardReason = (row) => (row.result === "none" || row.result === "error" ? "no-plan" : row.result === "builtin:no-effect" ? "gm" : row.category === "snare" ? "snare" : row.result === "builtin:zone" ? "zone" : row.kind === "save" ? "triggered" : "other");
const noCard = tally(ours.filter((row) => !row.live), noCardReason);
const gapCounts = tally(ours.flatMap((row) => (row.gaps ?? []).map((what) => ({ what }))), (entry) => entry.what);

const report = {
    generated: new Date().toISOString().slice(0, 10),
    system: packsDirectory,
    totals: {
        consumables: consumables.length,
        spellModule: rows.length - ours.length,
        ours: ours.length,
        bombs: bombTotals,
        activatedPermanent: activated.length,
        results: tally(ours, (row) => row.result)
    },
    byCategory,
    mechanismCoverage,
    live: { totals: liveTotals, byCategory: liveByCategory, noCard },
    gapCounts,
    rows
};

mkdirSync(path.join(root, "reports"), { recursive: true });
writeFileSync(path.join(root, "reports/census.json"), `${JSON.stringify(report, null, 1)}\n`);

// --- docs/census.md -----------------------------------------------------------

const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : "–");
const lines = [];
lines.push("# Consumables census");
lines.push("");
lines.push(`Generated by \`tools/census.mjs\` on ${report.generated} from the PF2e system's packs (equipment). Rerun it after each batch; \`reports/census.json\` has every item's row.`);
lines.push("");
lines.push(`- **${consumables.length}** consumables. **${report.totals.spellModule}** are the spell module's (${SPELL_MODULE_CATEGORIES.join(", ")}), so this module handles **${ours.length}**.`);
lines.push(`- **${bombs.length}** alchemical bombs are \`weapon\` items (group \`bomb\`), not consumables: PF2e Strikes with them and rolls their damage and splash. **${bombTotals.cards}** get the module's card after PF2e's damage roll: **${bombTotals.splash}** for the splash on the creatures within 5 feet of the target, **${bombTotals.riders}** with riders read from their text ("On a hit … off-guard", "Frightened 2 on a critical hit").`);
lines.push(`- **${activated.length}** permanent items (equipment, weapons, armor, shields, ammunition, containers) have an "Activate": a later phase.`);
lines.push("");
lines.push("Results, for the items this module handles:");
lines.push("");
lines.push("- **resolves**: a plan the core's families resolve at every degree with no gaps");
lines.push("- **partial**: the module applies part of what the text says and puts the rest on a note Effect with the item's text (\"Effect + note\", counted apart as the spell module counts its own)");
lines.push("- **note-only**: nothing the module reads but a time: a note Effect with the item's text for that time (counted apart, as the spell module counts its note-only spells)");
lines.push("- **gaps**: a plan the core resolves only in part (the gaps are listed below)");
lines.push("- **builtin**: an ability-module builtin its live layer plays (zone: an area left on the map; cast-spell: casts a spell; no-effect: the GM's)");
lines.push("- **none**: no plan yet");
lines.push("");
lines.push(`| Result | Items | Share |`);
lines.push(`|---|---:|---:|`);
for (const result of RESULTS) {
    const count = report.totals.results[result] ?? 0;
    if (count) lines.push(`| ${result} | ${count} | ${pct(count, ours.length)} |`);
}
lines.push("");
lines.push("## By category");
lines.push("");
lines.push(`| Category | Items | resolves | partial | note-only | gaps | builtin | none |`);
lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
for (const [category, entry] of Object.entries(byCategory)) {
    const builtin = Object.entries(entry.results).filter(([result]) => result.startsWith("builtin:")).reduce((sum, [, count]) => sum + count, 0);
    lines.push(`| ${category} | ${entry.count} | ${entry.results.resolves ?? 0} | ${entry.results.partial ?? 0} | ${entry.results["note-only"] ?? 0} | ${entry.results.gaps ?? 0} | ${builtin} | ${(entry.results.none ?? 0) + (entry.results.error ?? 0)} |`);
}
lines.push("");
lines.push("## Played live");
lines.push("");
lines.push("Which card each item gets after PF2e's Use (`src/live/route.js`): **item** (healing, PF2e Effects, its own row or note), **coat** (an injury poison on a weapon), **expose** (a contact, inhaled or ingested poison, or a drug), **save** (a save on its Use for the creatures targeted), **later** (the same, kept open for an action the item gives for later: a breath potion), **cast** (the spell module casts it). Bombs get theirs after PF2e's damage roll (above).");
lines.push("");
lines.push(`| Category | Items | ${LIVE.join(" | ")} | no card |`);
lines.push(`|---|---:|${LIVE.map(() => "---:").join("|")}|---:|`);
for (const [category, counts] of Object.entries(liveByCategory)) lines.push(`| ${category} | ${byCategory[category].count} | ${LIVE.map((route) => counts[route] ?? 0).join(" | ")} | ${counts.none ?? 0} |`);
lines.push(`| **all** | **${ours.length}** | ${LIVE.map((route) => `**${liveTotals[route] ?? 0}**`).join(" | ")} | **${liveTotals.none ?? 0}** |`);
lines.push("");
lines.push("Why the rest have no card yet:");
lines.push("");
lines.push("| Reason | Items |");
lines.push("|---|---:|");
for (const [reason, count] of Object.entries(noCard).sort((a, b) => b[1] - a[1])) lines.push(`| ${NO_CARD[reason]} | ${count} |`);
lines.push("");
lines.push("## What they do");
lines.push("");
lines.push("An item can do several of these. *resolves* counts the items doing it whose plan resolves with no gaps (not necessarily that part of it).");
lines.push("");
lines.push(`| Mechanism | Items | resolves | gaps | none |`);
lines.push(`|---|---:|---:|---:|---:|`);
for (const [name, entry] of Object.entries(mechanismCoverage).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`| ${name} | ${entry.count} | ${entry.resolves} | ${entry.gaps} | ${entry.none} |`);
}
lines.push("");
lines.push("## Gaps in the plans that resolve in part");
lines.push("");
lines.push(`| Gap | Items |`);
lines.push(`|---|---:|`);
for (const [what, count] of Object.entries(gapCounts).sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`| ${what.replace(/\|/g, "\\|")} | ${count} |`);
lines.push("");
const errors = ours.filter((row) => row.result === "error");
if (errors.length) {
    lines.push("## Compiler errors");
    lines.push("");
    for (const row of errors) lines.push(`- ${row.name}: ${row.error}`);
    lines.push("");
}
writeFileSync(path.join(root, "docs/census.md"), `${lines.join("\n")}`);
console.log(JSON.stringify({ totals: report.totals }, null, 1));
