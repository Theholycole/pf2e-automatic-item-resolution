// Items that cast a spell PF2e has no Effect for, against the stand-in for Foundry: the card, and Apply asking the
// spell module (api.castFromItem) to cast it on the drinker, on the user, or at the presser's targets.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { fakeFoundry, settle } from "./support/fake-foundry.mjs";
import { compileActivations } from "../src/compiler/permanent.js";
import { compileItem } from "../src/compiler/index.js";
import { castWordsPlan, readCastWords, spellIndex } from "../src/compiler/cast-words.js";
import { castRequest, createCastCard, needsTargets } from "../src/live/cast-card.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const SOCKET = `module.${MODULE_ID}`;
const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const source = (name) => equipment.find((doc) => doc.name === name);
const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
const activationOf = (name, which = 0) => compileActivations(source(name), { spells })[which];
const castOf = (name, which = 0) => activationOf(name, which).plan;

// (Shared with the other flow tests: these creatures stand 60 squares down.)
const foundry = await fakeFoundry();
const sneak = foundry.makeActor({ id: "cast-sneak", name: "Sneak", owners: ["player"] });
const buddy = foundry.makeActor({ id: "cast-buddy", name: "Buddy" });
foundry.place(sneak, 0, 6000);
foundry.place(buddy, 100, 6000);

async function use(actor, item) {
    const data = item.toObject();
    const message = foundry.makeMessage({ flags: { pf2e: { origin: { uuid: item.uuid, sourceId: data._stats.compendiumSource, type: "consumable" } } }, speaker: { actor: actor.id }, actor, token: actor.token.document });
    await foundry.call("createChatMessage", message);
    await settle();
    return foundry.messages[foundry.messages.indexOf(message) + 1];
}

test("an invisibility potion fed to the creature next to the user: the spell module casts it on that drinker", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const state = card.flags[MODULE_ID].card;
    assert.equal(state.kind, "cast");
    assert.deepEqual(state.drinkers.map((entry) => entry.name), ["Sneak", "Buddy"]);
    assert.match(card.content, /Invisibility \(rank 2\)/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 1, userId: "player" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.equal(cast.actor, buddy, "the drinker casts it");
    assert.equal(cast.spell, "Compendium.pf2e.spells-srd.Item.XXqE1eY3w3z6xJCB");
    assert.equal(cast.rank, 2);
    assert.deepEqual(cast.targets.map((token) => token.uuid), [buddy.token.uuid], "on itself");
    assert.equal(cast.item.name, "Invisibility Potion");
    assert.equal(card.flags[MODULE_ID].card.status, "applied");
});

test("a counteract modifier the item states goes with the cast", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Truesight Potion")));
    assert.match(card.content, /counteract \+25/);
    const before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.actor, cast.rank, cast.counteract], [sneak, 7, 25]);
});

test("without the spell module, the card says to cast it by hand", async () => {
    const card = await use(sneak, foundry.giveItem(sneak, source("Invisibility Potion")));
    const { castFromItem } = foundry.spell;
    delete foundry.spell.castFromItem;
    try {
        await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, drinker: 0, userId: "gm" });
        await settle();
        assert.match(card.flags[MODULE_ID].card.results[0], /Cast Invisibility by hand at rank 2/);
    } finally {
        foundry.spell.castFromItem = castFromItem;
    }
});

