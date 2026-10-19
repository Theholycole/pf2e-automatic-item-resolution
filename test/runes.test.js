// Etched runes' activations: a weapon's or armor's property rune keys matched to PF2e's rune items, and the rune's
// activations played from the item it's etched onto, as any permanent item's.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { etchedKeys, etchedRuneActivations, runeIndex, runeKeyOfSlug } from "../src/compiler/runes.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const runes = runeIndex(equipment);

// (Shared with the other flow tests: this creature stands 260 squares down.)
const foundry = await fakeFoundry();
const knight = foundry.makeActor({ id: "rune-knight", name: "Knight", owners: ["player"], hp: 5, max: 40 });
foundry.place(knight, 0, 26000);

test("rune keys: PF2e's keys from its rune items' slugs, the renamed runes' old keys", () => {
    assert.deepEqual(["vorpal", "extending-greater", "ghost-touch", "quickstrike", "vitalizing-greater", "spell-reservoir", "animated", "bolkas-blessing"].map(runeKeyOfSlug), ["vorpal", "greaterExtending", "ghostTouch", "speed", "greaterDisrupting", "spellStoring", "dancing", "bolkasBlessing"]);
    // Every rune key on PF2e's own weapons and armor that has an activation finds its rune.
    const keys = new Set(equipment.flatMap((doc) => etchedKeys(doc)));
    assert.deepEqual([...keys].filter((key) => !runes.has(key) && !/Resistant$|^glamered$/.test(key)), []);
    assert.deepEqual(etchedKeys({ system: { runes: { property: { 0: "" } } } }), [], "PF2e's handwraps' empty object");
});

test("an armor's etched rune: its activations, indexed by rune, with the rune's name", () => {
    const armor = { type: "armor", name: "Plate", system: { runes: { property: ["bolkasBlessing"] } } };
    const [gift] = etchedRuneActivations(armor, runes);
    assert.deepEqual([gift.index, gift.rune.name, gift.activation.name], ["rune:bolkasBlessing:0", "Bolka's Blessing", "Gift of Life"]);
    assert.equal(routeOf(gift.plan, plainText(gift.activation.html)), "item");
    assert.deepEqual(etchedRuneActivations({ type: "weapon", system: { runes: { property: [] } } }, runes), []);
    assert.deepEqual(etchedRuneActivations({ type: "equipment", system: { runes: { property: ["bolkasBlessing"] } } }, runes), [], "only what a rune is etched onto");
});

test("live: the rune's Activate on the armor posts its card, named for the armor and the rune", async () => {
    const plate = foundry.giveItem(knight, { _id: "runePlate0000001", type: "armor", name: "Full Plate", img: null, system: { description: { value: "<p>Plate armor.</p>" }, runes: { potency: 1, resilient: 0, property: ["bolkasBlessing"] } } });
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: plate.uuid, activation: "rune:bolkasBlessing:0", userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card);
    assert.ok(card, "the rune's card");
    assert.equal(card.flags[MODULE_ID].card.item.name, "Full Plate (Bolka's Blessing: Gift of Life)");
    assert.match(card.content, /3d10/);
});

