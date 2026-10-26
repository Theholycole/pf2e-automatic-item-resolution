// An item's illusion and who sees through it (src/compiler/disbelief.js, src/live/disbelief-card.js, 2026-10-25): the user's ruling for
// illusions — disbelief the GM's control, the creature's Perception against the item's DC, who saw through it kept on the card.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { createDisbeliefCard, disbeliefCardHTML, disbeliefText, withAttempt } from "../src/live/disbelief-card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};

test("Possum's Play: its illusion's disbelief — Perception DC 18 for a creature that touches it or Seeks, for up to a minute, what ends it on the card", () => {
    const plan = compileItem(item("Possum's Play"));
    assert.deepEqual(plan.disbelief, { dc: 18, statistic: "perception", when: "touches the illusion or Seeks to examine its user", lasts: { value: 1, unit: "minutes" }, ends: "Any action requiring its user to move or make noise immediately ends the illusion." });
    // (The triggering attack made nonlethal: a note Effect on its user beside its Prone, 2026-10-26 — nothing left over.)
    assert.deepEqual([plan.unread, Boolean(plan.partial), plan.resolution.outcomes.success.noteEffects.map((note) => note.label)], [[], false, ["Nonlethal attack"]]);
    assert.equal(compileItem(item("Possum's Play (Greater)")).disbelief.dc > 18, true);
    assert.equal(disbeliefText(plan.disbelief), "A creature that touches the illusion or Seeks to examine its user can try to disbelieve it: Perception DC 18");
});

test("the disbelief card: its time from now, each attempt — a success sees through it, a failure is still fooled", () => {
    const plan = compileItem(item("Possum's Play"));
    let state = createDisbeliefCard({ plan, item: { name: "Possum's Play" }, user: { name: "Rogue" }, worldTime: 100 });
    assert.equal(state.until, 160);
    state = withAttempt(state, { name: "Ogre", degree: "failure" });
    state = withAttempt(state, { name: "Wolf", degree: "criticalSuccess" });
    assert.deepEqual([state.saw, state.fooled], [["Wolf"], ["Ogre"]]);
    state = withAttempt(state, { name: "Ogre", degree: "success" });
    assert.deepEqual([state.saw, state.fooled.includes("Ogre")], [["Wolf", "Ogre"], true]);
    const html = disbeliefCardHTML(state, { canApply: true });
    assert.match(html, /Saw through it: Wolf, Ogre\./);
    assert.match(html, /data-air-action="apply">Disbelieve \(the creatures targeted\)</);
});
