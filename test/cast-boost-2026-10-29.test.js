// A check that changes its user's last cast (2026-10-29, Starless Scope: src/compiler/cast-boost.js, src/live/cast-boost.js, scripts/cast-boost.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { castBoostCardHTML, createCastBoostCard, rowWords, spellDC } from "../src/live/cast-boost.js";
import { lastCastOf } from "../scripts/cast-boost.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const scope = () => {
    const doc = equipment.find((entry) => entry.name === "Starless Scope");
    return compileActivations({ ...doc, ownerLevel: 9 })[0].plan;
};

test("Starless Scope: its reaction the cast-boost card — Religion against the spell's DC, each degree's row", () => {
    const plan = scope();
    assert.deepEqual([routeOf(plan), plan.castBoost.skill, plan.trigger.frequency.max, plan.partial], ["cast-boost", "religion", 1, undefined]);
    assert.deepEqual(plan.castBoost.rows, {
        criticalSuccess: { attack: 2, save: -2, refund: { maxRank: 5 } },
        success: { attack: 1, save: -1 },
        failure: { flat: { dc: 11, shatter: true } },
        criticalFailure: { lose: true, shatter: true }
    });
});

test("a spell's DC by rank and rarity, a row in words, its user's last cast from the messages", () => {
    assert.deepEqual([spellDC(1), spellDC(3), spellDC(5, "uncommon"), spellDC(10, "rare"), spellDC(4, "unique")], [15, 20, 28, 44, 33]);
    assert.equal(rowWords({ attack: 2, save: -2, refund: { maxRank: 5 } }), "+2 status to its attack rolls; -2 status to a foe's saves against it; its slot not spent (rank 5 or lower)");
    assert.equal(rowWords({}), "the spell cast normally");
    const actor = { id: "A" };
    const cast = (id, name, rank, who = "A") => ({ id, actor: { id: who }, flags: { pf2e: { casting: { id: "entry" }, origin: { type: "spell", castRank: rank } } }, item: { name, slug: name.toLowerCase().replace(/ /g, "-"), rarity: "common" } });
    const messages = [cast("m1", "Fireball", 3), { id: "m2", actor: { id: "A" }, flags: { pf2e: { context: { type: "attack-roll" } } } }, cast("m3", "Heal", 4, "B")];
    assert.deepEqual(lastCastOf(actor, messages), { messageId: "m1", name: "Fireball", rank: 3, slug: "fireball", rarity: "common", dc: 20 });
    assert.equal(lastCastOf({ id: "C" }, messages), null);
    const html = castBoostCardHTML(createCastBoostCard({ plan: scope(), item: { name: "Starless Scope" }, user: { name: "Seer" }, cast: lastCastOf(actor, messages) }), { canApply: true });
    assert.ok(html.includes("Fireball (rank 3, DC 20)") && html.includes("Roll Religion"));
});
