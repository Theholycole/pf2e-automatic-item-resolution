// A talisman used with a free action or with 1 action (src/compiler/action-ways.js, 2026-10-26): Golden Liberator's Feather on the ways card.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};

test("Golden Liberator's Feather: the free action's wings (fly Speed 50 to the turn's end, its AC bonus a note Effect), or the 1 action's wings and then the buffet's basic Fortitude save at the enemies targeted", () => {
    const feather = compileItem(item("Golden Liberator's Feather"));
    assert.deepEqual([routeOf(feather), feather.ways.map((way) => way.name)], ["ways", ["Free action: the wings", "1 action: the wings and the buffet"]]);
    const [free, buffet] = feather.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(free), free.item.speeds, free.resolution.outcomes.success.noteEffects[0].label, free.again], ["item", [{ type: "fly", value: 50, duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } }], "+4 AC against reactions to its movement", undefined]);
    const save = buffet.again.plan;
    assert.deepEqual([routeOf(save), save.resolution.check.statistic, save.resolution.check.basic, save.resolution.check.against.value, save.resolution.sharedDamage.components[0].formula, save.targeting.target], ["save", "fortitude", true, 41, "8d8[spirit]", "each adjacent enemy"]);
});
