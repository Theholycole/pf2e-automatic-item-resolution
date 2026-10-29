// The fifth batch's moving group (third-party modules) live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code (the b5/moving merge 9b1741c):
// - Instinct Crown (Breach)'s second activation: its user's Effect flagged trail and untilRage (src/live/card.js ruleEffectSource), the trail
//   its walked moves leave (scripts/trails.js on Foundry's moveToken; src/live/trails.js walkedLegs, trailCells, trailZone; the ability module's
//   zone over area "squares", its inside rule for its maker), and the Effect gone with the Rage (scripts/live.js) — b5MovingBreachTrail; and
//   b5MovingBreachTrailTravel, a probe of a move out of an encounter, which PF2e 8.6.1 makes a "travel" (see the result's bugs).
// - Agglomerative Cannonball (Greater): strike.traits, PF2e's AdjustStrike of weapon traits on the readied Strike's Effect by the round's id
//   (src/live/strike-card.js strikeRules and strikeLines) — b5MovingCannonballRazingPush (the hit rows' push, older code, checked with it).
// - Impact Jelly: a zone's fall { shorter, nonlethal, landCheck } passed on by scripts/falls.js netsUnder through api.fallEases —
//   b5MovingImpactJellyFall.
// The group's other asked-for checks feed mechanisms already checked live: Cauthooj Egg (the ability module's check card at a set modifier —
// twineChoice, tpGogiteth — and the drop card after it, dropHeld one and attended, a success dropping the item ticked — b4G1CrowsTakeOrDrop)
// and Surfing Grass (Prone removed on its item card — tpSurfingGrass —, the move card beside the item card — phaseSpikeStride; its only new
// live code is the word "Crawls" in scripts/teleport.js).
// The modules must be active in pftest: PF2e Team+ Barbarians and Alchemists, and PF2e Automatic Environment Resolution for the jelly.

