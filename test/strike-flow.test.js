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
    // "An extra two dice of weapon damage": the weapon's own die; "counts as two attacks" the card's line (PF2e's multiple attack penalty
    // buttons are the user's), not a note.
    const piston = activation("Piston Gauntlets").plan;
    assert.deepEqual(piston.strike.damage.map((entry) => `${entry.diceNumber}${entry.dieSize}`), [`2${source("Piston Gauntlets").system.damage.die}`]);
    assert.deepEqual([piston.strike.map, piston.strike.notes, piston.partial], ["double", [], undefined]);
    assert.ok(strikeLines(piston).includes("Your multiple attack penalty rises two steps after it (it counts as two attacks)"));
    // (Crimson Fulcrum Lens: its 2d8 for a jaws Strike, 1d8 for another — PF2e's "item:slug:jaws" —, and "doesn't count" the line too.)
    const lens = activation("Crimson Fulcrum Lens").plan;
    assert.deepEqual([lens.strike.damage.map((entry) => [`${entry.diceNumber}${entry.dieSize}`, entry.predicate]), lens.strike.map, lens.partial], [[["1d8", [{ not: "item:slug:jaws" }]], ["2d8", ["item:slug:jaws"]]], "none", undefined]);
    assert.ok(strikeRules(lens).some((rule) => rule.key === "DamageDice" && rule.diceNumber === 2 && rule.predicate?.[0] === "item:slug:jaws"));
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
    // Damage only under a condition ("If your last action was to Stride …, this does an additional 1d4 force damage"): not read — its Stride
    // the move card's (src/compiler/move.js), the Strike and the rest notes.
    const whirl = compileActivations(source("Chimera Flail")).find((entry) => entry.activation.name === "Pouncing Whirl").plan;
    assert.deepEqual([whirl.builtin, whirl.teleport.speedTimes, whirl.teleport.move.verb, whirl.partial, whirl.strike], ["teleport", 0.5, "Stride", true, undefined]);
    assert.ok(whirl.notes.some((note) => /^Make a Strike\b/.test(note)) && whirl.notes.some((note) => /additional 1d4 force damage/.test(note)));
    // A trigger's hit with a save: the save at the creature struck, its critical failure its own ("(Stupefied 2 on a critical failure)").
    const sap = activation("Spore Sap").plan;
    assert.equal(sap.resolution.check.roll, "save");
    assert.deepEqual(sap.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value, effect.duration?.unit]), [["stupefied", 2, "minutes"]]);
    // A talisman's trigger's hit, with no Effect heading (Blessed Ampoule's "Trigger Your Strike with the affixed weapon hits a target
    // Requirements …"): its damage roll becomes spirit.
    const ampoule = compileItem(source("Blessed Ampoule"));
    assert.deepEqual([ampoule.strike.hit, ampoule.strike.alteration], [true, "spirit"]);
    // Golden Silencer's "A target hit by a ranged Strike from the affixed weapon must succeed at a … save or be silenced": the next
    // ranged Strike's, its failure the silence as a note Effect for its time.
    const silencer = compileItem(source("Golden Silencer (Standard)"));
    const silenced = silencer.strike.save.resolution.outcomes.failure.noteEffects[0];
    assert.deepEqual([silencer.strike.range, silencer.strike.save.resolution.check.against.value, silenced.duration.unit], ["ranged", 20, "rounds"]);
    assert.match(silenced.text, /casting spells that include verbal components/);
    // Ghoul Stiletto's wound: the dagger's next Strike, its hit's Fortitude save, and a 10-foot aura on the creature hit for 1 minute with
    // the same save at a turn's start or end in it (Ghast Stiletto's for those there as it starts and those entering).
    const ghoul = compileActivations(source("Ghoul Stiletto"))[0].plan;
    assert.deepEqual([ghoul.strike.own, ghoul.strike.save.resolution.check.against.value, ghoul.strike.zone.area, ghoul.strike.zone.saves[0].when, ghoul.strike.zone.lasts.value], [true, 17, { type: "emanation", value: 10 }, ["start", "end"], 1]);
    assert.deepEqual(compileActivations(source("Ghast Stiletto"))[0].plan.strike.zone.saves[0].when, ["initial", "enter"]);
    // ("The next living target struck": strike.livingOnly, a miss keeping it too; Ghast's penalty inside to saves against disease and to Retch
    // as PF2e's Effect: Stench — each whole, 2026-10-26.)
    const ghast = compileActivations(source("Ghast Stiletto"))[0].plan;
    assert.deepEqual([ghoul.strike.livingOnly, ghoul.strike.missKeeps, Boolean(ghoul.partial), Boolean(ghast.partial)], [true, true, false, false]);
    assert.deepEqual(ghast.strike.zone.modifiers, [{ selector: "saving-throw", value: -2, type: "circumstance", predicate: [{ or: ["item:trait:disease", "action:retch"] }] }]);
    assert.match(strikeLines(ghoul).join(" | "), /a 10-foot aura on the target for 1 minutes/);
    // (Its critical failure's "plus Slowed 1 as long as it's sickened": on that row of both saves, the ability module's condition while
    // sickened — not a note.)
    const slowed = (plan) => plan.resolution.outcomes.criticalFailure.effects.find((effect) => effect.slug === "slowed");
    assert.deepEqual([slowed(ghoul.strike.save), slowed(ghoul.strike.zone.saves[0].plan)], [{ kind: "condition", slug: "slowed", value: 1, duration: { mode: "while", condition: "sickened" } }, { kind: "condition", slug: "slowed", value: 1, duration: { mode: "while", condition: "sickened" } }]);
    assert.ok(!(ghoul.notes ?? []).some((note) => /Slowed/.test(note)));
    // Saves for the creatures around the one hit: Dispersing Bullet's push (Fortitude 21, the target left out, the push its rows' from the
    // creature hit — moveFrom "target", the note it was before ability 0.9.2 kept as byHand), Singularity Ammunition's pull and then its blast
    // (7d12 bludgeoning, basic Reflex 28, the target too).
    // Blade of Fallen Stars' projectile: the next ranged Strike's extra 6d8 cold, its Faerie Fire a note; Solar Shellflower's construct: its
    // Strikes' extra 3d4 persistent fire for 1 minute (the item's Effect); Essence Forge's healing, its gate a note.
    const blade = compileActivations(source("Blade of Fallen Stars"))[1].plan.strike;
    assert.deepEqual([blade.range, blade.damage.map((entry) => `${entry.diceNumber}${entry.dieSize} ${entry.damageType}`)], ["ranged", ["6d8 cold"]]);
    assert.match(blade.notes.join(" "), /Faerie Fire/);
    const shellflower = compileActivations(source("Solar Shellflower"))[0].plan.item.strikeDamage[0];
    assert.deepEqual([shellflower.diceNumber, shellflower.dieSize, shellflower.category, shellflower.damageType, shellflower.own, shellflower.duration.value], [3, "d4", "persistent", "fire", true, 1]);
    const forge = compileActivations(source("Essence Forge (Lesser)"))[2].plan;
    assert.deepEqual([forge.resolution.kind, forge.resolution.native.healing.components[0].formula], ["healing", "3d8+10"]);
    assert.match(forge.notes.join(" "), /only when the essence in the forge is worth at least 50 gp/);
    const dispersing = compileActivations(source("Dispersing Bullet"))[0].plan.strike;
    assert.deepEqual([dispersing.ammo, dispersing.around.map((entry) => [entry.radius, entry.includeTarget, entry.plan.resolution.check.against.value])], [true, [[10, false, 21]]]);
    const pushed = dispersing.around[0];
    assert.deepEqual([pushed.moveFrom, pushed.plan.resolution.outcomes.failure.forcedMovement.distance, pushed.plan.resolution.outcomes.criticalFailure.forcedMovement.distance, pushed.plan.resolution.outcomes.success.forcedMovement, pushed.plan.notes], ["target", 10, 15, undefined, undefined]);
    assert.match(pushed.byHand, /pushed 10 feet from the target; 15 feet on a critical failure/);
    const singularity = compileActivations(source("Singularity Ammunition"))[0].plan.strike;
    assert.deepEqual(singularity.around.map((entry) => [entry.radius, entry.includeTarget, entry.plan.resolution.check.statistic, entry.plan.resolution.check.basic]), [[10, false, "fortitude", false], [5, true, "reflex", true]]);
    assert.deepEqual([singularity.around[0].moveFrom, singularity.around[0].plan.resolution.outcomes.failure.forcedMovement], ["target", { kind: "pull", distance: 5, upTo: true, optional: false, direction: "toward" }]);
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
    // Devil's Trident's "Attempt a Strike. On a hit, the trident casts 3rd-rank Paralyze on the target (DC 25)", Stunned 1 on a critical hit
    // — over the disease's save beside it in its text.
    const trident = compileActivations(source("Devil's Trident"))[2].plan;
    assert.deepEqual([trident.strike.cast.name, trident.strike.cast.rank, trident.strike.cast.dc, trident.resolution.outcomes.criticalSuccess.effects.map((effect) => `${effect.slug} ${effect.value}`)], ["Paralyze", 3, 25, ["stunned 1"]]);
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

