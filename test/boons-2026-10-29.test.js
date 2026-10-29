// PF2e's boons (2026-10-29, the user's answer A to question 7): Elder Seed, Heartblood Ring, Phoenix Cinder and Void Fragment — their stages
// read into one stage Effect's PF2e rules (src/compiler/boons.js), the Effect, its next stages in world time, the GM's hold, badge and end,
// and what it gets at initiative (src/live/boons.js, scripts/boons.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem, spellIndex } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { HELD_OPTION } from "../src/compiler/boons.js";
import { routeOf } from "../src/live/route.js";
import { BOON_SECONDS, boonActivationSource, boonAt, boonCounteract, boonDescription, boonEffectSource, boonFlag, boonStep, heldOf, hpLossOf, initiativeCondition, initiativeEffectSource, innateLocation, riderEffectSource, stageCardHTML, stageLines } from "../src/live/boons.js";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const documents = (pack) => readDocuments(path.join(PACKS, pack)).filter((doc) => doc.collection === "items");
const equipment = documents("equipment");
const spellDocs = documents("spells");
const options = { spells: spellIndex(spellDocs) };
const source = (name) => equipment.find((doc) => doc.name === name);
const item = (name) => ({ ...source(name), ownerLevel: Number(source(name).system.level?.value) || 1 });
const plan = (name) => compileItem(item(name), options);
const done = (given) => !given.partial && !given.noteOnly && !given.unread?.length && given.builtin !== "no-effect";
const DAY = 86_400;
const rulesOf = (stage) => stage.rules.map((rule) => [rule.key, rule.selector ?? rule.type ?? rule.uuid?.split(".").at(-1) ?? null, rule.value ?? rule.alterations?.[0]?.value ?? rule.range ?? null]);

// --- The readings (src/compiler/boons.js) ---

test("Elder Seed: its own save card first (Fortitude, DC 28 for its level), then four stages — resistances and tremorsense, four primal innate spells once a day, Clumsy and fire and axe weaknesses that grow, Slowed at initiative, death", () => {
    const seed = plan("Elder Seed");
    assert.ok(done(seed));
    assert.equal(routeOf(seed), "save");
    assert.equal(seed.ownSave, true);
    assert.deepEqual(seed.resolution.check, { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: 28 } });
    const { boon } = seed;
    assert.deepEqual(boon.save, { statistic: "fortitude", dc: 28, back: true });
    assert.equal(boon.source, "Compendium.pf2e.equipment-srd.Item.uf05VGoYSaeKtUG1");
    assert.deepEqual(boon.stages.map((stage) => [stage.stage, stage.lasts, Boolean(stage.dies)]), [[1, { value: 9, unit: "days" }, false], [2, { value: 1, unit: "months" }, false], [3, { value: 1, unit: "months" }, false], [4, null, true]]);
    const [one, two, three] = boon.stages;
    assert.deepEqual(rulesOf(one), [["Resistance", "bludgeoning", "@actor.level"], ["Resistance", "piercing", "@actor.level"], ["Sense", "tremorsense", 30]]);
    assert.deepEqual(one.spells.map((spell) => [spell.name, spell.tradition, spell.perDay, spell.rank]), [["Enlarge", "primal", 1, null], ["Speak with Animals", "primal", 1, null], ["Speak with Plants", "primal", 1, null], ["Web", "primal", 1, null]]);
    // (Stage 2 keeps stage 1's and adds its own; stage 3's clumsy, penalty and weaknesses replace stage 2's.)
    assert.deepEqual(rulesOf(two).slice(3), [["Sense", "low-light-vision", null], ["ActiveEffectLike", null, { slug: "arboreal", source: "{item|name}" }], ["GrantItem", "i3OJZU2nk64Df3xm", 1], ["FlatModifier", "initiative", -1], ["Weakness", "fire", "floor(@actor.level/2)"], ["Weakness", "axe-vulnerability", "floor(@actor.level/2)"]]);
    assert.deepEqual(rulesOf(three).slice(5), [["GrantItem", "i3OJZU2nk64Df3xm", 2], ["FlatModifier", "initiative", -2], ["Weakness", "fire", "@actor.level"], ["Weakness", "axe-vulnerability", "@actor.level"]]);
    assert.deepEqual(three.spells.find((spell) => spell.name === "Enlarge").rank, 4);
    assert.deepEqual(three.initiative.byDie, [{ atMost: 1, value: 3 }, { atMost: 10, value: 2 }, { atMost: 20, value: 1 }]);
    // (What its death becomes from stage 2 on, the Effect's words; the geas holding it before stage 4, the GM's.)
    assert.match(two.death, /^If you die at this stage or higher, your body sinks into the earth/);
    assert.ok(three.death && boon.stages[3].death);
    assert.deepEqual(boon.hold, { before: 4 });
    assert.match(seed.notes.join(" "), /DC 28/);
    assert.match(seed.notes.join(" "), /back up whole/);
});

