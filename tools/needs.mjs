#!/usr/bin/env node
// What each item that isn't automated yet still needs: every consumable and activation whose plan isn't "resolves" (partial, note-only,
// none, the GM's no-effect), PF2e's and the installed modules', sorted by the needs its left-over words show (tools/needs-rules.mjs).
//
// Usage: node tools/needs.mjs [modulesDirectory]
// Writes reports/needs.json and docs/needs.md (PF2e's items by name), and .cache/needs-third-party.json (the modules' items, by name:
// git ignores it, as tools/census-third-party.mjs keeps their names out of the repository).

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { compileItem, handlesItem, spellEffectIndex, spellIndex } from "../src/compiler/index.js";
import { equipmentEffectIndex } from "../src/compiler/degree-effects.js";
import { isBomb } from "../src/compiler/bombs.js";
import { compileActivations, handlesPermanent } from "../src/compiler/permanent.js";
import { leftToTheGM } from "../src/compiler/honest.js";
import { plainText } from "../src/compiler/rows.js";
import { NEEDS, needsOf, workOf } from "./needs-rules.mjs";

const withOwner = (item) => ({ ...item, ownerLevel: Number(item?.system?.level?.value) || 1, ownerAbilities: { str: 4, dex: 3, con: 2, int: 1, wis: 1, cha: 1 }, ownerFeats: [] });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesDirectory = path.resolve(process.argv[2] ?? `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`);
const pf2ePacks = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (directory) => readDocuments(directory).filter((doc) => doc.collection === "items");
const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);
const spellEffects = spellEffectIndex(documents(path.join(pf2ePacks, "spell-effects")));
const itemEffects = equipmentEffectIndex(documents(path.join(pf2ePacks, "equipment-effects")));
const spells = spellIndex(documents(path.join(pf2ePacks, "spells")));
const basicActions = compileBasicActions(documents(path.join(pf2ePacks, "actions")).filter((doc) => BASIC_ACTIONS.includes(doc.system?.slug)));
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
const spellModule = await Promise.all([import("../../pf2e-automatic-resolution/src/compiler/item-claims.js"), import("../../pf2e-automatic-resolution/src/compiler/item-spellshape.js"), import("../../pf2e-automatic-resolution/src/compiler/item-casts.js")]).catch(() => null);
const claimsWhy = spellModule ? (item) => spellModule[0].itemClaims(item) : null;
const spellModuleReads = spellModule ? (item) => ({ shapes: (spellModule[1].readItemSpellshape(item)?.activations ?? []).map((activation) => activation.label), casts: (spellModule[2].readItemCasts(item)?.casts ?? []).map((cast) => cast.uuid) }) : null;
const options = { basicActions, spellEffects, spells, claims, claimsWhy, spellModuleReads, itemEffects };

function gapsOf(plan) {
    const family = registry.familyFor(plan.resolution?.kind);
    if (!family) return ["unregistered"];
    const gaps = new Set();
    for (const degree of ["criticalFailure", "failure", "success", "criticalSuccess"]) {
        try {
            const result = registry.resolveSync(plan, { caster: { id: "user", side: "party" }, targets: [{ id: "target", side: "foes" }], statistic: () => ({ modifier: 10, dc: 20 }), allied: (a, b) => a?.side === b?.side }, { roll: () => ({ degree, natural: 10, total: 20 }), damage: () => 1, choose: (decision) => decision.default ?? decision.options?.[0]?.value });
            for (const gap of result.gaps ?? []) gaps.add(gap.what ?? gap.path);
        } catch (error) {
            gaps.add(`error: ${error.message.slice(0, 80)}`);
        }
    }
    return [...gaps];
}
const resultOf = (plan) => (!plan ? "none" : plan.builtin ? `builtin:${plan.builtin}` : plan.noteOnly ? "note-only" : plan.partial ? "partial" : gapsOf(plan).length ? "gaps" : "resolves");
// (Not automated: every result but "resolves" and the builtins that play — the GM's no-effect is counted, as nothing plays it.)
const unfinished = (result) => result !== "resolves" && (!result.startsWith("builtin:") || result === "builtin:no-effect");

// What the plan leaves over: its notes, unread lines and note Effects, and its rows' GM lines (honest.js leftToTheGM).
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
function leftovers(plan) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        for (const key of ["notes", "unread", "noteEffects"]) if (Array.isArray(node[key])) for (const entry of node[key]) if (said(entry)) out.push([key, said(entry)]);
        if (node.resolution?.outcomes) for (const [degree, row] of Object.entries(node.resolution.outcomes)) for (const line of leftToTheGM(row)) out.push([`gm:${degree}`, line]);
        for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
    };
    walk(plan);
    return out;
}

