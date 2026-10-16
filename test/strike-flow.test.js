// An item used by Striking, against the stand-in for Foundry: its card readies the user's next Strike; PF2e's attack
// roll then puts the riders on the target (a hit), posts the Strike's save, or spends it (a miss).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { riderFor, strikeLines, strikeRules } from "../src/live/strike-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 100 squares down.)
const foundry = await fakeFoundry();
const fighter = foundry.makeActor({ id: "strike-fighter", name: "Fighter", owners: ["player"] });
const foe = foundry.makeActor({ id: "strike-foe", name: "Foe" });
foundry.place(fighter, 0, 10000);
foundry.place(foe, 100, 10000);

const readied = () => fighter.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.strikeRider);

async function useCard(name) {
    const item = foundry.giveItem(fighter, source(name));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: item.type } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

// (A damage roll of a Strike, as PF2e's message: its context's options carry the weapon's.)
async function damage(options = ["item:melee"]) {
    const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "damage-roll", sourceType: "attack", outcome: "success", options, target: { actor: foe.uuid, token: foe.token.uuid } } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

async function attack(outcome, options = ["item:melee"]) {
    const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options, target: { actor: foe.uuid, token: foe.token.uuid } }, origin: { uuid: `${fighter.uuid}.Item.sword`, type: "weapon" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

test("the reading: a Strike's riders by degree, a save on a hit, and which Strike takes them", () => {
    const gem = compileItem(source("Fear Gem"));
    assert.equal(routeOf(gem), "strike");
    assert.deepEqual(strikeLines(gem), ["On a hit: frightened 1", "On a critical hit: frightened 2"]);
    const [beacon] = compileActivations(source("Duelist's Beacon"));
    assert.equal(routeOf(beacon.plan), "strike");
    assert.equal(beacon.plan.strike.save.resolution.check.against.value, 22);
    assert.deepEqual(beacon.plan.resolution.outcomes.success.effects, [], "the blinding is the save's, not the hit's");
    // A save at whoever's targeted gives way to the Strike's own on a hit (Aurochs' Might Tattoo).
    const charge = compileActivations(source("Aurochs' Might Tattoo (Lesser)")).find((entry) => entry.activation.name === "Aurochs Charge");
    assert.equal(routeOf(charge.plan), "strike");
    assert.equal(riderFor(gem, { ranged: true, outcome: "success" }), null, "a melee one waits for a melee Strike");
    assert.equal(riderFor(gem, { outcome: "failure" }), "spend");
});

test("Fear Gem: readied, then a hit frightens the target; a later miss spends the next one", async () => {
    const card = await useCard("Fear Gem");
    assert.equal(card.flags[MODULE_ID].card.kind, "strike");
    assert.match(card.content, /On a critical hit: frightened 2/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(readied().length, 1);
    assert.equal(readied()[0].system.duration.expiry, "turn-end");
    // A ranged Strike doesn't take a melee one.
    await attack("success", ["item:ranged"]);
    assert.equal(readied().length, 1, "still readied");
    const before = foundry.applied.length;
    await attack("criticalSuccess");
    assert.equal(readied().length, 0, "spent");
    const frightened = foundry.applied.slice(before).map((entry) => entry.change).find((change) => change.op === "condition");
    assert.deepEqual([frightened.slug, frightened.value, frightened.target], ["frightened", 2, "target"]);
    assert.equal(foundry.applied.slice(before).find((entry) => entry.change.op === "condition").state.targets[0].name, "Foe");
    // Again, and a miss.
    const again = await useCard("Fear Gem");
    await foundry.socket(SOCKET)({ action: "apply", messageId: again.id, userId: "player" });
    await settle();
    const count = foundry.applied.length;
    await attack("failure");
    assert.equal(readied().length, 0);
    assert.equal(foundry.applied.length, count, "nothing on a miss");
    assert.match(foundry.messages.at(-1).content, /missed; it's spent/);
});

test("Duelist's Beacon: its activation readies the Strike; a hit posts the target's save card", async () => {
    const beacon = foundry.giveItem(fighter, source("Duelist's Beacon"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: beacon.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, "the Strike card");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const before = foundry.posted.length;
    await attack("success");
    const posted = foundry.posted.slice(before)[0];
    assert.equal(posted?.plan.resolution.check.against.value, 22);
    assert.deepEqual(posted.tokens.map((token) => token.name), ["Foe"]);
});

const activation = (name, which = 0) => compileActivations(source(name))[which];

test("the reading: what a Strike adds — extra dice, a bonus, a damage type — and what it leaves as notes", () => {
    const mantle = activation("Mantle of the Tikbalang").plan;
    assert.equal(routeOf(mantle), "strike");
    assert.deepEqual(mantle.strike.damage, [{ diceNumber: 4, dieSize: "d6", category: null, damageType: "mental" }]);
    assert.deepEqual([mantle.strike.range, mantle.strike.own, mantle.strike.notes, mantle.partial], ["melee", false, [], undefined], "any melee Strike; nothing left over");
    const pick = activation("Pick of Arcane Accuracy").plan;
    assert.deepEqual(pick.strike.attack, { value: 1, type: "status" });
    assert.deepEqual(pick.strike.damage, [{ diceNumber: 1, dieSize: "d4", category: "persistent", damageType: "force" }]);
    assert.equal(pick.strike.own, true, "the pick's own Strike");
    // "An extra two dice of weapon damage": the weapon's own die; "counts as two attacks" a note.
    const piston = activation("Piston Gauntlets").plan;
    assert.deepEqual(piston.strike.damage.map((entry) => `${entry.diceNumber}${entry.dieSize}`), [`2${source("Piston Gauntlets").system.damage.die}`]);
    assert.match(piston.strike.notes.join(" "), /two attacks/);
    assert.equal(piston.partial, true);
    // "All damage from this Strike is fire damage and the target takes an additional 1d6 fire damage and 1d6 persistent fire damage."
    const iris = activation("Iris of the Sky").plan;
    assert.equal(iris.strike.alteration, "fire");
    assert.deepEqual(iris.strike.damage.map((entry) => [entry.diceNumber, entry.category, entry.damageType]), [[1, null, "fire"], [1, "persistent", "fire"]]);
    // A next Strike: its own damage, until the end of the next turn, only a hit spends it; the crit combination a note.
    const lash = activation("Venom Lash").plan;
    assert.deepEqual([lash.strike.until, lash.strike.missKeeps], ["next-turn-end", true]);
    assert.deepEqual(lash.strike.damage, [{ diceNumber: 2, dieSize: "d6", category: "persistent", damageType: "poison" }]);
    assert.match(lash.strike.notes.join(" "), /critically succeeds/);
    // A trigger's Strike that already hit, its dice by the club's striking rune.
    const club = source("Kinetic Club");
    assert.deepEqual(activation("Kinetic Club").plan.strike.damage[0].diceNumber, (Number(club.system.runes?.striking) || 0) >= 2 ? 2 : 1);
    assert.equal(activation("Kinetic Club").plan.strike.hit, true);
    const greater = compileActivations({ ...club, system: { ...club.system, runes: { ...(club.system.runes ?? {}), striking: 2 } } })[0].plan;
    assert.equal(greater.strike.damage[0].diceNumber, 2, "a greater striking rune: 2d6");
    // Two unarmed Strikes, each with the dice.
    const wraps = activation("Amphisbaena Handwraps").plan;
    assert.deepEqual([wraps.strike.uses, wraps.strike.unarmed, wraps.strike.own], [2, true, false]);
    // A jaws Strike's other dice: a note, not read.
    assert.match(activation("Crimson Fulcrum Lens").plan.strike.notes.join(" "), /jaws/);
    // Damage only under a condition ("If your last action was to Stride …, this does an additional 1d4 force damage"): not read.
    assert.equal(compileActivations(source("Chimera Flail")).find((entry) => entry.activation.name === "Pouncing Whirl").plan, null);
    // A trigger's hit with a save: the save at the creature struck, its critical failure its own ("(Stupefied 2 on a critical failure)").
    const sap = activation("Spore Sap").plan;
    assert.equal(sap.resolution.check.roll, "save");
    assert.deepEqual(sap.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value, effect.duration?.unit]), [["stupefied", 2, "minutes"]]);
});

test("the readied Strike's PF2e rules: dice on its weapon's damage, the bonus on its attack, a damage type", () => {
    const pick = activation("Pick of Arcane Accuracy").plan;
    const rules = strikeRules(pick, { weaponId: "pick1", label: "Pick of Arcane Accuracy" });
    assert.deepEqual(rules.map((rule) => [rule.key, rule.selector]), [["DamageDice", "pick1-melee-damage"], ["FlatModifier", "pick1-attack"]]);
    assert.deepEqual([rules[0].diceNumber, rules[0].dieSize, rules[0].damageType, rules[0].category], [1, "d4", "force", "persistent"]);
    assert.deepEqual([rules[1].type, rules[1].value, rules[1].predicate], ["status", 1, ["item:melee"]]);
    assert.deepEqual(strikeRules(activation("Mantle of the Tikbalang").plan).map((rule) => rule.selector), ["melee-strike-damage"]);
    assert.deepEqual(strikeRules(activation("Amphisbaena Handwraps").plan).map((rule) => rule.selector), ["unarmed-damage"]);
    const iris = strikeRules(activation("Iris of the Sky").plan, { weaponId: "iris" });
    assert.deepEqual(iris.at(-1), { key: "DamageAlteration", selectors: ["iris-damage"], mode: "override", property: "damage-type", value: "fire" });
});

async function readyFrom(name) {
    const item = foundry.giveItem(fighter, source(name));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: item.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, `${name}'s Strike card`);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    return { item, card };
}

test("Mantle of the Tikbalang: the readied Strike's Effect gives PF2e's damage roll the dice; the hit keeps it for that roll, which spends it", async () => {
    const { card } = await readyFrom("Mantle of the Tikbalang");
    assert.match(card.content, /\+4d6 mental damage/);
    const [effect] = readied();
    assert.deepEqual(effect.system.rules.map((rule) => [rule.key, rule.selector, `${rule.diceNumber}${rule.dieSize}`, rule.damageType]), [["DamageDice", "melee-strike-damage", "4d6", "mental"]]);
    await attack("success");
    assert.equal(readied().length, 1, "kept for the damage roll");
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.awaiting, true);
    assert.match(foundry.messages.at(-1).content, /damage roll adds \+4d6 mental/);
    await damage();
    assert.equal(readied().length, 0, "spent by the damage roll");
    // Again, and a miss spends it at once.
    await readyFrom("Mantle of the Tikbalang");
    await attack("failure");
    assert.equal(readied().length, 0);
});

