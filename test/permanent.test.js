import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readDocuments } from "../../pf2e-automatic-ability-resolution/tools/leveldb.mjs";
import { CORE_FAMILIES, createRegistry } from "../../pf2e-resolution-core/src/index.js";
import { spellEffectIndex } from "../src/compiler/index.js";
import { compileActivations, handlesPermanent, readFrequency, splitActivations } from "../src/compiler/permanent.js";

const PACKS = `${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`;
const equipment = readDocuments(path.join(PACKS, "equipment")).filter((doc) => doc.collection === "items");
const spellEffects = spellEffectIndex(readDocuments(path.join(PACKS, "spell-effects")).filter((doc) => doc.collection === "items"));
const item = (name) => {
    const found = equipment.find((doc) => doc.name === name);
    assert.ok(found, name);
    return found;
};
const registry = createRegistry();
for (const family of CORE_FAMILIES) registry.registerFamily(family);

test("which permanent items' activations are read: not staves, not bombs, not consumables", () => {
    assert.equal(handlesPermanent(item("Cloak of Elvenkind")), true);
    assert.equal(handlesPermanent(equipment.find((doc) => (doc.system?.traits?.value ?? []).includes("staff") && /Activat/.test(doc.system.description.value))), false);
    assert.equal(handlesPermanent(item("Sulfur Bomb (Greater)")), false);
    assert.equal(handlesPermanent(item("Healing Potion (Minor)")), false);
});

test("an item's activations: name, actions, traits, frequency, trigger", () => {
    const [cloak] = splitActivations(item("Cloak of Elvenkind").system.description.value);
    assert.deepEqual([cloak.name, cloak.time, cloak.frequency], [null, "2", { max: 1, per: "day", raw: "once per day" }]);
    const cannon = splitActivations(item("Tentacle Cannon").system.description.value);
    assert.ok(cannon.some((entry) => entry.name === "Ink Spray" && entry.frequency?.per === "hour"));
    const scythe = splitActivations(item("Vampiric Scythe").system.description.value)[0];
    assert.match(scythe.trigger, /critically succeeds at an attempt to Disarm you/);
    assert.deepEqual(readFrequency("three times per day"), { max: 3, per: "day", raw: "three times per day" });
    assert.deepEqual(readFrequency("once per 10 minutes"), { max: 1, per: "10-minutes", raw: "once per 10 minutes" });
});

test("each activation read as an ability: a cast, an Effect, a save at targets, with its frequency", () => {
    const [cloak] = compileActivations(item("Cloak of Elvenkind"), { spellEffects });
    assert.deepEqual([cloak.plan.builtin, cloak.plan.spell.name, cloak.plan.self], ["cast-spell", "Invisibility", true]);
    assert.deepEqual(cloak.plan.trigger.frequency, { max: 1, per: "day", raw: "once per day" });
    const [mask] = compileActivations(item("Taljjae's Mask (The Hero)"), { spellEffects });
    assert.equal(mask.plan.resolution.kind, "effect");
    assert.equal(mask.plan.item.recipient, "user");
    const ink = compileActivations(item("Tentacle Cannon"), { spellEffects }).find((entry) => entry.activation.name === "Ink Spray");
    assert.equal(ink.plan.resolution.kind, "save");
    assert.deepEqual(ink.plan.resolution.check.against, { dc: "fixed", value: 23 });
    assert.deepEqual(registry.resolveSync(ink.plan, { caster: { id: "u" }, targets: [{ id: "t" }], statistic: () => ({ modifier: 0 }) }, { roll: () => ({ degree: "failure" }), damage: () => 3 }).gaps, []);
});

test("an activation that heals: its user (Bolka's Blessing), or a creature next to them (Healer's Gloves)", () => {
    const [bolka] = compileActivations(item("Bolka's Blessing"), { spellEffects });
    assert.deepEqual(bolka.plan.resolution.outcomes.success.effects, [{ kind: "heal", formula: "3d10" }]);
    assert.equal(bolka.plan.item.recipient, "user");
    const gloves = compileActivations(item("Healer's Gloves (Greater)"), { spellEffects }).find((entry) => entry.plan?.resolution?.outcomes?.success?.effects?.some((effect) => effect.kind === "heal"));
    assert.equal(gloves.plan.resolution.outcomes.success.effects[0].formula, "4d6+15");
    assert.equal(gloves.plan.item.recipient, "drinker", "the user picks the creature next to them");
});


test("an activation's row: not a condition only to some, not a random table's, not the target's on its user", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { plainText } = await import("../src/compiler/rows.js");
    const conditions = (name) => compileActivations(item(name), { spellEffects }).flatMap(({ plan }) => plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes.success.effects.filter((effect) => effect.kind === "condition").map((effect) => effect.slug) : []);
    // "invisible to scrying magic", "Invisible to creatures with the fiend, fey, or undead trait": not invisible.
    assert.ok(!conditions("Mirrorblade").includes("invisible"));
    assert.ok(!conditions("Token of Salt and Earth").includes("invisible"));
    // A roll on a table: no one result.
    assert.deepEqual(conditions("Madcap Top"), []);
    // "The target is Quickened for 1 round": the save card, for the creature targeted — not the item card on its user.
    const watch = compileActivations(item("Pocket Watch of Stethelos"), { spellEffects }).find(({ activation }) => activation.name === "Steal a Second");
    assert.equal(routeOf(watch.plan, plainText(watch.activation.html)), "save");
    // "You drop to 1 Hit Point instead …, and you gain 100 temporary Hit Points": the temporary Hit Points, the rest on a note.
    const [bastion] = compileActivations(item("Immortal Bastion"), { spellEffects });
    assert.equal(bastion.plan.partial, true);
});

test("the spell module's claims, when given: what it acts on is left to it; without them, nothing changes", async (t) => {
    const claims = await import("../../pf2e-automatic-resolution/src/compiler/item-claims.js").then((module) => module.claims).catch(() => null);
    if (!claims) return t.skip("the spell module's tree isn't next to this one");
    const { handlesItem } = await import("../src/compiler/index.js");
    const blade = item("Searing Blade");
    assert.equal(handlesPermanent(blade), true);
    assert.equal(handlesPermanent(blade, { claims }), false, "its cast is the spell module's");
    assert.deepEqual(compileActivations(blade, { spellEffects, claims }), []);
    assert.equal(handlesItem(item("Djezet Dose"), { claims }), false);
    assert.equal(handlesItem(item("Healing Potion (Minor)"), { claims }), true);
    // (A claims that fails is no claim.)
    assert.equal(handlesItem(item("Healing Potion (Minor)"), { claims: () => { throw new Error("boom"); } }), true);
});

