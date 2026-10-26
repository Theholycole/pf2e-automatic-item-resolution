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
    // "You drop to 1 Hit Point instead …, and you gain 100 temporary Hit Points": the temporary Hit Points, the 1 Hit Point the card's (dropToOne).
    const [bastion] = compileActivations(item("Immortal Bastion"), { spellEffects });
    assert.deepEqual([bastion.plan.partial, bastion.plan.item.dropToOne], [undefined, true]);
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
    // "or until you use a hostile action, whichever comes first": another way it ends, a note Effect beside it since 2026-10-26.
    assert.deepEqual([Boolean(approach.plan.partial), approach.plan.resolution.outcomes.success.noteEffects[0].text], [false, "It ends sooner once you use a hostile action."]);
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
    // (The extra action's limit a note Effect beside the Quickened: src/compiler/honest.js withActionLimit.)
    assert.match(JSON.stringify(speed.resolution.outcomes.success.noteEffects), /only Step and Stride/, "the extra action's limit a note Effect");
    // (Viridian Crown's Elven Hope, "You can Sustain this Activation for up to 1 minute": its +3 for that minute, the Sustain a line of the
    // card — the plan whole, 2026-10-26.)
    const hope = compileActivations(item("Viridian Crown")).find((entry) => entry.activation.name === "Elven Hope").plan;
    assert.deepEqual([Boolean(hope.partial), hope.notes, hope.resolution.outcomes.success.modifiers.map((modifier) => [modifier.value, modifier.duration.value, modifier.duration.unit])], [false, ["It lasts while its user Sustains it, up to 1 minute: end its Effects sooner if they stop."], [[3, 1, "minutes"]]]);
});

test("activated ammunition whose own PF2e rules do it: a builtin with what they add, the rest of its text a note", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const [acid] = compileActivations(item("Elemental Ammunition (Moderate, Acid)"));
    assert.equal(acid.plan.builtin, "pf2e-rules");
    assert.deepEqual(acid.plan.notes, ["PF2e's own rules on Elemental Ammunition (Moderate, Acid) add 2d4 persistent acid damage and 2 splash acid damage to the Strike that fires it.", "After the damage roll, the splash card lists the creatures within 5 feet of the target for its splash."]);
    assert.equal(acid.plan.partial, undefined);
    const [magnetic] = compileActivations(item("Magnetic Shot (Lesser)"));
    assert.match(magnetic.plan.notes[0], /the deadly-d8 trait, two more weapon damage dice and a \+1 circumstance bonus to its attack roll against metal targets/);
    // Gravebane Ammunition's save, now read: the readied Strike's save for a creature with void healing (test/strike-flow.test.js), its damage
    // still PF2e's own rule.
    const [gravebane] = compileActivations(item("Gravebane Ammunition"));
    assert.deepEqual([gravebane.plan.builtin, gravebane.plan.strike.saveOnly, gravebane.plan.partial], [undefined, "void-healing", undefined]);
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
    // Ghast Stiletto's opening says which creature it's for ("the next living target struck"): not flavor — the dagger's next Strike and
    // the aura on the creature hit (src/compiler/hit-auras.js).
    const ghast = compileActivations(item("Ghast Stiletto"), { spellEffects })[0].plan;
    assert.deepEqual([ghast.noteOnly ?? false, ghast.strike?.zone?.area?.value], [false, 10]);
});

