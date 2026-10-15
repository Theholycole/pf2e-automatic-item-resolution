// Items that cast a spell PF2e has no Effect for, against the stand-in for Foundry: the card, and Apply asking the
// spell module (api.castFromItem) to cast it on the drinker, on the user, or at the presser's targets.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { compileItem } from "../src/compiler/index.js";
import { castWordsPlan, readCastWords, spellIndex } from "../src/compiler/cast-words.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const activationOf = (name, which = 0) => compileActivations(source(name), { spells })[which];
const castOf = (name, which = 0) => activationOf(name, which).plan;

// (Shared with the other flow tests: these creatures stand 60 squares down.)
const foundry = await fakeFoundry();
const sneak = foundry.makeActor({ id: "cast-sneak", name: "Sneak", owners: ["player"] });
const buddy = foundry.makeActor({ id: "cast-buddy", name: "Buddy" });
foundry.place(sneak, 0, 6000);
foundry.place(buddy, 100, 6000);

async function use(actor, item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("an invisibility potion fed to the creature next to the user: the spell module casts it on that drinker", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.kind, "cast");
    assert.deepEqual(state.drinkers.map((entry) => entry.name), ["Sneak", "Buddy"]);
    assert.match(card.content, /Invisibility \(rank 2\)/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "player" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.equal(cast.actor, buddy, "the drinker casts it");
    assert.equal(cast.spell, "Compendium.pf2e.spells-srd.Item.XXqE1eY3w3z6xJCB");
    assert.equal(cast.rank, 2);
    assert.deepEqual(cast.targets.map((token) => token.uuid), [buddy.token.uuid], "on itself");
    assert.equal(cast.item.name, "Invisibility Potion");
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("a counteract modifier the item states goes with the cast", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Truesight Potion")));
    assert.match(card.content, /counteract \+25/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.actor, cast.rank, cast.counteract], [sneak, 7, 25]);
});

test("without the spell module, the card says to cast it by hand", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const { castFromItem } = foundry.spell;
    delete foundry.spell.castFromItem;
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
        await settle();
        assert.match(card.flags[MODULE_ID].card.results[0], /Cast Invisibility by hand at rank 2/);
    } finally {
        foundry.spell.castFromItem = castFromItem;
    }
});

test("a cast in words: the spell by its name, its rank, DC, counteract modifier, who it's on, and choices", () => {
    // "The armor casts mislead, affecting you."
    const mislead = castOf("Misleading");
    assert.deepEqual([mislead.builtin, mislead.spell.name, mislead.self], ["cast-spell", "Mislead", true]);
    // "You cast either 5th-rank Darkvision or See the Unseen on yourself": choices, the rank for both.
    const mantis = compileActivations(source("Mask of the Mantis (Major)"), { spells }).find((entry) => entry.activation.name === "Enhance Vision").plan;
    assert.deepEqual(mantis.choices.map((entry) => [entry.spell.name, entry.rank]), [["Darkvision", 5], ["See the Unseen", 5]]);
    assert.equal(mantis.self, true);
    // "Choose Summon Lesser Servitor or Command. You Cast the chosen Spell at 1st rank (DC 19)."
    const chimes = compileActivations(source("Worldringer"), { spells }).find((entry) => entry.activation.name === "Chimes of Command").plan;
    assert.deepEqual([chimes.choices.map((entry) => `${entry.spell.name}@${entry.rank}`), chimes.dc], [["Summon Lesser Servitor@1", "Command@1"], 19]);
    // "The crystal ball casts a DC 33 Scrying spell to your specifications."
    const ball = compileActivations(source("Crystal Ball (Clear Quartz)"), { spells }).find((entry) => entry.activation.name === "Scrying").plan;
    assert.deepEqual([ball.spell.name, ball.dc, ball.targets], ["Scrying", 33, true]);
    // "5th-rank Vitality Lash or Light, or 4th-rank Holy Light or Vital Beacon": a rank holds for the spells after it.
    assert.deepEqual(castOf("Dawnlight (Major)").choices.map((entry) => entry.rank), [5, 5, 4, 4]);
    assert.equal(castOf("Dawnlight (Major)").attack, 18, "its counteract modifier");
    // "a counteract modifier of [[/r 1d20+23]]".
    assert.equal(castOf("Rod of Negation").attack, 23);
    // An area spell: no targets needed.
    const drum = castOf("Drum of Upheaval", 1);
    assert.deepEqual([drum.spell.name, drum.dc, drum.area], ["Earthquake", 43, true]);
    // A legacy name: "You cast dimension door."
    assert.equal(castOf("Fiendish Teleportation").spell.name, "Translocate");
    // "Harm, Heal, or the 1st-rank spell from your deity's cleric spells": the unread choice a note; the spells' DC.
    const faith = castOf("Faith Tattoo");
    assert.deepEqual([faith.choices.map((entry) => entry.spell.name), faith.dc], [["Harm", "Heal"], 18]);
    assert.match(faith.notes.join(" "), /deity's cleric spells/);
    // Not casts: a random table, innate spells for a while, a spell named in passing, a cast after a failed save.
    assert.equal(readCastWords(source("Pistol of Wonder").system.description.value, { spells }), null);
    assert.equal(castWordsPlan(source("Elder Seed"), { spells }), null);
    assert.equal(compileActivations(source("Compass of Transpositional Awareness"), { spells }).find((entry) => entry.activation.name === "Track Teleportation").plan?.builtin ?? null, null);
    assert.equal(castOf("Whip of Compliance")?.builtin ?? null, null);
    // A consumable: "Applying this oil to an item casts a 2nd-rank Mending spell".
    const oil = compileItem(source("Oil of Mending"), { spells });
    assert.deepEqual([oil.builtin, oil.spell.name, oil.rank], ["cast-spell", "Mending", 2]);
});

test("a cast with choices: the card's picker; the chosen spell cast, an area one without targets", async () => {
    const mask = foundry.giveItem(sneak, source("Mask of the Mantis (Major)"));
    const index = compileActivations(source("Mask of the Mantis (Major)"), { spells }).findIndex((entry) => entry.activation.name === "Enhance Vision");
    let count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: mask.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    assert.ok(card, "the cast card");
    assert.match(card.content, /data-air-field="choice"/);
    assert.match(card.content, /See the Unseen \(rank 5\)/);
    let before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, choice: 1, userId: "player" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.spell, cast.rank], [spells["see the unseen"].uuid, 5]);
    assert.deepEqual(cast.targets.map((token) => token.uuid), [sneak.token.uuid], "on its user");
    assert.match(card.content, /casts See the Unseen/);
    // An area spell at no one: cast without targets.
    const drum = foundry.giveItem(sneak, source("Drum of Upheaval"));
    count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: drum.uuid, activation: 1, userId: "player" });
    await settle();
    const drumCard = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: drumCard.id, userId: "player", targets: [] });
    await settle();
    const [quake] = foundry.casts.slice(before);
    assert.deepEqual([quake.spell, quake.dc, quake.targets.length], [spells.earthquake.uuid, 43, 0]);
});

