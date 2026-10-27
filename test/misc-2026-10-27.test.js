// The small needs' group of 2026-10-27 (docs/needs.md): the last Strike changes, creatures removed, retaliation, information, numbers from
// events, forms, lasting effects, triggers, use limits, senses and speeds — each read on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { oneOff } from "../src/compiler/one-offs.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";

test("a condition value the text rolls: Guise of the Smirking Devil (Greater)'s Drained 1d4 the row's valueRoll, no longer the GM's", () => {
    const wail = activation("Guise of the Smirking Devil (Greater)", "Hideous Wail");
    assert.ok(done(wail));
    const { failure, criticalFailure } = wail.resolution.outcomes;
    assert.deepEqual(failure.effects.map((effect) => [effect.slug, effect.value, effect.valueRoll]), [["drained", null, "1d4"]]);
    assert.equal((failure.noteEffects ?? []).length, 0);
    assert.deepEqual(criticalFailure.effects.map((effect) => [effect.slug, effect.value]), [["drained", 4]]);
});

test("a wait said at a paragraph's end: Madcap Top's 1d4 hours its recharge, as Rod of Wonder's", () => {
    assert.deepEqual(activation("Madcap Top", "Spin the Top").trigger.recharge, { formula: "1d4", unit: "hours" });
    assert.deepEqual(activation("Rod of Wonder").trigger.recharge, { formula: "1d4", unit: "hours" });
});

test("one-off rules of this group: their card's lines, counted done", () => {
    const plans = [
        activation("Ivory Baton"), activation("Ivory Baton (Greater)"), activation("Instant Fortress"), compileItem(item("Eldritch Flare")), activation("Ooze Skin"),
        activation("Flurrying"), compileItem(item("Time Shield Potion")), activation("Deck of illusions"), activation("Lucky Draw Bandolier", "Secret Ace"),
        activation("Lucky Draw Bandolier (Greater)"), activation("Madcap Top", "Spin the Top"), activation("Jabali's Dice", "Jabali's Gamble"), activation("Rod of Wonder")
    ];
    for (const plan of plans) {
        assert.ok(oneOff(plan.source.name), plan.source.name);
        assert.equal(plan.decided, "one-off", plan.source.name);
        assert.ok(done(plan), plan.source.name);
    }
    // (The cast and the table still play what they can: Ivory Baton's Dominate at DC 30, Rod of Wonder's spells at DC 27.)
    assert.deepEqual([plans[0].builtin, plans[0].spell.name, plans[0].dc], ["cast-spell", "Dominate", 30]);
    assert.deepEqual([plans[12].builtin, plans[12].table.dc, plans[12].table.attack], ["table", 27, 17]);
});
