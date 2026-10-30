// The spell-module rows built 2026-10-29 (the user's answer to question 8), live: tools/live-check.mjs joins them to its own. h: its helpers.
// - Sorshen's Sinuous Guisarme: Arcane Shift's staff form — its Strikes the staff's, runes off, the charges, its user's own DC, a slot and
//   1 charge, Impose Will refused, reverted; again, rank 10 at mythic proficiency for 10 charges and a Mythic Point, reverted by its last.
// - Starless Scope: the cast-boost card on its user's last cast — the critical success's bonus, penalty and slot back; the critical
//   failure's spell lost and lens shattered, a new lens put in.
// - Blessed Reformer: Calm at half its user's level, one target, its save penalty the weapon's damage dice.
// - Phoenix Fighting Fan: Quandary kept up by a Strike each round, ended by a round without one.
// - Animate Dreamer: a spell stored in its etched Spell Reservoir, Unleash Spell at +25 and DC 33; another stored and Safe Release.
// - Cayden's Tankard: a foe's Fear at its user counteracted and cast again at the foe alone (the spell module's api.casting.reaim).
// - Scale of Igroon: a foe's Force Barrage at its user cast again at another creature within what's left of its range.

const SPELLS = "pf2e-automatic-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    async function activationIndex(item, name) {
        const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
        const entries = compileActivations({ ...item.toObject(false), uuid: item.uuid });
        const index = typeof name === "function" ? entries.find((entry) => name(entry.plan))?.index : entries.find((entry) => entry.activation?.name === name)?.index;
        h.assert(Number.isInteger(index), `${item.name}'s ${typeof name === "function" ? "cast" : name} activation (${entries.map((entry) => `${entry.activation?.name}: ${entry.plan?.spell?.name ?? entry.plan?.builtin}`).join(", ")})`);
        return index;
    }
    // A spontaneous entry of the tradition with these slots ({ slot1: 1 }), and these spells on it → { entry, spells }.
    async function spontaneous(actor, tradition, slots, names = []) {
        const system = { tradition: { value: tradition }, prepared: { value: "spontaneous" }, ability: { value: "cha" }, proficiency: { value: 2 }, slots: Object.fromEntries(Object.entries(slots).map(([key, count]) => [key, { value: count, max: count }])) };
        const [entry] = await actor.createEmbeddedDocuments("Item", [{ name: `${tradition} spells`, type: "spellcastingEntry", system }]);
        const index = await game.packs.get("pf2e.spells-srd").getIndex();
        const sources = [];
        for (const name of names) {
            const row = index.find((one) => one.name === name);
            h.assert(row, `${name} isn't in PF2e's spells.`);
            const source = (await game.packs.get("pf2e.spells-srd").getDocument(row._id)).toObject();
            delete source._id;
            source.system.location = { value: entry.id };
            sources.push(source);
        }
        const spells = sources.length ? await actor.createEmbeddedDocuments("Item", sources) : [];
        return { entry: actor.items.get(entry.id), spells };
    }
    // An NPC's spontaneous entry at a DC (its attack 10 lower), with rank 1 slots, and these spells on it → { entry, spells }.
    async function npcCaster(actor, tradition, dc, names) {
        const system = { tradition: { value: tradition }, prepared: { value: "spontaneous" }, spelldc: { dc, value: dc - 10 }, slots: { slot1: { value: 3, max: 3 } } };
        const [entry] = await actor.createEmbeddedDocuments("Item", [{ name: `${tradition} spells`, type: "spellcastingEntry", system }]);
        const index = await game.packs.get("pf2e.spells-srd").getIndex();
        const sources = [];
        for (const name of names) {
            const source = (await game.packs.get("pf2e.spells-srd").getDocument(index.find((one) => one.name === name)._id)).toObject();
            delete source._id;
            source.system.location = { value: entry.id };
            sources.push(source);
        }
        return { entry: actor.items.get(entry.id), spells: await actor.createEmbeddedDocuments("Item", sources) };
    }
    // Its own cast of the spell from its entry (PF2e's: a slot spent, the cast message) → that message.
    async function ownCast(actor, entry, spell, rank) {
        const since = Date.now();
        await actor.items.get(entry.id).cast(spell, { rank });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.casting && message.flags.pf2e.origin?.type === "spell" && message.item?.id === spell.id, { what: `${spell.name}'s cast`, timeout: 10000 });
    }
    // An Apply that's refused → its error.
    const refusal = (promise) => promise.then(() => null, (error) => error);
    async function closeWindows() {
        for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "DialogV2" || /caster choices|review/i.test(String(app.title ?? ""))) await app.close().catch(() => null);
    }

    // Sorshen's Sinuous Guisarme's staff, its user an occult caster at level 20.
    async function shifter(scene, name, y) {
        const { actor: user, token: userToken } = await h.creature(scene, name, { type: "character", x: 2, y, level: 20 });
        const { actor: foe, token: foeToken } = await h.creature(scene, `${name} Foe`, { x: 5, y, alliance: "opposition", hp: 400, level: 10 });
        const { entry } = await spontaneous(user, "occult", { slot3: 1 });
        const guisarme = await h.give(user, "Sorshen's Sinuous Guisarme");
        await guisarme.update(held(2));
        await userToken.object?.control?.();
        await h.target(foeToken);
        const form = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.staffForm) ?? null;
        const weapon = () => user.items.get(guisarme.id);
        async function shift() {
            const since = Date.now();
            await api().activate(guisarme.uuid, await activationIndex(weapon(), "Arcane Shift"));
            const card = await h.messageAfter(since, h.itemCard("staff-form"), { what: "the staff-form card" });
            await h.until(form, `the form's Effect (${user.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 8000 });
            return card;
        }
        // The card applied → the spell module's cast and the next card (null when the form ended with it).
        async function castFrom(card, choices) {
            const since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid], ...choices });
            const cast = await castMessage(since);
            await h.until(() => stateOf(card)?.status === "applied", `the card closed with its line (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const next = form() ? await h.messageAfter(since, (message) => message.id !== card.id && message.getFlag(h.NS, "card")?.kind === "staff-form", { what: "the next staff-form card", timeout: 8000 }) : null;
            return { cast, next };
        }
        const pick = (card, name, rank) => stateOf(card).form.spells.findIndex((spell) => spell.name === name && spell.rank === rank);
        // (Its entry's DC as PF2e has it, and at mythic proficiency: its level + 10 for its proficiency bonus.)
        const statistic = () => user.items.get(entry.id).statistic;
        const dc = () => Number(statistic().dc.value);
        const mythicDC = () => dc() - Number(statistic().check.modifiers.find((modifier) => modifier.slug === "proficiency")?.modifier ?? 0) + 30;
        return { user, foe, foeToken, entry, guisarme, form, weapon, shift, castFrom, pick, dc, mythicDC };
    }

    return {
        // Arcane Shift: the guisarme the Staff of Control (Major) — d4 bludgeoning (d8 in two hands), no runes (its own kept), the staff trait, 10 charges on the
        // Effect —; Impose Will refused; Enthrall (rank 3) at the foe at its user's own DC, 3 charges; Enthrall again with a spontaneous slot and 1
        // charge; Charm at rank 10 refused with 6 charges; reverted by the card: d10 slashing, its runes back.
        async b7SorshenStaffForm(scene) {
            assertSpells();
            const s = await shifter(scene, "Staff Shifter", 2);
            try {
                let card = await s.shift();
                const weapon = s.weapon();
                h.assert(weapon._source.system.damage.die === "d4" && weapon.system.damage.die === "d8" && weapon.system.damage.damageType === "bludgeoning" && weapon._source.system.runes.potency === 0 && !weapon._source.system.runes.property.length && !weapon.system.traits.value.includes("staff") && weapon.system.traits.value.includes("two-hand-d8"), `the staff's Strikes, its runes off (${JSON.stringify({ damage: weapon.system.damage, runes: weapon._source.system.runes, traits: weapon.system.traits.value })})`);
                h.assert(weapon.getFlag(h.NS, "staffForm")?.kept?.runes?.potency === 4 && s.form().system.badge.value === 10, `its runes kept, 10 charges (${JSON.stringify({ kept: weapon.getFlag(h.NS, "staffForm")?.kept?.runes, badge: s.form().system.badge })})`);
                const strike = (s.user.system.actions ?? []).find((action) => action.item?.id === s.guisarme.id);
                const formula = strike ? String(await strike.damage({ getFormula: true }).catch(() => "")) : "";
                const impose = await refusal(api().activate(s.guisarme.uuid, await activationIndex(s.weapon(), "Impose Will")));
                h.assert(/no Impose Will until/.test(impose?.message ?? ""), `Impose Will refused (${impose?.message ?? "not refused"})`);
                const enthrall = s.pick(card, "Enthrall", 3);
                let { cast, next } = await s.castFrom(card, { pick: enthrall });
                h.assert(Number(cast.flags[SPELLS].castFromItem.rank) === 3 && Number(cast.flags[SPELLS].castFromItem.dc) === s.dc() && resultsOf(card).some((line) => line.includes(`DC ${s.dc()},`)), `Enthrall at rank 3, its user's DC ${s.dc()} (${JSON.stringify({ flag: cast.flags[SPELLS].castFromItem, results: resultsOf(card) })})`);
                h.assert(s.form().system.badge.value === 7 && /7 charges left/.test(next.content), `7 charges left (${s.form().system.badge.value})`);
                card = next;
                ({ next } = await s.castFrom(card, { pick: enthrall, slot: true }));
                h.assert(Number(s.entry.system.slots.slot3.value) === 0 && s.form().system.badge.value === 6, `a rank 3 slot and 1 charge (${JSON.stringify({ slot: s.user.items.get(s.entry.id).system.slots.slot3, badge: s.form().system.badge.value })})`);
                card = next;
                const mythic = await refusal(api().apply(card.id, { pick: s.pick(card, "Charm", 1), mythic: true, targets: [s.foeToken.uuid] }));
                h.assert(/6 charges left/.test(mythic?.message ?? ""), `rank 10 refused with 6 charges (${mythic?.message ?? "not refused"})`);
                await api().apply(card.id, { pick: -1 });
                await h.until(() => !s.form() && s.weapon().system.damage.die === "d10" && s.weapon()._source.system.runes.potency === 4 && s.weapon()._source.system.runes.property.includes("spellStoring") && !s.weapon().getFlag(h.NS, "staffForm"), `its own form back (${JSON.stringify({ form: Boolean(s.form()), damage: s.weapon().system.damage, runes: s.weapon()._source.system.runes })})`, { timeout: 10000 });
                return { staffStrike: formula, results: resultsOf(card), traits: s.weapon().system.traits.value };
            } finally {
                await closeWindows();
            }
        },

        // Again, with a Mythic Point: Charm at rank 10, its DC at mythic proficiency (level 20 + 10 for its own proficiency bonus), 10 charges and the
        // point — the last charge spent, its own form back.
        async b7SorshenStaffMythic(scene) {
            assertSpells();
            const s = await shifter(scene, "Mythic Shifter", 6);
            // (A character's Mythic Points: a maximum from a rule, as a mythic calling gives one.)
            await s.user.createEmbeddedDocuments("Item", [{ name: "Mythic calling stand-in", type: "effect", system: { duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: [{ key: "ActiveEffectLike", path: "system.resources.mythicPoints.max", mode: "upgrade", value: 3 }] } }]);
            await h.until(() => Number(s.user.system.resources?.mythicPoints?.max) >= 1, `a Mythic Point maximum (${JSON.stringify(s.user.system.resources?.mythicPoints ?? null)})`, { timeout: 5000 });
            await s.user.update({ "system.resources.mythicPoints.value": 1 });
            await h.until(() => Number(s.user.system.resources?.mythicPoints?.value) === 1, `a Mythic Point (${JSON.stringify(s.user.system.resources?.mythicPoints ?? null)})`, { timeout: 5000 });
            try {
                const card = await s.shift();
                const { cast, next } = await s.castFrom(card, { pick: s.pick(card, "Charm", 1), mythic: true });
                h.assert(Number(cast.flags[SPELLS].castFromItem.rank) === 10 && Number(cast.flags[SPELLS].castFromItem.dc) === s.mythicDC() && resultsOf(card).some((line) => line.includes(`DC ${s.mythicDC()}, mythic proficiency`)), `Charm at rank 10, DC ${s.mythicDC()} (${JSON.stringify({ rank: cast.flags[SPELLS].castFromItem.rank, results: resultsOf(card) })})`);
                await h.until(() => Number(s.user.system.resources.mythicPoints.value) === 0, `its Mythic Point spent (${s.user.system.resources.mythicPoints.value})`, { timeout: 8000 });
                await h.until(() => !s.form() && s.weapon().system.damage.die === "d10", `its last charge spent: its own form (${JSON.stringify({ form: Boolean(s.form()), damage: s.weapon().system.damage })})`, { timeout: 10000 });
                h.assert(!next && resultsOf(card).some((line) => /last charge spent/.test(line)), `no card after the last charge (${JSON.stringify(resultsOf(card))})`);
                return { results: resultsOf(card) };
            } finally {
                await closeWindows();
            }
        },

        // Starless Scope: its user casts Fear (rank 1) from a slot at a foe, then the scope's card: Religion (a natural 20) against DC 15, a
        // critical success — +2 to Fear's attacks on its user, −2 to the foe's saves against it, the rank 1 slot given back.
        async b7StarlessScopeBoost(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Scope Seer", { type: "character", x: 10, y: 2, level: 9 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Scope Foe", { x: 12, y: 2, alliance: "opposition", hp: 200 });
            const { entry, spells: [fear] } = await spontaneous(user, "divine", { slot1: 1 }, ["Fear"]);
            const scope = await h.give(user, "Starless Scope");
            await scope.update(held(1));
            await userToken.object?.control?.();
            await h.target(foeToken);
            try {
                const cast = await ownCast(user, entry, fear, 1);
                await h.until(() => Number(user.items.get(entry.id).system.slots.slot1.value) === 0, "the slot spent", { timeout: 5000 });
                let since = Date.now();
                await api().activate(scope.uuid, await activationIndex(scope, (plan) => plan?.builtin === "cast-boost"));
                const card = await h.messageAfter(since, h.itemCard("cast-boost"), { what: "the cast-boost card" });
                h.assert(stateOf(card).cast?.messageId === cast.id && stateOf(card).cast.dc === 15, `Fear its last cast, DC 15 (${JSON.stringify(stateOf(card).cast)})`);
                await h.withDie(20, () => api().apply(card.id, { targets: [foeToken.uuid] }));
                await h.until(() => stateOf(card)?.status === "applied", "the card applied", { timeout: 8000 });
                const bonus = user.itemTypes.effect.find((effect) => (effect._source.system.rules ?? []).some((rule) => rule.selector === "spell-attack-roll" && rule.value === 2 && (rule.predicate ?? []).includes("item:slug:fear")));
                const penalty = foe.itemTypes.effect.find((effect) => (effect._source.system.rules ?? []).some((rule) => rule.selector === "saving-throw" && rule.value === -2 && (rule.predicate ?? []).includes("item:slug:fear")));
                h.assert(stateOf(card).degree === "criticalSuccess" && bonus && penalty, `a critical success: the bonus and the penalty (${JSON.stringify({ degree: stateOf(card).degree, results: resultsOf(card) })})`);
                await h.until(() => Number(user.items.get(entry.id).system.slots.slot1.value) === 1, `the rank 1 slot given back (${JSON.stringify(user.items.get(entry.id).system.slots.slot1)})`, { timeout: 8000 });
                return { results: resultsOf(card) };
            } finally {
                await closeWindows();
            }
        },

        // Its critical failure (a natural 1): Fear lost through the spell module (its cast message flagged), the lens shattered (the scope
        // inert); then a Starless Scope Lens put in from its user's inventory — used up, the scope working again.
        async b7StarlessScopeShatter(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Shatter Seer", { type: "character", x: 10, y: 6, level: 9 });
            const { token: foeToken } = await h.creature(scene, "Shatter Foe", { x: 12, y: 6, alliance: "opposition", hp: 200 });
            const { entry, spells: [fear] } = await spontaneous(user, "divine", { slot1: 1 }, ["Fear"]);
            const scope = await h.give(user, "Starless Scope");
            await scope.update(held(1));
            await userToken.object?.control?.();
            await h.target(foeToken);
            try {
                const cast = await ownCast(user, entry, fear, 1);
                const since = Date.now();
                await api().activate(scope.uuid, await activationIndex(scope, (plan) => plan?.builtin === "cast-boost"));
                const card = await h.messageAfter(since, h.itemCard("cast-boost"), { what: "the cast-boost card" });
                await h.withDie(1, () => api().apply(card.id, { targets: [foeToken.uuid] }));
                await h.until(() => stateOf(card)?.status === "applied", "the card applied", { timeout: 8000 });
                h.assert(stateOf(card).degree === "criticalFailure" && game.messages.get(cast.id)?.getFlag(SPELLS, "spellLost") && user.items.get(scope.id).getFlag(h.NS, "inert"), `Fear lost, the scope inert (${JSON.stringify({ degree: stateOf(card).degree, lost: game.messages.get(cast.id)?.getFlag(SPELLS, "spellLost") ?? null, results: resultsOf(card) })})`);
                const [lens] = await user.createEmbeddedDocuments("Item", [{ name: "Starless Scope Lens", type: "equipment", system: { quantity: 1 } }]);
                await api().apply(card.id, {});
                await h.until(() => !user.items.get(scope.id).getFlag(h.NS, "inert") && !user.items.get(lens.id), `a new lens put in, used up (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return { results: resultsOf(card) };
            } finally {
                await closeWindows();
            }
        },

        // Blessed Reformer: Calm at rank 7 (half its level-14 user's, rounded up) at the one creature targeted — two refused —, a −3 status
        // penalty to that creature's saves against Calm first (the warhammer's 3 damage dice).
        async b7BlessedReformerCalm(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Reformer Champion", { type: "character", x: 14, y: 2, level: 14 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Reformer Foe", { x: 15, y: 2, alliance: "opposition", hp: 300 });
            const { token: otherToken } = await h.creature(scene, "Reformer Other", { x: 15, y: 4, alliance: "opposition", hp: 300 });
            const hammer = await h.give(user, "Blessed Reformer");
            await hammer.update(held(1));
            await userToken.object?.control?.();
            await h.target(foeToken);
            try {
                const index = await activationIndex(hammer, (plan) => plan?.spell?.name === "Calm");
                let since = Date.now();
                await api().activate(hammer.uuid, index);
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the Calm cast card" });
                const two = await refusal(api().apply(card.id, { targets: [foeToken.uuid, otherToken.uuid] }));
                h.assert(/Target up to 1\b/.test(two?.message ?? ""), `two targets refused (${two?.message ?? "not refused"})`);
                since = Date.now();
                await api().apply(card.id, { targets: [foeToken.uuid] });
                const cast = await castMessage(since);
                const penalty = foe.itemTypes.effect.find((effect) => (effect._source.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && rule.selector === "saving-throw" && rule.value === -3));
                h.assert(Number(cast.flags[SPELLS].castFromItem.rank) === 7 && penalty, `Calm at rank 7, the foe's −3 (${JSON.stringify({ rank: cast.flags[SPELLS].castFromItem.rank, effects: foe.itemTypes.effect.map((effect) => [effect.name, (effect._source.system.rules ?? []).map((rule) => rule.value)]), results: resultsOf(card) })})`);
                return { rank: cast.flags[SPELLS].castFromItem.rank, penalty: penalty.name, results: resultsOf(card) };
            } finally {
                await closeWindows();
            }
        },

        // Phoenix Fighting Fan: Quandary cast in an encounter (round 1) at a foe; the cast's Effect on the foe (the spell module's, or a stand-in of
        // that origin when it makes none). Round 2: a Strike with the fan, the end of the turn keeps it; round 3: none, the end of the turn ends it.
        async b7PhoenixFanStrikeSustain(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Fan Dancer", { type: "character", x: 14, y: 8, level: 20 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Fan Foe", { x: 16, y: 8, ac: 1, alliance: "opposition", hp: 900, level: 10 });
            const fan = await h.give(user, "Phoenix Fighting Fan");
            await fan.update(held(1));
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { liveCheckFixture: true } } });
            try {
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
                await combat.startCombat();
                await h.wait(500);
                h.assert(combat.combatant?.actorId === user.id, "the dancer's turn first");
                await userToken.object?.control?.();
                await h.target(foeToken);
                let since = Date.now();
                await api().activate(fan.uuid, await activationIndex(fan, (plan) => plan?.spell?.name === "Quandary"));
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the Quandary cast card" });
                since = Date.now();
                await api().apply(card.id, { targets: [foeToken.uuid] });
                await castMessage(since);
                await h.until(() => user.getFlag(h.NS, "strikeSustain")?.spellUuid, `its user flagged (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                const { spellUuid } = user.getFlag(h.NS, "strikeSustain");
                const ofCast = () => foe.itemTypes.effect.filter((effect) => effect.system?.context?.origin?.item === spellUuid);
                if (!ofCast().length) await foe.createEmbeddedDocuments("Item", [{ name: "Quandary stand-in", type: "effect", system: { duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false }, context: { origin: { actor: user.uuid, item: spellUuid } }, rules: [] } }]);
                h.assert(ofCast().length, "the cast's Effect on the foe");
                await combat.nextTurn();
                await combat.nextTurn();
                await h.wait(500);
                h.assert(combat.round === 2 && combat.combatant?.actorId === user.id && ofCast().length, `round 2, the cast kept (${combat.round}, ${ofCast().length})`);
                const { attack } = await h.strike(user, fan);
                h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a Strike at the foe (${attack.flags.pf2e.context.outcome})`);
                await h.until(() => user.getFlag(h.NS, "strikeSustain")?.struck === 2, `the round's Strike marked (${JSON.stringify(user.getFlag(h.NS, "strikeSustain"))})`, { timeout: 5000 });
                await combat.nextTurn();
                await h.wait(1500);
                h.assert(ofCast().length, "kept by round 2's Strike");
                await combat.nextTurn();
                await h.wait(500);
                h.assert(combat.round === 3 && combat.combatant?.actorId === user.id, `round 3 (${combat.round})`);
                await combat.nextTurn();
                await h.until(() => !ofCast().length && !user.getFlag(h.NS, "strikeSustain"), `ended by round 3 without a Strike (${ofCast().length})`, { timeout: 8000 });
                return { results: resultsOf(card) };
            } finally {
                await combat.delete().catch(() => null);
                await closeWindows();
            }
        },

        // Animate Dreamer: Fear cast from its user's slot, stored in its etched Spell Reservoir (the spell module's store card); Unleash Spell at
        // the foe — the spell module's release at +25 and DC 33, the rune empty. Fear again, stored, then Safe Release: expended harmlessly.
        async b7AnimateDreamerUnleash(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Dreamer Gunner", { type: "character", x: 2, y: 12, level: 15 });
            const { token: foeToken } = await h.creature(scene, "Dreamer Foe", { x: 5, y: 12, alliance: "opposition", hp: 300 });
            const { entry, spells: [fear] } = await spontaneous(user, "occult", { slot1: 2 }, ["Fear"]);
            const gun = await h.give(user, "Animate Dreamer");
            await gun.update(held(2));
            await userToken.object?.control?.();
            await h.target(foeToken);
            const spells = game.modules.get(SPELLS).api;
            const holding = () => spells.itemCasts.reservoirHeld({ actor: user, weapon: user.items.get(gun.id) });
            async function store() {
                const since = Date.now();
                await ownCast(user, entry, fear, 1);
                const offer = await h.messageAfter(since, (message) => message.flags?.[SPELLS]?.reservoir?.spell, { what: "the Spell Reservoir store card", timeout: 10000 });
                await spells.itemCasts.reservoir(offer, "store");
                await h.until(() => holding()?.name === "Fear", `Fear stored (${JSON.stringify(holding())})`, { timeout: 5000 });
            }
            try {
                await store();
                let since = Date.now();
                await api().activate(gun.uuid, await activationIndex(gun, "Unleash Spell"));
                const card = await h.messageAfter(since, h.itemCard("objects"), { what: "the Unleash Spell card" });
                since = Date.now();
                await api().apply(card.id, { targets: [foeToken.uuid] });
                const release = await h.messageAfter(since, (message) => message.flags?.pf2e?.casting && message.item?.name === "Fear", { what: "Fear released", timeout: 10000 });
                const releaser = (user.itemTypes.spellcastingEntry ?? []).find((one) => one.id === release.flags.pf2e.casting.id);
                await h.until(() => !holding(), "the rune empty", { timeout: 5000 });
                h.assert(Number(releaser?.statistic?.dc?.value) === 33 && Number(releaser?.statistic?.check?.mod) === 25, `its +25 and DC 33 (${JSON.stringify({ dc: releaser?.statistic?.dc?.value, attack: releaser?.statistic?.check?.mod, results: resultsOf(card) })})`);
                await store();
                await spells.itemCasts.reservoirExpend({ actor: user, weapon: user.items.get(gun.id) });
                await h.until(() => !holding(), "Safe Release: expended", { timeout: 5000 });
                return { results: resultsOf(card) };
            } finally {
                await closeWindows();
            }
        },

        // Cayden's Tankard's reaction: a foe casts Fear (DC 25) at its user; the tankard's card counteracts it for all its targets (the cast lost)
        // and the spell module casts it again from the foe at the foe alone, at its rank and DC.
        async b7CaydensTankardFearSpell(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Tankard Hero", { type: "character", x: 8, y: 14, level: 20 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Tankard Caster", { x: 10, y: 14, alliance: "opposition", hp: 300, level: 10 });
            const { entry, spells: [fear] } = await npcCaster(foe, "occult", 25, ["Fear"]);
            const tankard = await h.give(user, "Cayden's Tankard");
            await tankard.update(held(1));
            try {
                await h.target(userToken);
                const cast = await ownCast(foe, entry, fear, 1);
                await h.until(() => (game.messages.get(cast.id)?.getFlag(SPELLS, "castTargets") ?? []).includes(user.uuid), `Fear's targets the hero (${JSON.stringify(game.messages.get(cast.id)?.getFlag(SPELLS, "castTargets") ?? null)})`, { timeout: 8000 });
                let since = Date.now();
                await api().activate(tankard.uuid, await activationIndex(tankard, (plan) => plan?.reflect?.to === "creator"));
                const card = await h.messageAfter(since, (message) => message.getFlag(h.NS, "card")?.status === "open", { what: "the tankard's card" });
                since = Date.now();
                await api().apply(card.id, { targets: [] });
                const again = await castMessage(since);
                const flag = again.flags[SPELLS].castFromItem;
                h.assert(game.messages.get(cast.id).getFlag(SPELLS, "spellLost") && again.actor?.id === foe.id && JSON.stringify(flag.targets) === JSON.stringify([foeToken.uuid]) && Number(flag.dc) === 25 && Number(flag.rank) === 1, `Fear lost, cast again at the foe at DC 25 (${JSON.stringify({ lost: game.messages.get(cast.id).getFlag(SPELLS, "spellLost") ?? null, flag, results: resultsOf(card) })})`);
                h.assert(resultsOf(card).some((line) => /Fear counteracted for all its targets, cast again at/.test(line)), `the card's line (${JSON.stringify(resultsOf(card))})`);
                return { results: resultsOf(card), flag };
            } finally {
                await closeWindows();
            }
        },

        // Scale of Igroon's reflection: a foe's Force Barrage (rank 1) at its user, turned at another creature 10 feet from the user (within
        // what's left of its 120 feet); the foe's cast left as it was.
        async b7ScaleOfIgroonReflectSpell(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Igroon Blocker", { type: "character", x: 8, y: 18, level: 20 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Igroon Caster", { x: 12, y: 18, alliance: "opposition", hp: 300, level: 10 });
            const { token: otherToken } = await h.creature(scene, "Igroon Other", { x: 8, y: 20, alliance: "opposition", hp: 300, level: 10 });
            const { entry, spells: [barrage] } = await npcCaster(foe, "arcane", 27, ["Force Barrage"]);
            const scale = await h.give(user, "Scale of Igroon");
            await scale.update(held(1));
            try {
                await h.target(userToken);
                const cast = await ownCast(foe, entry, barrage, 1);
                await h.until(() => (game.messages.get(cast.id)?.getFlag(SPELLS, "castTargets") ?? []).includes(user.uuid), "Force Barrage's targets the blocker", { timeout: 8000 });
                let since = Date.now();
                await api().activate(scale.uuid, await activationIndex(scale, (plan) => plan?.reflect?.to === "chosen"));
                const card = await h.messageAfter(since, (message) => message.getFlag(h.NS, "card")?.status === "open", { what: "the scale's card" });
                since = Date.now();
                await api().apply(card.id, { targets: [otherToken.uuid] });
                const again = await castMessage(since);
                const flag = again.flags[SPELLS].castFromItem;
                h.assert(!game.messages.get(cast.id).getFlag(SPELLS, "spellLost") && again.actor?.id === foe.id && JSON.stringify(flag.targets) === JSON.stringify([otherToken.uuid]) && Number(flag.dc) === 27, `cast again at the other creature at DC 27, the first cast kept (${JSON.stringify({ flag, results: resultsOf(card) })})`);
                h.assert(resultsOf(card).some((line) => /Force Barrage turned at/.test(line)), `the card's line (${JSON.stringify(resultsOf(card))})`);
                return { results: resultsOf(card), flag };
            } finally {
                await closeWindows();
            }
        }
    };
};
