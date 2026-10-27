// Changes to a Strike, 2026-10-27 (docs/needs.md "Changes to a Strike"): riders on a hit, damage added, ammunition and weapon effects — and
// the words that only looked like a Strike.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { needsOf } from "../src/compiler/needs.js";
import { routeOf } from "../src/live/route.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const doc = equipment.find((entry) => entry.name === name);
    return { ...doc, ownerLevel: Number(doc.system.level?.value) || 1 };
};
const activation = (name, which = null) => compileActivations(item(name)).find((entry) => entry.activation.name === which).plan;
const left = (plan) => [...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];

test("not a Strike: the verb (\"strike two links together\") and a feather token's firing Strike — their objects a line of the card, done", () => {
    assert.deepEqual(needsOf({ kind: "activation", result: "none", text: "Activate Strike from a ranged weapon When activated, this feather transforms permanently into a 20-foot-long wooden ladder." }), ["objects"]);
    assert.deepEqual(needsOf({ kind: "activation", result: "none", text: "Effect You aim the chime at a lock you want to open and strike the chime." }), ["objects"]);
    assert.ok(needsOf({ kind: "activation", result: "none", text: "Effect Make a melee Strike against the creature." }).includes("strike"));
    for (const name of ["Feather Token (Ladder) (Ammunition)", "Feather Token (Chest) (Ammunition)", "Feather Token (Tree) (Ammunition)"]) {
        const plan = activation(name);
        assert.deepEqual([plan.decided, plan.partial, routeOf(plan)], ["card-line", undefined, "item"], name);
        assert.doesNotMatch(plan.notes[0], /^Activate/);
    }
    assert.match(activation("Feather Token (Ladder) (Ammunition)").notes[0], /^When activated, this feather transforms permanently into a 20-foot-long wooden ladder\.$/);
    for (const name of ["Ouroboros Flail", "Ouroboros Flail (Greater)", "Ouroboros Flail (Major)"]) {
        const links = activation(name, "Infinite Links");
        assert.deepEqual([links.decided, links.partial, left(links).length], ["card-line", undefined, 1], name);
        assert.match(links.notes[0], /severs up to a \d+-foot loop of usable chain/);
    }
});

test("a hit's note Effect holds its words, so they're not the Strike card's notes too: Magekiller Bullet's week, Wormhole Shot's minute with its later use as a point of origin", () => {
    const magekiller = activation("Magekiller Bullet");
    assert.deepEqual([magekiller.partial, magekiller.strike.notes], [undefined, []]);
    assert.match(magekiller.resolution.outcomes.success.noteEffects[0].text, /Casts a Spell, it must attempt a @Check\[flat\|dc:11\]\. On a failure, it takes 2d12 force damage\. This curse can be counteracted/);
    const wormhole = activation("Wormhole Shot");
    const [note] = wormhole.resolution.outcomes.success.noteEffects;
    assert.deepEqual([wormhole.partial, wormhole.strike.notes, note.duration.value, note.duration.unit], [undefined, [], 1, "minutes"]);
    assert.match(note.text, /Once during the wormhole shot's duration, if you're within 60 feet of it, you can use it as the point of origin for a spell or ranged attack, .* After being used this way, it quickly dissolves into black dust\.$/);
    // (Conduit Shot's own rules beyond its note stay its notes.)
    assert.equal(activation("Conduit Shot (Lesser)").partial, true);
});

test("Hardness its damage ignores: Shatterpoint Ammunition's 4, 8 and 12 — PF2e subtracts no creature's Hardness, so the Strike card says it", async () => {
    const { strikeLines } = await import("../src/live/strike-card.js");
    for (const [name, most, dice] of [["Shatterpoint Ammunition", 4, 1], ["Shatterpoint Ammunition (Greater)", 8, 2], ["Shatterpoint Ammunition (Major)", 12, 3]]) {
        const plan = activation(name);
        assert.deepEqual([plan.partial, plan.strike.ignoresHardness, plan.strike.notes, plan.strike.damage.map((entry) => `${entry.diceNumber}${entry.dieSize} ${entry.category} ${entry.damageType}`)], [undefined, most, [], [`${dice}d8 persistent sonic`]], name);
        assert.ok(strikeLines(plan).includes(`Its damage ignores the target's Hardness if that's ${most} or lower (a higher Hardness still applies)`));
    }
});
