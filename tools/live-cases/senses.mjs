// The senses group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// (Speeds, senses, forms and sizes — docs/mechanics.md "Speeds, senses, forms and sizes". Only the items whose live play is new code have a case
// here; the others feed mechanisms already checked live.)

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
// (tools/live-check.mjs's flag on its own fixtures, here for this file's encounters: its cleanup removes only those.)
const FIXTURE = "liveCheckFixture";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const abilityState = (message) => message.flags?.[ABILITY]?.card;
    // (The ability module's cards posted since then, and the one whose creatures include that actor.)
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const cardFor = (cards, actor) => cards.find((message) => (abilityState(message)?.targets ?? []).some((target) => target.actorUuid === actor.uuid));
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");

    // PF2e's ChoiceSet prompt (its PickAThingPrompt, an ApplicationV2) open now: answered with the first of the values wanted it offers, else
    // its first choice, as a click on it does (its selection set, then closed). → the value picked, or null with no prompt open.
    const promptOpen = () => [...foundry.applications.instances.values()].find((app) => app.rendered && Array.isArray(app.choices) && typeof app.resolveSelection === "function");
    async function answerPrompt(prefer = []) {
        const app = promptOpen();
        if (!app) return null;
        const choice = prefer.map((value) => app.choices.find((entry) => entry?.value === value)).find(Boolean) ?? app.choices[0] ?? null;
        app.selection = choice;
        await app.close();
        return String(choice?.value ?? "(none)");
    }

    // The spell module's cast card applied (its Resolve button, once it's there — none needed when the cast made the Effect already), its
    // caster-choices dialog applied as it stands and PF2e's ChoiceSet prompts answered (prefer: the values wanted), until test passes. → the
    // prompts' values picked.
    async function resolveSpellCard(cast, test, { prefer = [], timeout = 15000 } = {}) {
        const answered = [];
        const clicked = new Set();
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            if (test()) return answered;
            const resolve = document.querySelector(`[data-message-id="${cast.id}"] .pf2e-auto-runtime-resolve`);
            if (resolve && !clicked.has("resolve")) {
                clicked.add("resolve");
                resolve.click();
            }
            const choices = [...document.querySelectorAll(".application, .dialog, .window-app")].find((entry) => /caster choices/i.test(entry.querySelector(".window-title")?.textContent ?? ""));
            const apply = choices?.querySelector('button[data-action="apply"]');
            if (apply && !clicked.has(apply)) {
                clicked.add(apply);
                apply.click();
            }
            const value = await answerPrompt(prefer);
            if (value !== null) answered.push(value);
            await h.wait(200);
        }
        throw new Error(`Not the spell's Effect within ${timeout / 1000} seconds (Resolve ${clicked.has("resolve") ? "pressed" : "never there"}; prompts answered: ${answered.join(", ") || "none"}).`);
    }

    // Cloak of the False Foe's Cryptid Shape with one of its picks: Humanoid Form cast at that pick's rank, its Effect for that pick's own time
    // (choice.castDuration, scripts/casts.js) — the cast message's duration mark, and the Effect the spell card makes set to it.
    async function cryptidShape(scene, { name, x, y, when, rank, duration, size }) {
        assertSpells();
        await h.clearSquares(scene, [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
        const { actor: wearer, token } = await h.creature(scene, name, { type: "character", x, y, level: 12 });
        const cloak = await h.give(wearer, "Cloak of the False Foe");
        await cloak.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        await token.object?.control?.();
        const since = Date.now();
        await api().activate(cloak.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the cloak's cast card" });
        const choices = card.getFlag(h.NS, "card").plan.choices ?? [];
        const index = choices.findIndex((choice) => when.test(choice.when ?? ""));
        h.assert(index >= 0, `its pick for ${when} (${choices.map((choice) => choice.when).join("; ")})`);
        h.assert(choices[index].rank === rank && choices[index].castDuration?.value === duration.value && choices[index].castDuration?.unit === duration.unit, `rank ${rank} for ${duration.value} ${duration.unit} (${JSON.stringify(choices[index])})`);
        await api().apply(card.id, { choice: index });
        const cast = await castMessage(since);
        const flag = cast.flags[SPELLS].castFromItem;
        h.assert(flag.rank === rank, `cast at rank ${rank} (${flag.rank})`);
        await h.until(() => game.messages.get(cast.id)?.getFlag(h.NS, "castDuration"), "the cast's duration mark", { timeout: 8000 });
        const mark = game.messages.get(cast.id).getFlag(h.NS, "castDuration");
        h.assert(mark.value === duration.value && mark.unit === duration.unit, `its mark ${duration.value} ${duration.unit} (${JSON.stringify(mark)})`);
        const effect = () => wearer.itemTypes.effect.find((entry) => entry.system?.context?.origin?.item === mark.spellUuid);
        const answered = await resolveSpellCard(cast, () => Boolean(effect()), { prefer: [size] });
        await h.until(() => effect().system.duration.value === duration.value && effect().system.duration.unit === duration.unit, `its Effect for ${duration.value} ${duration.unit} (${JSON.stringify(effect()?.system?.duration)})`, { timeout: 8000 });
        return { effect: effect().name, duration: effect().system.duration, rank: flag.rank, answered, results: stateOf(card).results };
    }

    return {
        // Dawnlight (Greater) (dark-light.js; src/live/cast-card.js darkLightCounteract, scripts/casts.js, scripts/counteract.js, if-target.js lacks):
        // its Light cast, then the counteract card against the magical darkness at its +13 and Light's rank 3 + 1 = 4; counteracted (DC 15,
        // rank 3), the flash's Fortitude DC 23 card follows. Pressed at a creature with darkvision and one without: only the first gets a save card
        // (the other immune, a line), and its failure leaves it Dazzled.
        async sensesDawnlightFlash(scene) {
            assertSpells();
            await h.clearSquares(scene, [[2, 15], [3, 15], [3, 16]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Dawnlight Bearer", { type: "character", x: 2, y: 15, level: 7 });
            const { actor: seer, token: seerToken } = await h.creature(scene, "Dawnlight Darkvision", { x: 3, y: 15, alliance: "opposition", save: 8 });
            const { actor: plain, token: plainToken } = await h.creature(scene, "Dawnlight Plain", { x: 3, y: 16, alliance: "opposition", save: 8 });
            await seer.update({ "system.perception.senses": [{ type: "darkvision" }] });
            const senses = (actor) => [...(actor.system?.perception?.senses ?? []), ...(actor.perception?.senses ?? [])].map((sense) => String(sense?.type ?? sense));
            h.assert(senses(seer).includes("darkvision") && !senses(plain).includes("darkvision"), `darkvision on the one only (${senses(seer)} / ${senses(plain)})`);
            const symbol = await h.give(user, "Dawnlight (Greater)");
            await symbol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(symbol.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the symbol's cast card" });
            const light = (card.getFlag(h.NS, "card").plan.choices ?? []).findIndex((choice) => choice.spell?.name === "Light");
            h.assert(light >= 0, "Light among its spells");
            since = Date.now();
            await api().apply(card.id, { choice: light });
            const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "the counteract card against the darkness", timeout: 15000 });
            const counteract = counter.getFlag(h.NS, "card");
            h.assert(counteract.counteract.modifier === 13 && counteract.counteract.rank === 4, `+13 at rank 4 (+${counteract.counteract.modifier}, rank ${counteract.counteract.rank})`);
            h.assert(counteract.step === "pick" && counteract.rows?.[0]?.kind === "free" && counteract.counteract.flash, `the darkness's row, the flash after it (${JSON.stringify(counteract.rows)})`);
            since = Date.now();
            // (A 10: 23 against DC 15, a success — rank 3 darkness within rank 4 + 1.)
            await h.withDie(10, () => api().apply(counter.id, { rows: [{ ticked: true, dc: 15, rank: 3 }] }));
            await h.until(() => resultsOf(counter).some((line) => /, counteracted/.test(line)), `the darkness counteracted (${JSON.stringify(resultsOf(counter))})`, { timeout: 8000 });
            const flash = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && /flash/i.test(message.getFlag(h.NS, "card")?.plan?.source?.name ?? ""), { what: "the flash's save card" });
            since = Date.now();
            await api().apply(flash.id, { targets: [seerToken.uuid, plainToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the flash's Fortitude card" });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            h.assert(cards.length === 1 && cardFor(cards, seer) && !cardFor(cards, plain), `one card, for the creature with darkvision only (${cards.length})`);
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "fortitude" && check.against?.value === 23, `Fortitude DC 23 (${JSON.stringify(check)})`);
            h.assert(resultsOf(flash).some((line) => /Dawnlight Plain: immune/.test(line)), `the plain one's line (${JSON.stringify(resultsOf(flash))})`);
            // (A 10 and +8: 18 against DC 23, a failure.)
            await h.withDie(10, () => h.rollAndApply(save));
            await h.until(() => seer.hasCondition("dazzled"), `Dazzled on the creature with darkvision (${seer.itemTypes.condition.map((condition) => condition.slug)})`, { timeout: 10000 });
            h.assert(!plain.hasCondition("dazzled"), "the other not Dazzled");
            return { counteract: resultsOf(counter), flash: resultsOf(flash) };
        },

        // Dinosaur Boots (Greater) (trample.js; src/live/strike-as.js formulaInstances, scripts/poisons.js strikeDamage.slug): activated, PF2e's
        // Effect: Dinosaur Boots (Huge, the foot Strike) on its wearer and the Trample card kept open. Pressed at three creatures: one basic
        // Reflex DC 27 card whose damage is the foot Strike's formula as PF2e gives it (its 1d8, bludgeoning); with every die at 10, a success
        // takes half of a failure's damage and a critical failure double. Pressed again: another card, and still open.
        async sensesDinosaurTrample(scene) {
            const space = [];
            for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) space.push([x, y]);
            await h.clearSquares(scene, [...space, [8, 1], [8, 3], [8, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Dinosaur Stomper", { type: "character", x: 1, y: 1, level: 16 });
            // (A 10: +20 is 30 against DC 27, a success; +10 is 20, a failure; −5 is 5, a critical failure.)
            const { actor: dodger, token: dodgerToken } = await h.creature(scene, "Trample Dodger", { x: 8, y: 1, alliance: "opposition", hp: 100, save: 20 });
            const { actor: struck, token: struckToken } = await h.creature(scene, "Trample Struck", { x: 8, y: 3, alliance: "opposition", hp: 100, save: 10 });
            const { actor: crushed, token: crushedToken } = await h.creature(scene, "Trample Crushed", { x: 8, y: 5, alliance: "opposition", hp: 100, save: -5 });
            const boots = await h.give(user, "Dinosaur Boots (Greater)");
            await boots.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(boots.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the boots' card" });
            since = Date.now();
            await api().apply(card.id, {});
            const effect = () => user.itemTypes.effect.find((entry) => entry.name === "Effect: Dinosaur Boots");
            const foot = () => (user.system.actions ?? []).find((action) => action.slug === "dinosaur-boots-foot-attack");
            await h.until(() => effect() && foot(), `PF2e's Effect: Dinosaur Boots and its foot Strike (${effectNames(user)})`, { timeout: 8000 });
            h.assert(user.system.traits.size.value === "huge", `Huge, the Greater's (${user.system.traits.size.value})`);
            const trample = await h.messageAfter(since, h.itemCard("expose"), { what: "the Trample card" });
            h.assert(trample.getFlag(h.NS, "card").repeat && trample.getFlag(h.NS, "card").status === "open", "the Trample card kept open, each time");
            const before = { dodger: hp(dodger), struck: hp(struck), crushed: hp(crushed) };
            since = Date.now();
            await api().apply(trample.id, { targets: [dodgerToken.uuid, struckToken.uuid, crushedToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the Trample's Reflex card" });
            const plan = abilityState(save).plan;
            const check = plan.resolution.check;
            h.assert(check.statistic === "reflex" && check.basic && check.against?.value === 27, `basic Reflex DC 27 (${JSON.stringify(check)})`);
            const components = plan.resolution.sharedDamage?.components ?? [];
            h.assert(components.some((component) => /1d8/.test(component.formula) && component.type === "bludgeoning") && !components.some((component) => component.formula === "0"), `the foot's formula filled in (${JSON.stringify(components)})`);
            const multipliers = ["success", "failure", "criticalFailure"].map((degree) => plan.resolution.outcomes[degree]?.damage?.multiplier);
            h.assert(JSON.stringify(multipliers) === "[0.5,1,2]", `halved, full, doubled (${multipliers})`);
            await h.withDie(10, () => h.rollAndApply(save));
            await h.until(() => hp(dodger) < before.dodger && hp(struck) < before.struck && hp(crushed) < before.crushed, `damage on all three (${hp(dodger)}, ${hp(struck)}, ${hp(crushed)})`, { timeout: 10000 });
            await h.wait(500);
            const lost = { dodger: before.dodger - hp(dodger), struck: before.struck - hp(struck), crushed: before.crushed - hp(crushed) };
            h.assert(lost.dodger === Math.floor(lost.struck / 2) && lost.crushed === lost.struck * 2, `half and double the failure's (${JSON.stringify(lost)})`);
            h.assert(stateOf(trample).status === "open", `still open after one Trample (${stateOf(trample).status})`);
            since = Date.now();
            await api().apply(trample.id, { targets: [struckToken.uuid] });
            const again = await h.messageAfter(since, h.abilitySaveCard, { what: "the second Trample's card" });
            h.assert(cardFor([again], struck), "the second card at the creature pressed");
            h.assert(stateOf(trample).status === "open", `still open after two (${stateOf(trample).status})`);
            return { lost, components, uses: stateOf(trample).uses };
        },

        // Heartening Missive (Butterfly) (first-degree.js withOnceBetter; scripts/first-degree.js, several selectors): used at an ally, the ally
        // gets the 24-hour Effect of PF2e's AdjustDegreeOfSuccess on Diplomacy and Performance (and the missives' 24-hour immunity). Its failed
        // Diplomacy check is made a success by PF2e, and that roll removes the Effect. A second missive at it is refused: still immune.
        async sensesButterflyMissive(scene) {
            await h.clearSquares(scene, [[17, 13], [18, 13]]);
            const { actor: writer } = await h.creature(scene, "Butterfly Writer", { type: "character", x: 17, y: 13 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Butterfly Ally", { type: "character", x: 18, y: 13 });
            const send = async () => {
                const missive = await h.give(writer, "Heartening Missive (Butterfly)");
                const since = Date.now();
                await missive.consume();
                return h.messageAfter(since, h.itemCard("item"), { what: "the missive's card" });
            };
            const first = await send();
            await api().apply(first.id, { targets: [allyToken.uuid] });
            const better = (actor) => actor.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "firstDegree"));
            const immune = () => ally.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.immunity && /Heartening Missive/.test(effect.name));
            await h.until(() => better(ally) && immune(), `the ally's Effect and its immunity (${effectNames(ally)})`, { timeout: 8000 });
            h.assert(!better(writer), "none on the writer");
            const rules = (better(ally).system.rules ?? []).filter((rule) => rule.key === "AdjustDegreeOfSuccess");
            h.assert(rules.map((rule) => rule.selector).sort().join(",") === "diplomacy,performance" && rules.every((rule) => rule.adjustment?.failure === "one-degree-better"), `Diplomacy and Performance, a failure one better (${JSON.stringify(rules)})`);
            const time = better(ally).system.duration;
            h.assert(time.value === 24 && time.unit === "hours", `for 24 hours (${JSON.stringify(time)})`);
            // (A 10 at 5 under its DC: a failure.)
            const dc = Number(ally.skills.diplomacy.mod) + 15;
            const since = Date.now();
            await h.withDie(10, () => ally.skills.diplomacy.roll({ dc: { value: dc }, skipDialog: true }));
            const rolled = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.actor?.id === ally.id, { what: "the Diplomacy check" });
            const { outcome, unadjustedOutcome } = rolled.flags.pf2e.context;
            h.assert(unadjustedOutcome === "failure" && outcome === "success", `a failure made a success (${unadjustedOutcome} → ${outcome})`);
            await h.until(() => !better(ally), "the Effect gone after that roll", { timeout: 8000 });
            const second = await send();
            let refused = null;
            await api().apply(second.id, { targets: [allyToken.uuid] }).catch((error) => {
                refused = error.message;
            });
            h.assert(/still immune/.test(refused ?? ""), `the second missive refused (${refused})`);
            h.assert(stateOf(second).status !== "applied" && !better(ally), `nothing applied (${stateOf(second).status})`);
            return { outcome, unadjustedOutcome, refused };
        },

        // Corpseward Pendant (undead-ward.js; scripts/ends-on-hostile.js "air-ends-on:attack"): activated, its wearer's 10-minute ward Effect and
        // the undead's save card kept open. Pressed at a zombie and a human: a Will DC 18 card for the zombie only (the human immune, a line).
        // The zombie's success gives it the 24-hour immunity Effect; the ward stays. Then the wearer's Strike roll ends the ward.
        async sensesCorpsewardWard(scene) {
            await h.clearSquares(scene, [[14, 12], [15, 12], [15, 13]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Corpseward Wearer", { type: "character", x: 14, y: 12, level: 5 });
            // (A 10 and +15: 25 against DC 18, a success.)
            const { actor: zombie, token: zombieToken } = await h.creature(scene, "Corpseward Zombie", { x: 15, y: 12, alliance: "opposition", save: 15 });
            const { actor: human, token: humanToken } = await h.creature(scene, "Corpseward Human", { x: 15, y: 13, alliance: "opposition", save: 15 });
            await zombie.update({ "system.traits.value": ["undead", "zombie"] });
            await human.update({ "system.traits.value": ["human", "humanoid"] });
            const dagger = await h.give(wearer, "Dagger");
            await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const pendant = await h.give(wearer, "Corpseward Pendant");
            await pendant.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await wearerToken.object?.control?.();
            let since = Date.now();
            await api().activate(pendant.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the pendant's card" });
            since = Date.now();
            await api().apply(card.id, {});
            const ward = () => wearer.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-ends-on:attack"));
            await h.until(() => ward(), `the ward Effect, ended by an attack (${effectNames(wearer)})`, { timeout: 8000 });
            h.assert(ward().system.duration.value === 10 && ward().system.duration.unit === "minutes", `for 10 minutes (${JSON.stringify(ward().system.duration)})`);
            const watch = await h.messageAfter(since, h.itemCard("expose"), { what: "the undead's save card" });
            h.assert(watch.getFlag(h.NS, "card").repeat, "kept open for the 10 minutes");
            since = Date.now();
            await api().apply(watch.id, { targets: [zombieToken.uuid, humanToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the zombie's Will card" });
            await h.wait(1000);
            const cards = abilityCardsSince(since);
            h.assert(cards.length === 1 && cardFor(cards, zombie) && !cardFor(cards, human), `a card for the zombie only (${cards.length})`);
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && check.against?.value === 18, `Will DC 18 (${JSON.stringify(check)})`);
            h.assert(resultsOf(watch).some((line) => /Corpseward Human: immune/.test(line)), `the human's line (${JSON.stringify(resultsOf(watch))})`);
            await h.withDie(10, () => h.rollAndApply(save));
            const immune = () => zombie.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.immunity && /Corpseward/.test(effect.name));
            await h.until(() => immune(), `the zombie's immunity (${effectNames(zombie)})`, { timeout: 10000 });
            h.assert(immune().system.duration.value === 24 && immune().system.duration.unit === "hours", `for 24 hours (${JSON.stringify(immune().system.duration)})`);
            h.assert(ward(), "the ward kept after the zombie's save");
            h.assert(stateOf(watch).status === "open", `the undead's card still open (${stateOf(watch).status})`);
            await h.strike(wearer, dagger);
            await h.until(() => !ward(), "the ward ended by its wearer's Strike", { timeout: 8000 });
            return { immunity: immune().name, results: resultsOf(watch) };
        },

        // Fiendish Teleportation (cast-arrival.js; scripts/cast-arrival.js, src/live/arrival.js adjacentTo): Translocate cast from the card, then
        // its user's token moved 60 feet. The ability module's 2d6 spirit card (no roll) goes to the creature beside the square it left and the
        // one beside the square it arrived in, once each — not to its user, nor to one beside neither; applied, both lose the same Hit Points.
        async sensesFiendishBrimstone(scene) {
            assertSpells();
            return h.unpaused(async () => {
                const around = ([x, y]) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [x + dx, y + dy]));
                await h.clearSquares(scene, [...around([2, 8]), ...around([14, 8]), [8, 8]]);
                const { actor: user, token: userToken } = await h.creature(scene, "Fiendish Traveler", { type: "character", x: 2, y: 8, level: 11 });
                const { actor: left } = await h.creature(scene, "Brimstone Left", { x: 2, y: 9, alliance: "opposition", hp: 60 });
                const { actor: arrived } = await h.creature(scene, "Brimstone Arrived", { x: 15, y: 8, alliance: "opposition", hp: 60 });
                const { actor: far } = await h.creature(scene, "Brimstone Far", { x: 8, y: 8, alliance: "opposition", hp: 60 });
                const contract = await h.give(user, "Fiendish Teleportation");
                await contract.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.equipped.invested": true });
                await userToken.object?.control?.();
                let since = Date.now();
                await api().activate(contract.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the contract's cast card" });
                await api().apply(card.id, {});
                await castMessage(since);
                await h.wait(1000);
                const before = { left: hp(left), arrived: hp(arrived), far: hp(far), user: hp(user) };
                const size = canvas.grid.size;
                since = Date.now();
                await userToken.update({ x: 14 * size, y: 8 * size }, { animate: false });
                await h.until(() => userToken.x === 14 * size, "the traveler 60 feet on", { timeout: 8000 });
                const brimstone = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && /brimstone/i.test(abilityState(message)?.plan?.source?.name ?? ""), { what: "the brimstone's damage card", timeout: 10000 });
                const targets = (abilityState(brimstone).targets ?? []).map((target) => target.actorUuid);
                h.assert(targets.length === 2 && targets.includes(left.uuid) && targets.includes(arrived.uuid), `the two beside its spaces (${targets.length}: ${targets.join(", ")})`);
                h.assert(!targets.includes(user.uuid) && !targets.includes(far.uuid), "not its user nor the one beside neither");
                const components = abilityState(brimstone).plan.resolution.sharedDamage?.components ?? [];
                h.assert(components[0]?.formula === "2d6" && components[0]?.type === "spirit", `2d6 spirit (${JSON.stringify(components)})`);
                await h.applyAbilityCard(brimstone);
                await h.until(() => hp(left) < before.left && hp(arrived) < before.arrived, `damage beside both spaces (${hp(left)}, ${hp(arrived)})`, { timeout: 10000 });
                await h.wait(800);
                const lost = { left: before.left - hp(left), arrived: before.arrived - hp(arrived) };
                h.assert(lost.left === lost.arrived && lost.left >= 2 && lost.left <= 12, `one 2d6 roll for both, once each (${JSON.stringify(lost)})`);
                h.assert(hp(far) === before.far && hp(user) === before.user, `none on the far one or its user (${hp(far)}, ${hp(user)})`);
                h.assert(abilityCardsSince(since).filter((message) => /brimstone/i.test(abilityState(message)?.plan?.source?.name ?? "")).length === 1, "one brimstone card");
                return { lost, results: resultsOf(card) };
            });
        },

        // Cloak of the False Foe's Cryptid Shape, its Large cryptid (cryptid-shape.js; scripts/casts.js choice.castDuration): Humanoid Form cast at
        // rank 5, its Effect for 10 minutes.
        async sensesCryptidLarge(scene) {
            return cryptidShape(scene, { name: "Large Cryptid", x: 11, y: 1, when: /Large/, rank: 5, duration: { value: 10, unit: "minutes" }, size: "large" });
        },

        // Cloak of the False Foe's Cryptid Shape, its Medium cryptid: Humanoid Form cast at rank 3, its Effect for 1 hour (not the spell's own 10
        // minutes) — the pick's own time, choice.castDuration.
        async sensesCryptidMedium(scene) {
            return cryptidShape(scene, { name: "Medium Cryptid", x: 14, y: 4, when: /Medium/, rank: 3, duration: { value: 1, unit: "hours" }, size: "medium" });
        },

        // Bestiary of Metamorphosis's Shifting Form (reshape.js; scripts/reshape.js, src/live/reshape.js): its user under PF2e's Spell Effect:
        // Elemental Form (air) with 10 minutes left. Activated, the Effect is made again with its pick cleared: PF2e prompts for the element (fire
        // picked), the new Effect lasts 50 rounds (half the 600 seconds left), and the old one is gone.
        async sensesShiftingForm(scene) {
            await h.clearSquares(scene, [[16, 1], [17, 1], [16, 2], [17, 2]]);
            const { actor: user, token } = await h.creature(scene, "Shifting Reader", { type: "character", x: 16, y: 1, level: 10 });
            const form = await h.give(user, "Spell Effect: Elemental Form", "pf2e.spell-effects");
            await form.update({ "system.duration.value": 10, "system.duration.unit": "minutes", "system.start.value": game.time.worldTime });
            const element = (effect) => effect?.system?.rules?.find((rule) => rule.key === "ChoiceSet")?.selection ?? effect?.flags?.pf2e?.rulesSelections?.spellEffectElementalForm ?? null;
            h.assert(element(user.items.get(form.id)) === "air", `air to start (${element(user.items.get(form.id))})`);
            const book = await h.give(user, "Bestiary of Metamorphosis");
            await book.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await token.object?.control?.();
            const since = Date.now();
            await api().activate(book.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the bestiary's card" });
            // (Its Apply waits on PF2e's prompt for the new form: answered while it waits.)
            let failed = null;
            const applying = api().apply(card.id, {}).catch((error) => {
                failed = error;
            });
            let picked = null;
            for (const end = Date.now() + 10000; Date.now() < end && picked === null && !failed; ) {
                picked = await answerPrompt(["fire"]);
                if (picked === null) await h.wait(150);
            }
            await applying;
            if (failed) throw failed;
            h.assert(picked === "fire", `PF2e's prompt for the form, fire picked (${picked})`);
            const made = () => user.itemTypes.effect.find((effect) => /Elemental Form/.test(effect.name) && effect.id !== form.id);
            await h.until(() => made() && !user.items.get(form.id), `the new form, the old gone (${effectNames(user)})`, { timeout: 8000 });
            const time = made().system.duration;
            h.assert(time.value === 50 && time.unit === "rounds", `50 rounds, half the 10 minutes left (${JSON.stringify(time)})`);
            h.assert(element(made()) === "fire", `fire now (${element(made())})`);
            h.assert(resultsOf(card).some((line) => /half what was left/.test(line)), `its line (${JSON.stringify(resultsOf(card))})`);
            return { duration: time, element: element(made()), results: resultsOf(card) };
        },

        // Bloodhammer Reserve Black Label (animal-brew.js; src/live/card.js effectSource application.battleTempHP): Bull picked on the ways card —
        // PF2e's Spell Effect: Animal Form (Bull) at rank 4, every BattleForm bracket's temporary Hit Points 20, and its drinker given 20.
        async sensesBlackLabelBull(scene) {
            await h.clearSquares(scene, [[5, 12], [6, 12], [5, 13], [6, 13]]);
            const { actor: drinker } = await h.creature(scene, "Black Label Drinker", { type: "character", x: 5, y: 12, level: 8 });
            const brew = await h.give(drinker, "Bloodhammer Reserve Black Label");
            let since = Date.now();
            await brew.consume();
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the brew's ways card" });
            const bull = (ways.getFlag(h.NS, "card").plan.ways ?? []).findIndex((way) => /Bull/.test(way.name));
            h.assert(bull >= 0, "Bull among its ways");
            since = Date.now();
            await api().apply(ways.id, { choice: bull });
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the Bull way's card" });
            await api().apply(card.id, { drinker: 0 });
            const effect = () => drinker.itemTypes.effect.find((entry) => entry.name === "Spell Effect: Animal Form (Bull)");
            await h.until(() => effect(), `PF2e's Animal Form (Bull) (${effectNames(drinker)})`, { timeout: 8000 });
            h.assert(Number(effect().system.level?.value) === 4, `rank 4 (${effect().system.level?.value})`);
            const form = (effect().system.rules ?? []).find((rule) => rule.key === "BattleForm");
            const brackets = form?.brackets ?? form?.value?.brackets ?? [];
            h.assert(brackets.length && brackets.every((bracket) => Number(bracket.value?.tempHP) === 20), `20 temporary Hit Points on each bracket (${brackets.map((bracket) => bracket.value?.tempHP)})`);
            await h.until(() => Number(drinker.system.attributes.hp.temp) === 20, `20 temporary Hit Points on the drinker (${drinker.system.attributes.hp.temp})`, { timeout: 8000 });
            return { level: effect().system.level?.value, temp: drinker.system.attributes.hp.temp };
        },

        // Enigma-Sight Potion (cast-note.js; scripts/casts.js castNote): drunk, Truesight cast, and the drinker's 10-minute 'Enigma sight' note
        // Effect with its own Perception modifier and half its level (11 → 6) filled in, and the critical failure's Stupefied and Stunned.
        async sensesEnigmaSight(scene) {
            assertSpells();
            await h.clearSquares(scene, [[9, 15]]);
            const { actor: drinker } = await h.creature(scene, "Enigma Drinker", { type: "character", x: 9, y: 15, level: 11 });
            const potion = await h.give(drinker, "Enigma-Sight Potion");
            const since = Date.now();
            await potion.consume();
            const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the potion's cast card" });
            await api().apply(card.id, { drinker: 0 });
            const cast = await castMessage(since);
            h.assert(/Truesight/.test(cast.flavor ?? "") || /Truesight/.test(cast.content ?? "") || cast.item?.name === "Truesight", "Truesight cast");
            const note = () => drinker.itemTypes.effect.find((effect) => /Enigma sight/.test(effect.name));
            await h.until(() => note(), `the Enigma sight note (${effectNames(drinker)})`, { timeout: 8000 });
            const perception = Number(drinker.perception?.mod ?? drinker.system?.perception?.mod);
            const words = note().system.description.value;
            const signed = `${perception >= 0 ? "+" : ""}${perception}`;
            h.assert(words.includes(`(${signed})`) && words.includes("(6)"), `its Perception ${signed} and rank 6 (${words})`);
            h.assert(/Stupefied 1 for 1d4 rounds and Stunned 1/.test(words), `the critical failure's conditions (${words})`);
            h.assert(note().system.duration.value === 10 && note().system.duration.unit === "minutes", `for 10 minutes (${JSON.stringify(note().system.duration)})`);
            return { words, results: resultsOf(card) };
        },

        // Implosion Dust (Lesser) (implosion.js; scripts/implosion.js at pf2e.endTurn): at an ooze in combat, its Fortitude DC 20 failed — the
        // 'Imploded' note Effect, one CreatureSize −1 (Medium → Small) and −2 melee damage. At the end of the ooze's turns the GM's client rolls the
        // save: a failure shrinks it again (Tiny, −4), a success grows it a step back (Small), and the next success ends it (Medium, the Effect gone).
        async sensesImplosionShrink(scene) {
            await h.clearSquares(scene, [[6, 18], [7, 18]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Implosion Thrower", { type: "character", x: 6, y: 18 });
            // (A 10 and +5: 15 against DC 20, a failure; +12 later: 22, a success.)
            const { actor: ooze, token: oozeToken } = await h.creature(scene, "Implosion Ooze", { x: 7, y: 18, alliance: "opposition", hp: 100, save: 5 });
            await ooze.update({ "system.traits.value": ["ooze", "mindless"], "system.traits.size.value": "med" });
            const dust = await h.give(user, "Implosion Dust (Lesser)");
            const marked = (effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && /^air-implosion:fortitude:20$/.test(String(rule.option ?? "")));
            const imploded = () => ooze.itemTypes.effect.find(marked);
            const steps = () => (imploded()?.system.rules ?? []).filter((rule) => rule.key === "CreatureSize").length;
            const penalty = () => Number((imploded()?.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && rule.selector === "melee-damage")?.value ?? 0);
            const size = () => ooze.system.traits.size.value;
            const now = () => `${steps()} steps, ${size()}, ${penalty()}`;
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
            try {
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: oozeToken.id, sceneId: scene.id, actorId: ooze.id, initiative: 20 }, { tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 10 }]);
                await combat.startCombat();
                await h.wait(500);
                let since = Date.now();
                await dust.consume();
                const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the dust's card" });
                since = Date.now();
                await api().apply(card.id, { targets: [oozeToken.uuid] });
                const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the ooze's Fortitude card" });
                await h.withDie(10, () => h.rollAndApply(save));
                await h.until(() => imploded() && steps() === 1 && size() === "sm", `Imploded, a step smaller (${effectNames(ooze)}; ${now()})`, { timeout: 10000 });
                h.assert(penalty() === -2, `−2 melee damage (${penalty()})`);
                h.assert(imploded().system.duration.value === 6 && imploded().system.duration.unit === "rounds", `for 6 rounds (${JSON.stringify(imploded().system.duration)})`);
                // (Its turn ends: the save rolled at 15, a failure — a step more.)
                const saves = [];
                const saveAfter = async (at) => saves.push((await h.messageAfter(at, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.actor?.id === ooze.id, { what: "the ooze's end-of-turn save", timeout: 10000 })).flags.pf2e.context.outcome);
                since = Date.now();
                await h.withDie(10, async () => {
                    await combat.nextTurn();
                    await h.until(() => steps() === 2 && size() === "tiny", `two steps, Tiny (${now()})`, { timeout: 10000 });
                });
                await saveAfter(since);
                h.assert(penalty() === -4, `−4 melee damage for two steps (${penalty()})`);
                // (Its next turn ends: at 22, a success — a step back.)
                await ooze.update({ "system.saves.fortitude.value": 12 });
                since = Date.now();
                await h.withDie(10, async () => {
                    await combat.nextTurn();
                    await combat.nextTurn();
                    await h.until(() => steps() === 1 && size() === "sm", `one step again, Small (${now()})`, { timeout: 10000 });
                });
                await saveAfter(since);
                // (And the next: a success with one step left — back to its normal size, the Effect gone.)
                since = Date.now();
                await h.withDie(10, async () => {
                    await combat.nextTurn();
                    await combat.nextTurn();
                    await h.until(() => !imploded() && size() === "med", `its normal size, the Effect gone (${effectNames(ooze)}; ${size()})`, { timeout: 10000 });
                });
                await saveAfter(since);
                h.assert(JSON.stringify(saves) === '["failure","success","success"]', `its saves (${saves})`);
                return { saves, size: size() };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Animated (Set Free) on a +2 greater striking flaming longsword (self-fighting.js; src/live/self-fighting.js, scripts/poisons.js
        // selfFighting): activated, the weapon's Strike card kept open. Pressed at an enemy: the ability module's attack card at +26 (24 and its
        // potency), 3d8 slashing and 1d6 fire, then the DC 6 flat check — at 10 it fights on and the card stays open; pressed again at 3, the
        // card closes and Set Free waits its 10 minutes (activated again: the GM's warning of the wait).
        async sensesAnimatedSetFree(scene) {
            await h.clearSquares(scene, [[10, 10], [11, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Animated Wielder", { type: "character", x: 10, y: 10, level: 13 });
            const { token: foeToken } = await h.creature(scene, "Animated Foe", { x: 11, y: 10, alliance: "opposition", hp: 100 });
            const sword = await h.give(user, "Longsword");
            await sword.update({ "system.runes": { potency: 2, striking: 2, property: ["flaming", "animated"] }, "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await userToken.object?.control?.();
            const index = "rune:animated:0";
            let since = Date.now();
            await api().activate(sword.uuid, index);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "Set Free's card" });
            since = Date.now();
            await api().apply(card.id, {});
            const strike = await h.messageAfter(since, h.itemCard("expose"), { what: "the weapon's Strike card" });
            const state = strike.getFlag(h.NS, "card");
            h.assert(state.repeat && state.plan?.selfFighting?.base === 24 && state.plan.selfFighting.flat === 6, `kept open, +24 and its DC 6 flat check (${JSON.stringify(state.plan?.selfFighting)})`);
            since = Date.now();
            await h.withDie(10, () => api().apply(strike.id, { targets: [foeToken.uuid] }));
            const attack = await h.messageAfter(since, h.abilitySaveCard, { what: "the weapon's attack card" });
            const plan = abilityState(attack).plan;
            h.assert(plan.resolution.check.modifier === 26 && plan.resolution.check.against?.statistic === "ac", `+26 against AC (${JSON.stringify(plan.resolution.check)})`);
            const components = (plan.resolution.sharedDamage?.components ?? []).map((component) => [component.formula, component.type]);
            h.assert(JSON.stringify(components) === '[["3d8","slashing"],["1d6","fire"]]', `3d8 slashing and 1d6 fire (${JSON.stringify(components)})`);
            const flat = await h.messageAfter(since, (message) => /flat check \(DC 6\)/.test(message.flavor ?? ""), { what: "its flat check" });
            h.assert(flat.rolls?.[0]?.total === 10 && stateOf(strike).status === "open", `fights on at 10, still open (${flat.rolls?.[0]?.total}, ${stateOf(strike).status})`);
            since = Date.now();
            await h.withDie(3, () => api().apply(strike.id, { targets: [foeToken.uuid] }));
            await h.until(() => stateOf(strike).status === "applied", `the card closed at 3 (${stateOf(strike).status})`, { timeout: 8000 });
            h.assert(resultsOf(strike).some((line) => /usable again in 10 minutes/.test(line)), `its line (${JSON.stringify(resultsOf(strike))})`);
            const waits = user.items.get(sword.id).getFlag(h.NS, "activationRecharges") ?? {};
            since = Date.now();
            await api().activate(sword.uuid, index);
            await h.messageAfter(since, (message) => /Animated/.test(message.content ?? "") && /usable again only in 10 minutes/.test(message.content ?? ""), { what: `the GM's warning of Set Free's 10-minute wait (the weapon's waits: ${JSON.stringify(waits)}, the activation's index ${index})` });
            return { components, waits, results: resultsOf(strike) };
        }
    };
};
