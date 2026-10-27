// The triggers group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the items whose live play is new code (scripts/*.js, src/live/*.js of the triggers group's commits 1fef99b…c276d8d): Reaper's Toll's drain on a
// Strike's hit, the objects card's new ops (Rustbringer's damage, Sanguine Klar's typed repair, Conflagration Club's charges, Persistent Lodestone's
// recalled round, Chain of Stars' spent shuriken), Turnabout Shield's triggering miss, Secret-Keeper's Mask's then-for, Arrow-Catching Shield's Shield
// Block, Name Pendant's whisper to the other wearers, and the counteract card's user modifiers and onCounter.
const ABILITY = "pf2e-automatic-ability-resolution";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const effects = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const results = (card) => game.messages.get(card.id)?.getFlag(h.NS, "card")?.results ?? [];
    const plain = (card) => String(game.messages.get(card.id)?.content ?? card.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    const damageRoll = (since, what = "the damage roll") => h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what });
    // (A permanent item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };
    // (A bare character's maximum Hit Points: 0 — an Effect gives it some, its Hit Points filled.)
    const hitPoints = async (actor, value) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value }], duration: UNLIMITED } }]);
        await h.until(() => actor.system.attributes.hp.max >= value, `${value} maximum Hit Points`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": actor.system.attributes.hp.max });
    };

    return {
        // Reaper's Toll's Reaper's Claim (scripts/strikes.js drainOnHit, scripts/drain.js markDrained): its strike card readies a Strike with the scythe
        // itself; its hit marks the creature struck ("drained", the user its share's owner), and that Strike's damage roll, applied as PF2e's damage
        // button does, gives the wielder half of the Hit Points the creature lost as PF2e's TempHP for 1 minute, the mark used up.
        async triggersReaperDrain(scene) {
            await h.clearSquares(scene, [[2, 8], [3, 8], [3, 9]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Reaper", { type: "character", x: 2, y: 8, level: 15 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Reaped Foe", { x: 3, y: 8, ac: 1, hp: 300, alliance: "opposition", level: 15 });
            // (Its trigger, a creature within 30 feet reduced to 0 Hit Points: the fallen one beside them — the card doesn't check it.)
            await h.creature(scene, "Reaped Fallen", { x: 3, y: 9, hp: 0, alliance: "opposition" });
            const scythe = await h.give(user, "Reaper's Toll");
            await scythe.update(held(2));
            const card = await activated(scythe, 0, "strike", "Reaper's Claim's strike card");
            const drain = card.getFlag(h.NS, "card").plan.strike?.drain;
            h.assert(drain?.fraction === 0.5 && drain.duration?.value === 1 && drain.duration.unit === "minutes", `half for 1 minute on the plan (${JSON.stringify(drain)})`);
            await live().apply(card.id);
            const readied = () => user.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "strikeRider"));
            await h.until(readied, "the readied Strike", { timeout: 8000 });
            h.assert(readied().getFlag(h.NS, "strikeRider").weaponId === scythe.id, `readied for the scythe (${JSON.stringify(readied().getFlag(h.NS, "strikeRider").weaponId)})`);
            await userToken.object?.control?.();
            await h.target(foeToken);
            const { action, attack } = await h.withDie(15, () => h.strike(user, scythe));
            const outcome = attack.flags.pf2e.context.outcome;
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
            const mark = () => foe.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.drain);
            await h.until(mark, `the drained mark on the creature hit (${effects(foe)})`, { timeout: 8000 });
            const flag = mark().flags[h.NS].drain;
            h.assert(flag.fraction === 0.5 && flag.userUuid === user.uuid, `the mark's share and user (${JSON.stringify(flag)})`);
            h.assert(!readied(), "the readied Strike spent by its hit");
            const since = Date.now();
            await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
            const rolled = await damageRoll(since, "the scythe's damage roll");
            const hp = foe.system.attributes.hp.value;
            await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken, item: rolled.item });
            await h.until(() => foe.system.attributes.hp.value < hp, "the damage applied", { timeout: 8000 });
            const lost = hp - foe.system.attributes.hp.value;
            await h.until(() => Number(user.system.attributes.hp.temp) === Math.floor(lost / 2), `half of ${lost} as temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
            await h.until(() => !mark(), "the mark used up", { timeout: 8000 });
            const temp = user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.drainTemp);
            h.assert(temp && temp.system.duration.value === 1 && temp.system.duration.unit === "minutes", `its TempHP Effect for 1 minute (${JSON.stringify(temp?.system?.duration)})`);
            return { outcome, lost, temp: user.system.attributes.hp.temp };
        },

        // Rustbringer's Rusting Disarm (scripts/objects.js damageTheirItem, damagedItem — objects op "damage"): Apply with the disarmed creature
        // targeted. Its one dropped weapon is found at once (the one it still holds left alone) and loses the 2d6 roll (every die a 3: 6) from its Hit
        // Points, its Hardness 5 ignored (20 → 14); a creature with two dropped weapons gets them listed, the second Apply damaging the one picked; a
        // PF2e weapon whose Hit Points PF2e keeps at 0 (a plain longsword) gets the damage said, for the GM to mark.
        async triggersRustbringerWeapon(scene) {
            await h.clearSquares(scene, [[2, 2], [3, 2], [3, 3], [3, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Rust Disarmer", { type: "character", x: 2, y: 2, level: 10 });
            const one = await h.creature(scene, "Rust Foe One", { x: 3, y: 2, alliance: "opposition" });
            const two = await h.creature(scene, "Rust Foe Two", { x: 3, y: 3, alliance: "opposition" });
            const bare = await h.creature(scene, "Rust Foe Plain", { x: 3, y: 4, alliance: "opposition" });
            const flail = await h.give(user, "Rustbringer");
            await flail.update(held(1));
            const dropped = { "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 };
            const withHp = { "system.hp.max": 20, "system.hp.value": 20, "system.hardness": 5 };
            const weapon = async (actor, name, changes) => {
                const item = await h.give(actor, name);
                await item.update(changes);
                return item;
            };
            const mace = await weapon(one.actor, "Mace", { ...dropped, ...withHp });
            const dagger = await weapon(one.actor, "Dagger", { ...held(1), ...withHp });
            h.assert(Number(mace.system.hp.max) === 20 && Number(mace.system.hardness) === 5, `PF2e keeps the mace's 20 Hit Points, Hardness 5 (${JSON.stringify(mace.system.hp)}, ${mace.system.hardness})`);
            const hpOf = (item) => Number(item.actor.items.get(item.id)?.system?.hp?.value);
            await userToken.object?.control?.();
            // (One dropped weapon: damaged on the first Apply.)
            let card = await activated(flail, 0, "objects", "Rusting Disarm's card");
            h.assert(/ignoring its Hardness/.test(plain(card)), `the card's words (${plain(card).slice(0, 300)})`);
            await h.withDie(10, () => live().apply(card.id, { targets: [one.token.uuid] }));
            await h.until(() => hpOf(mace) === 14, `the mace 20 → 14, its Hardness ignored (${hpOf(mace)})`, { timeout: 8000 });
            h.assert(hpOf(dagger) === 20, `the held dagger untouched (${hpOf(dagger)})`);
            const first = results(card)[0] ?? "";
            h.assert(/takes 6 damage \(rolled 2d6 = 6, its Hardness ignored\): 14\/20 Hit Points/.test(first), `its line (${first})`);
            // (Two dropped: listed, then the one picked.)
            const mace2 = await weapon(two.actor, "Mace", { ...dropped, ...withHp });
            const club = await weapon(two.actor, "Club", { ...dropped, ...withHp });
            const second = await activated(flail, 0, "objects", "Rusting Disarm's second card");
            await live().apply(second.id, { targets: [two.token.uuid] });
            const listed = () => game.messages.get(second.id).getFlag(h.NS, "card");
            await h.until(() => (listed().choices ?? []).length === 2, `both dropped weapons listed (${JSON.stringify(listed().choices)})`, { timeout: 8000 });
            h.assert(listed().status === "open" && hpOf(mace2) === 20 && hpOf(club) === 20, "nothing damaged before the pick");
            const at = listed().choices.findIndex((choice) => choice.id === club.id);
            h.assert(at >= 0, `the club offered (${JSON.stringify(listed().choices)})`);
            await h.withDie(10, () => live().apply(second.id, { pick: at }));
            await h.until(() => hpOf(club) === 14, `the club picked 20 → 14 (${hpOf(club)})`, { timeout: 8000 });
            h.assert(hpOf(mace2) === 20, `the other mace untouched (${hpOf(mace2)})`);
            // (A weapon PF2e keeps no Hit Points for.)
            const sword = await weapon(bare.actor, "Longsword", dropped);
            const swordHp = JSON.stringify(sword.system.hp);
            card = await activated(flail, 0, "objects", "Rusting Disarm's third card");
            await live().apply(card.id, { targets: [bare.token.uuid] });
            await h.until(() => results(card).length, "its line", { timeout: 8000 });
            h.assert(/PF2e keeps no Hit Points for it, so the GM marks it by its material/.test(results(card)[0]), `the damage said for the GM (${results(card)[0]})`);
            h.assert(JSON.stringify(bare.actor.items.get(sword.id)?.system?.hp) === swordHp, "the longsword's Hit Points unchanged");
            return { one: first, picked: results(second)[0] ?? null, plain: results(card)[0] };
        },

        // Sanguine Klar (scripts/objects.js op "repair" typed, scripts/live.js amount): its objects card asks the bleed damage dealt (a typed field), is
        // refused without it, and mends the klar itself by that much, at most its Hardness 8 — 12 typed gives 8 back, then 3 typed gives 3.
        async triggersSanguineKlarMends(scene) {
            await h.clearSquares(scene, [[5, 2]]);
            const { actor: user } = await h.creature(scene, "Klar Bearer", { type: "character", x: 5, y: 2, level: 9 });
            const klar = await h.give(user, "Sanguine Klar");
            await klar.update(held(1));
            const max = Number(klar.system.hp.max);
            const hardness = Number(klar.system.hardness);
            h.assert(max > 20 && hardness === 8, `its Hit Points and Hardness 8 (${max}, ${hardness})`);
            await klar.update({ "system.hp.value": max - 30 });
            const hp = () => Number(user.items.get(klar.id)?.system?.hp?.value);
            let card = await activated(klar, 0, "objects", "the klar's card");
            h.assert(/data-air-field="amount"/.test(game.messages.get(card.id).content), "its typed field");
            const refused = await errorOf(live().apply(card.id, {}));
            h.assert(/Type the bleed damage first/.test(refused ?? ""), `refused with nothing typed (${refused})`);
            const before = hp();
            await live().apply(card.id, { amount: 12 });
            await h.until(() => hp() === before + 8, `12 typed: 8 back, its Hardness (${before} → ${hp()})`, { timeout: 8000 });
            const line = results(card)[0] ?? "";
            h.assert(/regains 8 Hit Points \(12 typed, at most its Hardness 8\)/.test(line), `its line (${line})`);
            // (Again — its once a round is the GM's warning, not a refusal.)
            card = await activated(klar, 0, "objects", "the klar's second card");
            const mid = hp();
            await live().apply(card.id, { amount: 3 });
            await h.until(() => hp() === mid + 3, `3 typed: 3 back (${mid} → ${hp()})`, { timeout: 8000 });
            return { hp: [before, mid, hp(), max], line };
        },

        // Turnabout Shield (scripts/live.js triggeringMissFormula, src/live/strike-as.js triggeringMiss, formulaInstances, withStrikeFormula as null): an
        // NPC archer's ranged Strike misses the wearer; the shield's card then carries that bow's own PF2e damage (1d8+3 piercing and 1d6 fire, each its
        // own type), and the ability module's attack card at another creature rolls at +19 against its AC, a hit dealing that damage.
        async triggersTurnaboutReturnShot(scene) {
            await h.clearSquares(scene, [[2, 6], [8, 6], [4, 8]]);
            const { actor: wearer, token: wearerToken } = await h.creature(scene, "Turnabout Wearer", { type: "character", x: 2, y: 6, level: 9 });
            const { actor: archer, token: archerToken } = await h.creature(scene, "Turnabout Archer", { x: 8, y: 6, alliance: "opposition" });
            const { actor: victim, token: victimToken } = await h.creature(scene, "Turnabout Victim", { x: 4, y: 8, hp: 100, ac: 18, alliance: "opposition" });
            const shield = await h.give(wearer, "Turnabout Shield");
            await shield.update(held(1));
            const [bow] = await archer.createEmbeddedDocuments("Item", [{ name: "Longbow", type: "melee", system: { bonus: { value: -30 }, damageRolls: { a: { damage: "1d8+3", damageType: "piercing" }, b: { damage: "1d6", damageType: "fire" } }, traits: { value: [] }, range: { increment: 100, max: 600 } } }]);
            await archerToken.object?.control?.();
            await h.target(wearerToken);
            const { attack } = await h.strike(archer, bow);
            const context = attack.flags.pf2e.context;
            h.assert(["failure", "criticalFailure"].includes(context.outcome) && (context.options ?? []).includes("item:ranged"), `a ranged miss at the wearer (${context.outcome}; ranged ${(context.options ?? []).includes("item:ranged")})`);
            h.assert(context.target?.actor === wearer.uuid, `at the wearer (${JSON.stringify(context.target)})`);
            const card = await activated(shield, 0, "expose", "the shield's card");
            const components = card.getFlag(h.NS, "card").plan.resolution.sharedDamage?.components ?? [];
            const piercing = components.find((component) => component.type === "piercing");
            const fire = components.find((component) => component.type === "fire");
            h.assert(components.length === 2 && /1d8/.test(piercing?.formula ?? "") && /\b3\b/.test(piercing?.formula ?? "") && /^1d6$/.test(String(fire?.formula ?? "").trim()), `the bow's own damage, its types kept (${JSON.stringify(components)})`);
            await wearerToken.object?.control?.();
            const since = Date.now();
            await live().apply(card.id, { targets: [victimToken.uuid] });
            const shot = await h.messageAfter(since, h.abilitySaveCard, { what: "the attack card at the creature" });
            const plan = shot.flags[ABILITY].card.plan;
            h.assert(Number(plan.resolution.check.modifier) === 19, `at +19 (${JSON.stringify(plan.resolution.check)})`);
            h.assert(plan.resolution.outcomes.success?.damage?.multiplier === 1 && plan.resolution.outcomes.criticalSuccess?.damage?.multiplier === 2, "a hit's damage, doubled on a critical hit");
            const hp = victim.system.attributes.hp.value;
            // (A 5: 24 against AC 18, a hit and not a critical one.)
            await h.withDie(5, () => h.rollAndApply(shot));
            await h.until(() => victim.system.attributes.hp.value < hp, `the hit's damage on the creature (${victim.system.attributes.hp.value})`, { timeout: 10000 });
            const degree = game.messages.get(shot.id).flags[ABILITY].card.targets?.[0]?.degree ?? null;
            return { components, degree, hp: [hp, victim.system.attributes.hp.value] };
        },

        // Secret-Keeper's Mask (Father Skinsaw) at a bleeding creature (the ability module's whilePersistent note Effect; scripts/then-for.js): while it
        // bleeds, PF2e's own recovery check is at DC 17 (15 + the ItemAlteration's 2) and its Deception, Diplomacy and Performance are 2 lower; once the
        // bleed ends, the note Effect goes and its "(after)" Effect keeps the -2s for 1 minute, without the recovery DC rule or the marker.
        async triggersSkinsawMaskBleed(scene) {
            await h.clearSquares(scene, [[2, 4], [3, 4]]);
            const { actor: user } = await h.creature(scene, "Skinsaw Masked", { type: "character", x: 2, y: 4, level: 6 });
            // (A character, so all three skills are PF2e's statistics.)
            const { actor: foe, token: foeToken } = await h.creature(scene, "Skinsaw Bleeder", { type: "character", x: 3, y: 4, alliance: "opposition" });
            const mask = await h.give(user, "Secret-Keeper's Mask (Father Skinsaw)");
            await mask.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true }).catch(() => null);
            const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
            persistent.system.persistent = { formula: "1d6", damageType: "bleed", dc: 15 };
            await foe.createEmbeddedDocuments("Item", [persistent]);
            const bleed = () => foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "bleed");
            await h.until(bleed, "persistent bleed", { timeout: 5000 });
            const SKILLS = ["deception", "diplomacy", "performance"];
            const skills = () => Object.fromEntries(SKILLS.map((slug) => [slug, Number(foe.getStatistic?.(slug)?.mod ?? foe.skills?.[slug]?.mod)]));
            const before = skills();
            const lowered = () => SKILLS.every((slug) => skills()[slug] === before[slug] - 2);
            const card = await activated(mask, 0, "item", "the mask's card");
            await live().apply(card.id, { targets: [foeToken.uuid] });
            const MARK = "air-then-for:1:minutes:bleed";
            const wound = () => foe.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === MARK));
            await h.until(wound, `the mask's note Effect on the bleeding creature (${effects(foe)})`, { timeout: 10000 });
            h.assert(wound().flags?.[ABILITY]?.whilePersistent === "bleed", `while it bleeds (${JSON.stringify(wound().flags?.[ABILITY])})`);
            await h.until(lowered, `Deception, Diplomacy and Performance 2 lower (${JSON.stringify(before)} → ${JSON.stringify(skills())})`, { timeout: 8000 });
            // (PF2e's own recovery check, a 1 so the bleeding goes on: its DC.)
            let since = Date.now();
            await h.withDie(1, () => bleed().rollRecovery());
            const check = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === foe.id, { what: "PF2e's recovery check" });
            const dc = check.flags.pf2e.context.dc?.value;
            h.assert(dc === 17, `the recovery check at DC 17 (${dc})`);
            await h.wait(500);
            h.assert(bleed(), "still bleeding after the failed check");
            // (The bleeding ends.)
            await bleed().delete();
            const after = () => foe.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.thenFor);
            await h.until(() => !wound() && after(), `the note Effect gone and its "(after)" Effect (${effects(foe)})`, { timeout: 10000 });
            const lasting = after();
            h.assert(/\(after\)$/.test(lasting.name) && lasting.system.duration.value === 1 && lasting.system.duration.unit === "minutes", `"(after)" for 1 minute (${lasting.name}: ${JSON.stringify(lasting.system.duration)})`);
            const rules = lasting.system.rules ?? [];
            h.assert(!rules.some((rule) => rule.key === "ItemAlteration" || (rule.key === "RollOption" && String(rule.option ?? "").startsWith("air-then-for"))), `no recovery DC rule or marker after (${JSON.stringify(rules)})`);
            await h.until(lowered, `still 2 lower for the minute (${JSON.stringify(skills())})`, { timeout: 5000 });
            return { dc, before, during: skills(), after: lasting.name };
        },

        // Arrow-Catching Shield (scripts/half-damage.js beforeShieldBlock; src/live/fortune-card.js shieldBlock): with the shield raised, its readied
        // Effect waits for the attack; an NPC's ranged Strike hits (the Effect kept for the damage), and its damage, applied with no Shield Block asked,
        // is applied as PF2e's Shield Block — Hardness 10 off, the shield taking the rest too — and spends the Effect.
        async triggersArrowCatchingBlock(scene) {
            await h.clearSquares(scene, [[2, 10], [9, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Arrow Catcher", { type: "character", x: 2, y: 10, level: 11 });
            const { actor: archer, token: archerToken } = await h.creature(scene, "Arrow Archer", { x: 9, y: 10, alliance: "opposition" });
            await hitPoints(user, 60);
            const shield = await h.give(user, "Arrow-Catching Shield");
            await shield.update(held(1));
            await game.pf2e.actions.raiseAShield({ actors: [user] });
            await h.until(() => user.attributes.shield?.raised, "the shield raised", { timeout: 8000 });
            const card = await activated(shield, 0, "fortune", "the shield's card");
            await live().apply(card.id);
            const readied = () => user.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "rollTwice")?.shieldBlock);
            await h.until(readied, `the readied Shield Block Effect (${effects(user)})`, { timeout: 8000 });
            // (Its attack bonus: a 10 on the die is the user's AC + 3, a hit but not a critical one.)
            const ac = Number(user.system.attributes.ac.value);
            const [bow] = await archer.createEmbeddedDocuments("Item", [{ name: "Shortbow", type: "melee", system: { bonus: { value: ac - 7 }, damageRolls: { a: { damage: "4d6+10", damageType: "piercing" } }, traits: { value: [] }, range: { increment: 60, max: 360 } } }]);
            await archerToken.object?.control?.();
            await h.target(userToken);
            const { action, attack } = await h.withDie(10, () => h.strike(archer, bow));
            h.assert(attack.flags.pf2e.context.outcome === "success", `a hit (${attack.flags.pf2e.context.outcome} against AC ${ac})`);
            await h.until(() => readied()?.getFlag(h.NS, "rollTwice")?.against?.attacked, "the Effect kept for the hit's damage", { timeout: 8000 });
            const since = Date.now();
            await h.withDie(10, () => action.damage({ event: h.shift() }));
            const rolled = await damageRoll(since, "the bow's damage roll");
            const total = Number(rolled.rolls[0].total);
            const hardness = Number(shield.system.hardness);
            const through = Math.max(0, total - hardness);
            const hp = user.system.attributes.hp.value;
            const shieldHp = () => Number(user.items.get(shield.id)?.system?.hp?.value);
            const shieldBefore = shieldHp();
            await user.applyDamage({ damage: rolled.rolls[0], token: userToken, item: rolled.item });
            await h.until(() => user.system.attributes.hp.value === hp - through, `${total} damage less Hardness ${hardness}: ${hp} → ${hp - through} (${user.system.attributes.hp.value})`, { timeout: 8000 });
            await h.until(() => shieldHp() === shieldBefore - Math.min(shieldBefore, through), `the shield took ${through} (${shieldBefore} → ${shieldHp()})`, { timeout: 8000 });
            await h.until(() => !readied(), "the Effect spent by the damage", { timeout: 8000 });
            return { total, hardness, hp: [hp, user.system.attributes.hp.value], shield: [shieldBefore, shieldHp()] };
        },

        // Name Pendant's Alert Superior Officer (scripts/live.js postWhisper, whisper.alsoTo): its whisper goes to the GM, its wearer's owners and the
        // owners of the other creatures within 500 feet who wear a name pendant, named on it — not one who only carries one. (With non-GM users in the
        // world, two of them made owners of those two creatures: the wearer's one whispered, the carrier's not.)
        async triggersNamePendantAlert(scene) {
            await h.clearSquares(scene, [[2, 14], [12, 14], [14, 14]]);
            const { actor: user } = await h.creature(scene, "Pendant Fallen", { type: "character", x: 2, y: 14 });
            const { actor: officer } = await h.creature(scene, "Pendant Officer", { type: "character", x: 12, y: 14 });
            const { actor: carrier } = await h.creature(scene, "Pendant Carrier", { type: "character", x: 14, y: 14 });
            const pendant = async (actor, carryType) => {
                const item = await h.give(actor, "Name Pendant");
                await item.update({ "system.equipped.carryType": carryType, "system.equipped.invested": carryType === "worn" }).catch(() => item.update({ "system.equipped.carryType": carryType }));
                return item;
            };
            const own = await pendant(user, "worn");
            await pendant(officer, "worn");
            await pendant(carrier, "dropped");
            // (Players who can own something: not a user with no role, whom Foundry grants nothing — the lead's run of 2026-10-27.)
            const players = game.users.filter((one) => !one.isGM && one.role >= CONST.USER_ROLES.PLAYER);
            const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            if (players[0]) await officer.update({ [`ownership.${players[0].id}`]: OWNER });
            if (players[1]) await carrier.update({ [`ownership.${players[1].id}`]: OWNER });
            const since = Date.now();
            await live().activate(own.uuid, 0);
            const alert = await h.messageAfter(since, (message) => /^Name Pendant/.test(message.flags?.[h.NS]?.whisper?.item ?? ""), { what: "the whispered alert" });
            const gms = game.users.filter((one) => one.isGM).map((one) => one.id);
            h.assert(gms.every((id) => alert.whisper.includes(id)), `whispered to the GM (${JSON.stringify(alert.whisper)})`);
            const words = String(alert.content).replace(/<[^>]+>/g, " ");
            h.assert(words.includes(officer.name) && !words.includes(carrier.name), `the other wearer named, not the carrier (${words.slice(0, 400)})`);
            if (players[0]) h.assert(alert.whisper.includes(players[0].id), `the other wearer's player whispered (${players[0].name})`);
            if (players[1]) h.assert(!alert.whisper.includes(players[1].id), `the carrier's player not whispered (${players[1].name})`);
            return { whisper: alert.whisper.length, players: players.slice(0, 2).map((one) => one.name), words: words.trim().slice(0, 300) };
        },

        // Reflecting Shard (scripts/counteract.js userModifier with a skill, free.counteredWords): its counteract card's one row for the triggering spell
        // at its user's Athletics (+7 here, from an Effect) and rank 7; the GM's DC 20 and rank 3 rolled on a 20 — counteracted, the Spell Riposte line.
        async triggersReflectingShardRiposte(scene) {
            await h.clearSquares(scene, [[2, 16]]);
            const { actor: user } = await h.creature(scene, "Shard Duelist", { type: "character", x: 2, y: 16, level: 13 });
            await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Athletics`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "athletics", value: 7 }], duration: UNLIMITED } }]);
            await h.until(() => Number(user.skills.athletics.mod) >= 7, `Athletics +7 (${user.skills.athletics.mod})`, { timeout: 5000 });
            const athletics = Number(user.skills.athletics.mod);
            const shard = await h.give(user, "Reflecting Shard");
            const since = Date.now();
            await shard.consume();
            const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the shard's counteract card" });
            const state = card.getFlag(h.NS, "card");
            h.assert(state.step === "pick" && state.rows.length === 1 && state.rows[0].kind === "free", `straight to the spell's row (${JSON.stringify(state.rows)})`);
            h.assert(state.counteract.modifier === athletics && state.counteract.rank === 7, `its user's Athletics +${athletics}, rank 7 (${state.counteract.modifier}, ${state.counteract.rank})`);
            await h.withDie(20, () => live().apply(card.id, { rows: [{ ticked: true, dc: 20, rank: 3 }] }));
            await h.until(() => game.messages.get(card.id)?.getFlag(h.NS, "card")?.status === "applied", "the counteract rolled", { timeout: 8000 });
            const [line] = results(card);
            h.assert(/a critical success, counteracted \(Spell Riposte turns it back/.test(line ?? ""), `counteracted and turned back (${line})`);
            return { modifier: state.counteract.modifier, line };
        },

        // Spellslasher (scripts/counteract.js bestStrikeOf, "weapon-attack"; rank "half-level"): its counteract card at its user's best Strike's attack
        // modifier (a held longsword or the fist, whichever is higher), with the line that the GM may change it, at half its user's level (15 → rank 8).
        async triggersSpellslasherStrike(scene) {
            await h.clearSquares(scene, [[6, 16]]);
            const { actor: user } = await h.creature(scene, "Spellslash Duelist", { type: "character", x: 6, y: 16, level: 15 });
            const sword = await h.give(user, "Longsword");
            await sword.update(held(1));
            const best = () => Math.max(...(user.system.actions ?? []).filter((action) => action?.type === "strike" && action.ready !== false).map((action) => Number(action.totalModifier)).filter(Number.isFinite));
            await h.until(() => (user.system.actions ?? []).some((action) => action.item?.id === sword.id), "a Strike with the longsword", { timeout: 5000 });
            const expected = best();
            const slasher = await h.give(user, "Spellslasher");
            const since = Date.now();
            await slasher.consume();
            const card = await h.messageAfter(since, h.itemCard("counteract"), { what: "the spellslasher's counteract card" });
            const state = card.getFlag(h.NS, "card");
            h.assert(Number.isFinite(expected) && state.counteract.modifier === expected, `its user's best Strike +${expected} (${state.counteract.modifier})`);
            h.assert(state.counteract.rank === Math.ceil(user.level / 2), `rank ${Math.ceil(user.level / 2)} (${state.counteract.rank})`);
            h.assert((state.counteract.notes ?? []).some((note) => /best Strike's here: the GM may change it/.test(note)), `the GM's line (${JSON.stringify(state.counteract.notes)})`);
            await h.withDie(20, () => live().apply(card.id, { rows: [{ ticked: true, dc: 20, rank: 1 }] }));
            await h.until(() => game.messages.get(card.id)?.getFlag(h.NS, "card")?.status === "applied", "the counteract rolled", { timeout: 8000 });
            const [line] = results(card);
            h.assert(/counteracted \(end it by hand\)/.test(line ?? "") && !/not counteracted/.test(line ?? ""), `counteracted (${line})`);
            return { modifier: state.counteract.modifier, rank: state.counteract.rank, line };
        },

        // Spell Duelist's Siphon (scripts/counteract.js counteract.onCounter): its counteract card at +20 (its level's DC less 10), rank 6. A 1 on the die
        // against the GM's DC 30, rank 6, isn't counteracted and leaves no note; activated again, a 20 counteracts and puts the "Absorbed spell" note
        // Effect on its user.
        async triggersSiphonAbsorbs(scene) {
            await h.clearSquares(scene, [[10, 16]]);
            const { actor: user } = await h.creature(scene, "Siphon Duelist", { type: "character", x: 10, y: 16, level: 12 });
            const siphon = await h.give(user, "Spell Duelist's Siphon");
            const absorbed = () => user.itemTypes.effect.filter((effect) => /Absorbed spell/i.test(effect.name) && effect.flags?.[h.NS]?.note);
            const use = async (face) => {
                const card = await activated(siphon, 0, "counteract", "the siphon's counteract card");
                const state = card.getFlag(h.NS, "card");
                h.assert(state.counteract.modifier === 20 && state.counteract.rank === 6 && state.rows[0]?.kind === "free", `+20, rank 6, the spell's row (${state.counteract.modifier}, ${state.counteract.rank})`);
                await h.withDie(face, () => live().apply(card.id, { rows: [{ ticked: true, dc: 30, rank: 6 }] }));
                await h.until(() => game.messages.get(card.id)?.getFlag(h.NS, "card")?.status === "applied", "the counteract rolled", { timeout: 8000 });
                return results(card);
            };
            const missed = await use(1);
            h.assert(/not counteracted/.test(missed[0] ?? ""), `a 1: not counteracted (${missed})`);
            await h.wait(800);
            h.assert(!absorbed().length, `no note after a miss (${effects(user)})`);
            const caught = await use(20);
            h.assert(/counteracted/.test(caught[0] ?? "") && !/not counteracted/.test(caught[0] ?? "") && caught.some((line) => /absorbed spell \(a note Effect\)/.test(line)), `a 20: counteracted, the note said (${caught})`);
            await h.until(() => absorbed().length === 1, `the "Absorbed spell" note Effect on its user (${effects(user)})`, { timeout: 8000 });
            return { missed, caught, note: absorbed()[0].name };
        },

        // Conflagration Club (objects op "charge", src/live/charges.js, scripts/live.js postCardFor): Absorb Arcana's ways card, its Fire way's objects card
        // with 3 typed — the club holds 3 fire charges (its flag); again, refused while it holds some. Explosive Cone's card then carries 3d6 fire, no
        // typed amount or type to pick, the charges back to 0, and the ability module's save card at the creature targeted is 3d6 fire; a second cone,
        // with none stored, asks the typed amount again.
        async triggersConflagrationCharges(scene) {
            await h.clearSquares(scene, [[2, 12], [3, 12]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Club Caster", { type: "character", x: 2, y: 12, level: 6 });
            const { token: foeToken } = await h.creature(scene, "Club Target", { x: 3, y: 12, hp: 100, alliance: "opposition" });
            const club = await h.give(user, "Conflagration Club");
            await club.update(held(2));
            const charges = () => user.items.get(club.id)?.getFlag(h.NS, "charges") ?? null;
            const absorb = async (amount) => {
                const ways = await activated(club, 0, "ways", "Absorb Arcana's ways card");
                const fire = ways.getFlag(h.NS, "card").plan.ways.findIndex((way) => /^Fire\b/i.test(way.name));
                h.assert(fire >= 0, `a Fire way (${ways.getFlag(h.NS, "card").plan.ways.map((way) => way.name).join(", ")})`);
                const since = Date.now();
                await live().apply(ways.id, { choice: fire });
                const card = await h.messageAfter(since, h.itemCard("objects"), { what: "the Fire way's card" });
                h.assert(/data-air-field="amount"/.test(game.messages.get(card.id).content), "its typed field for the slot's rank");
                return errorOf(live().apply(card.id, { amount }));
            };
            const stored = await absorb(3);
            h.assert(!stored, `stored (${stored})`);
            await h.until(() => charges()?.count === 3 && charges()?.type === "fire", `3 fire charges on the club (${JSON.stringify(charges())})`, { timeout: 8000 });
            const refused = await absorb(2);
            h.assert(/still has 3 fire charges/.test(refused ?? ""), `refused while it holds some (${refused})`);
            h.assert(charges()?.count === 3, `still 3 (${JSON.stringify(charges())})`);
            let card = await activated(club, 1, "expose", "Explosive Cone's card");
            const plan = card.getFlag(h.NS, "card").plan;
            const formula = String(plan.resolution.sharedDamage?.components?.[0]?.formula ?? "");
            h.assert(formula === "3d6[fire]" && !plan.scaled && !plan.damageChoices, `3d6 fire, no typed amount or type pick (${formula}; scaled ${JSON.stringify(plan.scaled ?? null)}; choices ${(plan.damageChoices ?? []).length})`);
            await h.until(() => (Number(charges()?.count) || 0) === 0, `the charges spent (${JSON.stringify(charges())})`, { timeout: 8000 });
            await userToken.object?.control?.();
            const since = Date.now();
            await live().apply(card.id, { targets: [foeToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the cone's save card" });
            const saved = String(save.flags[ABILITY].card.plan.resolution.sharedDamage?.components?.[0]?.formula ?? "");
            h.assert(/^3d6/.test(saved) && /fire/.test(saved), `the save card's 3d6 fire (${saved})`);
            // (None stored now: the typed amount as before.)
            card = await activated(club, 1, "expose", "the second Explosive Cone's card");
            h.assert(card.getFlag(h.NS, "card").plan.scaled, "no charges: its typed amount back");
            const empty = await errorOf(live().apply(card.id, { targets: [foeToken.uuid] }));
            h.assert(/Type the amount/.test(empty ?? ""), `asks the amount (${empty})`);
            return { formula, saved, charges: charges() };
        },

        // Persistent Lodestone (objects op "reload", recalled): a Flintlock Pistol (reload 1) loaded from a stack of 4 and fired — a miss, PF2e spending
        // the round; the lodestone's card offers the pistol, and its Apply loads it again with none of the stack's 3 rounds spent.
        async triggersLodestoneRecalled(scene) {
            await h.clearSquares(scene, [[2, 18], [6, 18]]);
            const { actor: gunner, token: gunnerToken } = await h.creature(scene, "Lodestone Gunner", { type: "character", x: 2, y: 18, level: 7 });
            const { token: foeToken } = await h.creature(scene, "Lodestone Target", { x: 6, y: 18, ac: 60, alliance: "opposition" });
            const pistol = await h.give(gunner, "Flintlock Pistol");
            await pistol.update(held(1));
            const rounds = await h.give(gunner, "Rounds (Flintlock Pistol)");
            await rounds.update({ "system.quantity": 4 });
            const loaded = () => [...(gunner.items.get(pistol.id)?.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
            const stack = () => Number(gunner.items.get(rounds.id)?.system?.quantity ?? 0);
            await pistol.attach(rounds, { quantity: 1, stack: true });
            await h.until(() => loaded() === 1 && stack() === 3, `loaded from the stack (${loaded()}, ${stack()} left)`, { timeout: 5000 });
            await gunnerToken.object?.control?.();
            await h.target(foeToken);
            const { attack } = await h.withDie(10, () => h.strike(gunner, pistol));
            h.assert(["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome), `a miss (AC 60): ${attack.flags.pf2e.context.outcome}`);
            await h.until(() => loaded() === 0, `the round spent by PF2e's shot (${loaded()})`, { timeout: 8000 });
            const before = stack();
            const lodestone = await h.give(gunner, "Persistent Lodestone");
            const since = Date.now();
            await lodestone.consume();
            const card = await h.messageAfter(since, h.itemCard("objects"), { what: "the lodestone's card" });
            const at = (card.getFlag(h.NS, "card").choices ?? []).findIndex((choice) => choice.id === pistol.id);
            h.assert(at >= 0, `the pistol offered (${JSON.stringify(card.getFlag(h.NS, "card").choices)})`);
            await live().apply(card.id, { pick: at });
            await h.until(() => loaded() === 1, `loaded again (${loaded()})`, { timeout: 8000 });
            await h.wait(300);
            h.assert(stack() === before, `none of the stack spent (${before} → ${stack()})`);
            return { results: results(card), stack: [before, stack()] };
        },

        // Persistent Lodestone when the round missed with was the gunner's last: PF2e's attach deletes the emptied stack, then its shot spends the round,
        // so nothing of it is left on the gunner. The rule still recalls that round: the pistol offered and loaded. (Probes the bug reported with this
        // file — scripts/objects.js spentAmmoFor finds no stack then — and fails until it's fixed.)
        async triggersLodestoneLastRound(scene) {
            await h.clearSquares(scene, [[2, 19], [6, 19]]);
            const { actor: gunner, token: gunnerToken } = await h.creature(scene, "Lodestone Last Gunner", { type: "character", x: 2, y: 19, level: 7 });
            const { token: foeToken } = await h.creature(scene, "Lodestone Last Target", { x: 6, y: 19, ac: 60, alliance: "opposition" });
            const pistol = await h.give(gunner, "Flintlock Pistol");
            await pistol.update(held(1));
            const rounds = await h.give(gunner, "Rounds (Flintlock Pistol)");
            await rounds.update({ "system.quantity": 1 });
            const loaded = () => [...(gunner.items.get(pistol.id)?.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
            await pistol.attach(rounds, { quantity: 1, stack: true });
            await h.until(() => loaded() === 1, `its last round loaded (${loaded()})`, { timeout: 5000 });
            const stacks = () => gunner.items.filter((item) => item.type === "ammo").map((item) => `${item.name} ×${item.system?.quantity}`);
            await gunnerToken.object?.control?.();
            await h.target(foeToken);
            const { attack } = await h.withDie(10, () => h.strike(gunner, pistol));
            h.assert(["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome), `a miss (AC 60): ${attack.flags.pf2e.context.outcome}`);
            await h.until(() => loaded() === 0, `the round spent by PF2e's shot (${loaded()})`, { timeout: 8000 });
            const left = stacks();
            const lodestone = await h.give(gunner, "Persistent Lodestone");
            const since = Date.now();
            await lodestone.consume();
            const card = await h.messageAfter(since, h.itemCard("objects"), { what: "the lodestone's card" });
            const at = (card.getFlag(h.NS, "card").choices ?? []).findIndex((choice) => choice.id === pistol.id);
            h.assert(at >= 0, `the pistol offered though its last round is spent (ammunition left: ${left.join(", ") || "none"}; choices ${JSON.stringify(card.getFlag(h.NS, "card").choices)})`);
            await live().apply(card.id, { pick: at });
            await h.until(() => loaded() === 1, `the missed round loaded again (${loaded()})`, { timeout: 8000 });
            return { results: results(card), left };
        },

        // Chain of Stars (objects op "create" with quantity and damageType; scripts/objects.js spendMadeAfterAttack): the talisman used up, its card makes
        // 3 +1 striking shuriken of force in its user's hand, a Strike of its user's. A miss's attack roll takes one (3 → 2); a hit keeps it through the
        // attack roll and its force damage roll takes it (2 → 1); the last one's miss deletes it.
        async triggersChainOfStarsShuriken(scene) {
            await h.clearSquares(scene, [[2, 3], [4, 3], [4, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Star Thrower", { type: "character", x: 2, y: 3, level: 8 });
            const { token: hitToken } = await h.creature(scene, "Star Target Hit", { x: 4, y: 3, ac: 1, hp: 300, alliance: "opposition" });
            const { token: missToken } = await h.creature(scene, "Star Target Miss", { x: 4, y: 4, ac: 60, alliance: "opposition" });
            const chain = await h.give(user, "Chain of Stars");
            let since = Date.now();
            await chain.consume();
            const card = await h.messageAfter(since, h.itemCard("objects"), { what: "the chain's card" });
            await live().apply(card.id, {});
            const made = () => user.items.filter((item) => item.flags?.[h.NS]?.made?.vanishAfterAttack);
            await h.until(() => made().length === 1, `the shuriken made (${made().length}; ${results(card)})`, { timeout: 8000 });
            const [shuriken] = made();
            const quantity = () => Number(user.items.get(shuriken.id)?.system?.quantity ?? 0);
            h.assert(quantity() === 3 && shuriken.system.damage.damageType === "force" && shuriken.system.runes.potency === 1 && shuriken.system.runes.striking === 1 && shuriken.system.equipped.carryType === "held", `3 +1 striking force shuriken in hand (${quantity()}, ${shuriken.system.damage.damageType}, ${JSON.stringify(shuriken.system.runes)}, ${shuriken.system.equipped.carryType})`);
            h.assert((user.system.actions ?? []).some((action) => action.item?.id === shuriken.id), "a Strike with them");
            await userToken.object?.control?.();
            // (A miss: one gone after its attack roll.)
            await h.target(missToken);
            let { attack } = await h.withDie(10, () => h.strike(user, shuriken));
            h.assert(["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome), `a miss (AC 60): ${attack.flags.pf2e.context.outcome}`);
            await h.until(() => quantity() === 2, `3 → 2 after the miss (${quantity()})`, { timeout: 8000 });
            // (A hit: kept for its damage roll, gone after it.)
            await h.target(hitToken);
            const hit = await h.withDie(10, () => h.strike(user, shuriken));
            const outcome = hit.attack.flags.pf2e.context.outcome;
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
            await h.wait(1200);
            h.assert(quantity() === 2, `kept through the hit's attack roll (${quantity()})`);
            since = Date.now();
            await (outcome === "criticalSuccess" ? hit.action.critical : hit.action.damage)({ event: h.shift() });
            const rolled = await damageRoll(since, "the shuriken's damage roll");
            h.assert((rolled.rolls[0]?.instances ?? []).some((instance) => instance.type === "force"), `force damage (${rolled.rolls[0]?.formula})`);
            await h.until(() => quantity() === 1, `2 → 1 after the hit's damage roll (${quantity()})`, { timeout: 8000 });
            // (The last: a miss, and it's gone.)
            await h.target(missToken);
            ({ attack } = await h.withDie(10, () => h.strike(user, shuriken)));
            h.assert(["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome), `the last a miss (AC 60): ${attack.flags.pf2e.context.outcome}`);
            await h.until(() => !user.items.get(shuriken.id), "the last one gone after its attack", { timeout: 8000 });
            return { results: results(card), formula: rolled.rolls[0]?.formula };
        }
    };
};