test("the runes' reactions read: Vorpal's death, Hauling's push, Ouroboros Flail's pull and grab, Deathless, Unholy Bloodshed, Energy-Absorbing", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const plans = (name) => compileActivations(equipment.find((doc) => doc.name === name));
    const failure = (plan) => plan.resolution.outcomes.failure;
    // Vorpal: a Fortitude save or death; who it doesn't kill, the GM's.
    const vorpal = plans("Vorpal")[0].plan;
    assert.deepEqual([vorpal.resolution.check.statistic, vorpal.resolution.check.against.value, failure(vorpal).terminal, vorpal.resolution.outcomes.criticalFailure.terminal, vorpal.resolution.outcomes.success.terminal], ["fortitude", 37, { kind: "death" }, { kind: "death" }, undefined]);
    assert.match(vorpal.resolution.reminders[0], /require a head/);
    // Hauling: pushed 5 feet (10 for the greater), the direction its user's choice.
    assert.deepEqual([failure(plans("Hauling")[0].plan).forcedMovement.distance, failure(plans("Hauling (Greater)")[0].plan).forcedMovement.distance], [5, 10]);
    assert.match(failure(plans("Hauling")[0].plan).manualInstructions[0], /direction is its user's choice/);
    // Ouroboros Flail: pulled to its user, then grabbed until the end of their next turn.
    const grasp = plans("Ouroboros Flail").find((entry) => entry.activation.name === "Chained Grasp").plan;
    assert.deepEqual([failure(grasp).forcedMovement.kind, failure(grasp).effects.map((effect) => [effect.slug, effect.duration?.expiry])], ["pull", [["grabbed", "turn-end"]]]);
    // Deathless: the triggering condition, doomed or wounded, lowered by 1 (the card's picker).
    assert.deepEqual(plans("Deathless")[0].plan.item.reduce, [{ choose: ["doomed", "wounded"], by: 1 }]);
    // Unholy Bloodshed: 1d8 persistent bleed per die of the weapon it's etched onto.
    const bleed = (entry) => entry.plan.resolution.sharedDamage.components[0];
    assert.deepEqual([bleed(plans("Unholy")[0]).formula, bleed(plans("Unholy")[0]).category], ["1d8", "persistent"]);
    assert.equal(bleed(etchedRuneActivations({ type: "weapon", system: { damage: { dice: 1, die: "d8" }, runes: { striking: 2, property: ["unholy"] } } }, runes)[0]).formula, "3d8");
    // Energy-Absorbing: 2d6 of the energy its maker chose, at the attacker.
    const absorb = plans("Energy-Absorbing")[0].plan;
    assert.deepEqual([routeOf(absorb), absorb.damageChoices.map((choice) => choice.formula)], ["save", ["2d6[acid]", "2d6[cold]", "2d6[electricity]", "2d6[fire]"]]);
});

test("the runes on a critical hit: their saves and conditions read, for the creatures they're for", async () => {
    const { runeCritRiders, riderFits } = await import("../src/compiler/rune-strikes.js");
    const ridersOf = (name) => runeCritRiders(equipment.find((doc) => doc.name === name));
    const row = (rider, degree) => rider.plan.resolution.outcomes[degree];
    const [thundering] = ridersOf("Thundering");
    assert.deepEqual([thundering.plan.resolution.check.statistic, thundering.plan.resolution.check.against.value, row(thundering, "failure").effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit]), row(thundering, "criticalFailure").effects[0].duration.unit], ["fortitude", 24, [["deafened", 1, "minutes"]], "hours"]);
    assert.deepEqual(row(ridersOf("Frost")[0], "failure").effects.map((effect) => [effect.slug, effect.value]), [["slowed", 1]]);
    assert.deepEqual(row(ridersOf("Brilliant")[0], "failure").effects.map((effect) => effect.slug), ["blinded"], "a save link without the word");
    const [impactful] = ridersOf("Impactful");
    assert.deepEqual([impactful.optional, row(impactful, "failure").forcedMovement.distance], [true, 5]);
    // No save: the card with no roll.
    const [crushing] = ridersOf("Crushing");
    assert.deepEqual([crushing.plan.resolution.check.roll, row(crushing, "success").effects.map((effect) => [effect.slug, effect.value])], ["automatic", [["clumsy", 1], ["enfeebled", 1]]]);
    assert.deepEqual(row(ridersOf("Flickering")[0], "success").effects.map((effect) => [effect.slug, effect.duration?.value]), [["dazzled", 1]]);
    // Only for some creatures: the undead, a bleeding target, one already stupefied.
    const [vitalizing] = ridersOf("Vitalizing");
    assert.deepEqual([riderFits(vitalizing, { traits: ["undead"] }), riderFits(vitalizing, { traits: ["humanoid"] })], [true, false]);
    assert.deepEqual([riderFits(ridersOf("Bloodthirsty")[0], { persistent: ["bleed"] }), riderFits(ridersOf("Bloodthirsty")[0], { persistent: ["fire"] })], [true, false]);
    // Greater Giant-Killing: a save with its own degree rows, against a giant.
    const [giant] = ridersOf("Giant-Killing (Greater)");
    assert.deepEqual([giant.only, giant.plan.resolution.check.against.value, row(giant, "criticalFailure").effects.map((effect) => [effect.slug, effect.value, effect.duration?.unit]), row(giant, "criticalFailure").damage.formulas[0].formula], [{ trait: "giant" }, 34, [["enfeebled", 4, "minutes"]], "4d10[mental]"]);
    // A weapon's own (Gluttonous Spear): the same reading, named for the weapon.
    const { etchedCritRiders } = await import("../src/compiler/rune-strikes.js");
    const spear = etchedCritRiders(equipment.find((doc) => doc.name === "Gluttonous Spear"), runes);
    assert.deepEqual(spear.map((rider) => [rider.own, row(rider, "success").effects.map((effect) => effect.slug).join()]), [[true, "enfeebled"]]);
    const nightmare = ridersOf("Nightmare");
    assert.deepEqual(nightmare.map((rider) => [rider.only?.condition ?? null, row(rider, "success").effects.map((effect) => effect.slug).join()]), [[null, "stupefied"], ["stupefied", "frightened"]]);
});

