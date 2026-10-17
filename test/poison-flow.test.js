// Injury poisons against the stand-in for Foundry: the poison's card coats a piercing or slashing weapon; that
// weapon's next Strike that hits posts the poison's save card (the ability module's) on the target and spends it; a
// miss keeps it; a critical miss wastes it.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 40 squares down.)
const foundry = await fakeFoundry();
const rogue = foundry.makeActor({ id: "poison-rogue", name: "Rogue", owners: ["player"] });
const ogre = foundry.makeActor({ id: "poison-ogre", name: "Ogre" });
foundry.place(rogue, 0, 4000);
foundry.place(ogre, 100, 4000);
const weapon = (id, name, damageType, carryType = "held", traits = []) => ({ id, uuid: `${rogue.uuid}.Item.${id}`, name, type: "weapon", system: { damage: { damageType }, equipped: { carryType }, traits: { value: traits } } });
rogue.weapons = [weapon("club", "Club", "bludgeoning"), weapon("dagger", "Dagger", "piercing", "worn"), weapon("sword", "Shortsword", "piercing")];

async function use(item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: rogue.id }, actor: rogue, token: rogue.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

async function strike(weaponId, outcome) {
    const message = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, target: { actor: ogre.uuid, token: ogre.token.uuid } }, origin: { uuid: `${rogue.uuid}.Item.${weaponId}`, type: "weapon" } } }, speaker: { actor: rogue.id }, actor: rogue, token: rogue.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return message;
}

const poisonOn = (weaponId) => rogue.itemTypes.effect.find((effect) => effect.flags?.[MODULE_ID]?.poison?.weaponId === weaponId);

test("the poison's card offers the piercing and slashing weapons, held first, and coats the chosen one", async () => {
    const card = await use(foundry.giveItem(rogue, source("Black Adder Venom")));
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.kind, "poison");
    assert.deepEqual(state.weapons.map((entry) => entry.name), ["Shortsword", "Dagger"], "not the club");
    assert.match(card.content, /DC 18 Fortitude save/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, weapon: 0, userId: "player" });
    await settle();
    const effect = poisonOn("sword");
    assert.equal(effect?.name, "Black Adder Venom (on Shortsword)");
    assert.deepEqual(effect.system.duration, { value: -1, unit: "unlimited", expiry: null, sustained: false });
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("a miss keeps it; a hit posts its save card on the target and spends it", async () => {
    const before = foundry.posted.length;
    await strike("sword", "failure");
    assert.ok(poisonOn("sword"), "kept after a miss");
    assert.equal(foundry.posted.length, before);
    await strike("dagger", "success");
    assert.ok(poisonOn("sword"), "a Strike with another weapon doesn't spend it");
    await strike("sword", "success");
    assert.equal(poisonOn("sword"), undefined, "spent");
    const [posted] = foundry.posted.slice(before);
    assert.equal(posted.plan.resolution.kind, "save");
    assert.equal(posted.plan.resolution.afflictionHandoff.name, "Black Adder Venom");
    assert.equal(posted.item.name, "Black Adder Venom");
    assert.equal(posted.sourceActor, rogue);
    assert.deepEqual(posted.tokens.map((token) => token.name), ["Ogre"]);
});

test("a critical miss wastes it; a second coat replaces the first", async () => {
    const venom = foundry.giveItem(rogue, source("Black Adder Venom"));
    for (let coat = 0; coat < 2; coat++) {
        const card = await use(venom);
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, weapon: 0, userId: "gm" });
        await settle();
    }
    assert.equal(rogue.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.poison?.weaponId === "sword").length, 1, "one poison on a weapon");
    const posted = foundry.posted.length;
    await strike("sword", "criticalFailure");
    assert.equal(poisonOn("sword"), undefined);
    assert.equal(foundry.posted.length, posted, "no save card");
    assert.match(foundry.messages.at(-1).content, /critical miss wastes the poison on Shortsword/);
});

test("without the ability module's save card, the GM is told to roll it", async () => {
    const card = await use(foundry.giveItem(rogue, source("Black Adder Venom")));
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, weapon: 0, userId: "gm" });
    await settle();
    const { postCard } = foundry.ability.live;
    delete foundry.ability.live.postCard;
    try {
        await strike("sword", "criticalSuccess");
        const note = foundry.messages.at(-1);
        assert.match(note.content, /Ogre is exposed \(DC 18 Fortitude save\)/);
        assert.deepEqual(note.whisper, ["gm"]);
    } finally {
        foundry.ability.live.postCard = postCard;
    }
});

