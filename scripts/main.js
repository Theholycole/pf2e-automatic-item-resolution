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
import { setUpCastDurations } from "./cast-duration.js";
import { setUpShieldShare } from "./shield-share.js";
import { setUpTurnHeals } from "./turn-heal.js";
import { setUpEndEarly } from "./end-early.js";
import { setUpDropHeld } from "./drop-held.js";
import { setUpMoveDamage } from "./move-damage.js";
import { setUpFootDamage } from "./foot-damage.js";
import { setUpPreventCondition } from "./prevent-condition.js";
import { setUpHalfDamage } from "./half-damage.js";
import { setUpHealAfter } from "./heal-after.js";
import { setUpEndsOn } from "./ends-on.js";
import { ownerOf } from "./foundry.js";
import { registerSpendSettings } from "./spend.js";
import { registerItemDCSettings } from "./item-dcs.js";
import { setUpImmunityAfter } from "./immunity.js";
import { setUpExpiringItems } from "./expiring.js";
import { setUpArmed } from "./armed.js";
import { setUpShieldTemp } from "./shield-temp.js";
import { setUpLater } from "./later.js";
import { setUpAfflictedTurns } from "./afflicted-turns.js";
import { setUpFelled } from "./felled.js";
import { setUpOwnSplash } from "./own-splash.js";
import { setUpReadiedRefund } from "./strikes.js";

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
        spells = pack ? spellIndex([...(await pack.getIndex({ fields: ["system.area", "system.target", "system.ritual", "system.level.value", "system.traits.value", "system.duration", "system.range"] }))]) : {};
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
    // (Items it made that wither after a time, Verdant Branch's fruits: scripts/expiring.js.)
    setUpExpiringItems();
    // (An item waiting on its wearer for a kind of damage, Flame Layer Balm's: scripts/armed.js.)
    setUpArmed();
    // (A shield's own temporary Hit Points, Ablative Shield Plating's: scripts/shield-temp.js.)
    setUpShieldTemp();
    // (A row's conditions at the end of the creature's next turn, Nap Gas Dispenser's: scripts/later.js.)
    setUpLater();
    // (A roll at each of an afflicted creature's turns, Blackfinger Blight's: scripts/afflicted-turns.js.)
    setUpAfflictedTurns();
    // (A reward for felling the creature marked, Doom Switch's Bragging Rights: scripts/felled.js.)
    setUpFelled();
    // (An item's own attack's splash, Lady's Chalice's: scripts/own-splash.js.)
    setUpOwnSplash();
    // (A readied Strike never made, Flashblade's: its activation's use given back, scripts/strikes.js.)
    setUpReadiedRefund();
    // (A worn Impact Foam Chassis used up after the environment module's fall, its foam around the creature: scripts/falls.js.)
    setUpFoam();
    // (An Effect each hit of its types shortens, Bone Dreadnought Plate's: scripts/shorten-on-hit.js.)
    setUpShortenOnHit();
    // (A healing of an item's own back on once its Effect ends: scripts/toggle-off.js.)
    setUpToggleOff();
    // (A cast's Effects at the item's duration, Dust of Disappearance's minute: scripts/cast-duration.js.)
    setUpCastDurations();
    // (A shield that takes what gets through too, Resolute Shield's: scripts/shield-share.js.)
    setUpShieldShare();
    // (Healing at the end of each of its user's turns beside a cast, Enveloping Light's: scripts/turn-heal.js.)
    setUpTurnHeals();
    // (An item's effect a creature ends early, Fire-Douse Snare's flat checks: scripts/end-early.js.)
    setUpEndEarly();
    // (What a creature drops of what it holds, Deadweight Snare's metal items: scripts/drop-held.js.)
    setUpDropHeld();
    // (Damage each time a creature moves farther than half its Speed, Poison Barbs Snare's barbs: scripts/move-damage.js.)
    setUpMoveDamage();
    // (Damage back each time its foot Strike deals damage, Hoof Stakes Snare's stakes: scripts/foot-damage.js.)
    setUpFootDamage();
    setUpPreventCondition();
    // (Half the triggering attack's damage, Laurel of the Empath's: scripts/half-damage.js.)
    setUpHalfDamage();
    setUpHealAfter();
    setUpEndsOn();
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
