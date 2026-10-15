#!/usr/bin/env node
// Census of PF2e's permanent items' activations (the later phase): what the item compiler reads of each activation —
// a plan the core resolves with no gaps, a note, a builtin (a cast, a zone, the GM's) or nothing — and which card it
// would get in play (src/live/route.js).
//
// Usage: node tools/census-permanent.mjs [packsDirectory] → reports/census-permanent.json, docs/census-permanent.md.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { spellEffectIndex, spellIndex } from "../src/compiler/index.js";
import { compileActivations, handlesPermanent } from "../src/compiler/permanent.js";
import { plainText } from "../src/compiler/rows.js";
import { routeOf } from "../src/live/route.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDirectory = path.resolve(process.argv[2] ?? `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`);
const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);
const spellEffects = spellEffectIndex(readDocuments(path.join(packsDirectory, "spell-effects")).filter((doc) => doc.collection === "items"));
const spells = spellIndex(readDocuments(path.join(packsDirectory, "spells")).filter((doc) => doc.collection === "items"));
const basicActions = compileBasicActions(readDocuments(path.join(packsDirectory, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
// The spell module's claims (its src/compiler/item-claims.js, by its id next to this folder), when it's there.
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);

function gapsOf(plan) {
    const family = registry.familyFor(plan.resolution?.kind);
    if (!family) return ["unregistered"];
    const gaps = new Set();
    for (const degree of ["criticalFailure", "failure", "success", "criticalSuccess"]) {
        try {
            const result = registry.resolveSync(plan, { caster: { id: "user", side: "party" }, targets: [{ id: "target", side: "foes" }], statistic: () => ({ modifier: 10, dc: 20 }), allied: (a, b) => a?.side === b?.side }, { roll: () => ({ degree }), damage: () => 1, choose: (decision) => decision.default });
            for (const gap of result.gaps ?? []) gaps.add(gap.what ?? gap.path);
        } catch (error) {
            gaps.add(`error: ${error.message.slice(0, 80)}`);
        }
    }
    return [...gaps];
}

const result = (plan) => {
    if (!plan) return "none";
    if (plan.builtin) return `builtin:${plan.builtin}`;
    if (plan.noteOnly) return "note-only";
    if (plan.partial) return "partial";
    return gapsOf(plan).length ? "gaps" : "resolves";
};

const equipment = readDocuments(path.join(packsDirectory, "equipment")).filter((doc) => doc.collection === "items" && !["consumable", "treasure", "kit"].includes(doc.type));
const withActivate = equipment.filter((doc) => /<strong>\s*Activat/i.test(doc.system?.description?.value ?? ""));
const staves = withActivate.filter((doc) => !handlesPermanent(doc, { claims }));
const rows = [];
for (const item of withActivate.filter((doc) => handlesPermanent(doc, { claims }))) {
    let compiled = [];
    try {
        compiled = compileActivations(item, { basicActions, spellEffects, spells, claims });
    } catch (error) {
        rows.push({ name: item.name, type: item.type, activation: null, result: "error", error: error.message.slice(0, 120) });
        continue;
    }
    for (const { activation, plan } of compiled) {
        rows.push({ name: item.name, type: item.type, activation: activation.name, time: activation.time, frequency: activation.frequency?.raw ?? null, trigger: Boolean(activation.trigger), result: result(plan), kind: plan?.resolution?.kind ?? null, live: routeOf(plan, plainText(activation.html)) });
    }
}

const tally = (list, key) => list.reduce((counts, row) => ({ ...counts, [key(row)]: (counts[key(row)] ?? 0) + 1 }), {});
const types = [...new Set(rows.map((row) => row.type))];
const report = {
    generated: new Date().toISOString().slice(0, 10),
    totals: { items: withActivate.length, staves: staves.length, ours: withActivate.length - staves.length, activations: rows.length, results: tally(rows, (row) => row.result), live: tally(rows, (row) => row.live ?? "none"), withFrequency: rows.filter((row) => row.frequency).length, withTrigger: rows.filter((row) => row.trigger).length },
    byType: Object.fromEntries(types.map((type) => [type, { activations: rows.filter((row) => row.type === type).length, results: tally(rows.filter((row) => row.type === type), (row) => row.result) }])),
    rows
};
mkdirSync(path.join(root, "reports"), { recursive: true });
writeFileSync(path.join(root, "reports/census-permanent.json"), `${JSON.stringify(report, null, 1)}\n`);

const RESULTS = ["resolves", "partial", "note-only", "gaps", "builtin:cast-spell", "builtin:focus-point", "builtin:reroll", "builtin:item-action", "builtin:zone", "builtin:no-effect", "none", "error"];
const lines = [
    "# Permanent items' activations: census",
    "",
    `Generated by \`tools/census-permanent.mjs\` on ${report.generated} from the PF2e system's equipment pack. \`reports/census-permanent.json\` has every activation's row. **This is a later phase: compiled offline, not played in Foundry yet** (how a player triggers an activation is still to decide).`,
    "",
    `- **${withActivate.length}** permanent items have an "Activate". **${staves.length}** aren't read here: staves, wands and spellhearts, and the items the spell module's claims() reads${claims ? "" : " (not found this run)"} (its casts, item spellshapes), and bombs (their own card). So **${report.totals.ours}** are read: **${rows.length}** activations.`,
    `- **${report.totals.withFrequency}** activations state a frequency ("once per day"), kept on the plan as \`trigger.frequency\`. **${report.totals.withTrigger}** have a Trigger (a reaction or a free action).`,
    "",
    "| Result | Activations |",
    "|---|---:|",
    ...RESULTS.filter((name) => report.totals.results[name]).map((name) => `| ${name} | ${report.totals.results[name]} |`),
    "",
    "## By item type",
    "",
    `| Type | Activations | ${RESULTS.join(" | ")} |`,
    `|---|---:|${RESULTS.map(() => "---:").join("|")}|`,
    ...Object.entries(report.byType).map(([type, entry]) => `| ${type} | ${entry.activations} | ${RESULTS.map((name) => entry.results[name] ?? 0).join(" | ")} |`),
    "",
    "## The card each would get (once activations are played)",
    "",
    "| Card | Activations |",
    "|---|---:|",
    ...Object.entries(report.totals.live).sort((a, b) => b[1] - a[1]).map(([route, count]) => `| ${route === "none" ? "no card" : route} | ${count} |`),
    ""
];
writeFileSync(path.join(root, "docs/census-permanent.md"), lines.join("\n"));
console.log(JSON.stringify(report.totals, null, 1));
