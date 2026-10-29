// The fourth batch's sixth group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (src/compiler/relic-readings.js's readings and the scripts they made):
// - Aroden's Hearthstone: the craft card (scripts/craft.js) and its cold's pulse with the blast (scripts/pulse.js).
// - Philosopher's Extractor: Accelerated Synthesis' impeccable items (craft.js budget, src/live/craft-card.js impeccablePlan/impeccableEffect)
//   and Essence Transmogrification's mutagens (scripts/transmogrify.js).
// - Clockwork Sun: saves at creatures' turns near the Effect's bearer (scripts/turn-auras.js).
// - Lesser Cube of Nex: its walls of force placed and removed (scripts/item-structures.js), and the counteract card beside a face's zone.
// - Planar Ribbon: places traded after a failed save, Off-Guard at the foe's allies (scripts/swap.js).
// - Staff of Sun Wukong: an item's other form (src/live/item-form.js).
// - The Courtesan: castBonus.rules (scripts/casts.js giveCastBonus); The Vision: its Effect's proficiency for the next Lore check.
// - Grimoire of Unknown Necessities: a spell granted for the day (scripts/grimoire.js).
// - Book of Lost Days: plan.unlessCondition and plan.alsoWhisper (scripts/live.js postCardFor), Drained 2 with its floor.
// - Stage Magician's Cloak: userEffects of kind "remove" (Hidden gone) beside Quickened and its note; the teleport card beside the cast.
// - Grail of Twisted Desires: the wine filled with its secret twist and drunk (scripts/grail.js, src/live/grail.js winePlan).
// - Ring of Bestial Friendship: the immunity tracker on a cast card at the creature targeted (scripts/immunity.js's cast clause), the rage.
// - Vile Remnant: a save at its user's next rest (scripts/after-rest.js), the cast's note Effect of castBonus with no rules.
// - Deck of Many Things: declared draws from PF2e's table, a choice, the hour's draws, never again, the GM's press (scripts/deck.js).

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
const ENV = "pf2e-automatic-environment-resolution";
// (tools/live-check.mjs's flag on its own fixtures: its cleanup removes only those — the compendium creatures and encounters made here carry it.)
const FIXTURE = "liveCheckFixture";
// (PF2e's own creatures: Monster Core's Forest Troll (darkvision, Rend), Dero Stalker (Vulnerable to Sunlight, no slug of its own), Wolf (animal).)
const TROLL = "Compendium.pf2e.pathfinder-monster-core.Actor.htK4dElL6YvFCLkz";
const DERO = "Compendium.pf2e.pathfinder-monster-core.Actor.BxOlYmZiwLRpxGWp";
const WOLF = "Compendium.pf2e.pathfinder-monster-core.Actor.BN5Lb6IsQ9Wyu3rL";
// (PF2e's Effect: Avert Gaze, slug effect-avert-gaze.)
const AVERT_GAZE = "Compendium.pf2e.other-effects.Item.ZXUOdZqUW22OX3ge";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const refusal = (promise) => promise.then(() => null, (error) => String(error?.message ?? error));
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    // (The ability module's cards: their state, and the one made since then whose creatures include that actor.)
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const targetsOf = (message) => (abilityState(message)?.targets ?? []).map((target) => target.actorUuid);
    const cardAt = (since, actor, what, test = () => true) => h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsOf(message).includes(actor.uuid) && test(message), { what, timeout: 10000 });
    const copper = (actor) => Number(actor.inventory?.coins?.copperValue) || 0;
    const senses = (actor) => [...(actor.system?.perception?.senses ?? []), ...(actor.perception?.senses ?? [])].map((sense) => String(sense?.type ?? sense));

    // The windows a cast through the spell module may leave open (its caster choices, a confirmation, PF2e's ChoiceSet prompt — found without its
    // rendered flag, which a hidden pane never sets): closed.
    async function closeWindows(pattern) {
        for (const app of [...foundry.applications.instances.values()]) {
            const title = String(app.title ?? app.options?.window?.title ?? "");
            if (pattern.test(title) || /caster choices/i.test(title) || (Array.isArray(app.choices) && typeof app.resolveSelection === "function")) await app.close().catch(() => null);
        }
    }
    // Every die of that many faces at that value while fn runs (Foundry's face is ceil((1 − r) × faces)): a 1d22 table's row, a d6.
    async function withFace(faces, value, fn) {
        const random = CONFIG.Dice.randomUniform;
        CONFIG.Dice.randomUniform = () => 1 - (value - 0.5) / faces;
        try {
            return await fn();
        } finally {
            CONFIG.Dice.randomUniform = random;
        }
    }
    // An item's uuid in PF2e's equipment by its name.
    async function equipmentUuid(name) {
        const row = (await game.packs.get("pf2e.equipment-srd").getIndex()).find((entry) => entry.name === name);
        h.assert(row, `${name} isn't in PF2e's equipment.`);
        return `Compendium.pf2e.equipment-srd.Item.${row._id}`;
    }
    // A bare character's 30 maximum Hit Points (it has none of its own, and PF2e then heals or damages nothing).
    async function hitPoints(actor) {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 30 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await h.until(() => actor.system.attributes.hp.max >= 30, "30 maximum Hit Points", { timeout: 5000 });
    }
    // A PF2e actor from its compendium as one of this check's fixtures ("PFTEST ITEM …", flagged, linked), its token on the lab at (x, y).
    async function fixtureFrom(scene, uuid, name, { x, y }) {
        const found = await fromUuid(uuid).catch(() => null);
        h.assert(found, `${uuid} in PF2e's compendiums`);
        const source = found.toObject();
        delete source._id;
        source.name = `${h.PREFIX} ${name}`;
        source.folder = null;
        source.flags = foundry.utils.mergeObject(source.flags ?? {}, { [h.NS]: { [FIXTURE]: true } }, { inplace: false });
        source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name, actorLink: true };
        const actor = await Actor.create(source);
        const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), actorId: actor.id, actorLink: true, x: x * 100, y: y * 100 }]);
        await h.wait(300);
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await h.wait(100);
        return { actor, token };
    }
    // An encounter of these tokens in this initiative order (the first one's turn now), flagged as a fixture.
    async function encounter(scene, tokens) {
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        await combat.createEmbeddedDocuments("Combatant", tokens.map((token, index) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, initiative: 40 - index * 10 })));
        await combat.startCombat();
        await h.wait(500);
        return combat;
    }
    // An activation's card: the item activated, the first card of that kind after it.
    async function activated(item, index, kind, what) {
        const since = Date.now();
        await api().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    }
    // A ways card's way used → its own card (of that kind, not the ways card).
    async function wayCard(ways, choice, kind, what) {
        const since = Date.now();
        await api().apply(ways.id, { choice });
        return h.messageAfter(since, (message) => h.itemCard(kind)(message) && message.id !== ways.id, { what });
    }

    return {
        // Aroden's Hearthstone's crafting (plan.craft, scripts/craft.js): "you can create a magical weapon or armor of 20th level or lower …
        // you need to know the formula … attempt a Crafting check … If you succeed, you pay only one-quarter of the item's Price in raw
        // materials" (Requirements: legendary in Crafting). A legendary level-5 smith knowing Caterwaul Sling (level 5, 155 gp) and a plain
        // Longsword: the card lists the sling alone, at PF2e's DC for its level. A success (PF2e's Crafting check at that DC, action:craft) puts
        // the sling in the inventory and takes a quarter of 155 gp (38 gp 7 sp 5 cp); a failure makes nothing and takes nothing; a critical
        // failure (a natural 1) makes nothing and takes a tenth of that quarter. A master smith's press with no GM (gm false) is refused; the GM's
        // goes on, with the line that the GM pressed it anyway.
        async b4G6HearthstoneCraft(scene) {
            const { actor: smith } = await h.creature(scene, "Hearthstone Legend Smith", { type: "character", x: 2, y: 2, level: 5 });
            const { actor: master } = await h.creature(scene, "Hearthstone Master Smith", { type: "character", x: 2, y: 4, level: 5 });
            const formulas = [{ uuid: await equipmentUuid("Caterwaul Sling") }, { uuid: await equipmentUuid("Longsword") }];
            for (const [actor, rank] of [[smith, 4], [master, 3]]) {
                await actor.update({ "system.skills.crafting.rank": rank, "system.crafting.formulas": formulas });
                await actor.inventory.addCoins({ gp: 100 });
            }
            await h.until(() => smith.skills.crafting.rank === 4 && master.skills.crafting.rank === 3 && copper(smith) === 10000 && copper(master) === 10000, `the smiths' ranks and 100 gp each (${smith.skills.crafting.rank}, ${master.skills.crafting.rank}; ${copper(smith)}, ${copper(master)} cp)`, { timeout: 5000 });
            const slings = (actor) => actor.itemTypes.weapon.filter((weapon) => weapon.name === "Caterwaul Sling").length;
            const crafted = (since, actor) => h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === actor.id && (message.flags.pf2e.context.options ?? []).includes("action:craft"), { what: "PF2e's Crafting check" });
            // (The sling's row on a craft card, and the faces that land each degree for that crafter.)
            const slingOf = (card) => {
                const options = stateOf(card).options ?? [];
                const pick = options.findIndex((option) => option.name === "Caterwaul Sling");
                h.assert(pick >= 0 && !options.some((option) => option.name === "Longsword"), `the magical sling listed, not the Longsword (${JSON.stringify(options.map((option) => option.name))})`);
                return { pick, option: options[pick] };
            };
            const facesFor = (actor, dc) => {
                const mod = Number(actor.skills.crafting.mod);
                const success = Math.min(19, Math.max(2, dc - mod + 2));
                const failure = Math.min(19, Math.max(2, dc - mod - 3));
                h.assert(success + mod >= dc && success + mod < dc + 10 && failure + mod < dc && failure + mod > dc - 10 && 1 + mod < dc, `faces for a success, a failure and a natural-1 critical failure (+${mod} against DC ${dc}: ${success}, ${failure}, 1)`);
                return { success, failure, critical: 1 };
            };
            const hearth = await h.give(smith, "Aroden's Hearthstone");
            const first = await activated(hearth, 0, "craft", "the hearthstone's craft card");
            const { pick, option } = slingOf(first);
            h.assert(option.level === 5 && option.price === 15500 && Number(option.dc) > 0, `level 5, 155 gp, PF2e's DC (${JSON.stringify(option)})`);
            const cost = Math.ceil(option.price / 4);
            const faces = facesFor(smith, option.dc);
            let since = Date.now();
            await h.withDie(faces.success, () => api().apply(first.id, { pick }));
            const roll = await crafted(since, smith);
            h.assert(Number(roll.flags.pf2e.context.dc?.value) === option.dc && roll.flags.pf2e.context.outcome === "success", `PF2e's Crafting check at DC ${option.dc}, a success (${JSON.stringify(roll.flags.pf2e.context.dc ?? null)}, ${roll.flags.pf2e.context.outcome})`);
            await h.until(() => slings(smith) === 1 && copper(smith) === 10000 - cost, `the sling made, ${cost} cp taken (${slings(smith)}; ${copper(smith)} cp)`, { timeout: 8000 });
            h.assert(/^Caterwaul Sling made, .+ of raw materials paid\.$/.test(resultsOf(first)[0] ?? ""), `its line (${JSON.stringify(resultsOf(first))})`);
            const failed = await activated(hearth, 0, "craft", "the second craft card");
            await h.withDie(faces.failure, () => api().apply(failed.id, { pick: slingOf(failed).pick }));
            await h.until(() => stateOf(failed)?.status === "applied", "the failure applied", { timeout: 8000 });
            h.assert(slings(smith) === 1 && copper(smith) === 10000 - cost && /^Failure: .*nothing paid/.test(resultsOf(failed)[0] ?? ""), `a failure: nothing made or taken (${slings(smith)}; ${copper(smith)} cp; ${JSON.stringify(resultsOf(failed))})`);
            const ruined = await activated(hearth, 0, "craft", "the third craft card");
            await h.withDie(faces.critical, () => api().apply(ruined.id, { pick: slingOf(ruined).pick }));
            await h.until(() => stateOf(ruined)?.status === "applied", "the critical failure applied", { timeout: 8000 });
            const tenth = Math.ceil(cost / 10);
            h.assert(slings(smith) === 1 && copper(smith) === 10000 - cost - tenth && /^Critical failure:/.test(resultsOf(ruined)[0] ?? ""), `a critical failure: nothing made, a tenth (${tenth} cp) ruined (${slings(smith)}; ${copper(smith)} cp; ${JSON.stringify(resultsOf(ruined))})`);
            // (A master smith: its player's press refused, the GM's going on.)
            const masterStone = await h.give(master, "Aroden's Hearthstone");
            const asked = await activated(masterStone, 0, "craft", "the master's craft card");
            const masterPick = slingOf(asked).pick;
            const refused = await refusal(api().apply(asked.id, { pick: masterPick, gm: false }));
            h.assert(/Requirements need .* to be legendary in Crafting \(master\)/.test(refused ?? "") && slings(master) === 0, `a player's press refused (${refused})`);
            since = Date.now();
            await h.withDie(facesFor(master, option.dc).success, () => api().apply(asked.id, { pick: masterPick, gm: true }));
            await crafted(since, master);
            await h.until(() => slings(master) === 1 && copper(master) === 10000 - cost, `the GM's press made it (${slings(master)}; ${copper(master)} cp)`, { timeout: 8000 });
            h.assert(resultsOf(asked).some((line) => /is master in Crafting, not legendary in Crafting: the GM pressed it anyway\./.test(line)), `the GM's line (${JSON.stringify(resultsOf(asked))})`);
            return { dc: option.dc, cost, tenth, refused, results: [resultsOf(first), resultsOf(failed), resultsOf(ruined), resultsOf(asked)] };
        },

        // Aroden's Hearthstone's cold (plan.item.pulse, scripts/pulse.js): "every creature within 1 mile … takes 4d6 cold damage each round"
        // for the minute, "then … a massive blast of heat that deals 25d6 fire damage to all creatures … within 150 feet". In an encounter, used
        // on its bearer's turn: the ability module's no-roll 4d6 cold card at the bearer, an ally and a foe at once (applied: the foe loses Hit
        // Points); at the bearer's next turn start, the card again; the world's clock a minute on, at its next turn start, the 25d6 fire card
        // at all three, its "time is up" line, and the bearer's pulse gone.
        async b4G6HearthstoneCold(scene) {
            const { actor: user, token: userToken } = await h.creature(scene, "Hearthstone Cold Bearer", { type: "character", x: 2, y: 2, level: 20 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Hearthstone Cold Ally", { x: 4, y: 2, hp: 300 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Hearthstone Cold Foe", { x: 10, y: 10, hp: 300, alliance: "opposition" });
            await hitPoints(user);
            const stone = await h.give(user, "Aroden's Hearthstone");
            const pulseCard = (formula) => (message) => h.abilitySaveCard(message) && abilityState(message)?.plan?.resolution?.sharedDamage?.components?.[0]?.formula === formula;
            const everyone = [user, ally, foe].map((actor) => actor.uuid);
            const atAll = (message) => everyone.every((uuid) => targetsOf(message).includes(uuid));
            const pulses = () => user.getFlag(h.NS, "pulses") ?? [];
            const combat = await encounter(scene, [userToken, allyToken, foeToken]);
            try {
                h.assert(combat.combatant?.actorId === user.id, `the bearer's turn first (${combat.combatant?.name})`);
                let since = Date.now();
                await api().activate(stone.uuid, 1);
                const cold = await h.messageAfter(since, pulseCard("4d6[cold]"), { what: "the 4d6 cold card", timeout: 10000 });
                h.assert(atAll(cold), `at the bearer, its ally and its foe (${JSON.stringify(targetsOf(cold))})`);
                await h.until(() => pulses().length === 1 && Number(pulses()[0].endsAt) === Number(game.time.worldTime) + 60, `its minute kept on the bearer (${JSON.stringify(pulses())}, now ${game.time.worldTime})`, { timeout: 5000 });
                const said = await h.messageAfter(since, (message) => /Again at the start of each of its turns while it lasts/.test(message.content ?? ""), { what: "the pulse's line" });
                const hp = foe.system.attributes.hp.value;
                await h.applyAbilityCard(cold);
                await h.until(() => foe.system.attributes.hp.value < hp, `the cold on the foe (${foe.system.attributes.hp.value} of ${hp})`, { timeout: 10000 });
                // (The bearer's next turn: the card again.)
                await combat.nextTurn();
                await combat.nextTurn();
                since = Date.now();
                await combat.nextTurn();
                h.assert(combat.combatant?.actorId === user.id && combat.round === 2, `the bearer's turn in round 2 (${combat.combatant?.name}, round ${combat.round})`);
                const tick = await h.messageAfter(since, pulseCard("4d6[cold]"), { what: "the next round's cold card", timeout: 10000 });
                h.assert(atAll(tick) && pulses().length === 1, `again at all three, still lasting (${JSON.stringify(targetsOf(tick))}; ${pulses().length})`);
                // (The minute up: the blast at its next turn start.)
                await game.time.advance(60);
                await combat.nextTurn();
                await combat.nextTurn();
                since = Date.now();
                await combat.nextTurn();
                const blast = await h.messageAfter(since, pulseCard("25d6[fire]"), { what: "the blast's 25d6 fire card", timeout: 10000 });
                h.assert(atAll(blast), `the blast at all three within 150 feet (${JSON.stringify(targetsOf(blast))})`);
                await h.messageAfter(since, (message) => /its time is up/.test(message.content ?? ""), { what: "the blast's line" });
                h.assert(!abilityCardsSince(since).some((message) => pulseCard("4d6[cold]")(message)) && pulses().length === 0, `no more cold, the pulse gone (${pulses().length})`);
                return { line: textOf(said), hpLost: hp - foe.system.attributes.hp.value, round: combat.round };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Philosopher's Extractor's Accelerated Synthesis (plan.craft without a check, budget 56 levels a day, impeccable): "you can instantly
        // create an alchemical item of your level or lower … the item is impeccable: it always uses the maximum numerical value possible for
        // any rolls it requires, and if it has a duration, it lasts twice as long. It never has a drawback." A level-5 alchemist knowing Elixir
        // of Life (Lesser) and Juggernaut Mutagen (Lesser): the card at 56 levels left; the elixir made at once, flagged impeccable; the next card
        // at 51 left ("51 levels of items left to make today."), the mutagen made. Drunk at 1 Hit Point, the elixir heals its maximum, 3d6+6 = 24,
        // and PF2e's Effect: Elixir of Life lasts 20 minutes; the mutagen's Effect lasts 2 minutes, keeps its +1 to Fortitude and loses its −2
        // drawback.
        async b4G6ExtractorImpeccable(scene) {
            const { actor: user } = await h.creature(scene, "Extractor Alchemist", { type: "character", x: 2, y: 6, level: 5 });
            await hitPoints(user);
            await user.update({ "system.crafting.formulas": [{ uuid: await equipmentUuid("Elixir of Life (Lesser)") }, { uuid: await equipmentUuid("Juggernaut Mutagen (Lesser)") }] });
            const extractor = await h.give(user, "Philosopher's Extractor");
            const impeccable = (name) => user.items.find((item) => item.name === name && item.flags?.[h.NS]?.impeccable) ?? null;
            const make = async (card, name) => {
                const pick = (stateOf(card).options ?? []).findIndex((option) => option.name === name);
                h.assert(pick >= 0, `${name} among its formulas (${JSON.stringify((stateOf(card).options ?? []).map((option) => option.name))})`);
                await api().apply(card.id, { pick });
                await h.until(() => impeccable(name), `${name} made and flagged impeccable`, { timeout: 8000 });
            };
            const first = await activated(extractor, 0, "craft", "Accelerated Synthesis' card");
            h.assert(stateOf(first).left === 56 && /56 levels of items left to make today\./.test(textOf(first)), `56 levels to start (${stateOf(first).left})`);
            await make(first, "Elixir of Life (Lesser)");
            const second = await activated(extractor, 0, "craft", "the next Accelerated Synthesis card");
            h.assert(stateOf(second).left === 51 && /51 levels of items left to make today\./.test(textOf(second)), `51 levels left after a level-5 elixir (${stateOf(second).left}; ${textOf(second).slice(0, 300)})`);
            await make(second, "Juggernaut Mutagen (Lesser)");
            // (Drunk: its maximum healing and its Effect twice as long.)
            await user.update({ "system.attributes.hp.value": 1 });
            const drink = async (name) => {
                const item = impeccable(name);
                const since = Date.now();
                await item.consume();
                const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && stateOf(message)?.item?.name === name, { what: `${name}'s card` });
                h.assert(stateOf(card).plan.impeccable === true, `its card's plan impeccable (${JSON.stringify(Object.keys(stateOf(card).plan))})`);
                await api().apply(card.id, { drinker: 0 });
                return card;
            };
            const elixir = await drink("Elixir of Life (Lesser)");
            await h.until(() => user.system.attributes.hp.value === 25, `healed 24, its maximum (${user.system.attributes.hp.value}; ${JSON.stringify(resultsOf(elixir))})`, { timeout: 8000 });
            const lifeEffect = () => user.itemTypes.effect.find((effect) => effect.name.startsWith("Effect: Elixir of Life"));
            await h.until(() => lifeEffect(), `Effect: Elixir of Life (${effectNames(user)})`, { timeout: 5000 });
            h.assert(lifeEffect().system.duration.value === 20 && lifeEffect().system.duration.unit === "minutes", `20 minutes, twice its 10 (${JSON.stringify(lifeEffect().system.duration)})`);
            const mutagen = await drink("Juggernaut Mutagen (Lesser)");
            const juggernaut = () => user.itemTypes.effect.find((effect) => effect.name === "Effect: Juggernaut Mutagen (Lesser)");
            await h.until(() => juggernaut(), `the mutagen's Effect (${effectNames(user)}; ${JSON.stringify(resultsOf(mutagen))})`, { timeout: 8000 });
            const rules = juggernaut().system.rules ?? [];
            h.assert(juggernaut().system.duration.value === 2 && juggernaut().system.duration.unit === "minutes", `2 minutes, twice its 1 (${JSON.stringify(juggernaut().system.duration)})`);
            h.assert(!rules.some((rule) => rule.key === "FlatModifier" && Number(rule.value) < 0) && rules.some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("fortitude") && Number(rule.value) === 1), `its +1 to Fortitude kept, its −2 drawback gone (${JSON.stringify(rules)})`);
            return { hp: user.system.attributes.hp.value, elixir: resultsOf(elixir), mutagen: resultsOf(mutagen) };
        },

        // Philosopher's Extractor's Essence Transmogrification (plan.transmogrify, scripts/transmogrify.js): mutagens made from the body of the
        // creature targeted; drunk, "you gain one of that creature's abilities … for 1 hour", the GM's pick; another of the same creature "adds
        // one more ability, and an hour to them all", and drunk while another is active, a flat check. At a dead Forest Troll (PF2e's), 3 made in
        // the inventory, flagged with it. The first drunk: a press without the GM refused; the GM's pick of darkvision gives an hour's Effect
        // with PF2e's Sense rule (the drinker has darkvision). The second: Rend picked — its copy on the drinker's sheet tied to the new Effect,
        // the first Effect now 2 hours, and the DC 2 flat check rolled (a 10: a success). The new Effect deleted, the copy of Rend goes with it.
        async b4G6ExtractorTransmogrify(scene) {
            const { actor: user } = await h.creature(scene, "Transmogrify Drinker", { type: "character", x: 2, y: 10, level: 10 });
            const { actor: troll, token: trollToken } = await fixtureFrom(scene, TROLL, "Transmogrify Troll Body", { x: 4, y: 10 });
            await troll.update({ "system.attributes.hp.value": 0 });
            const extractor = await h.give(user, "Philosopher's Extractor");
            const make = await activated(extractor, 1, "transmogrify", "Essence Transmogrification's card");
            h.assert(stateOf(make).plan.transmogrify.step === "make", "its make step");
            await api().apply(make.id, { targets: [trollToken.uuid], count: 3 });
            const mutagen = () => user.items.find((item) => item.flags?.[h.NS]?.transmogrify) ?? null;
            await h.until(() => Number(mutagen()?.system?.quantity) === 3, `3 mutagens in the inventory (${mutagen()?.name}: ${mutagen()?.system?.quantity})`, { timeout: 8000 });
            h.assert(mutagen().flags[h.NS].transmogrify.creature?.name === troll.name, `flagged with the troll (${JSON.stringify(mutagen().flags[h.NS].transmogrify.creature)})`);
            const drinkCard = async () => {
                const since = Date.now();
                await mutagen().consume();
                return h.messageAfter(since, (message) => h.itemCard("transmogrify")(message) && stateOf(message)?.plan?.transmogrify?.step === "drink", { what: "the drunk mutagen's card", timeout: 10000 });
            };
            const effects = () => user.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.transmogrify);
            const first = await drinkCard();
            const choices = stateOf(first).choices ?? [];
            const dark = choices.findIndex((choice) => choice.kind === "sense" && choice.selector === "darkvision");
            const rend = choices.findIndex((choice) => choice.kind === "action" && choice.label === "Rend");
            h.assert(dark >= 0 && rend >= 0 && !choices.some((choice) => /spell/i.test(choice.label)), `darkvision and Rend among its abilities, no spells (${JSON.stringify(choices.map((choice) => choice.label))})`);
            const refused = await refusal(api().apply(first.id, { pick: dark, gm: false }));
            h.assert(/the GM picks the ability it gives/.test(refused ?? "") && !effects().length, `a press not the GM's refused (${refused})`);
            await api().apply(first.id, { pick: dark, gm: true });
            await h.until(() => effects().length === 1, `its Effect (${effectNames(user)})`, { timeout: 8000 });
            const sight = effects()[0];
            h.assert((sight.system.rules ?? []).some((rule) => rule.key === "Sense" && rule.selector === "darkvision") && sight.system.duration.value === 60 && sight.system.duration.unit === "minutes", `PF2e's darkvision Sense for an hour (${JSON.stringify({ rules: sight.system.rules, duration: sight.system.duration })})`);
            await h.until(() => senses(user).includes("darkvision"), `the drinker has darkvision (${senses(user)})`, { timeout: 5000 });
            const second = await drinkCard();
            h.assert(stateOf(second).active === 1 && stateOf(second).sameKind === 1, `another active, of the same creature (${stateOf(second).active}, ${stateOf(second).sameKind})`);
            const since = Date.now();
            await h.withDie(10, () => api().apply(second.id, { pick: rend, gm: true }));
            await h.until(() => effects().length === 2, `the second Effect (${effectNames(user)})`, { timeout: 8000 });
            const added = effects().find((effect) => effect.id !== sight.id);
            const copy = () => user.items.find((item) => item.flags?.[h.NS]?.transmogrifyGiven === added.id) ?? null;
            await h.until(() => copy(), `Rend's copy on the drinker's sheet (${user.items.map((item) => item.name).join(", ")})`, { timeout: 5000 });
            h.assert(copy().name === "Rend", `the copy is Rend (${copy().name})`);
            await h.until(() => user.items.get(sight.id)?.system?.duration?.value === 120, `the first Effect an hour longer (${JSON.stringify(user.items.get(sight.id)?.system?.duration)})`, { timeout: 5000 });
            const flat = await h.messageAfter(since, (message) => /flat check DC 2/.test(message.flavor ?? ""), { what: "the DC 2 flat check" });
            h.assert(resultsOf(second).some((line) => /^Flat check DC 2: \d+, a success\.$/.test(line)), `the flat check's line (${JSON.stringify(resultsOf(second))})`);
            await added.delete();
            await h.until(() => !copy(), "Rend's copy gone with its Effect", { timeout: 8000 });
            return { flat: flat.rolls?.[0]?.total ?? null, results: [resultsOf(first), resultsOf(second)] };
        },

        // Clockwork Sun's Set Cycle (item.ruleEffects turnAuras, scripts/turn-auras.js): used from the sun's own token, its Effect (PF2e's
        // TokenLight to a mile) calls, "A sighted creature that ends their turn within 20 feet of the clockwork sun and didn't Avert Gaze that turn
        // must succeed at a DC 43 Fortitude save", and "Creatures that are vulnerable to sunlight … if they start their turn within the
        // illumination … DC 43 Will save". In an encounter (the sun, a PC 10 feet off, a PC 10 feet off with PF2e's Effect: Avert Gaze, a Dero
        // Stalker 40 feet off — its "Vulnerable to Sunlight" has no slug, matched by its name): the first PC's turn end brings its DC 43 Fortitude
        // card (applied at a 10: Blinded, a critical failure); the second PC's none; the dero's turn start its DC 43 Will card (applied: Sickened 2).
        async b4G6ClockworkSunAuras(scene) {
            const { actor: sun, token: sunToken } = await h.creature(scene, "Clockwork Sun Bearer", { x: 2, y: 4, hp: 300, level: 20 });
            const { actor: looker, token: lookerToken } = await h.creature(scene, "Clockwork Sun Looker", { type: "character", x: 4, y: 4 });
            const { actor: averter, token: averterToken } = await h.creature(scene, "Clockwork Sun Averter", { type: "character", x: 2, y: 6 });
            const { actor: dero, token: deroToken } = await fixtureFrom(scene, DERO, "Clockwork Sun Dero", { x: 2, y: 12 });
            const avert = (await fromUuid(AVERT_GAZE)).toObject();
            delete avert._id;
            // (Kept for the case: its own round could end before the averter's turn does.)
            avert.system.duration = { value: -1, unit: "unlimited", expiry: null, sustained: false };
            await averter.createEmbeddedDocuments("Item", [avert]);
            h.assert(averter.itemTypes.effect.some((effect) => effect.slug === "effect-avert-gaze"), `PF2e's Effect: Avert Gaze on the averter (${effectNames(averter)})`);
            h.assert([...(dero.itemTypes?.action ?? [])].some((action) => action.name === "Vulnerable to Sunlight"), "the dero's Vulnerable to Sunlight");
            const sunItem = await h.give(sun, "Clockwork Sun");
            const combat = await encounter(scene, [sunToken, lookerToken, averterToken, deroToken]);
            try {
                const card = await activated(sunItem, 0, "item", "Set Cycle's card");
                await api().apply(card.id, { drinker: 0 });
                const lit = () => sun.itemTypes.effect.find((effect) => (effect.flags?.[h.NS]?.turnAuras ?? []).length);
                await h.until(() => lit(), `the sun's Effect with its auras (${effectNames(sun)})`, { timeout: 8000 });
                h.assert((lit().system.rules ?? []).some((rule) => rule.key === "TokenLight" && Number(rule.value?.bright) === 5280) && lit().flags[h.NS].turnAuras.length === 2, `its light to a mile and two auras (${JSON.stringify(lit().system.rules)})`);
                // (The sun's turn ends, the looker's starts: nothing.)
                await combat.nextTurn();
                // (The looker's turn ends: its Fortitude card.)
                let since = Date.now();
                await combat.nextTurn();
                const glare = await cardAt(since, looker, "the looker's Fortitude card");
                const check = abilityState(glare).plan.resolution.check;
                h.assert(check.statistic === "fortitude" && check.against?.value === 43, `a DC 43 Fortitude save (${JSON.stringify(check)})`);
                // (The averter's turn ends — nothing —, the dero's starts: its Will card.)
                since = Date.now();
                await combat.nextTurn();
                const near = await cardAt(since, dero, "the dero's Will card");
                const will = abilityState(near).plan.resolution.check;
                h.assert(will.statistic === "will" && will.against?.value === 43, `a DC 43 Will save (${JSON.stringify(will)})`);
                await h.wait(1500);
                h.assert(!abilityCardsSince(since).some((message) => targetsOf(message).includes(averter.uuid)), "no card for the creature that Averted Gaze");
                h.assert(!abilityCardsSince(since).some((message) => message.id !== near.id && targetsOf(message).includes(dero.uuid)), "the dero's Will card alone (it's 40 feet off: no Fortitude card)");
                await h.withDie(10, () => h.rollAndApply(glare));
                await h.until(() => looker.hasCondition("blinded"), `the looker Blinded (${looker.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 10000 });
                await h.withDie(10, () => h.rollAndApply(near));
                await h.until(() => Number(dero.getCondition("sickened")?.value) === 2, `the dero Sickened 2 (${dero.getCondition("sickened")?.value ?? "none"})`, { timeout: 10000 });
                return { glare: check, will };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // (b4G6LesserCubeWalls superseded 2026-10-29 by b5LeftoversCubeOfForceTimes (Lesser Cube of Nex reads as Cube of Nex since batch 5).)

        // Planar Ribbon's reach (plan.swap, scripts/swap.js): "The target must succeed at a DC 42 Reflex save or you exchange positions with the
        // target and all of that creature's allies are off-guard to you until the end of your turn." At a foe 20 feet off (its Reflex −30), the
        // ability module's DC 42 Reflex card, applied: the user and the foe trade squares, and the foe's ally gets the ability module's Off-Guard
        // card (applied: the user's scoped Off-Guard Effect against that ally), the user's own ally none.
        async b4G6PlanarRibbonSwap(scene) {
            const { actor: user, token: userToken } = await h.creature(scene, "Planar Ribbon Dancer", { type: "character", x: 2, y: 14, level: 20 });
            const { token: friendToken, actor: friend } = await h.creature(scene, "Planar Ribbon Friend", { x: 2, y: 16 });
            const { token: foeToken } = await h.creature(scene, "Planar Ribbon Foe", { x: 6, y: 14, alliance: "opposition", save: -30, hp: 200 });
            const { actor: foeAlly, token: foeAllyToken } = await h.creature(scene, "Planar Ribbon Foe Ally", { x: 6, y: 17, alliance: "opposition", hp: 200 });
            const ribbon = await h.give(user, "Planar Ribbon");
            const card = await activated(ribbon, 1, "expose", "the ribbon's save card");
            let since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the DC 42 Reflex card" });
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "reflex" && check.against?.value === 42 && abilityState(save).plan.swap, `a DC 42 Reflex save with the swap (${JSON.stringify(check)})`);
            const was = { user: { x: userToken.x, y: userToken.y }, foe: { x: foeToken.x, y: foeToken.y } };
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(save));
            const at = (token) => ({ x: scene.tokens.get(token.id)?.x, y: scene.tokens.get(token.id)?.y });
            await h.until(() => at(userToken).x === was.foe.x && at(userToken).y === was.foe.y && at(foeToken).x === was.user.x && at(foeToken).y === was.user.y, `places traded (${JSON.stringify({ was, user: at(userToken), foe: at(foeToken) })})`, { timeout: 10000 });
            const offGuard = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && message.id !== save.id && targetsOf(message).includes(foeAlly.uuid), { what: "the Off-Guard card at the foe's ally", timeout: 10000 });
            h.assert(!targetsOf(offGuard).includes(friend.uuid), `not at the user's own ally (${JSON.stringify(targetsOf(offGuard))})`);
            await h.applyAbilityCard(offGuard);
            const scoped = () => user.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.scopedOffGuard?.target === foeAllyToken.uuid);
            await h.until(() => scoped() || foeAlly.hasCondition("off-guard"), `the foe's ally Off-Guard to the user (${effectNames(user)} | ${effectNames(foeAlly)})`, { timeout: 8000 });
            return { was, now: { user: at(userToken), foe: at(foeToken) }, scoped: scoped()?.flags?.[ABILITY]?.scopedOffGuard ?? null, friendToken: friendToken.id };
        },

        // Staff of Sun Wukong's Close at Hand (plan.item.itemForm, src/live/item-form.js): "the staff shrinks to the size and weight of a needle …
        // In this form, the item has negligible Bulk … a +4 circumstance bonus to Stealth checks to hide it. You can Activate this ability again to
        // return the staff to its normal size". Activated: an Effect with PF2e's ItemAlteration on the staff (its Bulk 0, from 2) and the hiding
        // toggle; the toggle on, Stealth +4; activated again, the Effect gone and the staff's Bulk 2 again.
        async b4G6SunWukongNeedle(scene) {
            const { actor: user } = await h.creature(scene, "Sun Wukong Monk", { type: "character", x: 12, y: 2, level: 20 });
            const staff = await h.give(user, "Staff of Sun Wukong");
            const bulk = () => Number(user.items.get(staff.id)?.system?.bulk?.value);
            h.assert(bulk() === 2, `the staff's Bulk 2 to start (${bulk()})`);
            const form = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.itemForm === staff.id);
            const first = await activated(staff, 1, "item", "Close at Hand's card");
            await api().apply(first.id, { drinker: 0 });
            await h.until(() => form(), `the needle form's Effect (${effectNames(user)})`, { timeout: 8000 });
            await h.until(() => bulk() === 0 || user.items.get(staff.id)?.bulk?.isNegligible, `negligible Bulk (${bulk()})`, { timeout: 5000 });
            const rules = form().system.rules ?? [];
            h.assert(rules.some((rule) => rule.key === "ItemAlteration" && rule.itemId === staff.id && rule.property === "bulk") && rules.some((rule) => rule.key === "RollOption" && rule.toggleable && rule.option === "hiding-sun-wukong-staff"), `its ItemAlteration and hiding toggle (${JSON.stringify(rules)})`);
            const stealth = () => Number(user.skills.stealth.mod);
            const before = stealth();
            await user.toggleRollOption("all", "hiding-sun-wukong-staff", form().id, true);
            await h.until(() => stealth() === before + 4, `+4 to Stealth with the toggle on (${before} → ${stealth()})`, { timeout: 5000 });
            const again = await activated(staff, 1, "item", "Close at Hand's second card");
            await api().apply(again.id, { drinker: 0 });
            await h.until(() => !form() && bulk() === 2, `its own form again, Bulk 2 (${effectNames(user)}; ${bulk()})`, { timeout: 8000 });
            return { stealth: [before, before + 4], results: [resultsOf(first), resultsOf(again)] };
        },

        // The Courtesan (castBonus.rules, scripts/casts.js giveCastBonus): Illusory Disguise cast on its user at half its level (6th at least), and
        // its Effect for the hour with PF2e's rules — a toggle and "one degree of success better" to Impersonate with Deception against a
        // lower-level creature. A level-12 user: the spell module's cast at rank 6 on its token; the Effect for 1 hour; a Deception check to
        // Impersonate at DC 15 with a 10 on the die (an untrained 10, a failure) stays a failure with the toggle off, and is a success with it on.
        async b4G6CourtesanImpersonate(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Courtesan Card Holder", { type: "character", x: 12, y: 6, level: 12 });
            const courtesan = await h.give(user, "The Courtesan");
            await userToken.object?.control?.();
            try {
                const card = await activated(courtesan, 0, "cast", "the Courtesan's cast card");
                h.assert(stateOf(card).plan.spell?.name === "Illusory Disguise", `Illusory Disguise (${stateOf(card).plan.spell?.name})`);
                const since = Date.now();
                await api().apply(card.id, {});
                const cast = await castMessage(since);
                h.assert(cast.flags[SPELLS].castFromItem.rank === 6 && (cast.flags[SPELLS].castFromItem.targets ?? []).includes(userToken.uuid), `rank 6 on its user (${JSON.stringify(cast.flags[SPELLS].castFromItem)})`);
                const bonus = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.castBonus);
                await h.until(() => bonus(), `its Effect (${effectNames(user)})`, { timeout: 8000 });
                const rules = bonus().system.rules ?? [];
                h.assert(bonus().system.duration.value === 1 && bonus().system.duration.unit === "hours" && rules.some((rule) => rule.key === "AdjustDegreeOfSuccess" && [].concat(rule.predicate ?? []).includes("action:impersonate")), `an hour, a degree better to Impersonate (${JSON.stringify({ duration: bonus().system.duration, rules })})`);
                const impersonate = async () => {
                    const at = Date.now();
                    await h.withDie(10, () => user.skills.deception.roll({ dc: { value: 15 }, extraRollOptions: ["action:impersonate"], skipDialog: true }));
                    const roll = await h.messageAfter(at, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === user.id && (message.flags.pf2e.context.options ?? []).includes("action:impersonate"), { what: "the Impersonate check" });
                    return roll.flags.pf2e.context.outcome;
                };
                const off = await impersonate();
                h.assert(off === "failure", `a failure with the toggle off (${off})`);
                await user.toggleRollOption("all", "courtesan-lower-level", bonus().id, true);
                await h.until(() => Boolean(user.rollOptions?.all?.["courtesan-lower-level"]), "the toggle on", { timeout: 5000 });
                const on = await impersonate();
                h.assert(on === "success", `one degree better with it on (${on})`);
                return { off, on, results: resultsOf(card) };
            } finally {
                await closeWindows(/Illusory Disguise/);
            }
        },

        // The Vision (item.ruleEffects): "the next Lore check you attempt to Recall Knowledge … as if you had master proficiency in that Lore" —
        // PF2e's proficiency-type FlatModifier "@actor.level + 6" on lore-skill-check, removed after the roll it counts in. A level-5 user with
        // an untrained Warfare Lore: the Effect for a round; its Recall Knowledge with that Lore carries "The Vision (master)" at +11 (enabled,
        // beating its own 0), and the Effect is gone after.
        async b4G6VisionLore(scene) {
            const { actor: user } = await h.creature(scene, "Vision Card Holder", { type: "character", x: 12, y: 10, level: 5 });
            await user.createEmbeddedDocuments("Item", [{ name: "Warfare Lore", type: "lore", system: { proficient: { value: 0 }, mod: { value: 0 } } }]);
            await h.until(() => user.skills?.["warfare-lore"], "the Warfare Lore skill", { timeout: 5000 });
            const vision = await h.give(user, "The Vision");
            const card = await activated(vision, 0, "item", "the Vision's card");
            await api().apply(card.id, { drinker: 0 });
            const effect = () => user.itemTypes.effect.find((entry) => entry.flags?.[h.NS]?.ruleEffect === "The Vision");
            await h.until(() => effect(), `its Effect (${effectNames(user)})`, { timeout: 8000 });
            const rule = (effect().system.rules ?? []).find((entry) => entry.key === "FlatModifier" && entry.slug === "the-vision");
            h.assert(rule && rule.type === "proficiency" && rule.value === "@actor.level + 6" && rule.removeAfterRoll === "if-enabled", `a master's proficiency for its next Lore check (${JSON.stringify(rule)})`);
            const since = Date.now();
            await user.skills["warfare-lore"].roll({ skipDialog: true, extraRollOptions: ["action:recall-knowledge"] });
            const roll = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === user.id, { what: "the Lore check" });
            const modifier = (roll.flags.pf2e.modifiers ?? []).find((entry) => entry.slug === "the-vision");
            h.assert(modifier && Number(modifier.modifier) === 11 && modifier.enabled !== false, `+11 (level 5 + 6) in the roll (${JSON.stringify(roll.flags.pf2e.modifiers)})`);
            await h.until(() => !effect(), `the Effect gone after the roll (${effectNames(user)})`, { timeout: 8000 });
            return { modifier: modifier.modifier, total: roll.rolls?.[0]?.total ?? null };
        },

        // Grimoire of Unknown Necessities (plan.grantSpell, scripts/grimoire.js): "temporary knowledge of a single spell of the highest rank you're
        // capable of casting that you don't already have recorded …, chosen by the GM … it disappears at the start of the next day, along with
        // any copies." An arcane prepared caster whose highest slot is rank 7: a press not the GM's refused; Fireball (rank 3) refused; Maze of
        // Locked Doors (rank 7, remastered Maze) put in that entry, flagged. A scroll of it made before stays at the rest; one made since, and the
        // spell, are gone at its next rest (PF2e's pf2e.restForTheNight).
        async b4G6GrimoireSpellForDay(scene) {
            const { actor: user } = await h.creature(scene, "Grimoire Wizard", { type: "character", x: 12, y: 14, level: 13 });
            const [entry] = await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Arcane Prepared Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "prepared", flexible: false }, ability: { value: "int" }, proficiency: { value: 1 }, slots: { slot7: { max: 1, value: 1, prepared: [] } } } }]);
            const grimoire = await h.give(user, "Grimoire of Unknown Necessities");
            const row = (await game.packs.get("pf2e.spells-srd").getIndex()).find((spell) => spell.name === "Maze of Locked Doors");
            h.assert(row, "Maze of Locked Doors in PF2e's spells");
            const uuid = `Compendium.pf2e.spells-srd.Item.${row._id}`;
            const spellSource = (await fromUuid(uuid)).toObject();
            // (Its spell with an id of its own, as PF2e's scrolls have it: without one PF2e keeps no spell on the scroll.)
            const scroll = async (name) => (await user.createEmbeddedDocuments("Item", [{ name, type: "consumable", img: "icons/sundries/scrolls/scroll-bound-sealed-red.webp", system: { category: "scroll", quantity: 1, level: { value: 13 }, traits: { value: ["consumable", "magical", "scroll"], rarity: "common" }, spell: { ...spellSource, _id: foundry.utils.randomID(), _stats: { ...(spellSource._stats ?? {}), compendiumSource: uuid } } } }]))[0];
            const older = await scroll(`${h.PREFIX} Old Scroll of the Maze`);
            await h.wait(1500);
            const card = await activated(grimoire, 0, "grant-spell", "the grimoire's card");
            h.assert(stateOf(card).entry?.id === entry.id && stateOf(card).rank === 7, `its arcane prepared entry at rank 7 (${JSON.stringify({ entry: stateOf(card).entry, rank: stateOf(card).rank })})`);
            const notGM = await refusal(api().apply(card.id, { spell: "Maze of Locked Doors", gm: false }));
            h.assert(/the GM picks the spell it grants/.test(notGM ?? ""), `a press not the GM's refused (${notGM})`);
            const lower = await refusal(api().apply(card.id, { spell: "Fireball", gm: true }));
            h.assert(/Fireball is rank 3, not 7/.test(lower ?? ""), `a rank 3 spell refused (${lower})`);
            await api().apply(card.id, { spell: "Maze of Locked Doors", gm: true });
            const granted = () => user.itemTypes.spell.find((spell) => spell.flags?.[h.NS]?.grantedSpell && spell.name === "Maze of Locked Doors") ?? null;
            await h.until(() => granted(), `the spell in its spellbook (${user.itemTypes.spell.map((spell) => spell.name).join(", ")})`, { timeout: 8000 });
            h.assert(granted().system.location?.value === entry.id, `in that entry (${granted().system.location?.value})`);
            await h.wait(1500);
            const newer = await scroll(`${h.PREFIX} New Scroll of the Maze`);
            Hooks.callAll("pf2e.restForTheNight", user);
            await h.until(() => !granted() && !user.items.get(newer.id), `the spell and the scroll made since gone at the rest (${user.items.map((item) => item.name).join(", ")})`, { timeout: 8000 });
            h.assert(user.items.get(older.id), "the scroll made before the grant kept");
            return { refused: [notGM, lower], results: resultsOf(card) };
        },

        // Book of Lost Days' Study Memory (plan.unlessCondition, plan.alsoWhisper; the core's condition floor): "Requirements You aren't drained
        // … you view a memory … as if you had rolled a 40 on a check to Recall Knowledge … you become drained 2; this condition can't be reduced
        // by any means for 2 days". Drained 1: the activation refused, no card. Not drained: the GM and the user are whispered the 40's memory, and
        // the card applied gives Drained 2, the ability module's floor of 2 for 48 hours (lowered, it stays 2) and the lost day's note.
        async b4G6BookOfLostDays(scene) {
            const { actor: user } = await h.creature(scene, "Lost Days Reader", { type: "character", x: 16, y: 2, level: 15 });
            const book = await h.give(user, "Book of Lost Days");
            const drained = () => Number(user.getCondition("drained")?.value) || 0;
            await user.increaseCondition("drained", { value: 1 });
            await h.until(() => drained() === 1, "drained 1 first", { timeout: 5000 });
            let since = Date.now();
            const refused = await refusal(api().activate(book.uuid, 0));
            h.assert(/its user isn't drained, and .* is drained/.test(refused ?? ""), `refused while drained (${refused})`);
            await h.wait(500);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && message.getFlag(h.NS, "card")), "no card while drained");
            await user.decreaseCondition("drained", { forceRemove: true });
            await h.until(() => drained() === 0, "no longer drained", { timeout: 5000 });
            since = Date.now();
            const card = await activated(book, 0, "item", "Study Memory's card");
            const whisper = await h.messageAfter(since, (message) => message.flags?.[h.NS]?.whisper?.actorUuid === user.uuid, { what: "the memory's whisper" });
            h.assert(/total of 40 to Recall Knowledge/.test(textOf(whisper)) && (whisper.whisper ?? []).some((id) => game.users.get(id)?.isGM), `whispered to the GM (${textOf(whisper).slice(0, 200)})`);
            await api().apply(card.id, { drinker: 0 });
            const floor = () => user.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.conditionFloor?.slug === "drained") ?? null;
            const lost = () => user.itemTypes.effect.find((effect) => /a day lost/.test(effect.name)) ?? null;
            await h.until(() => drained() === 2 && floor() && lost(), `Drained 2, its floor and the lost day (${drained()}; ${effectNames(user)})`, { timeout: 10000 });
            h.assert(Number(floor().flags[ABILITY].conditionFloor.value) === 2 && floor().system.duration.value === 48 && floor().system.duration.unit === "hours", `a floor of 2 for 48 hours (${JSON.stringify({ floor: floor().flags[ABILITY].conditionFloor, duration: floor().system.duration })})`);
            await user.decreaseCondition("drained");
            await h.wait(800);
            await h.until(() => drained() === 2, `held at Drained 2 (${drained()})`, { timeout: 5000 });
            return { refused, results: resultsOf(card) };
        },

        // Stage Magician's Cloak's Now You See Me... (plan.userEffects: a condition, a note, and the new kind "remove"): "you are quickened for 1
        // round. You can use the extra action only to Interact, Strike, or Stride … you are no longer concealed, hidden, or undetected". A Hidden
        // wearer activates it: Quickened, the note of its extra action, Hidden gone; its save card at a creature within 10 feet is the ability
        // module's DC 30 Will. ...Now You Don't: Invisibility at rank 2 on its user, with the teleport card beside it (within 30 feet).
        async b4G6StageCloakVanish(scene) {
            const { actor: user } = await h.creature(scene, "Stage Magician", { type: "character", x: 16, y: 6, level: 13 });
            const { token: watcherToken } = await h.creature(scene, "Stage Magician Watcher", { x: 17, y: 6, alliance: "opposition" });
            const cloak = await h.give(user, "Stage Magician's Cloak");
            await cloak.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            await user.increaseCondition("hidden");
            await h.until(() => user.hasCondition("hidden"), "hidden first", { timeout: 5000 });
            const card = await activated(cloak, 0, "expose", "Now You See Me...'s save card");
            const note = () => user.itemTypes.effect.find((effect) => /its extra action/.test(effect.name)) ?? null;
            await h.until(() => user.hasCondition("quickened") && note() && !user.hasCondition("hidden"), `Quickened, its note, no longer Hidden (${user.itemTypes.condition.map((condition) => condition.slug).join(", ")}; ${effectNames(user)})`, { timeout: 8000 });
            h.assert(/only to Interact, Strike or Stride/.test(note().system.description?.value ?? ""), `the note's words (${note().system.description?.value})`);
            const since = Date.now();
            await api().apply(card.id, { targets: [watcherToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the smoke's save card" });
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && check.against?.value === 30, `a DC 30 Will save (${JSON.stringify(check)})`);
            // (...Now You Don't: its cast card and the teleport card beside it, not applied — the spell module's cast and the canvas pick.)
            const at = Date.now();
            await api().activate(cloak.uuid, 1);
            const cast = await h.messageAfter(at, h.itemCard("cast"), { what: "...Now You Don't's cast card" });
            const move = await h.messageAfter(at, h.itemCard("teleport"), { what: "its teleport card" });
            h.assert(stateOf(cast).plan.spell?.name === "Invisibility" && stateOf(cast).plan.rank === 2 && stateOf(cast).plan.self, `Invisibility at rank 2 on its user (${stateOf(cast).plan.spell?.name}, ${stateOf(cast).plan.rank})`);
            h.assert(Number(stateOf(move).plan.teleport?.within) === 30, `the teleport within 30 feet (${JSON.stringify(stateOf(move).plan.teleport)})`);
            return { check, teleport: stateOf(move).plan.teleport };
        },

        // Grail of Twisted Desires (plan.item.wine, scripts/grail.js): its ways card's wines; "Unless you are chaotic, the GM secretly rolls 1d6 …
        // On a 1 on the first use of a day … the wine is one of the other two types". A non-chaotic user picks ordinary wine with the secret d6 at
        // 1: the roll posted as a blind roll, the GM whispered "it's really restoration (the twist)", and the wine in the inventory looks the same.
        // Drunk, its cast card is the real kind's — Restoration at rank 2 on the drinker — and the spell module casts it.
        async b4G6GrailTwistedWine(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Grail Pourer", { type: "character", x: 16, y: 10, level: 10 });
            const grail = await h.give(user, "Grail of Twisted Desires");
            await userToken.object?.control?.();
            const wine = () => user.items.find((item) => item.flags?.[h.NS]?.wine) ?? null;
            try {
                const ways = await activated(grail, 0, "ways", "the grail's ways card");
                const ordinary = (stateOf(ways).plan.ways ?? []).findIndex((way) => way.name === "Ordinary wine");
                h.assert(ordinary === 0, `ordinary wine its first way (${(stateOf(ways).plan.ways ?? []).map((way) => way.name)})`);
                const since = Date.now();
                await withFace(6, 1, async () => {
                    await api().apply(ways.id, { choice: ordinary });
                    await h.until(() => wine(), "the wine in the inventory", { timeout: 8000 });
                });
                const secret = await h.messageAfter(since, (message) => /the secret roll/.test(message.flavor ?? ""), { what: "the secret d6" });
                h.assert(secret.blind || (secret.whisper ?? []).length || secret.messageMode === "blind", `a blind roll (${JSON.stringify({ blind: secret.blind, whisper: secret.whisper, mode: secret.messageMode })})`);
                const told = await h.messageAfter(since, (message) => /chose ordinary wine; it's really restoration \(the twist\)/.test(message.content ?? ""), { what: "the GM's whisper of the twist" });
                h.assert((told.whisper ?? []).length && (told.whisper ?? []).every((id) => game.users.get(id)?.isGM), "whispered to the GM alone");
                h.assert(wine().name === "Wine from the Grail of Twisted Desires" && wine().flags[h.NS].wine.kind === "restoration", `the wine's look, its real kind (${wine().name}: ${JSON.stringify(wine().flags[h.NS].wine)})`);
                const at = Date.now();
                await wine().consume();
                const card = await h.messageAfter(at, h.itemCard("cast"), { what: "the wine's cast card" });
                h.assert(stateOf(card).plan.spell?.name === "Restoration" && stateOf(card).plan.rank === 2, `Restoration at rank 2 (${stateOf(card).plan.spell?.name}, ${stateOf(card).plan.rank})`);
                await api().apply(card.id, { drinker: 0 });
                const cast = await castMessage(at);
                const flag = cast.flags[SPELLS].castFromItem;
                h.assert(flag.rank === 2 && (flag.targets ?? []).includes(userToken.uuid) && (/Restoration/.test(cast.flavor ?? "") || /Restoration/.test(cast.content ?? "") || cast.item?.name === "Restoration"), `Restoration cast at rank 2 on the drinker (${JSON.stringify(flag)})`);
                return { told: textOf(told), results: resultsOf(card) };
            } finally {
                await closeWindows(/Restoration/);
            }
        },

        // Ring of Bestial Friendship (its ways card; the immunity tracker's cast clause, scripts/immunity.js): "Charm (4th rank) on an animal or
        // beast within 30 feet … it's immune to the ring's charm from that point on" and "If the charm fails or ends … enraged … +1 item bonus".
        // Charm at PF2e's Wolf: its user's bond note as the way is used, the spell module's cast, and the wolf's "Immune:" Effect (a hundred
        // years); a second Charm at it refused ("still immune"). The rage way at the wolf: its note Effect with PF2e's toggle on and +1 item to
        // its skill checks (its Athletics 1 higher) for the hour.
        async b4G6RingBestialCharm(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Bestial Ring Wearer", { type: "character", x: 16, y: 14, level: 9 });
            const { actor: wolf, token: wolfToken } = await fixtureFrom(scene, WOLF, "Bestial Ring Wolf", { x: 18, y: 14 });
            const ring = await h.give(user, "Ring of Bestial Friendship");
            await ring.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            await userToken.object?.control?.();
            const immune = () => wolf.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "ring-of-bestial-friendship") ?? null;
            try {
                const ways = await activated(ring, 0, "ways", "the ring's ways card");
                const charm = await wayCard(ways, 0, "cast", "Charm's cast card");
                const bond = () => user.itemTypes.effect.find((effect) => /bond/i.test(effect.name)) ?? null;
                await h.until(() => bond(), `its user's bond note (${effectNames(user)})`, { timeout: 8000 });
                let since = Date.now();
                await api().apply(charm.id, { targets: [wolfToken.uuid] });
                const cast = await castMessage(since);
                h.assert(cast.flags[SPELLS].castFromItem.rank === 4 && (cast.flags[SPELLS].castFromItem.targets ?? []).includes(wolfToken.uuid), `Charm at rank 4 at the wolf (${JSON.stringify(cast.flags[SPELLS].castFromItem)})`);
                await h.until(() => immune(), `the wolf's Immune: Effect (${effectNames(wolf)})`, { timeout: 8000 });
                h.assert(immune().system.duration.value === 36500 && immune().system.duration.unit === "days", `for a hundred years (${JSON.stringify(immune().system.duration)})`);
                const again = await wayCard(ways, 0, "cast", "the second Charm's cast card");
                since = Date.now();
                const refused = await refusal(api().apply(again.id, { targets: [wolfToken.uuid] }));
                h.assert(/still immune/.test(refused ?? ""), `the second Charm refused (${refused})`);
                await h.wait(500);
                h.assert(stateOf(again).status === "open" && !game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && message.flags?.[SPELLS]?.castFromItem), "nothing cast");
                // (The rage: its note Effect on the wolf, its toggle on.)
                const athletics = () => Number(wolf.skills?.athletics?.mod);
                const before = athletics();
                const rage = await wayCard(ways, 1, "item", "the rage's card");
                await api().apply(rage.id, { targets: [wolfToken.uuid] });
                const enraged = () => wolf.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "enraged-at-ring-wearer")) ?? null;
                await h.until(() => enraged(), `the wolf's rage Effect (${effectNames(wolf)})`, { timeout: 8000 });
                h.assert(enraged().system.duration.value === 1 && enraged().system.duration.unit === "hours", `for the hour (${JSON.stringify(enraged().system.duration)})`);
                await h.until(() => Boolean(wolf.rollOptions?.all?.["enraged-at-ring-wearer"]) && athletics() === before + 1, `its toggle on, +1 item to its Athletics (${before} → ${athletics()})`, { timeout: 5000 });
                return { refused, athletics: [before, athletics()] };
            } finally {
                await closeWindows(/Charm/);
            }
        },

        // Vile Remnant's Hear My Words (castBonus with no rules, userEffects' note, plan.item.afterRest, scripts/after-rest.js): Enthrall (DC 23)
        // at the creature targeted, which gets the remnant's note Effect for its time; its user's 7-day note of the price; "the next time you
        // sleep … a DC 23 Will save upon waking to avoid becoming stupefied 1 for 24 hours": kept on the user, and at its next rest (PF2e's
        // pf2e.restForTheNight) the ability module's DC 23 Will card at it — applied at a 10, Stupefied 1.
        async b4G6VileRemnantNightmares(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Vile Remnant Speaker", { type: "character", x: 16, y: 17, level: 7 });
            const { actor: listener, token: listenerToken } = await h.creature(scene, "Vile Remnant Listener", { x: 18, y: 17, alliance: "opposition" });
            const remnant = await h.give(user, "Vile Remnant");
            await userToken.object?.control?.();
            try {
                const card = await activated(remnant, 0, "cast", "Hear My Words' cast card");
                const price = () => user.itemTypes.effect.find((effect) => /its price/.test(effect.name)) ?? null;
                await h.until(() => price() && (user.getFlag(h.NS, "afterRest") ?? []).length === 1, `the 7-day note and the save kept for the rest (${effectNames(user)}; ${JSON.stringify(user.getFlag(h.NS, "afterRest"))})`, { timeout: 8000 });
                h.assert(price().system.duration.value === 7 && price().system.duration.unit === "days", `7 days (${JSON.stringify(price().system.duration)})`);
                let since = Date.now();
                await api().apply(card.id, { targets: [listenerToken.uuid] });
                const cast = await castMessage(since);
                h.assert(cast.flags[SPELLS].castFromItem.dc === 23 && (cast.flags[SPELLS].castFromItem.targets ?? []).includes(listenerToken.uuid), `Enthrall at DC 23 at the listener (${JSON.stringify(cast.flags[SPELLS].castFromItem)})`);
                const commonplace = () => listener.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.castBonus) ?? null;
                await h.until(() => commonplace(), `the listener's note Effect (${effectNames(listener)})`, { timeout: 8000 });
                h.assert(/commonplace/.test(commonplace().name + (commonplace().system.description?.value ?? "")) && commonplace().system.duration.value === 10 && commonplace().system.duration.unit === "minutes", `its words, for Enthrall's time (${commonplace().name}; ${JSON.stringify(commonplace().system.duration)})`);
                since = Date.now();
                Hooks.callAll("pf2e.restForTheNight", user);
                const nightmares = await cardAt(since, user, "the nightmares' Will card");
                const check = abilityState(nightmares).plan.resolution.check;
                h.assert(check.statistic === "will" && check.against?.value === 23, `a DC 23 Will save (${JSON.stringify(check)})`);
                await h.until(() => !(user.getFlag(h.NS, "afterRest") ?? []).length, "the kept save gone once posted", { timeout: 5000 });
                await h.withDie(10, () => h.rollAndApply(nightmares));
                await h.until(() => Number(user.getCondition("stupefied")?.value) === 1, `Stupefied 1 (${user.getCondition("stupefied")?.value ?? "none"})`, { timeout: 10000 });
                return { check, results: resultsOf(card) };
            } finally {
                await closeWindows(/Enthrall/);
            }
        },

        // Deck of Many Things (plan.deck, scripts/deck.js): "You declare how many cards you will draw … then draw your first card. … Any further
        // cards must be drawn within the next hour, and any card you don't voluntarily draw flits off the deck and affects you anyway. You can
        // never activate the same deck of many things again." PF2e's own 1d22 table, its rows forced: 2 declared, the Fool drawn — its choice;
        // "Draw two more cards" picked, the Sun drawn at once (+1,000 XP); the world's clock an hour on, the other two drawn anyway (two more
        // Suns, 3,000 XP in all), the card done. Activated again by the same user: "… can never activate this deck again." Another drawer's
        // Talons waits for the GM's press (a press not the GM's refused), then takes its magic items — its potion — but not the deck or its rope.
        async b4G6DeckOfManyThings(scene) {
            const { actor: user } = await h.creature(scene, "Deck Drawer", { type: "character", x: 8, y: 16, level: 12 });
            const { actor: other } = await h.creature(scene, "Deck Talons Drawer", { type: "character", x: 10, y: 16, level: 12 });
            const deck = await h.give(user, "Deck of Many Things");
            const xp = () => Number(user.system.details?.xp?.value) || 0;
            h.assert(xp() === 0, `no XP to start (${xp()})`);
            const card = await activated(deck, 0, "deck", "the deck's card");
            h.assert(stateOf(card).step === "declare" && stateOf(card).status === "open", `its declare step (${stateOf(card).step})`);
            // (Fool: row 8; Sun: row 18; Talons: row 19.)
            await withFace(22, 8, () => api().apply(card.id, { count: 2 }));
            await h.until(() => stateOf(card).step === "choice" && stateOf(card).choice === "Fool", `the Fool's choice waits (${JSON.stringify({ step: stateOf(card).step, drawn: stateOf(card).drawn })})`, { timeout: 8000 });
            h.assert(stateOf(card).declared === 2 && Number(stateOf(card).deadline) === Number(game.time.worldTime) + 3600, `2 declared, the hour's deadline (${stateOf(card).declared}, ${stateOf(card).deadline})`);
            await withFace(22, 18, () => api().apply(card.id, { choice: 1 }));
            await h.until(() => (stateOf(card).drawn ?? []).join(",") === "Fool,Sun" && xp() === 1000, `two more chosen, the Sun drawn at once (${JSON.stringify(stateOf(card).drawn)}; ${xp()} XP)`, { timeout: 8000 });
            h.assert(stateOf(card).status === "open" && stateOf(card).step === "draw", `two still to draw (${stateOf(card).status}, ${stateOf(card).step})`);
            await withFace(22, 18, async () => {
                await game.time.advance(3601);
                await h.until(() => (stateOf(card).drawn ?? []).length === 4, `the hour up: the rest drawn anyway (${JSON.stringify(stateOf(card).drawn)})`, { timeout: 12000 });
            });
            await h.until(() => stateOf(card).status === "applied" && xp() === 3000, `done, 3,000 XP (${stateOf(card).status}; ${xp()})`, { timeout: 8000 });
            const again = await activated(deck, 0, "deck", "the deck's second card");
            h.assert(stateOf(again).status === "applied" && (stateOf(again).results ?? []).some((line) => /can never activate this deck again/.test(line)), `never again for the same user (${JSON.stringify(stateOf(again).results)})`);
            // (Talons: the GM's press.)
            const otherDeck = await h.give(other, "Deck of Many Things");
            const potion = await h.give(other, "Healing Potion (Minor)");
            const rope = await h.give(other, "Rope");
            const talons = await activated(otherDeck, 0, "deck", "the other drawer's deck card");
            await withFace(22, 19, () => api().apply(talons.id, { count: 1 }));
            await h.until(() => stateOf(talons).step === "lose" && (stateOf(talons).drawn ?? [])[0] === "Talons", `Talons drawn, its loss waiting (${JSON.stringify({ step: stateOf(talons).step, drawn: stateOf(talons).drawn })})`, { timeout: 8000 });
            const refused = await refusal(api().apply(talons.id, { gm: false }));
            h.assert(/the GM removes what it loses/.test(refused ?? "") && other.items.get(potion.id), `a press not the GM's refused (${refused})`);
            await api().apply(talons.id, { gm: true });
            await h.until(() => !other.items.get(potion.id), "its magic potion gone", { timeout: 8000 });
            h.assert(other.items.get(otherDeck.id) && other.items.get(rope.id) && stateOf(talons).status === "applied", `the deck and the rope kept, the card done (${other.items.map((item) => item.name).join(", ")}; ${stateOf(talons).status})`);
            return { drawn: stateOf(card).drawn, xp: xp(), results: [resultsOf(card), resultsOf(talons)] };
        },
    };
};
