// Triggered activations built on 2026-10-27 (docs/needs.md, "Triggers"): reactions and effects that fire on an event — a creature reduced to 0
// Hit Points, a hit, a spell at its user — each its card's reading on the real PF2e pack item, and its live play where it has its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { strikeLines } from "../src/live/strike-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
// (The spell module's claims, as live play and tools/needs.mjs pass them: an item it doesn't cast is the item module's.)
const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
const options = { spells: spellIndex(documents("spells")), ...(claims ? { claims } : {}) };
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const activation = (name, which) => compileActivations(item(name), options).find((entry, index) => (typeof which === "string" ? entry.activation.name === which : index === (which ?? 0)))?.plan;
const consumable = (name) => compileItem(item(name), options);
// (Nothing left to the table: not partial nor note-only, no notes unread, no GM lines on its rows.)
const done = (plan) => !plan.partial && !plan.noteOnly && !(plan.unread ?? []).length && Object.values(plan.resolution?.outcomes ?? {}).every((row) => !(row?.manualInstructions ?? []).length);

// (Shared with the other flow tests: these creatures stand 520 squares down.)
const foundry = await fakeFoundry();
const reaper = foundry.makeActor({ id: "trigger-reaper", name: "Reaper", owners: ["player"] });
const victim = foundry.makeActor({ id: "trigger-victim", name: "Victim" });
foundry.place(reaper, 0, 52000);
foundry.place(victim, 100, 52000);

test("Reaper's Toll: Reaper's Claim is a melee Strike with the scythe, its reach from the fallen creature's space, half its damage temporary Hit Points for 1 minute", () => {
    const claim = activation("Reaper's Toll", "Reaper's Claim");
    assert.equal(routeOf(claim), "strike");
    assert.deepEqual([claim.strike.range, claim.strike.own, claim.strike.drain, claim.strike.notes], ["melee", true, { fraction: 0.5, type: null, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }, []]);
    assert.ok(done(claim), "nothing left over");
    assert.equal(claim.item.levelTemp, undefined, "no typed amount: the hit's damage gives it");
    const lines = strikeLines(claim);
    assert.ok(lines.some((line) => /space of the creature that triggered it/.test(line)));
    assert.ok(lines.includes("On a hit: its user gains half the damage the Strike deals the creature hit (after its resistances) as temporary Hit Points, for 1 minute"));
});

