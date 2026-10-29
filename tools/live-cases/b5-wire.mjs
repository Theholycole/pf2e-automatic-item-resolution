// The fifth batch's wiring onto the other modules' new contracts live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only what the wiring (the merge 00e3194, docs/mechanics.md "Wired to the other modules' 2026-10-28 contracts") plays live for the first time
// from this module: Soulspark Candle's limning as a zone whose inside Effect lingers, its putting out through the ability module's endZones, its
// flames putting it out as their card posts (scripts/live.js postCardFor putsOut), their fire past immunity and resistance, and a wait shared by
// an activation's index (scripts/activations.js sharedWords); Paradigm Cube's colours — a flat check as a table card whose rows are a zone or a
// second table, a way's frequency kept per colour (frequencyKey), a Mythic Point on a zone way, the ability module's zone.inside who "allies"
// and "foes"; Magnetic Suit's allies' zone beside its card (plan.item.alsoZone with who "allies", gone and back as an ally leaves and returns);
// Penetrating Ammunition's one roll at every creature targeted in its line (scripts/strikes.js oneRoll count null, naturalFirst) with every
// resistance 10 lower (the core's ignoreResistance "*").

const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";
const SIZE = 100;
const FRIENDLY = () => CONST.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;
const HOSTILE = () => CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const current = (message) => game.messages.get(message.id) ?? message;
    const text = (message) => String(current(message)?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const checkOf = (message) => abilityState(message)?.plan?.resolution?.check ?? {};
    const targetUuidsOf = (message) => (abilityState(message)?.targets ?? []).flatMap((target) => [target.actorUuid, target.tokenUuid, target.uuid]).filter(Boolean);
    const aimsAt = (actor) => (message) => h.abilitySaveCard(message) && targetUuidsOf(message).includes(actor.uuid);
    const degreeOf = (message, actor) => (abilityState(message)?.targets ?? []).find((target) => target.actorUuid === actor.uuid)?.degree ?? null;
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const zonesOf = (scene, item) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.itemUuid === item.uuid);
    const zonesNamed = (scene, pattern) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && pattern.test(`${region.name ?? ""} ${region.flags[ABILITY].zone.itemName ?? ""}`));
    // (A zone's inside Effect on a creature: by its label, the words after the zone's name.)
    const insideOf = (actor, label) => () => actor.itemTypes.effect.find((effect) => effect.name.endsWith(`: ${label}`) && (effect.flags?.[ABILITY]?.zone || effect.flags?.[ABILITY]?.lingered));
    // (The square-sized area round a point a case's zone may reach, cleared of earlier cases' test tokens: those inside would get its cards.)
    const around = (x, y, reach) => {
        const squares = [];
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (x + dx >= 0 && x + dx < 20 && y + dy >= 0 && y + dy < 20) squares.push([x + dx, y + dy]);
        return squares;
    };
    // (A move a zone must see — its enter and exit events —, as the snare cases in tools/live-check.mjs make it: needs a visible pane.)
    const walk = async (token, x, y) => {
        await token.update({ x: x * SIZE, y: y * SIZE }, { animate: false });
        await h.until(() => token.x === x * SIZE && token.y === y * SIZE, `${token.name} walked to ${x},${y}`, { timeout: 8000 });
    };
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };
    const warningAfter = (since, name, pattern, what) => h.messageAfter(since, (message) => (message.whisper ?? []).length > 0 && String(message.content ?? "").includes(name) && pattern.test(text(message)), { what, timeout: 8000 });
    // (Its zones ended as the ability module ends them — what they gave taken back —, else their Regions deleted.)
    const endItemZones = async (scene, item) => {
        const endZones = game.modules.get(ABILITY)?.api?.live?.endZones;
        if (endZones) await endZones({ itemUuid: item.uuid }).catch(() => null);
        for (const region of zonesOf(scene, item)) await region.delete().catch(() => null);
    };
    // (A mythic NPC: PF2e gives characters Mythic Points only in a mythic campaign — as tools/live-cases/b3-places.mjs's mythic.)
    const mythicOf = (actor) => Number(actor.system.resources?.mythicPoints?.value ?? NaN);
    async function mythic(actor, points) {
        await actor.update({ "system.traits.value": [...new Set([...(actor.system.traits.value ?? []), "mythic"])] });
        await actor.update({ "system.resources.mythicPoints.value": points });
        await h.until(() => mythicOf(actor) === points, `${points} Mythic Point${points === 1 ? "" : "s"} on ${actor.name} (${mythicOf(actor)} of ${actor.system.resources?.mythicPoints?.max})`, { timeout: 5000 });
    }
    // (PF2e's degrees of an attack roll against an AC: ±10 a step, a natural 20 one better when it counts.)
    const STEPS = ["criticalFailure", "failure", "success", "criticalSuccess"];
    const WORDS = { criticalSuccess: "a critical hit", success: "a hit", failure: "a miss", criticalFailure: "a critical miss" };
    const degreeAgainst = (total, ac, { natural = null } = {}) => {
        const by = total - ac;
        let step = by >= 10 ? 3 : by >= 0 ? 2 : by > -10 ? 1 : 0;
        if (natural === 20) step = Math.min(3, step + 1);
        if (natural === 1) step = Math.max(0, step - 1);
        return STEPS[step];
    };
    const strikeModifier = (actor, weapon) => {
        const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
        const value = Number(action?.totalModifier);
        h.assert(Number.isFinite(value), `${actor.name}'s Strike modifier with ${weapon.name} (${action?.totalModifier})`);
        return value;
    };

    // Soulspark Candle lit (its zone round its user, its light Effect): → what the two candle cases share.
    async function lightCandle(scene, { name, x, y }) {
        await h.clearSquares(scene, around(x, y, 8));
        const { actor: user, token: userToken } = await h.creature(scene, `${name} Bearer`, { type: "character", x, y, level: 20 });
        const candle = await h.give(user, "Soulspark Candle");
        await candle.update(held(1));
        await userToken.object?.control?.();
        const light = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.light && effect.system?.context?.origin?.item === candle.uuid);
        const zones = () => zonesOf(scene, candle);
        return { user, userToken, candle, light, zones };
    }

    return {
        // Soulspark Candle's limning and its prayer (src/compiler/unique-rules.js withLimned, withPutOut; the ability module's zone.inside lingers and
        // api.live.endZones, scripts/live.js putOut): lit, its zone round its user and a zombie inside with its consecration Effect. Its limning:
        // a second zone of the light's size, the zombie and another undead inside "Limned in blue fire". The zombie walked out of the light: its
        // consecration Effect gone, its limning kept for 1 minute. Prayed out (its item card applied): its light Effect gone, both zones ended by
        // the ability module, the other undead's consecration Effect gone and its limning kept for 1 minute; the card's line says so.
        // (The zombie's walk is a move on the map: it needs a visible pane.)
        async b5WireSoulsparkLimnPutOut(scene) {
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[18, 18]]);
                const { candle, light, zones } = await lightCandle(scene, { name: "Limn Candle", x: 2, y: 2 });
                const { actor: zombie, token: zombieToken } = await h.creature(scene, "Limn Zombie", { x: 4, y: 2, hp: 200, alliance: "opposition", level: 10 });
                const { actor: lingerer } = await h.creature(scene, "Limn Ghoul", { x: 2, y: 4, hp: 200, alliance: "opposition", level: 10 });
                for (const actor of [zombie, lingerer]) await actor.update({ "system.traits.value": ["undead"] });
                await h.until(() => [zombie, lingerer].every((actor) => (actor.system.traits.value ?? []).includes("undead")), "both undead", { timeout: 5000 });
                const consecrated = (actor) => insideOf(actor, "inside");
                const limned = (actor) => insideOf(actor, "Limned in blue fire");
                try {
                    await live().activate(candle.uuid, 0);
                    await h.until(() => light() && zones().length === 1, `lit: its light and its zone (${zones().length} zones)`, { timeout: 10000 });
                    await h.until(() => consecrated(zombie)() && consecrated(lingerer)(), `the consecration's Effect on both inside (${effectNames(zombie)} / ${effectNames(lingerer)})`, { timeout: 10000 });
                    const first = zones()[0].uuid;
                    await live().activate(candle.uuid, 2);
                    await h.until(() => zones().length === 2, `the limning's own zone beside the light's (${zones().length} zones)`, { timeout: 10000 });
                    const second = zones().find((region) => region.uuid !== first);
                    h.assert((second.flags[ABILITY].zone.zone.inside ?? []).some((entry) => entry.label === "Limned in blue fire" && Number(entry.lingers?.value) === 1 && entry.lingers.unit === "minutes" && (entry.only?.traits ?? []).includes("undead")), `its inside Effect for undead, kept 1 minute after (${JSON.stringify(second.flags[ABILITY].zone.zone.inside)})`);
                    await h.until(() => limned(zombie)() && limned(lingerer)(), `both undead limned (${effectNames(zombie)} / ${effectNames(lingerer)})`, { timeout: 10000 });
                    // (The zombie out of the light: 85 feet off.)
                    await walk(zombieToken, 18, 18);
                    await h.until(() => !consecrated(zombie)(), `its consecration Effect gone as it leaves (${effectNames(zombie)})`, { timeout: 10000 });
                    await h.until(() => limned(zombie)()?.flags?.[ABILITY]?.lingered && Number(limned(zombie)().system.duration.value) === 1 && limned(zombie)().system.duration.unit === "minutes", `its limning kept for 1 minute after it leaves (${JSON.stringify(limned(zombie)()?.system?.duration ?? null)}; ${effectNames(zombie)})`, { timeout: 10000 });
                    // (Prayed out.)
                    const since = Date.now();
                    await live().activate(candle.uuid, 1);
                    const out = await h.messageAfter(since, h.itemCard("item"), { what: "the prayer's card" });
                    await live().apply(out.id);
                    await h.until(() => !light() && !zones().length, `its light Effect gone and both zones ended (${zones().length} left)`, { timeout: 10000 });
                    await h.until(() => !consecrated(lingerer)(), `the other undead's consecration Effect gone with its zone (${effectNames(lingerer)})`, { timeout: 10000 });
                    await h.until(() => limned(lingerer)()?.flags?.[ABILITY]?.lingered && Number(limned(lingerer)().system.duration.value) === 1 && limned(lingerer)().system.duration.unit === "minutes", `its limning kept 1 minute more (${JSON.stringify(limned(lingerer)()?.system?.duration ?? null)}; ${effectNames(lingerer)})`, { timeout: 10000 });
                    h.assert(resultsOf(out).some((line) => /is out: its light gone, its areas ended/.test(line)), `the prayer's line (${JSON.stringify(resultsOf(out))})`);
                    return { results: resultsOf(out), zombie: limned(zombie)()?.system?.duration ?? null, lingerer: limned(lingerer)().system.duration };
                } finally {
                    await endItemZones(scene, candle);
                }
            });
        },

        // Soulspark Candle's flames (unique-rules.js; scripts/live.js postCardFor's putsOut on a card that isn't the item card; the ability module's
        // ignoreImmunity / ignoreResistance through the core's applyDamage patch; scripts/activations.js's recharge shared by an index, its
        // sharedWords): lit, its flames used: the candle goes out as their card posts (its light Effect and its zone gone, a chat line), and the
        // whisper says they're usable again in 1 hour, and so is lighting it. Their card at an undead immune to fire with fire resistance 10: the
        // basic Fortitude DC 45 card, critically failed (save +0, every die a 10), 20d8 at 4s doubled — all 160 taken. Lit again inside that
        // hour: the GM's whisper of the wait.
        async b5WireSoulsparkFlames(scene) {
            const { user, candle, light, zones } = await lightCandle(scene, { name: "Flame Candle", x: 2, y: 12 });
            const { actor: undead, token: undeadToken } = await h.creature(scene, "Flame Wight", { x: 4, y: 12, hp: 400, save: 0, alliance: "opposition", level: 15 });
            await undead.update({ "system.traits.value": ["undead"], "system.attributes.immunities": [{ type: "fire", exceptions: [] }], "system.attributes.resistances": [{ type: "fire", value: 10, exceptions: [] }] });
            await h.until(() => (undead.attributes?.immunities ?? []).some((entry) => entry.type === "fire") && (undead.attributes?.resistances ?? []).some((entry) => entry.type === "fire"), `immune to fire, fire resistance 10 (${JSON.stringify(undead.attributes?.immunities ?? [])}; ${JSON.stringify(undead.attributes?.resistances ?? [])})`, { timeout: 5000 });
            try {
                await live().activate(candle.uuid, 0);
                await h.until(() => light() && zones().length === 1, "lit: its light and its zone", { timeout: 10000 });
                let since = Date.now();
                await live().activate(candle.uuid, 3);
                const flames = await h.messageAfter(since, h.itemCard("expose"), { what: "the flames' card" });
                await h.until(() => !light() && !zones().length, `out as the flames' card posts (${light() ? "light still on" : "light gone"}; ${zones().length} zones)`, { timeout: 10000 });
                await h.messageAfter(since, (message) => /Soulspark Candle is out/.test(text(message)), { what: "the line that it's out" });
                await warningAfter(since, "Soulspark Candle", /usable again in 1 hour, and so is lighting it/, "the whisper of the flames' hour, shared with its lighting");
                const waits = user.items.get(candle.id)?.getFlag(h.NS, "activationRecharges") ?? {};
                h.assert(Number(waits[0]) > game.time.worldTime && Number(waits[0]) === Number(waits[3]), `its lighting waits the same hour as its flames (${JSON.stringify(waits)})`);
                since = Date.now();
                await live().apply(flames.id, { targets: [undeadToken.uuid] });
                const save = await h.messageAfter(since, aimsAt(undead), { what: "the flames' save card at the undead" });
                const resolution = abilityState(save).plan.resolution;
                h.assert(resolution.check?.statistic === "fortitude" && resolution.check.basic && Number(resolution.check.against?.value) === 45, `basic Fortitude DC 45 (${JSON.stringify(resolution.check)})`);
                h.assert([].concat(resolution.ignoreImmunity ?? []).includes("fire") && JSON.stringify(resolution.ignoreResistance ?? []).includes("fire"), `fire immunity and resistance ignored (${JSON.stringify({ immunity: resolution.ignoreImmunity, resistance: resolution.ignoreResistance })})`);
                const before = hp(undead);
                await h.withDie(10, async () => {
                    await h.rollAndApply(save);
                    await h.until(() => hp(undead) < before, `the undead burned past its immunity (${hp(undead)} of ${before}; ${JSON.stringify(abilityState(save)?.results ?? [])})`, { timeout: 10000 });
                });
                h.assert(degreeOf(save, undead) === "criticalFailure", `a critical failure (+0 and a 10 against DC 45: ${degreeOf(save, undead)})`);
                h.assert(before - hp(undead) === 160, `20d8 at 4s doubled, all of it: 160 (took ${before - hp(undead)}; 0 if the immunity held, 150 if the resistance did)`);
                since = Date.now();
                await live().activate(candle.uuid, 0);
                await warningAfter(since, "Soulspark Candle", /activated again, though it's usable again only in 1 hour/, "the GM's whisper of lighting it inside the hour");
                return { lost: before - hp(undead), waits };
            } finally {
                await endItemZones(scene, candle);
            }
        },

        // Paradigm Cube's Change Paradigm (src/compiler/paradigm-cube.js; scripts/table.js's rows, scripts/ways.js's per-colour count, scripts/live.js's
        // spend on a zone way; the ability module's zone.inside who): a mythic NPC (1 Mythic Point) beside an ally and a foe. Red's flat check: its
        // d20 table card at 15 posts the Red zone — the ally inside gets +2 item to Intimidation to Coerce, the foe nothing. Yellow's at 5: the d6
        // table's card follows; at 2, the Orange zone — the ally's +2 item to Performance. Blue with a Mythic Point: the point spent as its zone
        // posts, the ally's Sense Motive bonus and the foe's Blue words Effect. Red again the same day: the GM's whisper of its once a day per colour.
        async b5WireParadigmCube(scene) {
            await h.clearSquares(scene, around(10, 6, 12));
            const { actor: user, token: userToken } = await h.creature(scene, "Paradigm Mythic", { x: 10, y: 6, level: 14 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Paradigm Ally", { x: 11, y: 6, level: 10 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Paradigm Foe", { x: 12, y: 6, level: 10, alliance: "opposition" });
            await userToken.update({ disposition: FRIENDLY() });
            await allyToken.update({ disposition: FRIENDLY() });
            await foeToken.update({ disposition: HOSTILE() });
            await mythic(user, 1);
            const cube = await h.give(user, "Paradigm Cube");
            await cube.update({ ...held(1), "system.equipped.invested": true }).catch(() => null);
            await userToken.object?.control?.();
            const rule = (effect, selector) => (effect?.system?.rules ?? []).find((entry) => entry.key === "FlatModifier" && [].concat(entry.selector).includes(selector));
            const pick = async (wayName) => {
                const ways = await activated(cube, 0, "ways", "Change Paradigm's ways card");
                const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
                const index = names.findIndex((name) => name.startsWith(wayName));
                h.assert(names.length === 12 && index >= 0, `"${wayName}" among its twelve ways (${names.join(" | ")})`);
                const since = Date.now();
                await live().apply(ways.id, { choice: index });
                return since;
            };
            try {
                // (Red: its flat check at 15.)
                let since = await pick("Red: the DC 11 flat check");
                let table = await h.messageAfter(since, h.itemCard("table"), { what: "Red's flat check, a d20 table card" });
                h.assert(stateOf(table).plan.table.die === "1d20", `its flat check a d20 (${stateOf(table).plan.table.die})`);
                await live().apply(table.id, { total: 15 });
                const red = insideOf(ally, "Red");
                await h.until(red, `the ally inside the Red zone (${effectNames(ally)})`, { timeout: 10000 });
                const coerce = rule(red(), "intimidation");
                h.assert(Number(coerce?.value) === 2 && coerce.type === "item" && JSON.stringify(coerce.predicate ?? []).includes("action:coerce"), `+2 item to Intimidation to Coerce (${JSON.stringify(red().system.rules)})`);
                await h.wait(1000);
                h.assert(!insideOf(foe, "Red")(), `nothing of Red's for the foe (${effectNames(foe)})`);
                // (Yellow's flat check failed at 5: the d6's card, then at 2 Orange.)
                since = await pick("Yellow: the DC 11 flat check");
                table = await h.messageAfter(since, h.itemCard("table"), { what: "Yellow's flat check, a d20 table card" });
                since = Date.now();
                await live().apply(table.id, { total: 5 });
                const d6 = await h.messageAfter(since, (message) => h.itemCard("table")(message) && message.id !== table.id, { what: "the d6 table's card after the failure" });
                h.assert(stateOf(d6).plan.table.die === "1d6" && (stateOf(d6).plan.table.rows ?? []).length === 6, `a d6 of the six colours (${stateOf(d6).plan.table.die}, ${(stateOf(d6).plan.table.rows ?? []).length} rows)`);
                h.assert(!insideOf(ally, "Yellow")(), "no Yellow zone on the failure itself");
                await live().apply(d6.id, { total: 2 });
                const orange = insideOf(ally, "Orange");
                await h.until(orange, `the ally inside the Orange zone (${effectNames(ally)})`, { timeout: 10000 });
                const performance = rule(orange(), "performance");
                h.assert(Number(performance?.value) === 2 && performance.type === "item", `+2 item to Performance (${JSON.stringify(orange().system.rules)})`);
                // (Blue for a Mythic Point.)
                since = await pick("Blue, spending a Mythic Point");
                const blueAlly = insideOf(ally, "Blue");
                const blueFoe = insideOf(foe, "Blue");
                await h.until(() => blueAlly() && blueFoe(), `the Blue zone's Effects on the ally and the foe (${effectNames(ally)} / ${effectNames(foe)})`, { timeout: 10000 });
                await h.until(() => mythicOf(user) === 0, `the Mythic Point spent (${mythicOf(user)} left)`, { timeout: 8000 });
                const sense = rule(blueAlly(), "perception");
                h.assert(Number(sense?.value) === 2 && JSON.stringify(sense.predicate ?? []).includes("action:sense-motive"), `the ally's +2 item to Sense Motive (${JSON.stringify(blueAlly().system.rules)})`);
                h.assert(!(blueFoe().system.rules ?? []).length && /Stupefied/.test(blueFoe().system.description?.value ?? ""), `the foe's words Effect, no rules (${JSON.stringify(blueFoe().system.rules)}; ${blueFoe().system.description?.value})`);
                // (Red again today.)
                since = await pick("Red: the DC 11 flat check");
                await warningAfter(since, "Red: the DC 11 flat check", /used again, though it's once per day/, "the GM's whisper of Red's once a day");
                return { red: coerce, orange: performance, mythic: mythicOf(user) };
            } finally {
                await endItemZones(scene, cube);
            }
        },

        // Magnetic Suit's Attract (src/compiler/user-actions.js magneticSuit; scripts/live.js plan.item.alsoZone; the ability module's zone.inside
        // who "allies"): its ways card's Attract: the item card and, beside it, the ability module's 10-foot zone on its wearer for 10 minutes.
        // The ally 5 feet away gets "Metal drawn away" (its toggle on: +1 status to AC), the foe beside it nothing. The item card applied: the
        // wearer's "Attracting metal" note Effect for 10 minutes. The ally walked out: its Effect gone; walked back in: given again.
        // (The ally's walks are moves on the map: they need a visible pane.)
        async b5WireMagneticSuit(scene) {
            return h.unpaused(async () => {
                await h.clearSquares(scene, around(14, 9, 4));
                const { actor: user, token: userToken } = await h.creature(scene, "Magnet Wearer", { type: "character", x: 14, y: 9, level: 4 });
                const { actor: ally, token: allyToken } = await h.creature(scene, "Magnet Ally", { x: 15, y: 9, level: 4 });
                const { actor: foe, token: foeToken } = await h.creature(scene, "Magnet Foe", { x: 14, y: 10, level: 4, alliance: "opposition" });
                await userToken.update({ disposition: FRIENDLY() });
                await allyToken.update({ disposition: FRIENDLY() });
                await foeToken.update({ disposition: HOSTILE() });
                const suit = await h.give(user, "Magnetic Suit");
                await userToken.object?.control?.();
                const zones = () => zonesNamed(scene, /Magnetic Suit/);
                const drawn = insideOf(ally, "Metal drawn away");
                try {
                    let since = Date.now();
                    await suit.consume();
                    const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the suit's ways card" });
                    const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
                    h.assert(JSON.stringify(names) === '["Attract","Repel"]', `attract or repel (${JSON.stringify(names)})`);
                    since = Date.now();
                    await live().apply(ways.id, { choice: names.indexOf("Attract") });
                    const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && message.id !== ways.id, { what: "Attract's item card" });
                    await h.until(() => zones().length === 1, "its zone beside the card", { timeout: 10000 });
                    const zone = zones()[0].flags[ABILITY].zone.zone;
                    h.assert(zone.area?.type === "emanation" && Number(zone.area.value) === 10 && Number(zone.lasts?.value) === 10 && zone.lasts.unit === "minutes", `a 10-foot emanation for 10 minutes (${JSON.stringify({ area: zone.area, lasts: zone.lasts })})`);
                    await h.until(drawn, `the ally's "Metal drawn away" (${effectNames(ally)})`, { timeout: 10000 });
                    await h.wait(800);
                    h.assert(!insideOf(foe, "Metal drawn away")() && !insideOf(user, "Metal drawn away")(), `not on the foe nor the wearer (${effectNames(foe)} / ${effectNames(user)})`);
                    const ac = Number(ally.attributes.ac.value);
                    await ally.toggleRollOption("all", "magnetic-suit-drawn", drawn().id, true);
                    await h.until(() => Number(ally.attributes.ac.value) === ac + 1, `its toggle on: +1 to AC (${ac} → ${ally.attributes.ac.value})`, { timeout: 5000 });
                    await live().apply(card.id, {});
                    const attracting = () => user.itemTypes.effect.find((effect) => /Attracting metal$/.test(effect.name));
                    await h.until(attracting, `the wearer's "Attracting metal" (${effectNames(user)})`, { timeout: 8000 });
                    h.assert(Number(attracting().system.duration.value) === 10 && attracting().system.duration.unit === "minutes", `for 10 minutes (${JSON.stringify(attracting().system.duration)})`);
                    // (Out, 20 feet off; back beside the wearer.)
                    await walk(allyToken, 18, 9);
                    await h.until(() => !drawn(), `gone as the ally leaves (${effectNames(ally)})`, { timeout: 10000 });
                    await walk(allyToken, 15, 9);
                    await h.until(drawn, `given again as it comes back (${effectNames(ally)})`, { timeout: 10000 });
                    return { ac: [ac, ac + 1], zone: zone.lasts };
                } finally {
                    for (const region of zones()) await region.delete().catch(() => null);
                }
            });
        },

        // Penetrating Ammunition (src/compiler/small-needs.js; scripts/strikes.js applyStrikeCard's count null, strikeWithRider's naturalFirst; the
        // core's ignoreResistance "*" stamped on the damage roll): a longbow with the arrow loaded; its Strike card refuses no creature targeted and
        // readies one Strike at the three targeted in its line. The Strike at the first (AC 1) with a natural 20: the chat lists the other two
        // from the same total — the second's AC set 5 over the roll, a miss (the natural 20 not theirs), the third (AC 1) a critical hit. Its
        // critical damage roll carries PF2e's own 1d6 bleed of the arrow; applied to the first (physical resistance 5), all of its immediate
        // damage is taken (every resistance 10 lower).
        async b5WirePenetratingLine(scene) {
            await h.clearSquares(scene, [[1, 16], [4, 16], [6, 16], [8, 16]]);
            const { actor: archer, token: archerToken } = await h.creature(scene, "Penetrating Archer", { type: "character", x: 1, y: 16, level: 12 });
            const bow = await h.give(archer, "Longbow");
            const arrows = await h.give(archer, "Penetrating Ammunition");
            await arrows.update({ "system.quantity": 2, "system.baseItem": "arrows" });
            await bow.update({ ...held(2), "system.selectedAmmoId": arrows.id });
            await h.until(() => (archer.system.actions ?? []).some((entry) => entry.item?.id === bow.id), "the longbow's Strike", { timeout: 5000 });
            const total = 20 + strikeModifier(archer, bow);
            const { actor: first, token: firstToken } = await h.creature(scene, "Line First", { x: 4, y: 16, ac: 1, hp: 300, alliance: "opposition" });
            const { token: secondToken } = await h.creature(scene, "Line Second", { x: 6, y: 16, ac: total + 5, hp: 300, alliance: "opposition" });
            const { token: thirdToken } = await h.creature(scene, "Line Third", { x: 8, y: 16, ac: 1, hp: 300, alliance: "opposition" });
            await first.update({ "system.attributes.resistances": [{ type: "physical", value: 5, exceptions: [] }] });
            await h.until(() => (first.attributes?.resistances ?? []).some((entry) => entry.type === "physical" && Number(entry.value) === 5), `physical resistance 5 on the first (${JSON.stringify(first.attributes?.resistances ?? [])})`, { timeout: 5000 });
            await archerToken.object?.control?.();
            const readied = () => archer.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
            const card = await activated(arrows, 0, "strike", "the arrow's Strike card");
            const refused = await errorOf(live().apply(card.id, { targets: [] }));
            h.assert(/Target each creature in the 60-foot line first/.test(refused ?? ""), `refused with none targeted (${refused})`);
            await live().apply(card.id, { targets: [firstToken.uuid, secondToken.uuid, thirdToken.uuid] });
            await h.until(() => (readied()?.flags[h.NS].strikeRider.targets ?? []).length === 3 && readied().flags[h.NS].strikeRider.ammoId === arrows.id, `one Strike readied at the three, with the arrow (${JSON.stringify(readied()?.flags?.[h.NS]?.strikeRider?.targets ?? null)})`, { timeout: 8000 });
            const ignore = readied().flags?.[CORE]?.ignoreResistance ?? null;
            h.assert(Number(ignore?.value) === 10 && [].concat(ignore.types ?? []).includes("*") && JSON.stringify(ignore.predicate ?? []).includes(arrows.id), `the core's ignoreResistance: every type 10 lower, for this arrow (${JSON.stringify(ignore)})`);
            await h.target(firstToken);
            let since = Date.now();
            const { action, attack } = await h.withDie(20, () => h.strike(archer, bow));
            const rolled = Number(attack.rolls?.[0]?.total);
            const natural = Number(attack.rolls?.[0]?.dice?.[0]?.total);
            h.assert(natural === 20 && attack.flags.pf2e.context.outcome === "criticalSuccess", `a natural 20, a critical hit at the first (${natural}, ${attack.flags.pf2e.context.outcome})`);
            const said = await h.messageAfter(since, (message) => /the same attack roll/.test(text(message)) && message.speaker?.actor === archer.id, { what: "the line for the others in the line", timeout: 10000 });
            const line = text(said);
            const secondAC = Number(secondToken.actor.attributes.ac.value);
            const raw = degreeAgainst(rolled, secondAC);
            h.assert(raw === "failure" && degreeAgainst(rolled, secondAC, { natural: 20 }) === "success", `the second's AC set so only a natural 20 would make it a hit (roll ${rolled}, AC ${secondAC})`);
            h.assert(new RegExp(`${escapeRegex(secondToken.name)}: ${WORDS.failure}[;.]`).test(line), `${secondToken.name}: a miss — the natural 20 not its own (roll ${rolled}, AC ${secondAC}): ${line}`);
            h.assert(new RegExp(`${escapeRegex(thirdToken.name)}: ${WORDS.criticalSuccess}[;.]`).test(line), `${thirdToken.name}: a critical hit (${line})`);
            h.assert(!line.includes(`${firstToken.name}:`), `the creature rolled at isn't listed again (${line})`);
            await h.until(() => readied()?.flags[h.NS].strikeRider, "the readied Strike kept for the damage roll", { timeout: 5000 });
            since = Date.now();
            await h.withDie(20, () => action.critical({ event: h.shift() }));
            const damage = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll" && message.speaker?.actor === archer.id, { what: "the critical damage roll" });
            const roll = game.messages.get(damage.id)?.rolls?.[0] ?? damage.rolls?.[0];
            const instances = roll?.instances ?? [];
            h.assert(instances.some((instance) => instance.type === "bleed" && instance.persistent), `PF2e's own persistent bleed of the arrow on the roll (${instances.map((instance) => `${instance.formula} ${instance.type}${instance.persistent ? " persistent" : ""}`).join(", ")})`);
            h.assert(game.messages.get(damage.id)?.flags?.[CORE]?.ignoreResistance ?? damage.flags?.[CORE]?.ignoreResistance ?? JSON.stringify(roll?.options ?? {}).includes("ignoreResistance"), `the core's stamp on the damage roll (${JSON.stringify(game.messages.get(damage.id)?.flags?.[CORE] ?? {})})`);
            const immediate = instances.filter((instance) => !instance.persistent).reduce((sum, instance) => sum + (Number(instance.total) || 0), 0);
            h.assert(immediate > 5, `more immediate damage than the resistance (${immediate})`);
            const before = hp(first);
            await first.applyDamage({ damage: roll, token: firstToken });
            await h.until(() => hp(first) < before, `the first damaged (${hp(first)})`, { timeout: 8000 });
            await h.wait(500);
            h.assert(before - hp(first) === immediate, `all ${immediate} taken: its physical resistance 5 counted 10 lower (took ${before - hp(first)}; ${immediate - 5} if it held)`);
            await h.until(() => !readied(), "the readied Strike spent by its damage roll", { timeout: 8000 });
            return { line, rolled, secondAC, immediate, taken: before - hp(first), refused };
        }
    };
};
