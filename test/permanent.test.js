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