test("Heartblood Ring: begun as it's used — Regenerate and a counteract each round at first, fast healing and resistances by half its level, bonuses and better saves against death, disease, paralysis, poison and sleep; then lower Hit Points with Doomed, darkvision", () => {
    const ring = plan("Heartblood Ring");
    assert.ok(done(ring));
    assert.deepEqual([ring.builtin, routeOf(ring), ring.ownSave, ring.resolution], ["boon", "boon", undefined, undefined]);
    const [one, two, three, four] = ring.boon.stages;
    assert.deepEqual(one.first, [{ kind: "effect", uuid: "Compendium.pf2e.spell-effects.Item.dXq7z633ve4E0nlX", name: "Regenerate" }, { kind: "counteract", afflictions: ["disease", "poison"], whileEffect: "Regenerate" }]);
    assert.deepEqual(rulesOf(one).slice(0, 3), [["FastHealing", null, "floor(@actor.level/2)"], ["Resistance", "void", "floor(@actor.level/2)"], ["Resistance", "poison", "floor(@actor.level/2)"]]);
    assert.deepEqual(one.rules[3].predicate, [{ or: ["item:trait:death", "item:trait:disease", "inflicts:paralyzed", "item:trait:poison", "item:trait:sleep"] }]);
    assert.deepEqual([one.rules[4].key, one.rules[4].adjustment, one.rules[4].predicate], ["AdjustDegreeOfSuccess", { all: "one-degree-better" }, [{ or: ["item:trait:death", "inflicts:paralyzed", "item:trait:sleep"] }]]);
    // (Low-light vision, darkvision when the ancestry has it — PF2e's own nephilim rule; then darkvision.)
    assert.deepEqual(two.rules.filter((rule) => rule.key === "Sense"), [{ key: "Sense", selector: "low-light-vision" }, { key: "Sense", selector: "darkvision", predicate: ["self:low-light-vision:from-ancestry"] }]);
    assert.deepEqual(three.rules.filter((rule) => rule.key === "Sense"), [{ key: "Sense", selector: "darkvision" }]);
    assert.deepEqual([two.hpLoss, three.hpLoss], [2, 4]);
    assert.deepEqual(three.rules.filter((rule) => rule.selector === "hp").map((rule) => rule.value), ["-4*@actor.level"]);
    assert.deepEqual(three.rules.filter((rule) => rule.key === "GrantItem").map((rule) => rule.alterations[0].value), [2]);
    assert.equal(three.rules.find((rule) => rule.key === "FastHealing").value, "@actor.level");
    // (Sunlight, blood and death effects: the GM's lines on the Effect.)
    assert.equal(two.notes.length, 4);
    assert.ok(three.notes.some((note) => /death effect/.test(note)));
    assert.match(two.death, /vampire/);
    assert.equal(four.dies, true);
});

