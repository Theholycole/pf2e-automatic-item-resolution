// PF2e Automatic Item Resolution: registers the item compiler with the
// resolution core, so the core's users (the Combat Simulator, live play) get a
// plan for a consumable from registry.planFor(item), and plays the items'
// confirmation cards after PF2e's own Use (scripts/live.js, docs/design.md).

import { compileItem, handlesItem, spellEffectIndex, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { etchedRuneActivations, runeIndex } from "../src/compiler/runes.js";
import { etchedCritRiders } from "../src/compiler/rune-strikes.js";
import { applyMessage, setUpLivePlay } from "./live.js";
import { activate } from "./activations.js";
import { setUpGenericItems } from "./generic-items.js";
import { etchRune, setUpEtching } from "./etching.js";
import { ownerOf } from "./foundry.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY_ID = "pf2e-automatic-ability-resolution";
const SPELL_ID = "pf2e-automatic-resolution";

// The ability module's compiled basic actions (the riders some items' text names).
const basicActions = () => game.modules.get(ABILITY_ID)?.api?.basicActions ?? {};
// PF2e's spell Effects by spell name ("the effects of Haste" → Spell Effect: Haste), from its spell-effects pack's index.
let spellEffects = {};
// PF2e's spells by name (a cast in words: "The armor casts mislead"), from its spells pack's index.
let spells = {};
// PF2e's rune items by the key a weapon or armor keeps ("vorpal", "greaterExtending"), for the activations of etched runes
// (src/compiler/runes.js).
let runes = new Map();

// A Foundry item as plain data, keeping its uuid (the compiler is pure).
// (Its owner's level too, for the amounts that grow with it: src/compiler/item-data.js byOwnerLevel.)
const dataOf = (item) => (typeof item?.toObject === "function" ? { ...item.toObject(false), uuid: item.uuid, ...ownerOf(item.actor) } : item);

// The spell module's claims (its api, when it's active): an item it acts on is left to it.
const claims = (item) => game.modules.get(SPELL_ID)?.active ? game.modules.get(SPELL_ID)?.api?.claims?.(item) === true : false;
const options = () => ({ basicActions: basicActions(), spellEffects, spells, claims });

const compile = (item) => compileItem(dataOf(item), options());
const handles = (item) => handlesItem(dataOf(item), { claims });

// Registered when the script loads, so the order modules load in doesn't matter.
Hooks.once("pf2eResolutionCoreReady", (core) => {
    core.registry.registerCompiler({ module: MODULE_ID, name: "items", handles, compile });
});

Hooks.once("ready", async () => {
    try {
        const pack = game.packs.get("pf2e.spell-effects");
        spellEffects = pack ? spellEffectIndex([...(await pack.getIndex())]) : {};
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's spell Effects couldn't be indexed.`, error);
    }
    try {
        const pack = game.packs.get("pf2e.spells-srd");
        spells = pack ? spellIndex([...(await pack.getIndex({ fields: ["system.area", "system.target", "system.ritual", "system.level.value"] }))]) : {};
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's spells couldn't be indexed.`, error);
    }
    // (The generic spellgun and the gun staff ask for what they are when they first go into an inventory: scripts/generic-items.js.)
    setUpGenericItems();
    // (A runestone's rune etched onto its owner's weapon, armor or shield: scripts/etching.js.)
    setUpEtching();
    try {
        const pack = game.packs.get("pf2e.equipment-srd");
        const ids = pack ? [...(await pack.getIndex({ fields: ["system.usage.value"] }))].filter((entry) => /^etched-onto/.test(entry.system?.usage?.value ?? "")).map((entry) => entry._id) : [];
        runes = ids.length ? runeIndex((await pack.getDocuments({ _id__in: ids })).map((doc) => dataOf(doc))) : new Map();
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's runes couldn't be indexed.`, error);
    }
    // (An item's own activations, then those of the runes etched onto it.)
    // (And a weapon's property runes on a critical hit: src/compiler/rune-strikes.js.)
    setUpLivePlay({ compileItem: compile, compileActivations: (item) => [...compileActivations(dataOf(item), options()), ...etchedRuneActivations(dataOf(item), runes, options())], claims: (item) => claims(dataOf(item)), runeRiders: (weapon) => etchedCritRiders(dataOf(weapon), runes) });
    const module = game.modules.get(MODULE_ID);
    // (live.apply(messageId, choices): a card applied from code — choices as its controls give them: { drinker }, { included },
    // { weapon }, { targets: [token uuids] }.)
    // (live.activate(itemUuid, index): a permanent item's activation, as its sheet button does — on the active GM's client.)
    if (module) module.api = Object.freeze({ compileItem: compile, handlesItem: handles, live: Object.freeze({ apply: applyMessage, activate: (itemUuid, index) => activate(itemUuid, index, game.user.id), etch: etchRune }) });
});
