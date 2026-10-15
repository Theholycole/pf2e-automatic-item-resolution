// An item that has its user roll their next roll of a kind twice, against the stand-in for Foundry: the reading, its card,
// Apply giving the user an Effect with PF2e's RollTwice rule, and that Effect gone after the roll it's for.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readRollTwice } from "../src/compiler/fortune.js";
import { plainText } from "../src/compiler/rows.js";
import { rollWords } from "../src/live/fortune-card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 160 squares down.)
const foundry = await fakeFoundry();
const hero = foundry.makeActor({ id: "fortune-hero", name: "Hero", owners: ["player"] });
foundry.place(hero, 0, 16000);
const fortunes = () => hero.itemTypes.effect.filter((effect) => effect.flags?.[MODULE_ID]?.rollTwice);

test("the reading: which roll is rolled twice, from the text or its trigger, and what else it says", () => {
    const [sunweave] = compileActivations(source("Sunweave"));
    assert.equal(routeOf(sunweave.plan), "fortune");
    assert.deepEqual(sunweave.plan.rollTwice, { selector: "initiative", keep: "higher" });
    // "Trigger You attempt an Athletics check to Force Open, Reposition, or Shove": Athletics, for those actions only.
    const wraps = compileActivations(source("Kinetic Wraps of Strength")).find((entry) => entry.plan?.builtin === "roll-twice").plan;
    assert.deepEqual(wraps.rollTwice, { selector: "athletics", keep: "higher", predicate: [{ or: ["action:force-open", "action:reposition", "action:shove"] }] });
    assert.equal(rollWords(wraps.rollTwice), "Athletics check (force open, reposition, shove)");
    // "Roll the triggering saving throw twice".
    assert.equal(compileActivations(source("Energy Shield Tunic")).find((entry) => entry.plan?.builtin === "roll-twice").plan.rollTwice.selector, "saving-throw");
    // A talisman: "you roll your next attack roll twice …, ignoring any circumstance penalties. You then become Off-Guard …".
    const tear = compileItem(source("Gorum's Tear"));
    assert.deepEqual([tear.builtin, tear.rollTwice.selector, tear.partial], ["roll-twice", "attack-roll", true]);
    assert.match(tear.notes.join(" "), /Off-Guard/);
    // Not a fortune for its user: another creature's worse roll, or a damage roll.
    assert.equal(readRollTwice("Effect The caster must roll the spell attack roll twice and take the worse result."), null);
    assert.equal(readRollTwice("Trigger You successfully Strike a creature; Effect Roll the damage of the triggering Strike twice and take the higher result."), null);
    assert.equal(readRollTwice(plainText(source("Grinning Pugwampi").system.description.value)), null);
});

test("Gorum's Tear: Apply gives PF2e's RollTwice for the next attack roll; that roll removes it", async () => {
    const item = foundry.giveItem(hero, source("Gorum's Tear"));
    const data = item.toObject();
    const use = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", use);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(use) + 1];
    assert.equal(card.flags[MODULE_ID].card.kind, "fortune");
    assert.match(card.content, /next attack roll: roll twice, take the better/);
    assert.match(card.content, /Off-Guard/, "what else it says, as notes");
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    const [effect] = fortunes();
    assert.deepEqual(effect.system.rules, [{ key: "RollTwice", selector: "attack-roll", keep: "higher", removeAfterRoll: true }]);
    // A save doesn't spend it; the attack roll does.
    const save = foundry.makeMessage({ flags: { pf2e: { context: { type: "saving-throw", domains: ["reflex", "saving-throw", "all"] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", save);
    await settle();
    assert.equal(fortunes().length, 1);
    const attack = foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome: "success", domains: ["strike-attack-roll", "attack-roll", "attack", "all"], options: [] } } }, speaker: { actor: hero.id }, actor: hero, token: hero.token.document });
    await foundry.call("createChatMessage", attack);
    await settle();
    assert.equal(fortunes().length, 0);
});
