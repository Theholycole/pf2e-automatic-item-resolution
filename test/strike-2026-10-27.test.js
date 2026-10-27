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

test("one-off Strike rules, each its own mechanism (src/compiler/one-offs.js): their cards' lines, counted done and kept to build later — Condensed Mana, Dagger of Eternal Sleep, Fate Shot, Shuln Fang Katar's Piercing Critical", async () => {
    const { oneOff } = await import("../src/compiler/one-offs.js");
    const mana = compileItem(item("Condensed Mana"));
    assert.deepEqual([mana.decided, mana.partial, routeOf(mana)], ["one-off", undefined, "item"]);
    assert.match(mana.notes[0], /^Condensed mana is a crystal vial/);
    for (const [name, which] of [["Dagger of Eternal Sleep", null], ["Fate Shot", null], ["Shuln Fang Katar", "Piercing Critical"]]) {
        const plan = activation(name, which);
        assert.deepEqual([plan.decided, plan.partial, routeOf(plan)], ["one-off", undefined, "item"], name);
        assert.doesNotMatch(plan.notes[0], /^Activate\b/);
        assert.ok(oneOff(plan.source.name), name);
    }
});

test("a Strike card's notes that are its user's to do or PF2e's own rule again, its lines: Fairy Bullet's corner and flat check; Serpent's Lash's Reposition distances, the action's own", async () => {
    const { strikeLines } = await import("../src/live/strike-card.js");
    const fairy = activation("Fairy Bullet");
    assert.deepEqual([fairy.partial, fairy.strike.notes, fairy.strike.cast.name, fairy.strike.cast.dc], [undefined, [], "Revealing Light", 23]);
    assert.ok(strikeLines(fairy).some((line) => /^You choose which corner of the target's space/.test(line)));
    const lash = activation("Serpent's Lash", "Slither Strike");
    assert.deepEqual([lash.partial, lash.strike.follow.action.slug, lash.strike.follow.notes], [undefined, "reposition", undefined]);
});

test("Mindlock Shot: the ways card's pick of Stride or Strike, each the next ranged Strike whose hit compels the creature's next action (two on a critical hit) — a note Effect on it until the end of its next turn", () => {
    const shot = activation("Mindlock Shot");
    assert.deepEqual([shot.builtin, shot.partial, routeOf(shot), shot.ways.map((way) => way.name)], ["ways", undefined, "ways", ["Stride", "Strike"]]);
    const [stride, strike] = shot.ways.map((way) => way.plan);
    assert.deepEqual([routeOf(stride), stride.strike.ammo, stride.trigger.event], ["strike", true, "strike"]);
    // (Its words in two pieces, as a run of eight of them is also a third-party module's.)
    assert.match(stride.resolution.outcomes.success.noteEffects[0].text, /^It must use its first action/);
    assert.match(stride.resolution.outcomes.success.noteEffects[0].text, /\bStride \(or Step instead, if that serves it better\)/);
    assert.match(strike.resolution.outcomes.criticalSuccess.noteEffects[0].text, /^It must use its next 2 actions to Strike;/);
    assert.deepEqual(strike.resolution.outcomes.success.noteEffects[0].duration, { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" });
});

test("Garrote Shot: its 2d12 persistent slashing PF2e's own rule, its critical hit's garrote on the throat a note Effect on the creature for as long as that bleed of slashing lasts (the Strike card's)", async () => {
    const { strikeLines } = await import("../src/live/strike-card.js");
    const garrote = activation("Garrote Shot");
    assert.deepEqual([garrote.builtin, garrote.partial, routeOf(garrote), garrote.strike.ammo, garrote.strike.notes], [undefined, undefined, "strike", true, []]);
    const [note] = garrote.resolution.outcomes.criticalSuccess.noteEffects;
    assert.deepEqual([note.whilePersistent, garrote.resolution.outcomes.success.noteEffects ?? []], ["slashing", []]);
    assert.match(note.text, /can't breathe until its persistent slashing damage ends/);
    assert.ok(strikeLines(garrote).includes("PF2e's own rules add 2d12 persistent slashing damage"));
    assert.ok(strikeLines(garrote).some((line) => /severs the appendage/.test(line)));
});

test("ammunition that only lands somewhere, its range increment where it lands (no change to the Strike): Burrowing Bolt's tunnel a line of its card, Scouting Arrow's Seek from where it lands whispered", () => {
    for (const name of ["Burrowing Bolt", "Burrowing Bolt (Greater)"]) {
        const bolt = activation(name);
        assert.deepEqual([bolt.decided, bolt.partial, routeOf(bolt)], ["card-line", undefined, "item"], name);
        assert.match(bolt.notes[0], /tunnels into the surface silently and leaves a hole behind it/);
    }
    const arrow = activation("Scouting Arrow");
    assert.deepEqual([arrow.builtin, arrow.decided], ["whisper", "information"]);
    assert.match(arrow.whisper.text, /can Seek as though they were at the point of impact/);
});

test("Minotaur Chair: against a prone foe, +1 circumstance damage per weapon die and the wounding rune's bleed 1d12 (3d6 on a critical hit) in place of its own — PF2e's rules on the readied Strike, predicated on target:condition:prone", async () => {
    const { strikeRules, strikeLines } = await import("../src/live/strike-card.js");
    const chair = activation("Minotaur Chair");
    assert.deepEqual([chair.partial, chair.strike.notes, chair.strike.volley.each], [undefined, [], "enemy"]);
    const rules = strikeRules(chair, { label: "Minotaur Chair" });
    const prone = ["target:condition:prone"];
    assert.deepEqual(rules.filter((rule) => rule.key === "DamageDice").map((rule) => [rule.diceNumber, rule.dieSize, rule.category, rule.damageType, rule.critical, rule.predicate]), [[1, "d12", "persistent", "bleed", false, prone], [3, "d6", "persistent", "bleed", true, prone]]);
    assert.deepEqual(rules.filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.type, rule.value, rule.predicate]), [["circumstance", "@weapon.system.damage.dice", prone]]);
    assert.deepEqual(rules.filter((rule) => rule.key === "DamageAlteration").map((rule) => [rule.slug, rule.property, rule.value, rule.predicate]), [["wounding", "dice-number", 0, prone]]);
    assert.ok(strikeLines(chair).includes("+3d6 persistent bleed damage against a prone target on a critical hit"));
});

test("granted for a while: Potion of Grounding's Divert Lightning (PF2e's action on its minute's note Effect), Falconsight Eye's second range increment free of penalty (PF2e's ignore-range-penalty:2)", () => {
    const potion = compileItem(item("Potion of Grounding"));
    const [note] = potion.resolution.outcomes.success.noteEffects;
    assert.deepEqual([potion.noteOnly, potion.partial, note.duration.value, note.duration.unit, note.rules], [undefined, undefined, 1, "minutes", [{ key: "GrantItem", uuid: "Compendium.pf2e.actionspf2e.Item.s2RrhZx1f1X4YnYV", allowDuplicate: false }]]);
    const eye = activation("Falconsight Eye");
    const [sight] = eye.resolution.outcomes.success.noteEffects;
    assert.deepEqual([eye.noteOnly, sight.duration.value, sight.rules], [undefined, 1, [{ key: "RollOption", domain: "ranged-attack-roll", option: "ignore-range-penalty:2" }]]);
    assert.match(sight.text, /^You can close your eyes as a free action/);
});

test("others' own reactions, lines of the card: Singing Bowl of the Versatile Stance's stance change; Chainbreaker's Liberating Strike, its ally's Escape after the hit", () => {
    const bowl = activation("Singing Bowl of the Versatile Stance");
    assert.deepEqual([bowl.partial, routeOf(bowl), bowl.notes.length], [undefined, "item", 2]);
    for (const name of ["Chainbreaker", "Chainbreaker (Greater)"]) {
        const strike = activation(name, "Liberating Strike");
        assert.deepEqual([strike.partial, routeOf(strike), strike.strike.own, strike.item.activation.frequency.per], [undefined, "strike", true, "day"], name);
        assert.match(strike.strike.lines[0], /^If it hits and deals damage, one grabbed or restrained ally within 60 feet of the target can use a reaction to Escape/);
    }
});

test("Horned Hand Rests (both): the ways card's 1 action, the legchair's next Strike this turn with the extra force dice and the critical hit's push, and 2 actions, the beam's save", () => {
    for (const [name, dice, feet] of [["Horned Hand Rests", 2, 5], ["Horned Hand Rests (Greater)", 3, 10]]) {
        const rests = activation(name);
        assert.deepEqual([rests.builtin, rests.partial, rests.ways.map((way) => way.name)], ["ways", undefined, ["1 action: momentum", "2 actions: the beam"]], name);
        const [momentum, beam] = rests.ways.map((way) => way.plan);
        assert.deepEqual([routeOf(momentum), momentum.strike.damage[0].diceNumber, momentum.strike.damage[0].damageType, momentum.resolution.outcomes.criticalSuccess.forcedMovement.distance, momentum.activation.time], ["strike", dice, "force", feet, "1"], name);
        assert.deepEqual([beam.resolution.check.statistic, beam.activation.time, beam.notes, beam.partial], ["fortitude", "2", undefined, undefined], name);
    }
});

test("Cauthooj Bagpipes' Throw Song: a failed save turns the creature's Strike on another its user picks (or −2 with none in reach) — a note Effect on it for its turn", () => {
    const song = activation("Cauthooj Bagpipes", "Throw Song");
    assert.equal(song.partial, undefined);
    for (const degree of ["failure", "criticalFailure"]) {
        const row = song.resolution.outcomes[degree];
        assert.deepEqual([row.manualInstructions, row.noteEffects[0].duration], [undefined, { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" }]);
        assert.match(row.noteEffects[0].text, /goes to another creature within its reach, picked by whoever used the item; with no other creature in reach, it takes a –2 penalty/);
    }
});

test("Undead Compendium: the ways card's pick of the undead, each its +2 to attack rolls (target:trait) and saves (origin:trait) against that kind alone; a lich, with no trait of its own, PF2e's toggle on its note Effect", () => {
    const book = activation("Undead Compendium");
    assert.deepEqual([book.builtin, book.partial, book.ways.map((way) => way.name)], ["ways", undefined, ["Ghost", "Ghoul", "Graveknight", "Lich", "Mummy", "Vampire", "Wight", "Zombie"]]);
    const row = (kind) => book.ways.find((way) => way.name === kind).plan.resolution.outcomes.success;
    assert.deepEqual(row("Vampire").modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["attack-roll", 2, ["target:trait:vampire"]], ["saving-throw", 2, ["origin:trait:vampire"]]]);
    assert.deepEqual([row("Lich").modifiers[0].predicate, row("Lich").noteEffects[0].rules[0].option, row("Lich").noteEffects[0].rules[0].toggleable], [["target:trait:undead", "undead-compendium:lich"], "undead-compendium:lich", true]);
    assert.equal(book.ways[0].plan.unread, undefined);
});

test("Silhouette Cloak (both activations): its resistance the card's Effect with the light trait among its exceptions, the rest of the shadow form a note Effect with PF2e's BaseSpeed land and climb 40 — the reaction's until the end of the turn", () => {
    const [form, fold] = compileActivations(item("Silhouette Cloak")).map((entry) => entry.plan);
    for (const plan of [form, fold]) {
        assert.deepEqual([plan.partial, plan.unread, plan.notes, plan.item.resist[0].exceptions, plan.item.resist[0].doubleVs], [undefined, undefined, undefined, ["force", "ghost-touch", "light"], ["non-magical"]]);
        const [note] = plan.resolution.outcomes.success.noteEffects;
        assert.deepEqual(note.rules, [{ key: "BaseSpeed", selector: "land", value: 40 }, { key: "BaseSpeed", selector: "climb", value: 40 }]);
        assert.match(note.text, /Other creatures can't attempt Strength-based skill checks against you\. You can't use actions except Climb, Step, or Stride/);
    }
    assert.deepEqual([form.resolution.outcomes.success.noteEffects[0].duration, fold.resolution.outcomes.success.noteEffects[0].duration.expiry], [null, "turn-end"]);
});

test("the Impossible rune: its Strike at a creature beyond reach or range, PF2e's ignore-range-penalty, its penalties unticked by its user; Spined Shield's spine a one-off", async () => {
    const { strikeLines, strikeRules } = await import("../src/live/strike-card.js");
    const strike = activation("Impossible");
    assert.deepEqual([strike.partial, routeOf(strike), strike.strike.options], [undefined, "strike", ["ignore-range-penalty"]]);
    assert.deepEqual(strikeRules(strike).filter((rule) => rule.key === "RollOption").map((rule) => rule.option), ["ignore-range-penalty"]);
    assert.ok(strikeLines(strike).includes("No range increment penalty on it"));
    assert.deepEqual([activation("Spined Shield").decided, activation("Spined Shield").partial], ["one-off", undefined]);
});

test("Chaplain's Cudgel's Bow to a Higher Power: PF2e's own toggle flipped by each use (its holy or unholy trait on the Strikes), the deity's weapon's shape and the spell's damage toggle lines of the card", () => {
    const bow = activation("Chaplain's Cudgel", "Bow to a Higher Power");
    assert.deepEqual([bow.builtin, bow.partial, bow.modes[0].plan], ["modes", undefined, { builtin: "roll-option", option: "chaplains-cudgel:bow-to-a-higher-power", value: "flip" }]);
    assert.match(bow.notes[0], /^It takes the shape of your deity's favored weapon/);
    assert.match(bow.notes[1], /tick its "cast a two-action spell" toggle/);
});

test("Morphing Weapon's Reshape: the ways card's benefit for the Strike — more reach, one of three damage types, PF2e's Disarm after the hit, a status bonus of the weapon's dice", async () => {
    const { strikeRules } = await import("../src/live/strike-card.js");
    const reshape = compileActivations(item("Morphing Weapon"))[0].plan;
    assert.deepEqual([reshape.builtin, reshape.partial, reshape.ways.map((way) => way.name)], ["ways", undefined, ["Reach", "Shift: bludgeoning", "Shift: piercing", "Shift: slashing", "Take", "Weigh"]]);
    const way = (name) => reshape.ways.find((entry) => entry.name === name).plan;
    assert.deepEqual([way("Reach").strike.reach, way("Shift: piercing").strike.alteration, way("Take").strike.follow.action.slug], [{ more: 5 }, "piercing", "disarm"]);
    assert.deepEqual(strikeRules(way("Weigh")).filter((rule) => rule.key === "FlatModifier").map((rule) => [rule.type, rule.value]), [["status", "@weapon.system.damage.dice"]]);
    assert.deepEqual(strikeRules(way("Shift: piercing")).filter((rule) => rule.key === "DamageAlteration").map((rule) => rule.value), ["piercing"]);
});

test("Highhelm War Shields: the critical hit's impaling Grabbed until it Escapes (its wielder's Athletics DC), PF2e's persistent bleed of the blades' dice, its can't-end and Escape DC on a note Effect while it bleeds", () => {
    for (const [grade, dice, dc] of [["Lesser", 2, 25], ["Moderate", 3, 31], ["Greater", 4, 43]]) {
        const plan = activation(`Highhelm War Shield (${grade})`);
        const row = plan.resolution.outcomes.success;
        assert.deepEqual([plan.partial, row.manualInstructions, row.damage.formulas[0].formula, row.effects[0].duration], [undefined, undefined, `${dice}[persistent,bleed]`, { mode: "until-escape", escape: { ownerDC: "athletics" } }], grade);
        assert.deepEqual([row.noteEffects[0].whilePersistent, new RegExp(`DC ${dc} once`).test(row.noteEffects[0].text)], ["bleed", true], grade);
        assert.equal(plan.notes.length, 2);
    }
});

test("Extinguishing Ball: no damage, its critical hit ending all persistent acid and fire and its hit one (strike.recover), each degree but a critical failure PF2e's lower recovery DC on a note Effect — its failure's row played too", async () => {
    const { riderFor } = await import("../src/live/strike-card.js");
    const ball = activation("Extinguishing Ball");
    assert.deepEqual([ball.partial, ball.noteOnly, routeOf(ball), ball.strike.noDamage, ball.strike.recover], [undefined, undefined, "strike", true, { criticalSuccess: { types: ["acid", "fire"], ends: true }, success: { types: ["acid", "fire"], ends: true, one: true } }]);
    const rule = { key: "ItemAlteration", itemType: "condition", mode: "downgrade", property: "pd-recovery-dc", value: 10, predicate: [{ or: ["item:damage:type:acid", "item:damage:type:fire"] }] };
    for (const degree of ["criticalSuccess", "success", "failure"]) assert.deepEqual(ball.resolution.outcomes[degree].noteEffects[0].rules, [rule], degree);
    assert.deepEqual([ball.resolution.outcomes.criticalSuccess.noteEffects[0].duration.value, ball.resolution.outcomes.failure.noteEffects[0].duration.anchor], [1, "target-turn"]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((outcome) => riderFor(ball, { ranged: true, outcome })), ["hit", "hit", "failure", "spend"]);
});

test("Decanter of Endless Water's geyser: Hydraulic Push at the creature its stream is aimed at, at its own +15 spell attack — \"subjecting it to the effects of\" a cast", async () => {
    const { spellIndex } = await import("../src/compiler/index.js");
    const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
    const geyser = compileActivations(item("Decanter of Endless Water"), { spells })[2].plan;
    assert.deepEqual([geyser.builtin, geyser.partial, geyser.spell.name, geyser.attack, routeOf(geyser)], ["cast-spell", undefined, "Hydraulic Push", 15, "cast"]);
});

test("Iron Cube: its two-handed weapon's free hand a line; with Slam Down, the Trip card's prone damage at the Strike's weapon's die when bigger than d6 (withFeatDie)", async () => {
    const { withFeatDie } = await import("../src/live/strike-card.js");
    const cube = compileItem(item("Iron Cube"));
    assert.deepEqual([cube.partial, cube.strike.follow.notes, cube.strike.follow.featDie], [undefined, undefined, { slug: "slam-down", name: "Slam Down", atLeast: "d6" }]);
    assert.ok(cube.strike.lines.some((line) => /Trip needs no free hand/.test(line)));
    const formula = (follow) => follow.action.damage.success.resolution.sharedDamage.components[0].formula;
    assert.equal(formula(withFeatDie(cube.strike.follow, { hasFeat: true, weaponDie: "d12" })), "2d12");
    assert.equal(formula(withFeatDie(cube.strike.follow, { hasFeat: false, weaponDie: "d12" })), "2d6");
    assert.equal(formula(withFeatDie(cube.strike.follow, { hasFeat: true, weaponDie: "d4" })), "2d6");
});

test("Mamlambo Scale's Luminous Lure: the zone on its wearer for the light's minute (PF2e's Effect: Luminous Lure its own), each creature's Will save at its turn's start with the hour's immunity; the lure and the first Strike's Off-Guard note Effects, no GM lines", () => {
    const lure = activation("Mamlambo Scale", "Luminous Lure");
    assert.deepEqual([lure.builtin, lure.partial, routeOf(lure), lure.zone.area, lure.zone.centre, lure.ownEffect.label], ["zone", undefined, "zone", { type: "emanation", value: 20 }, "self", "Effect: Luminous Lure"]);
    const [save] = lure.zone.saves;
    assert.deepEqual([save.when, save.plan.trigger.event, save.plan.trigger.immunity.duration, save.plan.resolution.check.against.value], [["start"], "zone", { value: 1, unit: "hours" }, 26]);
    const rows = save.plan.resolution.outcomes;
    assert.deepEqual([rows.criticalFailure.effects.map((effect) => effect.slug), rows.criticalFailure.noteEffects.map((note) => note.label), rows.failure.manualInstructions, rows.criticalFailure.manualInstructions], [["fascinated"], ["Lured by the light", "Lured: Off-Guard"], undefined, undefined]);
});

test("Portable Seal (all three): a placed zone whose save is for summoned creatures entering it (zone only.traits), a disrupted move a note Effect, the round's immunity tracked; a summoned creature's Strike still the GM's (partial)", () => {
    for (const grade of ["Lesser", "Moderate", "Major"]) {
        const seal = compileItem(item(`Portable Seal (${grade})`));
        assert.deepEqual([seal.builtin, seal.partial, seal.zone.centre, seal.zone.saves[0].when, seal.zone.saves[0].only], ["zone", true, "placed", ["enter"], { traits: ["summoned"] }], grade);
        const rows = seal.zone.saves[0].plan.resolution.outcomes;
        assert.deepEqual([rows.failure.noteEffects[0].label, rows.success.manualInstructions, seal.zone.saves[0].plan.trigger.immunity.degrees], ["Disrupted", undefined, ["criticalSuccess", "success", "failure"]], grade);
    }
});
