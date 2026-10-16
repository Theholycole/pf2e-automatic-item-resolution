// Spellstrike Ammunition: the activation read as the module's own card, which spells fit, and the Strike that fires it
// casting the spell at the creature hit through the spell module's castFromItem (a miss loses it).

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { firedAmmoId, readSpellstrike, spellstrikeProblem } from "../src/compiler/spellstrike.js";
import { routeOf } from "../src/live/route.js";
import { plainText } from "../src/compiler/rows.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spells = readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items");
const spell = (name) => spells.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 270 squares down.)
const foundry = await fakeFoundry();
const archer = foundry.makeActor({ id: "spellstrike-archer", name: "Archer", owners: ["player"] });
const mark = foundry.makeActor({ id: "spellstrike-mark", name: "Mark" });
foundry.place(archer, 0, 27000);
foundry.place(mark, 100, 27000);

test("the reading: its activation the module's own card, its maximum rank; which spells it holds", () => {
    const [entry] = compileActivations(equipment.find((doc) => doc.name === "Spellstrike Ammunition (Type III)"));
    assert.deepEqual([entry.plan.builtin, entry.plan.spellstrike, routeOf(entry.plan, plainText(entry.activation.html))], ["spellstrike", { maxRank: 3 }, "spellstrike"]);
    assert.deepEqual(readSpellstrike(equipment.find((doc) => doc.name === "Spellstrike Ammunition (Type IX)").system.description.value), { maxRank: 10 });
    assert.equal(spellstrikeProblem(spell("Ray of Frost"), 1, 1), null);
    assert.match(spellstrikeProblem(spell("Fear"), 2, 1), /rank 1 or lower, and Fear would be rank 2/);
    assert.match(spellstrikeProblem(spell("Fireball"), 3, 3), /doesn't target a creature other than its caster/, "an area, no target");
    assert.equal(firedAmmoId(["item:ranged", "item:ammo:id:abcdefghij123456"]), "abcdefghij123456");
});

test("live: the Strike that fires the piece and hits casts its spell at the creature hit; a miss loses it", async () => {
    const spellApi = globalThis.game.modules.get("pf2e-automatic-resolution").api;
    const store = (id, attack) => {
        archer.flags[MODULE_ID] = { ...(archer.flags[MODULE_ID] ?? {}), spellstrike: { ...(archer.flags[MODULE_ID]?.spellstrike ?? {}), [id]: { spell: spell(attack ? "Ray of Frost" : "Fear"), name: attack ? "Ray of Frost" : "Fear", rank: 1, dc: 21, attack, ammoName: "Spellstrike Ammunition (Type I)" } } };
    };
    const shoot = async (id, outcome) => {
        const before = foundry.messages.length;
        await foundry.call("createChatMessage", foundry.makeMessage({ flags: { pf2e: { context: { type: "attack-roll", outcome, options: ["item:ranged", `item:ammo:id:${id}`], target: { token: mark.token.uuid } }, origin: { uuid: `${archer.uuid}.Item.bow00000000000001`, type: "weapon" } } }, speaker: { actor: archer.id }, actor: archer, token: archer.token.document }));
        await settle();
        return foundry.messages.slice(before).map((message) => message.content).join(" ");
    };
    // A spell attack, with the spell module's attackDegree: cast with the hit as its degree.
    spellApi.castFromItemOptions = ["attackDegree", "saveFirst"];
    store("strikeAmmo000001", true);
    let before = foundry.casts.length;
    assert.match(await shoot("strikeAmmo000001", "criticalSuccess"), /hits Mark: Ray of Frost is cast at it/);
    const [ray] = foundry.casts.slice(before);
    assert.deepEqual([ray.spell.name, ray.rank, ray.dc, ray.attackDegree, ray.targets.length], ["Ray of Frost", 1, 21, "criticalSuccess", 1]);
    // A save spell: no attackDegree, the caster's DC.
    store("strikeAmmo000002", false);
    before = foundry.casts.length;
    await shoot("strikeAmmo000002", "success");
    assert.deepEqual([foundry.casts.slice(before)[0].dc, "attackDegree" in foundry.casts.slice(before)[0]], [21, false]);
    // A miss: lost.
    store("strikeAmmo000003", false);
    before = foundry.casts.length;
    assert.match(await shoot("strikeAmmo000003", "failure"), /misses: Fear is lost/);
    assert.equal(foundry.casts.length, before);
    // Without the spell module's attackDegree, a spell attack is the GM's.
    delete spellApi.castFromItemOptions;
    store("strikeAmmo000004", true);
    assert.match(await shoot("strikeAmmo000004", "success"), /cast Ray of Frost at rank 1 by hand, its spell attack a hit/);
});