test("Bloodline Robe's Quickened on its user's next turn, its limit a note Effect; Life's Last Breath's save written without the word, its user's temporary Hit Points of the damage", () => {
    const robe = compileActivations(item("Bloodline Robe"), { spellEffects })[0].plan;
    assert.deepEqual(robe.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.expiry]), [["quickened", 1, "turn-end"]]);
    // (Its limit a note Effect beside the Quickened, for its time: src/compiler/honest.js withActionLimit.)
    assert.deepEqual([robe.unread, robe.resolution.outcomes.success.noteEffects.find((note) => note.label === "Quickened's extra action")?.text], [undefined, "You can use the extra action only as part of casting a bloodline spell."]);
    const breath = compileActivations(item("Life's Last Breath"), { spellEffects })[1].plan;
    assert.deepEqual([breath.resolution.check.statistic, breath.resolution.check.basic, breath.resolution.sharedDamage.components[0].formula, breath.resolution.outcomes.success.damage.mode], ["fortitude", false, "4d6[void]", "none"]);
    // (Its temporary Hit Points equal to the damage, 2026-10-25: on the rows that deal it, its user's — the core's temp-hp fromDamage — for a minute.)
    assert.deepEqual([breath.notes, breath.resolution.outcomes.failure.effects, breath.resolution.outcomes.success.effects], [undefined, [{ kind: "temp-hp", fromDamage: true, recipient: "self", duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" } }], []]);
    // Not a passive sentence's save: Dawnlight's flash for "Creatures with darkvision …" stays its casts'.
    assert.notEqual(compileActivations(item("Dawnlight (Major)"), { spellEffects })[0].plan?.resolution?.kind, "save");
});

test("Lacquered Waist Drum: a damage save in brackets as basic; its conditions only for a ghost, plan.ifTarget and not rows", () => {
    const [life, joy] = compileActivations(item("Lacquered Waist Drum"), { spellEffects }).map((entry) => entry.plan);
    assert.deepEqual([life.resolution.check.basic, life.resolution.sharedDamage.components[0].formula, life.targeting.range], [true, "5d8[vitality]", "30 feet"]);
    // (2026-10-25: the ghosts' at those degrees, test/reader-needs.test.js — no longer a note Effect to apply by hand.)
    assert.deepEqual([life.resolution.outcomes.failure.noteEffects, life.ifTarget.filter((entry) => entry.degree === "failure").map((entry) => entry.effects[0].slug)], [undefined, ["sickened"]]);
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => [joy.resolution.outcomes[degree].effects.length, joy.ifTarget.find((entry) => entry.degree === degree).effects[0].value]), [[0, 1], [0, 2]]);
    assert.equal(joy.partial, undefined);
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
    // The Midwife heals the creature it saves (the card's other recipient); The Survivor its user, after the 1 HP "instead" (dropToOne).
    assert.equal(at("The Midwife", 20).otherRecipient, true);
    const survivor = compileActivations({ ...item("The Survivor"), ownerLevel: 12 }, { spellEffects })[0].plan;
    assert.deepEqual([survivor.resolution.outcomes.success.effects, survivor.item.dropToOne, survivor.unread], [[{ kind: "heal", formula: "4d8+16" }], true, undefined]);
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

test("activations the ability compiler left to the GM, read: Heartstone's counteract, Pilferer's Gloves, Cloak of Repute, Armbands of the Gorgon, Blood of Iron", async () => {
    const at = (name, index = 0) => compileActivations(item(name), { spellEffects })[index].plan;
    const heartstone = at("Heartstone");
    assert.deepEqual([heartstone.builtin, heartstone.item.counteract.modifier, heartstone.item.counteract.rank, heartstone.item.counteract.afflictions], ["counteract", 18, 5, ["disease"]]);
    assert.deepEqual(at("Pilferer's Gloves").reroll.raise.change, { failure: "success", criticalFailure: "failure" });
    assert.deepEqual(at("Cloak of Repute").bonus.degree, { selector: "diplomacy", adjustment: { success: "one-degree-better" }, predicate: ["action:request"] });
    const armbands = at("Armbands of the Gorgon");
    assert.deepEqual([armbands.item.reduce[0].by, armbands.item.reduce[0].choose.includes("paralyzed"), armbands.item.reduce[0].held], ["all", true, true]);
    // (2026-10-26: whole — its permanent condition's suppression a note Effect for the hour; the card's picker only what its user has.)
    assert.deepEqual([Boolean(armbands.partial), armbands.notes, armbands.resolution.outcomes.success.noteEffects.map((note) => [note.label, note.duration.value, note.duration.unit])], [false, undefined, [["Permanent condition suppressed", 1, "hours"]]]);
    const { createItemCard } = await import("../src/live/card.js");
    assert.deepEqual(createItemCard({ plan: armbands, item: { name: "Armbands of the Gorgon" }, user: { name: "Gorgon" }, held: ["slowed", "frightened"] }).plan.item.reduce[0].choose, ["frightened", "slowed"]);
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
    // (2026-10-25: the unholy penalty their save card's, src/compiler/kind-saves.js; the counteract on its user still the GM's.)
    assert.deepEqual([gloves.notes.length, gloves.ifTarget], [1, [{ traits: ["unholy"], bonus: { value: -2, type: "item" } }]]);
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
    // (Its pop is its secondary effect: the ways card's second way, src/compiler/secondary.js.)
    const gum = compileItem(item("Crackling Bubble Gum (Lesser)"), { spellEffects, itemEffects }).ways[1].plan;
    assert.deepEqual(["failure", "criticalFailure"].map((degree) => gum.resolution.outcomes[degree].nativeEffects?.[0]?.label), ["Effect: Crackling Bubble Gum (Failure)", "Effect: Crackling Bubble Gum (Failure)"]);
    assert.equal(compileItem(item("Crackling Bubble Gum (Lesser)"), { spellEffects }).ways[1].plan.resolution.outcomes.failure.nativeEffects, undefined, "no durations known: only an Effect whose row has no time");
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
    // The 6d6 in its emanation; the minute of damage to whoever touches its wearer, its retaliation card beside (plan.alsoRetaliation).
    const mail = at("Thunder Mail");
    assert.deepEqual([mail.targeting.area, mail.resolution.sharedDamage.components[0].formula], [{ type: "emanation", value: 10 }, "6d6[electricity]"]);
    assert.deepEqual([mail.notes, mail.alsoRetaliation.retaliation.rounds], [undefined, 10]);
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
    // Its frightened lowered, its hour of immunity held to (item.immunity, scripts/immunity.js): whole.
    const salts = at("Serene Smelling Salts");
    assert.deepEqual([salts.noteOnly, salts.partial, salts.item.reduce, salts.item.immunity.slug, salts.item.immunity.duration], [undefined, undefined, [{ slug: "frightened", by: 1 }], "serene-smelling-salts", { value: 1, unit: "hours" }]);
    // "The tenor of what you write … determines the damage type …: acid for a caustic inscription, …": the card's picker.
    const missive = at("Explosive Missive");
    assert.deepEqual([missive.resolution.check.basic, missive.damageChoices.map((choice) => choice.formula)], [true, ["4d6[acid]", "4d6[cold]", "4d6[electricity]", "4d6[fire]", "4d6[sonic]"]]);
    // (Its critical failure's 1d4 persistent of the type picked: the choice's own component on that row, not doubled — not a note.)
    assert.deepEqual([missive.partial, missive.notes ?? [], missive.damageChoices[3].criticalPersistent], [undefined, [], "1d4[persistent,fire]"]);
    const { withDamageChoice } = await import("../src/compiler/beads.js");
    const fire = withDamageChoice(missive, 3);
    assert.deepEqual([fire.resolution.sharedDamage.components.map((component) => component.formula), fire.resolution.outcomes.criticalFailure.damage.componentMultipliers, fire.resolution.outcomes.failure.damage.sourceComponentIds], [["4d6[fire]", "1d4[persistent,fire]"], { "critical-persistent": 1 }, ["0"]]);
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
    // "An ally within the banner's aura becomes Quickened for 1 round": the targeted ally, its action's use a note Effect beside it.
    const banner = at("Zealous Banner");
    assert.deepEqual([banner.item.recipient, banner.resolution.outcomes.success.effects[0].slug, banner.partial], ["targets", "quickened", undefined]);
    // "On a successful Feint, the target is Dazzled for 1 round": the target's, only after the Feint succeeds (plan.gate: Apply checks it).
    const buckler = at("Glamorous Buckler");
    assert.deepEqual([buckler.resolution.outcomes.success.effects[0].slug, buckler.gate, buckler.notes], ["dazzled", { action: "feint" }, []]);
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
    // (Whom it's at the card's target now, 2026-10-26: not partial, no note — src/compiler/row-readings.js.)
    assert.deepEqual([banner.resolution.sharedDamage.components[0].formula, banner.targeting.range, Boolean(banner.partial), banner.notes], ["1d4[persistent,bleed]", "30 feet", false, undefined]);
    assert.match(banner.targeting.target, /dealt damage since the end of your last turn/);
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
    // (Crush Heart, one of its two options since 2026-10-26: its Slowed 2 after the stun, src/compiler/after-ends.js.)
    const heart = compileActivations(item("Heart of Sarnax"), { spellEffects }).find((entry) => entry.activation.name === "Two Hearts as One").plan.ways[1].plan;
    assert.deepEqual(slugs(heart, "criticalFailure"), ["stunned"], "slowed 2 only after the stun");
    assert.deepEqual([heart.afterEnds[0].when, heart.afterEnds[0].then.slug], ["stunned", "slowed"]);
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
    assert.deepEqual(timpani.success.manualInstructions ?? [], [], "the floor's by-hand line gone");
    const cuirass = compileActivations(item("Gleaming Cuirass"), { spellEffects }).find((entry) => entry.plan?.resolution?.kind === "save").plan.resolution.outcomes.criticalFailure.conditionFloor.duration;
    assert.deepEqual([cuirass.value, cuirass.unit], [1, "minutes"]);
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
    // (Now its zone, src/compiler/weakened-around.js: the holder's resistance inside it, the others' weakness.)
    assert.deepEqual([destabilizer.builtin, destabilizer.zone.inside.map((entry) => [entry.who, entry.rules[0].key, entry.rules[0].value]), destabilizer.partial], ["zone", [["own", "Resistance", 2], ["others", "Weakness", 2]], undefined]);
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
    assert.deepEqual([stink.builtin, stink.zone.saves[0].when, stink.zone.lasts.value, stink.zone.lasts.unit, stink.zone.saves[0].plan.resolution.outcomes.failure.effects[0].slug], ["zone", ["end"], 1, "minutes", "sickened"]);    // An emanation around its user, damage on entering it or starting a turn in it: Incendiary Plate's 15 feet for 10 minutes (difficult
    // terrain for others), Horn of Rust's 5 feet for 1 minute, its user's own Effect (+1 item AC) beside it.
    const plate = compileActivations(item("Incendiary Plate"), { spellEffects })[0].plan;
    assert.deepEqual([plate.builtin, plate.zone.area, plate.zone.centre, plate.zone.lasts.value, plate.zone.lasts.unit, plate.zone.saves[0].when, plate.zone.saves[0].plan.resolution.check.basic, plate.zone.saves[0].plan.resolution.check.against.value, plate.zone.terrain.length, plate.zone.others], ["zone", { type: "emanation", value: 15 }, "self", 10, "minutes", ["enter", "start"], true, 40, 1, true]);
    const horn = compileActivations(item("Horn of Rust"), { spellEffects })[1].plan;
    assert.deepEqual([horn.zone.area.value, horn.zone.saves[0].when, horn.ownEffect?.label], [5, ["start"], "Effect: Horn of Rust"]);
    assert.match(horn.zone.notes.join(" "), /exposed to a potent form of tetanus/);
    // Bloodburn Censer: its smoke's damage type picked on the ways card, each way the zone on its user's token — the Fortitude save as
    // it's made and on entering, that type's persistent damage, Enfeebled while it lasts.
    const censer = compileActivations(item("Bloodburn Censer"), { spellEffects })[0].plan;
    assert.deepEqual([censer.builtin, censer.once, censer.ways.map((way) => way.name)], ["ways", true, ["Fire", "Poison"]]);
    const smoke = censer.ways[1].plan.zone;
    const failure = smoke.saves[0].plan.resolution.outcomes.failure;
    assert.deepEqual([smoke.area, smoke.centre, smoke.saves[0].when, failure.effects.map((effect) => [effect.slug, effect.value, effect.duration])], [{ type: "emanation", value: 20 }, "self", ["initial", "enter"], [["enfeebled", 2, { mode: "while", persistent: "poison" }]]]);
    // Alkenstar Phalanx: its two 60-foot walls one 120-foot line placed through its user's space, greater difficult terrain, the basic
    // Fortitude save on entering and at a turn's start there.
    // Soulcutter's Soothe Souls: the aura on its user for its minute, its spirit damage at a turn's start only for fiends and undead (its
    // Heroic grade's a basic Will save), the living's healing a note.
    const soothe = compileActivations(item("Soulcutter"), { spellEffects }).find((entry) => /Soothe/.test(entry.activation.name ?? "")).plan.zone;
    assert.deepEqual([soothe.area, soothe.centre, soothe.lasts.value, soothe.damage], [{ type: "emanation", value: 20 }, "self", 1, [{ when: "start", only: { traits: ["fiend", "undead"] }, formulas: ["1d8[spirit]"] }]]);
    assert.match(soothe.notes.join(" "), /living creature that starts its turn in the area regains 1d8 Hit Points/);
    const heroic = compileActivations(item("Soulcutter (Heroic)"), { spellEffects }).find((entry) => /Soothe/.test(entry.activation.name ?? "")).plan.zone;
    assert.deepEqual([heroic.saves[0].only.traits, heroic.saves[0].plan.resolution.check.basic, heroic.saves[0].plan.resolution.check.against.value], [["fiend", "undead"], true, 38]);
    const phalanx = compileActivations(item("Alkenstar Phalanx"), { spellEffects })[0].plan.zone;
    assert.deepEqual([phalanx.area, phalanx.centre, phalanx.terrain, phalanx.saves[0].when, phalanx.saves[0].plan.resolution.check.basic, phalanx.saves[0].plan.resolution.check.against.value], [{ type: "line", value: 120 }, "placed", [{ movement: ["walk"], difficulty: 3 }], ["enter", "start"], true, 32]);
});

test("a bonus for this turn's movement: Quick Runner's Shirt's +10-foot item bonus during its Strides, Cape of the Open Sky's to its Speed and fly Speed for that movement — until the end of the turn", () => {
    const thisTurn = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
    const shirt = compileActivations(item("Quick Runner's Shirt"), { spellEffects })[0].plan;
    assert.deepEqual(shirt.resolution.outcomes.success.modifiers, [{ selector: "land-speed", value: 10, type: "item", duration: thisTurn }]);
    assert.equal(shirt.partial, undefined);
    // (Cape of the Open Sky's: all for its Stride or Fly — the move card's, its user's Speed and 15 feet, its straight line a line on it:
    // src/compiler/move.js.)
    const cape = compileActivations(item("Cape of the Open Sky"), { spellEffects })[1].plan;
    assert.deepEqual([cape.builtin, cape.teleport.speedTimes, cape.teleport.plus, cape.teleport.move.verb, cape.resolution, cape.partial], ["teleport", 1, 15, "Stride", undefined, undefined]);
    assert.deepEqual(cape.teleport.move.lines, ["Stride or Fly", "You can move only in a straight line"]);
});

test("Mordant Mask's Pounding Surf: Deafened until the end of its user's next turn", () => {
    const mask = compileActivations(item("Mordant Mask"), { spellEffects })[0].plan;
    const [deafened] = mask.resolution.outcomes.success.effects;
    assert.deepEqual([deafened.slug, deafened.duration.expiry, deafened.duration.anchor], ["deafened", "turn-end", "source-turn"]);
});

test("a bonus to some actions' checks: Eye of the Wise's \"attempts to Decipher Writing, …, or Sense Motive\", Spectacles of Inquiry's Sense Motive against the creature it marks; not an aeon stone's resonant power", () => {
    const eye = compileActivations(item("Eye of the Wise"), { spellEffects })[1].plan;
    const [bonus] = eye.resolution.outcomes.success.modifiers;
    assert.deepEqual([bonus.selector, bonus.value, bonus.type], ["check", 2, "item"]);
    assert.deepEqual(bonus.predicate, [{ or: ["action:decipher-writing", "action:disable-a-device", "action:identify-magic", "action:pick-a-lock", "action:seek", "action:sense-motive"] }]);
    const spectacles = compileActivations(item("Spectacles of Inquiry"), { spellEffects })[0].plan;
    assert.deepEqual(spectacles.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.predicate]), [["perception", 3, ["action:sense-motive", "target:mark:spectacles-of-inquiry-mark"]]]);
    // (Its investigator's way to use it a line of the card, 2026-10-26: whole.)
    assert.deepEqual([spectacles.item.recipient, spectacles.item.mark, Boolean(spectacles.partial), spectacles.notes], ["user", { slug: "spectacles-of-inquiry-mark", duration: null }, false, ["If you're an investigator, you can use this activation as part of the action you take to Devise a Stratagem or Pursue a Lead, and you can do the latter even though you can't see the creature."]]);
    const stasis = compileActivations(item("Aeon Stone (Flickering)"), { spellEffects })[1].plan;
    assert.deepEqual(stasis.resolution.outcomes.success.modifiers, []);
});