test("a cast in words: the spell by its name, its rank, DC, counteract modifier, who it's on, and choices", () => {
    // "The armor casts mislead, affecting you."
    const mislead = castOf("Misleading");
    assert.deepEqual([mislead.builtin, mislead.spell.name, mislead.self], ["cast-spell", "Mislead", true]);
    // "You cast either 5th-rank Darkvision or See the Unseen on yourself": choices, the rank for both.
    const mantis = compileActivations(source("Mask of the Mantis (Major)"), { spells }).find((entry) => entry.activation.name === "Enhance Vision").plan;
    assert.deepEqual(mantis.choices.map((entry) => [entry.spell.name, entry.rank]), [["Darkvision", 5], ["See the Unseen", 5]]);
    assert.equal(mantis.self, true);
    // "Choose Summon Lesser Servitor or Command. You Cast the chosen Spell at 1st rank (DC 19)."
    const chimes = compileActivations(source("Worldringer"), { spells }).find((entry) => entry.activation.name === "Chimes of Command").plan;
    assert.deepEqual([chimes.choices.map((entry) => `${entry.spell.name}@${entry.rank}`), chimes.dc], [["Summon Lesser Servitor@1", "Command@1"], 19]);
    // "The crystal ball casts a DC 33 Scrying spell to your specifications."
    const ball = compileActivations(source("Crystal Ball (Clear Quartz)"), { spells }).find((entry) => entry.activation.name === "Scrying").plan;
    assert.deepEqual([ball.spell.name, ball.dc, ball.targets], ["Scrying", 33, true]);
    // "5th-rank Vitality Lash or Light, or 4th-rank Holy Light or Vital Beacon": a rank holds for the spells after it.
    assert.deepEqual(castOf("Dawnlight (Major)").choices.map((entry) => entry.rank), [5, 5, 4, 4]);
    assert.equal(castOf("Dawnlight (Major)").attack, 18, "its counteract modifier");
    // (Gate Attenuator's "casts a 5th-rank spell" by the element it's attuned to: its six listed spells as choices, at its attack and DC.)
    const gate = compileActivations(source("Gate Attenuator (Greater)"), { spells })[0].plan;
    assert.deepEqual([gate.choices.map((entry) => `${entry.spell.name}@${entry.rank}`), gate.dc, gate.attack], [["Pressure Zone@5", "Sand Form@5", "Flames of Ego@5", "Impaling Spike@5", "Freezing Rain@5", "Entwined Roots@5"], 28, 18]);
    // "a counteract modifier of [[/r 1d20+23]]".
    assert.equal(castOf("Rod of Negation").attack, 23);
    // An area spell: no targets needed.
    const drum = castOf("Drum of Upheaval", 1);
    assert.deepEqual([drum.spell.name, drum.dc, drum.area], ["Earthquake", 43, true]);
    // A legacy name: "You cast dimension door."
    assert.equal(castOf("Fiendish Teleportation").spell.name, "Translocate");
    // "Harm, Heal, or the 1st-rank spell from your deity's cleric spells": the unread choice a note; the spells' DC.
    const faith = castOf("Faith Tattoo");
    assert.deepEqual([faith.choices.map((entry) => entry.spell.name), faith.dc], [["Harm", "Heal"], 18]);
    assert.match(faith.notes.join(" "), /deity's cleric spells/);
    // Not casts: a random table, innate spells for a while, a spell named in passing, a cast after a failed save.
    assert.equal(readCastWords(source("Pistol of Wonder").system.description.value, { spells }), null);
    assert.equal(castWordsPlan(source("Elder Seed"), { spells }), null);
    assert.equal(compileActivations(source("Compass of Transpositional Awareness"), { spells }).find((entry) => entry.activation.name === "Track Teleportation").plan?.builtin ?? null, null);
    assert.equal(castOf("Whip of Compliance")?.builtin ?? null, null);
    // "The creature is targeted with Death Knell (DC 20)", "You generate the effects of a Vitality Lash cantrip, heightened to 3rd rank",
    // "You're the subject of the Sanctuary spell", "Cast Bless or Heal, each once per day."
    assert.deepEqual([castOf("Plate of Yled").spell.name, castOf("Plate of Yled").dc, castOf("Plate of Yled").self], ["Death Knell", 20, false]);
    assert.deepEqual([castOf("Shard of the Third Seal").spell.name, castOf("Shard of the Third Seal").rank], ["Vitality Lash", 3]);
    assert.deepEqual([castOf("Beguiling Crown").spell.name, castOf("Beguiling Crown").self], ["Sanctuary", true]);
    assert.deepEqual(castOf("Holy Prayer Beads").choices.map((entry) => entry.spell.name), ["Bless", "Heal"]);
    // "cast one of the following spells at 9th rank (DC 41): Hallucination, Sleep, or Weird" — and the fatigue before it, a note;
    // "a first level Command spell (DC 18)"; "the three-action version of a 6th-rank Heal spell".
    const locket = castOf("Locket of Sealed Nightmares");
    assert.deepEqual([locket.choices.map((entry) => `${entry.spell.name}@${entry.rank}`), locket.dc], [["Hallucination@9", "Sleep@9", "Weird@9"], 41]);
    assert.match(locket.notes.join(" "), /become fatigued/);
    assert.deepEqual([castOf("Bullhook").spell.name, castOf("Bullhook").rank, castOf("Bullhook").dc], ["Command", 1, 18]);
    assert.match(castOf("Armor of the Holy Warrior").notes.join(" "), /three-action/);
    // A consumable: "Applying this oil to an item casts a 2nd-rank Mending spell".
    const oil = compileItem(source("Oil of Mending"), { spells });
    assert.deepEqual([oil.builtin, oil.spell.name, oil.rank], ["cast-spell", "Mending", 2]);
});

test("a cast with choices: the card's picker; the chosen spell cast, an area one without targets", async () => {
    const mask = foundry.giveItem(sneak, source("Mask of the Mantis (Major)"));
    const index = compileActivations(source("Mask of the Mantis (Major)"), { spells }).findIndex((entry) => entry.activation.name === "Enhance Vision");
    let count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: mask.uuid, activation: index, userId: "player" });
    await settle();
    const card = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    assert.ok(card, "the cast card");
    assert.match(card.content, /data-air-field="choice"/);
    assert.match(card.content, /See the Unseen \(rank 5\)/);
    let before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: card.id, choice: 1, userId: "player" });
    await settle();
    const [cast] = foundry.casts.slice(before);
    assert.deepEqual([cast.spell, cast.rank], [spells["see the unseen"].uuid, 5]);
    assert.deepEqual(cast.targets.map((token) => token.uuid), [sneak.token.uuid], "on its user");
    assert.match(card.content, /casts See the Unseen/);
    // An area spell at no one: cast without targets.
    const drum = foundry.giveItem(sneak, source("Drum of Upheaval"));
    count = foundry.messages.length;
    await foundry.socket(SOCKET)({ action: "activate", itemUuid: drum.uuid, activation: 1, userId: "player" });
    await settle();
    const drumCard = foundry.messages.slice(count).find((message) => message.flags?.[MODULE_ID]?.card?.kind === "cast");
    before = foundry.casts.length;
    await foundry.socket(SOCKET)({ action: "apply", messageId: drumCard.id, userId: "player", targets: [] });
    await settle();
    const [quake] = foundry.casts.slice(before);
    assert.deepEqual([quake.spell, quake.dc, quake.targets.length], [spells.earthquake.uuid, 43, 0]);
});


