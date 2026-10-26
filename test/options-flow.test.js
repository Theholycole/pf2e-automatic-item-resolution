// Named options and what follows a condition (2026-10-26): an Effect's "choose one of the following effects" as the ways card's buttons, each
// option read on its own (src/compiler/named-options.js: Heart of Sarnax, Tactician's Helm); a condition after another ends
// (src/compiler/after-ends.js, scripts/after-ends.js); a death at 0 Hit Points from its damage; Imposing Shield's worse condition a second
// button (src/compiler/instead-way.js); Skull Bomb's thrower blinded for good; Drake Shot's Prone only on the ground.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { namedOptions } from "../src/compiler/named-options.js";
import { afterEndsEffectSource, afterEndsMarkSource } from "../src/live/card.js";
import { withoutAloftProne } from "../src/live/if-target.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, name);
    return { ...found, ownerLevel: Number(found.system.level?.value) || 1 };
};
const planOf = (name, index = 0) => compileActivations(item(name))[index].plan;
const rowEffects = (plan, degree) => (plan.resolution.outcomes[degree]?.effects ?? []).map((effect) => [effect.slug, effect.value ?? null]);

test("Tactician's Helm: a button for each of its four options, not only Move It!'s Effect; the user's own moves a line of the card", () => {
    const plan = planOf("Tactician's Helm");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial), plan.trigger.frequency.per], ["ways", ["Charge!", "Move It!", "Protect!", "Re-Arm!"], false, "hour"]);
    assert.equal(plan.ways[1].plan.resolution.applications[0].uuid, "Compendium.pf2e.equipment-effects.Item.vgsV7eEYQ7W1fHqR");
    assert.deepEqual(plan.ways[0].plan.notes, ["Stride twice (its own actions)."]);
    assert.match(plan.ways[2].plan.notes[0], /^If you're wielding a shield, Stride to a space adjacent to an ally, then Raise your Shield/);
});

test("Heart of Sarnax: Bestow Vim's Quickened for a minute with its extra action a note Effect, Fatigued for an hour after; Crush Heart's save, its death at 0 Hit Points and its Slowed 2 after Stunned", () => {
    const plan = planOf("Heart of Sarnax");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial)], ["ways", ["Bestow Vim", "Crush Heart"], false]);
    const vim = plan.ways[0].plan;
    assert.deepEqual([vim.targeting.target, vim.targeting.range, rowEffects(vim, "success"), vim.resolution.outcomes.success.effects[0].duration.unit], ["1 living creature", "60 feet", [["quickened", null]], "minutes"]);
    assert.match(vim.resolution.outcomes.success.noteEffects[0].text, /^Its extra action: to Stride, Strike, or attempt an Athletics check/);
    assert.deepEqual(vim.afterEnds, [{ degree: "success", when: "quickened", then: { slug: "fatigued", value: null, duration: { mode: "fixed", value: 1, unit: "hours", expiry: "turn-start", anchor: "effect-start" } } }]);
    const crush = plan.ways[1].plan;
    assert.deepEqual([crush.resolution.kind, crush.resolution.postDamageTerminal, crush.traits.includes("death"), rowEffects(crush, "criticalFailure")], ["save", { kind: "death", threshold: 0 }, true, [["stunned", 3]]]);
    assert.deepEqual([crush.afterEnds[0].when, crush.afterEnds[0].then.slug, crush.afterEnds[0].then.value, crush.resolution.outcomes.criticalFailure.noteEffects], ["stunned", "slowed", 2, []]);
});

test("the options reader: only an Effect that offers them; each option's own degree rows", () => {
    assert.equal(namedOptions("<p><strong>Effect</strong> You gain 5 temporary Hit Points.</p>"), null);
    const read = namedOptions("<p><strong>Activate</strong> 1</p><p><strong>Effect</strong> Choose one of the following effects.</p><p><strong>Calm</strong> You heal 1d8.</p><p><strong>Storm</strong> (fire) A creature takes 2d6 fire damage with a DC 20 Reflex save.</p><p><strong>Success</strong> Half.</p>");
    assert.deepEqual(read.map((option) => [option.name, option.traits]), [["Calm", []], ["Storm", ["fire"]]]);
    assert.match(read[1].html, /<p><strong>Effect<\/strong> A creature takes 2d6 fire damage[^<]*<\/p><p>\s*<strong>Success<\/strong>/);
    assert.doesNotMatch(read[0].html, /Success/);
});

