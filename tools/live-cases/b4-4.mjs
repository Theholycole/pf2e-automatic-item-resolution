// The fourth batch's fourth group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Every item of the group has new live code (the b4/4 merge 004b616, src/compiler/unique-rules.js's readers played by scripts/feat-uses.js,
// bonds.js, found.js, shield-repair.js, objects.js's reach, douse and PF2e Repair, casts.js's castRankBy, castDegree.belowLevel and castBonus.ifKnows,
// live.js's alsoReadied, alsoUserSave, gate.lit, strike.killed, putOut, ruleEffects' replaces and attackFloor, restore and revive, bolsterPhantom;
// counteract.js's failCopies and endsBond; half-damage.js's no-damage), so each has a case — Ancestral Embrace's Avatar too, its battle form PF2e's
// BattleForm built by hand. Seen while writing them: the gate counts a damage roll as its user's last roll (Shadowed Scale's kill), and a readied
// Effect against damage that damage brings to 0 isn't spent (Redeemer's Pistol's first way) — see the result's bugs.
const ABILITY = "pf2e-automatic-ability-resolution";
const FIXTURE = "liveCheckFixture";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const worn = { "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true };
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    const cardOf = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card ?? null;
    const saveCardAt = (actor) => (message) => h.abilitySaveCard(message) && (cardOf(message)?.targets ?? []).some((entry) => entry.actorUuid === actor.uuid);
    const abilityCardAt = (actor) => (message) => Boolean(message.flags?.[ABILITY]?.card) && (cardOf(message)?.targets ?? []).some((entry) => entry.actorUuid === actor.uuid);
    const since = () => Date.now();
    const after = (from) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= from);
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const outcomeOf = (attack) => attack.flags.pf2e.context.outcome;
    const hit = (outcome) => ["success", "criticalSuccess"].includes(outcome);
    const DamageRoll = () => CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
    const damage = async (actor, formula) => actor.applyDamage({ damage: await new (DamageRoll())(formula).evaluate(), token: actor.getActiveTokens(true, true)[0] });
    // (A bare character's maximum Hit Points: 0 — PF2e then takes no damage on it. An Effect gives it some, its Hit Points filled.)
    const hitPoints = async (actor, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value }], duration: UNLIMITED } }]);
        await h.until(() => actor.system.attributes.hp.max >= value, `${value} maximum Hit Points`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": actor.system.attributes.hp.max });
    };
    const strikeOf = (actor, item) => (actor.system.actions ?? []).find((action) => action.item?.id === item.id);
    // (A move on the map that needs no animation frame: a hidden browser pane runs none.)
    const place = async (token, x, y) => {
        await token.update({ x: x * 100, y: y * 100 }, { teleport: true, animate: false });
        await h.until(() => token.x === x * 100 && token.y === y * 100 && (!token.object || (token.object.document.x === x * 100 && token.object.document.y === y * 100)), `${token.name} at ${x},${y}`, { timeout: 5000 });
        await h.wait(300);
    };
    // (The applications open now: those a case's cast opens after are closed by it — a dialog left open fails the next case.)
    const appsNow = () => new Set([...foundry.applications.instances.values(), ...Object.values(ui.windows ?? {})]);
    const closeNewApps = async (before) => {
        for (const app of appsNow()) if (!before.has(app) && /Dialog|Prompt/.test(app.constructor?.name ?? "")) await app.close?.().catch?.(() => null);
    };
    // (An encounter of this check's own, flagged as its fixture; entries [{ token, initiative }], highest first.)
    const encounter = async (scene, entries) => {
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        await combat.createEmbeddedDocuments("Combatant", entries.map(({ token, initiative }) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actor.id, initiative })));
        await combat.startCombat();
        await h.wait(500);
        return combat;
    };
    // (PF2e's roll dialog for a check the module rolls with no event, its Repair's: off for this GM while fn runs, put back after.)
    const withoutCheckDialogs = async (fn) => {
        const was = game.user.getFlag("pf2e", "settings.showCheckDialogs");
        await game.user.setFlag("pf2e", "settings.showCheckDialogs", false);
        try {
            return await fn();
        } finally {
            if (was === undefined) await game.user.unsetFlag("pf2e", "settings.showCheckDialogs").catch(() => null);
            else await game.user.setFlag("pf2e", "settings.showCheckDialogs", was);
        }
    };
    // (And one already open, should the setting not take: PF2e's check dialog answered as its Roll button does.)
    const rollOpenCheckDialogs = () => {
        for (const app of Object.values(ui.windows ?? {})) if (app.constructor?.name === "CheckModifiersDialog" && !app.isResolved) {
            app.resolve?.(true);
            app.isResolved = true;
            app.close?.();
        }
    };
    const checkOf = (actor, slug) => (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === actor.id && (message.flags.pf2e.context.options ?? []).includes(`action:${slug}`);

    // Shadowed Scale's first activation after a hit at that creature, its last roll the attack roll (no damage roll after it): → the error, or null.
    const scaleAfterHit = async (scale, user, weapon, token) => {
        await h.target(token);
        const { attack } = await h.withDie(10, () => h.strike(user, weapon));
        return { attack, error: await errorOf(api().activate(scale.uuid, 0)) };
    };
    // Its body decomposed: activation 0 used since then (a hit on it its user's last roll, the creature dead), its card at that body, applied.
    const decompose = async (from, body) => {
        const card = await h.messageAfter(from, h.itemCard("expose"), { what: "the decomposition's card" }).catch(() => null);
        h.assert(card, "Shadowed Scale's card after the kill");
        const at = since();
        await api().apply(card.id, { targets: [] });
        const note = await h.messageAfter(at, abilityCardAt(body), { what: "the ability module's card at the body" });
        await h.applyAbilityCard(note);
        const soil = () => body.itemTypes.effect.find((effect) => (effect.system?.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "decomposed-into-soil"));
        await h.until(() => soil(), `the body's 'Decomposed into soil' note (${names(body)})`, { timeout: 10000 });
        return soil();
    };

    // Redeemer's Pistol's ways card, one way used: → { ways, fortune, expose? } (the cards it posts).
    const redeemerWay = async (pistol, choice, { expose = false } = {}) => {
        let from = since();
        await api().activate(pistol.uuid, 0);
        const ways = await h.messageAfter(from, h.itemCard("ways"), { what: "the pistol's ways card" });
        from = since();
        await api().apply(ways.id, { choice });
        const fortune = await h.messageAfter(from, h.itemCard("fortune"), { what: "the readied card" });
        const card = expose ? await h.messageAfter(from, h.itemCard("expose"), { what: "the card at the enemy" }) : null;
        return { ways, fortune, expose: card };
    };
    const readiedOf = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.rollTwice?.against);

    // Kaldemash's Lament's damage types now: its Strike's damage rolled with no message, each instance's type.
    const gunTypes = async (actor, gun) => {
        const roll = await strikeOf(actor, gun).damage({ event: h.shift(), createMessage: false });
        return [...new Set((roll?.instances ?? []).map((instance) => instance.type))];
    };
    const typeEffects = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.replaces === "damage-type");
    const typeOf = (effect) => (effect.system.rules ?? []).find((rule) => rule.key === "DamageAlteration")?.value ?? null;

    // The soulhearts' PCs, as scripts/live.js bolsterPhantom finds them: PF2e's party members, else the characters players own.
    const KEY = "soulheart-bastardhall";
    const partyPCs = () => (game.actors?.party?.members?.length ? [...game.actors.party.members] : game.actors.filter((actor) => actor.type === "character" && actor.hasPlayerOwner));
    const partyHpOf = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.partyHp?.key === KEY);

    return {
        // Ancestral Embrace's first activation (src/live/feat-use-card.js, scripts/feat-uses.js): "Trigger You use an ancestry feat that has a limited
        // number of uses per day; Effect You gain an additional use of the ancestry feat." Its user's 1/day ancestry feat (Cantorian Rejuvenation)
        // spent (PF2e's frequency 0): the feat-use card lists it as (0/1); Give sets its frequency to 1; the card pressed again lists nothing; spent
        // again, PF2e's Rest for the Night puts it back to its maximum.
        async b4G4AncestralFeatUse(scene) {
            await h.clearSquares(scene, [[4, 1]]);
            const { actor: user } = await h.creature(scene, "Embrace Ancestor", { type: "character", x: 4, y: 1, level: 20 });
            const armor = await h.give(user, "Ancestral Embrace");
            await armor.update(worn);
            const feat = await h.give(user, "Cantorian Rejuvenation", "pf2e.feats-srd");
            const frequency = () => user.items.get(feat.id)?.system?.frequency ?? {};
            h.assert(feat.system.category === "ancestry" && frequency().max === 1 && ["day", "PT24H"].includes(frequency().per), `a 1/day ancestry feat (${feat.system.category}; ${JSON.stringify(frequency())})`);
            await feat.update({ "system.frequency.value": 0 });
            await h.until(() => frequency().value === 0, "its use spent", { timeout: 5000 });
            let from = since();
            await api().activate(armor.uuid, 0);
            const card = await h.messageAfter(from, h.itemCard("feat-use"), { what: "the feat-use card" });
            const listed = stateOf(card).feats ?? [];
            const at = listed.findIndex((entry) => entry.id === feat.id);
            h.assert(at >= 0 && listed[at].value === 0 && listed[at].max === 1, `Cantorian Rejuvenation listed, 0/1 (${JSON.stringify(listed)})`);
            h.assert(String(card.content).includes(`${feat.name} (0/1)`), "its option reads (0/1)");
            await api().apply(card.id, { pick: at });
            await h.until(() => frequency().value === 1, `one more use given (${JSON.stringify(frequency())})`, { timeout: 8000 });
            h.assert(resultsOf(card).some((line) => /one more use of Cantorian Rejuvenation \(1\/1\)/.test(line)), `the card's line (${JSON.stringify(resultsOf(card))})`);
            from = since();
            await api().activate(armor.uuid, 0);
            const again = await h.messageAfter(from, h.itemCard("feat-use"), { what: "the feat-use card again" });
            h.assert(!(stateOf(again).feats ?? []).some((entry) => entry.id === feat.id), `nothing to give a feat with all its uses (${JSON.stringify(stateOf(again).feats)})`);
            // (Used again, then its daily preparations: PF2e's own reset.)
            await feat.update({ "system.frequency.value": 0 });
            await h.until(() => frequency().value === 0, "the extra use spent", { timeout: 5000 });
            h.assert(typeof game.pf2e?.actions?.restForTheNight === "function", "PF2e's Rest for the Night");
            await game.pf2e.actions.restForTheNight({ actors: [user], skipDialog: true });
            await h.until(() => frequency().value === 1, `back to its maximum after Rest for the Night (${JSON.stringify(frequency())})`, { timeout: 10000 });
            return { listed, given: resultsOf(card) };
        },

        // Ancestral Embrace's Avatar (src/compiler/unique-rules.js withOwnAvatar: PF2e's BattleForm on the item card's note Effect): "you gain the
        // effects of avatar … instead of those associated with a deity". Applied, its user (level 20) is Huge, AC 25 + 20, 30 temporary Hit Points,
        // its only Strikes Spear and Blowgun at +33; the Blowgun's damage rolled with no message: 1d6+3 piercing and 5d6 poison (the DamageDice on
        // item:slug:blowgun — if the battle form's Strike lacks that slug, the poison is missing: switch its selector to blowgun-damage).
        async b4G4AncestralAvatar(scene) {
            await h.clearSquares(scene, [[4, 3]]);
            const { actor: user } = await h.creature(scene, "Embrace Avatar", { type: "character", x: 4, y: 3, level: 20 });
            await hitPoints(user, 30);
            const armor = await h.give(user, "Ancestral Embrace");
            await armor.update(worn);
            const from = since();
            await api().activate(armor.uuid, 2);
            const card = await h.messageAfter(from, h.itemCard("item"), { what: "the Avatar's card" });
            await api().apply(card.id);
            const form = () => user.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "BattleForm"));
            await h.until(() => form(), `the Avatar's Effect with PF2e's BattleForm (${names(user)})`, { timeout: 10000 });
            const lasts = form().system.duration;
            h.assert(lasts.value === 1 && lasts.unit === "minutes", `for 1 minute (${JSON.stringify(lasts)})`);
            await h.until(() => (user.system.traits?.size?.value ?? user.size) === "huge", `Huge (${user.system.traits?.size?.value ?? user.size})`, { timeout: 8000 });
            await h.until(() => Number(user.attributes.ac.value) === 45, `AC 25 + 20 (${user.attributes.ac.value})`, { timeout: 8000 });
            await h.until(() => Number(user.system.attributes.hp.temp) === 30, `30 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
            const strikes = () => (user.system.actions ?? []).filter((action) => action.type === "strike");
            const said = () => JSON.stringify(strikes().map((action) => [action.slug, action.label, action.totalModifier]));
            await h.until(() => strikes().length === 2 && strikes().every((action) => /spear|blowgun/i.test(`${action.slug} ${action.label}`)), `only Spear and Blowgun (${said()})`, { timeout: 8000 });
            h.assert(strikes().every((action) => Number(action.totalModifier) === 33), `both at +33 (${said()})`);
            const blowgun = strikes().find((action) => /blowgun/i.test(`${action.slug} ${action.label}`));
            const roll = await blowgun.damage({ event: h.shift(), createMessage: false });
            const instances = (roll?.instances ?? []).map((instance) => ({ type: instance.type, formula: String(instance.formula ?? instance.head?.expression ?? "") }));
            const piercing = instances.find((instance) => instance.type === "piercing");
            const poison = instances.find((instance) => instance.type === "poison");
            h.assert(piercing && /1d6/.test(piercing.formula) && /3/.test(piercing.formula.replace(/1d6/, "")), `1d6+3 piercing (${JSON.stringify(instances)})`);
            h.assert(poison && /5d6/.test(poison.formula), `plus 5d6 poison (${JSON.stringify(instances)})`);
            return { strikes: said(), blowgun: instances, ac: user.attributes.ac.value };
        },

        // Forgefather's Seal's Retributive Rebuff (plan.alsoReadied beside its cast, scripts/live.js): "The attack's damage is reduced by 100 and you
        // cast earthquake (DC 40), centered directly on the triggering creature." After a Strike hits its wearer, the reaction posts the readied
        // card beside the Earthquake cast card (DC 40). The readied card applied: resistance 100 to all damage; then the triggering hit's damage —
        // 150 bludgeoning, so some goes through — takes 50 and spends the Effect. (The seal sits in its wearer's inventory: PF2e keeps no
        // forgefathersSeal armor rune key to etch.)
        async b4G4ForgefatherRebuff(scene) {
            await h.clearSquares(scene, [[4, 5], [5, 5]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Seal Wearer", { x: 4, y: 5, hp: 300, ac: 1, level: 24 });
            const { actor: attacker, token: attackerToken } = await h.creature(scene, "Seal Attacker", { type: "character", x: 5, y: 5, level: 10, alliance: "opposition" });
            const seal = await h.give(wearer, "Forgefather's Seal");
            const sword = await h.give(attacker, "Longsword");
            await sword.update(held(1));
            await attackerToken.object?.control?.();
            await h.target(wearerToken);
            const { attack } = await h.withDie(10, () => h.strike(attacker, sword));
            h.assert(hit(outcomeOf(attack)), `the triggering hit (AC 1): ${outcomeOf(attack)}`);
            const from = since();
            await api().activate(seal.uuid, 0);
            const readied = await h.messageAfter(from, h.itemCard("fortune"), { what: "the readied card" });
            const cast = await h.messageAfter(from, h.itemCard("cast"), { what: "the Earthquake cast card" });
            const castPlan = JSON.stringify(stateOf(cast).plan);
            h.assert(/Earthquake/.test(castPlan) && /"dc":40\b/.test(castPlan), `Earthquake at DC 40 (${castPlan.slice(0, 300)})`);
            await api().apply(readied.id);
            const guard = () => readiedOf(wearer);
            await h.until(() => guard()?.system?.rules?.some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes("all-damage") && Number(rule.value) === 100), `the readied Effect, resistance 100 to all damage (${names(wearer)})`, { timeout: 8000 });
            const before = hp(wearer);
            await damage(wearer, "150[bludgeoning]");
            await h.until(() => hp(wearer) === before - 50, `150 less 100 taken: ${before} → ${hp(wearer)}`, { timeout: 8000 });
            await h.until(() => !guard(), `the readied Effect spent by the damage (${names(wearer)})`, { timeout: 8000 });
            return { hp: [before, hp(wearer)], cast: stateOf(cast).plan?.spell?.name ?? null };
        },

        // Forgefather's Seal's passive and its Seal of Mending (scripts/shield-repair.js; scripts/objects.js reachChoices, objects.pauses): "any shield
        // you wield automatically recovers 10 Hit Points at the start of your turn each round" — its wearer (Chain Mail worn) holds a Steel Shield at
        // 15/20: at its turn's start, 20. Seal of Mending lists an adjacent ally's damaged Wooden Shield by the ally's name; picked, it's back to 12/12,
        // and its wearer gets the pause Effect; its shield at 15 again stays at 15 at its next turn's start; Rest for the Night ends the pause.
        async b4G4ForgefatherShieldsMending(scene) {
            await h.clearSquares(scene, [[4, 7], [5, 7]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Mending Wearer", { type: "character", x: 4, y: 7, level: 24 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Mending Ally", { x: 5, y: 7, level: 10 });
            const armor = await h.give(wearer, "Chain Mail");
            await armor.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true });
            const shield = await h.give(wearer, "Steel Shield");
            await shield.update({ ...held(1), "system.hp.value": 15 });
            const seal = await h.give(wearer, "Forgefather's Seal");
            const theirs = await h.give(ally, "Wooden Shield");
            await theirs.update({ "system.hp.value": 3 });
            const shieldHP = () => Number(wearer.items.get(shield.id)?.system?.hp?.value);
            const paused = () => wearer.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.pauses === "shield-repair");
            await h.until(() => wearer.wornArmor && shieldHP() === 15, `armor worn, the shield at 15 (${shieldHP()})`, { timeout: 5000 });
            const combat = await encounter(scene, [{ token: allyToken, initiative: 20 }, { token: wearerToken, initiative: 10 }]);
            try {
                // (Its wearer's turn starts: +10, up to 20.)
                await combat.nextTurn();
                await h.until(() => shieldHP() === 20, `the shield repaired at its wearer's turn start (${shieldHP()})`, { timeout: 10000 });
                // (Seal of Mending at the ally's shield.)
                const from = since();
                await api().activate(seal.uuid, 1);
                const card = await h.messageAfter(from, h.itemCard("objects"), { what: "Seal of Mending's card" });
                const choices = stateOf(card).choices ?? [];
                const at = choices.findIndex((choice) => choice.id === theirs.id && choice.actorUuid === ally.uuid);
                h.assert(at >= 0 && choices[at].name.includes(allyToken.name), `the ally's Wooden Shield listed with its name (${JSON.stringify(choices)})`);
                await api().apply(card.id, { pick: at });
                await h.until(() => Number(ally.items.get(theirs.id)?.system?.hp?.value) === 12, `the ally's shield at full Hit Points (${ally.items.get(theirs.id)?.system?.hp?.value})`, { timeout: 8000 });
                await h.until(() => paused().length === 1, `the pause Effect on the wearer (${names(wearer)})`, { timeout: 8000 });
                // (Paused: no repair at its next turn's start.)
                await shield.update({ "system.hp.value": 15 });
                await combat.nextTurn();
                await combat.nextTurn();
                await h.until(() => combat.combatant?.actorId === wearer.id, "its wearer's next turn", { timeout: 8000 });
                await h.wait(2000);
                h.assert(shieldHP() === 15, `no repair while paused (${shieldHP()})`);
                Hooks.callAll("pf2e.restForTheNight", wearer);
                await h.until(() => !paused().length, `the pause gone at its daily preparations (${names(wearer)})`, { timeout: 8000 });
                return { results: resultsOf(card), shield: shieldHP() };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Forgefather's Seal's Stalwart Sacrifice (src/compiler/unique-rules.js withSacrifice: item.restore, item.revive, plan.userEffects' note):
        // "Creatures of your choosing within 60 feet recover all their Hit Points. If any of the creatures are dead, they are instead brought back to
        // life with half of their maximum Hit Points … +4 status bonus to AC and saving throws, and fast healing 15 for 1 hour … you are turned into a
        // perfect statue". Used, its user is Petrified with the statue's note Effect. Applied at a wounded ally (20/50) and a dead creature (0/50):
        // the ally at 50 with PF2e's Effect: Forgefather's Seal (Stalwart Sacrifice) (AC 18 + 4); the dead one alive again at 25.
        async b4G4ForgefatherSacrifice(scene) {
            await h.clearSquares(scene, [[4, 9], [5, 9], [6, 9]]);
            const { actor: user } = await h.creature(scene, "Sacrifice Wearer", { x: 4, y: 9, hp: 100, level: 24 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Sacrifice Wounded", { x: 5, y: 9, hp: 20, level: 10 });
            const { actor: fallen, token: fallenToken } = await h.creature(scene, "Sacrifice Fallen", { x: 6, y: 9, hp: 0, level: 10 });
            h.assert(hp(ally) === 20 && ally.system.attributes.hp.max === 50 && hp(fallen) === 0 && fallen.system.attributes.hp.max === 50, `20/50 and 0/50 (${hp(ally)}/${ally.system.attributes.hp.max}, ${hp(fallen)}/${fallen.system.attributes.hp.max})`);
            const seal = await h.give(user, "Forgefather's Seal");
            const from = since();
            await api().activate(seal.uuid, 2);
            const card = await h.messageAfter(from, h.itemCard("item"), { what: "Stalwart Sacrifice's card" });
            const statue = () => user.itemTypes.effect.find((effect) => /statue/i.test(`${effect.name} ${effect.system?.description?.value ?? ""}`));
            await h.until(() => user.hasCondition("petrified") && statue(), `its user Petrified, with the statue's note (${names(user)})`, { timeout: 10000 });
            await api().apply(card.id, { targets: [allyToken.uuid, fallenToken.uuid] });
            const sacrificed = (actor) => actor.itemTypes.effect.find((effect) => /Stalwart Sacrifice/.test(effect.name));
            await h.until(() => hp(ally) === 50, `the ally at all its Hit Points (${hp(ally)})`, { timeout: 10000 });
            await h.until(() => sacrificed(ally), `PF2e's Effect on the ally (${names(ally)})`, { timeout: 8000 });
            await h.until(() => Number(ally.attributes.ac.value) === 22, `+4 status to AC: 22 (${ally.attributes.ac.value})`, { timeout: 8000 });
            await h.until(() => hp(fallen) === 25, `the dead one back at half its maximum, 25 (${hp(fallen)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            return { results: resultsOf(card), ally: hp(ally), fallen: hp(fallen) };
        },

        // Shadowed Scale, the Jungle Secret's first activation (src/compiler/strike-gate.js strike.any and strike.killed, scripts/live.js isDead):
        // "Requirements Your last action was a melee Strike that killed a living creature". Refused after a miss (d20 10 at AC 60), and after a hit at
        // a creature still alive; after a hit at a creature with 1 Hit Point, its PF2e damage roll and that damage applied (it dies), it's used: its
        // card at the slain body (none targeted), whose ability card gives it the 'Decomposed into soil' note with its decomposed-into-soil roll
        // option. (Expected to fail at the kill until the gate stops reading the damage roll as the user's last roll — see the result's bugs.)
        async b4G4ShadowedScaleKill(scene) {
            await h.clearSquares(scene, [[8, 1], [9, 1], [9, 2], [9, 0]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Scale Slayer", { type: "character", x: 8, y: 1, level: 22 });
            const { token: wallToken } = await h.creature(scene, "Scale Wall", { x: 9, y: 0, ac: 60, hp: 300, alliance: "opposition" });
            const { actor: tough, token: toughToken } = await h.creature(scene, "Scale Tough", { x: 9, y: 2, ac: 1, hp: 300, alliance: "opposition" });
            const { actor: prey, token: preyToken } = await h.creature(scene, "Scale Prey", { x: 9, y: 1, ac: 1, hp: 1, alliance: "opposition", level: 9 });
            const sword = await h.give(user, "Longsword");
            await sword.update(held(1));
            const scale = await h.give(user, "Shadowed Scale, the Jungle Secret");
            await scale.update(worn);
            await userToken.object?.control?.();
            const missed = await scaleAfterHit(scale, user, sword, wallToken);
            h.assert(!hit(outcomeOf(missed.attack)) && /Requirements need/.test(missed.error ?? ""), `refused after a miss (${outcomeOf(missed.attack)}: ${missed.error})`);
            const alive = await scaleAfterHit(scale, user, sword, toughToken);
            h.assert(hit(outcomeOf(alive.attack)) && /killed its creature/.test(alive.error ?? ""), `refused after a hit that didn't kill (${outcomeOf(alive.attack)}: ${alive.error}; ${hp(tough)} HP)`);
            // (The kill, as played: the hit, its damage roll, the damage applied.)
            await h.target(preyToken);
            const { action, attack } = await h.withDie(10, () => h.strike(user, sword));
            h.assert(hit(outcomeOf(attack)), `a hit at the prey: ${outcomeOf(attack)}`);
            let from = since();
            await (outcomeOf(attack) === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
            const rolled = await h.messageAfter(from, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
            await prey.applyDamage({ damage: game.messages.get(rolled.id).rolls[0], token: preyToken });
            await h.until(() => hp(prey) === 0, `the prey slain (${hp(prey)})`, { timeout: 5000 });
            from = since();
            const error = await errorOf(api().activate(scale.uuid, 0));
            h.assert(!error, `used after the kill — its last roll the damage roll of that Strike (${error})`);
            const soil = await decompose(from, prey);
            h.assert(/Miracle or Wish/.test(soil.system.description.value ?? ""), `its words (${soil.system.description.value})`);
            return { refused: [missed.error, alive.error], note: soil.name };
        },

        // Shadowed Scale, the Jungle Secret's second activation (src/compiler/unique-rules.js withSoilSummon, scripts/casts.js castRankBy): "Summon
        // Plant or Fungus … heightened to half the level of the creature, rounded up" — the cast refused for an unmarked creature targeted and for
        // the marked body 15 feet away; adjacent to its level-9 body (decomposed by the first activation after a hit and the GM setting its Hit
        // Points to 0), the cast at rank 5, the body not one of the spell's targets. (The kill's damage applied by hand here, so this case doesn't
        // wait on the gate's damage-roll reading: b4G4ShadowedScaleKill checks that.)
        async b4G4ShadowedScaleSummon(scene) {
            await h.clearSquares(scene, [[8, 4], [9, 4], [9, 5], [12, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Scale Gardener", { type: "character", x: 8, y: 4, level: 22 });
            const { actor: body, token: bodyToken } = await h.creature(scene, "Scale Body", { x: 9, y: 4, ac: 1, hp: 50, alliance: "opposition", level: 9 });
            const { token: plainToken } = await h.creature(scene, "Scale Plain", { x: 9, y: 5, ac: 1, hp: 0, alliance: "opposition", level: 9 });
            const sword = await h.give(user, "Longsword");
            await sword.update(held(1));
            const scale = await h.give(user, "Shadowed Scale, the Jungle Secret");
            await scale.update(worn);
            await userToken.object?.control?.();
            await h.target(bodyToken);
            const { attack } = await h.withDie(10, () => h.strike(user, sword));
            h.assert(hit(outcomeOf(attack)), `a hit at the body: ${outcomeOf(attack)}`);
            await body.update({ "system.attributes.hp.value": 0 });
            await h.until(() => hp(body) === 0, "the body slain", { timeout: 5000 });
            const killed = since();
            const error = await errorOf(api().activate(scale.uuid, 0));
            h.assert(!error, `the first activation used after the kill (${error})`);
            await decompose(killed, body);
            const before = appsNow();
            try {
                const from = since();
                await api().activate(scale.uuid, 1);
                const cast = await h.messageAfter(from, h.itemCard("cast"), { what: "the summon's cast card" });
                const unmarked = await errorOf(api().apply(cast.id, { targets: [plainToken.uuid] }));
                h.assert(/isn't the decomposed body/.test(unmarked ?? ""), `refused at an unmarked creature (${unmarked})`);
                await place(userToken, 12, 4);
                const far = await errorOf(api().apply(cast.id, { targets: [bodyToken.uuid] }));
                h.assert(/more than 5 feet/.test(far ?? ""), `refused 15 feet from the body (${far})`);
                await place(userToken, 8, 4);
                const cast2 = await errorOf(api().apply(cast.id, { targets: [bodyToken.uuid] }));
                h.assert(!cast2, `cast beside the body (${cast2})`);
                await h.until(() => stateOf(cast).status === "applied", "the cast card applied", { timeout: 15000 });
                const lines = resultsOf(cast);
                h.assert(lines.some((line) => /was level 9: Summon Plant or Fungus at rank 5/.test(line)), `rank 5 from the level-9 body (${JSON.stringify(lines)})`);
                h.assert(lines.some((line) => /casts Summon Plant or Fungus/.test(line)) && !lines.some((line) => /casts Summon Plant or Fungus[^.]* at [^.]*Scale Body/.test(line)), `cast, the body not its target (${JSON.stringify(lines)})`);
                return { results: lines };
            } finally {
                // (A dialog the spell module opens for the cast comes a moment after it.)
                await h.wait(1500);
                await closeNewApps(before);
            }
        },

        // Kaldemash's Lament's damage types (src/compiler/unique-rules.js withDamageTypeWays; ruleEffects' replaces "damage-type", scripts/until-rest.js
        // replacedBy's of): "Kaldemash's Lament can deal electricity, fire, or force damage. You choose the damage type when you target a creature".
        // The ways card's Fire, applied: an Effect of PF2e's DamageAlteration, its Strike's damage (rolled with no message) all fire. Then Electricity:
        // the fire Effect gone, one Effect left, its damage all electricity. (Force, the gun's own type, is the third button, the same Effect.)
        async b4G4KaldemashTypes(scene) {
            await h.clearSquares(scene, [[8, 7]]);
            const { actor: user } = await h.creature(scene, "Lament Duelist", { type: "character", x: 8, y: 7, level: 20 });
            const gun = await h.give(user, "Kaldemash's Lament");
            await gun.update(held(1));
            h.assert(strikeOf(user, gun), "a Strike with the gun");
            let from = since();
            await api().activate(gun.uuid, 0);
            const ways = await h.messageAfter(from, h.itemCard("ways"), { what: "the damage types' ways card" });
            const pick = async (name) => {
                const choice = (stateOf(ways).plan.ways ?? []).findIndex((way) => way.name === name);
                h.assert(choice >= 0, `the ${name} way`);
                const at = since();
                await api().apply(ways.id, { choice });
                const card = await h.messageAfter(at, h.itemCard("item"), { what: `the ${name} way's card` });
                await api().apply(card.id);
            };
            await pick("Fire");
            await h.until(() => typeEffects(user).length === 1 && typeOf(typeEffects(user)[0]) === "fire", `the fire Effect (${names(user)})`, { timeout: 8000 });
            const fire = await gunTypes(user, gun);
            h.assert(fire.length && fire.every((type) => type === "fire"), `its damage all fire (${fire.join(", ")})`);
            await pick("Electricity");
            await h.until(() => typeEffects(user).length === 1 && typeOf(typeEffects(user)[0]) === "electricity", `the electricity Effect in place of the fire one (${typeEffects(user).map(typeOf).join(", ")})`, { timeout: 8000 });
            const electricity = await gunTypes(user, gun);
            h.assert(electricity.length && electricity.every((type) => type === "electricity"), `its damage all electricity (${electricity.join(", ")})`);
            return { fire, electricity, effect: typeEffects(user)[0].name };
        },

        // Kaldemash's Lament flying on its own (src/compiler/unique-rules.js withFlyingGun; src/live/card.js attackFloorRule): "it makes a ranged
        // Strike … using your attack modifier with the weapon, or +31 if that's higher … the target is off-guard". Its user's own modifier with it
        // (untrained, its +3) is below 31: the Effect for 3 rounds gets a FlatModifier making up the difference, the Strike now at +31; its attack
        // roll at a creature has the target Off-Guard (PF2e's EphemeralEffect, "target:condition:off-guard" among its options).
        async b4G4KaldemashFlying(scene) {
            await h.clearSquares(scene, [[8, 9], [11, 9]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Lament Gunner", { type: "character", x: 8, y: 9, level: 20 });
            const { token: foeToken } = await h.creature(scene, "Lament Target", { x: 11, y: 9, ac: 60, hp: 300, alliance: "opposition" });
            const gun = await h.give(user, "Kaldemash's Lament");
            await gun.update(held(1));
            const own = Number(strikeOf(user, gun)?.totalModifier);
            h.assert(Number.isFinite(own) && own < 31, `its user's own modifier under +31 (${own})`);
            const from = since();
            await api().activate(gun.uuid, 1);
            const card = await h.messageAfter(from, h.itemCard("item"), { what: "the flight's card" });
            await api().apply(card.id);
            const flying = () => user.itemTypes.effect.find((effect) => /flying on its own/.test(effect.name));
            await h.until(() => flying(), `the flight's Effect (${names(user)})`, { timeout: 8000 });
            const lasts = flying().system.duration;
            h.assert(lasts.value === 3 && lasts.unit === "rounds", `for 3 rounds (${JSON.stringify(lasts)})`);
            const floor = (flying().system.rules ?? []).find((rule) => rule.key === "FlatModifier");
            h.assert(floor && Number(floor.value) === 31 - own && [].concat(floor.predicate ?? []).includes("item:slug:kaldemashs-lament"), `the difference made up: +${31 - own} on its Strikes (${JSON.stringify(flying().system.rules)})`);
            await h.until(() => Number(strikeOf(user, gun)?.totalModifier) === 31, `its Strike at +31 (${strikeOf(user, gun)?.totalModifier})`, { timeout: 8000 });
            await userToken.object?.control?.();
            await h.target(foeToken);
            const { attack } = await h.withDie(10, () => h.strike(user, gun));
            const options = attack.flags.pf2e.context.options ?? [];
            h.assert(options.includes("target:condition:off-guard"), `the target Off-Guard to it (${options.filter((option) => /off-guard|target:condition/.test(option)).join(", ") || "no such option"})`);
            return { own, floor: floor.value, total: attack.rolls?.[0]?.total };
        },

        // (b4G4SoulsparkCandle superseded 2026-10-29 by b5WireSoulsparkLimnPutOut and b5WireSoulsparkFlames (its limning a zone since batch 5).)

        // The Marriage (src/live/bond-card.js, scripts/bonds.js, scripts/counteract.js failCopies and endsBond): Bond refused at a creature 15 feet
        // away; at the adjacent ally, both get the bond Effect. PF2e gives the ally Frightened 2: its user gets the counteract card at the ally,
        // Frightened listed, rank 10, its modifier its class DC − 10 (this fixture has none: 0 and the note). Its check failed (d20 10 against
        // DC 60, the GM's): its user Frightened 2 too, and both bond Effects gone.
        async b4G4MarriageBond(scene) {
            await h.clearSquares(scene, [[13, 4], [14, 4], [17, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Marriage Spouse", { type: "character", x: 13, y: 4, level: 20 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Marriage Partner", { x: 14, y: 4, level: 15 });
            const { token: farToken } = await h.creature(scene, "Marriage Stranger", { x: 17, y: 4, level: 15 });
            const marriage = await h.give(user, "The Marriage");
            await marriage.update({ "system.equipped.invested": true });
            await userToken.object?.control?.();
            let from = since();
            await api().activate(marriage.uuid, 0);
            const card = await h.messageAfter(from, h.itemCard("bond"), { what: "the bond card" });
            const far = await errorOf(api().apply(card.id, { targets: [farToken.uuid] }));
            h.assert(/isn't next to/.test(far ?? ""), `refused 15 feet away (${far})`);
            await api().apply(card.id, { targets: [allyToken.uuid] });
            const bondOf = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.bond);
            await h.until(() => bondOf(user).length === 1 && bondOf(ally).length === 1, `both bonded (${names(user)} / ${names(ally)})`, { timeout: 8000 });
            h.assert(bondOf(user)[0].flags[h.NS].bond.role === "user" && bondOf(ally)[0].flags[h.NS].bond.role === "partner", "its user's side and its partner's");
            from = since();
            await ally.increaseCondition("frightened", { value: 2 });
            const counter = await h.messageAfter(from, h.itemCard("counteract"), { what: "the counteract card for the ally's Frightened", timeout: 10000 });
            const counteract = stateOf(counter).counteract;
            h.assert(counteract.rank === 10 && (counteract.conditions ?? []).includes("frightened") && counteract.failCopies && counteract.endsBond, `Frightened at rank 10, its failure copied, the bond ending (${JSON.stringify(counteract)})`);
            h.assert(Number.isFinite(Number(counteract.modifier)), `its modifier (${counteract.modifier}; ${JSON.stringify(counteract.notes)})`);
            h.assert((stateOf(counter).drinkers ?? []).some((entry) => entry.actorUuid === ally.uuid), "at the ally");
            await api().apply(counter.id, { drinker: 0 });
            await h.until(() => (stateOf(counter).rows ?? []).length, "its rows", { timeout: 8000 });
            const rows = stateOf(counter).rows;
            h.assert(rows.some((row) => row.slug === "frightened"), `Frightened listed (${JSON.stringify(rows)})`);
            await h.withDie(10, () => api().apply(counter.id, { rows: rows.map((row) => ({ ticked: row.slug === "frightened", dc: 60, rank: 10 })) }));
            await h.until(() => user.getCondition("frightened")?.value === 2, `its user Frightened 2 as well (${user.getCondition("frightened")?.value}; ${JSON.stringify(resultsOf(counter))})`, { timeout: 8000 });
            await h.until(() => !bondOf(user).length && !bondOf(ally).length, `the bond ended (${names(user)} / ${names(ally)})`, { timeout: 8000 });
            h.assert(ally.getCondition("frightened")?.value === 2, "the ally still Frightened 2 (not counteracted)");
            return { results: resultsOf(counter) };
        },

        // The Unicorn (src/live/found-card.js, scripts/found.js, scripts/expiring.js): its first use with nothing typed finds nothing and gives the day's
        // use back — the next activation brings no "activated again" warning to the GM. Then Healing Potion (Major) (level 18, its user level 15) and
        // One-Hour Flower (rare) are refused; Healing Potion (Greater) lands in its user's inventory, flagged to vanish a minute on — gone once the
        // world's time passes it (its end moved to a second from now).
        async b4G4UnicornFound(scene) {
            await h.clearSquares(scene, [[13, 6]]);
            const { actor: user } = await h.creature(scene, "Unicorn Finder", { type: "character", x: 13, y: 6, level: 15 });
            const unicorn = await h.give(user, "The Unicorn");
            await unicorn.update({ "system.equipped.invested": true });
            let from = since();
            await api().activate(unicorn.uuid, 0);
            const empty = await h.messageAfter(from, h.itemCard("found"), { what: "the found card" });
            await api().apply(empty.id, { name: "" });
            await h.until(() => resultsOf(empty).some((line) => /Nothing fits/.test(line)), `nothing found (${JSON.stringify(resultsOf(empty))})`, { timeout: 8000 });
            from = since();
            await api().activate(unicorn.uuid, 0);
            const card = await h.messageAfter(from, h.itemCard("found"), { what: "the second found card" });
            await h.wait(800);
            const warned = after(from).filter((message) => /activated again/.test(String(message.content ?? "")) && String(message.content ?? "").includes("The Unicorn"));
            h.assert(!warned.length, `no over-frequency warning: the empty use was given back (${warned.map((message) => message.content).join(" | ")})`);
            const high = await errorOf(api().apply(card.id, { name: "Healing Potion (Major)" }));
            h.assert(/above level 15/.test(high ?? ""), `a level-18 consumable refused (${high})`);
            const rare = await errorOf(api().apply(card.id, { name: "One-Hour Flower" }));
            h.assert(/isn't common/.test(rare ?? ""), `a rare one refused (${rare})`);
            const now = game.time.worldTime;
            await api().apply(card.id, { name: "Healing Potion (Greater)" });
            const potion = () => user.items.find((item) => item.name === "Healing Potion (Greater)" && item.flags?.[h.NS]?.expiresAt);
            await h.until(() => potion(), "the potion in its user's inventory", { timeout: 8000 });
            h.assert(Number(potion().flags[h.NS].expiresAt) === now + 60, `vanishing a minute on (${potion().flags[h.NS].expiresAt - now})`);
            await potion().update({ [`flags.${h.NS}.expiresAt`]: game.time.worldTime + 1 });
            await game.time.advance(1);
            await h.until(() => !potion(), "the potion vanished", { timeout: 8000 });
            return { refused: [high, rare], results: resultsOf(card) };
        },

        // Spellcutter's light put out by a touch (objects op "douse"; scripts/objects.js lightChoices, douseLight): next to its user, a creature with a
        // torch's light (an Effect with PF2e's TokenLight, level 1) and a light placed on the scene. The objects card lists both; the Effect picked is
        // deleted; on a second use, the placed light picked is hidden.
        async b4G4SpellcutterDouse(scene) {
            await h.clearSquares(scene, [[13, 8], [14, 8], [13, 9]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Spellcutter Bearer", { type: "character", x: 13, y: 8, level: 17 });
            const { actor: holder, token: holderToken } = await h.creature(scene, "Torch Holder", { x: 14, y: 8, level: 3 });
            const sword = await h.give(user, "Spellcutter");
            await sword.update(held(1));
            const [torch] = await holder.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Torchlight`, type: "effect", system: { level: { value: 1 }, rules: [{ key: "TokenLight", value: { bright: 20, dim: 40 } }], duration: UNLIMITED } }]);
            // (In the square below its user's, near its edge: within its 5-foot reach as scripts/objects.js measures a light's point.)
            const [placed] = await scene.createEmbeddedDocuments("AmbientLight", [{ x: 13 * 100 + 50, y: 9 * 100 + 10, config: { bright: 10, dim: 20 } }]);
            try {
                await userToken.object?.control?.();
                await h.wait(500);
                const douse = async (find, what) => {
                    const from = since();
                    await api().activate(sword.uuid, 1);
                    const card = await h.messageAfter(from, h.itemCard("objects"), { what: "the douse card" });
                    const choices = stateOf(card).choices ?? [];
                    const at = choices.findIndex(find);
                    h.assert(at >= 0, `${what} listed (${JSON.stringify(choices)})`);
                    await api().apply(card.id, { pick: at });
                    return { card, choices };
                };
                const first = await douse((choice) => choice.kind === "effect" && choice.id === torch.id && choice.actorUuid === holder.uuid, "the torch's Effect");
                h.assert(first.choices.some((choice) => choice.kind === "ambient" && choice.id === placed.id), `the placed light listed too (${JSON.stringify(first.choices)})`);
                await h.until(() => !holder.items.get(torch.id), `the torch's light put out (${names(holder)})`, { timeout: 8000 });
                await douse((choice) => choice.kind === "ambient" && choice.id === placed.id, "the placed light");
                await h.until(() => scene.lights.get(placed.id)?.hidden === true, "the placed light hidden", { timeout: 8000 });
                return { first: first.choices.map((choice) => choice.name), holder: holderToken.name };
            } finally {
                await scene.lights.get(placed.id)?.delete().catch(() => null);
            }
        },

        // The Oculus of Abaddon's price and its mass suggestion (plan.alsoUserSave, scripts/live.js postUserSave; scripts/casts.js castDegree.belowLevel):
        // a non-evil user presses its companion-senses activation: the ability module's Will DC 36 card at its own token beside the item card; its
        // critical failure (d20 10 at +0) gives it the subconscious suggestion's note Effect. An unholy NPC presses the same: no save card for it.
        // The mass suggestion at a level-5 and a level-9 creature: the level-5 one gets the 'no Will save' Effect (AdjustDegreeOfSuccess to failure)
        // before the cast, the level-9 one doesn't.
        async b4G4OculusPrice(scene) {
            await h.clearSquares(scene, [[13, 11], [14, 11], [15, 11], [16, 11]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Oculus Holder", { type: "character", x: 13, y: 11, level: 15 });
            const { actor: fiend } = await h.creature(scene, "Oculus Unholy", { x: 14, y: 11, level: 15 });
            const { actor: low, token: lowToken } = await h.creature(scene, "Oculus Low", { x: 15, y: 11, level: 5, alliance: "opposition" });
            const { actor: high, token: highToken } = await h.creature(scene, "Oculus High", { x: 16, y: 11, level: 9, alliance: "opposition" });
            await fiend.update({ "system.traits.value": ["fiend", "unholy"] });
            const oculus = await h.give(user, "Oculus of Abaddon");
            await oculus.update(held(1));
            await userToken.object?.control?.();
            let from = since();
            await api().activate(oculus.uuid, 2);
            const save = await h.messageAfter(from, saveCardAt(user), { what: "the Will save card at its user" });
            await h.messageAfter(from, h.itemCard("item"), { what: "the companion senses' card" });
            const check = cardOf(save).plan.resolution.check;
            h.assert(check.statistic === "will" && check.against.value === 36, `Will DC 36 (${JSON.stringify(check)})`);
            await h.withDie(10, async () => {
                await h.rollAndApply(save);
                await h.until(() => cardOf(save)?.status === "applied", "its save applied", { timeout: 10000 });
            });
            const suggestion = () => user.itemTypes.effect.find((effect) => /Subconscious suggestion/i.test(`${effect.name} ${effect.system?.description?.value ?? ""}`));
            await h.until(() => suggestion(), `the subconscious suggestion on its user (${cardOf(save).targets?.[0]?.degree}; ${names(user)})`, { timeout: 10000 });
            // (An unholy user: no save.)
            const theirs = await h.give(fiend, "Oculus of Abaddon");
            from = since();
            await api().activate(theirs.uuid, 2);
            await h.messageAfter(from, h.itemCard("item"), { what: "the unholy user's card" });
            await h.wait(2000);
            h.assert(!after(from).some(saveCardAt(fiend)), "no save card for an unholy user");
            // (The mass suggestion.)
            const before = appsNow();
            try {
                from = since();
                await api().activate(oculus.uuid, 3);
                const cast = await h.messageAfter(from, h.itemCard("cast"), { what: "the mass suggestion's cast card" });
                await api().apply(cast.id, { targets: [lowToken.uuid, highToken.uuid] });
                await h.until(() => stateOf(cast).status === "applied", `the cast (${JSON.stringify(resultsOf(cast))})`, { timeout: 15000 });
                const noSave = (actor) => actor.itemTypes.effect.find((effect) => /no Will save/.test(effect.name) && (effect.system.rules ?? []).some((rule) => rule.key === "AdjustDegreeOfSuccess"));
                h.assert(noSave(low), `the level-5 creature can't resist (${names(low)}; ${JSON.stringify(resultsOf(cast))})`);
                h.assert(!noSave(high), `the level-9 creature may save (${names(high)})`);
                const rule = (noSave(low).system.rules ?? []).find((entry) => entry.key === "AdjustDegreeOfSuccess");
                h.assert([].concat(rule.selector).includes("will") && rule.adjustment?.success === "to-failure" && rule.adjustment?.criticalSuccess === "to-failure", `its Will save a failure (${JSON.stringify(rule)})`);
                return { suggestion: suggestion().name, results: resultsOf(cast) };
            } finally {
                // (A dialog the spell module opens for the cast comes a moment after it.)
                await h.wait(1500);
                await closeNewApps(before);
            }
        },

        // The Oculus of Abaddon's Binding Circle (scripts/casts.js castBonus.ifKnows): "If you already know the planar binding ritual, you gain a +3 item
        // bonus on the primary check". A user without the ritual: the cast card applied says so and gives no bonus; one with PF2e's Binding Circle
        // among its spells gets the +3 item bonus to Arcana and Occultism for 24 hours. Also checks that the spell module's castFromItem casts the
        // ritual at all (the card's "casts Binding Circle" line) — the agent's open question.
        async b4G4OculusBindingCircle(scene) {
            await h.clearSquares(scene, [[13, 13], [13, 14]]);
            const { actor: plain, token: plainToken } = await h.creature(scene, "Oculus Novice", { type: "character", x: 13, y: 13, level: 15 });
            const { actor: knower, token: knowerToken } = await h.creature(scene, "Oculus Binder", { type: "character", x: 13, y: 14, level: 15 });
            await h.give(knower, "Binding Circle", "pf2e.spells-srd");
            h.assert(knower.itemTypes.spell.some((spell) => spell.name === "Binding Circle"), "the binder knows Binding Circle");
            const bonusOf = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.castBonus);
            const before = appsNow();
            const ritual = async (actor, token) => {
                const oculus = await h.give(actor, "Oculus of Abaddon");
                await oculus.update(held(1));
                await token.object?.control?.();
                const from = since();
                await api().activate(oculus.uuid, 1);
                const cast = await h.messageAfter(from, h.itemCard("cast"), { what: `${actor.name}'s Binding Circle card` });
                const error = await errorOf(api().apply(cast.id));
                h.assert(!error, `the spell module's castFromItem casts the Binding Circle ritual (${error})`);
                await h.until(() => stateOf(cast).status === "applied", "the ritual's card applied", { timeout: 15000 });
                return resultsOf(cast);
            };
            try {
                const unknown = await ritual(plain, plainToken);
                h.assert(unknown.some((line) => /casts Binding Circle/.test(line)), `cast (${JSON.stringify(unknown)})`);
                h.assert(unknown.some((line) => /doesn't know Binding Circle/.test(line)) && !bonusOf(plain), `no bonus for a caster who doesn't know it (${JSON.stringify(unknown)}; ${names(plain)})`);
                const known = await ritual(knower, knowerToken);
                await h.until(() => bonusOf(knower), `the +3 for the binder (${JSON.stringify(known)}; ${names(knower)})`, { timeout: 8000 });
                const effect = bonusOf(knower);
                const rules = effect.system.rules ?? [];
                h.assert(["arcana", "occultism"].every((skill) => rules.some((rule) => [].concat(rule.selector).includes(skill) && rule.type === "item" && Number(rule.value) === 3)), `+3 item to Arcana and Occultism (${JSON.stringify(rules)})`);
                h.assert(effect.system.duration.value === 24 && effect.system.duration.unit === "hours", `for the ritual's day (${JSON.stringify(effect.system.duration)})`);
                return { unknown, known };
            } finally {
                // (A dialog the spell module opens for the cast comes a moment after it.)
                await h.wait(1500);
                await closeNewApps(before);
            }
        },

        // Redeemer's Pistol's first way (bonus.noDamage; scripts/half-damage.js beforeNoDamage on the core's damage listener): "You're unharmed by the
        // triggering damage". The ways card's first button, its readied card applied: 20 piercing then applied takes nothing, and that damage spends
        // the readied Effect. (Expected to fail at the spending until a damage brought to 0 spends it — PF2e's damage-taken message then has no
        // appliedDamage: see the result's bugs.)
        async b4G4RedeemerNoDamage(scene) {
            await h.clearSquares(scene, [[4, 12], [5, 12]]);
            const { actor: user } = await h.creature(scene, "Redeemer Gunslinger", { x: 4, y: 12, hp: 100, level: 11 });
            await h.creature(scene, "Redeemer Foe", { x: 5, y: 12, alliance: "opposition", level: 11 });
            const pistol = await h.give(user, "Redeemer's Pistol");
            await pistol.update(held(1));
            const { fortune } = await redeemerWay(pistol, 0);
            h.assert(/triggering damage reduced to 0/.test(String(fortune.content)), `the readied card's words (${String(fortune.content).replace(/<[^>]+>/g, " ").slice(0, 300)})`);
            await api().apply(fortune.id);
            await h.until(() => readiedOf(user)?.flags?.[h.NS]?.rollTwice?.noDamage, `the readied Effect, no damage (${names(user)})`, { timeout: 8000 });
            const before = hp(user);
            await damage(user, "20[piercing]");
            await h.wait(1000);
            h.assert(hp(user) === before, `the triggering damage applied as 0: ${before} → ${hp(user)}`);
            await h.until(() => !readiedOf(user), `the readied Effect spent by that damage (${names(user)})`, { timeout: 8000 });
            return { hp: [before, hp(user)] };
        },

        // Redeemer's Pistol's second way (bonus.resistance's formula and words; the save-route card beside it at the enemy): "you gain resistance to
        // the triggering damage equal to 2 + your level … the triggering creature … enfeebled 2 until the end of its next turn and takes 4 persistent
        // spirit damage". The readied card says "2 + its level"; applied on its level-11 user: resistance 13 to all damage (PF2e's @actor.level), so
        // 20 piercing takes 7 and spends it. The card at the enemy applied: Enfeebled 2 and 4 persistent spirit damage on it.
        async b4G4RedeemerResistance(scene) {
            await h.clearSquares(scene, [[4, 14], [5, 14]]);
            const { actor: user } = await h.creature(scene, "Redeemer Marshal", { x: 4, y: 14, hp: 100, level: 11 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Redeemer Culprit", { x: 5, y: 14, hp: 100, alliance: "opposition", level: 11 });
            const pistol = await h.give(user, "Redeemer's Pistol");
            await pistol.update(held(1));
            const { fortune, expose } = await redeemerWay(pistol, 1, { expose: true });
            h.assert(/resistance 2 \+ its level/.test(String(fortune.content).replace(/<[^>]+>/g, " ")), `the readied card's words (${String(fortune.content).replace(/<[^>]+>/g, " ").slice(0, 300)})`);
            await api().apply(fortune.id);
            const resistance = () => Number((user.attributes.resistances ?? []).find((entry) => entry.type === "all-damage")?.value ?? NaN);
            await h.until(() => resistance() === 13, `resistance 2 + 11 to all damage (${JSON.stringify((user.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]))})`, { timeout: 8000 });
            const before = hp(user);
            await damage(user, "20[piercing]");
            await h.until(() => hp(user) === before - 7, `20 less 13: ${before} → ${hp(user)}`, { timeout: 8000 });
            await h.until(() => !readiedOf(user), `the readied Effect spent (${names(user)})`, { timeout: 8000 });
            const from = since();
            await api().apply(expose.id, { targets: [foeToken.uuid] });
            const card = await h.messageAfter(from, abilityCardAt(foe), { what: "the ability module's card at the enemy" });
            await h.applyAbilityCard(card);
            const spirit = () => foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "spirit");
            await h.until(() => foe.getCondition("enfeebled")?.value === 2 && spirit(), `Enfeebled 2 and persistent spirit on the enemy (${foe.itemTypes.condition.map((condition) => `${condition.slug} ${condition.value ?? ""}`).join(", ")})`, { timeout: 10000 });
            h.assert(/^\s*4\s*$/.test(String(spirit().system.persistent.formula)), `4 persistent spirit (${spirit().system.persistent.formula})`);
            return { hp: [before, hp(user)], enemy: foe.itemTypes.condition.map((condition) => condition.slug) };
        },

        // Flawless Celestial Shawl's Reweave (objects.pf2eRepair, objects.degree; scripts/objects.js, scripts/fortune.js): "you can Repair an item …
        // you get a result one degree of success better than you rolled". Its user's damaged Steel Shield (10/20, level 0: DC 14) picked: PF2e's Repair
        // is rolled — Crafting +0, d20 10, a failure made a success by the readied AdjustDegreeOfSuccess — and that roll spends the readied Effect.
        // (PF2e's check dialog is off for this GM while it rolls, the setting put back after.)
        async b4G4ShawlReweave(scene) {
            await h.clearSquares(scene, [[8, 12]]);
            const { actor: user } = await h.creature(scene, "Shawl Tennin", { type: "character", x: 8, y: 12, level: 9 });
            const shawl = await h.give(user, "Flawless Celestial Shawl");
            await shawl.update(worn);
            const shield = await h.give(user, "Steel Shield");
            await shield.update({ "system.hp.value": 10 });
            const crafting = Number(user.skills?.crafting?.mod);
            h.assert(crafting === 0, `Crafting +0 (${crafting})`);
            let from = since();
            await api().activate(shawl.uuid, 0);
            const card = await h.messageAfter(from, h.itemCard("objects"), { what: "Reweave's card" });
            const at = (stateOf(card).choices ?? []).findIndex((choice) => choice.id === shield.id);
            h.assert(at >= 0, `the damaged shield listed (${JSON.stringify(stateOf(card).choices)})`);
            const degreed = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.rollTwice && (effect.system.rules ?? []).some((rule) => rule.key === "AdjustDegreeOfSuccess"));
            const check = await withoutCheckDialogs(() => h.withDie(10, async () => {
                from = since();
                const poll = setInterval(rollOpenCheckDialogs, 300);
                try {
                    await api().apply(card.id, { pick: at });
                    return await h.messageAfter(from, checkOf(user, "repair"), { what: "PF2e's Repair check", timeout: 15000 });
                } finally {
                    clearInterval(poll);
                }
            }));
            const outcome = check.flags.pf2e.context.outcome;
            h.assert(outcome === "success", `a failure (10 against DC 14) made a success: ${outcome}`);
            await h.until(() => !degreed(), `the readied Effect spent by the Repair check (${names(user)})`, { timeout: 8000 });
            return { outcome, total: check.rolls?.[0]?.total, results: resultsOf(card) };
        },

        // The Soulheart's Bolster Maiserene Phantom (withPhantomBolster, scripts/live.js bolsterPhantom): the targeted phantom gets the 'rank 1' note;
        // each PC (PF2e's party members, else the characters players own) gets one Effect of +1 maximum Hit Points; the soulheart is deleted. A second
        // soulheart: still one Effect each, now +2. (Those Effects may land on the world's own PCs: the case puts each back as it was after —
        // deleted where there was none. With no PC at all, this case's user is given to a player for it.)
        async b4G4SoulheartPhantom(scene) {
            await h.clearSquares(scene, [[8, 14], [9, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Soulheart Bearer", { type: "character", x: 8, y: 14, level: 5 });
            const { actor: phantom, token: phantomToken } = await h.creature(scene, "Maiserene Phantom", { x: 9, y: 14, level: 3 });
            if (!partyPCs().length) {
                const player = game.users.find((entry) => !entry.isGM && entry.role >= CONST.USER_ROLES.PLAYER);
                h.assert(player, "a PC to bolster: no party member, no player-owned character and no player to give this case's user to");
                await user.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
                await h.until(() => user.hasPlayerOwner, "this case's user owned by a player", { timeout: 5000 });
            }
            const members = partyPCs();
            h.assert(members.length, "the PCs");
            const kept = new Map(members.map((pc) => [pc.uuid, partyHpOf(pc).map((effect) => ({ id: effect.id, rules: foundry.utils.deepClone(effect.system.rules), value: effect.flags[h.NS].partyHp.value, description: effect.system.description.value }))]));
            const base = (pc) => Number(kept.get(pc.uuid)?.[0]?.value) || 0;
            const valueOf = (pc) => partyHpOf(pc).map((effect) => Number(effect.flags[h.NS].partyHp.value));
            await userToken.object?.control?.();
            const bolster = async () => {
                const soulheart = await h.give(user, "Soulheart");
                const from = since();
                await api().activate(soulheart.uuid, 1);
                const card = await h.messageAfter(from, h.itemCard("item"), { what: "Bolster Maiserene Phantom's card" });
                await api().apply(card.id, { targets: [phantomToken.uuid] });
                await h.until(() => !user.items.get(soulheart.id), `the soulheart destroyed (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                return card;
            };
            try {
                const first = await bolster();
                await h.until(() => phantom.itemTypes.effect.some((effect) => /rank 1/.test(effect.name)), `the phantom's 'rank 1' note (${names(phantom)})`, { timeout: 8000 });
                await h.until(() => members.every((pc) => JSON.stringify(valueOf(pc)) === JSON.stringify([base(pc) + 1])), `one Effect of +1 on each PC (${members.map((pc) => `${pc.name}: ${valueOf(pc)}`).join("; ")})`, { timeout: 8000 });
                const rule = (partyHpOf(members[0])[0].system.rules ?? []).find((entry) => entry.key === "FlatModifier");
                h.assert([].concat(rule?.selector).includes("hp") && Number(rule.value) === base(members[0]) + 1, `PF2e's FlatModifier to Hit Points (${JSON.stringify(rule)})`);
                await bolster();
                await h.until(() => members.every((pc) => JSON.stringify(valueOf(pc)) === JSON.stringify([base(pc) + 2])), `still one Effect each, now +2 (${members.map((pc) => `${pc.name}: ${valueOf(pc)}`).join("; ")})`, { timeout: 8000 });
                return { pcs: members.map((pc) => pc.name), first: resultsOf(first) };
            } finally {
                // (Each PC's Hit Points Effect as it was: this case's own deleted, one it had before put back.)
                for (const pc of members) {
                    const before = kept.get(pc.uuid) ?? [];
                    const now = partyHpOf(pc);
                    const extra = now.filter((effect) => !before.some((entry) => entry.id === effect.id)).map((effect) => effect.id);
                    if (extra.length) await pc.deleteEmbeddedDocuments("Item", extra).catch(() => null);
                    for (const entry of before) await pc.items.get(entry.id)?.update({ "system.rules": entry.rules, [`flags.${h.NS}.partyHp.value`]: entry.value, "system.description.value": entry.description }).catch(() => null);
                }
            }
        }
    };
};