test("more casts in words: rank pairs, lists with their ranks and DCs, by rune, a named item, a need, a choice on its user", () => {
    const pick = (plan) => (plan.choices ?? [{ spell: plan.spell, rank: plan.rank }]).map((entry) => [entry.spell.name, entry.rank, entry.dc ?? null]);
    // "You cast 2nd-rank or 4th-rank Enlarge upon yourself": both ranks.
    const mountain = castOf("The Mountain Man");
    assert.deepEqual([pick(mountain), mountain.self], [[["Enlarge", 2, null], ["Enlarge", 4, null]], true]);
    // "The shield casts good Divine Wrath with a DC of 27": "Divine" isn't a tradition here.
    const pavise = castOf("Amaranthine Pavise");
    assert.deepEqual([pavise.spell.name, pavise.dc], ["Divine Wrath", 27]);
    // "a 5th-rank spell that depends on the active rune: Acid Grip for corrosive, Fireball for flaming, 2-action Howling Blizzard
    // for frost, or Lightning Bolt for shock. The DC for these spells is 30."
    const blade = compileActivations(source("Blade of Four Energies"), { spells }).find((entry) => entry.activation.name === "Release Energy").plan;
    assert.deepEqual([pick(blade).map(([name, rank]) => `${name}@${rank}`), blade.dc], [["Acid Grip@5", "Fireball@5", "Howling Blizzard@5", "Lightning Bolt@5"], 30]);
    // "Sorshen's Sinuous Guisarme casts one of the following spells, heightened to 10th rank, …: Charm (DC 45), Flicker, or
    // Subconscious Suggestion (DC 45)": a named item; each spell's own DC.
    // (Its Mythic Point for DC 50, the ways card's second button: src/compiler/mythic-upgrade.js.)
    const imposed = compileActivations(source("Sorshen's Sinuous Guisarme"), { spells }).find((entry) => entry.activation.name === "Impose Will").plan;
    const guisarme = imposed.ways[0].plan;
    assert.deepEqual(pick(guisarme), [["Charm", 10, 45], ["Flicker", 10, null], ["Subconscious Suggestion", 10, 45]]);
    assert.deepEqual([pick(imposed.ways[1].plan), imposed.ways[1].plan.spend], [[["Charm", 10, 50], ["Flicker", 10, null], ["Subconscious Suggestion", 10, 50]], { mythicPoints: 1 }]);
    // "Monarch casts Dream Message (heightened to 4th rank)"; "Fear (3rd)" in a list (The Whispering Reeds).
    assert.deepEqual(pick(castOf("Monarch")), [["Dream Message", 4, null]]);
    const reeds = compileActivations(source("The Whispering Reeds"), { spells }).find((entry) => entry.plan?.builtin === "cast-spell").plan;
    assert.deepEqual(pick(reeds).map(([name, rank]) => `${name}@${rank}`), ["Wave of Despair@null", "Fear@3", "Paranoia@null", "Phantasmal Killer@null"]);
    assert.match(reeds.notes[0], /one target within 30 feet only/, "its own limits a note");
    // "If your last action was to Cast a prepared Spell with the plant or wood trait, you … obtain the effect of a 2nd-rank Oaken
    // Resilience spell": what it needs a note, on its user.
    const leaves = castOf("Verdant Leaves");
    assert.deepEqual([pick(leaves), leaves.self], [[["Oaken Resilience", 2, null]], true]);
    assert.match(leaves.notes[0], /^If your last action was to Cast a prepared Spell/);
    // "Harm … if you have 3 dark charges or … Heal … if you have 3 light charges": both, the sentence a note.
    const jian = castOf("Jian of Life's Duality");
    assert.deepEqual([pick(jian).map(([name]) => name), jian.dc], [["Harm", "Heal"], 30]);
    assert.match(jian.notes[0], /dark charges/);
    // "a 5th-rank Elemental Form spell affecting you or a 5th-rank Summon Elemental spell": the first on its user, the other not.
    const fragment = compileItem(source("Elemental Fragment"), { spells });
    assert.deepEqual([fragment.self, fragment.choices.map((entry) => Boolean(entry.self))], [false, [true, false]]);
});