test("Roc-Shaft Arrow: ammunition only in its words — its user's next ranged Strike, whose hit is a Fortitude save or a space its attacker picks", async () => {
    const arrow = compileItem(source("Roc-Shaft Arrow (Lesser)"));
    assert.equal(routeOf(arrow), "strike");
    assert.deepEqual([arrow.strike.range, arrow.strike.ammo, arrow.strike.save.resolution.check.statistic, arrow.strike.save.resolution.check.against.value], ["ranged", undefined, "fortitude", 19]);
    // (The space picked after the save card's applied, src/compiler/placed.js — not the core's straight push.)
    assert.deepEqual(arrow.strike.save.placed.rows, { failure: { within: 10 }, criticalFailure: { within: 20 } });
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => arrow.strike.save.resolution.outcomes[degree].forcedMovement), [undefined, undefined]);
    assert.deepEqual(arrow.strike.save.placed.lines, ["Into a hazardous space, this has the incapacitation trait"]);
    // (The ammunition its weapon fires, as PF2e's ammo.baseType names it: a bow's.)
    assert.deepEqual(arrow.strike.ammunition, ["arrows"]);
    assert.deepEqual([arrow.strike.notes, arrow.partial], [[], undefined]);
    // (Before ability 0.9.2: the note it was, partial.)
    const { withoutPlacedMoves } = await import("../src/compiler/placed.js");
    const before = withoutPlacedMoves(arrow);
    assert.deepEqual([before.partial, before.strike.save.placed, before.strike.save.notes], [true, undefined, ["On a failure, move it to a space its attacker picks within 10 feet. On a critical failure, move it to a space its attacker picks within 20 feet."]]);
});