test("bonuses against the creature marked (PF2e's TokenMark): Oathbow's extra 1d6 on the bow's Strikes for 7 days, its Survival to Track on the whole roll; the card's line and the mark's Effect", async () => {
    const { markText, markEffectSource, strikeDamageText } = await import("../src/live/card.js");
    const oath = compileActivations(item("Oathbow"), { spellEffects })[0].plan;
    const [extra] = oath.item.strikeDamage;
    assert.deepEqual([extra.diceNumber, extra.dieSize, extra.own, extra.predicate, `${extra.duration.value} ${extra.duration.unit}`], [1, "d6", true, ["target:mark:oathbow-mark"], "7 days"]);
    assert.deepEqual(oath.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.predicate]), [["survival", ["action:track"]]]);
    assert.equal(strikeDamageText(extra), "+1d6 damage on the weapon's Strikes against the marked creature for 7 days");
    assert.equal(markText(oath.item.mark, "Goblin"), "Marks Goblin (its bonuses against that creature alone) for 7 days");
    const source = markEffectSource(oath.item.mark, { token: "Scene.s.Token.t", name: "Goblin", item: { name: "Oathbow" } });
    assert.deepEqual([source.name, source.system.rules, source.system.duration.value, source.system.duration.unit], ["Oathbow: Goblin marked", [{ key: "TokenMark", slug: "oathbow-mark", uuid: "Scene.s.Token.t" }], 7, "days"]);
});

test("one-off readings: Sky Hammer's Comet Fall a 6th-rank arcane Fireball at DC 45, Worldscale Shield's blow absorbed (immunity to physical damage for that attack, a Mythic Point, the shield broken), Avalanche Boots' Shove pushed farther (three ways at the creature targeted)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { readiedRules, readiedWords } = await import("../src/live/fortune-card.js");
    const { spellIndex } = await import("../src/compiler/index.js");
    const spells = spellIndex(readDocuments(path.join(`${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`, "spells")).filter((doc) => doc.collection === "items"));
    const hammer = compileActivations(item("Sky Hammer"), { spellEffects, spells })[0].plan;
    assert.deepEqual([hammer.builtin, hammer.spell?.name, hammer.rank, hammer.dc, hammer.tradition], ["cast-spell", "Fireball", 6, 45, "arcane"]);
    const shield = compileActivations(item("Worldscale Shield"), { spellEffects })[0].plan;
    assert.deepEqual([routeOf(shield), shield.bonus.immunity, shield.bonus.breaks, shield.spend], ["fortune", { type: "physical" }, true, { mythicPoints: 1 }]);
    assert.deepEqual(readiedRules(shield), [{ key: "Immunity", type: "physical" }]);
    assert.equal(readiedWords(shield), "immunity to physical damage, against what triggered it, this turn");
    const boots = compileActivations(item("Avalanche Boots"), { spellEffects })[0].plan;
    assert.deepEqual(boots.ways.map((way) => [way.name, routeOf(way.plan), way.plan.resolution.outcomes.success.forcedMovement.distance, way.plan.resolution.outcomes.success.effects.map((effect) => effect.slug)]), [
        ["After a success: 5 feet more", "save", 5, []],
        ["After a critical success: 10 feet more", "save", 10, []],
        ["After a critical success: 10 feet more, and Prone", "save", 10, ["prone"]]
    ]);
});