test("an item's own data filled in before it's read: runes in a dice count and a DC, a damage-with-a-save as basic", async () => {
    const { withItemData } = await import("../src/compiler/item-data.js");
    const html = "<p><strong>Activate—Burst</strong> <span class=\"action-glyph\">2</span></p><p>Deals @Damage[((@item.system.runes.striking + 1) * 2)d6[force]] damage with a @Check[reflex|dc:23] save.</p><hr /><p><strong>Special</strong> The save DC increases to 26 if this item carries a +2 potency rune, or to 34 with a +3 potency rune.</p>";
    const filled = withItemData(html, { system: { runes: { striking: 3, potency: 3 } } });
    assert.match(filled, /@Damage\[8d6\[force\]\] damage with a @Check\[reflex\|dc:34\|basic\] save/);
    assert.match(withItemData(html, { system: { runes: { striking: 1, potency: 1 } } }), /@Damage\[4d6\[force\]\][^@]*@Check\[reflex\|dc:23\|basic\]/);
    // With degree rows of its own, the save stays as written.
    const rows = "<p>Deals @Damage[2d6[fire]] damage with a @Check[reflex|dc:20] save.</p><p><strong>Critical Success</strong> unaffected.</p>";
    assert.equal(withItemData(rows, {}), rows);
    // PF2e's own text is untouched.
    assert.equal(withItemData(item("Cloak of Elvenkind").system.description.value, item("Cloak of Elvenkind")), item("Cloak of Elvenkind").system.description.value);
});

test("an activation that heals its user in other words: \"You restore\", \"healing you for\", \"regain an additional\"", () => {
    const heal = (name) => compileActivations(item(name)).map(({ plan }) => plan?.resolution?.outcomes?.success?.effects?.find((effect) => effect.kind === "heal")).find(Boolean);
    assert.deepEqual(heal("Mitigation Mail"), { kind: "heal", formula: "5d10+10" });
    assert.deepEqual(heal("Trollhound Vest"), { kind: "heal", formula: "3d8" });
    assert.deepEqual(heal("Magical Medal (Unicorn's Purity)"), { kind: "heal", formula: "4d6" });
});

test("self conditions: \"You Stride and …, becoming Concealed until the end of your next turn\", \"rendering you Immobilized until you Dismiss\"", () => {
    const [approach] = compileActivations(item("Invisible Chain Shirt"));
    assert.deepEqual(approach.plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.expiry]), [["concealed", "turn-end"]]);
    // "or until you use a hostile action, whichever comes first": another way it ends, on the note.
    assert.equal(approach.plan.partial, true);
    const [anchor] = compileActivations(item("Immovable"));
    assert.deepEqual(anchor.plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration]), [["immobilized", null]]);
});

test("what it gives its user and allies in an area: an automatic row at the creatures the presser targets (Knight Captain's Lance, Snare of Speed)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { outrightText } = await import("../src/live/poison-card.js");
    const [lance] = compileActivations(item("Knight Captain's Lance"));
    assert.equal(routeOf(lance.plan), "save");
    assert.deepEqual([lance.plan.targeting.area, lance.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value])], [{ type: "emanation", value: 30 }, [["attack-roll", 1], ["damage", 1]]]);
    assert.equal(outrightText(lance.plan), "+1 status to attack roll, +1 status to damage");
    const speed = compileActivations(item("Snare of Speed")).find((entry) => entry.activation.name === "Prestissimo").plan;
    assert.deepEqual(speed.resolution.outcomes.success.effects.map((effect) => effect.slug), ["quickened"]);
    assert.match(speed.notes[0], /only Step and Stride/, "the extra action's limit a note");
});

test("activated ammunition whose own PF2e rules do it: a builtin with what they add, the rest of its text a note", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const [acid] = compileActivations(item("Elemental Ammunition (Moderate, Acid)"));
    assert.equal(acid.plan.builtin, "pf2e-rules");
    assert.deepEqual(acid.plan.notes, ["PF2e's own rules on Elemental Ammunition (Moderate, Acid) add 2d4 persistent acid damage and 2 splash acid damage to the Strike that fires it.", "After the damage roll, the splash card lists the creatures within 5 feet of the target for its splash."]);
    assert.equal(acid.plan.partial, undefined);
    const [magnetic] = compileActivations(item("Magnetic Shot (Lesser)"));
    assert.match(magnetic.plan.notes[0], /the deadly-d8 trait, two more weapon damage dice and a \+1 circumstance bonus to its attack roll against metal targets/);
    // Gravebane Ammunition's save stays the GM's: partial.
    const [gravebane] = compileActivations(item("Gravebane Ammunition"));
    assert.deepEqual([gravebane.plan.partial, gravebane.plan.notes.length], [true, 2]);
    assert.match(gravebane.plan.notes[1], /Enfeebled 1/);
    // No card of its own: PF2e applies an ammunition's rules to the Strike that uses it.
    assert.equal(routeOf(acid.plan), null);
});

test("a save link written without its \"dc:\" reads as the DC it means", async () => {
    const { withItemData } = await import("../src/compiler/item-data.js");
    assert.equal(withItemData("<p>Creatures in the cone must succeed at a @Check[will|21] save or be Stunned 1.</p>", {}), "<p>Creatures in the cone must succeed at a @Check[will|dc:21] save or be Stunned 1.</p>");
});