test("a choice of its own on its user: the card casts that one on the user, the other as the spell says", () => {
    const fragment = compileItem(source("Elemental Fragment"), { spells });
    const user = { actorUuid: "Actor.u", tokenUuid: "Token.u", name: "User" };
    const state = createCastCard({ plan: fragment, item: { name: "Elemental Fragment" }, user });
    assert.deepEqual(castRequest({ ...state, choice: 0 }, { targetUuids: ["Token.foe"] }).targetUuids, ["Token.u"], "Elemental Form on its user");
    assert.deepEqual(castRequest({ ...state, choice: 1 }, { targetUuids: [] }).targetUuids, [], "Summon Elemental placed as the spell says");
    assert.equal(needsTargets(fragment, fragment.choices[1]), false);
});

test("the ability compiler's cast gets what the words say and it left out: on its user, a DC, a counteract bonus", () => {
    // "You cast Vapor Form on yourself" (Shadowmist Cape); "You cast 4th-rank Invisibility on yourself, but …" (Assassin's Bracers).
    assert.equal(compileActivations(source("Shadowmist Cape"), { spells }).find((entry) => entry.plan?.builtin === "cast-spell").plan.self, true);
    assert.equal(compileActivations(source("Assassin's Bracers (Type I)"), { spells }).find((entry) => entry.plan?.builtin === "cast-spell").plan.self, true);
    // "You cast 5th-rank Dispel Magic with a counteract bonus of +21 against the object" (Scarlet Queen).
    assert.equal(castOf("Scarlet Queen").attack, 21);
});

test("a released creature's stomp replicating a spell's effects at a rank and DC (Encapsulated Titanosaur, in this module's words)", () => {
    const capsule = { name: "Stand-in Capsule", type: "consumable", system: { category: "other", level: { value: 15 }, traits: { value: ["alchemical", "consumable"] }, description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">2</span> Interact</p><hr /><p>A great beast bursts out of the capsule. It walks a little way and stamps its feet, replicating the effects of a 6th-rank @UUID[Compendium.pf2e.spells-srd.Item.x7SPrsRxGb2Vy2nu]{Earthquake} (basic @Check[reflex|dc:30] against the falling rubble), though nothing about it is magical.</p>" } } };
    const plan = castWordsPlan(capsule, { spells });
    assert.deepEqual([plan.builtin, plan.spell.name, plan.rank, plan.dc, plan.area], ["cast-spell", "Earthquake", 6, 30, true]);
});

test("a spell's effects given its DC first (Dread Blindfold's Vision of Death at DC 37), or after (Planar Ribbon's Scrying at DC 40)", () => {
    const blindfold = compileActivations(source("Dread Blindfold"), { spells })[0].plan;
    assert.deepEqual([blindfold.builtin, blindfold.spell.name, blindfold.dc], ["cast-spell", "Vision of Death", 37]);
    assert.equal(compileActivations(source("Planar Ribbon"), { spells })[0].plan.dc, 40);
});


test("Spirit Bulb's two casts at its rank, Plant Form on its user or Summon Plant or Fungus (its \"to have it cast\" words); Emetic Paste's Fortitude bonus for the creature targeted", () => {
    for (const [name, rank] of [["Spirit Bulb", 5], ["Spirit Bulb (Greater)", 6], ["Spirit Bulb (Major)", 7]]) {
        const bulb = compileItem(source(name), { spells });
        assert.deepEqual([bulb.builtin, bulb.choices.map((entry) => [entry.spell.name, entry.rank, Boolean(entry.self)])], ["cast-spell", [["Plant Form", rank, true], ["Summon Plant or Fungus", rank, false]]], name);
    }
    const paste = compileItem(source("Emetic Paste (Moderate)"));
    assert.deepEqual([paste.item.recipient, paste.targeting.target, paste.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, `${modifier.duration.value} ${modifier.duration.unit}`])], ["targets", "1 creature", [["fortitude", 3, "item", "1 hours"]]]);
    assert.ok(paste.unread.some((sentence) => /only to saves to reduce the sickened condition/.test(sentence)), "its narrower words a note");
});
