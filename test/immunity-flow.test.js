// A temporary immunity after a use, against the stand-in for Foundry (the user's answer to question 18): the reading (src/compiler/immunity.js
// — its key, time and results; what isn't one), where a plan holds to it (a save's trigger.immunity for the ability module's cards and zones,
// item.immunity for this module's own), and the item card refusing a creature still immune and giving the "Immune:" Effect after a use.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileItem } from "../src/compiler/index.js";
import { compileActivations } from "../src/compiler/permanent.js";
import { readItemImmunity } from "../src/compiler/immunity.js";
import { compileBomb } from "../src/compiler/bombs.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY_ID = "pf2e-automatic-ability-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);

// (Shared with the other flow tests: these creatures stand 310 squares down.)
const foundry = await fakeFoundry();
const user = foundry.makeActor({ id: "immune-user", name: "Salts User", owners: ["player"] });
const ally = foundry.makeActor({ id: "immune-ally", name: "Missive Ally" });
foundry.place(user, 0, 31000);
foundry.place(ally, 100, 31000);

test("the reading: its key (the item's name without its grade, an ability it names), its time and its results; what isn't one", () => {
    const read = (text, names) => readItemImmunity(text, names);
    assert.deepEqual(read("That target reduces the value of its frightened condition by 1 and becomes temporarily immune to any serene smelling salts for 1 hour.", { name: "Serene Smelling Salts" }).immunity, { scope: "target", raw: "That target reduces the value of its frightened condition by 1 and becomes temporarily immune to any serene smelling salts for 1 hour.", duration: { value: 1, unit: "hours" }, degrees: ["criticalSuccess", "success", "failure", "criticalFailure"], against: "all", slug: "serene-smelling-salts" });
    // (Every grade one key; a critical success's alone.)
    const irritant = read("A creature that critically succeeds at the save is immune to all aetheric irritants for 24 hours.", { name: "Aetheric Irritant (Major)" }).immunity;
    assert.deepEqual([irritant.slug, irritant.degrees, irritant.duration], ["aetheric-irritant", ["criticalSuccess"], { value: 24, unit: "hours" }]);
    // (An ability it names: that one's, the item's own.)
    assert.equal(read("Either way, you're temporarily immune to Guarded Fortune for 1 hour.", { name: "Lucky Silver", activation: "Guarded Fortune" }).immunity.slug, "lucky-silver-guarded-fortune");
    assert.deepEqual(read("Once it succeeds at this save, the animal is temporarily immune for 1 minute.", { name: "Animal Repellent (Lesser)" }).immunity.degrees, ["criticalSuccess", "success"]);
    // (Until its daily preparations: a day, said so.)
    assert.deepEqual(read("You're then temporarily immune to galvanic chews for 24 hours or until the next time you make your daily preparations.", { name: "Galvanic Chew" }).immunity.duration, { value: 1, unit: "days" });
    // Not one it holds to: a part of it, a time with no clock — notes.
    assert.deepEqual(read("A creature that critically fails is also Blinded until the end of your next turn and is then temporarily immune to being blinded by poison fizz for 1 hour.", { name: "Poison Fizz (Lesser)" }), { unread: ["A creature that critically fails is also Blinded until the end of your next turn and is then temporarily immune to being blinded by poison fizz for 1 hour."] });
    // (From when its effect ends: held to with after, 2026-10-26 — test/options-flow.test.js.)
    assert.deepEqual([read("You are temporarily immune to this potion for 24 hours once its effects end.", { name: "Starsong Nectar" }).immunity.after, read("You are temporarily immune to this potion for 24 hours once its effects end.", { name: "Starsong Nectar" }).immunity.duration], [true, { value: 24, unit: "hours" }]);
    // Not an immunity to the item at all: a benefit, PF2e's own Demoralize's.
    assert.equal(read("If the result is heads, you become immune to fear effects for 1 hour.", { name: "Velicarn's Cursed Coin" }), null);
    assert.equal(read("If you already have the Warning Shot feat, the target doesn't become temporarily immune to your Demoralize.", { name: "Admonishing Band" }), null);
});

