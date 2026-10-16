// The module's own items (packs/_source/items): the generic spellgun, a spell's plan moved under a spellgun's attack and
// heightened to the rank picked; the gun staff, a two-handed firearm merged with a staff. The spells' plans are the spell
// module's own compiler's, as live play gets them through the core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileAbility } from "../../pf2e-automatic-resolution/src/compiler/index.js";
import { resolveSaveSync } from "../../pf2e-resolution-core/src/families/save.js";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { GENERIC_SPELLGUN, descriptionFor, isPending, loadedUpdate, pickable, spellgunFromSpell } from "../src/compiler/generic-spellgun.js";
import { GUN_STAFF, firearmProblem, gunStaffName, gunStaffUpdate, isBaseFirearm, isPending as gunStaffPending, isStaff } from "../src/compiler/gun-staff.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => ({ ...equipment.find((doc) => doc.name === name), uuid: `Compendium.pf2e.equipment-srd.Item.${equipment.find((doc) => doc.name === name)._id}` });
const spells = readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items");
const effects = readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items");
const nativeEffectCatalog = new Map(effects.map((effect) => [effect.name, { id: effect._id, name: effect.name, type: effect.type, automation: { ruleKeys: [...new Set((effect.system.rules ?? []).map((rule) => rule.key))], requiresConfiguration: (effect.system.rules ?? []).some((rule) => rule.key === "ChoiceSet"), removesAfterRoll: false }, mechanics: { rules: effect.system.rules ?? [], duration: effect.system.duration ?? null, start: effect.system.start ?? null } }]));
const referencedSpells = new Map(spells.map((spell) => [`Compendium.pf2e.spells-srd.Item.${spell._id}`, spell]));
const spell = (name) => {
    const source = spells.find((doc) => doc.name === name);
    return { ...source, uuid: `Compendium.pf2e.spells-srd.Item.${source._id}` };
};
const spellPlan = (name) => compileAbility(spell(name), { nativeEffectCatalog, referencedSpells });
const gunFor = (name, rank) => spellgunFromSpell(spellPlan(name), { spell: spell(name), rank });
const ownSource = (file) => JSON.parse(readFileSync(new URL(`../packs/_source/items/${file}`, import.meta.url), "utf8"));
const effectsOf = (row) => row.effects.map((effect) => [effect.slug, effect.value ?? null]);

// (Shared with the other flow tests: these creatures stand 180 squares down.)
const foundry = await fakeFoundry();
const gunner = foundry.makeActor({ id: "generic-gunner", name: "Gunner", owners: ["player"] });
const target = foundry.makeActor({ id: "generic-target", name: "Target" });
foundry.place(gunner, 0, 18000);
foundry.place(target, 100, 18000);

test("a save spell: a hit is the target's failed save, a critical hit its critical failure, heightened to the rank picked", () => {
    // Fireball at rank 5: 10d6 fire to the one target, double on a critical hit; the area is the target alone.
    const fireball = gunFor("Fireball", 5);
    assert.deepEqual([fireball.rank, fireball.resolution.kind, fireball.resolution.check.against.statistic, fireball.ownCheck.choose, fireball.targeting], [5, "check", "ac", ["spell", "firearm"], { target: "1 creature", range: "30 feet", area: null }]);
    assert.deepEqual(fireball.resolution.sharedDamage.components.map((component) => [component.formula, component.type]), [["10d6", "fire"]]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => fireball.resolution.outcomes[degree].damage.multiplier), [2, 1, 0, 0]);
    assert.equal(routeOf(fireball), "save", "the ability module's card, at the presser's targets");
    // Fear: frightened 2 on a hit; frightened 3 and fleeing for a round on a critical hit.
    const fear = gunFor("Fear", 1);
    assert.deepEqual([effectsOf(fear.resolution.outcomes.success), effectsOf(fear.resolution.outcomes.criticalSuccess)], [[["frightened", 2]], [["frightened", 3], ["fleeing", null]]]);
    // Grim Tendrils at rank 3: 6d4 void and the persistent bleed its rank deals.
    const tendrils = gunFor("Grim Tendrils", 3);
    assert.deepEqual([tendrils.resolution.sharedDamage.components[0].formula, tendrils.resolution.outcomes.success.damage.formulas[0].formula, tendrils.resolution.outcomes.criticalSuccess.damage.formulas[0].formula], ["6d4", "(3)[persistent,bleed]", "(6)[persistent,bleed]"]);
    // The core resolves it: a hit's damage at the rank.
    const result = resolveSaveSync(fireball, { caster: { id: "c" }, targets: [{ id: "t" }], id: (creature) => creature.id, statistic: () => ({ modifier: 0, dc: 20 }) }, { roll: () => ({ degree: "success", total: 25, natural: 12 }), damage: () => 35, choose: () => undefined });
    assert.deepEqual(result.changes.find((change) => change.op === "damage").instances, [{ type: "fire", category: null, amount: 35 }]);
});

