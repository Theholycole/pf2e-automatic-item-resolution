// A curse on a creature's spellcasting (2026-10-29, Magekiller Bullet: src/compiler/cast-curse.js, scripts/cast-curse.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { castCurseOf, castCurseOption } from "../src/compiler/cast-curse.js";
import { castCursesOf } from "../scripts/cast-curse.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");

test("Magekiller Bullet: its hit's note Effect for the week, its flat check DC 11 and 2d12 force at each cast named on it", () => {
    const doc = equipment.find((entry) => entry.name === "Magekiller Bullet");
    const plan = compileActivations({ ...doc, ownerLevel: 16 })[0].plan;
    for (const degree of ["success", "criticalSuccess"]) {
        const [note] = plan.resolution.outcomes[degree].noteEffects;
        assert.deepEqual([note.duration.value, note.duration.unit, note.rules], [7, "days", [{ key: "RollOption", option: "air-cast-curse:11:2d12:force" }]], degree);
    }
    assert.equal(plan.partial, undefined);
});

test("the curse's option read back, and a creature's curses its live Effects' only", () => {
    assert.deepEqual(castCurseOf(castCurseOption({ dc: 11, formula: "2d12", type: "force" })), { dc: 11, formula: "2d12", type: "force" });
    assert.equal(castCurseOf("air-ends-on:hostile"), null);
    const effect = (name, expired) => ({ name, isExpired: expired, system: { rules: [{ key: "RollOption", option: "air-cast-curse:11:2d12:force" }] } });
    const actor = { itemTypes: { effect: [effect("Cursed", false), effect("Over", true), { name: "Plain", system: { rules: [] } }] } };
    assert.deepEqual(castCursesOf(actor).map((curse) => [curse.effect.name, curse.dc, curse.formula, curse.type]), [["Cursed", 11, "2d12", "force"]]);
});
