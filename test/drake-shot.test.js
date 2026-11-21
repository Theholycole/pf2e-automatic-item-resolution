import { test } from "node:test";
import assert from "node:assert/strict";
import { activationReadied, plainStrikeNotes, weaponIdOf } from "../src/live/drake-shot.js";

test("Drake Rifle: PF2e's Drake Shot notes leave a plain Strike's damage roll, kept while Drake Shot is readied", () => {
    const fire = { text: "PF2E.SpecificRule.Equipment.DrakeRifle.Note.Fire", outcome: ["success", "criticalSuccess"] };
    const other = { text: "PF2E.SomethingElse", outcome: [] };
    assert.deepEqual(plainStrikeNotes([fire, other]), { notes: [other], dropped: [fire] });
    assert.deepEqual(plainStrikeNotes([other]).dropped, []);
    assert.equal(weaponIdOf({ options: ["item:ranged", "item:id:rifle1", "item:id:rifle1:x"] }), "rifle1");
    assert.equal(weaponIdOf({ options: [] }, { uuid: "Actor.a1.Item.rifle2" }), "rifle2");
    const shot = { weaponId: "rifle1", plan: { strike: { own: true } } };
    assert.equal(activationReadied([shot], "rifle1"), true);
    assert.equal(activationReadied([shot], "rifle9"), false, "another rifle's Strike");
    assert.equal(activationReadied([{ weaponId: null, plan: { strike: {} } }], "rifle1"), false, "a readied Strike that isn't the weapon's own");
    assert.equal(activationReadied([], "rifle1"), false);
});