test("a spell attack spell keeps its own rows; a spell with damage alone deals it; one a hit can't carry isn't loaded", () => {
    const ray = gunFor("Ray of Frost", 3);
    assert.deepEqual([ray.spellgun.mapping, ray.resolution.sharedDamage.components[0].formula, ray.resolution.outcomes.criticalSuccess.modifiers.length], ["attack", "4d4", 1]);
    // Black Tentacles: its data's damage on a hit, double on a critical hit, the rest a note.
    const tentacles = gunFor("Black Tentacles", 5);
    assert.deepEqual([tentacles.spellgun.mapping, tentacles.resolution.outcomes.criticalSuccess.damage.multiplier, tentacles.partial], ["damage", 2, true]);
    assert.match(tentacles.notes[0], /The rest of Black Tentacles/);
    // Banishment's failure sends the target away, which no row holds, and it has no damage.
    assert.equal(gunFor("Banishment", 5), null);
    // The picker offers spells with a save, damage or the attack trait, not rituals or a healing spell's healing.
    assert.deepEqual([pickable({ type: "spell", system: spell("Fear").system }), pickable({ type: "spell", system: spell("Shield").system }), pickable({ type: "spell", system: { ...spell("Fireball").system, ritual: {} } }), pickable({ type: "spell", system: spell("Healing Well").system })], [true, false, false, false]);
    assert.equal(gunFor("Healing Well", 1), null);
});

test("the spell as cast with 2 actions, a spellgun's Activate (the simulator session's finding)", () => {
    // Force Barrage: 2 shards, one more each per action every 2 ranks, all at the target, combined.
    const barrage = gunFor("Force Barrage", 1);
    assert.deepEqual([barrage.spellgun.mapping, barrage.spellgun.missiles, barrage.resolution.sharedDamage.components[0].formula, barrage.resolution.outcomes.criticalSuccess.damage.multiplier, barrage.notes], ["damage", 2, "2d4+2", 2, undefined]);
    assert.deepEqual([gunFor("Force Barrage", 3).resolution.sharedDamage.components[0].formula, gunFor("Force Barrage", 5).resolution.sharedDamage.components[0].formula], ["4d4+4", "6d4+6"]);
    assert.match(descriptionFor(spell("Force Barrage"), 3, gunFor("Force Barrage", 3)), /as cast with 2 actions: all 4 of its shards hit the target/);
    // Disorienting Flash: its 2-action version's 2d10 (not the 1-action 1d10), heightened.
    assert.deepEqual([gunFor("Disorienting Flash", 2).resolution.sharedDamage.components[0].formula, gunFor("Disorienting Flash", 4).resolution.sharedDamage.components[0].formula], ["2d10", "4d10"]);
    // Blazing Bolt: a ray only in its action versions, a spell attack: 4d6 with 2 actions at rank 2.
    const bolt = gunFor("Blazing Bolt", 2);
    assert.deepEqual([bolt.spellgun.mapping, bolt.resolution.sharedDamage.components[0].formula, bolt.resolution.outcomes.criticalSuccess.damage.multiplier], ["attack", "4d6", 2]);
    // (What the core would apply again isn't kept: the action versions, the native damage.)
    assert.deepEqual([bolt.resolution.native?.byActions, bolt.resolution.native?.sharedDamage, bolt.resolution.native?.outcomes], [undefined, undefined, undefined]);
    const rolled = resolveSaveSync(gunFor("Disorienting Flash", 2), { caster: { id: "c" }, targets: [{ id: "t" }], id: (creature) => creature.id, statistic: () => ({ modifier: 0, dc: 20 }) }, { roll: () => ({ degree: "success", total: 25, natural: 12 }), damage: (instance) => instance.dice.reduce((sum, term) => sum + term.count, 0), choose: () => undefined });
    assert.equal(rolled.changes.find((change) => change.op === "damage").instances[0].amount, 2, "two d10s rolled");
});

