// The moving group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
const ABILITY = "pf2e-automatic-ability-resolution";
const ENVIRONMENT = "pf2e-automatic-environment-resolution";
// (This check's own fixtures, as tools/live-check.mjs flags them: an encounter made here is cleaned up with them.)
const FIXTURE = "liveCheckFixture";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const resultsOf = (card) => game.messages.get(card.id)?.getFlag(h.NS, "card")?.results ?? [];
    const at = (token) => `(${token.x / canvas.grid.size}, ${token.y / canvas.grid.size})`;
    // (Squares apart on the grid, a token's top-left corners: 1 is beside it.)
    const apart = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / canvas.grid.size;
    // (The ability module's zones on the scene with this name.)
    const zonesNamed = (scene, pattern) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && pattern.test(region.name));
    // (A card of the ability module's at that creature: its targets' tokens or actors.)
    const abilityCardAt = (token) => (message) => h.abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.tokenUuid === token.uuid || entry.actorUuid === token.actor?.uuid);

    return {
        // Bring Me Near (2026-10-27, scripts/teleport.js bringAlong, teleport.with { count: 4 }): "You and up to 4 willing creatures adjacent to
        // you are instantly teleported to that spot". Its user teleports 60 feet with two allies beside it targeted (one west, one south) and a
        // third targeted 20 feet off: the two land in the free spaces beside it on the side each stood (west and south of where it lands),
        // the third stays, the card listing who went and who was left behind. (Also covers Transposition Ammunition (Greater) and Hippogriff
        // in a Jar, the same teleport.with.)
        async movingBringAlong(scene) {
            const squares = [[1, 2], [2, 2], [2, 3], [6, 2]];
            for (let x = 13; x <= 15; x++) for (let y = 1; y <= 3; y++) squares.push([x, y]);
            await h.clearSquares(scene, squares);
            const { actor: user, token } = await h.creature(scene, "Spyglass Looker", { type: "character", x: 2, y: 2 });
            const { token: west } = await h.creature(scene, "Spyglass West Friend", { x: 1, y: 2 });
            const { token: south } = await h.creature(scene, "Spyglass South Friend", { x: 2, y: 3 });
            const { token: far } = await h.creature(scene, "Spyglass Far Friend", { x: 6, y: 2 });
            const spyglass = await h.give(user, "Bring Me Near");
            const since = Date.now();
            await api().activate(spyglass.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("teleport"), { what: "the teleport card" });
            const state = card.getFlag(h.NS, "card");
            h.assert(state.plan.teleport.with?.count === 4, `up to 4 along (${JSON.stringify(state.plan.teleport.with)})`);
            h.assert(/Up to 4 willing creatures adjacent to it go along/.test(card.content), "its line for those along");
            const size = canvas.grid.size;
            await api().apply(card.id, { destination: { x: 14 * size, y: 2 * size }, targets: [west.uuid, south.uuid, far.uuid] });
            await h.until(() => token.x === 14 * size && token.y === 2 * size, `its user 60 feet on ${at(token)}`, { timeout: 8000 });
            await h.until(() => west.x === 13 * size && west.y === 2 * size, `the west friend beside it, to its west ${at(west)}`, { timeout: 8000 });
            await h.until(() => south.x === 14 * size && south.y === 3 * size, `the south friend beside it, to its south ${at(south)}`, { timeout: 8000 });
            h.assert(far.x === 6 * size && far.y === 2 * size, `the far friend where it was ${at(far)}`);
            await h.until(() => resultsOf(card).length >= 4, "the card's results", { timeout: 8000 });
            const results = resultsOf(card);
            h.assert(results.some((line) => line.startsWith("Not beside") && line.includes("Spyglass Far Friend") && /left behind/.test(line)), `the far friend left behind (${results.join(" / ")})`);
            for (const name of ["Spyglass West Friend", "Spyglass South Friend"]) h.assert(results.some((line) => line.includes(name) && /goes along/.test(line)), `${name} along (${results.join(" / ")})`);
            return { results };
        },

        // Blink Blade's reaction (2026-10-27, teleport.with { count: 1, target: true } and teleport.smoke; scripts/teleport.js bringAlong, smokeAt):
        // "You and your target teleport to a space within 10 feet. The target arrives in a safe, open space of your choosing adjacent to your
        // arrival space. This teleportation also creates puffs of smoke" — Concealed in them until they leave or the end of its user's next
        // turn. In an encounter, its user's turn: it teleports 10 feet with the foe it hit targeted — the foe beside where it lands, the ability
        // module's two Concealed zones at the space it left and the one it landed in, its user Concealed in the second; both zones end at the
        // end of its user's next turn (gone after it, not before). (The card doesn't read the critical hit that triggers it: pressed here.)
        async movingBlinkSmoke(scene) {
            const squares = [[2, 9], [3, 9]];
            for (let x = 1; x <= 3; x++) for (let y = 10; y <= 12; y++) squares.push([x, y]);
            await h.clearSquares(scene, squares);
            const { actor: user, token } = await h.creature(scene, "Blink Duelist", { type: "character", x: 2, y: 9 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Blink Mark", { x: 3, y: 9, alliance: "opposition" });
            const blade = await h.give(user, "Blink Blade");
            await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const smoke = () => zonesNamed(scene, /Blink Blade/).filter((region) => region.flags[ABILITY].zone.zone?.concealed);
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
            try {
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: user.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
                await combat.startCombat();
                await h.wait(500);
                h.assert(combat.combatant?.tokenId === token.id, `its user's turn first (${combat.combatant?.name})`);
                const since = Date.now();
                await api().activate(blade.uuid, 1);
                const card = await h.messageAfter(since, h.itemCard("teleport"), { what: "the reaction's teleport card" });
                h.assert(/Puffs of smoke fill the space it leaves and the one it lands in/.test(card.content), "the card's smoke line");
                const size = canvas.grid.size;
                await api().apply(card.id, { destination: { x: 2 * size, y: 11 * size }, targets: [foeToken.uuid] });
                await h.until(() => token.x === 2 * size && token.y === 11 * size, `its user 10 feet on ${at(token)}`, { timeout: 8000 });
                await h.until(() => (foeToken.x !== 3 * size || foeToken.y !== 9 * size) && apart(foeToken, token) === 1, `the foe beside where it landed ${at(foeToken)}`, { timeout: 8000 });
                await h.until(() => smoke().length === 2, `two smoke zones (${scene.regions.map((region) => region.name).join(", ")})`, { timeout: 10000 });
                await h.until(() => user.hasCondition("concealed"), `its user Concealed in the smoke it landed in (${user.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
                const ends = smoke().map((region) => region.flags[ABILITY].zone.endsAt);
                const userCombatant = combat.combatants.find((entry) => entry.tokenId === token.id);
                h.assert(ends.every((end) => end?.at === "turn-end" && end.round === combat.round + 1 && end.combatantId === userCombatant.id), `the end of its user's next turn (${JSON.stringify(ends)}, round ${combat.round})`);
                const results = resultsOf(card);
                h.assert(results.some((line) => /Blink Mark goes along/.test(line)) && results.some((line) => /Smoke fills the space it left/.test(line)), results.join(" / "));
                // (Its user's turn ends, the foe's, then its user's next turn starts: the smoke still there; it goes as that turn ends.)
                await combat.nextTurn();
                await combat.nextTurn();
                await h.wait(1000);
                h.assert(smoke().length === 2, `the smoke kept until its user's next turn ends (${smoke().length}, round ${combat.round}, ${combat.combatant?.name})`);
                await combat.nextTurn();
                await h.until(() => smoke().length === 0, `the smoke gone at the end of its user's next turn (${smoke().length} left)`, { timeout: 10000 });
                return { foe: at(foeToken), ends, results };
            } finally {
                for (const region of smoke()) await region.delete().catch(() => null);
                await combat.delete().catch(() => null);
            }
        },

        // Whistle of Calling's second activation (2026-10-27, teleport.summon; scripts/teleport.js applyTeleportCard): "the creature to which it is
        // attuned teleports instantly from as far as 1 mile away to an unoccupied space within 30 feet of you". With no creature targeted it's
        // refused; with the companion 70 feet off targeted, a space 35 feet from its user refused, then one 30 feet from it taken — the
        // companion's token moved there, its user's where it was.
        async movingWhistleSummon(scene) {
            await h.clearSquares(scene, [[2, 6], [8, 6], [9, 6], [16, 6]]);
            const { actor: user, token } = await h.creature(scene, "Whistle Blower", { type: "character", x: 2, y: 6 });
            const { token: companion } = await h.creature(scene, "Whistle Companion", { x: 16, y: 6 });
            const whistle = await h.give(user, "Whistle of Calling");
            const since = Date.now();
            await api().activate(whistle.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("teleport"), { what: "the whistle's teleport card" });
            h.assert(card.getFlag(h.NS, "card").plan.teleport.summon, "a summon");
            h.assert(/The creature targeted, to a space within 30 feet of its user/.test(card.content), "its range from its user");
            const size = canvas.grid.size;
            const refusals = [];
            await api().apply(card.id, { destination: { x: 8 * size, y: 6 * size }, targets: [] }).catch((error) => refusals.push(error.message));
            await api().apply(card.id, { destination: { x: 9 * size, y: 6 * size }, targets: [companion.uuid] }).catch((error) => refusals.push(error.message));
            h.assert(/Target the creature it brings/.test(refusals[0] ?? "") && /35 feet away \(the item allows 30\)/.test(refusals[1] ?? ""), `no target and 35 feet refused (${refusals.join(" / ")})`);
            h.assert(companion.x === 16 * size, `the companion not moved by a refusal ${at(companion)}`);
            await api().apply(card.id, { destination: { x: 8 * size, y: 6 * size }, targets: [companion.uuid] });
            await h.until(() => companion.x === 8 * size && companion.y === 6 * size, `the companion 30 feet from its user ${at(companion)}`, { timeout: 8000 });
            h.assert(token.x === 2 * size && token.y === 6 * size, `its user where it was ${at(token)}`);
            const results = resultsOf(card);
            h.assert(results.some((line) => /Whistle Companion teleports to .*Whistle Blower \(within 30 feet\)/.test(line)), results.join(" / "));
            return { refusals, results };
        },

        // Hellfire Boots' Devil's Dance (2026-10-27, move.trail; scripts/teleport.js trailZone, src/live/teleport-card.js squaresAlong): "You Stride.
        // Each square you move through during your Stride is scorched with hellish flames, becoming hazardous terrain for 1 minute. A creature
        // that moves through one of these spaces takes 3d6 fire damage." Its wearer Strides 25 feet: one ability-module zone whose shapes are
        // the 5 squares it crossed (made at the first, its shapes then updated to all), one zone card, 1 minute. A foe stepping onto the third
        // square (so the updated shapes keep the zone's behaviour) gets the zone's damage card, 18 with every die at 6 (3d6 fire); the wearer
        // stepping off the trail and back onto it gets none.
        async movingHellfireTrail(scene) {
            return h.unpaused(async () => {
                const squares = [];
                for (let x = 2; x <= 7; x++) for (let y = 13; y <= 16; y++) squares.push([x, y]);
                await h.clearSquares(scene, squares);
                const { actor: user, token } = await h.creature(scene, "Hellfire Dancer", { type: "character", x: 2, y: 14 });
                const { actor: foe, token: foeToken } = await h.creature(scene, "Hellfire Follower", { x: 5, y: 15, hp: 200, alliance: "opposition" });
                const boots = await h.give(user, "Hellfire Boots");
                await boots.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
                const trail = () => zonesNamed(scene, /Hellfire Boots/);
                try {
                    let since = Date.now();
                    await api().activate(boots.uuid, 0);
                    const card = await h.messageAfter(since, h.itemCard("teleport"), { what: "the Stride card" });
                    const state = card.getFlag(h.NS, "card");
                    h.assert(state.speed === 25 && state.plan.teleport.move?.verb === "Stride" && state.plan.teleport.move.trail?.formula === "3d6[fire]", `a 25-foot Stride with its trail (${state.speed}, ${JSON.stringify(state.plan.teleport.move)})`);
                    h.assert(/hazardous terrain for 1 minute: 3d6 fire damage/.test(card.content), "the card's trail line");
                    const size = canvas.grid.size;
                    await api().apply(card.id, { destination: { x: 7 * size, y: 14 * size } });
                    await h.until(() => token.x === 7 * size && token.y === 14 * size, `the Stride 25 feet on ${at(token)}`, { timeout: 8000 });
                    await h.until(() => trail().length === 1 && trail()[0].shapes.length === 5, `one zone over the 5 squares crossed (${trail().length} zones, ${trail()[0]?.shapes.length ?? 0} shapes)`, { timeout: 10000 });
                    const [region] = trail();
                    const zone = region.flags[ABILITY].zone;
                    h.assert(zone.zone.hazard?.formulas?.[0] === "3d6[fire]" && zone.zone.lasts?.value === 1 && zone.zone.lasts?.unit === "minutes", `hazardous 3d6 fire for 1 minute (${JSON.stringify({ hazard: zone.zone.hazard, lasts: zone.zone.lasts })})`);
                    h.assert(region.behaviors.some((behavior) => behavior.type === "executeScript"), "its zone behaviour kept through the shapes' update");
                    const zoneCards = game.messages.contents.filter((message) => message.timestamp >= since && (message.flags?.[ABILITY]?.zoneCard?.regionUuids ?? []).includes(region.uuid));
                    h.assert(zoneCards.length === 1, `a single zone card (${zoneCards.length})`);
                    await h.until(() => resultsOf(card).some((line) => /The 5 squares it moved through: hazardous terrain/.test(line)), `the card's trail result (${resultsOf(card).join(" / ")})`, { timeout: 8000 });
                    const trailMade = Date.now();
                    // (The foe onto the third square crossed: its damage card, every die at 6.)
                    const hp = foe.system.attributes.hp.value;
                    await h.withDie(20, async () => {
                        since = Date.now();
                        await foeToken.update({ x: 5 * size, y: 14 * size }, { animate: false });
                        const hazard = await h.messageAfter(since, abilityCardAt(foeToken), { what: "the trail's damage card at the foe", timeout: 10000 });
                        await h.applyAbilityCard(hazard);
                        await h.until(() => foe.system.attributes.hp.value < hp, `the foe burned (${foe.system.attributes.hp.value})`, { timeout: 10000 });
                    });
                    h.assert(hp - foe.system.attributes.hp.value === 18, `3d6 fire at 6s: 18 (took ${hp - foe.system.attributes.hp.value})`);
                    // (Its wearer off the trail and back onto it: nothing for it.)
                    await token.update({ x: 7 * size, y: 15 * size }, { animate: false });
                    await h.wait(800);
                    await token.update({ x: 6 * size, y: 14 * size }, { animate: false });
                    await h.wait(2000);
                    const ownCards = game.messages.contents.filter((message) => message.timestamp >= trailMade && abilityCardAt(token)(message));
                    h.assert(!ownCards.length, `no damage card at its wearer (${ownCards.length})`);
                    return { shapes: region.shapes.length, took: hp - foe.system.attributes.hp.value, results: resultsOf(card) };
                } finally {
                    for (const region of trail()) await region.delete().catch(() => null);
                }
            });
        },

        // Devil's Trap (2026-10-27, counteract.within 35 and counteract.afterFree; scripts/counteract.js): "If a devil attempts to translocate to a
        // destination within 30 feet of this square, the powder attempts to counteract the spell with a counteract rank of 3 and a counteract
        // modifier of +13 … if it succeeds at the counteract attempt, the affected devil can't use actions with the teleportation trait for 1
        // minute." Its counteract card offers the devil 20 feet off (not the creature 50 feet off) to pick; the devil picked, "the spell"
        // ticked at DC 20 rank 3, a 10 on the die (23, a success): the devil — not its user — has the 1-minute note Effect, the card saying so.
        async movingDevilsTrap(scene) {
            await h.clearSquares(scene, [[2, 17], [6, 17], [12, 17]]);
            const { actor: user } = await h.creature(scene, "Trap Scatterer", { type: "character", x: 2, y: 17 });
            const { actor: devil } = await h.creature(scene, "Trap Devil", { x: 6, y: 17, alliance: "opposition" });
            await devil.update({ "system.traits.value": ["devil", "fiend"] }).catch(() => null);
            const { actor: far } = await h.creature(scene, "Trap Bystander", { x: 12, y: 17 });
            const trap = await h.give(user, "Devil's Trap");
            const since = Date.now();
            await trap.consume();
            const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the counteract card" });
            const state = card.getFlag(h.NS, "card");
            h.assert(state.step === "pick" && state.rows.length === 1 && state.rows[0].kind === "free", `straight to its one row, the spell (${JSON.stringify(state.rows)})`);
            const devilAt = state.drinkers.findIndex((entry) => entry.actorUuid === devil.uuid);
            h.assert(devilAt > 0 && !state.drinkers.some((entry) => entry.actorUuid === far.uuid), `the devil within 35 feet to pick, not the one 50 feet off (${state.drinkers.map((entry) => entry.name).join(", ")})`);
            await h.withDie(10, () => api().apply(card.id, { drinker: devilAt, rows: [{ ticked: true, dc: 20, rank: 3 }] }));
            await h.until(() => game.messages.get(card.id)?.getFlag(h.NS, "card")?.status === "applied", "the counteract rolled", { timeout: 8000 });
            const results = resultsOf(card);
            h.assert(/23 against DC 20: a success, counteracted/.test(results[0] ?? ""), `a success (${results.join(" / ")})`);
            const named = (actor) => actor.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "note") && /no teleportation actions/.test(effect.name));
            await h.until(() => named(devil), `the devil's note Effect (devil: ${devil.itemTypes.effect.map((effect) => effect.name).join(", ") || "none"}; user: ${user.itemTypes.effect.map((effect) => effect.name).join(", ") || "none"})`, { timeout: 8000 });
            const effect = named(devil);
            h.assert(effect.system.duration.value === 1 && effect.system.duration.unit === "minutes" && /can't use actions with the teleportation trait/.test(effect.system.description.value), `1 minute, its words (${JSON.stringify(effect.system.duration)})`);
            h.assert(!named(user), "nothing on its user");
            h.assert(results.some((line) => line.includes("Trap Devil") && /can't use actions with the teleportation trait for 1 minute/.test(line)), results.join(" / "));
            return { effect: effect.name, results };
        },

        // Parachute Mail's Deploy Parachute (2026-10-27, falls.js heightWaysPlan; scripts/falls.js offers, src/live/card.js fallEffectSource halved):
        // "If it is deployed at a height greater than 100 feet, the parachute will prevent you from receiving falling damage. If deployed at a
        // height of less than 100 feet, it will reduce the damage taken from falling by half." A fall begun through PF2e Automatic Environment
        // Resolution's hook: the whispered offer names both ways. The higher way's Effect: the environment module reads a 200-foot fall as no
        // damage. The lower way's Effect is flagged halved with its words (the environment module halves it only once it supports halved: then
        // a 60-foot fall's 30 is 15; else reported, not failed).
        async movingParachuteWays(scene) {
            h.assert(game.modules.get(ENVIRONMENT)?.active, "PF2e Automatic Environment Resolution isn't active in pftest.");
            const { easedFall } = await import(`/modules/pf2e-resolution-core/src/environment/disasters.js?v=${Date.now()}`);
            const { fallEasesOf } = await import(`/modules/${ENVIRONMENT}/scripts/foundry.js?v=${Date.now()}`);
            await h.clearSquares(scene, [[17, 19]]);
            const { actor: user, token } = await h.creature(scene, "Parachute Faller", { type: "character", x: 17, y: 19 });
            const mail = await h.give(user, "Parachute Mail");
            await mail.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            const falls = () => user.itemTypes.effect.filter((effect) => effect.flags?.[ENVIRONMENT]?.fall);
            const since = Date.now();
            Hooks.callAll(`${ENVIRONMENT}.falling`, { token, feet: 200 });
            const offer = await h.messageAfter(since, (message) => /is falling 200 feet\. Its reactions:/.test(message.content ?? "") && /Parachute Mail/.test(message.content ?? ""), { what: "the fall's offer" });
            h.assert(/Parachute Mail \(Deploy Parachute\): Deployed higher than 100 feet: no falling damage, or Deployed lower than 100 feet: half the falling damage/.test(offer.content), `both ways offered (${offer.content})`);
            h.assert((offer.whisper ?? []).length > 0, "whispered");
            // (A way deployed: the ways card, its way's own card, applied.)
            const deploy = async (choice) => {
                let when = Date.now();
                await api().activate(mail.uuid, 0);
                const ways = await h.messageAfter(when, h.itemCard("ways"), { what: "the parachute's ways card" });
                h.assert(ways.getFlag(h.NS, "card").plan.ways.length === 2, "its two heights");
                when = Date.now();
                await api().apply(ways.id, { choice });
                const card = await h.messageAfter(when, h.itemCard("item"), { what: "the way's card" });
                await api().apply(card.id);
                return card;
            };
            await deploy(0);
            await h.until(() => falls().some((effect) => effect.flags[ENVIRONMENT].fall.noDamage), `the no-damage fall Effect (${falls().map((effect) => JSON.stringify(effect.flags[ENVIRONMENT].fall)).join(", ")})`, { timeout: 8000 });
            const high = easedFall(200, fallEasesOf(user));
            h.assert(high.damage === 0, `a 200-foot fall: no damage (${JSON.stringify(high)})`);
            await user.deleteEmbeddedDocuments("Item", falls().map((effect) => effect.id));
            await deploy(1);
            await h.until(() => falls().some((effect) => effect.flags[ENVIRONMENT].fall.halved === true), `the halved fall Effect (${falls().map((effect) => JSON.stringify(effect.flags[ENVIRONMENT].fall)).join(", ")})`, { timeout: 8000 });
            const halved = falls().find((effect) => effect.flags[ENVIRONMENT].fall.halved);
            h.assert(!halved.flags[ENVIRONMENT].fall.noDamage && /half the damage from a fall/.test(halved.system.description.value), `half, in its words (${halved.system.description.value})`);
            const low = easedFall(60, fallEasesOf(user));
            if (low.halved) h.assert(low.damage === Math.floor(low.before / 2), `a 60-foot fall halved (${JSON.stringify(low)})`);
            return { high, low, environmentHalves: Boolean(low.halved) };
        }
    };
};
