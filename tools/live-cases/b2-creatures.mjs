// The second batch's creatures group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// (Creatures an item makes or controls, and its user's companion — docs/mechanics.md "Creatures read sentence by sentence" and after. Only the
// items whose live play is new code have a case here: scripts/creature-pick.js, src/live/conjured.js conjuredChanges in scripts/zones.js
// finishConjured, the conjured creature's own Effect with its words, src/live/ends-own.js in scripts/live.js, scripts/slain-wait.js with
// zones.js's count, the week in src/live/activations-card.js, and src/live/counteract-card.js afterFreeRules in scripts/counteract.js. The
// others feed mechanisms already checked live: note Effects, ways cards, later save cards, table and fortune cards, slot costs, casts.)

const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const effectNames = (actor) => (actor?.itemTypes?.effect ?? []).map((effect) => effect.name).join(", ") || "none";
    const traitsOf = (actor) => [...(actor?.system?.traits?.value ?? [])];
    // (The squares around one, for h.clearSquares: a conjured creature goes in the first free ring around its maker.)
    const around = (x, y, reach = 2) => {
        const squares = [];
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (x + dx >= 0 && y + dy >= 0 && x + dx < 20 && y + dy < 20) squares.push([x + dx, y + dy]);
        return squares;
    };
    // (The ability module's conjured tokens a maker's token made — its flag conjured { itemUuid, itemName, sourceTokenUuid } — on the lab.)
    const conjuredBy = (scene, makerToken, test = () => true) => scene.tokens.filter((token) => {
        const conjured = token.actor?.flags?.[ABILITY]?.conjured;
        return Boolean(conjured) && conjured.sourceTokenUuid === makerToken.uuid && test(conjured);
    });
    // (This case's own only: the tokens and world actors conjured from its maker's token — the runner's cleanup doesn't know them, as they carry
    // the bestiary's flags, not this check's fixture flag.)
    async function dismissConjured(scene, makerToken) {
        const tokens = conjuredBy(scene, makerToken);
        if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens.map((token) => token.id)).catch(() => null);
        const actors = game.actors.filter((actor) => actor.flags?.[ABILITY]?.conjured?.sourceTokenUuid === makerToken.uuid);
        if (actors.length) await Actor.deleteDocuments(actors.map((actor) => actor.id)).catch(() => null);
    }
    // (The ability module's conjure card for an actor it made: its "Lasts …" and the plan's notes as its lines.)
    const conjureCardFor = (since, actorId) => h.messageAfter(since, (message) => (message.flags?.[ABILITY]?.conjureCard?.actorIds ?? []).includes(actorId), { what: "the conjure card", timeout: 10000 });
    // (A DialogV2 of that title holding the creature list, scripts/creature-pick.js — found without its rendered flag: in a hidden pane a frame
    // may never be drawn, the lead's run of 2026-10-27.)
    async function pickDialog(title, { timeout = 20000 } = {}) {
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            const app = [...foundry.applications.instances.values()].find((entry) => entry.constructor.name === "DialogV2" && entry.title === title && entry.element?.querySelector?.("select[name=creature]"));
            if (app) return app;
            await h.wait(150);
        }
        throw new Error(`No "${title}" creature pick within ${timeout / 1000} seconds.`);
    }
    // (Petrified as PF2e has it: a condition item, or one a GrantItem gave in memory — kept in the actor's conditions, not its items.)
    const petrified = (actor) => Boolean(actor?.hasCondition?.("petrified")) || (actor?.conditions?.bySlug?.("petrified") ?? []).length > 0;
    const speedOf = (actor) => Number(actor?.system?.movement?.speeds?.land?.value ?? actor?.system?.attributes?.speed?.value);

    return {
        // Dust of Corpse Animation (scripts/creature-pick.js, src/live/conjured.js pickCandidates/pickedPlan, scripts/zones.js startItemConjure):
        // "You sprinkle the dust on a corpse … the corpse rises as a skeleton or zombie of 3rd level or lower … a minion … for 1 minute." The
        // dust used (it's used up, quantity 1), the pick opens before anything is made: a list of PF2e's skeletons and zombies of level 3 or lower
        // (each option "Name (level)"), its "Only with a corpse …" line above it. Skeletal Champion picked: its token beside its user, on its
        // side, with the minion trait, the dust gone from the inventory, and the ability module's conjure card lasting 1 minute with the
        // reading's lines (Command it this turn, four minions at most). (Oil of Dynamism and Fauna Guardian use the same pick.)
        async b2CreaturesDustPick(scene) {
            await h.clearSquares(scene, around(2, 2));
            const { actor: user, token: userToken } = await h.creature(scene, "Dust Animator", { type: "character", x: 2, y: 2, level: 8 });
            const dust = await h.give(user, "Dust of Corpse Animation");
            h.assert(Number(dust.system.quantity) === 1, `one dust, to be used up (${dust.system.quantity})`);
            const made = () => conjuredBy(scene, userToken, (conjured) => /^Dust of Corpse Animation/.test(conjured.itemName ?? ""));
            let dialog = null;
            try {
                const since = Date.now();
                await dust.consume();
                dialog = await pickDialog("Dust of Corpse Animation");
                const root = dialog.element;
                const select = root.querySelector("select[name=creature]");
                const options = [...select.options].map((option) => ({ value: option.value, text: option.textContent.trim(), level: Number(/\((-?\d+)\)$/.exec(option.textContent.trim())?.[1]) }));
                h.assert(options.length > 1 && options.every((option) => Number.isFinite(option.level) && option.level <= 3), `skeletons and zombies of level 3 or lower only (${options.map((option) => option.text).join(", ")})`);
                h.assert(options.some((option) => /^Zombie Shambler \(/.test(option.text)) && !options.some((option) => /^(?:Zombie Hulk|Skeletal Hulk) \(/.test(option.text)), `zombies too, none higher (${options.map((option) => option.text).join(", ")})`);
                h.assert(/Only with a corpse/.test(root.textContent ?? ""), `its needs line above the list (${root.textContent})`);
                const champion = options.find((option) => /^Skeletal Champion \(/.test(option.text));
                h.assert(champion, `Skeletal Champion offered (${options.map((option) => option.text).join(", ")})`);
                select.value = champion.value;
                const choose = root.querySelector('button[data-action="make"]');
                h.assert(choose, "the pick's Choose button");
                choose.click();
                await h.until(() => made().length === 1, `the skeletal champion's token (${made().map((token) => token.name).join(", ") || "none"})`, { timeout: 15000 });
                dialog = null;
                const [token] = made();
                const actor = token.actor;
                h.assert(/Skeletal Champion/.test(actor.name) && traitsOf(actor).includes("minion") && traitsOf(actor).includes("skeleton"), `a Skeletal Champion with the minion trait (${actor.name}: ${traitsOf(actor).join(", ")})`);
                h.assert(token.disposition === userToken.disposition, `on its user's side (${token.disposition} / ${userToken.disposition})`);
                h.assert(!user.items.get(dust.id) || Number(user.items.get(dust.id).system.quantity) === 0, `the dust used up (${user.items.get(dust.id)?.system?.quantity})`);
                const card = await conjureCardFor(since, token.actorId);
                h.assert(/Lasts 1 minutes?/.test(card.content) && /Command it this turn/.test(card.content) && /four minions/.test(card.content), `its minute and its lines on the conjure card (${card.content})`);
                return { picked: champion.text, offered: options.length, name: actor.name, traits: traitsOf(actor) };
            } finally {
                // (Its pick left open by a failure: closed, as an open dialog fails the next case.)
                if (dialog) await dialog.close().catch(() => null);
                await dismissConjured(scene, userToken);
            }
        },

        // Galvasphere (scripts/zones.js finishConjured with src/live/conjured.js conjuredChanges — removeTraits, own.dropWeaknesses, a linked
        // creature's size): "the corpse rises as a galvaheart zombie … it uses the statistics of a zombie shambler, except it's a construct
        // instead of undead, it doesn't have the unholy trait, and it's immune to vitality damage … Small or Medium, as the corpse." Used, its
        // ways card's "A Small corpse": PF2e's Zombie Shambler beside its user with minion, construct, mindless and zombie, neither undead nor
        // unholy; vitality among its immunities (its own still there), no vitality weakness (its slashing one kept), and Small.
        async b2CreaturesGalvasphereSmall(scene) {
            await h.clearSquares(scene, around(7, 2));
            const { actor: user, token: userToken } = await h.creature(scene, "Galva Tinker", { type: "character", x: 7, y: 2, level: 4 });
            const sphere = await h.give(user, "Galvasphere");
            const made = () => conjuredBy(scene, userToken, (conjured) => /^Galvasphere/.test(conjured.itemName ?? ""));
            try {
                let since = Date.now();
                await sphere.consume();
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the galvasphere's ways card" });
                const names = ways.getFlag(h.NS, "card").plan.ways.map((way) => way.name);
                const small = names.indexOf("A Small corpse");
                h.assert(small >= 0 && names.includes("A Medium corpse"), `a Medium and a Small corpse (${names.join(", ")})`);
                since = Date.now();
                await api().apply(ways.id, { choice: small });
                await h.until(() => made().length === 1, "the galvaheart zombie's token", { timeout: 15000 });
                const zombie = () => made()[0].actor;
                // (The item module finishes the actor after the ability module made it.)
                await h.until(() => traitsOf(zombie()).includes("construct") && !traitsOf(zombie()).includes("undead") && zombie().system.traits.size.value === "sm", `a Small construct (${traitsOf(zombie()).join(", ")}; ${zombie().system.traits.size.value})`, { timeout: 8000 });
                const traits = traitsOf(zombie());
                h.assert(["minion", "construct", "mindless", "zombie"].every((trait) => traits.includes(trait)) && !traits.includes("unholy"), `minion, construct, mindless, zombie, not unholy (${traits.join(", ")})`);
                const immune = (zombie().system.attributes.immunities ?? []).map((entry) => entry.type);
                h.assert(immune.includes("vitality") && immune.includes("disease"), `immune to vitality, its own immunities kept (${immune.join(", ")})`);
                const weak = (zombie().system.attributes.weaknesses ?? []).map((entry) => `${entry.type} ${entry.value}`);
                h.assert(!weak.some((entry) => entry.startsWith("vitality")) && weak.some((entry) => entry.startsWith("slashing")), `no vitality weakness, its slashing one kept (${weak.join(", ") || "none"})`);
                h.assert(/Zombie|Galvaheart/.test(zombie().name), `the zombie's name (${zombie().name})`);
                return { name: zombie().name, traits, immune, weak, size: zombie().system.traits.size.value, results: resultsOf(ways) };
            } finally {
                await dismissConjured(scene, userToken);
            }
        },

        // Kotodama Bells' Awaken the Soul (src/compiler/creature-readings.js; scripts/zones.js finishConjured's own Effect): "the object becomes
        // a minion … It has AC 5, 5 Hit Points, and a Speed of 10 feet … it automatically fails all saving throws." Activated: a Tiny "Awakened
        // object" token beside its user with AC 5, 5 Hit Points, a land Speed of 10 and the minion trait, and its own Effect with PF2e's
        // AdjustDegreeOfSuccess (saving-throw, all to-failure). Its Reflex save rolled against DC 10 with a natural 20 (a critical success
        // unadjusted) comes out a failure.
        async b2CreaturesKotodamaObject(scene) {
            await h.clearSquares(scene, around(12, 2));
            const { actor: user, token: userToken } = await h.creature(scene, "Bell Ringer", { type: "character", x: 12, y: 2, level: 4 });
            const bells = await h.give(user, "Kotodama Bells");
            const made = () => conjuredBy(scene, userToken, (conjured) => conjured.itemUuid === bells.uuid);
            try {
                let since = Date.now();
                await api().activate(bells.uuid, 0);
                await h.until(() => made().length === 1, "the awakened object's token", { timeout: 15000 });
                const [token] = made();
                const object = () => token.actor;
                const own = () => object().itemTypes.effect.find((effect) => / its own$/.test(effect.name) && (effect.system.rules ?? []).some((rule) => rule.key === "AdjustDegreeOfSuccess"));
                await h.until(() => own(), `its own Effect with AdjustDegreeOfSuccess (${effectNames(object())})`, { timeout: 8000 });
                const actor = object();
                h.assert(Number(actor.system.attributes.ac.value) === 5 && Number(actor.system.attributes.hp.max) === 5 && speedOf(actor) === 10, `AC 5, 5 HP, Speed 10 (${actor.system.attributes.ac.value}, ${actor.system.attributes.hp.max}, ${speedOf(actor)})`);
                h.assert(actor.system.traits.size.value === "tiny" && traitsOf(actor).includes("minion"), `a Tiny minion (${actor.system.traits.size.value}; ${traitsOf(actor).join(", ")})`);
                const rule = own().system.rules.find((entry) => entry.key === "AdjustDegreeOfSuccess");
                h.assert([].concat(rule.selector).includes("saving-throw") && rule.adjustment?.all === "to-failure", `every save to a failure (${JSON.stringify(rule)})`);
                await conjureCardFor(since, token.actorId);
                h.assert(typeof actor.saves?.reflex?.roll === "function", `its Reflex save (${Object.keys(actor.saves ?? {}).join(", ") || "none"})`);
                since = Date.now();
                await h.withDie(20, () => actor.saves.reflex.roll({ dc: { value: 10 }, skipDialog: true }));
                const save = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && (message.speaker?.token === token.id || message.actor?.id === actor.id), { what: "the object's Reflex save" });
                const context = save.flags.pf2e.context;
                h.assert(context.outcome === "failure", `a natural 20 against DC 10 is a failure (${context.outcome}, unadjusted ${context.unadjustedOutcome ?? "?"})`);
                return { name: actor.name, outcome: context.outcome, unadjusted: context.unadjustedOutcome ?? null, effect: own().name };
            } finally {
                await dismissConjured(scene, userToken);
            }
        },

        // Cordelia's Construct Key's second activation (src/live/conjured.js conjuredChanges own.noStrikes, scripts/zones.js finishConjured):
        // "the object becomes an animated broom … It can't make Strikes … for 1 hour." Activated: PF2e's Animated Broom beside its user, its
        // Bristles gone — no melee item, no Strike among its actions — and the conjure card lasting 1 hour with the reading's no-Strike line.
        async b2CreaturesBroomNoStrikes(scene) {
            await h.clearSquares(scene, around(17, 2));
            const { actor: user, token: userToken } = await h.creature(scene, "Key Keeper", { type: "character", x: 17, y: 2, level: 8 });
            const key = await h.give(user, "Cordelia's Construct Key");
            const made = () => conjuredBy(scene, userToken, (conjured) => conjured.itemUuid === key.uuid);
            const bestiary = await fromUuid("Compendium.pf2e.pathfinder-monster-core.Actor.ybkelAOtSIA06fnj").catch(() => null);
            const had = bestiary ? bestiary.itemTypes.melee.map((entry) => entry.name) : [];
            try {
                const since = Date.now();
                await api().activate(key.uuid, 1);
                await h.until(() => made().length === 1, "the broom's token", { timeout: 15000 });
                const [token] = made();
                const broom = () => token.actor;
                await h.until(() => broom().itemTypes.melee.length === 0, `its Strikes gone (${broom().itemTypes.melee.map((entry) => entry.name).join(", ")}; the world actor's: ${game.actors.get(token.actorId)?.itemTypes?.melee?.map((entry) => entry.name).join(", ") ?? "none"})`, { timeout: 8000 });
                h.assert(/Animated Broom/.test(broom().name), `an Animated Broom (${broom().name})`);
                const strikes = (broom().system.actions ?? []).filter((action) => action?.type === "strike");
                h.assert(!strikes.length, `no Strike among its actions (${strikes.map((action) => action.label).join(", ")})`);
                const card = await conjureCardFor(since, token.actorId);
                h.assert(/Lasts 1 hours?/.test(card.content) && /no Strike/.test(card.content), `an hour, its no-Strike line (${card.content})`);
                return { name: broom().name, hadInBestiary: had, melee: broom().itemTypes.melee.length };
            } finally {
                await dismissConjured(scene, userToken);
            }
        },

        // Hosteling Statuette (src/live/ends-own.js, scripts/live.js applyToRecipient's endOwnEffect): "your companion … merges into the
        // statuette … petrified, and its size is Tiny" until "you call it forth". The first activation applied at the targeted companion: its
        // note Effect "Hosteling Statuette: Statuette form" with PF2e's in-memory Petrified and CreatureSize Tiny (nothing on its user). The
        // second applied at it: that Effect deleted, Petrified and Tiny gone with it, the card's line "Statuette form ends".
        async b2CreaturesHostelingForm(scene) {
            await h.clearSquares(scene, [[2, 7], [3, 7]]);
            const { actor: user } = await h.creature(scene, "Statuette Keeper", { type: "character", x: 2, y: 7, level: 4 });
            const { actor: pet, token: petToken } = await h.creature(scene, "Statuette Wolf", { x: 3, y: 7, level: 2 });
            const before = pet.system.traits.size.value;
            const statuette = await h.give(user, "Hosteling Statuette");
            await statuette.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            const form = (actor) => actor.itemTypes.effect.find((effect) => effect.name === "Hosteling Statuette: Statuette form");
            let since = Date.now();
            await api().activate(statuette.uuid, 0);
            const merge = await h.messageAfter(since, h.itemCard("item"), { what: "the merge's card" });
            await api().apply(merge.id, { targets: [petToken.uuid] });
            await h.until(() => form(pet), `the companion's Statuette form Effect (${effectNames(pet)})`, { timeout: 8000 });
            await h.until(() => petrified(pet) && pet.system.traits.size.value === "tiny", `Petrified and Tiny (${petrified(pet)}, ${pet.system.traits.size.value})`, { timeout: 8000 });
            const rules = form(pet).system.rules.map((rule) => rule.key);
            h.assert(rules.includes("GrantItem") && rules.includes("CreatureSize") && form(pet).system.duration.unit === "unlimited", `its rules, no time (${rules.join(", ")}; ${JSON.stringify(form(pet).system.duration)})`);
            h.assert(!form(user) && !petrified(user), `nothing on its user (${effectNames(user)})`);
            since = Date.now();
            await api().activate(statuette.uuid, 1);
            const call = await h.messageAfter(since, h.itemCard("item"), { what: "the call forth's card" });
            await api().apply(call.id, { targets: [petToken.uuid] });
            await h.until(() => !form(pet) && !petrified(pet), `the Effect and Petrified gone (${effectNames(pet)}; petrified ${petrified(pet)})`, { timeout: 8000 });
            await h.until(() => pet.system.traits.size.value === before, `its size back (${pet.system.traits.size.value}, was ${before})`, { timeout: 5000 });
            await h.until(() => resultsOf(call).some((line) => /Statuette form ends/.test(line)), `the card's line (${JSON.stringify(resultsOf(call))})`, { timeout: 5000 });
            return { merged: resultsOf(merge), called: resultsOf(call), size: pet.system.traits.size.value };
        },

        // Wondrous Figurine (Golden Lions) (scripts/slain-wait.js slainWait.each, scripts/zones.js startItemConjure's countNow): "If either of
        // the lions is slain, that lion cannot be summoned again until 1 week has passed, but this doesn't prevent you from summoning the
        // other." Activated: two Lions. One dropped to 0 Hit Points: a whisper that it can't be called again for 1 week, and the figurine's
        // flag conjuredSlain holding it until a week from now. Activated again (its once a day only warned): one new lion comes, not two.
        async b2CreaturesLionsSlainWait(scene) {
            await h.clearSquares(scene, around(8, 9, 3));
            const { actor: owner, token: ownerToken } = await h.creature(scene, "Lion Keeper", { type: "character", x: 8, y: 9, level: 10 });
            const lions = await h.give(owner, "Wondrous Figurine (Golden Lions)");
            const made = () => conjuredBy(scene, ownerToken, (conjured) => conjured.itemUuid === lions.uuid);
            try {
                await api().activate(lions.uuid, 0);
                await h.until(() => made().length === 2, `the two lions (${made().length})`, { timeout: 15000 });
                const [first] = made();
                const slainId = first.id;
                let since = Date.now();
                const start = Number(game.time.worldTime) || 0;
                await first.actor.update({ "system.attributes.hp.value": 0 });
                const told = await h.messageAfter(since, (message) => /is slain/.test(message.content ?? "") && (message.content ?? "").includes("Wondrous Figurine (Golden Lions)"), { what: "the slain lion's whisper", timeout: 10000 });
                h.assert(/can't be called again for 1 week/.test(told.content) && (told.whisper ?? []).length > 0, `whispered, a week for that lion (${told.content})`);
                await h.until(() => (lions.getFlag(h.NS, "conjuredSlain") ?? []).length === 1, `the figurine's slain lion kept (${JSON.stringify(lions.getFlag(h.NS, "conjuredSlain"))})`, { timeout: 8000 });
                const [slain] = lions.getFlag(h.NS, "conjuredSlain");
                h.assert(Math.abs(Number(slain.until) - (start + 604_800)) <= 600, `until a week from now (${slain.until}, now ${start})`);
                // (It goes at 0 Hit Points, the ability module's — not this case's point: noted, not failed.)
                const vanished = await h.until(() => !made().some((token) => token.id === slainId), "the slain lion gone", { timeout: 5000 }).then(() => true, () => false);
                const before = new Set(made().map((token) => token.id));
                since = Date.now();
                await api().activate(lions.uuid, 0);
                await h.until(() => made().some((token) => !before.has(token.id)), "the second call's lion", { timeout: 15000 });
                // (Time for a second one to show, if it would.)
                await h.wait(2000);
                const fresh = made().filter((token) => !before.has(token.id));
                h.assert(fresh.length === 1, `one lion comes while the other waits (${fresh.map((token) => token.name).join(", ")})`);
                return { slain, vanished, fresh: fresh.map((token) => token.name), told: told.content };
            } finally {
                await dismissConjured(scene, ownerToken);
            }
        },

        // Wondrous Figurine (Onyx Dog) (scripts/slain-wait.js, the activation's recharge flag; src/live/activations-card.js's week; its own Effect's
        // words, scripts/zones.js finishConjured): "can be activated once per week … If the figurine is slain while in animal form, it reverts
        // … and cannot be activated again until 1 week has passed." Activated: a Guard Dog whose own Effect has the +4 to Track, darkvision
        // and the scent's words. Dropped to 0 Hit Points: the whisper that the item can't be activated for 1 week, and its activationRecharges
        // flag a week from now. Activated again: the GM's whispers that it's usable again only in 7 days and that it's once per week (used 1
        // this week) — warnings, not a refusal.
        async b2CreaturesOnyxDogWait(scene) {
            await h.clearSquares(scene, around(15, 9));
            const { actor: owner, token: ownerToken } = await h.creature(scene, "Dog Keeper", { type: "character", x: 15, y: 9, level: 2 });
            const figurine = await h.give(owner, "Wondrous Figurine (Onyx Dog)");
            const made = () => conjuredBy(scene, ownerToken, (conjured) => conjured.itemUuid === figurine.uuid);
            try {
                await api().activate(figurine.uuid, 0);
                await h.until(() => made().length === 1, "the dog's token", { timeout: 15000 });
                const [token] = made();
                const dog = () => token.actor;
                const own = () => dog().itemTypes.effect.find((effect) => / its own$/.test(effect.name));
                await h.until(() => own(), `the dog's own Effect (${effectNames(dog())})`, { timeout: 8000 });
                const rules = own().system.rules ?? [];
                h.assert(rules.some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("survival") && rule.type === "circumstance" && Number(rule.value) === 4 && [].concat(rule.predicate ?? []).includes("action:track")) && rules.some((rule) => rule.key === "Sense" && [].concat(rule.selector).includes("darkvision")), `+4 to Track and darkvision (${JSON.stringify(rules)})`);
                h.assert(/observed and concealed/.test(own().system.description.value ?? ""), `the scent's words on it (${own().system.description.value})`);
                let since = Date.now();
                const start = Number(game.time.worldTime) || 0;
                await dog().update({ "system.attributes.hp.value": 0 });
                const told = await h.messageAfter(since, (message) => /is slain/.test(message.content ?? "") && (message.content ?? "").includes("Onyx Dog"), { what: "the slain dog's whisper", timeout: 10000 });
                h.assert(/the item can't be activated again for 1 week/.test(told.content), `a week for the item (${told.content})`);
                const waits = () => figurine.getFlag(h.NS, "activationRecharges") ?? {};
                await h.until(() => Number(waits()[0]) > start, `its recharge set (${JSON.stringify(waits())})`, { timeout: 8000 });
                h.assert(Math.abs(Number(waits()[0]) - (start + 604_800)) <= 600, `a week from now (${waits()[0]}, now ${start})`);
                since = Date.now();
                await api().activate(figurine.uuid, 0);
                const warned = await h.messageAfter(since, (message) => /usable again only in 7 days/.test(message.content ?? "") && (message.content ?? "").includes("Onyx Dog"), { what: "the wait's warning", timeout: 10000 });
                const weekly = await h.messageAfter(since, (message) => /once per week \(used 1 this week\)/.test(message.content ?? ""), { what: "the once-per-week warning", timeout: 10000 });
                return { waits: waits(), warned: warned.content, weekly: weekly.content };
            } finally {
                await dismissConjured(scene, ownerToken);
            }
        },

        // Bloodstone Doll (Minor) (src/live/counteract-card.js afterFreeRules, scripts/counteract.js): "Attempt a counteract check against the
        // triggering spell (+9, rank 2) … If the spell would be counteracted … You gain control of the summoned creature … the summoned creature
        // takes a –2 status penalty to attack rolls against you." Used: the counteract card straight to the spell's row, the summoned creature
        // 5 feet off among those to pick. Picked, DC 15 rank 2, a 10 on the die (19, a success): the line says the spell isn't ended; the
        // summoned creature gets the doll's Effect with PF2e's TokenMark of its user's token (PF2e holds the mark) and a –2 status FlatModifier
        // to attack rolls at the mark only. Its Strike at the user, then at a bystander (both a 10 on the die): 2 lower at the user, with a
        // –2 status modifier on that roll alone.
        async b2CreaturesBloodstoneMark(scene) {
            await h.clearSquares(scene, [[2, 13], [3, 13], [4, 13], [3, 12], [3, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Doll Holder", { type: "character", x: 2, y: 13, level: 4 });
            const { actor: summoned, token: summonedToken } = await h.creature(scene, "Doll Summoned", { x: 3, y: 13, alliance: "opposition", level: 2 });
            const { token: otherToken } = await h.creature(scene, "Doll Bystander", { type: "character", x: 4, y: 13, level: 4 });
            await summoned.update({ "system.traits.value": ["animal", "summoned"] }).catch(() => null);
            // (A Strike for it: PF2e's Guard Dog's Jaws.)
            const hound = await fromUuid("Compendium.pf2e.pathfinder-monster-core.Actor.KHTYbQgR5hnFZdGL");
            const jawsSource = hound?.itemTypes?.melee?.[0]?.toObject();
            h.assert(jawsSource, "the Guard Dog's Jaws to copy");
            delete jawsSource._id;
            const [jaws] = await summoned.createEmbeddedDocuments("Item", [jawsSource]);
            const doll = await h.give(user, "Bloodstone Doll (Minor)");
            try {
                const since = Date.now();
                await doll.consume();
                const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the doll's counteract card" });
                const state = card.getFlag(h.NS, "card");
                h.assert(state.step === "pick" && state.rows.length === 1 && state.rows[0].kind === "free", `straight to the spell's row (${JSON.stringify(state.rows)})`);
                h.assert(state.counteract.modifier === 9 && state.counteract.rank === 2 && state.counteract.within === 90, `+9, rank 2, within 90 feet (${state.counteract.modifier}, ${state.counteract.rank}, ${state.counteract.within})`);
                const at = state.drinkers.findIndex((entry) => entry.actorUuid === summoned.uuid);
                h.assert(at > 0, `the summoned creature to pick (${state.drinkers.map((entry) => entry.name).join(", ")})`);
                // (A 10: 19 against DC 15, a success — its rank 2 within the doll's 2 + 1.)
                await h.withDie(10, () => api().apply(card.id, { drinker: at, rows: [{ ticked: true, dc: 15, rank: 2 }] }));
                await h.until(() => stateOf(card)?.status === "applied", "the counteract rolled", { timeout: 8000 });
                const results = resultsOf(card);
                h.assert(/19 against DC 15: a success, counteracted \(not ended/.test(results[0] ?? ""), `a success, the spell not ended (${results.join(" / ")})`);
                h.assert(results.some((line) => line.includes("Doll Summoned") && /–2 status penalty to attack rolls against its user/.test(line)), `its line for the summoned creature (${results.join(" / ")})`);
                const hold = () => summoned.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "ruleEffect") === "bloodstone doll");
                await h.until(() => hold(), `the doll's Effect on the summoned creature (${effectNames(summoned)})`, { timeout: 8000 });
                const rules = hold().system.rules ?? [];
                const mark = rules.find((rule) => rule.key === "TokenMark");
                const penalty = rules.find((rule) => rule.key === "FlatModifier");
                h.assert(mark?.uuid === userToken.uuid, `the user's token marked (${JSON.stringify(mark)} / ${userToken.uuid})`);
                h.assert(penalty && Number(penalty.value) === -2 && penalty.type === "status" && [].concat(penalty.selector).includes("attack-roll") && [].concat(penalty.predicate ?? []).includes(`target:mark:${mark.slug}`), `–2 status to attack rolls at the mark only (${JSON.stringify(penalty)})`);
                h.assert((summoned.synthetics?.tokenMarks?.get(userToken.uuid) ?? []).includes(mark.slug), `PF2e holds the mark (${JSON.stringify([...(summoned.synthetics?.tokenMarks?.entries?.() ?? [])])})`);
                h.assert(!user.itemTypes.effect.some((effect) => effect.getFlag(h.NS, "ruleEffect") === "bloodstone doll"), `nothing on its user (${effectNames(user)})`);
                // (Its Strike at each, the same die: the –2 at its user alone.)
                const strikeAt = async (token) => {
                    await h.target(token);
                    return h.withDie(10, async () => (await h.strike(summoned, jaws)).attack);
                };
                const atUser = await strikeAt(userToken);
                const atOther = await strikeAt(otherToken);
                const total = (message) => Number(message.rolls?.[0]?.total);
                const penaltyOn = (message) => (message.flags?.pf2e?.modifiers ?? []).some((modifier) => Number(modifier.modifier) === -2 && modifier.type === "status" && modifier.enabled !== false && !modifier.ignored);
                h.assert(total(atOther) - total(atUser) === 2, `2 lower at its user (${total(atUser)} at the user, ${total(atOther)} at the bystander)`);
                h.assert(penaltyOn(atUser) && !penaltyOn(atOther), `the –2 status modifier on the roll at its user only (${JSON.stringify(atUser.flags?.pf2e?.modifiers?.map((modifier) => [modifier.label, modifier.modifier]))})`);
                return { results, mark, penalty, atUser: total(atUser), atOther: total(atOther), summonedToken: summonedToken.name };
            } finally {
                await h.target();
            }
        }
    };
};