test("where a plan holds to it: a save's trigger.immunity (the ability module's cards, a zone's saves), item.immunity for this module's cards; a creature in an area with no save a note", () => {
    const irritant = compileItem(source("Aetheric Irritant (Lesser)"));
    assert.deepEqual([irritant.builtin, irritant.zone.saves[0].plan.trigger.immunity.slug, irritant.zone.saves[0].plan.trigger.immunity.degrees, irritant.partial], ["zone", "aetheric-irritant", ["criticalSuccess"], undefined]);
    const repellent = compileItem(source("Animal Repellent (Lesser)"));
    assert.deepEqual([repellent.trigger.immunity.slug, repellent.trigger.immunity.duration], ["animal-repellent", { value: 1, unit: "minutes" }]);
    const salts = compileItem(source("Serene Smelling Salts"));
    assert.deepEqual([salts.item.immunity.slug, salts.trigger.immunity, salts.partial], ["serene-smelling-salts", undefined, undefined]);
    const [coin] = compileActivations(source("Fortune's Coin"));
    assert.deepEqual([coin.plan.builtin, coin.plan.item.immunity.slug], ["reroll", "fortunes-coin"]);
    const metabolizer = compileItem(source("Contagion Metabolizer (Lesser)"));
    assert.deepEqual([metabolizer.builtin, metabolizer.item.immunity.slug, metabolizer.item.immunity.duration], ["counteract", "contagion-metabolizer", { value: 1, unit: "hours" }]);
    // (Nightmare's Lament's smoke: "a creature that begins its turn in the area" — not its card's own recipient: since 2026-10-27 the zone's
    // turn-start save, which holds to it — trigger.immunity, test/cast-notes.test.js.)
    const [cloak] = compileActivations(source("Nightmare's Lament"));
    assert.deepEqual([cloak.plan.item?.immunity, cloak.plan.zone.saves[0].plan.trigger.immunity.duration, cloak.plan.partial], [undefined, { value: 1, unit: "minutes" }, undefined]);
    // (Starting once its effect ends: held to since 2026-10-26, test/options-flow.test.js.)
    assert.equal(compileItem(source("Starsong Nectar")).item.immunity.after, true);
    // (The same immunity said again in another degree's paragraph joins it: Pheromone Flare's critical success, and its failure's "After this,
    // it becomes temporarily immune for 24 hours" with the critical failure that's "As failure"; not its success, a new save every 10 minutes.)
    const flare = compileItem(source("Pheromone Flare (Lesser)"));
    // (Its fascination until the animal reaches the flare, and a new save every 10 minutes, are the GM's lines: since 2026-10-27 a one-off rule,
    // its card's lines, counted done — src/compiler/one-offs.js, the user's answer —, no longer partial.)
    assert.deepEqual([flare.zone.saves[0].plan.trigger.immunity.degrees, flare.partial, flare.decided], [["criticalSuccess", "failure", "criticalFailure"], undefined, "one-off"]);
    // (Not one to the item: Mindrender Baton's "temporarily immune to that character's attempts to remove the effect" — the ability compiler's
    // own reading of it taken off, a note.)
    const [, command] = compileActivations(source("Mindrender Baton"));
    assert.deepEqual([command.plan.trigger.immunity, command.plan.partial], [undefined, true]);
    assert.ok(command.plan.notes.some((note) => /^Another character can attempt a @Check\[diplomacy\|dc:32\b/.test(note)), command.plan.notes.join(" / "));
    // (Nor one to only part of it: Poison Fizz's "temporarily immune to being blinded by poison fizz for 1 hour" — as the whole item's, a creature
    // that only succeeded would get no card for the next fizz — taken off. Since 2026-10-27 not a note but the ability module's
    // trigger.partImmunity: the blinded part only, on a critical failure, from any poison fizz — every grade's key "poison-fizz".)
    const pop = compileItem(source("Poison Fizz (Lesser)")).ways.find((way) => /secondary/i.test(way.name)).plan;
    assert.deepEqual([pop.trigger.immunity, pop.partial, (pop.notes ?? []).length], [undefined, undefined, 0]);
    assert.deepEqual(pop.trigger.partImmunity.map(({ condition, duration, slug, against, degrees }) => ({ condition, duration, slug, against, degrees })), [{ condition: "blinded", duration: { value: 1, unit: "hours" }, slug: "poison-fizz", against: "all", degrees: ["criticalFailure"] }]);
    const greater = compileItem(source("Poison Fizz (Greater)"));
    assert.deepEqual([greater.partial, greater.ways.find((way) => /secondary/i.test(way.name)).plan.trigger.partImmunity[0].slug], [undefined, "poison-fizz"]);
    // (A bomb's save the same: Durian Bomb's "immune to the sickened condition caused by other durian bombs for 1 minute", from any result that
    // sickens it.)
    const durian = compileBomb(source("Durian Bomb (Lesser)")).item.save.plan;
    assert.deepEqual(durian.trigger.partImmunity.map(({ condition, duration, slug, against, degrees }) => ({ condition, duration, slug, against, degrees })), [{ condition: "sickened", duration: { value: 1, unit: "minutes" }, slug: "durian-bomb", against: "all", degrees: undefined }]);
});

async function use(holder, name) {
    const item = foundry.giveItem(holder, source(name));
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: holder.id }, actor: holder, token: holder.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}
// (An Apply refused: its error is the notification checked.)
async function refused(messageId, targets = []) {
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId, targets, userId: "player" });
    } catch {
        // (Checked by its notification.)
    }
    await settle();
}
const immunities = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY_ID]?.immunity);

