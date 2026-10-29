// The fifth batch's areas group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (the b5/areas merge da000a1):
// - Ice Zuggle Orb: strike.traits as { add, remove } and strike.splashRadius (src/live/strike-card.js strikeRules and degreeLine; scripts/strikes.js
//   addsToDamage; scripts/bombs.js and src/live/bomb-card.js splashRadiusOf) — b5AreasZuggleFireSpell, b5AreasZuggleSupercharged.
// - Sea Dragon Figurehead's Tempest Roar: the zone's centre "vehicle" (src/live/vehicle-aura.js, scripts/zones.js startItemZone's userId) —
//   b5AreasTempestRoarTargetedShip, b5AreasTempestRoarAboard.
// - Tears of Shizuru: a pulse of cards of its own at its user's foes and allies, counted turns (src/live/pulse.js pulseCards/pulseFits/ticks,
//   scripts/pulse.js) — b5AreasTearsOfShizuruPulse.
// - Hook Chain: plan.waysMax, the ways card kept open for its uses (src/live/ways-card.js waysLeft/waysSpent, scripts/ways.js) —
//   b5AreasHookChainUses.
// The modules must be active in pftest: Battlezoo Bestiary (battlezoo-bestiary-pf2e), PF2e Team+ Tian Xia and Inventors.