test("healing back from dying without raising Wounded (Magical Medal (Phoenix's Fire)'s 1 Hit Point; Banner of the Rising Star's 30 for an ally in its aura; Guardian Rose), and a damage link's save with no \"damage\" word (Black Hole Armor)", async () => {
    const medal = compileActivations(item("Magical Medal (Phoenix's Fire)"), { spellEffects })[0].plan;
    assert.deepEqual([medal.resolution.outcomes.success.effects.map((effect) => effect.kind), medal.item.keepWounded, medal.partial], [["heal"], true, undefined]);
    const banner = compileActivations(item("Banner of the Rising Star"), { spellEffects })[0].plan;
    assert.deepEqual([banner.resolution.outcomes.success.effects[0].amount, banner.item.recipient, banner.targeting.range, banner.item.keepWounded], [30, "targets", "30 feet", true]);
    const armor = compileActivations(item("Black Hole Armor"), { spellEffects })[1].plan;
    assert.deepEqual([armor.resolution.kind, armor.resolution.check.statistic, armor.resolution.check.basic, armor.targeting.area], ["save", "reflex", true, { type: "burst", value: 10 }]);
    // (Never knocked out, Guardian Rose's "you avoid being knocked out and regain 2d8+5 Hit Points": the healing ends the Dying PF2e gave it,
    // no Wounded for it; not False Death Vial's, whose Wounded increases.)
    const { compileItem } = await import("../src/compiler/index.js");
    const rose = compileItem(item("Guardian Rose"));
    assert.deepEqual([rose.resolution.outcomes.success.effects.map((effect) => effect.kind), rose.item.keepWounded, rose.partial, rose.unread], [["heal", "condition"], true, undefined, undefined]);
    assert.notEqual(compileItem(item("False Death Vial"))?.item?.keepWounded, true);
    // (Left at 1 Hit Point instead of 0: The Survivor's healing after it, its dice by its owner's level; Immortal Bastion's 100 temporary Hit Points.)
    const survivor = (level) => compileActivations({ ...item("The Survivor"), ownerLevel: level }, { spellEffects })[0].plan;
    assert.deepEqual([survivor(12).item.dropToOne, survivor(12).resolution.outcomes.success.effects.map((effect) => effect.formula), survivor(18).resolution.outcomes.success.effects.map((effect) => effect.formula), survivor(18).partial], [true, ["4d8+16"], ["6d8+24"], undefined]);
    assert.match(survivor(null).unread.join(" "), /increases to 5d8\+20 if you are at least 15th level/, "with no owner level, the steps a note");
    const bastion = compileActivations(item("Immortal Bastion"), { spellEffects })[0].plan;
    assert.deepEqual([bastion.item.dropToOne, bastion.resolution.outcomes.success.effects.map((effect) => [effect.kind, effect.amount]), bastion.partial], [true, [["temp-hp", 100]], undefined]);
    // (Healing from an amount whose sentence says more, Grisly Scythe's "…, and the creature struck becomes Sickened 1 from the agony": the
    // sentence stays a note, not lost.)
    // (Another of its activations recharged, Smoldering Armor's "The fire shield activation recharges": the first one, by its words.)
    const smoldering = compileActivations(item("Smoldering Armor"), { spellEffects })[1].plan;
    assert.deepEqual([smoldering.item.recharges, smoldering.partial], [{ index: 0, name: "fire shield" }, undefined]);
    const scythe = compileActivations(item("Grisly Scythe"), { spellEffects })[0].plan;
    assert.ok(scythe.partial && scythe.unread.some((sentence) => /the creature struck becomes Sickened 1/.test(sentence)), JSON.stringify(scythe.unread));
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

test("an item thrown as a Strike PF2e can't roll: its user's thrown attack against AC, a hit's damage and conditions (Lady's Chalice's 2d6 spirit, Halcyon Heart's net, Rod of Razors' flechettes); its splash a note; deadly, volley and range increments read", async () => {
    const [, chalice] = compileActivations(item("Lady's Chalice"), { spellEffects });
    assert.deepEqual([chalice.plan.ownCheck.choose, chalice.plan.resolution.check.against.statistic, chalice.plan.resolution.sharedDamage.components[0].formula, chalice.plan.resolution.sharedDamage.components[0].type, chalice.plan.targeting.range], [["thrown"], "ac", "2d6", "spirit", "5 feet"]);
    assert.match(chalice.plan.notes.join(" "), /Its splash: 2 spirit splash damage/);
    const [net] = compileActivations(item("Halcyon Heart"), { spellEffects });
    assert.deepEqual([net.plan.resolution.outcomes.success.effects.map((effect) => effect.slug), net.plan.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug), net.plan.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value])], [["off-guard"], ["off-guard", "immobilized"], [["all-speeds", -10]]]);
    assert.match(net.plan.notes.join(" "), /The Escape DC is 44, and the net has a counteract rank of 9 and a counteract modifier of \+38\./);
    const [razors] = compileActivations(item("Rod of Razors"), { spellEffects });
    // (Its deadly d10 a component of the critical hit's alone, not doubled; its adamantine in the damage's flavor; volley and its range increment
    // the attack's penalty for distance.)
    assert.deepEqual([razors.plan.resolution.sharedDamage.components.map((component) => component.formula), razors.plan.targeting.range, razors.plan.resolution.outcomes.criticalSuccess.damage, razors.plan.resolution.outcomes.success.damage.sourceComponentIds, razors.plan.ownCheck, razors.plan.partial], [["3d8[piercing,adamantine]", "1d10[piercing,adamantine]"], "100 feet", { mode: "shared", multiplier: 2, sourceComponentIds: ["0", "deadly"], componentMultipliers: { deadly: 1 } }, ["0"], { kind: "attack", modifier: null, choose: ["thrown"], increment: 100, volley: 30, deadly: "d10" }, undefined]);
    const { distancePenalty, withAttackChoice } = await import("../src/live/poison-card.js");
    assert.deepEqual([distancePenalty(razors.plan.ownCheck, 25).penalty, distancePenalty(razors.plan.ownCheck, 60).penalty, distancePenalty(razors.plan.ownCheck, 150).penalty, Boolean(distancePenalty(razors.plan.ownCheck, 650).out)], [2, 0, 2, true]);
    assert.equal(withAttackChoice(razors.plan, { attackChoices: [{ kind: "thrown", modifier: 9 }], attackPenalty: 2 }).resolution.check.modifier, 7);
    // (Sack of Rotten Fruit's 20-foot range increment: –4 at 50 feet.)
    const sack = (await import("../src/compiler/index.js")).compileItem(item("Sack of Rotten Fruit"));
    assert.deepEqual([sack.ownCheck.increment, distancePenalty(sack.ownCheck, 50).penalty, sack.partial], [20, 4, undefined]);
});

test("a save's degrees in sentences (Gearblade: DC 36 Reflex, 3d12 bludgeoning on a failure, 6d12 on a critical failure, the limb a line for the GM); damage as many as the weapon's dice (Scizore of the Crab); a plain skill check against the triggering creature's DC (Shadowmist Cape's Stealth, Storyteller's Opus's Deception)", () => {
    const [gearblade] = compileActivations(item("Gearblade"), { spellEffects });
    const outcomes = gearblade.plan.resolution.outcomes;
    assert.deepEqual([gearblade.plan.resolution.check.statistic, gearblade.plan.resolution.check.against.value, outcomes.failure.damage.formulas[0].formula, outcomes.criticalFailure.damage.formulas[0].formula, outcomes.success.damage.mode], ["reflex", 36, "3d12[bludgeoning]", "6d12[bludgeoning]", "none"]);
    assert.match(outcomes.criticalFailure.manualInstructions[0], /the limb becomes unusable until healed by a Regenerate spell/);
    const [, pinch] = compileActivations(item("Scizore of the Crab"), { spellEffects });
    assert.deepEqual(pinch.plan.resolution.sharedDamage.components.map((component) => component.formula), ["1[slashing]"]);
    const [shadowmist] = compileActivations(item("Shadowmist Cape"), { spellEffects });
    assert.deepEqual([shadowmist.plan.resolution.check.statistic, shadowmist.plan.resolution.check.against], ["stealth", { dc: "target", statistic: "perception" }]);
    assert.deepEqual([shadowmist.plan.resolution.outcomes.success.effects, shadowmist.plan.resolution.outcomes.success.manualInstructions], [[], ["{source} (success): you're Hidden from that creature until the end of your next turn or until right after you use a hostile action against that creature (by hand)."]], "its user's, not the creature's");
    const [opus] = compileActivations(item("Storyteller's Opus"), { spellEffects });
    assert.equal(opus.plan.resolution.check.statistic, "deception");
});

test("an artifact's Destruction isn't its activation's (Spleen Bloodstone of Arazni's explosion, Orb of Dragonkind's 90 feet); the orb's breath a basic Reflex save, its dragon's damage type picked on the card; Pacifying's save a –2 attack penalty for 1 minute, not on its nonlethal attacks", () => {
    const [, breath] = compileActivations(item("Orb of Dragonkind"), { spellEffects });
    assert.deepEqual([breath.plan.resolution.check.statistic, breath.plan.resolution.check.basic, breath.plan.resolution.check.against.value, breath.plan.targeting.range, breath.plan.targeting.area], ["reflex", true, 40, null, { type: "cone", value: 60 }]);
    assert.deepEqual(breath.plan.damageChoices.slice(0, 3).map((choice) => [choice.label, choice.formula]), [["Acid", "25d6[acid]"], ["Cold", "25d6[cold]"], ["Electricity", "25d6[electricity]"]]);
    assert.ok(breath.plan.notes.includes("Its area: a 60-foot cone or a 100-foot line, its user's choice (place the other by hand)."));
    const spleen = compileActivations(item("Spleen Bloodstone of Arazni"), { spellEffects });
    assert.ok(spleen.every((entry) => !/explodes/i.test(JSON.stringify(entry.plan ?? {}))), "its Destruction's explosion read nowhere");
    const [pacifying] = compileActivations(item("Pacifying"), { spellEffects });
    assert.deepEqual([pacifying.plan.resolution.check.statistic, pacifying.plan.resolution.outcomes.failure.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.duration.value, modifier.duration.unit])], ["will", [["attack-roll", -2, 1, "minutes"]]]);
    // (Its nonlethal attacks exempt: the penalty predicated on the attack not being nonlethal, PF2e's item:trait:nonlethal — no note.)
    assert.deepEqual([pacifying.plan.resolution.outcomes.failure.modifiers[0].predicate, pacifying.plan.notes, pacifying.plan.partial], [[{ not: "item:trait:nonlethal" }], [], undefined]);
});

