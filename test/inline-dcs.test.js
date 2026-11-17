// PF2e's own links to an item's saves under the "Item DCs from their user" setting (scripts/item-dcs.js inlineDCFor, 2026-11-17).

import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineDCFor, isOwnSaveWords } from "../scripts/item-dcs.js";

const dcs = { class: 24, spell: 27 };

test("a save at the item's DC: raised to the higher of its user's class and spell DCs", () => {
    assert.deepEqual(inlineDCFor({ check: "reflex", dc: "19", before: "Each creature in the area must attempt a ", dcs }), { dc: 27, which: "spell", from: 19 });
    assert.deepEqual(inlineDCFor({ check: "fortitude", dc: "19", before: "The target must succeed at a ", dcs: { class: 24, spell: null } }), { dc: 24, which: "class", from: 19 });
    // (Potent Poisoner's +4 on top.)
    assert.equal(inlineDCFor({ check: "fortitude", dc: "18", before: "Saving Throw ", dcs, plus: 4 }).dc, 31);
});

test("left as printed: a higher printed DC, a skill check, its user's own save, a user with neither DC", () => {
    assert.equal(inlineDCFor({ check: "will", dc: "30", before: "", dcs }), null);
    assert.equal(inlineDCFor({ check: "athletics", dc: "15", before: "", dcs }), null);
    assert.equal(inlineDCFor({ check: "fortitude", dc: "20", before: "When you drink this elixir, you must attempt a ", dcs }), null);
    assert.equal(inlineDCFor({ check: "will", dc: "20", before: "Drawback The drinker attempts a ", dcs }), null);
    assert.equal(inlineDCFor({ check: "reflex", dc: "19", before: "", dcs: {} }), null);
});

test("whose save: the item's targets, not its user", () => {
    assert.equal(isOwnSaveWords("You throw the stone. Each creature in a 10-foot burst must attempt a "), false);
    assert.equal(isOwnSaveWords("Upon drinking, you attempt a "), true);
    assert.equal(isOwnSaveWords("If you fail, you must succeed at a "), true);
    assert.equal(isOwnSaveWords("You and each creature within 30 feet must attempt a "), false);
});