test("a contact, inhaled or ingested poison: exposure of the creatures its presser targets, through the save card", async () => {
    for (const name of ["Dragon Bile", "Terror Spores", "Knockout Dram"]) {
        const card = await use(foundry.giveItem(rogue, source(name)));
        const state = card.flags[MODULE_ID].card;
        assert.equal(state.kind, "expose", name);
        assert.match(card.content, /DC \d+ \w+ save/, name);
        // No target: refused, the card stays open.
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
        await settle();
        assert.equal(card.flags[MODULE_ID].card.status, "open", name);
        const before = foundry.posted.length;
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [ogre.token.uuid], userId: "player" });
        await settle();
        const [posted] = foundry.posted.slice(before);
        assert.equal(posted?.plan.resolution.afflictionHandoff.name, name, name);
        assert.deepEqual(posted.tokens.map((token) => token.name), ["Ogre"], name);
        assert.equal(card.flags[MODULE_ID].card.status, "applied", name);
    }
    assert.match((await use(foundry.giveItem(rogue, source("Terror Spores")))).content, /10-foot cube cloud/);
    // A drug with the injury trait is injected, not put on a weapon.
    const zerk = (await use(foundry.giveItem(rogue, source("Zerk")))).flags[MODULE_ID].card;
    assert.deepEqual([zerk.kind, zerk.delivery], ["expose", "injected"]);
});

test("another item's save on its Use goes to the creatures its presser targets; one for later doesn't", async () => {
    const card = await use(foundry.giveItem(rogue, source("Spark Wafer")));
    const state = card.flags[MODULE_ID].card;
    assert.deepEqual([state.kind, state.delivery], ["expose", null]);
    assert.match(card.content, /A save for the creatures in its 5-foot burst \(DC 14 Reflex save\)/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [ogre.token.uuid], userId: "player" });
    await settle();
    assert.equal(foundry.posted.slice(before)[0]?.plan.resolution.check.against.value, 14);
    // An energy breath potion gives an action for an hour: its card waits for that action.
    const breath = await use(foundry.giveItem(rogue, source("Energy Breath Potion (Acid, Greater)")));
    assert.equal(breath.flags[MODULE_ID].card.later, true);
    assert.match(breath.content, /Kept for later: when Rogue uses it, target the creatures in its 30-foot line/);
    assert.match(breath.content, /Use it: my targets/);
});

test("a breath used again after its recharge: its card stays open for the hour, then closes; a one-off closes at once", async () => {
    const breath = await use(foundry.giveItem(rogue, source("Energy Breath Potion (Fire, Lesser)")));
    const state = breath.flags[MODULE_ID].card;
    assert.deepEqual([state.later, state.repeat, state.until], [true, true, globalThis.game.time.worldTime + 3600]);
    for (const time of [1, 2]) {
        await foundry.socket(SOCKET)({ action: "apply", messageId: breath.id, targets: [ogre.token.uuid], userId: "player" });
        await settle();
        assert.equal(breath.flags[MODULE_ID].card.status, "open", `still open after use ${time}`);
    }
    assert.match(breath.content, /used 2 times/);
    const saved = globalThis.game.time.worldTime;
    globalThis.game.time.worldTime = state.until + 1;
    try {
        const before = foundry.posted.length;
        await foundry.socket(SOCKET)({ action: "apply", messageId: breath.id, targets: [ogre.token.uuid], userId: "player" });
        await settle();
        assert.equal(breath.flags[MODULE_ID].card.status, "applied", "the hour is up");
        assert.equal(foundry.posted.length, before, "no save card after it");
    } finally {
        globalThis.game.time.worldTime = saved;
    }
    // Frost Breath's one exhale: done after it.
    const frost = await use(foundry.giveItem(rogue, source("Frost Breath")));
    assert.equal(frost.flags[MODULE_ID].card.repeat, undefined);
    // Roaring Potion gives its scream for later, once every 1d4 rounds for an hour; drinking it screams at no one.
    const roar = (await use(foundry.giveItem(rogue, source("Roaring Potion (Lesser)")))).flags[MODULE_ID].card;
    assert.deepEqual([roar.later, roar.repeat], [true, true]);
});

test("an item with no Activate line is still used: a save for its target (Sneezing Powder); one set off by something else isn't", async () => {
    const powder = await use(foundry.giveItem(rogue, source("Sneezing Powder")));
    assert.equal(powder.flags[MODULE_ID].card.kind, "expose");
    const fulu = await use(foundry.giveItem(rogue, source("Spirit-Sealing Fulu")));
    assert.match(fulu.content, /DC 17 Will save/);
    // A dragon's breath potion's breath is for later.
    assert.equal((await use(foundry.giveItem(rogue, source("Red Dragon's Breath Potion (Adult)")))).flags[MODULE_ID].card.later, true);
    // Anathema Fulu: a creature that starts its turn in the area — no card.
    const count = foundry.messages.length;
    await use(foundry.giveItem(rogue, source("Anathema Fulu")));
    assert.equal(foundry.messages.length, count + 1);
    // Darkening Poison is an injury poison by its text.
    assert.equal((await use(foundry.giveItem(rogue, source("Darkening Poison")))).flags[MODULE_ID].card.kind, "poison");
});

