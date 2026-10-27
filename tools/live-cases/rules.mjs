// The rules group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (scripts/live.js, src/live/*.js): Toast!'s several marks (item.mark.several), Penultimate Heartbeat's card kept
// for each kill (src/live/poison-card.js KILLED), Fundamental Oil's type on its rune Effect's toggle (src/live/card.js runeEffectSource
// damageTypes), Misty Chill's own PF2e Effect on its user (scripts/live.js giveUserConditions, kind "native"). The rest of the group's
// readings feed mechanisms already live-checked (note Effects from rows, zone saves with trigger.immunity, snare zones, item.ruleEffects).

const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ");

    return {
        // Rhyton of the Radiant Ifrit's Toast! (2026-10-27, withToastedMarks; scripts/live.js mark.several, src/live/card.js markEffectSource
        // tokens): "+2 item bonus to Deception, Diplomacy, or Intimidation checks against those creatures for 1 hour". Apply with nothing
        // targeted is refused ("Target the creatures it's against first"), the card left open; with two creatures targeted, one mark Effect on
        // its user for the hour with a TokenMark at each token (the same slug), the three +2 item bonuses predicated on that mark. PF2e's
        // Demoralize at either toasted creature gets the +2; at a third creature, not toasted, it doesn't.
        async rulesToastMarksSeveral(scene) {
            await h.clearSquares(scene, [[2, 2], [3, 2], [4, 2], [3, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Toast Raiser", { type: "character", x: 2, y: 2, level: 14 });
            const { token: first } = await h.creature(scene, "Toasted Guest", { x: 3, y: 2, alliance: "opposition" });
            const { token: second } = await h.creature(scene, "Toasted Guest Two", { x: 4, y: 2, alliance: "opposition" });
            const { token: other } = await h.creature(scene, "Untoasted Guest", { x: 3, y: 4, alliance: "opposition" });
            const slug = "rhyton-of-the-radiant-ifrit-toast";
            const rhyton = await h.give(user, "Rhyton of the Radiant Ifrit");
            await rhyton.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const since = Date.now();
            // (Toast! is its first activation, Ifrit's Command its second.)
            await api().activate(rhyton.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "Toast!'s card" });
            // (Nothing targeted: refused, nothing applied, the card still open.)
            let refused = null;
            await api().apply(card.id, { drinker: 0, targets: [] }).catch((error) => {
                refused = error.message;
            });
            h.assert(/Target the creatures it's against first/.test(refused ?? ""), `refused with no creature targeted (${refused})`);
            h.assert(game.messages.get(card.id).getFlag(h.NS, "card").status === "open", "its card still open after the refusal");
            h.assert(!user.itemTypes.effect.some((effect) => effect.flags?.[h.NS]?.mark === slug), "no mark Effect from the refused Apply");
            await api().apply(card.id, { drinker: 0, targets: [first.uuid, second.uuid] });
            const marks = (token) => user.synthetics.tokenMarks.get(token.uuid) ?? [];
            await h.until(() => marks(first).includes(slug) && marks(second).includes(slug), `both toasted creatures marked (${names(user)})`, { timeout: 8000 });
            h.assert(!marks(other).includes(slug), "the third creature not marked");
            const markEffects = user.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.mark === slug);
            h.assert(markEffects.length === 1, `one mark Effect (${markEffects.length})`);
            const tokenMarks = (markEffects[0].system.rules ?? []).filter((rule) => rule.key === "TokenMark");
            h.assert(tokenMarks.length === 2 && tokenMarks.every((rule) => rule.slug === slug) && [first.uuid, second.uuid].every((uuid) => tokenMarks.some((rule) => rule.uuid === uuid)), `a TokenMark at each token, one slug (${JSON.stringify(tokenMarks)})`);
            const { value, unit } = markEffects[0].system.duration;
            h.assert(value === 1 && unit === "hours", `the mark for 1 hour (${value} ${unit})`);
            const bonuses = user.itemTypes.effect.flatMap((effect) => (effect.system.rules ?? []).filter((rule) => rule.key === "FlatModifier"));
            for (const skill of ["deception", "diplomacy", "intimidation"]) {
                h.assert(bonuses.some((rule) => [].concat(rule.selector).includes(skill) && rule.type === "item" && Number(rule.value) === 2 && JSON.stringify(rule.predicate ?? []).includes(`target:mark:${slug}`)), `+2 item to ${skill} against the marked creatures (${JSON.stringify(bonuses)})`);
            }
            await userToken.object?.control?.();
            const demoralize = async (token) => {
                await h.target(token);
                const at = Date.now();
                await game.pf2e.actions.get("demoralize").use({ actors: [user], event: h.shift() });
                const message = await h.messageAfter(at, (entry) => entry.flags?.pf2e?.context?.type === "skill-check", { what: "Demoralize" });
                return (message.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "item" && modifier.modifier === 2 && modifier.enabled !== false);
            };
            h.assert(await demoralize(first), "+2 item to Demoralize at the first toasted creature");
            h.assert(await demoralize(second), "+2 item to Demoralize at the second toasted creature");
            h.assert(!(await demoralize(other)), "no bonus at the creature not toasted");
            return { refused, marks: tokenMarks.map((rule) => rule.uuid), results: game.messages.get(card.id).getFlag(h.NS, "card").results };
        },

        // Penultimate Heartbeat (2026-10-27, heartbeat.js; src/live/poison-card.js KILLED): used, its save card is kept for later — open for the
        // whetstone's hour (state.repeat, until), not posted at once — at the wielder's own class or spell DC, whichever is higher (a level-16
        // NPC's). Pressed at a kill with two foes targeted: one Will save card; at a d20 of 10, the first fails (its Will set 15 below the DC:
        // 9d10 spirit, Frightened 2, a frightened floor of 1 for the hour and the "Its soul's gore" note Effect) and the second critically fails
        // (double that damage, Frightened 3, floor 2). Lowered twice, as the GM does at the ends of its turns (PF2e 8.6 doesn't lower frightened
        // by itself), the first stays at Frightened 1, the second at 2. Pressed again at another kill (a third foe): a second save card, the card
        // still open, used twice.
        async rulesHeartbeatKillCard(scene) {
            await h.clearSquares(scene, [[2, 10], [4, 10], [4, 11], [4, 12]]);
            const { actor: wielder } = await h.creature(scene, "Heartbeat Wielder", { x: 2, y: 10, level: 16 });
            const { actor: one, token: oneToken } = await h.creature(scene, "Heartbeat Foe", { x: 4, y: 10, hp: 400, alliance: "opposition" });
            const { actor: two, token: twoToken } = await h.creature(scene, "Heartbeat Foe Two", { x: 4, y: 11, hp: 400, alliance: "opposition", save: -30 });
            const { actor: three, token: threeToken } = await h.creature(scene, "Heartbeat Foe Three", { x: 4, y: 12, hp: 400, alliance: "opposition", save: -30 });
            const stone = await h.give(wielder, "Penultimate Heartbeat");
            let since = Date.now();
            await stone.consume();
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the whetstone's card kept for later" });
            const state = card.getFlag(h.NS, "card");
            h.assert(state.status === "open" && state.later && state.repeat, `kept for later and pressed again (${JSON.stringify({ status: state.status, later: state.later, repeat: state.repeat })})`);
            const left = Number(state.until) - game.time.worldTime;
            h.assert(left > 3500 && left <= 3600, `open for the whetstone's hour (${left} seconds left)`);
            await h.wait(1000);
            h.assert(!game.messages.contents.some((message) => message.timestamp >= since && h.abilitySaveCard(message)), "no save card before it's pressed");
            const attributes = wielder.system.attributes;
            const expected = attributes.classOrSpellDC?.value ?? Math.max(attributes.classDC?.value ?? 0, attributes.spellDC?.value ?? 0);
            const against = state.plan.resolution.check.against;
            h.assert(against?.dc === "fixed" && against.value === expected && expected > 0, `the wielder's DC ${expected} (${JSON.stringify(against)})`);
            // (The first foe fails by 5 at a d20 of 10; the second, at Will −30, critically fails.)
            await one.update({ "system.saves.will.value": expected - 15 });
            const frightened = (actor) => actor.getCondition?.("frightened")?.value ?? 0;
            const floorOf = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.conditionFloor?.slug === "frightened") ?? null;
            const gore = (actor) => actor.itemTypes.effect.find((effect) => /Its soul's gore$/.test(effect.name)) ?? null;
            const hp = [one.system.attributes.hp.value, two.system.attributes.hp.value];
            since = Date.now();
            await api().apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the cone's save card" });
            const check = save.flags[ABILITY].card.plan.resolution.check;
            h.assert(check.statistic === "will" && check.against?.value === expected, `a Will save at DC ${expected} (${JSON.stringify(check)})`);
            await h.withDie(10, () => h.rollAndApply(save));
            await h.until(() => one.system.attributes.hp.value < hp[0] && two.system.attributes.hp.value < hp[1], `the spirit damage on both (${one.system.attributes.hp.value}, ${two.system.attributes.hp.value})`, { timeout: 10000 });
            await h.until(() => frightened(one) === 2 && frightened(two) === 3, `Frightened 2 and 3 (${frightened(one)}, ${frightened(two)})`, { timeout: 10000 });
            await h.until(() => floorOf(one) && floorOf(two) && gore(one) && gore(two), `the floors and the note Effects (${names(one)} | ${names(two)})`, { timeout: 10000 });
            const lost = [hp[0] - one.system.attributes.hp.value, hp[1] - two.system.attributes.hp.value];
            h.assert(lost[0] >= 9 && lost[0] <= 90 && lost[1] === 2 * lost[0], `9d10 on the failure, double on the critical failure (${lost})`);
            const floors = [floorOf(one), floorOf(two)].map((effect) => ({ value: effect.flags[ABILITY].conditionFloor.value, duration: `${effect.system.duration.value} ${effect.system.duration.unit}` }));
            h.assert(floors[0].value === 1 && floors[1].value === 2 && floors.every((floor) => floor.duration === "1 hours"), `floors 1 and 2 for the hour (${JSON.stringify(floors)})`);
            const goreTime = gore(one).system.duration;
            h.assert(goreTime.value === 1 && goreTime.unit === "hours", `the note Effect for the hour (${goreTime.value} ${goreTime.unit})`);
            // (The ends of two of their turns, as the GM lowers frightened: the floors hold.)
            for (let step = 0; step < 2; step++) {
                await one.decreaseCondition("frightened");
                await two.decreaseCondition("frightened");
                await h.wait(400);
            }
            await h.until(() => frightened(one) === 1 && frightened(two) === 2, `held at Frightened 1 and 2 (${frightened(one)}, ${frightened(two)})`, { timeout: 5000 });
            // (Another kill in the hour: pressed again at the third foe.)
            const hpThree = three.system.attributes.hp.value;
            since = Date.now();
            await api().apply(card.id, { targets: [threeToken.uuid] });
            const again = await h.messageAfter(since, h.abilitySaveCard, { what: "the second kill's save card" });
            const targets = again.flags[ABILITY].card.targets ?? [];
            h.assert(targets.length === 1 && targets[0].actorUuid === three.uuid, `the second card at the third foe alone (${JSON.stringify(targets)})`);
            await h.withDie(10, () => h.rollAndApply(again));
            await h.until(() => three.system.attributes.hp.value < hpThree && frightened(three) === 3 && floorOf(three), `the third foe's double damage, Frightened 3 and floor (${three.system.attributes.hp.value}, ${frightened(three)})`, { timeout: 10000 });
            const after = game.messages.get(card.id).getFlag(h.NS, "card");
            h.assert(after.status === "open" && after.uses === 2, `still open, used twice (${after.status}, ${after.uses})`);
            return { dc: expected, lost, floors, held: [frightened(one), frightened(two)], uses: after.uses, results: after.results };
        },

        // Fundamental Oil (2026-10-27, fundamental.js; src/live/card.js runeEffectSource with rune.damageTypes): Bane Oil against elementals,
        // "the damage type is the same as the target's greatest weakness if the target has weakness to acid, cold, electricity, fire, or sonic
        // damage. If it has none of these, the additional damage is the same type as the weapon's damage type." Used on the longsword picked: its
        // Effect has an always-on toggle whose suboptions are Acid … Sonic and None, and a 1d6 DamageDice for each against elementals. Fire set:
        // a Strike's damage at an elemental has 1d6 fire, at a creature that isn't one nothing more; None set: 1d6 more of the sword's own type
        // (no energy type) at the elemental.
        async rulesFundamentalOilType(scene) {
            await h.clearSquares(scene, [[8, 2], [9, 2], [9, 3]]);
            const { actor: fighter, token: fighterToken } = await h.creature(scene, "Fundamental Fighter", { type: "character", x: 8, y: 2 });
            const { actor: elemental, token: elementalToken } = await h.creature(scene, "Fundamental Elemental", { x: 9, y: 2, hp: 300, alliance: "opposition" });
            const { token: banditToken } = await h.creature(scene, "Fundamental Bandit", { x: 9, y: 3, hp: 300, alliance: "opposition" });
            await elemental.update({ "system.traits.value": ["elemental"] });
            const sword = await h.give(fighter, "Longsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await h.until(() => fighterToken.object && elementalToken.object && banditToken.object, "the tokens drawn", { timeout: 5000 });
            await fighterToken.object?.control?.();
            const oil = await h.give(fighter, "Fundamental Oil");
            const since = Date.now();
            await oil.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the oil's card" });
            const weapons = card.getFlag(h.NS, "card").weapons ?? [];
            const weapon = weapons.findIndex((entry) => entry.id === sword.id);
            h.assert(weapon >= 0, `the longsword offered (${weapons.map((entry) => entry.name)})`);
            await api().apply(card.id, { runeWeapon: weapon });
            const effect = () => fighter.itemTypes.effect.find((entry) => entry.flags?.[h.NS]?.rune === "bane" && entry.flags[h.NS].weaponId === sword.id) ?? null;
            await h.until(() => effect(), `the oil's Effect on the longsword (${names(fighter)})`, { timeout: 8000 });
            const option = "fundamental-oil-type";
            const toggle = () => (fighter.items.get(effect()?.id)?.system.rules ?? []).find((rule) => rule.key === "RollOption" && rule.option === option) ?? null;
            const rule = toggle();
            const suboptions = (rule?.suboptions ?? []).map((entry) => entry.value);
            h.assert(rule?.alwaysActive && rule.toggleable && JSON.stringify(suboptions) === JSON.stringify(["acid", "cold", "electricity", "fire", "sonic", "none"]), `an always-on toggle, Acid … Sonic and None (${JSON.stringify(rule)})`);
            const dice = (effect().system.rules ?? []).filter((entry) => entry.key === "DamageDice");
            h.assert(dice.length === 6 && dice.every((entry) => JSON.stringify(entry.predicate ?? []).includes("target:trait:elemental")), `a 1d6 for each type, against elementals (${JSON.stringify(dice)})`);
            const pick = async (value) => {
                await fighter.toggleRollOption("all", option, effect().id, true, value);
                await h.until(() => toggle()?.selection === value || (fighter.getRollOptions?.(["all"]) ?? []).includes(`${option}:${value}`), `${value} set on its toggle (${toggle()?.selection})`, { timeout: 5000 });
            };
            const damageAt = async (token) => {
                await h.target(token);
                const action = (fighter.system.actions ?? []).find((entry) => entry.item?.id === sword.id);
                const at = Date.now();
                await action.damage({ event: h.shift() });
                const message = await h.messageAfter(at, (entry) => entry.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
                return message.rolls[0]?.formula ?? "";
            };
            await pick("fire");
            const fireAtElemental = await damageAt(elementalToken);
            const fireAtBandit = await damageAt(banditToken);
            h.assert(/\b1d6\b/.test(fireAtElemental) && /fire/.test(fireAtElemental), `1d6 fire at the elemental (${fireAtElemental})`);
            h.assert(!/\b1d6\b/.test(fireAtBandit) && !/fire/.test(fireAtBandit), `nothing more at the bandit (${fireAtBandit})`);
            await pick("none");
            const noneAtElemental = await damageAt(elementalToken);
            h.assert(/\b1d6\b/.test(noneAtElemental) && !/acid|cold|electricity|fire|sonic/.test(noneAtElemental), `1d6 of the sword's own type at the elemental (${noneAtElemental})`);
            return { fireAtElemental, fireAtBandit, noneAtElemental };
        },

        // Arctic Worm Chitin Shield's Misty Chill (2026-10-27, withZoneOwnEffect; scripts/live.js giveUserConditions kind "native", through the
        // ability module's applyChange): "You Raise the Shield … you gain resistance 5 to cold" — PF2e's own Effect: Misty Chill on its user as
        // the activation's zone starts, once. Its GrantItem gives Effect: Raise a Shield, so the held tower shield is raised (AC +2), and its
        // resistance 5 to cold is there; the chat says it, and the mist's zone is still made on the user's token. (The zone's save at the end of
        // an adjacent creature's turn is arcticAura's.)
        async rulesMistyChillOwnEffect(scene) {
            await h.clearSquares(scene, [[14, 2]]);
            const { actor: holder, token: holderToken } = await h.creature(scene, "Misty Chill Holder", { type: "character", x: 14, y: 2, level: 12 });
            const shield = await h.give(holder, "Arctic Worm Chitin Shield");
            await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await h.wait(500);
            const cold = () => (holder.attributes.resistances ?? []).find((entry) => entry.type === "cold")?.value ?? 0;
            const ac = holder.system.attributes.ac.value;
            h.assert(!holder.attributes.shield?.raised && cold() === 0, `not raised, no cold resistance before (${holder.attributes.shield?.raised}, ${cold()})`);
            const earlier = new Set(scene.regions.map((region) => region.id));
            const fresh = () => scene.regions.find((region) => !earlier.has(region.id) && region.flags?.[ABILITY]?.zone) ?? null;
            const misty = () => holder.itemTypes.effect.filter((effect) => effect.slug === "effect-misty-chill" || effect.name === "Effect: Misty Chill");
            const since = Date.now();
            try {
                await api().activate(shield.uuid, 0);
                await h.until(() => misty().length, `PF2e's Effect: Misty Chill on its user (${names(holder)})`, { timeout: 8000 });
                await h.until(() => fresh(), "the mist's zone", { timeout: 8000 });
                await h.until(() => cold() === 5, `resistance 5 to cold (${cold()})`, { timeout: 5000 });
                await h.until(() => holder.itemTypes.effect.some((effect) => effect.slug === "effect-raise-a-shield"), `Effect: Raise a Shield granted (${names(holder)})`, { timeout: 5000 });
                await h.until(() => holder.attributes.shield?.raised, "the held shield raised", { timeout: 5000 });
                const bonus = Number(shield.system.acBonus) || 2;
                await h.until(() => holder.system.attributes.ac.value === ac + bonus, `AC ${ac} → ${ac + bonus} (${holder.system.attributes.ac.value})`, { timeout: 5000 });
                const said = await h.messageAfter(since, (message) => /Misty Chill/.test(message.content ?? "") && /gains Effect: Misty Chill/.test(message.content ?? ""), { what: "the chat line of its Effect" });
                await h.wait(1000);
                h.assert(misty().length === 1, `one Effect: Misty Chill (${misty().length})`);
                const attached = fresh().attachment?.token?.id ?? fresh().attachment?.token ?? null;
                h.assert(attached === holderToken.id, `the zone on the holder's token (${attached})`);
                return { effects: names(holder), resistance: cold(), ac: [ac, holder.system.attributes.ac.value], said: said.content };
            } finally {
                await fresh()?.delete().catch(() => null);
            }
        }
    };
};