test("an Effect's opening flavor left out when it keeps the rest from being read; not a sentence with a rule in it", async () => {
    const { withoutFlavor } = await import("../src/compiler/flavor.js");
    assert.equal(withoutFlavor("<p><strong>Effect</strong> You hum a little tune. Each foe in a 10-foot emanation is Dazzled.</p>"), "<p><strong>Effect</strong> Each foe in a 10-foot emanation is Dazzled.</p>");
    for (const kept of ["<p><strong>Effect</strong> The blade afflicts the next target struck by it. It is Dazzled.</p>", "<p><strong>Effect</strong> You gain a +1 bonus. It lasts.</p>", "<p><strong>Effect</strong> One sentence only.</p>"]) assert.equal(withoutFlavor(kept), kept);
    // Suit of False Impression: its fear save for each foe in 15 feet, read past "You strike an intimidating pose …".
    const bulwark = compileActivations(item("Suit of False Impression"), { spellEffects })[0].plan;
    assert.deepEqual([bulwark.resolution.check.statistic, bulwark.resolution.check.against.value, bulwark.targeting.area], ["will", 22, { type: "emanation", value: 15 }]);
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => bulwark.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`)), [["frightened 1"], ["frightened 2"]]);
    // Ghast Stiletto's opening says which creature it's for ("the next living target struck"): not flavor, still a note alone.
    assert.equal(compileActivations(item("Ghast Stiletto"), { spellEffects })[0].plan.noteOnly, true);
});

test("Bloodline Robe's Quickened on its user's next turn, its limit a note; Life's Last Breath's save written without the word", () => {
    const robe = compileActivations(item("Bloodline Robe"), { spellEffects })[0].plan;
    assert.deepEqual(robe.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.expiry]), [["quickened", 1, "turn-end"]]);
    assert.deepEqual(robe.unread, ["You can use the extra action only as part of casting a bloodline spell."]);
    const breath = compileActivations(item("Life's Last Breath"), { spellEffects })[1].plan;
    assert.deepEqual([breath.resolution.check.statistic, breath.resolution.check.basic, breath.resolution.sharedDamage.components[0].formula, breath.resolution.outcomes.success.damage.mode], ["fortitude", false, "4d6[void]", "none"]);
    assert.match(breath.notes.join(" "), /^You gain an equal amount of temporary Hit Points that last 1 minute \(the damage dealt\): add them by hand\.$/);
    // Not a passive sentence's save: Dawnlight's flash for "Creatures with darkvision …" stays its casts'.
    assert.notEqual(compileActivations(item("Dawnlight (Major)"), { spellEffects })[0].plan?.resolution?.kind, "save");
});

test("Lacquered Waist Drum: a damage save in brackets as basic; its conditions only for a ghost, notes and not rows", () => {
    const [life, joy] = compileActivations(item("Lacquered Waist Drum"), { spellEffects }).map((entry) => entry.plan);
    assert.deepEqual([life.resolution.check.basic, life.resolution.sharedDamage.components[0].formula, life.targeting.range], [true, "5d8[vitality]", "30 feet"]);
    assert.deepEqual(life.resolution.outcomes.failure.noteEffects.map((note) => note.text), ["Only a creature with the ghost trait: Sickened 1. Apply it by hand."]);
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => [joy.resolution.outcomes[degree].effects.length, joy.resolution.outcomes[degree].noteEffects.map((note) => note.text)]), [[0, ["Only a creature with the ghost trait: Stupefied 1. Apply it by hand."]], [0, ["Only a creature with the ghost trait: Stupefied 2. Apply it by hand."]]]);
    assert.equal(joy.partial, true);
});

test("the Harrow Court's damage and healing for its owner's level; The Survivor's and The Midwife's healing", async () => {
    const { byOwnerLevel } = await import("../src/compiler/item-data.js");
    const at = (name, level) => compileActivations({ ...item(name), ownerLevel: level }, { spellEffects })[0].plan;
    assert.deepEqual([12, 15, 18, 20].map((level) => at("The Trumpet", level).resolution.sharedDamage.components[0].formula), ["14d6[sonic]", "18d6[sonic]", "20d6[sonic]", "22d6[sonic]"]);
    assert.equal(at("The Desert", 17).resolution.sharedDamage.components[0].formula, "9d6[piercing],9d6[fire]");
    assert.deepEqual(at("The Midwife", 16).resolution.outcomes.success.effects, [{ kind: "heal", formula: "7d8+28" }]);
    // With no owner (a census, the simulator's own compile): as written.
    const html = "<p>It deals @Damage[2d6[fire]] damage. The damage increases to @Damage[3d6[fire]] if you're at least 9th level.</p>";
    assert.equal(byOwnerLevel(html, null), html);
    assert.equal(byOwnerLevel(html, 9), "<p>It deals @Damage[3d6[fire]] damage.</p>");
    assert.equal(byOwnerLevel(html, 8), "<p>It deals @Damage[2d6[fire]] damage.</p>");
    // The Midwife heals the creature it saves (the card's other recipient); The Survivor its user, the 1 HP "instead" a note.
    assert.equal(at("The Midwife", 20).otherRecipient, true);
    const survivor = compileActivations(item("The Survivor"), { spellEffects })[0].plan;
    assert.deepEqual(survivor.resolution.outcomes.success.effects, [{ kind: "heal", formula: "4d8+16" }]);
    assert.match(survivor.unread.join(" "), /you drop to 1 Hit Point instead/);
});

test("Fortune Cord's coins pick its damage type (the card's picker); Dragonscale Amulet's frightful presence by name, as that ability's rows", async () => {
    const { readTypeChoice } = await import("../src/compiler/type-choice.js");
    const fling = compileActivations(item("Fortune Cord"), { spellEffects })[1].plan;
    assert.deepEqual([fling.resolution.check.statistic, fling.resolution.check.basic, fling.targeting.range], ["reflex", true, "100 feet"]);
    assert.deepEqual(fling.damageChoices, [{ label: "Copper: acid", formula: "4d6[acid]" }, { label: "Silver: electricity", formula: "4d6[electricity]" }, { label: "Gold: fire", formula: "4d6[fire]" }, { label: "Platinum: cold", formula: "4d6[cold]" }]);
    assert.equal(readTypeChoice("<p>It deals @Damage[2d6[untyped]] damage; the damage type depends on the type of gem set in it. A ruby deals fire damage.</p>"), null, "one type isn't a choice");
    const amulet = compileActivations(item("Dragonscale Amulet"), { spellEffects })[0].plan;
    assert.deepEqual([amulet.resolution.check.statistic, amulet.resolution.check.against.value, amulet.targeting.area], ["will", 34, { type: "emanation", value: 60 }]);
    assert.deepEqual(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => amulet.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`)), [[], ["frightened 1"], ["frightened 2"], ["frightened 4"]]);
});

test("Antler Arrow: its hit's Reflex save or Immobilized (a bow's critical specialization by name), pulling free a note", () => {
    const arrow = compileActivations(item("Antler Arrow"), { spellEffects })[0].plan;
    assert.equal(arrow.strike.ammo, true);
    assert.deepEqual([arrow.strike.save.resolution.check.statistic, arrow.strike.save.resolution.check.against.value], ["reflex", 16]);
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => arrow.strike.save.resolution.outcomes[degree].effects.map((effect) => effect.slug)), [["immobilized"], ["immobilized"]]);
    assert.ok(arrow.strike.notes.some((note) => /DC 10 Athletics check/.test(note)));
});

test("activations the ability compiler left to the GM, read: Heartstone's counteract, Pilferer's Gloves, Cloak of Repute, Armbands of the Gorgon, Blood of Iron", () => {
    const at = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
    const heartstone = at("Heartstone");
    assert.deepEqual([heartstone.builtin, heartstone.item.counteract.modifier, heartstone.item.counteract.rank, heartstone.item.counteract.afflictions], ["counteract", 18, 5, ["disease"]]);
    assert.deepEqual(at("Pilferer's Gloves").reroll.raise.change, { failure: "success", criticalFailure: "failure" });
    assert.deepEqual(at("Cloak of Repute").bonus.degree, { selector: "diplomacy", adjustment: { success: "one-degree-better" }, predicate: ["action:request"] });
    const armbands = at("Armbands of the Gorgon");
    assert.deepEqual([armbands.item.reduce[0].by, armbands.item.reduce[0].choose.includes("paralyzed")], ["all", true]);
    assert.match(armbands.notes.join(" "), /suppressed for 1 hour/);
    // Blood of Iron: 30 temporary Hit Points for you and your allies within 10 feet, and their conditions lowered.
    const blood = at("Vambrace of Gorum", 1);
    assert.deepEqual([blood.allyArea, blood.targeting.area, blood.resolution.outcomes.success.effects[0].amount], [true, { type: "emanation", value: 10 }, 30]);
    assert.deepEqual(blood.item.reduce.map((entry) => [entry.slug, entry.by, entry.who]), ["clumsy", "enfeebled", "frightened", "stupefied"].map((slug) => [slug, 1, "targets"]));
});

