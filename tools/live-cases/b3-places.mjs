// The third batch's places group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code has cases: Hollow Robes' Hollow Target (bonus.noDamage — scripts/half-damage.js beforeNoDamage on the core's
// damage listener, the readied card's words and flags in src/live/fortune-card.js, its recovery ends every persistent damage — scripts/foundry.js
// recover's ends), Hagbane Biscuit eaten by a changeling (item.unlessKind.works — scripts/live.js applyToRecipient's "works only if it succeeds
// at its save" line, the save card's success rows the biscuit's own), and Effortless Garden's ways card, whose "Spending a Mythic Point" way is a
// zone with a cost (scripts/live.js's spend for a card-less zone route, checkSpend/paySpend — never live-checked before; the ways card's way
// posting it, scripts/ways.js). The group's other asked-for checks feed mechanisms already live-checked: Shadow's Heart's teleport card beside
// its item card (plan.item.move — tools/live-cases/moving.mjs's whistles) and its duplicate's +28 attack card kept open 3 rounds (plan.again with
// rounds and an ownCheck attack — sensesAnimatedSetFree), and the Privacy Ward Fulus' room, a zone whose Effect for those inside carries PF2e's
// toggle (zone.inside — litAreas, destabilizerAround, b2-areas).

const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const text = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionNames = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${Number.isFinite(condition.value) ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const mythicOf = (actor) => Number(actor.system.resources?.mythicPoints?.value ?? NaN);
    const DamageRoll = () => CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
    // (An activation's index by its name: src/compiler/permanent.js's own entries.)
    async function activationIndex(item, name) {
        const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
        const index = compileActivations({ ...item.toObject(false), uuid: item.uuid }).find((entry) => entry.activation?.name === name)?.index;
        h.assert(Number.isInteger(index), `${item.name}'s ${name} activation`);
        return index;
    }
    // (PF2e's persistent damage condition, its usual DC 15.)
    const persistentSource = (formula, damageType) => {
        const source = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        source.system.persistent = { formula, damageType, dc: 15 };
        return source;
    };
    const persistentOf = (actor) => actor.itemTypes.condition.filter((condition) => condition.slug === "persistent-damage");
    // (A mythic NPC: PF2e gives characters Mythic Points only in a mythic campaign — as tools/live-check.mjs's mythicCost.)
    async function mythic(actor, points) {
        await actor.update({ "system.traits.value": [...new Set([...(actor.system.traits.value ?? []), "mythic"])] });
        await actor.update({ "system.resources.mythicPoints.value": points });
        await h.until(() => mythicOf(actor) === points, `${points} Mythic Point${points === 1 ? "" : "s"} on ${actor.name} (${mythicOf(actor)} of ${actor.system.resources?.mythicPoints?.max})`, { timeout: 5000 });
    }

    return {
        // Hollow Robes' Hollow Target (illusions.js; bonus.noDamage, scripts/half-damage.js beforeNoDamage; src/live/fortune-card.js): "Trigger You
        // take persistent damage or a critical hit from a Strike … The damage from a critical hit Strike is reduced to 0 … Any persistent damage
        // affecting you ends." A mythic NPC (2 Mythic Points, 100 Hit Points) taking persistent fire 1d6 and bleed 2. Activated: the readied
        // (fortune) card says "the triggering damage reduced to 0, all its persistent damage ended"; Apply spends a Mythic Point, gives the Effect
        // flagged noDamage, and both persistent damages end. A critical hit's 30 slashing applied (PF2e's DamageRoll, degreeOfSuccess 3): its
        // Hit Points stay 100. Again for a persistent-damage tick (a new persistent fire 2d6, its own damage roll): the second point spent, the
        // persistent fire ended, and that tick applied as 0. Each damage should spend its Effect (scripts/fortune.js againstRolled) — checked last,
        // after both zeroed damages, so the Hit Points are seen either way.
        async b3PlacesHollowTargetZero(scene) {
            await h.clearSquares(scene, [[1, 3]]);
            const { actor: wearer, token } = await h.creature(scene, "Hollow Target Wearer", { x: 1, y: 3, level: 13, hp: 100 });
            await mythic(wearer, 2);
            const robes = await h.give(wearer, "Hollow Robes");
            await robes.update({ "system.equipped.inSlot": true, "system.equipped.invested": true }).catch(() => null);
            const index = await activationIndex(robes, "Hollow Target");
            const zeroing = () => wearer.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "rollTwice")?.noDamage);
            // The readied card, applied: its Effect, the point spent, every persistent damage ended.
            const ready = async (pointsLeft) => {
                const since = Date.now();
                await live().activate(robes.uuid, index);
                const card = await h.messageAfter(since, h.itemCard("fortune"), { what: "Hollow Target's readied card" });
                h.assert(/the triggering damage reduced to 0/.test(text(card)) && /all its persistent damage ended/.test(text(card)), `the card's words (${text(card).slice(0, 400)})`);
                await live().apply(card.id);
                await h.until(() => zeroing(), `the readied Effect flagged noDamage (${effectNames(wearer)})`, { timeout: 8000 });
                await h.until(() => !persistentOf(wearer).length, `every persistent damage ended (${conditionNames(wearer)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                await h.until(() => mythicOf(wearer) === pointsLeft, `a Mythic Point spent (${mythicOf(wearer)} left)`, { timeout: 8000 });
                h.assert(zeroing().getFlag(h.NS, "rollTwice")?.against?.damage === true, `against the triggering damage (${JSON.stringify(zeroing().getFlag(h.NS, "rollTwice")?.against ?? null)})`);
                return card;
            };
            await wearer.createEmbeddedDocuments("Item", [persistentSource("1d6", "fire"), persistentSource("2", "bleed")]);
            await h.until(() => persistentOf(wearer).length === 2, `persistent fire and bleed (${conditionNames(wearer)})`, { timeout: 5000 });
            const first = await ready(1);
            // (A critical hit from a Strike: 30 slashing, PF2e's own critical damage roll.)
            const before = hp(wearer);
            await wearer.applyDamage({ damage: await new (DamageRoll())("(2 * 15)[slashing]", {}, { degreeOfSuccess: 3 }).evaluate(), token });
            await h.wait(1500);
            h.assert(hp(wearer) === before, `the critical hit's damage reduced to 0 (${before} → ${hp(wearer)})`);
            await h.until(() => !zeroing(), "", { timeout: 3000 }).catch(() => null);
            const spentByCrit = !zeroing();
            // (A persistent damage tick: the condition's own damage roll, the reaction readied against it.)
            await wearer.createEmbeddedDocuments("Item", [persistentSource("2d6", "fire")]);
            await h.until(() => persistentOf(wearer).length === 1, `persistent fire 2d6 (${conditionNames(wearer)})`, { timeout: 5000 });
            const own = persistentOf(wearer)[0].system?.persistent?.damage;
            const tick = own?.clone ? await own.clone().evaluate() : await new (DamageRoll())("7[fire]").evaluate();
            h.assert(Number(tick.total) > 0, `the tick's damage rolled (${tick.formula} = ${tick.total})`);
            const second = await ready(0);
            const beforeTick = hp(wearer);
            await wearer.applyDamage({ damage: tick, token });
            await h.wait(1500);
            h.assert(hp(wearer) === beforeTick, `the persistent damage tick (${tick.total}) applied as 0 (${beforeTick} → ${hp(wearer)})`);
            await h.until(() => !zeroing(), "", { timeout: 3000 }).catch(() => null);
            const spentByTick = !zeroing();
            // (Each zeroed damage spends the Effect: PF2e's damage-taken message for it.)
            h.assert(spentByCrit && spentByTick, `the Effect spent by the damage it zeroed (after the critical hit: ${spentByCrit}, after the tick: ${spentByTick}; ${effectNames(wearer)} — PF2e's damage-taken message for 0 damage has flags.pf2e.appliedDamage null, which scripts/fortune.js againstRolled needs)`);
            return { hp: hp(wearer), mythic: mythicOf(wearer), first: resultsOf(first), second: resultsOf(second), tick: `${tick.formula} = ${tick.total}` };
        },

        // Hagbane Biscuit (area-readings.js; item.unlessKind { traits hag, changeling, works }, scripts/live.js applyToRecipient): "A hag or a
        // changeling who eats the biscuit must succeed at a DC 18 Fortitude save for the biscuit to have any effect; on a critical failure, it's
        // sickened 1." An NPC with no such trait eats one: its effects at once — the +1 status to saves against hags' effects (PF2e's FlatModifier,
        // predicated origin:trait:hag) and the note Effect with PF2e's toggles and the cold iron against hags (AdjustStrike target:trait:hag), no
        // save card. A changeling (Fortitude +15) eats one: the card's line "is hag or changeling: Hagbane Biscuit works only if it succeeds at its
        // save, and its save card follows", none of its effects yet, and the DC 18 Fortitude card at it; a 10 on the die (25, a success) gives the
        // biscuit's own effects. Another changeling (Fortitude −30) critically fails: Sickened 1, none of the biscuit's effects.
        async b3PlacesHagbaneChangeling(scene) {
            await h.clearSquares(scene, [[1, 1], [2, 1], [3, 1]]);
            const { actor: plain, token: plainToken } = await h.creature(scene, "Hagbane Plain Eater", { x: 1, y: 1 });
            const { actor: brave, token: braveToken } = await h.creature(scene, "Hagbane Changeling Brave", { x: 2, y: 1, save: 15 });
            const { actor: weak, token: weakToken } = await h.creature(scene, "Hagbane Changeling Weak", { x: 3, y: 1, save: -30 });
            for (const actor of [brave, weak]) await actor.update({ "system.traits.value": ["changeling", "human", "humanoid"] });
            await h.until(() => [brave, weak].every((actor) => actor.system.traits.value.includes("changeling")), "the changelings' trait", { timeout: 5000 });
            const vsHags = (actor) => actor.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && Number(rule.value) === 1 && JSON.stringify(rule.predicate ?? []).includes("origin:trait:hag")));
            const biscuitNote = (actor) => actor.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "hagbane-disguise"));
            const coldIron = (effect) => (effect?.system?.rules ?? []).find((rule) => rule.key === "AdjustStrike" && rule.value === "cold-iron");
            // Eaten and its card applied at the eater (the card's own drinker). → the card.
            const eat = async (actor, token) => {
                const biscuit = await h.give(actor, "Hagbane Biscuit");
                let since = Date.now();
                await biscuit.consume();
                const card = await h.messageAfter(since, h.itemCard("item"), { what: `${actor.name}'s biscuit card` });
                await live().apply(card.id, { targets: [token.uuid] });
                await h.until(() => stateOf(card)?.status === "applied", `${actor.name}'s card applied (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return card;
            };
            const saveAt = (actor) => (message) => h.abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === actor.uuid);
            // (Not a hag or a changeling: its effects at once.)
            let since = Date.now();
            const plainCard = await eat(plain, plainToken);
            await h.until(() => vsHags(plain) && biscuitNote(plain), `the +1 against hags and the note Effect (${effectNames(plain)})`, { timeout: 8000 });
            const rule = coldIron(biscuitNote(plain));
            h.assert(rule && JSON.stringify(rule.predicate ?? []).includes("target:trait:hag") && rule.property === "materials", `cold iron against hags (${JSON.stringify(biscuitNote(plain).system.rules)})`);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp) >= since && saveAt(plain)(message)), "no save card for an ordinary eater");
            // (A changeling: only on a success at its DC 18 Fortitude save.)
            since = Date.now();
            const braveCard = await eat(brave, braveToken);
            h.assert(resultsOf(braveCard).some((line) => line.includes(brave.name) && /is hag or changeling: Hagbane Biscuit works only if it succeeds at its save, and its save card follows/.test(line)), `the card's line (${JSON.stringify(resultsOf(braveCard))})`);
            const braveSave = await h.messageAfter(since, saveAt(brave), { what: "the changeling's save card" });
            const check = braveSave.flags[ABILITY].card.plan.resolution.check;
            h.assert(check.statistic === "fortitude" && check.against?.value === 18, `Fortitude DC 18 (${JSON.stringify(check)})`);
            h.assert(!vsHags(brave) && !biscuitNote(brave), `none of its effects before the save (${effectNames(brave)})`);
            await h.withDie(10, () => h.rollAndApply(braveSave));
            await h.until(() => vsHags(brave) && biscuitNote(brave), `a success: the biscuit's own effects (${effectNames(brave)}; ${conditionNames(brave)})`, { timeout: 10000 });
            h.assert(!brave.hasCondition("sickened"), `not sickened on a success (${conditionNames(brave)})`);
            // (A critical failure: Sickened 1, and nothing of the biscuit's.)
            since = Date.now();
            await eat(weak, weakToken);
            const weakSave = await h.messageAfter(since, saveAt(weak), { what: "the weak changeling's save card" });
            await h.withDie(10, () => h.rollAndApply(weakSave));
            await h.until(() => Number(weak.getCondition("sickened")?.value) === 1, `a critical failure: Sickened 1 (${conditionNames(weak)})`, { timeout: 10000 });
            await h.wait(800);
            h.assert(!vsHags(weak) && !biscuitNote(weak), `none of the biscuit's effects on a critical failure (${effectNames(weak)})`);
            return { plain: resultsOf(plainCard), brave: resultsOf(braveCard), braveEffects: effectNames(brave), weak: conditionNames(weak) };
        },

        // Effortless Garden (area-readings.js; its ways card's two zones, plan.spend on the one; scripts/live.js's spend for a zone route, which has no
        // card to apply it on): a mythic NPC with 0 Mythic Points uses the garden — the ways card's "Spending a Mythic Point" is refused ("has no
        // Mythic Point to spend"), no garden placed, the card still open. With 1 point, the same way places the 40-foot square zone with no end and
        // spends the point. A second garden "As it is": the zone for 24 hours, no point spent. (Its Region placed where the ability module asks:
        // canvas.regions.placeRegion answered at once, as tools/live-check.mjs's stoneraiserZone does.)
        async b3PlacesEffortlessGardenSpend(scene) {
            await h.clearSquares(scene, [[1, 5]]);
            const { actor: gardener } = await h.creature(scene, "Garden Mythic Planter", { x: 1, y: 5, level: 14 });
            await mythic(gardener, 0);
            const placing = canvas.regions.placeRegion;
            canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
            const gardens = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && /Effortless Garden/.test(`${region.name ?? ""} ${region.flags[ABILITY].zone.itemName ?? ""}`));
            const zoneOf = (region) => region.flags[ABILITY].zone.zone ?? {};
            const use = async () => {
                const garden = await h.give(gardener, "Effortless Garden");
                const since = Date.now();
                await garden.consume();
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the garden's ways card" });
                const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
                h.assert(names.join(",") === "As it is,Spending a Mythic Point", `its ways (${JSON.stringify(names)})`);
                return { ways, names };
            };
            try {
                const { ways, names } = await use();
                let refused = null;
                await live().apply(ways.id, { choice: names.indexOf("Spending a Mythic Point") }).catch((error) => {
                    refused = error.message;
                });
                h.assert(/has no Mythic Point to spend/.test(refused ?? ""), `refused at 0 Mythic Points (${refused})`);
                await h.wait(1000);
                h.assert(!gardens().length, `no garden placed when refused (${gardens().map((region) => region.name)})`);
                h.assert(stateOf(ways).status === "open", "the ways card still open");
                await gardener.update({ "system.resources.mythicPoints.value": 1 });
                await h.until(() => mythicOf(gardener) === 1, "one Mythic Point", { timeout: 5000 });
                await live().apply(ways.id, { choice: names.indexOf("Spending a Mythic Point") });
                await h.until(() => gardens().length === 1, "the garden's Region (for a Mythic Point)", { timeout: 8000 });
                const forGood = gardens()[0];
                h.assert(!zoneOf(forGood).lasts, `the garden for good: no end (${JSON.stringify(zoneOf(forGood).lasts)})`);
                h.assert(zoneOf(forGood).area?.type === "square" && Number(zoneOf(forGood).area?.value) === 40, `a 40-foot square (${JSON.stringify(zoneOf(forGood).area)})`);
                await h.until(() => mythicOf(gardener) === 0, `the Mythic Point spent (${mythicOf(gardener)} left)`, { timeout: 8000 });
                // (As it is: a day.)
                const plainUse = await use();
                await live().apply(plainUse.ways.id, { choice: plainUse.names.indexOf("As it is") });
                await h.until(() => gardens().length === 2, "the second garden's Region (as it is)", { timeout: 8000 });
                const day = gardens().find((region) => region.id !== forGood.id);
                const lasts = zoneOf(day).lasts;
                h.assert(Number(lasts?.value) === 24 && lasts?.unit === "hours", `24 hours (${JSON.stringify(lasts)})`);
                await h.wait(500);
                h.assert(mythicOf(gardener) === 0, `no point spent as it is (${mythicOf(gardener)})`);
                return { refused, forGood: zoneOf(forGood).lasts ?? null, day: lasts, mythic: mythicOf(gardener) };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of gardens()) await region.delete().catch(() => null);
            }
        }
    };
};