test("a snare goes to the ability module's zones (startZone, once); without them, the GM places it", async () => {
    const zones = [];
    foundry.ability.live.startZone = async (options) => zones.push(options);
    try {
        await use(foundry.giveItem(rogue, source("Spike Snare")));
        assert.equal(zones.length, 1);
        assert.deepEqual([zones[0].item.name, zones[0].item.actor, zones[0].plan.zone.once, zones[0].plan.zone.area.type], ["Spike Snare", rogue, true, "square"]);
        assert.equal(zones[0].sourceToken.uuid, rogue.token.uuid);
    } finally {
        delete foundry.ability.live.startZone;
    }
    await use(foundry.giveItem(rogue, source("Spike Snare")));
    assert.match(foundry.messages.at(-1).content, /Set the snare in a square within reach/);
});


test("Spider Gun's Web Shot: a square placed within 30 feet for 1 minute, its Reflex save on entering (Immobilized on a critical failure); Activate starts the ability module's zone", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const [web] = compileActivations(source("Spider Gun (Greater)"));
    const zone = web.plan.zone;
    const save = zone.saves[0].plan.resolution;
    assert.deepEqual([web.plan.builtin, zone.area, zone.centre, zone.range, zone.lasts.value, zone.lasts.unit, zone.once ?? false, zone.saves[0].when], ["zone", { type: "square", value: 5 }, "placed", 30, 1, "minutes", false, ["enter"]]);
    assert.deepEqual([save.check.statistic, save.check.against.value, save.outcomes.criticalFailure.effects.map((effect) => [effect.slug, effect.duration?.value, effect.duration?.unit]), save.outcomes.failure.effects], ["reflex", 25, [["immobilized", 1, "rounds"]], []]);
    assert.ok(zone.notes.includes("It can attempt an Athletics check against DC 25 instead of the Reflex save."));
    const zones = [];
    foundry.ability.live.startZone = async (options) => zones.push(options);
    try {
        const gun = foundry.giveItem(rogue, source("Spider Gun (Greater)"));
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: gun.uuid, activation: 0, userId: "player" });
        await settle();
        assert.deepEqual([zones.length, zones[0]?.plan?.zone?.range], [1, 30]);
    } finally {
        delete foundry.ability.live.startZone;
    }
});

test("clouds and gusts as the ability module's zones: Smogger's smog on its user (Concealed, 1 minute), Smoke Fan's 5-foot burst of smoke (Concealed, 1 minute), Wind Ocarina's gusts (difficult terrain, 1 minute)", async () => {
    const { compileActivations } = await import("../src/compiler/permanent.js");
    const { compileItem } = await import("../src/compiler/index.js");
    const summary = (plan) => [plan.builtin, plan.zone.area, plan.zone.centre, plan.zone.lasts.value, plan.zone.lasts.unit, plan.zone.concealed, plan.zone.terrain.length];
    assert.deepEqual(summary(compileActivations(source("Smogger"))[0].plan), ["zone", { type: "emanation", value: 10 }, "self", 1, "minutes", true, 0]);
    assert.deepEqual(summary(compileItem(source("Smoke Fan"))), ["zone", { type: "burst", value: 5 }, "self", 1, "minutes", true, 0]);
    assert.deepEqual(summary(compileItem(source("Wind Ocarina"))), ["zone", { type: "emanation", value: 5 }, "self", 1, "minutes", false, 1]);
});

test("the drinker's own save rolls for its user, no targets; a save set off by attackers stays open for the item's time", async () => {
    const { isOwnSave, ATTACKER } = await import("../src/live/poison-card.js");
    const { compileItem } = await import("../src/compiler/index.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const truth = source("Truth Potion");
    assert.equal(isOwnSave(compileItem(truth), plainText(truth.system.description.value)), true);
    const item = foundry.giveItem(rogue, truth);
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: rogue.id }, actor: rogue, token: rogue.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.match(card.content, /Rogue(?:'|&#39;)s own save/);
    const before = foundry.posted.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    assert.deepEqual(foundry.posted.slice(before)[0].tokens.map((token) => token.name), ["Rogue"]);
    // Oil of Repulsion: "any creature that hits you with a melee Strike must attempt …" — the later card, kept open.
    const oil = source("Oil of Repulsion");
    assert.equal(ATTACKER.test(plainText(oil.system.description.value)), true);
    const { routeOf } = await import("../src/live/route.js");
    assert.equal(routeOf(compileItem(oil), plainText(oil.system.description.value)), "later");
});