test("a save whose time depends on the degree, in the module's own words: \"becoming Dazzled for 1 round on a failure or 3 rounds on a critical failure\"", async () => {
    const { withItemData } = await import("../src/compiler/item-data.js");
    const html = "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><p><strong>Effect</strong> The target must attempt a @Check[will|dc:21] save to shield its eyes, becoming @UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]{Dazzled} for 1 round on a failure or 3 rounds on a critical failure.</p>";
    assert.match(withItemData(html, {}), /must succeed at a @Check\[will\|dc:21\] save or be @UUID\[[^\]]+\]\{Dazzled\} for 1 round \(3 rounds on a critical failure\)/);
    const [entry] = compileActivations({ name: "Test Lens", type: "equipment", system: { slug: null, level: { value: 4 }, traits: { value: ["magical"] }, usage: { value: "held-in-one-hand" }, description: { value: html } } }, { spellEffects });
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => entry.plan.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.duration.value}`)), [["dazzled 1"], ["dazzled 3"]]);
});

test("activations read once their words are put as the readers take them: Catoblepas Maul, Propulsive Boots, Stony Hag Eye, Golden Gloves, The Rakshasa, Maw of Hungry Shadows", () => {
    const at = (name, index = 0, extra = {}) => compileActivations({ ...item(name), ...extra }, { spellEffects })[index].plan;
    // Its Requirements line set aside, as a Trigger line is: the Fortitude save, Sickened 1 (and Slowed 1 on a critical failure).
    const maul = at("Catoblepas Maul");
    assert.deepEqual([maul.resolution.kind, maul.resolution.outcomes.criticalFailure.effects.map((effect) => effect.slug)], ["save", ["sickened", "slowed"]]);
    // "You stomp three times and gain the Quickened condition for 1 minute".
    const boots = at("Propulsive Boots");
    assert.deepEqual(boots.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.unit]), [["quickened", 1, "minutes"]]);
    // "On a failure, it's Slowed 1 for 1 minute; on a critical failure, if the creature is already slowed, it's permanently petrified".
    const eye = at("Stony Hag Eye");
    assert.deepEqual(eye.resolution.outcomes.failure.effects.map((effect) => effect.slug), ["slowed"]);
    assert.deepEqual(eye.resolution.outcomes.criticalFailure.effects[0].escalate, { if: "slowed", slug: "petrified", value: null, duration: null });
    // "All enemies within a 40-feet emanation must make a … save or be Dazzled for 1 minute (or Blinded … on critical failure)".
    const gloves = at("Golden Gloves");
    assert.deepEqual([gloves.targeting.area, gloves.resolution.outcomes.failure.effects[0].slug, gloves.resolution.outcomes.criticalFailure.effects[0].slug], [{ type: "emanation", value: 40 }, "dazzled", "blinded"]);
    assert.equal(gloves.notes.length, 2, "the unholy penalty and the counteract on its user: the GM's");
    // "You regain Hit Points equal to twice your level": its owner's level.
    assert.equal(compileActivations(item("The Rakshasa"), { spellEffects })[0].plan?.resolution?.outcomes?.success?.effects?.some((effect) => effect.kind === "heal") ?? false, false);
    assert.equal(at("The Rakshasa", 0, { ownerLevel: 12 }).resolution.outcomes.success.effects.find((effect) => effect.kind === "heal").amount, 24);
    // A save link with no DC after its user's spell: the spell DC; drained without the time of the blinded beside it.
    const maw = at("Maw of Hungry Shadows");
    assert.deepEqual(maw.resolution.check.against, { dc: "owner", statistic: "spell" });
    assert.deepEqual(maw.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration?.unit ?? null]), [["blinded", "rounds"], ["drained", null]]);
});

test("a row's damage by its type, drained without the time beside it, a degree's own Effect: Blast Lance, Gloaming Arc, Cape of Justice, Crackling Bubble Gum", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { equipmentEffectIndex } = await import("../src/compiler/degree-effects.js");
    const itemEffects = equipmentEffectIndex(readDocuments(path.join(PACKS, "equipment-effects")).filter((doc) => doc.collection === "items"));
    const lance = compileActivations(item("Blast Lance"), { spellEffects })[0].plan;
    assert.deepEqual(["success", "failure", "criticalFailure"].map((degree) => lance.resolution.outcomes[degree].damage.multiplier), [0.5, 1, 2]);
    const arc = compileActivations(item("Gloaming Arc"), { spellEffects })[0].plan;
    assert.deepEqual(arc.strike.save.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.duration?.unit ?? null]), [["enfeebled", "minutes"], ["drained", null]]);
    // Enact Justice's Effect lasts until it's removed, the row 1 minute: left to the GM. Bubble gum's lasts the row's 1 minute.
    const cape = compileActivations(item("Cape of Justice"), { spellEffects, itemEffects })[1].plan;
    assert.equal(cape.resolution.outcomes.failure.nativeEffects, undefined);
    const gum = compileItem(item("Crackling Bubble Gum (Lesser)"), { spellEffects, itemEffects });
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => gum.resolution.outcomes[degree].nativeEffects?.[0]?.label), ["Effect: Crackling Bubble Gum (Failure)", "Effect: Crackling Bubble Gum (Failure)"]);
    assert.equal(compileItem(item("Crackling Bubble Gum (Lesser)"), { spellEffects }).resolution.outcomes.failure.nativeEffects, undefined, "no durations known: only an Effect whose row has no time");
});

test("temporary Hit Points, a penalty, a resistance and later words: Razmiri Wayfinder, Bangles of Crowns, Aeon Stone (Olivine Pendeloque), Words of Wisdom, Safeguarding, Thunder Mail", () => {
    const at = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
    // "You touch an adjacent creature, granting them 3d8 temporary Hit Points for 1 hour": the creature picked on the card.
    const wayfinder = at("Razmiri Wayfinder");
    assert.deepEqual([wayfinder.item.recipient, wayfinder.resolution.outcomes.success.effects[0].formula, wayfinder.resolution.outcomes.success.effects[0].duration.unit], ["drinker", "3d8", "hours"]);
    // "You also gain 15 temporary Hit Points. You lose any remaining temporary Hit Points after 1 minute."
    const bangles = at("Bangles of Crowns", 1).resolution.outcomes.success.effects[0];
    assert.deepEqual([bangles.amount, bangles.duration.value, bangles.duration.unit], [15, 1, "minutes"]);
    // "… for 1 minute, but the calming urges impose a -1 status penalty to your attack rolls": the penalty, the suppression a note.
    const stone = at("Aeon Stone (Olivine Pendeloque)");
    assert.deepEqual(stone.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.duration.unit]), [["attack-roll", -1, "minutes"]]);
    assert.equal(stone.partial, true);
    // "+1 item bonus to Diplomacy checks and checks of the skill associated with your phrase": Diplomacy, the other the card's pick
    // (src/compiler/skill-pick.js).
    const words = at("Words of Wisdom (Lesser)");
    assert.deepEqual(words.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type]), [["diplomacy", 1, "item"]]);
    assert.deepEqual([words.item.skillPick.skills.length, words.partial], [3, undefined]);
    // "Trigger You would take mental, poison, or spirit damage Effect You gain resistance 5 to the triggering damage type": picked.
    assert.deepEqual(at("Safeguarding").item.resist, [{ type: null, choose: ["mental", "poison", "spirit"], value: 5, duration: { mode: "fixed", value: 10, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]);
    // The 6d6 in its emanation; the minute of damage to whoever touches its wearer, a note.
    const mail = at("Thunder Mail");
    assert.deepEqual([mail.targeting.area, mail.resolution.sharedDamage.components[0].formula], [{ type: "emanation", value: 10 }, "6d6[electricity]"]);
    assert.match(mail.notes.join(" "), /whenever a creature touches you/);
});

test("healing a feat of its owner's changes: Lover's Knot's 2d6, or 2d6+7 with Battle Medicine", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const knot = (extra) => compileItem({ ...item("Lover's Knot"), ...extra }, { spellEffects }).resolution.outcomes.success.effects[0].formula;
    assert.deepEqual([knot({ ownerFeats: [] }), knot({ ownerFeats: ["battle-medicine"] })], ["2d6", "2d6+7"]);
    assert.equal(compileItem(item("Lover's Knot"), { spellEffects }).partial, true, "no owner known: the feat's healing a note");
});

test("consumables read: Serene Smelling Salts, Explosive Missive's written type, Blindpepper Bomb, Stage Fright Missive, Captivating Rosebud's penalties", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const at = (name) => compileItem({ ...item(name), ownerFeats: [] }, { spellEffects });
    // Its frightened lowered, the immunity a note: partial, not a note alone.
    const salts = at("Serene Smelling Salts");
    assert.deepEqual([salts.noteOnly, salts.partial, salts.item.reduce], [undefined, true, [{ slug: "frightened", by: 1 }]]);
    // "The tenor of what you write … determines the damage type …: acid for a caustic inscription, …": the card's picker.
    const missive = at("Explosive Missive");
    assert.deepEqual([missive.resolution.check.basic, missive.damageChoices.map((choice) => choice.formula)], [true, ["4d6[acid]", "4d6[cold]", "4d6[electricity]", "4d6[fire]", "4d6[sonic]"]]);
    assert.match(missive.notes.join(" "), /persistent damage of the same type/);
    // Thrown to explode, not a Strike: Blinded 1 round and Dazzled 2 ("and then Dazzled for 1 round"); its critical failure's
    // dazzled lasting while it's sickened.
    const pepper = at("Blindpepper Bomb");
    assert.deepEqual([pepper.targeting.area, pepper.resolution.outcomes.failure.effects.map((effect) => `${effect.slug} ${effect.duration?.value ?? "-"}`)], [{ type: "burst", value: 15 }, ["blinded 1", "dazzled 2"]]);
    assert.deepEqual(pepper.resolution.outcomes.criticalFailure.effects.map((effect) => effect.slug), ["blinded", "sickened", "dazzled"]);
    // "save or be overcome with embarrassment for 1 hour, taking a –1 status penalty to Deception, Diplomacy, Intimidation, and
    // Performance checks": those four, on a failure and a critical failure; the sickened when it speaks, a note.
    const fright = at("Stage Fright Missive");
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => fright.resolution.outcomes[degree].modifiers.map((modifier) => modifier.selector)), [["deception", "diplomacy", "intimidation", "performance"], ["deception", "diplomacy", "intimidation", "performance"]]);
    assert.equal(fright.notes.length, 1);
    // "-1 status penalty to Perception checks for 10 minutes", "As success, but a –2 penalty" (and Fascinated on a critical failure).
    const rose = at("Captivating Rosebud");
    assert.deepEqual(["success", "failure", "criticalFailure"].map((degree) => rose.resolution.outcomes[degree].modifiers.map((modifier) => `${modifier.selector} ${modifier.value}`)), [["perception -1"], ["perception -2"], ["perception -2"]]);
    assert.deepEqual(rose.resolution.outcomes.criticalFailure.effects.map((effect) => effect.slug), ["fascinated"]);
});

test("quickened with its action's use a note, a banner's ally, a successful Feint's target, a hit after flavor, an area that forces a save, a snare's push", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const at = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
    // "You become Quickened for 1 minute or until you leave the vehicle, …, and can use the extra action to … or, if …": Quickened.
    const mien = at("Mariner’s Mien (Lesser)");
    assert.deepEqual([mien.resolution.outcomes.success.effects.map((effect) => effect.slug), mien.partial], [["quickened"], true]);
    // "An ally within the banner's aura becomes Quickened for 1 round": the targeted ally, its action's use a note.
    const banner = at("Zealous Banner");
    assert.deepEqual([banner.item.recipient, banner.resolution.outcomes.success.effects[0].slug, banner.partial], ["targets", "quickened", true]);
    // "On a successful Feint, the target is Dazzled for 1 round": the target's, only after the Feint succeeds (a note).
    const buckler = at("Glamorous Buckler");
    assert.deepEqual([buckler.resolution.outcomes.success.effects[0].slug, buckler.notes], ["dazzled", ["This applies only after a successful Feint check."]]);
    // "On a hit, the creature becomes covered in a mass of flesh …. The creature becomes Slowed 1 for 1 round": the Strike's rider.
    const gun = at("Growth Gun");
    assert.deepEqual(gun.resolution.outcomes.success.effects.map((effect) => `${effect.slug} ${effect.value}`), ["slowed 1"]);
    // "… in a 30-foot emanation, forcing hostile creatures in the area to make a … save or be Blinded for 1 round".
    const eye = at("Eye of the Moonwarden");
    assert.deepEqual([eye.targeting.area, eye.resolution.outcomes.failure.effects[0].slug], [{ type: "emanation", value: 30 }, "blinded"]);
    // Expulsion Snare: "save or be moved into an adjacent square (chosen by you …)" — a 5-foot push, Prone on a critical failure.
    const snare = compileItem(item("Expulsion Snare"), { spellEffects });
    const rows = snare.zone.saves[0].plan.resolution.outcomes;
    assert.deepEqual([rows.failure.forcedMovement.distance, rows.criticalFailure.effects.map((effect) => effect.slug)], [5, ["prone"]]);
    assert.match(snare.zone.notes.join(" "), /crafter chose the square/);
});

test("a called creature's single Strike with its damage in the next sentence, a save or become with its worse result after, a flight's line that saves or takes damage (the module's own wording)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const consumable = (name, html) => compileItem({ name, type: "consumable", system: { slug: null, level: { value: 6 }, category: "other", traits: { value: ["alchemical", "consumable"] }, usage: { value: "held-in-one-hand" }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: html } } }, { spellEffects });
    const lizard = consumable("Test Lizard Jar", "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> Interact</p><p>A lizard pours out. It scurries 20 feet and Strikes the nearest foe using a bite Strike which has a +12 attack modifier, agile. On a successful Strike it deals 2d6 plus 4 piercing damage.</p>");
    assert.deepEqual([lizard.ownCheck, lizard.resolution.sharedDamage.components[0].formula], [{ kind: "attack", modifier: 12 }, "2d6+4"]);
    const gaze = consumable("Test Stone Gaze", "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> Interact</p><p>A stony eye opens at a creature within 20 feet. The gazed-at foe must make a @Check[fortitude|dc:20] save, or become @UUID[Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3]{Slowed 1} for 1 round as its joints stiffen, or Slowed 2 if they critically fail their save.</p>");
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => gaze.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`)), [["slowed 1"], ["slowed 2"]]);
    const bird = consumable("Test Fire Bird", "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> Interact</p><p>A burning bird bursts out. It flies up to 40 feet; creatures within its path during its flight make a @Check[reflex|dc:25] save or take @Damage[5d6[fire]] damage.</p>");
    assert.deepEqual([bird.targeting.area, bird.resolution.outcomes.failure.damage.formulas?.[0]?.formula ?? bird.resolution.sharedDamage?.components?.[0]?.formula], [{ type: "line", value: 40 }, "5d6[fire]"]);
});

