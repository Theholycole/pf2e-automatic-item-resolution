// The spell module's castFromItem changes the item module asks for (2026-10-29, the user's answer to question 8): tools/live-check.mjs joins
// them to its own. h: its helpers. Each cast is the spell module's, from its temporary copy of the spell with the item's changes:
// - Ivory Baton: Dominate at constructs only (castTraits.only), without its mental trait (withoutTraits) — a mindless construct gets its save.
// - Fan of Soothing Winds: the 3-action Heal (actions) in a 30-foot cone (area) with air (addTraits); Heal's own route accepts the changed copy.
// - Gate Attenuator: the chosen element's spell with that element's trait (addTraits: Thunderstrike's metal).
// - Shining Wayfinder: Bless whose aura grows 5 feet a step (growth).
// - Everburning Coal: Wall of Ice made fire (withoutTraits, addTraits, damageType reaching its stated damage).
// - Soulcutter: Weapon Storm's held-weapon dice spirit (damageType).

const SPELLS = "pf2e-automatic-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    // (The spell module's temporary copy of the spell on its caster, made for this cast: its flag names the item's changes.)
    const copyOf = (actor, name) => (actor.itemTypes?.spell ?? []).find((spell) => spell.name === name && String(spell.flags?.[SPELLS]?.itemCastSpell ?? "").includes("#"));
    async function activationIndex(item, name) {
        const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
        const entries = compileActivations({ ...item.toObject(false), uuid: item.uuid });
        // (By its name, or — a function — the first whose plan passes it: Shining Wayfinder's unnamed Bless.)
        const index = typeof name === "function" ? entries.find((entry) => name(entry.plan))?.index : entries.find((entry) => entry.activation?.name === name)?.index;
        h.assert(Number.isInteger(index), `${item.name}'s ${typeof name === "function" ? "cast" : name} activation (${entries.map((entry) => `${entry.activation?.name}: ${entry.plan?.spell?.name ?? entry.plan?.builtin}`).join(", ")})`);
        return index;
    }
    // The item's cast card, applied with these options → { card, cast } (the spell module's cast message).
    async function castThrough(item, index, options = {}) {
        let since = Date.now();
        await api().activate(item.uuid, index);
        const card = await h.messageAfter(since, h.itemCard("cast"), { what: `${item.name}'s cast card` });
        since = Date.now();
        await api().apply(card.id, options);
        const cast = await castMessage(since);
        await h.until(() => /casts /.test(resultsOf(card).join(" ")), `the cast's line (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
        return { card, cast, since };
    }
    // (The windows a cast may leave open: closed, so the next case starts clear.)
    async function closeWindows() {
        for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "DialogV2" || /caster choices|review|Heal/i.test(String(app.title ?? ""))) await app.close().catch(() => null);
    }
    const pressResolve = (cast) => document.querySelector(`[data-message-id="${cast.id}"] .pf2e-auto-runtime-resolve`)?.click();

    return {
        // Magekiller Bullet (src/compiler/cast-curse.js, scripts/cast-curse.js): for a week, whenever its target casts, a flat check (DC 11) and
        // 2d12 force when it's failed. Its sling Strike's hit (AC 1): the target's week-long
        // note Effect with the curse's option; the target then casts a cantrip (the spell module's castFromItem, through PF2e's cast) with every
        // d20 a 5: the flat check failed, 2d12 force applied.
        async b6MagekillerCastCurse(scene) {
            assertSpells();
            const { actor: slinger, token: slingerToken } = await h.creature(scene, "Magekiller Slinger", { type: "character", x: 2, y: 16, level: 16 });
            const { actor: mage, token: mageToken } = await h.creature(scene, "Magekiller Mage", { x: 5, y: 16, ac: 1, hp: 300, alliance: "opposition", level: 10 });
            const sling = await h.give(slinger, "Sling");
            const bullets = await h.give(slinger, "Magekiller Bullet");
            // (Sling bullets: the helper presets arrows for ammunition of no type.)
            await bullets.update({ "system.baseItem": "sling-bullets" });
            await sling.update(held(1));
            let since = Date.now();
            await api().activate(bullets.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the bullet's Strike card" });
            await api().apply(card.id);
            await h.wait(600);
            // (Loaded: the sling's Reload 1 — PF2e's attach, the bullet its subitem, as its sheet's load does.)
            await sling.attach(slinger.items.get(bullets.id), { quantity: 1, stack: true });
            await h.until(() => [...(slinger.items.get(sling.id)?.subitems ?? [])].some((entry) => entry.type === "ammo"), "the bullet loaded in the sling", { timeout: 5000 });
            await slingerToken.object?.control?.();
            await h.target(mageToken);
            const { attack } = await h.withDie(15, () => h.strike(slinger, slinger.items.get(sling.id)));
            h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
            const cursed = () => mage.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.option === "air-cast-curse:11:2d12:force"));
            await h.until(cursed, `the curse's note Effect on the mage (${mage.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 10000 });
            h.assert(cursed().system.duration.value === 7 && cursed().system.duration.unit === "days", `for the week (${JSON.stringify(cursed().system.duration)})`);
            const before = Number(mage.system.attributes.hp.value);
            since = Date.now();
            await h.withDie(5, async () => {
                await game.modules.get(SPELLS).api.castFromItem({ actor: mage, token: mageToken, spell: "Compendium.pf2e.spells-srd.Item.gYjPm7YwGtEa1oxh", targets: [], item: { name: "Magekiller check", uuid: null } });
                await h.until(() => game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && /DC 11 flat check as/.test(String(message.flavor ?? ""))), "the curse's flat check as it casts", { timeout: 10000 });
            });
            const check = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && /DC 11 flat check as/.test(String(message.flavor ?? ""))).at(-1);
            h.assert(/a failure/.test(check.flavor) && Number(check.rolls?.[0]?.total) === 5, `a failed flat check (${check.flavor}; ${check.rolls?.[0]?.total})`);
            await h.until(() => Number(mage.system.attributes.hp.value) < before, `its 2d12 force damage (${mage.system.attributes.hp.value} of ${before})`, { timeout: 10000 });
            return { flat: check.rolls[0].total, lost: before - Number(mage.system.attributes.hp.value) };
        },

        // Ivory Baton: "the effects of Dominate with a DC of 30, but it affects only constructs. It lacks the mental trait and functions on
        // mindless constructs." Targeted at a mindless construct and a human: the human left out, Dominate cast at the construct from a copy
        // without mental, and the spell module's save card at it (the mindless construct not immune).
        async b6IvoryBatonConstructsOnly(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Ivory Commander", { type: "character", x: 2, y: 2, level: 13 });
            const { actor: golem, token: golemToken } = await h.creature(scene, "Ivory Golem", { x: 4, y: 2, alliance: "opposition", hp: 200 });
            const { token: humanToken } = await h.creature(scene, "Ivory Bystander", { x: 4, y: 4, alliance: "opposition", hp: 200 });
            await golem.update({ "system.traits.value": ["construct", "mindless"] });
            const baton = await h.give(user, "Ivory Baton");
            await baton.update(held(1));
            await userToken.object?.control?.();
            try {
                const { card, cast, since } = await castThrough(baton, 0, { targets: [golemToken.uuid, humanToken.uuid] });
                h.assert(resultsOf(card).some((line) => /Ivory Bystander isn't a construct: left out/.test(line)), `the human left out (${JSON.stringify(resultsOf(card))})`);
                const copy = copyOf(user, "Dominate");
                h.assert(copy && !copy.system.traits.value.includes("mental") && /withoutTraits/.test(copy.flags[SPELLS].itemCastSpell), `Dominate's copy without mental (${JSON.stringify(copy?.system?.traits?.value ?? null)})`);
                h.assert(JSON.stringify(cast.flags[SPELLS].castFromItem.targets) === JSON.stringify([golemToken.uuid]), `cast at the construct alone (${JSON.stringify(cast.flags[SPELLS].castFromItem.targets)})`);
                pressResolve(cast);
                const save = await h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.basicSaveState) || /Will/.test(String(message.content ?? "")) && message.id !== cast.id && message.id !== card.id, { what: "the spell module's save card at the golem", timeout: 15000 }).catch(() => null);
                return { traits: copy.system.traits.value, results: resultsOf(card), saveCard: Boolean(save), saveContent: String(save?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200) };
            } finally {
                await closeWindows();
            }
        },

        // Fan of Soothing Winds: "a 3-action Heal spell with an area of a 30-foot cone instead of a 30-foot emanation … This spell gains the air
        // trait." The first beads (rank 4): Heal's copy with air, its area and its 3-action variant's a 30-foot cone, the cast's message saying
        // 3 actions; Resolve on it reaches Heal's area review (its route takes the changed copy, and doesn't ask the actions).
        async b6FanOfSoothingWindsCone(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Fan Healer", { type: "character", x: 2, y: 8, level: 10 });
            const { token: allyToken } = await h.creature(scene, "Fan Patient", { type: "character", x: 4, y: 8, level: 10 });
            const fan = await h.give(user, "Fan of Soothing Winds");
            await fan.update(held(1));
            await userToken.object?.control?.();
            await h.target(allyToken);
            const asked = [];
            const watch = Hooks.on("renderDialogV2", (app) => asked.push(String(app.title ?? app.options?.window?.title ?? "")));
            try {
                const index = await activationIndex(fan, "Healing Wind");
                const { cast } = await castThrough(fan, index, { choice: 0, targets: [allyToken.uuid] });
                const copy = copyOf(user, "Heal");
                const overlays = Object.values(copy?.system?.overlays ?? {}).filter((overlay) => overlay?.system?.area);
                h.assert(copy && copy.system.traits.value.includes("air") && copy.system.area?.type === "cone" && overlays.every((overlay) => overlay.system.area.type === "cone" && overlay.system.area.value === 30), `Heal's copy with air, its areas a 30-foot cone (${JSON.stringify({ traits: copy?.system?.traits?.value, area: copy?.system?.area, overlays: overlays.map((overlay) => overlay.system.area) })})`);
                h.assert(cast.flags[SPELLS].castFromItem.actions === 3, `3 actions on the cast's message (${JSON.stringify(cast.flags[SPELLS].castFromItem)})`);
                const errors = [];
                const notify = ui.notifications.notify.bind(ui.notifications);
                ui.notifications.notify = (text, type, options) => (type === "error" && errors.push(String(text)), notify(text, type, options));
                try {
                    pressResolve(cast);
                    await h.until(() => asked.some((title) => /review emanation targets|Heal — confirm|place/i.test(title)) || errors.length || canvas.templates?.preview?.children?.length || [...foundry.applications.instances.values()].some((app) => /Heal/.test(String(app.title ?? ""))), `Heal's area review or its placement (${JSON.stringify(asked)}; errors ${JSON.stringify(errors)})`, { timeout: 10000 }).catch(() => null);
                } finally {
                    ui.notifications.notify = notify;
                }
                h.assert(!errors.some((text) => /differs from the verified|casting actions/i.test(text)) && !asked.some((title) => /casting actions/i.test(title)), `Heal's route took the copy without asking its actions (${JSON.stringify({ errors, asked })})`);
                return { traits: copy.system.traits.value, area: copy.system.area, asked, errors };
            } finally {
                Hooks.off("renderDialogV2", watch);
                await closeWindows();
                await canvas.templates?.clearPreviewContainer?.();
            }
        },

        // Gate Attenuator: "it gains that element's trait if it doesn't already have it" — attuned to metal, Thunderstrike: its copy with metal.
        async b6GateAttenuatorMetal(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Gate Attuner", { type: "character", x: 2, y: 12, level: 4 });
            const { token: foeToken } = await h.creature(scene, "Gate Foe", { x: 5, y: 12, alliance: "opposition", hp: 100 });
            const gate = await h.give(user, "Gate Attenuator");
            await gate.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await userToken.object?.control?.();
            try {
                const index = await activationIndex(gate, "Elemental Spell");
                const probe = Date.now();
                await api().activate(gate.uuid, index);
                const first = await h.messageAfter(probe, h.itemCard("cast"), { what: "the attenuator's cast card" });
                const metal = (stateOf(first).plan.choices ?? []).findIndex((choice) => choice.element === "metal");
                h.assert(metal >= 0 && stateOf(first).plan.choices[metal].spell.name === "Thunderstrike", `Thunderstrike its metal choice (${JSON.stringify((stateOf(first).plan.choices ?? []).map((choice) => [choice.spell.name, choice.element]))})`);
                const since = Date.now();
                await api().apply(first.id, { choice: metal, targets: [foeToken.uuid] });
                await castMessage(since);
                const copy = copyOf(user, "Thunderstrike");
                h.assert(copy && copy.system.traits.value.includes("metal"), `Thunderstrike's copy with metal (${JSON.stringify(copy?.system?.traits?.value ?? null)})`);
                return { traits: copy.system.traits.value };
            } finally {
                await closeWindows();
            }
        },

        // Shining Wayfinder: Bless "with an emanation centered on itself. Once per turn, you can use a single action, which has the concentrate
        // trait, to increase the emanation's radius by 5 feet." Cast and resolved: the Bless Effect's aura 10 + 5 per step (15 feet at the start).
        async b6WayfinderBlessGrowth(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Wayfinder Bearer", { type: "character", x: 10, y: 2, level: 4 });
            const { token: allyToken } = await h.creature(scene, "Wayfinder Ally", { type: "character", x: 11, y: 2, level: 4 });
            const wayfinder = await h.give(user, "Shining Wayfinder");
            await wayfinder.update(held(1));
            await userToken.object?.control?.();
            await h.target(allyToken);
            try {
                const index = await activationIndex(wayfinder, (plan) => plan?.spell?.name === "Bless");
                const { cast } = await castThrough(wayfinder, index, { targets: [allyToken.uuid] });
                h.assert(cast.flags[SPELLS].castFromItem.growth?.feet === 5, `growth 5 on the cast's message (${JSON.stringify(cast.flags[SPELLS].castFromItem)})`);
                const bless = () => user.itemTypes.effect.find((effect) => /Bless/.test(effect.name) && (effect.system.rules ?? []).some((rule) => rule.key === "Aura"));
                for (const end = Date.now() + 15000; Date.now() < end && !bless(); ) {
                    pressResolve(cast);
                    await h.wait(500);
                }
                h.assert(bless(), `the Bless Effect (${user.itemTypes.effect.map((effect) => effect.name).join(", ")})`);
                const aura = bless().system.rules.find((rule) => rule.key === "Aura");
                h.assert(aura.radius === "10 + @item.badge.value * 5", `its aura 10 + 5 a step (${aura.radius})`);
                return { radius: aura.radius };
            } finally {
                await closeWindows();
            }
        },

        // Everburning Coal's Coal Wall: Wall of Ice with "the fire trait instead of cold and water … deals fire damage instead of cold damage":
        // its copy fire, not cold or water; the spell module's plan for the copy its wall's damage fire.
        async b6CoalWallFire(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Coal Mason", { type: "character", x: 10, y: 8, level: 12 });
            const coal = await h.give(user, "Everburning Coal");
            await coal.update(held(1));
            await userToken.object?.control?.();
            await h.target();
            try {
                const index = await activationIndex(coal, "Coal Wall");
                const { card } = await castThrough(coal, index, { targets: [] });
                const copy = copyOf(user, "Wall of Ice");
                const traits = copy?.system?.traits?.value ?? [];
                h.assert(copy && traits.includes("fire") && !traits.includes("cold") && !traits.includes("water"), `Wall of Ice's copy fire, not cold or water (${JSON.stringify(traits)})`);
                const plan = await game.modules.get(SPELLS).api.compile(copy);
                const control = plan?.resolution?.damagingWall?.control ?? null;
                h.assert(control?.type === "fire", `its wall's damage fire (${JSON.stringify(control)})`);
                h.assert(resultsOf(card).length && copy.system.damage[Object.keys(copy.system.damage)[0]].type === "fire", `its damage data fire (${JSON.stringify(copy.system.damage)})`);
                return { traits, control };
            } finally {
                await closeWindows();
            }
        },

        // Soulcutter's Soulcutting Storm: Weapon Storm at 7th rank, "all damage caused by the spell is spirit damage" — the save card's held-weapon
        // dice spirit.
        async b6SoulcutterSpiritStorm(scene) {
            assertSpells();
            const { actor: user, token: userToken } = await h.creature(scene, "Soulcutter Wielder", { type: "character", x: 14, y: 2, level: 14 });
            const { token: foeToken } = await h.creature(scene, "Soulcutter Foe", { x: 15, y: 2, alliance: "opposition", hp: 400 });
            const blade = await h.give(user, "Soulcutter");
            await blade.update({ ...held(2), "system.equipped.invested": true });
            await userToken.object?.control?.();
            await h.target(foeToken);
            try {
                const index = await activationIndex(blade, "Soulcutting Storm");
                const { cast, since } = await castThrough(blade, index, { targets: [foeToken.uuid] });
                const saveCard = () => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && message.flags?.[SPELLS]?.basicSaveState).at(-1) ?? null;
                for (const end = Date.now() + 15000; Date.now() < end && !saveCard(); ) {
                    pressResolve(cast);
                    const choices = [...document.querySelectorAll(".application, .dialog, .window-app")].find((entry) => /caster choices/i.test(entry.querySelector(".window-title")?.textContent ?? ""));
                    choices?.querySelector('button[data-action="apply"]')?.click();
                    await h.wait(500);
                }
                const formula = String(saveCard()?.flags?.[SPELLS]?.basicSaveState?.weaponDamage?.formula ?? "");
                h.assert(/\[spirit\]$/.test(formula), `Weapon Storm's held-weapon dice spirit (${formula || "no save card"})`);
                return { formula };
            } finally {
                await closeWindows();
            }
        }
    };
};
