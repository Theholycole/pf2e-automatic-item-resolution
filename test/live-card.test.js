import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { compileItem, spellEffectIndex } from "../src/compiler/index.js";
import { abilityState, applicationFor, cardHTML, createItemCard, DRINKER_ID, effectSource, previewLines, recipientOf, rolledHealing, rollFormula, USER_ID } from "../src/live/card.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const equipmentEffects = readDocuments(path.join(PACKS, "equipment-effects")).filter((doc) => doc.collection === "items");
const spellEffectItems = readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items");
const spellEffects = spellEffectIndex(spellEffectItems);
const item = (name) => equipment.find((doc) => doc.name === name);
const plan = (name) => compileItem(item(name), { spellEffects });

const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);

const valeros = { actorUuid: "Actor.valeros", tokenUuid: "Scene.s.Token.valeros", name: "Valeros" };
const kyra = { actorUuid: "Actor.kyra", tokenUuid: "Scene.s.Token.kyra", name: "Kyra <the cleric>" };
const card = (name, options = {}) => createItemCard({ plan: plan(name), item: { name, uuid: "Actor.valeros.Item.x", sourceId: null, slug: item(name)?.system?.slug }, user: valeros, drinkers: [kyra], ...options });

test("a drinker item offers the user first, then the creatures next to them", () => {
    const state = card("Healing Potion (Minor)", { rolled: { total: 6, formula: "1d8", kind: "healing", messageId: "m" } });
    assert.deepEqual(state.drinkers.map((entry) => entry.name), ["Valeros", "Kyra <the cleric>"]);
    assert.equal(state.drinker, 0);
    assert.equal(recipientOf(state), valeros);
    assert.equal(recipientOf({ ...state, drinker: 1 }), kyra);
    // The user isn't listed twice.
    assert.equal(createItemCard({ plan: plan("Healing Potion (Minor)"), item: { name: "x" }, user: valeros, drinkers: [valeros, kyra] }).drinkers.length, 2);
    // An item for its user only has no drinker choice.
    const user = createItemCard({ plan: { item: { recipient: "user" }, resolution: { kind: "effect", applications: [] } }, item: { name: "Talisman" }, user: valeros, drinkers: [kyra] });
    assert.equal(user.drinker, null);
    assert.equal(recipientOf(user), valeros);
});

test("the ability module's applyChange gets the user as source and the drinker as its one target", () => {
    const state = { ...card("Elixir of Life (Minor)"), drinker: 1 };
    assert.deepEqual(abilityState(state), {
        plan: state.plan,
        ability: { name: "Elixir of Life (Minor)", uuid: "Actor.valeros.Item.x" },
        source: { actorUuid: "Actor.valeros", tokenUuid: "Scene.s.Token.valeros", name: "Valeros" },
        targets: [{ id: DRINKER_ID, actorUuid: "Actor.kyra", tokenUuid: "Scene.s.Token.kyra", name: "Kyra <the cleric>" }]
    });
});

test("PF2e's healing roll is the one the core uses, once", () => {
    const state = card("Elixir of Life (Minor)", { rolled: { total: 5, formula: "1d6", kind: "healing", messageId: "m" } });
    const answer = rolledHealing(state);
    assert.equal(answer({}), 5);
    assert.equal(answer({}), null, "a second request is rolled");
    assert.equal(rolledHealing(card("Elixir of Life (Minor)"))({}), null, "no PF2e roll: rolled");
    // Through the core: the drinker is healed by PF2e's 5 and gets the Effect.
    const result = registry.resolveSync(state.plan, { caster: { id: USER_ID }, targets: [{ id: DRINKER_ID }], id: (creature) => creature.id, allied: () => true, voidHealing: () => false }, { damage: rolledHealing(state) });
    assert.deepEqual(result.changes.map((change) => [change.op, change.target, change.amount ?? change.effect?.label]), [["heal", DRINKER_ID, 5], ["effect", DRINKER_ID, "Effect: Elixir of Life"]]);
    // Undead aren't healed by it (void healing), but still get the Effect.
    const undead = registry.resolveSync(state.plan, { caster: { id: USER_ID }, targets: [{ id: DRINKER_ID }], id: (creature) => creature.id, allied: () => true, voidHealing: () => true }, { damage: rolledHealing({ ...state }) });
    assert.deepEqual(undead.changes.map((change) => change.op), ["effect"]);
});