test("more one-offs: Aerekostes's next attack rolled twice, Anointed Waterskin's Bless, Mirror Robe's Create a Diversion at +9, Beekeeper's Smoker's concealing square, Deravon's Helm's save or Prone, Smoldering Armor's Fire Shield, Stone of Unrivaled Skill's +3 to any skill picked", async () => {
    const [forward] = compileActivations(item("Aerekostes"), { spellEffects });
    assert.deepEqual([forward.plan.builtin, forward.plan.rollTwice.selector, forward.plan.rollTwice.keep], ["roll-twice", "attack-roll", "higher"]);
    // (Its time, "before the end of your next turn": the fortune Effect's, to the end of the next turn — not a note.)
    const { fortuneEffectSource } = await import("../src/live/fortune-card.js");
    assert.deepEqual([forward.plan.notes, forward.plan.partial, fortuneEffectSource({ state: { plan: forward.plan, item: { name: "Aerekostes" }, user: {} }, moduleId: "x" }).system.duration], [[], undefined, { value: 1, unit: "rounds", expiry: "turn-end", sustained: false }]);
    const [, , sip] = compileActivations(item("Anointed Waterskin"), { spellEffects });
    assert.equal(sip.plan.resolution.applications[0].label, "Spell Effect: Bless");
    const { compileBasicActions, BASIC_ACTIONS } = await import("../../pf2e-automatic-ability-resolution/src/compiler/index.js");
    const basicActions = compileBasicActions(readDocuments(path.join(PACKS, "actions")).filter((doc) => doc.collection === "items" && BASIC_ACTIONS.includes(doc.system?.slug)));
    const [robe] = compileActivations(item("Mirror Robe"), { spellEffects, basicActions });
    assert.deepEqual([robe.plan.resolution.check.statistic, robe.plan.resolution.check.modifier, robe.plan.resolution.check.against.statistic], ["deception", 9, "perception"]);
    // (Anima Robe (Heroic)'s Billowing Distraction, 2026-10-26: its Feint with no number, at its stat block's Deception +35 — PF2e's Feint rows.)
    const [billow] = compileActivations(item("Anima Robe (Heroic)"), { spellEffects, basicActions });
    assert.deepEqual([billow.plan.resolution.check.statistic, billow.plan.resolution.check.modifier, billow.plan.resolution.check.against.statistic, billow.plan.resolution.outcomes.success.effects[0].slug, Boolean(billow.plan.partial)], ["deception", 35, "perception", "off-guard", false]);
    const [smoker] = compileActivations(item("Beekeeper's Smoker"), { spellEffects });
    assert.deepEqual([smoker.plan.builtin, smoker.plan.zone.area, smoker.plan.zone.centre, smoker.plan.zone.concealed, smoker.plan.zone.lasts], ["zone", { type: "square", value: 5 }, "placed", true, null]);
    assert.ok(smoker.plan.zone.notes.includes("It lasts 1d4 rounds: roll them and remove it by hand."));
    const [helm] = compileActivations(item("Deravon's Helm"), { spellEffects });
    assert.deepEqual([helm.plan.resolution.check.statistic, helm.plan.resolution.outcomes.failure.effects.map((effect) => effect.slug)], ["will", ["prone"]]);
    // (Its critical failure's whole next turn spent Prone a note Effect on that row, 2026-10-26: whole.)
    assert.deepEqual([helm.plan.resolution.outcomes.criticalFailure.noteEffects.map((note) => note.label), Boolean(helm.plan.partial), helm.plan.notes], [["Stays Prone"], false, undefined]);
    const [armor] = compileActivations(item("Smoldering Armor"), { spellEffects });
    assert.equal(armor.plan.resolution.applications[0].label, "Spell Effect: Fire Shield");
    const [stone] = compileActivations(item("Stone of Unrivaled Skill"), { spellEffects });
    assert.deepEqual([stone.plan.item.skillPick.skills.length, stone.plan.item.skillPick.modifier, stone.plan.item.skillPick.duration.value], [16, { value: 3, type: "status" }, 10]);
});

test("cover against what triggered it (Limestone Shield: +2 circumstance to AC and Reflex saves for that effect) and PF2e's Recall Knowledge with an item's bonus (Jug of Fond Remembrance: +2 circumstance, its degree and Stupefied the card's words)", async () => {
    const [, block] = compileActivations(item("Limestone Shield"), { spellEffects });
    assert.deepEqual([block.plan.builtin, block.plan.bonus.modifiers.map((modifier) => [modifier.selector, modifier.type, modifier.value])], ["readied-bonus", [["ac", "circumstance", 2], ["reflex", "circumstance", 2]]]);
    const [jug] = compileActivations(item("Jug of Fond Remembrance"), { spellEffects });
    assert.deepEqual([jug.plan.builtin, jug.plan.action.slug, jug.plan.action.bonus], ["item-action", "recall-knowledge", { value: 2, type: "circumstance" }]);
    assert.match(jug.plan.action.after, /Stupefied 1 for 3 rounds/);
});

test("effects its user picks one of, in a sentence (Heartripper Blade): the ways card's 2d8 healing or a clumsy, enfeebled or stupefied value lowered by 1, the affliction's stage by hand", () => {
    const [, siphon] = compileActivations(item("Heartripper Blade"));
    assert.equal(siphon.plan.builtin, "ways");
    assert.deepEqual(siphon.plan.ways.map((way) => way.name), ["Restore 2d8 Hit Points", "Reduce the value of your Clumsy, Enfeebled, or Stupefied conditions by 1"]);
    const [heal, lower] = siphon.plan.ways;
    assert.deepEqual(heal.plan.resolution.native.healing.components.map((component) => component.formula), ["2d8"]);
    assert.deepEqual(lower.plan.item.reduce, [{ choose: ["clumsy", "enfeebled", "stupefied"], by: 1 }]);
    assert.deepEqual([lower.plan.item.activation.index, lower.plan.item.activation.time], [1, "reaction"]);
    assert.equal(siphon.plan.partial, true);
    assert.match(siphon.plan.notes[0], /^Or: reduce the stage of one toxin or disease .* \(by hand\)\.$/);
});

test("conditions that end on its user (Spleen Bloodstone of Arazni's Break Bonds: each one to 0, its Speed penalties and exception a note); a portion rubbed in (Tallowheart Mass: Quickened for 1 minute, its extra action's limit a note Effect)", () => {
    const [, bonds] = compileActivations(item("Spleen Bloodstone of Arazni"));
    assert.deepEqual(bonds.plan.item.reduce.map((entry) => `${entry.slug}:${entry.by}`), ["confused:all", "controlled:all", "grabbed:all", "immobilized:all", "paralyzed:all", "petrified:all", "restrained:all"]);
    assert.match(bonds.plan.notes[0], /as well as any Speed penalties affecting you, immediately end unless/);
    const [rubbed] = compileActivations(item("Tallowheart Mass"));
    assert.deepEqual(rubbed.plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.unit]), [["quickened", 1, "minutes"]]);
    assert.deepEqual([rubbed.plan.notes, rubbed.plan.resolution.outcomes.success.noteEffects.find((note) => note.label === "Quickened's extra action")?.text], [undefined, "You can use the extra action each round only for Strike actions made with weapons you wield in your hands."]);
});