test("Phoenix Cinder: a willing partaker; Regenerate and fire immunity for 3 days at first, Ignition at will, its flames once a day, then an hour, then a minute; cold and holy weaknesses and lower Hit Points later", () => {
    const cinder = plan("Phoenix Cinder");
    assert.ok(done(cinder));
    assert.equal(routeOf(cinder), "boon");
    assert.equal(cinder.boon.willing, true);
    assert.match(cinder.notes.join(" "), /willing partaker/);
    const [one, two, three] = cinder.boon.stages;
    assert.deepEqual(one.first.map((rider) => [rider.kind, rider.name ?? rider.type, rider.days ?? null]), [["effect", "Regenerate", null], ["immunity", "fire", 3]]);
    assert.deepEqual(one.spells.map((spell) => [spell.name, spell.perDay, spell.tradition]), [["Ignition", null, "primal"]]);
    assert.deepEqual(one.rules.find((rule) => rule.key === "FlatModifier").predicate, ["item:trait:fire"]);
    assert.deepEqual([one.activation.kind, one.activation.per, one.activation.formula, one.activation.type, one.activation.dismiss], ["flames", "day", "2d6", "fire", true]);
    assert.deepEqual([two.activation.per, two.activation.dismiss, three.activation.per, three.activation.dismiss], ["hour", true, "minute", false]);
    assert.deepEqual(rulesOf(three).filter(([key]) => key === "Weakness"), [["Weakness", "cold", "@actor.level"], ["Weakness", "holy", "floor(@actor.level/2)"]]);
    assert.deepEqual([two.hpLoss, three.hpLoss], [2, 4]);
    assert.ok(three.notes.some((note) => /Divine Immolation/.test(note)));
});

test("Void Fragment: its own save (DC 31), then truespeech for 3 days, Hidden Mind's +1, mental resistance, its teleport; thoughtsense and the mental noise's Perception penalty (a toggle), Strange Geometry where it arrives, Confused at initiative", () => {
    const fragment = plan("Void Fragment");
    assert.ok(done(fragment));
    assert.equal(routeOf(fragment), "save");
    assert.deepEqual(fragment.boon.save, { statistic: "fortitude", dc: 31, back: false });
    const [one, two, three] = fragment.boon.stages;
    assert.deepEqual(one.first, [{ kind: "note", label: "truespeech", words: "It speaks and understands all languages, as a potion of truespeech gives, though it can't read them", days: 3 }]);
    assert.deepEqual(rulesOf(one), [["FlatModifier", "saving-throw", 1], ["Resistance", "mental", "floor(@actor.level/2)"]]);
    assert.deepEqual([one.activation.kind, one.activation.within, one.activation.farther, one.activation.per], ["teleport", 30, 60, "hour"]);
    assert.deepEqual(two.rules.find((rule) => rule.key === "Sense"), { key: "Sense", selector: "thoughtsense", acuity: "imprecise", range: 30 });
    assert.deepEqual(two.rules.filter((rule) => rule.selector === "perception").map((rule) => [rule.value, rule.predicate]), [[-1, ["air-boon-mental-noise"]]]);
    assert.deepEqual(three.rules.filter((rule) => rule.selector === "perception").map((rule) => rule.value), [-2]);
    assert.match(two.activation.arrive, /Strange Geometry/);
    assert.deepEqual(three.initiative, { slug: "confused", uuid: "Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ", value: null, rounds: "1d4" });
    assert.ok(one.notes.some((note) => /Telepathy 30 feet/.test(note)) && three.notes.some((note) => /Telepathy 100 feet/.test(note)));
});

