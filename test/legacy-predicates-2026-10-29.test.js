// Old-form predicates rewritten into PF2e's (2026-10-29, the user's answer to question 9): src/live/legacy-predicates.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { isOldPredicate, predicateFromOld, rulesWithoutOldPredicates } from "../src/live/legacy-predicates.js";

const MODULES = `${process.env.HOME}/.local/share/FoundryVTT/Data/modules`;

// Every item of a module's packs (none when it isn't installed).
function itemsOf(module) {
    const dir = path.join(MODULES, module, "packs");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((pack) => {
        try {
            return readDocuments(path.join(dir, pack)).filter((doc) => Array.isArray(doc.system?.rules));
        } catch {
            return [];
        }
    });
}
const hasOld = (value) => (Array.isArray(value) ? value.some(hasOld) : value && typeof value === "object" ? Object.entries(value).some(([key, entry]) => (["predicate", "disabledIf"].includes(key) && isOldPredicate(entry)) || hasOld(entry)) : false);

test("an old-form predicate: all's statements as they are, any's an or, not's a not (one) or a nor (several)", () => {
    assert.deepEqual(predicateFromOld({ all: ["electricity"], not: ["runebrandActive"] }), ["electricity", { not: "runebrandActive" }]);
    assert.deepEqual(predicateFromOld({ all: ["a", "b"], any: ["c", "d"], not: ["e", "f"] }), ["a", "b", { or: ["c", "d"] }, { nor: ["e", "f"] }]);
    assert.deepEqual(predicateFromOld({ any: ["c"] }), ["c"]);
    assert.equal(isOldPredicate(["a"]), false);
    assert.equal(isOldPredicate({ or: ["a"] }), false);
    assert.equal(isOldPredicate({}), false);
});

test("a rule's predicates rewritten wherever they are — its own, a choice's, a RollOption's disabledIf —, PF2e's own forms left alone", () => {
    const rules = [
        { key: "FlatModifier", selector: "saving-throw", value: 1, predicate: { all: ["electricity"], not: ["runebrandActive"] } },
        { key: "ChoiceSet", choices: [{ value: "x", predicate: { all: ["self:trait:elf"] } }, { value: "y", predicate: ["self:trait:human"] }] },
        { key: "RollOption", option: "on", toggleable: true, disabledIf: { not: ["armor"] } },
        { key: "Note", predicate: [{ or: ["a", "b"] }] }
    ];
    const fixed = rulesWithoutOldPredicates(rules);
    assert.deepEqual(fixed[0].predicate, ["electricity", { not: "runebrandActive" }]);
    assert.deepEqual(fixed[1].choices.map((choice) => choice.predicate), [["self:trait:elf"], ["self:trait:human"]]);
    assert.deepEqual(fixed[2].disabledIf, [{ not: "armor" }]);
    assert.equal(fixed[3], rules[3]);
    assert.equal(rulesWithoutOldPredicates([{ key: "Note", predicate: ["a"] }]), null);
    assert.equal(rulesWithoutOldPredicates(undefined), null);
});

test("Battlezoo's four items with old-form predicates: each rewritten, none left in the old form (when installed)", (t) => {
    const items = [...itemsOf("battlezoo-bestiary-pf2e"), ...itemsOf("battlezoo-ancestries-dungeons-pf2e")];
    if (!items.length) return t.skip("Battlezoo's modules aren't installed");
    const old = items.filter((item) => hasOld(item.system.rules));
    assert.ok(old.length >= 2, `${old.length} items`);
    for (const item of old) {
        const fixed = rulesWithoutOldPredicates(item.system.rules);
        assert.ok(fixed && !hasOld(fixed), item.name);
        assert.equal(fixed.length, item.system.rules.length, item.name);
    }
    const hide = old.find((item) => item.name === "Runebranded Hide");
    if (hide) assert.deepEqual(rulesWithoutOldPredicates(hide.system.rules).find((rule) => rule.key === "FlatModifier").predicate, ["electricity", { not: "runebrandActive" }]);
});