test("Reaper's Toll live: the hit marks the creature struck; its damage then gives the reaper half of what it lost", async () => {
    const scythe = foundry.giveItem(reaper, source("Reaper's Toll"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: scythe.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "strike");
    assert.ok(card, "the Strike card");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const attack = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", options: ["item:melee", `item:id:${scythe.id}`], target: { actor: victim.uuid, token: victim.token.uuid } }, origin: { uuid: scythe.uuid, type: "weapon" } } }, speaker: { actor: reaper.id }, actor: reaper, token: reaper.token.document });
    await foundry.call("createChatMessage", attack);
    await settle();
    const mark = victim.itemTypes.effect.find((effect) => effect.flags?.[MODULE_ID]?.drain);
    assert.ok(mark, "the creature hit is marked");
    assert.deepEqual([mark.flags[MODULE_ID].drain.fraction, mark.flags[MODULE_ID].drain.userUuid, mark.system.duration.value, mark.system.duration.unit], [0.5, reaper.uuid, 1, "minutes"]);
    assert.match(foundry.messages.at(-1).content, /gives Reaper half of it as temporary Hit Points/);
});

test("a condition suppressed: Lost Ember's Off-Guard or Confused until the start of its next turn — the ways card, each a note Effect with PF2e's AdjustModifier", () => {
    const focus = activation("Lost Ember", "Fix Focus");
    assert.equal(routeOf(focus), "ways");
    assert.deepEqual(focus.ways.map((way) => way.name), ["Off-Guard", "Confused"]);
    const [offGuard, confused] = focus.ways.map((way) => way.plan);
    assert.equal(routeOf(offGuard), "item");
    const note = offGuard.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([note.label, note.duration, note.rules], ["Off-Guard suppressed", { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" }, [{ key: "AdjustModifier", selectors: ["ac"], slug: "off-guard", suppress: true }]]);
    assert.match(confused.resolution.outcomes.success.noteEffects[0].text, /^Confused is suppressed until the start of your next turn: you act normally/);
    // (Its use while confused, its user's own action: a line of the card.)
    assert.ok(confused.notes[0].startsWith("You can use this free action when you're confused"));
    assert.ok(done(offGuard) && done(confused));
    assert.deepEqual([focus.item.activation.frequency.per, focus.item.activation.time], ["day", "free"]);
});

test("the triggering effect suppressed: Aeon Stone (Olivine Pendeloque)'s Still Earth for 1 minute, one way for each condition its trigger names, its −1 to attack rolls on each", () => {
    const still = activation("Aeon Stone (Olivine Pendeloque)", "Still Earth");
    assert.deepEqual(still.ways.map((way) => way.name), ["Confused", "Frightened", "Stupefied"]);
    const frightened = still.ways[1].plan.resolution.outcomes.success;
    assert.deepEqual(frightened.noteEffects[0].rules, [{ key: "AdjustModifier", selectors: ["all"], slug: "frightened", suppress: true }]);
    assert.deepEqual([frightened.noteEffects[0].duration.value, frightened.noteEffects[0].duration.unit], [1, "minutes"]);
    assert.deepEqual(frightened.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["attack-roll", -1, "status"]]);
    assert.ok(still.ways.every((way) => done(way.plan)));
    // (And Moonlit Chain's Dazzled for 1 minute, the same words: a note Effect, PF2e having no rule for Dazzled's concealment.)
    const dim = activation("Moonlit Chain", "Dim Sight");
    assert.deepEqual([dim.noteOnly, dim.resolution.outcomes.success.noteEffects[0].label, dim.resolution.outcomes.success.noteEffects[0].rules], [undefined, "Dazzled suppressed", undefined]);
});

test("an item's Hit Points: Rustbringer's damage to the disarmed creature's weapon, its Hardness ignored; Mending Lattice's and Fortifying Pebble's affixed item mended", async () => {
    const { objectsText } = await import("../src/live/objects-card.js");
    const rust = activation("Rustbringer", "Rusting Disarm");
    assert.equal(routeOf(rust), "objects");
    assert.deepEqual(rust.objects, { op: "damage", of: "weapon", formula: "2d6", type: "untyped", whose: "target", ignoresHardness: true });
    assert.deepEqual(activation("Rustbringer (Greater)", "Rusting Disarm").objects.formula, "4d6");
    assert.equal(activation("Rustbringer (Greater)", "Rusting Disarm").objects.type, "acid");
    assert.ok(done(rust) && !rust.notes, "the rust's flakes its flavor, the weapon the targeted creature's");
    assert.match(objectsText(rust.objects), /^2d6 damage to the targeted creature's weapon, ignoring its Hardness/);
    const lattice = consumable("Mending Lattice");
    assert.deepEqual([routeOf(lattice), lattice.objects, done(lattice)], ["objects", { op: "repair", affixed: true, negates: true }, true]);
    const pebble = consumable("Fortifying Pebble");
    assert.deepEqual([pebble.objects, done(pebble)], [{ op: "repair", amount: "10", affixed: true, less: true }, true]);
    assert.match(objectsText(pebble.objects), /^10 of the damage the item it's affixed to just took taken back/);
});

test("an item's Hit Points after damage: its Hardness ignored or not, broken at its Broken Threshold, destroyed at 0", async () => {
    const { damagedItem } = await import("../scripts/objects.js");
    assert.deepEqual(damagedItem({ value: 20, max: 20, brokenThreshold: 10 }, 7, { hardness: 5 }), { before: 20, after: 13, taken: 7, state: null });
    assert.deepEqual(damagedItem({ value: 12, max: 20, brokenThreshold: 10 }, 7, { hardness: 5, ignoresHardness: false }), { before: 12, after: 10, taken: 2, state: "broken" });
    assert.deepEqual(damagedItem({ value: 5, max: 20, brokenThreshold: 10 }, 9), { before: 5, after: 0, taken: 9, state: "destroyed" });
});

test("Rustbringer live: the targeted creature's weapon takes the rolled damage, its Hit Points lowered", async () => {
    const flail = foundry.giveItem(reaper, source("Rustbringer"));
    const sword = foundry.giveItem(victim, source("Longsword"));
    await sword.update({ "system.hp": { value: 20, max: 20, brokenThreshold: 10 }, "system.equipped.carryType": "dropped" });
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: flail.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "objects");
    assert.ok(card, "the objects card");
    assert.match(card.content, /Target the creature whose weapon it is, then Apply/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [victim.token.uuid] });
    await settle();
    assert.equal(sword.system.hp.value, 13, "the fake roll's 7, its Hardness ignored");
    assert.match(card.flags[MODULE_ID].card.results[0], /^Victim's Longsword takes 7 damage \(rolled 2d6 = 7, its Hardness ignored\): 13\/20 Hit Points$/);
});

test("Sanguine Klar: the klar itself regains the bleed damage typed on its card, at most its Hardness", async () => {
    const klar = activation("Sanguine Klar");
    assert.deepEqual([routeOf(klar), klar.objects, done(klar)], ["objects", { op: "repair", self: true, typed: "the bleed damage", upTo: "hardness" }, true]);
    assert.deepEqual(activation("Sanguine Klar (Greater)").objects, klar.objects);
    const shield = foundry.giveItem(reaper, source("Sanguine Klar"));
    await shield.update({ "system.hp.value": 50 });
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: shield.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "objects");
    assert.match(card.content, /data-air-field="amount"/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", amount: "12" });
    await settle();
    assert.equal(shield.system.hp.value, 58, "12 typed, at most its Hardness 8");
});

test("Ancestral Geometry: its reaction is PF2e's own Effect's SubstituteRoll — no card, its use a line", () => {
    const geometry = activation("Ancestral Geometry");
    assert.deepEqual([geometry.builtin, geometry.rules, done(geometry), routeOf(geometry)], ["pf2e-rules", ["SubstituteRoll"], true, null]);
    assert.match(geometry.notes[0], /^PF2e's own Effect: Ancestral Geometry plays it/);
});

test("Turnabout Shield: the missed shot sent back at +19 against a creature within 60 feet, with the triggering Strike's own damage", async () => {
    const { formulaInstances, triggeringMiss, withStrikeFormula } = await import("../src/live/strike-as.js");
    const shield = activation("Turnabout Shield");
    assert.equal(routeOf(shield), "save");
    assert.deepEqual([shield.ownCheck, shield.targeting.range, shield.strikeDamage, done(shield)], [{ kind: "attack", modifier: 19 }, "60 feet", { as: null, from: "triggering-miss", rows: { success: 1, criticalSuccess: 2 } }, true]);
    assert.deepEqual(formulaInstances("{(1d8 + 4)[piercing],1d6[persistent,fire]}"), [{ formula: "1d8 + 4", type: "piercing", category: null }, { formula: "1d6", type: "fire", category: "persistent" }]);
    const filled = withStrikeFormula(shield, "{(1d8 + 4)[piercing]}");
    assert.deepEqual(filled.resolution.sharedDamage.components, [{ id: "strike0", formula: "1d8 + 4", type: "piercing", category: null }]);
    assert.deepEqual([filled.resolution.outcomes.success.damage.multiplier, filled.resolution.outcomes.criticalSuccess.damage.multiplier, filled.resolution.outcomes.failure.damage.mode], [1, 2, "none"]);
    // (The latest ranged miss at its user, by another creature.)
    const rolls = [{ type: "attack-roll", outcome: "failure", ranged: true, targetActorUuid: "Actor.me", actorUuid: "Actor.old" }, { type: "attack-roll", outcome: "success", ranged: true, targetActorUuid: "Actor.me", actorUuid: "Actor.hit" }, { type: "attack-roll", outcome: "criticalFailure", ranged: true, targetActorUuid: "Actor.me", actorUuid: "Actor.archer" }, { type: "attack-roll", outcome: "failure", ranged: false, targetActorUuid: "Actor.me", actorUuid: "Actor.melee" }];
    assert.equal(triggeringMiss(rolls, "Actor.me").actorUuid, "Actor.archer");
    assert.equal(triggeringMiss(rolls, "Actor.other"), null);
});

test("Turnabout Shield live: its card's damage is the archer's own Strike's formula", async () => {
    const archer = foundry.makeActor({ id: "trigger-archer", name: "Archer" });
    foundry.place(archer, 200, 52000);
    archer.system.actions = [{ type: "strike", item: { id: "bow" }, damage: async ({ getFormula } = {}) => (getFormula ? "{(1d8 + 4)[piercing]}" : null) }];
    foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "failure", options: ["item:ranged"], target: { actor: reaper.uuid, token: reaper.token.uuid } }, origin: { uuid: `${archer.uuid}.Item.bow`, type: "weapon" } } }, speaker: { actor: archer.id }, actor: archer, token: archer.token.document });
    const turnabout = foundry.giveItem(reaper, source("Turnabout Shield"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: turnabout.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.plan?.strikeDamage);
    assert.ok(card, "its card");
    assert.deepEqual(card.flags[MODULE_ID].card.plan.resolution.sharedDamage.components, [{ id: "strike0", formula: "1d8 + 4", type: "piercing", category: null }]);
});

test("Secret-Keeper's Mask (Father Skinsaw): a note Effect on the creature bled while it bleeds — its recovery DC 2 higher, −2 status to three skills — and the penalties for the minute after", async () => {
    const mask = activation("Secret-Keeper's Mask (Father Skinsaw)");
    assert.deepEqual([routeOf(mask), mask.item.recipient, mask.noteOnly, done(mask)], ["item", "targets", undefined, true]);
    const note = mask.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([note.whilePersistent, note.duration], ["bleed", null]);
    assert.deepEqual(note.rules.map((rule) => [rule.key, rule.selector ?? rule.property ?? rule.option, rule.value ?? null]), [["ItemAlteration", "pd-recovery-dc", 2], ["FlatModifier", "deception", -2], ["FlatModifier", "diplomacy", -2], ["FlatModifier", "performance", -2], ["RollOption", "air-then-for:1:minutes:bleed", null]]);
    const { followThenFor, thenForOf, thenForSource } = await import("../scripts/then-for.js");
    const effect = { name: "Secret-Keeper's Mask (Father Skinsaw): Mutilating wound", system: { rules: note.rules, description: { value: "<p>…</p>" } } };
    assert.deepEqual(thenForOf(effect), { value: 1, unit: "minutes", type: "bleed" });
    const after = thenForSource(effect, thenForOf(effect), { worldTime: 3 });
    assert.deepEqual([after.system.duration.value, after.system.duration.unit, after.system.rules.map((rule) => rule.selector)], [1, "minutes", ["deception", "diplomacy", "performance"]]);
    // (Still bleeding — deleted by hand —: nothing after; the bleeding over: the minute's Effect.)
    const made = [];
    const saved = globalThis.game;
    globalThis.game = { ...(saved ?? {}), time: { worldTime: 3 }, combat: null };
    try {
        const bleeding = { itemTypes: { condition: [{ slug: "persistent-damage", system: { persistent: { damageType: "bleed" } } }] }, createEmbeddedDocuments: async (type, data) => made.push(...data) };
        assert.equal(await followThenFor({ ...effect, parent: bleeding }), null);
        const healed = { itemTypes: { condition: [] }, createEmbeddedDocuments: async (type, data) => { made.push(...data); return data; } };
        await followThenFor({ ...effect, parent: healed });
        assert.deepEqual(made.map((entry) => entry.name), ["Secret-Keeper's Mask (Father Skinsaw): Mutilating wound (after)"]);
    } finally {
        globalThis.game = saved;
    }
});

test("Beguiling Crown's reaction: the attacker's DC 41 Will save — its attack a failure and friendly until the end of its turn, or begging for 1 minute", () => {
    const crown = activation("Beguiling Crown", 1);
    assert.equal(routeOf(crown, "Trigger A creature succeeds at an attack roll against you"), "save");
    assert.deepEqual([crown.resolution.check.statistic, crown.resolution.check.against.value, done(crown), crown.noteOnly], ["will", 41, true, undefined]);
    const [failure] = crown.resolution.outcomes.failure.noteEffects;
    assert.deepEqual([failure.label, failure.duration], ["Beguiled", { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" }]);
    assert.match(failure.text, /^Its attack roll against the crown's wearer is a failure instead: no damage from it/);
    const [begs] = crown.resolution.outcomes.criticalFailure.noteEffects;
    assert.deepEqual([begs.duration.value, begs.duration.unit], [1, "minutes"]);
    assert.deepEqual(crown.resolution.outcomes.success.noteEffects, []);
});

test("a spell at its user counteracted: Reflecting Shard's Spell Riposte at its user's Athletics (rank 7, 9), Spellslasher's at half its level and its best Strike, Spell Duelist's Siphon's absorbed", () => {
    const shard = consumable("Reflecting Shard");
    assert.equal(routeOf(shard), "counteract");
    const counter = shard.item.counteract;
    assert.deepEqual([counter.free.name, counter.fromUser, counter.rank, counter.modifier, done(shard)], ["the triggering spell", { modifier: "athletics" }, 7, null, true]);
    assert.match(counter.free.counteredWords, /^Spell Riposte turns it back/);
    assert.equal(consumable("Reflecting Shard (Greater)").item.counteract.rank, 9);
    const slasher = consumable("Spellslasher").item.counteract;
    assert.deepEqual([slasher.fromUser, slasher.rank], [{ rank: "half-level", modifier: "weapon-attack" }, null]);
    const siphon = activation("Spell Duelist's Siphon");
    assert.deepEqual([routeOf(siphon), siphon.item.counteract.modifier, siphon.item.counteract.rank, siphon.item.counteract.onCounter.label, siphon.trigger.frequency.per], ["counteract", 20, 6, "Absorbed spell", "day"]);
});

test("Reflecting Shard live: its modifier is its user's Athletics; counteracted, the spell is turned back on its caster", async () => {
    reaper.skills = { athletics: { mod: 21 } };
    const shard = foundry.giveItem(reaper, source("Reflecting Shard"));
    const data = shard.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: shard.uuid, sourceId: data._stats.compendiumSource, type: shard.type } } }, speaker: { actor: reaper.id }, actor: reaper, token: reaper.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.counteract.modifier, 21);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, rows: [{ ticked: true, dc: 25, rank: 5 }], userId: "player" });
    await settle();
    // (The fake d20's 10 + 21 = 31 against DC 25: a success, rank 5 ≤ 7 + 1.)
    assert.match(card.content, /the triggering spell: 31 against DC 25: a success, counteracted \(Spell Riposte turns it back/);
});