// Every unfinished entry of a pack's documents → [{ name, kind, activation?, result, needs }].
function entriesOf(docs, base = {}) {
    const entries = [];
    // (Its needs, the main one first, and the words that showed its main need: the work within it, tools/needs-rules.mjs workOf.)
    const add = (entry) => {
        const full = { ...base, ...entry };
        const needs = needsOf(full);
        const work = workOf(full, needs[0]);
        entries.push({ ...full, needs, work: work?.key ?? null, phrase: work?.phrase ?? null });
    };
    for (const item of docs) {
        try {
            if (isBomb(item)) continue;
            if (item.type === "consumable") {
                if (!handlesItem(item, options)) continue;
                const plan = compileItem(withOwner(item), options);
                const result = resultOf(plan);
                if (unfinished(result)) add({ kind: "consumable", name: item.name, category: item.system?.category ?? "other", result, left: plan ? leftovers(plan) : [], text: plainText(item.system?.description?.value ?? "") });
            } else if (/<strong>\s*Activat/i.test(String(item.system?.description?.value ?? ""))) {
                if (!handlesPermanent(item, options)) continue;
                for (const { activation, plan } of compileActivations(withOwner(item), options)) {
                    const result = resultOf(plan);
                    if (unfinished(result)) add({ kind: "activation", name: item.name, type: item.type, activation: activation.name ?? null, trigger: Boolean(activation.trigger), result, left: plan ? leftovers(plan) : [], text: plainText(activation.html ?? "") });
                }
            }
        } catch (error) {
            add({ kind: item.type === "consumable" ? "consumable" : "activation", name: item.name, result: "error", left: [], text: plainText(item.system?.description?.value ?? ""), error: error.message.slice(0, 120) });
        }
    }
    return entries;
}

const equipment = documents(path.join(pf2ePacks, "equipment")).filter((doc) => doc.type === "consumable" || (!["treasure", "kit"].includes(doc.type)));
const pf2e = entriesOf(equipment);

// The installed modules' item packs, as tools/census-third-party.mjs reads them (their Starfinder copies and our own modules left out).
const GEAR = new Set(["consumable", "equipment", "weapon", "armor", "shield", "ammo", "backpack"]);
const STARFINDER = /^(?:sf|sf2e)[-_]/i;
const OURS = ["pf2e-automatic-item-resolution", "pf2e-automatic-resolution", "pf2e-automatic-ability-resolution", "pf2e-resolution-core", "pf2e-combat-simulator", "pf2e-automatic-kineticist-resolution"];
const listing = (directory) => {
    try {
        return readdirSync(directory);
    } catch {
        return [];
    }
};
const thirdParty = [];
for (const module of listing(modulesDirectory)) {
    const manifest = path.join(modulesDirectory, module, "module.json");
    if (OURS.includes(module) || !existsSync(manifest)) continue;
    let data;
    try {
        data = JSON.parse(readFileSync(manifest, "utf8"));
    } catch {
        continue;
    }
    for (const pack of data.packs ?? []) {
        if (pack.type !== "Item" || (pack.system && pack.system !== "pf2e") || STARFINDER.test(pack.name) || STARFINDER.test(path.basename(pack.path ?? ""))) continue;
        const directory = path.join(modulesDirectory, module, pack.path ?? "");
        if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
        let docs = [];
        try {
            docs = documents(directory).filter((doc) => GEAR.has(doc.type));
        } catch {
            continue;
        }
        thirdParty.push(...entriesOf(docs, { module }));
    }
}

// --- Reports ---

const brief = (entry) => ({ name: entry.name, kind: entry.kind, ...(entry.activation ? { activation: entry.activation } : {}), ...(entry.module ? { module: entry.module } : {}), result: entry.result, main: entry.needs[0], ...(entry.phrase ? { work: entry.phrase } : {}), needs: entry.needs });
const tally = (list, key) => list.reduce((counts, entry) => ({ ...counts, [key(entry)]: (counts[key(entry)] ?? 0) + 1 }), {});
const NO_RULES = { id: "no-rules", title: "Nothing to automate", needs: "No rule a card could play: food, refills, ingredients, flavor.", where: "none" };
const ALL = [...NEEDS, NO_RULES];
const generated = new Date().toISOString().slice(0, 10);
const summary = (list) => ({ entries: list.length, results: tally(list, (entry) => entry.result), main: tally(list, (entry) => entry.needs[0]), any: tally(list.flatMap((entry) => entry.needs.map((need) => ({ need }))), (entry) => entry.need) });
mkdirSync(path.join(root, "reports"), { recursive: true });
writeFileSync(path.join(root, "reports/needs.json"), `${JSON.stringify({ generated, totals: summary(pf2e), entries: pf2e.map(brief) }, null, 1)}\n`);
mkdirSync(path.join(root, ".cache"), { recursive: true });
writeFileSync(path.join(root, ".cache/needs-third-party.json"), `${JSON.stringify({ generated, totals: summary(thirdParty), entries: thirdParty.map(brief) }, null, 1)}\n`);