test("the activation a stage gives, on the item made for it: Phoenix Cinder's flames the later card's retaliation for a minute at the stage's frequency, Void Fragment's teleport the ways card (1 action 30 feet, 2 actions 60)", () => {
    const compiled = (name, stage) => {
        const flag = boonAt(boonFlag(plan(name).boon, { worldTime: 0 }), stage, 0);
        const holder = boonActivationSource(flag, { effectId: "e1" });
        return { holder, entries: compileActivations({ ...holder, _id: "h1", uuid: "Actor.a.Item.h1", ownerLevel: 16 }, options) };
    };
    const flames = compiled("Phoenix Cinder", 1);
    assert.equal(flames.entries.length, 1);
    const [{ plan: wreath }] = flames.entries;
    assert.equal(routeOf(wreath, ""), "later");
    assert.deepEqual([wreath.retaliation, wreath.trigger.frequency.per, wreath.resolution.sharedDamage.components[0].formula], [{ adjacentMelee: true, rounds: 10 }, "day", "2d6[fire]"]);
    // (Stage 3: once a minute, and no Dismiss — its words gone from the item too.)
    const late = compiled("Phoenix Cinder", 3);
    assert.equal(late.entries[0].plan.trigger.frequency.per, "minute");
    assert.doesNotMatch(late.holder.system.description.value, /Dismiss/);
    assert.match(late.holder.system.description.value, /<strong>Frequency<\/strong> once per minute/);
    assert.ok(late.entries[0].plan.notes.some((note) => /can't be Dismissed/.test(note)));
    const teleport = compiled("Void Fragment", 2);
    const [{ plan: ways }] = teleport.entries;
    assert.equal(routeOf(ways, ""), "ways");
    assert.deepEqual(ways.ways.map((way) => [way.name, way.plan.builtin, way.plan.teleport.within]), [["1 action: up to 30 feet", "teleport", 30], ["2 actions: up to 60 feet", "teleport", 60]]);
    assert.ok(ways.ways.every((way) => /Strange Geometry/.test(way.plan.notes[0])));
    // (No activation at a stage: no item.)
    assert.equal(boonActivationSource(boonFlag(plan("Elder Seed").boon, { worldTime: 0 })), null);
});

// --- The pure live parts (src/live/boons.js) ---

test("a boon's stages in world time: each begins when the one before ends, a long jump goes through several, held puts its end off, the badge's stage begins now", () => {
    const { boon } = plan("Elder Seed");
    const flag = boonFlag(boon, { worldTime: 1000, item: { name: "Elder Seed", uuid: "Item.s" }, user: { actorUuid: "Actor.a" } });
    assert.deepEqual([flag.stage, flag.startedAt, flag.endsAt], [1, 1000, 1000 + 9 * DAY]);
    assert.deepEqual(boonStep(flag, 1000 + 9 * DAY - 1), { flag, entered: [] });
    const two = boonStep(flag, 1000 + 9 * DAY);
    assert.deepEqual([two.flag.stage, two.flag.startedAt, two.flag.endsAt, two.entered], [2, 1000 + 9 * DAY, 1000 + 9 * DAY + BOON_SECONDS.months, [2]]);
    // (Two months on: stages 2, 3 and 4 in turn — the last is death, with no end.)
    const far = boonStep(flag, 1000 + 9 * DAY + 2 * BOON_SECONDS.months);
    assert.deepEqual([far.flag.stage, far.flag.endsAt, far.entered], [4, null, [2, 3, 4]]);
    assert.deepEqual(boonStep(far.flag, 1e12), { flag: far.flag, entered: [] });
    // (Held: nothing begins, its end a day later for a day passed.)
    const held = boonStep(flag, 1000 + 30 * DAY, { held: true, delta: DAY });
    assert.deepEqual([held.flag.stage, held.flag.endsAt, held.entered], [1, 1000 + 10 * DAY, []]);
    const moved = boonAt(flag, 3, 5000);
    assert.deepEqual([moved.stage, moved.startedAt, moved.endsAt], [3, 5000, 5000 + BOON_SECONDS.months]);
});

test("the stage Effect: the GM's Held toggle first, then the stage's PF2e rules, its badge the stage (1 to 4), its words with the GM's lines of every stage so far, its death and purging", () => {
    const { boon } = plan("Heartblood Ring");
    const flag = boonAt(boonFlag(boon, { worldTime: 0, user: { actorUuid: "Actor.a" } }), 3, 0);
    const effect = boonEffectSource(flag, { held: true, worldTime: 0 });
    assert.equal(effect.name, "Heartblood Ring: stage 3");
    assert.deepEqual(effect.system.rules[0], { key: "RollOption", domain: "all", option: HELD_OPTION, toggleable: true, value: true, label: "Held at this stage (the GM's)" });
    assert.equal(effect.system.rules.length, boon.stages[2].rules.length + 1);
    assert.deepEqual(effect.system.badge, { type: "counter", value: 3, min: 1, max: 4 });
    assert.deepEqual(effect.system.duration, { value: -1, unit: "unlimited", expiry: null, sustained: false });
    assert.equal(effect.flags[MODULE_ID].boon.stage, 3);
    assert.equal(heldOf(effect.system.rules), true);
    assert.equal(heldOf(boonEffectSource(flag).system.rules), false);
    const words = boonDescription(flag, { worldTime: 0 });
    assert.match(words, /stage 3 of 4/);
    assert.match(words, /Dazzled/, "stage 2's GM lines too");
    assert.match(words, /If it dies now: If you die at this stage or higher/);
    assert.match(words, /Purging:/);
    // (Its last stage: no rules, death.)
    const last = boonEffectSource(boonAt(flag, 4, 0));
    assert.deepEqual(last.system.rules, []);
    assert.deepEqual(stageLines(boon, 4), ["It dies."]);
});

test("the Hit Points a stage takes, its innate spells' places, its conditions at initiative by the d20, its riders and counteract, and the card", () => {
    const ring = plan("Heartblood Ring").boon;
    assert.deepEqual([hpLossOf(ring, 0, 1, 15), hpLossOf(ring, 1, 2, 15), hpLossOf(ring, 2, 3, 15), hpLossOf(ring, 3, 2, 15), hpLossOf(ring, 3, 4, 15)], [0, 30, 30, 0, 0]);
    const seed = plan("Elder Seed").boon;
    assert.deepEqual(innateLocation(seed.stages[2].spells[0], "entry1"), { value: "entry1", heightenedLevel: 4, uses: { value: 1, max: 1 } });
    assert.deepEqual(innateLocation(plan("Phoenix Cinder").boon.stages[0].spells[0], "entry2"), { value: "entry2" });
    const slowed = seed.stages[2].initiative;
    assert.deepEqual([1, 7, 10, 11, 20, undefined].map((die) => initiativeCondition(slowed, die).value), [3, 2, 2, 1, 1, 1]);
    const effect = initiativeEffectSource(initiativeCondition(slowed, 1), { name: "Elder Seed" });
    assert.deepEqual([effect.system.duration.unit, effect.system.rules[0].alterations[0].value], ["encounter", 3]);
    const confused = initiativeEffectSource(initiativeCondition(plan("Void Fragment").boon.stages[2].initiative, 12), { name: "Void Fragment", rounds: 3 });
    assert.deepEqual([confused.system.duration.value, confused.system.duration.unit, confused.system.rules[0].alterations], [3, "rounds", undefined]);
    const immunity = riderEffectSource({ kind: "immunity", type: "fire", days: 3 }, { name: "Phoenix Cinder" });
    assert.deepEqual([immunity.system.rules, immunity.system.duration.value, immunity.system.duration.unit], [[{ key: "Immunity", type: "fire" }], 3, "days"]);
    assert.deepEqual(boonCounteract(ring.stages[0].first[1], 15), { modifier: 0, rank: 8, fromUser: { modifier: "class-dc" }, conditions: [], traits: [], afflictions: ["disease", "poison"], pick: "one", self: true, notes: ["Again at the start of each of its turns while its Regenerate lasts."] });
    const card = stageCardHTML(boonFlag(seed, { worldTime: 0 }), { actorName: "Amiri", begun: true, worldTime: 0 });
    assert.match(card, /Amiri takes in the boon: stage 1, for 9 days/);
    assert.match(card, /Primal innate spells, once a day each: Enlarge, Speak with Animals, Speak with Plants, Web/);
    assert.match(card, /Stage 2 begins on its own in 9 days/);
});

// --- Live play (scripts/boons.js) against the stand-in for Foundry ---

const foundry = await fakeFoundry();
const { setUpBoons } = await import("../scripts/boons.js");
// (The stand-in keeps one socket handler a name: the live layer's kept, as Foundry keeps both.)
const liveSocket = foundry.socket(SOCKET);
setUpBoons();
globalThis.game.socket.on(SOCKET, liveSocket);
for (const doc of spellDocs.filter((spell) => ["Enlarge", "Speak with Animals", "Speak with Plants", "Web", "Ignition"].includes(spell.name))) foundry.documents.set(`Compendium.pf2e.spells-srd.Item.${doc._id}`, { uuid: `Compendium.pf2e.spells-srd.Item.${doc._id}`, name: doc.name, toObject: () => structuredClone(doc) });

// A creature whose items PF2e sorts by type, spells and equipment too, and whose items it updates.
function creature(id, name, level) {
    const actor = foundry.makeActor({ id, name, hp: 300, max: 300 });
    const types = Object.getOwnPropertyDescriptor(actor, "itemTypes").get;
    Object.defineProperty(actor, "itemTypes", { get() {
        return { ...types.call(this), equipment: this.created.filter((entry) => entry.type === "equipment"), spell: this.created.filter((entry) => entry.type === "spell") };
    } });
    actor.level = level;
    actor.updateEmbeddedDocuments = async (type, updates) => {
        for (const update of updates) {
            const entry = actor.created.find((one) => one.id === update._id);
            for (const [key, value] of Object.entries(update)) if (key !== "_id") key.split(".").reduce((at, part, index, parts) => (index === parts.length - 1 ? (at[part] = value) : (at[part] ??= {})), entry);
        }
        return updates;
    };
    return actor;
}
async function use(actor, given) {
    const data = given.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: given.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, rolls: [], speaker: { actor: actor.id }, actor, token: actor.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}
const stageEffects = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.boon);
async function passTime(actor, seconds) {
    globalThis.game.actors = { contents: [actor] };
    globalThis.game.time.worldTime += seconds;
    await foundry.call("updateWorldTime", globalThis.game.time.worldTime, seconds);
    await settle(60);
    delete globalThis.game.actors;
}

test("Phoenix Cinder used: stage 1 on its user (rules, badge, Held toggle), Regenerate and fire immunity, Ignition in an innate entry, the flames' item; a week on, stage 2 with its Hit Points taken and once an hour; held, it waits; the badge sets stage 3; deleted, it ends with its spells and item", async () => {
    const user = creature("seoni-boon", "Seoni", 16);
    await use(user, foundry.giveItem(user, source("Phoenix Cinder")));
    const [first] = stageEffects(user);
    assert.ok(first, "the stage Effect");
    assert.equal(first.name, "Phoenix Cinder: stage 1");
    assert.deepEqual(first.system.badge.value, 1);
    assert.equal(first.system.rules[0].option, HELD_OPTION);
    assert.ok(user.itemTypes.effect.some((effect) => effect.name === "Spell Effect: Regenerate"));
    assert.ok(user.itemTypes.effect.some((effect) => effect.name === "Phoenix Cinder: immune to fire" && effect.system.rules[0].type === "fire"));
    const [entry] = user.itemTypes.spellcastingEntry;
    assert.deepEqual([entry.system.tradition.value, entry.system.prepared.value], ["primal", "innate"]);
    assert.deepEqual(user.itemTypes.spell.map((spell) => [spell.name, spell.system.location.value]), [["Ignition", entry.id]]);
    const [holder] = user.itemTypes.equipment;
    assert.equal(holder.name, "Phoenix Cinder (boon)");
    assert.match(holder.system.description.value, /once per day/);
    assert.match(foundry.messages.at(-1).content, /Seoni takes in the boon: stage 1, for 1 week/);
    // (A week on: stage 2, 2 × 16 Hit Points off, the flames once an hour.)
    await passTime(user, 7 * DAY);
    const [second] = stageEffects(user);
    assert.equal(second.name, "Phoenix Cinder: stage 2");
    assert.ok(user.deleted.includes(first.id));
    assert.equal(user.system.attributes.hp.value, 300 - 32);
    assert.match(user.itemTypes.equipment[0].system.description.value, /once per hour/);
    assert.match(foundry.messages.at(-1).content, /moves on to stage 2/);
    // (Held by the GM: two months pass and it's still stage 2, its end put off.)
    second.system.rules[0].value = true;
    const ends = second.flags[MODULE_ID].boon.endsAt;
    await passTime(user, 60 * DAY);
    assert.deepEqual(stageEffects(user).map((effect) => effect.name), ["Phoenix Cinder: stage 2"]);
    assert.equal(stageEffects(user)[0].flags[MODULE_ID].boon.endsAt, ends + 60 * DAY);
    // (The badge to 3: stage 3 begins now, its hold kept, 2 × 16 more Hit Points off. Its actor as an embedded item's.)
    const owned = (entry) => Object.defineProperty(entry, "actor", { value: user, configurable: true });
    await foundry.call("updateItem", owned(stageEffects(user)[0]), { system: { badge: { value: 3 } } });
    await settle(60);
    const [third] = stageEffects(user);
    assert.equal(third.name, "Phoenix Cinder: stage 3");
    assert.equal(heldOf(third.system.rules), true);
    assert.equal(user.system.attributes.hp.value, 300 - 64);
    assert.doesNotMatch(user.itemTypes.equipment[0].system.description.value, /Dismiss/);
    // (Deleted by the GM: it ends, its spells, entry and item gone.)
    const spells = user.itemTypes.spell.map((spell) => spell.id);
    await foundry.call("deleteItem", owned(third), {});
    await settle(60);
    assert.ok([entry.id, holder.id, ...spells].every((id) => user.deleted.includes(id)));
    assert.deepEqual([user.itemTypes.spell.length, user.itemTypes.spellcastingEntry.length, user.itemTypes.equipment.length], [0, 0, 0]);
    assert.match(foundry.messages.at(-1).content, /boon ends/);
});

test("Elder Seed: its own save card; a failure begins it (four innate spells once a day), a success brings the seed back up; at stage 3 Enlarge is 4th rank and a natural 1 at initiative is Slowed 3, once an encounter; at stage 4 it dies", async () => {
    const user = creature("amiri-boon", "Amiri", 11);
    const seed = foundry.giveItem(user, source("Elder Seed"));
    await use(user, seed);
    const card = foundry.messages.at(-1);
    assert.equal(card.flags[MODULE_ID].card.own, true, "its user's own save");
    const boon = card.flags[MODULE_ID].card.plan.boon;
    // (The ability module's card applied: a success first — the seed back, one more of it.)
    const quantity = Number(seed.system.quantity) || 1;
    await foundry.call("pf2e-automatic-ability-resolution.applied", { state: { plan: { boon, ownSave: true }, ability: { name: "Elder Seed", uuid: seed.uuid }, source: { actorUuid: user.uuid } }, targets: [{ actorUuid: user.uuid, degree: "success" }] });
    await settle(60);
    assert.equal(seed.system.quantity, quantity + 1);
    assert.equal(stageEffects(user).length, 0);
    // (Then a failure: stage 1, its four spells.)
    await foundry.call("pf2e-automatic-ability-resolution.applied", { state: { plan: { boon, ownSave: true }, ability: { name: "Elder Seed", uuid: seed.uuid }, source: { actorUuid: user.uuid } }, targets: [{ actorUuid: user.uuid, degree: "failure" }] });
    await settle(60);
    assert.deepEqual(stageEffects(user).map((effect) => effect.name), ["Elder Seed: stage 1"]);
    assert.deepEqual(user.itemTypes.spell.map((spell) => [spell.name, spell.system.location.uses]), [["Enlarge", { value: 1, max: 1 }], ["Speak with Animals", { value: 1, max: 1 }], ["Speak with Plants", { value: 1, max: 1 }], ["Web", { value: 1, max: 1 }]]);
    // (9 days and a month on: stage 3, Enlarge at 4th rank.)
    await passTime(user, 9 * DAY + BOON_SECONDS.months);
    assert.deepEqual(stageEffects(user).map((effect) => effect.name), ["Elder Seed: stage 3"]);
    assert.equal(user.itemTypes.spell.find((spell) => spell.name === "Enlarge").system.location.heightenedLevel, 4);
    assert.match(foundry.messages.at(-1).content, /through stage 2/);
    // (Initiative with a natural 1: Slowed 3 for the encounter; set again, nothing more.)
    foundry.makeMessage({ flags: { pf2e: { context: { type: "initiative" } } }, actor: user, speaker: { actor: user.id }, rolls: [{ total: 9, dice: [{ total: 1 }] }] });
    const combatant = { actor: user, initiative: 9, parent: { id: "combat-1" } };
    await foundry.call("updateCombatant", combatant, { initiative: 9 });
    await foundry.call("updateCombatant", combatant, { initiative: 9 });
    await settle(60);
    const slowed = user.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.boonInitiative);
    assert.equal(slowed.length, 1);
    assert.deepEqual([slowed[0].name, slowed[0].system.duration.unit, slowed[0].system.rules[0].alterations[0].value], ["Elder Seed: Slowed 3 (initiative)", "encounter", 3]);
    // (A month more: its last stage, dead.)
    await passTime(user, BOON_SECONDS.months);
    assert.deepEqual(stageEffects(user).map((effect) => effect.name), ["Elder Seed: stage 4"]);
    assert.equal(user.system.attributes.hp.value, 0);
    assert.equal(user.itemTypes.spell.length, 0);
    assert.match(foundry.messages.at(-1).content, /Amiri dies/);
});