test("a Strike's attack without its range penalty (Sniper's Bead, Jistkan War Crossbow), without kickback's penalty (Alchemist's Damper), with flat splash damage (Jistkan): PF2e's RollOption, AdjustModifier and FlatModifier rules", () => {
    const bead = compileItem(source("Sniper's Bead"));
    assert.equal(routeOf(bead), "strike");
    assert.deepEqual([bead.strike.range, bead.strike.options], ["ranged", ["ignore-range-penalty:2"]]);
    assert.deepEqual(compileItem(source("Sniper's Bead (Major)")).strike.options, ["ignore-range-penalty:6"]);
    assert.deepEqual(strikeRules(bead), [{ key: "RollOption", domain: "ranged-strike-attack-roll", option: "ignore-range-penalty:2" }]);
    const damper = compileItem(source("Alchemist's Damper"));
    assert.deepEqual(strikeRules(damper), [{ key: "AdjustModifier", selector: "ranged-strike-attack-roll", slug: "kickback", suppress: true }]);
    const crossbow = compileActivations(source("Jistkan War Crossbow"))[0].plan;
    assert.deepEqual(strikeRules(crossbow, { weaponId: "jistkan", label: "Jistkan War Crossbow" }), [
        { key: "RollOption", domain: "jistkan-attack", option: "ignore-range-penalty:3" },
        { key: "FlatModifier", selector: "jistkan-damage", slug: "jistkan-war-crossbow-splash", label: "Jistkan War Crossbow", value: 10, damageType: "piercing", damageCategory: "splash" }
    ]);
    assert.deepEqual(strikeLines(crossbow), ["No range penalty out to its third range increment", "+10 piercing splash damage"]);
});

test("Big Rock Bullet: its damage in place of the sling's — the hit's on the ability module's card (doubled on a critical hit), a failure's smaller damage, nothing on a critical failure", async () => {
    const [rock] = compileActivations(source("Big Rock Bullet"));
    assert.equal(routeOf(rock.plan), "strike");
    assert.deepEqual(rock.plan.strike.instead, { hit: { formula: "4d6", type: "bludgeoning" }, failure: { formula: "2d6", type: "bludgeoning" } });
    // (Catch Rock, its target's reaction: the card's line, not a note.)
    assert.deepEqual([rock.plan.strike.notes, rock.plan.strike.requires, rock.plan.partial], [[], ["Creatures with the Catch Rock reaction can use it against a big rock bullet."], undefined]);
    assert.ok(strikeLines(rock.plan).includes("Its target: creatures with the Catch Rock reaction can use it against a big rock bullet"));
    // (Starshot Arrow's: what its target must be, the card's lines; Sniper's Bead's introduction to the range it reads, said.)
    const starshot = compileActivations(source("Starshot Arrow (Lesser)"))[0].plan;
    assert.deepEqual([starshot.strike.requires.length, starshot.strike.notes, starshot.partial], [3, [], undefined]);
    assert.deepEqual([compileItem(source("Sniper's Bead")).strike.notes, compileItem(source("Sniper's Bead")).partial], [[], undefined]);
    assert.ok(strikeLines(rock.plan).includes("On a failure (not a critical failure): 2d6 bludgeoning damage"));
    assert.deepEqual(strikeRules(rock.plan, { ammoId: "x" }), [], "nothing on PF2e's own damage roll");
    const bullets = foundry.giveItem(fighter, { ...source("Big Rock Bullet"), system: { ...source("Big Rock Bullet").system, quantity: 3 } });
    const ready = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: bullets.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
    };
    const posted = async (outcome) => {
        const before = foundry.posted.length;
        await attack(outcome, ["item:ranged", `item:ammo:id:${bullets.id}`]);
        assert.equal(readied().length, 0, `${outcome} spends it`);
        return foundry.posted.slice(before);
    };
    await ready();
    const [miss] = await posted("failure");
    assert.deepEqual([miss.plan.resolution.sharedDamage.components[0].formula, miss.plan.resolution.outcomes.success.damage.multiplier], ["2d6", 1]);
    await ready();
    const [critical] = await posted("criticalSuccess");
    assert.deepEqual([critical.plan.resolution.sharedDamage.components[0].formula, critical.plan.resolution.outcomes.success.damage.multiplier], ["4d6", 2]);
    assert.equal(critical.tokens[0].actor?.id ?? critical.tokens[0].document?.actor?.id, foe.id);
    await ready();
    assert.deepEqual(await posted("criticalFailure"), []);
});

test("Iron Cudgel (Brutal Finish): a melee Strike with one more weapon die (PF2e's DamageDice with no die size, as the feat's own), the weapon's die on a failure at the creature missed", async () => {
    const cudgel = compileItem({ ...source("Iron Cudgel"), ownerLevel: 14 });
    assert.equal(routeOf(cudgel), "strike");
    assert.deepEqual([cudgel.strike.range, cudgel.strike.damage.map((entry) => [entry.diceNumber, entry.dieSize]), cudgel.strike.failDice], ["melee", [[1, null]], 1]);
    assert.deepEqual(strikeRules(cudgel, { label: "Iron Cudgel" }).map((rule) => [rule.key, rule.selector, rule.diceNumber, "dieSize" in rule]), [["DamageDice", "melee-strike-damage", 1, false]]);
    assert.ok(strikeLines(cudgel).includes("+1 weapon die damage"));
    assert.ok(strikeLines(cudgel).includes("On a failure (not a critical failure): 1 weapon damage die as damage"));
    // (At 18th level, two of each; with the feat, one more by hand.)
    const high = compileItem({ ...source("Iron Cudgel"), ownerLevel: 18 });
    assert.deepEqual([high.strike.damage[0].diceNumber, high.strike.failDice], [2, 2]);
    assert.ok(high.strike.notes.some((note) => /With the Brutal Finish feat\b/.test(note)));
    assert.equal(riderFor(cudgel, { outcome: "failure", options: ["item:melee"] }), "failure");
    // Live: readied, then a failed attack with the greataxe posts the axe's 1d12 slashing at the foe.
    const axe = foundry.giveItem(fighter, source("Greataxe"));
    const card = await useCard("Iron Cudgel");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(readied().length, 1);
    const before = foundry.posted.length;
    const missed = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "failure", options: ["item:melee"], target: { actor: foe.uuid, token: foe.token.uuid } }, origin: { uuid: axe.uuid, type: "weapon" } } }, speaker: { actor: fighter.id }, actor: fighter, token: fighter.token.document });
    await foundry.call("createChatMessage", missed);
    await settle();
    assert.equal(readied().length, 0, "the failure spends it");
    const [miss] = foundry.posted.slice(before);
    assert.deepEqual([miss.plan.resolution.sharedDamage.components[0].formula, miss.plan.resolution.sharedDamage.components[0].type], ["1d12", "slashing"]);
    assert.equal(miss.tokens[0].actor?.id ?? miss.tokens[0].document?.actor?.id, foe.id);
});

