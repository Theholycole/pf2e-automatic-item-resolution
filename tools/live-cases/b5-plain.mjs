// The fifth batch's plain group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (the b5/plain merge 3994cf5):
// - Memory Mugwort: one action of several skills and a DC by its target's level (src/live/action-card.js chosenAction's action.statistics and
//   levelDifficulty, scripts/item-actions.js action.dc.level) — b5PlainMugwortRecallKnowledge.
// - Instinct Crown (Bloodrager): the rage Effect's extra action's use (src/live/card.js untilRageOnly, on the card's line and the Effect's words)
//   — b5PlainBloodragerCrown.
// Construct Override, Ferromagnetizer Ammunition and Silken Tail add no live code: they feed the strike gate (critical, any weapon), plan.ifTarget,
// the ways card, the drop card and the ability module's save bonus, all live-checked already (see the result's skipped).
// The modules must be active in pftest: PF2e Team+ Alchemists and Barbarians.

// (tools/live-check.mjs's flag on its own fixtures: its cleanup removes only those — the hazard made here carries it.)
const FIXTURE = "liveCheckFixture";
const ALCHEMISTS = "pf2e-team-plus-alchemists.pf2e-items";
const BARBARIANS = "pf2e-team-plus-barbarians.items";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";

    // A hazard of that level as one of this check's fixtures ("PFTEST ITEM …", flagged, linked), its token at (x, y).
    async function hazard(scene, name, { x, y, level }) {
        const actor = await Actor.create({ name: `${h.PREFIX} ${name}`, type: "hazard", system: { details: { level: { value: level } } }, flags: { [h.NS]: { [FIXTURE]: true } } });
        const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), name: actor.name, actorId: actor.id, actorLink: true, x: x * 100, y: y * 100 }]);
        await h.wait(300);
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await h.wait(100);
        h.assert(actor.type === "hazard" && Number(actor.level) === level, `a level ${level} hazard (${actor.type}, ${actor.level})`);
        return { actor, token };
    }

    // One Memory Mugwort used at that token with that skill: its action card, PF2e's Recall Knowledge after Apply → { card, check, dc }.
    async function mugwortAt(mugwort, token, skill, earlier = null) {
        let since = Date.now();
        await mugwort.consume();
        const card = await h.messageAfter(since, (message) => h.itemCard("item-action")(message) && message.id !== earlier?.id, { what: "the mugwort's action card" });
        const statistics = stateOf(card).plan?.action?.statistics ?? [];
        const choice = statistics.indexOf(skill);
        h.assert(choice >= 0, `${skill} one of its skills (${JSON.stringify(statistics)})`);
        since = Date.now();
        await api().apply(card.id, { targets: [token.uuid], choice });
        const check = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && (message.flags.pf2e.context.options ?? []).includes(`action:recall-knowledge:${skill}`), { what: `PF2e's Recall Knowledge (${skill}) (the card: ${resultsOf(card).join(" / ")})`, timeout: 10000 });
        await h.until(() => stateOf(card)?.status === "applied", `the card done (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
        const dc = check.flags.pf2e.context.dc;
        return { card, check, dc: Number(dc?.value ?? dc) };
    }

    return {
        // Memory Mugwort (action.statistics ["occultism", "religion"], action.dc.level "hard", action.selfAfter): Recall Knowledge with Occultism or
        // Religion at a creature or hazard near it, the DC the hard DC of its level, and its user Stupefied 1 for a round, however it went. Religion
        // picked on its card, a level 5 creature targeted: PF2e's Recall Knowledge rolled with Religion (its action:recall-knowledge:religion
        // option) at DC 22 (level 5's 20, hard +2), the card's result line, and its user Stupefied 1. A second one, Occultism at a level −1
        // hazard: Occultism at DC 15 (level −1's 13, hard +2).
        async b5PlainMugwortRecallKnowledge(scene) {
            await h.clearSquares(scene, [[1, 0], [3, 0], [5, 0]]);
            const { actor: user } = await h.creature(scene, "Mugwort Sage", { type: "character", x: 1, y: 0, level: 4 });
            const { token: beastToken } = await h.creature(scene, "Mugwort Beast", { x: 3, y: 0, hp: 100, level: 5, alliance: "opposition" });
            const { token: trapToken } = await hazard(scene, "Mugwort Trap", { x: 5, y: 0, level: -1 });
            const mugwort = await h.give(user, "Memory Mugwort", ALCHEMISTS);
            await mugwort.update({ "system.quantity": 2 });
            // (Religion at the level 5 creature.)
            const beast = await mugwortAt(mugwort, beastToken, "religion");
            h.assert(beast.dc === 22, `DC 22, level 5's hard DC (${beast.dc}; ${JSON.stringify(beast.check.flags.pf2e.context.dc ?? null)})`);
            h.assert(resultsOf(beast.card).some((line) => line.includes("Recall Knowledge") && line.includes(beastToken.name)), `the card's result line at the creature (${JSON.stringify(resultsOf(beast.card))})`);
            await h.until(() => Number(user.getCondition?.("stupefied")?.value) === 1, `its user Stupefied 1 (${user.itemTypes.condition.map((condition) => `${condition.slug} ${condition.value ?? ""}`).join(", ") || "no conditions"})`, { timeout: 8000 });
            // (Occultism at the level −1 hazard.)
            const trap = await mugwortAt(mugwort, trapToken, "occultism", beast.card);
            h.assert(trap.dc === 15, `DC 15, level −1's hard DC (${trap.dc}; ${JSON.stringify(trap.check.flags.pf2e.context.dc ?? null)})`);
            return { beast: { dc: beast.dc, outcome: beast.check.flags.pf2e.context.outcome ?? null }, trap: { dc: trap.dc, outcome: trap.check.flags.pf2e.context.outcome ?? null }, results: [...resultsOf(beast.card), ...resultsOf(trap.card)] };
        },

        // Instinct Crown (Bloodrager)'s second activation (plan.item.untilRage { quickened, only "Harvest Blood" }; src/live/card.js untilRageOnly):
        // Quickened until the end of its user's rage, its extra action only for Harvest Blood. Raging (PF2e's Effect: Rage): the item card's line
        // ends "while raging (its extra action only to Harvest Blood)"; Apply makes its user Quickened, its rage Effect's words ending
        // "(its extra action only to Harvest Blood)"; the Rage ended, both are gone.
        async b5PlainBloodragerCrown(scene) {
            await h.clearSquares(scene, [[7, 0]]);
            const { actor: barbarian } = await h.creature(scene, "Bloodrager Crowned", { type: "character", x: 7, y: 0, level: 10 });
            const pack = game.packs.get("pf2e.feat-effects");
            const entry = (await pack.getIndex()).find((row) => row.name === "Effect: Rage");
            h.assert(entry, "PF2e's Effect: Rage");
            const rage = (await pack.getDocument(entry._id)).toObject();
            delete rage._id;
            const [raging] = await barbarian.createEmbeddedDocuments("Item", [rage]);
            const crown = await h.give(barbarian, "Instinct Crown (Bloodrager)", BARBARIANS);
            const since = Date.now();
            await api().activate(crown.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the crown's card" });
            const words = textOf(card);
            h.assert(/Quickened until the end of the rage, while raging \(its extra action only to Harvest Blood\)/.test(words), `the card's line (${words.slice(0, 400)})`);
            await api().apply(card.id);
            const effect = () => barbarian.itemTypes.effect.find((one) => one.getFlag(h.NS, "untilRage"));
            await h.until(() => barbarian.hasCondition("quickened") && effect(), `Quickened while raging (${effectNames(barbarian)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const description = String(effect().system?.description?.value ?? "");
            h.assert(/\(its extra action only to Harvest Blood\)/.test(description), `the rage Effect's words (${description})`);
            const name = effect().name;
            await raging.delete();
            await h.until(() => !barbarian.hasCondition("quickened") && !effect(), `gone with the Rage (${effectNames(barbarian)})`, { timeout: 8000 });
            return { line: words.slice(0, 200), effect: name, description };
        }
    };
};
