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

test("more one-offs, and note-only items checked: card lines, counted done", () => {
    const plans = [
        activation("Prismatic Plate"), compileItem(item("Krasovnatype")), activation("Chronicler Wayfinder"), activation("Cunning"), activation("Demilich Eye Gem"),
        compileItem(item("Feather Token (Whip)")), activation("Prankster's Perpetual Pieplate", "Project Pastry"), compileItem(item("Neophyte's Fipple")),
        activation("Kraken Figurehead", "Grab Them!"), activation("Animate Dreamer", "Unleash Spell"), compileItem(item("Iron Equalizer")),
        compileItem(item("Octopus Potion (Lesser)")), compileItem(item("Octopus Potion (Moderate)")), compileItem(item("Octopus Potion (Greater)")),
        compileItem(item("Reactive Flash")), activation("Chimera Flail", "Pouncing Whirl"), activation("Wildwood Ink (Greater)"), activation("Wildwood Ink (Major)")
    ];
    for (const plan of plans) {
        assert.equal(plan.decided, "one-off", plan.source?.name);
        assert.ok(done(plan), plan.source?.name);
    }
    // (Its Stride still the teleport card's, Wildwood Ink's cast still One with Plants for its hour.)
    assert.equal(activation("Chimera Flail", "Pouncing Whirl").builtin, "teleport");
    assert.deepEqual([activation("Wildwood Ink (Greater)").spell.name, activation("Wildwood Ink (Greater)").castDuration.value], ["One with Plants", 1]);
    for (const plan of [activation("Collar of the Eternal Bond", "Eidolon's Freedom"), compileItem(item("Ghostly Portal Paint")), compileItem(item("Ghost Ink"))]) {
        assert.equal(plan.decided, "checked");
        assert.ok(done(plan));
    }
});

test("damage to whoever touches its user while the activation lasts: Armorskin Robes of Fire's 1d6 fire for its 10 minutes, beside the resistance", () => {
    const sheath = activation("Armorskin Robes of Fire", "Elemental Sheath");
    assert.ok(done(sheath));
    assert.equal((sheath.unread ?? []).length, 0);
    assert.deepEqual(sheath.item.resist.map((entry) => [entry.type, entry.value]), [["slashing", 5], ["piercing", 5]]);
    const also = sheath.alsoRetaliation;
    assert.deepEqual(also.retaliation, { adjacentMelee: true, rounds: 100 });
    assert.deepEqual(also.resolution.sharedDamage.components.map((component) => [component.formula, component.type]), [["1d6[fire]", "fire"]]);
    assert.equal(also.targeting.target, "the creature that touches you");
});

test("a bonus to one Recall Knowledge: Twig of Knowledge and Memory's +1 status for the creature touched, spent by that check", () => {
    const twig = compileItem(item("Twig of Knowledge and Memory"));
    assert.ok(done(twig));
    assert.equal(twig.builtin, "readied-bonus");
    assert.deepEqual(twig.bonus.modifiers, [{ selector: "skill-check", type: "status", value: 1, predicate: ["action:recall-knowledge"] }]);
    assert.deepEqual([twig.bonus.recipient, twig.bonus.spend, twig.bonus.duration.expiry], ["target", ["skill-check"], "turn-end"]);
    assert.match(twig.notes[1], /used 3 times\b.*\bsets its uses to 3\.$/);
});

test("a reaction for both drinkers: Potion of Shared Life's Share Life granted on each one's Effect for the minute", () => {
    const potion = compileItem(item("Potion of Shared Life"));
    assert.ok(done(potion));
    assert.equal(potion.item.recipient, "targets");
    const [note] = potion.resolution.outcomes.success.noteEffects;
    assert.deepEqual([note.label, note.duration.value, note.duration.unit, note.reminder], ["Potion of Shared Life: Share Life", 1, "minutes", undefined]);
    assert.deepEqual(note.rules, [{ key: "GrantItem", uuid: "Compendium.pf2e.actionspf2e.Item.MY6z2b4GPhAD2Eoa", allowDuplicate: false }]);
});

test("a readied bonus's own setup as its card's lines: Psychic Warding Bracelet's tying, falling off and untying", () => {
    const bracelet = compileItem(item("Psychic Warding Bracelet"));
    assert.ok(done(bracelet));
    assert.deepEqual(bracelet.bonus.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["saving-throw", 2, ["item:trait:mental"]]]);
    assert.equal(bracelet.notes.length, 3);
    assert.match(bracelet.notes[0], /^Tying it on takes its user 10 minutes\b/);
});
