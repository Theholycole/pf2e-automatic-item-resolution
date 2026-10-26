// PF2e Automatic Item Resolution: registers the item compiler with the
// resolution core, so the core's users (the Combat Simulator, live play) get a
// plan for a consumable from registry.planFor(item), and plays the items'
// confirmation cards after PF2e's own Use (scripts/live.js, docs/design.md).

import { compileItem, handlesItem, spellEffectIndex, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { equipmentEffectIndex } from "../src/compiler/degree-effects.js";
import { etchedRuneActivations, runeIndex } from "../src/compiler/runes.js";
import { etchedCritRiders } from "../src/compiler/rune-strikes.js";
import { applyMessage, setUpLivePlay } from "./live.js";
import { activate } from "./activations.js";
import { setUpGenericItems } from "./generic-items.js";
import { setUpPlacedLights } from "./placed-light.js";
import { setUpPlacedMoves } from "./placed-moves.js";
import { setUpMadeWeapons } from "./objects.js";
import { temperatureProtections } from "./temperature.js";
import { fallEases, setUpFallOffers, setUpFoam } from "./falls.js";
import { weatherIgnores } from "./weather.js";
import { fallLine } from "../src/live/card.js";
import { etchRune, setUpEtching } from "./etching.js";
import { setUpHPFloor } from "./hp-floor.js";
import { setUpDrain } from "./drain.js";
import { setUpAfterEnds } from "./after-ends.js";
import { setUpShortenOnHit } from "./shorten-on-hit.js";
import { setUpToggleOff } from "./toggle-off.js";
import { ownerOf } from "./foundry.js";
import { registerSpendSettings } from "./spend.js";
import { registerItemDCSettings } from "./item-dcs.js";
import { setUpImmunityAfter } from "./immunity.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY_ID = "pf2e-automatic-ability-resolution";
const SPELL_ID = "pf2e-automatic-resolution";

// The ability module's compiled basic actions (the riders some items' text names).
const basicActions = () => game.modules.get(ABILITY_ID)?.api?.basicActions ?? {};
// PF2e's spell Effects by spell name ("the effects of Haste" → Spell Effect: Haste), from its spell-effects pack's index.
let spellEffects = {};
// PF2e's spells by name (a cast in words: "The armor casts mislead"), from its spells pack's index.
let spells = {};
// PF2e's equipment Effects' durations by uuid (a degree row's own Effect, src/compiler/degree-effects.js), from its
// equipment-effects pack's index.
let itemEffects = {};
// PF2e's rune items by the key a weapon or armor keeps ("vorpal", "greaterExtending"), for the activations of etched runes
// (src/compiler/runes.js).
let runes = new Map();
// Other modules' own Effects' rules by uuid, and PF2e's condition names by id: an item's linked Effect checked against its text
// when it's compiled, its text read instead when they don't match (src/compiler/unverified-links.js).
let moduleEffects = new Map();
let conditionNames = null;
const moduleEffect = (uuid) => moduleEffects.get(uuid) ?? null;

// A Foundry item as plain data, keeping its uuid (the compiler is pure).
// (Its owner's level too, for the amounts that grow with it: src/compiler/item-data.js byOwnerLevel.)
const dataOf = (item) => (typeof item?.toObject === "function" ? { ...item.toObject(false), uuid: item.uuid, ...ownerOf(item.actor) } : item);

// The spell module's claims (its api, when it's active): an item it acts on is left to it.
const spellApi = () => (game.modules.get(SPELL_ID)?.active ? game.modules.get(SPELL_ID)?.api ?? null : null);
const claims = (item) => spellApi()?.claims?.(item) === true;
// (Why it claims one, and what its item spellshape and item cast readers read there: an item it shares, its other activations this module's —
// src/compiler/index.js spellModuleShare.)
const claimsWhy = (item) => spellApi()?.claimsWhy?.(item) ?? [];
const spellModuleReads = (item) => {
    const api = spellApi();
    if (typeof api?.itemShapes?.read !== "function" || typeof api?.itemCasts?.read !== "function") return null;
    return { shapes: (api.itemShapes.read(item)?.activations ?? []).map((activation) => activation.label), casts: (api.itemCasts.read(item)?.casts ?? []).map((cast) => cast.uuid) };
};
const options = () => ({ basicActions: basicActions(), spellEffects, spells, claims, claimsWhy, spellModuleReads, itemEffects, moduleEffect, ...(conditionNames ? { conditionNames } : {}) });

const compile = (item) => compileItem(dataOf(item), options());
const handles = (item) => handlesItem(dataOf(item), { claims });

// Its settings: Hero Points for the Mythic Points items cost (scripts/spend.js).
Hooks.once("init", () => {
    registerSpendSettings();
    registerItemDCSettings();
});

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
        const pack = game.packs.get("pf2e.equipment-effects");
        itemEffects = pack ? equipmentEffectIndex([...(await pack.getIndex({ fields: ["system.duration"] }))].map((entry) => ({ ...entry, uuid: entry.uuid ?? `Compendium.pf2e.equipment-effects.Item.${entry._id}` }))) : {};
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's equipment Effects couldn't be indexed.`, error);
    }
    try {
        const pack = game.packs.get("pf2e.spells-srd");
        spells = pack ? spellIndex([...(await pack.getIndex({ fields: ["system.area", "system.target", "system.ritual", "system.level.value", "system.traits.value"] }))]) : {};
    } catch (error) {
        console.warn(`${MODULE_ID} | PF2e's spells couldn't be indexed.`, error);
    }
    try {
        const pack = game.packs.get("pf2e.conditionitems");
        conditionNames = pack ? Object.fromEntries([...(await pack.getIndex())].map((entry) => [entry._id, entry.name])) : null;
        const found = new Map();
        for (const pack of game.packs.filter((entry) => entry.documentName === "Item" && entry.metadata?.packageType === "module")) {
            for (const entry of await pack.getIndex({ fields: ["type", "system.rules"] })) {
                if (entry.type === "effect") found.set(entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`, { name: entry.name, rules: entry.system?.rules ?? [] });
            }
        }
        moduleEffects = found;
    } catch (error) {
        console.warn(`${MODULE_ID} | Other modules' Effects couldn't be indexed.`, error);
    }
    // (The generic spellgun and the gun staff ask for what they are when they first go into an inventory: scripts/generic-items.js.)
    setUpGenericItems();
    // (A light an item puts in a square, removed when its time is up: scripts/placed-light.js.)
    setUpPlacedLights();
    setUpPlacedMoves();
    // (A weapon an item made that lasts while it's held: scripts/objects.js.)
    setUpMadeWeapons();
    // (Its fall reactions offered as the environment module's card means a fall: scripts/falls.js.)
    setUpFallOffers({ activations: (item) => compileActivations(dataOf(item), options()), consumable: (item) => compile(item), isActiveGM: () => game.users.activeGM?.isSelf ?? game.user.isGM, fallLine });
    // (A runestone's rune etched onto its owner's weapon, armor or shield: scripts/etching.js.)
    setUpEtching();
    // (An ally kept at 1 Hit Point through its next damage from a hazard or an enemy: scripts/hp-floor.js.)
    setUpHPFloor();
    // (A share of the damage a creature the card damaged then takes, as its user's temporary Hit Points: scripts/drain.js.)
    setUpDrain((item) => compileActivations(dataOf(item), options()));
    // (A condition that follows once another ends, Heart of Sarnax's: scripts/after-ends.js.)
    setUpAfterEnds();
    // (A temporary immunity from when an item card's Effect ends, Starsong Nectar's: scripts/immunity.js.)
    setUpImmunityAfter();
    // (A worn Impact Foam Chassis used up after the environment module's fall, its foam around the creature: scripts/falls.js.)
    setUpFoam();
    // (An Effect each hit of its types shortens, Bone Dreadnought Plate's: scripts/shorten-on-hit.js.)
    setUpShortenOnHit();
    // (A healing of an item's own back on once its Effect ends: scripts/toggle-off.js.)
    setUpToggleOff();
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
    // (temperatureProtections: what its items protect a creature from in heat and cold, for the environment module — synchronous,
    // scripts/temperature.js.)
    if (module) module.api = Object.freeze({ compileItem: compile, handlesItem: handles, temperatureProtections, fallEases, weatherIgnores, live: Object.freeze({ apply: applyMessage, activate: (itemUuid, index) => activate(itemUuid, index, game.user.id), etch: etchRune }) });
});
