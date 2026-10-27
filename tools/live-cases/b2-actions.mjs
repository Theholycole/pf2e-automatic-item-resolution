// The second batch's actions group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code: an item used within its user's own Medicine action (src/compiler/item-actions.js readWithinActivity;
// scripts/item-actions.js applyActionCard's action.variant and action.dc, withinResults — Lady's Blessing Oil, Yarrow-Root Bandage, Curled Cure
// Gel, Artevil Suspension), a skill action's immunity given to the creature treated (scripts/immunity.js), a poison lowered only when given its way
// (scripts/foundry.js lowerAfflictionStage's only), a Lore picked for Recall Knowledge alone (src/live/card.js skillPickEffectSource and
// skillPickText — Possibility Tome) and the objects card's "hand" op picking one of its user's items not in hand (scripts/objects.js, never
// live-checked before — Instrument Harness). The group's other readings feed mechanisms already live-checked: Binding Coil's grab (the item-action
// card's Grapple rows, bearHug/actionChoice, with the ability module's Escape-ended Grabbed, scizoreGrab), Venomed Tongue's picked action and its
// damage card on a success (actionChoice, bearHug, the ability module's persistent damage), Magnetic Suit's ways card, its note Effect and its
// allies' card after it (tacticianWays, plan.again — phoenixFeathers —, allyArea), Bastion of the Inheritor's and Aether Appendage's note Effects
// with PF2e's rules on them.

