// The fifth batch's Strike group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (the b5/strike merge c1b5084):
// - Miniaturization Device: the exposure card's "simple-ranged" attack (scripts/poisons.js attackChoices) and, after a critical hit, its second
//   step's save one degree worse (plan.thenCritical, the card's "critical" box, src/live/poison-card.js worseSave) — b5StrikeMiniaturizationCritical.
// - Instinct Crown (Wrecker)'s second activation: its watch Effect with the core's ignoreResistance at its user's level (scripts/attack-riders.js
//   attackRidersEffectSource's perLevel), its save rider at the class DC on a critical hit that fits its predicate (rider.save, predicateFits,
//   classDCOf), gone with the Rage (untilRage) — b5StrikeWreckerCrown.
// - Power Gauntlet (Lesser): a readied Strike only a gauntlet takes (strike.base: src/live/strike-card.js riderFor and the DamageAlteration's
//   predicate), its uses and its own time (strike.uses, strike.lasts) — b5StrikePowerGauntlet (its last step probes a bug, see the result).
// - Curative Aglaophotis: Doomed lowered by 2 on a critical success (scripts/item-actions.js reduce.criticalBy) and the counteract card's check
//   taken from its user's Treat Wounds roll (scripts/counteract.js counteract.fromRoll, latestActionRoll) — b5StrikeAglaophotisCounteract (its
//   counteract total probes a bug, see the result).
// The group's other asked-for checks feed mechanisms already checked live: Conker Flail (Lesser) (the item-action card's action.minimum —
// tpFlytrapOwn's reading — and its user's Effect of PF2e's rules, plan.userEffects kind "rules"; the Strike, toggle and no-crowbar adjustment are
// PF2e's own rules), Nectar Pastille (the ways card — gingerChewSecondary —, a cast with castDuration, plan.userEffects given through
// postCardFor as a way is used, and the readied Strike's strike.userRules — b2AreasBloodmistWhirlFog), Pham Lê Ngọc's Sightglasses (the ways
// card, and ruleEffects replaces of a kind — b4-4's Kaldemash's Lament case), Manticore Matrass (checkChoices — twineChoice —, an attack card
// at a set modifier at one or several creatures — tpGogiteth —, and the ability module's until-escape Immobilized — scizoreGrab, b4-5) and
// Black Pearl of Mewru (alsoReadied's fortune card — b4-4 —, a readied bonus with PF2e's AdjustDegreeOfSuccess, spent only by a roll its
// predicate fits — scripts/fortune.js, the readied-bonus cases).
// The modules must be active in pftest: PF2e Team+ Inventors, Barbarians and Alchemists.

