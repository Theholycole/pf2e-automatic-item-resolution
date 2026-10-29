// The fifth batch's afflictions group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// (docs/mechanics.md "The afflictions group's readings". Only the items whose live play is new code have a case:
// - Iron Heart: its user pays for the healing its card gave in Hit Points, temporary ones set aside, the ally healed again if that leaves it
//   at 0 (scripts/heal-cost.js on the ability module's applied hook, src/live/heal-cost.js).
// - Instinct Crown (Disaster): a rule Effect given only while raging and gone with the Rage, its turn aura's damage and radius filled from its
//   user's Disaster instinct (scripts/live.js ruleEffects untilRage and fromInstinct, src/live/disaster.js, scripts/turn-auras.js).
// - Scepter of Sickening's Rotting Aura: a spell slot's way, the zone on its user with an automatic card at a turn's end (Sickened by stack, at
//   most 4) and a words-only note Effect inside (zone.inside text) — src/compiler/rotting-aura.js through the ways and zone routes.
// - Scepter of Purifying's Purifying Wave: plan.heldCounteract after a heal card (scripts/hit-counteract.js, built for an attack's hit), at the
//   slot's rank and the scepter's level's modifier.
// - Quantum Duplicator: the GM's secret flat check with its own success words (whisper.flat.success, scripts/live.js postWhisper).
// - Pham Lê Ngọc's Ceremonial Sword: dice only when the roll itself was a critical hit (scripts/strikes.js rolledCriticalRules).
// - Runebranded Hide: PF2e's AdjustModifier suppressing the hide's own save bonus by its slug, beside its melee Strikes' electricity dice.)

