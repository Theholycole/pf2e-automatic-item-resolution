// The fourth batch's second group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code has cases: an own save or check whatever its words (plan.ownSave, src/live/poison-card.js isOwnSave/isUseSave —
// Whisperer of Souls' defying glaive and its ritual, with the ability module's follow-up save after it), a weapon's soul binding on a critical hit
// or a kill (src/compiler/soul-binding.js, scripts/rune-strikes.js creatureOf's level and Intelligence, riderFits only.minLevel/sapient,
// scripts/soul-binding.js on the core's damage patch), a cast for one kind only with rules of its own on it (scripts/casts.js castTraits.only,
// src/live/card.js castPenaltySource's rules — Orb of Dragonkind), PF2e's rules on a cast's caster (plan.castCaster — Soulcutter (Heroic)'s
// Soulcutting Storm), a check gated at a degree (src/live/card.js checkGateMet/gateOption) and a revival at full Hit Points with pools kept and a
// boon (scripts/revive.js — The Deck of Destiny), a way's Effect ending the others' by name (src/live/ends-own.js endsOwn.names — The Silent
// Hag), damage turned back by a counteract's degree and a use given back (scripts/counteract.js reflectDamage — Herald's Ring), a demon's sin
// vulnerability set off (scripts/sin-vulnerability.js — Shame Demon), a full day's rest (scripts/rest.js — Hallajin Key), a skill action's
// changed degree never seen live before (scripts/item-actions.js action.degree — Taljjae's Mask's Disarm), an item destroyed once its card has
// applied (scripts/foundry.js destroyUsedItem, after every recipient — Soulheart (Angelic)), the user uninvested once its attack hits
// (scripts/uninvest.js — Ochre Fulcrum Lens), an initiative rolled three times (scripts/initiative-thrice.js — The Dance), persistent damage
// scraped off a die at a time (scripts/scrape.js — The Waxworks), and a hit's counteract card kept for later, rolled twice against a demon
// (scripts/hit-counteract.js, counteract.fortuneVs — Halcyon Heart).
// The group's other asked-for checks feed mechanisms already live-checked: Wintershot's Signal Flare (a placed light for a minute — flareLight;
// a Strike's hit posting the counteract card — awakenedSilverShot — with a free row — b2-creatures' Bloodstone Doll), the Doomsday Door's rites
// (a way's Mythic Point on its item card — mythicUpgrade, refused at 0 — mythicCost; doomed 1 higher, the core's condition stack the ability
// module plays; the apocalypse a whisper), and Shot of the First Vault (Vault Deposit's save after a hit or a plain miss — strike.save,
// blisterAmmoSave, with strike.failRow, strikeExtinguishingFailure; Reload Order's fragments, the ability module's persistent bleed and its
// Clumsy stack { by −2 }).

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
const FIXTURE = "liveCheckFixture";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };
// (PF2e's own creatures and Effects these cases need.)
const RED_DRAGON = "Compendium.pf2e.pathfinder-bestiary.Actor.JhQGNMlKARMx1n2D";
const SUCCUBUS = "Compendium.pf2e.pathfinder-monster-core.Actor.md1fhwGMwDv4NNwO";
const OCHRE_EFFECT = "Compendium.pf2e.equipment-effects.Item.5KXsyN9J78glG25I";
const THRICE = "air-initiative-thrice";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const text = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionNames = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${Number.isFinite(condition.value) ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const DamageRoll = () => CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
    const card = (message) => message.flags?.[ABILITY]?.card ?? {};
    const checkOf = (message) => card(message).plan?.resolution?.check ?? {};
    const targetsActor = (message, actor) => (card(message).targets ?? []).some((entry) => entry.actorUuid === actor.uuid);
    // (The ability module's card at that creature, of that statistic and DC.)
    const abilityCardAt = (actor, statistic, dc) => (message) => h.abilitySaveCard(message) && targetsActor(message, actor) && checkOf(message).statistic === statistic && Number(checkOf(message).against?.value) === dc;
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.active && typeof game.modules.get(SPELLS).api?.castFromItem === "function", "the spell module (pf2e-automatic-resolution) active, its castFromItem there");
    // (A modifier on a creature: an Effect of PF2e's FlatModifier, as tools/live-cases/b2-afflictions.mjs boosts.)
    const boost = async (actor, selector, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${selector} +${value}`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "FlatModifier", selector, value }], duration: UNLIMITED } }]);
        await h.wait(300);
    };
    // (A bare character has no maximum Hit Points, and PF2e then takes no damage or healing on it: 30.)
    const hitPoints = async (actor, value = 30) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value }], duration: UNLIMITED } }]);
        await h.until(() => Number(actor.system.attributes.hp.max) >= value, `${value} maximum Hit Points on ${actor.name}`, { timeout: 5000 });
    };
    // A PF2e actor from its compendium as one of this check's fixtures ("PFTEST ITEM …", flagged, linked), its token on the lab at (x, y).
    async function fixtureFrom(scene, uuid, name, { x, y, alliance = "opposition" }) {
        const found = await fromUuid(uuid).catch(() => null);
        h.assert(found, `${uuid} in PF2e's compendiums`);
        const source = found.toObject();
        delete source._id;
        source.name = `${h.PREFIX} ${name}`;
        source.folder = null;
        source.flags = foundry.utils.mergeObject(source.flags ?? {}, { [h.NS]: { [FIXTURE]: true } }, { inplace: false });
        source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name, actorLink: true };
        if (source.type === "npc") foundry.utils.setProperty(source, "system.details.alliance", alliance);
        const actor = await Actor.create(source);
        const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), actorId: actor.id, actorLink: true, x: x * 100, y: y * 100 }]);
        await h.wait(300);
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await h.wait(100);
        return { actor, token };
    }
    // The windows a cast through the spell module may leave open (its caster choices, a confirmation): closed, so the next case starts clear.
    async function closeWindows(pattern) {
        for (const app of [...foundry.applications.instances.values()]) if (app.rendered && pattern.test(String(app.title ?? ""))) await app.close().catch(() => null);
    }
    // A cast card's Apply, not awaited alone: the spell module's caster choices answered as they stand (its Apply), should it ask, until the item
    // card says it cast (as tools/live-cases/senses.mjs resolveSpellCard answers the spell card's windows).
    async function applyCast(castCard, choices = {}) {
        let failed = null;
        const applying = live().apply(castCard.id, choices).catch((error) => {
            failed = error;
        });
        const clicked = new Set();
        const cast = () => resultsOf(castCard).some((line) => /\bcasts\b/.test(line));
        for (const end = Date.now() + 15000; Date.now() < end && !cast() && !failed; ) {
            const asked = [...document.querySelectorAll(".application, .dialog, .window-app")].find((entry) => /caster choices/i.test(entry.querySelector(".window-title")?.textContent ?? ""));
            const button = asked?.querySelector('button[data-action="apply"]');
            if (button && !clicked.has(button)) {
                clicked.add(button);
                button.click();
            }
            await h.wait(200);
        }
        await Promise.race([applying, h.wait(3000)]);
        if (failed) throw failed;
        h.assert(cast(), `the cast (${JSON.stringify(resultsOf(castCard))}; caster choices answered ${clicked.size})`);
    }
    // An activation's ways card, and one of its ways pressed (by its name) → { ways, card } (the card that way posts).
    async function pressWay(item, activation, pattern, { ways = null } = {}) {
        let since = Date.now();
        if (!ways || stateOf(ways)?.status !== "open") {
            await live().activate(item.uuid, activation);
            ways = await h.messageAfter(since, h.itemCard("ways"), { what: `${item.name}'s ways card` });
        }
        const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
        const choice = names.findIndex((name) => pattern.test(name));
        h.assert(choice >= 0, `the way ${pattern} offered (${JSON.stringify(names)})`);
        since = Date.now();
        await live().apply(ways.id, { choice });
        const posted = await h.messageAfter(since, (message) => Boolean(message.getFlag(h.NS, "card")) && message.id !== ways.id, { what: `the card of ${names[choice]}` });
        return { ways, card: posted, names };
    }
    // An own-save card (its user's own save or check: no targets), applied → the ability module's card at its user.
    async function ownCard(posted, user) {
        const since = Date.now();
        await live().apply(posted.id, { targets: [] });
        const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsActor(message, user), { what: `the ability module's card at ${user.name}` });
        return save;
    }
    // (The Strike with a weapon, PF2e's own.)
    const strikeOf = (actor, weapon) => (actor.system.actions ?? []).find((action) => action.item?.id === weapon.id);
    const hasStrike = (actor, weapon) => () => Boolean(strikeOf(actor, weapon));

    return {
        // Whisperer of Souls' lethal or nonlethal (legend-readings.js; the ways card, its defying ways plan.ownSave — src/live/poison-card.js): its
        // "Nonlethal" way's item card gives its wielder "Whisperer of Souls (Nonlethal): nonlethal Strike" (PF2e's AdjustStrike adding the
        // glaive's nonlethal trait, to the end of the turn), and PF2e's damage roll of the glaive's Strike then carries item:trait:nonlethal (gone
        // once that Effect is). Its "Nonlethal, the glaive defying it (DC 50 Will)" way posts its wielder's own save card (no targets needed, "own
        // save", "DC 50 Will save"); the ability module's card at the wielder (Will +40, a 10 on the die: 50, a success) gives the note Effect
        // with the AdjustStrike, and the Strike's damage roll is nonlethal again.
        async b4G2WhispererNonlethal(scene) {
            await h.clearSquares(scene, [[5, 1], [6, 1]]);
            const { actor: wielder, token: wielderToken } = await h.creature(scene, "Whisperer Wielder", { type: "character", x: 5, y: 1, level: 20 });
            const { token: foeToken } = await h.creature(scene, "Whisperer Foe", { x: 6, y: 1, ac: 1, hp: 300, alliance: "opposition" });
            const glaive = await h.give(wielder, "Whisperer of Souls");
            await glaive.update(held(2));
            await h.until(hasStrike(wielder, glaive), "the glaive's Strike", { timeout: 5000 });
            await boost(wielder, "will", 40);
            await wielderToken.object?.control?.();
            await h.target(foeToken);
            // (PF2e's damage roll of the glaive's Strike: its roll options.)
            const damageOptions = async () => {
                const since = Date.now();
                await strikeOf(wielder, glaive).damage({ event: h.shift() });
                const rolled = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll" && message.speaker?.actor === wielder.id, { what: "the glaive's damage roll" });
                return rolled.flags.pf2e.context.options ?? [];
            };
            const nonlethal = (options) => options.some((option) => /(^|:)nonlethal$/.test(String(option)));
            const plainOptions = await damageOptions();
            h.assert(!nonlethal(plainOptions), "the glaive's damage lethal at first");
            const { card: chosen } = await pressWay(glaive, 0, /^Nonlethal$/);
            h.assert(stateOf(chosen)?.kind === "item", `the Nonlethal way's item card (${stateOf(chosen)?.kind})`);
            await live().apply(chosen.id, { drinker: 0 });
            const named = () => wielder.itemTypes.effect.find((effect) => effect.name === "Whisperer of Souls (Nonlethal): nonlethal Strike");
            await h.until(named, `"Whisperer of Souls (Nonlethal): nonlethal Strike" (${effectNames(wielder)})`, { timeout: 8000 });
            const rule = (named().system.rules ?? []).find((entry) => entry.key === "AdjustStrike");
            h.assert(rule?.property === "weapon-traits" && rule.value === "nonlethal", `PF2e's AdjustStrike adding nonlethal (${JSON.stringify(named().system.rules)})`);
            h.assert(named().system.duration.expiry === "turn-end", `ending at the turn's end (${JSON.stringify(named().system.duration)})`);
            const withEffect = await damageOptions();
            h.assert(nonlethal(withEffect), `the Strike's damage roll nonlethal (its options: ${withEffect.filter((option) => /trait/.test(option)).join(", ")}; the Strike's traits ${JSON.stringify(strikeOf(wielder, glaive)?.item?.system?.traits?.value ?? null)})`);
            await named().delete();
            await h.wait(500);
            h.assert(!nonlethal(await damageOptions()), "lethal again once that Effect is gone");
            // (The glaive defying it: its wielder's own DC 50 Will save.)
            const { card: defied } = await pressWay(glaive, 0, /^Nonlethal, the glaive defying it/);
            h.assert(stateOf(defied)?.kind === "expose" && /own save/.test(text(defied)) && /DC 50 Will save/.test(text(defied)), `its wielder's own save card (${stateOf(defied)?.kind}; ${text(defied).slice(0, 300)})`);
            const save = await ownCard(defied, wielder);
            h.assert(checkOf(save).statistic === "will" && Number(checkOf(save).against?.value) === 50, `a DC 50 Will save (${JSON.stringify(checkOf(save))})`);
            await h.withDie(10, () => h.rollAndApply(save));
            const noted = () => wielder.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.note && (effect.system.rules ?? []).some((entry) => entry.key === "AdjustStrike" && entry.value === "nonlethal"));
            await h.until(noted, `a success: the nonlethal note Effect with its AdjustStrike (${effectNames(wielder)})`, { timeout: 10000 });
            h.assert(nonlethal(await damageOptions()), "the Strike's damage roll nonlethal after the success");
            return { effect: noted().name, rule };
        },

        // Whisperer of Souls' ritual (legend-readings.js; plan.ownSave, saveText's "check"; a row's followUps — the core's follow-up save, the ability
        // module's next card): activated, its own card says "own check (DC 37 Occultism check)"; the ability module's card at the reader rolls its
        // Occultism against DC 37 — a 1 on the die (and no Occultism to speak of), a critical failure: the "Lost in the void" note Effect for 7
        // days, then the ability module's DC 50 Will card at the same reader; its Will +35 and a 10 on the die (45, a failure): Stupefied 2 for 7
        // days, beside the "Back from the void" note Effect.
        async b4G2WhispererRitual(scene) {
            await h.clearSquares(scene, [[5, 3]]);
            const { actor: reader, token: readerToken } = await h.creature(scene, "Whisperer Ritualist", { type: "character", x: 5, y: 3, level: 20 });
            const glaive = await h.give(reader, "Whisperer of Souls");
            await glaive.update(held(2));
            await boost(reader, "will", 35);
            await readerToken.object?.control?.();
            let since = Date.now();
            await live().activate(glaive.uuid, 2);
            const own = await h.messageAfter(since, h.itemCard("expose"), { what: "the ritual's own card" });
            h.assert(/own check/.test(text(own)) && /DC 37 Occultism check/.test(text(own)), `"own check (DC 37 Occultism check)" (${text(own).slice(0, 300)})`);
            const ritual = await ownCard(own, reader);
            h.assert(checkOf(ritual).statistic === "occultism" && Number(checkOf(ritual).against?.value) === 37, `Occultism at DC 37 (${JSON.stringify(checkOf(ritual))})`);
            since = Date.now();
            await h.withDie(1, () => h.rollAndApply(ritual));
            const rolled = await h.messageAfter(since, (message) => message.speaker?.actor === reader.id && (message.flags?.pf2e?.context?.options ?? []).includes("check:statistic:occultism"), { what: "PF2e's Occultism roll", timeout: 10000 });
            h.assert(rolled.flags.pf2e.context.outcome === "criticalFailure", `a critical failure (${rolled.flags.pf2e.context.outcome}, ${rolled.rolls?.[0]?.total} against DC 37)`);
            const lost = () => reader.itemTypes.effect.find((effect) => /: Lost in the void$/.test(effect.name));
            await h.until(lost, `the "Lost in the void" note Effect (${effectNames(reader)})`, { timeout: 10000 });
            h.assert(Number(lost().system.duration.value) === 7 && lost().system.duration.unit === "days", `for 7 days (${JSON.stringify(lost().system.duration)})`);
            const follow = await h.messageAfter(since, (message) => message.id !== ritual.id && abilityCardAt(reader, "will", 50)(message), { what: "the follow-up DC 50 Will card at the reader", timeout: 10000 });
            await h.withDie(10, () => h.rollAndApply(follow));
            await h.until(() => Number(reader.getCondition("stupefied")?.value) === 2, `a failure: Stupefied 2 (${conditionNames(reader)})`, { timeout: 10000 });
            const timed = reader.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.timedCondition?.slug === "stupefied") ?? reader.itemTypes.condition.find((condition) => condition.slug === "stupefied");
            const duration = timed?.system?.duration ?? {};
            h.assert(Number(duration.value) === 7 && duration.unit === "days", `Stupefied for 7 days (${JSON.stringify(duration)}; ${effectNames(reader)})`);
            h.assert(reader.itemTypes.effect.some((effect) => /: Back from the void$/.test(effect.name)), `the "Back from the void" note Effect (${effectNames(reader)})`);
            return { ritual: rolled.rolls?.[0]?.total, lost: lost().name, stupefied: duration };
        },

        // Whisperer of Souls' soul binding (src/compiler/soul-binding.js; scripts/rune-strikes.js on a critical hit, scripts/soul-binding.js on the
        // core's damage patch): its wielder's Strike (a 20 on the die at AC 1) critically hits a level 19 NPC (not mindless, Intelligence +0): the
        // ability module's DC 50 Fortitude save card at it; its Fortitude +8 and a 10 on the die (18), a critical failure: Drained 4 and the
        // "Soul at stake" note Effect. Another level 19 NPC (30 Hit Points) taken to 0 by 40 slashing from the glaive (PF2e's applyDamage, the
        // glaive its item): the same DC 50 Fortitude card at it.
        async b4G2SoulBindingSapient(scene) {
            await h.clearSquares(scene, [[8, 1], [9, 1], [9, 2]]);
            const { actor: wielder, token: wielderToken } = await h.creature(scene, "Soul Glaive Wielder", { type: "character", x: 8, y: 1, level: 20 });
            const { actor: struck, token: struckToken } = await h.creature(scene, "Soul Struck Sapient", { x: 9, y: 1, level: 19, ac: 1, hp: 300, save: 8, alliance: "opposition" });
            const { actor: felled, token: felledToken } = await h.creature(scene, "Soul Felled Sapient", { x: 9, y: 2, level: 19, hp: 30, alliance: "opposition" });
            const glaive = await h.give(wielder, "Whisperer of Souls");
            await glaive.update(held(2));
            await h.until(hasStrike(wielder, glaive), "the glaive's Strike", { timeout: 5000 });
            await wielderToken.object?.control?.();
            await h.target(struckToken);
            let since = Date.now();
            const { attack } = await h.withDie(20, () => h.strike(wielder, glaive));
            h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (${attack.flags.pf2e.context.outcome})`);
            const critical = await h.messageAfter(since, abilityCardAt(struck, "fortitude", 50), { what: "the DC 50 Fortitude card at the creature critically hit", timeout: 10000 });
            await h.withDie(10, () => h.rollAndApply(critical));
            await h.until(() => Number(struck.getCondition("drained")?.value) === 4, `a critical failure: Drained 4 (${conditionNames(struck)})`, { timeout: 10000 });
            h.assert(struck.itemTypes.effect.some((effect) => /: Soul at stake$/.test(effect.name)), `the "Soul at stake" note Effect (${effectNames(struck)})`);
            since = Date.now();
            await felled.applyDamage({ damage: await new (DamageRoll())("40[slashing]").evaluate(), token: felledToken, item: glaive });
            await h.until(() => hp(felled) === 0, `the second creature at 0 Hit Points (${hp(felled)})`, { timeout: 8000 });
            const kill = await h.messageAfter(since, abilityCardAt(felled, "fortitude", 50), { what: "the DC 50 Fortitude card at the creature the glaive's damage felled", timeout: 10000 });
            return { critical: critical.id, kill: kill.id, drained: struck.getCondition("drained")?.value };
        },

        // Whisperer of Souls' soul binding not for every creature (riderFits only { minLevel 18, sapient }): a level 17 NPC critically hit (a 20 on
        // the die at AC 1) and another level 17 NPC taken to 0 by the glaive's damage get no DC 50 Fortitude card; nor does a level 19 mindless one
        // critically hit.
        async b4G2SoulBindingNotFor(scene) {
            await h.clearSquares(scene, [[8, 4], [9, 4], [9, 5], [8, 5]]);
            const { actor: wielder, token: wielderToken } = await h.creature(scene, "Soul Glaive Sparer", { type: "character", x: 8, y: 4, level: 20 });
            const { actor: low, token: lowToken } = await h.creature(scene, "Soul Struck Level 17", { x: 9, y: 4, level: 17, ac: 1, hp: 300, alliance: "opposition" });
            const { actor: lowFelled, token: lowFelledToken } = await h.creature(scene, "Soul Felled Level 17", { x: 9, y: 5, level: 17, hp: 30, alliance: "opposition" });
            const { actor: mindless, token: mindlessToken } = await h.creature(scene, "Soul Struck Mindless", { x: 8, y: 5, level: 19, ac: 1, hp: 300, alliance: "opposition" });
            await mindless.update({ "system.traits.value": ["construct", "mindless"] });
            await h.until(() => mindless.system.traits.value.includes("mindless"), "the mindless trait", { timeout: 5000 });
            const glaive = await h.give(wielder, "Whisperer of Souls");
            await glaive.update(held(2));
            await h.until(hasStrike(wielder, glaive), "the glaive's Strike", { timeout: 5000 });
            await wielderToken.object?.control?.();
            const none = (actor, since) => !game.messages.contents.some((message) => Number(message.timestamp) >= since && abilityCardAt(actor, "fortitude", 50)(message));
            const outcomes = {};
            for (const [actor, token] of [[low, lowToken], [mindless, mindlessToken]]) {
                await h.target(token);
                const since = Date.now();
                const { attack } = await h.withDie(20, () => h.strike(wielder, glaive));
                outcomes[actor.name] = attack.flags.pf2e.context.outcome;
                h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit at ${actor.name} (${attack.flags.pf2e.context.outcome})`);
                await h.wait(2500);
                h.assert(none(actor, since), `no soul binding card at ${actor.name} (level ${actor.level}, traits ${[...(actor.traits ?? [])].join(", ")})`);
            }
            const since = Date.now();
            await lowFelled.applyDamage({ damage: await new (DamageRoll())("40[slashing]").evaluate(), token: lowFelledToken, item: glaive });
            await h.until(() => hp(lowFelled) === 0, `the level 17 creature at 0 Hit Points (${hp(lowFelled)})`, { timeout: 8000 });
            await h.wait(2500);
            h.assert(none(lowFelled, since), "no soul binding card at the level 17 creature felled");
            return outcomes;
        },

        // Orb of Dragonkind's dominate (legend-readings.js; scripts/casts.js castTraits.only, castPenaltySource with rules): cast at a legacy red dragon
        // (Pathfinder Bestiary's Adult Red Dragon, its "+1 Status to All Saves vs. Magic") and a human, both targeted: the human is left out ("isn't a
        // dragon: left out of the cast"), the cast is at the dragon alone, and before it the dragon gets the orb's Effect with PF2e's
        // AdjustModifier suppressing that bonus — its Will DC against magic (roll option item:magical) 1 above its plain Will DC before, the same
        // after; the human gets none. The spell module's cast message carries the item's duration mark, 30 days. (The spell's save is the spell
        // module's, not rolled here.)
        async b4G2OrbDominateDragon(scene) {
            assertSpells();
            // (The dragon Huge: 3 squares by 3 from (12, 1).)
            await h.clearSquares(scene, [[11, 1], [11, 4], ...[12, 13, 14].flatMap((x) => [1, 2, 3].map((y) => [x, y]))]);
            const { actor: holder, token: holderToken } = await h.creature(scene, "Orb Holder", { type: "character", x: 11, y: 1, level: 20 });
            const { actor: dragon, token: dragonToken } = await fixtureFrom(scene, RED_DRAGON, "Orb Red Dragon", { x: 12, y: 1 });
            const { actor: human, token: humanToken } = await h.creature(scene, "Orb Human", { x: 11, y: 4, alliance: "opposition" });
            await human.update({ "system.traits.value": ["human", "humanoid"] });
            const orb = await h.give(holder, "Orb of Dragonkind");
            await orb.update(held(1));
            await holderToken.object?.control?.();
            const willDC = (actor, options) => Number(actor.getStatistic("will")?.withRollOptions({ extraRollOptions: options })?.dc?.value);
            const vsMagic = () => willDC(dragon, ["item:magical"]) - willDC(dragon, []);
            await h.until(() => vsMagic() === 1, `the dragon's +1 status to saves against magic before (${vsMagic()})`, { timeout: 5000 });
            const suppressing = (actor) => actor.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "AdjustModifier" && rule.slug === "1-status-to-all-saves-vs-magic" && rule.suppress));
            try {
                const since = Date.now();
                await live().activate(orb.uuid, 0);
                const castCard = await h.messageAfter(since, h.itemCard("cast"), { what: "the orb's cast card" });
                const plan = stateOf(castCard).plan;
                h.assert(plan.spell?.name === "Dominate" && JSON.stringify(plan.castTraits?.only ?? []) === '["dragon"]', `Dominate, at a dragon only (${plan.spell?.name}; ${JSON.stringify(plan.castTraits?.only)})`);
                await applyCast(castCard, { targets: [dragonToken.uuid, humanToken.uuid] });
                const results = resultsOf(castCard);
                h.assert(results.some((line) => /casts Dominate/.test(line)), `Dominate cast (${JSON.stringify(results)})`);
                h.assert(results.some((line) => line.includes(human.name) && /isn't a dragon: left out of the cast/.test(line)), `the human left out, with its line (${JSON.stringify(results)})`);
                h.assert(results.some((line) => /casts Dominate/.test(line) && line.includes(dragon.name) && !line.includes(human.name)), `cast at the dragon alone (${JSON.stringify(results)})`);
                const effect = suppressing(dragon);
                h.assert(effect, `the dragon's Effect suppressing "+1 Status to All Saves vs. Magic" (${effectNames(dragon)})`);
                await h.until(() => vsMagic() === 0, `no status bonus to its saves against magic now (Will DC ${willDC(dragon, [])}, against magic ${willDC(dragon, ["item:magical"])})`, { timeout: 5000 });
                h.assert(!suppressing(human), `nothing on the human (${effectNames(human)})`);
                const cast = await h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
                h.assert(Number(effect._stats?.createdTime ?? 0) <= Number(cast.timestamp ?? Infinity), `the Effect made before the cast (${effect._stats?.createdTime} / ${cast.timestamp})`);
                await h.until(() => game.messages.get(cast.id)?.getFlag(h.NS, "castDuration"), "the cast's duration mark", { timeout: 8000 });
                const mark = game.messages.get(cast.id).getFlag(h.NS, "castDuration");
                h.assert(Number(mark.value) === 30 && mark.unit === "days", `its Effects for 30 days (${JSON.stringify(mark)})`);
                const flag = cast.flags[SPELLS].castFromItem;
                return { results, mark, rank: flag.rank ?? null, dc: flag.dc ?? null, targets: flag.targets ?? null, suppressed: effect.name };
            } finally {
                await closeWindows(/Dominate|caster choices/i);
            }
        },

        // The Deck of Destiny's Resurrect, at a critical success (legend-readings.js; plan.checkGate { statistic occultism, dc 50, degree
        // criticalSuccess } — src/live/card.js checkGateMet/gateOption, scripts/live.js applyCard; item.revive { hp "max", keepPools, boon } —
        // scripts/revive.js): its ways card (activation 4). Its user (Occultism +50) presses "The ritual's check (DC 50 Occultism)": its own card
        // ("DC 50 Occultism check"), the ability module's card at it — a 2 on the die (52), a success, PF2e's roll carrying
        // check:statistic:occultism. "Critical success: back with full Hit Points" at a dead ally (an NPC at 0 of 50 Hit Points, PF2e's dead
        // status, 2 Focus Points) is then refused: its card applies with "isn't the result this is for: no Effect", the ally still dead. The check
        // again, a 10 on the die (60, a critical success): the same way brings the ally back at its full 50 Hit Points, its 2 Focus Points kept, the
        // dead status off, "back from death" and a 7-day boon Effect with PF2e's +1 status FlatModifiers to attack rolls, Perception, saves and
        // skill checks.
        async b4G2DeckResurrectCritical(scene) {
            await h.clearSquares(scene, [[15, 1], [16, 1]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Deck Ritualist", { type: "character", x: 15, y: 1, level: 20 });
            const { actor: fallen, token: fallenToken } = await h.creature(scene, "Deck Fallen Ally", { x: 16, y: 1, hp: 0 });
            await boost(user, "occultism", 50);
            await fallen.update({ "system.resources.focus": { value: 2, max: 2 } });
            await fallen.toggleStatusEffect("dead", { active: true, overlay: true });
            await h.until(() => fallen.statuses?.has?.("dead") && hp(fallen) === 0 && Number(fallen.system.resources?.focus?.value) === 2, `dead at 0 Hit Points with 2 Focus Points (${hp(fallen)}; ${fallen.system.resources?.focus?.value})`, { timeout: 5000 });
            const deck = await h.give(user, "The Deck of Destiny");
            await deck.update({ ...held(1), "system.equipped.invested": true });
            await userToken.object?.control?.();
            // The ritual's check, its own card, at that die → PF2e's Occultism roll.
            let ways = null;
            const ritualCheck = async (face) => {
                const pressed = await pressWay(deck, 3, /^The ritual's check \(DC 50 Occultism\)$/, { ways });
                ways = pressed.ways;
                h.assert(/DC 50 Occultism check/.test(text(pressed.card)), `its own card's "DC 50 Occultism check" (${text(pressed.card).slice(0, 300)})`);
                const save = await ownCard(pressed.card, user);
                h.assert(checkOf(save).statistic === "occultism" && Number(checkOf(save).against?.value) === 50, `Occultism at DC 50 (${JSON.stringify(checkOf(save))})`);
                const since = Date.now();
                await h.withDie(face, () => h.rollAndApply(save));
                return h.messageAfter(since, (message) => message.speaker?.actor === user.id && (message.flags?.pf2e?.context?.options ?? []).includes("check:statistic:occultism"), { what: "PF2e's Occultism roll, check:statistic:occultism among its options", timeout: 10000 });
            };
            const resurrect = async () => {
                const pressed = await pressWay(deck, 3, /^Critical success: back with full Hit Points$/, { ways });
                h.assert(stateOf(pressed.card)?.kind === "item", `its item card (${stateOf(pressed.card)?.kind})`);
                await live().apply(pressed.card.id, { targets: [fallenToken.uuid] });
                await h.until(() => stateOf(pressed.card)?.status === "applied", `the card applied (${JSON.stringify(resultsOf(pressed.card))})`, { timeout: 8000 });
                return pressed.card;
            };
            const success = await ritualCheck(2);
            h.assert(success.flags.pf2e.context.outcome === "success", `a success first (${success.flags.pf2e.context.outcome}, ${success.rolls?.[0]?.total})`);
            const refused = await resurrect();
            h.assert(resultsOf(refused).some((line) => /isn't the result this is for: no Effect/.test(line)), `refused after a success (${JSON.stringify(resultsOf(refused))})`);
            await h.wait(500);
            h.assert(fallen.statuses?.has?.("dead") && hp(fallen) === 0, `still dead (${hp(fallen)} HP)`);
            const critical = await ritualCheck(10);
            h.assert(critical.flags.pf2e.context.outcome === "criticalSuccess", `then a critical success (${critical.flags.pf2e.context.outcome}, ${critical.rolls?.[0]?.total})`);
            const revived = await resurrect();
            const max = Number(fallen.system.attributes.hp.max);
            await h.until(() => !fallen.statuses?.has?.("dead") && hp(fallen) === max, `back at its full ${max} Hit Points (${hp(fallen)}; dead ${fallen.statuses?.has?.("dead")}; ${JSON.stringify(resultsOf(revived))})`, { timeout: 8000 });
            h.assert(Number(fallen.system.resources.focus.value) === 2, `its Focus Points kept (${fallen.system.resources.focus.value})`);
            h.assert(fallen.itemTypes.effect.some((effect) => /: back from death$/.test(effect.name)), `the "back from death" note Effect (${effectNames(fallen)})`);
            const boon = fallen.itemTypes.effect.find((effect) => (effect.system.rules ?? []).filter((rule) => rule.key === "FlatModifier" && rule.type === "status" && Number(rule.value) === 1).length === 4);
            h.assert(boon, `the boon's four +1 status FlatModifiers (${effectNames(fallen)})`);
            const selectors = boon.system.rules.map((rule) => [].concat(rule.selector)).flat().sort();
            h.assert(JSON.stringify(selectors) === JSON.stringify(["attack-roll", "perception", "saving-throw", "skill-check"]), `to attack rolls, Perception, saves and skill checks (${JSON.stringify(selectors)})`);
            h.assert(Number(boon.system.duration.value) === 7 && boon.system.duration.unit === "days", `for 7 days (${JSON.stringify(boon.system.duration)})`);
            return { refused: resultsOf(refused), revived: resultsOf(revived), hp: hp(fallen), focus: fallen.system.resources.focus.value, boon: boon.name };
        },

        // The Deck of Destiny's Resurrect, at a success (scripts/revive.js item.revive { hp 1 }): the ritual's check a success (Occultism +50, a 2 on
        // the die: 52), then "Success: back with 1 Hit Point" at a dead ally (an NPC at 0 of 50, 2 Focus Points): back with 1 Hit Point, its Focus
        // Points spent, no boon.
        async b4G2DeckResurrectSuccess(scene) {
            await h.clearSquares(scene, [[15, 3], [16, 3]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Deck Ritualist Two", { type: "character", x: 15, y: 3, level: 20 });
            const { actor: fallen, token: fallenToken } = await h.creature(scene, "Deck Fallen Ally Two", { x: 16, y: 3, hp: 0 });
            await boost(user, "occultism", 50);
            await fallen.update({ "system.resources.focus": { value: 2, max: 2 } });
            await fallen.toggleStatusEffect("dead", { active: true, overlay: true });
            await h.until(() => fallen.statuses?.has?.("dead") && hp(fallen) === 0, `dead at 0 Hit Points (${hp(fallen)})`, { timeout: 5000 });
            const deck = await h.give(user, "The Deck of Destiny");
            await deck.update({ ...held(1), "system.equipped.invested": true });
            await userToken.object?.control?.();
            const check = await pressWay(deck, 3, /^The ritual's check \(DC 50 Occultism\)$/);
            const save = await ownCard(check.card, user);
            let since = Date.now();
            await h.withDie(2, () => h.rollAndApply(save));
            const rolled = await h.messageAfter(since, (message) => message.speaker?.actor === user.id && (message.flags?.pf2e?.context?.options ?? []).includes("check:statistic:occultism"), { what: "PF2e's Occultism roll", timeout: 10000 });
            h.assert(rolled.flags.pf2e.context.outcome === "success", `a success (${rolled.flags.pf2e.context.outcome}, ${rolled.rolls?.[0]?.total})`);
            const { card: back } = await pressWay(deck, 3, /^Success: back with 1 Hit Point$/, { ways: check.ways });
            await live().apply(back.id, { targets: [fallenToken.uuid] });
            await h.until(() => !fallen.statuses?.has?.("dead") && hp(fallen) === 1, `back with 1 Hit Point (${hp(fallen)}; ${JSON.stringify(resultsOf(back))})`, { timeout: 8000 });
            h.assert(Number(fallen.system.resources.focus.value) === 0, `its Focus Points spent (${fallen.system.resources.focus.value})`);
            h.assert(!fallen.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && rule.type === "status" && Number(rule.value) === 1)), `no boon (${effectNames(fallen)})`);
            return { results: resultsOf(back), hp: hp(fallen) };
        },

        // The Silent Hag (legend-readings.js; item.endsOwn.names, src/live/ends-own.js): its ways card's "Eyes of death" gives its user "The Silent
        // Hag (Eyes of death): Eyes of death" — PF2e's Blinded granted and lifesense 60 feet (imprecise). Used again, "Ears of hair": that first
        // Effect is deleted (its Blinded with it), "The Silent Hag (Ears of hair): Ears of hair" grants Deafened, and its user can't be flanked
        // (system.attributes.flanking.flankable false).
        async b4G2SilentHagSenses(scene) {
            await h.clearSquares(scene, [[18, 1]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Silent Hag Bearer", { type: "character", x: 18, y: 1, level: 20 });
            const hag = await h.give(user, "The Silent Hag");
            await hag.update({ "system.equipped.invested": true });
            await userToken.object?.control?.();
            const pick = async (pattern) => {
                const { card: posted } = await pressWay(hag, 0, pattern);
                await live().apply(posted.id, { drinker: 0 });
                await h.until(() => stateOf(posted)?.status === "applied", `the ${pattern} card applied`, { timeout: 8000 });
                return posted;
            };
            const eyes = () => user.itemTypes.effect.find((effect) => effect.name === "The Silent Hag (Eyes of death): Eyes of death");
            const ears = () => user.itemTypes.effect.find((effect) => effect.name === "The Silent Hag (Ears of hair): Ears of hair");
            const senses = () => [...(user.perception?.senses ?? []), ...(user.system?.perception?.senses ?? [])].map((sense) => ({ type: String(sense?.type ?? sense), acuity: sense?.acuity ?? null, range: Number(sense?.range ?? NaN) }));
            const first = await pick(/^Eyes of death$/);
            await h.until(() => eyes() && user.hasCondition("blinded"), `Eyes of death, Blinded granted (${effectNames(user)}; ${conditionNames(user)})`, { timeout: 8000 });
            await h.until(() => senses().some((sense) => sense.type === "lifesense" && sense.acuity === "imprecise" && sense.range === 60), `lifesense 60 feet, imprecise (${JSON.stringify(senses())})`, { timeout: 5000 });
            const second = await pick(/^Ears of hair$/);
            await h.until(() => !eyes() && !user.hasCondition("blinded"), `Eyes of death and its Blinded gone (${effectNames(user)}; ${conditionNames(user)}; ${JSON.stringify(resultsOf(second))})`, { timeout: 8000 });
            await h.until(() => ears() && user.hasCondition("deafened"), `Ears of hair, Deafened granted (${effectNames(user)}; ${conditionNames(user)})`, { timeout: 8000 });
            await h.until(() => user.system.attributes.flanking?.flankable === false, `can't be flanked (${JSON.stringify(user.system.attributes.flanking)})`, { timeout: 5000 });
            h.assert(!senses().some((sense) => sense.type === "lifesense"), `no lifesense now (${JSON.stringify(senses())})`);
            return { first: resultsOf(first), second: resultsOf(second), conditions: conditionNames(user) };
        },

        // Herald's Ring's Reflect Sound (legend-readings.js; counteract.reflect and counteract.regain — scripts/counteract.js reflectDamage, src/live/
        // counteract-card.js reflection): its counteract card straight to its free row, with the box for the sonic damage taken. Its user (an NPC at
        // 30 of 50 Hit Points) types 20, targets the source and counteracts at DC 40 (a 1 on the die: 24, a critical failure): nothing turned back,
        // but the ring's use today given back (its activation's count back to 0). Activated again, DC 30 (a 10 on the die: 33, a success): the
        // source takes 10 sonic damage (PF2e's roll, applied) and the user regains the other 10 (30 → 40).
        async b4G2HeraldReflectSound(scene) {
            await h.clearSquares(scene, [[1, 8], [3, 8]]);
            const { actor: singer } = await h.creature(scene, "Herald Singer", { x: 1, y: 8, level: 13, hp: 50 });
            const { actor: source, token: sourceToken } = await h.creature(scene, "Herald Sonic Source", { x: 3, y: 8, hp: 100, alliance: "opposition" });
            const ring = await h.give(singer, "Herald's Ring");
            await ring.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            const uses = () => Number(singer.items.get(ring.id)?.getFlag(h.NS, "activationUses")?.[1]?.count ?? 0);
            const reflect = async (face, dc) => {
                const since = Date.now();
                await live().activate(ring.uuid, 1);
                const posted = await h.messageAfter(since, h.itemCard("counteract"), { what: "Reflect Sound's counteract card" });
                const state = stateOf(posted);
                h.assert(state.step === "pick" && state.rows.length === 1 && state.rows[0].kind === "free", `straight to its free row (${JSON.stringify(state.rows)})`);
                h.assert(state.counteract.modifier === 23 && state.counteract.reflect?.type === "sonic", `+23, reflecting sonic damage (${state.counteract.modifier}; ${JSON.stringify(state.counteract.reflect)})`);
                h.assert(/data-air-amount/.test(game.messages.get(posted.id).content ?? ""), "the box for the sonic damage taken");
                h.assert(uses() === 1, `the day's use counted (${uses()})`);
                await h.withDie(face, () => live().apply(posted.id, { rows: [{ ticked: true, dc, rank: 5 }], amount: "20", targets: [sourceToken.uuid] }));
                await h.until(() => stateOf(posted)?.status === "applied", "the counteract rolled", { timeout: 8000 });
                return posted;
            };
            await singer.update({ "system.attributes.hp.value": 30 });
            const sourceBefore = hp(source);
            const failed = await reflect(1, 40);
            h.assert(resultsOf(failed).some((line) => /24 against DC 40/.test(line)), `24 against DC 40 (${JSON.stringify(resultsOf(failed))})`);
            h.assert(resultsOf(failed).some((line) => /absorbs enough energy: it can be activated again today/.test(line)), `its use given back (${JSON.stringify(resultsOf(failed))})`);
            await h.until(() => uses() === 0, `the activation's count back to 0 (${uses()})`, { timeout: 5000 });
            h.assert(hp(source) === sourceBefore && hp(singer) === 30, `nothing turned back on a critical failure (source ${hp(source)}, user ${hp(singer)})`);
            const reflected = await reflect(10, 30);
            const lines = resultsOf(reflected);
            h.assert(lines.some((line) => /33 against DC 30/.test(line)), `33 against DC 30 (${JSON.stringify(lines)})`);
            h.assert(lines.some((line) => line.includes(source.name) && /takes 10 sonic damage, turned back/.test(line)), `10 sonic turned back on the source (${JSON.stringify(lines)})`);
            await h.until(() => hp(source) === sourceBefore - 10, `the source takes 10 (${sourceBefore} → ${hp(source)})`, { timeout: 8000 });
            await h.until(() => hp(singer) === 40, `the user regains the other 10 (30 → ${hp(singer)}; ${JSON.stringify(lines)})`, { timeout: 8000 });
            return { failed: resultsOf(failed), reflected: lines, source: hp(source), user: hp(singer) };
        },

        // Soulcutter (Heroic)'s Soulcutting Storm (legend-readings.js; plan.castCaster, scripts/casts.js): its cast card of Weapon Storm, applied:
        // its caster gets "spirit Weapon Storm" — PF2e's DamageAlteration overriding the damage type of its spell damage to spirit, predicated
        // item:slug:weapon-storm, for 1 round — made before the spell module's cast, and the card's line says so. (Whether the spell module's
        // Weapon Storm damage roll then reads spirit is that roll's, pressed on the spell's own card: see the run notes.)
        async b4G2SoulcutterStormSpirit(scene) {
            assertSpells();
            await h.clearSquares(scene, [[5, 8]]);
            const { actor: wielder, token: wielderToken } = await h.creature(scene, "Soulcutter Storm Caster", { type: "character", x: 5, y: 8, level: 20 });
            const blade = await h.give(wielder, "Soulcutter (Heroic)");
            await blade.update({ ...held(2), "system.equipped.invested": true });
            await wielderToken.object?.control?.();
            const storm = () => wielder.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "ruleEffect") === "spirit Weapon Storm");
            try {
                const since = Date.now();
                await live().activate(blade.uuid, 1);
                const castCard = await h.messageAfter(since, h.itemCard("cast"), { what: "Soulcutting Storm's cast card" });
                h.assert(stateOf(castCard).plan.spell?.name === "Weapon Storm" && stateOf(castCard).plan.castCaster, `Weapon Storm, with its caster's rules (${stateOf(castCard).plan.spell?.name})`);
                await applyCast(castCard, {});
                await h.until(() => storm(), `the caster's "spirit Weapon Storm" Effect (${effectNames(wielder)})`, { timeout: 10000 });
                const rule = (storm().system.rules ?? []).find((entry) => entry.key === "DamageAlteration");
                h.assert(rule?.value === "spirit" && rule.mode === "override" && rule.property === "damage-type" && [].concat(rule.selectors ?? rule.selector ?? []).includes("spell-damage") && JSON.stringify(rule.predicate ?? []).includes("item:slug:weapon-storm"), `PF2e's DamageAlteration to spirit on Weapon Storm's damage (${JSON.stringify(storm().system.rules)})`);
                h.assert(Number(storm().system.duration.value) === 1 && storm().system.duration.unit === "rounds", `for 1 round (${JSON.stringify(storm().system.duration)})`);
                const cast = await h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
                h.assert(Number(storm()._stats?.createdTime ?? 0) <= Number(cast.timestamp ?? Infinity), `the Effect made before the cast (${storm()._stats?.createdTime} / ${cast.timestamp})`);
                await h.until(() => resultsOf(castCard).some((line) => /casts Weapon Storm/.test(line)), `the cast's line (${JSON.stringify(resultsOf(castCard))})`, { timeout: 8000 });
                h.assert(resultsOf(castCard).some((line) => line.includes(wielder.name) && /All the damage its Weapon Storm deals is spirit damage/.test(line)), `the card's line for it (${JSON.stringify(resultsOf(castCard))})`);
                return { results: resultsOf(castCard), effect: storm().name, cast: cast.id };
            } finally {
                await closeWindows(/Weapon Storm|caster choices/i);
            }
        },

        // Soulcutter (Heroic)'s Shame Demon (legend-readings.js; item.sinVulnerability — scripts/sin-vulnerability.js, src/live/sin-vulnerability.js;
        // item.immunity): its item card at a Monster Core succubus targeted: its Rejection Vulnerability's 2d6 mental rolled and applied through
        // PF2e (its Hit Points down by the card's number), the ability's words whispered (to the GM, as to the wielder's owners), and the "Immune:"
        // Effect for 24 hours. Used again at it: refused ("still immune"), no more damage.
        async b4G2SoulcutterShameDemon(scene) {
            await h.clearSquares(scene, [[7, 8], [9, 8]]);
            const { actor: wielder, token: wielderToken } = await h.creature(scene, "Soulcutter Shamer", { type: "character", x: 7, y: 8, level: 20 });
            const { actor: succubus, token: succubusToken } = await fixtureFrom(scene, SUCCUBUS, "Shame Succubus", { x: 9, y: 8 });
            const blade = await h.give(wielder, "Soulcutter (Heroic)");
            await blade.update({ ...held(2), "system.equipped.invested": true });
            await wielderToken.object?.control?.();
            const shame = async () => {
                const since = Date.now();
                await live().activate(blade.uuid, 2);
                return h.messageAfter(since, h.itemCard("item"), { what: "Shame Demon's card" });
            };
            const immune = () => succubus.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "immunity") === "soulcutter-heroic-shame-demon");
            const before = hp(succubus);
            const first = await shame();
            const since = Date.now();
            await live().apply(first.id, { targets: [succubusToken.uuid] });
            await h.until(() => stateOf(first)?.status === "applied", `the card applied (${JSON.stringify(resultsOf(first))})`, { timeout: 8000 });
            const line = resultsOf(first).find((entry) => /Rejection Vulnerability set off \((\d+) damage\)/.test(entry));
            h.assert(line, `its Rejection Vulnerability set off (${JSON.stringify(resultsOf(first))})`);
            const dealt = Number(/\((\d+) damage\)/.exec(line)[1]);
            h.assert(dealt >= 2 && dealt <= 12, `2d6 rolled (${dealt})`);
            await h.until(() => hp(succubus) === before - dealt, `its Hit Points down by ${dealt} (${before} → ${hp(succubus)})`, { timeout: 8000 });
            const whisper = await h.messageAfter(since, (message) => (message.whisper ?? []).length > 0 && /Rejection Vulnerability/.test(message.content ?? ""), { what: "the whisper of its Rejection Vulnerability" });
            h.assert(whisper.whisper.some((id) => game.users.get(id)?.isGM), `whispered to the GM (${JSON.stringify(whisper.whisper)})`);
            await h.until(() => immune(), `the "Immune:" Effect (${effectNames(succubus)})`, { timeout: 8000 });
            h.assert(Number(immune().system.duration.value) === 24 && immune().system.duration.unit === "hours", `for 24 hours (${JSON.stringify(immune().system.duration)})`);
            const after = hp(succubus);
            const second = await shame();
            let refused = null;
            await live().apply(second.id, { targets: [succubusToken.uuid] }).catch((error) => {
                refused = error.message;
            });
            h.assert(/still immune/.test(refused ?? ""), `the second use refused (${refused})`);
            await h.wait(800);
            h.assert(hp(succubus) === after, `no more damage (${after} → ${hp(succubus)})`);
            return { line, dealt, whisper: text(whisper).slice(0, 200), refused };
        },

        // Hallajin Key's renewal (legend-readings.js; item.rest { day } — scripts/rest.js): its item card at a wounded PC ally (level 5, 5 of 30 Hit
        // Points, Fatigued, a spontaneous spellcasting entry's two 1st-rank slots spent) and an NPC ally, both targeted: PF2e's Rest for the Night
        // runs for the PC with no dialog (+5 Hit Points, Fatigued gone, its slots back), then a night's Hit Points again for the full day (+5: 15 in
        // all); the NPC gets the line to rest it by hand, its Hit Points unchanged.
        async b4G2HallajinRenewal(scene) {
            await h.clearSquares(scene, [[11, 8], [12, 8], [12, 9]]);
            const { actor: holder, token: holderToken } = await h.creature(scene, "Hallajin Holder", { type: "character", x: 11, y: 8, level: 7 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Hallajin Tired Ally", { type: "character", x: 12, y: 8, level: 5 });
            const { actor: npc, token: npcToken } = await h.creature(scene, "Hallajin NPC Ally", { x: 12, y: 9, level: 5, hp: 20 });
            await hitPoints(ally, 30);
            await ally.update({ "system.attributes.hp.value": 5 });
            await ally.increaseCondition("fatigued");
            const [entry] = await ally.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Spontaneous Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "spontaneous" }, ability: { value: "cha" }, proficiency: { value: 1 }, slots: { slot1: { max: 2, value: 0 } } } }]);
            const slotsLeft = () => Number(ally.items.get(entry.id)?.system?.slots?.slot1?.value ?? NaN);
            await h.until(() => hp(ally) === 5 && ally.hasCondition("fatigued") && slotsLeft() === 0, `5 Hit Points, Fatigued, its slots spent (${hp(ally)}; ${conditionNames(ally)}; ${slotsLeft()})`, { timeout: 5000 });
            const npcBefore = hp(npc);
            const key = await h.give(holder, "Hallajin Key");
            await key.update(held(1));
            await holderToken.object?.control?.();
            const since = Date.now();
            await live().activate(key.uuid, 2);
            const posted = await h.messageAfter(since, h.itemCard("item"), { what: "the key's renewal card" });
            await live().apply(posted.id, { targets: [allyToken.uuid, npcToken.uuid] });
            await h.until(() => stateOf(posted)?.status === "applied", `the card applied (${JSON.stringify(resultsOf(posted))})`, { timeout: 15000 });
            const lines = resultsOf(posted);
            const night = Math.max(Number(ally.system.abilities?.con?.mod ?? 0), 1) * Number(ally.level);
            await h.until(() => hp(ally) === Math.min(30, 5 + 2 * night), `a night's Hit Points twice: 5 + ${night} + ${night} (${hp(ally)}; ${JSON.stringify(lines)})`, { timeout: 8000 });
            h.assert(!ally.hasCondition("fatigued"), `Fatigued gone (${conditionNames(ally)})`);
            h.assert(slotsLeft() === 2, `its slots back (${slotsLeft()} of 2)`);
            h.assert(lines.some((line) => line.includes(ally.name) && /rests as for a night \(PF2e's Rest for the Night\)/.test(line)) && lines.some((line) => line.includes(ally.name) && new RegExp(`regains ${night} more Hit Points for the full day of rest`).test(line)), `its lines (${JSON.stringify(lines)})`);
            h.assert(lines.some((line) => line.includes(npc.name) && /isn't a character: PF2e's Rest for the Night is for characters only \(rest it by hand\)/.test(line)), `the NPC's line (${JSON.stringify(lines)})`);
            h.assert(hp(npc) === npcBefore, `the NPC's Hit Points unchanged (${npcBefore} → ${hp(npc)})`);
            h.assert(![...foundry.applications.instances.values()].some((app) => app.rendered && app.constructor.name === "DialogV2" && /Rest/i.test(String(app.title ?? ""))), "no Rest for the Night dialog");
            return { lines, hp: hp(ally), slots: slotsLeft() };
        },

        // Taljjae's Mask (The Nobleman)'s telekinetic Disarm (legend-readings.js; the ways card's "Held by a creature: Disarm", PF2e's own Disarm on the
        // item-action card, action.degree { criticalFailure: failure } — scripts/item-actions.js): at a creature 25 feet away (Reflex DC 40), a 1 on
        // the die — PF2e's roll a critical failure — is reported as a failure ("a failure (a critical failure rolled, made a failure by …)"), and its
        // user isn't made Off-Guard as a critical failure's row would.
        async b4G2TaljjaeDisarmFailure(scene) {
            await h.clearSquares(scene, [[14, 10], [19, 10]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Taljjae Mask Wearer", { type: "character", x: 14, y: 10, level: 18 });
            const { actor: holder, token: holderToken } = await h.creature(scene, "Taljjae Object Holder", { x: 19, y: 10, save: 30, alliance: "opposition" });
            const mask = await h.give(wearer, "Taljjae's Mask (The Nobleman)");
            await mask.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await wearerToken.object?.control?.();
            const { card: action } = await pressWay(mask, 0, /^Held by a creature: Disarm$/);
            const plan = stateOf(action)?.plan?.action ?? {};
            h.assert(stateOf(action)?.kind === "item-action" && plan.slug === "disarm" && plan.degree?.criticalFailure === "failure", `PF2e's Disarm, its critical failure a failure (${stateOf(action)?.kind}; ${JSON.stringify({ slug: plan.slug, degree: plan.degree })})`);
            const offGuards = () => wearer.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.timedCondition?.slug === "off-guard");
            const since = Date.now();
            await h.withDie(1, () => live().apply(action.id, { targets: [holderToken.uuid] }));
            const roll = await h.messageAfter(since, (message) => message.speaker?.actor === wearer.id && (message.flags?.pf2e?.context?.options ?? []).includes("action:disarm"), { what: "PF2e's Disarm roll", timeout: 10000 });
            h.assert(roll.flags.pf2e.context.outcome === "criticalFailure", `PF2e's roll a critical failure (${roll.flags.pf2e.context.outcome}, ${roll.rolls?.[0]?.total})`);
            await h.until(() => resultsOf(action).length, "the card's result", { timeout: 8000 });
            h.assert(resultsOf(action).some((line) => line.includes(holder.name) && /: a failure \(a critical failure rolled, made a failure by /.test(line)), `reported as a failure (${JSON.stringify(resultsOf(action))})`);
            await h.wait(800);
            h.assert(!offGuards().length, `no Off-Guard from a critical failure's row (${effectNames(wearer)}; ${conditionNames(wearer)})`);
            const criticalRow = plan.basic?.resolution?.outcomes?.criticalFailure?.effects ?? [];
            return { results: resultsOf(action), criticalRow: criticalRow.map((effect) => effect.slug) };
        },

        // Soulheart (Angelic)'s Defy Charg (legend-readings.js; plan.item.destroyed — scripts/foundry.js destroyUsedItem, once after every
        // recipient): its item card says the item is destroyed by it; applied, the soulheart is gone from its owner's sheet and the card says so
        // once ("Soulheart (Angelic) is destroyed.").
        async b4G2SoulheartDestroyed(scene) {
            await h.clearSquares(scene, [[1, 11]]);
            const { actor: holder } = await h.creature(scene, "Soulheart Holder", { x: 1, y: 11, level: 20 });
            const soulheart = await h.give(holder, "Soulheart (Angelic)");
            await soulheart.update(held(1));
            const since = Date.now();
            await live().activate(soulheart.uuid, 0);
            const posted = await h.messageAfter(since, h.itemCard("item"), { what: "Defy Charg's card" });
            h.assert(/destroyed/.test(text(posted)), `the card says it's destroyed by it (${text(posted).slice(0, 300)})`);
            await live().apply(posted.id, { drinker: 0 });
            await h.until(() => stateOf(posted)?.status === "applied", `the card applied (${JSON.stringify(resultsOf(posted))})`, { timeout: 8000 });
            await h.until(() => !holder.items.get(soulheart.id), "the soulheart deleted from the sheet", { timeout: 8000 });
            const said = resultsOf(posted).filter((line) => /is destroyed/.test(line));
            h.assert(said.length === 1 && /^Soulheart \(Angelic\) is destroyed\.$/.test(said[0]), `the line, once (${JSON.stringify(resultsOf(posted))})`);
            return { results: resultsOf(posted) };
        },

        // Ochre Fulcrum Lens' possession (legend-readings.js; plan.uninvest — scripts/uninvest.js on the ability module's "applied" hook): its user
        // holds the invested lens and has PF2e's Effect: Ochre Fulcrum Lens (from the compendium). Its +21 attack card at an adjacent creature with
        // AC 60 (a 10 on the die: a miss): nothing — the lens still invested, its Effect kept, no Effect on that creature. At another with AC 1 (a
        // hit): that creature gets "Effect: Ochre Fulcrum Lens" and the "Possessed by Nhimbaloth's splinter" note Effect, and once applied the
        // user's lens is no longer invested, its own Effect deleted, and a line says so.
        async b4G2OchrePossession(scene) {
            await h.clearSquares(scene, [[3, 11], [4, 11], [4, 12]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Ochre Lens Bearer", { type: "character", x: 3, y: 11, level: 11 });
            const { actor: missed, token: missedToken } = await h.creature(scene, "Ochre Missed", { x: 4, y: 11, ac: 60, alliance: "opposition" });
            const { actor: possessed, token: possessedToken } = await h.creature(scene, "Ochre Possessed", { x: 4, y: 12, ac: 1, alliance: "opposition" });
            const lens = await h.give(user, "Ochre Fulcrum Lens");
            await lens.update({ ...held(1), "system.equipped.invested": true });
            const template = await fromUuid(OCHRE_EFFECT).catch(() => null);
            h.assert(template, "PF2e's Effect: Ochre Fulcrum Lens");
            const source = game.items?.fromCompendium ? game.items.fromCompendium(template) : template.toObject();
            delete source._id;
            foundry.utils.setProperty(source, "_stats.compendiumSource", OCHRE_EFFECT);
            foundry.utils.setProperty(source, "flags.core.sourceId", OCHRE_EFFECT);
            await user.createEmbeddedDocuments("Item", [source]);
            const ownEffect = () => user.itemTypes.effect.find((effect) => (effect._stats?.compendiumSource ?? effect.flags?.core?.sourceId) === OCHRE_EFFECT);
            const lensEffect = (actor) => actor.itemTypes.effect.find((effect) => effect.name === "Effect: Ochre Fulcrum Lens");
            await h.until(ownEffect, `the user's own Effect: Ochre Fulcrum Lens (${effectNames(user)})`, { timeout: 5000 });
            await userToken.object?.control?.();
            const attack = async (token) => {
                let since = Date.now();
                await live().activate(lens.uuid, 1);
                const posted = await h.messageAfter(since, h.itemCard("expose"), { what: "the lens's attack card" });
                since = Date.now();
                await live().apply(posted.id, { targets: [token.uuid] });
                const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsActor(message, token.actor), { what: "the ability module's attack card" });
                h.assert(Number(checkOf(save).modifier) === 21, `its +21 (${JSON.stringify(checkOf(save))})`);
                await h.withDie(10, () => h.rollAndApply(save));
                return since;
            };
            await attack(missedToken);
            await h.wait(2000);
            h.assert(user.items.get(lens.id)?.system?.equipped?.invested === true && ownEffect() && !lensEffect(missed), `a miss changes nothing (invested ${user.items.get(lens.id)?.system?.equipped?.invested}; ${effectNames(user)} / ${effectNames(missed)})`);
            const since = await attack(possessedToken);
            await h.until(() => lensEffect(possessed), `the creature hit gets Effect: Ochre Fulcrum Lens (${effectNames(possessed)})`, { timeout: 10000 });
            h.assert(possessed.itemTypes.effect.some((effect) => /Possessed by Nhimbaloth's splinter$/.test(effect.name)), `the possession's note Effect (${effectNames(possessed)})`);
            await h.until(() => user.items.get(lens.id)?.system?.equipped?.invested === false, "the user no longer invested in the lens", { timeout: 8000 });
            await h.until(() => !ownEffect(), `the user's own Effect: Ochre Fulcrum Lens gone (${effectNames(user)})`, { timeout: 8000 });
            const line = await h.messageAfter(since, (message) => /is no longer invested in Ochre Fulcrum Lens/.test(message.content ?? ""), { what: "the line saying so" });
            return { line: text(line), possessed: effectNames(possessed) };
        },

        // The Dance (legend-readings.js; the RollOption air-initiative-thrice on an Effect, scripts/initiative-thrice.js on updateCombatant): its item
        // card gives its user the Effect. In a fixture encounter its initiative is rolled (PF2e's, a 2 on the die), the two more d20s then rolled
        // by the module (19s, where the die holds): a chat line lists the three totals, the first being PF2e's roll, and "<best> kept"; the
        // combatant's initiative is set to the best of the three, and the Effect is gone.
        async b4G2DanceInitiativeThrice(scene) {
            await h.clearSquares(scene, [[6, 11]]);
            const { actor: dancer, token: dancerToken } = await h.creature(scene, "Dance Card Holder", { x: 6, y: 11, level: 10 });
            const dance = await h.give(dancer, "The Dance");
            await dance.update({ "system.equipped.invested": true });
            let since = Date.now();
            await live().activate(dance.uuid, 0);
            const posted = await h.messageAfter(since, h.itemCard("item"), { what: "The Dance's card" });
            await live().apply(posted.id, { drinker: 0 });
            const thrice = () => dancer.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === THRICE));
            await h.until(thrice, `the Effect with the RollOption ${THRICE} (${effectNames(dancer)})`, { timeout: 8000 });
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
            try {
                const [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: dancerToken.id, sceneId: scene.id, actorId: dancer.id }]);
                since = Date.now();
                const said = (message) => message.speaker?.actor === dancer.id && /rolled three times \(a fortune effect\)/.test(message.content ?? "");
                const line = await h.withDie(19, async () => {
                    await h.withDie(2, () => combat.rollInitiative([combatant.id], { skipDialog: true }));
                    return h.messageAfter(since, said, { what: "the line of its three initiative totals", timeout: 10000 });
                });
                const first = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "initiative" && message.speaker?.actor === dancer.id, { what: "PF2e's initiative roll" });
                const found = /rolled three times \(a fortune effect\) — (-?\d+), (-?\d+), (-?\d+)\. (-?\d+) kept/.exec(text(line));
                h.assert(found, `three totals and the one kept (${text(line)})`);
                const [a, b, c, kept] = found.slice(1).map(Number);
                h.assert(a === Number(first.rolls?.[0]?.total), `the first PF2e's roll (${a} / ${first.rolls?.[0]?.total})`);
                h.assert(kept === Math.max(a, b, c), `the best kept (${[a, b, c]} → ${kept})`);
                await h.until(() => Number(combat.combatants.get(combatant.id)?.initiative) === kept, `the combatant's initiative set to ${kept} (${combat.combatants.get(combatant.id)?.initiative})`, { timeout: 8000 });
                h.assert(!thrice(), `the Effect gone (${effectNames(dancer)})`);
                return { totals: [a, b, c], kept, initiative: combat.combatants.get(combatant.id)?.initiative };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // The Waxworks (legend-readings.js; item.scrape { types fire, mental, die 6, effect "Hot wax" } — scripts/scrape.js): its ways card's "Hot wax
        // lines" — the save card at its user's class or spell DC (an NPC of level 9's) — at two creatures (Fortitude 15 below that DC, a 10 on the
        // die: a failure): each takes 4d6 persistent fire and 4d6 persistent mental and gets the "Hot wax" note Effect granting PF2e's Confused.
        // "Scrape off the goo (an Interact)" at the first: its persistent fire and mental 3d6 each, still confused; two scrapes more: 1d6 each,
        // and its Hot wax Effect and the Confused it granted are gone. The other creature keeps 4d6 of each and stays confused.
        async b4G2WaxworksScrape(scene) {
            await h.clearSquares(scene, [[8, 11], [9, 11], [9, 12]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Waxworks Reader", { x: 8, y: 11, level: 9 });
            const { actor: scraped, token: scrapedToken } = await h.creature(scene, "Waxworks Scraped", { x: 9, y: 11, hp: 300, alliance: "opposition" });
            const { actor: stuck, token: stuckToken } = await h.creature(scene, "Waxworks Stuck", { x: 9, y: 12, hp: 300, alliance: "opposition" });
            const wax = await h.give(user, "The Waxworks");
            await wax.update({ "system.equipped.invested": true });
            await userToken.object?.control?.();
            const persistent = (actor, type) => actor.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === type)?.system?.persistent?.formula ?? null;
            const hotWax = (actor) => actor.itemTypes.effect.find((effect) => /^The Waxworks/.test(effect.name) && /: Hot wax$/.test(effect.name));
            const both = (actor, formula) => persistent(actor, "fire") === formula && persistent(actor, "mental") === formula;
            const lines = await pressWay(wax, 0, /^Hot wax lines$/);
            const check = stateOf(lines.card)?.plan?.resolution?.check ?? {};
            const expected = user.system.attributes.classOrSpellDC?.value ?? Math.max(user.system.attributes.classDC?.value ?? 0, user.system.attributes.spellDC?.value ?? 0);
            const dc = Number(check.against?.value);
            h.assert(check.statistic === "fortitude" && dc === expected && dc > 0, `Fortitude at its user's class or spell DC ${expected} (${JSON.stringify(check)})`);
            for (const actor of [scraped, stuck]) await actor.update({ "system.saves.fortitude.value": dc - 15 });
            let since = Date.now();
            await live().apply(lines.card.id, { targets: [scrapedToken.uuid, stuckToken.uuid] });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsActor(message, scraped) && targetsActor(message, stuck), { what: "the lines' save card at both" });
            await h.withDie(10, () => h.rollAndApply(save));
            for (const actor of [scraped, stuck]) {
                await h.until(() => both(actor, "4d6"), `${actor.name}: 4d6 persistent fire and 4d6 persistent mental (${conditionNames(actor)}; fire ${persistent(actor, "fire")}, mental ${persistent(actor, "mental")})`, { timeout: 10000 });
                await h.until(() => hotWax(actor) && actor.hasCondition("confused"), `${actor.name}: the Hot wax Effect, Confused (${effectNames(actor)}; ${conditionNames(actor)})`, { timeout: 8000 });
            }
            const scrape = async () => {
                const { card: posted } = await pressWay(wax, 0, /^Scrape off the goo/, { ways: lines.ways });
                await live().apply(posted.id, { targets: [scrapedToken.uuid] });
                await h.until(() => stateOf(posted)?.status === "applied", `the scrape applied (${JSON.stringify(resultsOf(posted))})`, { timeout: 8000 });
                return resultsOf(posted);
            };
            const once = await scrape();
            await h.until(() => both(scraped, "3d6"), `3d6 of each after a scrape (fire ${persistent(scraped, "fire")}, mental ${persistent(scraped, "mental")}; ${JSON.stringify(once)})`, { timeout: 8000 });
            h.assert(hotWax(scraped) && scraped.hasCondition("confused"), `still confused at 3d6 (${effectNames(scraped)}; ${conditionNames(scraped)})`);
            await scrape();
            const third = await scrape();
            await h.until(() => both(scraped, "1d6"), `1d6 of each after three scrapes (fire ${persistent(scraped, "fire")}, mental ${persistent(scraped, "mental")}; ${JSON.stringify(third)})`, { timeout: 8000 });
            await h.until(() => !hotWax(scraped) && !scraped.hasCondition("confused"), `the Hot wax Effect and its Confused gone (${effectNames(scraped)}; ${conditionNames(scraped)}; ${JSON.stringify(third)})`, { timeout: 8000 });
            h.assert(both(stuck, "4d6") && hotWax(stuck) && stuck.hasCondition("confused"), `the other creature unchanged (fire ${persistent(stuck, "fire")}, mental ${persistent(stuck, "mental")}; ${conditionNames(stuck)})`);
            return { dc, third, scraped: conditionNames(scraped), stuck: conditionNames(stuck) };
        },

        // Halcyon Heart's net (legend-readings.js; plan.heldCounteract — scripts/hit-counteract.js on the ability module's "applied" hook;
        // counteract.fortuneVs — scripts/counteract.js): thrown (its user's simple thrown attack, a 10 on the die) at a demon 10 feet away with AC 1:
        // a hit — Off-Guard, and the "Netted demon" note Effect with PF2e's RollTwice keeping the lower on its Escapes; then the counteract card is
        // posted at the demon, its free row for its teleportation (rank 9, +38), and counteracting it (DC 30, rank 5) rolls 2d20kh + 38. Thrown at a
        // human the same way: its counteract card's roll is 1d20 + 38, and no "Netted demon" on it.
        async b4G2HalcyonNetDemon(scene) {
            await h.clearSquares(scene, [[12, 12], [14, 12], [12, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Halcyon Thrower", { type: "character", x: 12, y: 12, level: 21 });
            const { actor: demon, token: demonToken } = await h.creature(scene, "Halcyon Demon", { x: 14, y: 12, ac: 1, hp: 300, alliance: "opposition" });
            const { actor: human, token: humanToken } = await h.creature(scene, "Halcyon Human", { x: 12, y: 14, ac: 1, hp: 300, alliance: "opposition" });
            await demon.update({ "system.traits.value": ["demon", "fiend"] });
            await human.update({ "system.traits.value": ["human", "humanoid"] });
            const heart = await h.give(user, "Halcyon Heart");
            await heart.update(held(2));
            await userToken.object?.control?.();
            const netted = (actor) => actor.itemTypes.effect.find((effect) => /: Netted demon$/.test(effect.name));
            // Thrown at the creature, its attack card hit, then its counteract card's free row counteracted → the counteract roll's formula.
            const throwAt = async (actor, token) => {
                let since = Date.now();
                await live().activate(heart.uuid, 0);
                const posted = await h.messageAfter(since, h.itemCard("expose"), { what: "the net's card" });
                since = Date.now();
                await live().apply(posted.id, { targets: [token.uuid] });
                const attack = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsActor(message, actor), { what: `the net's attack card at ${actor.name}` });
                await h.withDie(10, () => h.rollAndApply(attack));
                const counter = await h.messageAfter(since, (message) => h.itemCard("counteract")(message) && stateOf(message)?.drinkers?.[0]?.actorUuid === actor.uuid, { what: `the counteract card at ${actor.name}`, timeout: 10000 });
                const state = stateOf(counter);
                h.assert(state.step === "pick" && state.rows?.[0]?.kind === "free" && state.counteract.rank === 9 && state.counteract.modifier === 38, `its free row, rank 9, +38 (${JSON.stringify({ step: state.step, rows: state.rows, rank: state.counteract.rank, modifier: state.counteract.modifier })})`);
                const own = [...(actor.traits ?? [])].filter((trait) => ["demon", "human"].includes(trait));
                h.assert(own.length && own.every((trait) => (state.counteract.struckTraits ?? []).includes(trait)) && JSON.stringify(state.counteract.fortuneVs) === '["demon"]', `the creature's traits on it (${JSON.stringify(own)} in ${JSON.stringify(state.counteract.struckTraits)}), fortune against demons (${JSON.stringify(state.counteract.fortuneVs)})`);
                since = Date.now();
                await live().apply(counter.id, { rows: [{ ticked: true, dc: 30, rank: 5 }] });
                const roll = await h.messageAfter(since, (message) => /counteract its teleportation/.test(message.flavor ?? "") && message.rolls?.length, { what: "the counteract roll" });
                await h.until(() => stateOf(counter)?.status === "applied", "the counteract card applied", { timeout: 8000 });
                return { formula: String(roll.rolls[0].formula), results: resultsOf(counter) };
            };
            const atDemon = await throwAt(demon, demonToken);
            await h.until(() => demon.hasCondition("off-guard"), `the demon Off-Guard (${conditionNames(demon)})`, { timeout: 8000 });
            await h.until(() => netted(demon), `the "Netted demon" note Effect (${effectNames(demon)})`, { timeout: 8000 });
            const twice = (netted(demon).system.rules ?? []).find((rule) => rule.key === "RollTwice");
            h.assert(twice?.keep === "lower" && JSON.stringify(twice.predicate ?? []).includes("action:escape"), `RollTwice keeping the lower on its Escapes (${JSON.stringify(netted(demon).system.rules)})`);
            h.assert(/^2d20kh\s*\+\s*38$/.test(atDemon.formula), `rolled twice, the higher kept, against a demon (${atDemon.formula})`);
            const atHuman = await throwAt(human, humanToken);
            h.assert(/^1d20\s*\+\s*38$/.test(atHuman.formula), `rolled once against a human (${atHuman.formula})`);
            h.assert(!netted(human), `no "Netted demon" on the human (${effectNames(human)})`);
            return { demon: atDemon, human: atHuman };
        }
    };
};