test("Uzunjati Storytelling Amulet: Make an Impression or Request with Performance, PF2e's own action; Name Pendant's alert whispered to the wearers near", () => {
    const amulet = activation("Uzunjati Storytelling Amulet", "Enamoring Story");
    assert.deepEqual([routeOf(amulet), amulet.action.slugs, amulet.action.statistic, done(amulet)], ["action", ["make-an-impression", "request"], "performance", true]);
    const pendant = activation("Name Pendant", "Alert Superior Officer");
    assert.deepEqual([routeOf(pendant), pendant.whisper.alsoTo, pendant.trigger.frequency.per], ["whisper", { slug: "name-pendant", within: 500 }, "day"]);
    assert.equal(pendant.whisper.text, "Name Pendant alerts the allies within 500 feet who also wear a name pendant (its trigger: you gain the Dying condition).");
});

test("a Strike drawn to its user: Black Hole Armor's a line of the card; Arrow-Catching and Lodestone Shields' also PF2e's Shield Block on its damage", async () => {
    const { fortuneEffectSource, readiedWords } = await import("../src/live/fortune-card.js");
    const { beforeShieldBlock } = await import("../scripts/half-damage.js");
    const hole = activation("Black Hole Armor", 0);
    assert.deepEqual([routeOf(hole), hole.notes, done(hole)], ["item", ["The triggering Strike targets its user instead: the GM aims it at its user before rolling it."], true]);
    const arrows = activation("Arrow-Catching Shield");
    assert.equal(routeOf(arrows), "fortune");
    assert.deepEqual([arrows.bonus.shieldBlock, arrows.bonus.against, done(arrows)], [true, true, true]);
    assert.deepEqual(activation("Lodestone Shield", "Attract Projectile").bonus, arrows.bonus);
    assert.match(readiedWords(arrows), /the Shield Block reaction's effects on its damage if it hits/);
    const effect = fortuneEffectSource({ state: { plan: arrows, item: { name: "Arrow-Catching Shield" }, user: { actorUuid: "Actor.me" } }, moduleId: MODULE_ID });
    const flag = effect.flags[MODULE_ID][Object.keys(effect.flags[MODULE_ID])[0]];
    assert.deepEqual([flag.shieldBlock, flag.against.damage], [true, true]);
    // (The damage it takes: PF2e's Shield Block asked for.)
    const actor = { itemTypes: { effect: [effect] } };
    assert.deepEqual(beforeShieldBlock(actor, { damage: { total: 9 } }).params.shieldBlockRequest, true);
    assert.equal(beforeShieldBlock({ itemTypes: { effect: [] } }, { damage: { total: 9 } }), null);
});

test("rules PF2e can't play on note Effects for their time: Helm of Zeal's extra reaction, Whispering Veil's warning, Undead Scourge's severed undead, Victory Plate's record", () => {
    const fervor = activation("Helm Of Zeal", "Divine Fervor");
    assert.deepEqual([fervor.resolution.outcomes.success.noteEffects[0].label, fervor.resolution.outcomes.success.noteEffects[0].duration.expiry, done(fervor)], ["Extra reaction", "turn-start", true]);
    assert.equal(activation("Helm Of Zeal (Greater)", "Divine Fervor").trigger.frequency.per, "hour");
    const alert = activation("Whispering Veil", "Unforeseen Alert");
    assert.deepEqual([alert.resolution.outcomes.success.noteEffects[0].label, alert.resolution.outcomes.success.noteEffects[0].duration.expiry], ["Warned", "turn-end"]);
    const sever = activation("Undead Scourge", "Sever from the Void");
    assert.deepEqual([routeOf(sever), sever.item.recipient, sever.noteOnly, done(sever)], ["item", "targets", undefined, true]);
    assert.match(sever.resolution.outcomes.success.noteEffects[0].text, /counteract rank 4, DC 25/);
    const record = activation("Victory Plate", 0);
    assert.deepEqual([record.resolution.outcomes.success.noteEffects[0].label, record.resolution.outcomes.success.noteEffects[0].duration], ["Victory recorded", null]);
    assert.equal(routeOf(activation("Victory Plate", 1)), "ways", "its Recall as it was");
});

test("death avoided, information whispered: Locket of Love Left Behind at 1 Hit Point (its casing a line), Lion's Call's Echo the Call", () => {
    const locket = activation("Locket of Love Left Behind", "True Love's Power");
    assert.deepEqual([routeOf(locket), locket.item.dropToOne, done(locket)], ["item", true, true]);
    assert.match(locket.notes[0], /about 1 month and 600 gp/);
    const echo = activation("Lion's Call", "Echo the Call");
    assert.deepEqual([routeOf(echo), echo.decided], ["whisper", "information"]);
    assert.match(echo.whisper.text, /within 1 mile of each other, they can communicate telepathically/);
});

test("consumables: Fulu of the Drunken Monkey's two ways, Emergency Eye's sight, Inventor's Fulu's lines, Murderer's Knot's Off-Guard while it bleeds, Exuviae Powder's shell, Persistent Lodestone's recalled round", () => {
    const fulu = consumable("Fulu of the Drunken Monkey");
    assert.deepEqual([routeOf(fulu), fulu.ways.map((way) => way.name), fulu.ways.every((way) => done(way.plan))], ["ways", ["Against an ingested poison", "Against normal alcohol"], true]);
    const alcohol = fulu.ways[1].plan.resolution.outcomes.success;
    assert.deepEqual([alcohol.modifiers[0].value, alcohol.noteEffects[0].rules[0].key, alcohol.noteEffects[0].rules[0].adjustment], [4, "AdjustDegreeOfSuccess", { failure: "to-success", criticalFailure: "to-success" }]);
    const eye = consumable("Emergency Eye");
    assert.deepEqual([routeOf(eye), eye.resolution.outcomes.success.noteEffects[0].rules[0].slug, done(eye)], ["item", "blinded", true]);
    const inventor = consumable("Inventor's Fulu");
    assert.deepEqual([routeOf(inventor), inventor.notes.length, done(inventor)], ["item", 2, true]);
    const knot = consumable("Murderer's Knot");
    assert.equal(routeOf(knot), "save");
    const row = knot.resolution.outcomes.success;
    assert.deepEqual([row.effects, row.noteEffects[0].whilePersistent, row.noteEffects[0].rules[0].key, row.manualInstructions, done(knot)], [[], "bleed", "GrantItem", undefined, true]);
    // (Its owner with Twist the Knife, as live play gives its feats: a rogue's sneak attack at its level.)
    const twisted = compileItem({ ...item("Murderer's Knot"), ownerLevel: 11, ownerFeats: ["twist-the-knife"] }, options);
    assert.equal(twisted.resolution.sharedDamage.components[0].formula, "3d6");
    const powder = consumable("Exuviae Powder");
    assert.deepEqual([routeOf(powder), powder.noteOnly, powder.ways.length], ["ways", undefined, 2]);
    const shed = powder.ways[1].plan.resolution.outcomes.success;
    assert.deepEqual(shed.effects.map((effect) => [effect.slug, effect.value, effect.duration?.mode ?? null]), [["quickened", null, "fixed"], ["doomed", 1, null], ["restrained", null, "until-escape"]]);
    assert.equal(shed.effects[2].duration.escape.dc, 25);
    const lodestone = consumable("Persistent Lodestone");
    assert.deepEqual([routeOf(lodestone), lodestone.objects, done(lodestone)], ["objects", { op: "reload", reload: "1", recalled: true }, true]);
});

test("a Strike of its own after the trigger: Bloodstride Blade's teleport beside the bleeding creature, then its Strike with it Off-Guard; Vine of Roses' Holy Light on its weapon attack roll", () => {
    const blood = activation("Bloodstride Blade", "Call of the Bloodthirst");
    assert.equal(routeOf(blood), "strike");
    assert.deepEqual([blood.strike.offGuard, blood.strike.own, blood.item.move, blood.trigger.frequency.per, done(blood)], [true, true, { within: 5, speedTimes: null, from: "target" }, "hour", true]);
    const vine = activation("Vine of Roses", 1);
    assert.equal(routeOf(vine), "strike");
    assert.deepEqual([vine.strike.cast.name, vine.strike.cast.rank, vine.strike.cast.attackFromHit, vine.strike.noDamage, vine.builtin, done(vine)], ["Holy Light", 3, true, true, undefined, true]);
    assert.ok(strikeLines(vine).some((line) => /Holy Light \(rank 3\) cast at the target, the hit for its attack roll/.test(line)));
});

test("Storm Flash's Divert Lightning: immunity to the triggering electricity for the creature targeted, after its user's own attack roll; Suit of Armoire's two ways; Spellbook of Redundant Enchantment a one-off", () => {
    const divert = activation("Storm Flash", "Divert Lightning");
    assert.equal(routeOf(divert), "fortune");
    assert.deepEqual([divert.bonus.immunity, divert.bonus.recipient, divert.bonus.against, divert.targeting.range, done(divert)], [{ type: "electricity" }, "target", true, "10 feet", true]);
    assert.match(divert.bonus.limits[0], /^Roll first: its user's melee attack roll with Storm Flash against the electricity effect's DC/);
    assert.deepEqual(activation("Storm Flash (Greater)", "Divert Lightning").bonus.immunity, { type: "electricity" });
    const armoire = activation("Suit of Armoire", 1);
    assert.deepEqual([routeOf(armoire), armoire.ways.map((way) => way.name), armoire.ways.every((way) => done(way.plan))], ["ways", ["An enemy's Strike hit it", "It failed a Reflex save"], true]);
    const spellbook = activation("Spellbook of Redundant Enchantment", "Retain Incantation");
    assert.deepEqual([spellbook.decided, done(spellbook)], ["one-off", true]);
});

test("Conflagration Club: Absorb Arcana stores the slot's rank as charges of the type picked; Explosive Cone's card takes them as its dice, the charges gone", async () => {
    const { chargesOf, spendsCharges, withCharges } = await import("../src/live/charges.js");
    const absorb = activation("Conflagration Club", "Absorb Arcana");
    assert.deepEqual([routeOf(absorb), absorb.ways.map((way) => way.name)], ["ways", ["Acid spell", "Cold spell", "Electricity spell", "Fire spell", "Sonic spell"]]);
    assert.deepEqual(absorb.ways[3].plan.objects, { op: "charge", self: true, typed: "the spell slot's rank", attune: "fire", onlyWhenEmpty: true });
    const cone = activation("Conflagration Club", "Explosive Cone");
    assert.ok(spendsCharges(cone));
    const charged = withCharges(cone, { count: 3, type: "fire" });
    assert.deepEqual([charged.resolution.sharedDamage.components[0].formula, charged.scaled, charged.damageChoices], ["3d6[fire]", undefined, undefined]);
    assert.deepEqual([withCharges(cone, { count: 0 }), chargesOf({ count: 2, type: "cold" })], [null, { count: 2, type: "cold" }]);
    // (Live: stored on the club, then its cone's card takes them.)
    const club = foundry.giveItem(reaper, source("Conflagration Club"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: club.uuid, activation: 0, userId: "player" });
    await settle();
    const ways = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "ways");
    await foundry.socket(SOCKET)({ action: "apply", messageId: ways.id, choice: 3, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "objects");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, amount: "3", userId: "player" });
    await settle();
    assert.deepEqual(club.getFlag(MODULE_ID, "charges"), { count: 3, type: "fire" });
    const before = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: club.uuid, activation: 1, userId: "player" });
    await settle();
    const blast = foundry.messages.slice(before).find((message) => message.flags?.[MODULE_ID]?.card?.plan?.chargesUsed);
    assert.ok(blast, "its cone's card");
    assert.equal(blast.flags[MODULE_ID].card.plan.resolution.sharedDamage.components[0].formula, "3d6[fire]");
    assert.equal(chargesOf(club.getFlag(MODULE_ID, "charges")), null, "spent");
});

