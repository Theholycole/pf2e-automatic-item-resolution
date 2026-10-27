// The second batch's afflictions group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// (Afflictions, persistent damage and dying — docs/mechanics.md "Afflictions, persistent damage and dying (2026-10-27)". Only the items whose live
// play is new code have a case here: the counteract card's save mode and its held-off afflictions, its user's own numbers when better
// (scripts/counteract.js, src/live/counteract-card.js), Administer First Aid's more on a success (scripts/item-actions.js), a dead creature brought
// back (scripts/revive.js); and one PF2e question, the attitude condition a note Effect grants. The others feed mechanisms already checked live.)
// (Pseudo Afflictions must be active: its Effects are the afflictions here — PF2e's production builds have no affliction items.)

const ABILITY = "pf2e-automatic-ability-resolution";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    // (A card's words, its HTML's escapes undone.)
    const textOf = (message) => {
        const div = document.createElement("div");
        div.innerHTML = String(game.messages.get(message.id)?.content ?? message.content ?? "");
        return div.textContent.replace(/\s+/g, " ").trim();
    };
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionNames = (actor) => [...(actor.conditions ?? [])].map((condition) => `${condition.slug}${Number.isFinite(condition.value) ? ` ${condition.value}` : ""}`).join(", ") || "none";
    // (This module's note Effect on a creature, by the end of its name: "<item>: <what>".)
    const noteNamed = (actor, pattern) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.note && pattern.test(effect.name));
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    // (A statistic raised by an Effect of the check's own, so a roll's degree is known.)
    const boost = async (actor, selector, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${selector} +${value}`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "FlatModifier", selector, value }], duration: UNLIMITED } }]);
        await h.wait(300);
    };

    // One of Pseudo Afflictions' afflictions on a creature, at a stage: its Effect from its pack (its createItem hook gives the stage's
    // conditions). → the Effect.
    async function afflict(actor, name, stage = 1) {
        const pack = game.packs.get("pseudo-afflictions.effects");
        h.assert(pack, "Pseudo Afflictions' Effects pack (enable Pseudo Afflictions)");
        const entry = (await pack.getIndex()).find((row) => row.name === `Affliction Effect: ${name}`);
        h.assert(entry, `Pseudo Afflictions' ${name}`);
        const source = (await pack.getDocument(entry._id)).toObject();
        delete source._id;
        const [made] = await actor.createEmbeddedDocuments("Item", [source]);
        await h.wait(800);
        if (stage > 1) {
            await actor.items.get(made.id).update({ "system.badge.value": stage });
            await h.until(() => actor.items.get(made.id)?.system?.badge?.value === stage, `${name} at stage ${stage} (${actor.items.get(made.id)?.system?.badge?.value})`, { timeout: 5000 });
        }
        return actor.items.get(made.id);
    }

    // The counteract card's first step (its creature picked, what it finds listed). → its rows.
    async function findOn(card, drinker = 0) {
        await live().apply(card.id, { drinker });
        await h.until(() => stateOf(card)?.step === "pick", "the card's list of what it finds", { timeout: 8000 });
        return stateOf(card).rows;
    }

    return {
        // Affliction Suppressant (Major) (src/compiler/affliction-saves.js counteract.save { maxLevel 14 } with suppress; scripts/counteract.js
        // savedAgainst and holdOff): drunk by a character with Pseudo Afflictions' Cytillesh Oil (a level 1 poison, Fortitude DC 19) and Fortitude +10.
        // "You can attempt a save against one affliction of 14th level or lower affecting you. If you succeed, the affliction is suppressed for 10
        // minutes." Its item card gives the +4 item bonus to saves; beside it the counteract card in its save mode ("save" in its header) finds the
        // poison with its DC and save, and rolls PF2e's own Fortitude save at DC 19 (a 10 on the die: 20, or 24 with the bonus — a success). The
        // poison stays, and a note Effect "… Cytillesh Oil suppressed" lasts 10 minutes.
        async b2AfflictionsSuppressantSave(scene) {
            await h.clearSquares(scene, [[1, 1]]);
            const { actor: drinker } = await h.creature(scene, "Suppressant Drinker", { type: "character", x: 1, y: 1 });
            await boost(drinker, "fortitude", 10);
            const venom = await afflict(drinker, "Cytillesh Oil");
            const elixir = await h.give(drinker, "Affliction Suppressant (Major)");
            let since = Date.now();
            await elixir.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the elixir's item card" });
            const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "its save card (the counteract card's save mode)" });
            h.assert(/A save against one curse, disease or poison of level 14 or lower: on a success it's suppressed for 10 minutes/.test(textOf(counter)), `its save mode's words (${textOf(counter).slice(0, 300)})`);
            // (The item card's +4 item bonus to saves, against afflictions.)
            await live().apply(card.id, { drinker: 0 });
            const bonus = () => drinker.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && Number(rule.value) === 4 && rule.type === "item"));
            await h.until(bonus, `the +4 item bonus to saves (${effectNames(drinker)})`, { timeout: 8000 });
            const rows = await findOn(counter, 0);
            h.assert(rows.length === 1 && rows[0].id === venom.id && rows[0].name === "Cytillesh Oil" && rows[0].dc === 19 && rows[0].save === "fortitude" && rows[0].ticked, `the poison listed with its DC 19 and Fortitude save, ticked (${JSON.stringify(rows)})`);
            since = Date.now();
            await h.withDie(10, () => live().apply(counter.id, { rows: [{ ticked: true }] }));
            const save = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === drinker.id, { what: "PF2e's Fortitude save" });
            h.assert(save.flags.pf2e.context.dc?.value === 19, `at DC 19 (${JSON.stringify(save.flags.pf2e.context.dc ?? null)})`);
            await h.until(() => stateOf(counter)?.status === "applied", "the save's result on the card", { timeout: 8000 });
            const note = () => noteNamed(drinker, /: Cytillesh Oil suppressed$/);
            await h.until(note, `the "Cytillesh Oil suppressed" note Effect (${effectNames(drinker)}; ${JSON.stringify(resultsOf(counter))})`, { timeout: 8000 });
            h.assert(note().system.duration.value === 10 && note().system.duration.unit === "minutes", `for 10 minutes (${JSON.stringify(note().system.duration)})`);
            h.assert(drinker.items.get(venom.id), "the poison stays, held off");
            // (Whether PF2e's save took the +4, the affliction passed as its item: reported, not required.)
            const bonusOnSave = (save.flags.pf2e.modifiers ?? []).some((modifier) => Number(modifier.modifier) === 4 && modifier.type === "item" && modifier.enabled !== false);
            return { save: save.rolls?.[0]?.total, outcome: save.flags.pf2e.context.outcome, bonusOnSave, results: resultsOf(counter) };
        },

        // Mantle of Amazing Health's second activation (affliction-saves.js withSaveToEnd: counteract.save, self, immunity 24 hours): its wearer
        // (Fortitude +10) has Pseudo Afflictions' Rabies (a disease, DC 16; its stage 1's Sickened 1 granted by its Effect) and Endless Nightmare (a
        // curse). The card is only its wearer's and lists the disease alone — "a poison or disease". A 10 on the die (20 against DC 16, a success)
        // ends Rabies and the Sickened it gave, the curse stays, and a note Effect "… immune to Rabies" lasts 24 hours.
        async b2AfflictionsMantleCure(scene) {
            await h.clearSquares(scene, [[1, 3]]);
            const { actor: wearer } = await h.creature(scene, "Mantle Wearer", { type: "character", x: 1, y: 3 });
            await boost(wearer, "fortitude", 10);
            const rabies = await afflict(wearer, "Rabies");
            await h.until(() => wearer.hasCondition("sickened"), `Rabies' Sickened 1 (${conditionNames(wearer)})`, { timeout: 5000 });
            const sickened = wearer.itemTypes.condition.find((condition) => condition.slug === "sickened");
            h.assert(sickened?.flags?.pf2e?.grantedBy?.id === rabies.id, `its Sickened granted by Rabies' Effect (${JSON.stringify(sickened?.flags?.pf2e?.grantedBy ?? null)})`);
            const curse = await afflict(wearer, "Endless Nightmare");
            const mantle = await h.give(wearer, "Mantle of Amazing Health");
            await mantle.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            const since = Date.now();
            await live().activate(mantle.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the mantle's save card" });
            h.assert(/A save against one disease or poison: on a success it ends, and it's immune to that one for 24 hours/.test(textOf(card)), `its words (${textOf(card).slice(0, 300)})`);
            h.assert(stateOf(card).drinkers.length === 1 && stateOf(card).drinkers[0].actorUuid === wearer.uuid, `its wearer's alone (${JSON.stringify(stateOf(card).drinkers.map((entry) => entry.name))})`);
            const rows = await findOn(card, 0);
            h.assert(rows.length === 1 && rows[0].id === rabies.id && rows[0].dc === 16 && rows[0].save === "fortitude", `only the disease, DC 16 (${JSON.stringify(rows)})`);
            await h.withDie(10, () => live().apply(card.id, { rows: [{ ticked: true }] }));
            await h.until(() => !wearer.items.get(rabies.id), `Rabies ended (${effectNames(wearer)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            await h.until(() => !wearer.hasCondition("sickened"), `the Sickened it gave gone (${conditionNames(wearer)})`, { timeout: 5000 });
            h.assert(wearer.items.get(curse.id), "the curse stays (not the mantle's)");
            const immune = noteNamed(wearer, /: immune to Rabies$/);
            h.assert(immune && immune.system.duration.value === 24 && immune.system.duration.unit === "hours", `the "immune to Rabies" note Effect for 24 hours (${effectNames(wearer)})`);
            return { results: resultsOf(card), immune: immune.name };
        },

        // Razmiri Mask (Silver)'s Call Upon Razmir's Mercy (affliction-saves.js withMercy: fromUser.rank half-level, afflictionsByRank, suppress with
        // stageDown; scripts/counteract.js holdOff): a level 10 user (rank 5: curses, diseases and poisons) at the adjacent creature with Pseudo
        // Afflictions' Cytillesh Oil at stage 2 (DC 19, rank 1). The card shows +17, rank 5 and the three kinds; a 10 on the die (27, a success)
        // counteracts it: the poison stays, down to stage 1 for now, and a note Effect "… Cytillesh Oil suppressed" lasts 24 hours. A level 4 user's
        // card (rank 2) lists nothing on the same creature.
        async b2AfflictionsMaskMercy(scene) {
            await h.clearSquares(scene, [[1, 5], [2, 5], [3, 5]]);
            const { actor: user } = await h.creature(scene, "Mercy Mask Wearer", { type: "character", x: 1, y: 5, level: 10 });
            const { actor: target } = await h.creature(scene, "Mercy Poisoned", { x: 2, y: 5, hp: 60 });
            const venom = await afflict(target, "Cytillesh Oil", 2);
            const mask = await h.give(user, "Razmiri Mask (Silver)");
            await mask.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            let since = Date.now();
            await live().activate(mask.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the mask's counteract card" });
            const counteract = stateOf(card).counteract;
            h.assert(counteract.rank === 5 && counteract.modifier === 17, `+17, rank 5 at level 10 (+${counteract.modifier}, rank ${counteract.rank})`);
            h.assert(JSON.stringify([...(counteract.afflictions ?? [])].sort()) === '["curse","disease","poison"]', `a curse, disease or poison (${JSON.stringify(counteract.afflictions)})`);
            h.assert(/Counteract \+17, rank 5: one effect a curse, disease or poison; counteracted, it's suppressed for 24 hours rather than removed/.test(textOf(card)), `its words (${textOf(card).slice(0, 300)})`);
            const at = stateOf(card).drinkers.findIndex((entry) => entry.actorUuid === target.uuid);
            h.assert(at > 0, `the adjacent creature offered (${JSON.stringify(stateOf(card).drinkers.map((entry) => entry.name))})`);
            const rows = await findOn(card, at);
            h.assert(rows.length === 1 && rows[0].id === venom.id && rows[0].dc === 19 && rows[0].rank === 1 && rows[0].ticked, `the poison, DC 19 rank 1 (${JSON.stringify(rows)})`);
            await h.withDie(10, () => live().apply(card.id, { rows: [{ ticked: true }] }));
            await h.until(() => stateOf(card)?.status === "applied", "the counteract rolled", { timeout: 8000 });
            const results = resultsOf(card);
            h.assert(target.items.get(venom.id), `the poison stays (${JSON.stringify(results)})`);
            await h.until(() => target.items.get(venom.id)?.system?.badge?.value === 1, `down to stage 1 for now (${target.items.get(venom.id)?.system?.badge?.value}; ${JSON.stringify(results)})`, { timeout: 5000 });
            const note = noteNamed(target, /: Cytillesh Oil suppressed$/);
            h.assert(note && note.system.duration.value === 24 && note.system.duration.unit === "hours", `the "Cytillesh Oil suppressed" note Effect for 24 hours (${effectNames(target)})`);
            h.assert(results.some((line) => /Cytillesh Oil down to stage 1 for now/.test(line)), `the card's stage line (${JSON.stringify(results)})`);
            // (A level 4 user: rank 2, below Cleanse Affliction's rank 3 — nothing.)
            const { actor: novice } = await h.creature(scene, "Mercy Mask Novice", { type: "character", x: 3, y: 5, level: 4 });
            const second = await h.give(novice, "Razmiri Mask (Silver)");
            since = Date.now();
            await live().activate(second.uuid, 1);
            const low = await h.messageAfter(since, h.itemCard("counteract"), { what: "the level 4 user's counteract card" });
            h.assert(stateOf(low).counteract.rank === 2 && (stateOf(low).counteract.afflictions ?? []).length === 0, `rank 2, no kinds (${JSON.stringify(stateOf(low).counteract)})`);
            const lowAt = stateOf(low).drinkers.findIndex((entry) => entry.actorUuid === target.uuid);
            h.assert(lowAt > 0, `the poisoned creature offered (${JSON.stringify(stateOf(low).drinkers.map((entry) => entry.name))})`);
            const none = await findOn(low, lowAt);
            h.assert(none.length === 0 && /has nothing this counteracts/.test(textOf(low)), `nothing listed (${JSON.stringify(none)})`);
            return { results, stage: target.items.get(venom.id)?.system?.badge?.value, note: note.name };
        },

        // Flame Navette (src/compiler/own-counteract.js fromUser { modifier "will", better, needs Determination }; src/compiler/one-a-day.js
        // item.immunity "flame-navette" for a day; scripts/counteract.js hasNeeds/betterOf, scripts/immunity.js): its user's Will raised to +30 and
        // Clumsy 1 on it. Without the Determination feat the card is the item's +22, rank 8. With it, its user's +30 (higher), rank 8, and a line
        // saying they're its user's own. That card ends the Clumsy outright and gives the "Immune:" Effect for flame navettes; a third navette's
        // card the same day is refused ("still immune"), its card left open.
        async b2AfflictionsNavetteOwnWill(scene) {
            await h.clearSquares(scene, [[1, 7]]);
            const { actor: fighter } = await h.creature(scene, "Navette Fighter", { type: "character", x: 1, y: 7 });
            await boost(fighter, "will", 30);
            await fighter.increaseCondition("clumsy");
            const will = Number(fighter.saves.will.mod);
            h.assert(will > 22, `its Will above the navette's +22 (${will})`);
            const post = async (what) => {
                const navette = await h.give(fighter, "Flame Navette");
                const since = Date.now();
                await navette.consume();
                return h.messageAfter(since, h.itemCard("counteract"), { what });
            };
            const own = /own modifier \+\d+: higher than the item's/;
            const plain = await post("the navette's card without Determination");
            const without = stateOf(plain).counteract;
            h.assert(without.modifier === 22 && without.rank === 8 && !(without.notes ?? []).some((note) => own.test(note)), `the item's +22, rank 8 (+${without.modifier}, rank ${without.rank}; ${JSON.stringify(without.notes)})`);
            await h.give(fighter, "Determination", "pf2e.feats-srd");
            const card = await post("the navette's card with Determination");
            const counteract = stateOf(card).counteract;
            h.assert(counteract.modifier === will && counteract.rank === 8, `its user's Will +${will}, rank 8 (+${counteract.modifier}, rank ${counteract.rank})`);
            h.assert((counteract.notes ?? []).some((note) => new RegExp(`own modifier \\+${will}: higher than the item's`).test(note)), `the line naming its user's numbers (${JSON.stringify(counteract.notes)})`);
            h.assert(new RegExp(`Counteract \\+${will}, rank 8`).test(textOf(card)), `its words (${textOf(card).slice(0, 300)})`);
            const rows = await findOn(card, 0);
            h.assert(rows.some((row) => row.slug === "clumsy" && row.ends), `Clumsy listed, ending outright (${JSON.stringify(rows)})`);
            await live().apply(card.id, { rows: rows.map((row) => ({ ticked: row.slug === "clumsy" })) });
            await h.until(() => !fighter.hasCondition("clumsy"), `Clumsy ended (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            // (Only one a day: the immunity tracker's Effect, then the next navette refused.)
            const immune = () => fighter.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "flame-navette" || effect.flags?.[h.NS]?.immunity === "flame-navette");
            await h.until(immune, `the "Immune:" Effect for flame navettes after one was used (${effectNames(fighter)})`, { timeout: 5000 });
            const third = await post("the third navette's card");
            const refused = await live().apply(third.id, { drinker: 0 }).then(() => null, (error) => error.message);
            h.assert(/still immune/.test(refused ?? ""), `the next navette that day refused (${refused ?? "applied"})`);
            h.assert(stateOf(third).status === "open" && stateOf(third).step === "find", `its card left open (${stateOf(third).status}, ${stateOf(third).step})`);
            return { will, plain: without.modifier, own: counteract.modifier, refused, immune: immune().name };
        },

        // Contagion Metabolizer (Lesser) (own-counteract.js fromUser { rank half-level, modifier class-dc, better, needs chirurgeon + powerful-alchemy,
        // infused }): a level 12 character with PF2e's Chirurgeon and Powerful Alchemy class features and an alchemist class DC (an Effect's
        // ActiveEffectLike, expert: its modifier its DC - 10). A bought one shows the item's +11, rank 3; one made by Quick Alchemy (PF2e's infused
        // trait) its user's rank 6 (half of 12) and its class DC - 10, both higher, with the line saying so.
        async b2AfflictionsMetabolizerChirurgeon(scene) {
            await h.clearSquares(scene, [[1, 9]]);
            const { actor: alchemist } = await h.creature(scene, "Chirurgeon Alchemist", { type: "character", x: 1, y: 9, level: 12 });
            await h.give(alchemist, "Chirurgeon", "pf2e.classfeatures");
            await h.give(alchemist, "Powerful Alchemy", "pf2e.classfeatures");
            await alchemist.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} alchemist class DC`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "ActiveEffectLike", mode: "override", path: "system.proficiencies.classDCs.alchemist", value: { label: "Alchemist", attribute: "int", rank: 2, primary: true } }], duration: UNLIMITED } }]);
            const classMod = () => Math.max(...[alchemist.classDC?.mod, ...Object.values(alchemist.classDCs ?? {}).map((entry) => entry?.mod)].map(Number).filter(Number.isFinite));
            await h.until(() => Number.isFinite(classMod()), "its alchemist class DC (the Effect's ActiveEffectLike)", { timeout: 5000 });
            const mod = classMod();
            h.assert(mod > 11, `its class DC - 10 above the item's +11 (${mod})`);
            const post = async (infused, what) => {
                const elixir = await h.give(alchemist, "Contagion Metabolizer (Lesser)");
                if (infused) await elixir.update({ "system.traits.value": [...new Set([...(elixir.system.traits.value ?? []), "infused"])] });
                const since = Date.now();
                await elixir.consume();
                return h.messageAfter(since, h.itemCard("counteract"), { what });
            };
            const own = /own rank \d+ and modifier \+\d+: higher than the item's/;
            const bought = stateOf(await post(false, "the bought metabolizer's card")).counteract;
            h.assert(bought.modifier === 11 && bought.rank === 3 && !(bought.notes ?? []).some((note) => own.test(note)), `a bought one: the item's +11, rank 3 (+${bought.modifier}, rank ${bought.rank}; ${JSON.stringify(bought.notes)})`);
            const made = stateOf(await post(true, "the infused metabolizer's card")).counteract;
            h.assert(made.rank === 6 && made.modifier === mod, `made by Quick Alchemy: rank 6 and +${mod} (+${made.modifier}, rank ${made.rank})`);
            h.assert((made.notes ?? []).some((note) => new RegExp(`own rank 6 and modifier \\+${mod}: higher than the item's`).test(note)), `the line saying they're its user's (${JSON.stringify(made.notes)})`);
            return { classMod: mod, bought: [bought.modifier, bought.rank], made: [made.modifier, made.rank] };
        },

        // Crying Angel Pendant, stabilizing (src/compiler/first-aid.js action.onSuccess.stabilize { hp 1 }; scripts/item-actions.js): PF2e's
        // Administer First Aid (the stabilize variant, its DC 5 + recovery DC 10 + dying 1) by a healer with Medicine +40 at a dying ally at 0 Hit
        // Points, unconscious. On the success the ally regains 1 Hit Point, loses Dying and Unconscious, and is Wounded 1.
        async b2AfflictionsAngelStabilize(scene) {
            await h.clearSquares(scene, [[1, 11], [2, 11]]);
            const { actor: healer } = await h.creature(scene, "Angel Stabilizer", { type: "character", x: 1, y: 11 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Angel Dying Ally", { type: "character", x: 2, y: 11 });
            await boost(healer, "medicine", 40);
            // (Hit Points enough to regain one: a bare character's may be none.)
            await boost(ally, "hp", 20);
            await ally.update({ "system.attributes.hp.value": 0 });
            await ally.increaseCondition("dying");
            await h.until(() => ally.hasCondition("dying") && ally.hasCondition("unconscious"), `dying and unconscious (${conditionNames(ally)})`, { timeout: 5000 });
            h.assert(Number(ally.system.attributes.hp.max) >= 1 && hp(ally) === 0, `0 of ${ally.system.attributes.hp.max} Hit Points`);
            const pendant = await h.give(healer, "Crying Angel Pendant");
            const since = Date.now();
            await pendant.consume();
            const card = await h.messageAfter(since, h.itemCard("item-action"), { what: "the pendant's First Aid card" });
            await h.withDie(10, () => live().apply(card.id, { targets: [allyToken.uuid] }));
            const roll = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === healer.id, { what: "PF2e's First Aid roll", timeout: 12000 });
            const outcome = roll.flags.pf2e.context.outcome ?? null;
            h.assert(["success", "criticalSuccess"].includes(outcome), `a success against the stabilize DC (${outcome}, DC ${JSON.stringify(roll.flags.pf2e.context.dc ?? null)})`);
            await h.until(() => hp(ally) === 1 && !ally.hasCondition("dying"), `1 Hit Point and no longer dying (${hp(ally)} HP; ${conditionNames(ally)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(!ally.hasCondition("unconscious"), `awake (${conditionNames(ally)})`);
            h.assert((ally.getCondition("wounded")?.value ?? 0) === 1, `Wounded 1, as normal (${ally.getCondition("wounded")?.value ?? 0})`);
            return { outcome, hp: hp(ally), results: resultsOf(card) };
        },

        // Crying Angel Pendant, stopping bleeding (first-aid.js action.onSuccess["stop-bleeding"] { ends bleed }; scripts/item-actions.js recover
        // ends): PF2e's Administer First Aid by a healer with Medicine +40 at a creature with persistent bleed (1d6, not dying) — the stop-bleeding
        // variant. On the success its persistent bleed is deleted outright, no flat check.
        async b2AfflictionsAngelBleed(scene) {
            await h.clearSquares(scene, [[1, 13], [2, 13]]);
            const { actor: healer } = await h.creature(scene, "Angel Bandager", { type: "character", x: 1, y: 13 });
            const { actor: bleeder, token: bleederToken } = await h.creature(scene, "Angel Bleeder", { x: 2, y: 13 });
            await boost(healer, "medicine", 40);
            const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
            persistent.system.persistent = { formula: "1d6", damageType: "bleed", dc: 15 };
            await bleeder.createEmbeddedDocuments("Item", [persistent]);
            const bleed = () => bleeder.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "bleed");
            await h.until(bleed, "persistent bleed", { timeout: 5000 });
            const pendant = await h.give(healer, "Crying Angel Pendant");
            const since = Date.now();
            await pendant.consume();
            const card = await h.messageAfter(since, h.itemCard("item-action"), { what: "the pendant's First Aid card" });
            await h.withDie(10, () => live().apply(card.id, { targets: [bleederToken.uuid] }));
            const roll = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === healer.id, { what: "PF2e's First Aid roll", timeout: 12000 });
            await h.until(() => resultsOf(card).length, "the card's result", { timeout: 8000 });
            const options = roll.flags.pf2e.context.options ?? [];
            const outcome = roll.flags.pf2e.context.outcome ?? null;
            // (PF2e's action has no DC of its own for stop bleeding: without one the roll has no degree, and the card's success never comes.)
            h.assert(["success", "criticalSuccess"].includes(outcome), `a success at stopping the bleeding (${outcome ?? "no degree"}, DC ${JSON.stringify(roll.flags.pf2e.context.dc ?? null)}; stop-bleeding variant ${options.some((option) => /stop-bleeding/.test(option))}; ${JSON.stringify(resultsOf(card))})`);
            await h.until(() => !bleed(), `the persistent bleed ended (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            return { outcome, results: resultsOf(card) };
        },

        // Gift of the Poisoned Heart (src/compiler/revive.js item.revive { hp 1, debilitation 7 days }; scripts/revive.js, scripts/live.js
        // applyToRecipient): its item card offers the adjacent dead creature (an NPC at 0 of 50 Hit Points, dying, unconscious, PF2e's dead status,
        // 2 Focus Points). Given to it: the dead status off, Dying and Unconscious gone, 1 Hit Point, no Focus Points, a "back from death" note
        // Effect; a 7-day "debilitated" Effect granting Clumsy 1, Drained 1 and Enfeebled 1 (PF2e's, which can't be removed: removing Clumsy is
        // refused); the curse's note Effect on it; and Drained doesn't take it back to 0 Hit Points.
        async b2AfflictionsGiftRevive(scene) {
            await h.clearSquares(scene, [[1, 15], [2, 15]]);
            const { actor: bearer } = await h.creature(scene, "Gift Bearer", { type: "character", x: 1, y: 15 });
            const { actor: dead } = await h.creature(scene, "Gift Corpse", { x: 2, y: 15, hp: 0 });
            await dead.update({ "system.resources.focus": { value: 2, max: 2 } });
            await dead.increaseCondition("dying");
            await dead.toggleStatusEffect("dead", { active: true, overlay: true });
            await h.until(() => dead.statuses?.has?.("dead") && hp(dead) === 0, `PF2e's dead status at 0 Hit Points (${hp(dead)})`, { timeout: 5000 });
            const focusBefore = Number(dead.system.resources?.focus?.value) || 0;
            const gift = await h.give(bearer, "Gift of the Poisoned Heart");
            const since = Date.now();
            await gift.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the gift's card" });
            const at = stateOf(card).drinkers.findIndex((entry) => entry.actorUuid === dead.uuid);
            h.assert(at > 0, `the dead creature offered (${JSON.stringify(stateOf(card).drinkers.map((entry) => entry.name))})`);
            await live().apply(card.id, { drinker: at });
            await h.until(() => !dead.statuses?.has?.("dead") && hp(dead) === 1, `back to life with 1 Hit Point (${hp(dead)} HP, dead ${dead.statuses?.has?.("dead")}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(!dead.hasCondition("dying") && !dead.hasCondition("unconscious"), `Dying and Unconscious gone (${conditionNames(dead)})`);
            if (focusBefore) h.assert(Number(dead.system.resources.focus.value) === 0, `its Focus Points spent (${dead.system.resources.focus.value} of ${focusBefore})`);
            h.assert(noteNamed(dead, /: back from death$/), `the "back from death" note Effect (${effectNames(dead)})`);
            const debilitated = dead.itemTypes.effect.find((effect) => /: debilitated$/.test(effect.name));
            h.assert(debilitated && debilitated.system.duration.value === 7 && debilitated.system.duration.unit === "days", `the 7-day "debilitated" Effect (${effectNames(dead)})`);
            for (const slug of ["clumsy", "drained", "enfeebled"]) {
                const condition = dead.itemTypes.condition.find((entry) => entry.slug === slug);
                h.assert(condition && Number(condition.value) === 1 && condition.flags?.pf2e?.grantedBy?.id === debilitated.id, `${slug} 1 granted by it (${conditionNames(dead)}; ${JSON.stringify(condition?.flags?.pf2e?.grantedBy ?? null)})`);
            }
            h.assert(dead.itemTypes.effect.some((effect) => /poisoned heart's curse/i.test(effect.name)), `the curse's note Effect on the revived (${effectNames(dead)})`);
            // (PF2e's restrict: its granted Clumsy can't be removed while the week lasts.)
            await dead.decreaseCondition("clumsy", { forceRemove: true }).catch(() => null);
            await h.wait(800);
            h.assert(Number(dead.getCondition("clumsy")?.value) === 1, `Clumsy 1 can't be removed (${conditionNames(dead)})`);
            h.assert(hp(dead) === 1, `Drained didn't take it back to 0 Hit Points (${hp(dead)} of ${dead.system.attributes.hp.max})`);
            return { hp: hp(dead), max: dead.system.attributes.hp.max, focusBefore, conditions: conditionNames(dead), results: resultsOf(card) };
        },

        // Rose of Loves Lost (src/compiler/cursed-gifts.js; its save card the ability module's): not new live code, but the question live play alone
        // answers — whether PF2e takes a note Effect's GrantItem of its Friendly attitude condition. The creature given the rose (Will -30) critically
        // fails its DC 27 Will save: the "Charmed by the rose" note Effect on it with no end, and PF2e's Friendly condition granted by it.
        async b2AfflictionsRoseCharm(scene) {
            await h.clearSquares(scene, [[1, 17], [2, 17]]);
            const { actor: giver } = await h.creature(scene, "Rose Giver", { type: "character", x: 1, y: 17 });
            const { actor: beloved, token: belovedToken } = await h.creature(scene, "Rose Beloved", { x: 2, y: 17, save: -30 });
            const rose = await h.give(giver, "Rose of Loves Lost");
            let since = Date.now();
            await rose.consume();
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the rose's card" });
            since = Date.now();
            await live().apply(card.id, { targets: [belovedToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the rose's Will save card" });
            const check = save.flags[ABILITY].card.plan.resolution.check;
            h.assert(check.statistic === "will" && check.against?.value === 27, `a Will save at DC 27 (${JSON.stringify(check)})`);
            await h.rollAndApply(save);
            const charm = () => beloved.itemTypes.effect.find((effect) => /Charmed by the rose/i.test(effect.name));
            await h.until(charm, `the charm's note Effect (${effectNames(beloved)})`, { timeout: 10000 });
            h.assert(charm().system.duration.unit === "unlimited", `with no end (${JSON.stringify(charm().system.duration)})`);
            const friendly = () => beloved.hasCondition?.("friendly") || [...(beloved.conditions ?? [])].some((condition) => condition.slug === "friendly");
            await h.until(friendly, `PF2e's Friendly granted by it (${conditionNames(beloved)}; its rules ${JSON.stringify(charm().system.rules)})`, { timeout: 5000 });
            return { charm: charm().name, conditions: conditionNames(beloved) };
        }
    };
};