test("Energizing Lattice: a Strike with 6d6 more force damage, and on a failure (not a critical failure) half of that 6d6 force on the ability module's card at the creature missed", async () => {
    const [lattice] = compileActivations(source("Energizing Lattice"));
    assert.equal(routeOf(lattice.plan), "strike");
    assert.deepEqual([lattice.plan.strike.failHalf, lattice.plan.partial, lattice.plan.strike.notes], [{ formula: "6d6", type: "force" }, undefined, []]);
    assert.ok(strikeLines(lattice.plan).includes("On a failure (not a critical failure): half of its 6d6 force damage"));
    assert.equal(riderFor(lattice.plan, { outcome: "failure", options: ["item:melee"] }), "failure");
    const { card } = await readyFrom("Energizing Lattice");
    assert.match(card.content, /\+6d6 force damage/);
    const before = foundry.posted.length;
    await attack("failure");
    assert.equal(readied().length, 0, "the failure spends it");
    const [half] = foundry.posted.slice(before);
    assert.deepEqual([half.plan.resolution.sharedDamage.components[0].formula, half.plan.resolution.sharedDamage.components[0].type, half.plan.resolution.outcomes.success.damage.multiplier], ["6d6", "force", 0.5]);
    assert.equal(half.tokens[0].actor?.id ?? half.tokens[0].document?.actor?.id, foe.id);
});

test("Drake Rifles' Drake Shot: a Strike with the rifle itself, its splash of its own type on the damage roll (a failure's splash the splash card's), and its type's rider on a hit; a weapon's rider-only Strike is its own (Growth Gun)", () => {
    const shot = (name) => compileActivations(source(name))[0].plan;
    const hit = (plan) => plan.resolution.outcomes.success;
    for (const [type, effects] of [["Acid", [["sickened", 1]]], ["Electricity", [["off-guard", null], ["dazzled", null]]], ["Poison", [["enfeebled", 1], ["clumsy", 1]]], ["Fire", [["prone", null]]]]) {
        const plan = shot(`Drake Rifle (${type})`);
        assert.equal(routeOf(plan), "strike", type);
        assert.deepEqual([plan.strike.own, plan.strike.range, plan.strike.splash], [true, "ranged", { value: 1, damageType: type.toLowerCase() }], type);
        assert.deepEqual(hit(plan).effects.map((effect) => [effect.slug, effect.value]), effects, type);
        // (The failure's splash now the splash card's.)
        assert.ok(!plan.strike.notes.includes("On a failure, the target and creatures within 5 feet of it still take that splash damage."), type);
    }
    assert.deepEqual(hit(shot("Drake Rifle (Fire)")).forcedMovement, { kind: "push", distance: 10 });
    assert.deepEqual(hit(shot("Drake Rifle (Cold)")).modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration.value]), [["all-speeds", -10, "status", 1]]);
    const growth = shot("Growth Gun");
    assert.deepEqual([growth.strike.own, hit(growth).effects.map((effect) => effect.slug)], [true, ["slowed"]]);
    assert.equal(riderFor(growth, { ranged: true, outcome: "success", options: ["item:ranged", "item:id:other"], weaponId: "gun" }), null, "another weapon's Strike doesn't carry it");
});

test("Mercurial Mantle's Cunning Dodge: the triggering enemy's Perception check against DC 38 (the core's save family), Off-Guard for the turn on a failure and until the end of its next turn on a critical failure; the Step and Strike a note", () => {
    const [dodge] = compileActivations(source("Mercurial Mantle"));
    const resolution = dodge.plan.resolution;
    assert.deepEqual([resolution.kind, resolution.check.roll, resolution.check.statistic, resolution.check.against], ["save", "save", "perception", { dc: "fixed", value: 38 }]);
    assert.deepEqual(resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.expiry]), [["off-guard", 0, "turn-end"]]);
    assert.deepEqual(resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.duration.value]), [["off-guard", 1]]);
    assert.equal(routeOf(dodge.plan), "save");
    assert.match(dodge.plan.notes[0], /^You Step, .* \(by hand\)\.$/);
});

test("Iron Cube: its melee Strike's hit posts PF2e's Trip card at the creature hit, the 2d6 bludgeoning on its success; Serpent's Lash's Reposition after its whip's hit", async () => {
    const cube = compileItem(source("Iron Cube"));
    assert.deepEqual([routeOf(cube), cube.strike.range, cube.strike.follow.action.slug, cube.strike.follow.action.damage.success.resolution.sharedDamage.components[0].formula, cube.partial], ["strike", "melee", "trip", "2d6", true]);
    assert.deepEqual(cube.resolution.outcomes.success.effects, [], "the prone is the Trip's, not the hit's");
    assert.ok(strikeLines(cube).some((line) => /^On a hit: its .*card at the creature hit \(with its damage on a success\)$/.test(line)));
    const [lash] = compileActivations(source("Serpent's Lash"));
    assert.deepEqual([lash.plan.strike.own, lash.plan.strike.follow.action.slug, lash.plan.strike.follow.notes], [true, "reposition", ["Reposition the creature 5 feet (10 feet on a critical hit)."]]);
    const card = await useCard("Iron Cube");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const before = foundry.messages.length;
    await attack("success", ["item:melee"]);
    const posted = foundry.messages.slice(before).map((message) => message.flags?.[MODULE_ID]?.card?.kind).filter(Boolean);
    assert.ok(posted.includes("item-action"), `the Trip card (${posted.join(", ")})`);
    assert.equal(readied().length, 0);
});