test("Pick of Arcane Accuracy: only a Strike with the pick takes it", async () => {
    const { item } = await readyFrom("Pick of Arcane Accuracy");
    assert.deepEqual(readied()[0].system.rules.map((rule) => rule.selector), [`${item.id}-melee-damage`, `${item.id}-attack`]);
    await attack("success", ["item:melee", "item:id:sword"]);
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.awaiting, false, "another weapon's Strike: not this one");
    await attack("success", ["item:melee", `item:id:${item.id}`]);
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.awaiting, true);
    await damage(["item:melee", "item:id:sword"]);
    assert.equal(readied().length, 1, "another weapon's damage roll doesn't spend it");
    await damage(["item:melee", `item:id:${item.id}`]);
    assert.equal(readied().length, 0);
});

test("Venom Lash and Amphisbaena Handwraps: a miss keeps a 'next successful Strike'; two Strikes use it twice", async () => {
    const { item } = await readyFrom("Venom Lash");
    assert.deepEqual([readied()[0].system.duration.value, readied()[0].system.duration.expiry], [1, "turn-end"], "until the end of the next turn");
    await attack("failure", ["item:melee", `item:id:${item.id}`]);
    assert.equal(readied().length, 1, "a miss keeps it");
    await attack("success", ["item:melee", `item:id:${item.id}`]);
    await damage(["item:melee", `item:id:${item.id}`]);
    assert.equal(readied().length, 0);
    await readyFrom("Amphisbaena Handwraps");
    await attack("success", ["item:melee", "item:id:sword"]);
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.awaiting, false, "not an unarmed Strike");
    const fist = ["item:melee", "item:category:unarmed", "item:id:fist"];
    await attack("success", fist);
    await damage(fist);
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.uses, 1, "one Strike left");
    await attack("criticalSuccess", fist);
    await damage(fist);
    assert.equal(readied().length, 0);
});

