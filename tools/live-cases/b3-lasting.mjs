// The third batch's lasting group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// (The adventure books' lasting, dying and affliction items — docs/mechanics.md "The adventure books' items (batch 3 …)". Their merge (201a371)
// changed no live code (src/compiler/lasting.js only), so a case here only where the play it feeds was never seen live: the toggle card's way
// that flips PF2e's toggle (src/live/toggle-card.js toggleRequest, value "flip" — no live case before), and the note Effect named "doesn't need
// to breathe" that the environment module reads to start no held breath (its scripts/foundry.js noBreath). The group's other asked-for checks
// feed mechanisms already checked live: the counteract card's free row with the GM's DC and rank (Philter of Empty Dreams, the Potions of
// Annulment — Reflecting Shard's, Devil's Trap's), an item card's bonus aimed by its note Effect's toggle (the philter — Addiction
// Suppressant's), the revival and fast healing on the item card (Clockwork Rejuvenator — Gift of the Poisoned Heart's, Infernal Health's), a
// save card whose note Effect lasts to the creature's next turn and a later card kept open for its Sustains (Ebon Marionette — Be the Band's),
// the ways card with a save way kept open (Barricade Stone (Cylinder)), the ability module's zones with their notes to the GM (Dirt Sea in a
// Jar), and a cast with its user's condition beside it (Ring Of Recalcitrant Wishes — Pharasmin Visor's).)