test("a short teleport for its user (Dweomerveil, Mad Mammoth's Juke, Golden Spur, Mercurial Mantle, Gloaming Shard): the teleport card's range, from its user or the creature targeted; not within some feet of another thing", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { routeOf } = await import("../src/live/route.js");
    const { teleportText } = await import("../src/live/teleport-card.js");
    const [leap] = compileActivations(item("Dweomerveil"));
    // (Farther after a critical success: the card's tick.)
    assert.deepEqual([routeOf(leap.plan), leap.plan.teleport, leap.plan.partial, leap.plan.notes], ["teleport", { within: 30, speedTimes: null, from: "self", critical: { within: 45 } }, undefined, undefined]);
    const { teleportLines, teleportCardHTML, createTeleportCard } = await import("../src/live/teleport-card.js");
    assert.deepEqual(teleportLines(leap.plan.teleport), ["Within 45 feet instead if the triggering save was a critical success (tick it before Pick)"]);
    assert.match(teleportCardHTML(createTeleportCard({ plan: leap.plan, item: { name: "Dweomerveil" }, user: { name: "Leaper" } }), { canApply: true }), /data-air-field="critical"/);
    // (Its user alone, Mad Mammoth's Juke's "can't bring any other creature": the card's line, not a note.)
    const juke = compileItem(item("Mad Mammoth's Juke"));
    assert.deepEqual([juke.teleport.alone, juke.partial], [{ used: false }, undefined]);
    assert.equal(compileActivations(item("Master Magus Ring"))[1].plan.teleport.alone.used, true, "the activation fails and is used");
    assert.equal(teleportText(compileItem(item("Mad Mammoth's Juke")).teleport), "Up to 200 feet");
    assert.equal(teleportText(compileItem(item("Golden Spur")).teleport), "Within 10 feet of the creature targeted");
    const [, twirl] = compileActivations(item("Mercurial Mantle"));
    assert.equal(teleportText(twirl.plan.teleport, { speed: 25 }), "Up to double its user's Speed (50 feet)");
    assert.equal(teleportText(compileActivations(item("Gloaming Shard"))[0].plan.teleport), "To a space adjacent to the creature targeted");
    assert.notEqual(compileActivations(item("Spear of the Destroyer's Flame"))[0].plan?.builtin, "teleport");
    // ("within a range equal to your Speed", Master Magus Ring: once its Speed.)
    assert.equal(teleportText(compileActivations(item("Master Magus Ring"))[1].plan.teleport, { speed: 30 }), "Up to its user's Speed (30 feet)");
    // (Quartz-Coil Rail Transport's "transport yourself … up to 40 feet away", its 4 electricity to its user and the creatures on the line between
    // the card's; Dimension Shot's space beside the creature hit.)
    const coil = compileItem(item("Quartz-Coil Rail Transport (Moderate)"));
    assert.deepEqual([routeOf(coil), coil.teleport.within, coil.teleport.line, coil.partial, coil.notes], ["teleport", 40, { formula: "4", type: "electricity" }, undefined, undefined]);
    assert.ok(teleportLines(coil.teleport).includes("4 electricity damage to its user and each creature in the line between where it was and where it lands"));
    assert.equal(teleportText(compileActivations(item("Dimension Shot"))[0].plan.teleport), "To a space adjacent to the creature targeted");
});

test("allies in an area put in a condition, read without an Effect heading (a third-party scepter: its user and the allies within 30 feet Quickened for 1 minute, the extra action's limit a note Effect)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    const scepter = read(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-magic/packs/items`).find((doc) => doc.collection === "items" && doc.name === "Scepter of Quickening");
    if (!scepter) return;
    const [, hasten] = compileActivations(scepter);
    assert.deepEqual([routeOf(hasten.plan), hasten.plan.allyArea], ["save", true]);
    assert.deepEqual(hasten.plan.resolution.outcomes.success.effects.map((effect) => [effect.slug, effect.duration.value, effect.duration.unit]), [["quickened", 1, "minutes"]]);
    // (The extra action's limit a note Effect beside the Quickened, src/compiler/honest.js withActionLimit.)
    assert.deepEqual([hasten.plan.notes, hasten.plan.resolution.outcomes.success.noteEffects.some((note) => note.label === "Quickened's extra action")], [undefined, true]);
});