const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const dying = (actor) => Number(actor.getCondition?.("dying")?.value) || 0;
    const valueOf = (actor, slug) => Number(actor.getCondition?.(slug)?.value) || 0;
    const medicine = (actor) => Number(actor.skills?.medicine?.mod ?? 0);
    const bleedOf = (actor) => actor.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "bleed") ?? null;
    // (PF2e's roll of its user's action: its skill check, the action among its roll options.)
    const checkOf = (actor, slug) => (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === actor.id && (message.flags.pf2e.context.options ?? []).includes(`action:${slug}`);
    // (No roll dialog, as scripts/item-actions.js rolls them: shift held when the user's checks show one.)
    const noDialog = () => new KeyboardEvent("keydown", { shiftKey: game.user.settings?.showCheckDialogs !== false });
    // (An activation's index by its name: src/compiler/permanent.js's own entries.)
    async function activationIndex(item, name) {
        const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
        const index = compileActivations({ ...item.toObject(false), uuid: item.uuid }).find((entry) => entry.activation?.name === name)?.index;
        h.assert(Number.isInteger(index), `${item.name}'s ${name} activation`);
        return index;
    }
    // A creature dying (a character: its recovery DC its own), its value set.
    async function dyingAt(actor, value) {
        await actor.increaseCondition("dying", { value });
        await h.until(() => dying(actor) === value, `${actor.name} dying ${value} (${dying(actor)})`, { timeout: 5000 });
    }
    // PF2e's persistent bleed on a creature (its usual DC 15).
    async function bleeding(actor, formula = "1d6") {
        const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        persistent.system.persistent = { formula, damageType: "bleed", dc: 15 };
        await actor.createEmbeddedDocuments("Item", [persistent]);
        await h.until(() => bleedOf(actor), `${actor.name}'s persistent bleed`, { timeout: 5000 });
    }
    // The item used (PF2e's own Use) and its action card.
    async function actionCard(actor, name) {
        const item = await h.give(actor, name);
        const since = Date.now();
        await item.consume();
        return h.messageAfter(since, h.itemCard("item-action"), { what: `${name}'s action card` });
    }

    // PF2e's Treat Wounds prompt (its skill-action DialogV2 — found without its rendered flag, which a hidden pane may never set).
    const treatPrompt = () => [...foundry.applications.instances.values()].find((app) => app.constructor.name === "DialogV2" && (app.options?.classes ?? []).includes("skill-action-prompt") && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    // A card's Apply that may stop at that prompt (PF2e's Treat Wounds asks for its DC): answered as it stands (OK: trained, DC 15) — or, with
    // answer false, closed — while the Apply runs. → { prompted, error } (the Apply's own error, when it threw).
    async function applyThroughPrompt(messageId, choices, { answer = true, timeout = 15000 } = {}) {
        const run = { done: false, error: null };
        live().apply(messageId, choices).then(() => (run.done = true), (error) => Object.assign(run, { done: true, error }));
        let prompted = false;
        for (const end = Date.now() + timeout; Date.now() < end && !run.done; ) {
            const app = treatPrompt();
            const ok = app?.element?.querySelector('button[data-action="ok"]');
            if (app && !prompted && (ok || !answer)) {
                prompted = true;
                if (answer) ok.click();
                else await app.close();
            }
            await h.wait(150);
        }
        if (!run.done) {
            await treatPrompt()?.close?.();
            throw new Error(`The card's Apply didn't finish within ${timeout / 1000} seconds${prompted ? " (after the Treat Wounds prompt)" : " (no Treat Wounds prompt came)"}.`);
        }
        return { prompted, error: run.error };
    }

    return {
        // Lady's Blessing Oil (2026-10-27, readWithinActivity; scripts/item-actions.js action.variant, action.dc.less, action.degree): "the DC of
        // the check to Administer First Aid is reduced to the creature's recovery roll DC, rather than 5 + the recovery roll DC. However, if you
        // roll a failure on the check, you get a critical failure instead." Used at a dying ally (a character, dying 2, its recovery DC 10):
        // PF2e's Administer First Aid rolls its stabilize variant at DC 12 (10 + 2), not 17. A failure on the die (8 total for an untrained
        // healer) is PF2e's failure and the card's critical failure ("a failure rolled, made a critical failure by …"), so the ability module's
        // First Aid row for it raises the ally's dying from 2 to 3.
        async b2ActionsLadysOilStabilize(scene) {
            await h.clearSquares(scene, [[12, 1], [13, 1]]);
            const { actor: healer } = await h.creature(scene, "Blessing Healer", { type: "character", x: 12, y: 1 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Blessing Dying Ally", { type: "character", x: 13, y: 1 });
            await dyingAt(ally, 2);
            const recovery = Number(ally.system.attributes.dying?.recoveryDC) || 10;
            const dc = recovery + 2;
            const mod = medicine(healer);
            // (A failure: 4 under the DC, above DC − 10.)
            const face = Math.min(19, Math.max(2, dc - 4 - mod));
            h.assert(face + mod < dc && face + mod > dc - 10, `a failing total possible (${face} + ${mod} against DC ${dc})`);
            const card = await actionCard(healer, "Lady's Blessing Oil");
            const action = card.getFlag(h.NS, "card").plan.action;
            h.assert(action.slug === "administer-first-aid" && action.variant === "stabilize" && action.dc?.less === 5 && action.degree?.failure === "criticalFailure", `First Aid's stabilize, 5 lower, a failure made critical (${JSON.stringify({ slug: action.slug, variant: action.variant, dc: action.dc, degree: action.degree })})`);
            const since = Date.now();
            await h.withDie(face, () => live().apply(card.id, { targets: [allyToken.uuid] }));
            const roll = await h.messageAfter(since, checkOf(healer, "administer-first-aid"), { what: "PF2e's Administer First Aid", timeout: 12000 });
            const context = roll.flags.pf2e.context;
            h.assert((context.options ?? []).includes("action:administer-first-aid:stabilize"), `its stabilize variant (${(context.options ?? []).filter((option) => option.startsWith("action:")).join(", ")})`);
            h.assert(Number(context.dc?.value) === dc, `at DC ${dc}, the recovery DC + dying (${JSON.stringify(context.dc ?? null)})`);
            h.assert(context.outcome === "failure", `PF2e's failure (${context.outcome}, ${roll.rolls?.[0]?.total})`);
            await h.until(() => dying(ally) === 3, `dying raised to 3 by the critical failure (${dying(ally)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const results = resultsOf(card);
            h.assert(results.some((line) => /: a critical failure \(a failure rolled, made a critical failure by /.test(line)), `the card's critical failure (${JSON.stringify(results)})`);
            return { dc: context.dc.value, total: roll.rolls?.[0]?.total, dying: dying(ally), results };
        },

        // Yarrow-Root Bandage (2026-10-27, readWithinActivity; scripts/item-actions.js action.dc.more, withinResults action.both): "you can
        // Administer First Aid to stop bleeding and dying as part of the same activity with only one Medicine check. However, the DC for the
        // Medicine check is equal to the 5 + the higher of the two DCs". At a dying ally (a character, dying 1) with 1d6 persistent bleed, one
        // First Aid roll at DC 21 (5 + the stabilize DC 16); its success (an expert healer's 12 on the die, 23) ends dying, and the bleed's
        // flat check, PF2e's own, rolls at DC 10 (assisted recovery): the same 12 ends it — at its usual DC 15 it wouldn't.
        async b2ActionsYarrowStopsBleed(scene) {
            await h.clearSquares(scene, [[12, 2], [13, 2]]);
            const { actor: healer } = await h.creature(scene, "Yarrow Healer", { type: "character", x: 12, y: 2, level: 7 });
            await healer.update({ "system.skills.medicine.rank": 2 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Yarrow Bleeding Ally", { type: "character", x: 13, y: 2 });
            await dyingAt(ally, 1);
            await bleeding(ally);
            const recovery = Number(ally.system.attributes.dying?.recoveryDC) || 10;
            const dc = 5 + (5 + recovery + 1);
            const mod = medicine(healer);
            h.assert(12 + mod >= dc && 12 + mod < dc + 10, `a 12 on the die a success, not a critical one (12 + ${mod} against DC ${dc})`);
            const card = await actionCard(healer, "Yarrow-Root Bandage");
            const action = card.getFlag(h.NS, "card").plan.action;
            h.assert(action.both && action.dc?.more === 5 && action.variant === "stabilize", `one check for both, 5 higher (${JSON.stringify({ both: action.both, dc: action.dc, variant: action.variant })})`);
            const since = Date.now();
            await h.withDie(12, () => live().apply(card.id, { targets: [allyToken.uuid] }));
            const roll = await h.messageAfter(since, checkOf(healer, "administer-first-aid"), { what: "PF2e's Administer First Aid", timeout: 12000 });
            const context = roll.flags.pf2e.context;
            h.assert(Number(context.dc?.value) === dc, `one check at DC ${dc} (${JSON.stringify(context.dc ?? null)})`);
            h.assert(context.outcome === "success", `a success (${context.outcome}, ${roll.rolls?.[0]?.total})`);
            const flat = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === ally.id, { what: "the bleed's flat check" });
            h.assert(Number(flat.flags.pf2e.context.dc?.value) === 10, `the bleed's flat check at DC 10 (${JSON.stringify(flat.flags.pf2e.context.dc ?? null)})`);
            await h.until(() => !bleedOf(ally), `the bleed ended by the flat check's 12 (${ally.itemTypes.condition.map((condition) => condition.name).join(", ")})`, { timeout: 8000 });
            await h.until(() => !ally.hasCondition("dying"), `dying ended (${dying(ally)})`, { timeout: 8000 });
            const results = resultsOf(card);
            h.assert(results.some((line) => /ended \(flat check, DC 10\)/.test(line)), `the card's bleed line (${JSON.stringify(results)})`);
            return { dc: context.dc.value, total: roll.rolls?.[0]?.total, flat: flat.rolls?.[0]?.total, results };
        },

        // Yarrow-Root Bandage's critical failure (withinResults action.both): PF2e's stop bleeding's "you take an amount of damage equal to your
        // persistent bleed damage" — the bleed's 1d6 rolled and applied at once. The same dying ally (dying 1, 1d6 bleed, 10 temporary Hit Points
        // to take it), an untrained healer's 5 on the die against DC 21: a critical failure — the ability module's First Aid row raises dying, the
        // card's line says the bleed's damage, and the temporary Hit Points drop by it; the bleed itself stays.
        async b2ActionsYarrowCritBleeds(scene) {
            await h.clearSquares(scene, [[12, 3], [13, 3]]);
            const { actor: healer } = await h.creature(scene, "Yarrow Fumbler", { type: "character", x: 12, y: 3 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Yarrow Fumbled Ally", { type: "character", x: 13, y: 3 });
            // (Maximum Hit Points first: a fixture character has none, and PF2e takes no damage at all from a creature whose maximum is 0 — not
            // even from its temporary Hit Points; found live 2026-10-27.)
            await ally.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 30 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
            await h.until(() => ally.system.attributes.hp.max >= 30, "30 maximum Hit Points", { timeout: 5000 });
            await ally.update({ "system.attributes.hp.value": 0 });
            await dyingAt(ally, 1);
            await bleeding(ally);
            await ally.update({ "system.attributes.hp.temp": 10 });
            const temp = () => Number(ally.system.attributes.hp.temp) || 0;
            await h.until(() => temp() === 10, `10 temporary Hit Points (${temp()})`, { timeout: 5000 });
            const recovery = Number(ally.system.attributes.dying?.recoveryDC) || 10;
            const dc = 5 + (5 + recovery + 1);
            const mod = medicine(healer);
            const face = Math.min(19, Math.max(2, 5 - Math.max(0, mod)));
            h.assert(face + mod <= dc - 10, `a critical failure (${face} + ${mod} against DC ${dc})`);
            const card = await actionCard(healer, "Yarrow-Root Bandage");
            const since = Date.now();
            await h.withDie(face, () => live().apply(card.id, { targets: [allyToken.uuid] }));
            const roll = await h.messageAfter(since, checkOf(healer, "administer-first-aid"), { what: "PF2e's Administer First Aid", timeout: 12000 });
            h.assert(roll.flags.pf2e.context.outcome === "criticalFailure", `a critical failure (${roll.flags.pf2e.context.outcome}, ${roll.rolls?.[0]?.total} against ${JSON.stringify(roll.flags.pf2e.context.dc ?? null)})`);
            const results = resultsOf(card);
            const line = results.map((entry) => /takes its 1d6 bleed at once: (\d+) damage/.exec(entry)).find(Boolean);
            h.assert(line, `the card's bleed damage line (${JSON.stringify(results)})`);
            const taken = Number(line[1]);
            h.assert(taken >= 1 && taken <= 6, `1d6 rolled (${taken})`);
            await h.until(() => temp() === 10 - taken, `the bleed's ${taken} damage taken (temporary Hit Points ${temp()} of 10)`, { timeout: 8000 });
            await h.until(() => dying(ally) >= 2, `dying raised by the critical failure (${dying(ally)})`, { timeout: 8000 });
            h.assert(bleedOf(ally), "the bleed still there");
            return { taken, temp: temp(), dying: dying(ally), results };
        },

        // Curled Cure Gel (2026-10-27, readWithinActivity; withinResults action.reduce; scripts/immunity.js, a targeted skill action's immunity on
        // the creature targeted): "If you successfully Treat Wounds, you can also reduce the value of one of the targets' Clumsy, Enfeebled, or
        // Stupefied conditions by 1. The target of your Treat Wounds is then temporarily immune to curled cure gel for 24 hours". A trained medic
        // treats an ally with Clumsy 2 and Enfeebled 1 — PF2e's Treat Wounds, its prompt answered as it stands (trained, DC 15), a 12 on the die
        // (17, a success): Clumsy drops to 1 (the highest), Enfeebled stays 1, and the ally — not the medic — gets the "Immune:" Effect for 24
        // hours. A second gel at the ally is refused while it lasts: no Treat Wounds, Clumsy still 1.
        async b2ActionsCureGelImmune(scene) {
            await h.clearSquares(scene, [[14, 1], [15, 1]]);
            const { actor: medic } = await h.creature(scene, "Gel Medic", { type: "character", x: 14, y: 1 });
            await medic.update({ "system.skills.medicine.rank": 1 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Gel Patient", { x: 15, y: 1 });
            await ally.increaseCondition("clumsy", { value: 2 });
            await ally.increaseCondition("enfeebled", { value: 1 });
            await h.until(() => valueOf(ally, "clumsy") === 2 && valueOf(ally, "enfeebled") === 1, `Clumsy 2 and Enfeebled 1 (${valueOf(ally, "clumsy")}, ${valueOf(ally, "enfeebled")})`, { timeout: 5000 });
            const mod = medicine(medic);
            h.assert(12 + mod >= 15 && 12 + mod < 25, `a 12 on the die a success against DC 15 (12 + ${mod})`);
            const immune = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.immunity === "curled-cure-gel" || effect.flags?.[ABILITY]?.immunity?.slug === "curled-cure-gel");
            const card = await actionCard(medic, "Curled Cure Gel");
            const action = card.getFlag(h.NS, "card").plan.action;
            h.assert(action.slug === "treat-wounds" && action.targeted && action.reduce?.by === 1 && action.immunity?.slug === "curled-cure-gel", `Treat Wounds at the creature, a condition lowered, its immunity (${JSON.stringify({ slug: action.slug, reduce: action.reduce, immunity: action.immunity?.slug })})`);
            let since = Date.now();
            let asked = false;
            try {
                const { prompted, error } = await h.withDie(12, () => applyThroughPrompt(card.id, { targets: [allyToken.uuid] }));
                if (error) throw error;
                asked = prompted;
            } finally {
                await treatPrompt()?.close?.();
            }
            const roll = await h.messageAfter(since, checkOf(medic, "treat-wounds"), { what: "PF2e's Treat Wounds", timeout: 12000 });
            h.assert(roll.flags.pf2e.context.outcome === "success", `a success (${roll.flags.pf2e.context.outcome}, ${roll.rolls?.[0]?.total} against ${JSON.stringify(roll.flags.pf2e.context.dc ?? null)})`);
            await h.until(() => valueOf(ally, "clumsy") === 1, `Clumsy lowered to 1 (${valueOf(ally, "clumsy")}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(valueOf(ally, "enfeebled") === 1, `Enfeebled still 1 (${valueOf(ally, "enfeebled")})`);
            h.assert(resultsOf(card).some((line) => /clumsy lowered by 1/.test(line)), `the card's line (${JSON.stringify(resultsOf(card))})`);
            await h.until(() => immune(ally).length === 1, `the ally's Immune: Effect (${names(ally)})`, { timeout: 8000 });
            const [effect] = immune(ally);
            h.assert(Number(effect.system.duration.value) === 24 && effect.system.duration.unit === "hours", `for 24 hours (${effect.system.duration.value} ${effect.system.duration.unit})`);
            h.assert(!immune(medic).length, `none on the medic (${names(medic)})`);
            // (The second gel at the same ally: refused before PF2e's Treat Wounds — a prompt opening means it wasn't.)
            const second = await actionCard(medic, "Curled Cure Gel");
            since = Date.now();
            const { prompted, error } = await applyThroughPrompt(second.id, { targets: [allyToken.uuid] }, { answer: false, timeout: 8000 });
            h.assert(!prompted, "no Treat Wounds for the second gel");
            h.assert(/still immune/.test(error?.message ?? ""), `the second gel refused (${error?.message ?? "applied"})`);
            await h.wait(500);
            h.assert(stateOf(second).status === "open" && valueOf(ally, "clumsy") === 1 && immune(ally).length === 1, `nothing applied (${stateOf(second).status}, Clumsy ${valueOf(ally, "clumsy")}, ${immune(ally).length} Immune: Effects)`);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && checkOf(medic, "treat-wounds")(message)), "no second Treat Wounds roll");
            return { effect: effect.name, prompted: asked, refused: error.message, results: resultsOf(card) };
        },

        // Artevil Suspension (2026-10-27, readWithinActivity; withinResults action.stage; scripts/foundry.js lowerAfflictionStage's only,
        // giveCondition): "If you succeed at your Medicine check to Treat Poison against an ingested poison, you can reduce the stage of the toxin
        // by one stage … If you do, the creature becomes Sickened 2 … doesn't work unless the poison was administered through ingestion". Two
        // creatures with Pseudo Afflictions' Cytillesh Oil at stage 3, one marked ingested, one injury. PF2e's Treat Poison at each, against the
        // poison's DC, a success on the die: the ingested one drops to stage 2 and is Sickened 2; the injury one stays at stage 3, not Sickened,
        // the card saying it has none to lower. (PF2e's Treat Poison has no DC of its own: the roll must be given the poison's, or there's no
        // degree — the first assert says so.)
        async b2ActionsArtevilIngested(scene) {
            await h.clearSquares(scene, [[14, 3], [15, 3], [15, 4]]);
            const pack = game.packs.get("pseudo-afflictions.effects");
            const entry = pack ? (await pack.getIndex()).find((row) => /Cytillesh Oil/.test(row.name)) : null;
            h.assert(entry, "Pseudo Afflictions' Cytillesh Oil (3 stages)");
            const venom = (await pack.getDocument(entry._id)).toObject();
            delete venom._id;
            const { actor: medic } = await h.creature(scene, "Artevil Medic", { type: "character", x: 14, y: 3 });
            await medic.update({ "system.skills.medicine.rank": 1 });
            const { actor: swallowed, token: swallowedToken } = await h.creature(scene, "Artevil Swallowed", { x: 15, y: 3 });
            const { actor: pricked, token: prickedToken } = await h.creature(scene, "Artevil Pricked", { x: 15, y: 4 });
            // (The poison at stage 3, its vector among its Effect's traits.)
            const afflict = async (actor, vector) => {
                const source = foundry.utils.deepClone(venom);
                source.system.traits = { ...(source.system.traits ?? {}), value: ["poison", vector] };
                const [affliction] = await actor.createEmbeddedDocuments("Item", [source]);
                await h.wait(800);
                await actor.items.get(affliction.id).update({ "system.badge.value": 3 });
                const stage = () => actor.items.get(affliction.id)?.system?.badge?.value ?? null;
                await h.until(() => stage() === 3, `${actor.name}'s poison at stage 3 (${stage()}, max ${actor.items.get(affliction.id)?.system?.badge?.max})`, { timeout: 5000 });
                const traits = actor.items.get(affliction.id).system.traits?.value ?? [];
                h.assert(traits.includes(vector) && traits.includes("poison"), `PF2e keeps poison and ${vector} on its Effect (${traits.join(", ")})`);
                return stage;
            };
            const ingested = await afflict(swallowed, "ingested");
            const injury = await afflict(pricked, "injury");
            // (A success against the poison's DC: 2 over it, under DC + 10.)
            const dc = Number(venom.flags?.["pseudo-afflictions"]?.save?.value) || 19;
            const mod = medicine(medic);
            const face = Math.min(19, Math.max(2, dc + 2 - mod));
            const treat = async (token) => {
                const card = await actionCard(medic, "Artevil Suspension");
                const action = card.getFlag(h.NS, "card").plan.action;
                h.assert(action.slug === "treat-poison" && action.stage?.vector === "ingested" && action.stage?.then?.slug === "sickened", `Treat Poison, an ingested poison's stage, then Sickened (${JSON.stringify({ slug: action.slug, stage: action.stage })})`);
                const since = Date.now();
                await h.withDie(face, () => live().apply(card.id, { targets: [token.uuid] }));
                const roll = await h.messageAfter(since, checkOf(medic, "treat-poison"), { what: "PF2e's Treat Poison", timeout: 12000 });
                const context = roll.flags.pf2e.context;
                h.assert(Number(context.dc?.value) > 0, `Treat Poison rolled against a DC, the poison's (${JSON.stringify(context.dc ?? null)}; with none PF2e gives no degree and the card says ${JSON.stringify(resultsOf(card))} — scripts/item-actions.js passes no difficultyClass for treat-poison)`);
                h.assert(["success", "criticalSuccess"].includes(context.outcome), `a success (${context.outcome}, ${roll.rolls?.[0]?.total} against DC ${context.dc.value})`);
                await h.until(() => stateOf(card).status === "applied", `the card applied (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return card;
            };
            const first = await treat(swallowedToken);
            await h.until(() => ingested() === 2 && valueOf(swallowed, "sickened") === 2, `the ingested poison at stage 2 and Sickened 2 (stage ${ingested()}, Sickened ${valueOf(swallowed, "sickened")}; ${JSON.stringify(resultsOf(first))})`, { timeout: 8000 });
            h.assert(resultsOf(first).some((line) => /down to stage 2/.test(line)), `the card's stage line (${JSON.stringify(resultsOf(first))})`);
            const second = await treat(prickedToken);
            await h.wait(1000);
            h.assert(injury() === 3 && valueOf(pricked, "sickened") === 0, `the injury poison untouched (stage ${injury()}, Sickened ${valueOf(pricked, "sickened")})`);
            h.assert(resultsOf(second).some((line) => /has no poison affliction to lower/.test(line)), `the card's line for it (${JSON.stringify(resultsOf(second))})`);
            return { ingested: [ingested(), valueOf(swallowed, "sickened")], injury: [injury(), valueOf(pricked, "sickened")], results: [resultsOf(first), resultsOf(second)] };
        },

        // Possibility Tome's Skim (2026-10-27, withSkimmed + listedSkillPick; src/live/card.js skillPickEffectSource's "lore", skillPickText's
        // "only"): Lore picked on the card — its user's Effect for 24 hours, "+3 item to Recall Knowledge with the Lore picked", PF2e's FlatModifier
        // and AdjustDegreeOfSuccess on lore-skill-check, both predicated action:recall-knowledge. (The tome itself deleted then, so PF2e's own
        // rule on it, +3 item to every Recall Knowledge, isn't in the way.) PF2e's Recall Knowledge with its user's Sailing Lore, a 2 on the die
        // against DC 40: the +3 on the roll and its critical failure made a failure. A plain Sailing Lore check, the same 2: no +3 and a critical
        // failure.
        async b2ActionsTomeLoreRecall(scene) {
            await h.clearSquares(scene, [[17, 1]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Tome Reader", { type: "character", x: 17, y: 1 });
            await user.createEmbeddedDocuments("Item", [{ name: "Sailing Lore", type: "lore", system: { proficient: { value: 1 } } }]);
            const slug = "sailing-lore";
            await h.until(() => user.skills?.[slug], `its Sailing Lore (${Object.keys(user.skills ?? {}).filter((key) => key.endsWith("lore")).join(", ")})`, { timeout: 5000 });
            const tome = await h.give(user, "Possibility Tome");
            const index = await activationIndex(tome, "Skim");
            await userToken.object?.control?.();
            const since = Date.now();
            await live().activate(tome.uuid, index);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the tome's card" });
            const pick = card.getFlag(h.NS, "card").plan.item?.skillPick;
            const at = (pick?.skills ?? []).indexOf("lore");
            h.assert(at >= 0 && (pick.predicate ?? []).includes("action:recall-knowledge"), `Lore among its skills, for Recall Knowledge (${JSON.stringify(pick ?? null)})`);
            await live().apply(card.id, { drinker: 0, skillPick: at });
            const effect = () => user.itemTypes.effect.find((entry) => entry.flags?.[h.NS]?.skillPick === "lore");
            await h.until(() => effect(), `the Lore Effect (${names(user)})`, { timeout: 8000 });
            const rules = effect().system.rules ?? [];
            const flat = rules.find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("lore-skill-check"));
            const degree = rules.find((rule) => rule.key === "AdjustDegreeOfSuccess" && [].concat(rule.selector).includes("lore-skill-check"));
            h.assert(flat && Number(flat.value) === 3 && flat.type === "item" && [].concat(flat.predicate ?? []).includes("action:recall-knowledge"), `+3 item to Lore checks for Recall Knowledge (${JSON.stringify(rules)})`);
            h.assert(degree && [].concat(degree.predicate ?? []).includes("action:recall-knowledge"), `its better degree for Recall Knowledge (${JSON.stringify(rules)})`);
            h.assert(Number(effect().system.duration.value) === 24 && effect().system.duration.unit === "hours", `for 24 hours (${JSON.stringify(effect().system.duration)})`);
            h.assert(/Recall Knowledge with the Lore picked/.test(effect().system.description.value ?? ""), `its words (${effect().system.description.value})`);
            const label = flat.label ?? effect().name;
            await tome.delete();
            const ours = (message) => (message.flags?.pf2e?.modifiers ?? []).find((modifier) => modifier.label === label && Number(modifier.modifier) === 3 && modifier.enabled !== false && !modifier.ignored) ?? null;
            let from = Date.now();
            const recall = game.pf2e.actions.get?.("recall-knowledge");
            h.assert(recall?.use, "PF2e's Recall Knowledge action");
            await h.withDie(2, () => recall.use({ actors: [user], statistic: slug, difficultyClass: { value: 40 }, event: noDialog() }));
            const rolled = await h.messageAfter(from, checkOf(user, "recall-knowledge"), { what: "PF2e's Recall Knowledge", timeout: 12000 });
            h.assert(ours(rolled), `the +3 on the Recall Knowledge roll (${JSON.stringify((rolled.flags.pf2e.modifiers ?? []).map((modifier) => `${modifier.label} ${modifier.modifier} ${modifier.enabled === false ? "off" : "on"}`))})`);
            const context = rolled.flags.pf2e.context;
            h.assert(context.outcome === "failure" && (context.unadjustedOutcome ?? "criticalFailure") === "criticalFailure", `its critical failure made a failure (${context.unadjustedOutcome} → ${context.outcome}, ${rolled.rolls?.[0]?.total} against DC 40)`);
            from = Date.now();
            await h.withDie(2, () => user.skills[slug].roll({ skipDialog: true, dc: { value: 40 } }));
            const plain = await h.messageAfter(from, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === user.id && !(message.flags.pf2e.context.options ?? []).includes("action:recall-knowledge"), { what: "the plain Sailing Lore check" });
            h.assert(!ours(plain), `no +3 on a plain Lore check (${JSON.stringify((plain.flags.pf2e.modifiers ?? []).map((modifier) => `${modifier.label} ${modifier.modifier}`))})`);
            h.assert(plain.flags.pf2e.context.outcome === "criticalFailure", `its critical failure kept (${plain.flags.pf2e.context.outcome})`);
            return { effect: effect().name, recall: [context.unadjustedOutcome ?? null, context.outcome, rolled.rolls?.[0]?.total], plain: [plain.flags.pf2e.context.outcome, plain.rolls?.[0]?.total] };
        },

        // Instrument Harness's Ready to Play (2026-10-27, src/compiler/objects.js HARNESS; scripts/objects.js objectChoices/applyObjectsCard op
        // "hand", with no weapon limit): "Your harness ripples, pulling the required instrument into your hands" — the objects card offers its
        // user's items not in hand (the worn instrument, not the held dagger nor the harness itself), says the draw doesn't trigger reactions, and
        // the instrument picked is held in both hands.
        async b2ActionsHarnessReady(scene) {
            await h.clearSquares(scene, [[17, 3]]);
            const { actor: user } = await h.creature(scene, "Harness Musician", { type: "character", x: 17, y: 3 });
            const harness = await h.give(user, "Instrument Harness");
            await harness.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            const instrument = await h.give(user, "Musical Instrument (Handheld)");
            await instrument.update({ "system.equipped.carryType": "worn", "system.equipped.handsHeld": 0 });
            const dagger = await h.give(user, "Dagger");
            await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const index = await activationIndex(harness, "Ready to Play");
            const since = Date.now();
            await live().activate(harness.uuid, index);
            const card = await h.messageAfter(since, h.itemCard("objects"), { what: "Ready to Play's card" });
            const state = card.getFlag(h.NS, "card");
            h.assert(state.plan.objects?.op === "hand" && !state.plan.objects.weapon, `the objects card's hand, any item (${JSON.stringify(state.plan.objects)})`);
            const choices = state.choices ?? [];
            const at = choices.findIndex((choice) => choice.id === instrument.id);
            h.assert(at >= 0, `the worn instrument offered (${choices.map((choice) => choice.name).join(", ")})`);
            h.assert(!choices.some((choice) => choice.id === dagger.id || choice.id === harness.id), `not the held dagger nor the harness (${choices.map((choice) => choice.name).join(", ")})`);
            // (The card's words escaped: "doesn&#39;t".)
            h.assert(/t trigger reactions/.test(game.messages.get(card.id).content ?? ""), "its line: no reactions to the draw");
            // (Its hands free for the instrument, as its requirement says.)
            await dagger.update({ "system.equipped.carryType": "worn", "system.equipped.handsHeld": 0 });
            await live().apply(card.id, { pick: at });
            const equipped = () => user.items.get(instrument.id)?.system?.equipped ?? {};
            await h.until(() => equipped().carryType === "held" && Number(equipped().handsHeld) === 2, `the instrument in both hands (${JSON.stringify(equipped())})`, { timeout: 8000 });
            return { choices: choices.map((choice) => choice.name), results: resultsOf(card) };
        }
    };
};
