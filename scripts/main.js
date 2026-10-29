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
import { setUpDeactivated } from "./deactivated.js";
import { setUpToggleOff } from "./toggle-off.js";
import { setUpCastDurations } from "./cast-duration.js";
import { setUpShieldShare } from "./shield-share.js";
import { setUpTurnHeals } from "./turn-heal.js";
import { setUpShieldRepair } from "./shield-repair.js";
import { setUpBonds } from "./bonds.js";
import { setUpEndEarly } from "./end-early.js";
import { setUpSlainWait } from "./slain-wait.js";
import { setUpPausedItem } from "./paused-item.js";
import { setUpMarkEnds } from "./mark-ends.js";
import { setUpDoomHex } from "./doom-hex.js";
import { setUpPossession } from "./possession.js";
import { setUpLifedrink } from "./lifedrink.js";
import { setUpDropHeld } from "./drop-held.js";
import { setUpMoveDamage } from "./move-damage.js";
import { setUpFootDamage } from "./foot-damage.js";
import { setUpEndsOnHostile } from "./ends-on-hostile.js";
import { setUpBleedGrows } from "./bleed-grows.js";
import { setUpPreventCondition } from "./prevent-condition.js";
import { setUpHalfDamage } from "./half-damage.js";
import { setUpHealAfter } from "./heal-after.js";
import { setUpHealingUses } from "./healing-uses.js";
import { setUpEndsOn } from "./ends-on.js";
import { setUpThenFor } from "./then-for.js";
import { setUpUntilRest } from "./until-rest.js";
import { setUpAfterDamage } from "./after-damage.js";
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
import { setUpUninvest } from "./uninvest.js";
import { setUpInitiativeThrice } from "./initiative-thrice.js";
import { setUpHitCounteract } from "./hit-counteract.js";
import { setUpSoulBinding } from "./soul-binding.js";
import { setUpImplosion } from "./implosion.js";
import { setUpOwnSplash } from "./own-splash.js";
import { setUpReadiedRefund } from "./strikes.js";
import { setUpUserAfter } from "./user-after.js";
import { setUpPulses } from "./pulse.js";
import { setUpTransmogrify } from "./transmogrify.js";
import { setUpTurnAuras } from "./turn-auras.js";
import { setUpSwaps } from "./swap.js";
import { setUpGrantedSpells } from "./grimoire.js";
import { setUpAfterRest } from "./after-rest.js";
import { setUpSphere, sphereTouched } from "./sphere.js";
import { setUpCube } from "./cube.js";
import { setUpDecoyDouble } from "./decoy-double.js";
import { setUpPairedStone } from "./paired-stone.js";
import { setUpSkillSwap } from "./skill-swap.js";
import { setUpTrails } from "./trails.js";
import { setUpAdjacentBonus } from "./adjacent-bonus.js";
import { setUpArcaneDrain } from "./arcane-drain.js";
import { setUpPortals } from "./portals.js";
import { setUpSouls } from "./souls.js";
import { setUpLensPossession } from "./lens-possession.js";
import { setUpReservoir } from "./reservoir.js";
import { setUpBackbiting } from "./backbiting.js";

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
        spells = pack ? spellIndex([...(await pack.getIndex({ fields: ["system.area", "system.target", "system.ritual", "system.level.value", "system.traits.value", "system.duration", "system.range", "system.traits.rarity", "system.traits.traditions", "system.publication.title", "system.defense"] }))]) : {};
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
    // (Its user no longer invested once its attack hits, Ochre Fulcrum Lens' possession: scripts/uninvest.js.)
    setUpUninvest();
    // (An initiative rolled three times, the best kept, The Dance's: scripts/initiative-thrice.js.)
    setUpInitiativeThrice();
    // (A counteract card at the creature an attack hit, kept for when it tries to get away, Halcyon Heart's net: scripts/hit-counteract.js.)
    setUpHitCounteract();
    // (A weapon's soul binding when its damage fells a sapient creature of its level, Whisperer of Souls': scripts/soul-binding.js.)
    setUpSoulBinding();
    // (An item's own attack's splash, Lady's Chalice's: scripts/own-splash.js.)
    setUpOwnSplash();
    // (A readied Strike never made, Flashblade's: its activation's use given back, scripts/strikes.js.)
    setUpReadiedRefund();
    // (Damage each round around an item's user, then its blast: Aroden's Hearthstone's cold, scripts/pulse.js.)
    setUpPulses();
    // (The actions a transmogrifying mutagen gave, gone with its Effect: scripts/transmogrify.js.)
    setUpTransmogrify();
    // (The saves an item's Effect calls for at creatures' turns near its bearer, Clockwork Sun's: scripts/turn-auras.js.)
    setUpTurnAuras();
    // (Places traded after a failed save, Planar Ribbon's: scripts/swap.js.)
    setUpSwaps();
    // (A spell granted for the day gone at the next rest, with its copies: scripts/grimoire.js.)
    setUpGrantedSpells();
    // (A save at a user's next rest, Vile Remnant's nightmares: scripts/after-rest.js.)
    setUpAfterRest();
    // (A sphere its user controls and what it touches destroyed, Sphere of Annihilation's: scripts/sphere.js.)
    setUpSphere();
    // (A cube's walls and the cubes it makes inert, Cube of Nex's: scripts/cube.js.)
    setUpCube();
    // (A double that takes what's aimed at its user, Shadewither Key's: scripts/decoy-double.js.)
    setUpDecoyDouble();
    // (Creatures teleported to a paired stone once its save card is applied, Jahan Waystone's: scripts/paired-stone.js.)
    setUpPairedStone();
    // (Two skills' ranks swapped for a while, The Trader's: scripts/skill-swap.js.)
    setUpSkillSwap();
    // (The difficult terrain its user's Strides leave while an Effect lasts, Instinct Crown (Breach)'s: scripts/trails.js, 2026-10-28.)
    setUpTrails();
    // (A bonus for each adjacent enemy, Vambrace of Gorum's Blade of Iron: scripts/adjacent-bonus.js.)
    setUpAdjacentBonus();
    // (A creature's spell or slot lost once its save card is applied, Belimarius's Invidious Halberd's Absorb Arcana: scripts/arcane-drain.js.)
    setUpArcaneDrain();
    // (Linked portals, Mountebank's Passage's: scripts/portals.js.)
    setUpPortals();
    // (Souls a weapon keeps from its kills, Reaper's Grasp's: scripts/souls.js.)
    setUpSouls();
    // (An item's essence possessing the creature it hits, Crimson Fulcrum Lens's: scripts/lens-possession.js.)
    setUpLensPossession();
    // (A weapon's poison reservoir, Reaper's Lancet's: scripts/reservoir.js.)
    setUpReservoir();
    // (A worn Impact Foam Chassis used up after the environment module's fall, its foam around the creature: scripts/falls.js.)
    setUpFoam();
    // (An Effect each hit of its types shortens, Bone Dreadnought Plate's: scripts/shorten-on-hit.js.)
    setUpShortenOnHit();
    // (Healing a damage type pauses to the end of the next turn, Troll Hide's: scripts/deactivated.js.)
    setUpDeactivated();
    // (A healing of an item's own back on once its Effect ends: scripts/toggle-off.js.)
    setUpToggleOff();
    // (A cast's Effects at the item's duration, Dust of Disappearance's minute: scripts/cast-duration.js.)
    setUpCastDurations();
    // (A shield that takes what gets through too, Resolute Shield's: scripts/shield-share.js.)
    setUpShieldShare();
    // (Healing at the end of each of its user's turns beside a cast, Enveloping Light's: scripts/turn-heal.js.)
    setUpTurnHeals();
    // (Its wearer's shields repaired at each turn's start, Forgefather's Seal's — until its Seal of Mending stops it: scripts/shield-repair.js.)
    setUpShieldRepair();
    // (A bonded creature's condition its user may counter, The Marriage's: scripts/bonds.js.)
    setUpBonds();
    // (An item's effect a creature ends early, Fire-Douse Snare's flat checks: scripts/end-early.js.)
    setUpEndEarly();
    // (A conjured creature slain that its item then waits for, a Wondrous Figurine's week: scripts/slain-wait.js.)
    setUpSlainWait((item) => compileActivations(dataOf(item), options()));
    // (An item that gives none of its other benefits while the creature it became is out, Horns of Naraga: invested again once it's gone.)
    setUpPausedItem();
    // (A mark that ends as its creature dies, Hunter's Dawn's: scripts/mark-ends.js.)
    setUpMarkEnds();
    // (A curse that holds its creature unconscious for a day, then a save or it dies, Hex Blaster's: scripts/doom-hex.js.)
    setUpDoomHex();
    // (An item whose essence possesses the creature it hits, its user uninvested meanwhile — Emerald Fulcrum Lens: scripts/possession.js.)
    setUpPossession();
    // (A weapon's runes raised for good as its critical hit slays, Meloth's Lifedrinker's: scripts/lifedrink.js.)
    setUpLifedrink();
    // (What a creature drops of what it holds, Deadweight Snare's metal items: scripts/drop-held.js.)
    setUpDropHeld();
    // (A weapon's backbiting curse, The Liar's: its critically failed Strikes hit its wielder — scripts/backbiting.js.)
    setUpBackbiting();
    // (Damage each time a creature moves farther than half its Speed, Poison Barbs Snare's barbs: scripts/move-damage.js.)
    setUpMoveDamage();
    // (Damage back each time its foot Strike deals damage, Hoof Stakes Snare's stakes: scripts/foot-damage.js.)
    setUpFootDamage();
    // (An Effect ended by its creature's hostile action or long move, Camouflage Dye's: scripts/ends-on-hostile.js.)
    setUpEndsOnHostile();
    // (A persistent bleed that grows with each failure to stop it, Bloodgorger Scythe's: scripts/bleed-grows.js.)
    setUpBleedGrows();
    setUpPreventCondition();
    // (Half the triggering attack's damage, Laurel of the Empath's: scripts/half-damage.js.)
    setUpHalfDamage();
    setUpHealAfter();
    // (An Effect's extra healing counted down, Medicinal Hotpot's three: scripts/healing-uses.js, 2026-10-28.)
    setUpHealingUses();
    // (A shrink whose steps a save at each of its creature's turns moves, Implosion Dust's: scripts/implosion.js.)
    setUpImplosion();
    setUpEndsOn();
    // (Penalties for a while after a persistent damage ends, Secret-Keeper's Mask (Father Skinsaw)'s: scripts/then-for.js.)
    setUpThenFor();
    // (What its user gets once its card is applied, by the creature's result, Soulfeeding Mask's Quickened: scripts/user-after.js.)
    setUpUserAfter();
    // (Effects until their creature's next daily preparations, Terrain Adaptation's: scripts/until-rest.js.)
    setUpUntilRest();
    // (A save card after another's damage, Horn of Rust's tetanus: scripts/after-damage.js.)
    setUpAfterDamage();
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
    if (module) module.api = Object.freeze({ compileItem: compile, handlesItem: handles, temperatureProtections, fallEases, weatherIgnores, sphereTouched, live: Object.freeze({ apply: applyMessage, activate: (itemUuid, index) => activate(itemUuid, index, game.user.id), etch: etchRune }) });
});