test("the loaded item: its name, level, price, description and plan; compileItem returns the plan, none before", () => {
    const pending = ownSource("generic-spellgun.json");
    assert.equal(isPending(pending), true);
    assert.equal(compileItem({ ...pending, uuid: "Actor.a.Item.g" }), null, "no spell yet: no card");
    const fireball = gunFor("Fireball", 5);
    const update = loadedUpdate(spell("Fireball"), 5, fireball);
    assert.deepEqual([update.name, update["system.level.value"], update["system.price.value"].gp], ["Fireball Spellgun (Rank 5)", 9, 150]);
    assert.ok(update["system.traits.value"].includes("fire") && !update["system.traits.value"].includes("manipulate"));
    assert.match(update["system.description.value"], /<strong>Damage<\/strong> 10d6 fire/);
    assert.match(update["system.description.value"], /<strong>Critical Success<\/strong> The target takes double damage/);
    // Fear's own words, its critical failure as the critical hit.
    assert.match(descriptionFor(spell("Fear"), 1, gunFor("Fear", 1)), /<strong>Critical Success<\/strong> The target is @UUID\[[^\]]+\]\{Frightened 3\}/);
    const loaded = { ...pending, name: update.name, uuid: "Actor.a.Item.g", flags: { [MODULE_ID]: { [GENERIC_SPELLGUN]: update[`flags.${MODULE_ID}.${GENERIC_SPELLGUN}`] } } };
    const plan = compileItem(loaded);
    assert.deepEqual([plan.source.name, plan.source.uuid, plan.item.recipient, plan.rank, routeOf(plan)], ["Fireball Spellgun (Rank 5)", "Actor.a.Item.g", "user", 5, "save"]);
});

test("live: a loaded generic spellgun's card offers its user's attacks; an unloaded one used comes back", async () => {
    gunner.spellcasting = { contents: [{ statistic: { check: { mod: 12 } } }] };
    gunner.system.actions = [{ item: { group: "firearm" }, totalModifier: 10 }];
    const update = loadedUpdate(spell("Fear"), 1, gunFor("Fear", 1));
    const source = { ...ownSource("generic-spellgun.json"), _id: "genericLoaded01", name: update.name, flags: { [MODULE_ID]: { [GENERIC_SPELLGUN]: update[`flags.${MODULE_ID}.${GENERIC_SPELLGUN}`] } } };
    const gun = foundry.giveItem(gunner, source);
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: gun.uuid, sourceId: null, type: "consumable" } } }, speaker: { actor: gunner.id }, actor: gunner, token: gunner.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.deepEqual(card.flags[MODULE_ID].card.attackChoices.map((choice) => choice.label), ["Spell attack +12", "Firearm attack +10"]);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [target.token.uuid], attackChoice: 0 });
    await settle();
    const posted = foundry.posted.slice(before)[0];
    assert.deepEqual([posted.plan.resolution.check.statistic, posted.plan.resolution.check.modifier, effectsOf(posted.plan.resolution.outcomes.success)], ["spell attack", 12, [["frightened", 2]]]);
    // Unloaded, used: PF2e deleted it; it's made again, and its user is told.
    const empty = { ...ownSource("generic-spellgun.json"), _id: "genericEmpty001" };
    const uuid = `${gunner.uuid}.Item.${empty._id}`;
    await foundry.call("deleteItem", { type: "consumable", uuid, actor: gunner, toObject: () => structuredClone(empty) });
    const used = foundry.makeMessage({ flags: { pf2e: { origin: { uuid, sourceId: null, type: "consumable" } } }, speaker: { actor: gunner.id }, actor: gunner, token: gunner.token.document });
    await foundry.call("createChatMessage", used);
    await settle();
    assert.ok(gunner.created.some((entry) => entry.name === "Generic Spellgun" && entry.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]), "back in the inventory");
    assert.match(foundry.messages.at(-1).content, /holds no spell yet, so nothing happened/);
});

