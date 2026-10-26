// A flat check to end persistent damage at once, against the stand-in for Foundry: the reading (Quenching Potion's
// "Immediately attempt a flat check to end any persistent acid, fire, poison, or void damage affecting you", at DC 10 as
// particularly appropriate help), what isn't one, and the item card rolling PF2e's own recovery check at that DC.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readRecovery } from "../src/compiler/recovery.js";
import { recoveryText } from "../src/live/card.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 200 squares down.)
const foundry = await fakeFoundry();
const medic = foundry.makeActor({ id: "recovery-medic", name: "Medic", owners: ["player"] });
foundry.place(medic, 0, 20000);

// (A check that doesn't end it waits a moment for PF2e's deletion first: until the card says it's applied.)
async function applied(card) {
    for (let wait = 0; wait < 60 && !card.flags[MODULE_ID]?.card?.results?.length; wait++) await new Promise((resolve) => setTimeout(resolve, 50));
}

async function use(item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: medic.id }, actor: medic, token: medic.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("Cinnamon Nostalgia Bun: its flat check against one persistent mental damage at the lower DC, beside its frightened lowered — nothing left over", () => {
    const bun = compileItem(source("Cinnamon Nostalgia Bun"));
    assert.deepEqual([bun.item.recovery, bun.notes, Boolean(bun.partial)], [{ types: ["mental"], dc: 10 }, undefined, false]);
});

test("the reading: the types and the DC, and what else it says", () => {
    const quench = compileItem(source("Quenching Potion"));
    assert.equal(routeOf(quench), "item");
    assert.deepEqual(quench.item.recovery, { types: ["acid", "fire", "poison", "void"], dc: 10 });
    assert.equal(recoveryText(quench.item.recovery), "A flat check (DC 10) to end persistent acid, fire, poison or void damage");
    // Its new saving throw against poison isn't read: a note.
    assert.equal(quench.partial, true);
    assert.match(quench.notes.join(" "), /new saving throw against any poison/);
    // "@Check[flat|dc:10] to end any persistent poison damage" (Antivenom Potion): its flat check, and (2026-10-26) its +1 to Fortitude saves
    // against persistent poison damage a note Effect for the minute in place of the whole text's reminder — whole.
    const antivenom = compileItem(source("Antivenom Potion"));
    assert.deepEqual([antivenom.item.recovery, antivenom.noteOnly, antivenom.partial], [{ types: ["poison"], dc: 10 }, undefined, undefined]);
    assert.deepEqual(antivenom.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit, Boolean(note.reminder)]), [["+1 to Fortitude saves against persistent poison damage", 1, "minutes", false]]);
    // "an immediate flat check to end any persistent bleed effect with the lower DC for particularly effective assistance", on
    // "yourself or an adjacent target" (Cauterizing Torch): the card's drinker choice.
    const torch = compileItem(source("Cauterizing Torch"));
    assert.deepEqual([torch.item.recovery, torch.item.recipient], [{ types: ["bleed"], dc: 10 }, "drinker"]);
    // "the DC typically decreases from 15 to 10" (Ring of Torag): no note of it.
    const [torag] = compileActivations(source("Ring of Torag"));
    assert.deepEqual([torag.plan.item.recovery, torag.plan.notes], [{ types: ["fire"], dc: 10 }, undefined]);
    // Searing Suture's "takes 1d6 fire damage and can immediately attempt a @Check[flat|dc:15] …": the damage the card's own since 2026-10-26
    // (test/options-flow.test.js).
    const suture = compileItem(source("Searing Suture (Lesser)"));
    assert.deepEqual([suture.item.recovery, suture.ways[0].plan.resolution.sharedDamage.components[0].formula], [{ types: ["bleed"], dc: 15 }, "1d6"]);
    // The type the powder's own (Soothing Powder): the card's picker. Not one for others.
    assert.deepEqual(compileItem(source("Soothing Powder (Lesser)")).item.recovery, { types: ["bleed", "poison", "fire", "acid"], dc: 10, choose: true });
    assert.equal(recoveryText(compileItem(source("Soothing Powder (Greater)")).item.recovery), "A flat check (DC 10) to end persistent damage of its type (picked below)");
    // (Their list of types and own-type check aren't GM work; the Greater's DC 10 lasting a minute, a note Effect for that minute.)
    const [lesser, greater] = ["Soothing Powder (Lesser)", "Soothing Powder (Greater)"].map((name) => compileItem(source(name)));
    assert.deepEqual([lesser.partial, lesser.notes, greater.partial, greater.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit])], [undefined, undefined, undefined, [["Lower flat-check DC", 1, "minutes"]]]);
    assert.equal(readRecovery("Each creature in the emanation can immediately attempt a flat check to end any persistent fire damage."), null);
});

