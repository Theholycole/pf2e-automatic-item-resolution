// The strike group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
const ABILITY = "pf2e-automatic-ability-resolution";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    const text = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const resultsOf = (card) => game.messages.get(card.id)?.getFlag(h.NS, "card")?.results ?? [];
    // (A summary line this module posts for the item after the Strike: not a card, its item's name in bold.)
    const lineFor = (name, actor) => (message) => !message.getFlag(h.NS, "card") && message.speaker?.actor === actor.id && String(message.content ?? "").includes(`<strong>${name}</strong>`);
    // (PF2e's persistent damage condition, as tools/live-check.mjs's cases make it.)
    const persistentSource = (formula, damageType, dc = 15) => {
        const source = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        source.system.persistent = { formula, damageType, dc };
        return source;
    };
    const persistentOf = (actor, types) => () => actor.itemTypes.condition.filter((condition) => condition.slug === "persistent-damage" && types.includes(condition.system?.persistent?.damageType));
    // (PF2e's degrees of success for an attack roll against an AC: ±10 a step, a natural 20 one better, a natural 1 one worse.)
    const STEPS = ["criticalFailure", "failure", "success", "criticalSuccess"];
    const WORDS = { criticalSuccess: "a critical hit", success: "a hit", failure: "a miss", criticalFailure: "a critical miss" };
    const degreeOf = (total, natural, ac, { shift = true } = {}) => {
        const by = total - ac;
        let step = by >= 10 ? 3 : by >= 0 ? 2 : by > -10 ? 1 : 0;
        if (shift && natural === 20) step = Math.min(3, step + 1);
        if (shift && natural === 1) step = Math.max(0, step - 1);
        return STEPS[step];
    };
    const rollOf = (attack) => ({ total: Number(attack.rolls?.[0]?.total), natural: Number(attack.rolls?.[0]?.dice?.[0]?.total) });
    const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // (The Strike's attack modifier, PF2e's strike action's total: for an AC that gives a wanted degree at a set die.)
    const strikeModifier = (actor, weapon) => {
        const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
        const value = Number(action?.totalModifier);
        h.assert(Number.isFinite(value), `${actor.name}'s Strike modifier with ${weapon.name} (${action?.totalModifier})`);
        return value;
    };
    // (PF2e's damage roll of that Strike, its normal or critical button.)
    const damageRoll = async (action, critical) => {
        const since = Date.now();
        await (critical ? action.critical : action.damage)({ event: h.shift() });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
    };
    // (A damage roll's persistent bleed: the dice in it, and their most.)
    const bleedOf = (message) => {
        const instances = (message.rolls?.[0]?.instances ?? []).filter((instance) => instance.type === "bleed");
        return {
            dice: instances.flatMap((instance) => (instance.dice ?? []).filter((die) => Number(die.number) > 0).map((die) => `${die.number}d${die.faces}`)),
            max: instances.reduce((sum, instance) => sum + (Number(instance.maximumValue) || 0), 0),
            formula: instances.map((instance) => instance.head?.expression ?? instance.formula).join(" + ")
        };
    };
    // (A damage roll's modifier by its slug's start, applied: PF2e's message keeps them in flags.pf2e.modifiers.)
    const modifierOf = (message, start) => (message.flags?.pf2e?.modifiers ?? []).find((modifier) => String(modifier.slug ?? "").startsWith(start) && modifier.enabled !== false && !modifier.ignored);
    const modifiersSaid = (message) => JSON.stringify((message.flags?.pf2e?.modifiers ?? []).map((modifier) => [modifier.slug, modifier.modifier, modifier.enabled, modifier.ignored]));

    // Extinguishing Ball: one shot at a creature taking persistent fire and acid, at a set degree (scripts/strikes.js strike.recover, scripts/foundry.js
    // recover, src/live/strike-card.js riderFor's failRow). → what the degree's case checks.
    const extinguish = async (scene, { name, x, y, ac, face, want }) => {
        await h.clearSquares(scene, [[x, y], [x + 2, y]]);
        const { actor: slinger, token: slingerToken } = await h.creature(scene, `${name} Slinger`, { type: "character", x, y, level: 8 });
        const { actor: foe, token: foeToken } = await h.creature(scene, `${name} Burning`, { x: x + 2, y, ac, hp: 300, alliance: "opposition" });
        const burning = persistentOf(foe, ["fire", "acid"]);
        await foe.createEmbeddedDocuments("Item", [persistentSource("1d6", "fire"), persistentSource("1d4", "acid")]);
        await h.until(() => burning().length === 2, "persistent fire and acid on the target", { timeout: 5000 });
        const sling = await h.give(slinger, "Sling");
        const ball = await h.give(slinger, "Extinguishing Ball");
        // (Sling bullets, give() presetting ammunition that names none to arrows; reload 0, so PF2e takes the selected ammunition — as castOnHit.)
        await ball.update({ "system.quantity": 2, "system.baseItem": "sling-bullets" });
        await sling.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.selectedAmmoId": ball.id, "system.reload.value": "0" });
        const readied = readiedOf(slinger);
        let since = Date.now();
        await api().activate(ball.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the ball's Strike card" });
        h.assert(/It deals no damage/.test(text(card)), `the card's no-damage line (${text(card).slice(0, 300)})`);
        await api().apply(card.id);
        await h.until(() => readied()?.flags[h.NS].strikeRider.ammoId === ball.id, "the readied Strike for the ball", { timeout: 8000 });
        await slingerToken.object?.control?.();
        await h.target(foeToken);
        since = Date.now();
        const { attack } = await h.withDie(face, () => h.strike(slinger, sling));
        const outcome = attack.flags.pf2e.context.outcome;
        h.assert(outcome === want, `a ${want} (d20 ${face}, AC ${ac}): ${outcome}`);
        const said = await h.messageAfter(since, lineFor("Extinguishing Ball", slinger), { what: "the ball's line after the Strike", timeout: 10000 });
        const doused = () => foe.itemTypes.effect.find((effect) => /Doused/.test(effect.name));
        await h.until(() => doused(), `the Doused note Effect (${foe.itemTypes.effect.map((effect) => effect.name).join(", ")}; ${text(said)})`, { timeout: 8000 });
        const rule = (doused().system.rules ?? []).find((entry) => entry.key === "ItemAlteration" && entry.property === "pd-recovery-dc");
        h.assert(rule?.value === 10 && rule.mode === "downgrade", `its PF2e ItemAlteration pd-recovery-dc to 10 (${JSON.stringify(doused().system.rules)})`);
        await h.until(() => !readied(), "the readied Strike spent", { timeout: 8000 });
        return { foe, burning, doused, said: text(said), outcome };
    };
    const dcs = (conditions) => conditions.map((condition) => `${condition.system.persistent.damageType} DC ${condition.system.persistent.dc}`).join(", ");

    // Iron Cube: its readied melee Strike with a d12 greataxe hits (AC 1), the Trip card follows; Apply rolls PF2e's Trip (Reflex DC −20, a success)
    // and the prone damage card is the ability module's — with Slam Down, the weapon's die in place of the d6 (withFeatDie). Every die at its
    // highest while that card is applied: the damage dealt is the formula's most.
    const ironCube = async (scene, { name, x, y, feat }) => {
        await h.clearSquares(scene, [[x, y], [x + 1, y]]);
        const { actor: fighter, token: fighterToken } = await h.creature(scene, `${name} Fighter`, { type: "character", x, y, level: 6 });
        const { actor: foe, token: foeToken } = await h.creature(scene, `${name} Target`, { x: x + 1, y, ac: 1, hp: 300, save: -30, alliance: "opposition" });
        const axe = await h.give(fighter, "Greataxe");
        await axe.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        if (feat) {
            await h.give(fighter, "Slam Down", "pf2e.feats-srd");
            await h.until(() => fighter.rollOptions?.all?.["feat:slam-down"], "PF2e's feat:slam-down roll option on the fighter", { timeout: 5000 });
        } else h.assert(!fighter.rollOptions?.all?.["feat:slam-down"], "no Slam Down");
        const cube = await h.give(fighter, "Iron Cube");
        await fighterToken.object?.control?.();
        let since = Date.now();
        await cube.consume();
        const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the cube's Strike card" });
        await api().apply(card.id);
        await h.wait(600);
        await h.target(foeToken);
        since = Date.now();
        const { attack } = await h.withDie(15, () => h.strike(fighter, axe));
        h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const trip = await h.messageAfter(since, h.itemCard("item-action"), { what: "the Trip card" });
        h.assert(trip.getFlag(h.NS, "card").plan.action.slug === "trip", "PF2e's Trip");
        since = Date.now();
        await api().apply(trip.id, { targets: [foeToken.uuid] });
        const prone = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && (message.flags[ABILITY].card.plan?.resolution?.sharedDamage?.components ?? []).length > 0, { what: `the prone damage card (the Trip card: ${resultsOf(trip).join(" / ")})`, timeout: 10000 });
        const formula = String(prone.flags[ABILITY].card.plan.resolution.sharedDamage.components[0].formula);
        const before = foe.system.attributes.hp.value;
        await h.withDie(20, async () => {
            await h.applyAbilityCard(prone);
            await h.until(() => foe.system.attributes.hp.value < before, "the prone damage dealt", { timeout: 10000 });
        });
        return { formula, lost: before - foe.system.attributes.hp.value, trip: resultsOf(trip) };
    };

    return {
        // Extinguishing Ball, critical hit (d20 15 at AC −20): "the water removes all instances of persistent acid or fire damage affecting the
        // target. In addition, it reduces the DC of any future flat checks to end persistent acid or fire damage to 10 for 1 minute." Both the fire
        // and the acid conditions are deleted (strike.recover's ends), the Doused note Effect lasts 1 minute, and a persistent fire given after it
        // shows DC 10 (PF2e's ItemAlteration pd-recovery-dc).
        async strikeExtinguishingCrit(scene) {
            const { foe, burning, doused, said } = await extinguish(scene, { name: "Douse Crit", x: 1, y: 1, ac: -20, face: 15, want: "criticalSuccess" });
            await h.until(() => burning().length === 0, `every persistent fire and acid ended (${dcs(burning())}; ${said})`, { timeout: 8000 });
            const duration = doused().system.duration;
            h.assert(duration.value === 1 && duration.unit === "minutes", `Doused for 1 minute (${JSON.stringify(duration)})`);
            await foe.createEmbeddedDocuments("Item", [persistentSource("1d6", "fire")]);
            await h.until(() => burning().length === 1 && burning()[0].system.persistent.dc === 10, `a later persistent fire at DC 10 (${dcs(burning())})`, { timeout: 8000 });
            return { said, later: dcs(burning()) };
        },

        // Extinguishing Ball, hit (d20 1 at AC −20: a critical hit made a hit by the natural 1): "The water removes one instance of persistent acid
        // or fire damage … reducing the DC of the target's next flat check to 10". Exactly one of the two conditions is deleted (recovery.one), and
        // the one left shows DC 10 while the Doused note Effect lasts.
        async strikeExtinguishingHit(scene) {
            const { burning, said } = await extinguish(scene, { name: "Douse Hit", x: 1, y: 3, ac: -20, face: 1, want: "success" });
            await h.until(() => burning().length === 1, `exactly one persistent fire or acid ended (left: ${dcs(burning())}; ${said})`, { timeout: 8000 });
            await h.wait(800);
            h.assert(burning().length === 1, `still exactly one left (${dcs(burning())})`);
            await h.until(() => burning()[0].system.persistent.dc === 10, `the one left at DC 10 (${dcs(burning())})`, { timeout: 8000 });
            return { said, left: dcs(burning()) };
        },

        // Extinguishing Ball, failure (d20 20 at AC 60: a critical miss made a miss by the natural 20): "misses the target but impacts nearby …
        // reduce the DC of their next flat check to end one instance of persistent acid or fire damage to 10". The failure's row plays
        // (strike.failRow): no condition is removed, and both show DC 10 while the Doused note Effect lasts.
        async strikeExtinguishingFailure(scene) {
            const { burning, said } = await extinguish(scene, { name: "Douse Miss", x: 1, y: 5, ac: 60, face: 20, want: "failure" });
            await h.wait(800);
            h.assert(burning().length === 2, `both persistent fire and acid still there (${dcs(burning())}; ${said})`);
            await h.until(() => burning().every((condition) => condition.system.persistent.dc === 10), `both at DC 10 (${dcs(burning())})`, { timeout: 8000 });
            return { said, dcs: dcs(burning()) };
        },

        // Garrote Shot: "When the activated ammunition hits a target, it transforms into a silvery garrote … dealing 2d12 persistent slashing. On a
        // critical hit, it wraps around the target's throat … and the target can't breathe until the persistent damage ends." A critical hit (d20
        // 15 at AC −20), then PF2e's critical damage roll applied (its own 2d12 persistent slashing, the ammunition's DamageDice): the target has
        // the 'Garrote Shot (around its throat)' note Effect (the ability module's whilePersistent slashing) while the persistent slashing lasts,
        // and it goes when that condition is deleted. (The rider is applied at the attack roll, before the damage roll: see the result's bugs.)
        async strikeGarroteThroat(scene) {
            await h.clearSquares(scene, [[1, 7], [3, 7]]);
            const { actor: archer, token: archerToken } = await h.creature(scene, "Garrote Archer", { type: "character", x: 1, y: 7, level: 15 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Garrote Target", { x: 3, y: 7, ac: -20, hp: 400, alliance: "opposition" });
            const bow = await h.give(archer, "Shortbow");
            const shots = await h.give(archer, "Garrote Shot");
            await shots.update({ "system.quantity": 2, "system.baseItem": "arrows" });
            await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": shots.id });
            const readied = readiedOf(archer);
            let since = Date.now();
            await api().activate(shots.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the shot's Strike card" });
            await api().apply(card.id);
            await h.until(() => readied()?.flags[h.NS].strikeRider.ammoId === shots.id, "the readied Strike for the shot", { timeout: 8000 });
            await archerToken.object?.control?.();
            await h.target(foeToken);
            since = Date.now();
            const { action, attack } = await h.withDie(15, () => h.strike(archer, bow));
            h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC −20): ${attack.flags.pf2e.context.outcome}`);
            const said = await h.messageAfter(since, lineFor("Garrote Shot", archer), { what: "the shot's line after the Strike", timeout: 10000 });
            const rolled = await damageRoll(action, true);
            await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken });
            const slashing = persistentOf(foe, ["slashing"]);
            await h.until(() => slashing().length > 0, `PF2e's persistent slashing from the damage roll (${rolled.rolls?.[0]?.formula})`, { timeout: 8000 });
            const throat = () => foe.itemTypes.effect.find((effect) => /around its throat/.test(effect.name));
            await h.until(() => throat(), `the garrote's note Effect while the persistent slashing lasts (effects: ${foe.itemTypes.effect.map((effect) => effect.name).join(", ") || "none"}; the line after the Strike: ${text(said)})`, { timeout: 8000 });
            h.assert(throat().flags?.[ABILITY]?.whilePersistent === "slashing", `it lasts while the persistent slashing does (${JSON.stringify(throat().flags?.[ABILITY] ?? {})})`);
            const persistent = slashing().map((condition) => condition.system.persistent.formula);
            await h.wait(800);
            h.assert(throat(), "the note still there while the persistent slashing lasts");
            await foe.deleteEmbeddedDocuments("Item", slashing().map((condition) => condition.id));
            await h.until(() => !throat(), "the note gone with the persistent slashing", { timeout: 8000 });
            return { said: text(said), persistent, note: "around its throat" };
        },

        // Iron Cube with Slam Down and a d12 greataxe: "increase the damage dice if you knock the target prone to the damage die of your weapon if
        // it's higher than d6" — the prone damage card's formula is 2d12 and, every die at its highest, 24 damage is dealt.
        async strikeIronCubeSlamDown(scene) {
            const { formula, lost, trip } = await ironCube(scene, { name: "Slam Cube", x: 6, y: 1, feat: true });
            h.assert(formula === "2d12", `the prone damage at the greataxe's d12 (${formula})`);
            h.assert(lost === 24, `2d12 at its highest dealt: 24 (${lost})`);
            return { formula, lost, trip };
        },

        // Iron Cube without Slam Down, the same d12 greataxe: the prone damage stays the text's 2d6 — the card's formula 2d6, 12 dealt at the dice's
        // highest.
        async strikeIronCubeNoFeat(scene) {
            const { formula, lost, trip } = await ironCube(scene, { name: "Plain Cube", x: 6, y: 3, feat: false });
            h.assert(formula === "2d6", `the prone damage the text's 2d6 (${formula})`);
            h.assert(lost === 12, `2d6 at its highest dealt: 12 (${lost})`);
            return { formula, lost, trip };
        },

        // Minotaur Chair's charge with a +1 striking wounding shortsword (src/live/strike-card.js strikeRules: strike.flat, strike.runeDice, the
        // DamageDice' critical flag): "If the foe is Prone … the attack gains a +1 circumstance bonus to damage per weapon damage die, and the
        // wounding rune deals 1d12 bleed on a hit (or 3d6 bleed on a critical hit)". Three foes readied: a prone one hit (d20 10, its AC set for a
        // hit), a prone one critically hit (d20 15 at AC 1) and a standing one hit. PF2e's damage rolls: prone and hit, +2 circumstance (2 dice) and
        // its bleed 1d12 alone (no wounding 1d6); prone and critical, +2 and its bleed 3d6 alone, at most 18 (not doubled); standing, no circumstance
        // bonus and the wounding rune's own 1d6 bleed alone. (PF2e reads a DamageDice' critical: false as "not doubled", still added on a critical
        // hit — its createDamageFormula's outcomeMatches —, so the critical hit's bleed is expected to come out 1d12 + 3d6: see the result's bugs.)
        async strikeMinotaurProne(scene) {
            await h.clearSquares(scene, [[10, 1], [11, 1], [11, 2], [10, 2]]);
            const { actor: rider, token: riderToken } = await h.creature(scene, "Chair Charger", { type: "character", x: 10, y: 1, level: 9 });
            const chair = await h.give(rider, "Minotaur Chair");
            await chair.update({ "system.equipped.carryType": "worn" });
            const sword = await h.give(rider, "Shortsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.runes.potency": 1, "system.runes.striking": 1, "system.runes.property": ["wounding"] });
            const weaponDice = Number(rider.items.get(sword.id).system.damage.dice);
            h.assert(weaponDice === 2, `a striking shortsword's 2 damage dice (${weaponDice})`);
            // (A hit, not a critical one, at d20 10: its AC 3 under the roll — prone's −2 off-guard leaves it a hit too.)
            const hitAC = 10 + strikeModifier(rider, sword) - 3;
            const { actor: proneHit, token: proneHitToken } = await h.creature(scene, "Chair Prone Hit", { x: 11, y: 1, ac: hitAC, hp: 300, alliance: "opposition" });
            const { actor: proneCrit, token: proneCritToken } = await h.creature(scene, "Chair Prone Crit", { x: 11, y: 2, ac: 1, hp: 300, alliance: "opposition" });
            const { token: standingToken } = await h.creature(scene, "Chair Standing", { x: 10, y: 2, ac: hitAC, hp: 300, alliance: "opposition" });
            await proneHit.increaseCondition("prone");
            await proneCrit.increaseCondition("prone");
            await h.until(() => proneHit.hasCondition("prone") && proneCrit.hasCondition("prone"), "two foes prone", { timeout: 5000 });
            await h.until(() => riderToken.object && proneHitToken.object && proneCritToken.object && standingToken.object, "the tokens drawn", { timeout: 5000 });
            await riderToken.object?.control?.();
            const readied = readiedOf(rider);
            const since = Date.now();
            await api().activate(chair.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the chair's Strike card" });
            await api().apply(card.id, { targets: [proneHitToken.uuid, proneCritToken.uuid, standingToken.uuid] });
            await h.until(() => readied()?.flags[h.NS].strikeRider.uses === 3, "one Strike readied at each of the three", { timeout: 8000 });
            const rules = readied().system.rules ?? [];
            h.assert(rules.some((rule) => rule.key === "FlatModifier" && rule.type === "circumstance" && /@weapon\.system\.damage\.dice/.test(String(rule.value))) && rules.some((rule) => rule.key === "DamageAlteration" && rule.slug === "wounding"), `the readied Strike's PF2e rules (${JSON.stringify(rules)})`);
            const at = async (token, { face, critical, left }) => {
                await h.target(token);
                const { action, attack } = await h.withDie(face, () => h.strike(rider, sword));
                const outcome = attack.flags.pf2e.context.outcome;
                h.assert(outcome === (critical ? "criticalSuccess" : "success"), `${critical ? "a critical hit" : "a hit"} at ${token.name} (d20 ${face}, AC ${token.actor.attributes.ac.value}): ${outcome}`);
                await h.until(() => readied()?.flags[h.NS].strikeRider.awaiting === true, "the readied Strike kept for its damage roll", { timeout: 8000 });
                const rolled = await damageRoll(action, critical);
                await h.until(() => (left ? readied()?.flags[h.NS].strikeRider.uses === left : !readied()), `${left ? `${left} left` : "all spent"} after the damage roll`, { timeout: 8000 });
                return rolled;
            };
            const hit = await at(proneHitToken, { face: 10, critical: false, left: 2 });
            const hitBleed = bleedOf(hit);
            const hitFlat = modifierOf(hit, "minotaur-chair-flat");
            h.assert(hitFlat?.modifier === weaponDice && hitFlat.type === "circumstance", `prone, hit: +${weaponDice} circumstance (${modifiersSaid(hit)})`);
            h.assert(hitBleed.dice.join(",") === "1d12", `prone, hit: its bleed 1d12 alone, no wounding 1d6 (${hitBleed.formula})`);
            const crit = await at(proneCritToken, { face: 15, critical: true, left: 1 });
            const critBleed = bleedOf(crit);
            const critFlat = modifierOf(crit, "minotaur-chair-flat");
            h.assert(critFlat?.modifier === weaponDice, `prone, critical hit: +${weaponDice} circumstance (${modifiersSaid(crit)})`);
            h.assert(critBleed.dice.join(",") === "3d6" && critBleed.max === 18, `prone, critical hit: its bleed 3d6 alone, not doubled (${critBleed.formula}, at most ${critBleed.max})`);
            const standing = await at(standingToken, { face: 10, critical: false, left: 0 });
            const standingBleed = bleedOf(standing);
            h.assert(!modifierOf(standing, "minotaur-chair-flat"), `standing: no circumstance bonus (${modifiersSaid(standing)})`);
            h.assert(standingBleed.dice.join(",") === "1d6", `standing: the wounding rune's own 1d6 bleed alone (${standingBleed.formula})`);
            return { prone: [hitBleed.formula, critBleed.formula], standing: standingBleed.formula, circumstance: hitFlat.modifier };
        },

        // Hippopotamus Klar's Engulfing Jaws (volley.oneRoll { count 2, adjacent }): "Make a melee Strike with the klar blade targeting two
        // creatures adjacent to each other. Roll the attack and damage once and apply it to each creature separately." Apply refuses one target and
        // three; two adjacent ones ready one Strike (uses 1, both kept). The Strike at the first (AC 1) with a natural 20: a chat line gives the same
        // roll's result against the second's AC — set 5 over the roll, a miss made a hit by the natural 20 (degreeAgainst) — and the Strike is spent.
        // (The readied Strike is any melee Strike, strike.own false: a shortsword in the other hand makes it.)
        async strikeKlarEngulfingJaws(scene) {
            await h.clearSquares(scene, [[14, 1], [15, 1], [15, 2], [14, 2]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Klar Biter", { type: "character", x: 14, y: 1, level: 10 });
            const klar = await h.give(user, "Hippopotamus Klar");
            await klar.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.equipped.invested": true });
            const sword = await h.give(user, "Shortsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const otherAC = 20 + strikeModifier(user, sword) + 5;
            const { token: firstToken } = await h.creature(scene, "Jaws First", { x: 15, y: 1, ac: 1, hp: 300, alliance: "opposition" });
            const { token: secondToken } = await h.creature(scene, "Jaws Second", { x: 15, y: 2, ac: otherAC, hp: 300, alliance: "opposition" });
            const { token: thirdToken } = await h.creature(scene, "Jaws Third", { x: 14, y: 2, ac: 1, hp: 300, alliance: "opposition" });
            await h.until(() => userToken.object && firstToken.object && secondToken.object && thirdToken.object, "the tokens drawn", { timeout: 5000 });
            await userToken.object?.control?.();
            const readied = readiedOf(user);
            let since = Date.now();
            await api().activate(klar.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the jaws' Strike card" });
            const refusal = async (targets) => {
                try {
                    await api().apply(card.id, { targets });
                } catch (error) {
                    return error.message;
                }
                return null;
            };
            const one = await refusal([firstToken.uuid]);
            h.assert(/Target the 2 creatures/.test(one ?? ""), `refused with one target (${one})`);
            const three = await refusal([firstToken.uuid, secondToken.uuid, thirdToken.uuid]);
            h.assert(/Target the 2 creatures/.test(three ?? ""), `refused with three targets (${three})`);
            h.assert(!readied(), "nothing readied by a refused Apply");
            await api().apply(card.id, { targets: [firstToken.uuid, secondToken.uuid] });
            await h.until(() => readied()?.flags[h.NS].strikeRider.uses === 1 && (readied().flags[h.NS].strikeRider.targets ?? []).length === 2, "one Strike readied at the two", { timeout: 8000 });
            await h.target(firstToken);
            since = Date.now();
            const { attack } = await h.withDie(20, () => h.strike(user, sword));
            const { total, natural } = rollOf(attack);
            h.assert(natural === 20, `a natural 20 (${natural})`);
            const said = await h.messageAfter(since, (message) => /the same attack roll/.test(message.content ?? "") && message.speaker?.actor === user.id, { what: "the line for the other creature", timeout: 10000 });
            const ac = secondToken.actor.attributes.ac.value;
            const raw = degreeOf(total, natural, ac, { shift: false });
            const expected = degreeOf(total, natural, ac);
            const line = text(said);
            h.assert(raw === "failure" && expected === "success", `the second's AC set so the natural 20 makes a miss a hit (roll ${total}, AC ${ac}: ${raw} → ${expected})`);
            h.assert(new RegExp(`${escapeRegex(secondToken.name)}: ${WORDS[expected]}[;.]`).test(line), `${secondToken.name}: ${WORDS[expected]} (roll ${total}, natural ${natural}, AC ${ac}; without the natural 20 ${WORDS[raw]}): ${line}`);
            h.assert(!line.includes(`${firstToken.name}:`), `the creature struck isn't listed again (${line})`);
            await h.until(() => !readied(), "the readied Strike spent", { timeout: 8000 });
            return { line, total, natural, ac, degree: expected, withoutNatural: raw, refused: [one, three] };
        },

        // Splithead Bow's Five-Headed Arrow (strike.thenStrike, volley.oneRoll { count 4, upTo, within 30 }, toggleOff.untilRest): "If your Strike is
        // successful … splitting into four pieces. Choose four other targets within 30 feet of the original target and make a single ranged Strike
        // with your multiple attack penalty, comparing the result to each secondary target's AC. After using this ability, you do not regain Hit
        // Points from wielding the bow until after your next daily preparations." Its use turns the bow's healing toggle off (an unlimited
        // 'toggled off' Effect, untilRest); the bow's Strike hits the first creature (AC 1) and the pieces' Strike card follows; Apply refuses five
        // targets and readies three; the bow's second (multiple attack penalty) Strike at one of them gives a chat line with the same roll against
        // the other two's ACs (one AC 1, one AC 60). PF2e's Rest for the Night (its hook, called here) deletes the Effect and the toggle is back on.
        async strikeSplitheadPieces(scene) {
            await h.clearSquares(scene, [[1, 10], [4, 10], [5, 10], [5, 11], [4, 11], [6, 10]]);
            const { actor: archer, token: archerToken } = await h.creature(scene, "Splithead Hunter", { type: "character", x: 1, y: 10, level: 8 });
            const { token: firstToken } = await h.creature(scene, "Hydra First", { x: 4, y: 10, ac: 1, hp: 300, alliance: "opposition" });
            const { token: pieceOne } = await h.creature(scene, "Hydra Piece One", { x: 5, y: 10, ac: 1, hp: 300, alliance: "opposition" });
            const { token: pieceTwo } = await h.creature(scene, "Hydra Piece Two", { x: 5, y: 11, ac: 1, hp: 300, alliance: "opposition" });
            const { token: pieceThree } = await h.creature(scene, "Hydra Piece Three", { x: 4, y: 11, ac: 60, hp: 300, alliance: "opposition" });
            const { token: extraToken } = await h.creature(scene, "Hydra Piece Extra", { x: 6, y: 10, ac: 1, hp: 300, alliance: "opposition" });
            const bow = await h.give(archer, "Splithead Bow");
            const arrows = await h.give(archer, "Arrows");
            await arrows.update({ "system.quantity": 10 });
            await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
            const on = () => Boolean(archer.rollOptions?.all?.["splithead-bow-healing"]);
            const toggled = () => archer.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "toggleOff"));
            await h.until(on, "the bow's healing on at first", { timeout: 4000 });
            await h.until(() => archerToken.object && firstToken.object && pieceOne.object && pieceTwo.object && pieceThree.object && extraToken.object, "the tokens drawn", { timeout: 5000 });
            await archerToken.object?.control?.();
            const readied = readiedOf(archer);
            let since = Date.now();
            await api().activate(bow.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the arrow's Strike card" });
            await h.until(() => !on() && toggled(), "its healing off, the 'toggled off' Effect on the archer", { timeout: 8000 });
            const flag = toggled().getFlag(h.NS, "toggleOff");
            h.assert(flag.untilRest === true && flag.itemId === bow.id && toggled().system.duration.unit === "unlimited", `off until the next daily preparations (${JSON.stringify(flag)}, ${JSON.stringify(toggled().system.duration)})`);
            await api().apply(card.id);
            await h.until(() => readied()?.flags[h.NS].strikeRider.weaponId === bow.id, "the bow's readied Strike", { timeout: 8000 });
            await h.target(firstToken);
            since = Date.now();
            const { attack } = await h.withDie(15, () => h.strike(archer, bow));
            h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit at the first (AC 1): ${attack.flags.pf2e.context.outcome}`);
            const pieces = await h.messageAfter(since, (message) => h.itemCard("strike")(message) && message.getFlag(h.NS, "card")?.plan?.strike?.volley?.oneRoll?.count === 4, { what: "the pieces' Strike card", timeout: 10000 });
            h.assert(/\(the pieces\)/.test(pieces.getFlag(h.NS, "card").item.name), `the pieces' card (${pieces.getFlag(h.NS, "card").item.name})`);
            let refused = null;
            try {
                await api().apply(pieces.id, { targets: [pieceOne.uuid, pieceTwo.uuid, pieceThree.uuid, extraToken.uuid, firstToken.uuid] });
            } catch (error) {
                refused = error.message;
            }
            h.assert(/Target up to 4 creatures/.test(refused ?? ""), `refused with five targets (${refused})`);
            await api().apply(pieces.id, { targets: [pieceOne.uuid, pieceTwo.uuid, pieceThree.uuid] });
            await h.until(() => readied()?.flags[h.NS].strikeRider.plan?.strike?.volley?.oneRoll && (readied().flags[h.NS].strikeRider.targets ?? []).length === 3 && readied().flags[h.NS].strikeRider.uses === 1, "one Strike readied at the three pieces' targets", { timeout: 8000 });
            await h.target(pieceOne);
            since = Date.now();
            // (The bow's Strike with the multiple attack penalty: PF2e's second button, as the card's line says — its Strike as PF2e has it now.)
            const bowStrike = (archer.system.actions ?? []).find((entry) => entry.item?.id === bow.id);
            h.assert(bowStrike?.variants?.[1], "the bow's Strike with its multiple attack penalty");
            await bowStrike.variants[1].roll({ event: h.shift() });
            const second = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "attack-roll", { what: "the pieces' attack roll" });
            const { total, natural } = rollOf(second);
            const said = await h.messageAfter(since, (message) => /the same attack roll/.test(message.content ?? "") && message.speaker?.actor === archer.id, { what: "the line for the other pieces' targets", timeout: 10000 });
            const line = text(said);
            const degrees = {};
            for (const token of [pieceTwo, pieceThree]) {
                const ac = token.actor.attributes.ac.value;
                const expected = degreeOf(total, natural, ac);
                degrees[token.name] = expected;
                h.assert(new RegExp(`${escapeRegex(token.name)}: ${WORDS[expected]}[;.]`).test(line), `${token.name}: ${WORDS[expected]} (roll ${total}, natural ${natural}, AC ${ac}): ${line}`);
            }
            h.assert(!line.includes(`${pieceOne.name}:`), `the creature struck isn't listed again (${line})`);
            await h.until(() => !readied(), "the pieces' Strike spent", { timeout: 8000 });
            h.assert(!on() && toggled(), "the healing still off before the rest");
            Hooks.callAll("pf2e.restForTheNight", archer);
            await h.until(() => !toggled() && on(), "the 'toggled off' Effect gone at the rest, the healing toggle back on", { timeout: 8000 });
            return { line, total, natural, degrees, refused, map: (second.flags.pf2e.modifiers ?? []).filter((modifier) => /multiple-attack/.test(modifier.slug ?? "")).map((modifier) => modifier.modifier) };
        },

        // Morphing Weapon's Reshape, Weigh (strike.flat { perDie, status }, the same new strikeRules path as Minotaur Chair's): "Gain a status bonus
        // to the damage roll equal to the weapon's number of damage dice." The ways card's Weigh, its Strike card applied, a +1 striking
        // shortsword's critical hit (d20 15 at AC 1): the readied Strike is kept for the damage roll, and PF2e's damage roll has the +2 status
        // bonus. (Written beside the asked-for checks: scripts/strikes.js addsToDamage doesn't count strike.flat, so the hit spends the Effect before
        // the damage roll — see the result's bugs.)
        async strikeMorphingWeigh(scene) {
            await h.clearSquares(scene, [[10, 5], [11, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Morphing Wielder", { type: "character", x: 10, y: 5, level: 6 });
            const { token: foeToken } = await h.creature(scene, "Morphing Target", { x: 11, y: 5, ac: 1, hp: 300, alliance: "opposition" });
            const morphing = await h.give(user, "Morphing Weapon");
            const sword = await h.give(user, "Shortsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.runes.potency": 1, "system.runes.striking": 1 });
            const weaponDice = Number(user.items.get(sword.id).system.damage.dice);
            await userToken.object?.control?.();
            const readied = readiedOf(user);
            let since = Date.now();
            await api().activate(morphing.uuid, 0);
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the Reshape ways card" });
            const weigh = ways.getFlag(h.NS, "card").ways.indexOf("Weigh");
            h.assert(weigh >= 0, `Weigh among the ways (${ways.getFlag(h.NS, "card").ways.join(", ")})`);
            since = Date.now();
            await api().apply(ways.id, { choice: weigh });
            const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the Weigh Strike card" });
            await api().apply(card.id);
            await h.until(() => (readied()?.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && rule.type === "status"), "the readied Strike's status bonus rule", { timeout: 8000 });
            await h.target(foeToken);
            const { action, attack } = await h.withDie(15, () => h.strike(user, sword));
            h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
            await h.until(() => readied()?.flags[h.NS].strikeRider.awaiting === true, "the readied Strike kept for its damage roll, not spent by the hit", { timeout: 6000 });
            const rolled = await damageRoll(action, true);
            const bonus = modifierOf(rolled, "morphing-weapon");
            h.assert(bonus?.type === "status" && bonus.modifier === weaponDice, `+${weaponDice} status to the damage roll (${modifiersSaid(rolled)})`);
            await h.until(() => !readied(), "spent by the damage roll", { timeout: 8000 });
            return { bonus: bonus.modifier, dice: weaponDice };
        }
    };
};