test("a roll formula from the core's damage instance", () => {
    assert.equal(rollFormula({ dice: [{ count: 1, die: 8, factor: 1 }], constant: 0 }), "1d8");
    assert.equal(rollFormula({ dice: [{ count: 8, die: 6, factor: 1 }], constant: 21 }), "8d6 + 21");
    assert.equal(rollFormula({ dice: [{ count: 1, die: 6, factor: 2 }], constant: 0 }), "2*1d6");
    assert.equal(rollFormula({ dice: [], constant: 0 }), "0");
});

test("what Apply will do", () => {
    assert.deepEqual(previewLines(card("Elixir of Life (Minor)", { rolled: { total: 5, formula: "1d6", kind: "healing" } })), ["Heals 5 Hit Points (PF2e's roll of 1d6)", "Effect: Elixir of Life"]);
    assert.deepEqual(previewLines(card("Oak Potion")), ["Spell Effect: Oaken Resilience (rank 2, 10 minutes)", "You gain the effects of a 2nd-rank Oaken Resilience for 10 minutes."]);
    assert.deepEqual(previewLines(card("Potion of Quickness")), ["Spell Effect: Haste (1 minute)"]);
});

test("an Effect shared by every grade is made for the grade used, with no prompt", () => {
    const template = equipmentEffects.find((doc) => doc.name === "Effect: Elixir of Life");
    const minor = item("Elixir of Life (Minor)");
    const made = effectSource(template, { item: { slug: minor.system.slug, uuid: "Actor.valeros.Item.x" }, user: valeros, worldTime: 1234, initiative: 18 });
    const choice = made.system.rules.find((rule) => rule.key === "ChoiceSet");
    assert.equal(choice.selection, "Compendium.pf2e.equipment-srd.Item.hDLbR56Id2OtU318", "the minor grade");
    assert.equal(made._id, undefined);
    assert.deepEqual(made.system.start, { value: 1234, initiative: 18 });
    assert.deepEqual(made.system.context.origin, { ...(template.system.context?.origin ?? {}), actor: "Actor.valeros", token: "Scene.s.Token.valeros", item: "Actor.valeros.Item.x" });
    assert.equal(template.system.rules.find((rule) => rule.key === "ChoiceSet").selection, undefined, "the template is untouched");
    // By its compendium source too (an item renamed or reslugged on the sheet).
    const major = item("Elixir of Life (Major)");
    const bySource = effectSource(template, { item: { slug: "my-elixir", sourceId: `Compendium.pf2e.equipment-srd.Item.${major._id}` } });
    assert.equal(bySource.system.rules.find((rule) => rule.key === "ChoiceSet").selection, `Compendium.pf2e.equipment-srd.Item.${major._id}`);
});

test("a spell's Effect is made at the item's rank and for its time", () => {
    const oak = card("Oak Potion");
    const change = { op: "effect", target: DRINKER_ID, effect: { kind: "native", uuid: oak.plan.resolution.applications[0].uuid, label: "Spell Effect: Oaken Resilience" } };
    const application = applicationFor(oak.plan, change);
    assert.equal(application.level, 2);
    const template = spellEffectItems.find((doc) => doc.name === "Spell Effect: Oaken Resilience");
    const made = effectSource(template, { application, item: oak.item, user: valeros });
    assert.equal(made.system.level.value, 2, "its Resistance reads @item.level");
    assert.deepEqual([made.system.duration.value, made.system.duration.unit], [10, "minutes"]);
    assert.equal(applicationFor(oak.plan, { effect: { uuid: "Compendium.pf2e.other.Item.none" } }), null);
});

test("the card: a drinker choice and Apply for those who may, names escaped, results once applied", () => {
    const state = card("Healing Potion (Minor)", { rolled: { total: 6, formula: "1d8", kind: "healing" } });
    const html = cardHTML(state, { canApply: true });
    assert.match(html, /<select data-air-field="drinker">/);
    assert.match(html, /Kyra &lt;the cleric&gt;/);
    assert.doesNotMatch(html, /<the cleric>/);
    assert.match(html, /data-air-action="apply"/);
    assert.match(html, /Heals 6 Hit Points/);
    const watching = cardHTML(state, { canApply: false });
    assert.doesNotMatch(watching, /data-air-action|<select/);
    assert.match(watching, /Drinker: Valeros/);
    const applied = cardHTML({ ...state, status: "applied", drinker: 1, results: ["Kyra regains 6 Hit Points"] }, { canApply: true });
    assert.doesNotMatch(applied, /data-air-action|<select|Heals 6/);
    assert.match(applied, /Drinker: Kyra &lt;the cleric&gt;/);
    assert.match(applied, /Kyra regains 6 Hit Points/);
});