test("live: a critical hit with a Thundering, Crushing weapon posts both cards at the creature hit; a hit posts none", async () => {
    const foe = foundry.makeActor({ id: "rune-foe", name: "Foe" });
    foundry.place(foe, 100, 26000);
    const sword = foundry.giveItem(knight, { _id: "runeSword0000001", type: "weapon", name: "Thundering Crushing Club", img: null, system: { description: { value: "" }, damage: { dice: 1, die: "d6", damageType: "bludgeoning" }, runes: { potency: 2, striking: 1, property: ["thundering", "crushing"] } } });
    const strike = async (outcome) => {
        const before = foundry.posted.length;
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, target: { token: foe.token.uuid } }, origin: { uuid: sword.uuid, type: "weapon" } } }, speaker: { actor: knight.id }, actor: knight, token: knight.token.document }));
        await settle();
        return foundry.posted.slice(before);
    };
    assert.deepEqual(await strike("success"), []);
    const cards = await strike("criticalSuccess");
    assert.deepEqual(cards.map((card) => [card.item.name, card.plan.resolution.check.roll ?? card.plan.resolution.kind, card.cause]), [["Thundering Crushing Club (Thundering)", "save", "critical hit"], ["Thundering Crushing Club (Crushing)", "automatic", "critical hit"]]);
    assert.equal(cards[0].tokens[0].name ?? cards[0].tokens[0].actor?.name, "Foe");
});

test("weapons' own critical-hit sentences: Mindlance's frightened and Serpent Dagger's sickened unless they save, Thundercrasher's save at its wielder's class DC, Stargazer's dazzle, Fearcutter only against the unholy, Deflecting Branch's prone, Spider Gun's persistent poison with its dice counted; none for damage PF2e's rules roll (Golden Blade of Mzali, Chain of Command)", async () => {
    const { etchedCritRiders } = await import("../src/compiler/rune-strikes.js");
    const ridersOf = (name) => etchedCritRiders(equipment.find((doc) => doc.name === name), runes);
    const row = (rider, degree) => rider.plan.resolution.outcomes[degree];
    const [mindlance] = ridersOf("Mindlance");
    assert.deepEqual([mindlance.plan.resolution.check.statistic, mindlance.plan.resolution.check.against.value, row(mindlance, "failure").effects.map((effect) => [effect.slug, effect.value])], ["will", 24, [["frightened", 2]]]);
    const [serpent] = ridersOf("Serpent Dagger");
    assert.deepEqual([serpent.plan.resolution.check.statistic, row(serpent, "failure").effects.map((effect) => [effect.slug, effect.value])], ["fortitude", [["sickened", 1]]]);
    const [thunder] = ridersOf("Thundercrasher");
    assert.deepEqual([thunder.plan.resolution.check.statistic, thunder.plan.resolution.check.against, row(thunder, "failure").effects.map((effect) => effect.slug)], ["fortitude", { dc: "owner", statistic: "class" }, ["deafened"]]);
    assert.deepEqual(row(ridersOf("Stargazer")[0], "success").effects.map((effect) => [effect.slug, effect.duration?.value]), [["dazzled", 1]]);
    const [fear] = ridersOf("Fearcutter");
    assert.deepEqual([fear.only, row(fear, "success").effects.map((effect) => [effect.slug, effect.value])], [{ trait: "unholy" }, [["frightened", 1]]]);
    assert.deepEqual(row(ridersOf("Deflecting Branch")[0], "success").effects.map((effect) => effect.slug), ["prone"]);
    assert.deepEqual(ridersOf("Spider Gun (Major)")[0].plan.resolution.sharedDamage.components.map((component) => component.formula), ["(1d4+3)[persistent,poison]"]);
    assert.deepEqual([ridersOf("Golden Blade of Mzali").length, ridersOf("Chain of Command").length], [0, 0]);
});

