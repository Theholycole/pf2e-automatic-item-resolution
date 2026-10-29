// The third batch's Strike group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the items whose live play is new code (the b3/strike merge 9fc290a: scripts/strikes.js useOne's strike.every, src/live/strike-card.js
// riderFor's every and ignoredResistanceFlag, scripts/user-after.js and src/live/user-after.js): Nightmare Cudgel's and Whip of Compliance's every
// Strike for a while, Boughshatter's resistance ignored on the weapon's own Strike, Soulfeeding Mask's Quickened after its card. Necrobinding
// Serum has a case too though it adds no live code: its kinds (plan.ifTarget) ride on a coated weapon's hit, which scripts/poisons.js
// strikeWithPoison posts without reading them (see the result's bugs). Venom Lash, Mantis Embrace, Mindrender Baton and Deafening Music Box feed
// mechanisms already live-checked (the readied Strike's DamageDice with critical and userRules — strikeMinotaurProne, b2AreasBloodmistWhirlFog —,
// the ability module's note-Effect saveEnds and its gate — saveEndsSilencer, saveEndsGearbinder —, and its placed zones' saves and immunity).
const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const outcomeOf = (attack) => attack.flags.pf2e.context.outcome;
    const hit = (outcome) => ["success", "criticalSuccess"].includes(outcome);
    const cardOf = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card ?? null;
    // (The ability module's save cards made since then at that creature.)
    const saveCardsAt = (actor, since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message) && (cardOf(message)?.targets ?? []).some((entry) => entry.actorUuid === actor.uuid));
    const saveCardAt = (actor) => (message) => h.abilitySaveCard(message) && (cardOf(message)?.targets ?? []).some((entry) => entry.actorUuid === actor.uuid);
    // (This module's Demoralize card, the one a cudgel hit posts.)
    const demoralizeCard = (message) => h.itemCard("item-action")(message) && message.getFlag(h.NS, "card")?.plan?.action?.slug === "demoralize";
    const demoralizesSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && demoralizeCard(message));
    // (A bare character's maximum Hit Points: 0 — PF2e then takes no damage on it. An Effect gives it some, its Hit Points filled.)
    const hitPoints = async (actor, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await h.until(() => actor.system.attributes.hp.max >= value, `${value} maximum Hit Points`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": actor.system.attributes.hp.max });
    };
    // (PF2e's damage roll of that Strike, its critical one after a critical hit.)
    const damageRoll = async (action, outcome) => {
        const since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
    };
    // That damage roll applied as PF2e's Damage button does (the roll with its options, the core's stamp among them); → { total, lost, taken }.
    const dealt = async (foe, foeToken, rolled) => {
        const roll = game.messages.get(rolled.id)?.rolls?.[0] ?? rolled.rolls?.[0];
        const before = Number(foe.system.attributes.hp.value);
        const since = Date.now();
        await foe.applyDamage({ damage: roll, token: foeToken });
        const taken = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-taken" && message.speaker?.actor === foe.id, { what: "PF2e's damage-taken message" });
        await h.wait(300);
        return { total: Number(roll.total), lost: before - Number(foe.system.attributes.hp.value), taken };
    };
    const takenWords = (taken) => `${taken.flavor ?? ""} ${taken.content ?? ""}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const resistanceOf = (actor, type) => Number((actor.attributes?.resistances ?? []).find((entry) => entry.type === type)?.value ?? NaN);
    const coreFlagOf = (message) => game.messages.get(message.id)?.flags?.[CORE]?.ignoreResistance ?? message.flags?.[CORE]?.ignoreResistance ?? null;
    const ignoresTen = (entry) => Number(entry?.value) === 10 && [].concat(entry?.types ?? []).includes("bludgeoning") && [].concat(entry?.types ?? []).includes("piercing");

    // Boughshatter's Splintering Strike readied and made at a creature with bludgeoning resistance 10: → what its damage did.
    const splinteringAt = async (scene, { name, x, y, traits }) => {
        await h.clearSquares(scene, [[x, y], [x + 1, y]]);
        const { actor: user, token: userToken } = await h.creature(scene, `${name} Wielder`, { type: "character", x, y, level: 13 });
        const { actor: foe, token: foeToken } = await h.creature(scene, `${name} Target`, { x: x + 1, y, ac: 1, hp: 400, alliance: "opposition", level: 12 });
        await foe.update({ "system.traits.value": traits, "system.attributes.resistances": [{ type: "bludgeoning", value: 10, exceptions: [] }] });
        await h.until(() => traits.every((trait) => (foe.system.traits.value ?? []).includes(trait)) && resistanceOf(foe, "bludgeoning") === 10, `${traits.join(", ")}, bludgeoning resistance 10 (${JSON.stringify(foe.system.traits.value)}; ${JSON.stringify(foe.attributes?.resistances ?? [])})`, { timeout: 5000 });
        const star = await h.give(user, "Boughshatter");
        await star.update(held(1));
        await userToken.object?.control?.();
        let since = Date.now();
        await api().activate(star.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("strike"), { what: "Splintering Strike's card" });
        await api().apply(card.id);
        const readied = readiedOf(user);
        await h.until(() => readied()?.flags[h.NS].strikeRider.weaponId === star.id, "the readied Strike with Boughshatter itself", { timeout: 8000 });
        const flag = readied().flags?.[CORE]?.ignoreResistance ?? null;
        h.assert(ignoresTen(flag), `the core's ignoreResistance { 10, bludgeoning and piercing } on the readied Strike's Effect (${JSON.stringify(readied().flags?.[CORE] ?? {})})`);
        const predicate = JSON.stringify(flag.predicate ?? null);
        h.assert(predicate.includes(`item:id:${star.id}`) && /target:trait:plant/.test(predicate) && /target:trait:wood/.test(predicate), `for Boughshatter's own Strikes at plants, fungi and wood creatures (${predicate})`);
        await h.target(foeToken);
        const { action, attack } = await h.withDie(10, () => h.strike(user, star));
        const outcome = outcomeOf(attack);
        h.assert(hit(outcome), `a hit (d20 10 at AC 1): ${outcome}`);
        await h.until(() => readied()?.flags[h.NS].strikeRider.awaiting, "the readied Strike kept for the hit's damage roll", { timeout: 8000 });
        // (Every die at its highest: more than the resistance's 10 either way.)
        const rolled = await h.withDie(20, () => damageRoll(action, outcome));
        await h.until(() => !readied(), "the readied Strike spent by its damage roll", { timeout: 8000 });
        const { total, lost, taken } = await dealt(foe, foeToken, rolled);
        return { foe, flag, stamp: coreFlagOf(rolled), total, lost, taken: takenWords(taken), outcome };
    };

    // Soulfeeding Mask's Devour Soul at one creature, its save at a set degree (every d20 at 10, the creature's Fortitude set for it): → the save card.
    const devour = async (mask, token, user) => {
        const since = Date.now();
        await api().activate(mask.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("expose"), { what: "Devour Soul's card" });
        const at = Date.now();
        await api().apply(card.id, { targets: [token.uuid] });
        return h.messageAfter(at, saveCardAt(token.actor), { what: `Devour Soul's save card at ${token.name}` });
    };
    const quickenedOf = (actor) => actor.itemTypes.effect.filter((effect) => effect.name === "Soulfeeding Mask: Devour Soul: Quickened");

    // Necrobinding Serum coated on the user's shortsword, then a hit at that creature: → the save card at it, or null when none comes.
    const serumHit = async (user, userToken, sword, serum, foeToken) => {
        let since = Date.now();
        await serum.consume();
        const card = await h.messageAfter(since, h.itemCard("poison"), { what: "the serum's coating card" });
        await api().apply(card.id, { weapon: stateOf(card).weapons.findIndex((entry) => entry.id === sword.id) });
        await h.until(() => user.itemTypes.effect.some((effect) => effect.getFlag(h.NS, "poison")?.weaponId === sword.id), "the coated shortsword", { timeout: 8000 });
        await userToken.object?.control?.();
        await h.target(foeToken);
        since = Date.now();
        const { attack } = await h.withDie(10, () => h.strike(user, sword));
        h.assert(hit(outcomeOf(attack)), `a hit at ${foeToken.name} (AC 1): ${outcomeOf(attack)}`);
        await h.until(() => !user.itemTypes.effect.some((effect) => effect.getFlag(h.NS, "poison")), "the coating spent by the hit", { timeout: 8000 });
        return h.messageAfter(since, saveCardAt(foeToken.actor), { what: `the serum's save card at ${foeToken.name}`, timeout: 3500 }).catch(() => null);
    };
    const boundOf = (actor) => actor.itemTypes.effect.find((effect) => /Bound by necrobinding serum/i.test(`${effect.name} ${effect.system?.description?.value ?? ""}`));

    return {
        // Nightmare Cudgel (strike.every, strike.follow; scripts/strikes.js useOne, src/live/strike-card.js riderFor): "For the next minute, whenever
        // you successfully Strike a creature with the nightmare cudgel, you can use a free action to attempt an Intimidation check to Demoralize the
        // struck creature." Its Strike card readies every Strike for a minute (the Effect's 1 minute, its words "none spends it"). A miss (d20 10 at
        // AC 60) posts no Demoralize card and keeps the Effect; a hit (d20 10 at AC 1) posts this module's Demoralize card and keeps it; that card
        // applied rolls PF2e's Demoralize at the creature struck; a second hit posts a second card, the Effect still there.
        async b3StrikeCudgelEveryHit(scene) {
            await h.clearSquares(scene, [[1, 1], [2, 1], [2, 2]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Cudgel Warden", { type: "character", x: 1, y: 1, level: 11 });
            const { token: wallToken } = await h.creature(scene, "Cudgel Wall", { x: 2, y: 1, ac: 60, hp: 300, alliance: "opposition" });
            const { token: foeToken } = await h.creature(scene, "Cudgel Prisoner", { x: 2, y: 2, ac: 1, hp: 300, save: -30, alliance: "opposition" });
            const cudgel = await h.give(user, "Nightmare Cudgel");
            await cudgel.update(held(1));
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(cudgel.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the cudgel's Strike card" });
            await api().apply(card.id);
            const readied = readiedOf(user);
            await h.until(() => readied()?.flags[h.NS].strikeRider.plan?.strike?.every, "the readied Strikes, every one for a while", { timeout: 8000 });
            const duration = readied().system.duration;
            h.assert(duration.value === 1 && duration.unit === "minutes", `for 1 minute (${JSON.stringify(duration)})`);
            h.assert(/none spends it/.test(readied().system.description.value ?? ""), `its words: none spends it (${readied().system.description.value})`);
            // (A miss: nothing, and kept.)
            await h.target(wallToken);
            since = Date.now();
            const { attack: missed } = await h.withDie(10, () => h.strike(user, cudgel));
            h.assert(!hit(outcomeOf(missed)), `a miss (d20 10 at AC 60): ${outcomeOf(missed)}`);
            await h.wait(1500);
            h.assert(!demoralizesSince(since).length, `no Demoralize card after the miss (${demoralizesSince(since).length})`);
            h.assert(readied(), `the readied Effect kept after the miss (${names(user)})`);
            // (A hit: the Demoralize card, kept.)
            await h.target(foeToken);
            since = Date.now();
            const { attack: first } = await h.withDie(10, () => h.strike(user, cudgel));
            h.assert(hit(outcomeOf(first)), `a hit (d20 10 at AC 1): ${outcomeOf(first)}`);
            const demoralize = await h.messageAfter(since, demoralizeCard, { what: "the Demoralize card after the hit", timeout: 10000 });
            await h.wait(500);
            h.assert(readied(), `the readied Effect kept after the hit (${names(user)})`);
            await api().apply(demoralize.id, { targets: [foeToken.uuid] });
            await h.until(() => stateOf(demoralize)?.status === "applied" && resultsOf(demoralize).some((line) => line.includes(foeToken.name)), `PF2e's Demoralize rolled at the creature struck (${JSON.stringify(resultsOf(demoralize))})`, { timeout: 10000 });
            // (A second hit: a second card, still kept.)
            since = Date.now();
            const { attack: second } = await h.withDie(10, () => h.strike(user, cudgel));
            h.assert(hit(outcomeOf(second)), `a second hit: ${outcomeOf(second)}`);
            await h.messageAfter(since, demoralizeCard, { what: "the Demoralize card after the second hit", timeout: 10000 });
            await h.wait(500);
            h.assert(readied() && readied().flags[h.NS].strikeRider.awaiting === false, `the readied Effect kept, no damage roll awaited (${JSON.stringify(readied()?.flags?.[h.NS]?.strikeRider ?? null)})`);
            return { outcomes: [outcomeOf(missed), outcomeOf(first), outcomeOf(second)], demoralize: resultsOf(demoralize), duration };
        },

        // Whip of Compliance's first way (strike.every, strike.against animal, strike.save; src/live/strike-card.js riderFor's "keep" for another
        // kind): "Until the end of your current turn, any animals you Strike with the whip must attempt a DC 25 Will save. On a failed or critically
        // failed saving throw, the whip casts a 4th-rank Suggestion spell on the animal with a base duration of 1 round". A hit at a humanoid keeps
        // the readied Effect and posts no save card; a hit at an animal keeps it too and posts the ability module's Will DC 25 card at it, with the
        // incapacitation trait; its failure (d20 10 at Will +10) gives the animal the 'Following a suggestion' note Effect for 1 round.
        async b3StrikeWhipAnimalsOnly(scene) {
            await h.clearSquares(scene, [[1, 4], [2, 4], [2, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Whip Tamer", { type: "character", x: 1, y: 4, level: 9 });
            const { actor: person, token: personToken } = await h.creature(scene, "Whip Humanoid", { x: 2, y: 4, ac: 1, hp: 300, save: 10, alliance: "opposition" });
            const { actor: wolf, token: wolfToken } = await h.creature(scene, "Whip Wolf", { x: 2, y: 5, ac: 1, hp: 300, save: 10, alliance: "opposition" });
            await person.update({ "system.traits.value": ["humanoid", "human"] });
            await wolf.update({ "system.traits.value": ["animal"] });
            await h.until(() => (wolf.system.traits.value ?? []).includes("animal"), "the wolf an animal", { timeout: 5000 });
            const whip = await h.give(user, "Whip of Compliance");
            await whip.update(held(1));
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(whip.uuid, 0);
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the whip's ways card" });
            since = Date.now();
            await api().apply(ways.id, { choice: 0 });
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the first way's Strike card" });
            await api().apply(card.id);
            const readied = readiedOf(user);
            await h.until(() => readied()?.flags[h.NS].strikeRider.plan?.strike?.every, "the readied Strikes for the turn", { timeout: 8000 });
            // (The humanoid: kept, no save.)
            await h.target(personToken);
            since = Date.now();
            const { attack: atPerson } = await h.withDie(10, () => h.strike(user, whip));
            h.assert(hit(outcomeOf(atPerson)), `a hit at the humanoid (AC 1): ${outcomeOf(atPerson)}`);
            await h.wait(2000);
            h.assert(!saveCardsAt(person, since).length, `no save card at the humanoid (${saveCardsAt(person, since).length})`);
            h.assert(readied(), `the readied Effect kept after the humanoid (${names(user)})`);
            // (The wolf: its Will save, kept.)
            await h.target(wolfToken);
            since = Date.now();
            const { attack: atWolf } = await h.withDie(10, () => h.strike(user, whip));
            h.assert(hit(outcomeOf(atWolf)), `a hit at the wolf (AC 1): ${outcomeOf(atWolf)}`);
            const save = await h.messageAfter(since, saveCardAt(wolf), { what: "the Will save card at the wolf", timeout: 10000 });
            const plan = cardOf(save).plan;
            h.assert(plan.resolution.check.statistic === "will" && plan.resolution.check.against.value === 25, `Will DC 25 (${JSON.stringify(plan.resolution.check)})`);
            h.assert((plan.traits ?? []).includes("incapacitation"), `the incapacitation trait (${JSON.stringify(plan.traits)})`);
            await h.wait(300);
            h.assert(readied(), `the readied Effect kept after the wolf (${names(user)})`);
            await h.withDie(10, async () => {
                await h.rollAndApply(save);
                await h.until(() => (cardOf(save)?.targets ?? []).every((entry) => entry.degree), "the wolf's save rolled", { timeout: 10000 });
            });
            const degree = cardOf(save).targets.find((entry) => entry.actorUuid === wolf.uuid)?.degree;
            h.assert(degree === "failure", `a failure (d20 10 + 10 against 25): ${degree}`);
            const suggestion = () => wolf.itemTypes.effect.find((effect) => /Following a suggestion/i.test(`${effect.name} ${effect.system?.description?.value ?? ""}`));
            await h.until(() => suggestion(), `the wolf's 'Following a suggestion' note Effect (${names(wolf)})`, { timeout: 10000 });
            const lasts = suggestion().system.duration;
            h.assert(lasts.value === 1 && lasts.unit === "rounds", `for 1 round (${JSON.stringify(lasts)})`);
            return { degree, suggestion: suggestion().name, lasts };
        },

        // Boughshatter's Splintering Strike at a plant with bludgeoning resistance 10 (src/live/strike-card.js ignoredResistanceFlag, core 321af5b's
        // stamp): "If you make this Strike against a fungus, plant, or creature with the wood trait, the Strike ignores 10 points of the target's
        // resistances to bludgeoning and piercing damage". The readied Effect carries the core's ignoreResistance { 10, bludgeoning and piercing },
        // predicated on those traits and Boughshatter's own id; the hit's damage roll (every die at its highest) is stamped and spends the Effect, and
        // applied it takes all of its total (resistance 10 counted as 0), PF2e's breakdown saying so.
        async b3StrikeBoughshatterPlant(scene) {
            const { foe, stamp, total, lost, taken, outcome } = await splinteringAt(scene, { name: "Bough Plant", x: 1, y: 7, traits: ["plant"] });
            h.assert([].concat(stamp ?? []).some(ignoresTen), `the core's stamp on PF2e's damage roll (${JSON.stringify(stamp)})`);
            h.assert(total > 10 && lost === total, `all ${total} taken, its bludgeoning resistance 10 ignored (lost ${lost})`);
            h.assert(/Ignores 10 of its bludgeoning resistance/i.test(taken), `PF2e's damage breakdown names it (${taken.slice(0, 300)})`);
            h.assert(resistanceOf(foe, "bludgeoning") === 10, `the resistance reads 10 again after (${resistanceOf(foe, "bludgeoning")})`);
            return { outcome, total, lost, taken: taken.slice(0, 200) };
        },

        // Boughshatter's Splintering Strike at a humanoid with the same resistance: the readied Effect carries the flag, but its predicate doesn't fit
        // a humanoid — the damage roll isn't stamped, and applied it takes its total less 10.
        async b3StrikeBoughshatterHumanoid(scene) {
            const { stamp, total, lost, outcome } = await splinteringAt(scene, { name: "Bough Humanoid", x: 1, y: 9, traits: ["humanoid", "human"] });
            h.assert(![].concat(stamp ?? []).some(ignoresTen), `no stamp on the damage roll at a humanoid (${JSON.stringify(stamp)})`);
            h.assert(total > 10 && lost === total - 10, `${total} less its resistance 10 (lost ${lost})`);
            return { outcome, total, lost };
        },

        // Soulfeeding Mask's Devour Soul (plan.userAfter; scripts/user-after.js on the ability module's "applied" hook): "If the target takes any damage,
        // you become Quickened for 1 minute and can use the extra action each round for only Stride actions, unless the damage killed the creature, in
        // which case you can also use the extra action each round for Strike actions as well." A critical success (d20 10 at Fortitude +40): no
        // Effect. A failure (Fortitude +20) at a creature with 300 Hit Points: 'Soulfeeding Mask: Devour Soul: Quickened' for 1 minute, granting
        // Quickened, its words "only to Stride". A failure at one with 30 Hit Points, slain: a second such Effect, "Stride or Strike". At an undead,
        // the card's damage is 50 vitality.
        async b3StrikeSoulfeedingQuickened(scene) {
            await h.clearSquares(scene, [[1, 11], [2, 11], [2, 12], [1, 12], [2, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Soulfeeder", { type: "character", x: 1, y: 11, level: 17 });
            const { token: strongToken } = await h.creature(scene, "Soulfeed Strong", { x: 2, y: 11, hp: 300, save: 40, alliance: "opposition", level: 15 });
            const { actor: hardy, token: hardyToken } = await h.creature(scene, "Soulfeed Hardy", { x: 2, y: 12, hp: 300, save: 20, alliance: "opposition", level: 15 });
            const { actor: frail, token: frailToken } = await h.creature(scene, "Soulfeed Frail", { x: 1, y: 12, hp: 30, save: 20, alliance: "opposition", level: 15 });
            const { actor: undead, token: undeadToken } = await h.creature(scene, "Soulfeed Undead", { x: 2, y: 10, hp: 300, save: 20, alliance: "opposition", level: 15 });
            await undead.update({ "system.traits.value": ["undead"] });
            const mask = await h.give(user, "Soulfeeding Mask");
            await mask.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await userToken.object?.control?.();
            const roll = async (card, actor) => h.withDie(10, async () => {
                await h.rollAndApply(card);
                await h.until(() => cardOf(card)?.status === "applied", `${actor.name}'s card applied`, { timeout: 10000 });
            });
            // (A critical success: no damage, no Effect.)
            const strongCard = await devour(mask, strongToken, user);
            await roll(strongCard, strongToken.actor);
            h.assert(cardOf(strongCard).targets[0].degree === "criticalSuccess", `a critical success (d20 10 + 40 against 36): ${cardOf(strongCard).targets[0].degree}`);
            await h.wait(1500);
            h.assert(!quickenedOf(user).length && !user.hasCondition("quickened"), `no Quickened after a critical success (${names(user)})`);
            // (A failure: Quickened for the minute, only to Stride.)
            const hardyCard = await devour(mask, hardyToken, user);
            await roll(hardyCard, hardy);
            h.assert(cardOf(hardyCard).targets[0].degree === "failure", `a failure (d20 10 + 20 against 36): ${cardOf(hardyCard).targets[0].degree}`);
            h.assert(hardy.system.attributes.hp.value === 250, `its 50 void damage (${hardy.system.attributes.hp.value})`);
            await h.until(() => quickenedOf(user).length === 1, `the Quickened Effect on its user (${names(user)})`, { timeout: 8000 });
            const [effect] = quickenedOf(user);
            h.assert(effect.system.duration.value === 1 && effect.system.duration.unit === "minutes", `for 1 minute (${JSON.stringify(effect.system.duration)})`);
            h.assert((effect.system.rules ?? []).some((rule) => rule.key === "GrantItem"), `granting PF2e's Quickened (${JSON.stringify(effect.system.rules)})`);
            await h.until(() => user.hasCondition("quickened"), "its user Quickened", { timeout: 5000 });
            h.assert(/only to Stride/.test(effect.system.description.value) && !/Stride or Strike/.test(effect.system.description.value), `its words: only to Stride (${effect.system.description.value})`);
            // (A failure that slays: its words Stride or Strike.)
            const frailCard = await devour(mask, frailToken, user);
            await roll(frailCard, frail);
            h.assert(Number(frail.system.attributes.hp.value) === 0, `slain by the 50 (${frail.system.attributes.hp.value})`);
            await h.until(() => quickenedOf(user).length === 2, `a second Quickened Effect (${names(user)})`, { timeout: 8000 });
            const slain = quickenedOf(user).find((entry) => entry.id !== effect.id);
            h.assert(/Stride or Strike/.test(slain.system.description.value), `its words for a creature slain: Stride or Strike (${slain.system.description.value})`);
            // (An undead: its card's damage vitality.)
            const undeadCard = await devour(mask, undeadToken, user);
            const formula = String(cardOf(undeadCard).plan.resolution.sharedDamage.components[0].formula);
            h.assert(/50\[vitality\]/.test(formula), `50 vitality at the undead (${formula})`);
            return { words: [effect.system.description.value, slain.system.description.value], undead: formula };
        },

        // Necrobinding Serum coated on a shortsword (plan.ifTarget by kind on a coated weapon's hit): the critical failure and failure rows are by kind
        // — "If the target is a mindless undead, it becomes friendly toward you for 8 hours … Other undead … for 10 minutes … a mental effect" — and a
        // creature that isn't undead is immune. Three coats, three hits (AC 1), each save at d20 10 against DC 19: a zombie (undead, mindless; Will +5,
        // a failure) gets 'Bound by necrobinding serum' for 8 hours; a vampire (undead; Will +5, a failure) the same for 10 minutes, worded as a mental
        // effect; a living humanoid gets no save card at all. (scripts/poisons.js strikeWithPoison posts the coating's plan without its ifTarget:
        // expected to fail at the zombie until it does — see the result's bugs.)
        async b3StrikeNecrobindingKinds(scene) {
            await h.clearSquares(scene, [[1, 14], [2, 14], [2, 15], [2, 13]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Necrobinder", { type: "character", x: 1, y: 14, level: 5 });
            const { actor: zombie, token: zombieToken } = await h.creature(scene, "Necro Zombie", { x: 2, y: 14, ac: 1, hp: 200, save: 5, alliance: "opposition", level: 4 });
            const { actor: vampire, token: vampireToken } = await h.creature(scene, "Necro Vampire", { x: 2, y: 15, ac: 1, hp: 200, save: 5, alliance: "opposition", level: 4 });
            const { actor: living, token: livingToken } = await h.creature(scene, "Necro Living", { x: 2, y: 13, ac: 1, hp: 200, save: 5, alliance: "opposition", level: 4 });
            await zombie.update({ "system.traits.value": ["undead", "mindless", "zombie"] });
            await vampire.update({ "system.traits.value": ["undead", "vampire"] });
            await living.update({ "system.traits.value": ["humanoid", "human"] });
            await h.until(() => (zombie.system.traits.value ?? []).includes("mindless") && (vampire.system.traits.value ?? []).includes("undead"), "the undead's traits", { timeout: 5000 });
            const sword = await h.give(user, "Shortsword");
            await sword.update(held(1));
            const serum = await h.give(user, "Necrobinding Serum");
            await serum.update({ "system.quantity": 3 });
            const roll = async (card, actor) => h.withDie(10, async () => {
                await h.rollAndApply(card);
                await h.until(() => (cardOf(card)?.targets ?? []).every((entry) => entry.degree), `${actor.name}'s save rolled`, { timeout: 10000 });
            });
            // (The zombie: 8 hours.)
            const zombieCard = await serumHit(user, userToken, sword, serum, zombieToken);
            h.assert(zombieCard, "the serum's save card at the zombie");
            await roll(zombieCard, zombie);
            h.assert(cardOf(zombieCard).targets[0].degree === "failure", `the zombie's failure (d20 10 + 5 against 19): ${cardOf(zombieCard).targets[0].degree}`);
            await h.until(() => boundOf(zombie), `the zombie bound (${names(zombie)})`, { timeout: 10000 });
            const zombieTime = boundOf(zombie).system.duration;
            h.assert(zombieTime.value === 8 && zombieTime.unit === "hours", `a mindless undead's 8 hours (${JSON.stringify(zombieTime)})`);
            // (The vampire: 10 minutes, a mental effect.)
            const vampireCard = await serumHit(user, userToken, sword, serum, vampireToken);
            h.assert(vampireCard, "the serum's save card at the vampire");
            await roll(vampireCard, vampire);
            await h.until(() => boundOf(vampire), `the vampire bound (${names(vampire)})`, { timeout: 10000 });
            const vampireTime = boundOf(vampire).system.duration;
            h.assert(vampireTime.value === 10 && vampireTime.unit === "minutes", `another undead's 10 minutes (${JSON.stringify(vampireTime)})`);
            h.assert(/mental effect/i.test(boundOf(vampire).system.description.value ?? ""), `worded as a mental effect (${boundOf(vampire).system.description.value})`);
            // (The living humanoid: no save card.)
            const livingCard = await serumHit(user, userToken, sword, serum, livingToken);
            h.assert(!livingCard, "no save card at a creature that isn't undead");
            h.assert(!boundOf(living), `the humanoid not bound (${names(living)})`);
            return { zombie: zombieTime, vampire: vampireTime };
        }
    };
};
