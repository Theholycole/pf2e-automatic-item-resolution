// The fourth batch's fifth group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// (docs/mechanics.md "Unique items and artifacts, every rule built (2026-10-27, group b4-5)", the merge 65b5cac. Only the items whose live play is
// new code have a case here: scripts/paused-item.js, scripts/ends-on-hostile.js "targeted" with src/live/targeted.js, if-target.js named,
// scaled.js withNearbyDC/withTargetDC/withAttackModifiers with foundry.js itemsNear, poison-card.js ownCheck.itemBonus and poisons.js
// thenSave.maxTargets, scripts/mark-ends.js, ways.js way.frequency and way.refund, the own-check card (plan.ownSave), focus.js overMax with
// "next-turn-end", revive.js hp "max"/keepPools, live.js postWhisper flat and secret, fortune.js bonus.rules/bonus.after, zones.js checkAttitude,
// item.space, scripts/doom-hex.js, scripts/possession.js, item.store with activations.js storeFull, userEffects kind "note", scripts/lifedrink.js;
// and Slithermaw's Bane's terrain, whose ChoiceSet Effect and environment bonus no case has seen. The group's other asked-for checks feed
// mechanisms already checked live, or another case here covers them: The Owl's and Void Mirror's Become the Void's own checks (Passage Pane's
// case), Spiral Athame's ward (the ability module's zone on its holder with rules inside and a save for one trait on entering), Piereta's
// Retributive Strike (the fortune card's readied resistance against the triggering damage, for a targeted ally), Spectacles of Discernment's
// mark (item.mark), Hunter's Dawn's ghost touch (waiting on the ability module).)