const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";
const ENV = "pf2e-automatic-environment-resolution";
const BARBARIANS = "pf2e-team-plus-barbarians.items";
const ALCHEMISTS = "pf2e-team-plus-alchemists.pf2e-items";
const BREACH = "Instinct Crown (Breach)";
const BALL = "Agglomerative Cannonball (Greater)";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card") ?? null;
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const worn = { "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true };
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const squareOf = (token) => `${Math.round(token.x / canvas.grid.size)},${Math.round(token.y / canvas.grid.size)}`;
    const moduleOn = (id, name) => h.assert(game.modules.get(id.split(".")[0])?.active, `${name} (${id.split(".")[0]}) active in pftest`);

    // PF2e's own Effect: Rage on the creature (as rageCrown gives it) → the Effect, to delete when its rage ends.
    async function rage(actor) {
        const pack = game.packs.get("pf2e.feat-effects");
        const entry = (await pack.getIndex()).find((row) => row.name === "Effect: Rage");
        h.assert(entry, "PF2e's Effect: Rage");
        const source = (await pack.getDocument(entry._id)).toObject();
        delete source._id;
        const [raging] = await actor.createEmbeddedDocuments("Item", [source]);
        await h.until(() => actor.itemTypes.effect.some((effect) => effect.id === raging.id), "the Rage Effect", { timeout: 5000 });
        return raging;
    }

    // --- Instinct Crown (Breach) ---------------------------------------------------------------------------------------------------------

    // (Its user's Effect from the second activation: flagged trail — scripts/trails.js looks for it on each move.)
    const trailEffect = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.trail);
    // (The trails on the scene: the ability module's zones over grid squares, named for the crown.)
    const trailsOn = (scene) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.zone?.area?.type === "squares" && region.flags[ABILITY].zone.itemName === BREACH);
    // (Its maker's Effect inside a trail: the ability module's zone member Effect, its rules the trail's.)
    const insideEffect = (actor) => actor.itemTypes.effect.find((effect) => effect.flags?.[ABILITY]?.zone && (effect.system?.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector ?? []).includes("melee-strike-damage")));
    // (Its melee Strike's damage at its most — every die at its top face —, rolled with no message: the trail's +2 shows on it.)
    const topDamage = async (actor, weapon) => {
        const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
        h.assert(action?.damage, `${actor.name}'s Strike with ${weapon.name}`);
        const roll = await h.withDie(20, () => action.damage({ event: h.shift(), createMessage: false }));
        const total = Number(roll?.total);
        h.assert(Number.isFinite(total), `its damage rolled (${JSON.stringify(roll?.formula ?? roll ?? null)})`);
        return total;
    };
    // (Foundry's moveToken for that token: each move's passed waypoints' actions, as the trail reads them.)
    const watchMoves = (token) => {
        const seen = [];
        const id = Hooks.on("moveToken", (document, movement) => {
            if (document?.id === token.id) seen.push((movement?.passed?.waypoints ?? []).map((point) => point?.action ?? null));
        });
        return { seen, stop: () => Hooks.off("moveToken", id) };
    };
    // A raging barbarian wearing the crown, holding a longsword, its second activation used: → { barbarian, token, crown, sword, raging, effect }.
    async function breachUser(scene, name, x, y) {
        const { actor: barbarian, token } = await h.creature(scene, name, { type: "character", x, y });
        const crown = await h.give(barbarian, BREACH, BARBARIANS);
        await crown.update(worn);
        const sword = await h.give(barbarian, "Longsword");
        await sword.update(held(1));
        const raging = await rage(barbarian);
        const since = Date.now();
        await api().activate(crown.uuid, 1);
        await h.messageAfter(since, h.itemCard("item"), { what: "the crown's card for its second activation" });
        await h.until(() => trailEffect(barbarian), `its trail Effect (${effectNames(barbarian)})`, { timeout: 8000 });
        return { barbarian, token, crown, sword, raging, effect: trailEffect(barbarian) };
    }

    // --- Agglomerative Cannonball ----------------------------------------------------------------------------------------------------------

    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    const damageRoll = async (action, outcome) => {
        const since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
    };
    const instancesOf = (message) => (game.messages.get(message.id)?.rolls ?? message.rolls ?? []).flatMap((roll) => (roll?.instances ?? []).map((instance) => ({ formula: instance.formula, type: instance.type, total: instance.total })));

    return {
        // Instinct Crown (Breach) (2026-10-28, stride-trails.js; scripts/trails.js, src/live/trails.js, src/live/card.js ruleEffectSource's trail and
        // untilRage): its second activation gives its raging user, for a minute at most, a trail — each walked move leaves difficult terrain on the
        // squares it crossed, for a minute, and its maker deals 2 more damage with melee Strikes while it stands in one. A raging barbarian
        // (PF2e's Effect: Rage) wears the crown and uses that activation: its Effect, flagged trail { lasts a minute, inside for its maker: +2 on
        // melee-strike-damage } and untilRage, a minute long. A teleport (2,8) → (2,11) and a flight (movementAction "fly") (2,11) → (5,11) leave
        // no trail; a walk (movementAction "walk") (5,11) → (8,11) leaves the ability module's zone over the three squares crossed, (6..8,11):
        // PF2e's difficult terrain (a modifyMovementCost behaviour, walk 2), for a minute. The barbarian, standing on (8,11) as it's made, gets the
        // zone's inside Effect — its longsword's damage at its most 2 higher than before the walk. Its Rage Effect deleted: the trail Effect gone.
        // (The moves are token updates with animate false, so a hidden pane still lands them; each move's waypoint actions, as Foundry 14's
        // moveToken passes them, are in the result.)
        async b5MovingBreachTrail(scene) {
            moduleOn(BARBARIANS, "PF2e Team+ Barbarians");
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[2, 8], [2, 11], [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11]]);
                const size = canvas.grid.size;
                const { barbarian, token, sword, raging, effect } = await breachUser(scene, "Breach Barbarian", 2, 8);
                const watch = watchMoves(token);
                try {
                    const trail = effect.flags[h.NS].trail;
                    const own = (trail.inside ?? []).find((entry) => entry.who === "own");
                    const bonus = (own?.rules ?? []).find((rule) => rule.key === "FlatModifier");
                    h.assert(trail.label === BREACH && Number(trail.lasts?.value) === 1 && trail.lasts?.unit === "minutes", `the trail flag: the crown's, a minute (${JSON.stringify({ label: trail.label, lasts: trail.lasts })})`);
                    h.assert(bonus && [].concat(bonus.selector ?? []).includes("melee-strike-damage") && Number(bonus.value) === 2, `+2 on its maker's melee Strike damage inside (${JSON.stringify(trail.inside ?? null)})`);
                    h.assert(effect.flags[h.NS].untilRage === true, `flagged to end with the Rage (${JSON.stringify(effect.flags[h.NS])})`);
                    h.assert(Number(effect.system.duration.value) === 1 && effect.system.duration.unit === "minutes", `a minute at most (${JSON.stringify(effect.system.duration)})`);
                    const before = await topDamage(barbarian, sword);
                    // (A teleport: Foundry's displace — no trail.)
                    await token.update({ x: 2 * size, y: 11 * size }, { teleport: true, animate: false });
                    await h.until(() => squareOf(token) === "2,11", `teleported to (2,11) (at ${squareOf(token)})`, { timeout: 5000 });
                    await h.wait(1500);
                    h.assert(!trailsOn(scene).length, `no trail from a teleport (${trailsOn(scene).length}; moves ${JSON.stringify(watch.seen)})`);
                    // (A flight: the token's movement action "fly" — no trail.)
                    await token.update({ movementAction: "fly" });
                    await token.update({ x: 5 * size }, { animate: false });
                    await h.until(() => squareOf(token) === "5,11", `flown to (5,11) (at ${squareOf(token)})`, { timeout: 5000 });
                    await h.wait(1500);
                    h.assert(!trailsOn(scene).length, `no trail from a flight (${trailsOn(scene).length}; moves ${JSON.stringify(watch.seen)})`);
                    // (A walk on the ground, 15 feet: the trail over the three squares crossed.)
                    await token.update({ movementAction: "walk" });
                    await token.update({ x: 8 * size }, { animate: false });
                    await h.until(() => squareOf(token) === "8,11", `walked to (8,11) (at ${squareOf(token)})`, { timeout: 5000 });
                    await h.until(() => trailsOn(scene).length === 1, `one trail from the walk (${trailsOn(scene).length}; moves ${JSON.stringify(watch.seen)})`, { timeout: 8000 });
                    const [zone] = trailsOn(scene);
                    const flags = zone.flags[ABILITY].zone;
                    const cells = (flags.zone.area.cells ?? []).map((cell) => `${Math.round(cell.x / size)},${Math.round(cell.y / size)}`).sort();
                    h.assert(JSON.stringify(cells) === JSON.stringify(["6,11", "7,11", "8,11"]), `over the squares crossed, not the one left (${JSON.stringify(cells)})`);
                    const terrain = zone.behaviors.find((behavior) => behavior.type === "modifyMovementCost");
                    h.assert(terrain && Number(terrain.system?.difficulties?.walk) === 2, `PF2e's difficult terrain on it (${JSON.stringify(zone.behaviors.map((behavior) => [behavior.type, behavior.system?.difficulties ?? null]))})`);
                    h.assert(Number(flags.zone.lasts?.value) === 1 && flags.zone.lasts?.unit === "minutes", `for a minute (${JSON.stringify(flags.zone.lasts)})`);
                    h.assert(flags.sourceTokenUuid === token.uuid, `its maker the barbarian (${flags.sourceTokenUuid})`);
                    // (Standing in it as it's made: its inside rule given then — the ability module's tokenEnter as the Region is made.)
                    await h.until(() => insideEffect(barbarian), `the barbarian, on (8,11) as it's made, gets its inside Effect (${effectNames(barbarian)})`, { timeout: 8000 });
                    const after = await topDamage(barbarian, sword);
                    h.assert(after === before + 2, `its longsword's damage 2 higher inside (${before} before the walk, ${after} on the trail)`);
                    // (Its Rage over: the trail Effect gone with it.)
                    await raging.delete();
                    await h.until(() => !trailEffect(barbarian), `the trail Effect gone with the Rage (${effectNames(barbarian)})`, { timeout: 8000 });
                    return { cells, moves: watch.seen, damage: { before, after }, inside: insideEffect(barbarian)?.name ?? null, zoneKept: trailsOn(scene).length };
                } finally {
                    watch.stop();
                    for (const region of trailsOn(scene)) await region.delete().catch(() => null);
                }
            });
        },

        // Instinct Crown (Breach), a probe (2026-10-29): PF2e 8.6.1 gives a character's or NPC's token the movement action "travel" out of an
        // encounter (TokenDocumentPF2e._inferMovementAction: walk only in combat, crawl when Prone), and scripts/trails.js counts only "walk"
        // (src/live/trails.js WALKED) — so a raging barbarian dragged on the ground outside the combat tracker leaves no trail, though the ability
        // module's own difficult terrain treats travel as walking. The crown's trail Effect on a raging barbarian; its token moved (2,15) → (5,15)
        // with the movement action PF2e gives it (none set): the trail over (3..5,15). Fails until trails.js reads travel as a walk (see the bugs).
        async b5MovingBreachTrailTravel(scene) {
            moduleOn(BARBARIANS, "PF2e Team+ Barbarians");
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[2, 15], [3, 15], [4, 15], [5, 15]]);
                const size = canvas.grid.size;
                const { token } = await breachUser(scene, "Breach Traveller", 2, 15);
                const watch = watchMoves(token);
                try {
                    const inferred = token.movementAction;
                    await token.update({ x: 5 * size }, { animate: false });
                    await h.until(() => squareOf(token) === "5,15", `moved to (5,15) (at ${squareOf(token)})`, { timeout: 5000 });
                    await h.until(() => trailsOn(scene).length === 1, `a trail from a move with PF2e's own movement action out of an encounter ("${inferred}"; the move's waypoint actions ${JSON.stringify(watch.seen)})`, { timeout: 6000 });
                    const cells = (trailsOn(scene)[0].flags[ABILITY].zone.zone.area.cells ?? []).map((cell) => `${Math.round(cell.x / size)},${Math.round(cell.y / size)}`).sort();
                    h.assert(JSON.stringify(cells) === JSON.stringify(["3,15", "4,15", "5,15"]), `over the squares crossed (${JSON.stringify(cells)})`);
                    return { inferred, moves: watch.seen, cells };
                } finally {
                    watch.stop();
                    for (const region of trailsOn(scene)) await region.delete().catch(() => null);
                }
            });
        },

        // Agglomerative Cannonball (Greater) (2026-10-28, knockback-ammo.js; src/live/strike-card.js strikeRules' strike.traits, strikeLines): its
        // Strike gains the razing trait, and a hit knocks the target 5 feet away from the shooter, 10 on a critical hit (forced movement); its 6
        // more bludgeoning is the round's own PF2e rule. A gunner with a Flintlock Pistol: the round activated, its Strike card saying the trait
        // and applied — the readied Effect's PF2e AdjustStrike (weapon-traits, razing) defined by that round's id ("item:ammo:id:…" or
        // "ammo:id:…") —, the round loaded (PF2e's attach). A d20 of 10 at AC 10 + its modifier, a hit: the attack roll's options carry
        // "item:trait:razing", the creature east of it pushed 5 feet, (5,15) → (6,15) (the core's forced move, a teleport), and the damage roll
        // spends the Effect (its instances in the result: PF2e's +6 bludgeoning, the round's own rule). A second round at the creature north of it,
        // a 20 on the die: a critical hit, pushed 10 feet, (2,12) → (2,10).
        async b5MovingCannonballRazingPush(scene) {
            moduleOn(ALCHEMISTS, "PF2e Team+ Alchemists");
            await h.clearSquares(scene, [[2, 15], [5, 15], [6, 15], [7, 15], [2, 12], [2, 11], [2, 10], [2, 9]]);
            const size = canvas.grid.size;
            const { actor: gunner, token: gunnerToken } = await h.creature(scene, "Cannonball Gunner", { type: "character", x: 2, y: 15 });
            const pistol = await h.give(gunner, "Flintlock Pistol");
            await pistol.update(held(1));
            const pistolStrike = () => (gunner.system.actions ?? []).find((entry) => entry.item?.id === pistol.id);
            const modifier = Number(pistolStrike()?.totalModifier);
            h.assert(Number.isFinite(modifier), `the gunner's pistol Strike (${pistolStrike()?.totalModifier})`);
            const { token: eastToken } = await h.creature(scene, "Cannonball Mark East", { x: 5, y: 15, ac: 10 + modifier, hp: 300, alliance: "opposition" });
            const { token: northToken } = await h.creature(scene, "Cannonball Mark North", { x: 2, y: 12, ac: 10 + modifier, hp: 300, alliance: "opposition" });
            await gunnerToken.object?.control?.();
            const readied = readiedOf(gunner);
            const loaded = () => [...(gunner.items.get(pistol.id)?.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
            // One round: activated, its Strike card applied, loaded in the pistol → { ball, rule }.
            const readyRound = async () => {
                const ball = await h.give(gunner, BALL, ALCHEMISTS);
                // (A firearm's round, as b2MiscAdamantineShotFirearmProbe loads one: the pistol's own rounds.)
                await ball.update({ "system.baseItem": "rounds-flintlock-pistol" });
                const since = Date.now();
                await api().activate(ball.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the round's Strike card" });
                h.assert(/gains the razing trait/i.test(textOf(card)), `the card says the razing trait (${textOf(card).slice(0, 400)})`);
                await api().apply(card.id);
                await h.until(() => readied()?.flags[h.NS].strikeRider.ammoId === ball.id, `the readied Strike for that round (${effectNames(gunner)})`, { timeout: 8000 });
                const rule = (readied().system.rules ?? []).find((entry) => entry.key === "AdjustStrike" && entry.property === "weapon-traits" && entry.value === "razing");
                const definition = JSON.stringify(rule?.definition ?? null);
                h.assert(rule && rule.mode === "add" && definition.includes(`item:ammo:id:${ball.id}`) && definition.includes(`"ammo:id:${ball.id}"`), `PF2e's AdjustStrike adding razing, for that round's id (${JSON.stringify(readied().system.rules)})`);
                await pistol.attach(gunner.items.get(ball.id), { quantity: 1, stack: true });
                await h.until(() => loaded() === 1, `the round loaded in the pistol (${loaded()})`, { timeout: 5000 });
                return { ball, rule };
            };
            const shoot = async (token, face) => {
                await h.target(token);
                const { action, attack } = await h.withDie(face, () => h.strike(gunner, pistol));
                return { action, attack, outcome: attack.flags.pf2e.context.outcome, options: attack.flags.pf2e.context.options ?? [] };
            };
            // (A hit: pushed 5 feet.)
            const first = await readyRound();
            const traits = [...(pistolStrike()?.item?.system?.traits?.value ?? [])];
            const hit = await shoot(eastToken, 10);
            h.assert(hit.outcome === "success", `a hit, not a critical one (d20 10 at AC ${10 + modifier}): ${hit.outcome}`);
            h.assert(hit.options.includes("item:trait:razing"), `the Strike has the razing trait (its options' item traits: ${hit.options.filter((option) => option.startsWith("item:trait:")).join(", ")}; the Strike's traits ${JSON.stringify(traits)})`);
            await h.until(() => squareOf(eastToken) === "6,15", `pushed 5 feet away from the gunner, (5,15) → (6,15) (at ${squareOf(eastToken)})`, { timeout: 10000 });
            await h.until(() => readied()?.flags[h.NS].strikeRider.awaiting, "the readied Strike kept for the hit's damage roll", { timeout: 8000 });
            const rolled = await damageRoll(hit.action, hit.outcome);
            await h.until(() => !readied(), "the readied Strike spent by its damage roll", { timeout: 8000 });
            const instances = instancesOf(rolled);
            // (A critical hit: pushed 10 feet.)
            await readyRound();
            const critical = await shoot(northToken, 20);
            h.assert(critical.outcome === "criticalSuccess", `a critical hit (a 20 on the die): ${critical.outcome}`);
            h.assert(critical.options.includes("item:trait:razing"), "the second Strike has the razing trait too");
            await h.until(() => squareOf(northToken) === "2,10", `pushed 10 feet away from the gunner, (2,12) → (2,10) (at ${squareOf(northToken)})`, { timeout: 10000 });
            return { modifier, rule: first.rule.definition, traits, instances, sixBludgeoning: instances.some((instance) => instance.type === "bludgeoning" && /\b6\b/.test(String(instance.formula))) };
        },

        // Impact Jelly (2026-10-28, fall-zones.js; scripts/falls.js netsUnder's shorter, nonlethal and landCheck, read through api.fallEases): its
        // 10-foot square, a zone for a minute, makes a fall into it count 50 feet shorter (its nonlethal damage and its check to land standing are
        // passed on for the environment module, which doesn't play them yet). Poured, its square placed (the GM's click stood in for: its middle
        // at the corner of squares (11..12, 5..6), the four it covers): the ability module's zone flagged zone.fall { shorter 50, nonlethal,
        // landCheck Acrobatics or Athletics DC 10 + 1 per 10 feet }. A PC 60 feet up over it (its centre inside, tested at the zone's bottom):
        // api.fallEases names the jelly with { shorter: 50, nonlethal, landCheck }, and the fall the environment module rolls from its cards (the
        // core's easedFall over its fallEasesOf, as its applyRow does — no token drop rolls one by itself) is 10 feet: 5 damage, Prone, by Impact
        // Jelly. A PC elsewhere: the same fall is 60 feet, 30 damage. The jelly's zone gone: the first PC's fall is 30 damage again.
        async b5MovingImpactJellyFall(scene) {
            moduleOn(ALCHEMISTS, "PF2e Team+ Alchemists");
            h.assert(game.modules.get(ENV)?.active, "PF2e Automatic Environment Resolution active in pftest");
            await h.clearSquares(scene, [[10, 4], [11, 5], [12, 5], [11, 6], [12, 6], [16, 16]]);
            const { easedFall } = await import(`/modules/${CORE}/src/environment/disasters.js?v=${Date.now()}`);
            const { fallEasesOf } = await import(`/modules/${ENV}/scripts/foundry.js?v=${Date.now()}`);
            const size = canvas.grid.size;
            const { actor: user, token: userToken } = await h.creature(scene, "Jelly Pourer", { type: "character", x: 10, y: 4 });
            const { actor: faller, token: fallerToken } = await h.creature(scene, "Jelly Faller", { type: "character", x: 11, y: 5 });
            const { actor: misser } = await h.creature(scene, "Jelly Misser", { type: "character", x: 16, y: 16 });
            const jelly = await h.give(user, "Impact Jelly", ALCHEMISTS);
            await userToken.object?.control?.();
            const zone = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Impact Jelly/.test(region.name));
            const placing = canvas.regions.placeRegion;
            canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [{ ...data, shapes: (data.shapes ?? []).map((shape) => ({ ...shape, x: 12 * size, y: 6 * size })) }]))[0];
            try {
                await jelly.consume();
                await h.until(zone, `the jelly's zone (${scene.regions.map((region) => region.name).join(", ") || "no regions"})`, { timeout: 8000 });
                const flags = zone().flags[ABILITY].zone;
                const fall = flags.zone?.fall ?? {};
                h.assert(flags.zone.area?.type === "square" && Number(flags.zone.area.value) === 10, `a 10-foot square (${JSON.stringify(flags.zone.area)})`);
                h.assert(Number(fall.shorter) === 50 && fall.nonlethal === true && !fall.noDamage, `fall { shorter 50, nonlethal } (${JSON.stringify(fall)})`);
                const land = fall.landCheck ?? {};
                h.assert((land.statistics ?? []).includes("acrobatics") && (land.statistics ?? []).includes("athletics") && Number(land.dc) === 10 && Number(land.add) === 1 && Number(land.per) === 10, `its check to land standing (${JSON.stringify(land)})`);
                h.assert(Number(flags.zone.lasts?.value) === 1 && flags.zone.lasts?.unit === "minutes", `for a minute (${JSON.stringify(flags.zone.lasts)})`);
                const centre = { x: fallerToken.x + size / 2, y: fallerToken.y + size / 2 };
                h.assert(zone().testPoint({ ...centre, elevation: 0 }), `the faller's square in the jelly (${JSON.stringify(zone().shapes.map((shape) => shape.toObject?.() ?? shape))})`);
                await fallerToken.update({ elevation: 60 }, { teleport: true, animate: false });
                await h.until(() => Number(fallerToken.elevation) === 60, `the faller 60 feet up (${fallerToken.elevation})`, { timeout: 5000 });
                const eases = game.modules.get(h.NS).api.fallEases(faller);
                const eased = eases.find((entry) => entry.source === "Impact Jelly");
                h.assert(eased && Number(eased.shorter) === 50 && eased.nonlethal === true && !eased.noDamage && Number(eased.landCheck?.dc) === 10, `api.fallEases names the jelly with { shorter 50, nonlethal, landCheck } (${JSON.stringify(eases)})`);
                const onJelly = easedFall(60, fallEasesOf(faller));
                h.assert(onJelly.feet === 10 && onJelly.damage === 5 && onJelly.by === "Impact Jelly", `the 60-foot fall counts 10 feet, 5 damage, by Impact Jelly (${JSON.stringify(onJelly)})`);
                const missed = easedFall(60, fallEasesOf(misser));
                h.assert(missed.feet === 60 && missed.damage === 30, `a fall elsewhere: 60 feet, 30 damage (${JSON.stringify(missed)})`);
                // (The jelly's minute up — out of an encounter the ability module ends it from its card: its Region deleted, as End does.)
                await zone().delete();
                await h.until(() => !zone(), "the jelly's zone gone", { timeout: 5000 });
                const after = easedFall(60, fallEasesOf(faller));
                h.assert(after.damage === 30 && !game.modules.get(h.NS).api.fallEases(faller).some((entry) => entry.source === "Impact Jelly"), `with the jelly gone, the full fall (${JSON.stringify(after)})`);
                return { eased, onJelly, missed, after };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of scene.regions.filter((entry) => /Impact Jelly/.test(entry.name))) await region.delete().catch(() => null);
            }
        }
    };
};
