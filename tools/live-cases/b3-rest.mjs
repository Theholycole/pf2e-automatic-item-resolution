// The third batch's rest group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (src/compiler/adventure-readings.js's readings that reach new paths of scripts/casts.js and
// scripts/item-actions.js):
// - Assassin's Bracers' Focus on the Doomed: plan.castLinks (scripts/casts.js giveCastLinks, src/live/cast-card.js castLinkSource) — PF2e's two
//   linked Effects made with the cast, the user's TokenMark at the creature designated, the refusals for none or one too far.
// - Sacred Valkyrie Helm's Storm's Arms: plan.castDamage (src/live/card.js castDamageSource) — PF2e's DamageAlteration on the caster before
//   Weapon Storm is cast.
// - Dragonfire Halfbow's Dragon's Arrow: castTraits.user (its user's own token left out), and Songbird's Brush's reworded no-target line.
// - Spindle Key's Breach: action.mythic (scripts/item-actions.js) — Pick a Lock with Occultism at its user's level + 10 for a Mythic Point.
// Splendid Floodlight's gels feed the ability module's placed zone only: its modifiers for those inside (live-checked by areaBuffs, Inspiring
// Spotlight's +1 to Charisma-based checks) and a zone entry's note (the ability module's own zone saves of { plan: null, note }).