test("Demoralize at the target and the enemies around it (Shrieking Skull), after 'and attempting' (Wrestler's Armbands); a banner's bleed at each hurt enemy (Banner of Piercing Shards)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const skull = compileItem(item("Shrieking Skull"), { spellEffects });
    assert.deepEqual([skull.builtin, skull.action.slug, skull.action.maxTargets, skull.action.everyone], ["item-action", "demoralize", 99, "the target and each enemy within 30 feet of it"]);
    assert.match(skull.action.after, /If you Strike with the weapon before the end of your turn/);
    const armbands = compileActivations(item("Wrestler's Armbands"), { spellEffects })[0].plan;
    assert.deepEqual([armbands.builtin, armbands.action.slug, armbands.action.targeted], ["item-action", "demoralize", true]);
    const banner = compileActivations(item("Banner of Piercing Shards"), { spellEffects })[0].plan;
    assert.deepEqual([banner.resolution.sharedDamage.components[0].formula, banner.targeting.range, banner.partial], ["1d4[persistent,bleed]", "30 feet", true]);
    assert.match(banner.notes.join(" "), /dealt damage since the end of your last turn/);
});

test("a moment's resistance with its type first (Sparkshade Parasol) and a companion's swim Speed (Waverider Barding)", () => {
    const parasol = compileActivations(item("Sparkshade Parasol"), { spellEffects })[0].plan;
    assert.deepEqual([parasol.builtin, parasol.bonus.resistance], ["readied-bonus", { type: "fire", value: 20 }]);
    const barding = compileActivations(item("Waverider Barding"), { spellEffects })[0].plan;
    assert.deepEqual([barding.item.recipient, barding.item.speeds.map((speed) => [speed.type, speed.value])], ["targets", [["swim", 30]]]);
    assert.equal(barding.partial, true, "the bonus to a swim Speed it already had: a note");
});