test("note Effects for their time: Auspicious Scepter's weak spot on the ally targeted until the end of its wielder's next turn; Key of Unwinding's Rewrite Time for its minute", () => {
    const scepter = activation("Auspicious Scepter", "Fortunate Strike");
    const note = scepter.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([routeOf(scepter), scepter.item.recipient, note.label, note.duration, done(scepter)], ["item", "targets", "A weak spot found", { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, true]);
    const key = consumable("Key of Unwinding");
    const rewrite = key.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([routeOf(key), key.noteOnly, rewrite.label, rewrite.duration.value, rewrite.duration.unit, done(key)], ["item", undefined, "Rewrite Time", 1, "minutes", true]);
    assert.match(rewrite.text, /Slowed 1 for 1 round/);
});

test("Chain of Stars: three +1 striking force shuriken for its user's Strikes from the creature hit, each gone after its attack roll", async () => {
    const { objectsText } = await import("../src/live/objects-card.js");
    const { spendMadeAfterAttack } = await import("../scripts/objects.js");
    const chain = consumable("Chain of Stars");
    assert.equal(routeOf(chain), "objects");
    assert.deepEqual([chain.objects.weapon, chain.objects.potency, chain.objects.striking, chain.objects.quantity, chain.objects.damageType, chain.objects.vanishAfterAttack, done(chain), chain.notes], ["shuriken", 1, 1, 3, "force", true, true, undefined]);
    assert.match(objectsText(chain.objects), /^3 \+1 striking shurikens of force for its user, each gone after its attack roll: Strike with them — up to 3 Strikes, each at a different creature and not the one it hit, as though from that creature's space/);
    // (A miss's attack roll or a hit's damage roll with one: one fewer; with the last, gone — a hit's attack roll leaves it for its damage.)
    let quantity = 2;
    let deleted = false;
    const weapon = { flags: { [MODULE_ID]: { made: { vanishAfterAttack: true } } }, get system() { return { quantity }; }, update: async (changes) => { quantity = changes["system.quantity"]; }, delete: async () => { deleted = true; } };
    const saved = globalThis.fromUuid;
    globalThis.fromUuid = async () => weapon;
    try {
        assert.equal(await spendMadeAfterAttack({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success" }, origin: { uuid: "Actor.a.Item.s" } } } }), null);
        assert.equal(quantity, 2);
        await spendMadeAfterAttack({ flags: { pf2e: { context: { type: "attack-roll", outcome: "failure" }, origin: { uuid: "Actor.a.Item.s" } } } });
        assert.equal(quantity, 1);
        await spendMadeAfterAttack({ flags: { pf2e: { context: { type: "damage-roll", sourceType: "attack" }, origin: { uuid: "Actor.a.Item.s" } } } });
        assert.equal(deleted, true);
    } finally {
        globalThis.fromUuid = saved;
    }
});