test("ammunition made against one type of creature (Bane Ammunition): the ways card's pick of the type, each way the next Strike's 2d6 persistent poison only against a creature with that trait", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const { strikeRules } = await import("../src/live/strike-card.js");
    const [bane] = compileActivations(source("Bane Ammunition (Moderate)"));
    assert.equal(bane.plan.builtin, "ways");
    assert.deepEqual(bane.plan.ways.map((way) => way.name), ["Aberration", "Animal", "Beast", "Dragon", "Fey", "Giant", "Ooze", "Fungus and Plant"]);
    const dragon = bane.plan.ways[3].plan;
    assert.deepEqual([dragon.strike.ammo, strikeRules(dragon, { ammoId: "ammo1" }).find((rule) => rule.key === "DamageDice")], [true, { key: "DamageDice", selector: "ranged-strike-damage", slug: "item-extra-1", diceNumber: 2, dieSize: "d6", damageType: "poison", category: "persistent", predicate: ["target:trait:dragon"] }]);
    assert.deepEqual(bane.plan.ways[7].plan.strike.damage[0].predicate, [{ or: ["target:trait:fungus", "target:trait:plant"] }]);
});

test("a shot whose rider is the gun's modular configuration's (Hydrocannon's Tinker Shot): the ways card's Bludgeoning push (farther on a critical hit), Piercing Speed penalty, Slashing persistent bleed, each the readied Strike with the gun", () => {
    const [tinker] = compileActivations(source("Hydrocannon"));
    assert.deepEqual([tinker.plan.builtin, tinker.plan.ways.map((way) => way.name)], ["ways", ["Bludgeoning", "Piercing", "Slashing"]]);
    const [bludgeoning, piercing, slashing] = tinker.plan.ways.map((way) => way.plan);
    assert.deepEqual([bludgeoning.resolution.outcomes.success.forcedMovement, bludgeoning.resolution.outcomes.criticalSuccess.forcedMovement], [{ kind: "push", distance: 5 }, { kind: "push", distance: 10 }]);
    assert.deepEqual(piercing.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["all-speeds", -10, "circumstance"]]);
    assert.deepEqual([slashing.strike.own, slashing.strike.damage], [true, [{ diceNumber: 1, dieSize: "d6", category: "persistent", damageType: "bleed" }]]);
});

test("a Strike treated as a precious material (Quicksilver Cloak's silver shot): PF2e's AdjustStrike materials on the ranged Strike it readies, kept for its damage roll", () => {
    const [slide] = compileActivations(source("Quicksilver Cloak"));
    assert.deepEqual([slide.plan.strike.range, slide.plan.strike.material], ["ranged", "silver"]);
    assert.ok(strikeLines(slide.plan).includes("It's treated as silver"));
    assert.deepEqual(strikeRules(slide.plan, { label: "Quicksilver Cloak" }), [{ key: "AdjustStrike", mode: "add", property: "materials", value: "silver", definition: ["item:ranged"] }]);
});

test("Jawbreaker Shield: its reaction's shield bash, a hit posting the DC 31 Fortitude save — 1d6 bleed on a failure, and on the critical failure \"As failure, and …\"; Trollhound Pick's \"As failure, but Enfeebled 2\" keeps the failure's minute", () => {
    const [bash] = compileActivations(source("Jawbreaker Shield"));
    assert.equal(routeOf(bash.plan), "strike");
    const save = bash.plan.strike.save.resolution;
    assert.deepEqual([save.check.statistic, save.check.against.value], ["fortitude", 31]);
    assert.deepEqual([save.outcomes.failure.damage.formulas[0].formula, save.outcomes.criticalFailure.damage.formulas[0].formula], ["1d6[bleed]", "1d6[bleed]"]);
    const [ravenous] = compileActivations(source("Trollhound Pick"));
    const enfeebled = ravenous.plan.strike.save.resolution.outcomes.criticalFailure.effects.find((effect) => effect.slug === "enfeebled");
    assert.deepEqual([enfeebled.value, enfeebled.duration.value, enfeebled.duration.unit], [2, 1, "minutes"]);
});