test("a mount's bleed and quickened condition (Heedless Spurs): the fuller outright reading over the ability compiler's damage alone", () => {
    const spurs = compileActivations(item("Heedless Spurs"), { spellEffects })[0].plan;
    assert.deepEqual([spurs.resolution.sharedDamage.components[0].formula, spurs.resolution.sharedDamage.components[0].category, spurs.resolution.outcomes.success.effects.map((effect) => effect.slug)], ["2d6", "persistent", ["quickened"]]);
    assert.match(spurs.notes.join(" "), /Target your mount/);
});

test("Nap Gas Dispenser: a penalty beside its row's slowed, and prone and unconscious only later, at the end of its next turn (a note, not now)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const gas = compileItem(item("Nap Gas Dispenser"), { spellEffects });
    const rows = gas.resolution.outcomes;
    assert.deepEqual([rows.success.modifiers.map((modifier) => `${modifier.selector} ${modifier.value}`), rows.success.effects.map((effect) => effect.slug)], [["perception -2"], ["slowed"]]);
    for (const degree of ["failure", "criticalFailure"]) {
        assert.deepEqual(rows[degree].effects.map((effect) => effect.slug), ["slowed"], `${degree}: slowed now`);
        assert.match(rows[degree].noteEffects.map((note) => note.text).join(" "), /At the end of their next turn, they fall Prone and fall Unconscious/);
    }
});