test("Serene Smelling Salts: its use gives its drinker the ability module's \"Immune:\" Effect for an hour; while it lasts, the next salts are refused", async () => {
    const first = await use(user, "Serene Smelling Salts");
    await foundry.socket(SOCKET)({ action: "apply", messageId: first.id, userId: "player" });
    await settle();
    const [effect] = immunities(user);
    assert.deepEqual([effect?.flags[ABILITY_ID].immunity, effect?.system.duration.value, effect?.system.duration.unit], [{ slug: "serene-smelling-salts", source: null }, 1, "hours"]);
    assert.equal(first.flags[MODULE_ID].card.status, "applied");
    const second = await use(user, "Serene Smelling Salts");
    const errors = foundry.notifications.length;
    await refused(second.id);
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Salts User is still immune to Serene Smelling Salts/.test(text)), foundry.notifications.slice(errors).join(" / "));
    assert.deepEqual([second.flags[MODULE_ID].card.status, immunities(user).length], ["open", 1], "refused, no second Effect");
    // (Its time over: used again.)
    effect.isExpired = true;
    await foundry.socket(SOCKET)({ action: "apply", messageId: second.id, userId: "player" });
    await settle();
    assert.equal(second.flags[MODULE_ID].card.status, "applied");
});

test("Heartening Missives: one grade's immunity on the ally targeted blocks another grade's (\"all heartening missives\", one key)", async () => {
    const bull = await use(user, "Heartening Missive (Bull)");
    await foundry.socket(SOCKET)({ action: "apply", messageId: bull.id, targets: [ally.token.uuid], userId: "player" });
    await settle();
    assert.deepEqual(immunities(ally).map((effect) => effect.flags[ABILITY_ID].immunity.slug), ["heartening-missive"]);
    const rabbit = await use(user, "Heartening Missive (Rabbit)");
    const errors = foundry.notifications.length;
    await refused(rabbit.id, [ally.token.uuid]);
    await settle();
    assert.ok(foundry.notifications.slice(errors).some((text) => /Missive Ally is still immune/.test(text)));
    assert.equal(rabbit.flags[MODULE_ID].card.status, "open");
});

test("Iron Wine, a second cup within a day: its Weakness Effect too (plan.dose, the doses counted on the drinker); a cup a day later, not", async () => {
    const drinker = foundry.makeActor({ id: "dose-drinker", name: "Wine Drinker", owners: ["player"] });
    foundry.place(drinker, 300, 31000);
    const weakness = () => drinker.created.filter((entry) => /Iron Wine Weakness/.test(entry.name ?? ""));
    const cup = async () => {
        const card = await use(drinker, "Iron Wine");
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, userId: "player" });
        await settle();
        return card;
    };
    const first = await cup();
    assert.equal(weakness().length, 0, "not on the first cup");
    const second = await cup();
    assert.equal(weakness().length, 1, "on the second the same day");
    assert.match(second.content, /more than one dose today/);
    assert.equal(first.flags[MODULE_ID].card.status, "applied");
    // (A day on: a first cup again.)
    const before = globalThis.game.time.worldTime;
    globalThis.game.time.worldTime = before + 90000;
    try {
        await cup();
        assert.equal(weakness().length, 1, "not a day later");
    } finally {
        globalThis.game.time.worldTime = before;
    }
});