test("Kinetic Club: a Strike that already hit readies its damage roll alone", async () => {
    const { item } = await readyFrom("Kinetic Club");
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.awaiting, true);
    await damage(["item:melee", `item:id:${item.id}`]);
    assert.equal(readied().length, 0);
});


test("activated ammunition: its hit's save for the target, on the next ranged Strike with that ammunition", async () => {
    // "When an activated freezing ammunition hits a target, the target must succeed at a DC 19 Fortitude save or be Slowed 1 …"
    const [freezing] = compileActivations(source("Freezing Ammunition"));
    assert.equal(routeOf(freezing.plan), "strike");
    assert.deepEqual([freezing.plan.strike.range, freezing.plan.strike.ammo, freezing.plan.strike.save.resolution.check.against.value], ["ranged", true, 19]);
    // Not the target's save (Freeze Ammunition's icy surface: "Each creature standing on the icy surface must …"), nor PF2e's own dice twice (Rhino Shot).
    assert.equal(compileActivations(source("Freeze Ammunition"))[0].plan?.strike?.save ?? null, null);
    assert.deepEqual(compileActivations(source("Rhino Shot"))[0].plan.strike.damage ?? [], [], "Rhino Shot's 2d6 force is PF2e's own rule");
    const arrows = foundry.giveItem(fighter, source("Freezing Ammunition"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: arrows.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(readied()[0].flags[MODULE_ID].strikeRider.ammoId, arrows.id);
    // Another ammunition's Strike: not this one; this one's: its save card.
    await attack("success", ["item:ranged", "item:ammo:id:other"]);
    assert.equal(readied().length, 1);
    const before = foundry.posted.length;
    await attack("success", ["item:ranged", `item:ammo:id:${arrows.id}`]);
    assert.equal(readied().length, 0);
    assert.equal(foundry.posted.slice(before)[0]?.plan.resolution.check.against.value, 19);
});

test("ammunition's hit in other words: \"In addition, the target takes 1d8 persistent sonic damage\" (Shatterpoint Ammunition)", () => {
    const [shatter] = compileActivations(source("Shatterpoint Ammunition"));
    assert.equal(routeOf(shatter.plan), "strike");
    assert.deepEqual(shatter.plan.strike.damage, [{ diceNumber: 1, dieSize: "d8", category: "persistent", damageType: "sonic" }]);
    assert.match(shatter.plan.strike.notes.join(" "), /ignores the target's Hardness/);
    // Garrote Bolt's 2d12 persistent slashing is PF2e's own DamageDice rule: nothing to add.
    assert.equal(compileActivations(source("Garrote Bolt"))[0].plan?.strike?.damage?.length ?? 0, 0);
});

test("a push on the Strike's hit: the core's forced movement, away from its user (Battering Ammunition); not a reposition", async () => {
    const [battering] = compileActivations(source("Battering Ammunition"));
    assert.equal(routeOf(battering.plan), "strike");
    assert.deepEqual(battering.plan.resolution.outcomes.success.forcedMovement, { kind: "push", distance: 5 });
    const { hitRiders } = await import("../src/compiler/bombs.js");
    assert.deepEqual(hitRiders("On a critical hit, the creature is knocked back 10 feet.").criticalSuccess.forcedMovement, { kind: "push", distance: 10 });
    assert.equal(hitRiders("If you hit and deal damage, you also reposition the creature 5 feet.").success.forcedMovement, undefined);
});

test("Weapon Shot: the weapon that fires it is a +2 striking weapon for that Strike (PF2e's rune upgrade, on the weapon loaded with it)", () => {
    const [shot, ghostly] = compileActivations(source("Weapon Shot (Moderate)"));
    assert.deepEqual([shot.plan.strike.ammo, shot.plan.strike.runes], [true, { potency: 2, striking: 1 }]);
    assert.match(strikeLines(shot.plan).join(" | "), /Its weapon is a \+2 striking weapon for it/);
    const rules = strikeRules(shot.plan, { ammoId: "shot1", label: "Weapon Shot (Moderate)" });
    assert.deepEqual(rules.map((rule) => [rule.key, rule.property, rule.value, rule.predicate]), [["ItemAlteration", "runes-potency", 2, ["item:ammo:id:shot1"]], ["ItemAlteration", "runes-striking", 1, ["item:ammo:id:shot1"]]]);
    assert.deepEqual(compileActivations(source("Weapon Shot (Major)"))[0].plan.strike.runes, { potency: 3, striking: 2 });
    // Its ghostly weapon of force: not read (no weapon of the user's fires it).
    assert.equal(ghostly.plan, null);
});

test("a spell cast at the creature hit: Stone Bullet's Petrify at rank 6 and DC 34, the spell module's; not one with a save of its own first", async () => {
    const [stone] = compileActivations(source("Stone Bullet"));
    assert.deepEqual(stone.plan.strike.cast, { uuid: "Compendium.pf2e.spells-srd.Item.znv4ECL7ZtuiagtA", name: "Petrify", rank: 6, dc: 34 });
    assert.match(strikeLines(stone.plan).join(" | "), /On a hit: Petrify \(rank 6, DC 34\) cast at the target/);
    // A save of the item's own first (Silencing Shot), its hit for the spell's attack (Disintegration Bolt).
    assert.deepEqual(compileActivations(source("Silencing Shot"))[0].plan.strike.cast.saveFirst, { statistic: "will", dc: 25 });
    assert.equal(compileActivations(source("Disintegration Bolt"))[0].plan.strike.cast.attackFromHit, true);
    assert.deepEqual(compileActivations(source("Tiger's Claw")).find((entry) => entry.plan?.strike?.cast).plan.strike.cast.name, "Vision of Death");
    const bullets = foundry.giveItem(fighter, source("Stone Bullet"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: bullets.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const before = foundry.casts.length;
    await attack("success", ["item:ranged", `item:ammo:id:${bullets.id}`]);
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.spell, cast.rank, cast.dc, cast.targets.length], ["Compendium.pf2e.spells-srd.Item.znv4ECL7ZtuiagtA", 6, 34, 1]);
});

test("Silencing Shot: castFromItem's saveFirst when the spell module offers it; else the GM's, by hand", async () => {
    const spell = globalThis.game.modules.get("pf2e-automatic-resolution").api;
    const shots = foundry.giveItem(fighter, source("Silencing Shot"));
    const ready = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: shots.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
    };
    // Not offered: no cast, a line for the GM.
    await ready();
    let before = foundry.casts.length;
    const hit = await attack("success", ["item:ranged", `item:ammo:id:${shots.id}`]);
    assert.equal(foundry.casts.length, before);
    assert.match(foundry.messages.slice(foundry.messages.indexOf(hit)).map((message) => message.content).join(" "), /if it fails a DC 25 will save[^<]*by hand/);
    // Offered: the save goes with the cast.
    spell.castFromItemOptions = ["attackDegree", "saveFirst"];
    await ready();
    before = foundry.casts.length;
    await attack("success", ["item:ranged", `item:ammo:id:${shots.id}`]);
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.rank, cast.saveFirst], [4, { statistic: "will", dc: 25 }]);
    delete spell.castFromItemOptions;
});


test("cast on hit in other words: Fairy Bullet's \"casts Revealing Light (DC 23)\", Silencing Ammunition's Silence the target resists with its own save", () => {
    const cast = (name) => compileActivations(source(name))[0].plan.strike.cast;
    assert.deepEqual([cast("Fairy Bullet").name, cast("Fairy Bullet").dc], ["Revealing Light", 23]);
    assert.deepEqual([cast("Silencing Ammunition").name, cast("Silencing Ammunition").rank, cast("Silencing Ammunition").saveFirst], ["Silence", 2, { statistic: "will", dc: 25 }]);
});