test("conditions only under if/when come off their rows (Heart of Sarnax, Hex Blaster); 'As success, but' rows keep the success's conditions, at the row's own time (Wintershot, The Waxworks, Lamentation of the Faithless)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const at = (name, index = 0) => compileActivations(item(name), { spellEffects }).filter((entry) => entry.plan?.resolution?.kind === "save")[index]?.plan ?? compileItem(item(name), { spellEffects });
    const slugs = (plan, degree) => plan.resolution.outcomes[degree].effects.map((effect) => effect.slug);
    const heart = compileActivations(item("Heart of Sarnax"), { spellEffects }).find((entry) => entry.activation.name === "Two Hearts as One").plan;
    assert.deepEqual(slugs(heart, "criticalFailure"), ["stunned"], "slowed 2 only after the stun");
    assert.match(heart.resolution.outcomes.criticalFailure.noteEffects.map((note) => note.text).join(" "), /When it recovers from being stunned/);
    const hex = compileItem(item("Hex Blaster"), { spellEffects }) ?? at("Hex Blaster");
    assert.ok(!slugs(hex, "criticalFailure").includes("unconscious"), "unconscious only if the damage knocks it out");
    const winter = compileActivations(item("Wintershot"), { spellEffects })[0].plan;
    assert.deepEqual(["success", "failure", "criticalFailure"].map((degree) => winter.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.duration.value} ${effect.duration.unit}`)), [["dazzled 2 rounds"], ["dazzled 1 minutes"], ["dazzled 10 minutes"]]);
    const wax = compileActivations(item("The Waxworks"), { spellEffects })[0].plan;
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => slugs(wax, degree).includes("confused")), [true, true]);
    const lament = compileActivations(item("Lamentation of the Faithless"), { spellEffects })[0].plan;
    const blinded = lament.resolution.outcomes.criticalFailure.effects.find((effect) => effect.slug === "blinded");
    assert.deepEqual([blinded.duration.value, blinded.duration.unit, slugs(lament, "criticalFailure").includes("slowed")], [1, "minutes", true]);
});

test("a condition's time in its own sentence (Liar's Bangle's 'For the next minute'), and kept when an 'As failure, but' row names it again (Floppy Rag Doll)", () => {
    const bangle = compileActivations(item("Liar's Bangle"), { spellEffects }).find((entry) => entry.activation.name === "Cloud Judgment").plan;
    const stupefied = bangle.resolution.outcomes.failure.effects.find((effect) => effect.slug === "stupefied");
    assert.deepEqual([stupefied.duration.value, stupefied.duration.unit], [1, "minutes"]);
    const doll = compileActivations(item("Floppy Rag Doll"), { spellEffects })[0].plan;
    const clumsy = doll.resolution.outcomes.criticalFailure.effects.find((effect) => effect.slug === "clumsy");
    assert.deepEqual([clumsy.value, clumsy.duration?.unit], [2, "rounds"]);
});

test("condition floors as the core's conditionFloor: a fixed time (Timpani of Panic, Gleaming Cuirass, Putrescent Glob), until a concentrate action (Terrifying Ammunition), while the persistent fire lasts (Tallow Bomb)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { compileBomb } = await import("../src/compiler/bombs.js");
    const timpani = compileActivations(item("Timpani of Panic"), { spellEffects })[0].plan.resolution.outcomes;
    assert.deepEqual(["success", "failure", "criticalFailure"].map((degree) => `${timpani[degree].conditionFloor.slug} ${timpani[degree].conditionFloor.value} ${timpani[degree].conditionFloor.duration.value} ${timpani[degree].conditionFloor.duration.unit}`), ["frightened 1 1 rounds", "frightened 1 1 minutes", "frightened 1 1 minutes"]);
    assert.deepEqual(timpani.success.manualInstructions, [], "the floor's by-hand line gone");
    assert.deepEqual(compileActivations(item("Gleaming Cuirass"), { spellEffects }).find((entry) => entry.plan?.resolution?.kind === "save").plan.resolution.outcomes.criticalFailure.conditionFloor.duration, { value: 1, unit: "minutes" });
    const glob = compileItem(item("Putrescent Glob"), { spellEffects }).resolution.outcomes.failure.conditionFloor;
    assert.deepEqual(glob, { slug: "sickened", value: 2, lifetime: "fixed", duration: { value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } });
    assert.deepEqual(compileActivations(item("Terrifying Ammunition"), { spellEffects })[0].plan.resolution.outcomes.failure.conditionFloor, { slug: "frightened", value: 1, lifetime: "until-lifted", liftedBy: "it spends a concentrate action" });
    assert.deepEqual(compileBomb(item("Tallow Bomb (Lesser)")).resolution.outcomes.criticalSuccess.conditionFloor, { slug: "sickened", value: 1, lifetime: "while-persistent", persistentDamage: "fire" });
});

test("a talisman's bonus after 'and gain' (Champion's Laurels) and a bonus 'While this effect is active' (Look-Me-Not)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const laurels = compileItem(item("Champion's Laurels (Amateur)"), { spellEffects });
    assert.deepEqual([laurels.builtin, laurels.bonus.modifiers.map((modifier) => `${modifier.selector} ${modifier.value}`), laurels.bonus.spend], ["readied-bonus", ["acrobatics 1", "athletics 1"], ["acrobatics", "athletics"]]);
    const look = compileItem(item("Look-Me-Not"), { spellEffects });
    assert.deepEqual(look.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["deception", 2, ["action:feint"]]]);
});

test("Gecko Pads' climb Speed ('The pads give you …') and Maelstromic Destabilizer's resistance for its holder", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const pads = compileItem(item("Gecko Pads"), { spellEffects });
    assert.deepEqual([pads.item.speeds.map((speed) => [speed.type, speed.duration.value, speed.duration.unit]), pads.partial], [[["climb", 10, "minutes"]], undefined]);
    const destabilizer = compileItem(item("Maelstromic Destabilizer (Lesser)"), { spellEffects });
    assert.deepEqual([destabilizer.item.resist.map((entry) => [entry.type, entry.value, entry.duration.unit]), destabilizer.partial], [[["spirit", 2, "minutes"]], true]);
});

test("a bonus to the triggering save and to the rest against the same affliction for a minute (Fulu of the Stoic Ox, Fulu of the Drunken Monkey)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const ox = compileItem(item("Fulu of the Stoic Ox"), { spellEffects }).resolution.outcomes.success.modifiers;
    assert.deepEqual(ox.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate, modifier.duration.unit]), [["fortitude", 2, "status", ["item:trait:disease"], "minutes"]]);
    const monkey = compileItem(item("Fulu of the Drunken Monkey"), { spellEffects });
    assert.deepEqual([monkey.resolution.outcomes.success.modifiers[0].predicate, monkey.partial], [["item:trait:poison"], true]);
});

test("auras that act at a turn's start or end in them, as the ability module's zone: Arctic Worm Chitin Shield, Alluring Lantern, Sandstorm Top, and an item in the module's own words", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const arctic = compileActivations(item("Arctic Worm Chitin Shield"), { spellEffects })[0].plan;
    assert.deepEqual([arctic.builtin, arctic.zone.area, arctic.zone.centre, arctic.zone.saves[0].when, arctic.zone.saves[0].plan.resolution.check.basic], ["zone", { type: "emanation", value: 5 }, "self", ["end"], true]);
    assert.match(arctic.zone.notes.join(" "), /resistance 5 to cold/);
    const lantern = compileActivations(item("Alluring Lantern"), { spellEffects })[0].plan;
    const fascinated = lantern.zone.saves[0].plan.resolution.outcomes.failure.effects.find((effect) => effect.slug === "fascinated");
    assert.deepEqual([lantern.zone.area.value, lantern.zone.saves[0].when, fascinated.duration.anchor, fascinated.duration.expiry], [20, ["start"], "target-turn", "turn-end"]);
    const top = compileActivations(item("Sandstorm Top"), { spellEffects })[0].plan;
    assert.deepEqual([top.zone.centre, top.zone.range, top.zone.area, top.zone.saves[0].when, top.zone.lasts.unit], ["placed", 10, { type: "burst", value: 5 }, ["start", "enter"], "minutes"]);
    const stink = compileItem({ name: "Test Stink Paste", type: "consumable", system: { slug: null, level: { value: 8 }, category: "other", traits: { value: ["alchemical", "consumable"] }, usage: { value: "held-in-one-hand" }, uses: { max: 1, value: 1, autoDestroy: true }, description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (manipulate)</p><p>You daub the paste behind your ears. Creatures that end their turn adjacent to you must attempt a @Check[fortitude|dc:25] save or be @UUID[Compendium.pf2e.conditionitems.Item.fesd1n5eVhpCSS18]{Sickened 1} by the smell. These effects last for 1 minute.</p>" } } }, { spellEffects });
    assert.deepEqual([stink.builtin, stink.zone.saves[0].when, stink.zone.lasts.value, stink.zone.lasts.unit, stink.zone.saves[0].plan.resolution.outcomes.failure.effects[0].slug], ["zone", ["end"], 1, "minutes", "sickened"]);
});

test("a bonus for this turn's movement: Quick Runner's Shirt's +10-foot item bonus during its Strides, Cape of the Open Sky's to its Speed and fly Speed for that movement — until the end of the turn", () => {
    const thisTurn = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
    const shirt = compileActivations(item("Quick Runner's Shirt"), { spellEffects })[0].plan;
    assert.deepEqual(shirt.resolution.outcomes.success.modifiers, [{ selector: "land-speed", value: 10, type: "item", duration: thisTurn }]);
    assert.equal(shirt.partial, undefined);
    const cape = compileActivations(item("Cape of the Open Sky"), { spellEffects })[1].plan;
    assert.deepEqual(cape.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.duration.value]), [["land-speed", 15, 0], ["fly-speed", 15, 0]]);
    // (Its straight line is the note's.)
    assert.equal(cape.partial, true);
});

test("Mordant Mask's Pounding Surf: Deafened until the end of its user's next turn", () => {
    const mask = compileActivations(item("Mordant Mask"), { spellEffects })[0].plan;
    const [deafened] = mask.resolution.outcomes.success.effects;
    assert.deepEqual([deafened.slug, deafened.duration.expiry, deafened.duration.anchor], ["deafened", "turn-end", "source-turn"]);
});

test("a bonus to some actions' checks: Eye of the Wise's \"attempts to Decipher Writing, …, or Sense Motive\", Spectacles of Inquiry's Sense Motive against one creature (a note); not an aeon stone's resonant power", () => {
    const eye = compileActivations(item("Eye of the Wise"), { spellEffects })[1].plan;
    const [bonus] = eye.resolution.outcomes.success.modifiers;
    assert.deepEqual([bonus.selector, bonus.value, bonus.type], ["check", 2, "item"]);
    assert.deepEqual(bonus.predicate, [{ or: ["action:decipher-writing", "action:disable-a-device", "action:identify-magic", "action:pick-a-lock", "action:seek", "action:sense-motive"] }]);
    const spectacles = compileActivations(item("Spectacles of Inquiry"), { spellEffects })[0].plan;
    assert.deepEqual(spectacles.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["perception", 3, ["action:sense-motive"]]]);
    assert.equal(spectacles.partial, true);
    const stasis = compileActivations(item("Aeon Stone (Flickering)"), { spellEffects })[1].plan;
    assert.deepEqual(stasis.resolution.outcomes.success.modifiers, []);
});

test("healing back from dying without raising Wounded (Magical Medal (Phoenix's Fire)'s 1 Hit Point; Banner of the Rising Star's 30 for an ally in its aura), and a damage link's save with no \"damage\" word (Black Hole Armor)", () => {
    const medal = compileActivations(item("Magical Medal (Phoenix's Fire)"), { spellEffects })[0].plan;
    assert.deepEqual([medal.resolution.outcomes.success.effects.map((effect) => effect.kind), medal.item.keepWounded, medal.partial], [["heal"], true, undefined]);
    const banner = compileActivations(item("Banner of the Rising Star"), { spellEffects })[0].plan;
    assert.deepEqual([banner.resolution.outcomes.success.effects[0].amount, banner.item.recipient, banner.targeting.range, banner.item.keepWounded], [30, "targets", "30 feet", true]);
    const armor = compileActivations(item("Black Hole Armor"), { spellEffects })[1].plan;
    assert.deepEqual([armor.resolution.kind, armor.resolution.check.statistic, armor.resolution.check.basic, armor.targeting.area], ["save", "reflex", true, { type: "burst", value: 10 }]);
});

test("Cape of Justice's Force Shuriken: \"hits automatically and deals 1d4+1 force damage\" at the target, the designated offender's more a note; Swarmeater's Clasp's \"You recover 3d10+8 Hit Points\", the swarm's damage a note", () => {
    const cape = compileActivations(item("Cape of Justice"), { spellEffects })[0].plan;
    assert.deepEqual([cape.resolution.check.roll, cape.resolution.sharedDamage.components[0].formula, cape.resolution.sharedDamage.components[0].type, cape.targeting.target], ["automatic", "1d4+1", "force", "1 creature"]);
    assert.ok(cape.notes.some((note) => /designated offender takes 2d4\+2 force damage instead/.test(note)));
    const clasp = compileActivations(item("Swarmeater's Clasp"), { spellEffects })[0].plan;
    assert.deepEqual([clasp.resolution.outcomes.success.effects[0].formula, clasp.partial], ["3d10+8", true]);
});

test("Clockwork Helm: \"Make a spell or ranged attack roll (your choice)\" — the card's pick of its user's spell attack or best ranged Strike, 10d8 fire on a hit (doubled on a critical hit) and Drained 2", () => {
    const helm = compileActivations(item("Clockwork Helm"), { spellEffects })[0].plan;
    assert.deepEqual([helm.ownCheck.kind, helm.ownCheck.choose, helm.resolution.sharedDamage.components[0].formula, helm.resolution.sharedDamage.components[0].type], ["attack", ["spell", "ranged"], "10d8", "fire"]);
    assert.deepEqual(["success", "criticalSuccess"].map((degree) => [helm.resolution.outcomes[degree].damage.multiplier, helm.resolution.outcomes[degree].effects.map((effect) => `${effect.slug}${effect.value}`)]), [[1, ["drained2"]], [2, ["drained2"]]]);
});

test("North Wind's Night Verse: \"imparting a –5-foot status penalty to its Speeds for 1 round\" at the triggering creature — the creature targeted's penalty, not its user's", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const verse = compileActivations(item("North Wind's Night Verse"), { spellEffects })[0].plan;
    assert.deepEqual(verse.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration.value]), [["all-speeds", -5, "status", 1]]);
    assert.equal(routeOf(verse), "save");
    // (Not one only from later hits: Silkspinner's Shield's entangling shield bashes.)
    assert.notEqual(compileActivations(item("Silkspinner's Shield"), { spellEffects })[0].plan?.resolution?.outcomes?.success?.modifiers?.[0]?.selector, "all-speeds");
});

test("its user's bonus with a creature named stays on the item card (Spectacles of Inquiry), a target's penalty outright goes to the targets (North Wind's Night Verse)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    assert.equal(routeOf(compileActivations(item("Spectacles of Inquiry"), { spellEffects })[0].plan), "item");
    assert.equal(routeOf(compileActivations(item("North Wind's Night Verse"), { spellEffects })[0].plan), "save");
});
