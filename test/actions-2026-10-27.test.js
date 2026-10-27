// The actions group of 2026-10-27 (src/compiler/user-actions.js and the readers it sits beside): actions and feats for the user, choices on the
// card, objects and the item itself — each read on PF2e's own items.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { NOTES_CHECKED } from "../src/compiler/notes-checked.js";
import { ONE_OFFS } from "../src/compiler/one-offs.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const done = (plan) => Boolean(plan) && !plan.partial && !plan.noteOnly && plan.builtin !== "no-effect";
const notes = (plan) => plan.resolution.outcomes.success.noteEffects;

test("an armor trait's action not needed while the cloak is red: Bastion of the Inheritor's entrench melee bonus for the minute, its white cloak's bonus off", () => {
    const bastion = activation("Bastion of the Inheritor");
    assert.ok(done(bastion));
    const [note] = notes(bastion);
    assert.equal(notes(bastion).length, 1);
    assert.deepEqual([note.label, note.duration.value, note.duration.unit], ["Cloak red", 1, "minutes"]);
    assert.deepEqual(note.rules.map((rule) => [rule.key, rule.selector ?? rule.selectors, rule.type ?? null, rule.value ?? null, rule.predicate ?? null]), [["FlatModifier", "ac", "circumstance", 1, ["item:melee"]], ["AdjustModifier", ["diplomacy"], null, null, null]]);
    assert.equal(note.rules[1].slug, "bastion-of-the-inheritor");
    assert.ok(note.rules[1].suppress);
});

test("a rule PF2e can't play on a note Effect for its time: Clockwork Shield's extra reaction, Vital Earth's air (the environment module's word)", () => {
    for (const name of ["Clockwork Shield", "Clockwork Shield (Greater)"]) {
        const shield = activation(name);
        assert.ok(done(shield), name);
        assert.deepEqual(notes(shield).map((note) => [note.label, note.duration.value, note.duration.unit]), [["Extra reaction", 1, "minutes"]]);
        assert.match(notes(shield)[0].text, /only to Shield Block\.$/);
        assert.deepEqual(shield.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    }
    const earth = compileItem(item("Vital Earth"));
    assert.ok(done(earth));
    const [note] = notes(earth);
    assert.deepEqual([note.duration.value, note.duration.unit], [24, "hours"]);
    // (The environment module's breath tracker: an item named with "doesn't need to breathe" on the creature.)
    assert.match(`Vital Earth: ${note.label}`.toLowerCase(), /doesn't need to breathe/);
    assert.match(note.text, /\+1 item bonus to that Medicine check\.$/);
});

test("its user's own action, an object's or the map's: checked and its card's lines — Rope of Climbing, Immovable Rod, Philosopher's Stone, Watchful Portrait, Accolade Robe's Review", () => {
    for (const name of ["Rope of Climbing (Lesser)", "Rope of Climbing (Moderate)", "Rope of Climbing (Greater)", "Immovable Rod"]) {
        const plan = activation(name);
        assert.ok(done(plan) && plan.decided === "checked", name);
        assert.ok(NOTES_CHECKED.has(name));
    }
    assert.match(activation("Immovable Rod").notes[0], /Force Open the rod/);
    for (const [name, which] of [["Accolade Robe", "Review"], ["Accolade Robe (Greater)", "Review"]]) {
        const review = activation(name, which);
        assert.ok(done(review) && review.decided === "checked", name);
        assert.equal(review.source.name, `${name}: Review`);
        assert.match(review.notes[0], /, then Recall Knowledge\./);
    }
    // (The GM's no-effect read as nothing: its card's lines, its own source kept.)
    const stone = compileItem(item("Philosopher's Stone"));
    assert.ok(done(stone) && stone.decided === "checked");
    assert.equal(stone.source.name, "Philosopher's Stone");
    assert.match(stone.notes[0], /Force Open action \(DC 35\)/);
    const portrait = compileItem(item("Watchful Portrait"));
    assert.ok(done(portrait) && portrait.decided === "checked");
});

test("one-offs, their card's lines: Remote Trigger's bombs, Gunner's Bandolier's runes", () => {
    assert.ok(ONE_OFFS.has("Remote Trigger") && ONE_OFFS.has("Gunner's Bandolier"));
    const trigger = activation("Remote Trigger");
    assert.ok(done(trigger) && trigger.decided === "one-off");
    assert.match(trigger.notes[0], /splash damage to any creature in its square\.$/);
    for (const entry of compileActivations(item("Gunner's Bandolier"))) assert.ok(done(entry.plan) && entry.plan.decided === "one-off");
});

test("an instrument pulled into its user's hands: Instrument Harness's Ready to Play — the objects card's hand, no reactions its line", () => {
    const ready = activation("Instrument Harness", "Ready to Play");
    assert.ok(done(ready));
    assert.equal(ready.builtin, "objects");
    assert.deepEqual(ready.objects, { op: "hand" });
    assert.deepEqual(ready.notes, ["Drawing it this way doesn't trigger reactions."]);
    assert.deepEqual(ready.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
});