const label = (entry) => `${entry.name}${entry.activation ? ` (${entry.activation})` : ""}`;
const RESULT_WORD = { partial: "partial", "note-only": "note only", none: "nothing read", "builtin:no-effect": "the GM's", gaps: "gaps", error: "error" };
const pf2eTotals = summary(pf2e);
const thirdTotals = summary(thirdParty);
const byKind = (list, kind) => list.filter((entry) => entry.kind === kind).length;
// Who can do an entry's work: the item module alone (its reader; its reader and live play), another module's session, or a decision of yours.
const layersOf = (entry) => new Set(entry.needs.flatMap((id) => (ALL.find((need) => need.id === id)?.where ?? "none").split(" + ")));
function whoCan(list) {
    const only = (entry, allowed) => [...layersOf(entry)].every((layer) => allowed.includes(layer));
    const any = (entry, wanted) => [...layersOf(entry)].some((layer) => wanted.includes(layer));
    return [
        ["The item module's reader alone (new readings, no new live play)", list.filter((entry) => only(entry, ["item reader"])).length],
        ["The item module alone (its reader and its live play)", list.filter((entry) => only(entry, ["item reader", "item live play"])).length],
        ["Another module too (the ability module, the core or the spell module, asked of their session)", list.filter((entry) => any(entry, ["ability module", "core", "spell module"])).length],
        ["A decision of yours for some part (illusions, information, minds, speech, numbers left out, out of combat)", list.filter((entry) => any(entry, ["your decision"])).length],
        ["Nothing to automate", list.filter((entry) => only(entry, ["none"])).length]
    ];
}

// The work within each main need: its entries grouped by the words that showed it, the most-used wording naming the group; "only": the
// entries this need alone keeps from being done (done once its work is).
function workGroups(list) {
    const groups = new Map();
    for (const entry of list) {
        const key = `${entry.needs[0]}|${entry.work ?? ""}`;
        const group = groups.get(key) ?? { need: entry.needs[0], work: entry.work, phrases: new Map(), entries: [], only: 0 };
        group.entries.push(entry);
        if (entry.needs.length === 1 && entry.needs[0] !== "no-rules") group.only++;
        if (entry.phrase) group.phrases.set(entry.phrase, (group.phrases.get(entry.phrase) ?? 0) + 1);
        groups.set(key, group);
    }
    for (const group of groups.values()) group.phrase = [...group.phrases].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [...groups.values()].sort((a, b) => b.entries.length - a.entries.length || b.only - a.only);
}
const groups = workGroups(pf2e);
const needOf = (id) => ALL.find((need) => need.id === id);
const onlyOf = (list) => list.filter((entry) => entry.needs.length === 1 && entry.needs[0] !== "no-rules").length;

// Besides the items' own text: work this index can't read from the items, kept here by hand (dated).
const BESIDES = [
    "**The simulator** plays the items' plans through the core. Its code (PF2e Combat Simulator 0.18.0) reads none of these newer plan fields: `placed` (a creature moved to a space its user picks), `alsoRetaliation`, the around saves' `moveFrom`, `ifTarget` (results by creature kind), `userEffects`, `item.regain`, `item.placedLight`, `item.move`. That work is the auto-combat session's, asked when it's wanted. *(2026-10-25)*",
    "**The ability module's minimum** in module.json is 0.9.0; ability 0.9.2 is needed for pushes measured from the creature a Strike hits and for creatures moved to a space their user picks. Without it, those fall back to the GM's notes. Raising the minimum is your call at a release. *(2026-10-25)*",
    "**The spell module's items** (scrolls, wands, staves, spellhearts, and the casts and item spellshapes it claims) are its own work, not in this index: docs/census.md counts them.",
    "**Live checks** (`tools/live-check.mjs`, 350 cases, all passing on 2026-10-25): the pieces built last without a case of their own are Emergency Escape Shield's teleport, Panacea Fruit's counteract sentence and Transposition Ammunition (Greater)'s creatures along (a note). *(2026-10-25)*"
];