test("a whetstone's riders, the weapon picked on its card: Frenzied Quintessence Quickened after each hit with it, Analysis Eye's weaknesses and resistances to the GM once a creature, Leeching Fangs' healing — half the Hit Point damage it deals a living creature", async () => {
    const { attackRidersText } = await import("../src/compiler/attack-riders.js");
    const frenzied = compileItem(source("Frenzied Quintessence"));
    assert.equal(routeOf(frenzied), "item");
    // (No time of its own, a whetstone's 1 minute — not the Quickened's 1 round.)
    assert.deepEqual([frenzied.item.attackRiders.duration.value, frenzied.item.attackRiders.duration.unit], [1, "minutes"]);
    assert.equal(attackRidersText(frenzied.item.attackRiders.riders), "On a hit with the weapon picked: you are quickened for 1 round (its extra action only to Stride toward a foe or Strike)");
    // (The extra action's limit is its user's to keep: a note.)
    // (Its limit the rider's own "only", the note gone: src/compiler/honest.js withActionLimit.)
    assert.deepEqual([frenzied.notes, frenzied.partial, frenzied.noteOnly], [undefined, undefined, undefined]);
    assert.equal(attackRidersText(compileItem(source("Analysis Eye")).item.attackRiders.riders, "Longsword"), "On the first hit with Longsword at each creature: one of its weaknesses or resistances, whispered to the GM to tell you");
    assert.equal(attackRidersText(compileItem(source("Leeching Fangs")).item.attackRiders.riders), "Hit Point damage the weapon picked deals to a living creature heals you half as much");

    const duelist = foundry.makeActor({ id: "strike-duelist", name: "Duelist", hp: 10, max: 40, owners: ["player"] });
    const target = foundry.makeActor({ id: "strike-target", name: "Target" });
    foundry.place(duelist, 0, 10400);
    foundry.place(target, 100, 10400);
    target.system.attributes.weaknesses = [{ type: "fire", value: 5, label: "Fire 5" }];
    target.system.attributes.resistances = [{ type: "cold", value: 3, label: "Cold 3" }];
    const dagger = { id: "duelist-dagger", name: "Dagger", system: { level: { value: 0 } } };
    const sword = { id: "duelist-sword", name: "Longsword", system: { level: { value: 0 } } };
    duelist.weapons.push(dagger, sword);
    for (const name of ["Frenzied Quintessence", "Analysis Eye", "Leeching Fangs"]) {
        const item = foundry.giveItem(duelist, source(name));
        const data = item.toObject();
        const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: item.type } } }, speaker: { actor: duelist.id }, actor: duelist, token: duelist.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
        const card = foundry.messages[foundry.messages.indexOf(message) + 1];
        assert.deepEqual(card.flags[MODULE_ID].card.weapons.map((weapon) => weapon.name), ["Dagger", "Longsword"]);
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", runeWeapon: 1 });
        await settle();
    }
    const watches = duelist.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.attackRiders);
    assert.deepEqual(watches.map((effect) => [effect.name, effect.flags[MODULE_ID].attackRiders.weapon.id, effect.system.duration.value, effect.system.duration.unit]), [["Frenzied Quintessence (Longsword)", "duelist-sword", 1, "minutes"], ["Analysis Eye (Longsword)", "duelist-sword", 1, "minutes"], ["Leeching Fangs (Longsword)", "duelist-sword", 1, "minutes"]]);

    const strike = async (weapon, outcome) => {
        const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options: ["item:melee", `item:id:${weapon.id}`], target: { actor: target.uuid, token: target.token.uuid } }, origin: { uuid: `${duelist.uuid}.Item.${weapon.id}`, type: "weapon" } } }, speaker: { actor: duelist.id }, actor: duelist, token: duelist.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
    };
    // A hit with the dagger: nothing; with the longsword: Quickened for 1 round, its user's, and the target's weakness and resistance to the GM.
    const before = foundry.applied.length;
    const posted = foundry.messages.length;
    await strike(dagger, "success");
    assert.equal(foundry.applied.length, before);
    assert.equal(foundry.messages.length, posted + 1, "only the attack roll's own message");
    await strike(sword, "success");
    const quickened = foundry.applied.slice(before).map((entry) => entry.change);
    assert.deepEqual(quickened.map((change) => [change.op, change.slug, change.value, change.target, change.duration.value, change.duration.expiry]), [["condition", "quickened", null, "source", 1, "turn-end"]]);
    const learned = foundry.messages.slice(posted).filter((message) => /Analysis Eye/.test(message.content));
    assert.equal(learned.length, 1);
    assert.match(learned[0].content, /\(GM\): pick one of Target's to tell Duelist: weakness Fire 5; resistance Cold 3\./);
    assert.deepEqual(learned[0].whisper, ["gm"]);
    assert.ok(foundry.messages.slice(posted).some((message) => message.content === "<p><strong>Frenzied Quintessence</strong>: ability applied condition; its extra action only to Stride toward a foe or Strike.</p>"));
    // (A second hit at it: nothing more to learn; a miss: no Quickened.)
    await strike(sword, "criticalSuccess");
    await strike(sword, "failure");
    assert.equal(foundry.messages.slice(posted).filter((message) => /Analysis Eye/.test(message.content)).length, 1);
    assert.equal(foundry.applied.slice(before).length, 2);

    // The damage the longsword dealt (PF2e's damage-taken message, its origin the weapon): half as much healing — 9 → 4; the dagger's, none.
    const dealt = async (weapon, victim, damage) => {
        const message = foundry.makeMessage({ flags: { pf2e: { appliedDamage: { uuid: victim.uuid, isHealing: false, updates: [{ path: "system.attributes.hp.value", value: damage }] }, context: { type: "damage-taken", options: [] }, origin: { actor: duelist.uuid, uuid: `${duelist.uuid}.Item.${weapon.id}`, type: "weapon" } } }, speaker: { actor: victim.id }, actor: victim, token: victim.token.document });
        await foundry.call("createChatMessage", message);
        await settle();
    };
    await dealt(dagger, target, 9);
    assert.deepEqual(duelist.healed, []);
    await dealt(sword, target, 9);
    assert.deepEqual(duelist.healed.map((entry) => entry.damage), [-4]);
    assert.equal(duelist.system.attributes.hp.value, 14);
    assert.match(foundry.messages.at(-1).content, /Leeching Fangs<\/strong>: Duelist heals 4, half the 9 Hit Point damage dealt to Target\./);
    // (Not a living creature's: no healing.)
    const zombie = foundry.makeActor({ id: "strike-zombie", name: "Zombie", undead: true });
    foundry.place(zombie, 200, 10400);
    await dealt(sword, zombie, 8);
    assert.deepEqual(duelist.healed.map((entry) => entry.damage), [-4]);
});