const ABILITY = "pf2e-automatic-ability-resolution";
// (tools/live-check.mjs's flag on its own fixtures: its cleanup removes only those — the vehicles, hazards and encounters made here carry it.)
const FIXTURE = "liveCheckFixture";
// (PF2e's Rowboat, a vehicle: its space and token size set here.)
const ROWBOAT = "Compendium.pf2e.vehicles.Actor.l0RfYgabnbNoHnkS";
const BATTLEZOO = "battlezoo-bestiary-pf2e.pf2e-battlezoo-equipment";
const TIAN_XIA = "pf2e-team-plus-tian-xia.player-options";
const INVENTORS = "pf2e-team-plus-inventors.inventors-equipment";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const contentOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "");
    const textOf = (message) => contentOf(message).replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    // (The ability module's cards: their state, their creatures.)
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card ?? null;
    const targetsOf = (message) => (abilityState(message)?.targets ?? []).map((target) => target.actorUuid);
    // (A token's square, and every square within so many of it: the lab's leftovers there cleared, so only this case's creatures are near.)
    const block = (x, y, reach) => {
        const squares = [];
        for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) if (x + dx >= 0 && x + dx < 20 && y + dy >= 0 && y + dy < 20) squares.push([x + dx, y + dy]);
        return squares;
    };
    // (The Strike's attack modifier, PF2e's strike action's total: for an AC that gives the wanted degree at a d20 of 10.)
    const strikeModifier = (actor, weapon) => {
        const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
        const value = Number(action?.totalModifier);
        h.assert(Number.isFinite(value), `${actor.name}'s Strike modifier with ${weapon.name} (${action?.totalModifier})`);
        return value;
    };
    // (PF2e's damage roll of that Strike, its normal or critical button.)
    const damageRoll = async (action, outcome) => {
        const since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
    };
    // (Every damage instance of a damage message's rolls, the splash-only ones too: its types.)
    const typesOf = (message) => (game.messages.get(message.id)?.rolls ?? message.rolls ?? []).flatMap((roll) => (roll?.instances ?? []).map((instance) => instance.type));
    const rulesSaid = (rules) => JSON.stringify(rules.map((rule) => [rule.key, rule.mode ?? null, rule.property ?? null, rule.value ?? rule.option ?? null, rule.selector ?? rule.selectors ?? rule.domain ?? null, rule.definition ?? null]));

    // A PF2e Rowboat as one of this check's fixtures ("PFTEST ITEM …", flagged, linked), its space long feet, its token width × height squares
    // (PF2e's link to its size off, so the token keeps them) at (x, y).
    async function vehicle(scene, name, { x, y, long, width, height }) {
        const found = await fromUuid(ROWBOAT).catch(() => null);
        h.assert(found, `${ROWBOAT} in PF2e's compendiums`);
        const source = found.toObject();
        delete source._id;
        source.name = `${h.PREFIX} ${name}`;
        source.folder = null;
        source.flags = foundry.utils.mergeObject(source.flags ?? {}, { [h.NS]: { [FIXTURE]: true } }, { inplace: false });
        source.system = foundry.utils.mergeObject(source.system ?? {}, { details: { space: { long } } }, { inplace: false });
        const tokenFlags = foundry.utils.mergeObject(source.prototypeToken?.flags ?? {}, { pf2e: { linkToActorSize: false } }, { inplace: false });
        source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name, actorLink: true, width, height, flags: tokenFlags };
        const actor = await Actor.create(source);
        const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), actorId: actor.id, actorLink: true, x: x * 100, y: y * 100, width, height, flags: tokenFlags }]);
        await h.wait(300);
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await h.wait(100);
        h.assert(actor.type === "vehicle" && Number(actor.system.details?.space?.long) === long, `a vehicle ${long} feet long (${actor.type}, ${JSON.stringify(actor.system.details?.space)})`);
        h.assert(Number(token.width) === width && Number(token.height) === height, `its token ${width} × ${height} squares (${token.width} × ${token.height})`);
        return { actor, token };
    }

    // An encounter of these tokens in this initiative order (the first one's turn now), flagged as a fixture.
    async function encounter(scene, tokens) {
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
        await combat.createEmbeddedDocuments("Combatant", tokens.map((token, index) => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, initiative: 40 - index * 10 })));
        await combat.startCombat();
        await h.wait(500);
        return combat;
    }

    // Ice Zuggle Orb thrown after a way of its ways card (its own activation): the way's Strike card readied, the target's AC the Strike's
    // modifier + over (a d20 of 10: over 5 a hit, over 15 a miss by 5), its creatures in a row — the thrower, the target, one 5 feet from the
    // target and one 10 feet from it —, the Strike at the target, PF2e's damage roll and the splash card. → what each case checks.
    async function zuggleThrow(scene, { name, y, way, over }) {
        await h.clearSquares(scene, [[1, y], [2, y], [3, y], [4, y]]);
        const { actor: user, token: userToken } = await h.creature(scene, `${name} Thrower`, { type: "character", x: 1, y, level: 3 });
        const { actor: foe, token: foeToken } = await h.creature(scene, `${name} Target`, { x: 2, y, hp: 300, alliance: "opposition" });
        const { actor: near } = await h.creature(scene, `${name} Five Feet Off`, { x: 3, y, hp: 300, alliance: "opposition" });
        const { actor: far } = await h.creature(scene, `${name} Ten Feet Off`, { x: 4, y, hp: 300, alliance: "opposition" });
        const orb = await h.give(user, "Ice Zuggle Orb", BATTLEZOO);
        // (More than one: PF2e's Strike with a consumable weapon may use one up, and the damage roll and the readied rules need the item there.)
        await orb.update({ "system.quantity": 3, ...held(1) });
        await userToken.object?.control?.();
        let since = Date.now();
        await api().activate(orb.uuid, 0);
        const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the orb's ways card" });
        const index = (stateOf(ways).ways ?? []).indexOf(way);
        h.assert(index >= 0, `its way "${way}" (${(stateOf(ways).ways ?? []).join(" / ")})`);
        since = Date.now();
        await api().apply(ways.id, { choice: index });
        const card = await h.messageAfter(since, h.itemCard("strike"), { what: `${way}'s Strike card` });
        h.assert(stateOf(ways).status === "applied", `the ways card closed after one way (${stateOf(ways).status})`);
        const words = textOf(card);
        await api().apply(card.id);
        const readied = readiedOf(user);
        await h.until(() => readied()?.flags[h.NS].strikeRider.weaponId === orb.id, `the readied Strike with the orb itself (${effectNames(user)})`, { timeout: 8000 });
        const rules = readied().system.rules ?? [];
        await h.wait(300);
        const modifier = strikeModifier(user, orb);
        const ac = modifier + over;
        await foe.update({ "system.attributes.ac.value": ac });
        await h.until(() => Number(foe.system.attributes.ac.value) === ac, `the target's AC ${ac} (${foe.system.attributes.ac.value})`, { timeout: 5000 });
        await h.target(foeToken);
        const { action, attack } = await h.withDie(10, () => h.strike(user, orb));
        const context = attack.flags.pf2e.context;
        since = Date.now();
        const rolled = await damageRoll(action, context.outcome);
        const splashCard = await h.messageAfter(since, h.itemCard("bomb"), { what: `the splash card (damage types ${JSON.stringify(typesOf(rolled))})`, timeout: 10000 });
        await h.until(() => !readied(), `the readied Strike spent by the damage roll (${effectNames(user)})`, { timeout: 8000 });
        const total = Number(attack.rolls?.[0]?.total);
        // (Whether PF2e treats the orb, with no range or group in its Battlezoo data, as a melee weapon: for the result.)
        const melee = (context.options ?? []).includes("item:melee");
        return { user, foe, near, far, orb, words, rules, modifier, ac, total, context, rolled, splash: stateOf(splashCard), splashText: textOf(splashCard), melee };
    }

    return {
        // Ice Zuggle Orb's "After a fire spell" (strike.traits { add: fire, remove: cold }, strike.alteration fire): a spell of a different elemental or
        // energy trait swaps the orb's traits for the spell's and turns its damage to that type. Its ways card's way readies the orb's own Strike:
        // the Strike card says the traits swap and the damage turned to fire; the readied Effect carries PF2e's AdjustStrike removing cold and adding
        // fire on the orb alone and its DamageAlteration to fire; the Strike's roll has the fire trait and not cold; PF2e's damage roll is all fire,
        // splash included; the splash card's splash is fire and lists the creature 5 feet from the target, not the one 10 feet from it (no wider
        // reach without the cold supercharge).
        async b5AreasZuggleFireSpell(scene) {
            const run = await zuggleThrow(scene, { name: "Zuggle Fire", y: 16, way: "After a fire spell", over: 5 });
            const { orb, words, rules, context, rolled, splash, near, far } = run;
            h.assert(/fire added/.test(words) && /cold gone/.test(words) && /All its damage is fire/.test(words), `the Strike card's lines: fire added, cold gone, all its damage fire (${words.slice(0, 400)})`);
            const adjust = (mode, trait) => rules.find((rule) => rule.key === "AdjustStrike" && rule.mode === mode && rule.property === "weapon-traits" && rule.value === trait && [].concat(rule.definition ?? []).includes(`item:id:${orb.id}`));
            h.assert(adjust("remove", "cold") && adjust("add", "fire"), `PF2e's AdjustStrike: cold removed, fire added, on the orb alone (${rulesSaid(rules)})`);
            const alteration = rules.find((rule) => rule.key === "DamageAlteration" && rule.property === "damage-type");
            h.assert(alteration?.value === "fire" && [].concat(alteration.selectors ?? alteration.selector ?? []).includes(`${orb.id}-damage`), `PF2e's DamageAlteration to fire on the orb's damage (${rulesSaid(rules)})`);
            h.assert(context.outcome === "success", `a hit (d20 10 at AC ${run.ac}, modifier ${run.modifier}): ${context.outcome}`);
            const options = context.options ?? [];
            h.assert(options.includes("item:trait:fire") && !options.includes("item:trait:cold"), `the orb's Strike has the fire trait and not cold (${options.filter((option) => option.startsWith("item:trait:")).join(", ")})`);
            const types = typesOf(rolled);
            h.assert(types.length && types.every((type) => type === "fire"), `PF2e's damage all fire, its splash too (${JSON.stringify(types)})`);
            h.assert(splash.splash.length && splash.splash.every((part) => part.type === "fire"), `the splash card's splash fire (${JSON.stringify(splash.splash)})`);
            const listed = (actor) => splash.splashed.some((entry) => entry.actorUuid === actor.uuid);
            h.assert(listed(near) && !listed(far), `the creature 5 feet from the target listed, the one 10 feet off not (${splash.splashed.map((entry) => entry.name).join(", ")})`);
            h.assert(!splash.radius, `the splash's reach 5 feet (${splash.radius})`);
            return { melee: run.melee, outcome: context.outcome, types, splash: splash.splash, listed: splash.splashed.map((entry) => entry.name) };
        },

        // Ice Zuggle Orb's "After a cold spell: supercharged" (strike.degree { failure, success one degree better }, strike.splashRadius 10): a spell of
        // its own cold trait supercharges it — a failure is a success and a success a critical success, and its splash reaches 5 feet farther. The
        // Strike card says both; the readied Effect carries PF2e's AdjustDegreeOfSuccess on the orb's attack and the splash-radius:10 roll option on
        // its damage, and no trait change. A miss by 5 (d20 10 at the modifier + 15) comes out a hit; the orb keeps its cold trait and its damage is
        // cold; PF2e's damage roll carries splash-radius:10, and the splash card reaches 10 feet: the creatures 5 and 10 feet from the target listed.
        async b5AreasZuggleSupercharged(scene) {
            const run = await zuggleThrow(scene, { name: "Zuggle Charged", y: 18, way: "After a cold spell: supercharged", over: 15 });
            const { orb, words, rules, context, rolled, splash, near, far, total, ac } = run;
            h.assert(/a failure is a success and a success is a critical success/.test(words), `the Strike card's degree line (${words.slice(0, 400)})`);
            h.assert(/within 10 feet of the target/.test(words), `the Strike card's splash line (${words.slice(0, 400)})`);
            const degree = rules.find((rule) => rule.key === "AdjustDegreeOfSuccess");
            h.assert(degree && [].concat(degree.selector ?? []).includes(`${orb.id}-attack`) && degree.adjustment?.failure === "one-degree-better" && degree.adjustment?.success === "one-degree-better", `PF2e's AdjustDegreeOfSuccess on the orb's attack (${rulesSaid(rules)})`);
            const wider = rules.find((rule) => rule.key === "RollOption" && rule.option === "splash-radius:10");
            h.assert(wider && [].concat(wider.domain ?? []).includes(`${orb.id}-damage`), `the splash-radius:10 roll option on the orb's damage (${rulesSaid(rules)})`);
            h.assert(!rules.some((rule) => rule.key === "AdjustStrike"), `no trait change (${rulesSaid(rules)})`);
            h.assert(Number.isFinite(total) && total < ac && total > ac - 10, `a miss by less than 10 as rolled (${total} at AC ${ac})`);
            h.assert(context.outcome === "success", `the miss made a hit (${total} at AC ${ac}): ${context.outcome}${context.unadjustedOutcome ? `, ${context.unadjustedOutcome} unadjusted` : ""}`);
            h.assert((context.options ?? []).includes("item:trait:cold"), `the orb keeps its cold trait (${(context.options ?? []).filter((option) => option.startsWith("item:trait:")).join(", ")})`);
            const damageOptions = rolled.flags?.pf2e?.context?.options ?? [];
            h.assert(damageOptions.includes("splash-radius:10"), `splash-radius:10 on PF2e's damage roll (${damageOptions.filter((option) => /splash/.test(option)).join(", ") || "none with splash"})`);
            const types = typesOf(rolled);
            h.assert(types.length && types.every((type) => type === "cold"), `its damage cold (${JSON.stringify(types)})`);
            const listed = (actor) => splash.splashed.some((entry) => entry.actorUuid === actor.uuid);
            h.assert(Number(splash.radius) === 10, `the splash card's reach 10 feet (${splash.radius})`);
            h.assert(listed(near) && listed(far), `the creatures 5 and 10 feet from the target listed (${splash.splashed.map((entry) => entry.name).join(", ")})`);
            return { melee: run.melee, total, ac, outcome: context.outcome, unadjusted: context.unadjustedOutcome ?? null, types, listed: splash.splashed.map((entry) => entry.name) };
        },

        // Sea Dragon Figurehead's Tempest Roar at a vehicle targeted (zone centre "vehicle", src/live/vehicle-aura.js vehicleFor/vehicleZone): a
        // tempest in an emanation as far out as the ship is long, its terrain difficult, for 10 minutes. A ship 30 feet long by PF2e's space on a
        // 2 × 1 token (so its token's longer side, 10 feet, isn't the reach), targeted by its user standing off it: the ability module's Region is an
        // emanation from the ship's token, 30 feet (600 pixels), attached to it, PF2e's difficult terrain (walk 2), its zone lasting 10 minutes,
        // and its zone card names that Region. The ship moved two squares (a teleport, not animated): the Region's emanation moves with it.
        async b5AreasTempestRoarTargetedShip(scene) {
            await h.clearSquares(scene, [[6, 2], [8, 2], [9, 2], [8, 4], [9, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Tempest Captain", { type: "character", x: 6, y: 2, level: 11 });
            const { token: shipToken } = await vehicle(scene, "Tempest Ship", { x: 8, y: 2, long: 30, width: 2, height: 1 });
            const figurehead = await h.give(user, "Sea Dragon Figurehead", TIAN_XIA);
            const ours = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && /Sea Dragon Figurehead/.test(region.name ?? ""));
            const before = new Set(ours().map((region) => region.id));
            await userToken.object?.control?.();
            await h.target(shipToken);
            const since = Date.now();
            await api().activate(figurehead.uuid, 0);
            await h.until(() => ours().some((region) => !before.has(region.id)), "the tempest's Region", { timeout: 10000 });
            const region = ours().find((region) => !before.has(region.id));
            try {
                const shapeOf = () => scene.regions.get(region.id)?._source?.shapes?.[0] ?? null;
                const shape = shapeOf();
                const perFoot = scene.grid.size / scene.grid.distance;
                h.assert(shape?.type === "emanation" && shape.base?.type === "token", `an emanation from a token (${JSON.stringify(shape)})`);
                h.assert(Number(shape.base.x) === Number(shipToken.x) && Number(shape.base.y) === Number(shipToken.y) && Number(shape.base.width) === 2 && Number(shape.base.height) === 1, `from the ship's token (${JSON.stringify(shape.base)}; the ship at ${shipToken.x},${shipToken.y})`);
                h.assert(Number(shape.radius) === 30 * perFoot, `as far out as the ship is long: 30 feet, ${30 * perFoot} pixels (${shape.radius})`);
                h.assert(region._source.attachment?.token === shipToken.id, `attached to the ship's token (${JSON.stringify(region._source.attachment)})`);
                const cost = region.behaviors.find((behavior) => behavior.type === "modifyMovementCost");
                h.assert(Number(cost?.system?.difficulties?.walk) === 2, `PF2e's difficult terrain (${JSON.stringify(cost?.system?.difficulties ?? null)})`);
                const lasts = region.flags[ABILITY].zone.zone?.lasts;
                h.assert(Number(lasts?.value) === 10 && lasts?.unit === "minutes", `for 10 minutes (${JSON.stringify(lasts)})`);
                const zoneCard = await h.messageAfter(since, (message) => (message.flags?.[ABILITY]?.zoneCard?.regionUuids ?? []).includes(region.uuid), { what: "the ability module's zone card for it" });
                // (The ship moved: its tempest with it.)
                const to = { x: Number(shipToken.x), y: Number(shipToken.y) + 200 };
                await shipToken.update(to, { teleport: true, animate: false });
                await h.until(() => Number(shapeOf()?.base?.x) === to.x && Number(shapeOf()?.base?.y) === to.y, `the Region moved with the ship (${JSON.stringify(shapeOf()?.base ?? null)}; the ship at ${shipToken.x},${shipToken.y})`, { timeout: 8000 });
                return { radius: shape.radius, attached: region._source.attachment?.token, moved: shapeOf().base, card: textOf(zoneCard).slice(0, 200) };
            } finally {
                await region.delete().catch(() => null);
            }
        },

        // Sea Dragon Figurehead's Tempest Roar with nothing targeted (src/live/vehicle-aura.js vehicleFor's vehicle under its user): its user standing
        // on a boat 20 feet long by PF2e's space (a 2 × 1 token) — the Region attached to the boat, 20 feet out (400 pixels). Another user standing on
        // no vehicle, nothing targeted: the GM's whisper that the area isn't placed, and no Region.
        async b5AreasTempestRoarAboard(scene) {
            await h.clearSquares(scene, [[13, 2], [14, 2], [17, 6]]);
            const { token: boatToken } = await vehicle(scene, "Tempest Boat", { x: 13, y: 2, long: 20, width: 2, height: 1 });
            const { actor: sailor, token: sailorToken } = await h.creature(scene, "Tempest Sailor", { type: "character", x: 13, y: 2, level: 11 });
            const { actor: landlubber, token: landToken } = await h.creature(scene, "Tempest Landlubber", { type: "character", x: 17, y: 6, level: 11 });
            const aboard = await h.give(sailor, "Sea Dragon Figurehead", TIAN_XIA);
            const ashore = await h.give(landlubber, "Sea Dragon Figurehead", TIAN_XIA);
            const ours = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && /Sea Dragon Figurehead/.test(region.name ?? ""));
            const made = [];
            try {
                let before = new Set(ours().map((region) => region.id));
                await sailorToken.object?.control?.();
                await h.target();
                await api().activate(aboard.uuid, 0);
                await h.until(() => ours().some((region) => !before.has(region.id)), "the tempest's Region round the boat", { timeout: 10000 });
                const region = ours().find((region) => !before.has(region.id));
                made.push(region);
                const shape = region._source.shapes?.[0];
                const perFoot = scene.grid.size / scene.grid.distance;
                h.assert(region._source.attachment?.token === boatToken.id, `attached to the boat under its user (${JSON.stringify(region._source.attachment)}; the boat ${boatToken.id})`);
                h.assert(shape?.type === "emanation" && Number(shape.radius) === 20 * perFoot, `an emanation 20 feet out, ${20 * perFoot} pixels (${JSON.stringify(shape)})`);
                // (Off any vehicle, nothing targeted: the GM told, nothing placed.)
                before = new Set(ours().map((region) => region.id));
                await landToken.object?.control?.();
                await h.target();
                const since = Date.now();
                await api().activate(ashore.uuid, 0);
                const whisper = await h.messageAfter(since, (message) => /no vehicle targeted or under its user/.test(textOf(message)), { what: "the GM's whisper that its area isn't placed" });
                h.assert((whisper.whisper ?? []).some((id) => game.users.get(id)?.isGM), `whispered to the GM (${JSON.stringify(whisper.whisper)})`);
                await h.wait(1500);
                const stray = ours().filter((entry) => !before.has(entry.id));
                made.push(...stray);
                h.assert(!stray.length, `no Region without a vehicle (${stray.length})`);
                return { radius: shape.radius, whisper: textOf(whisper).slice(0, 200) };
            } finally {
                for (const region of made) await region.delete().catch(() => null);
            }
        },

        // Tears of Shizuru (plan.item.pulse with its own plans, who foes / also allies, ticks 2; src/live/pulse.js, scripts/pulse.js): jade tears in
        // 30 feet round its wearer, as it's used and at the start of its next 2 turns — a basic Fortitude save (DC 35, 3d8 force, holy) at its
        // enemies there and Quickened (its extra action limited to moving or healing) for its allies there. In an encounter, used on its wearer's turn (the
        // 0 Hit Points trigger is its words only, not checked): the ability module's save card at the foe 15 feet off alone (not the foe 40 feet
        // off, not the ally, not the wearer), and its Quickened card at the ally 10 feet off alone (not the ally 40 feet off, not the foe, not the
        // wearer). Applied: the ally Quickened with the extra action's note Effect, the foe's save (d20 10, a critical failure) taking force damage.
        // At the wearer's next two turn starts both cards come again (2, then 1 left, then 0); at the third, none, and the pulse is gone.
        async b5AreasTearsOfShizuruPulse(scene) {
            const at = { x: 13, y: 13 };
            await h.clearSquares(scene, [...block(at.x, at.y, 6), [5, 13], [5, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Tears Wearer", { type: "character", x: at.x, y: at.y, level: 16 });
            const { actor: ally } = await h.creature(scene, "Tears Ally", { x: 15, y: 13, hp: 300 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Tears Foe", { x: 16, y: 13, hp: 300, save: 5, alliance: "opposition" });
            const { actor: farFoe } = await h.creature(scene, "Tears Far Foe", { x: 5, y: 13, hp: 300, alliance: "opposition" });
            const { actor: farAlly } = await h.creature(scene, "Tears Far Ally", { x: 5, y: 14, hp: 300 });
            const tears = await h.give(user, "Tears of Shizuru", TIAN_XIA);
            const pulses = () => user.getFlag(h.NS, "pulses") ?? [];
            const ofTears = (message) => h.abilitySaveCard(message) && /Tears of Shizuru/.test(`${abilityState(message)?.plan?.source?.name ?? ""} ${abilityState(message)?.ability?.name ?? ""}`);
            const foesCard = (message) => ofTears(message) && abilityState(message)?.plan?.resolution?.kind === "save";
            const alliesCard = (message) => ofTears(message) && abilityState(message)?.plan?.resolution?.kind === "check";
            const tearsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && ofTears(message));
            // (Each step's two cards: the foe's alone in the save card, the ally's alone in the Quickened card.)
            const step = async (since, label) => {
                const save = await h.messageAfter(since, foesCard, { what: `${label}: the tears' save card`, timeout: 10000 });
                const quick = await h.messageAfter(since, alliesCard, { what: `${label}: the tears' Quickened card`, timeout: 10000 });
                const foes = targetsOf(save);
                const allies = targetsOf(quick);
                h.assert(foes.includes(foe.uuid) && !foes.includes(farFoe.uuid) && !foes.includes(ally.uuid) && !foes.includes(user.uuid), `${label}: the save at the foe within 30 feet alone (${(abilityState(save)?.targets ?? []).map((target) => target.name).join(", ")})`);
                h.assert(allies.includes(ally.uuid) && !allies.includes(farAlly.uuid) && !allies.includes(foe.uuid) && !allies.includes(user.uuid), `${label}: Quickened for the ally within 30 feet alone (${(abilityState(quick)?.targets ?? []).map((target) => target.name).join(", ")})`);
                return { save, quick };
            };
            const combat = await encounter(scene, [userToken, foeToken]);
            try {
                h.assert(combat.combatant?.actorId === user.id, `the wearer's turn first (${combat.combatant?.name})`);
                let since = Date.now();
                await tears.consume();
                const first = await step(since, "As it's used");
                const check = abilityState(first.save).plan.resolution.check;
                h.assert(check.statistic === "fortitude" && check.basic && Number(check.against?.value) === 35, `a basic Fortitude save, DC 35 (${JSON.stringify(check)})`);
                h.assert((abilityState(first.save).plan.traits ?? []).includes("holy"), `the holy trait (${JSON.stringify(abilityState(first.save).plan.traits)})`);
                await h.until(() => pulses().length === 1 && pulses()[0].ticksLeft === 2, `2 more turns kept on the wearer (${JSON.stringify(pulses())})`, { timeout: 5000 });
                // (The ally: Quickened, with its extra action's limit.)
                await h.applyAbilityCard(first.quick);
                const limit = () => ally.itemTypes.effect.find((effect) => /extra action/i.test(effect.name));
                await h.until(() => ally.hasCondition("quickened") && limit(), `the ally Quickened with its note Effect (${effectNames(ally)})`, { timeout: 10000 });
                // (The foe: its save, a critical failure at d20 10 + 5 against 35.)
                const hp = Number(foe.system.attributes.hp.value);
                await h.withDie(10, async () => {
                    await h.rollAndApply(first.save);
                    await h.until(() => (abilityState(first.save)?.targets ?? []).every((target) => target.degree), "the foe's save rolled", { timeout: 10000 });
                });
                await h.until(() => Number(foe.system.attributes.hp.value) < hp, `the force damage on the foe (${foe.system.attributes.hp.value} of ${hp})`, { timeout: 10000 });
                const degree = abilityState(first.save).targets.find((target) => target.actorUuid === foe.uuid)?.degree;
                // (Its next two turn starts: both cards again.)
                const turns = [];
                for (const [round, left] of [[2, 1], [3, 0]]) {
                    await combat.nextTurn();
                    since = Date.now();
                    await combat.nextTurn();
                    h.assert(combat.combatant?.actorId === user.id && combat.round === round, `the wearer's turn in round ${round} (${combat.combatant?.name}, round ${combat.round})`);
                    await step(since, `Round ${round}`);
                    await h.until(() => pulses().length === 1 && pulses()[0].ticksLeft === left, `round ${round}: ${left} turn${left === 1 ? "" : "s"} left (${JSON.stringify(pulses())})`, { timeout: 5000 });
                    turns.push(round);
                }
                // (The third: none, and gone.)
                await combat.nextTurn();
                since = Date.now();
                await combat.nextTurn();
                h.assert(combat.combatant?.actorId === user.id && combat.round === 4, `the wearer's turn in round 4 (${combat.combatant?.name}, round ${combat.round})`);
                await h.wait(2500);
                h.assert(!tearsSince(since).length, `no more cards (${tearsSince(since).length})`);
                await h.until(() => pulses().length === 0, `the pulse gone (${JSON.stringify(pulses())})`, { timeout: 5000 });
                return { degree, hpLost: hp - Number(foe.system.attributes.hp.value), limit: limit()?.name ?? null, turns };
            } finally {
                await combat.delete().catch(() => null);
            }
        },

        // Hook Chain (Lesser) (plan.waysMax 2; src/live/ways-card.js waysLeft/waysSpent, scripts/ways.js): latched on for a minute or until it's
        // activated its listed number of times, 2 for the lesser. Its ways card says "2 uses left" and is open. Hooking a creature 15 feet off: the
        // hook's attack card (its user's thrown attack, a d20 of 10 at AC 1 a hit) and the "Hooked" note Effect on it for the minute; the ways card
        // still open, "1 use left". Pulling its user to it: the teleport card, and the ways card closed, "0 uses left", no Use it button. A third
        // press posts nothing and changes nothing.
        async b5AreasHookChainUses(scene) {
            await h.clearSquares(scene, [[1, 4], [4, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Hook Chain Gadgeteer", { type: "character", x: 1, y: 4, level: 4 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Hook Chain Quarry", { x: 4, y: 4, ac: 1, hp: 300, alliance: "opposition" });
            const chain = await h.give(user, "Hook Chain (Lesser)", INVENTORS);
            await h.until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
            await userToken.object?.control?.();
            let since = Date.now();
            await chain.consume();
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the chain's ways card" });
            const index = (name) => {
                const found = (stateOf(ways).ways ?? []).indexOf(name);
                h.assert(found >= 0, `its way "${name}" (${(stateOf(ways).ways ?? []).join(" / ")})`);
                return found;
            };
            h.assert(Number(stateOf(ways).plan?.waysMax) === 2 && stateOf(ways).status === "open", `2 uses in all, open (${stateOf(ways).plan?.waysMax}, ${stateOf(ways).status})`);
            h.assert(/one of 3 ways, 2 uses left/.test(textOf(ways)), `its header: 2 uses left (${textOf(ways).slice(0, 200)})`);
            // (The first use: a creature hooked.)
            await h.target(foeToken);
            since = Date.now();
            await api().apply(ways.id, { choice: index("Hook a creature") });
            const hook = await h.messageAfter(since, h.itemCard("expose"), { what: "the hook's attack card" });
            await h.until(() => (stateOf(ways).results ?? []).length === 1 && /1 use left/.test(textOf(ways)), `the ways card at 1 use left (${textOf(ways).slice(0, 200)})`, { timeout: 5000 });
            h.assert(stateOf(ways).status === "open", `still open after the first (${stateOf(ways).status})`);
            const choices = stateOf(hook).attackChoices ?? [];
            const thrown = choices.find((choice) => choice.kind === "thrown") ?? choices[0];
            h.assert(thrown, `its user's thrown attack offered (${JSON.stringify(choices)})`);
            since = Date.now();
            await api().apply(hook.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(thrown) });
            const attack = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && targetsOf(message).includes(foe.uuid), { what: "the ability module's attack card at the quarry", timeout: 10000 });
            await h.withDie(10, async () => {
                await h.rollAndApply(attack);
                await h.until(() => (abilityState(attack)?.targets ?? []).every((target) => target.degree), "the hook's attack rolled", { timeout: 10000 });
            });
            const degree = abilityState(attack).targets.find((target) => target.actorUuid === foe.uuid)?.degree;
            h.assert(["success", "criticalSuccess"].includes(degree), `a hit (d20 10 at AC 1): ${degree}`);
            const hooked = () => foe.itemTypes.effect.find((effect) => /Hooked/.test(effect.name));
            await h.until(() => hooked(), `the Hooked note Effect on the quarry (${effectNames(foe)})`, { timeout: 10000 });
            const lasts = hooked().system.duration;
            h.assert(Number(lasts.value) === 1 && lasts.unit === "minutes", `for 1 minute (${JSON.stringify(lasts)})`);
            // (The second: its user pulled to it, and the card spent.)
            since = Date.now();
            await api().apply(ways.id, { choice: index("Pull yourself to it") });
            await h.messageAfter(since, h.itemCard("teleport"), { what: "the pull's teleport card" });
            await h.until(() => stateOf(ways).status === "applied", `the ways card closed after its second use (${stateOf(ways).status})`, { timeout: 5000 });
            h.assert(/0 uses left/.test(textOf(ways)) && !/data-air-action="apply"/.test(contentOf(ways)) && stateOf(ways).results.length === 2, `0 uses left, no Use it button (${textOf(ways).slice(0, 300)})`);
            // (A third press: nothing.)
            since = Date.now();
            await api().apply(ways.id, { choice: index("Hook an object or square") });
            await h.wait(1500);
            const more = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && message.getFlag(h.NS, "card") && message.id !== ways.id);
            h.assert(!more.length && stateOf(ways).results.length === 2, `no third use (${more.length} cards; ${JSON.stringify(stateOf(ways).results)})`);
            return { results: stateOf(ways).results, degree, hooked: hooked().name };
        }
    };
};