test("live: Thundercrasher's critical hit posts its save at its wielder's class DC; with none, the GM's", async () => {
    const foe = foundry.makeActor({ id: "rune-foe-2", name: "Deafened Foe" });
    foundry.place(foe, 200, 26000);
    const hammer = foundry.giveItem(knight, equipment.find((doc) => doc.name === "Thundercrasher"));
    const critical = async () => {
        const before = foundry.posted.length;
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "criticalSuccess", target: { token: foe.token.uuid } }, origin: { uuid: hammer.uuid, type: "weapon" } } }, speaker: { actor: knight.id }, actor: knight, token: knight.token.document }));
        await settle();
        return foundry.posted.slice(before);
    };
    knight.system.attributes.classDC = { value: 27 };
    const [card] = await critical();
    assert.deepEqual([card.item.name, card.plan.resolution.check.against], ["Thundercrasher", { dc: "fixed", value: 27 }]);
    delete knight.system.attributes.classDC;
    const count = foundry.messages.length;
    assert.deepEqual(await critical(), []);
    assert.match(foundry.messages.slice(count).map((message) => message.content).join(" "), /Thundercrasher.*has no class DC/);
});

test("Swarming: double the weapon's damage dice as its damage, of the weapon's type, in a 30-foot cone with a basic Reflex save", () => {
    const dagger = equipment.find((doc) => doc.name === "Dagger");
    const weapon = { ...dagger, system: { ...dagger.system, runes: { potency: 2, striking: 1, property: ["swarming"] } } };
    const [swarm] = etchedRuneActivations(weapon, runes, {});
    assert.deepEqual([swarm.index, swarm.plan.resolution.sharedDamage.components[0].formula, swarm.plan.targeting.area, swarm.plan.resolution.check.basic, swarm.plan.resolution.check.against.value], ["rune:swarming:0", "4[piercing]", { type: "cone", value: 30 }, true, 27]);
});

test("Swallow-Spike etched on +2 armor: its attack at the armor's bonus (+16, 2d6+4), and its second activation the same attack", () => {
    const mail = equipment.find((doc) => doc.name === "Chain Mail");
    const armor = { ...mail, system: { ...mail.system, runes: { potency: 2, resilient: 1, property: ["swallowSpike"] } } };
    const [reaction, action] = etchedRuneActivations(armor, runes, {});
    for (const entry of [reaction, action]) assert.deepEqual([entry.plan.ownCheck.modifier, entry.plan.resolution.sharedDamage.components[0].formula, entry.plan.resolution.sharedDamage.components[0].type], [16, "2d6+4", "piercing"]);
    assert.deepEqual([reaction.plan.activation.time, action.plan.activation.time, action.plan.trigger.event], ["reaction", "1", "use"]);
});

test("Cunning etched onto a +2 longsword: PF2e's Recall Knowledge with its weapon's +2 item bonus (the potency rune's), the critical hit's +2 circumstance a note", () => {
    const sword = structuredClone(equipment.find((doc) => doc.name === "Longsword"));
    sword.system.runes = { potency: 2, striking: 1, property: ["cunning"] };
    const [cunning] = etchedRuneActivations(sword, runes);
    assert.deepEqual([cunning.plan.builtin, cunning.plan.action.slug, cunning.plan.action.bonus], ["item-action", "recall-knowledge", { value: 2, type: "item" }]);
    assert.match(cunning.plan.action.after, /^If the required attack was a critical hit, you also gain a \+2 circumstance bonus to this check\.$/);
    // (No potency: the words as PF2e wrote them, nothing to roll.)
    sword.system.runes.potency = 0;
    assert.equal(etchedRuneActivations(sword, runes)[0].plan?.builtin === "item-action", false);
});