const SPELLS = "pf2e-automatic-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    // (A refused Apply's message, or null when it went on.)
    const refusal = (promise) => promise.then(() => null, (error) => String(error?.message ?? error));

    // PF2e's ChoiceSet prompt (its PickAThingPrompt) open now — found without its rendered flag (a hidden pane never draws it).
    const promptOpen = () => [...foundry.applications.instances.values()].find((app) => Array.isArray(app.choices) && typeof app.resolveSelection === "function" && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    // The windows a cast through the spell module may leave open (its caster choices, a confirmation, a prompt): closed, so the next case starts
    // clear.
    async function closeWindows(pattern) {
        for (const app of [...foundry.applications.instances.values()]) {
            const title = String(app.title ?? app.options?.window?.title ?? "");
            if (pattern.test(title) || /caster choices/i.test(title) || (Array.isArray(app.choices) && typeof app.resolveSelection === "function")) await app.close().catch(() => null);
        }
    }
    // The spell module's cast card pressed on (its Resolve, its caster-choices dialog applied, its "— Apply Effect" confirmed; PF2e's prompts
    // answered with their first choice) until test passes (as senses.mjs resolveSpellCard does).
    async function resolveSpellCard(cast, test, { timeout = 15000 } = {}) {
        const clicked = new Set();
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            if (test()) return;
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
            const confirm = [...foundry.applications.instances.values()].find((app) => app.constructor.name === "DialogV2" && /— Apply Effect$/.test(app.title ?? ""));
            const ok = confirm?.element?.querySelector('button[data-action="ok"]');
            if (ok && !clicked.has(confirm)) {
                clicked.add(confirm);
                ok.click();
            }
            const prompt = promptOpen();
            if (prompt) {
                prompt.selection = prompt.choices[0] ?? null;
                await prompt.close();
            }
            await h.wait(200);
        }
        h.assert(test(), `the spell card's result within ${timeout / 1000} seconds (Resolve ${clicked.has("resolve") ? "pressed" : "never there"})`);
    }
    // A statistic's DC with some roll options (PF2e's withRollOptions; an older clone otherwise), as tools/live-check.mjs's cramponsToggle reads it.
    const dcWith = (actor, slug, options = []) => {
        const statistic = actor.getStatistic(slug);
        const withOptions = statistic.withRollOptions?.({ extraRollOptions: options }) ?? statistic.clone?.({ rollOptions: options }) ?? statistic;
        return Number(withOptions.dc.value);
    };

    // Weapon Storm cast from the helm's ways card, the way picked → { card, cast } (the cast card applied, the spell module's cast message).
    async function stormsArms(helm, choice) {
        let since = Date.now();
        await api().activate(helm.uuid, 1);
        const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "Storm's Arms' ways card" });
        const names = (stateOf(ways).plan.ways ?? []).map((way) => way.name);
        h.assert(JSON.stringify(names) === JSON.stringify(["Its own damage", "All electricity damage"]), `its two ways (${JSON.stringify(names)})`);
        since = Date.now();
        await api().apply(ways.id, { choice });
        const card = await h.messageAfter(since, (message) => h.itemCard("cast")(message) && message.id !== ways.id, { what: `${names[choice]}'s cast card` });
        h.assert(stateOf(card).plan.spell?.name === "Weapon Storm" && stateOf(card).plan.rank === 9, `Weapon Storm at rank 9 (${stateOf(card).plan.spell?.name}, ${stateOf(card).plan.rank})`);
        since = Date.now();
        await api().apply(card.id, {});
        const cast = await castMessage(since);
        await h.until(() => resultsOf(card).some((line) => /casts Weapon Storm/.test(line)), `the cast's line (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
        return { card, cast, since };
    }
    // The spell module's save card for that cast (its Resolve pressed): its state's weapon damage formula — "4d8[slashing]"-like.
    async function stormFormula(cast, since) {
        const saveCard = () => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && message.flags?.[SPELLS]?.basicSaveState).at(-1) ?? null;
        await resolveSpellCard(cast, () => Boolean(saveCard()), { timeout: 15000 });
        const state = saveCard().flags[SPELLS].basicSaveState;
        h.assert(state.weaponDamage?.formula, `the spell module's save card has the held weapon's dice (${JSON.stringify({ weaponDamage: state.weaponDamage ?? null, damage: state.damage ?? null }).slice(0, 400)})`);
        return String(state.weaponDamage.formula);
    }

    return {
        // Assassin's Bracers (Type I)'s Focus on the Doomed (plan.castLinks): "You designate one creature within 30 feet. You cast 4th-rank
        // Invisibility on yourself, but the designated creature can still see you. … a +1 item bonus to attempts to Feint or Demoralize the
        // designated creature. The designated creature takes a –1 item penalty to saving throws against fear effects." The wearer (bracers
        // invested, so PF2e's assassinsBracersBonus flag is 1) presses Apply with no target, then at one 50 feet away: refused both times ("Target
        // the one creature it designates first.", "… is beyond 30 feet."), the card still open. At the one 15 feet away: Invisibility cast on the
        // wearer (its token the cast's target), then PF2e's Effect: Focus on the Doomed on the wearer, its TokenMark at that creature's token (PF2e's
        // tokenMarks), +1 to Demoralize only with the mark's option; Effect: Focus on the Doomed (Fear Penalty) on the creature with no ChoiceSet
        // prompt (its origin the bracers), its Will DC 1 lower against a fear effect only; and the wearer's 1-minute "Seen by the doomed" note.
        // The spell card resolved, the wearer is Invisible.
        async b3RestBracersFocusOnDoomed(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Doomed Focus Assassin", { type: "character", x: 2, y: 2, level: 10 });
            const { actor: doomed, token: doomedToken } = await h.creature(scene, "Doomed Focus Mark", { x: 5, y: 2, alliance: "opposition", hp: 200 });
            const { token: farToken } = await h.creature(scene, "Doomed Focus Far Mark", { x: 12, y: 2, alliance: "opposition", hp: 200 });
            const bracers = await h.give(user, "Assassin's Bracers (Type I)");
            await bracers.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            await h.until(() => Number(user.flags?.system?.assassinsBracersBonus) === 1, `PF2e's assassinsBracersBonus 1 on the wearer (${JSON.stringify(user.flags?.system ?? {})})`, { timeout: 5000 });
            await userToken.object?.control?.();
            try {
                let since = Date.now();
                await api().activate(bracers.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the bracers' cast card" });
                const plan = stateOf(card).plan;
                h.assert(plan.spell?.name === "Invisibility" && plan.rank === 4 && plan.self && (plan.castLinks ?? []).length === 2, `Invisibility at rank 4 on its user, two links (${JSON.stringify({ spell: plan.spell?.name, rank: plan.rank, links: plan.castLinks })})`);
                const none = await refusal(api().apply(card.id, { targets: [] }));
                h.assert(/Target the one creature it designates first/.test(none ?? ""), `refused with no target (${none})`);
                const far = await refusal(api().apply(card.id, { targets: [farToken.uuid] }));
                h.assert(/is beyond 30 feet/.test(far ?? ""), `refused at 50 feet (${far})`);
                h.assert(stateOf(card).status === "open" && !user.itemTypes.effect.some((effect) => /Focus on the Doomed/.test(effect.name)), `nothing made by the refusals (${stateOf(card).status}; ${effectNames(user)})`);
                // (Its Demoralize DC with the mark's option and without, before: no bonus either way.)
                const demoralize = ["action:demoralize"];
                const marked = [...demoralize, "target:mark:focus-on-the-doomed"];
                const before = { plain: dcWith(user, "intimidation", demoralize), marked: dcWith(user, "intimidation", marked), fear: dcWith(doomed, "will", ["item:trait:fear"]), will: dcWith(doomed, "will") };
                since = Date.now();
                // (Not awaited at once: a ChoiceSet prompt PF2e opened for the fear penalty would hold the Effect's creation, and the Apply, open.)
                const own = () => user.itemTypes.effect.find((effect) => effect.name === "Effect: Focus on the Doomed");
                const fear = () => doomed.itemTypes.effect.find((effect) => effect.name === "Effect: Focus on the Doomed (Fear Penalty)");
                const run = { done: false, error: null };
                api().apply(card.id, { targets: [doomedToken.uuid] }).then(() => (run.done = true), (error) => Object.assign(run, { done: true, error }));
                let prompted = null;
                for (const end = Date.now() + 20000; Date.now() < end && !(run.done && own() && fear()) && !prompted; ) {
                    prompted = promptOpen() ?? null;
                    await h.wait(200);
                }
                if (prompted) {
                    prompted.selection = null;
                    await prompted.close().catch(() => null);
                }
                h.assert(!prompted, `no ChoiceSet prompt for the fear penalty (its origin the bracers): ${prompted?.title ?? ""}`);
                h.assert(run.done && !run.error, `the Apply done (${run.error?.message ?? (run.done ? "ok" : "still running")})`);
                await h.until(() => own() && fear(), `both Effects (${effectNames(user)} | ${effectNames(doomed)})`, { timeout: 5000 });
                const cast = await castMessage(since);
                const flag = cast.flags[SPELLS].castFromItem;
                h.assert(flag.rank === 4 && (flag.targets ?? []).includes(userToken.uuid), `Invisibility at rank 4 on the wearer's token (${JSON.stringify(flag)})`);
                const mark = (own().system.rules ?? []).find((rule) => rule.key === "TokenMark");
                h.assert(mark?.uuid === doomedToken.uuid && own().system.context?.origin?.item === bracers.uuid, `the TokenMark at the creature, the bracers its origin (${JSON.stringify({ mark, origin: own().system.context?.origin })})`);
                await h.until(() => (user.synthetics?.tokenMarks?.get?.(doomedToken.uuid) ?? []).includes("focus-on-the-doomed"), `PF2e's mark of that token on the wearer (${JSON.stringify([...(user.synthetics?.tokenMarks?.entries?.() ?? [])])})`, { timeout: 5000 });
                const after = { plain: dcWith(user, "intimidation", demoralize), marked: dcWith(user, "intimidation", marked), fear: dcWith(doomed, "will", ["item:trait:fear"]), will: dcWith(doomed, "will") };
                h.assert(after.marked === before.marked + 1 && after.plain === before.plain, `+1 to Demoralize only against the marked creature (${JSON.stringify({ before, after })})`);
                h.assert(after.fear === before.fear - 1 && after.will === before.will, `-1 to its Will against fear only (${JSON.stringify({ before, after })})`);
                h.assert(!(fear().system.rules ?? []).some((rule) => rule.key === "ChoiceSet" && rule.selection !== undefined && rule.selection !== null), `its penalty not picked from the ChoiceSet (${JSON.stringify((fear().system.rules ?? []).filter((rule) => rule.key === "ChoiceSet"))})`);
                const note = user.itemTypes.effect.find((effect) => /Seen by the doomed/.test(effect.name));
                h.assert(note && note.system.duration.value === 1 && note.system.duration.unit === "minutes", `the 1-minute "Seen by the doomed" note (${effectNames(user)}; ${JSON.stringify(note?.system?.duration ?? null)})`);
                await h.until(() => resultsOf(card).some((line) => line === `${user.name} gains Effect: Focus on the Doomed.`) && resultsOf(card).some((line) => line === `${doomed.name} gains Effect: Focus on the Doomed (Fear Penalty).`), `the card's lines (${JSON.stringify(resultsOf(card))})`, { timeout: 5000 });
                const invisible = () => user.hasCondition("invisible") || user.itemTypes.effect.some((effect) => /Invisibility/.test(effect.name));
                await resolveSpellCard(cast, invisible);
                return { before, after, mark: mark.uuid, refused: [none, far], results: resultsOf(card) };
            } finally {
                await closeWindows(/Invisibility/);
            }
        },

        // Sacred Valkyrie Helm's Storm's Arms (plan.castDamage, src/live/card.js castDamageSource): "You cast weapon storm (9th rank); the
        // duplicated weapons can look like lightning, in which case all of the spell's damage is electricity damage." The ways card's "Its own
        // damage" casts Weapon Storm at rank 9 and puts nothing on the caster; the spell module's save card for it rolls the held longsword's
        // own slashing. "All electricity damage" first gives the caster PF2e's DamageAlteration (damage-type override to electricity, on
        // spell-damage, predicated on item:slug:weapon-storm) until the end of its next turn, then casts it: the spell module's save card's
        // weapon damage should then be electricity.
        async b3RestValkyrieElectricStorm(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Valkyrie Helm Wearer", { type: "character", x: 3, y: 5, level: 19 });
            const { token: foeToken } = await h.creature(scene, "Valkyrie Storm Foe", { x: 4, y: 5, alliance: "opposition", hp: 400 });
            const sword = await h.give(user, "Longsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const helm = await h.give(user, "Sacred Valkyrie Helm");
            await helm.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            await userToken.object?.control?.();
            await h.target(foeToken);
            const altered = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.castDamage);
            try {
                // (Its own damage: nothing on the caster, the longsword's slashing.)
                const plain = await stormsArms(helm, 0);
                h.assert(!altered(), `no damage Effect for its own damage (${effectNames(user)})`);
                const own = await stormFormula(plain.cast, plain.since);
                h.assert(/\[slashing\]$/.test(own), `its own damage the longsword's slashing (${own})`);
                // (All electricity: PF2e's DamageAlteration first.)
                const electric = await stormsArms(helm, 1);
                await h.until(() => altered(), `the DamageAlteration Effect on the caster (${effectNames(user)})`, { timeout: 5000 });
                const rule = (altered().system.rules ?? []).find((entry) => entry.key === "DamageAlteration");
                h.assert(rule && rule.mode === "override" && rule.property === "damage-type" && rule.value === "electricity" && [].concat(rule.selectors).includes("spell-damage") && [].concat(rule.predicate ?? []).includes("item:slug:weapon-storm"), `electricity for Weapon Storm's spell damage (${JSON.stringify(rule)})`);
                h.assert(altered().system.duration.value === 1 && altered().system.duration.unit === "rounds" && altered().system.duration.expiry === "turn-end", `to the end of its next turn (${JSON.stringify(altered().system.duration)})`);
                h.assert(resultsOf(electric.card).includes("All of its Weapon Storm's damage is electricity damage."), `the card's line (${JSON.stringify(resultsOf(electric.card))})`);
                const typed = await stormFormula(electric.cast, electric.since);
                // (Its held-weapon dice a DamageRoll of the weapon's own type, which the DamageAlteration doesn't reach: electricity once the spell
                // module takes castFromItem's damageType — docs/spell-module-requests.md row 12 —, else the card's line to change it by hand.)
                const takesType = (game.modules.get("pf2e-automatic-resolution")?.api?.castFromItemOptions ?? []).includes("damageType");
                if (takesType) h.assert(/\[electricity\]$/.test(typed), `the spell module's Weapon Storm damage electricity (${typed})`);
                else h.assert(resultsOf(electric.card).some((line) => /^All its damage is electricity: change its type by hand/.test(line)), `the line to change its type by hand (${JSON.stringify(resultsOf(electric.card))})`);
                return { own, typed, rule, takesType };
            } finally {
                await closeWindows(/Weapon Storm/);
            }
        },

        // Dragonfire Halfbow's Dragon's Arrow (castTraits.user): "you cast a 5th-rank fireball … You and your mount are immune to the effects of
        // this fireball." The archer targets its own token and a foe: the card's line "<archer> is immune (its user): left out of the cast." and
        // the spell module's Fireball cast at the foe alone (its cast's targets). Songbird's Brush's Prismatic Spray "does not affect good-aligned
        // creatures" (castTraits.immune ["holy"]), cast with nothing targeted: the reworded line "Target the creatures in its area to leave out the
        // holys." (no penalty clause); cast again at a holy creature and another: "<holy> is immune (holy): left out of the cast.", the other alone
        // its target.
        async b3RestCastLeavesOutUser(scene) {
            assertSpells();
            const { actor: archer, token: archerToken } = await h.creature(scene, "Dragonfire Archer", { type: "character", x: 2, y: 9, level: 12 });
            const { token: foeToken } = await h.creature(scene, "Dragonfire Foe", { x: 5, y: 9, alliance: "opposition", hp: 400 });
            const { actor: painter, token: painterToken } = await h.creature(scene, "Songbird Painter", { type: "character", x: 2, y: 13, level: 14 });
            const { actor: holy, token: holyToken } = await h.creature(scene, "Songbird Holy Foe", { x: 4, y: 13, alliance: "opposition", hp: 400 });
            const { token: plainToken } = await h.creature(scene, "Songbird Plain Foe", { x: 4, y: 14, alliance: "opposition", hp: 400 });
            await holy.update({ "system.traits.value": [...new Set([...(holy.system.traits?.value ?? []), "celestial", "holy"])] });
            h.assert([...(holy.traits ?? [])].includes("holy"), `the holy trait on the foe (${[...(holy.traits ?? [])]})`);
            try {
                const bow = await h.give(archer, "Dragonfire Halfbow");
                await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
                await archerToken.object?.control?.();
                let since = Date.now();
                await api().activate(bow.uuid, 0);
                const arrow = await h.messageAfter(since, h.itemCard("cast"), { what: "Dragon's Arrow's cast card" });
                h.assert(stateOf(arrow).plan.castTraits?.user === true && stateOf(arrow).plan.spell?.name === "Fireball", `Fireball with its user immune (${JSON.stringify(stateOf(arrow).plan.castTraits)})`);
                since = Date.now();
                await api().apply(arrow.id, { targets: [archerToken.uuid, foeToken.uuid] });
                const fireball = await castMessage(since);
                const left = `${archerToken.name} is immune (its user): left out of the cast.`;
                await h.until(() => resultsOf(arrow).includes(left), `the line "${left}" (${JSON.stringify(resultsOf(arrow))})`, { timeout: 8000 });
                const targets = fireball.flags[SPELLS].castFromItem.targets ?? [];
                h.assert(targets.includes(foeToken.uuid) && !targets.includes(archerToken.uuid), `Fireball at the foe alone (${JSON.stringify(targets)})`);
                // (Songbird's Brush: nothing targeted, then a holy creature and another.)
                const brush = await h.give(painter, "Songbird's Brush");
                await brush.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
                await painterToken.object?.control?.();
                since = Date.now();
                await api().activate(brush.uuid, 0);
                const spray = await h.messageAfter(since, h.itemCard("cast"), { what: "the brush's cast card" });
                h.assert(JSON.stringify(stateOf(spray).plan.castTraits?.immune) === '["holy"]' && !stateOf(spray).plan.castTraits?.penalties?.length, `holy creatures left out, no penalty (${JSON.stringify(stateOf(spray).plan.castTraits)})`);
                since = Date.now();
                await api().apply(spray.id, { targets: [] });
                await castMessage(since);
                const hint = "Target the creatures in its area to leave out the holys.";
                await h.until(() => resultsOf(spray).includes(hint), `the line "${hint}" (${JSON.stringify(resultsOf(spray))})`, { timeout: 8000 });
                since = Date.now();
                await api().activate(brush.uuid, 0);
                const again = await h.messageAfter(since, (message) => h.itemCard("cast")(message) && message.id !== spray.id, { what: "the brush's second cast card" });
                since = Date.now();
                await api().apply(again.id, { targets: [holyToken.uuid, plainToken.uuid] });
                const second = await castMessage(since);
                const immune = `${holyToken.name} is immune (holy): left out of the cast.`;
                await h.until(() => resultsOf(again).includes(immune), `the line "${immune}" (${JSON.stringify(resultsOf(again))})`, { timeout: 8000 });
                const sprayed = second.flags[SPELLS].castFromItem.targets ?? [];
                h.assert(sprayed.includes(plainToken.uuid) && !sprayed.includes(holyToken.uuid), `Prismatic Spray at the other alone (${JSON.stringify(sprayed)})`);
                return { halfbow: resultsOf(arrow), brush: [resultsOf(spray), resultsOf(again)], targets: { fireball: targets, spray: sprayed } };
            } finally {
                await closeWindows(/Fireball|Prismatic Spray/);
            }
        },

        // Spindle Key's Breach (action.mythic, scripts/item-actions.js): "you can spend a Mythic Point to attempt an Occultism check to Pick a Lock
        // at mythic proficiency" — the ways card's "With Occultism" rolls PF2e's Pick a Lock with Occultism (no mythic-proficiency modifier,
        // nothing spent); "At mythic proficiency (1 Mythic Point)" rolls it with "Spindle Key: Breach (mythic proficiency)", the user's level + 10
        // less Occultism's own proficiency bonus (a trained level-17 character: 27 − 19 = 8), and its point spent once. (A fixture character has
        // no Mythic Points outside a mythic campaign: the world setting "Hero Points instead of Mythic Points" is on for the case, put back
        // after — the same spend, scripts/spend.js costResource.)
        async b3RestSpindleMythicBreach(scene) {
            const { actor: user } = await h.creature(scene, "Spindle Key Breacher", { type: "character", x: 2, y: 17, level: 17 });
            await user.update({ "system.skills.occultism.rank": 1, "system.resources.heroPoints.value": 1 });
            const occultism = () => user.getStatistic("occultism");
            await h.until(() => Number(occultism()?.rank) === 1, "trained in Occultism", { timeout: 5000 });
            const proficiency = Number((occultism().modifiers ?? []).find((entry) => entry.slug === "proficiency" && entry.enabled !== false)?.modifier);
            h.assert(proficiency === 19, `Occultism's proficiency bonus 19 at level 17 trained (${proficiency})`);
            const key = await h.give(user, "Spindle Key");
            const checkOf = (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === user.id && (message.flags.pf2e.context.options ?? []).includes("action:pick-a-lock");
            const occult = (context) => (context?.domains ?? []).includes("occultism") || context?.statistic === "occultism";
            const mythicOf = (roll) => (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.slug === "mythic-proficiency") ?? null;
            const breach = async (choice) => {
                let since = Date.now();
                await api().activate(key.uuid, 1);
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "Breach's ways card" });
                since = Date.now();
                await api().apply(ways.id, { choice });
                const card = await h.messageAfter(since, h.itemCard("item-action"), { what: "the Pick a Lock card" });
                since = Date.now();
                const refused = await refusal(api().apply(card.id, {}));
                const roll = refused ? null : await h.messageAfter(since, checkOf, { what: "PF2e's Pick a Lock", timeout: 12000 });
                return { card, roll, refused };
            };
            const SETTING = "heroPointsForMythic";
            const was = game.settings.get(h.NS, SETTING);
            await game.settings.set(h.NS, SETTING, true);
            try {
                const plain = await breach(0);
                h.assert(!plain.refused && occult(plain.roll.flags.pf2e.context), `Pick a Lock with Occultism (${plain.refused}; ${JSON.stringify(plain.roll?.flags?.pf2e?.context?.domains ?? null)})`);
                h.assert(!mythicOf(plain.roll) && Number(user.system.resources.heroPoints.value) === 1, `no mythic proficiency, nothing spent (${JSON.stringify(mythicOf(plain.roll))}; ${user.system.resources.heroPoints.value})`);
                const mythic = await breach(1);
                h.assert(!mythic.refused && occult(mythic.roll.flags.pf2e.context), `the mythic way's roll (${mythic.refused})`);
                const modifier = mythicOf(mythic.roll);
                h.assert(modifier && Number(modifier.modifier) === 17 + 10 - proficiency && modifier.enabled !== false && /Spindle Key.*\(mythic proficiency\)/.test(modifier.label ?? ""), `level + 10 − proficiency: +${17 + 10 - proficiency} (${JSON.stringify(modifier)})`);
                await h.until(() => Number(user.system.resources.heroPoints.value) === 0, `its point spent (${user.system.resources.heroPoints.value} left)`, { timeout: 5000 });
                return { proficiency, modifier: modifier.modifier, results: [resultsOf(plain.card), resultsOf(mythic.card)] };
            } finally {
                await game.settings.set(h.NS, SETTING, was);
            }
        },
    };
};
