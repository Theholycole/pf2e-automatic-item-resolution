// The lasting group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
const ABILITY = "pf2e-automatic-ability-resolution";
// (tools/live-check.mjs's fixture flag: its cleanup deletes the encounters that carry it.)
const FIXTURE = "liveCheckFixture";
// (Troll Hide's "deactivated" Effect: src/live/card.js deactivatedSlug of the armor's slug.)
const PAUSED = "air-deactivated-troll-hide";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const damageRoll = (formula) => new (CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll"))(formula).evaluate();

    // Troll Hide's turns in an encounter, its wearer acting first or after the creature that burns it (the two cases below). Its two Elixirs of
    // Life (Greater) installed: the installed Effect's PF2e FastHealing 13, predicated off self:effect:air-deactivated-troll-hide, flagged
    // deactivatedBy. Cold damage pauses nothing; fire damage at the foe's turn gives the wearer "Troll Hide: deactivated" (1 round, to the end of
    // a turn) and a whispered line, and PF2e then has the roll option the predicate looks for. PF2e's own "Received fast healing" roll is seen
    // at the wearer's turn before the fire, not at its next turn, and again at the turn after that.
    async function trollHideTurns(scene, { wearerFirst, row }) {
        await h.clearSquares(scene, [[2, row], [4, row]]);
        const { actor: wearer, token: wearerToken } = await h.creature(scene, wearerFirst ? "Troll Hide Wearer" : "Troll Hide Late Wearer", { x: 2, y: row, hp: 300, level: 15 });
        const { actor: foe, token: foeToken } = await h.creature(scene, wearerFirst ? "Troll Hide Burner" : "Troll Hide Quick Burner", { x: 4, y: row, alliance: "opposition" });
        const hide = await h.give(wearer, "Troll Hide");
        await hide.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true }).catch(() => null);
        const elixir = await h.give(wearer, "Elixir of Life (Greater)");
        await elixir.update({ "system.quantity": 2 });
        let since = Date.now();
        await live().activate(hide.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("item"), { what: "the hide's card" });
        const at = (card.getFlag(h.NS, "card").installed ?? []).findIndex((entry) => entry.id === elixir.id);
        h.assert(at >= 0, `the elixirs offered (${JSON.stringify(card.getFlag(h.NS, "card").installed)})`);
        await live().apply(card.id, { installedPick: at });
        const installed = () => wearer.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "deactivatedBy"));
        await h.until(() => installed(), "the installed Effect with its deactivatedBy flag", { timeout: 8000 });
        const rule = (installed().system.rules ?? []).find((entry) => entry.key === "FastHealing");
        h.assert(rule && Number(rule.value) === 13 && JSON.stringify(rule.predicate) === JSON.stringify([{ not: `self:effect:${PAUSED}` }]), `FastHealing 13, off while deactivated (${JSON.stringify(installed().system.rules)})`);
        const flag = installed().getFlag(h.NS, "deactivatedBy");
        h.assert(flag?.slug === PAUSED && ["electricity", "fire"].every((type) => (flag.types ?? []).includes(type)), `deactivatedBy electricity and fire (${JSON.stringify(flag)})`);
        h.assert(!wearer.items.get(elixir.id), "both elixirs used up");
        // (PF2e's own FastHealing rule element on the wearer, and what pauses it.)
        const fastHealing = () => (wearer.rules ?? []).find((entry) => entry.key === "FastHealing" && entry.item?.id === installed()?.id);
        const paused = () => wearer.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "deactivated") === PAUSED);
        const option = () => Boolean(wearer.rollOptions?.all?.[`self:effect:${PAUSED}`]);
        const removes = game.settings.get("pf2e", "automation.removeExpiredEffects");
        const describe = () => JSON.stringify({ paused: paused() ? { duration: paused().system.duration, start: paused().system.start, remaining: paused().remainingDuration } : null, option: option(), worldTime: game.time.worldTime, removeExpiredEffects: removes });
        h.assert(fastHealing()?.test?.() === true, `FastHealing on before any fire (${fastHealing() ? "its predicate fails" : "no FastHealing rule element on the wearer"}; ${describe()})`);
        // (Not a type it's paused by: nothing.)
        await wearer.applyDamage({ damage: await damageRoll("5[cold]"), token: wearerToken });
        await h.wait(1200);
        h.assert(!paused() && !option(), `cold damage doesn't deactivate it (${describe()})`);
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [
                { tokenId: wearerToken.id, sceneId: scene.id, actorId: wearer.id, initiative: wearerFirst ? 20 : 10 },
                { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: wearerFirst ? 10 : 20 }
            ]);
            await combat.startCombat();
            await h.wait(1000);
            // (PF2e's fast healing at a turn's start: its roll, "Received fast healing", from the wearer.)
            const received = game.i18n.localize("PF2E.Encounter.Broadcast.FastHealing.fast-healing.ReceivedMessage");
            const healedSince = (time) => game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= time && message.speaker?.actor === wearer.id && (String(message.flavor ?? "").includes(received) || /fast healing/i.test(String(message.flavor ?? ""))));
            const turnOf = async (actor) => {
                const time = Date.now();
                await combat.nextTurn();
                await h.until(() => combat.combatant?.actorId === actor.id, `${actor.name}'s turn`, { timeout: 5000 });
                return time;
            };
            const log = [];
            // (Wearer first: round 1 began at its turn — not counted —, so on to the foe's.)
            if (wearerFirst) await turnOf(foe);
            let time = await turnOf(wearer);
            await h.until(() => healedSince(time), `PF2e's fast healing at the wearer's turn before any fire (round ${combat.round})`, { timeout: 8000 });
            log.push(`round ${combat.round}, wearer: healed`);
            await turnOf(foe);
            // (Fire at the foe's turn, as its attack would.)
            since = Date.now();
            await wearer.applyDamage({ damage: await damageRoll("5[fire]"), token: wearerToken });
            await h.until(() => paused() && option(), `the deactivated Effect and PF2e's self:effect:${PAUSED} (${describe()})`, { timeout: 8000 });
            const line = await h.messageAfter(since, (message) => /is deactivated until the end of/.test(message.content ?? "") && /fire damage/.test(message.content ?? ""), { what: "the whispered line" });
            h.assert((line.whisper ?? []).length > 0, "the line whispered");
            // (Its wearer not yet acted this round — the foe first —: 0 rounds, its next turn this round's; else 1, the lead's fix of 2026-10-27.)
            const duration = paused().system.duration;
            h.assert(paused().name === "Troll Hide: deactivated" && paused().system.slug === PAUSED && Number(duration.value) === (wearerFirst ? 1 : 0) && duration.unit === "rounds" && duration.expiry === "turn-end", `'Troll Hide: deactivated', 1 round to a turn's end (${paused().name}: ${JSON.stringify(duration)})`);
            h.assert(fastHealing()?.test?.() === false, "FastHealing's predicate off while it lasts");
            log.push(`round ${combat.round}, foe: fire, deactivated ${describe()}`);
            // (The wearer's next turn: no healing at its start.)
            time = await turnOf(wearer);
            await h.wait(2500);
            h.assert(!healedSince(time), `no fast healing at the wearer's next turn (round ${combat.round}; ${describe()})`);
            log.push(`round ${combat.round}, wearer: not healed`);
            // (That turn over: the deactivation ends — PF2e removes the expired Effect.)
            await turnOf(foe);
            await h.until(() => !paused() && !option(), "", { timeout: 4000 }).catch(() => null);
            log.push(`round ${combat.round}, foe: ${describe()}`);
            time = await turnOf(wearer);
            await h.until(() => healedSince(time), `PF2e's fast healing again at the turn after (round ${combat.round}; ${describe()})`, { timeout: 8000 });
            log.push(`round ${combat.round}, wearer: healed`);
            return { wearerFirst, log };
        } finally {
            await combat.delete().catch(() => null);
        }
    }

    return {
        // Troll Hide (scripts/deactivated.js, installed.deactivatedBy, 2026-10-27): "If you take electricity or fire damage, the armor deactivates
        // until the end of your next turn". The wearer acts first (initiative 20), the burner after it (10): the fire lands after the wearer's turn,
        // so its next turn is the next round's — no fast-healing roll there, one again the round after. See trollHideTurns above for the rest.
        async trollHideDeactivated(scene) {
            return trollHideTurns(scene, { wearerFirst: true, row: 12 });
        },

        // Troll Hide again, the burner acting first (initiative 20) and the wearer after it (10): the fire lands before the wearer's turn in that
        // round, so its "next turn" is that same round's — no fast-healing roll there, and one again at its turn in the round after (not two
        // turns without healing).
        async trollHideBeforeItsTurn(scene) {
            return trollHideTurns(scene, { wearerFirst: false, row: 14 });
        },

        // Blakenshipper's Be the Band (scripts/poisons.js: the exposure card's follow-up now carries plan.again's repeat, until and when,
        // 2026-10-27): its card gives its user and the ally targeted 15 temporary Hit Points; then the Sustain's card follows, open for the minute,
        // its hint "Each time, … Sustains it …". Pressed twice (the earlier temporary Hit Points cleared first, as they don't stack), it gives 5
        // each time and stays open; once the minute is up (its end brought to a second away, then a second of world time) it refuses, "its time is
        // up", and closes.
        async lastingBandSustain(scene) {
            await h.clearSquares(scene, [[8, 4], [10, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Band Player", { type: "character", x: 8, y: 4 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Band Listener", { x: 10, y: 4 });
            const instrument = await h.give(user, "Blakenshipper");
            await instrument.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 }).catch(() => null);
            const temp = (actor) => Number(actor.system.attributes.hp.temp) || 0;
            // (The ability module's TempHP Effects, and whatever is left: gone, so the next 5 shows.)
            const clearTemp = async (actor) => {
                const ids = actor.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.tempHp || (effect.system.rules ?? []).some((rule) => rule.key === "TempHP")).map((effect) => effect.id);
                if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
                if (temp(actor) > 0) await actor.update({ "system.attributes.hp.temp": 0 });
            };
            const targets = [userToken.uuid, allyToken.uuid];
            let since = Date.now();
            await live().activate(instrument.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "Be the Band's card" });
            await userToken.object?.control?.();
            since = Date.now();
            await live().apply(card.id, { targets });
            await h.applyAbilityCard(await h.messageAfter(since, h.abilitySaveCard, { what: "the 15 temporary Hit Points' card" }));
            await h.until(() => temp(user) === 15 && temp(ally) === 15, `15 temporary Hit Points each (${temp(user)}, ${temp(ally)})`, { timeout: 10000 });
            const sustain = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && message.id !== card.id, { what: "the Sustain's card", timeout: 10000 });
            h.assert(game.messages.get(card.id).getFlag(h.NS, "card").status === "applied", "the first card closed");
            let state = sustain.getFlag(h.NS, "card");
            h.assert(state.status === "open" && state.later && state.repeat && state.until - game.time.worldTime === 60 && /Sustains it/.test(state.when ?? ""), `open for the minute, pressed at each Sustain (${JSON.stringify({ status: state.status, later: state.later, repeat: state.repeat, left: state.until - game.time.worldTime, when: state.when })})`);
            const amounts = (state.plan?.resolution?.outcomes?.success?.effects ?? []).filter((effect) => effect.kind === "temp-hp").map((effect) => effect.amount);
            h.assert(JSON.stringify(amounts) === "[5]", `its row's 5 temporary Hit Points (${JSON.stringify(amounts)})`);
            h.assert(/Sustains it/.test(sustain.content ?? "") && /stays open until its time is up/.test(sustain.content ?? ""), "its hint: each Sustain, open until its time is up");
            for (let press = 1; press <= 2; press++) {
                await clearTemp(user);
                await clearTemp(ally);
                await h.until(() => temp(user) === 0 && temp(ally) === 0, `the temporary Hit Points cleared (${temp(user)}, ${temp(ally)})`, { timeout: 5000 });
                since = Date.now();
                await live().apply(sustain.id, { targets });
                await h.applyAbilityCard(await h.messageAfter(since, h.abilitySaveCard, { what: `the Sustain's card (${press})` }));
                await h.until(() => temp(user) === 5 && temp(ally) === 5, `5 temporary Hit Points each at Sustain ${press} (${temp(user)}, ${temp(ally)})`, { timeout: 10000 });
                state = game.messages.get(sustain.id).getFlag(h.NS, "card");
                h.assert(state.status === "open" && state.uses === press, `still open, used ${press} (${state.status}, ${state.uses})`);
            }
            // (Its minute over: its end a second away, then that second of world time.)
            const end = game.time.worldTime + 1;
            await game.messages.get(sustain.id).update({ [`flags.${h.NS}.card.until`]: end });
            await game.time.advance(1);
            await h.until(() => game.time.worldTime >= end, "a second of world time", { timeout: 5000 });
            since = Date.now();
            let refused = null;
            try {
                await live().apply(sustain.id, { targets });
            } catch (error) {
                refused = error.message;
            }
            h.assert(/time is up/.test(refused ?? ""), `refused once its time is up (${refused})`);
            await h.wait(800);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message)), "no temporary Hit Points' card after its time");
            state = game.messages.get(sustain.id).getFlag(h.NS, "card");
            h.assert(state.status === "applied" && /time is up/.test(state.results.at(-1) ?? ""), `closed, its line said (${state.status}: ${JSON.stringify(state.results)})`);
            return { uses: state.uses, results: state.results };
        },

        // Silver Snake Cane's True Silver Snake (src/compiler/lasting.js's reading → scripts/zones.js startItemConjure and finishConjured's own
        // rules, the ability module's startConjure): "The cane transforms into a giant viper made of silver. All its Strikes are silver. It acts
        // independently but obeys you." In an encounter, PF2e's Giant Viper beside its user, on its side, joining the turns with a rolled
        // initiative; its own Effect with PF2e's AdjustStrike materials silver, so its Fangs' damage formula carries silver.
        async lastingSilverSnake(scene) {
            await h.clearSquares(scene, [[13, 7], [14, 7], [15, 7], [13, 8], [14, 8], [15, 8], [13, 9], [14, 9], [15, 9]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Snake Cane Zuhra", { type: "character", x: 14, y: 8 });
            const cane = await h.give(user, "Silver Snake Cane");
            await cane.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 }).catch(() => null);
            await h.until(() => userToken.object, "the user's token drawn", { timeout: 5000 });
            const made = () => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemUuid === cane.uuid);
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
            try {
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 15 }]);
                await combat.startCombat();
                await h.wait(500);
                // (True Silver Snake: the cane's third activation — Silver Snake Sword 0, Silver Snake Serum 1.)
                await live().activate(cane.uuid, 2);
                await h.until(() => made().length === 1, "the giant viper's token", { timeout: 10000 });
                const viperToken = made()[0];
                const viper = () => viperToken.actor;
                h.assert(/Giant Viper/.test(viper().name), `PF2e's Giant Viper (${viper().name})`);
                h.assert(viperToken.disposition === userToken.disposition, `on its user's side (${viperToken.disposition} vs ${userToken.disposition})`);
                const size = canvas.grid.size;
                const span = (token, axis) => (Number(axis === "x" ? token.width : token.height) || 1) * size;
                const gap = Math.max(0, viperToken.x - (userToken.x + span(userToken, "x")), userToken.x - (viperToken.x + span(viperToken, "x")), viperToken.y - (userToken.y + span(userToken, "y")), userToken.y - (viperToken.y + span(viperToken, "y"))) / size;
                h.assert(gap <= 1, `beside its user (${gap} squares between)`);
                const turn = () => combat.combatants.find((entry) => entry.tokenId === viperToken.id);
                await h.until(() => Number.isFinite(turn()?.initiative), `its rolled initiative (${turn() ? turn().initiative : "not in the turns"})`, { timeout: 10000 });
                const silver = () => viper().itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "AdjustStrike" && rule.property === "materials" && rule.value === "silver");
                await h.until(() => silver(), "its own Effect with AdjustStrike materials silver", { timeout: 8000 });
                const fangs = () => (viper().system.actions ?? []).find((action) => /fang/i.test(action.label ?? action.item?.name ?? "")) ?? (viper().system.actions ?? [])[0];
                await h.until(() => fangs(), "a Strike of its own", { timeout: 5000 });
                let formula = await (async () => fangs().damage?.({ getFormula: true }))().catch(() => null);
                // (No formula from PF2e: its damage rolled, the roll's formula read.)
                if (typeof formula !== "string") {
                    const at = Date.now();
                    await fangs().damage({ event: h.shift() });
                    const rolled = await h.messageAfter(at, (message) => message.flags?.pf2e?.context?.type === "damage-roll" && message.speaker?.token === viperToken.id, { what: "its damage roll" });
                    formula = String(rolled.rolls?.[0]?.formula ?? "");
                }
                // (PF2e's readable formula shows no material: its damage rolled with no message, each instance's materials read — the lead's
                // reading of 2026-10-27.)
                const roll = await fangs().damage({ event: h.shift(), createMessage: false }).catch(() => null);
                const materials = (roll?.instances ?? []).flatMap((instance) => [...(instance.materials ?? [])]);
                h.assert(materials.includes("silver") || /silver/.test(formula), `its ${fangs().label} damage silver (${formula}; materials ${JSON.stringify(materials)})`);
                return { viper: viper().name, initiative: turn().initiative, strike: fangs().label, formula };
            } finally {
                // (Its own: the token it made and its world actor.)
                for (const token of made()) {
                    const base = game.actors.get(token.actorId);
                    await token.delete().catch(() => null);
                    if (base?.flags?.[ABILITY]?.conjured) await base.delete().catch(() => null);
                }
                await combat.delete().catch(() => null);
            }
        }
    };
};
