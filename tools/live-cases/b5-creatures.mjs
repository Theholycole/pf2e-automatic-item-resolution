// The fifth batch's creatures group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// (docs/mechanics.md "The installed modules' creatures, lasting effects and choices". Only the items whose live play is new code have a case:
// - Medicinal Hotpot (Lesser): an Effect's extra healing counted down (scripts/healing-uses.js on the core's damage listener, src/live/healing-uses.js).
// - Instinct Crown (Rune): a property rune refused when its user isn't raging, its Effect flagged untilRage and gone with the Rage (scripts/live.js
//   rune.untilRage, src/live/card.js runeEffectSource), its choices by its user's level (src/compiler/property-runes.js).
// - Instinct Crown (Untamed): the creature targeted gets Effect: Rage and then Quickened until that Rage ends (item.untilRage on a "targets" card).
// - Rumbustious Robes' Pocket Full of Chaos: two more rolls with a further 20 ignored (scripts/table.js table.rolls / table.ignore), places traded
//   (item.swapPlaces, scripts/swap.js tradePlaces), a cast's rolled duration (scripts/cast-duration.js castDuration.valueRoll), a rolled count of
//   creatures (the ability module's summon card, reached from this module's conjure route).
// - Barnacle Tree Seed: the summon card's options (plan.options), reached from this module's conjure route.
// - Food of the Gods: PF2e's ActiveEffectLike add-then-upgrade on an attribute modifier (a rule shape no other item of the module has), until rest.
// The group's other asked-for checks feed mechanisms already live-checked: Phantasm Plug (a snare-centred zone with saves as it's made and at
// turns' ends for some traits only — sanctifiedBeans, censerSmoke —, the gated escalating save-ends — saveEndsGearbinder —, the immunity tracker
// — poisonFizzBlindOnce), Cloud Giant Bean (PF2e's own action card — the item-action cases — and a userEffects "rules" Effect with a toggle —
// b4G1StarlessScopeStarlight).)

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
const ALCHEMISTS = "pf2e-team-plus-alchemists.pf2e-items";
const BARBARIANS = "pf2e-team-plus-barbarians.items";
const MAGIC = "pf2e-team-plus-magic.items";
// (PF2e's Effect: Rage, slug effect-rage.)
const RAGE = "Compendium.pf2e.feat-effects.Item.z3uyCMBddrPK5umr";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionSlugs = (actor) => actor.itemTypes.condition.map((condition) => condition.slug).join(", ") || "none";
    const traitsOf = (actor) => [...(actor?.system?.traits?.value ?? [])];
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const strikeOf = (actor, weapon) => (actor.system.actions ?? []).find((action) => action.item?.id === weapon.id);
    const raging = (actor) => actor.itemTypes.effect.find((effect) => effect.slug === "effect-rage" || effect.name === "Effect: Rage");
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");

    // An activation's card: the item activated, the first card of that kind after it.
    async function activated(item, index, kind, what) {
        const since = Date.now();
        await api().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
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
    // (The squares around one, for h.clearSquares: a conjured creature goes in the first free ring around its maker.)
    const around = (x, y, reach = 2) => {
        const squares = [];
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (x + dx >= 0 && y + dy >= 0 && x + dx < 20 && y + dy < 20) squares.push([x + dx, y + dy]);
        return squares;
    };
    // (The ability module's conjured tokens a maker's token made — its flag conjured { itemUuid, itemName, sourceTokenUuid } — on the lab.)
    const conjuredBy = (scene, makerToken, test = () => true) => scene.tokens.filter((token) => {
        const conjured = token.actor?.flags?.[ABILITY]?.conjured;
        return Boolean(conjured) && conjured.sourceTokenUuid === makerToken.uuid && test(conjured);
    });
    // (This case's own only: the runner's cleanup doesn't know the conjured tokens and world actors, which carry the bestiary's flags.)
    async function dismissConjured(scene, makerToken) {
        const tokens = conjuredBy(scene, makerToken);
        if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens.map((token) => token.id)).catch(() => null);
        const actors = game.actors.filter((actor) => actor.flags?.[ABILITY]?.conjured?.sourceTokenUuid === makerToken.uuid);
        if (actors.length) await Actor.deleteDocuments(actors.map((actor) => actor.id)).catch(() => null);
    }
    // (The ability module's summon card — its GM's choice before the creatures come, scripts/conjure.js summonCard — of an item by its name.)
    const summonCardAfter = (since, name) => h.messageAfter(since, (message) => Boolean(message.flags?.[ABILITY]?.summonCard) && name.test(String(message.flags[ABILITY].summonCard.itemName ?? "")), { what: "the ability module's summon card", timeout: 10000 });
    const summonState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.summonCard;
    // (Its button pressed, as the GM's click does: the chat card's own listener.)
    async function pressSummon(message, action) {
        let button = null;
        for (const stop = Date.now() + 8000; Date.now() < stop && !button; ) {
            button = document.querySelector(`[data-message-id="${message.id}"] button[data-summon="${action}"]`);
            if (!button) await h.wait(200);
        }
        h.assert(button, `the summon card's ${action} button`);
        button.click();
    }
    // (The ability module's conjure card for an actor it made: its "Lasts …" and the plan's notes as its lines.)
    const conjureCardFor = (since, actorId) => h.messageAfter(since, (message) => (message.flags?.[ABILITY]?.conjureCard?.actorIds ?? []).includes(actorId), { what: "the conjure card", timeout: 10000 });

    // PF2e's ChoiceSet prompt (its PickAThingPrompt) open now: answered with its first choice, as a click on it does. → the value, or null.
    // (Not its rendered flag: in a hidden browser its frame is never drawn — the lead's run of 2026-10-27; tools/live-cases/senses.mjs's.)
    const promptOpen = () => [...foundry.applications.instances.values()].find((app) => Array.isArray(app.choices) && typeof app.resolveSelection === "function" && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    async function answerPrompt() {
        const app = promptOpen();
        if (!app) return null;
        const choice = app.choices[0] ?? null;
        app.selection = choice;
        await app.close();
        return String(choice?.value ?? "(none)");
    }
    // The spell module's cast card applied (its Resolve, its caster-choices dialog as it stands, its "— Apply Effect" confirmation, PF2e's
    // ChoiceSet prompts) until test passes — tools/live-cases/senses.mjs's resolveSpellCard. → the prompts' values picked.
    async function resolveSpellCard(cast, test, { timeout = 15000 } = {}) {
        const answered = [];
        const clicked = new Set();
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            if (test()) return answered;
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
            const value = await answerPrompt();
            if (value !== null) answered.push(value);
            await h.wait(200);
        }
        throw new Error(`Not the spell's Effect within ${timeout / 1000} seconds (Resolve ${clicked.has("resolve") ? "pressed" : "never there"}; prompts answered: ${answered.join(", ") || "none"}).`);
    }
    // The windows a cast may leave open (its caster choices, a confirmation, a ChoiceSet prompt): closed, as an open one fails the next case.
    async function closeWindows(pattern) {
        for (const app of [...foundry.applications.instances.values()]) {
            const title = String(app.title ?? app.options?.window?.title ?? "");
            if (pattern.test(title) || /caster choices/i.test(title) || (Array.isArray(app.choices) && typeof app.resolveSelection === "function")) await app.close().catch(() => null);
        }
    }

    return {
        // Medicinal Hotpot (Lesser) (src/compiler/creatures-group.js; scripts/healing-uses.js on the core's applyDamage listener): eaten, its user
        // gets 1d6 + 1 more each time it's healed, three times at most, for a day or until its next daily preparations. The card's Apply puts the
        // "Medicinal Hotpot" Effect on its eater (an NPC at 3 of 50 Hit Points): PF2e's healing-received DamageDice 1d6 and FlatModifier +1, its
        // flag healingUses 3, untilRest. Healed 6 three times (PF2e's applyDamage with −6, as the chat's heal button does): each time PF2e rolls
        // the 1d6 in the chat ("Medicinal Hotpot") and the eater gains 6 + that + 1; the chat says 2 uses left, then 1, then used up, and after the
        // third the Effect is deleted. A fourth healing of 6 gains 6 alone, no 1d6. Another hotpot eaten, PF2e's Rest for the Night (its hook) deletes it.
        async b5CreaturesHotpotHealings(scene) {
            const { actor: eater, token: eaterToken } = await h.creature(scene, "Hotpot Eater", { x: 2, y: 2, hp: 3 });
            const hotpot = () => eater.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.ruleEffect === "Medicinal Hotpot");
            const eat = async (what) => {
                const pot = await h.give(eater, "Medicinal Hotpot (Lesser)", ALCHEMISTS);
                const since = Date.now();
                await pot.consume();
                const card = await h.messageAfter(since, h.itemCard("item"), { what });
                const at = (stateOf(card).drinkers ?? []).findIndex((entry) => entry.actorUuid === eater.uuid);
                h.assert(at >= 0, `the eater offered (${JSON.stringify(stateOf(card).drinkers)})`);
                await api().apply(card.id, { drinker: at });
                await h.until(() => hotpot(), `the hotpot's Effect on its eater (${effectNames(eater)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return card;
            };
            const card = await eat("the hotpot's card");
            const rules = hotpot().system.rules ?? [];
            const flags = hotpot().flags[h.NS];
            h.assert(rules.some((rule) => rule.key === "DamageDice" && [].concat(rule.selector).includes("healing-received") && rule.dieSize === "d6" && Number(rule.diceNumber) === 1), `PF2e's 1d6 on its healing received (${JSON.stringify(rules)})`);
            h.assert(rules.some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("healing-received") && Number(rule.value) === 1), `+1 on its healing received (${JSON.stringify(rules)})`);
            h.assert(Number(flags.healingUses) === 3 && flags.untilRest === true, `3 uses, until its next rest (${JSON.stringify(flags)})`);
            const heals = [];
            for (const [index, left] of [2, 1, 0].entries()) {
                const before = hp(eater);
                const since = Date.now();
                await eater.applyDamage({ damage: -6, token: eaterToken });
                const die = await h.messageAfter(since, (message) => /Medicinal Hotpot/.test(String(message.flavor ?? "")) && message.rolls?.length, { what: `PF2e's 1d6 for the hotpot (healing ${index + 1})` });
                const extra = Number(die.rolls[0].total);
                h.assert(extra >= 1 && extra <= 6, `a d6 (${extra})`);
                await h.until(() => hp(eater) === before + 6 + extra + 1, `healed 6 + ${extra} + 1 (${before} → ${hp(eater)})`, { timeout: 8000 });
                const words = left ? new RegExp(`extra healing has ${left} uses? left`) : /extra healing is used up/;
                await h.messageAfter(since, (message) => /Medicinal Hotpot/.test(message.content ?? "") && words.test(textOf(message)), { what: `the chat's line after healing ${index + 1} (${left} left)` });
                if (left) await h.until(() => Number(hotpot()?.flags?.[h.NS]?.healingUses) === left, `${left} uses left on the Effect (${JSON.stringify(hotpot()?.flags?.[h.NS])})`, { timeout: 5000 });
                heals.push({ before, extra, after: hp(eater) });
            }
            await h.until(() => !hotpot(), `the hotpot's Effect deleted after its third healing (${effectNames(eater)})`, { timeout: 8000 });
            const fourth = hp(eater);
            const since = Date.now();
            await eater.applyDamage({ damage: -6, token: eaterToken });
            await h.until(() => hp(eater) === fourth + 6, `a fourth healing of 6 alone (${fourth} → ${hp(eater)})`, { timeout: 8000 });
            await h.wait(800);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && /Medicinal Hotpot/.test(String(message.flavor ?? ""))), "no 1d6 on the fourth healing");
            // (Another, then the next rest: gone.)
            await eat("the second hotpot's card");
            Hooks.callAll("pf2e.restForTheNight", eater);
            await h.until(() => !hotpot(), `the second hotpot's Effect gone at its rest (${effectNames(eater)})`, { timeout: 8000 });
            return { heals, fourth: [fourth, hp(eater)], results: resultsOf(card) };
        },

        // Instinct Crown (Rune)'s second activation (creatures-group.js; scripts/live.js rune.untilRage; src/compiler/property-runes.js): its user
        // lends a weapon it wields a common property rune of its own level or lower while it rages. A level-10 raging fixture with a held
        // longsword: the card offers the longsword and the runes up to level 10 (Flaming and Impactful, not Holy nor Greater Flaming); Flaming picked,
        // its Effect (PF2e's AdjustStrike adding "flaming" to the longsword) flagged untilRage, and the longsword's damage roll (no message) has fire
        // in it. Its Effect: Rage deleted: the rune's Effect goes too. Activated again while not raging: the card's line "isn't raging: no Flaming
        // rune", and no Effect.
        async b5CreaturesRuneCrownRage(scene) {
            const { actor: barbarian } = await h.creature(scene, "Rune Crown Barbarian", { type: "character", x: 2, y: 5, level: 10 });
            const sword = await h.give(barbarian, "Longsword");
            await sword.update(held(1));
            await h.until(() => strikeOf(barbarian, sword), "a Strike with the longsword", { timeout: 5000 });
            const crown = await h.give(barbarian, "Instinct Crown (Rune)", BARBARIANS);
            const rage = await rageOn(barbarian);
            const card = await activated(crown, 1, "item", "the crown's rune card");
            const lent = stateOf(card).plan.item?.rune;
            const names = (lent?.choices ?? []).map((choice) => choice.name);
            h.assert(lent?.untilRage === true, `its rune while raging (${JSON.stringify(lent)})`);
            h.assert(names.includes("Flaming") && names.includes("Impactful") && !names.includes("Holy") && !names.includes("Greater Flaming"), `the runes up to level 10 (${names.join(", ")})`);
            const weaponAt = (stateOf(card).weapons ?? []).findIndex((weapon) => weapon.id === sword.id);
            h.assert(weaponAt >= 0, `the longsword offered (${JSON.stringify(stateOf(card).weapons)})`);
            const flaming = names.indexOf("Flaming");
            await api().apply(card.id, { runeWeapon: weaponAt, runeChoice: flaming });
            const runeEffect = () => barbarian.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.rune === "flaming" && effect.flags[h.NS].weaponId === sword.id);
            await h.until(() => runeEffect(), `the Flaming rune's Effect on the longsword (${effectNames(barbarian)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(runeEffect().flags[h.NS].untilRage === true, `flagged untilRage (${JSON.stringify(runeEffect().flags[h.NS])})`);
            h.assert((runeEffect().system.rules ?? []).some((rule) => rule.key === "AdjustStrike" && rule.value === "flaming"), `PF2e's AdjustStrike adding flaming (${JSON.stringify(runeEffect().system.rules)})`);
            // (Its types read off PF2e's own damage roll, no message: the readable formula drops them.)
            let types = [];
            for (let tries = 0; tries < 4 && !types.includes("fire"); tries++) {
                if (tries) await h.wait(500);
                const roll = await strikeOf(barbarian, sword).damage({ event: h.shift(), createMessage: false });
                types = (roll?.instances ?? []).map((instance) => instance.type);
            }
            h.assert(types.includes("fire"), `fire on the longsword's damage (${types.join(", ")})`);
            await rage.delete();
            await h.until(() => !runeEffect(), `the rune's Effect gone with the Rage (${effectNames(barbarian)})`, { timeout: 8000 });
            // (Not raging: refused on the card.)
            const calm = await activated(crown, 1, "item", "the crown's second rune card");
            await api().apply(calm.id, { runeWeapon: Math.max(0, (stateOf(calm).weapons ?? []).findIndex((weapon) => weapon.id === sword.id)), runeChoice: flaming });
            await h.until(() => resultsOf(calm).length, "the second card's lines", { timeout: 8000 });
            h.assert(resultsOf(calm).some((line) => /isn't raging: no Flaming rune/.test(line)), `its refusal line (${JSON.stringify(resultsOf(calm))})`);
            await h.wait(500);
            h.assert(!runeEffect(), `no rune Effect while not raging (${effectNames(barbarian)})`);
            return { runes: names.length, types, results: resultsOf(card), refused: resultsOf(calm) };
        },

        // Instinct Crown (Untamed)'s second activation (creatures-group.js; item.untilRage on a card for the creatures targeted, scripts/live.js
        // applyToRecipient): its user's animal companion Rages and is Quickened until that rage ends. Targeted at the companion (an NPC beside a
        // level-10 fixture), Apply gives the companion PF2e's Effect: Rage first — so the untilRage step finds it raging — then the Effect granting
        // Quickened, flagged untilRage, and the "Untamed rage" note Effect; no "isn't raging" line, and its user doesn't Rage. The companion's
        // Effect: Rage deleted: Quickened and its Effect go.
        async b5CreaturesUntamedCompanionRage(scene) {
            const { actor: master } = await h.creature(scene, "Untamed Crown Master", { type: "character", x: 2, y: 8, level: 10 });
            const { actor: companion, token: companionToken } = await h.creature(scene, "Untamed Companion", { x: 3, y: 8, level: 9 });
            const crown = await h.give(master, "Instinct Crown (Untamed)", BARBARIANS);
            const card = await activated(crown, 1, "item", "the crown's card");
            h.assert(stateOf(card).plan.item?.recipient === "targets" && (stateOf(card).plan.item?.untilRage?.conditions ?? []).some((entry) => entry.slug === "quickened"), `for the creature targeted, Quickened until the rage ends (${JSON.stringify(stateOf(card).plan.item?.untilRage)})`);
            await api().apply(card.id, { targets: [companionToken.uuid] });
            const quick = () => companion.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.untilRage);
            await h.until(() => raging(companion) && quick() && companion.hasCondition("quickened"), `the companion raging and Quickened (${effectNames(companion)}; ${conditionSlugs(companion)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            await h.until(() => resultsOf(card).length, "the card's lines", { timeout: 5000 });
            h.assert(!resultsOf(card).some((line) => /isn't raging/.test(line)), `the Rage came before the untilRage step (${JSON.stringify(resultsOf(card))})`);
            h.assert(companion.itemTypes.effect.some((effect) => effect.flags?.[h.NS]?.ruleEffect === "Untamed rage"), `its "Untamed rage" note Effect (${effectNames(companion)})`);
            h.assert(!raging(master), `its user doesn't Rage (${effectNames(master)})`);
            await raging(companion).delete();
            await h.until(() => !quick() && !companion.hasCondition("quickened"), `Quickened gone with the companion's Rage (${effectNames(companion)}; ${conditionSlugs(companion)})`, { timeout: 8000 });
            return { results: resultsOf(card), companion: effectNames(companion) };
        },

        // Rumbustious Robes' Pocket Full of Chaos (creatures-group.js; scripts/table.js table.rolls, table.ignore): its d20 table's 20 is two
        // more rolls, their rows in order, any further 20 ignored. The table card applied at 20: "20: …" and "Its card follows.", and a second
        // table card for those rolls (rolls 2, ignore [20]). That card applied with its first roll given as 20 and every die at 10 after it:
        // "20: ignored.", "10: …", "Its card follows." — and row 10's own card posted.
        async b5CreaturesChaosTwentyRollsTwice(scene) {
            const { actor: wearer } = await h.creature(scene, "Chaos Robe Wearer", { type: "character", x: 2, y: 11, level: 16 });
            const robes = await h.give(wearer, "Rumbustious Robes", MAGIC);
            const table = await activated(robes, 1, "table", "the chaos table card");
            const plan = stateOf(table).plan.table;
            h.assert(plan.die === "1d20" && (plan.rows ?? []).length === 20, `its d20 table, 20 rows (${plan.die}, ${(plan.rows ?? []).length})`);
            let since = Date.now();
            await api().apply(table.id, { total: 20 });
            const again = await h.messageAfter(since, (message) => h.itemCard("table")(message) && message.id !== table.id, { what: "the 20's own table card", timeout: 10000 });
            await h.until(() => resultsOf(table).length >= 2, "the first card's lines", { timeout: 8000 });
            h.assert(/^20: /.test(resultsOf(table)[0] ?? "") && resultsOf(table).includes("Its card follows."), `its 20 and the card following (${JSON.stringify(resultsOf(table))})`);
            const twice = stateOf(again).plan.table;
            h.assert(Number(twice.rolls) === 2 && (twice.ignore ?? []).map(Number).includes(20) && (twice.rows ?? []).length === 20, `two rolls, 20s ignored (${JSON.stringify({ rolls: twice.rolls, ignore: twice.ignore, rows: (twice.rows ?? []).length })})`);
            since = Date.now();
            await h.withDie(10, () => api().apply(again.id, { total: 20 }));
            await h.until(() => resultsOf(again).length >= 3, "the second card's lines", { timeout: 8000 });
            const lines = resultsOf(again);
            h.assert(lines[0] === "20: ignored." && /^10: /.test(lines[1] ?? "") && lines[2] === "Its card follows.", `a 20 ignored, then the 10's row (${JSON.stringify(lines)})`);
            h.assert(Number(stateOf(again).rolled) === 10, `its last roll 10 (${stateOf(again).rolled})`);
            const ten = await h.messageAfter(since, (message) => Boolean(message.getFlag(h.NS, "card")) && message.id !== again.id && /\(10\)$/.test(String(message.getFlag(h.NS, "card")?.item?.name ?? "")), { what: "row 10's own card" });
            return { first: resultsOf(table), second: lines, tenCard: ten.getFlag(h.NS, "card").kind };
        },

        // Rumbustious Robes' row 2 (item.swapPlaces; scripts/swap.js tradePlaces from scripts/live.js applyToRecipient): its user and the creature
        // targeted trade places. The table card applied at 2: row 2's card (for the creature targeted). Its Apply with none targeted is refused
        // (the card stays open); with the foe 20 feet off targeted, the two tokens trade squares (Foundry's teleport) and the card says so.
        async b5CreaturesChaosSwapPlaces(scene) {
            await h.clearSquares(scene, [[2, 14], [6, 14]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Chaos Swapper", { type: "character", x: 2, y: 14, level: 16 });
            const { token: foeToken } = await h.creature(scene, "Chaos Swap Target", { x: 6, y: 14, alliance: "opposition" });
            const robes = await h.give(wearer, "Rumbustious Robes", MAGIC);
            const table = await activated(robes, 1, "table", "the chaos table card");
            const since = Date.now();
            await api().apply(table.id, { total: 2 });
            const row = await h.messageAfter(since, (message) => h.itemCard("item")(message) && Boolean(stateOf(message)?.plan?.item?.swapPlaces), { what: "row 2's card", timeout: 10000 });
            const refused = await api().apply(row.id, {}).then(() => null, (error) => String(error?.message ?? error));
            h.assert(/Target the creatures/.test(refused ?? "") && stateOf(row).status === "open", `refused with none targeted (${refused}; ${stateOf(row).status})`);
            const at = (token) => ({ x: scene.tokens.get(token.id)?.x, y: scene.tokens.get(token.id)?.y });
            const was = { wearer: at(wearerToken), foe: at(foeToken) };
            await api().apply(row.id, { targets: [foeToken.uuid] });
            await h.until(() => at(wearerToken).x === was.foe.x && at(wearerToken).y === was.foe.y && at(foeToken).x === was.wearer.x && at(foeToken).y === was.wearer.y, `places traded (${JSON.stringify({ was, wearer: at(wearerToken), foe: at(foeToken) })})`, { timeout: 8000 });
            await h.until(() => resultsOf(row).length, "the row's lines", { timeout: 5000 });
            h.assert(resultsOf(row).some((line) => /trade places$/.test(line)), `its line (${JSON.stringify(resultsOf(row))})`);
            return { was, now: { wearer: at(wearerToken), foe: at(foeToken) }, results: resultsOf(row) };
        },

        // Rumbustious Robes' row 4 (creatures-group.js count { formula: "1d12" }; this module's conjure route, the ability module's startConjure and
        // summon card): 1d12 mice for a minute. The table card applied at 4: the GM's summon card with the 1d12 rolled (its line "1d12 rolled: N.")
        // and N buttons "Summon N" … "Summon 1", then "Not now". "Summon 1" pressed: one Mouse beside its user, a minion, and the card used.
        async b5CreaturesChaosMiceCount(scene) {
            await h.clearSquares(scene, around(10, 2));
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Chaos Mouse Keeper", { type: "character", x: 10, y: 2, level: 16 });
            const robes = await h.give(wearer, "Rumbustious Robes", MAGIC);
            const made = () => conjuredBy(scene, wearerToken, (conjured) => /Rumbustious Robes/.test(conjured.itemName ?? ""));
            try {
                const table = await activated(robes, 1, "table", "the chaos table card");
                let since = Date.now();
                await api().apply(table.id, { total: 4 });
                const summon = await summonCardAfter(since, /Rumbustious Robes/);
                const card = summonState(summon);
                const rolled = Number(card.rolled);
                h.assert(rolled >= 1 && rolled <= 12, `1d12 rolled (${card.rolled})`);
                const counts = (card.buttons ?? []).filter(([action]) => String(action).startsWith("count:")).map(([action]) => Number(String(action).slice(6)));
                h.assert(counts.length === rolled && counts[0] === rolled && counts.at(-1) === 1 && (card.buttons ?? []).some(([action]) => action === "decline"), `${rolled} to 1 offered, and Not now (${JSON.stringify(card.buttons)})`);
                h.assert((card.lines ?? []).some((line) => line === `1d12 rolled: ${rolled}.`), `its rolled line (${JSON.stringify(card.lines)})`);
                since = Date.now();
                await pressSummon(summon, "count:1");
                await h.until(() => made().length === 1, `one mouse (${made().map((token) => token.name).join(", ") || "none"})`, { timeout: 15000 });
                const mouse = made()[0].actor;
                h.assert(/Mouse/.test(mouse.name) && traitsOf(mouse).includes("minion"), `a Mouse with the minion trait (${mouse.name}: ${traitsOf(mouse).join(", ")})`);
                await h.until(() => summonState(summon)?.status === "used", `the summon card used (${summonState(summon)?.status})`, { timeout: 8000 });
                const conjured = await conjureCardFor(since, made()[0].actorId);
                h.assert(/Lasts 1 minutes?/.test(textOf(conjured)), `a minute (${textOf(conjured)})`);
                return { rolled, offered: counts, mouse: mouse.name };
            } finally {
                await dismissConjured(scene, wearerToken);
            }
        },

        // Rumbustious Robes' row 8 (creatures-group.js castDuration { value 1, unit rounds, valueRoll 1d8 }; scripts/cast-duration.js
        // rememberCastDuration's rolled time): Dragon Form on its user, lasting 1d8 rounds. The table card applied at 8: the cast card (Dragon Form,
        // on its user, "1d8 rounds"); applied, the spell module's cast, then the 1d8 rolled in the chat ("Its time (1d8 rounds)"), the cast's mark
        // that many rounds, and the spell's Effect (its dragon picked: the prompt's first) set to it. (The spell module active.)
        async b5CreaturesChaosDragonDuration(scene) {
            assertSpells();
            await h.clearSquares(scene, around(15, 6, 3));
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Chaos Dragon Wearer", { type: "character", x: 15, y: 6, level: 16 });
            const robes = await h.give(wearer, "Rumbustious Robes", MAGIC);
            await wearerToken.object?.control?.();
            try {
                const table = await activated(robes, 1, "table", "the chaos table card");
                let since = Date.now();
                await api().apply(table.id, { total: 8 });
                const cast = await h.messageAfter(since, (message) => h.itemCard("cast")(message) && /Dragon Form/.test(JSON.stringify(stateOf(message)?.plan?.spell ?? stateOf(message)?.plan?.choices ?? "")), { what: "row 8's Dragon Form cast card", timeout: 10000 });
                const castDuration = stateOf(cast).plan.castDuration;
                h.assert(castDuration?.valueRoll === "1d8" && castDuration.unit === "rounds" && stateOf(cast).plan.self === true, `on its user, for 1d8 rounds (${JSON.stringify({ castDuration, self: stateOf(cast).plan.self })})`);
                h.assert(/1d8 rounds/.test(textOf(cast)), `its time on the card (${textOf(cast).slice(0, 400)})`);
                since = Date.now();
                await api().apply(cast.id, {});
                const casting = await castMessage(since);
                const time = await h.messageAfter(since, (message) => /Its time \(1d8 rounds\)/.test(String(message.flavor ?? "")) && message.rolls?.length, { what: "the duration's 1d8 roll", timeout: 10000 });
                const rolled = Number(time.rolls[0].total);
                h.assert(rolled >= 1 && rolled <= 8, `a d8 (${rolled})`);
                await h.until(() => game.messages.get(casting.id)?.getFlag(h.NS, "castDuration"), "the cast's duration mark", { timeout: 8000 });
                const mark = game.messages.get(casting.id).getFlag(h.NS, "castDuration");
                h.assert(Number(mark.value) === rolled && mark.unit === "rounds", `its mark ${rolled} rounds (${JSON.stringify(mark)})`);
                const effect = () => wearer.itemTypes.effect.find((entry) => entry.system?.context?.origin?.item === mark.spellUuid);
                // (The spell module plays battle forms on one PF2e version only — its scripts/form-runtime.js verify, "Form integration requires
                // verification for this PF2e version" —, docs/spell-module-requests.md row 19: refused, this module's own part is all there is.)
                const refusals = [];
                const notify = ui.notifications.notify.bind(ui.notifications);
                ui.notifications.notify = (text, type, options) => (/Form integration requires verification/.test(String(text)) && refusals.push(String(text)), notify(text, type, options));
                let answered;
                try {
                    answered = await resolveSpellCard(casting, () => Boolean(effect()) || refusals.length > 0, { timeout: 20000 });
                } finally {
                    ui.notifications.notify = notify;
                }
                if (!effect() && refusals.length) return { rolled, mark, formRefused: refusals[0], results: resultsOf(cast) };
                await h.until(() => Number(effect()?.system?.duration?.value) === rolled && effect().system.duration.unit === "rounds", `its Effect for ${rolled} rounds (${JSON.stringify(effect()?.system?.duration)})`, { timeout: 8000 });
                return { rolled, effect: effect().name, duration: effect().system.duration, answered, results: resultsOf(cast) };
            } finally {
                await closeWindows(/Dragon Form/);
            }
        },

        // Barnacle Tree Seed (creatures-group.js plan.options; this module's conjure route, the ability module's summon card): its tree's five
        // barnacles each free a snapdrake for an hour, with the minion and mount traits; the GM's buttons say how many are opened now. Used: the
        // summon card whispered to the GM, its buttons "1 opened" … "5 opened" and "Not now". "2 opened" pressed: two of PF2e's Snapdrakes beside
        // its user, each with the minion and mount traits, on its side, and the conjure card lasting 1 hour; the summon card used.
        async b5CreaturesBarnacleSnapdrakes(scene) {
            await h.clearSquares(scene, around(5, 16, 3));
            const { actor: gardener, token: gardenerToken } = await h.creature(scene, "Barnacle Gardener", { type: "character", x: 5, y: 16, level: 19 });
            const seed = await h.give(gardener, "Barnacle Tree Seed", ALCHEMISTS);
            const made = () => conjuredBy(scene, gardenerToken, (conjured) => /Barnacle Tree Seed/.test(conjured.itemName ?? ""));
            try {
                let since = Date.now();
                await seed.consume();
                const summon = await summonCardAfter(since, /Barnacle Tree Seed/);
                const labels = (summonState(summon).buttons ?? []).map(([, label]) => label);
                h.assert(JSON.stringify(labels) === JSON.stringify(["1 opened", "2 opened", "3 opened", "4 opened", "5 opened", "Not now"]), `how many are opened, and Not now (${JSON.stringify(labels)})`);
                h.assert((summon.whisper ?? []).length && summon.whisper.every((id) => game.users.get(id)?.isGM), `whispered to the GM (${JSON.stringify(summon.whisper)})`);
                since = Date.now();
                await pressSummon(summon, "option:1");
                await h.until(() => made().length === 2, `two snapdrakes (${made().map((token) => token.name).join(", ") || "none"})`, { timeout: 15000 });
                for (const token of made()) {
                    const traits = traitsOf(token.actor);
                    h.assert(/Snapdrake/.test(token.actor.name) && traits.includes("minion") && traits.includes("mount"), `a Snapdrake, a minion and a mount (${token.actor.name}: ${traits.join(", ")})`);
                    h.assert(token.disposition === gardenerToken.disposition, `on its user's side (${token.disposition} / ${gardenerToken.disposition})`);
                }
                await h.until(() => summonState(summon)?.status === "used", `the summon card used (${summonState(summon)?.status})`, { timeout: 8000 });
                const conjured = await conjureCardFor(since, made()[0].actorId);
                h.assert(/Lasts 1 hours?/.test(textOf(conjured)), `an hour (${textOf(conjured)})`);
                return { made: made().map((token) => token.actor.name), traits: traitsOf(made()[0].actor) };
            } finally {
                await dismissConjured(scene, gardenerToken);
            }
        },

        // Food of the Gods (creatures-group.js; ruleEffects untilRest): an attribute modifier picked rises by 1 or to +4, whichever is higher, for a
        // day or until its next daily preparations. Two fixtures in PF2e's manual attribute mode (their Wisdom set on the actor), +1 and +4: each
        // eats one, picks "Wisdom" on the ways card and applies its card. The +1's modifier becomes +4, the +4's +5 (the Effect's ActiveEffectLike
        // add 1, then upgrade to 4). PF2e's Rest for the Night on the first: the Effect gone, its Wisdom +1 again. (A fixture in manual mode only:
        // a real PC's boosts are PF2e's own order of preparation.)
        async b5CreaturesFoodOfTheGodsWisdom(scene) {
            const { actor: novice } = await h.creature(scene, "Godfood Novice", { type: "character", x: 2, y: 18, level: 20 });
            const { actor: sage } = await h.creature(scene, "Godfood Sage", { type: "character", x: 5, y: 18, level: 20 });
            const wis = (actor) => Number(actor.system.abilities?.wis?.mod);
            await novice.update({ "system.abilities.wis.mod": 1 });
            await sage.update({ "system.abilities.wis.mod": 4 });
            await h.until(() => wis(novice) === 1 && wis(sage) === 4, `Wisdom +1 and +4 to start (${wis(novice)}, ${wis(sage)})`, { timeout: 5000 });
            const food = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.ruleEffect === "Food of the Gods");
            const eat = async (actor) => {
                const meal = await h.give(actor, "Food of the Gods", ALCHEMISTS);
                let since = Date.now();
                await meal.consume();
                const ways = await h.messageAfter(since, (message) => h.itemCard("ways")(message) && stateOf(message)?.user?.actorUuid === actor.uuid, { what: `${actor.name}'s ways card` });
                const names = (stateOf(ways).plan.ways ?? []).map((way) => way.name);
                const wisdom = names.indexOf("Wisdom");
                h.assert(wisdom >= 0 && names.length === 6, `the six attributes (${names.join(", ")})`);
                since = Date.now();
                await api().apply(ways.id, { choice: wisdom });
                const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && message.id !== ways.id, { what: `${actor.name}'s Wisdom card` });
                const at = (stateOf(card).drinkers ?? []).findIndex((entry) => entry.actorUuid === actor.uuid);
                await api().apply(card.id, { drinker: Math.max(0, at) });
                await h.until(() => food(actor), `${actor.name}'s Effect (${effectNames(actor)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return card;
            };
            await eat(novice);
            const rules = food(novice).system.rules ?? [];
            h.assert(rules.some((rule) => rule.key === "ActiveEffectLike" && rule.mode === "add" && rule.path === "system.abilities.wis.mod" && Number(rule.value) === 1) && rules.some((rule) => rule.key === "ActiveEffectLike" && rule.mode === "upgrade" && rule.path === "system.abilities.wis.mod" && Number(rule.value) === 4), `add 1, then upgrade to 4 (${JSON.stringify(rules)})`);
            h.assert(food(novice).flags[h.NS].untilRest === true, `until its next rest (${JSON.stringify(food(novice).flags[h.NS])})`);
            await h.until(() => wis(novice) === 4, `+1 becomes +4 (${wis(novice)})`, { timeout: 8000 });
            await eat(sage);
            await h.until(() => wis(sage) === 5, `+4 becomes +5 (${wis(sage)})`, { timeout: 8000 });
            // (PF2e's own rest, its hook too; else the hook alone.)
            const rested = typeof game.pf2e?.actions?.restForTheNight === "function" ? await game.pf2e.actions.restForTheNight({ actors: [novice], skipDialog: true }).then(() => true, () => false) : false;
            if (!rested) Hooks.callAll("pf2e.restForTheNight", novice);
            await h.until(() => !food(novice) && wis(novice) === 1, `gone at its rest, Wisdom +1 again (${effectNames(novice)}; ${wis(novice)})`, { timeout: 10000 });
            return { novice: wis(novice), sage: wis(sage), rested };
        }
    };
};
