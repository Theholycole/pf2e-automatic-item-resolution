#!/usr/bin/env node
// Census of the installed third-party modules' items (the "+" modules, Battlezoo): what the item module reads of their
// consumables, bombs and activations, and which card each gets — the PF2e censuses' method on their packs, read from
// LevelDB with no Foundry login. Their text is theirs: the rows (names, readings) go to .cache/census-third-party.json,
// which git ignores; docs/census-third-party.md has counts by module only. Starfinder copies (sf…, sf2e… packs) are left
// out.
//
// Usage: node tools/census-third-party.mjs [modulesDirectory]

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileBasicActions, BASIC_ACTIONS } from "../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { compileItem, handlesItem, spellEffectIndex, spellIndex } from "../src/compiler/index.js";
import { compileBomb, isBomb } from "../src/compiler/bombs.js";
import { compileActivations, handlesPermanent } from "../src/compiler/permanent.js";
import { plainText } from "../src/compiler/rows.js";
import { routeOf } from "../src/live/route.js";
import { verifyEffectRules } from "../src/compiler/verify-effect.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesDirectory = path.resolve(process.argv[2] ?? `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`);
const pf2ePacks = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);
const spellEffects = spellEffectIndex(readDocuments(path.join(pf2ePacks, "spell-effects")).filter((doc) => doc.collection === "items"));
const spells = spellIndex(readDocuments(path.join(pf2ePacks, "spells")).filter((doc) => doc.collection === "items"));
const basicActions = compileBasicActions(readDocuments(path.join(pf2ePacks, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
const options = { basicActions, spellEffects, spells, claims };

const GEAR = new Set(["consumable", "equipment", "weapon", "armor", "shield", "ammo", "backpack"]);
const STARFINDER = /^(?:sf|sf2e)[-_]/i;

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
const result = (plan) => (!plan ? "none" : plan.builtin ? `builtin:${plan.builtin}` : plan.noteOnly ? "note-only" : plan.partial ? "partial" : gapsOf(plan).length ? "gaps" : "resolves");

// The modules' item packs (LevelDB folders), not their Starfinder copies.
function itemPacks() {
    const packs = [];
    for (const module of readDirectory(modulesDirectory)) {
        const manifest = path.join(modulesDirectory, module, "module.json");
        if (!existsSync(manifest)) continue;
        let data;
        try {
            data = JSON.parse(readFileSync(manifest, "utf8"));
        } catch {
            continue;
        }
        if (["pf2e-automatic-item-resolution", "pf2e-automatic-resolution", "pf2e-automatic-ability-resolution", "pf2e-resolution-core", "pf2e-combat-simulator", "pf2e-automatic-kineticist-resolution"].includes(module)) continue;
        for (const pack of data.packs ?? []) {
            if (pack.type !== "Item" || (pack.system && pack.system !== "pf2e") || STARFINDER.test(pack.name) || STARFINDER.test(path.basename(pack.path ?? ""))) continue;
            const directory = path.join(modulesDirectory, module, pack.path ?? "");
            if (existsSync(directory) && statSync(directory).isDirectory()) packs.push({ module, pack: pack.name, directory });
        }
    }
    return packs;
}
function readDirectory(directory) {
    try {
        return readdirSync(directory);
    } catch {
        return [];
    }
}

// A module's Effect by its full uuid ("Compendium.<module>.<pack>.Item.<id>"), from its pack, for the check against the
// item's text (src/compiler/verify-effect.js) that live play makes before applying it.
const packCache = new Map();
function moduleEffect(uuid) {
    const [, module, pack, , id] = String(uuid).split(".");
    const key = `${module}.${pack}`;
    if (!packCache.has(key)) {
        let docs = [];
        try {
            const data = JSON.parse(readFileSync(path.join(modulesDirectory, module, "module.json"), "utf8"));
            const entry = (data.packs ?? []).find((candidate) => candidate.name === pack);
            docs = entry ? readDocuments(path.join(modulesDirectory, module, entry.path)).filter((doc) => doc.collection === "items") : [];
        } catch {
            docs = [];
        }
        packCache.set(key, docs);
    }
    return packCache.get(key).find((doc) => doc._id === id) ?? null;
}
const conditionNames = Object.fromEntries(readDocuments(path.join(pf2ePacks, "conditions")).filter((doc) => doc.collection === "items").map((doc) => [doc._id, doc.name]));
// A plan's third-party Effects as live play would treat them: "unverified-effect" when one's rules don't match the text.
function verified(plan, resultName) {
    const linked = (plan?.resolution?.applications ?? []).filter((entry) => entry.verify);
    if (!linked.length || resultName !== "resolves") return resultName;
    return linked.every((entry) => {
        const effect = moduleEffect(entry.uuid);
        return effect && verifyEffectRules(effect.system?.rules ?? [], entry.verify, { conditionNames }).ok;
    }) ? "resolves" : "unverified-effect";
}

const rows = [];
for (const { module, pack, directory } of itemPacks()) {
    let docs = [];
    try {
        docs = readDocuments(directory).filter((doc) => doc.collection === "items" && GEAR.has(doc.type));
    } catch {
        continue;
    }
    for (const item of docs) {
        const base = { module, pack, name: item.name, type: item.type, category: item.system?.category ?? null };
        try {
            if (isBomb(item)) {
                const plan = compileBomb(item);
                rows.push({ ...base, kind: "bomb", result: plan ? "bomb-card" : "none" });
            } else if (item.type === "consumable") {
                if (!handlesItem(item, options)) {
                    rows.push({ ...base, kind: "consumable", result: "spell-module" });
                    continue;
                }
                const plan = compileItem(item, options);
                rows.push({ ...base, kind: "consumable", result: verified(plan, result(plan)), live: routeOf(plan, plainText(item.system?.description?.value)) ?? null });
            } else if (/<strong>\s*Activat/i.test(String(item.system?.description?.value ?? ""))) {
                if (!handlesPermanent(item, options)) {
                    rows.push({ ...base, kind: "activation", activation: null, result: "spell-module" });
                    continue;
                }
                for (const { activation, plan } of compileActivations(item, options)) rows.push({ ...base, kind: "activation", activation: activation.name, result: result(plan), live: routeOf(plan, plainText(activation.html)) ?? null });
            }
        } catch (error) {
            rows.push({ ...base, result: "error", error: error.message.slice(0, 160) });
        }
    }
}

const tally = (list, key) => list.reduce((counts, row) => ({ ...counts, [key(row)]: (counts[key(row)] ?? 0) + 1 }), {});
const modules = [...new Set(rows.map((row) => row.module))].sort();
const report = {
    generated: new Date().toISOString().slice(0, 10),
    claims: Boolean(claims),
    totals: { rows: rows.length, byKind: tally(rows, (row) => row.kind ?? "other"), results: tally(rows, (row) => row.result), live: tally(rows.filter((row) => row.kind !== "bomb"), (row) => row.live ?? "none") },
    rows
};
mkdirSync(path.join(root, ".cache"), { recursive: true });
writeFileSync(path.join(root, ".cache/census-third-party.json"), `${JSON.stringify(report, null, 1)}\n`);

const RESULTS = ["resolves", "unverified-effect", "partial", "note-only", "gaps", "builtin:cast-spell", "builtin:focus-point", "builtin:reroll", "builtin:roll-twice", "builtin:item-action", "builtin:zone", "builtin:no-effect", "bomb-card", "spell-module", "none", "error"];
const lines = [
    "# Third-party items: census",
    "",
    `Generated by \`tools/census-third-party.mjs\` on ${report.generated} from the installed modules' item packs (their Starfinder copies left out). Counts only: the rows, with the items' names, are in \`.cache/census-third-party.json\`, which git ignores, since the text is the modules' own. ${claims ? "The spell module's claims() leaves it what it reads." : "The spell module's claims() wasn't found this run."} A module's own linked Effect is checked against the item's text as live play checks it; *unverified-effect* counts those whose rules don't match, which get a note of the text instead.`,
    "",
    "| Module | Consumables | Bombs | Activations | " + RESULTS.join(" | ") + " | with a card |",
    `|---|---:|---:|---:|${RESULTS.map(() => "---:").join("|")}|---:|`,
    ...modules.map((module) => {
        const list = rows.filter((row) => row.module === module);
        const counts = tally(list, (row) => row.result);
        const carded = list.filter((row) => row.live || row.result === "bomb-card").length;
        return `| ${module} | ${list.filter((row) => row.kind === "consumable").length} | ${list.filter((row) => row.kind === "bomb").length} | ${list.filter((row) => row.kind === "activation").length} | ${RESULTS.map((name) => counts[name] ?? 0).join(" | ")} | ${carded} |`;
    }),
    ""
];
writeFileSync(path.join(root, "docs/census-third-party.md"), lines.join("\n"));
console.log(JSON.stringify(report.totals, null, 1));