const ABILITY = "pf2e-automatic-ability-resolution";
// (tools/live-check.mjs's flag on its own fixtures, here for this file's encounters: its cleanup removes only those.)
const FIXTURE = "liveCheckFixture";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const cardFor = (cards, actor) => cards.find((message) => (abilityState(message)?.targets ?? []).some((target) => target.actorUuid === actor.uuid));
    const effectNames = (actor) => (actor?.itemTypes?.effect ?? []).map((effect) => effect.name).join(", ") || "none";
    const conditions = (actor) => (actor?.itemTypes?.condition ?? []).map((condition) => `${condition.slug}${condition.value ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const hpOf = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    // (A card's words, its HTML's escapes undone.)
    const textOf = (message) => {
        const div = document.createElement("div");
        div.innerHTML = String(game.messages.get(message.id)?.content ?? message.content ?? "");
        return div.textContent.replace(/\s+/g, " ").trim();
    };
    const wordsOf = (message) => `${String(message.flavor ?? "")} ${String(message.content ?? "")}`;
    const gmIds = () => game.users.filter((user) => user.isGM).map((user) => user.id);
    // (A bare character has 0 maximum Hit Points and PF2e then takes no damage nor healing on it: an Effect gives it some, its Hit Points set.)
    const hitPoints = async (actor, max, value = max) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: max }], duration: UNLIMITED } }]);
        await h.until(() => actor.system.attributes.hp.max >= max, `${max} maximum Hit Points on ${actor.name}`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": value });
        await h.until(() => hpOf(actor) === value, `${actor.name} at ${value} Hit Points`, { timeout: 5000 });
    };
    // (A statistic raised by an Effect of the check's own, so a roll's degree is known.)
    const boost = async (actor, selector, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${selector} +${value}`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "FlatModifier", selector, value }], duration: UNLIMITED } }]);
        await h.wait(300);
    };
    // (An Effect of PF2e's rules of the case's own: a class DC, a pool's maximum.)
    const ruled = async (actor, name, rules) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${name}`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules, duration: UNLIMITED } }]);
        await h.wait(300);
    };
    // (A statistic's check modifier with these roll options too: PF2e's own statistic.)
    const modWith = (actor, slug, options = []) => {
        const statistic = actor.getStatistic?.(slug);
        const withOptions = statistic?.withRollOptions?.({ extraRollOptions: options }) ?? statistic?.clone?.({ rollOptions: options }) ?? statistic;
        return Number(withOptions?.check?.mod ?? withOptions?.mod);
    };
    // (A permanent item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };
    // (A ways card's way, by its name.)
    const wayOf = (ways, pattern) => {
        const names = stateOf(ways).plan.ways.map((way) => way.name);
        const index = names.findIndex((name) => pattern.test(name));
        h.assert(index >= 0, `a way ${pattern} (${names.join(" / ")})`);
        return index;
    };
    // (The squares around one, for h.clearSquares: a conjured creature goes in the first free ring around its maker.)
    const around = (x, y, reach = 2) => {
        const squares = [];
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (x + dx >= 0 && y + dy >= 0 && x + dx < 20 && y + dy < 20) squares.push([x + dx, y + dy]);
        return squares;
    };
    // (The ability module's conjured tokens an item made — its flag conjured { itemUuid } — on the lab, and this case's own cleanup of them and
    // their world actors: the runner's cleanup doesn't know them, as they carry the bestiary's flags, not this check's fixture flag.)
    const conjuredBy = (scene, itemUuid) => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemUuid === itemUuid);
    async function dismissConjured(scene, itemUuid) {
        const tokens = conjuredBy(scene, itemUuid);
        if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens.map((token) => token.id)).catch(() => null);
        const actors = game.actors.filter((actor) => actor.flags?.[ABILITY]?.conjured?.itemUuid === itemUuid);
        if (actors.length) await Actor.deleteDocuments(actors.map((actor) => actor.id)).catch(() => null);
    }
    const conjureCardFor = (since, actorId) => h.messageAfter(since, (message) => (message.flags?.[ABILITY]?.conjureCard?.actorIds ?? []).includes(actorId), { what: "the conjure card", timeout: 10000 });
    // (A DialogV2 of that title holding the creature list, scripts/creature-pick.js — found without its rendered flag: in a hidden pane a frame
    // may never be drawn.)
    async function pickDialog(title, { timeout = 20000 } = {}) {
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            const app = [...foundry.applications.instances.values()].find((entry) => entry.constructor.name === "DialogV2" && entry.title === title && entry.element?.querySelector?.("select[name=creature]"));
            if (app) return app;
            await h.wait(150);
        }
        throw new Error(`No "${title}" creature pick within ${timeout / 1000} seconds.`);
    }
    // (PF2e's ChoiceSet prompt open now — its PickAThingPrompt, not looked for by its rendered flag (a hidden pane never draws it): answered
    // with the first of the values wanted it offers, as a click on it does. → the value picked, or null with none open.)
    const promptOpen = () => [...foundry.applications.instances.values()].find((app) => Array.isArray(app.choices) && typeof app.resolveSelection === "function" && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    async function answerPrompt(prefer = []) {
        const app = promptOpen();
        if (!app) return null;
        const choice = prefer.map((value) => app.choices.find((entry) => entry?.value === value)).find(Boolean) ?? app.choices[0] ?? null;
        app.selection = choice;
        await app.close();
        return String(choice?.value ?? "(none)");
    }
    // (An encounter of the case's own, flagged as this check's fixture, started; and its turns moved on to a creature's.)
    async function encounter(scene, entries) {
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        await combat.createEmbeddedDocuments("Combatant", entries.map(({ token, actor, initiative }) => ({ tokenId: token.id, sceneId: scene.id, actorId: actor.id, initiative })));
        await combat.startCombat();
        await h.wait(800);
        return combat;
    }
    const turnOf = async (combat, actor) => {
        await combat.nextTurn();
        await h.until(() => combat.combatant?.actorId === actor.id, `${actor.name}'s turn (round ${combat.round})`, { timeout: 5000 });
        await h.wait(800);
    };

    return {
        // Horns of Naraga's second activation (src/compiler/creature-readings.js plan.pauseItem; scripts/zones.js startItemConjure → scripts/paused-
        // item.js pauseItem and its deleteActor hook, src/live/conjured.js pausedAfter): the helm becomes the ancient black dragon Naraga, and
        // while it's transformed its wearer gets none of its other benefits. A non-undead character wearing and invested
        // in the helm has its acid immunity (PF2e's rule on it). Activated: Naraga (PF2e's Black Dragon (Ancient)) beside its user; the helm
        // uninvested, its flag pausedFor naming her actor and that it was invested, the acid immunity gone, a whisper saying so. Her conjure
        // card's Dismiss: her actor gone, the helm invested again (the flag gone, the immunity back), whispered "back as it was, invested again".
        // (Out of an encounter: her own initiative, the ability module's, isn't this case's.)
        async b4G5NaragaPausedHelm(scene) {
            await h.clearSquares(scene, around(8, 8, 4));
            const { actor: user, token: userToken } = await h.creature(scene, "Naraga Helm Wearer", { type: "character", x: 8, y: 8, level: 20 });
            const helm = await h.give(user, "Horns of Naraga");
            await helm.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            const acid = () => (user.attributes?.immunities ?? user.system?.attributes?.immunities ?? []).some((entry) => entry.type === "acid");
            const invested = () => user.items.get(helm.id)?.system?.equipped?.invested === true;
            await h.until(acid, `the helm's acid immunity while it's invested (${JSON.stringify((user.system.attributes.immunities ?? []).map((entry) => entry.type))})`, { timeout: 5000 });
            await h.until(() => userToken.object, "the wearer's token drawn", { timeout: 5000 });
            const made = () => conjuredBy(scene, helm.uuid);
            try {
                let since = Date.now();
                await live().activate(helm.uuid, 1);
                await h.until(() => made().length === 1, `Naraga's token (${made().map((token) => token.name).join(", ") || "none"})`, { timeout: 15000 });
                const naraga = made()[0];
                const actorId = naraga.actorId;
                h.assert(/Naraga/.test(naraga.name) && (naraga.actor?.system?.traits?.value ?? []).includes("dragon"), `Naraga, a dragon (${naraga.name}: ${(naraga.actor?.system?.traits?.value ?? []).join(", ")})`);
                await h.until(() => !invested(), "the helm uninvested while she's out", { timeout: 8000 });
                const paused = user.items.get(helm.id).getFlag(h.NS, "pausedFor");
                h.assert(paused?.actorIds?.includes(actorId) && paused.invested === true, `its pausedFor flag naming her, invested before (${JSON.stringify(paused)})`);
                await h.until(() => !acid(), "the helm's acid immunity gone meanwhile", { timeout: 5000 });
                const told = await h.messageAfter(since, (message) => /transformed, it gives none of its other benefits/.test(message.content ?? ""), { what: "the whisper that the helm is paused" });
                h.assert((told.whisper ?? []).length > 0, "whispered");
                const card = await conjureCardFor(since, actorId);
                since = Date.now();
                // (Its Dismiss button, the GM's; the ability module's own endConjured, as the button calls it, if the chat log isn't drawn.)
                let button = null;
                for (const stop = Date.now() + 5000; Date.now() < stop && !button; ) {
                    button = document.querySelector(`[data-message-id="${card.id}"] button[data-conjure-end]`);
                    if (!button) await h.wait(200);
                }
                if (button) button.click();
                else await (await import(`/modules/${ABILITY}/scripts/conjure.js`)).endConjured([actorId]);
                await h.until(() => !game.actors.get(actorId), "Naraga's actor gone, dismissed", { timeout: 10000 });
                await h.until(invested, "the helm invested again", { timeout: 8000 });
                h.assert(!user.items.get(helm.id).getFlag(h.NS, "pausedFor"), `its pausedFor flag gone (${JSON.stringify(user.items.get(helm.id).getFlag(h.NS, "pausedFor"))})`);
                await h.until(acid, "the acid immunity back", { timeout: 5000 });
                await h.messageAfter(since, (message) => /back as it was, invested again/.test(message.content ?? ""), { what: "the whisper that it's back" });
                return { naraga: naraga.name, button: Boolean(button), paused };
            } finally {
                await dismissConjured(scene, helm.uuid);
            }
        },

        // Flawed Orb of Gold Dragonkind (src/compiler/hostile-ends.js; scripts/foundry.js itemsNear with src/live/scaled.js withNearbyDC; src/live/if-
        // target.js named and lacks; scripts/ends-on-hostile.js "targeted" with src/live/targeted.js): a dragon's Will save at DC 30, 1 more for
        // each orb shard near, gold dragons at −4; its stuns end once anything but the orb acts against the dragon. Its user 15 feet from an ally carrying an Orb Shard: the
        // card's DC 31. At a gold dragon (by its name, the dragon trait) and an ogre: one Will card, the dragon's, with the −4 circumstance, the
        // ogre immune by kind. A 10 on the die (+27 −4: 33 against DC 31, a success): its "Stunned 3" note Effect (RollOption
        // air-ends-on:targeted) and PF2e's Stunned 3. The ally's Strike at the dragon: the Effect and the Stunned gone, the chat line saying so.
        // Used again with the same success, its Stunned then spent (PF2e's condition deleted, as losing its last stunned action does): the
        // Effect gone with it, as the card's own words say ("this Effect goes once the stun's spent").
        async b4G5OrbStunEndsOnAttack(scene) {
            await h.clearSquares(scene, [[2, 12], [5, 12], [7, 12], [7, 14]]);
            const { actor: user } = await h.creature(scene, "Orb Wielder", { type: "character", x: 2, y: 12, level: 20 });
            const { actor: bearer } = await h.creature(scene, "Orb Shard Bearer", { type: "character", x: 5, y: 12, level: 20 });
            const { actor: dragon, token: dragonToken } = await h.creature(scene, "Gold Dragon (Ancient)", { x: 7, y: 12, hp: 300, save: 27, level: 19, alliance: "opposition" });
            const { actor: ogre, token: ogreToken } = await h.creature(scene, "Orb Ogre", { x: 7, y: 14, hp: 100, alliance: "opposition" });
            await dragon.update({ "system.traits.value": ["dragon", "fire"] });
            await ogre.update({ "system.traits.value": ["giant", "humanoid"] });
            const orb = await h.give(user, "Flawed Orb of Gold Dragonkind");
            await orb.update(held(1));
            await h.give(bearer, "Orb Shard");
            const sword = await h.give(bearer, "Longsword");
            await sword.update(held(1));
            await h.until(() => (bearer.system.actions ?? []).some((action) => action.item?.id === sword.id), "the bearer's Strike with its longsword", { timeout: 5000 });
            let since = Date.now();
            await live().activate(orb.uuid, 0);
            const expose = await h.messageAfter(since, h.itemCard("expose"), { what: "the orb's save card" });
            const dc = Number(stateOf(expose).plan.resolution.check.against?.value);
            h.assert(dc === 31, `DC 31: 30 and the one Orb Shard within 60 feet (${dc})`);
            since = Date.now();
            await live().apply(expose.id, { targets: [dragonToken.uuid, ogreToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the dragon's Will save card" });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            h.assert(cards.length === 1 && cardFor(cards, dragon) && !cardFor(cards, ogre), `one card, the dragon's (${cards.length})`);
            h.assert(resultsOf(expose).some((line) => /Orb Ogre: immune/.test(line)), `the ogre immune by kind (${JSON.stringify(resultsOf(expose))})`);
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && Number(check.against?.value) === 31 && Number(check.bonus?.value) === -4 && check.bonus?.type === "circumstance", `Will DC 31 with −4 circumstance for a gold dragon (${JSON.stringify(check)})`);
            since = Date.now();
            // (A 10: +27 −4 is 33 against DC 31, a success.)
            await h.withDie(10, () => h.rollAndApply(save));
            const roll = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === dragon.id, { what: "PF2e's Will save" });
            const penalty = (roll.flags.pf2e.modifiers ?? []).some((modifier) => Number(modifier.modifier) === -4 && modifier.type === "circumstance" && modifier.enabled !== false);
            h.assert(penalty && Number(roll.flags.pf2e.context.dc?.value) === 31, `the −4 circumstance on its save at DC 31 (${JSON.stringify((roll.flags.pf2e.modifiers ?? []).map((modifier) => [modifier.label, modifier.modifier, modifier.type]))}; DC ${roll.flags.pf2e.context.dc?.value})`);
            const stun = () => dragon.itemTypes.effect.find((effect) => /: Stunned 3$/.test(effect.name) && (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-ends-on:targeted"));
            await h.until(() => stun() && Number(dragon.getCondition?.("stunned")?.value) === 3, `its "Stunned 3" Effect and Stunned 3 (${effectNames(dragon)}; ${conditions(dragon)})`, { timeout: 10000 });
            since = Date.now();
            try {
                await h.target(dragonToken);
                await h.strike(bearer, sword);
            } finally {
                await h.target();
            }
            await h.until(() => !stun() && !dragon.hasCondition("stunned"), `the stun ended by the attack (${effectNames(dragon)}; ${conditions(dragon)})`, { timeout: 8000 });
            const line = await h.messageAfter(since, (message) => /ends:/.test(message.content ?? "") && /subject to a hostile act/.test(message.content ?? ""), { what: "the chat line that the stun ends" });
            // (Again, its stun spent this time.)
            since = Date.now();
            await live().activate(orb.uuid, 0);
            const again = await h.messageAfter(since, h.itemCard("expose"), { what: "the orb's second save card" });
            since = Date.now();
            await live().apply(again.id, { targets: [dragonToken.uuid] });
            const second = await h.messageAfter(since, h.abilitySaveCard, { what: "the dragon's second Will save card" });
            await h.withDie(10, () => h.rollAndApply(second));
            await h.until(() => stun() && Number(dragon.getCondition?.("stunned")?.value) === 3, `Stunned 3 again (${effectNames(dragon)}; ${conditions(dragon)})`, { timeout: 10000 });
            await dragon.decreaseCondition("stunned", { forceRemove: true });
            await h.until(() => !dragon.hasCondition("stunned"), `its Stunned spent (${conditions(dragon)})`, { timeout: 5000 });
            const granted = (stun()?.system?.rules ?? []).find((rule) => rule.key === "GrantItem");
            await h.until(() => !stun(), `the "Stunned 3" Effect gone with its spent stun (${effectNames(dragon)}; its GrantItem's onDeleteActions ${JSON.stringify(granted?.onDeleteActions ?? null)})`, { timeout: 5000 });
            return { dc, save: roll.rolls?.[0]?.total, outcome: roll.flags.pf2e.context.outcome, ended: textOf(line) };
        },

        // Hunter's Dawn's javelin (src/compiler/special-sentences.js; src/live/poison-card.js withAttackChoice ownCheck.itemBonus, scripts/poisons.js
        // thenSave.maxTargets): a conjured javelin thrown for one to three actions with the club's +3, then its gazelle spirit's 2d6 piercing at
        // as many creatures as actions spent, near the one hit. Its ways card's "2 actions" way: the card's thrown attack (its user's simple
        // weapon proficiency and Dexterity) at one creature within 60 feet; the ability module's attack card at it with that modifier +3 (item).
        // The card stays open for its second step: three creatures targeted, refused ("up to 2"); two, the gazelles' card at those two, 2d6 (and
        // its user's Strength) piercing, and the card closes.
        async b4G5HuntersJavelinGazelles(scene) {
            await h.clearSquares(scene, [[2, 16], [6, 16], [8, 16], [10, 16]]);
            const { actor: user } = await h.creature(scene, "Dawn Hunter", { type: "character", x: 2, y: 16, level: 20 });
            const foes = [];
            for (const [index, x] of [6, 8, 10].entries()) foes.push(await h.creature(scene, `Dawn Quarry ${index + 1}`, { x, y: 16, hp: 200, alliance: "opposition" }));
            const club = await h.give(user, "Hunter's Dawn");
            await club.update(held(1));
            const ways = await activated(club, 0, "ways", "the javelin's ways card");
            const two = wayOf(ways, /^2 actions/);
            let since = Date.now();
            await live().apply(ways.id, { choice: two });
            const expose = await h.messageAfter(since, h.itemCard("expose"), { what: "the javelin's attack card" });
            const choices = stateOf(expose).attackChoices ?? [];
            h.assert(choices.length && choices[0].kind === "thrown" && Number.isFinite(Number(choices[0].modifier)), `its user's thrown attack offered (${JSON.stringify(choices)})`);
            since = Date.now();
            await live().apply(expose.id, { targets: [foes[0].token.uuid] });
            const attack = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's attack card" });
            const check = abilityState(attack).plan.resolution.check;
            h.assert(Number(check.modifier) === Number(choices[0].modifier) + 3 && /\+3 item/.test(String(check.statistic)), `its thrown attack +${choices[0].modifier} and the club's +3 item (${JSON.stringify(check)})`);
            h.assert(cardFor([attack], foes[0].actor), "at the creature targeted");
            h.assert(stateOf(expose).status === "open" && stateOf(expose).step === "then", `open for its second step (${stateOf(expose).status}, ${stateOf(expose).step})`);
            const refused = await errorOf(live().apply(expose.id, { targets: foes.map((foe) => foe.token.uuid) }));
            h.assert(/target up to 2 creatures for its second step/.test(refused ?? ""), `three refused for two actions (${refused})`);
            since = Date.now();
            await live().apply(expose.id, { targets: [foes[1].token.uuid, foes[2].token.uuid] });
            const gazelles = await h.messageAfter(since, h.abilitySaveCard, { what: "the gazelles' card" });
            const state = abilityState(gazelles);
            const [component] = state.plan.resolution.sharedDamage?.components ?? [];
            h.assert(state.targets.length === 2 && cardFor([gazelles], foes[1].actor) && cardFor([gazelles], foes[2].actor), `at the two targeted (${state.targets.map((target) => target.name).join(", ")})`);
            h.assert(/^2d6/.test(String(component?.formula ?? "")) && component?.type === "piercing", `2d6 piercing, its user's Strength on it (${JSON.stringify(component)})`);
            h.assert(stateOf(expose).status === "applied", `closed after the second step (${stateOf(expose).status})`);
            return { attack: check.modifier, statistic: check.statistic, refused, gazelles: component?.formula };
        },

        // Hunter's Dawn's reaction (mark.endsOnDeath → scripts/mark-ends.js, src/live/card.js marksEndingAt; way.frequency → scripts/ways.js
        // countWay): the creature hit stays marked until it dies (or another is marked), and the club casts a 5th-rank Locate at it once a day.
        // Its ways card's "Mark the creature hit": the item card at one creature gives its user a TokenMark Effect at its
        // token (flag markEndsOnDeath); that creature brought to 0 Hit Points (PF2e counts it dead), the mark is deleted and the chat says so.
        // Its Locate way used twice the same day: the cast card each time, and the GM's whisper the second time ("used again, though it's once
        // per day").
        async b4G5HuntersMarkDeathLocate(scene) {
            await h.clearSquares(scene, [[2, 19], [6, 19]]);
            const { actor: user } = await h.creature(scene, "Dawn Marker", { type: "character", x: 2, y: 19, level: 20 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Dawn Prey", { x: 6, y: 19, hp: 60, alliance: "opposition" });
            const club = await h.give(user, "Hunter's Dawn");
            await club.update(held(1));
            const ways = await activated(club, 1, "ways", "the reaction's ways card");
            const markWay = wayOf(ways, /^Mark the creature hit/);
            const locate = wayOf(ways, /Locate/);
            let since = Date.now();
            await live().apply(ways.id, { choice: markWay });
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the mark's item card" });
            await live().apply(card.id, { targets: [foeToken.uuid] });
            const mark = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.mark === "hunters-dawn-mark");
            await h.until(mark, `the mark Effect on its user (${effectNames(user)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const rules = mark().system.rules ?? [];
            h.assert(mark().flags[h.NS].markEndsOnDeath === true && rules.some((rule) => rule.key === "TokenMark" && rule.uuid === foeToken.uuid), `a TokenMark at the creature, ending as it dies (${JSON.stringify(rules)}; ${JSON.stringify(mark().flags[h.NS])})`);
            since = Date.now();
            await foe.update({ "system.attributes.hp.value": 0 });
            await h.until(() => !mark(), `the mark gone as the creature dies (${effectNames(user)}; dead ${foe.isDead})`, { timeout: 8000 });
            await h.messageAfter(since, (message) => /mark on .* ends: it died/.test(message.content ?? ""), { what: "the line that the mark ended" });
            const overLimit = (time) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= time && /used again, though it's once per day/.test(message.content ?? ""));
            since = Date.now();
            await live().apply(ways.id, { choice: locate });
            const first = await h.messageAfter(since, h.itemCard("cast"), { what: "Locate's cast card" });
            h.assert(/Locate/.test(stateOf(first).plan?.spell?.name ?? "") && Number(stateOf(first).plan?.rank) === 5, `Locate at 5th rank (${stateOf(first).plan?.spell?.name} ${stateOf(first).plan?.rank})`);
            await h.wait(500);
            h.assert(!overLimit(since).length, "no warning the first time");
            const second = Date.now();
            await live().apply(ways.id, { choice: locate });
            await h.messageAfter(second, h.itemCard("cast"), { what: "the second Locate's cast card" });
            const warned = await h.messageAfter(second, (message) => /used again, though it's once per day/.test(message.content ?? ""), { what: "the GM's warning, once a day" });
            h.assert((warned.whisper ?? []).length > 0 && (warned.whisper ?? []).every((id) => gmIds().includes(id)), `whispered to the GM (${JSON.stringify(warned.whisper)})`);
            return { mark: true, warning: textOf(warned) };
        },

        // Passage Pane's lock (src/compiler/special-sentences.js plan.ownSave; scripts/poisons.js postExposureCard own, src/live/poison-card.js
        // saveText's "check"): its user's own DC 40 Religion check, a success locking the mirror onto the place wanted. Its card is its
        // user's own ("DC 40 Religion check", its button "Roll the check"); Apply puts the ability module's card on its user's own token, with
        // no targets needed; a 10 on the die with Religion +30 (40 against DC 40, a success) is PF2e's Religion check at DC 40, and its success
        // row's "Locked on" note Effect on the user. (The Owl's Nature and Void Mirror's Become the Void's Occultism are the same own check.)
        async b4G5PassagePaneOwnCheck(scene) {
            await h.clearSquares(scene, [[14, 2]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Pane Bonded", { type: "character", x: 14, y: 2, level: 20 });
            await boost(user, "religion", 30);
            await h.until(() => Number(user.skills?.religion?.mod) >= 30, `Religion +30 (${user.skills?.religion?.mod})`, { timeout: 5000 });
            const pane = await h.give(user, "Passage Pane");
            const card = await activated(pane, 0, "expose", "the pane's own check card");
            const state = stateOf(card);
            h.assert(state.own === true && state.plan.resolution.check.statistic === "religion" && Number(state.plan.resolution.check.against?.value) === 40, `its user's own Religion at DC 40 (${JSON.stringify({ own: state.own, check: state.plan.resolution.check })})`);
            h.assert(/DC 40 Religion check/.test(textOf(card)) && /Roll the check/.test(card.content ?? ""), `its words and button (${textOf(card).slice(0, 300)})`);
            let since = Date.now();
            await live().apply(card.id, {});
            const own = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's card on its user's own token" });
            const targets = abilityState(own).targets ?? [];
            h.assert(targets.length === 1 && targets[0].actorUuid === user.uuid && targets[0].tokenUuid === userToken.uuid, `on its user's own token (${JSON.stringify(targets)})`);
            since = Date.now();
            // (A 10: +30 is 40 against DC 40, a success.)
            await h.withDie(10, () => h.rollAndApply(own));
            const roll = await h.messageAfter(since, (message) => message.speaker?.actor === user.id && message.flags?.pf2e?.context?.type === "skill-check", { what: "PF2e's Religion check" });
            h.assert(Number(roll.flags.pf2e.context.dc?.value) === 40 && (roll.flags.pf2e.context.domains ?? []).includes("religion"), `Religion at DC 40 (${JSON.stringify(roll.flags.pf2e.context.domains)}; DC ${roll.flags.pf2e.context.dc?.value})`);
            const locked = () => user.itemTypes.effect.find((effect) => /: Locked on$/.test(effect.name));
            await h.until(locked, `the "Locked on" note Effect on its user (${effectNames(user)})`, { timeout: 8000 });
            return { total: roll.rolls?.[0]?.total, outcome: roll.flags.pf2e.context.outcome, note: locked().name };
        },

        // Spear of the Destroyer's Flame's tie to it (plan.dcFromTarget, plan.bestOf, ownSave; scripts/live.js postCardFor → src/live/scaled.js
        // withTargetDC): its user's Will, Diplomacy, Intimidation or Warfare Lore against the Commander's highest DC of those four. Its ways
        // card's tie against the living Commander with no
        // creature targeted: refused. The Commander targeted (Will DC 40, Diplomacy DC 41, Warfare Lore DC 39): the own check card at DC 41 with
        // its user's best of the four, Intimidation (+25 here); Apply rolls PF2e's Intimidation at DC 41 on the user (a 20 on the die, 45), and
        // its success row's "Commander of Flame" note Effect is theirs.
        async b4G5SpearTieHighestDC(scene) {
            await h.clearSquares(scene, [[2, 9], [5, 9]]);
            const { actor: user } = await h.creature(scene, "Flame Spear Bearer", { type: "character", x: 2, y: 9, level: 20 });
            const { actor: commander, token: commanderToken } = await h.creature(scene, "Commander of Flame", { x: 5, y: 9, hp: 200, save: 30, level: 20, alliance: "opposition" });
            await commander.update({ "system.skills.diplomacy.base": 31, "system.skills.warfare-lore": { base: 29, label: "Warfare Lore", attribute: "int" } });
            const dcOf = (slug) => Number(commander.getStatistic?.(slug)?.dc?.value);
            await h.until(() => dcOf("diplomacy") === 41, `the Commander's Diplomacy DC 41 (${dcOf("diplomacy")})`, { timeout: 5000 });
            const dcs = Object.fromEntries(["will", "diplomacy", "intimidation", "warfare-lore"].map((slug) => [slug, dcOf(slug)]));
            const highest = Math.max(...Object.values(dcs).filter(Number.isFinite));
            h.assert(highest === 41, `its highest of the four, Diplomacy's 41 (${JSON.stringify(dcs)})`);
            await boost(user, "intimidation", 25);
            await h.until(() => Number(user.skills?.intimidation?.mod) >= 25, `Intimidation +25 (${user.skills?.intimidation?.mod})`, { timeout: 5000 });
            const spear = await h.give(user, "Spear of the Destroyer's Flame");
            await spear.update(held(2));
            const ways = await activated(spear, 0, "ways", "the spear's ways card");
            const tie = wayOf(ways, /against the living Commander/);
            await h.target();
            const refused = await errorOf(live().apply(ways.id, { choice: tie }));
            h.assert(/target the one creature whose DCs it's against first/.test(refused ?? ""), `refused with no Commander targeted (${refused})`);
            let since = Date.now();
            try {
                await h.target(commanderToken);
                await live().apply(ways.id, { choice: tie });
            } finally {
                await h.target();
            }
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the tie's own check card" });
            const check = stateOf(card).plan.resolution.check;
            h.assert(stateOf(card).own === true && check.statistic === "intimidation" && Number(check.against?.value) === 41, `its user's Intimidation at the Commander's DC 41 (${JSON.stringify(check)})`);
            since = Date.now();
            await live().apply(card.id, {});
            const own = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's card on its user" });
            h.assert((abilityState(own).targets ?? [])[0]?.actorUuid === user.uuid, "on its user");
            since = Date.now();
            // (A 20: +25 is 45 against DC 41.)
            await h.withDie(20, () => h.rollAndApply(own));
            const roll = await h.messageAfter(since, (message) => message.speaker?.actor === user.id && message.flags?.pf2e?.context?.type === "skill-check", { what: "PF2e's Intimidation check" });
            h.assert(Number(roll.flags.pf2e.context.dc?.value) === 41 && (roll.flags.pf2e.context.domains ?? []).includes("intimidation"), `Intimidation at DC 41 (${JSON.stringify(roll.flags.pf2e.context.domains)}; DC ${roll.flags.pf2e.context.dc?.value})`);
            const tied = () => user.itemTypes.effect.find((effect) => /: Commander of Flame$/.test(effect.name));
            await h.until(tied, `the "Commander of Flame" note Effect on its user (${effectNames(user)})`, { timeout: 8000 });
            return { dcs, refused, statistic: check.statistic, outcome: roll.flags.pf2e.context.outcome };
        },

        // Red Hand's Satchel (src/compiler/focus.js REAGENTS: focus { resource "infused-reagents", overMax, lost "next-turn-end" }; scripts/focus.js
        // applyFocusCard, loseUnspentFocus): one extra batch of infused reagents, gone if unused by the end of its user's next turn. A character
        // whose infused reagents are 4 of 4 (PF2e's crafting resource, its maximum from an Effect),
        // in an encounter on its own turn: the Focus Point card's Apply makes them 5 — past the day's count. The end of that turn: still 5. The
        // end of its next turn, none used: back to 4, and the whisper that the unspent batch is lost.
        async b4G5RedHandReagents(scene) {
            await h.clearSquares(scene, [[2, 6], [5, 6]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Red Hand Alchemist", { type: "character", x: 2, y: 6, level: 15 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Satchel Watcher", { x: 5, y: 6, alliance: "opposition" });
            await ruled(user, "infused reagents", [{ key: "ActiveEffectLike", mode: "add", path: "system.resources.crafting.infusedReagents.max", value: 4 }]);
            // (As PF2e prepares them — what its sheet shows and its crafting spends: CharacterPF2e.prepareDerivedData clamps the value to the
            // maximum — and as stored, for the log.)
            const reagents = () => ({ ...(user.system.resources?.crafting?.infusedReagents ?? {}), stored: user._source?.system?.resources?.crafting?.infusedReagents?.value });
            await h.until(() => Number(reagents().max) === 4, `infused reagents' maximum 4 (${JSON.stringify(reagents())})`, { timeout: 5000 });
            await user.update({ "system.resources.crafting.infusedReagents.value": 4 });
            await h.until(() => Number(reagents().value) === 4, `4 of 4 infused reagents (${JSON.stringify(reagents())})`, { timeout: 5000 });
            const satchel = await h.give(user, "Red Hand's Satchel");
            await satchel.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            const combat = await encounter(scene, [{ token: userToken, actor: user, initiative: 20 }, { token: foeToken, actor: foe, initiative: 10 }]);
            try {
                await h.until(() => combat.combatant?.actorId === user.id, "its user's turn first", { timeout: 5000 });
                const card = await activated(satchel, 0, "focus", "the satchel's card");
                await live().apply(card.id, {});
                await h.until(() => stateOf(card)?.status === "applied", "the card applied", { timeout: 8000 });
                const results = resultsOf(card);
                h.assert(Number(reagents().value) === 5, `5 batches after the card, one past the day's 4 (${JSON.stringify(reagents())}; ${JSON.stringify(results)})`);
                const grant = user.getFlag(h.NS, "focusGrant");
                h.assert(grant?.key === "crafting.infusedReagents" && Number(grant.skip) === 1, `kept past this turn's end (${JSON.stringify(grant)})`);
                await turnOf(combat, foe);
                h.assert(Number(reagents().value) === 5, `still 5 once the turn it came in ends (${JSON.stringify(reagents())}; ${JSON.stringify(user.getFlag(h.NS, "focusGrant"))})`);
                await turnOf(combat, user);
                const since = Date.now();
                await turnOf(combat, foe);
                await h.until(() => Number(reagents().value) === 4, `back to 4 at the end of its next turn (${JSON.stringify(reagents())})`, { timeout: 8000 });
                await h.messageAfter(since, (message) => /unspent batch of infused reagents is lost/.test(message.content ?? ""), { what: "the whisper that it's lost" });
                return { results, after: reagents().value };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Briar's revival (item.revive { hp "max", keepPools }; scripts/revive.js isDead — a character dying at its most counts dead — and
        // reviveCreature): its dead partner back at full Hit Points with its pools as they were. Its partner (30 maximum Hit Points, 1 of 2
        // Focus Points) at 0 Hit Points and Dying 4: the item card's Apply brings it back — no Dying
        // nor Unconscious, 30 Hit Points, its Focus Point still there (a revival spends them otherwise), the "back from death" note Effect, and
        // the row's "Touched by Nyrissa" note.
        async b4G5BriarRevive(scene) {
            await h.clearSquares(scene, [[9, 2]]);
            const { actor: partner } = await h.creature(scene, "Briar Partner", { type: "character", x: 9, y: 2, level: 20 });
            await hitPoints(partner, 30);
            await ruled(partner, "focus pool", [{ key: "ActiveEffectLike", mode: "add", path: "system.resources.focus.max", value: 2 }]);
            const focus = () => partner.system.resources?.focus ?? {};
            await h.until(() => Number(focus().max) >= 2, `a focus pool of 2 (${JSON.stringify(focus())})`, { timeout: 5000 });
            await partner.update({ "system.resources.focus.value": 1 });
            await h.until(() => Number(focus().value) === 1, `1 Focus Point (${JSON.stringify(focus())})`, { timeout: 5000 });
            const briar = await h.give(partner, "Briar");
            await briar.update(held(1));
            await partner.update({ "system.attributes.hp.value": 0 });
            await partner.increaseCondition("dying", { value: 4 });
            await h.until(() => Number(partner.getCondition?.("dying")?.value) >= 4 || partner.statuses?.has?.("dead"), `Dying 4 (${conditions(partner)})`, { timeout: 5000 });
            const card = await activated(briar, 8, "item", "the revival's item card");
            await live().apply(card.id, {});
            await h.until(() => stateOf(card)?.status === "applied", "the card applied", { timeout: 10000 });
            const max = Number(partner.system.attributes.hp.max);
            await h.until(() => hpOf(partner) === max && !partner.hasCondition("dying") && !partner.hasCondition("unconscious"), `back at its full ${max} Hit Points, no Dying or Unconscious (${hpOf(partner)}; ${conditions(partner)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(!partner.statuses?.has?.("dead"), "PF2e's dead status off");
            h.assert(Number(focus().value) === 1, `its Focus Point kept (${JSON.stringify(focus())})`);
            h.assert(resultsOf(card).some((line) => /returns to life with \d+ Hit Points \(its full Hit Points\)/.test(line)), `its line (${JSON.stringify(resultsOf(card))})`);
            await h.until(() => partner.itemTypes.effect.some((effect) => /: back from death$/.test(effect.name)) && partner.itemTypes.effect.some((effect) => /: Touched by Nyrissa$/.test(effect.name)), `the "back from death" and "Touched by Nyrissa" notes (${effectNames(partner)})`, { timeout: 5000 });
            return { hp: hpOf(partner), focus: focus().value, results: resultsOf(card) };
        },

        // Briar's Strike at Nyrissa (src/compiler/special-sentences.js: item.mark at her, a +4 item bonus to saves predicated on origin:mark:
        // briar-nyrissa and item:type:spell, plan.again her save; src/live/if-target.js named, lacks): its partner's saves against her spells
        // +4 for a minute, then her own DC 50 Fortitude save. Applied at her: its partner's mark
        // Effect at her token and the +4 Effect. PF2e's Will save of the partner against her spell (her Fireball, her the origin) has the +4; with
        // her mark but no spell, none. Her save card follows: at her and a bystander, one Fortitude DC 50 card, hers; the bystander immune.
        async b4G5BriarNyrissaSave(scene) {
            await h.clearSquares(scene, [[9, 5], [11, 5], [11, 7]]);
            const { actor: partner } = await h.creature(scene, "Briar Wielder", { type: "character", x: 9, y: 5, level: 20 });
            const { actor: nyrissa, token: nyrissaToken } = await h.creature(scene, "Nyrissa", { x: 11, y: 5, hp: 400, save: 30, level: 21, alliance: "opposition" });
            const { actor: bystander, token: bystanderToken } = await h.creature(scene, "Briar Bystander", { x: 11, y: 7, hp: 100, alliance: "opposition" });
            const spell = await h.give(nyrissa, "Fireball", "pf2e.spells-srd");
            const briar = await h.give(partner, "Briar");
            await briar.update(held(1));
            const start = Date.now();
            let since = start;
            const card = await activated(briar, 9, "item", "the Nyrissa reaction's item card");
            await live().apply(card.id, { targets: [nyrissaToken.uuid] });
            const mark = () => partner.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.mark === "briar-nyrissa");
            const bonus = () => partner.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && Number(rule.value) === 4 && [].concat(rule.predicate ?? []).includes("origin:mark:briar-nyrissa")));
            await h.until(() => mark() && bonus(), `its mark at her and the +4 Effect (${effectNames(partner)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert((mark().system.rules ?? []).some((rule) => rule.key === "TokenMark" && rule.slug === "briar-nyrissa" && rule.uuid === nyrissaToken.uuid), `its TokenMark at her token (${JSON.stringify(mark().system.rules)})`);
            const plain = modWith(partner, "will", []);
            const againstSpell = modWith(partner, "will", ["origin:mark:briar-nyrissa", "item:type:spell"]);
            const notSpell = modWith(partner, "will", ["origin:mark:briar-nyrissa"]);
            h.assert(againstSpell === plain + 4 && notSpell === plain, `+4 to a save against her spell only (${plain}; her spell ${againstSpell}; her, no spell ${notSpell})`);
            since = Date.now();
            await partner.saves.will.roll({ origin: nyrissa, item: spell, skipDialog: true });
            const roll = await h.messageAfter(since, (message) => message.speaker?.actor === partner.id && message.flags?.pf2e?.context?.type === "saving-throw", { what: "PF2e's Will save against her Fireball" });
            const options = roll.flags.pf2e.context.options ?? [];
            const applied = (roll.flags.pf2e.modifiers ?? []).some((modifier) => Number(modifier.modifier) === 4 && modifier.type === "item" && modifier.enabled !== false);
            h.assert(applied, `the +4 on a real save against her spell (modifiers ${JSON.stringify((roll.flags.pf2e.modifiers ?? []).map((modifier) => [modifier.label, modifier.modifier, modifier.type, modifier.enabled]))}; origin:mark ${options.includes("origin:mark:briar-nyrissa")}, item:type:spell ${options.includes("item:type:spell")})`);
            const fortitude = await h.messageAfter(start, (message) => h.itemCard("expose")(message) && Number(stateOf(message)?.plan?.resolution?.check?.against?.value) === 50, { what: "her DC 50 Fortitude save's card" });
            since = Date.now();
            await live().apply(fortitude.id, { targets: [nyrissaToken.uuid, bystanderToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "her save card" });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            h.assert(cards.length === 1 && cardFor(cards, nyrissa) && !cardFor(cards, bystander), `one card, hers (${cards.length})`);
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "fortitude" && Number(check.against?.value) === 50, `Fortitude DC 50 (${JSON.stringify(check)})`);
            h.assert(resultsOf(fortitude).some((line) => /Briar Bystander: immune/.test(line)), `the bystander immune (${JSON.stringify(resultsOf(fortitude))})`);
            return { plain, againstSpell, notSpell, realRoll: applied };
        },

        // The Carnival (plan.whisper.flat; scripts/live.js postWhisper) and Spectacles of Discernment's lenses (plan.whisper.secret): the card's
        // vision with the GM's secret flat check (DC 6 less the card's +2: 4 below 17th level) and its user Stupefied 1 for a round; the lenses'
        // secret counteract check at +23. A 3rd-level user activates The Carnival: the GM's blind whisper of the flat check at DC 4 with its roll and what it means,
        // the vision whispered to the GM and the user's owners, and the user Stupefied 1 for a round (the ability module's Effect). Then the
        // spectacles' "Flip down the lenses" way: the GM's blind whisper of the counteract check, 1d20+23.
        async b4G5CarnivalSpectaclesSecrets(scene) {
            await h.clearSquares(scene, [[14, 5]]);
            const { actor: user } = await h.creature(scene, "Harrow Seer", { type: "character", x: 14, y: 5, level: 3 });
            const carnival = await h.give(user, "The Carnival");
            let since = Date.now();
            await live().activate(carnival.uuid, 0);
            const flat = await h.messageAfter(since, (message) => /secret flat check DC \d+/.test(message.content ?? ""), { what: "the GM's secret flat check" });
            const [, dc, total] = /secret flat check DC (\d+): (\d+)/.exec(textOf(flat)) ?? [];
            h.assert(Number(dc) === 4, `DC 4 below 17th level (${textOf(flat)})`);
            h.assert(flat.blind && (flat.whisper ?? []).length > 0 && flat.whisper.every((id) => gmIds().includes(id)), `blind, for the GM alone (${JSON.stringify({ blind: flat.blind, whisper: flat.whisper })})`);
            h.assert(Number(total) >= 4 ? /a success: the answer is as it is/.test(textOf(flat)) : /a failure\. The answer is "neither"/.test(textOf(flat)), `what the roll means (${textOf(flat)})`);
            const vision = await h.messageAfter(since, (message) => message.flags?.[h.NS]?.whisper?.item === "The Carnival", { what: "the vision's whisper" });
            h.assert((vision.whisper ?? []).length > 0 && /sinister carnival/.test(textOf(vision)), `the vision whispered (${textOf(vision).slice(0, 200)})`);
            await h.until(() => Number(user.getCondition?.("stupefied")?.value) === 1, `its user Stupefied 1 (${conditions(user)})`, { timeout: 8000 });
            const timed = user.itemTypes.effect.find((effect) => /The Carnival: Stupefied/.test(effect.name));
            h.assert(timed && Number(timed.system.duration.value) === 1 && timed.system.duration.unit === "rounds", `for 1 round (${timed ? JSON.stringify(timed.system.duration) : effectNames(user)})`);
            const spectacles = await h.give(user, "Spectacles of Discernment");
            await spectacles.update(held(1)).catch(() => null);
            const ways = await activated(spectacles, 0, "ways", "the spectacles' ways card");
            const flip = wayOf(ways, /^Flip down the lenses/);
            since = Date.now();
            await live().apply(ways.id, { choice: flip });
            const secret = await h.messageAfter(since, (message) => /Secret counteract check \(\+23, counteract rank 7\)/.test(textOf(message)), { what: "the GM's secret counteract check" });
            const rolled = Number(/: (\d+)\.\s*$/.exec(textOf(secret))?.[1]);
            h.assert(secret.blind && secret.whisper.every((id) => gmIds().includes(id)) && rolled >= 24 && rolled <= 43, `blind, the GM's, 1d20+23 (${rolled}; ${textOf(secret)})`);
            return { flat: textOf(flat), counteract: rolled };
        },

        // The Uprising (src/compiler/special-sentences.js: a 20-foot burst for a minute, its "initial" check check.attackFrom "unarmed" against the
        // Fortitude DC, Grabbed with escape { ownerDC "class" }; scripts/live.js postCardFor → src/live/scaled.js withAttackModifiers, and
        // fillOwnerDCs): its user's unarmed attack against each creature's Fortitude DC in the burst, a success grabbing it (its Escape at the
        // user's class DC) with 3d6 bludgeoning. Its user (a class DC from an Effect's ActiveEffectLike) and
        // a creature beside it: the burst placed at its user (the placement stood in for), the ability module's check card at the creature —
        // its user's basic unarmed attack modifier against its Fortitude DC —, none for the user. A 10 on the die (a success): Grabbed, its
        // Effect's Escape DC its user's class DC, and its 3d6 bludgeoning taken.
        async b4G5UprisingMobGrab(scene) {
            await h.clearSquares(scene, around(4, 14, 4));
            const { actor: user, token: userToken } = await h.creature(scene, "Uprising Caller", { type: "character", x: 4, y: 14, level: 3 });
            const { actor: foe } = await h.creature(scene, "Uprising Mark", { x: 5, y: 14, hp: 60, save: 0, alliance: "opposition" });
            await ruled(user, "class DC", [{ key: "ActiveEffectLike", mode: "override", path: "system.proficiencies.classDCs.fixture", value: { label: "Fixture", attribute: "str", rank: 2, primary: true } }]);
            const classDC = () => Number(user.system.attributes?.classDC?.value);
            await h.until(() => classDC() > 0, `its class DC (an Effect's ActiveEffectLike: ${JSON.stringify(user.system.attributes?.classDC ?? null)})`, { timeout: 5000 });
            const unarmed = (user.system.actions ?? []).find((action) => action?.slug === "basic-unarmed" || action?.item?.slug === "basic-unarmed" || action?.item?.system?.category === "unarmed");
            h.assert(unarmed && Number.isFinite(Number(unarmed.totalModifier)), "its basic unarmed Strike");
            const modifier = Number(unarmed.totalModifier);
            const card = await h.give(user, "The Uprising");
            await h.until(() => userToken.object, "its token drawn", { timeout: 5000 });
            await userToken.object?.control?.();
            const zone = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /The Uprising/.test(region.name));
            const placing = canvas.regions.placeRegion;
            canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
            try {
                const since = Date.now();
                await live().activate(card.uuid, 0);
                await h.until(zone, "the mob's Region", { timeout: 10000 });
                const check = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && Boolean(cardFor([message], foe)), { what: "the mob's check card at the creature inside", timeout: 12000 });
                const state = abilityState(check);
                const target = (state.targets ?? []).find((entry) => entry.actorUuid === foe.uuid);
                h.assert(Number(state.plan.resolution.check.modifier) === modifier, `its user's unarmed attack +${modifier} (${JSON.stringify(state.plan.resolution.check)})`);
                h.assert(Number(target?.dc) === Number(foe.getStatistic("fortitude")?.dc?.value), `against its Fortitude DC (${target?.dc} vs ${foe.getStatistic("fortitude")?.dc?.value})`);
                const escape = state.plan.resolution.outcomes?.success?.effects?.find((effect) => effect.slug === "grabbed")?.duration?.escape;
                h.assert(Number(escape?.dc) === classDC(), `its Escape DC its user's class DC ${classDC()} (${JSON.stringify(escape)})`);
                await h.wait(800);
                h.assert(!cardFor(abilityCardsSince(since), user), "no card for its user, in its own burst");
                const before = hpOf(foe);
                // (A 10: +modifier against DC 10, a success.)
                await h.withDie(10, () => h.rollAndApply(check));
                await h.until(() => foe.hasCondition("grabbed"), `Grabbed (${conditions(foe)}; ${JSON.stringify(abilityState(check)?.results ?? [])})`, { timeout: 10000 });
                const grab = foe.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.escape && /Grabbed/.test(effect.name));
                h.assert(Number(grab?.flags?.[ABILITY]?.escape?.dc) === classDC(), `its Grabbed Effect's Escape DC ${classDC()} (${grab ? JSON.stringify(grab.flags[ABILITY]) : effectNames(foe)})`);
                await h.until(() => hpOf(foe) < before, `its 3d6 bludgeoning taken (${hpOf(foe)} of ${before})`, { timeout: 8000 });
                return { modifier, classDC: classDC(), hp: `${before} → ${hpOf(foe)}`, results: abilityState(check)?.results ?? [] };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of scene.regions.filter((entry) => /The Uprising/.test(entry.name))) await region.delete().catch(() => null);
            }
        },

        // Void Mirror's Speak to the Void (bonus.rules, bonus.after; src/live/fortune-card.js readiedRules, scripts/fortune.js fortuneRolled): a
        // Recall Knowledge with Nature or Occultism made at legendary, its failure 10d6 mental to its user. Its fortune card's Apply: the readied
        // Effect on its user with PF2e's ActiveEffectLike — Nature at rank 4, legendary
        // (its proficiency +8 + level) —; the user's Nature check (Recall Knowledge, DC 25: a 10 on the die, 21, a failure) has that proficiency,
        // spends the Effect, and brings the 10d6 mental damage roll on its user, its Hit Points lower. Activated again the same month, the
        // GM's whisper that it's once per month.
        async b4G5VoidMirrorSpeak(scene) {
            await h.clearSquares(scene, [[17, 2]]);
            const { actor: user } = await h.creature(scene, "Void Speaker", { type: "character", x: 17, y: 2, level: 3 });
            await hitPoints(user, 100);
            const mirror = await h.give(user, "Void Mirror");
            await mirror.update(held(2));
            const card = await activated(mirror, 0, "fortune", "Speak to the Void's card");
            await live().apply(card.id, {});
            const readied = () => user.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "ActiveEffectLike" && rule.path === "system.skills.nature.rank"));
            await h.until(readied, `the readied Effect with its ActiveEffectLike (${effectNames(user)})`, { timeout: 8000 });
            await h.until(() => Number(user.skills?.nature?.rank) === 4, `Nature at legendary (rank ${user.skills?.nature?.rank})`, { timeout: 5000 });
            const level = Number(user.level);
            let since = Date.now();
            await h.withDie(10, () => user.skills.nature.roll({ dc: { value: 25 }, skipDialog: true, extraRollOptions: ["action:recall-knowledge"] }));
            const roll = await h.messageAfter(since, (message) => message.speaker?.actor === user.id && message.flags?.pf2e?.context?.type === "skill-check", { what: "PF2e's Nature check" });
            const proficiency = (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.slug === "proficiency");
            h.assert(Number(proficiency?.modifier) === level + 8, `legendary proficiency, +${level + 8} (${JSON.stringify(proficiency)})`);
            h.assert(roll.flags.pf2e.context.outcome === "failure", `a failure (${roll.rolls?.[0]?.total} against DC 25: ${roll.flags.pf2e.context.outcome})`);
            await h.messageAfter(since, (message) => /a failure — 10d6 mental damage to/.test(wordsOf(message)), { what: "the 10d6 mental damage roll", timeout: 10000 });
            await h.until(() => hpOf(user) < 100, `the mental damage taken (${hpOf(user)} of 100)`, { timeout: 8000 });
            await h.until(() => !readied(), `the readied Effect spent (${effectNames(user)})`, { timeout: 5000 });
            // (Its "once per month", a period now counted (src/live/activations-card.js PERIOD_SECONDS): a second activation the same month, the
            // GM's warning.)
            since = Date.now();
            await live().activate(mirror.uuid, 0);
            const warned = await h.messageAfter(since, (message) => /activated again, though it's once per month/.test(message.content ?? ""), { what: "the GM's warning past once a month" });
            return { total: roll.rolls?.[0]?.total, proficiency: proficiency?.modifier, hp: hpOf(user), warning: textOf(warned) };
        },

        // Void Mirror's Call from the Void (plan.pick, plan.attitudeCheck; scripts/zones.js startItemConjure → checkAttitude, src/live/conjured.js
        // attitudeOf; the return's plan.dcFromUser in scripts/live.js): a called aberration, beast, fungus, ooze or plant up to its user's level
        // + 4, its attitude by its user's Occultism against its Will DC, a critical failure stunning the user 3. Its ways card's call
        // for a 3rd-level user: the pick lists such creatures of level 7 or lower; the first picked, with a 1 on the die (a critical failure), PF2e's
        // Occultism check at its Will DC (10 + its Will) comes first; the creature is beside its user, hostile (token disposition −1, alliance
        // opposition, its "…: hostile" Effect), and the user Stunned 3. Its return way: the save card at its user's own Occultism DC, at it.
        async b4G5VoidMirrorCall(scene) {
            await h.clearSquares(scene, around(9, 12, 4));
            const { actor: user, token: userToken } = await h.creature(scene, "Void Caller", { type: "character", x: 9, y: 12, level: 3 });
            const mirror = await h.give(user, "Void Mirror");
            await mirror.update(held(2));
            await h.until(() => userToken.object, "its token drawn", { timeout: 5000 });
            const made = () => conjuredBy(scene, mirror.uuid);
            let dialog = null;
            try {
                const ways = await activated(mirror, 1, "ways", "Call from the Void's ways card");
                const call = wayOf(ways, /^Call from the Void/);
                const back = wayOf(ways, /^Return it/);
                let since = Date.now();
                const picked = await h.withDie(1, async () => {
                    // (The apply waits on the pick: answered here first — an apply failing before it shows, its error.)
                    let failed = null;
                    const applying = live().apply(ways.id, { choice: call }).catch((error) => {
                        failed = error;
                    });
                    for (const stop = Date.now() + 20000; Date.now() < stop && !dialog && !failed; ) {
                        dialog = await pickDialog("Void Mirror (Call from the Void)", { timeout: 300 }).catch(() => null);
                    }
                    if (failed) throw failed;
                    h.assert(dialog, "the creature pick (\"Void Mirror (Call from the Void)\") within 20 seconds");
                    const select = dialog.element.querySelector("select[name=creature]");
                    const options = [...select.options].map((option) => ({ value: option.value, text: option.textContent.trim(), level: Number(/\((-?\d+)\)$/.exec(option.textContent.trim())?.[1]) }));
                    h.assert(options.length > 0 && options.every((option) => Number.isFinite(option.level) && option.level <= 7), `creatures of level 7 or lower only (${options.slice(0, 12).map((option) => option.text).join(", ")}…)`);
                    select.value = options[0].value;
                    const choose = dialog.element.querySelector('button[data-action="make"]');
                    h.assert(choose, "the pick's Choose button");
                    choose.click();
                    dialog = null;
                    await applying;
                    if (failed) throw failed;
                    return options[0];
                });
                const roll = await h.messageAfter(since, (message) => message.speaker?.actor === user.id && message.flags?.pf2e?.context?.type === "skill-check", { what: "PF2e's Occultism check against its Will DC", timeout: 10000 });
                const source = await fromUuid(picked.value);
                const will = Number(source?.system?.saves?.will?.value);
                h.assert(Number(roll.flags.pf2e.context.dc?.value) === 10 + will && (roll.flags.pf2e.context.domains ?? []).includes("occultism"), `Occultism at ${picked.text}'s Will DC ${10 + will} (${JSON.stringify(roll.flags.pf2e.context.domains)}; DC ${roll.flags.pf2e.context.dc?.value})`);
                await h.until(() => made().length === 1, `the called creature's token (${made().map((token) => token.name).join(", ") || "none"})`, { timeout: 15000 });
                const token = made()[0];
                await h.until(() => token.disposition === -1 && (token.actor?.itemTypes?.effect ?? []).some((effect) => /: hostile$/.test(effect.name)), `hostile: disposition −1 and its attitude Effect (${token.disposition}; ${effectNames(token.actor)})`, { timeout: 8000 });
                if (token.actor?.type === "npc") h.assert(token.actor.system.details.alliance === "opposition", `on the other side (${token.actor.system.details.alliance})`);
                await h.until(() => Number(user.getCondition?.("stunned")?.value) === 3, `its user Stunned 3 on the critical failure (${conditions(user)})`, { timeout: 5000 });
                since = Date.now();
                await live().apply(ways.id, { choice: back });
                const ret = await h.messageAfter(since, h.itemCard("expose"), { what: "the return's save card" });
                const occultism = Number(user.getStatistic("occultism")?.dc?.value);
                h.assert(Number(stateOf(ret).plan.resolution.check.against?.value) === occultism && stateOf(ret).plan.resolution.check.statistic === "will", `its Will save at its user's Occultism DC ${occultism} (${JSON.stringify(stateOf(ret).plan.resolution.check)})`);
                since = Date.now();
                await live().apply(ret.id, { targets: [token.uuid] });
                const save = await h.messageAfter(since, h.abilitySaveCard, { what: "its Will save card" });
                h.assert(cardFor([save], token.actor) && Number(abilityState(save).plan.resolution.check.against?.value) === occultism, `at it, DC ${occultism}`);
                return { picked: picked.text, dc: roll.flags.pf2e.context.dc?.value, outcome: roll.flags.pf2e.context.outcome, occultism };
            } finally {
                if (dialog) await dialog.close().catch(() => null);
                // (Its pick still open when the case failed before finding it: closed, so the next case isn't held up.)
                for (const app of [...foundry.applications.instances.values()].filter((entry) => entry.constructor.name === "DialogV2" && entry.title === "Void Mirror (Call from the Void)")) await app.close().catch(() => null);
                await dismissConjured(scene, mirror.uuid);
            }
        },

        // (b4G5TerrainAdaptationForest superseded 2026-10-29 by b4G1TerrainAdaptationRest (the base Slithermaw's Bane reads as the Heroic one since batch 5).)

        // What Doors We Open's Open the Door Within (plan.item.space; scripts/live.js applyToRecipient → src/live/card.js spaceSource): the
        // book's own extradimensional space, as a Spacious Pouch (Type II). The item card's Apply the first time: PF2e's Spacious Pouch (Type
        // II) in its user's inventory as "The Door Within" (a backpack, flagged spaceOf the book); the second: "The Door Within is open", no
        // second container.
        async b4G5DoorWithinOnce(scene) {
            await h.clearSquares(scene, [[17, 8]]);
            const { actor: user } = await h.creature(scene, "Door Opener", { type: "character", x: 17, y: 8, level: 14 });
            const book = await h.give(user, "What Doors We Open");
            await book.update(held(1)).catch(() => null);
            const spaces = () => user.items.filter((item) => item.getFlag(h.NS, "spaceOf") === book.uuid);
            const first = await activated(book, 1, "item", "the door's item card");
            await live().apply(first.id, {});
            await h.until(() => spaces().length === 1, `its container (${user.items.map((item) => item.name).join(", ")}; ${JSON.stringify(resultsOf(first))})`, { timeout: 8000 });
            const [space] = spaces();
            h.assert(space.name === "The Door Within" && space.type === "backpack", `The Door Within, a container (${space.name}, ${space.type})`);
            const second = await activated(book, 1, "item", "the second item card");
            await live().apply(second.id, {});
            await h.until(() => resultsOf(second).some((line) => /The Door Within is open/.test(line)), `"is open" the second time (${JSON.stringify(resultsOf(second))})`, { timeout: 8000 });
            h.assert(spaces().length === 1, `still one container (${spaces().length})`);
            return { space: space.name, results: [...resultsOf(first), ...resultsOf(second)] };
        },

        // Hex Blaster (src/compiler/special-sentences.js: the hex an item.mark for a minute, its DC 28 Will save plan.again kept open; the critical
        // failure's note Effect with RollOption air-doom-curse:28:1 → scripts/doom-hex.js): the hexed creature's DC 28 Will save after hits; on a
        // critical failure, knocked out it stays so for a day, then a DC 28 Fortitude save or death. The item card at a creature: its user's hex mark, and the Will card kept open for the
        // minute, pressed after its hits. Pressed (a 1 on the die, a critical failure): Frightened 2 and the curse's note Effect. The creature at 0
        // Hit Points, Unconscious: the "doomed sleep" Effect for 1 day (PF2e's GrantItem of Unconscious). Its day over (its start put back a day,
        // a second of world time, PF2e's expiry or the case's deletion of it): the ability module's Fortitude DC 28 card at it, death on a failure.
        async b4G5HexDoomSleep(scene) {
            await h.clearSquares(scene, [[2, 3], [5, 3]]);
            const { actor: user } = await h.creature(scene, "Hex Gunner", { type: "character", x: 2, y: 3, level: 11 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Hexed Mark", { x: 5, y: 3, hp: 80, save: 8, alliance: "opposition", level: 10 });
            const blaster = await h.give(user, "Hex Blaster");
            await blaster.update(held(2));
            let since = Date.now();
            const card = await activated(blaster, 0, "item", "the hex's item card");
            await live().apply(card.id, { targets: [foeToken.uuid] });
            const hex = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.mark === "hex-blaster-hex");
            await h.until(hex, `the hex mark on its user (${effectNames(user)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(Number(hex().system.duration.value) === 1 && hex().system.duration.unit === "minutes", `for a minute (${JSON.stringify(hex().system.duration)})`);
            const later = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && Number(stateOf(message)?.plan?.resolution?.check?.against?.value) === 28, { what: "the Will save card kept for later" });
            let state = stateOf(later);
            h.assert(state.later && state.repeat && state.until - game.time.worldTime > 50 && state.until - game.time.worldTime <= 60 && /hits the hexed creature/.test(state.when ?? ""), `open for the minute, pressed after its hits (${JSON.stringify({ later: state.later, repeat: state.repeat, left: state.until - game.time.worldTime, when: state.when })})`);
            since = Date.now();
            await live().apply(later.id, { targets: [foeToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "its Will save card" });
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && Number(check.against?.value) === 28, `Will DC 28 (${JSON.stringify(check)})`);
            // (A 1: 9 against DC 28, a critical failure.)
            await h.withDie(1, () => h.rollAndApply(save));
            const curse = () => foe.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-doom-curse:28:1"));
            await h.until(() => curse() && Number(foe.getCondition?.("frightened")?.value) === 2, `the curse's note Effect and Frightened 2 (${effectNames(foe)}; ${conditions(foe)})`, { timeout: 10000 });
            state = stateOf(later);
            h.assert(state.status === "open" && state.uses === 1, `the Will card still open (${state.status}, ${state.uses})`);
            await foe.update({ "system.attributes.hp.value": 0 });
            await foe.increaseCondition("unconscious");
            const hold = () => foe.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.doomHold);
            await h.until(hold, `the "doomed sleep" Effect once it's Unconscious (${effectNames(foe)})`, { timeout: 8000 });
            const duration = hold().system.duration;
            h.assert(Number(duration.value) === 1 && duration.unit === "days" && (hold().system.rules ?? []).some((rule) => rule.key === "GrantItem" && /fBnFDH2MTzgFijKf/.test(rule.uuid ?? "")), `Unconscious held for a day (${JSON.stringify(duration)}; ${JSON.stringify(hold().system.rules)})`);
            h.assert(foe.hasCondition("unconscious"), "unconscious");
            since = Date.now();
            // (Its day over: its start a day ago, then a second of world time — PF2e removes it when it removes expired Effects; else the case does.)
            await hold().update({ "system.start.value": game.time.worldTime - 86400 });
            await game.time.advance(1);
            await h.until(() => !hold(), "", { timeout: 3000 }).catch(() => null);
            const byHand = Boolean(hold());
            if (byHand) await foe.deleteEmbeddedDocuments("Item", [hold().id]);
            const death = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && Boolean(cardFor([message], foe)), { what: "the doomed sleep's Fortitude card", timeout: 10000 });
            const plan = abilityState(death).plan;
            h.assert(plan.resolution.check.statistic === "fortitude" && Number(plan.resolution.check.against?.value) === 28 && plan.resolution.outcomes.failure?.terminal?.kind === "death", `Fortitude DC 28, death on a failure (${JSON.stringify(plan.resolution.check)}; ${JSON.stringify(plan.resolution.outcomes.failure)})`);
            return { removedByPF2e: !byHand, traits: plan.traits };
        },

        // Emerald Fulcrum Lens's possession (plan.possess; scripts/possession.js on the ability module's "applied" hook, scripts/activations.js's
        // refusal): a +20 melee spell attack whose hit puts the lens's splinter in the creature, its user uninvested and the lens without magic
        // until that possession ends. Held and invested: its attack
        // card at a creature (AC 18) is +20; a 10 on the die (30, a critical hit): the creature's possession note Effect (void healing: PF2e's
        // hp.negativeHealing), the lens uninvested and flagged possessing; its activations refused meanwhile. That Effect deleted: the flag gone,
        // the chat line that the possession has ended.
        async b4G5LensPossession(scene) {
            await h.clearSquares(scene, [[14, 9], [15, 9]]);
            const { actor: user } = await h.creature(scene, "Lens Grasper", { type: "character", x: 14, y: 9, level: 10 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Lens Host", { x: 15, y: 9, hp: 100, ac: 18, alliance: "opposition" });
            const lens = await h.give(user, "Emerald Fulcrum Lens");
            await lens.update({ ...held(1), "system.equipped.invested": true });
            const flag = () => user.items.get(lens.id)?.getFlag(h.NS, "possessing");
            let since = Date.now();
            const card = await activated(lens, 1, "expose", "the possession's attack card");
            await live().apply(card.id, { targets: [foeToken.uuid] });
            const attack = await h.messageAfter(since, h.abilitySaveCard, { what: "the +20 attack card" });
            h.assert(Number(abilityState(attack).plan.resolution.check.modifier) === 20, `+20 (${JSON.stringify(abilityState(attack).plan.resolution.check)})`);
            // (A 10: 30 against AC 18.)
            await h.withDie(10, () => h.rollAndApply(attack));
            const possessed = () => foe.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-possessed-by:emerald-fulcrum-lens"));
            await h.until(possessed, `the possession note Effect on the creature (${effectNames(foe)})`, { timeout: 10000 });
            await h.until(() => foe.system.attributes.hp.negativeHealing === true, "void healing on it (PF2e's negativeHealing)", { timeout: 5000 });
            await h.until(() => flag() && user.items.get(lens.id)?.system?.equipped?.invested === false, `the lens uninvested and possessing (${JSON.stringify(flag() ?? null)})`, { timeout: 8000 });
            h.assert(flag().actorUuid === foe.uuid && flag().option === "air-possessed-by:emerald-fulcrum-lens", `flagged for that creature (${JSON.stringify(flag())})`);
            const refused = await errorOf(live().activate(lens.uuid, 0));
            h.assert(/its essence possesses another creature/.test(refused ?? ""), `its activations refused meanwhile (${refused})`);
            since = Date.now();
            await foe.deleteEmbeddedDocuments("Item", [possessed().id]);
            await h.until(() => !flag(), "the possessing flag gone with the Effect", { timeout: 8000 });
            await h.messageAfter(since, (message) => /the possession has ended, and its essence is back/.test(message.content ?? ""), { what: "the line that the essence is back" });
            return { refused };
        },

        // Mindsponge (plan.item.store { max 4 }, item.storeFull; scripts/live.js applyToRecipient → src/live/card.js storeAfter; scripts/activations.js
        // refusing the full sponge): four creatures' memories at most, and no Wipe Memories while it holds four. Its Absorb
        // Memories ways card's harvest, its item card at a corpse each time: 1, 2, 3, 4 of 4 on the item; the fifth refused ("full"), still 4;
        // Wipe Memories refused while full; the squeeze way's item card: 0 of 4; Wipe Memories then posts its cast card.
        async b4G5MindspongeFull(scene) {
            await h.clearSquares(scene, [[14, 12], [15, 12]]);
            const { actor: user } = await h.creature(scene, "Sponge Surgeon", { type: "character", x: 14, y: 12, level: 9 });
            const { token: corpseToken } = await h.creature(scene, "Sponge Corpse", { x: 15, y: 12, hp: 0 });
            const sponge = await h.give(user, "Mindsponge");
            await sponge.update(held(1)).catch(() => null);
            const stored = () => Number(user.items.get(sponge.id)?.getFlag(h.NS, "stored") ?? 0);
            const ways = await activated(sponge, 1, "ways", "Absorb Memories' ways card");
            const harvest = wayOf(ways, /^Absorb its memories/);
            const squeeze = wayOf(ways, /^Squeeze it out/);
            const harvestCard = async () => {
                const since = Date.now();
                await live().apply(ways.id, { choice: harvest });
                return h.messageAfter(since, h.itemCard("item"), { what: "the harvest's item card" });
            };
            for (let count = 1; count <= 4; count++) {
                const card = await harvestCard();
                await live().apply(card.id, { targets: [corpseToken.uuid] });
                await h.until(() => stored() === count, `${count} of 4 held (${stored()}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            }
            const fifth = await harvestCard();
            const full = await errorOf(live().apply(fifth.id, { targets: [corpseToken.uuid] }));
            h.assert(/is full \(4 of 4\)/.test(full ?? "") && stored() === 4, `the fifth refused, still 4 (${full}; ${stored()})`);
            const wipeRefused = await errorOf(live().activate(sponge.uuid, 0));
            h.assert(/is full: squeeze it out first/.test(wipeRefused ?? ""), `Wipe Memories refused while full (${wipeRefused})`);
            let since = Date.now();
            await live().apply(ways.id, { choice: squeeze });
            const out = await h.messageAfter(since, h.itemCard("item"), { what: "the squeeze's item card" });
            await live().apply(out.id, {});
            await h.until(() => stored() === 0, `none held once squeezed out (${stored()}; ${JSON.stringify(resultsOf(out))})`, { timeout: 8000 });
            since = Date.now();
            await live().activate(sponge.uuid, 0);
            const wipe = await h.messageAfter(since, h.itemCard("cast"), { what: "Wipe Memories' cast card" });
            return { full, wipeRefused, wipe: stateOf(wipe).plan?.spell?.name ?? null };
        },

        // Jax's Dominate (userEffects kind "note" with PF2e's rules; scripts/live.js giveUserConditions): her Dominate on her own wielder, harsher
        // (−2, a degree worse) for a Lamashtu worshipper or a chaotic creature, and her orders after. Activated: the
        // cast card of Dominate, and beside it on its wielder the note Effects "Jax's judgment" (its FlatModifier −2 to Will and AdjustDegreeOfSuccess,
        // predicated on a Lamashtu worshipper or a chaotic creature and Dominate) and "Jax's orders". Its Will save with those roll options is 2
        // lower; without, as it was.
        async b4G5JaxJudgment(scene) {
            await h.clearSquares(scene, [[17, 12]]);
            const { actor: user } = await h.creature(scene, "Jax Wielder", { type: "character", x: 17, y: 12, level: 8 });
            const jax = await h.give(user, "Jax");
            await jax.update(held(2));
            const plain = modWith(user, "will", []);
            const cast = await activated(jax, 1, "cast", "Dominate's cast card");
            h.assert(/Dominate/.test(stateOf(cast).plan?.spell?.name ?? ""), `Dominate (${stateOf(cast).plan?.spell?.name})`);
            const judged = () => user.itemTypes.effect.find((effect) => /: Jax's judgment$/.test(effect.name));
            const orders = () => user.itemTypes.effect.find((effect) => /: Jax's orders$/.test(effect.name));
            await h.until(() => judged() && orders(), `the judgment's and the orders' note Effects (${effectNames(user)})`, { timeout: 8000 });
            const rules = judged().system.rules ?? [];
            h.assert(rules.some((rule) => rule.key === "FlatModifier" && Number(rule.value) === -2) && rules.some((rule) => rule.key === "AdjustDegreeOfSuccess"), `its −2 and one degree worse (${JSON.stringify(rules)})`);
            const chaotic = modWith(user, "will", ["self:trait:chaotic", "item:slug:dominate"]);
            const other = modWith(user, "will", ["item:slug:dominate"]);
            h.assert(chaotic === plain - 2 && other === plain, `−2 to a chaotic creature's Will save against Dominate only (${plain}; chaotic ${chaotic}; not ${other})`);
            return { plain, chaotic, other };
        },

        // Meloth's Lifedrinker (Level 7)'s Lifedrink (plan.lifedrink; scripts/lifedrink.js on the ability module's "applied" hook → src/live/card.js
        // runesAfter): a creature slain by Lifedrink's damage raises the sword's runes for good, step by step with its wielder's level. A
        // 16th-level wielder's Lifedrink at a creature with 1 Hit Point: its 1d6 void card applied, the creature
        // dead, the sword's runes now +3 potency and greater striking (its +1 and striking raised at 10th, 12th and 16th), the chat line saying so.
        async b4G5LifedrinkRunes(scene) {
            await h.clearSquares(scene, [[2, 1], [3, 1]]);
            const { actor: wielder } = await h.creature(scene, "Meloth Wielder", { type: "character", x: 2, y: 1, level: 16 });
            const { actor: victim, token: victimToken } = await h.creature(scene, "Lifedrink Victim", { x: 3, y: 1, hp: 1, level: 16, alliance: "opposition" });
            const sword = await h.give(wielder, "Meloth's Lifedrinker (Level 7)");
            await sword.update(held(1));
            const runes = () => wielder.items.get(sword.id)?.system?.runes ?? {};
            h.assert(Number(runes().potency) === 1 && Number(runes().striking) === 1, `+1 striking to begin with (${JSON.stringify(runes())})`);
            let since = Date.now();
            const card = await activated(sword, 0, "expose", "Lifedrink's card");
            await live().apply(card.id, { targets: [victimToken.uuid] });
            const drink = await h.messageAfter(since, h.abilitySaveCard, { what: "Lifedrink's 1d6 void card" });
            await h.applyAbilityCard(drink);
            await h.until(() => hpOf(victim) <= 0, `the creature slain by it (${hpOf(victim)})`, { timeout: 8000 });
            await h.until(() => Number(runes().potency) === 3 && Number(runes().striking) === 2, `+3 greater striking for a 16th-level wielder (${JSON.stringify(runes())})`, { timeout: 8000 });
            const line = await h.messageAfter(since, (message) => /slain\./.test(message.content ?? "") && /For good,/.test(message.content ?? ""), { what: "the line of its runes raised" });
            return { runes: runes(), line: textOf(line) };
        },

        // Tengu Feather Fan (src/compiler/special-sentences.js by its owner's feats; scripts/ways.js way.refund): Wind God's Fan gives Wave Fan
        // one more use a day and a 3rd-rank Wall of Wind in it; a heritage or ancestry-feat cantrip cast through it isn't counted as a use. Its
        // owner has PF2e's Wind God's Fan feat: the Wave Fan ways card's spell way is the cast card with
        // Gust of Wind (1st) and Wall of Wind (3rd); its cantrip way gives the activation's use back (0 used). Then activated twice more, no
        // warning; a fourth time, the GM's whisper "activated again, though it's twice per day".
        async b4G5TenguFanRefund(scene) {
            await h.clearSquares(scene, [[17, 15]]);
            const { actor: user } = await h.creature(scene, "Fan Tengu", { type: "character", x: 17, y: 15, level: 9 });
            await h.give(user, "Wind God's Fan", "pf2e.feats-srd");
            await h.until(() => (user.itemTypes.feat ?? []).some((feat) => feat.slug === "wind-gods-fan"), `the Wind God's Fan feat (${(user.itemTypes.feat ?? []).map((feat) => feat.slug).join(", ")})`, { timeout: 5000 });
            const fan = await h.give(user, "Tengu Feather Fan");
            await fan.update(held(1)).catch(() => null);
            // (Its uses this day as scripts/activations.js counts them on the item, out of an encounter.)
            const { usesNow } = await import(`/modules/${h.NS}/src/live/activations-card.js`);
            const frequency = { max: 2, per: "day" };
            const used = () => usesNow(user.items.get(fan.id)?.getFlag(h.NS, "activationUses") ?? {}, 0, frequency, { worldTime: game.time.worldTime, combatId: null });
            const warnings = (time) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= time && /activated again, though it's twice per day/.test(message.content ?? ""));
            const start = Date.now();
            const ways = await activated(fan, 0, "ways", "Wave Fan's ways card");
            h.assert(used() === 1, `one use counted (${used()})`);
            const spellWay = wayOf(ways, /^A spell the fan holds/);
            const cantrip = wayOf(ways, /^A cantrip/);
            let since = Date.now();
            await live().apply(ways.id, { choice: spellWay });
            const cast = await h.messageAfter(since, h.itemCard("cast"), { what: "the fan's cast card" });
            const offered = (stateOf(cast).plan?.choices ?? []).map((choice) => `${choice.spell?.name} ${choice.rank}`);
            h.assert(offered.includes("Gust of Wind 1") && offered.includes("Wall of Wind 3"), `Gust of Wind and, with the feat, Wall of Wind (${offered.join(", ")})`);
            since = Date.now();
            await live().apply(ways.id, { choice: cantrip });
            await h.until(() => used() === 0, `the use given back by the cantrip way (${used()})`, { timeout: 8000 });
            await live().activate(fan.uuid, 0);
            await live().activate(fan.uuid, 0);
            await h.wait(500);
            h.assert(!warnings(start).length && used() === 2, `twice more, no warning (${used()} used; ${warnings(start).length} warnings)`);
            since = Date.now();
            await live().activate(fan.uuid, 0);
            const warned = await h.messageAfter(since, (message) => /activated again, though it's twice per day/.test(message.content ?? ""), { what: "the GM's warning past twice a day" });
            return { offered, warning: textOf(warned) };
        }
    };
};