const ENVIRONMENT = "pf2e-automatic-environment-resolution";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const effectNames = (actor) => (actor?.itemTypes?.effect ?? []).map((effect) => effect.name).join(", ") || "none";
    // (A permanent item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };

    return {
        // Spider Lily Tattoo's Reveal Tattoo (src/compiler/lasting.js: the toggle card's one way { builtin "roll-option", option
        // "spider-lily-tattoo", value "flip" }; scripts/toggle.js applyToggleCard → src/live/toggle-card.js toggleRequest, its domain the item's
        // own rule's, "skill-check"): "You make the tattoo visible. You can use this activation again to make the tattoo not visible." Worn and
        // invested, the tattoo's own PF2e toggle (RollOption spider-lily-tattoo, domain skill-check) is off and Intimidation has no item bonus.
        // Activated, its toggle card's Set flips it on — the +1 item bonus to Intimidation PF2e's FlatModifier gives while it's on is there —;
        // activated again, Set flips it off, the bonus gone.
        async b3LastingSpiderLilyFlip(scene) {
            await h.clearSquares(scene, [[2, 2]]);
            const { actor: user } = await h.creature(scene, "Lily Tattooed", { type: "character", x: 2, y: 2 });
            const tattoo = await h.give(user, "Spider Lily Tattoo");
            await tattoo.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            const on = () => Boolean(user.rollOptions?.["skill-check"]?.["spider-lily-tattoo"]);
            const intimidation = () => Number(user.skills?.intimidation?.mod ?? user.skills?.intimidation?.check?.mod);
            const itemBonus = () => (user.skills?.intimidation?.check?.modifiers ?? user.skills?.intimidation?.modifiers ?? []).some((modifier) => modifier.type === "item" && Number(modifier.modifier) === 1 && modifier.enabled !== false);
            // (PF2e's own toggle among the actor's active rules: the tattoo invested.)
            await h.until(() => (user.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "spider-lily-tattoo"), `the tattoo's own RollOption active, invested (${JSON.stringify(user.items.get(tattoo.id)?.system?.equipped ?? {})})`, { timeout: 5000 });
            h.assert(!on() && !itemBonus(), `its toggle off at first, no item bonus to Intimidation (${on()}, ${itemBonus()})`);
            const before = intimidation();
            const card = await activated(tattoo, 0, "toggle", "Reveal Tattoo's toggle card");
            const way = stateOf(card).ways?.[0] ?? {};
            h.assert(stateOf(card).ways.length === 1 && way.option === "spider-lily-tattoo" && way.value === "flip", `one way, flipping spider-lily-tattoo (${JSON.stringify(stateOf(card).ways)})`);
            await live().apply(card.id, {});
            await h.until(() => on(), `PF2e's spider-lily-tattoo on in its skill-check domain (${JSON.stringify(user.rollOptions?.["skill-check"] ?? {})}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            await h.until(() => intimidation() === before + 1 && itemBonus(), `+1 item to Intimidation while it's visible (${before} → ${intimidation()})`, { timeout: 5000 });
            const shown = intimidation();
            const again = await activated(tattoo, 0, "toggle", "the second toggle card");
            await live().apply(again.id, {});
            await h.until(() => !on(), `flipped off by the second Set (${JSON.stringify(user.rollOptions?.["skill-check"] ?? {})}; ${JSON.stringify(resultsOf(again))})`, { timeout: 8000 });
            await h.until(() => intimidation() === before && !itemBonus(), `the +1 gone once it's hidden again (${intimidation()} vs ${before})`, { timeout: 5000 });
            return { before, shown, after: intimidation(), results: [...resultsOf(card), ...resultsOf(again)] };
        },

        // One Day's Breath (src/compiler/lasting.js: each way's note Effect labelled "doesn't need to breathe", the name PF2e Automatic Environment
        // Resolution looks for — its scripts/foundry.js noBreath, core src/environment/weather.js breathlessIn): "you don't need to breathe" for
        // 24 hours. A character drinks it, its ways card's "As it is": the item card's note Effect "…: doesn't need to breathe" for 24 hours on
        // it. Then the lab is set underwater through the environment module (clear water) and synced: the other character there, with no such
        // Effect, holds its breath — PF2e's Effect: Remaining Air, the environment module's — and the one who drank it doesn't (nor
        // Suffocating). (Choral Toga's Elysium's Breath gives the same label, its 8 hours; the weather is put back after.)
        async b3LastingBreathUnderwater(scene) {
            const env = game.modules.get(ENVIRONMENT);
            h.assert(env?.active && env.api?.setWeather && env.api?.sync && env.api?.weather, "PF2e Automatic Environment Resolution active (its api's weather, setWeather, sync)");
            await h.clearSquares(scene, [[2, 5], [4, 5]]);
            const { actor: drinker } = await h.creature(scene, "Breath Drinker", { type: "character", x: 2, y: 5 });
            const { actor: holder } = await h.creature(scene, "Breath Holder", { type: "character", x: 4, y: 5 });
            const potion = await h.give(drinker, "One Day's Breath");
            let since = Date.now();
            await potion.consume();
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "One Day's Breath's ways card" });
            const names = stateOf(ways).plan.ways.map((way) => way.name);
            const plain = names.indexOf("As it is");
            h.assert(plain >= 0, `its ways "As it is" and the mythic one (${names.join(", ")})`);
            since = Date.now();
            await live().apply(ways.id, { choice: plain });
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the way's item card" });
            await live().apply(card.id, {});
            const note = () => drinker.itemTypes.effect.find((effect) => /: doesn't need to breathe$/.test(effect.name));
            await h.until(note, `the note Effect "…: doesn't need to breathe" (${effectNames(drinker)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const duration = note().system.duration;
            h.assert(Number(duration.value) === 24 && duration.unit === "hours", `for 24 hours (${JSON.stringify(duration)})`);
            // (The environment module's own Effects: its PF2e Remaining Air, flagged air; its Suffocating once that's out.)
            const air = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[ENVIRONMENT]?.air);
            const suffocating = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[ENVIRONMENT]?.suffocating);
            const before = env.api.weather(scene) ?? {};
            try {
                await env.api.setWeather(scene, { ...before, underwater: { level: "clear" } });
                await env.api.sync(scene);
                await h.until(() => air(holder), `Remaining Air on the character without it, the scene underwater (${effectNames(holder)})`, { timeout: 10000 });
                // (Both synced the same way: a moment more for the drinker's turn.)
                await h.wait(1500);
                h.assert(!air(drinker) && !suffocating(drinker), `no held breath for the one who drank it (${effectNames(drinker)})`);
                return { note: note().name, holder: air(holder)?.name ?? null, drinker: effectNames(drinker) };
            } finally {
                await env.api.setWeather(scene, before).catch(() => null);
                await env.api.sync(scene).catch(() => null);
            }
        }
    };
};
