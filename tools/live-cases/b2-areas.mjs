// The second batch's areas group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code: Limning Gem's note rider on each hit with its weapon (scripts/attack-riders.js attackRidersRolled,
// rider.note — its rules with it, PF2e's Concealed granted only while the creature hit is Invisible), Sawtooth Reaper's fog on the readied
// Strike's Effect (src/live/strike-card.js strikeRules strike.userRules, strikeLines strike.userWords), and Zuhra's Gloves' toggle turned on in
// its rule's own domain (scripts/toggle-off.js toggleOn, plan.toggleOn.domain). The group's other asked-for checks feed mechanisms already
// live-checked: Ghost Lantern's and Candle of Revealing's zone on the user with its rules for those inside (zone.inside — litAreas,
// destabilizerAround; AdjustStrike adding a rune — runeOil; GrantItem predicated on Invisible — the Limning Gem case below, beaconShotPull),
// Inspiring Spotlight's burst (areaBuffs) with its zone light (sparkZoneLight) and the counteract card beside another route (goldenGlovesHalo)
// with a free row (movingDevilsTrap), Flask of Elemental Earth's placed zone with a save as it's made (redSpunCloud, censerSmoke), hazardous
// terrain on entering (movingHellfireTrail) and damage at a turn's end, and Caltrop Snare's zone.then (smokeSnareThen, bleedingSpinesThen).

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditions = (actor) => actor.itemTypes.condition.map((condition) => condition.slug).join(", ") || "none";
    const held = (hands) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const CONCEALED = "DmAIPqOBomZ7H95W";
    // (The Strike's attack modifier, PF2e's strike action's total: for an AC that gives a wanted degree at a set die.)
    const strikeModifier = (actor, weapon) => {
        const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
        const value = Number(action?.totalModifier);
        h.assert(Number.isFinite(value), `${actor.name}'s Strike modifier with ${weapon.name} (${action?.totalModifier})`);
        return value;
    };
    const strikesWith = (actor, ...weapons) => () => weapons.every((weapon) => (actor.system.actions ?? []).some((action) => action.item?.id === weapon.id));
    // (The readied Strike's Effect, scripts/strikes.js's.)
    const readiedOf = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);

    return {
        // Limning Gem (2026-10-27, area-readings.js; scripts/attack-riders.js attackRidersRolled, rider.note): "a weapon it's applied to … shedding
        // dim light in a 10-foot radius. Successful Strikes with a weapon affected by a limning gem outline the target in a bright white light; if
        // the target was Invisible, it becomes Concealed instead. This light lasts until the end of your next turn or for the remainder of the
        // limning gem's duration on a critical hit." Its card offers the user's longsword and dagger; the longsword picked, its user gets the
        // gem's light Effect (PF2e's TokenLight, dim 10) and its watch Effect on the longsword, each for 1 minute. A longsword hit (a d20 of 10,
        // its AC 5 under the roll) on an Invisible creature: the "Limning Gem: Outlined in light" note Effect on it, 1 round to a turn's end, and
        // PF2e's Concealed granted. A dagger hit on a visible creature: no note. A longsword hit on it: the note, no Concealed. A longsword
        // critical hit (its AC 15 under the roll) on a third: the note with no end (unlimited, the GM's to delete with the gem).
        async b2AreasLimningGemOutline(scene) {
            await h.clearSquares(scene, [[4, 4], [5, 4], [5, 5], [4, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Limning Duelist", { type: "character", x: 4, y: 4 });
            const sword = await h.give(user, "Longsword");
            await sword.update(held(1));
            const dagger = await h.give(user, "Dagger");
            await dagger.update(held(1));
            await h.until(strikesWith(user, sword, dagger), "Strikes with the longsword and the dagger", { timeout: 5000 });
            // (Totals at a d20 of 10: a hit, not a critical one, 5 over the AC; a critical hit 15 over it.)
            const swordTotal = strikeModifier(user, sword) + 10;
            const daggerTotal = strikeModifier(user, dagger) + 10;
            const { actor: hidden, token: hiddenToken } = await h.creature(scene, "Limning Invisible Mark", { x: 5, y: 4, ac: swordTotal - 5, hp: 200, alliance: "opposition" });
            const { actor: seen, token: seenToken } = await h.creature(scene, "Limning Visible Mark", { x: 5, y: 5, ac: Math.min(swordTotal, daggerTotal) - 5, hp: 200, alliance: "opposition" });
            const { actor: struck, token: struckToken } = await h.creature(scene, "Limning Critical Mark", { x: 4, y: 5, ac: swordTotal - 15, hp: 200, alliance: "opposition" });
            await hidden.increaseCondition("invisible");
            await h.until(() => hidden.hasCondition("invisible"), "the first mark Invisible", { timeout: 5000 });
            const gem = await h.give(user, "Limning Gem");
            const since = Date.now();
            await gem.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the gem's card" });
            const weapons = card.getFlag(h.NS, "card").weapons ?? [];
            const at = weapons.findIndex((weapon) => weapon.id === sword.id);
            h.assert(at >= 0 && weapons.some((weapon) => weapon.id === dagger.id), `the longsword and the dagger offered (${JSON.stringify(weapons)})`);
            await live().apply(card.id, { runeWeapon: at });
            const watch = () => user.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "attackRiders")?.item?.name === "Limning Gem");
            await h.until(() => watch(), `the gem's watch Effect on its user (${names(user)})`, { timeout: 8000 });
            const watched = watch();
            h.assert(watched.getFlag(h.NS, "attackRiders").weapon?.id === sword.id, `the watch on the longsword (${JSON.stringify(watched.getFlag(h.NS, "attackRiders").weapon)})`);
            h.assert(Number(watched.system.duration?.value) === 1 && watched.system.duration?.unit === "minutes", `the watch for 1 minute (${JSON.stringify(watched.system.duration)})`);
            const light = user.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "light") && (effect.system.rules ?? []).some((rule) => rule.key === "TokenLight" && Number(rule.value?.dim) === 10));
            h.assert(light && Number(light.system.duration?.value) === 1 && light.system.duration?.unit === "minutes", `its 10 feet of dim light for 1 minute (${names(user)})`);
            const outlines = (actor) => actor.itemTypes.effect.filter((effect) => /^Limning Gem\b/.test(effect.name) && /Outlined in light/.test(effect.name));
            // (A Strike at a d20 of 10 at that creature, its degree checked: the riders fire on PF2e's attack roll message.)
            const hit = async (weapon, token, want) => {
                await userToken.object?.control?.();
                await h.target(token);
                const { attack } = await h.withDie(10, () => h.strike(user, weapon));
                const outcome = attack.flags.pf2e.context.outcome;
                h.assert(want.includes(outcome), `${weapon.name} at ${token.name}: ${want.join(" or ")} (${outcome}: ${attack.rolls?.[0]?.total} against AC ${token.actor?.system?.attributes?.ac?.value})`);
                return outcome;
            };
            await hit(sword, hiddenToken, ["success"]);
            await h.until(() => outlines(hidden).length && hidden.hasCondition("concealed"), `the outline's note and Concealed on the Invisible mark (${names(hidden)}; ${conditions(hidden)})`, { timeout: 10000 });
            const first = outlines(hidden)[0].system.duration;
            h.assert(Number(first.value) === 1 && first.unit === "rounds" && first.expiry === "turn-end", `to the end of its user's next turn (${JSON.stringify(first)})`);
            await hit(dagger, seenToken, ["success", "criticalSuccess"]);
            await h.wait(1500);
            h.assert(!outlines(seen).length, `no outline from the dagger (${names(seen)})`);
            await hit(sword, seenToken, ["success"]);
            await h.until(() => outlines(seen).length, `the outline's note on the visible mark (${names(seen)})`, { timeout: 10000 });
            await h.wait(800);
            h.assert(!seen.hasCondition("concealed"), `the visible mark not Concealed (${conditions(seen)})`);
            await hit(sword, struckToken, ["criticalSuccess"]);
            await h.until(() => outlines(struck).length, `the critical hit's outline (${names(struck)})`, { timeout: 10000 });
            const lasting = outlines(struck)[0].system.duration;
            h.assert(lasting.unit === "unlimited", `no end of its own on a critical hit (${JSON.stringify(lasting)})`);
            h.assert(!struck.hasCondition("concealed"), `the visible critical mark not Concealed (${conditions(struck)})`);
            return { hidden: names(hidden), hiddenConditions: conditions(hidden), seen: names(seen), critical: JSON.stringify(lasting), light: light.name };
        },

        // Sawtooth Reaper's Bloodmist Whirl (2026-10-27, area-readings.js; src/live/strike-card.js strike.userRules / userWords): "creating a crimson
        // fog that conceals you for 1 round or until you Strike. The next Strike you make treats the target as Off-Guard". Its Strike card says the
        // fog's line; readied, the Strike's Effect on its user (1 round, to the start of its turn) carries PF2e's GrantItem of Concealed beside the
        // EphemeralEffect of Off-Guard, and its user is Concealed. Its Strike with the reaper (a d20 of 10, AC 1): the target Off-Guard to it, and
        // once the attack is rolled the Effect is spent — its user no longer Concealed.
        async b2AreasBloodmistWhirlFog(scene) {
            await h.clearSquares(scene, [[4, 8], [5, 8]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Bloodmist Whirler", { type: "character", x: 4, y: 8, level: 15 });
            const { token: foeToken } = await h.creature(scene, "Bloodmist Mark", { x: 5, y: 8, ac: 1, hp: 300, alliance: "opposition" });
            const reaper = await h.give(user, "Sawtooth Reaper");
            await reaper.update(held(2));
            await h.until(strikesWith(user, reaper), "a Strike with the reaper", { timeout: 5000 });
            h.assert(!user.hasCondition("concealed"), `not Concealed before the whirl (${conditions(user)})`);
            const since = Date.now();
            await live().activate(reaper.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the whirl's Strike card" });
            h.assert(/Concealed in the crimson fog until it Strikes or the start of its next turn/.test(card.content), `the fog's line on the card (${card.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)})`);
            await live().apply(card.id);
            await h.until(() => readiedOf(user) && user.hasCondition("concealed"), `the readied Strike's Effect and its user Concealed (${names(user)}; ${conditions(user)})`, { timeout: 8000 });
            const readied = readiedOf(user);
            const rules = readied.system.rules ?? [];
            h.assert(rules.some((rule) => rule.key === "GrantItem" && String(rule.uuid).endsWith(CONCEALED)) && rules.some((rule) => rule.key === "EphemeralEffect"), `Concealed and Off-Guard on the readied Effect (${JSON.stringify(rules.map((rule) => rule.key))})`);
            const duration = readied.system.duration;
            h.assert(Number(duration.value) === 1 && duration.unit === "rounds" && duration.expiry === "turn-start", `to the start of its user's next turn (${JSON.stringify(duration)})`);
            await userToken.object?.control?.();
            await h.target(foeToken);
            const { attack } = await h.withDie(10, () => h.strike(user, reaper));
            h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
            const options = attack.flags.pf2e.context.options ?? [];
            h.assert(options.includes("target:condition:off-guard"), `the target Off-Guard to it (${options.filter((option) => option.startsWith("target:condition")).join(", ") || "none"})`);
            await h.until(() => !readiedOf(user) && !user.hasCondition("concealed"), `the readied Effect spent and the fog's Concealed gone (${names(user)}; ${conditions(user)})`, { timeout: 8000 });
            return { outcome: attack.flags.pf2e.context.outcome, rules: rules.map((rule) => rule.key), conditions: conditions(user) };
        },

        // Zuhra's Gloves' Zuhra's Stratagem (2026-10-27, area-readings.js; scripts/toggle-off.js toggleOn in plan.toggleOn.domain): worn and
        // invested, the gloves give +3 item to its Reflex DC against Disarm (PF2e's FlatModifier, predicated not "wall-of-metal"). The ways card's
        // Offense way: the cast card of Weapon Storm at 6th rank, DC 30 — the toggle still off, the +3 still there. A second activation's Defense
        // way ("You lose the gloves' item bonus until the barrier ends"): the cast card of Wall of Metal at DC 30, and the gloves' own PF2e toggle
        // "wall-of-metal" (domain saving-throw) on, so the +3 against Disarm is gone. (The casts themselves are the spell module's, not applied.)
        async b2AreasZuhraStratagemToggle(scene) {
            await h.clearSquares(scene, [[4, 12]]);
            const { actor: user } = await h.creature(scene, "Zuhra Glove Wearer", { type: "character", x: 4, y: 12, level: 13 });
            const sword = await h.give(user, "Longsword");
            await sword.update(held(1));
            const gloves = await h.give(user, "Zuhra's Gloves");
            await gloves.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            // (Its Reflex DC with those roll options, PF2e's own statistic: against Disarm, "action:disarm".)
            const reflexDC = (options) => Number(user.getStatistic("reflex")?.withRollOptions({ extraRollOptions: options })?.dc?.value);
            const disarmBonus = () => reflexDC(["action:disarm"]) - reflexDC([]);
            const toggled = () => Boolean(user.rollOptions?.["saving-throw"]?.["wall-of-metal"]);
            await h.until(() => disarmBonus() === 3, `the gloves' +3 to its Reflex DC against Disarm (+${disarmBonus()})`, { timeout: 5000 });
            h.assert(!toggled(), "the wall-of-metal toggle off at first");
            const stratagem = async (pattern) => {
                let since = Date.now();
                await live().activate(gloves.uuid, 0);
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the stratagem's ways card" });
                const offered = ways.getFlag(h.NS, "card").ways ?? [];
                const choice = offered.findIndex((name) => pattern.test(name));
                h.assert(choice >= 0, `the way ${pattern} offered (${JSON.stringify(offered)})`);
                since = Date.now();
                await live().apply(ways.id, { choice });
                const cast = await h.messageAfter(since, h.itemCard("cast"), { what: `the cast card of ${offered[choice]}` });
                return cast.getFlag(h.NS, "card").plan;
            };
            const offense = await stratagem(/^Offense/);
            h.assert(offense.spell?.name === "Weapon Storm" && offense.rank === 6 && offense.dc === 30, `Weapon Storm at 6th rank, DC 30 (${offense.spell?.name}, ${offense.rank}, ${offense.dc})`);
            await h.wait(1000);
            h.assert(!toggled() && disarmBonus() === 3, `the offense leaves the toggle off and the +3 (toggle ${toggled()}, +${disarmBonus()})`);
            const defense = await stratagem(/^Defense/);
            h.assert(defense.spell?.name === "Wall of Metal" && defense.dc === 30, `Wall of Metal at DC 30 (${defense.spell?.name}, ${defense.dc})`);
            await h.until(() => toggled(), `PF2e's wall-of-metal toggle on in its saving-throw domain (${JSON.stringify(user.rollOptions?.["saving-throw"] ?? {})})`, { timeout: 8000 });
            await h.until(() => disarmBonus() === 0, `the +3 to its Reflex DC against Disarm gone (+${disarmBonus()})`, { timeout: 8000 });
            const rule = (user.items.get(gloves.id)?.system?.rules ?? []).find((entry) => entry.key === "RollOption" && entry.option === "wall-of-metal");
            return { offense: `${offense.spell?.name} ${offense.rank} DC ${offense.dc}`, defense: `${defense.spell?.name} DC ${defense.dc}`, toggle: rule?.value ?? null, reflexDC: reflexDC([]), againstDisarm: reflexDC(["action:disarm"]) };
        }
    };
};