const lines = [
    "# What the items still need",
    "",
    `Generated by \`tools/needs.mjs\` on ${generated}. Every consumable and permanent item activation whose card doesn't do all its text yet (its plan *partial*, *note only*, *nothing read*, or *the GM's* no-effect), sorted by what its card would need to do the rest. \`reports/needs.json\` has every PF2e entry with all its needs; the installed modules' items are counted here and named in \`.cache/needs-third-party.json\`, which git ignores.`,
    "",
    "How an item is sorted: the words its card leaves over (its notes, unread sentences, GM lines and note Effects; for one nothing reads, its own text) are matched against each need's words in `tools/needs-rules.mjs`. An item gets every need its words show. Its **main** need is the first in the table's order, the most particular first, so a Strike that also needs a creature summoned is listed under creatures. The sorting reads words, not rules, so an item can sit under a need it mentions only in passing.",
    "",
    `- **PF2e:** ${pf2e.length} entries (${byKind(pf2e, "consumable")} consumables, ${byKind(pf2e, "activation")} activations): ${Object.entries(pf2eTotals.results).map(([result, count]) => `${count} ${RESULT_WORD[result] ?? result}`).join(", ")}.`,
    `- **Installed modules:** ${thirdParty.length} entries (${byKind(thirdParty, "consumable")} consumables, ${byKind(thirdParty, "activation")} activations): ${Object.entries(thirdTotals.results).map(([result, count]) => `${count} ${RESULT_WORD[result] ?? result}`).join(", ")}.`,
    "",
    "## The needs",
    "",
    "| Need | Main need of (PF2e) | Any need of (PF2e) | Modules' items (main) | Where the work lies |",
    "|---|---:|---:|---:|---|",
    ...ALL.map((need) => `| [${need.title}](#${need.id}) | ${pf2eTotals.main[need.id] ?? 0} | ${pf2eTotals.any[need.id] ?? 0} | ${thirdTotals.main[need.id] ?? 0} | ${need.where} |`),
    "",
    "## The worklist",
    "",
    "What to build, biggest first: each need with the PF2e entries whose main need it is, how many it alone keeps from being done (*done by it alone*: no other need), and its biggest groups by the words that show it (each need's section has them all). The modules' items are counted apart.",
    "",
    "| Need | Entries | Done by it alone | Modules' items | Where | Its biggest groups |",
    "|---|---:|---:|---:|---|---|",
    ...ALL.filter((need) => need.id !== "no-rules" && pf2eTotals.main[need.id]).sort((a, b) => (pf2eTotals.main[b.id] ?? 0) - (pf2eTotals.main[a.id] ?? 0)).map((need) => {
        const own = groups.filter((group) => group.need === need.id && group.entries.length >= 2).slice(0, 4).map((group) => `${group.phrase ? `"${group.phrase}"` : "its own text"} ${group.entries.length}`);
        return `| [${need.title}](#${need.id}) | ${pf2eTotals.main[need.id] ?? 0} | ${onlyOf(pf2e.filter((entry) => entry.needs[0] === need.id))} | ${thirdTotals.main[need.id] ?? 0} | ${need.where} | ${own.join(", ") || "—"} |`;
    }),
    "",
    `Done by one need alone, all needs together: ${onlyOf(pf2e)} of the ${pf2e.length} PF2e entries; the rest need two or more.`,
    "",
    "## Your decisions",
    "",
    "The needs whose work starts with a ruling of yours: what a card should do when the item's text gives no game numbers to apply. The spells' rules already decided some of these (information whispered to the GM and the caster, disbelief played as control, out-of-combat consumables left as they are); applying them to items would count those entries done.",
    "",
    "| Need | PF2e entries (main) | Done by it alone | The question |",
    "|---|---:|---:|---|",
    ...ALL.filter((need) => need.where.includes("your decision")).map((need) => `| [${need.title}](#${need.id}) | ${pf2eTotals.main[need.id] ?? 0} | ${onlyOf(pf2e.filter((entry) => entry.needs[0] === need.id))} | ${need.question ?? need.needs} |`),
    "",
    `Answered, these would finish up to ${ALL.filter((need) => need.where.includes("your decision")).reduce((sum, need) => sum + onlyOf(pf2e.filter((entry) => entry.needs[0] === need.id)), 0)} PF2e entries outright (the ones with no other need); the rest also need building.`,
    "",
    "## Besides the items",
    "",
    ...BESIDES.map((line) => `- ${line}`),
    ...(pf2e.some((entry) => entry.result === "gaps" || entry.result === "error") ? ["", `Entries the core can't resolve (gaps) or that failed to compile: ${pf2e.filter((entry) => ["gaps", "error"].includes(entry.result)).map(label).join(", ")}.`] : ["", "No entry has core gaps or a compile error."]),
    "",
    "## Where the work lies",
    "",
    "By the first place each main need's work lies: the item module's reader (src/compiler, new readings), its live play (scripts, cards and hooks), the ability module or the core (asked of their session), the spell module, or a decision of yours.",
    "",
    "| Where | PF2e entries (main need) | Needs |",
    "|---|---:|---|",
    ...Object.entries(ALL.reduce((counts, need) => ({ ...counts, [need.where.split(" + ")[0]]: (counts[need.where.split(" + ")[0]] ?? 0) + (pf2eTotals.main[need.id] ?? 0) }), {})).sort((a, b) => b[1] - a[1]).map(([where, count]) => `| ${where} | ${count} | ${ALL.filter((need) => need.where.split(" + ")[0] === where).map((need) => need.title.toLowerCase()).join("; ")} |`),
    "",
    "## Who can do it",
    "",
    "By every need an entry has (not only its main one):",
    "",
    "| | PF2e entries |",
    "|---|---:|",
    ...whoCan(pf2e).map(([what, count]) => `| ${what} | ${count} |`),
    "",
    "## By need",
    "",
    "Each need: what would make it work, then the PF2e entries whose main need it is, grouped by the words that show it (the result now, then their other needs; *only this need* marks the entries it alone keeps from being done).",
    ""
];
for (const need of ALL) {
    const main = pf2e.filter((entry) => entry.needs[0] === need.id).sort((a, b) => label(a).localeCompare(label(b)));
    lines.push(`<a id="${need.id}"></a>`, `### ${need.title}`, "", `${need.needs} *Where: ${need.where}.*`, "", `${main.length} entries${thirdTotals.main[need.id] ? ` (and ${thirdTotals.main[need.id]} of the modules' items)` : ""}.`, "");
    const line = (entry, withPhrase = false) => {
        const others = entry.needs.slice(1).map((id) => ALL.find((candidate) => candidate.id === id)?.title.toLowerCase() ?? id);
        return `- ${label(entry)}${withPhrase && entry.phrase ? ` ("${entry.phrase}")` : ""}: ${RESULT_WORD[entry.result] ?? entry.result}${others.length ? `; also ${others.join(", ")}` : entry.needs[0] !== "no-rules" ? "; *only this need*" : ""}`;
    };
    const own = workGroups(main);
    const big = own.filter((group) => group.entries.length >= 2);
    const small = own.filter((group) => group.entries.length < 2).flatMap((group) => group.entries).sort((a, b) => label(a).localeCompare(label(b)));
    for (const group of big) {
        lines.push(`**${group.phrase ? `"${group.phrase}"` : "Its own text"}**: ${group.entries.length} (${group.only} only this need)`, "");
        for (const entry of group.entries.sort((a, b) => label(a).localeCompare(label(b)))) lines.push(line(entry));
        lines.push("");
    }
    if (small.length) {
        lines.push(`**${big.length ? "Other wordings" : "Its entries"}**: ${small.length} (${onlyOf(small)} only this need)`, "");
        for (const entry of small) lines.push(line(entry, true));
        lines.push("");
    }
}
lines.push("## The installed modules' items", "", "Counts by module and main need; the names are in `.cache/needs-third-party.json`.", "");
const modules = [...new Set(thirdParty.map((entry) => entry.module))].sort();
const usedNeeds = ALL.filter((need) => thirdTotals.main[need.id]);
lines.push(`| Module | Entries | ${usedNeeds.map((need) => need.id).join(" | ")} |`, `|---|---:|${usedNeeds.map(() => "---:").join("|")}|`);
for (const module of modules) {
    const list = thirdParty.filter((entry) => entry.module === module);
    const main = tally(list, (entry) => entry.needs[0]);
    lines.push(`| ${module} | ${list.length} | ${usedNeeds.map((need) => main[need.id] ?? 0).join(" | ")} |`);
}
lines.push("");
writeFileSync(path.join(root, "docs/needs.md"), `${lines.join("\n")}\n`);
console.log(`PF2e ${pf2e.length} entries, installed modules ${thirdParty.length}; docs/needs.md, reports/needs.json, .cache/needs-third-party.json`);