test("after a condition ends: the mark while it has it, then the next condition for its time granted by an Effect", () => {
    const entry = { when: "stunned", then: { slug: "slowed", value: 2, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" } } };
    const mark = afterEndsMarkSource(entry, { item: { name: "Heart of Sarnax (Crush Heart)" }, user: { actorUuid: "Actor.user" } });
    assert.deepEqual([mark.name, mark.flags["pf2e-automatic-item-resolution"].afterEnds, mark.system.duration.unit], ["Heart of Sarnax (Crush Heart): after stunned", entry, "unlimited"]);
    const slowed = afterEndsEffectSource(entry.then, { item: { name: "Heart of Sarnax (Crush Heart)" }, user: { actorUuid: "Actor.user" } });
    assert.deepEqual([slowed.name, slowed.system.rules[0].uuid, slowed.system.rules[0].alterations, slowed.system.duration.value, slowed.system.duration.unit], ["Heart of Sarnax (Crush Heart): Slowed 2", "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3", [{ mode: "override", property: "badge-value", value: 2 }], 1, "minutes"]);
});

test("live: the card applied marks a stunned creature; Stunned's deletion gives it Slowed 2, the mark used up", async () => {
    const { markAfterEnds, followAfterEnds } = await import("../scripts/after-ends.js");
    const saved = { game: globalThis.game, fromUuid: globalThis.fromUuid };
    const items = [];
    let stunned = true;
    const foe = { uuid: "Actor.foe", hasCondition: (slug) => slug === "stunned" && stunned, get itemTypes() { return { effect: items }; }, createEmbeddedDocuments: async (type, data) => data.map((one) => { const doc = { ...one, delete: async () => items.splice(items.indexOf(doc), 1) }; items.push(doc); return doc; }) };
    globalThis.game = { user: { isGM: true }, time: { worldTime: 3 }, combat: null, modules: new Map() };
    globalThis.fromUuid = async (uuid) => (uuid === "Actor.foe" ? foe : null);
    try {
        const crush = planOf("Heart of Sarnax").ways[1].plan;
        await markAfterEnds({ state: { plan: crush, source: { actorUuid: "Actor.user" }, ability: { name: "Heart of Sarnax (Crush Heart)" } }, targets: [{ actorUuid: "Actor.foe", degree: "criticalFailure" }, { actorUuid: "Actor.foe", degree: "failure" }] });
        assert.equal(items.length, 1);
        assert.deepEqual(await followAfterEnds(foe, "stunned"), []);
        stunned = false;
        const [slowed] = await followAfterEnds(foe, "stunned");
        assert.deepEqual([items.length, slowed.name, slowed.system.rules[0].alterations[0].value], [1, "Heart of Sarnax (Crush Heart): Slowed 2", 2]);
    } finally {
        Object.assign(globalThis, saved);
    }
});

test("Imposing Shield: Frightened 2, or Frightened 3 when the Shield Block took all the damage — two buttons, no GM line", () => {
    const plan = planOf("Imposing Shield");
    assert.deepEqual([plan.builtin, plan.ways.map((way) => way.name), Boolean(plan.partial)], ["ways", ["As it is", "The Shield Block reduced the incoming damage to 0"], false]);
    assert.deepEqual([rowEffects(plan.ways[0].plan, "success"), rowEffects(plan.ways[1].plan, "success"), plan.ways[1].plan.resolution.outcomes.success.manualInstructions ?? null], [[["frightened", 2]], [["frightened", 3]], null]);
});

test("Skull Bomb: its thrower Blinded for good as it's thrown; Drake Shot's Prone only for a target on the ground", () => {
    const bomb = compileItem(item("Skull Bomb"));
    assert.deepEqual([bomb.userEffects, Boolean(bomb.partial)], [[{ slug: "blinded", value: null, duration: null }], false]);
    const shot = planOf("Drake Rifle (Fire)");
    assert.deepEqual([shot.strike.groundedProne, shot.strike.notes, Boolean(shot.partial)], [true, [], false]);
    assert.deepEqual([rowEffects(withoutAloftProne(shot, 10), "success"), rowEffects(withoutAloftProne(shot, 0), "success")], [[], [["prone", null]]]);
});

test("after its effect ends: Starsong Nectar's 24 hours from its Effect's end; Captivating Bauble's once the fascination ends, only the immune left out at once", () => {
    const nectar = compileItem(item("Starsong Nectar"));
    assert.deepEqual([nectar.item.immunity.after, nectar.item.immunity.duration, Boolean(nectar.partial)], [true, { value: 24, unit: "hours" }, false]);
    const bauble = compileItem(item("Captivating Bauble"));
    assert.deepEqual([bauble.trigger.immunity.degrees, bauble.afterEnds.map((entry) => [entry.degree, entry.when, entry.then.immunity.slug]), Boolean(bauble.partial)], [["after-end"], [["failure", "fascinated", "captivating-bauble"], ["criticalFailure", "fascinated", "captivating-bauble"]], false]);
    assert.match(afterEndsMarkSource(bauble.afterEnds[0], { item: { name: "Captivating Bauble" } }).system.description.value, /When it(?:&#39;|')s no longer fascinated, it becomes temporarily immune to it for 24 hours/);
});

test("Celestial Peachwood Sword: a failed save destroys the undead, its user's backlash 1d6 void per level; Horns of Naraga's undead user healed by the void damage taken", () => {
    const sword = planOf("Celestial Peachwood Sword");
    assert.deepEqual([sword.resolution.outcomes.failure.terminal, sword.backlash, Boolean(sword.partial)], [{ kind: "death" }, { degrees: ["failure", "criticalFailure"], perLevel: "1d6", type: "void" }, false]);
    const horns = planOf("Horns of Naraga");
    assert.deepEqual([horns.drain, Boolean(horns.partial), horns.resolution.outcomes.success.manualInstructions ?? null], [{ fraction: 1, type: "void", duration: null, heal: true, immediate: true, onlyIf: "undead" }, false, null]);
});

test("live: a card's own damage heals its undead user by what the creature lost; a living user nothing", async () => {
    const { before, usePlans } = await import("../scripts/drain.js");
    const saved = { game: globalThis.game, ChatMessage: globalThis.ChatMessage, fromUuidSync: globalThis.fromUuidSync };
    const updates = [];
    globalThis.game = { user: { isGM: true }, users: [], modules: new Map() };
    globalThis.ChatMessage = { create: async (data) => data, getSpeaker: () => ({}) };
    const foe = { uuid: "Actor.foe", name: "Foe", system: { attributes: { hp: { value: 60, temp: 0 } } }, itemTypes: { effect: [] } };
    globalThis.fromUuidSync = (uuid) => (uuid === "Actor.foe" ? foe : null);
    try {
        usePlans(() => [{ plan: planOf("Horns of Naraga") }]);
        const horns = (traits) => ({ uuid: `Item.horns-${traits.join("")}`, name: "Horns of Naraga", system: { description: { value: "x" } }, actor: { name: "Wearer", system: { traits: { value: traits }, attributes: { hp: { value: 10, max: 100 } } }, update: async (data) => updates.push(data) } });
        const damage = { instances: [{ type: "void", persistent: false, options: {}, total: 18 }] };
        const after = before(foe, { damage, item: horns(["undead"]) });
        foe.system.attributes.hp.value = 42;
        await after();
        assert.deepEqual(updates, [{ "system.attributes.hp.value": 28 }]);
        assert.equal(before(foe, { damage, item: horns(["humanoid"]) }), null);
    } finally {
        Object.assign(globalThis, saved);
    }
});