test("the gun staff: a two-handed firearm and a staff merged, as the Musket Staff of Force", () => {
    const musket = item("Flintlock Musket");
    const fire = item("Staff of Fire");
    const stock = item("Reinforced Stock");
    const pending = ownSource("gun-staff.json");
    assert.equal(gunStaffPending(pending), true);
    // Staff of Fire (3rd level, 60 gp) on a flintlock musket (5 gp) with a +1 (35 gp): 4th level and 100 gp, the Musket Staff's.
    const update = gunStaffUpdate(pending, musket, fire, { stock, id: "stockStockStock1" });
    assert.deepEqual([update.name, update.system.level.value, update.system.price.value, update.system.runes.potency], ["Flintlock Musket Staff of Fire", 4, { pp: 0, gp: 100, sp: 0, cp: 0 }, 1]);
    assert.deepEqual([update.system.group, update.system.baseItem, update.system.usage.value, update.system.range, update.system.damage.die], ["firearm", "flintlock-musket", "held-in-two-hands", 70, "d6"]);
    assert.deepEqual(update.system.traits.value, ["concussive", "fatal-d10", "magical", "staff"], "the firearm's and the staff's, not its club's two-hand d8");
    assert.equal(update.system.traits.rarity, "uncommon");
    // (Not the firearm's identification, which would give it the firearm's name and description back.)
    assert.equal("identification" in gunStaffUpdate(pending, { ...musket, system: { ...musket.system, identification: { identified: { name: "Flintlock Musket" } } } }, fire, { stock }).system, false);
    // The staff's spell list is the description's last list, which PF2e Dailies prepares the staff from.
    const lists = update.system.description.value.match(/<ul>[\s\S]*?<\/ul>/g);
    assert.match(lists.at(-1), /\{Ignition\}[\s\S]*\{Breathe Fire\}/);
    // The Reinforced Stock attached, with the gun staff's runes.
    assert.deepEqual(update.system.subitems.map((sub) => [sub._id, sub.name, sub.system.runes.potency, "uuid" in sub]), [["stockStockStock1", "Reinforced Stock", 1, false]]);
    assert.deepEqual(update[`flags.${MODULE_ID}.${GUN_STAFF}`], { firearm: { uuid: musket.uuid, name: "Flintlock Musket" }, staff: { uuid: fire.uuid, name: "Staff of Fire" } });
    // A staff with runes of its own keeps them, at its own level.
    const might = gunStaffUpdate(pending, item("Arquebus"), item("Staff of Arcane Might"), { stock });
    assert.deepEqual([might.name, might.system.runes.potency, might.system.runes.striking, might.system.level.value], ["Arquebus Staff of Arcane Might", 1, 1, 12]);
    // A combination firearm has its own melee usage: no stock.
    assert.deepEqual(gunStaffUpdate(pending, item("Gun Sword"), fire, { stock }).system.subitems, []);
    assert.equal(gunStaffName(item("Arquebus"), item("Animal Staff")), "Animal Arquebus Staff");
});

test("the gun staff takes two-handed base firearms only, and staves", () => {
    assert.equal(isBaseFirearm(item("Arquebus")), true);
    assert.equal(isBaseFirearm(item("Flintlock Pistol")), false);
    assert.match(firearmProblem(item("Flintlock Pistol")), /isn't a two-handed firearm: a gun staff takes two-handed firearms only/);
    assert.match(firearmProblem(item("Musket Staff of Force")), /is a staff already/);
    assert.match(firearmProblem(item("Longsword")), /isn't a firearm/);
    assert.deepEqual([isStaff(item("Staff of Fire")), isStaff(item("Musket Staff of Force")), isStaff(item("Arquebus"))], [true, false, false]);
});