test("a critical hit's harder save: Blister Ammunition's \"On a critical hit, increase the Fortitude DC by 2 (DC 21), and the target is Dazzled for 1 round\" — strike.criticalDC, the save card's DC after a critical hit, 19 after a hit", async () => {
    const [blister] = compileActivations(source("Blister Ammunition (Lesser)"));
    assert.deepEqual([blister.plan.strike.criticalDC, blister.plan.strike.save.resolution.check.against.value, blister.plan.strike.notes, blister.plan.partial], [21, 19, [], undefined]);
    assert.deepEqual(blister.plan.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), ["dazzled"]);
    const dc = async (outcome) => {
        const arrows = foundry.giveItem(fighter, { ...source("Blister Ammunition (Lesser)"), _id: `blister-${outcome}` });
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: arrows.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        const before = foundry.posted.length;
        await attack(outcome, ["item:ranged", `item:ammo:id:${arrows.id}`]);
        return foundry.posted.slice(before)[0]?.plan.resolution.check.against.value;
    };
    assert.equal(await dc("criticalSuccess"), 21);
    assert.equal(await dc("success"), 19);
});

test("Hydra Head Club's Reactive Snap: 1d6 more on the Strike, and a miss gives the activation's use back on the item's record (strike.missRefund); a hit keeps it used", async () => {
    const [snap] = compileActivations(source("Hydra Head Club"));
    assert.deepEqual([snap.plan.strike.missRefund, snap.plan.strike.notes, snap.plan.partial], [true, [], undefined]);
    assert.ok(strikeLines(snap.plan).includes("On a miss: the activation's use is given back (it doesn't count against its frequency)"));
    const club = foundry.giveItem(fighter, source("Hydra Head Club"));
    const uses = () => club.flags?.[MODULE_ID]?.activationUses?.[0]?.count ?? 0;
    const ready = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: club.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
    };
    await ready();
    assert.equal(uses(), 1, "used once");
    // (A Strike with the club itself: its own.)
    const own = ["item:melee", `item:id:${club.id}`];
    await attack("failure", own);
    assert.deepEqual([uses(), readied().length], [0, 0], "the miss gives it back and spends the Strike");
    await ready();
    await attack("success", own);
    await damage(own);
    assert.equal(uses(), 1, "a hit keeps it used");
});

test("a critical hit's penalty to the save: Blindpepper Bolt's -2 circumstance to its Fortitude save after a critical hit (strike.criticalSaveBonus, the core's own save bonus), none after a hit", async () => {
    const [bolt] = compileActivations(source("Blindpepper Bolt"));
    assert.deepEqual(bolt.plan.strike.criticalSaveBonus, { value: -2, type: "circumstance" });
    assert.ok(strikeLines(bolt.plan).includes("After a critical hit, -2 circumstance to that save"));
    const bonus = async (outcome) => {
        const bolts = foundry.giveItem(fighter, { ...source("Blindpepper Bolt"), _id: `pepper-${outcome}` });
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: bolts.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        const before = foundry.posted.length;
        await attack(outcome, ["item:ranged", `item:ammo:id:${bolts.id}`]);
        return foundry.posted.slice(before)[0]?.plan.resolution.check.bonus ?? null;
    };
    assert.deepEqual(await bonus("criticalSuccess"), { value: -2, type: "circumstance" });
    assert.equal(await bonus("success"), null);
});

test("more reach for the Strike: the Extending rune's 60 feet, Tasset of Flexibility's 5 more with a melee weapon (strike.reach, the card's line)", () => {
    const tasset = compileActivations(source("Tasset of Flexibility"))[0].plan;
    assert.deepEqual([routeOf(tasset), tasset.strike.reach, tasset.strike.range, tasset.strike.notes, tasset.partial], ["strike", { more: 5 }, "melee", [], undefined]);
    assert.ok(strikeLines(tasset).includes("Reach 5 feet more for this Strike"));
    const extending = compileActivations(source("Extending"))[0].plan;
    assert.deepEqual([extending.strike.reach, extending.strike.notes, extending.partial], [{ feet: 60 }, [], undefined]);
});

test("a critical hit's save only its critical success escapes: Rhino Shot's \"knocked prone unless it critically succeeds at its save\" — strike.criticalWorse, Prone on the save card's success row after a critical hit, not after a hit", async () => {
    const [rhino] = compileActivations(source("Rhino Shot"));
    assert.deepEqual([rhino.plan.strike.criticalWorse, rhino.plan.strike.notes, rhino.plan.partial], [["prone"], [], undefined]);
    assert.ok(strikeLines(rhino.plan).includes("After a critical hit, prone on the save's success too (only its critical success escapes)"));
    const rows = async (outcome) => {
        const arrows = foundry.giveItem(fighter, { ...source("Rhino Shot"), _id: `rhino-${outcome}` });
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: arrows.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        const before = foundry.posted.length;
        await attack(outcome, ["item:ranged", `item:ammo:id:${arrows.id}`]);
        const outcomes = foundry.posted.slice(before)[0]?.plan.resolution.outcomes;
        return ["criticalSuccess", "success", "failure"].map((degree) => outcomes[degree].effects.map((effect) => effect.slug));
    };
    assert.deepEqual(await rows("criticalSuccess"), [[], ["prone"], ["prone"]]);
    assert.deepEqual(await rows("success"), [[], [], ["prone"]]);
});