const ABILITY = "pf2e-automatic-ability-resolution";
const BARBARIANS = "pf2e-team-plus-barbarians.items";
const MAGIC = "pf2e-team-plus-magic.items";
const INVENTORS = "pf2e-team-plus-inventors.inventors-equipment";
const TIAN_XIA = "pf2e-team-plus-tian-xia.player-options";
const BATTLEZOO = "battlezoo-bestiary-pf2e.pf2e-battlezoo-equipment";
// (tools/live-check.mjs's flag on its own fixtures: its cleanup removes only those — the encounters made here carry it.)
const FIXTURE = "liveCheckFixture";
// (PF2e's Effect: Rage, slug effect-rage.)
const RAGE = "Compendium.pf2e.feat-effects.Item.z3uyCMBddrPK5umr";
// (The sword's roll option for dice only when the attack roll itself was a critical hit: src/compiler/rolled-critical.js ROLLED_CRITICAL.)
const ROLLED_CRITICAL = "air-rolled-critical";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionSlugs = (actor) => actor.itemTypes.condition.map((condition) => condition.slug).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const temp = (actor) => Number(actor.system.attributes.hp.temp) || 0;
    const held = (hands) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const strikeOf = (actor, weapon) => (actor.system.actions ?? []).find((action) => action.item?.id === weapon.id);
    const raging = (actor) => actor.itemTypes.effect.find((effect) => effect.slug === "effect-rage" || effect.name === "Effect: Rage");
    const valueOf = (actor, slug) => Number(actor.getCondition?.(slug)?.value) || 0;
    // (The ability module's cards: their state, and the one made since then whose creatures include that actor.)
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const targetsOf = (message) => (abilityState(message)?.targets ?? []).map((target) => target.actorUuid);
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const cardAt = (since, actor, what) => h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsOf(message).includes(actor.uuid), { what, timeout: 10000 });

    // An activation's card: the item activated, the first card of that kind after it.
    async function activated(item, index, kind, what) {
        const since = Date.now();
        await api().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    }
    // A ways card's way used → its own card (of that kind, not the ways card).
    async function wayCard(ways, choice, kind, what) {
        const since = Date.now();
        await api().apply(ways.id, { choice });
        return h.messageAfter(since, (message) => h.itemCard(kind)(message) && message.id !== ways.id, { what });
    }
    // PF2e's own Effect: Rage on a creature (as its Rage action gives it).
    async function rageOn(actor) {
        const source = (await fromUuid(RAGE))?.toObject();
        h.assert(source, "PF2e's Effect: Rage");
        delete source._id;
        const [rage] = await actor.createEmbeddedDocuments("Item", [source]);
        await h.until(() => raging(actor), `${actor.name} raging`, { timeout: 5000 });
        return rage;
    }
    // A bare character's maximum Hit Points (it has none of its own, and PF2e then heals or damages nothing), and its Hit Points now.
    async function hitPoints(actor, max = 30, value = max) {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: max }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await h.until(() => actor.system.attributes.hp.max >= max, `${max} maximum Hit Points`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": value });
    }
    // A spellcasting entry with one slot of that rank (a spontaneous caster's), for a cost of a spell slot.
    async function slotOf(actor, rank) {
        const [entry] = await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Slot Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "spontaneous" }, ability: { value: "cha" }, slots: { [`slot${rank}`]: { max: 1, value: 1 } } } }]);
        const left = () => Number(actor.items.get(entry.id)?.system?.slots?.[`slot${rank}`]?.value);
        await h.until(() => left() === 1, `a rank ${rank} slot`, { timeout: 5000 });
        return left;
    }
    // A compendium item given with its ChoiceSet answered by the choice of that label (h.give answers with the first).
    async function giveChosen(actor, name, packId, label) {
        const pack = game.packs.get(packId);
        h.assert(pack, `No pack ${packId}.`);
        const entry = (await pack.getIndex()).find((row) => row.name === name);
        h.assert(entry, `${name} isn't in ${packId}.`);
        const source = (await pack.getDocument(entry._id)).toObject();
        delete source._id;
        for (const rule of source.system?.rules ?? []) {
            if (rule.key !== "ChoiceSet" || !Array.isArray(rule.choices) || !rule.choices.length) continue;
            rule.selection = (rule.choices.find((choice) => choice.label === label) ?? rule.choices[0]).value;
        }
        const [item] = await actor.createEmbeddedDocuments("Item", [source]);
        return item;
    }
    // An encounter of these tokens in this initiative order (the first one's turn now), flagged as a fixture.
    async function encounter(scene, tokens) {
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        await combat.createEmbeddedDocuments("Combatant", tokens.map((token, index) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, initiative: 40 - index * 10 })));
        await combat.startCombat();
        await h.wait(500);
        return combat;
    }

    return {
        // Iron Heart (heart-cost.js plan.item.healCost; scripts/heal-cost.js on the ability module's applied hook): its user sends an ally that
        // just started dying 2d8 Hit Points and loses as many, which nothing lowers (not resistance, immunity or temporary Hit Points); if that
        // leaves its user dying, the ally gets 2d8 more. A PC (30 maximum Hit Points, 4 temporary) uses it at an ally 20 feet off at 0 Hit
        // Points with Dying 1: its card's Apply at the ally, then the ability module's heal card applied — the ally healed N, the chat line
        // "loses N Hit Points for the healing it gave", the user 30 − N with its 4 temporary Hit Points untouched, no "left dying" line; the
        // applied hook's payload has plan.item.healCost and the heal change. Again with the user at 1 Hit Point: the user at 0 (temporary 4
        // kept), the line "is left dying: … regains 2d8 more (M)", and the ally at its second N + M.
        async b5AfflictionsIronHeartCost(scene) {
            const { actor: giver, token: giverToken } = await h.creature(scene, "Iron Heart Giver", { type: "character", x: 2, y: 2, level: 4 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Iron Heart Ally", { x: 6, y: 2, hp: 0 });
            await hitPoints(giver, 30, 30);
            await giver.update({ "system.attributes.hp.temp": 4 });
            await ally.increaseCondition("dying");
            await h.until(() => hp(giver) === 30 && temp(giver) === 4 && ally.hasCondition("dying"), `the giver at 30 (4 temporary), the ally dying (${hp(giver)}, ${temp(giver)}; ${conditionSlugs(ally)})`, { timeout: 5000 });
            const payloads = [];
            const hook = Hooks.on(`${ABILITY}.applied`, (payload) => {
                if (payload?.state?.plan?.item?.healCost) payloads.push(payload);
            });
            // (The heart used at the ally, its heal card applied → the cost's chat line and the amount it says.)
            const send = async (what) => {
                const heart = await h.give(giver, "Iron Heart", MAGIC);
                let since = Date.now();
                await heart.consume();
                const card = await h.messageAfter(since, h.itemCard("expose"), { what: `${what}: the heart's card` });
                await giverToken.object?.control?.();
                since = Date.now();
                await api().apply(card.id, { targets: [allyToken.uuid] });
                const heal = await cardAt(since, ally, `${what}: the heal card at the ally`);
                await h.applyAbilityCard(heal);
                const paid = await h.messageAfter(since, (message) => /loses \d+ Hit Points for the healing it gave/.test(textOf(message)), { what: `${what}: the cost's line`, timeout: 12000 });
                const lost = Number(/loses (\d+) Hit Points for the healing it gave/.exec(textOf(paid))?.[1]);
                h.assert(lost >= 2 && lost <= 16, `2d8 paid (${textOf(paid)})`);
                return { heal, paid, lost };
            };
            try {
                const first = await send("first");
                await h.until(() => hp(ally) === first.lost, `the ally healed ${first.lost} (${hp(ally)})`, { timeout: 8000 });
                await h.until(() => hp(giver) === 30 - first.lost && temp(giver) === 4, `the giver at ${30 - first.lost}, its 4 temporary kept (${hp(giver)}, ${temp(giver)})`, { timeout: 8000 });
                h.assert(!/left dying/.test(textOf(first.paid)), `no second healing above 0 (${textOf(first.paid)})`);
                const payload = payloads[0];
                h.assert(payload?.state?.plan?.item?.healCost?.noTemp === true && payload.state.plan.item.healCost.dying?.heal === "2d8", `the applied hook's plan.item.healCost (${JSON.stringify(payload?.state?.plan?.item?.healCost)})`);
                h.assert((payload.changes ?? []).some((change) => change.op === "heal" && Number(change.amount) === first.lost), `its heal change of ${first.lost} (${JSON.stringify(payload.changes)})`);
                // (Again, its user at 1 Hit Point: left at 0, the ally healed again.)
                await ally.update({ "system.attributes.hp.value": 0 });
                if (!ally.hasCondition("dying")) await ally.increaseCondition("dying");
                await giver.update({ "system.attributes.hp.value": 1, "system.attributes.hp.temp": 4 });
                await h.until(() => hp(ally) === 0 && hp(giver) === 1 && temp(giver) === 4, `the ally at 0, the giver at 1 (4 temporary) (${hp(ally)}, ${hp(giver)}, ${temp(giver)})`, { timeout: 5000 });
                const second = await send("second");
                const more = /is left dying: .+? regains 2d8 more \((\d+)\)/.exec(textOf(second.paid));
                h.assert(more, `its second healing's line (${textOf(second.paid)})`);
                const extra = Number(more[1]);
                await h.until(() => hp(ally) === Math.min(second.lost + extra, Number(ally.system.attributes.hp.max)), `the ally at ${second.lost} + ${extra} (${hp(ally)})`, { timeout: 8000 });
                await h.until(() => hp(giver) === 0 && temp(giver) === 4, `the giver at 0, its 4 temporary kept (${hp(giver)}, ${temp(giver)})`, { timeout: 8000 });
                return { first: first.lost, second: second.lost, extra, line: textOf(second.paid), giverDying: giver.hasCondition("dying") };
            } finally {
                Hooks.off(`${ABILITY}.applied`, hook);
            }
        },

        // Instinct Crown (Disaster)'s second activation (disaster-herald.js; scripts/live.js ruleEffects untilRage + fromInstinct, src/live/disaster.js
        // instinctAuras, scripts/turn-auras.js): for its rage, creatures ending their turns in its user's Disaster emanation take its damage again as
        // persistent damage. A level-10 fixture with Barbarians+'s Disaster Instinct (Eruption: fire), raging, in an encounter with a foe beside it
        // and one 20 feet off: Apply gives it the "Herald of the end" Effect, flagged untilRage, one turn aura at "end", radius 5, its card's damage
        // "<the instinct's amount>[persistent,fire]". The near foe's turn end brings that card (applied: persistent fire on it); the far foe's none.
        // Its Effect: Rage deleted, the herald goes. Activated again not raging: "isn't raging: no Herald of the end". A raging fixture without the
        // instinct: "has no Disaster instinct (its crown's needs it): no Herald of the end", and no Effect.
        async b5AfflictionsDisasterHerald(scene) {
            const { actor: herald, token: heraldToken } = await h.creature(scene, "Disaster Herald", { type: "character", x: 3, y: 6, level: 10 });
            const { actor: near, token: nearToken } = await h.creature(scene, "Herald Near Foe", { x: 4, y: 6, alliance: "opposition", hp: 100 });
            const { actor: far, token: farToken } = await h.creature(scene, "Herald Far Foe", { x: 7, y: 6, alliance: "opposition", hp: 100 });
            const { actor: plain } = await h.creature(scene, "Herald Plain Barbarian", { type: "character", x: 3, y: 10, level: 10 });
            await giveChosen(herald, "Disaster Instinct", BARBARIANS, "Eruption");
            await h.until(() => herald.flags?.pf2e?.disasterInstinct?.damageType === "fire", `the Eruption instinct's flag (${JSON.stringify(herald.flags?.pf2e?.disasterInstinct)})`, { timeout: 5000 });
            const amount = Math.max(1, Math.floor(Number(herald.flags.pf2e.disasterInstinct.damage) || 1));
            const crown = await h.give(herald, "Instinct Crown (Disaster)", BARBARIANS);
            const rage = await rageOn(herald);
            const effectOf = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.ruleEffect === "Herald of the end");
            const burning = (actor) => actor.itemTypes.condition.some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "fire");
            const combat = await encounter(scene, [heraldToken, nearToken, farToken]);
            try {
                const card = await activated(crown, 1, "item", "the crown's herald card");
                await api().apply(card.id, {});
                await h.until(() => effectOf(herald), `the herald's Effect (${effectNames(herald)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                const flags = effectOf(herald).flags[h.NS];
                const auras = flags.turnAuras ?? [];
                h.assert(flags.untilRage === true && auras.length === 1 && auras[0].at === "end" && Number(auras[0].radius) === 5, `flagged untilRage, one aura at a turn's end within 5 feet (${JSON.stringify({ untilRage: flags.untilRage, auras: auras.map((aura) => ({ at: aura.at, radius: aura.radius })) })})`);
                const formula = auras[0].plan?.resolution?.sharedDamage?.components?.[0]?.formula;
                h.assert(formula === `${amount}[persistent,fire]`, `its persistent fire from the instinct (${formula}, the instinct's ${amount})`);
                // (The herald's turn ends, the near foe's starts: nothing. The near foe's turn ends: its card. The far foe's: none.)
                await combat.nextTurn();
                let since = Date.now();
                await combat.nextTurn();
                const burn = await cardAt(since, near, "the near foe's persistent fire card");
                since = Date.now();
                await combat.nextTurn();
                await h.wait(1500);
                h.assert(!abilityCardsSince(since).some((message) => targetsOf(message).includes(far.uuid)), "no card for the foe 20 feet off");
                await h.applyAbilityCard(burn);
                await h.until(() => burning(near), `persistent fire on the near foe (${conditionSlugs(near)})`, { timeout: 10000 });
                await rage.delete();
                await h.until(() => !effectOf(herald), `the herald's Effect gone with the Rage (${effectNames(herald)})`, { timeout: 8000 });
                // (Not raging: refused.)
                const calm = await activated(crown, 1, "item", "the crown's card, not raging");
                await api().apply(calm.id, {});
                await h.until(() => resultsOf(calm).length, "its lines", { timeout: 8000 });
                h.assert(resultsOf(calm).some((line) => /isn't raging: no Herald of the end/.test(line)) && !effectOf(herald), `refused while not raging (${JSON.stringify(resultsOf(calm))}; ${effectNames(herald)})`);
                // (Raging, without the instinct: refused.)
                const other = await h.give(plain, "Instinct Crown (Disaster)", BARBARIANS);
                await rageOn(plain);
                const none = await activated(other, 1, "item", "the crown's card, no instinct");
                await api().apply(none.id, {});
                await h.until(() => resultsOf(none).length, "its lines", { timeout: 8000 });
                h.assert(resultsOf(none).some((line) => /has no Disaster instinct \(its crown's needs it\): no Herald of the end/.test(line)) && !effectOf(plain), `refused without the instinct (${JSON.stringify(resultsOf(none))}; ${effectNames(plain)})`);
                return { formula, results: resultsOf(card), calm: resultsOf(calm), none: resultsOf(none) };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Scepter of Sickening's Rotting Aura (rotting-aura.js; the ways card's slot, the ability module's zone on its user): a 20-foot emanation
        // for rounds equal to the slot's rank; a creature ending its turn in it is Sickened 1 or 1 more, 4 at most, and can't lower it below 1 there.
        // A level-11 caster with one rank 3 slot, a foe beside it, in an encounter: "A rank 3 slot" spends the slot and makes the zone (a 20-foot
        // emanation, 3 rounds); the foe gets its "in the putrid aura" note Effect. Its first turn end: the automatic card (applied: Sickened 1); its
        // next: Sickened 2. Moved 40 feet off (Foundry's teleport): the note Effect gone, Sickened 2 kept.
        async b5AfflictionsRottingAura(scene) {
            const { actor: caster, token: casterToken } = await h.creature(scene, "Rotting Scepter Caster", { type: "character", x: 9, y: 10, level: 11 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Rotting Aura Foe", { x: 10, y: 10, alliance: "opposition", hp: 100 });
            const left = await slotOf(caster, 3);
            const scepter = await h.give(caster, "Scepter of Sickening", MAGIC);
            await casterToken.object?.control?.();
            const aura = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Scepter of Sickening/.test(`${region.name ?? ""} ${region.flags[ABILITY].zone.itemName ?? ""}`));
            const inside = () => foe.itemTypes.effect.find((effect) => /in the putrid aura$/.test(effect.name));
            const combat = await encounter(scene, [casterToken, foeToken]);
            try {
                const ways = await activated(scepter, 1, "ways", "Rotting Aura's ways card");
                const names = stateOf(ways).plan.ways.map((way) => way.name);
                h.assert(names[0] === "A rank 3 slot" && names.length === 8, `a way for each slot from rank 3 (${names.join(", ")})`);
                await api().apply(ways.id, { choice: 0 });
                await h.until(() => aura(), "the aura's Region", { timeout: 8000 });
                await h.until(() => left() === 0, `the rank 3 slot spent (${left()})`, { timeout: 8000 });
                const zone = aura().flags[ABILITY].zone.zone ?? {};
                h.assert(zone.area?.type === "emanation" && Number(zone.area.value) === 20 && Number(zone.lasts?.value) === 3 && zone.lasts.unit === "rounds", `a 20-foot emanation for 3 rounds (${JSON.stringify({ area: zone.area, lasts: zone.lasts })})`);
                await h.until(() => inside(), `the foe's note Effect inside (${effectNames(foe)})`, { timeout: 8000 });
                // (The ability module's note words drop quotes and apostrophes: "cant".)
                h.assert(/lower its Sickened condition below 1/.test(inside().system?.description?.value ?? ""), `its words (${inside().system?.description?.value})`);
                // (The caster's turn ends, the foe's starts; the foe's ends: its card.)
                await combat.nextTurn();
                let since = Date.now();
                await combat.nextTurn();
                const first = await cardAt(since, foe, "the foe's first turn-end card");
                await h.applyAbilityCard(first);
                await h.until(() => valueOf(foe, "sickened") === 1, `Sickened 1 (${valueOf(foe, "sickened")})`, { timeout: 10000 });
                // (The caster's own turn ends inside it too: no card for it, the zone's maker.)
                const casterEnds = Date.now();
                await combat.nextTurn();
                since = Date.now();
                await combat.nextTurn();
                const second = await cardAt(since, foe, "the foe's second turn-end card");
                await h.applyAbilityCard(second);
                await h.until(() => valueOf(foe, "sickened") === 2, `Sickened 2 (${valueOf(foe, "sickened")})`, { timeout: 10000 });
                h.assert(!abilityCardsSince(casterEnds).some((message) => targetsOf(message).includes(caster.uuid)), "no card for the caster");
                // (Out of the aura: its note gone.)
                await foeToken.update({ x: 18 * 100, y: 10 * 100 }, { teleport: true, animate: false });
                await h.until(() => !inside(), `the note Effect gone once it left (${effectNames(foe)})`, { timeout: 8000 });
                h.assert(valueOf(foe, "sickened") === 2, `still Sickened 2 (${valueOf(foe, "sickened")})`);
                return { zone: { area: zone.area, lasts: zone.lasts }, sickened: valueOf(foe, "sickened") };
            } finally {
                await combat.delete().catch(() => null);
                await aura()?.delete().catch(() => null);
            }
        },

        // Scepter of Purifying's Purifying Wave (purifying-wave.js plan.heldCounteract; scripts/hit-counteract.js on the ability module's applied
        // hook): 1d8 Hit Points a rank to those in its cone, and a counteract of their Sickened (or one disease or poison) at the slot's rank. A
        // level-7 caster with one rank 4 slot: "A rank 4 slot" posts its card (heldCounteract rank 4, +13: the scepter's level's DC − 10); applied
        // at two Sickened 1 allies (NPCs at 10 Hit Points), the slot spent and the ability module's 4d8 heal card at both; applied, each healed 4
        // to 32, then one counteract card per ally at rank 4, +13, for Sickened — its first step lists that ally's Sickened 1.
        async b5AfflictionsPurifyingWave(scene) {
            const { actor: caster, token: casterToken } = await h.creature(scene, "Purifying Scepter Caster", { type: "character", x: 2, y: 13, level: 7 });
            const allies = [await h.creature(scene, "Purified Ally A", { x: 3, y: 13, hp: 10 }), await h.creature(scene, "Purified Ally B", { x: 3, y: 14, hp: 10 })];
            for (const { actor } of allies) await actor.increaseCondition("sickened", { value: 1 });
            await h.until(() => allies.every(({ actor }) => valueOf(actor, "sickened") === 1), "both allies Sickened 1", { timeout: 5000 });
            const left = await slotOf(caster, 4);
            const scepter = await h.give(caster, "Scepter of Purifying", MAGIC);
            const ways = await activated(scepter, 1, "ways", "Purifying Wave's ways card");
            const names = stateOf(ways).plan.ways.map((way) => way.name);
            h.assert(names[0] === "A rank 4 slot" && names.length === 7, `a way for each slot from rank 4 (${names.join(", ")})`);
            const wave = await wayCard(ways, 0, "expose", "the rank 4 wave's card");
            const held = stateOf(wave).plan.heldCounteract;
            h.assert(held?.counteract?.rank === 4 && held.counteract.modifier === 13 && (held.counteract.conditions ?? []).includes("sickened") && (held.degrees ?? []).includes("success"), `its counteract after the heal (${JSON.stringify(held)})`);
            await casterToken.object?.control?.();
            let since = Date.now();
            await api().apply(wave.id, { targets: allies.map(({ token }) => token.uuid) });
            // (One card for both, or one each: each ally's.)
            const heals = [];
            for (const { actor } of allies) heals.push(await cardAt(since, actor, `the heal card at ${actor.name}`));
            await h.until(() => left() === 0, `the rank 4 slot spent (${left()})`, { timeout: 8000 });
            // (The card's own plan when it keeps the item's heal row: 4d8, the slot's rank in d8s.)
            const formula = (abilityState(heals[0]).plan?.resolution?.outcomes?.success?.effects ?? []).find((effect) => effect.kind === "heal")?.formula ?? null;
            if (formula) h.assert(formula === "4d8", `4d8 (${formula})`);
            const before = allies.map(({ actor }) => hp(actor));
            since = Date.now();
            for (const heal of heals.filter((message, index) => heals.findIndex((other) => other.id === message.id) === index)) await h.applyAbilityCard(heal);
            await h.until(() => allies.every(({ actor }, index) => hp(actor) > before[index]), `both healed (${allies.map(({ actor }) => hp(actor)).join(", ")})`, { timeout: 10000 });
            const gained = allies.map(({ actor }, index) => hp(actor) - before[index]);
            h.assert(gained.every((amount) => amount >= 4 && amount <= 32), `4d8 each (${gained.join(", ")})`);
            const counters = [];
            for (const { actor } of allies) {
                const counter = await h.messageAfter(since, (message) => h.itemCard("counteract")(message) && stateOf(message)?.drinkers?.[0]?.actorUuid === actor.uuid, { what: `the counteract card at ${actor.name}`, timeout: 10000 });
                const counteract = stateOf(counter).counteract;
                h.assert(counteract.rank === 4 && counteract.modifier === 13 && (counteract.conditions ?? []).includes("sickened"), `rank 4, +13, for Sickened (${JSON.stringify(counteract)})`);
                await api().apply(counter.id, { drinker: 0 });
                await h.until(() => stateOf(counter).step === "pick", `its creature's rows (${stateOf(counter).step})`, { timeout: 8000 });
                const rows = stateOf(counter).rows ?? [];
                h.assert(rows.some((row) => row.kind === "condition" && row.slug === "sickened"), `its Sickened listed (${JSON.stringify(rows)})`);
                counters.push({ id: counter.id, rows: rows.map((row) => row.name) });
            }
            h.assert(new Set(counters.map((entry) => entry.id)).size === 2, "one counteract card for each ally");
            return { gained, counters };
        },

        // Quantum Duplicator (quantum-duplicate.js; scripts/live.js postWhisper whisper.flat.success): its duplicate's words whispered to the GM and
        // its user, the GM's secret DC 2 flat check, and its user's 24-hour note Effect. Used with every d20 at 10: the GM's blind whisper "secret
        // flat check DC 2: 10 — a success: the duplicate is true to its user", the whispered card (the GM among those it's for), and the
        // "Quantum duplicate" note Effect for 24 hours. Used with every d20 at 1: "… DC 2: 1 — a failure. The duplicate is evil …".
        async b5AfflictionsQuantumDuplicator(scene) {
            const { actor: inventor } = await h.creature(scene, "Quantum Inventor", { type: "character", x: 14, y: 14, level: 19 });
            const gms = () => game.users.filter((user) => user.isGM).map((user) => user.id);
            const notes = () => inventor.itemTypes.effect.filter((effect) => /Quantum duplicate$/.test(effect.name));
            // (Used with every d20 at that face, held until the GM's flat check is in the chat: the roll is made by the card's hook, after Use.)
            const use = async (face, what) => {
                const duplicator = await h.give(inventor, "Quantum Duplicator", INVENTORS);
                const since = Date.now();
                return h.withDie(face, async () => {
                    await duplicator.consume();
                    const flat = await h.messageAfter(since, (message) => /secret flat check DC 2:/.test(textOf(message)), { what: `${what}: the GM's secret flat check`, timeout: 10000 });
                    const card = await h.messageAfter(since, (message) => message.flags?.[h.NS]?.whisper?.item === "Quantum Duplicator", { what: `${what}: the whispered card`, timeout: 10000 });
                    return { flat, card };
                });
            };
            const won = await use(10, "the first use");
            h.assert(/DC 2: 10 — a success: the duplicate is true to its user/.test(textOf(won.flat)), `its success words (${textOf(won.flat)})`);
            h.assert(won.flat.blind && (won.flat.whisper ?? []).length && won.flat.whisper.every((id) => gms().includes(id)), `for the GM alone (blind ${won.flat.blind}; ${JSON.stringify(won.flat.whisper)})`);
            h.assert((won.card.whisper ?? []).some((id) => gms().includes(id)), `the card whispered, the GM among them (${JSON.stringify(won.card.whisper)})`);
            await h.until(() => notes().length === 1, `the "Quantum duplicate" note Effect (${effectNames(inventor)})`, { timeout: 8000 });
            const duration = notes()[0].system.duration;
            h.assert((Number(duration.value) === 24 && duration.unit === "hours") || (Number(duration.value) === 1 && duration.unit === "days"), `for 24 hours (${JSON.stringify(duration)})`);
            const lost = await use(1, "the second use");
            h.assert(/DC 2: 1 — a failure\. The duplicate is evil/.test(textOf(lost.flat)), `its failure words (${textOf(lost.flat)})`);
            return { success: textOf(won.flat), failure: textOf(lost.flat), duration };
        },

        // Pham Lê Ngọc's Ceremonial Sword's Focused Attack (rolled-critical.js strike.rolledCritical; scripts/strikes.js rolledCriticalRules): the
        // Strike one degree better, and 2d6 precision more when the roll was a critical hit already. Readied (its Strike card): its Effect with
        // PF2e's AdjustDegreeOfSuccess and the critical-only 2d6 precision DamageDice waiting for the roll option air-rolled-critical. A natural 20
        // at AC 1: a critical hit unadjusted, the option put on the Effect, and the critical damage roll (no message) has 2d6 in it. Readied again,
        // a 10 at an AC 5 under the roll: a success made a critical hit, no option, and its critical damage roll has no d6.
        async b5AfflictionsCeremonialSwordRolledCritical(scene) {
            await h.clearSquares(scene, [[2, 17], [3, 17], [3, 18]]);
            const { actor: duelist, token: duelistToken } = await h.creature(scene, "Ceremonial Duelist", { type: "character", x: 2, y: 17, level: 6 });
            const { token: naturalToken } = await h.creature(scene, "Ceremonial Natural Mark", { x: 3, y: 17, ac: 1, hp: 300, alliance: "opposition" });
            const { actor: upgraded, token: upgradedToken } = await h.creature(scene, "Ceremonial Upgraded Mark", { x: 3, y: 18, ac: 1, hp: 300, alliance: "opposition" });
            const sword = await h.give(duelist, "Pham Lê Ngọc's Ceremonial Sword", TIAN_XIA);
            await sword.update(held(1));
            await h.until(() => strikeOf(duelist, sword), "a Strike with the sword", { timeout: 5000 });
            const readied = () => duelist.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
            const optionOn = () => (readied()?.system?.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === ROLLED_CRITICAL);
            // (Its d6s: the roll's dice, else its formula's — the sword's own dice are d4s, its deadly die too.)
            const sixes = (roll) => Math.max((roll?.dice ?? []).filter((die) => Number(die.faces) === 6).reduce((sum, die) => sum + (Number(die.number) || 0), 0), [...String(roll?.formula ?? "").matchAll(/(\d*)d6\b/g)].reduce((sum, match) => sum + (Number(match[1]) || 1), 0));
            const ready = async () => {
                for (const effect of duelist.itemTypes.effect.filter((entry) => entry.flags?.[h.NS]?.strikeRider)) await effect.delete();
                const card = await activated(sword, 0, "strike", "Focused Attack's Strike card");
                await api().apply(card.id);
                await h.until(() => readied(), `the readied Strike's Effect (${effectNames(duelist)})`, { timeout: 8000 });
                const rules = readied().system.rules ?? [];
                h.assert(rules.some((rule) => rule.key === "AdjustDegreeOfSuccess") && rules.some((rule) => rule.key === "DamageDice" && rule.dieSize === "d6" && Number(rule.diceNumber) === 2 && JSON.stringify(rule.predicate ?? []).includes(ROLLED_CRITICAL)), `one degree better, 2d6 waiting for ${ROLLED_CRITICAL} (${JSON.stringify(rules)})`);
                h.assert(!optionOn(), "no roll option yet");
                return card;
            };
            await duelistToken.object?.control?.();
            // (A natural 20.)
            await ready();
            await h.target(naturalToken);
            const one = await h.withDie(20, () => h.strike(duelist, sword));
            const context = one.attack.flags.pf2e.context;
            h.assert(context.outcome === "criticalSuccess" && context.unadjustedOutcome === "criticalSuccess", `a critical hit as rolled (${context.outcome}, unadjusted ${context.unadjustedOutcome})`);
            await h.until(() => optionOn(), `the roll option on the readied Effect (${JSON.stringify(readied()?.system?.rules)})`, { timeout: 8000 });
            // (The Strike as the actor has it now, its Effect's new rule prepared.)
            const rolled = await strikeOf(duelist, sword).critical({ event: h.shift(), createMessage: false });
            h.assert(sixes(rolled) >= 2, `2d6 more on the critical damage (${rolled?.formula}; d6s ${sixes(rolled)})`);
            // (A success the Effect makes a critical hit: the AC 5 under a 10's total.)
            await ready();
            const total = Number(strikeOf(duelist, sword)?.totalModifier) + 10;
            h.assert(Number.isFinite(total), `its Strike's modifier (${strikeOf(duelist, sword)?.totalModifier})`);
            await upgraded.update({ "system.attributes.ac.value": total - 5 });
            await h.until(() => Number(upgraded.system.attributes.ac.value) === total - 5, `AC ${total - 5}`, { timeout: 5000 });
            await h.target(upgradedToken);
            const two = await h.withDie(10, () => h.strike(duelist, sword));
            const better = two.attack.flags.pf2e.context;
            h.assert(better.outcome === "criticalSuccess" && better.unadjustedOutcome === "success", `a success made a critical hit (${better.outcome}, unadjusted ${better.unadjustedOutcome})`);
            await h.until(() => readied()?.flags?.[h.NS]?.strikeRider?.awaiting === true, "its Effect waiting for the damage roll", { timeout: 8000 });
            await h.wait(1000);
            h.assert(!optionOn(), `no roll option for an upgraded hit (${JSON.stringify(readied()?.system?.rules)})`);
            const plain = await strikeOf(duelist, sword).critical({ event: h.shift(), createMessage: false });
            h.assert(sixes(plain) === 0, `no 2d6 on the upgraded critical hit's damage (${plain?.formula}; d6s ${sixes(plain)})`);
            return { natural: rolled?.formula, upgraded: plain?.formula };
        },

        // Runebranded Hide (runebrand.js; item.strikeDamage beside a ruleEffect with PF2e's AdjustModifier suppress): for a minute its wearer's
        // melee Strikes deal electricity dice by its resilient rune, and the hide's own item bonus to saves against electricity is off. Worn by a
        // level-8 fixture (the hide's +1: resilient 0), its Reflex DC against an electricity effect 1 over the plain one. Activated and applied:
        // the "Strike damage" Effect (1d6 electricity on melee Strikes) and the "save bonus off" Effect (AdjustModifier, suppress, the hide's
        // modifier's slug), each for 1 minute; its Reflex DC against electricity no longer over; a longsword's damage roll has electricity, a
        // sling's none. The "save bonus off" Effect deleted: the +1 back.
        async b5AfflictionsRunebrandedHide(scene) {
            const { actor: wearer } = await h.creature(scene, "Runebrand Wearer", { type: "character", x: 6, y: 17, level: 8 });
            const hide = await h.give(wearer, "Runebranded Hide", BATTLEZOO);
            await hide.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, ...((hide.system.traits?.value ?? []).includes("invested") ? { "system.equipped.invested": true } : {}) });
            const sword = await h.give(wearer, "Longsword");
            await sword.update(held(1));
            const sling = await h.give(wearer, "Sling");
            await sling.update(held(1));
            await h.until(() => strikeOf(wearer, sword) && strikeOf(wearer, sling), "Strikes with the longsword and the sling", { timeout: 5000 });
            const reflex = (options) => Number(wearer.getStatistic("reflex")?.withRollOptions({ extraRollOptions: options })?.dc?.value);
            const over = () => reflex(["electricity"]) - reflex([]);
            await h.until(() => over() === 1, `the hide's own +1 to saves against electricity, worn (${over()}: is its rule's predicate read?)`, { timeout: 5000 });
            const card = await activated(hide, 0, "item", "the hide's card");
            await api().apply(card.id, {});
            const off = () => wearer.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.ruleEffect === "Runebranded Hide: save bonus off");
            const dice = () => wearer.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeDamage);
            await h.until(() => off() && dice(), `its two Effects (${effectNames(wearer)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const suppress = (off().system.rules ?? []).find((rule) => rule.key === "AdjustModifier");
            h.assert(suppress?.suppress === true && suppress.slug === "runebranded-hide-electricity" && [].concat(suppress.selector).includes("saving-throw"), `PF2e's AdjustModifier suppressing the hide's modifier (${JSON.stringify(suppress)})`);
            const added = (dice().system.rules ?? []).find((rule) => rule.key === "DamageDice");
            h.assert(added?.damageType === "electricity" && added.dieSize === "d6" && Number(added.diceNumber) === 1 && (added.predicate ?? []).includes("item:melee"), `1d6 electricity on melee Strikes (${JSON.stringify(added)})`);
            for (const effect of [off(), dice()]) h.assert(Number(effect.system.duration?.value) === 1 && effect.system.duration?.unit === "minutes", `${effect.name} for 1 minute (${JSON.stringify(effect.system.duration)})`);
            await h.until(() => over() === 0, `the hide's own bonus off (${over()})`, { timeout: 8000 });
            const types = async (weapon) => ((await strikeOf(wearer, weapon).damage({ event: h.shift(), createMessage: false }))?.instances ?? []).map((instance) => instance.type);
            const melee = await types(sword);
            const ranged = await types(sling);
            h.assert(melee.includes("electricity"), `electricity on the longsword's damage (${melee.join(", ")})`);
            h.assert(!ranged.includes("electricity"), `none on the sling's (${ranged.join(", ")})`);
            await off().delete();
            await h.until(() => over() === 1, `the +1 back once its Effect is gone (${over()})`, { timeout: 8000 });
            return { melee, ranged, suppress };
        }
    };
};
