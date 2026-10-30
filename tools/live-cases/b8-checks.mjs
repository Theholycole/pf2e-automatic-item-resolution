// The last three of the 2026-10-29 spell-module rows, live (the user's ask of 2026-10-29): tools/live-check.mjs joins them to its own. h: its
// helpers. The two item spellshapes run as the spell module's own grimoire cases do (its tools/phase23-affliction-verification.mjs
// grimoireShapes): the item posted to the chat arms it, its caster's next spell carries it, and the spell module's save card applies its riders.
// - In the Shadows of Toil: Void Warp from a prepared entry, a failed save — Fatigued for a minute.
// - Tome of Scintillating Sleet: Chilling Spray at two foes — the one that fails Dazzled 3 rounds, the one that critically fails Blinded 1 round
//   and Dazzled after.
// - Dreadsmoke Thurible: its smoke the ability module's zone round its user's space, concealing those inside; it stays where it was swung.

const SPELLS = "pf2e-automatic-resolution";
const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const spellApi = () => game.modules.get(SPELLS)?.api;
    const assertSpells = () => h.assert(spellApi()?.saves?.start && spellApi()?.compile, "The spell module's saves API isn't there.");
    const saveState = (card) => game.messages.get(card.id)?.getFlag(SPELLS, "basicSaveState");
    // A caster with an arcane prepared entry holding these spells (each prepared in a slot of its rank), and the item → { caster, token, spell, item }.
    async function caster(scene, name, { x, y, level, spells, item }) {
        const { actor, token } = await h.creature(scene, name, { type: "character", x, y, level });
        const [entry] = await actor.createEmbeddedDocuments("Item", [{ name: "arcane prepared", type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "prepared" }, proficiency: { value: 2 } } }]);
        const index = await game.packs.get("pf2e.spells-srd").getIndex();
        const sources = [];
        for (const spellName of spells) {
            const row = index.find((one) => one.name === spellName);
            h.assert(row, `${spellName} isn't in PF2e's spells.`);
            const source = (await game.packs.get("pf2e.spells-srd").getDocument(row._id)).toObject();
            delete source._id;
            source.system.location = { value: entry.id };
            sources.push(source);
        }
        const made = await actor.createEmbeddedDocuments("Item", sources);
        const slots = {};
        for (const spell of made) {
            if ((spell.system.traits?.value ?? []).includes("cantrip")) continue;
            const key = `slot${spell.system.level.value}`;
            slots[key] ??= { max: 0, value: 0, prepared: [] };
            slots[key].max += 1;
            slots[key].value += 1;
            slots[key].prepared.push({ id: spell.id, expended: false });
        }
        if (Object.keys(slots).length) await actor.items.get(entry.id).update(Object.fromEntries(Object.entries(slots).map(([key, slot]) => [`system.slots.${key}`, slot])));
        const held = await h.give(actor, item);
        return { actor, token, item: held, spell: (spellName) => made.find((spell) => spell.name === spellName) };
    }
    // The item posted to the chat with its activation picked: the spell module arms it for the caster's next spell.
    async function arm(actor, item) {
        const message = await item.toMessage(null, { create: false });
        const data = message.toObject();
        foundry.utils.setProperty(data, `flags.${SPELLS}.itemShapeChoice`, { activation: 0 });
        await ChatMessage.create(data);
        await h.until(() => actor.itemTypes.effect.find((effect) => effect.flags?.[SPELLS]?.pendingSpellshape?.featUuid === item.uuid), `${item.name} armed (${actor.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 10000 });
        await h.wait(300);
    }
    // The spell cast from its entry (no slot spent) → its cast message, once the spell module has read its shaping.
    async function castNow(actor, spell, rank) {
        const since = Date.now();
        await spell.spellcasting.cast(spell, { rank, consume: false });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.casting && message.actor?.id === actor.id && message.getFlag(SPELLS, "shaping"), { what: `${spell.name}'s cast, shaped`, timeout: 15000 });
    }
    // The spell module's save card at the targets, each target's save rolled and set to its degree, then finalized → the card's state.
    async function settle(actor, spell, rank, cast, degrees) {
        const api = spellApi();
        const result = await api.saves.start(spell, { plan: await api.compile(spell), sourceActor: actor, targets: degrees.map(([token]) => token.object ?? token), castRank: rank, skipConfirmation: true, sourceMessageId: cast.id });
        const card = result?.card ?? result;
        for (const [token, degree] of degrees) {
            const target = saveState(card).targets.find((entry) => entry.tokenUuid === token.uuid || entry.actorUuid === token.actor?.uuid || entry.name === token.name);
            h.assert(target, `${token.name} on the save card (${JSON.stringify(saveState(card).targets.map((entry) => entry.name))})`);
            await api.saves.rollSave(card, target.id, { skipDialog: true });
            await api.saves.correctTarget(card, target.id, { action: "degree", degree });
        }
        await api.saves.finalize(card);
        await h.wait(2500);
        return saveState(card);
    }
    const conditionsOf = (actor) => actor.itemTypes.condition.map((condition) => condition.slug);
    const timeOf = (actor, slug) => actor.itemTypes.effect.filter((effect) => new RegExp(slug, "i").test(effect.name)).map((effect) => `${effect.name}: ${effect.system.duration.value} ${effect.system.duration.unit}`);

    return {
        // In the Shadows of Toil: "If the target fails its saving throw against the spell, it becomes Fatigued for 1 minute." Armed, Void Warp
        // (a prepared spell with a Fortitude save) at a foe that fails: the cast shaped by the grimoire, the foe Fatigued.
        async b8ShadowsOfToilFatigued(scene) {
            assertSpells();
            const c = await caster(scene, "Toil Necromancer", { x: 2, y: 2, level: 13, spells: ["Void Warp"], item: "In the Shadows of Toil" });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Toil Foe", { x: 3, y: 2, alliance: "opposition", hp: 500, save: -30, level: 5 });
            await c.token.object?.control?.();
            await h.target(foeToken);
            await arm(c.actor, c.item);
            const cast = await castNow(c.actor, c.spell("Void Warp"), 7);
            const shaped = cast.getFlag(SPELLS, "shaping")?.shapes?.map((shape) => shape.name) ?? [];
            h.assert(shaped.includes("In the Shadows of Toil"), `the cast shaped by the grimoire (${JSON.stringify(shaped)})`);
            await settle(c.actor, c.spell("Void Warp"), 7, cast, [[foeToken, "failure"]]);
            await h.until(() => foe.hasCondition("fatigued"), `the foe Fatigued (${conditionsOf(foe).join(", ")}; ${foe.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 8000 });
            return { shaped, conditions: conditionsOf(foe), times: timeOf(foe, "fatigued|toil") };
        },

        // Tome of Scintillating Sleet: "all creatures damaged by the spell are also Dazzled for 3 rounds … If an affected creature critically
        // failed its save … it's instead Blinded for 1 round and then dazzled for 3 rounds." Armed, Chilling Spray (cold, Reflex) at two foes:
        // the one that fails takes its damage and is Dazzled; the one that critically fails is Blinded (its attack-roll row left alone: a save
        // spell).
        async b8TomeOfScintillatingSleet(scene) {
            assertSpells();
            const c = await caster(scene, "Sleet Scholar", { x: 2, y: 6, level: 9, spells: ["Chilling Spray"], item: "Tome of Scintillating Sleet" });
            const { actor: failed, token: failedToken } = await h.creature(scene, "Sleet Foe", { x: 3, y: 6, alliance: "opposition", hp: 500, level: 3 });
            const { actor: crit, token: critToken } = await h.creature(scene, "Sleet Crit Foe", { x: 3, y: 7, alliance: "opposition", hp: 500, level: 3 });
            await c.token.object?.control?.();
            await h.target(failedToken, critToken);
            await arm(c.actor, c.item);
            const cast = await castNow(c.actor, c.spell("Chilling Spray"), 1);
            const shaped = cast.getFlag(SPELLS, "shaping")?.shapes?.map((shape) => shape.name) ?? [];
            h.assert(shaped.includes("Tome of Scintillating Sleet"), `the cast shaped by the tome (${JSON.stringify(shaped)})`);
            const before = [failed, crit].map((actor) => Number(actor.system.attributes.hp.value));
            const state = await settle(c.actor, c.spell("Chilling Spray"), 1, cast, [[failedToken, "failure"], [critToken, "criticalFailure"]]);
            const lost = [failed, crit].map((actor, index) => before[index] - Number(actor.system.attributes.hp.value));
            h.assert(lost.every((value) => value > 0), `both damaged (${JSON.stringify(lost)}; ${JSON.stringify(state?.targets?.map((entry) => [entry.name, entry.degree, entry.damageTotal]) ?? null)})`);
            await h.until(() => failed.hasCondition("dazzled") && !failed.hasCondition("blinded"), `the foe that failed Dazzled, not Blinded (${conditionsOf(failed).join(", ")})`, { timeout: 8000 });
            await h.until(() => crit.hasCondition("blinded"), `the foe that critically failed Blinded (${conditionsOf(crit).join(", ")}; ${crit.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 8000 });
            // ("it's instead …": the critically failed one's Effects Blinded 1 round and Dazzled 4, not the damaged creatures' Dazzled 3 too.)
            const critTimes = timeOf(crit, "blinded|dazzled|sleet");
            h.assert(critTimes.length === 2 && critTimes.some((line) => /blinded: 1 round/.test(line)) && critTimes.some((line) => /dazzled: 4 rounds/.test(line)), `instead: Blinded 1 round, Dazzled 4 (${JSON.stringify(critTimes)})`);
            return { shaped, lost, failed: [conditionsOf(failed), timeOf(failed, "dazzled|sleet")], crit: [conditionsOf(crit), critTimes] };
        },

        // Dreadsmoke Thurible: swung, its smoke a 20-foot burst round its user's space (the ability module's zone, concealed inside) for Mist's
        // minute: its user and the ally beside it Concealed, a creature 40 feet off not; its user walks out of it — the smoke stays, its user
        // no longer Concealed, the ally still.
        async b8DreadsmokeThuribleConcealed(scene) {
            return h.unpaused(async () => {
                const { actor: user, token: userToken } = await h.creature(scene, "Thurible Swinger", { type: "character", x: 12, y: 2, level: 9 });
                const { actor: ally, token: allyToken } = await h.creature(scene, "Thurible Ally", { type: "character", x: 13, y: 2, level: 9 });
                const { actor: far } = await h.creature(scene, "Thurible Far", { x: 12, y: 10, alliance: "opposition" });
                const thurible = await h.give(user, "Dreadsmoke Thurible");
                await thurible.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
                await userToken.object?.control?.();
                const smoke = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.zone?.concealed && /Dreadsmoke Thurible/.test(region.name));
                try {
                    await game.modules.get(h.NS).api.live.activate(thurible.uuid, 0);
                    await h.until(() => smoke().length === 1, `the smoke's zone (${scene.regions.map((region) => region.name).join(", ")})`, { timeout: 10000 });
                    const zone = smoke()[0].flags[ABILITY].zone.zone;
                    h.assert(zone.area?.value === 20 && zone.concealed, `a concealing 20-foot area (${JSON.stringify(zone.area)})`);
                    await h.until(() => user.hasCondition("concealed") && ally.hasCondition("concealed"), `its user and the ally Concealed (${conditionsOf(user).join(", ")} / ${conditionsOf(ally).join(", ")})`, { timeout: 8000 });
                    h.assert(!far.hasCondition("concealed"), "the far creature not Concealed");
                    const place = { x: smoke()[0].shapes[0]?.x, y: smoke()[0].shapes[0]?.y };
                    await userToken.update({ x: userToken.x, y: userToken.y + 800 }, { animate: false });
                    await h.until(() => !user.hasCondition("concealed"), `its user out of the smoke, no longer Concealed (${conditionsOf(user).join(", ")})`, { timeout: 8000 });
                    const after = { x: smoke()[0]?.shapes[0]?.x, y: smoke()[0]?.shapes[0]?.y };
                    h.assert(smoke().length === 1 && after.x === place.x && after.y === place.y && ally.hasCondition("concealed"), `the smoke where it was swung, the ally still Concealed (${JSON.stringify({ place, after, ally: conditionsOf(ally) })})`);
                    return { area: zone.area, place };
                } finally {
                    for (const region of smoke()) await region.delete().catch(() => null);
                }
            });
        }
    };
};