test("Heartblood Ring used: its Regenerate marked for the counteract, the counteract card for one disease or poison at once and again at the start of each of its turns while Regenerate lasts; a second dose while it lasts changes nothing", async () => {
    const user = creature("lini-boon", "Lini", 15);
    const ring = foundry.giveItem(user, source("Heartblood Ring"));
    const before = foundry.messages.length;
    await use(user, ring);
    const regenerate = user.itemTypes.effect.find((effect) => effect.name === "Spell Effect: Regenerate");
    assert.deepEqual(regenerate.flags[MODULE_ID].boonCounteract.rider.afflictions, ["disease", "poison"]);
    const counteracts = () => foundry.messages.slice(before).filter((message) => message.flags?.[MODULE_ID]?.card?.kind === "counteract");
    assert.equal(counteracts().length, 1);
    assert.deepEqual([counteracts()[0].flags[MODULE_ID].card.counteract.rank, counteracts()[0].flags[MODULE_ID].card.counteract.afflictions], [8, ["disease", "poison"]]);
    await foundry.call("pf2e.startTurn", { actor: user, token: user.token });
    await settle();
    assert.equal(counteracts().length, 2);
    // (A second ring while the first lasts: the GM's whisper, nothing changed.)
    await use(user, foundry.giveItem(user, { ...source("Heartblood Ring"), _id: "ring2" }));
    assert.equal(stageEffects(user).length, 1);
    assert.match(foundry.messages.at(-1).content, /already has this boon/);
});

test("a stage's Hit Points come off those its creature had, not PF2e's figure already held under the lower maximum", async () => {
    const user = creature("merisiel-boon", "Merisiel", 15);
    await use(user, foundry.giveItem(user, source("Heartblood Ring")));
    // (Stage 2 lowers its maximum by 30: PF2e's prepared value is held at the new 270; it had 290.)
    user._source = { system: { attributes: { hp: { value: 290 } } } };
    user.system.attributes.hp.value = 270;
    const [effect] = stageEffects(user);
    Object.defineProperty(effect, "actor", { value: user, configurable: true });
    await foundry.call("updateItem", effect, { system: { badge: { value: 2 } } });
    await settle(60);
    assert.deepEqual(stageEffects(user).map((one) => one.name), ["Heartblood Ring: stage 2"]);
    assert.equal(user.system.attributes.hp.value, 260);
});
