// The third batch's triggers group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the items whose live play is new code (the merge 21b567e: 1671604, 38178cb, a771016 — src/live/if-target.js, scripts/rerolls.js,
// src/live/reroll-card.js, scripts/live.js, scripts/strikes.js, scripts/poisons.js): Smogger's and Horn of the Sun Aurochs' results for some
// creatures only (if-target.js breathes, sunlightVulnerable), Beckoning Cat Amulet's allies' rerolls (rerollAllies, reroll.failed), Pyrefeather
// Token's reroll card beside its item card and its recovery check's DC changed (raise.dc, reroll.recovery), Grisly Scythe's riders for a Strike
// that already hit (hitRiders) behind its critical-hit gate, with its user's healing from the void damage, and Deflecting Branch's attack at its
// best weapon proficiency (attackChoices "proficiency"). The group's other items feed mechanisms already checked live: Silvanshee Collar (a
// reroll card whose statistic is a list, rerollSave), Cindergrass Poultice (item.levelTemp from a typed amount, bloodknucklesAmount), Navigator's
// Feather and Choral Toga (note Effects with PF2e's rules on them).

const ABILITY = "pf2e-automatic-ability-resolution";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const cardFor = (cards, actor) => cards.find((message) => (abilityState(message)?.targets ?? []).some((target) => target.actorUuid === actor.uuid));
    const degreeOf = (message, actor) => (abilityState(message)?.targets ?? []).find((target) => target.actorUuid === actor.uuid)?.degree ?? null;
    const valueOf = (actor, slug) => Number(actor.getCondition?.(slug)?.value) || 0;
    const conditions = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${condition.value ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const hpOf = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    // (A bare character has 0 maximum Hit Points and PF2e then takes no damage nor healing on it: an Effect gives it some, its Hit Points set.)
    const hitPoints = async (actor, max, value = max) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: max }], duration: UNLIMITED } }]);
        await h.until(() => actor.system.attributes.hp.max >= max, `${max} maximum Hit Points on ${actor.name}`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": value });
        await h.until(() => hpOf(actor) === value, `${actor.name} at ${value} Hit Points`, { timeout: 5000 });
    };
    // (A permanent item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };

    return {
        // Smogger's second activation (src/live/if-target.js breathes; the save card's groups, scripts/poisons.js targetGroups): "creatures that
        // must breathe and aren't holding their breath take a -2 circumstance penalty to this save … Failure The creature is sickened 1 (or
        // increases their sickened condition value to 2 if it isn't holding its breath). The creature also takes 4d6 poison damage." Pressed at a
        // human, a construct and a human with an Effect named Holding Breath: two save cards, Fortitude DC 32 — the plain human's alone with −2
        // circumstance, the construct and the breath-holder on the other with none. Every die a 5 (+20: 25, the human's 23 — failures, not
        // critical ones): the human Sickened 2 and the breath-holder Sickened 1, each damaged; the construct, PF2e's immune to poison and
        // sickened, untouched.
        async b3TriggersSmoggerBreathers(scene) {
            await h.clearSquares(scene, [[2, 2], [3, 2], [3, 3], [2, 3]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Smog Wearer", { type: "character", x: 2, y: 2, level: 9 });
            const { actor: human, token: humanToken } = await h.creature(scene, "Smog Human", { x: 3, y: 2, save: 20, hp: 100, alliance: "opposition" });
            const { actor: construct, token: constructToken } = await h.creature(scene, "Smog Construct", { x: 3, y: 3, save: 20, hp: 100, alliance: "opposition" });
            const { actor: holder, token: holderToken } = await h.creature(scene, "Smog Breath Holder", { x: 2, y: 3, save: 20, hp: 100, alliance: "opposition" });
            await human.update({ "system.traits.value": ["human", "humanoid"] });
            await construct.update({ "system.traits.value": ["construct"] });
            await holder.update({ "system.traits.value": ["human", "humanoid"] });
            await holder.createEmbeddedDocuments("Item", [{ name: "Holding Breath", type: "effect", system: { rules: [], duration: UNLIMITED } }]);
            h.assert(construct.system.traits.value.includes("construct") && holder.itemTypes.effect.some((effect) => effect.name === "Holding Breath"), "the construct's trait and the holder's Effect");
            const smogger = await h.give(wearer, "Smogger");
            await smogger.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await wearerToken.object?.control?.();
            const card = await activated(smogger, 1, "expose", "the thick smog's card");
            const since = Date.now();
            await live().apply(card.id, { targets: [humanToken.uuid, constructToken.uuid, holderToken.uuid] });
            await h.until(() => abilityCardsSince(since).length >= 2, `two save cards (${abilityCardsSince(since).length}; ${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            const humanCard = cardFor(cards, human);
            const plainCard = cardFor(cards, construct);
            h.assert(cards.length === 2 && humanCard && plainCard && humanCard.id !== plainCard.id && cardFor(cards, holder)?.id === plainCard.id, `the human's own card, the construct and the breath-holder on the other (${cards.length} cards)`);
            const check = (message) => abilityState(message).plan.resolution.check;
            h.assert(check(humanCard).statistic === "fortitude" && Number(check(humanCard).against?.value) === 32, `Fortitude DC 32 (${JSON.stringify(check(humanCard))})`);
            h.assert(Number(check(humanCard).bonus?.value) === -2 && check(humanCard).bonus.type === "circumstance", `the human's −2 circumstance (${JSON.stringify(check(humanCard).bonus ?? null)})`);
            h.assert(!check(plainCard).bonus, `no penalty for the construct nor the breath-holder (${JSON.stringify(check(plainCard).bonus ?? null)})`);
            const before = { human: hpOf(human), construct: hpOf(construct), holder: hpOf(holder) };
            // (One card after the other, each applied before the next is rolled. The construct is PF2e's construct: immune to poison and to
            // sickened by its trait, so nothing of the smog's lands on it. The damage is rolled once Apply's pressed, after the die's let go:
            // taken, not a set amount.)
            await h.withDie(5, () => h.rollAndApply(humanCard));
            await h.until(() => valueOf(human, "sickened") === 2 && hpOf(human) < before.human, `the human Sickened 2 and damaged (${conditions(human)}; ${hpOf(human)} of ${before.human})`, { timeout: 12000 });
            await h.withDie(5, () => h.rollAndApply(plainCard));
            await h.until(() => valueOf(holder, "sickened") === 1 && hpOf(holder) < before.holder, `the breath-holder Sickened 1 and damaged (${conditions(holder)}; ${hpOf(holder)} of ${before.holder})`, { timeout: 12000 });
            h.assert(degreeOf(humanCard, human) === "failure" && degreeOf(plainCard, construct) === "failure" && degreeOf(plainCard, holder) === "failure", `failures all (${degreeOf(humanCard, human)}, ${degreeOf(plainCard, construct)}, ${degreeOf(plainCard, holder)})`);
            await h.wait(800);
            h.assert(!valueOf(construct, "sickened") && hpOf(construct) === before.construct, `the construct immune: no Sickened, no poison damage (${conditions(construct)}; ${hpOf(construct)} of ${before.construct})`);
            h.assert(valueOf(human, "sickened") === 2, `the human's Sickened stays 2, not raised past it by the base row's 1 (${conditions(human)})`);
            return { human: conditions(human), construct: conditions(construct), holder: conditions(holder) };
        },

        // Horn of the Sun Aurochs (src/live/if-target.js sunlightVulnerable; its counteract card beside the save card, scripts/live.js): "Creatures
        // that are specifically vulnerable to sunlight are also Frightened 1 if they fail this save or Frightened 2 on a critical failure. This
        // activation also attempts to counteract any darkness or sleep effects in the area (+23 counteract check)." The counteract card at +23, rank
        // 7, its free row the darkness or sleep in the 20-foot emanation. Pressed at two wraiths (an action named Sunlight Powerlessness) and an orc:
        // the wraiths' card and the orc's, basic Fortitude DC 30 (7d6 sonic, 7d6 spirit). Every die a 5: the wraith at +18 (23) fails, Frightened
        // 1; the wraith at +10 (15) critically fails, Frightened 2; the orc at +18 fails and isn't Frightened.
        async b3TriggersHornSunlight(scene) {
            await h.clearSquares(scene, [[2, 6], [3, 6], [3, 7], [4, 6]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Aurochs Horn Blower", { type: "character", x: 2, y: 6, level: 13 });
            const { actor: wraith, token: wraithToken } = await h.creature(scene, "Aurochs Wraith", { x: 3, y: 6, save: 18, hp: 300, alliance: "opposition" });
            const { actor: wraith2, token: wraith2Token } = await h.creature(scene, "Aurochs Wraith Weak", { x: 3, y: 7, save: 10, hp: 300, alliance: "opposition" });
            const { actor: orc, token: orcToken } = await h.creature(scene, "Aurochs Orc", { x: 4, y: 6, save: 18, hp: 300, alliance: "opposition" });
            for (const actor of [wraith, wraith2]) {
                await actor.update({ "system.traits.value": ["undead", "wraith", "incorporeal"] });
                await actor.createEmbeddedDocuments("Item", [{ name: "Sunlight Powerlessness", type: "action", system: { actionType: { value: "passive" }, actions: { value: null }, description: { value: "<p>A wraith caught in sunlight is powerless.</p>" } } }]);
            }
            await orc.update({ "system.traits.value": ["orc", "humanoid"] });
            const horn = await h.give(user, "Horn of the Sun Aurochs");
            await horn.update(held(1));
            await userToken.object?.control?.();
            let since = Date.now();
            await live().activate(horn.uuid, 0);
            const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "the horn's counteract card" });
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the horn's save card" });
            const counteract = stateOf(counter);
            h.assert(Number(counteract.counteract?.modifier) === 23 && Number(counteract.counteract?.rank) === 7, `+23 at rank 7 (${JSON.stringify(counteract.counteract)})`);
            h.assert(counteract.rows?.[0]?.kind === "free" && /each darkness or sleep effect in the 20-foot emanation/.test(counteract.rows[0].name ?? ""), `its free row (${JSON.stringify(counteract.rows)})`);
            since = Date.now();
            await live().apply(card.id, { targets: [wraithToken.uuid, wraith2Token.uuid, orcToken.uuid] });
            await h.until(() => abilityCardsSince(since).length >= 2, `two save cards (${abilityCardsSince(since).length}; ${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            const wraiths = cardFor(cards, wraith);
            const plain = cardFor(cards, orc);
            h.assert(cards.length === 2 && wraiths && plain && wraiths.id !== plain.id && cardFor(cards, wraith2)?.id === wraiths.id, `the wraiths' card and the orc's (${cards.length})`);
            const check = abilityState(wraiths).plan.resolution.check;
            h.assert(check.statistic === "fortitude" && check.basic === true && Number(check.against?.value) === 30, `basic Fortitude DC 30 (${JSON.stringify(check)})`);
            for (const message of [wraiths, plain]) await h.withDie(5, () => h.rollAndApply(message));
            await h.until(() => valueOf(wraith, "frightened") === 1 && valueOf(wraith2, "frightened") === 2, `the wraiths Frightened 1 and 2 (${conditions(wraith)} / ${conditions(wraith2)})`, { timeout: 12000 });
            h.assert(degreeOf(wraiths, wraith) === "failure" && degreeOf(wraiths, wraith2) === "criticalFailure", `a failure and a critical failure (${degreeOf(wraiths, wraith)}, ${degreeOf(wraiths, wraith2)})`);
            await h.until(() => Boolean(degreeOf(plain, orc)), "the orc's save applied", { timeout: 8000 });
            await h.wait(800);
            h.assert(degreeOf(plain, orc) === "failure" && !orc.hasCondition("frightened"), `the orc fails and isn't Frightened (${degreeOf(plain, orc)}; ${conditions(orc)})`);
            return { wraith: conditions(wraith), wraith2: conditions(wraith2), orc: conditions(orc), counteract: counteract.counteract };
        },

        // Beckoning Cat Amulet (scripts/rerolls.js rerollAllies, src/live/reroll-card.js triggeringRoll's failed): "any allies within 10 feet who
        // also just failed or critically failed a Reflex saving throw from the same source … can also reroll their saving throw and use the better
        // result." Two allies roll Reflex against DC 25, every die a 10: the one at +0 fails, the one at +30 succeeds. The amulet's reroll card,
        // pressed with both targeted: PF2e rerolls the failed one's save (its isReroll message, the higher kept), not the other's, and the card says
        // the other has no failed Reflex save to reroll.
        async b3TriggersBeckoningCatAllies(scene) {
            await h.clearSquares(scene, [[2, 10], [3, 10], [2, 11]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Cat Wearer", { type: "character", x: 2, y: 10, level: 5 });
            const { actor: failed, token: failedToken } = await h.creature(scene, "Cat Ally Failed", { x: 3, y: 10, save: 0 });
            const { actor: saved, token: savedToken } = await h.creature(scene, "Cat Ally Saved", { x: 2, y: 11, save: 30 });
            const saveBy = (actor) => (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === actor.id;
            let since = Date.now();
            await h.withDie(10, () => failed.saves.reflex.roll({ dc: { value: 25 }, skipDialog: true }));
            const first = await h.messageAfter(since, saveBy(failed), { what: "the failed ally's Reflex save" });
            await h.withDie(10, () => saved.saves.reflex.roll({ dc: { value: 25 }, skipDialog: true }));
            const second = await h.messageAfter(since, saveBy(saved), { what: "the other ally's Reflex save" });
            h.assert(["failure", "criticalFailure"].includes(first.flags.pf2e.context.outcome) && ["success", "criticalSuccess"].includes(second.flags.pf2e.context.outcome), `one fails, one succeeds (${first.flags.pf2e.context.outcome}, ${second.flags.pf2e.context.outcome})`);
            const amulet = await h.give(wearer, "Beckoning Cat Amulet");
            await wearerToken.object?.control?.();
            since = Date.now();
            await amulet.consume();
            const card = await h.messageAfter(since, h.itemCard("reroll"), { what: "the amulet's reroll card" });
            const reroll = stateOf(card).plan.reroll;
            h.assert(reroll.who === "allies" && reroll.failed === true && reroll.keep === "higher" && reroll.statistic === "reflex", `the allies' failed Reflex saves, the higher kept (${JSON.stringify(reroll)})`);
            since = Date.now();
            await live().apply(card.id, { targets: [failedToken.uuid, savedToken.uuid] });
            const rerolled = await h.messageAfter(since, (message) => saveBy(failed)(message) && message.flags.pf2e.context.isReroll, { what: "PF2e's reroll of the failed ally's save", timeout: 10000 });
            await h.until(() => resultsOf(card).length >= 2, `the card's two lines (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            await h.wait(800);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && saveBy(saved)(message) && message.flags.pf2e.context.isReroll), "no reroll of the ally that succeeded");
            const lines = resultsOf(card);
            h.assert(lines.some((line) => /^Rerolled .*Cat Ally Failed.*keeping the higher result/.test(line)), `the failed ally's reroll line (${JSON.stringify(lines)})`);
            h.assert(lines.some((line) => /Cat Ally Saved: no failed reflex saving throw to reroll/.test(line)), `the other's line (${JSON.stringify(lines)})`);
            return { rerolled: rerolled.id, outcome: rerolled.flags.pf2e.context.outcome, lines };
        },

        // Pyrefeather Token (scripts/live.js: the reroll card beside the item card; scripts/rerolls.js raiseRoll's raise.dc, triggeringRoll's
        // recovery): "you reduce the triggering recovery check's DC by 1 … You also gain 5 temporary Hit Points that last for 1 minute." A dying 1
        // character rolls PF2e's own recovery check, a 10 against DC 11 (10 + dying 1) — its message a "flat-check" with dc.value 11, a failure.
        // Used then: the item card (5 temporary Hit Points, applied) and the reroll card beside it, whose Apply reads "recovery check (10) against
        // DC 10 (11 − 1): a success (was a failure)".
        async b3TriggersPyrefeatherRecovery(scene) {
            await h.clearSquares(scene, [[2, 14]]);
            const { actor: pc } = await h.creature(scene, "Pyre Dying", { type: "character", x: 2, y: 14, level: 3 });
            await hitPoints(pc, 30, 0);
            await pc.increaseCondition("dying", { value: 1 });
            await h.until(() => valueOf(pc, "dying") === 1, `dying 1 (${conditions(pc)})`, { timeout: 5000 });
            const dc = (Number(pc.system.attributes.dying?.recoveryDC) || 10) + 1;
            let since = Date.now();
            // (No roll dialog: shift held when the user's checks show one, as PF2e reads a click.)
            await h.withDie(10, () => pc.rollRecovery(new MouseEvent("click", { shiftKey: game.user.settings?.showCheckDialogs !== false })));
            const check = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === pc.id, { what: "PF2e's recovery check" });
            const context = check.flags.pf2e.context;
            h.assert(Number(context.dc?.value) === dc, `PF2e's recovery check message carries dc.value ${dc} (${JSON.stringify(context.dc ?? null)})`);
            h.assert(Number(check.rolls?.[0]?.total) === 10 && context.outcome === "failure", `a 10, a failure (${check.rolls?.[0]?.total}, ${context.outcome})`);
            const feather = await h.give(pc, "Pyrefeather Token");
            since = Date.now();
            await feather.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the token's item card" });
            const reroll = await h.messageAfter(since, h.itemCard("reroll"), { what: "the reroll card beside it" });
            h.assert(Number(stateOf(reroll).plan.reroll.raise?.dc) === -1 && stateOf(reroll).plan.reroll.recovery === true, `its DC 1 lower, a recovery check (${JSON.stringify(stateOf(reroll).plan.reroll)})`);
            await live().apply(card.id);
            await h.until(() => Number(pc.system.attributes.hp.temp) === 5, `5 temporary Hit Points (${pc.system.attributes.hp.temp}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const tempEffect = pc.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "TempHP"));
            if (tempEffect) h.assert(tempEffect.system.duration.value === 1 && tempEffect.system.duration.unit === "minutes", `for 1 minute (${JSON.stringify(tempEffect.system.duration)})`);
            await live().apply(reroll.id, { targets: [] });
            await h.until(() => resultsOf(reroll).length > 0, "the reroll card's lines", { timeout: 8000 });
            const line = resultsOf(reroll)[0] ?? "";
            h.assert(new RegExp(`recovery check \\(10\\) against DC ${dc - 1} \\(${dc} − 1\\): a success \\(was a failure\\)`).test(line), `its line (${line})`);
            return { dc, line, temp: pc.system.attributes.hp.temp };
        },

        // Grisly Scythe (scripts/strikes.js hitRiders; src/compiler/strike-gate.js gateMet's critical; scripts/drain.js's immediate drain from the
        // scythe's own damage): "Trigger Your attack roll with the grisly scythe is a critical success … you inflict void damage. You regain a
        // number of hit points equal to half the void damage inflicted, and the creature struck becomes Sickened 1." After a plain hit (every die a
        // 5 against AC 1) the activation is refused ("its Requirements need a critical hit Strike with it as its last roll"). After a critical hit
        // (every die a 15) its Strike card's Apply puts Sickened 1 on the creature struck at once; that Strike's damage roll is void (its wounding
        // rune's persistent bleed stays bleed: only the slashing is changed); applied as PF2e's Damage button does, its wielder (at 5 of 100 Hit
        // Points) regains half the void damage the creature lost, whispered.
        async b3TriggersGrislyScytheCritical(scene) {
            await h.clearSquares(scene, [[2, 18], [3, 18]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Grisly Reaper", { type: "character", x: 2, y: 18, level: 9 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Grisly Victim", { x: 3, y: 18, ac: 1, hp: 300, alliance: "opposition", level: 9 });
            await hitPoints(user, 100, 5);
            const scythe = await h.give(user, "Grisly Scythe");
            await scythe.update(held(2));
            await userToken.object?.control?.();
            await h.target(foeToken);
            // (A plain hit: refused.)
            const plain = await h.withDie(5, () => h.strike(user, scythe));
            h.assert(plain.attack.flags.pf2e.context.outcome === "success", `a hit, not a critical one (${plain.attack.flags.pf2e.context.outcome})`);
            const refused = await errorOf(live().activate(scythe.uuid, 0));
            h.assert(/Requirements need a critical hit Strike with it as its last roll/.test(refused ?? ""), `refused after a plain hit (${refused})`);
            // (A critical hit: its card.)
            const { action, attack } = await h.withDie(15, () => h.strike(user, scythe));
            h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (${attack.flags.pf2e.context.outcome})`);
            const card = await activated(scythe, 0, "strike", "the scythe's Strike card");
            await live().apply(card.id);
            await h.until(() => valueOf(foe, "sickened") === 1, `Sickened 1 on the creature struck as the card is applied (${conditions(foe)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const readied = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
            await h.until(() => readied()?.flags[h.NS].strikeRider.awaiting === true, "its readied Effect waiting for the hit's damage roll", { timeout: 8000 });
            // (Its types read off PF2e's own roll, no message.)
            const preview = await action.critical({ event: h.shift(), createMessage: false });
            const instances = preview?.instances ?? [];
            const now = instances.filter((instance) => !instance.persistent);
            const bleed = instances.filter((instance) => instance.persistent);
            h.assert(now.length && now.every((instance) => instance.type === "void"), `the damage void, not slashing (${instances.map((instance) => `${instance.formula}[${instance.persistent ? "persistent," : ""}${instance.type}]`).join(", ")})`);
            h.assert(bleed.length && bleed.every((instance) => instance.type === "bleed"), `the wounding rune's persistent bleed stays bleed (${bleed.map((instance) => `${instance.formula}[${instance.type}]`).join(", ") || "none"})`);
            let since = Date.now();
            await action.critical({ event: h.shift() });
            const rolled = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the critical hit's damage roll" });
            const foeBefore = hpOf(foe);
            const userBefore = hpOf(user);
            since = Date.now();
            await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken, item: rolled.item ?? scythe });
            await h.until(() => hpOf(foe) < foeBefore, "the damage applied", { timeout: 8000 });
            const lost = foeBefore - hpOf(foe);
            const heal = Math.min(Math.floor(lost / 2), 100 - userBefore);
            await h.until(() => hpOf(user) === userBefore + heal, `the wielder regains half the ${lost} void damage, ${heal} (${userBefore} → ${hpOf(user)})`, { timeout: 8000 });
            const whisper = await h.messageAfter(since, (message) => /regains \d+ Hit Points from the void damage/.test(message.content ?? ""), { what: "the whispered healing line" });
            h.assert(whisper.whisper?.length, "whispered");
            await h.wait(500);
            h.assert(valueOf(foe, "sickened") === 1, `still Sickened 1, not given again by the damage roll (${conditions(foe)})`);
            return { lost, healed: heal, line: whisper.content, instances: instances.map((instance) => `${instance.formula}[${instance.type}]`) };
        },

        // Deflecting Branch's second activation (scripts/poisons.js attackChoices "proficiency"; the knocked-away shot's damage, scripts/live.js
        // triggeringMissFormula): "The attack is redirected toward a creature within 60 feet. Make a ranged attack against the creature using
        // your highest proficiency with a ranged weapon." An archer's longbow (1d8+3 piercing) misses the user; the user, expert in martial weapons
        // (untrained in the rest), activates it: its card's attack choice "Ranged attack (best weapon proficiency) +N", N its Dexterity modifier +
        // its level + 4. Pressed at another creature with that choice: the ability module's attack card at +N, and a hit (every die a 10 against
        // AC N + 5) deals it the longbow's damage.
        async b3TriggersDeflectingBranchShot(scene) {
            await h.clearSquares(scene, [[2, 4], [8, 4], [4, 7]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Branch Deflector", { type: "character", x: 2, y: 4, level: 14 });
            const { actor: archer, token: archerToken } = await h.creature(scene, "Branch Archer", { x: 8, y: 4, alliance: "opposition" });
            const { actor: victim, token: victimToken } = await h.creature(scene, "Branch Victim", { x: 4, y: 7, hp: 200, alliance: "opposition" });
            await user.update({ "system.proficiencies.attacks.martial.rank": 2 });
            await h.until(() => Number(user.system.proficiencies?.attacks?.martial?.rank) === 2, `expert in martial weapons (${JSON.stringify(user.system.proficiencies?.attacks ?? null)})`, { timeout: 5000 });
            const ranks = ["simple", "martial", "advanced"].map((category) => Number(user.system.proficiencies?.attacks?.[category]?.rank)).filter(Number.isFinite);
            const top = Math.max(...ranks);
            const expected = Number(user.system.abilities?.dex?.mod ?? 0) + (top > 0 ? Number(user.level) + 2 * top : 0);
            const branch = await h.give(user, "Deflecting Branch");
            await branch.update(held(2));
            const [bow] = await archer.createEmbeddedDocuments("Item", [{ name: "Longbow", type: "melee", system: { bonus: { value: -30 }, damageRolls: { a: { damage: "1d8+3", damageType: "piercing" } }, traits: { value: [] }, range: { increment: 100, max: 600 } } }]);
            await archerToken.object?.control?.();
            await h.target(userToken);
            const { attack } = await h.strike(archer, bow);
            h.assert(["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome) && (attack.flags.pf2e.context.options ?? []).includes("item:ranged"), `a ranged miss at the user (${attack.flags.pf2e.context.outcome})`);
            await userToken.object?.control?.();
            const card = await activated(branch, 1, "expose", "the reflected shot's card");
            const choices = stateOf(card).attackChoices ?? [];
            const sign = (value) => (value >= 0 ? `+${value}` : `${value}`);
            h.assert(choices[0]?.kind === "proficiency" && choices[0].label === `Ranged attack (best weapon proficiency) ${sign(expected)}` && Number(choices[0].modifier) === expected, `its attack choice at ${sign(expected)} (${JSON.stringify(choices)})`);
            const components = stateOf(card).plan.resolution.sharedDamage?.components ?? [];
            h.assert(components.some((component) => component.type === "piercing" && /1d8/.test(component.formula ?? "")), `the longbow's damage (${JSON.stringify(components)})`);
            await victim.update({ "system.attributes.ac.value": expected + 5 });
            const since = Date.now();
            await live().apply(card.id, { targets: [victimToken.uuid], attackChoice: 0 });
            const shot = await h.messageAfter(since, h.abilitySaveCard, { what: "the attack card at the creature" });
            h.assert(Number(abilityState(shot).plan.resolution.check.modifier) === expected, `at ${sign(expected)} (${JSON.stringify(abilityState(shot).plan.resolution.check)})`);
            const hp = hpOf(victim);
            await h.withDie(10, () => h.rollAndApply(shot));
            await h.until(() => hpOf(victim) < hp, `the hit's damage on the creature (${hpOf(victim)})`, { timeout: 10000 });
            return { expected, label: choices[0].label, degree: degreeOf(shot, victim), lost: hp - hpOf(victim) };
        }
    };
};
