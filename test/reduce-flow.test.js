// An item that lowers a condition its user has, against the stand-in for Foundry: the reading (Lion Badge's "reduce the
// value of your frightened condition by 1"), what isn't one, and the item card lowering it with PF2e's decreaseCondition.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readReductions } from "../src/compiler/reduce.js";
import { routeOf } from "../src/live/route.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: this creature stands 180 squares down.)
const foundry = await fakeFoundry();
const scout = foundry.makeActor({ id: "reduce-scout", name: "Scout", owners: ["player"] });
foundry.place(scout, 0, 18000);

async function use(item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: scout.id }, actor: scout, token: scout.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("the reading: the user's conditions it lowers, and what isn't one", () => {
    const badge = compileItem(source("Lion Badge"));
    assert.equal(routeOf(badge), "item");
    assert.deepEqual(badge.item.reduce, [{ slug: "frightened", by: 1 }]);
    // An activation: Coin of Comfort's "You reduce your Frightened condition by 1".
    assert.deepEqual(compileActivations(source("Coin of Comfort"))[0].plan.item.reduce, [{ slug: "frightened", by: 1 }]);
    // What else it says, as a note: Cinnamon Nostalgia Bun's flat check.
    assert.match(compileItem(source("Cinnamon Nostalgia Bun")).notes.join(" "), /flat check/);
    // Not one: a later Secondary Effect (Ginger Chew), "if successful" (Moon Radish Soup's counteract), an area, a passive.
    assert.equal(compileItem(source("Ginger Chew")).item.reduce, undefined);
    assert.equal(compileItem(source("Moon Radish Soup")).item.reduce, undefined);
    assert.deepEqual(readReductions("Whenever you become Frightened, reduce your frightened value by 1."), []);
    assert.deepEqual(readReductions("Success The target reduces its slowed condition by 1."), [], "a save's degree row");
    assert.deepEqual(readReductions("They can't reduce the value of their sickened condition below 1."), []);
    assert.deepEqual(readReductions("Creatures in the cone who are Frightened reduce the value of their frightened condition by 1 at the beginning of each turn they start in the area of the cone."), []);
});

test("the reading: several conditions, one of several, to 0, and another creature's", () => {
    // "You and each ally in a 5-foot emanation" (Fearless Sash), "the ally's" (Banner of Common Cause), "that creature's"
    // (Fearcutter): the creatures the presser targets.
    assert.deepEqual(compileActivations(source("Fearless Sash"))[0].plan.item.reduce, [{ slug: "frightened", by: 1, who: "targets" }]);
    assert.deepEqual(compileActivations(source("Banner of Common Cause")).find((entry) => entry.activation.name === "Stand Firm").plan.item.reduce, [{ slug: "frightened", by: 1, who: "targets" }]);
    assert.deepEqual(readReductions("Reduce that creature's frightened value by 1."), [{ slug: "frightened", by: 1, who: "targets" }]);
    // On yourself or another: the drinker's (Serene Smelling Salts' "that target reduces the value of its frightened condition by 1").
    assert.deepEqual(compileItem(source("Serene Smelling Salts")).item.reduce, [{ slug: "frightened", by: 1 }]);
    // Each of a list (Sun Orchid Poultice), one of several (Golden-Souled Yang Na), to 0 (Unending Youth), "by up to 2".
    assert.deepEqual(compileItem(source("Sun Orchid Poultice")).item.reduce.map((entry) => [entry.slug, entry.by]), [["clumsy", 2], ["drained", 2], ["enfeebled", 2]]);
    assert.deepEqual(compileActivations(source("Golden-Souled Yang Na"))[0].plan.item.reduce, [{ choose: ["clumsy", "enfeebled", "frightened", "stupefied"], by: 1 }]);
    assert.deepEqual(compileActivations(source("Unending Youth"))[0].plan.item.reduce, [{ slug: "doomed", by: "all" }]);
    assert.deepEqual(readReductions("You gain a +2 status bonus to saves against void effects for 10 minutes and reduce your wounded condition by up to 2."), [{ slug: "wounded", by: 2 }]);
});

test("Fearless Sash: Apply lowers frightened on each creature targeted; with none targeted, nothing is applied", async () => {
    const ally = foundry.makeActor({ id: "reduce-ally", name: "Ally", owners: ["player"] });
    foundry.place(ally, 100, 18000);
    scout.conditions.set("frightened", 2);
    ally.conditions.set("frightened", 1);
    const sash = foundry.giveItem(scout, source("Fearless Sash"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: sash.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /Lowers frightened by 1 on each creature you target/);
    // (The GM's client says why: "Target the creatures it helps first, then press Apply.")
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [] });
    await settle();
    assert.deepEqual([card.flags[MODULE_ID].card.status, scout.conditions.get("frightened")], ["open", 2]);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", targets: [scout.token.uuid, ally.token.uuid] });
    await settle();
    assert.deepEqual([scout.conditions.get("frightened"), ally.conditions.has("frightened")], [1, false]);
    assert.match(card.content, /Scout&#39;s frightened lowered to 1/);
    assert.match(card.content, /Ally is no longer frightened/);
    scout.conditions.delete("frightened");
});

