// The second batch's illusions group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// (Illusions and disbelief, docs/mechanics.md "An illusion a creature can see through". Only the group's new live code has a case here: the
// disbelief card's DC that is its user's — disbelief.against, read when the card is posted (scripts/disbelief.js postDisbeliefCard) —, its
// second check — disbelief.also, rolled on the GM's pick (scripts/disbelief.js applyDisbeliefCard check, src/live/disbelief-card.js
// withAttempt, the card's select read by scripts/live.js choicesOf) —, Wooden Nickel's "Prerequisites" read at the Use as a requirement
// (src/compiler/requirement.js, called by scripts/live.js postCardFor), and magicsense's name in src/live/card.js SENSE_WORDS. The group's
// other readings feed mechanisms already checked live: note Effects with PF2e's rules, an item card's recipient targets (alliesEffect), a
// ways card used once (featherBuffet) and an unarmed Strike's Effect (tigerClawStriking), a modifier with PF2e's predicate, the disbelief
// card posted by an item card (possumDisbelief).)

const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    // (The Effect on a creature that saw through an item's illusion: scripts/disbelief.js's.)
    const sawThrough = (actor, item) => actor.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "disbelieved")?.item === item) ?? null;
    // (PF2e's roll for that creature since then, of that type: "skill-check", "perception-check".)
    const rollOf = (since, actor, type) => h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === type && message.speaker?.actor === actor.id, { what: `${actor.name}'s ${type}` });
    const rolledWith = (message, slug) => {
        const context = message.flags.pf2e.context;
        return (context.options ?? []).includes(`check:statistic:${slug}`) || (context.domains ?? []).includes(slug);
    };
    // (A card's line with its user's name in it: its apostrophe as written or escaped.)
    const apostrophe = "(?:'|&#39;|&#x27;|&apos;)";
    // (The requirement whisper for that actor since then: scripts/live.js's requirementWarning.)
    const warned = (since, actor) => game.messages.contents.find((message) => Number(message.timestamp ?? 0) >= since && /its Requirements need its user to be master in Deception/.test(message.content ?? "") && (message.content ?? "").includes(actor.name)) ?? null;
    // (The disbelief card as drawn in the chat log, wired by scripts/live.js wireCard, with its check select: null when it isn't drawn.)
    async function cardRoot(message, { timeout = 5000 } = {}) {
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            const root = [...document.querySelectorAll(`[data-message-id="${message.id}"] .pf2e-air-card`)].find((entry) => entry.dataset.airWired && entry.querySelector("select[data-air-field='check']") && entry.querySelector("[data-air-action='apply']"));
            if (root) return root;
            await h.wait(200);
        }
        return null;
    }

    return {
        // Wooden Nickel (illusions.js; scripts/disbelief.js disbelief.against and .also with through, src/compiler/requirement.js
        // "Prerequisites"): a creature that touches or Interacts with an affected object may roll Perception against its user's Deception
        // DC to disbelieve the illusion, and a successful check against your Deception DC with Crafting … will also reveal the item's true
        // nature." Used by a master in Deception (no requirement whisper): its card applied, the 10-minute note on its user and the GM's
        // disbelief card, Perception and Crafting both at that PC's Deception DC (read live), its check picked on the card. A creature's
        // Crafting at 20 is rolled against that DC and sees through it (named, the Saw-through Effect); another's at 1 doesn't, and its
        // Perception at 20 then does. Used by an untrained PC: the GM's requirement whisper, and its card's DC that PC's own, lower one.
        async b2IllusionsWoodenNickel(scene) {
            await h.clearSquares(scene, [[2, 12], [2, 14], [4, 12], [5, 12]]);
            const { actor: master } = await h.creature(scene, "Nickel Master", { type: "character", x: 2, y: 12, level: 9 });
            const { actor: novice } = await h.creature(scene, "Nickel Novice", { type: "character", x: 2, y: 14, level: 9 });
            const { actor: crafter, token: crafterToken } = await h.creature(scene, "Nickel Crafter", { x: 4, y: 12, alliance: "opposition" });
            const { actor: doubter, token: doubterToken } = await h.creature(scene, "Nickel Doubter", { x: 5, y: 12, alliance: "opposition" });
            await master.update({ "system.skills.deception.rank": 3 });
            await h.until(() => Number(master.skills?.deception?.rank) === 3, `master in Deception (${master.skills?.deception?.rank})`, { timeout: 5000 });
            const dc = Number(master.skills.deception.dc.value);
            const lower = Number(novice.skills.deception.dc.value);
            h.assert(Number.isFinite(dc) && Number.isFinite(lower) && dc > lower, `the master's Deception DC above the untrained one's (${dc}, ${lower})`);

            // (Used by the master: no whisper, the card, its note and the disbelief card at the master's DC.)
            let since = Date.now();
            const nickel = await h.give(master, "Wooden Nickel");
            await nickel.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "Wooden Nickel's card" });
            await api().apply(card.id);
            const disbelief = await h.messageAfter(since, h.itemCard("disbelief"), { what: "the disbelief card" });
            h.assert(disbelief.whisper.length > 0, "the disbelief card whispered to the GM");
            const shown = stateOf(disbelief).plan.disbelief;
            h.assert(shown.dc === dc && shown.also?.statistic === "crafting" && shown.also?.dc === dc && shown.also?.through === true, `Perception and Crafting both at the master's Deception DC ${dc} (${JSON.stringify(shown)})`);
            const content = disbelief.content ?? "";
            h.assert(new RegExp(`Perception DC ${dc} \\(its user${apostrophe}s Deception DC\\); Crafting DC ${dc} \\(its user${apostrophe}s Deception DC\\)`).test(content), `its line names both DCs (${content})`);
            h.assert(/data-air-field="check"/.test(content) && /Roll it/.test(content), `the check's pick and its Roll it button (${content})`);
            h.assert(Number.isFinite(stateOf(disbelief).until), "open for the illusion's 10 minutes");
            h.assert(!warned(since, master), "no requirement whisper for a master in Deception");
            const note = () => master.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.note && /Wooden Nickel$/.test(effect.name));
            await h.until(note, `the 10-minute note on its user (${effectNames(master)})`, { timeout: 8000 });
            h.assert(note().system.duration.value === 10 && note().system.duration.unit === "minutes", `the note for 10 minutes (${JSON.stringify(note().system.duration)})`);

            // (The crafter's Crafting, the second check, at 20: against the master's DC, and it sees through it.)
            since = Date.now();
            await h.withDie(20, () => api().apply(disbelief.id, { targets: [crafterToken.uuid], check: 1 }));
            const crafted = await rollOf(since, crafter, "skill-check");
            h.assert(rolledWith(crafted, "crafting") && Number(crafted.flags.pf2e.context.dc?.value) === dc, `PF2e's Crafting check against DC ${dc} (${JSON.stringify({ dc: crafted.flags.pf2e.context.dc, options: (crafted.flags.pf2e.context.options ?? []).filter((option) => option.startsWith("check:")) })})`);
            let state = stateOf(disbelief);
            h.assert(/Nickel Crafter \(Crafting\): (critical )?success, sees what the object truly is/.test(state.results.at(-1) ?? ""), `the crafter's line (${state.results.join("; ")})`);
            h.assert(state.saw.some((name) => /Nickel Crafter/.test(name)), `the crafter saw through it (${state.saw.join(", ")})`);
            await h.until(() => sawThrough(crafter, "Wooden Nickel"), `the crafter's Saw-through Effect (${effectNames(crafter)})`, { timeout: 8000 });

            // (The doubter's Crafting at 1: no wiser, not seeing through; its Perception at 20, the first check, against the same DC: it does.)
            since = Date.now();
            await h.withDie(1, () => api().apply(disbelief.id, { targets: [doubterToken.uuid], check: 1 }));
            state = stateOf(disbelief);
            h.assert(/Nickel Doubter \(Crafting\): (critical )?failure, no wiser/.test(state.results.at(-1) ?? ""), `the doubter's Crafting line (${state.results.join("; ")})`);
            h.assert(!state.saw.some((name) => /Nickel Doubter/.test(name)), `the doubter didn't see through it (${state.saw.join(", ")})`);
            await h.wait(600);
            h.assert(!sawThrough(doubter, "Wooden Nickel"), `no Saw-through Effect on the doubter yet (${effectNames(doubter)})`);
            const failedFooled = [...state.fooled];
            // (A failed Crafting, a try at seeing through it, leaves it fooled: listed so since 2026-10-27, src/live/disbelief-card.js.)
            h.assert(failedFooled.some((name) => /Nickel Doubter/.test(name)), `the doubter under Tried and still fooled after its Crafting (${failedFooled.join(", ")})`);
            since = Date.now();
            await h.withDie(20, () => api().apply(disbelief.id, { targets: [doubterToken.uuid], check: 0 }));
            const perceived = await rollOf(since, doubter, "perception-check");
            h.assert(Number(perceived.flags.pf2e.context.dc?.value) === dc, `PF2e's Perception check against DC ${dc} (${JSON.stringify(perceived.flags.pf2e.context.dc)})`);
            state = stateOf(disbelief);
            h.assert(/Nickel Doubter: (critical )?success, sees through the illusion/.test(state.results.at(-1) ?? ""), `the doubter's Perception line (${state.results.join("; ")})`);
            h.assert(state.saw.length === 2, `both named under Saw through it (${state.saw.join(", ")})`);
            await h.until(() => sawThrough(doubter, "Wooden Nickel"), `the doubter's Saw-through Effect (${effectNames(doubter)})`, { timeout: 8000 });

            // (Used by the untrained PC: the GM's requirement whisper, the card still posted, its DC that PC's own.)
            since = Date.now();
            const second = await h.give(novice, "Wooden Nickel");
            await second.consume();
            const noviceCard = await h.messageAfter(since, h.itemCard("item"), { what: "the untrained user's card" });
            await h.until(() => warned(since, novice), "the GM's requirement whisper for the untrained user", { timeout: 8000 });
            const whisper = warned(since, novice);
            h.assert(whisper.whisper.length > 0 && /is untrained/.test(whisper.content), `whispered, naming its rank (${whisper.content})`);
            await api().apply(noviceCard.id);
            const noviceDisbelief = await h.messageAfter(since, h.itemCard("disbelief"), { what: "the untrained user's disbelief card" });
            const noviceShown = stateOf(noviceDisbelief).plan.disbelief;
            h.assert(noviceShown.dc === lower && noviceShown.also?.dc === lower, `its DCs the untrained user's ${lower} (${JSON.stringify(noviceShown)})`);
            return { dc, lower, results: state.results, saw: state.saw, fooledAfterFailedCrafting: failedFooled, whisper: whisper.content };
        },

        // Misdirecting Haversack's first activation (illusions.js; scripts/disbelief.js disbelief.also without through, scripts/live.js
        // choicesOf's check): "Anyone inspecting a document notices the disguise with a successful Perception check, but determining the
        // actual text requires a successful Society check to Decipher Writing" (both DC 20). Its card applied, the GM's disbelief card offers
        // Perception or Society. Society picked on the card's own select with a creature targeted and Roll it pressed, at 20: PF2e's Society
        // check against DC 20, the line '<name> (Society): success, reads its real text (Decipher Writing)', and the creature NOT named under
        // Saw through it (no Effect). Its Perception at 20 then names it, with the Saw-through Effect.
        async b2IllusionsHaversackSociety(scene) {
            await h.clearSquares(scene, [[8, 12], [10, 12]]);
            const { actor: user } = await h.creature(scene, "Haversack Owner", { type: "character", x: 8, y: 12, level: 6 });
            const { actor: reader, token: readerToken } = await h.creature(scene, "Haversack Reader", { x: 10, y: 12, alliance: "opposition" });
            const haversack = await h.give(user, "Misdirecting Haversack");
            await haversack.update({ "system.equipped.carryType": "worn" }).catch(() => null);
            let since = Date.now();
            await api().activate(haversack.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the haversack's card" });
            await api().apply(card.id);
            const disbelief = await h.messageAfter(since, h.itemCard("disbelief"), { what: "the disbelief card" });
            const shown = stateOf(disbelief).plan.disbelief;
            h.assert(shown.dc === 20 && shown.also?.statistic === "society" && shown.also?.dc === 20 && !shown.also?.through, `Perception DC 20, Society DC 20 not seeing through (${JSON.stringify(shown)})`);
            const content = disbelief.content ?? "";
            h.assert(/Perception DC 20/.test(content) && /Society DC 20 reads its real text \(Decipher Writing\)/.test(content), `its line (${content})`);
            await h.target(readerToken);
            let via = "the card's select and Roll it";
            try {
                since = Date.now();
                await h.withDie(20, async () => {
                    const root = await cardRoot(disbelief);
                    if (root) {
                        root.querySelector("select[data-air-field='check']").value = "1";
                        root.querySelector("[data-air-action='apply']").click();
                    } else {
                        via = "the module's api (the card wasn't drawn in the chat log)";
                        await api().apply(disbelief.id, { targets: [readerToken.uuid], check: 1 });
                    }
                    await h.until(() => resultsOf(disbelief).length === 1, `the Society line (${resultsOf(disbelief).join("; ") || "none"})`, { timeout: 8000 });
                });
                const rolled = await rollOf(since, reader, "skill-check");
                h.assert(rolledWith(rolled, "society") && Number(rolled.flags.pf2e.context.dc?.value) === 20, `PF2e's Society check against DC 20 (${JSON.stringify({ dc: rolled.flags.pf2e.context.dc, options: (rolled.flags.pf2e.context.options ?? []).filter((option) => option.startsWith("check:")) })})`);
                let state = stateOf(disbelief);
                h.assert(/Haversack Reader \(Society\): (critical )?success, reads its real text \(Decipher Writing\)/.test(state.results[0] ?? ""), `the Society line (${state.results.join("; ")})`);
                h.assert(state.saw.length === 0 && state.fooled.length === 0, `not named under Saw through it, nor fooled (${JSON.stringify([state.saw, state.fooled])})`);
                await h.wait(800);
                h.assert(!sawThrough(reader, "Misdirecting Haversack"), `no Saw-through Effect after Society (${effectNames(reader)})`);
                // (Its Perception at 20: it sees through the disguise.)
                since = Date.now();
                await h.withDie(20, () => api().apply(disbelief.id, { targets: [readerToken.uuid], check: 0 }));
                const perceived = await rollOf(since, reader, "perception-check");
                h.assert(Number(perceived.flags.pf2e.context.dc?.value) === 20, `PF2e's Perception check against DC 20 (${JSON.stringify(perceived.flags.pf2e.context.dc)})`);
                state = stateOf(disbelief);
                h.assert(state.saw.some((name) => /Haversack Reader/.test(name)), `named under Saw through it after Perception (${state.saw.join(", ")})`);
                await h.until(() => sawThrough(reader, "Misdirecting Haversack"), `its Saw-through Effect (${effectNames(reader)})`, { timeout: 8000 });
                return { via, results: state.results, saw: state.saw };
            } finally {
                await h.target();
            }
        },

        // Arclord Eye's Open the Eye (illusions.js item.senses; src/live/card.js SENSE_WORDS magicsense): "For the next 10 minutes, you gain an
        // imprecise magic sense with a range of 30 feet." Activated on its invested PC and applied: an Effect with PF2e's Sense rule (magicsense,
        // imprecise, 30 feet) for 10 minutes, named for "Magic sense"; PF2e's senses list has magicsense, imprecise, 30 feet; the card's line
        // reads 'Imprecise magic sense 30 feet for 10 minutes'; the 'Magic sense (what it learns)' note Effect beside it (the GM's; named apart
        // from the sense's own Effect since 2026-10-27).
        async b2IllusionsArclordMagicSense(scene) {
            await h.clearSquares(scene, [[14, 12]]);
            const { actor: user } = await h.creature(scene, "Arclord Seer", { type: "character", x: 14, y: 12, level: 7 });
            const eye = await h.give(user, "Arclord Eye");
            await eye.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            const senses = () => [...(user.system?.perception?.senses ?? []), ...(user.perception?.senses ?? [])];
            const sensed = () => senses().find((sense) => String(sense?.type ?? sense) === "magicsense") ?? null;
            h.assert(!sensed(), "no magic sense before");
            const since = Date.now();
            await api().activate(eye.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the eye's card" });
            await api().apply(card.id);
            const effect = () => user.itemTypes.effect.find((entry) => entry.getFlag(h.NS, "sense") === "magicsense");
            await h.until(effect, `its sense Effect (${effectNames(user)})`, { timeout: 8000 });
            const rule = (effect().system.rules ?? []).find((entry) => entry.key === "Sense");
            h.assert(rule && rule.selector === "magicsense" && rule.acuity === "imprecise" && Number(rule.range) === 30, `PF2e's Sense rule (${JSON.stringify(effect().system.rules)})`);
            h.assert(/Magic sense$/.test(effect().name), `named for Magic sense (${effect().name})`);
            h.assert(effect().system.duration.value === 10 && effect().system.duration.unit === "minutes", `for 10 minutes (${JSON.stringify(effect().system.duration)})`);
            await h.until(() => sensed(), `magicsense among PF2e's senses (${senses().map((sense) => String(sense?.type ?? sense)).join(", ") || "none"})`, { timeout: 5000 });
            const sense = sensed();
            h.assert(sense.acuity === "imprecise" && Number(sense.range) === 30, `imprecise, 30 feet (${JSON.stringify({ acuity: sense.acuity, range: sense.range })})`);
            h.assert(resultsOf(card).some((line) => line.includes("Imprecise magic sense 30 feet for 10 minutes")), `the card's line (${resultsOf(card).join("; ")})`);
            const note = () => user.itemTypes.effect.find((entry) => entry.flags?.[ABILITY]?.note && /Magic sense \(what it learns\)$/.test(entry.name));
            await h.until(note, `the Magic sense (what it learns) note Effect (${effectNames(user)})`, { timeout: 5000 });
            h.assert(note().name !== effect().name, `named apart from the sense's Effect (${note().name} / ${effect().name})`);
            h.assert(/deceive escapes it/.test(note().system.description.value ?? ""), `its words (${note().system.description.value})`);
            return { effects: effectNames(user), sense: { type: "magicsense", acuity: sense.acuity, range: sense.range }, results: resultsOf(card) };
        }
    };
};