test("Quenching Potion: Apply rolls PF2e's recovery check at DC 10 for each persistent damage of its types", async () => {
    const fire = foundry.givePersistent(medic, { damageType: "fire", dc: 15, nextRoll: 12 });
    const acid = foundry.givePersistent(medic, { damageType: "acid", dc: 15, nextRoll: 4 });
    const bleed = foundry.givePersistent(medic, { damageType: "bleed", dc: 15, nextRoll: 20 });
    const card = await use(foundry.giveItem(medic, source("Quenching Potion")));
    assert.equal(card.flags[MODULE_ID].card.kind, "item");
    assert.match(card.content, /A flat check \(DC 10\) to end persistent acid, fire, poison or void damage/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    await applied(card);
    // Fire: 12 against DC 10 — ended. Acid: 4 — stays, its DC 15 again. Bleed isn't its type: not rolled.
    assert.deepEqual([fire.rolled, acid.rolled, bleed.rolled], [[10], [10], []]);
    assert.deepEqual(medic.persistent.map((entry) => entry.system.persistent.damageType), ["acid", "bleed"]);
    assert.equal(acid.system.persistent.dc, 15);
    assert.match(card.content, /Persistent Damage \(1d6 fire\) ended \(flat check, DC 10\)/);
    assert.match(card.content, /didn&#39;t end Persistent Damage \(1d6 acid\)/);
    medic.persistent = [];
    // None to end: the card says so.
    const again = await use(foundry.giveItem(medic, source("Quenching Potion")));
    await foundry.socket(SOCKET)({ action: "apply", messageId: again.id, userId: "player" });
    await settle();
    assert.match(again.content, /no persistent acid, fire, poison or void damage: no flat check/);
});

test("Soothing Powder: the type picked on the card is the persistent damage its flat check ends", async () => {
    const fire = foundry.givePersistent(medic, { damageType: "fire", dc: 15, nextRoll: 12 });
    const bleed = foundry.givePersistent(medic, { damageType: "bleed", dc: 15, nextRoll: 20 });
    const card = await use(foundry.giveItem(medic, source("Soothing Powder (Lesser)")));
    assert.match(card.content, /data-air-field="recoveryType"/);
    // Fire picked (the third): only the fire is rolled.
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", recoveryType: 2 });
    await settle();
    await applied(card);
    assert.deepEqual([fire.rolled, bleed.rolled], [[10], []]);
    medic.persistent = [];
});

test("Elixir of Rejuvenation: its drinker healed up to its maximum Hit Points and its afflictions of level 20 or lower removed; the dead creature brought back a note", async () => {
    const elixir = compileItem(source("Elixir of Rejuvenation"));
    assert.deepEqual([routeOf(elixir), elixir.item.restore, elixir.partial, elixir.noteOnly], ["item", { hp: "max", afflictions: { level: 20 } }, true, undefined]);
    const drinker = foundry.makeActor({ id: "restore-drinker", name: "Rejuvenated", owners: ["player"], hp: 4, max: 50 });
    foundry.place(drinker, 1, 20000);
    await drinker.createEmbeddedDocuments("Item", [{ type: "affliction", name: "Ghoul Fever", system: { level: { value: 3 } } }, { type: "affliction", name: "Elder Curse", system: { level: { value: 22 } } }]);
    // (And one Pseudo Afflictions tracks as its Effect, as PF2e's production builds have no affliction items.)
    await drinker.createEmbeddedDocuments("Item", [{ type: "effect", name: "Affliction Effect: Viper Venom", system: { traits: { value: ["poison"] }, level: { value: 1 } }, flags: { "pseudo-afflictions": { save: { value: 16 }, stages: { 1: {} } } } }]);
    const item = foundry.giveItem(drinker, source("Elixir of Rejuvenation"));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: drinker.id }, actor: drinker, token: drinker.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    const card = foundry.messages[foundry.messages.indexOf(message) + 1];
    assert.match(card.content, /Heals up to its maximum Hit Points, and removes its afflictions of level 20 or lower/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    await applied(card);
    assert.equal(drinker.system.attributes.hp.value, 50);
    assert.deepEqual(drinker.itemTypes.affliction.map((affliction) => affliction.name), ["Elder Curse"]);
    assert.ok(card.flags[MODULE_ID].card.results.some((line) => /Ghoul Fever, Viper Venom removed/.test(line)), card.flags[MODULE_ID].card.results.join(" | "));
    assert.ok(!drinker.itemTypes.effect.some((effect) => /Viper Venom/.test(effect.name)), "Pseudo Afflictions' Effect gone");
});