test("Golden-Souled Yang Na: the card picks one of four conditions; Unending Youth ends doomed", async () => {
    scout.conditions.set("enfeebled", 2);
    scout.conditions.set("clumsy", 1);
    const tattoo = foundry.giveItem(scout, source("Golden-Souled Yang Na"));
    let count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: tattoo.uuid, activation: 0, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /data-air-field="reduceChoice"/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player", reduceChoice: 1 });
    await settle();
    assert.deepEqual([scout.conditions.get("enfeebled"), scout.conditions.get("clumsy")], [1, 1], "enfeebled lowered, clumsy untouched");
    scout.conditions.delete("enfeebled");
    scout.conditions.delete("clumsy");
    scout.conditions.set("doomed", 3);
    const youth = foundry.giveItem(scout, source("Unending Youth"));
    count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: youth.uuid, activation: 0, userId: "player" });
    await settle();
    const ends = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(ends.content, /Ends doomed/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: ends.id, userId: "player" });
    await settle();
    assert.equal(scout.conditions.has("doomed"), false);
});

test("Lion Badge: Apply lowers the user's frightened by 1; with none, the card says so", async () => {
    scout.conditions.set("frightened", 2);
    const card = await use(foundry.giveItem(scout, source("Lion Badge")));
    assert.equal(card.flags[MODULE_ID].card.kind, "item");
    assert.match(card.content, /Lowers frightened by 1/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
    await settle();
    assert.equal(scout.conditions.get("frightened"), 1);
    assert.match(card.content, /Scout&#39;s frightened lowered to 1/);
    scout.conditions.delete("frightened");
    scout.conditions.delete("sickened");
    const poultice = await use(foundry.giveItem(scout, source("Pepper Poultice")));
    await foundry.socket(SOCKET)({ action: "apply", messageId: poultice.id, userId: "player" });
    await settle();
    assert.match(poultice.content, /isn&#39;t sickened: nothing to lower/);
});

test("Instinct Crown: PF2e's Effect: Rage with 10 more temporary Hit Points, for a creature that can Rage and isn't raging", async () => {
    const [rage] = compileActivations(source("Instinct Crown (Animal)"));
    assert.deepEqual([rage.plan.resolution.applications[0].label, rage.plan.resolution.applications[0].tempHP], ["Effect: Rage", 10]);
    const crown = foundry.giveItem(scout, source("Instinct Crown (Animal)"));
    const activate = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: crown.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const rages = () => scout.itemTypes.effect.filter((effect) => effect.name === "Effect: Rage");
    // No Rage action: no Rage.
    let card = await activate();
    assert.match(card.content, /has no Rage action/);
    assert.equal(rages().length, 0);
    // A barbarian: the Effect, its TempHP raised.
    scout.created.push({ type: "action", slug: "rage", id: "rage-action", name: "Rage" });
    card = await activate();
    const [effect] = rages();
    assert.ok(effect, "Effect: Rage");
    assert.deepEqual(effect.system.rules.filter((rule) => rule.key === "TempHP").map((rule) => rule.value), ["(@actor.flags.system.rageTempHP) + 10"]);
    // Raging already: none again.
    card = await activate();
    assert.match(card.content, /already raging/);
    assert.equal(rages().length, 1);
});

test("a reduction's own notes once on the card (Preordained Spear)", async () => {
    const { previewLines } = await import("../src/live/card.js");
    const [delay] = compileActivations(source("Preordained Spear")).filter((entry) => entry.plan?.item?.reduce);
    const lines = previewLines({ plan: delay.plan, rolled: null });
    assert.equal(lines.filter((line) => /regain 1 Mythic Point/.test(line)).length, 1);
});

test("quickened until the end of the rage: only while raging, an Effect granting it, gone when the Rage ends (the module's own wording)", async () => {
    const { readUntilRage } = await import("../src/compiler/rage-time.js");
    const html = "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (concentrate)</p><p><strong>Effect</strong> Your fury quickens. You become quickened until the end of your rage. You can use the extra action only to Stride or Strike.</p>";
    assert.deepEqual(readUntilRage("Effect You become quickened until the end of your rage. You can use the extra action only to Stride or Strike."), { conditions: [{ slug: "quickened", value: null }], notes: ["You can use the extra action only to Stride or Strike."] });
    // (A creature of its own: the Instinct Crown test left the scout raging.)
    const raging = foundry.makeActor({ id: "reduce-rager", name: "Rager", owners: ["player"] });
    foundry.place(raging, 100, 18000);
    const crown = foundry.giveItem(raging, { _id: "testRageCrown001", type: "equipment", name: "Test Crown", img: null, system: { category: null, traits: { value: [] }, level: { value: 4 }, description: { value: html } } });
    const [entry] = compileActivations(crown.toObject());
    assert.deepEqual(entry.plan.item.untilRage, { conditions: [{ slug: "quickened", value: null }] });
    globalThis.game.pf2e.ConditionManager = { getCondition: (slug) => ({ uuid: `Compendium.pf2e.conditionitems.Item.${slug}` }) };
    const activate = async () => {
        const count = foundry.messages.length;
        await foundry.socket(SOCKET)({ action: "activate", itemUuid: crown.uuid, activation: 0, userId: "player" });
        await settle();
        const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    // Not raging: nothing.
    let card = await activate();
    assert.match(card.content, /isn&#39;t raging/);
    // Raging: the Effect granting quickened, for at most a minute.
    const rage = { type: "effect", slug: "effect-rage", name: "Effect: Rage", id: "rage-effect" };
    raging.created.push(rage);
    card = await activate();
    const effect = raging.created.find((item) => item.flags?.[MODULE_ID]?.untilRage);
    assert.deepEqual([effect.system.rules, effect.system.duration.value, effect.system.duration.unit], [[{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.quickened" }], 1, "minutes"]);
    // The Rage ends: it goes too.
    raging.created = raging.created.filter((item) => item !== rage);
    await foundry.call("deleteItem", { ...rage, actor: raging });
    await settle();
    assert.equal(raging.created.some((item) => item.flags?.[MODULE_ID]?.untilRage), false);
    delete globalThis.game.pf2e.ConditionManager;
});

test("Trusty Helmet's \"The value of your stupefied condition is decreased by 1\": its user's stupefied, lowered", () => {
    const helmet = compileActivations(source("Trusty Helmet"))[0].plan;
    assert.deepEqual(helmet.item.reduce, [{ slug: "stupefied", by: 1 }]);
    assert.deepEqual(readReductions("The value of your clumsy condition is reduced by 2."), [{ slug: "clumsy", by: 2 }]);
});

test("Cayden's Tankard: the conditions it ends on its user and on any creatures targeted (none needed)", async () => {
    const tankard = compileActivations(source("Cayden's Tankard"))[1].plan;
    const slugs = ["controlled", "grabbed", "immobilized", "paralyzed", "restrained", "slowed"];
    assert.deepEqual(tankard.item.reduce.filter((entry) => !entry.who).map((entry) => [entry.slug, entry.by]), slugs.map((slug) => [slug, "all"]));
    assert.deepEqual(tankard.item.reduce.filter((entry) => entry.who === "targets").map((entry) => [entry.slug, entry.optional]), slugs.map((slug) => [slug, true]));
    const { reductionText } = await import("../src/live/card.js");
    assert.equal(reductionText({ slug: "grabbed", by: "all", who: "targets", optional: true }), "Ends grabbed on each creature you target (if any)");
});

test("Cayden's Tankard live: a condition with no value (grabbed) ended on its user with nobody targeted; the list's absent ones left off", async () => {
    scout.conditions.set("grabbed", null);
    scout.conditions.set("slowed", 1);
    const tankard = foundry.giveItem(scout, source("Cayden's Tankard"));
    const count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: tankard.uuid, activation: 1, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "item");
    assert.match(card.content, /Target the other creatures it helps, if any/);
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, targets: [], userId: "player" });
    await settle();
    assert.deepEqual([scout.hasCondition("grabbed"), scout.hasCondition("slowed")], [false, false]);
    const results = card.flags[MODULE_ID].card.results;
    assert.deepEqual(results.filter((line) => /grabbed|slowed/.test(line)), ["Scout is no longer grabbed", "Scout is no longer slowed"]);
    assert.equal(results.some((line) => /nothing to lower/.test(line)), false);
});

test("Copper Penny stands its user up (prone ended), the rest a note; Possum's Play drops its user Prone", () => {
    const penny = compileItem(source("Copper Penny"));
    assert.deepEqual([penny.item.reduce, penny.notes], [[{ slug: "prone", by: "all" }], ["When you Activate it, you Stand and can't be knocked prone again on the current turn."]]);
    const possum = compileItem(source("Possum's Play"));
    assert.deepEqual(possum.resolution.outcomes.success.effects, [{ kind: "condition", slug: "prone", value: null, duration: null }]);
    assert.ok(possum.unread.some((sentence) => /nonlethal trait/.test(sentence)));
});

test("Core Bugle's Reveille: prone ended on its user and on the allies targeted (each Stands)", () => {
    const [reveille] = compileActivations(source("Core Bugle"));
    assert.deepEqual(reveille.plan.item.reduce, [{ slug: "prone", by: "all" }, { slug: "prone", by: "all", who: "targets", optional: true }]);
});