test("a Strike's splash (Drake Rifle's Drake Shot, \"1 cold splash damage for this Strike\"): the bomb card's splash list — on a failure the target and the creatures within 5 feet, on a hit those creatures alone (PF2e's damage roll gives the target its own); Apply deals it", async () => {
    const archer = foundry.makeActor({ id: "strike-archer", name: "Archer", owners: ["player"] });
    const mark = foundry.makeActor({ id: "strike-mark", name: "Mark", hp: 30, max: 30 });
    const nearby = foundry.makeActor({ id: "strike-nearby", name: "Nearby", hp: 30, max: 30 });
    foundry.place(archer, 0, 11000);
    foundry.place(mark, 1000, 11000);
    foundry.place(nearby, 1100, 11000);
    const [shot] = compileActivations(source("Drake Rifle (Cold)"));
    assert.deepEqual([shot.plan.strike.splash, shot.plan.strike.notes, shot.plan.partial], [{ value: 1, damageType: "cold" }, [], undefined]);
    const rifle = foundry.giveItem(archer, source("Drake Rifle (Cold)"));
    const ready = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: rifle.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
    };
    const shoot = async (outcome) => {
        const count = foundry.messages.length;
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options: ["item:ranged", `item:id:${rifle.id}`], target: { actor: mark.uuid, token: mark.token.uuid } }, origin: { uuid: rifle.uuid, type: "weapon" } } }, speaker: { actor: archer.id }, actor: archer, token: archer.token.document }));
        await settle();
        return foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "bomb");
    };
    await ready();
    const missed = await shoot("failure");
    assert.deepEqual(missed.flags[MODULE_ID].card.splashed.map((entry) => [entry.name, entry.include]), [["Mark", true], ["Nearby", true]]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: missed.id, userId: "player", included: [0, 1] });
    await settle();
    assert.deepEqual([mark.healed.map((entry) => entry.damage), nearby.healed.map((entry) => entry.damage)], [["(1[splash])[cold]"], ["(1[splash])[cold]"]]);
    await ready();
    const hit = await shoot("success");
    assert.deepEqual(hit.flags[MODULE_ID].card.splashed.map((entry) => entry.name), ["Nearby"], "the target's own is PF2e's damage roll");
});

test("a Strike only against a kind of creature (Carver-cutter's Chop Down, \"against a plant creature or a creature made primarily of wood\"): its extra 2d6 precision for those targets, its Clumsy on them alone; another target's Strike spends it", async () => {
    const [, chop] = compileActivations(source("Carver-cutter"));
    assert.deepEqual([chop.plan.strike.against, chop.plan.strike.damage[0].predicate, chop.plan.strike.notes, chop.plan.partial], [["plant", "wood"], [{ or: ["target:trait:plant", "target:trait:wood"] }], [], undefined]);
    assert.ok(strikeLines(chop.plan).includes("Only against a plant or wood creature (another target spends it)"));
    // (Not a plant: spent, no riders; a plant: the hit's riders.)
    assert.equal(riderFor(chop.plan, { outcome: "success", options: ["item:melee", "target:trait:humanoid"] }), "spend");
    assert.equal(riderFor(chop.plan, { outcome: "success", options: ["item:melee", "target:trait:plant"] }), "hit");
    assert.equal(riderFor(chop.plan, { outcome: "success", options: ["item:melee", "target:trait:wood"] }), "hit");
});

test("Gravebane Ammunition: its hit's Fortitude save only for a creature with void healing (its vitality damage PF2e's own rule, said on the card, not a note)", async () => {
    const [shot] = compileActivations(source("Gravebane Ammunition"));
    assert.deepEqual([routeOf(shot.plan), shot.plan.strike.saveOnly, shot.plan.strike.ownRules, shot.plan.strike.notes, shot.plan.partial, shot.plan.strike.damage ?? []], ["strike", "void-healing", ["an additional 1d10 vitality damage to creatures with void healing"], [], undefined, []]);
    assert.ok(strikeLines(shot.plan).includes("PF2e's own rules add an additional 1d10 vitality damage to creatures with void healing"));
    const archer = foundry.makeActor({ id: "strike-gravebane", name: "Gravebane Archer", owners: ["player"] });
    const living = foundry.makeActor({ id: "strike-living", name: "Living" });
    const ghoul = foundry.makeActor({ id: "strike-ghoulish", name: "Ghoulish", undead: true });
    foundry.place(archer, 0, 11500);
    foundry.place(living, 1000, 11500);
    foundry.place(ghoul, 2000, 11500);
    const shoot = async (target) => {
        const ammo = foundry.giveItem(archer, { ...source("Gravebane Ammunition"), _id: `gravebane-${target.id}` });
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: ammo.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        const before = foundry.posted.length;
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: ["item:ranged", `item:ammo:id:${ammo.id}`], target: { actor: target.uuid, token: target.token.uuid } } } }, speaker: { actor: archer.id }, actor: archer, token: archer.token.document }));
        await settle();
        return foundry.posted.slice(before);
    };
    assert.equal((await shoot(living)).length, 0, "a living creature: no save");
    const [save] = await shoot(ghoul);
    assert.equal(save?.plan.resolution.check.against.value, 19);
});

test("Juxtaposition Ammunition: a failed save teleports the creature hit to a square its attacker picks — 60 feet from where it was, within the weapon's range increment; Sickened 1 on a critical failure; no damage on the hit", async () => {
    const ammo = compileActivations(source("Juxtaposition Ammunition"))[0].plan;
    const placed = ammo.strike.save.placed;
    assert.deepEqual([placed.rows, placed.nearSource, placed.teleport, placed.lines], [{ failure: { within: 60 }, criticalFailure: { within: 60 } }, "weapon-range", true, ["Into a safe, unoccupied square"]]);
    assert.deepEqual(ammo.strike.save.resolution.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.value]), [["sickened", 1]]);
    assert.deepEqual([ammo.strike.noDamage, ammo.strike.notes, ammo.partial], [true, [], undefined]);
    const { withoutPlacedMoves } = await import("../src/compiler/placed.js");
    assert.equal(withoutPlacedMoves(ammo).partial, true, "before ability 0.9.2: partial, its teleport the GM's");
});