test("a ray of stored energy at its user's spell attack (a third-party power ring's Release Power): 5d4 doubled on a critical hit, its energy type picked on the card", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { readDocuments: read } = await import("../../pf2e-automatic-ability-resolution/tools/leveldb.mjs");
    const ring = read(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-magic/packs/items`).find((doc) => doc.collection === "items" && doc.name === "Energy");
    if (!ring) return;
    const release = compileActivations(ring).find((entry) => entry.activation.name === "Release Power");
    assert.deepEqual([routeOf(release.plan), release.plan.ownCheck.choose], ["save", ["spell"]]);
    assert.deepEqual(release.plan.resolution.sharedDamage.components.map((component) => component.formula), ["5d4[untyped]"]);
    assert.deepEqual([release.plan.resolution.outcomes.criticalSuccess.damage.multiplier, release.plan.resolution.outcomes.success.damage.multiplier], [2, 1]);
    assert.deepEqual(release.plan.damageChoices.map((choice) => choice.formula), ["5d4[acid]", "5d4[cold]", "5d4[electricity]", "5d4[fire]", "5d4[force]", "5d4[sonic]", "5d4[vitality]", "5d4[void]"]);
});

test("damage only the table knows the amount of (Twisting Gale's Strike damage again, Juggernaut Plate's distance, Kaldemash's Lament's barrage, Conflagration Club's dice per charge): a basic save's damage typed on the save card, the club's energy type picked there", async () => {
    const { scaledFormula, scaledPlan } = await import("../src/compiler/scaled.js");
    const { routeOf } = await import("../src/live/route.js");
    const gale = compileActivations(item("Twisting Gale")).find((entry) => entry.activation.name === "Sonic Gale").plan;
    assert.deepEqual([routeOf(gale), gale.scaled, gale.resolution.check.basic, gale.resolution.check.against], ["save", { of: "your normal Strike damage" }, true, { dc: "owner", statistic: "class" }]);
    assert.equal(scaledPlan(gale, 23).resolution.sharedDamage.components[0].formula, "23[sonic]");
    const ram = compileActivations(item("Juggernaut Plate")).find((entry) => entry.activation.name === "Ram").plan;
    assert.deepEqual([ram.scaled.of, ram.resolution.check.against.value, ram.resolution.sharedDamage.components[0].formula], ["the total distance traveled in feet", 39, "1[bludgeoning]"]);
    assert.equal(compileActivations(item("Kaldemash's Lament"))[2].plan.scaled.of, "your Strike damage");
    const cone = compileActivations(item("Conflagration Club")).find((entry) => entry.activation.name === "Explosive Cone").plan;
    assert.deepEqual([cone.scaled, cone.damageChoices.map((choice) => choice.formula)], [{ of: "charge stored in the club", die: "d6" }, ["1d6[acid]", "1d6[cold]", "1d6[electricity]", "1d6[fire]", "1d6[sonic]"]]);
    assert.equal(scaledFormula("1d6[fire]", cone.scaled, 4), "4d6[fire]");
    // (A consumable's too: Rebound Fulu's damage back at the foe, the lesser of its shield's Hardness and the blocked damage — the mark off its row.)
    const { compileItem } = await import("../src/compiler/index.js");
    const fulu = compileItem(item("Rebound Fulu"));
    assert.deepEqual([routeOf(fulu), fulu.resolution.sharedDamage.components[0].formula, fulu.resolution.outcomes.success.manualInstructions], ["save", "1[untyped]", undefined]);
    assert.match(fulu.scaled.of, /^your shield's Hardness or the damage it would have dealt/);
});

test("a breath that's its user's draconic benefactor's (Pact of the Herald and Host): the ways card's Fortitude, Reflex or Will, each a basic save at the better of its user's class and spell DCs in the cone, 1d6 per level of the dragon's damage type picked on the card", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const [breath] = compileActivations(item("Pact of the Herald and Host"));
    assert.deepEqual([breath.plan.builtin, breath.plan.ways.map((way) => way.name)], ["ways", ["Fortitude", "Reflex", "Will"]]);
    const reflex = breath.plan.ways[1].plan;
    assert.deepEqual([routeOf(reflex), reflex.resolution.check.statistic, reflex.resolution.check.basic, reflex.resolution.check.against], ["save", "reflex", true, { dc: "owner", statistic: "class-spell" }]);
    assert.deepEqual([reflex.targeting.area, reflex.resolution.sharedDamage.components[0].formula], [{ type: "cone", value: 30 }, "(@actor.level)d6[untyped]"]);
    assert.equal(reflex.damageChoices.find((choice) => choice.label === "Fire").formula, "(@actor.level)d6[fire]");
    // (Its 1d4 rounds' wait the plan's trigger.recharge now, kept on the item — src/compiler/cooldown.js, 2026-10-26.)
    assert.deepEqual([reflex.item.activation.frequency.per, breath.plan.notes, breath.plan.trigger.recharge], ["day", undefined, { formula: "1d4", unit: "rounds" }]);
});

test("a cast in other words, \"as if you cast\" (Crown of the Companion's Share Life at the ally): the spell module's cast, its healing after a note; not a ritual (Whisperer of Souls)", async () => {
    const { spellIndex } = await import("../src/compiler/index.js");
    const spells = spellIndex(readDocuments(path.join(`${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`, "spells")).filter((doc) => doc.collection === "items"));
    const [bond] = compileActivations(item("Crown of the Companion"), { spells });
    assert.deepEqual([bond.plan.builtin, bond.plan.spell.name], ["cast-spell", "Share Life"]);
    assert.ok(bond.plan.notes.includes("At the end of the spell's duration, your ally recovers 4d8 Hit Points and you recover half of what they recover."));
    assert.notEqual(compileActivations(item("Whisperer of Souls"), { spells })[0].plan?.builtin, "cast-spell");
});

test("a roll on its own table (Madcap Top's d20, Pistol of Wonder's d%): each row compiled alone — a spell it names cast at the table's DC and attack, a row nothing reads its words for the GM", async () => {
    const { spellIndex } = await import("../src/compiler/index.js");
    const { routeOf } = await import("../src/live/route.js");
    const { rowFor } = await import("../src/compiler/random-table.js");
    const spells = spellIndex(readDocuments(path.join(`${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`, "spells")).filter((doc) => doc.collection === "items"));
    const [spin] = compileActivations(item("Madcap Top"), { spells });
    assert.deepEqual([routeOf(spin.plan), spin.plan.table.die, spin.plan.table.rows.length], ["table", "1d20", 20]);
    const slow = rowFor(spin.plan.table, 2).plan;
    assert.deepEqual([slow.builtin, slow.spell.name, slow.dc, slow.attack], ["cast-spell", "Slow", 27, 17]);
    assert.equal(rowFor(spin.plan.table, 13).plan, undefined);
    const [shot] = compileActivations(item("Pistol of Wonder"), { spells });
    assert.deepEqual([shot.plan.table.die, rowFor(shot.plan.table, 6).plan.spell.name, rowFor(shot.plan.table, 6).plan.rank, rowFor(shot.plan.table, 51).plan.dc], ["1d100", "Rewrite Memory", 6, 29]);
    // (Its die said before a table of rows alone, Jabali's Dice's 2d6: each row a cast.)
    const [gamble] = compileActivations(item("Jabali's Dice"), { spells });
    assert.deepEqual([gamble.plan.table.die, gamble.plan.table.rows.map((row) => `${row.low}-${row.high}:${row.plan?.spell?.name}`)], ["2d6", ["2-5:Mountain Resilience", "6-9:Grasping Earth", "10-11:Wall of Stone", "12-12:Petrify"]]);
    assert.equal(rowFor(gamble.plan.table, 12).plan.dc, 31);
});

test("a roll on a RollTable it links (Rod of Wonder): the table card draws from PF2e's own table at its DC 27 and +17 spell attack, the row drawn compiled then", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const [wave] = compileActivations(item("Rod of Wonder"));
    assert.deepEqual([routeOf(wave.plan), wave.plan.table], ["table", { uuid: "Compendium.pf2e.rollable-tables.RollTable.uYDzWM5ji52r4mSD", name: "Rod of Wonder", rows: [], dc: 27, attack: 17 }]);
    // (A card drawn at random, Deck of Illusions': the RollTable its text links before its activation.)
    assert.equal(compileActivations(item("Deck of illusions"))[0].plan.table.name, "Deck of Illusions Cards");
});

test("a table whose die is its first body row's (a third-party robe's d20 of chaos): its rows read, a spell row cast at the table's DC", async () => {
    const { spellIndex } = await import("../src/compiler/index.js");
    const { rowFor } = await import("../src/compiler/random-table.js");
    const robes = readDocuments(`${process.env.HOME}/.local/share/FoundryVTT/Data/modules/pf2e-team-plus-magic/packs/items`).find((doc) => doc.collection === "items" && doc.name === "Rumbustious Robes");
    if (!robes) return;
    const spells = spellIndex(readDocuments(path.join(`${process.env.HOME}/.local/share/FoundryVTT/Data/systems/pf2e/packs`, "spells")).filter((doc) => doc.collection === "items"));
    const chaos = compileActivations(robes, { spells }).find((entry) => entry.activation.name === "Pocket Full of Chaos").plan;
    assert.deepEqual([chaos.table.die, chaos.table.rows.length], ["1d20", 20]);
    assert.deepEqual([rowFor(chaos.table, 3).plan.builtin, rowFor(chaos.table, 3).plan.dc], ["cast-spell", 34]);
});

test("fruit it grows that heal when eaten (Verdant Branch's 1d4, Satchel of Numberless Seeds' 5): the item card's consumables in its user's inventory, each the module's own heal when eaten; when they wither their time (2026-10-26)", async () => {
    const { compileItem } = await import("../src/compiler/index.js");
    const { createdItemSource, createsText } = await import("../src/live/card.js");
    const [grow] = compileActivations(item("Verdant Branch"));
    assert.deepEqual(grow.plan.item.creates, { name: "Verdant Branch Fruit", count: "1d4", heal: "@Damage[(2d6+5)[healing]]", lasts: { value: 10, unit: "minutes" } });
    assert.equal(createsText(grow.plan.item.creates), "1d4 Verdant Branch Fruit in its user's inventory, each eaten for 2d6+5 Hit Points");
    assert.equal(grow.plan.notes, undefined);
    const fruit = compileItem(createdItemSource(grow.plan.item.creates, { count: 3, level: 5 }));
    assert.deepEqual(fruit.resolution.native.healing.components.map((component) => component.formula), ["2d6+5"]);
    assert.equal(compileActivations(item("Satchel of Numberless Seeds"))[1].plan.item.creates.count, 5);
});

test("next-Strike riders: Hyldarf's Fang's venom a coat of the gun itself (its unnamed save PF2e's Fortitude), Sawtooth Reaper's target Off-Guard to it (PF2e's EphemeralEffect), Scope of Limning's glow a note on the creature hit, Starshot Arrow's range penalties gone", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { strikeRules, strikeLines } = await import("../src/live/strike-card.js");
    const fang = compileActivations(item("Hyldarf's Fang"), { spellEffects })[1].plan;
    assert.deepEqual([routeOf(fang), fang.resolution.check.statistic, fang.resolution.check.against.value, fang.item.coats, fang.item.coatLasts], ["coat", "fortitude", 34, "self", { value: 1, unit: "rounds" }]);
    const reaper = compileActivations(item("Sawtooth Reaper"), { spellEffects })[1].plan;
    assert.deepEqual([routeOf(reaper), reaper.strike.offGuard, reaper.strike.own], ["strike", true, true]);
    assert.deepEqual(strikeRules(reaper, { weaponId: "reaper0000000001" }).filter((rule) => rule.key === "EphemeralEffect"), [{ key: "EphemeralEffect", affects: "target", selectors: ["reaper0000000001-attack"], uuid: "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg" }]);
    assert.ok(strikeLines(reaper).includes("Its target is Off-Guard to it"));
    assert.ok(reaper.strike.notes.some((note) => /Concealed, by hand/.test(note)), "the fog a note");
    const scope = compileActivations(item("Scope of Limning"), { spellEffects })[0].plan;
    const glow = scope.resolution.outcomes.success.noteEffects[0];
    assert.deepEqual([routeOf(scope), glow.duration.value, glow.duration.unit, /can't be Concealed/.test(glow.text)], ["strike", 1, "rounds", true]);
    const arrow = compileActivations(item("Starshot Arrow (Lesser)"), { spellEffects })[0].plan;
    assert.deepEqual([routeOf(arrow), arrow.strike.ammo, arrow.strike.options], ["strike", true, ["ignore-range-penalty:6"]]);
});

test("Coronet of Stars' reassurance: the triggering ally's failed check rerolled, the higher kept — a reroll of the creature targeted", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { rerollText } = await import("../src/live/reroll-card.js");
    const coronet = compileActivations(item("Coronet of Stars"), { spellEffects })[1].plan;
    assert.deepEqual([routeOf(coronet), coronet.reroll], ["reroll", { what: "check", keep: "higher", who: "target" }]);
    assert.equal(rerollText(coronet.reroll), "The targeted creature's latest check, rerolled: the higher result");
});

test("Silkspinner's Shield: its user's own linked Effect (Climb) picked of two, and for its minute each shield bash with it a rider on the creature struck — -10 feet to its Speeds for a round on a hit, Immobilized for a round on a critical hit — each ended by an Escape against DC 30", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const { attackRidersText } = await import("../src/compiler/attack-riders.js");
    const shield = compileActivations(item("Silkspinner's Shield"), { spellEffects })[0].plan;
    assert.deepEqual([routeOf(shield), shield.resolution.applications.map((entry) => entry.label)], ["item", ["Effect: Silkspinner's Shield (Climb)"]]);
    const { riders, duration } = shield.item.attackRiders;
    assert.deepEqual([riders.map((rider) => [rider.on.join("/"), rider.own, rider.targetModifier?.value ?? rider.target?.slug]), `${duration.value} ${duration.unit}`], [[["success", true, -10], ["criticalSuccess", true, "immobilized"]], "1 minutes"]);
    assert.equal(attackRidersText(riders), "On a hit with the item: the target -10 feet to its Speeds for 1 round (a successful Escape, DC 30, ends it); On a critical hit with the item: the target immobilized for 1 round instead (a successful Escape, DC 30, ends it)");
    // (Its Escape the ability module's, 2026-10-25: the penalty's and the condition's escape { dc }, ended by a successful Escape.)
    assert.deepEqual([riders[0].targetModifier.escape, riders[1].target.duration.escape, shield.notes], [{ dc: 30 }, { dc: 30 }, undefined]);
});

test("Bangles of Crowns' reaction: +1 circumstance to checks for the round against the creature its trigger names (marked, the presser's target) and 15 temporary Hit Points for a minute; Immortal Bastion's 100 temporary Hit Points until the start of its user's next turn", async () => {
    const bangles = compileActivations(item("Bangles of Crowns"), { spellEffects })[1].plan;
    const success = bangles.resolution.outcomes.success;
    assert.deepEqual(success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.predicate]), [["check", 1, "circumstance", ["target:mark:bangles-of-crowns-mark"]]]);
    assert.deepEqual([bangles.item.mark.slug, bangles.item.recipient, success.effects.map((effect) => [effect.kind, effect.amount])], ["bangles-of-crowns-mark", "user", [["temp-hp", 15]]]);
    const [temp] = compileActivations(item("Immortal Bastion"), { spellEffects })[0].plan.resolution.outcomes.success.effects;
    assert.deepEqual([temp.amount, temp.duration.value, temp.duration.unit, temp.duration.expiry], [100, 1, "rounds", "turn-start"]);
});

test("Fulu Compendium's Paralyzing Page: the Spirit-Sealing Fulu's own save at DC 25, Will or Paralyzed for a round, for the undead in its 30-foot emanation (the note says which creatures save); the living-only area saves get the same kind of note", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const page = compileActivations(item("Fulu Compendium"), { spellEffects })[0].plan;
    assert.deepEqual([routeOf(page), page.resolution.check.statistic, page.resolution.check.against.value, page.targeting.area, page.resolution.outcomes.failure.effects.map((effect) => [effect.slug, effect.duration.value])], ["save", "will", 25, { type: "emanation", value: 30 }, [["paralyzed", 1]]]);
    assert.deepEqual(page.notes, ["Only undead creatures in the area attempt the save: target those."]);
    const { compileItem } = await import("../src/compiler/index.js");
    assert.ok(compileItem(item("Ghost Ampoule")).notes.some((note) => /^Only living creatures \(not constructs or undead/.test(note)));
});

test("saves whose failure is the GM's to carry out, their words on the card: Cauthooj Bagpipes' Throw Song (Will DC 31, the Strike redirected), Planar Ribbon (Reflex DC 42, places swapped; not its trait)", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const song = compileActivations(item("Cauthooj Bagpipes"), { spellEffects })[1].plan;
    assert.deepEqual([routeOf(song), song.resolution.check.statistic, song.resolution.check.against.value, song.partial], ["save", "will", 31, true]);
    assert.deepEqual(song.resolution.outcomes.failure.manualInstructions, song.resolution.outcomes.criticalFailure.manualInstructions);
    assert.match(song.resolution.outcomes.failure.manualInstructions[0], /^\{target\}: The creature redirects the Strike to another creature of your choice\b.*takes a –2 penalty to the Strike \(by hand\)\.$/);
    assert.deepEqual(song.resolution.outcomes.success.manualInstructions, []);
    const ribbon = compileActivations(item("Planar Ribbon"), { spellEffects })[1].plan;
    assert.deepEqual([ribbon.resolution.check.statistic, ribbon.resolution.check.against.value], ["reflex", 42]);
    assert.equal(ribbon.resolution.outcomes.failure.manualInstructions[0], "{target}: You exchange positions with the target and all of that creature's allies are off-guard to you until the end of your turn (by hand).");
});

test("Admirer's Bouquet handed to the triggering ally: its +1 item bonus to saves against emotion and mental effects on that ally, for as long as it carries the bouquet (the end a note), the new save a note", async () => {
    const { routeOf } = await import("../src/live/route.js");
    const bouquet = compileActivations(item("Admirer's Bouquet"), { spellEffects })[1].plan;
    assert.deepEqual([routeOf(bouquet), bouquet.item.recipient, bouquet.targeting.target], ["item", "targets", "the triggering ally"]);
    assert.deepEqual(bouquet.resolution.outcomes.success.modifiers.map((modifier) => [modifier.selector, modifier.value, modifier.type, modifier.duration, modifier.predicate]), [["saving-throw", 1, "item", null, [{ or: ["item:trait:emotion", "item:trait:mental"] }]]]);
    assert.equal(bouquet.unread[0], "The bonus ends once the ally no longer carries the bouquet (end it by hand).");
    const { modifierText } = await import("../src/live/card.js");
    assert.equal(modifierText(bouquet.resolution.outcomes.success.modifiers[0]), "+1 item to saving-throw (against emotion or mental effects)");
});

test("an activation that takes minutes isn't the item's standing save bonus (PF2e's own rule): Crown of the Kobold King's Nightmare cast, Serithtial's 9th-rank Heal or Ring of Truth at DC 45", async () => {
    const { spellIndex } = await import("../src/compiler/index.js");
    const spells = spellIndex(readDocuments(path.join(PACKS, "spells")).filter((doc) => doc.collection === "items"));
    assert.equal(compileActivations(item("Crown of the Kobold King"), { spellEffects })[1].plan?.builtin, undefined, "not the save bonus without the spells either");
    const crown = compileActivations(item("Crown of the Kobold King"), { spellEffects, spells })[1].plan;
    assert.deepEqual([crown.builtin, crown.spell.name], ["cast-spell", "Nightmare"]);
    const blade = compileActivations(item("Serithtial"), { spellEffects, spells })[0].plan;
    assert.deepEqual([blade.builtin, blade.choices.map((choice) => [choice.spell.name, choice.rank])], ["cast-spell", [["Heal", 9], ["Ring of Truth", 9]]]);
});

test("a partial plan without its Effect's opening flavor among its notes (Bloodgorger Scythe's Sapling Slash, whole now; Heedless Spurs, its other notes kept); a plan that isn't partial keeps its words (the module's own wording)", async () => {
    const slash = compileActivations(item("Bloodgorger Scythe"), { spellEffects })[1].plan;
    assert.deepEqual([slash.partial, JSON.stringify(slash).includes("grows large enough to be commanded")], [undefined, false]);
    const spurs = compileActivations(item("Heedless Spurs"), { spellEffects })[0].plan;
    assert.deepEqual([spurs.partial, JSON.stringify(spurs).includes("You kick both spurs")], [true, false]);
    const { flavorSentence, withoutFlavorNotes } = await import("../src/compiler/flavor.js");
    const html = "<p><strong>Activate</strong> 1</p><p><strong>Effect</strong> A gust swirls around you. You Stride twice.</p>";
    assert.equal(flavorSentence(html), "A gust swirls around you.");
    const kept = { notes: ["A gust swirls around you."], builtin: "no-effect" };
    assert.equal(withoutFlavorNotes(kept, html), kept);
});

test("Floating Shield: its own AC bonus as a circumstance bonus to its user's AC for its minute, as if raised; what it can't do and its early end a note Effect for that minute", () => {
    const [float] = compileActivations(item("Floating Shield"));
    assert.deepEqual(float.plan.resolution.outcomes.success.modifiers, [{ selector: "ac", type: "circumstance", value: 1, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]);
    // (2026-10-26: its limits the user's to keep, a note Effect — whole.)
    const [note] = float.plan.resolution.outcomes.success.noteEffects;
    assert.deepEqual([Boolean(float.plan.partial), float.plan.notes, note.label, note.duration.value], [false, undefined, "Floating shield", 1]);
    assert.match(note.text, /Interact to grasp it, ending its floating effect early/);
});