const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";
const INVENTORS = "pf2e-team-plus-inventors.inventors-equipment";
const BARBARIANS = "pf2e-team-plus-barbarians.items";
const ALCHEMISTS = "pf2e-team-plus-alchemists.pf2e-items";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card") ?? null;
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const contentOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "");
    const textOf = (message) => contentOf(message).replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const abilityOf = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card ?? null;
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const worn = { "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true };
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const sign = (value) => (value >= 0 ? `+${value}` : `${value}`);
    const moduleOn = (id, name) => h.assert(game.modules.get(id.split(".")[0])?.active, `${name} (${id.split(".")[0]}) active in pftest`);
    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    const damageBy = (actor) => (message) => message.flags?.pf2e?.context?.type === "damage-roll" && message.speaker?.actor === actor.id;
    const typesOf = (message) => (game.messages.get(message.id)?.rolls ?? message.rolls ?? []).flatMap((roll) => (roll?.instances ?? []).map((instance) => instance.type));
    const totalOf = (message) => Number((game.messages.get(message.id)?.rolls ?? message.rolls ?? [])[0]?.total);
    const formulaOf = (message) => (game.messages.get(message.id)?.rolls ?? message.rolls ?? []).map((roll) => roll.formula).join(" + ");
    const resistanceOf = (actor, type = "physical") => Number((actor.attributes?.resistances ?? []).find((entry) => entry.type === type)?.value ?? NaN);
    const takenWords = (taken) => `${taken.flavor ?? ""} ${taken.content ?? ""}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const conditionValue = (actor, slug) => Number(actor.getCondition?.(slug)?.value) || 0;

    // An Effect of PF2e's rules on the creature, this case's own ("PFTEST ITEM …"): a proficiency, a class DC.
    async function ruled(actor, name, rules) {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${name}`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules, duration: UNLIMITED } }]);
    }
    // PF2e's own Effect: Rage on the creature (as rageCrown gives it) → the Effect, to delete when its rage ends.
    async function rage(actor) {
        const pack = game.packs.get("pf2e.feat-effects");
        const entry = (await pack.getIndex()).find((row) => row.name === "Effect: Rage");
        h.assert(entry, "PF2e's Effect: Rage");
        const source = (await pack.getDocument(entry._id)).toObject();
        delete source._id;
        const [raging] = await actor.createEmbeddedDocuments("Item", [source]);
        await h.until(() => actor.itemTypes.effect.some((effect) => effect.id === raging.id), "the Rage Effect", { timeout: 5000 });
        return raging;
    }
    // PF2e's damage roll of that Strike (its critical one after a critical hit), every die at its top face → its message.
    const topDamageRoll = async (actor, action, outcome) => {
        const since = Date.now();
        await h.withDie(20, () => (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() }));
        return h.messageAfter(since, damageBy(actor), { what: "the damage roll" });
    };
    // That damage roll applied as PF2e's Damage button does (the roll with its options, the core's stamp among them) → { total, lost, taken }.
    const dealt = async (foe, foeToken, rolled) => {
        const roll = game.messages.get(rolled.id)?.rolls?.[0] ?? rolled.rolls?.[0];
        const before = Number(foe.system.attributes.hp.value);
        const since = Date.now();
        await foe.applyDamage({ damage: roll, token: foeToken });
        const taken = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-taken" && message.speaker?.actor === foe.id, { what: "PF2e's damage-taken message" });
        await h.wait(300);
        return { total: Number(roll.total), lost: before - Number(foe.system.attributes.hp.value), taken };
    };

    // PF2e's Treat Wounds prompt (its skill-action DialogV2 — found without its rendered flag, which a hidden pane may never set; as b2-actions).
    const treatPrompt = () => [...foundry.applications.instances.values()].find((app) => app.constructor.name === "DialogV2" && (app.options?.classes ?? []).includes("skill-action-prompt") && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    // A card's Apply that stops at that prompt (PF2e's Treat Wounds asks for its DC), answered as it stands (OK: trained, DC 15) → { prompted, error }.
    async function applyThroughPrompt(messageId, choices, { timeout = 15000 } = {}) {
        const run = { done: false, error: null };
        api().apply(messageId, choices).then(() => (run.done = true), (error) => Object.assign(run, { done: true, error }));
        let prompted = false;
        for (const end = Date.now() + timeout; Date.now() < end && !run.done; ) {
            const app = treatPrompt();
            const ok = app?.element?.querySelector('button[data-action="ok"]');
            if (app && ok && !prompted) {
                prompted = true;
                ok.click();
            }
            await h.wait(150);
        }
        if (!run.done) throw new Error(`The card's Apply didn't finish within ${timeout / 1000} seconds${prompted ? " (after the Treat Wounds prompt)" : " (no Treat Wounds prompt came)"}.`);
        return { prompted, error: run.error };
    }

    return {
        // Miniaturization Device (2026-10-28, attack-then-save.js; scripts/poisons.js attackChoices "simple-ranged" and applyExposureCard's
        // critical; src/live/poison-card.js worseSave and the exposure card's box): its ray is a ranged attack treating the device as a simple
        // weapon; a hit calls for a DC 29 Fortitude save (an incapacitation effect), one degree worse after a critical hit; its failure shrinks the
        // creature a size (Tiny at least) for a minute. A 3rd-level PC trained in simple weapons (PF2e's ActiveEffectLike) uses it: the exposure
        // card offers "Ranged (simple weapon) +N", N its Dexterity modifier + its level + 2, and Apply posts the ability module's attack card at
        // that modifier against AC. A d20 of 10 at AC −10: a critical hit. The card's second step shows the "It was a critical hit" box; pressed for
        // the save with it ticked, the DC 29 Fortitude card's rows are each one degree worse — the critical success row the success's "Shortened
        // reach", the success row the failure's "Shrunken" (CreatureSize −1), the failure and critical failure rows the critical failure's (−2) —,
        // with the incapacitation trait. A d20 of 10 on Fortitude +20 (30, a success) gives the "Shrunken" note Effect: the creature Small.
        async b5StrikeMiniaturizationCritical(scene) {
            moduleOn(INVENTORS, "PF2e Team+ Inventors");
            await h.clearSquares(scene, [[3, 3], [6, 3]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Shrink Ray User", { type: "character", x: 3, y: 3 });
            await ruled(user, "Simple Weapon Training", [{ key: "ActiveEffectLike", mode: "upgrade", path: "system.proficiencies.attacks.simple.rank", value: 1 }]);
            await h.until(() => Number(user.system.proficiencies?.attacks?.simple?.rank) === 1, `trained in simple weapons (${JSON.stringify(user.system.proficiencies?.attacks?.simple ?? null)})`, { timeout: 5000 });
            const dex = Number(user.system.abilities?.dex?.mod ?? 0) || 0;
            const expected = dex + Number(user.level) + 2;
            const { actor: foe, token: foeToken } = await h.creature(scene, "Shrink Ray Mark", { x: 6, y: 3, ac: -10, hp: 100, save: 20, alliance: "opposition", level: 3 });
            h.assert(foe.size === "med", `a Medium mark (${foe.size})`);
            const device = await h.give(user, "Miniaturization Device", INVENTORS);
            await userToken.object?.control?.();
            await h.target();
            let since = Date.now();
            await device.consume();
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the device's card" });
            const choices = stateOf(card).attackChoices ?? [];
            const simple = choices.find((choice) => choice.kind === "simple-ranged");
            h.assert(simple && simple.modifier === expected && simple.label === `Ranged (simple weapon) ${sign(expected)}`, `"Ranged (simple weapon) ${sign(expected)}" offered (Dex ${dex}, level ${user.level}, trained: ${JSON.stringify(choices)})`);
            since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(simple) });
            const attack = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's attack card" });
            const check = abilityOf(attack).plan.resolution.check;
            h.assert(Number(check.modifier) === expected && check.against?.statistic === "ac", `the attack at ${sign(expected)} against AC (${JSON.stringify(check)})`);
            await h.withDie(10, () => h.rollAndApply(attack));
            await h.until(() => (abilityOf(attack)?.targets ?? []).every((target) => target.degree), "the attack rolled", { timeout: 8000 });
            const hit = abilityOf(attack).targets[0].degree;
            h.assert(hit === "criticalSuccess", `a critical hit at AC −10 (${hit})`);
            await h.until(() => stateOf(card)?.step === "then", `the card's second step, the save (${stateOf(card)?.step ?? "none"}; ${stateOf(card)?.status})`, { timeout: 8000 });
            h.assert(/data-air-field="critical"/.test(contentOf(card)), "its 'It was a critical hit' box on the second step");
            since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid], critical: true });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && message.id !== attack.id, { what: "the DC 29 Fortitude save card" });
            const plan = abilityOf(save).plan;
            const saveCheck = plan.resolution.check;
            h.assert(saveCheck.statistic === "fortitude" && Number(saveCheck.against?.value) === 29, `a DC 29 Fortitude save (${JSON.stringify(saveCheck)})`);
            h.assert((plan.traits ?? []).includes("incapacitation"), `with the incapacitation trait (${JSON.stringify(plan.traits)})`);
            const rows = plan.resolution.outcomes;
            const label = (row) => (row?.noteEffects ?? []).map((note) => note.label).join(",");
            const shrink = (row) => (row?.noteEffects ?? []).flatMap((note) => note.rules ?? []).find((rule) => rule.key === "CreatureSize")?.value ?? null;
            const said = JSON.stringify(Object.fromEntries(Object.entries(rows).map(([degree, row]) => [degree, [label(row), shrink(row)]])));
            h.assert(label(rows.criticalSuccess) === "Shortened reach" && shrink(rows.criticalSuccess) === null, `its critical success row the success's (${said})`);
            h.assert(label(rows.success) === "Shrunken" && shrink(rows.success) === -1, `its success row the failure's: a size smaller (${said})`);
            h.assert(shrink(rows.failure) === -2 && shrink(rows.criticalFailure) === -2, `its failure and critical failure rows the critical failure's (${said})`);
            h.assert(resultsOf(card).some((line) => /After a critical hit: its save one degree worse/.test(line)), `the card says so (${JSON.stringify(resultsOf(card))})`);
            await h.withDie(10, () => h.rollAndApply(save));
            await h.until(() => (abilityOf(save)?.targets ?? []).every((target) => target.degree), "the save rolled", { timeout: 8000 });
            const degree = abilityOf(save).targets[0].degree;
            h.assert(degree === "success", `a success (10 + 20 against DC 29): ${degree}`);
            const shrunken = () => foe.itemTypes.effect.find((effect) => (effect.system?.rules ?? []).some((rule) => rule.key === "CreatureSize"));
            await h.until(shrunken, `the "Shrunken" note Effect (${effectNames(foe)})`, { timeout: 8000 });
            h.assert(/Shrunken/.test(shrunken().name), `named for it (${shrunken().name})`);
            h.assert(Number(shrunken().system.duration.value) === 1 && shrunken().system.duration.unit === "minutes", `for a minute (${JSON.stringify(shrunken().system.duration)})`);
            await h.until(() => foe.size === "sm", `the creature a size smaller, Small (${foe.size})`, { timeout: 8000 });
            return { choice: simple, hit, degree, size: foe.size, results: resultsOf(card) };
        },

        // Instinct Crown (Wrecker) (2026-10-28, rage-riders.js; scripts/attack-riders.js attackRidersEffectSource and attackRidersRolled's rider.save,
        // scripts/live.js untilRage): its second activation, for a raging barbarian: its melee Strikes ignore physical resistance up to its level
        // against constructs, and a critical hit with a Strike at a construct (or a creature its instinct's toggle is on for) calls for a Fortitude
        // save against its class DC, Slowed 1 for a round on a failure. A 10th-level barbarian with a class DC (PF2e's ActiveEffectLike) and PF2e's
        // Effect: Rage, the crown worn: the activation's item card applied gives the watch Effect, flagged untilRage, a minute long, with the core's
        // ignoreResistance { value 10 (its level), physical …, predicate item:melee and target:trait:construct }. A longsword Strike at a construct
        // with physical resistance 15, a 20 on the die: a critical hit — the ability module's DC (its class DC) Fortitude card at it; its 10 on the
        // die (Fortitude −30), a failure: Slowed 1. That hit's damage roll (its dice at their top) carries the stamp: applied, all but 5 taken and
        // PF2e's breakdown says it ignores 10 of its physical resistance. A critical hit at a creature that isn't a construct: no save card. Its Rage
        // Effect deleted: the watch Effect gone. (A spell attack roll is PF2e's "spell-attack-roll", which the watch never reads: no case for it.)
        async b5StrikeWreckerCrown(scene) {
            moduleOn(BARBARIANS, "PF2e Team+ Barbarians");
            h.assert(game.modules.get(CORE)?.active && typeof game.modules.get(CORE).api?.patches?.damage?.lowered === "function", "the resolution core with its ignoreResistance (api.patches.damage.lowered)");
            await h.clearSquares(scene, [[10, 8], [11, 8], [10, 9]]);
            const { actor: barbarian, token: barbarianToken } = await h.creature(scene, "Wrecker Barbarian", { type: "character", x: 10, y: 8, level: 10 });
            await ruled(barbarian, "class DC", [{ key: "ActiveEffectLike", mode: "override", path: "system.proficiencies.classDCs.fixture", value: { label: "Fixture", attribute: "str", rank: 2, primary: true } }]);
            const classDC = () => Number(barbarian.classDC?.value ?? barbarian.system.attributes?.classDC?.value);
            await h.until(() => classDC() > 0, `its class DC (an Effect's ActiveEffectLike: ${JSON.stringify(barbarian.system.attributes?.classDC ?? null)})`, { timeout: 5000 });
            const sword = await h.give(barbarian, "Longsword");
            await sword.update(held(1));
            const crown = await h.give(barbarian, "Instinct Crown (Wrecker)", BARBARIANS);
            await crown.update(worn);
            const raging = await rage(barbarian);
            const { actor: golem, token: golemToken } = await h.creature(scene, "Wrecker Construct", { x: 11, y: 8, ac: 1, hp: 300, save: -30, alliance: "opposition", level: 10 });
            await golem.update({ "system.traits.value": ["construct"], "system.attributes.resistances": [{ type: "physical", value: 15, exceptions: [] }] });
            await h.until(() => golem.system.traits.value.includes("construct") && resistanceOf(golem) === 15, `a construct with physical resistance 15 (${JSON.stringify(golem.system.traits.value)}; ${JSON.stringify(golem.system.attributes.resistances)})`, { timeout: 5000 });
            const { token: beastToken } = await h.creature(scene, "Wrecker Beast", { x: 10, y: 9, ac: 1, hp: 300, save: -30, alliance: "opposition", level: 10 });
            await barbarianToken.object?.control?.();
            let since = Date.now();
            await api().activate(crown.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the crown's card for its second activation" });
            await api().apply(card.id);
            const watch = () => barbarian.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.attackRiders?.item?.name === "Instinct Crown (Wrecker)");
            await h.until(watch, `its watch Effect (${effectNames(barbarian)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const ignore = watch().flags?.[CORE]?.ignoreResistance ?? null;
            h.assert(Number(ignore?.value) === Number(barbarian.level) && (ignore.types ?? []).includes("physical") && JSON.stringify(ignore.predicate ?? []).includes("target:trait:construct") && JSON.stringify(ignore.predicate ?? []).includes("item:melee"), `the core's ignoreResistance at its level ${barbarian.level}, melee Strikes at constructs (${JSON.stringify(ignore)})`);
            h.assert(watch().flags[h.NS].untilRage === true, `flagged to end with the Rage (${JSON.stringify(watch().flags[h.NS])})`);
            h.assert(Number(watch().system.duration.value) === 1 && watch().system.duration.unit === "minutes", `a minute at most (${JSON.stringify(watch().system.duration)})`);
            // (A critical hit at the construct: its save card at the class DC.)
            await h.target(golemToken);
            since = Date.now();
            const { action, attack } = await h.withDie(20, () => h.strike(barbarian, sword));
            const outcome = attack.flags.pf2e.context.outcome;
            h.assert(outcome === "criticalSuccess", `a critical hit (a 20 on the die): ${outcome}`);
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the construct's Fortitude save card", timeout: 10000 });
            const check = abilityOf(save).plan.resolution.check;
            h.assert(check.statistic === "fortitude" && Number(check.against?.value) === classDC(), `a Fortitude save against its class DC ${classDC()} (${JSON.stringify(check)})`);
            h.assert((abilityOf(save).targets ?? []).some((target) => target.actorUuid === golem.uuid), "at the construct");
            await h.withDie(10, () => h.rollAndApply(save));
            await h.until(() => golem.hasCondition("slowed"), `Slowed on its failure (${golem.itemTypes.condition.map((condition) => condition.slug).join(", ") || "no conditions"})`, { timeout: 8000 });
            h.assert(conditionValue(golem, "slowed") === 1, `Slowed 1 (${conditionValue(golem, "slowed")})`);
            // (That hit's damage: 10 of its physical resistance 15 ignored.)
            const rolled = await topDamageRoll(barbarian, action, outcome);
            const { total, lost, taken } = await dealt(golem, golemToken, rolled);
            h.assert(total > 0 && lost === Math.max(0, total - 5), `${total} damage, all but 5 taken (lost ${lost}; the roll's stamp ${JSON.stringify(game.messages.get(rolled.id)?.flags?.[CORE]?.ignoreResistance ?? null)})`);
            h.assert(/Ignores 10 of its physical resistance/.test(takenWords(taken)), `PF2e's damage breakdown says it (${takenWords(taken).slice(0, 300)})`);
            // (A critical hit at a creature that isn't a construct: no save card.)
            await h.target(beastToken);
            since = Date.now();
            const other = await h.withDie(20, () => h.strike(barbarian, sword));
            h.assert(other.attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit at the beast: ${other.attack.flags.pf2e.context.outcome}`);
            await h.wait(2500);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message)), "no save card at a creature that isn't a construct");
            // (Its Rage over: the watch Effect gone with it.)
            await raging.delete();
            await h.until(() => !watch(), `the watch Effect gone with the Rage (${effectNames(barbarian)})`, { timeout: 8000 });
            return { ignore, classDC: classDC(), damage: { total, lost }, breakdown: takenWords(taken).slice(0, 200) };
        },

        // Power Gauntlet (Lesser) (2026-10-28, gauntlet-shots.js; src/live/strike-card.js riderFor's strike.base, strikeRules' DamageAlteration
        // predicate, strikeEffectSource's strike.lasts; scripts/strikes.js): its user's gauntlet makes up to 2 Strikes within a minute, fire in place
        // of its own damage type, without its Strength on the damage. A PC with Strength +4 (PF2e's manual attributes) holding a Gauntlet and a
        // Club uses it: the Strike card readies its next two Strikes within 1 minute — the readied Effect 2 uses, a minute long, its DamageAlteration
        // to fire and its AdjustModifier off Strength both for item:base:gauntlet. A gauntlet Strike's hit (a 10 at AC 10 + its modifier) keeps it
        // for the damage roll; that roll (its die at the top) is all fire, 4 — the d4, no Strength — and leaves 1 use. A club Strike's attack roll
        // spends nothing, and its damage roll (at the top) is bludgeoning with Strength, 10 — and leaves the readied Effect at 1 use too. (That last
        // part probes scripts/strikes.js damageWithRider, which spends a use on any Strike's damage roll whatever its weapon's base: see the bugs.)
        async b5StrikePowerGauntlet(scene) {
            moduleOn(INVENTORS, "PF2e Team+ Inventors");
            await h.clearSquares(scene, [[14, 3], [15, 3]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Gauntlet Puncher", { type: "character", x: 14, y: 3 });
            await user.update({ "system.abilities": { str: { mod: 4 } } });
            await h.until(() => Number(user.abilities?.str?.mod ?? user.system.abilities?.str?.mod) === 4, `Strength +4 (${user.abilities?.str?.mod ?? user.system.abilities?.str?.mod})`, { timeout: 5000 });
            const gauntlet = await h.give(user, "Gauntlet");
            await gauntlet.update(held(1));
            const club = await h.give(user, "Club");
            await club.update(held(1));
            const strikeOf = (weapon) => (user.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
            const modifier = Number(strikeOf(gauntlet)?.totalModifier);
            h.assert(Number.isFinite(modifier) && strikeOf(club), `its Strikes with the gauntlet and the club (${strikeOf(gauntlet)?.totalModifier}, ${strikeOf(club)?.totalModifier})`);
            const { token: foeToken } = await h.creature(scene, "Gauntlet Mark", { x: 15, y: 3, ac: 10 + modifier, hp: 300, alliance: "opposition" });
            const gadget = await h.give(user, "Power Gauntlet (Lesser)", INVENTORS);
            await userToken.object?.control?.();
            let since = Date.now();
            await gadget.consume();
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the gadget's Strike card" });
            await api().apply(card.id);
            const readied = readiedOf(user);
            const rider = () => readied()?.flags?.[h.NS]?.strikeRider ?? null;
            await h.until(readied, `the readied Strikes (${effectNames(user)})`, { timeout: 8000 });
            h.assert(/next two Strikes within 1 minute/.test(resultsOf(card).join(" ")), `the card's hint: its next two Strikes within a minute (${JSON.stringify(resultsOf(card))})`);
            h.assert(rider().uses === 2 && Number(readied().system.duration.value) === 1 && readied().system.duration.unit === "minutes", `2 uses, a minute (${rider().uses}; ${JSON.stringify(readied().system.duration)})`);
            const rules = readied().system.rules ?? [];
            const fire = rules.find((rule) => rule.key === "DamageAlteration" && rule.property === "damage-type" && rule.value === "fire");
            const strength = rules.find((rule) => rule.key === "AdjustModifier" && rule.slug === "str" && rule.suppress);
            h.assert(fire && [].concat(fire.predicate ?? []).includes("item:base:gauntlet"), `fire damage for a gauntlet only (${JSON.stringify(rules)})`);
            h.assert(strength && [].concat(strength.predicate ?? []).includes("item:base:gauntlet"), `no Strength on a gauntlet's damage (${JSON.stringify(rules)})`);
            // (A gauntlet Strike's hit, then its damage roll: fire, no Strength, a use spent.)
            await h.target(foeToken);
            const punch = await h.withDie(10, () => h.strike(user, gauntlet));
            h.assert(punch.attack.flags.pf2e.context.outcome === "success", `a hit (a 10 at AC ${10 + modifier}): ${punch.attack.flags.pf2e.context.outcome}`);
            await h.until(() => rider()?.awaiting, `kept for the hit's damage roll (${JSON.stringify(rider())})`, { timeout: 8000 });
            const punched = await topDamageRoll(user, punch.action, "success");
            h.assert(typesOf(punched).length && typesOf(punched).every((type) => type === "fire"), `all fire (${JSON.stringify(typesOf(punched))})`);
            h.assert(totalOf(punched) === 4, `the d4 at its top and no Strength: 4 (${totalOf(punched)}: ${formulaOf(punched)})`);
            await h.until(() => rider()?.uses === 1, `1 use left (${rider() ? rider().uses : "the Effect gone"})`, { timeout: 8000 });
            // (A club Strike: neither changed nor spending it.)
            const swing = await h.withDie(10, () => h.strike(user, club));
            await h.wait(800);
            h.assert(rider()?.uses === 1, `the club's attack roll spends none (${rider() ? rider().uses : "the Effect gone"}; ${swing.attack.flags.pf2e.context.outcome})`);
            const clubbed = await topDamageRoll(user, swing.action, "success");
            h.assert(typesOf(clubbed).length && typesOf(clubbed).every((type) => type === "bludgeoning") && totalOf(clubbed) === 10, `the club's own damage: bludgeoning, the d6 at its top + 4 Strength = 10 (${JSON.stringify(typesOf(clubbed))}, ${totalOf(clubbed)}: ${formulaOf(clubbed)})`);
            await h.wait(1000);
            h.assert(readied() && rider()?.uses === 1, `the club's damage roll spends none of it either (${readied() ? `${rider().uses} left` : "the readied Effect gone"})`);
            return { modifier, gauntlet: { total: totalOf(punched), types: typesOf(punched) }, club: { total: totalOf(clubbed), types: typesOf(clubbed) }, uses: rider()?.uses ?? null };
        },

        // Curative Aglaophotis (2026-10-28, within-treatment.js; scripts/item-actions.js withinResults' reduce.criticalBy, scripts/immunity.js,
        // scripts/counteract.js counteract.fromRoll and latestActionRoll): used within its user's Treat Wounds, it lowers the creature's Doomed by 1
        // (by 2 on a critical success), a curse on it can be counteracted with that same Treat Wounds result at rank 7 (half its level), and the
        // creature is immune to it for a day whatever the result. A trained medic uses it at an adjacent ally that is Doomed 2 and has a curse (an
        // Effect with the curse trait): the action card and, beside it, the counteract card ("Counteract with its user's latest Treat Wounds roll,
        // rank 7"). The action card's Treat Wounds (PF2e's prompt answered: trained, DC 15) with a 20 on the die: a critical success — Doomed 2 to 0
        // —, and the ally (not the medic) gets the "Immune:" Effect for a day. The counteract card: its creature the ally, then the curse ticked with
        // DC 30 and rank 7: its line is that Treat Wounds check's own total (its 20 on the die making a failure a success), the curse removed, and no
        // new roll posted. (PF2e's Treat Wounds posts its healing roll as a second message with the check's flags; the counteract card must not take
        // that one — see the bugs.)
        async b5StrikeAglaophotisCounteract(scene) {
            moduleOn(ALCHEMISTS, "PF2e Team+ Alchemists");
            await h.clearSquares(scene, [[14, 6], [15, 6]]);
            const { actor: medic } = await h.creature(scene, "Aglaophotis Medic", { type: "character", x: 14, y: 6 });
            await medic.update({ "system.skills.medicine.rank": 1 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Aglaophotis Patient", { x: 15, y: 6 });
            await ally.increaseCondition("doomed", { value: 2 });
            await h.until(() => conditionValue(ally, "doomed") === 2, `Doomed 2 (${conditionValue(ally, "doomed")})`, { timeout: 5000 });
            const [curse] = await ally.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Curse of the Lab`, type: "effect", img: "icons/svg/skull.svg", system: { traits: { value: ["curse"], rarity: "common", otherTags: [] }, rules: [], duration: UNLIMITED } }]);
            const cursed = () => ally.items.get(curse.id);
            const immune = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.immunity === "curative-aglaophotis" || effect.flags?.[ABILITY]?.immunity?.slug === "curative-aglaophotis");
            const plant = await h.give(medic, "Curative Aglaophotis", ALCHEMISTS);
            let since = Date.now();
            await plant.consume();
            const card = await h.messageAfter(since, h.itemCard("item-action"), { what: "the plant's action card" });
            const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "the counteract card beside it" });
            const action = stateOf(card).plan.action;
            h.assert(action.slug === "treat-wounds" && action.targeted && action.within && Number(action.reduce?.by) === 1 && Number(action.reduce?.criticalBy) === 2 && action.immunity?.slug === "curative-aglaophotis", `Treat Wounds at the creature, Doomed lowered 1 or 2, its immunity (${JSON.stringify({ slug: action.slug, reduce: action.reduce, immunity: action.immunity?.slug })})`);
            const counteract = stateOf(counter).counteract;
            h.assert(Number(counteract.rank) === 7 && counteract.fromRoll?.action === "treat-wounds" && (counteract.afflictions ?? []).includes("curse"), `a curse counteracted at rank 7 with the Treat Wounds roll (${JSON.stringify({ rank: counteract.rank, fromRoll: counteract.fromRoll, afflictions: counteract.afflictions })})`);
            h.assert(/Counteract with its user's latest Treat Wounds roll, rank 7/.test(textOf(counter)), `its card's line (${textOf(counter).slice(0, 300)})`);
            // (PF2e's Treat Wounds, a 20 on the die: a critical success.)
            since = Date.now();
            let asked = false;
            try {
                const { prompted, error } = await h.withDie(20, () => applyThroughPrompt(card.id, { targets: [allyToken.uuid] }));
                if (error) throw error;
                asked = prompted;
            } finally {
                await treatPrompt()?.close?.();
            }
            // (The check's own message — not PF2e's healing roll after it, which carries the check's flags and points back at it.)
            const isCheck = (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === medic.id && (message.flags.pf2e.context.options ?? []).includes("action:treat-wounds") && !message.flags?.pf2e?.origin?.messageId;
            const roll = await h.messageAfter(since, isCheck, { what: "PF2e's Treat Wounds check", timeout: 12000 });
            const checkTotal = Number(roll.rolls?.[0]?.total);
            const natural = Number(roll.rolls?.[0]?.dice?.[0]?.total);
            h.assert(roll.flags.pf2e.context.outcome === "criticalSuccess" && natural === 20, `a critical success, a 20 on the die (${roll.flags.pf2e.context.outcome}, ${natural}; ${checkTotal} against ${JSON.stringify(roll.flags.pf2e.context.dc ?? null)})`);
            await h.until(() => conditionValue(ally, "doomed") === 0, `Doomed 2 lowered by 2 (${conditionValue(ally, "doomed")}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(resultsOf(card).some((line) => /doomed lowered by 2/.test(line)), `the card's line (${JSON.stringify(resultsOf(card))})`);
            await h.until(() => immune(ally).length === 1, `the ally's Immune: Effect (${effectNames(ally)})`, { timeout: 8000 });
            const [effect] = immune(ally);
            h.assert(Number(effect.system.duration.value) === 1 && effect.system.duration.unit === "days", `for a day (${effect.system.duration.value} ${effect.system.duration.unit})`);
            h.assert(!immune(medic).length, `none on the medic (${effectNames(medic)})`);
            const healing = game.messages.contents.find((message) => message.flags?.pf2e?.origin?.messageId === roll.id);
            // (The counteract card: the ally, then its curse at DC 30 and rank 7.)
            const at = (stateOf(counter).drinkers ?? []).findIndex((entry) => entry.actorUuid === ally.uuid);
            h.assert(at >= 0, `the ally among its creatures (${JSON.stringify((stateOf(counter).drinkers ?? []).map((entry) => entry.name))})`);
            await api().apply(counter.id, { drinker: at });
            await h.until(() => stateOf(counter)?.step === "pick", `the curse found (${stateOf(counter)?.step})`, { timeout: 8000 });
            const rows = stateOf(counter).rows ?? [];
            const row = rows.findIndex((entry) => entry.id === curse.id);
            h.assert(row >= 0, `the curse listed (${JSON.stringify(rows.map((entry) => [entry.name, entry.kind]))})`);
            since = Date.now();
            await api().apply(counter.id, { rows: rows.map((entry, index) => (index === row ? { ticked: true, dc: 30, rank: 7 } : { ticked: false })) });
            await h.until(() => stateOf(counter)?.status !== "open" || !cursed(), `the counteract applied (${stateOf(counter)?.status}; ${JSON.stringify(resultsOf(counter))})`, { timeout: 8000 });
            const line = resultsOf(counter).find((entry) => entry.includes("against DC 30")) ?? "";
            h.assert(line.includes(`${checkTotal} against DC 30: a success`), `the Treat Wounds check's own total, ${checkTotal}, a failure its 20 makes a success (${JSON.stringify(resultsOf(counter))}; PF2e's healing roll after it ${healing ? `totalled ${healing.rolls?.[0]?.total}` : "not found"})`);
            await h.until(() => !cursed(), `the curse counteracted (${effectNames(ally)})`, { timeout: 8000 });
            await h.wait(500);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && /counteract/i.test(String(message.flavor ?? "")) && message.rolls?.length), "no new roll for the counteract");
            return { prompted: asked, check: { total: checkTotal, natural }, healing: healing?.rolls?.[0]?.total ?? null, results: resultsOf(counter) };
        }
    };
};
