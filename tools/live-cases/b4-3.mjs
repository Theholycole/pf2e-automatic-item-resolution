// The fourth batch's third group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the items whose live play is new code (the merge d34833c, docs/mechanics.md "Unique items and artifacts built whole"): the sphere card
// (scripts/sphere.js, revive.js's refusal), Cube of Nex's zones round its user, walls of force and inert card (scripts/zones.js aroundZone,
// scripts/cube.js), Dragon-Lotus Drum's marker beside its card (scripts/live.js alsoConjure), Limitless Power's selected spells (scripts/casts.js,
// src/live/contract-spells.js), Shadewither Key's double (scripts/decoy-double.js), Jahan Waystone's pair (scripts/paired-stone.js), The Eye of the
// Slumberer's selective terrain (scripts/zones.js exceptTerrain), Vambrace of Gorum's sword and guard (scripts/objects.js create's material, lasts and
// effect; scripts/adjacent-bonus.js), Mountebank's Passage's portals (scripts/portals.js), Belimarius's Invidious Halberd's Absorb Arcana
// (scripts/arcane-drain.js), Reaper's Grasp's souls (scripts/souls.js, ends-on-strike.js's slug), Crimson Fulcrum Lens's possession
// (scripts/lens-possession.js), Old Tillimaquin's luck kept for later (scripts/rerolls.js laterRefusal), Phoenix Necklace's ended Effects
// (scripts/activations.js endsPrevious), The Trader's swap (scripts/skill-swap.js), Soulheart (Pure)'s level limit and its own destruction
// (scripts/revive.js), Reaper's Lancet's reservoir (scripts/reservoir.js), The Hollow Star's common aberrations (scripts/creature-pick.js rarity)
// and Guiding Star Orb (Heroic)'s embedded places (scripts/embedded-places.js). And Scene Stealer's Tunic, no new code but a question live play
// alone answers: whether PF2e's origin-signature predicates resolve on the Effect the ability module gives. The Big Sky feeds a mechanism already
// checked live (a note Effect with PF2e's rules on it).
// (The sphere, inert, skill-swap, portal, souls and reservoir cards have buttons of their own, not the module's api.live.apply: their scripts'
// apply functions are called here as those buttons do, on this — the active GM's — client.)

const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";
const ENVIRONMENT = "pf2e-automatic-environment-resolution";
const SPELLS = "pf2e-automatic-resolution";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };
const SIZE = 100;

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const script = (name) => import(`/modules/${h.NS}/scripts/${name}`);
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const current = (message) => game.messages.get(message.id) ?? message;
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const aimsAt = (actor) => (message) => (abilityState(message)?.targets ?? []).some((target) => target.actorUuid === actor.uuid);
    const degreeOf = (message, actor) => (abilityState(message)?.targets ?? []).find((target) => target.actorUuid === actor.uuid)?.degree ?? null;
    const valueOf = (actor, slug) => Number(actor.getCondition?.(slug)?.value) || 0;
    const conditions = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${condition.value ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const hpOf = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    const text = (message) => String(current(message)?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const squareOf = (token) => `${Math.round(Number(token.x) / SIZE)},${Math.round(Number(token.y) / SIZE)}`;
    // (PF2e's distance between two one-square tokens: every other diagonal 10 feet.)
    const feetBetween = (a, b) => {
        const dx = Math.abs(Math.round((Number(a.x) - Number(b.x)) / SIZE));
        const dy = Math.abs(Math.round((Number(a.y) - Number(b.y)) / SIZE));
        const diagonal = Math.min(dx, dy);
        return 5 * (Math.max(dx, dy) - diagonal) + 5 * diagonal + 5 * Math.floor(diagonal / 2);
    };
    const teleport = (token, x, y) => token.update({ x: x * SIZE, y: y * SIZE }, { teleport: true, animate: false });
    // (A bare character has 0 maximum Hit Points and PF2e then takes no damage nor healing on it: an Effect gives it some, its Hit Points set.)
    const hitPoints = async (actor, max, value = max) => {
        await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: max }], duration: UNLIMITED } }]);
        await h.until(() => actor.system.attributes.hp.max >= max, `${max} maximum Hit Points on ${actor.name}`, { timeout: 5000 });
        await actor.update({ "system.attributes.hp.value": value });
        await h.until(() => hpOf(actor) === value, `${actor.name} at ${value} Hit Points`, { timeout: 5000 });
    };
    // (An activation's index by its name: src/compiler/permanent.js's own entries.)
    async function activationIndex(item, name) {
        const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
        const entries = compileActivations({ ...item.toObject(false), uuid: item.uuid });
        const index = entries.find((entry) => entry.activation?.name === name)?.index;
        h.assert(Number.isInteger(index), `${item.name}'s ${name} activation (${entries.map((entry) => entry.activation?.name).join(", ")})`);
        return index;
    }
    // (The dialogs and prompts opened since then — the spell module's, PF2e's — closed: one left open fails the next case.)
    const openApps = () => new Set([...foundry.applications.instances.values()].filter((app) => app.constructor.name === "DialogV2" || (Array.isArray(app.choices) && typeof app.resolveSelection === "function")));
    const closeNew = async (before) => {
        for (const app of openApps()) if (!before.has(app) && app.state !== app.constructor.RENDER_STATES?.CLOSED) await app.close().catch(() => null);
    };
    // (A permanent item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };

    return {
        // Sphere of Annihilation (src/live/sphere-card.js, scripts/sphere.js; scripts/revive.js's refusal): "If you fail, the sphere moves 10 feet
        // closer to you … If you succeed, you take control of the sphere … When you Sustain the Activation … If you succeed, you direct the sphere to
        // move up to 10 feet in a straight line." Its user (Arcana +15) 20 feet from the sphere's token (named Sphere of Annihilation, its contact
        // Region made as it's placed), a bystander between them. A failure (25 against DC 30) moves it 10 feet toward its user, onto the bystander:
        // 0 Hit Points, PF2e's dead status, flagged annihilated. A success (32) gives its user the control Effect; Sustain's success has it moved
        // where its user picks — 15 feet away refused, 10 feet straight down onto another creature, destroyed. A third creature that moves into it
        // is destroyed by its Region. Elixir of Rejuvenation's "on a dead creature" at the bystander is refused (only a deity brings it back).
        async b4G3SphereAnnihilation(scene) {
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[2, 10], [4, 10], [4, 11], [7, 12], [6, 10], [3, 11]]);
                const { actor: user, token: userToken } = await h.creature(scene, "Sphere Controller", { type: "character", x: 2, y: 10, level: 20 });
                const { actor: bystander, token: bystanderToken } = await h.creature(scene, "Sphere Bystander", { x: 4, y: 10, hp: 80 });
                const { actor: victim } = await h.creature(scene, "Sphere Victim", { x: 4, y: 11, hp: 80 });
                const { actor: walker, token: walkerToken } = await h.creature(scene, "Sphere Walker", { x: 7, y: 12, hp: 80 });
                const { token: sphereToken } = await h.creature(scene, "Sphere of Annihilation", { x: 6, y: 10 });
                const contact = () => scene.regions.find((region) => region.getFlag(h.NS, "sphere") === sphereToken.uuid);
                await h.until(contact, "the sphere's contact Region, made as its token is placed", { timeout: 8000 });
                const annihilated = (actor) => Boolean(actor.getFlag(h.NS, "annihilated"));
                const destroyed = (actor) => annihilated(actor) && hpOf(actor) === 0 && Boolean(actor.statuses?.has?.("dead"));
                await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Arcana`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "arcana", value: 15 }], duration: UNLIMITED } }]);
                await h.until(() => Number(user.skills.arcana.mod) >= 15, `Arcana +15 (${user.skills.arcana.mod})`, { timeout: 5000 });
                const arcana = Number(user.skills.arcana.mod);
                const [failFace, winFace] = [25 - arcana, 32 - arcana];
                h.assert(failFace >= 2 && winFace <= 19, `faces for 25 and 32 at Arcana ${arcana}`);
                const sphere = await h.give(user, "Sphere of Annihilation");
                await userToken.object?.control?.();
                const { applySphere } = await script("sphere.js");
                // (A failure: toward its user, onto the bystander.)
                let card = await activated(sphere, 0, "sphere", "the sphere card");
                h.assert(stateOf(card).sphere?.tokenUuid === sphereToken.uuid, `the sphere's token found (${JSON.stringify(stateOf(card).sphere)})`);
                await h.withDie(failFace, () => applySphere(current(card), { action: "roll", skill: 0 }));
                await h.until(() => squareOf(sphereToken) === "4,10", `the sphere 10 feet closer to its user (at ${squareOf(sphereToken)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                await h.until(() => destroyed(bystander), `the bystander destroyed (${hpOf(bystander)} HP, ${conditions(bystander)})`, { timeout: 8000 });
                h.assert(stateOf(card).status === "applied" && resultsOf(card).some((line) => /failure \(arcana, DC 30\)/.test(line)) && resultsOf(card).some((line) => /moves 10 feet toward/.test(line)), `the card's lines (${JSON.stringify(resultsOf(card))})`);
                h.assert(!annihilated(user) && !annihilated(victim), "its user and the creature off its path untouched");
                // (A success: control; Sustain, then its move.)
                card = await activated(sphere, 0, "sphere", "the sphere card again");
                await h.withDie(winFace, () => applySphere(current(card), { action: "roll", skill: 0 }));
                const control = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.sphereControl?.sphere === sphereToken.uuid);
                await h.until(control, `the control Effect (${effectNames(user)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                h.assert(control().system.duration.value === 1 && control().system.duration.unit === "rounds" && stateOf(card).phase === "sustain", `a round long, Sustain next (${JSON.stringify(control().system.duration)}, ${stateOf(card).phase})`);
                await h.withDie(winFace, () => applySphere(current(card), { action: "roll", skill: 0 }));
                await h.until(() => stateOf(card).phase === "move" && Number(stateOf(card).allowed) === 10, `up to 10 feet to direct (${stateOf(card).phase}, ${stateOf(card).allowed})`, { timeout: 8000 });
                const tooFar = await errorOf(applySphere(current(card), { action: "move", destination: { x: 4 * SIZE, y: 13 * SIZE } }));
                h.assert(/is 15 feet from the sphere/.test(tooFar ?? ""), `15 feet refused (${tooFar})`);
                await applySphere(current(card), { action: "move", destination: { x: 4 * SIZE, y: 12 * SIZE } });
                await h.until(() => squareOf(sphereToken) === "4,12", `the sphere where it was directed (at ${squareOf(sphereToken)})`, { timeout: 8000 });
                await h.until(() => destroyed(victim), `the creature on its line destroyed (${hpOf(victim)} HP, ${conditions(victim)})`, { timeout: 8000 });
                h.assert(stateOf(card).phase === "sustain" && stateOf(card).status === "open", `Sustain again next (${stateOf(card).phase})`);
                // (A creature moving into it: its Region. A move on the map, not a teleport — needs a visible pane.)
                let since = Date.now();
                await walkerToken.update({ x: 4 * SIZE, y: 12 * SIZE }, { animate: false });
                await h.until(() => destroyed(walker), `the creature that moved into the sphere destroyed by its Region (${hpOf(walker)} HP; walker at ${squareOf(walkerToken)})`, { timeout: 10000 });
                await h.messageAfter(since, (message) => /Sphere Walker touches the sphere and is destroyed utterly/.test(text(message)), { what: "the Region's line" });
                // (Brought back by an elixir: refused.)
                await teleport(bystanderToken, 3, 11);
                await h.until(() => squareOf(bystanderToken) === "3,11", "the bystander beside its user", { timeout: 5000 });
                const elixir = await h.give(user, "Elixir of Rejuvenation");
                since = Date.now();
                await elixir.consume();
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the elixir's ways card" });
                const deadWay = stateOf(ways).plan.ways.findIndex((way) => /dead/i.test(way.name));
                h.assert(deadWay >= 0, `its way for a dead creature (${stateOf(ways).plan.ways.map((way) => way.name)})`);
                since = Date.now();
                await live().apply(ways.id, { choice: deadWay });
                const given = await h.messageAfter(since, h.itemCard("item"), { what: "the elixir's card for the dead" });
                const at = stateOf(given).drinkers.findIndex((entry) => entry.actorUuid === bystander.uuid);
                h.assert(at >= 0, `the destroyed bystander offered (${JSON.stringify(stateOf(given).drinkers.map((entry) => entry.name))})`);
                await live().apply(given.id, { drinker: at });
                await h.until(() => resultsOf(given).some((line) => /destroyed by a sphere of annihilation: only a deity's direct intervention/.test(line)), `refused (${JSON.stringify(resultsOf(given))})`, { timeout: 8000 });
                h.assert(destroyed(bystander), `still destroyed (${hpOf(bystander)} HP, ${conditions(bystander)})`);
                return { arcana, results: resultsOf(card), elixir: resultsOf(given) };
            });
        },

        // Cube of Nex's faces (src/live/cube.js aroundZone, scripts/zones.js; the counteract card beside a zone): "The cube creates six walls
        // around you, creating a cube 10 feet on each side centered on you … 2 The walls block nonliving matter from crossing; a nonliving creature
        // must succeed at a DC 30 Will save to cross the threshold, wasting their move action on a failure." Face 2: the ability module's zone over
        // the 2×2 squares round its user. An undead moving in gets the DC 30 Will card; its critical failure pushes it back out with the "Kept out by
        // the cube" note Effect. A living creature moving in gets no card. Face 1: its counteract card (+20, rank 13) for the gas or wind crossing.
        // (The undead's move and its push are moves on the map: they need a visible pane.)
        async b4G3CubeFaceZones(scene) {
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[5, 5], [8, 5], [5, 8], [6, 5], [6, 6], [5, 6]]);
                const { actor: user, token: userToken } = await h.creature(scene, "Nex Bearer", { type: "character", x: 5, y: 5, level: 25 });
                const { actor: undead, token: undeadToken } = await h.creature(scene, "Nex Undead", { x: 8, y: 5, save: -30, hp: 100, alliance: "opposition" });
                const { actor: living, token: livingToken } = await h.creature(scene, "Nex Living", { x: 5, y: 8, save: -30, hp: 100, alliance: "opposition" });
                await undead.update({ "system.traits.value": ["undead", "zombie"] });
                await living.update({ "system.traits.value": ["human", "humanoid"] });
                const cube = await h.give(user, "Cube of Nex");
                await cube.update(held(1));
                await userToken.object?.control?.();
                const ways = await activated(cube, 0, "ways", "the cube's faces");
                const names = stateOf(ways).plan.ways.map((way) => way.name);
                const face = (n) => names.findIndex((name) => name.startsWith(`Face ${n}:`));
                h.assert(face(1) >= 0 && face(2) >= 0 && face(5) >= 0, `its faces (${names.join(" | ")})`);
                await live().apply(ways.id, { choice: face(2) });
                const zones = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.itemUuid === cube.uuid);
                await h.until(() => zones().length, "face 2's zone", { timeout: 8000 });
                const zone = zones()[0];
                const cells = zone.shapes.map((shape) => `${Math.round(shape.x / SIZE)},${Math.round(shape.y / SIZE)}`).sort();
                h.assert(JSON.stringify(cells) === JSON.stringify(["5,5", "5,6", "6,5", "6,6"]), `the 10-foot square round its user, its own square among them (${JSON.stringify(cells)})`);
                const inside = (token) => cells.includes(squareOf(token));
                // (The undead crossing: its Will save, a critical failure.)
                let since = Date.now();
                await undeadToken.update({ x: 6 * SIZE, y: 5 * SIZE }, { animate: false });
                const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(undead)(message), { what: "the undead's Will card as it crosses", timeout: 10000 });
                const check = abilityState(save).plan.resolution.check;
                h.assert(check.statistic === "will" && Number(check.against?.value) === 30, `DC 30 Will (${JSON.stringify(check)})`);
                await h.withDie(1, () => h.rollAndApply(save));
                await h.until(() => !inside(undeadToken), `the undead pushed back out (at ${squareOf(undeadToken)}; ${degreeOf(save, undead)})`, { timeout: 10000 });
                h.assert(undead.itemTypes.effect.some((effect) => /Kept out by the cube/.test(effect.name)), `its note Effect (${effectNames(undead)})`);
                // (A living creature crossing face 2: no card.)
                since = Date.now();
                await livingToken.update({ x: 5 * SIZE, y: 6 * SIZE }, { animate: false });
                await h.until(() => squareOf(livingToken) === "5,6", "the living creature inside", { timeout: 8000 });
                await h.wait(2500);
                h.assert(!abilityCardsSince(since).some(aimsAt(living)), "no save card for a living creature");
                // (Face 1: its counteract card beside the zone.)
                since = Date.now();
                await live().apply(ways.id, { choice: face(1) });
                const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "face 1's counteract card" });
                const counteract = stateOf(counter);
                h.assert(Number(counteract.counteract?.modifier) === 20 && Number(counteract.counteract?.rank) === 13, `+20 at rank 13 (${JSON.stringify(counteract.counteract)})`);
                h.assert(counteract.rows?.[0]?.kind === "free" && /gas or wind/.test(counteract.rows[0].name ?? ""), `its row (${JSON.stringify(counteract.rows)})`);
                return { cells, undeadAt: squareOf(undeadToken), counteract: counteract.counteract };
            });
        },

        // Cube of Nex's face 5 and its other activation (scripts/cube.js placeWallsAround, the environment module's api.placeStructure; postInertCard,
        // applyInert; scripts/activations.js's inert refusal): "5 The walls block everything, with the effects of Wall of Force … A cube of force
        // or Lesser Cube of Nex within 60 feet of you becomes inert. It can't be Activated." Face 5: the environment module's walls round its user,
        // Hardness 30 and 60 Hit Points each, invisible (no sight block), its user not pushed out. The other activation's inert card lists the Lesser
        // Cube of Nex and the Cube of Force a creature 20 feet away holds (not one 100 feet away); made inert, the Lesser Cube's Activate is refused.
        // (A Cube of Force has no Activate button of its own here, so its refusal can't be seen: the Lesser one's is.)
        async b4G3CubeWallsInert(scene) {
            const env = game.modules.get(ENVIRONMENT);
            h.assert(env?.active && typeof env.api?.placeStructure === "function", "PF2e Automatic Environment Resolution active with api.placeStructure (env c78702a, released after 0.2.0)");
            await h.clearSquares(scene, [[5, 5], [9, 5], [19, 19]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Nex Builder", { type: "character", x: 5, y: 5, level: 25 });
            const { actor: rival } = await h.creature(scene, "Nex Rival", { x: 9, y: 5, alliance: "opposition" });
            const { actor: far } = await h.creature(scene, "Nex Far Rival", { x: 19, y: 19, alliance: "opposition" });
            const cube = await h.give(user, "Cube of Nex");
            await cube.update(held(1));
            const lesser = await h.give(rival, "Lesser Cube of Nex");
            const force = await h.give(rival, "Cube of Force");
            const farForce = await h.give(far, "Cube of Force");
            await userToken.object?.control?.();
            const ways = await activated(cube, 0, "ways", "the cube's faces");
            const face5 = stateOf(ways).plan.ways.findIndex((way) => way.name.startsWith("Face 5:"));
            let since = Date.now();
            await live().apply(ways.id, { choice: face5 });
            const walls = () => scene.walls.filter((wall) => wall.flags?.[ENVIRONMENT]?.structure?.placed?.source?.itemUuid === cube.uuid);
            await h.until(() => walls().length >= 4, `the walls of force (${walls().length})`, { timeout: 8000 });
            const line = await h.messageAfter(since, (message) => /walls placed round/.test(text(message)), { what: "the walls' card" });
            for (const wall of walls()) {
                const structure = wall.flags[ENVIRONMENT].structure;
                h.assert(Number(structure.stats?.hardness) === 30 && Number(structure.stats?.hp) === 60, `Hardness 30, 60 Hit Points (${JSON.stringify(structure.stats)})`);
                h.assert(Number(wall.sight) === 0 && Number(wall.move) > 0, `invisible, blocking movement (sight ${wall.sight}, move ${wall.move})`);
            }
            const xs = walls().flatMap((wall) => [wall.c[0], wall.c[2]]);
            const ys = walls().flatMap((wall) => [wall.c[1], wall.c[3]]);
            const middle = { x: userToken.x + SIZE / 2, y: userToken.y + SIZE / 2 };
            h.assert(Math.min(...xs) < middle.x && Math.max(...xs) > middle.x && Math.min(...ys) < middle.y && Math.max(...ys) > middle.y, `round its user (${JSON.stringify({ xs, ys, middle })})`);
            h.assert(squareOf(userToken) === "5,5", `its user not pushed out (${squareOf(userToken)})`);
            // (Its other activation.)
            const inert = await activated(cube, 1, "inert", "the inert card");
            const candidates = stateOf(inert).candidates ?? [];
            h.assert(candidates.some((entry) => entry.itemUuid === lesser.uuid) && candidates.some((entry) => entry.itemUuid === force.uuid) && !candidates.some((entry) => entry.itemUuid === farForce.uuid), `the near rival's cubes, not the far one's (${JSON.stringify(candidates.map((entry) => `${entry.name} (${entry.holder})`))})`);
            const { applyInert } = await script("cube.js");
            await applyInert(current(inert), { pick: candidates.findIndex((entry) => entry.itemUuid === lesser.uuid) });
            await h.until(() => rival.items.get(lesser.id)?.getFlag(h.NS, "inert"), "the Lesser Cube of Nex flagged inert", { timeout: 8000 });
            const refused = await errorOf(live().activate(lesser.uuid, 0));
            h.assert(/is inert/.test(refused ?? ""), `its Activate refused (${refused})`);
            return { walls: walls().length, line: text(line), inert: resultsOf(inert) };
        },

        // Dragon-Lotus Drum (scripts/live.js plan.item.alsoConjure; the Arrive card, then plan.again's Depart; the recharge's warning): "Spend a
        // Mythic Point … All enemies in a 60-foot emanation around the army take 16d10 sonic damage (basic Fortitude DC 48); each creature who
        // fails its save is also Frightened 3 (Frightened 4 on a critical failure) … Depart … 20d8 bludgeoning, piercing, or slashing damage … A
        // creature who critically fails its save is also knocked Prone." A mythic user (2 Mythic Points): the Gargantuan "Dragon-Lotus Army" marker
        // beside it and the Arrive card; applied at an enemy, 1 Mythic Point left, the basic Fortitude DC 48 card, and the Depart card for later
        // with its bludgeoning/piercing/slashing pick. The enemy critically fails both (every die a 1): Frightened 4, then (piercing picked) Prone.
        // Beaten again, "Once every 20 years": the GM's whisper that it's usable again only in its wait.
        async b4G3DragonLotusArmy(scene) {
            await h.clearSquares(scene, [[8, 8], [14, 8]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Drum Beater", { x: 8, y: 8, level: 24, hp: 400 });
            await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
            await user.update({ "system.resources.mythicPoints.value": 2 });
            await h.until(() => Number(user.system.resources?.mythicPoints?.value) === 2, `2 Mythic Points (${JSON.stringify(user.system.resources?.mythicPoints ?? null)})`, { timeout: 5000 });
            const { actor: enemy, token: enemyToken } = await h.creature(scene, "Drum Enemy", { x: 14, y: 8, save: -30, hp: 2000, alliance: "opposition", level: 20 });
            const drum = await h.give(user, "Dragon-Lotus Drum");
            // (The army's marker is the ability module's conjured creature, a world actor this case's drum made: removed after, its own only.)
            try {
                await userToken.object?.control?.();
                const before = new Set(scene.tokens.map((token) => token.id));
                let since = Date.now();
                await live().activate(drum.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the Arrive's card" });
                const marker = () => scene.tokens.find((token) => !before.has(token.id) && /Dragon-Lotus Army/.test(token.name ?? ""));
                await h.until(marker, `the army's marker (${scene.tokens.map((token) => token.name).join(", ")})`, { timeout: 8000 });
                h.assert(Number(marker().width) === 4 && Number(marker().height) === 4, `Gargantuan (${marker().width}×${marker().height})`);
                h.assert(Number(user.system.resources.mythicPoints.value) === 2, "no Mythic Point spent before the card is applied");
                since = Date.now();
                await live().apply(card.id, { targets: [enemyToken.uuid] });
                await h.until(() => Number(user.system.resources.mythicPoints.value) === 1, `its Mythic Point spent (${user.system.resources.mythicPoints.value})`, { timeout: 8000 });
                const arrive = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(enemy)(message), { what: "the Arrive's save card" });
                const check = abilityState(arrive).plan.resolution.check;
                h.assert(check.statistic === "fortitude" && check.basic === true && Number(check.against?.value) === 48, `basic Fortitude DC 48 (${JSON.stringify(check)})`);
                const depart = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && message.id !== card.id, { what: "the Depart's later card" });
                const later = stateOf(depart);
                h.assert(later.later === true && JSON.stringify((later.plan.damageChoices ?? []).map((choice) => choice.label)) === JSON.stringify(["Bludgeoning", "Piercing", "Slashing"]), `kept for later, its type picked (${later.later}; ${JSON.stringify(later.plan.damageChoices)})`);
                const charge = later.plan.resolution;
                h.assert(charge.check.statistic === "reflex" && Number(charge.check.against?.value) === 48 && (charge.outcomes.criticalFailure?.effects ?? []).some((effect) => effect.slug === "prone"), `basic Reflex DC 48, Prone on a critical failure (${JSON.stringify(charge.check)})`);
                await h.withDie(1, () => h.rollAndApply(arrive));
                await h.until(() => valueOf(enemy, "frightened") === 4, `Frightened 4 (${conditions(enemy)})`, { timeout: 10000 });
                since = Date.now();
                await live().apply(depart.id, { targets: [enemyToken.uuid], damageChoice: 1 });
                const charged = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(enemy)(message), { what: "the Depart's save card" });
                const components = abilityState(charged).plan.resolution.sharedDamage?.components ?? [];
                h.assert(components.some((component) => /piercing/.test(component.formula ?? "") || component.type === "piercing"), `piercing, as picked (${JSON.stringify(components)})`);
                await h.withDie(1, () => h.rollAndApply(charged));
                await h.until(() => enemy.hasCondition("prone"), `Prone (${conditions(enemy)})`, { timeout: 10000 });
                since = Date.now();
                await live().activate(drum.uuid, 0);
                const wait = await h.messageAfter(since, (message) => /usable again only in/.test(text(message)), { what: "the GM's wait warning" });
                h.assert(wait.whisper?.length, "whispered");
                return { marker: marker().name, mythic: user.system.resources.mythicPoints.value, wait: text(wait) };
            } finally {
                const made = game.actors.filter((actor) => actor.flags?.[ABILITY]?.conjured?.itemUuid === drum.uuid);
                if (made.length) await Actor.deleteDocuments(made.map((actor) => actor.id)).catch(() => null);
            }
        },

        // Limitless Power's Unleash Power (src/live/contract-spells.js; scripts/casts.js's record, its choices and refusal): its signer's selected
        // spells, "each 1st- through 9th-rank spell can be cast once per day; cantrips at will". Its cast card offers every divine spell of rank 1;
        // Heal cast (the spell module's castFromItem) records Heal as the rank-1 selection, cast today. Activated again the same day: no rank-1
        // spell (Heal cast today, the others not its selection), every cantrip still. The next day (its record's day turned back one, so the world's
        // clock isn't moved): only Heal for rank 1.
        async b4G3LimitlessPowerContract(scene) {
            h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
            const apps = openApps();
            try {
                await h.clearSquares(scene, [[2, 2], [3, 2]]);
                const { actor: user, token: userToken } = await h.creature(scene, "Contract Signer", { type: "character", x: 2, y: 2, level: 20 });
                const { token: allyToken } = await h.creature(scene, "Contract Beneficiary", { x: 3, y: 2, hp: 20 });
                const contract = await h.give(user, "Limitless Power");
                await contract.update({ ...held(1), "system.equipped.invested": true });
                await userToken.object?.control?.();
                const unleash = await activationIndex(contract, "Unleash Power");
                let card = await activated(contract, unleash, "cast", "Unleash Power's cast card");
                const all = stateOf(card).plan.choices ?? [];
                const heal = all.findIndex((choice) => choice.slot === "1" && choice.spell?.name === "Heal");
                const cantrips = all.filter((choice) => choice.slot === "cantrip").length;
                h.assert(heal >= 0 && all.filter((choice) => choice.slot === "1").length > 1 && cantrips > 0, `Heal among its rank-1 spells (${all.filter((choice) => choice.slot === "1").length} of rank 1, ${cantrips} cantrips)`);
                const healUuid = all[heal].spell.uuid;
                await live().apply(card.id, { choice: heal, targets: [allyToken.uuid] });
                const record = () => user.items.get(contract.id)?.getFlag(h.NS, "contract");
                await h.until(() => record()?.selected?.["1"] === healUuid, `Heal recorded as the rank-1 selection (${JSON.stringify(record() ?? null)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 15000 });
                const day = Math.floor(Number(game.time.worldTime) / 86_400);
                h.assert(record().used?.[healUuid] === day, `cast today (${JSON.stringify(record().used)})`);
                card = await activated(contract, unleash, "cast", "the same day's cast card");
                const again = stateOf(card).plan.choices ?? [];
                h.assert(!again.some((choice) => choice.slot === "1"), `no rank-1 spell the same day (${again.filter((choice) => choice.slot === "1").map((choice) => choice.spell.name)})`);
                h.assert(again.filter((choice) => choice.slot === "cantrip").length === cantrips && again.some((choice) => choice.slot === "2"), `every cantrip still, and the other ranks (${again.filter((choice) => choice.slot === "cantrip").length} of ${cantrips})`);
                await user.items.get(contract.id).setFlag(h.NS, "contract", { ...record(), used: { ...record().used, [healUuid]: day - 1 } });
                card = await activated(contract, unleash, "cast", "the next day's cast card");
                const rankOne = (stateOf(card).plan.choices ?? []).filter((choice) => choice.slot === "1");
                h.assert(rankOne.length === 1 && rankOne[0].spell.uuid === healUuid, `only Heal for rank 1 the next day (${rankOne.map((choice) => choice.spell.name)})`);
                return { cantrips, record: record() };
            } finally {
                await closeNew(apps);
            }
        },

        // Shadewither Key's Umbral Double (scripts/decoy-double.js): "A creature must succeed at a DC 11 flat check when targeting you with an
        // attack … on a failure, they hit the shadowy double instead of you … As long as the double exists, you don't gain the Shadewither Key's
        // item bonus to Stealth checks." Activated: its note Effect (PF2e's RollOption air-decoy-double:11), its user's Stealth 1 lower. An NPC's
        // Strike hits it (every die a 5): that NPC's DC 11 flat check in the chat (a 5, a failure), the Effect deleted, the chat saying the double is
        // destroyed, Stealth back; that Strike's damage applied to the user as PF2e's Damage button does deals 0.
        async b4G3ShadewitherDouble(scene) {
            await h.clearSquares(scene, [[2, 6], [3, 6]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Shadewither Bearer", { type: "character", x: 2, y: 6, level: 20 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Shadewither Attacker", { x: 3, y: 6, alliance: "opposition", level: 20 });
            await hitPoints(user, 100);
            const stealthBare = Number(user.skills.stealth.mod);
            const key = await h.give(user, "Shadewither Key");
            await key.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            await h.until(() => Number(user.skills.stealth.mod) === stealthBare + 1, `the key's +1 to Stealth (${stealthBare} → ${user.skills.stealth.mod})`, { timeout: 5000 });
            const stealth = Number(user.skills.stealth.mod);
            const card = await activated(key, await activationIndex(key, "Umbral Double"), "item", "the double's card");
            await live().apply(card.id);
            const double = () => user.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-decoy-double:11"));
            await h.until(double, `the double's Effect (${effectNames(user)})`, { timeout: 8000 });
            h.assert(double().system.duration.value === 1 && double().system.duration.unit === "minutes", `for 1 minute (${JSON.stringify(double().system.duration)})`);
            await h.until(() => Number(user.skills.stealth.mod) === stealth - 1, `no key bonus to Stealth while it lasts (${stealth} → ${user.skills.stealth.mod})`, { timeout: 5000 });
            const [claws] = await foe.createEmbeddedDocuments("Item", [{ name: "Claws", type: "melee", system: { bonus: { value: 30 }, damageRolls: { a: { damage: "2d6+10", damageType: "slashing" } }, traits: { value: [] } } }]);
            await foeToken.object?.control?.();
            await h.target(userToken);
            const since = Date.now();
            // (The flat check is rolled by the GM's hook after the attack's message: the die held at 5 until it's in.)
            const { action, attack, flat } = await h.withDie(5, async () => {
                const struck = await h.strike(foe, claws);
                const check = await h.messageAfter(since, (message) => /DC 11 flat check to reach .*past its double/.test(String(message.flavor ?? "")), { what: "the attacker's DC 11 flat check" });
                return { ...struck, flat: check };
            });
            const outcome = attack.flags.pf2e.context.outcome;
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (${outcome})`);
            h.assert(Number(flat.rolls?.[0]?.total) === 5, `a 5 on the flat check (${flat.rolls?.[0]?.total})`);
            await h.until(() => !double(), `the double's Effect deleted (${effectNames(user)})`, { timeout: 8000 });
            const said = await h.messageAfter(since, (message) => /double instead, which is destroyed/.test(text(message)), { what: "the chat's line" });
            await h.until(() => Number(user.skills.stealth.mod) === stealth, `the key's Stealth bonus back (${user.skills.stealth.mod})`, { timeout: 5000 });
            const hp = hpOf(user);
            const at = Date.now();
            await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
            const rolled = await h.messageAfter(at, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the Strike's damage roll" });
            h.assert(Number(rolled.rolls?.[0]?.total) > 0, `damage rolled (${rolled.rolls?.[0]?.total})`);
            await user.applyDamage({ damage: rolled.rolls[0], token: userToken, item: rolled.item ?? claws });
            await h.wait(1500);
            h.assert(hpOf(user) === hp, `none of it taken (${hp} → ${hpOf(user)})`);
            return { flat: flat.rolls[0].total, line: text(said), damage: rolled.rolls[0].total };
        },

        // Jahan Waystone (scripts/paired-stone.js): "attempts to teleport the creatures to its paired stone. If there is no open space within 30
        // feet of the target waystone, the teleportation attempt fails. A creature can resist the teleportation with a successful DC 45 Will." Two
        // tokens named Jahan Waystone, one beside its user and one 65 feet off; its user (holding the item, as an Activate needs) presses the card
        // at two creatures by the near stone. Every die a 10: the one at −30 critically fails and lands within 30 feet of the other stone, the
        // chat says so; the one at +60 stays where it was.
        async b4G3JahanWaystonePair(scene) {
            await h.clearSquares(scene, [[2, 3], [3, 3], [3, 4], [4, 3], [16, 16]]);
            const { token: userToken, actor: user } = await h.creature(scene, "Waystone Traveler", { type: "character", x: 2, y: 3, level: 21 });
            const { token: nearStone } = await h.creature(scene, "Near Waystone", { x: 3, y: 3 });
            const { token: farStone } = await h.creature(scene, "Far Waystone", { x: 16, y: 16 });
            for (const stone of [nearStone, farStone]) await stone.update({ name: "Jahan Waystone" });
            const { actor: goer, token: goerToken } = await h.creature(scene, "Waystone Goer", { x: 3, y: 4, save: -30 });
            const { actor: stayer, token: stayerToken } = await h.creature(scene, "Waystone Stayer", { x: 4, y: 3, save: 60 });
            const stone = await h.give(user, "Jahan Waystone");
            await userToken.object?.control?.();
            const card = await activated(stone, 0, "expose", "the waystone's card");
            let since = Date.now();
            await live().apply(card.id, { targets: [goerToken.uuid, stayerToken.uuid] });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(goer)(message), { what: "the Will card" });
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && Number(check.against?.value) === 45, `DC 45 Will (${JSON.stringify(check)})`);
            const stayed = squareOf(stayerToken);
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(save));
            const line = await h.messageAfter(since, (message) => /teleported to the paired stone|no open space|No paired stone/.test(text(message)), { what: "the stone's line", timeout: 10000 });
            await h.until(() => squareOf(goerToken) !== "3,4", `the creature that failed moved (${squareOf(goerToken)}; ${text(line)})`, { timeout: 8000 });
            h.assert(feetBetween(goerToken, farStone) <= 30, `within 30 feet of the OTHER stone: ${feetBetween(goerToken, farStone)} feet from it, ${feetBetween(goerToken, nearStone)} from the one its user stands by (${squareOf(goerToken)}; ${text(line)})`);
            h.assert(squareOf(stayerToken) === stayed && degreeOf(save, stayer) === "criticalSuccess", `the one that resisted stays (${squareOf(stayerToken)}, ${degreeOf(save, stayer)})`);
            return { at: squareOf(goerToken), line: text(line) };
        },

        // The Eye of the Slumberer's Vortex (scripts/zones.js exceptTerrain, src/live/cube.js exemptSpec; the core's selective terrain): "becoming
        // difficult terrain for swimming creatures that don't have the water trait. You can use this action again to Dismiss this effect." Its zone
        // placed (the placement stood in for), each movement-cost behaviour flagged with the core's selectiveTerrain: swimming, difficulty 2, the
        // water creature on the scene at 1, the humanoid not listed. The core's wrapped _getTerrainEffects then gives the swimming humanoid difficult
        // terrain, the water creature none, and the humanoid walking none. Activated again: the first zone is dismissed.
        async b4G3EyeVortexTerrain(scene) {
            await h.clearSquares(scene, [[3, 3], [5, 3], [5, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Eye Bearer", { type: "character", x: 3, y: 3, level: 21 });
            const { actor: swimmer, token: swimmerToken } = await h.creature(scene, "Vortex Swimmer", { x: 5, y: 3 });
            const { actor: native, token: nativeToken } = await h.creature(scene, "Vortex Water Native", { x: 5, y: 4 });
            await swimmer.update({ "system.traits.value": ["human", "humanoid"] });
            await native.update({ "system.traits.value": ["water", "elemental"] });
            const eye = await h.give(user, "The Eye of the Slumberer");
            const vortex = await activationIndex(eye, "Vortex");
            await userToken.object?.control?.();
            const placing = canvas.regions.placeRegion;
            canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
            const zones = () => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.itemUuid === eye.uuid);
            try {
                await live().activate(eye.uuid, vortex);
                await h.until(() => zones().length, "the Vortex's zone", { timeout: 8000 });
                const first = zones().map((region) => region.id);
                const behaviour = () => zones().flatMap((region) => [...(region.behaviors ?? [])]).find((entry) => entry.type === "modifyMovementCost");
                await h.until(() => behaviour()?.getFlag(CORE, "selectiveTerrain"), `the core's selective terrain on its movement cost (${JSON.stringify(behaviour()?.flags ?? null)})`, { timeout: 8000 });
                const spec = behaviour().getFlag(CORE, "selectiveTerrain");
                h.assert(JSON.stringify(spec.actions) === JSON.stringify(["swim"]) && Number(spec.default) === 2, `swimming, difficulty 2 (${JSON.stringify(spec)})`);
                h.assert((spec.creatures ?? []).some((entry) => entry.actorUuid === native.uuid && Number(entry.difficulty) === 1) && !(spec.creatures ?? []).some((entry) => entry.actorUuid === swimmer.uuid), `the water creature exempt, the humanoid not (${JSON.stringify(spec.creatures)})`);
                const effects = (token, action) => behaviour().system._getTerrainEffects(token, { action }, {}) ?? [];
                const swimming = effects(swimmerToken, "swim");
                h.assert(swimming.some((entry) => Number(entry.difficulty) === 2), `difficult for the swimming humanoid (${JSON.stringify(swimming)})`);
                h.assert(!effects(nativeToken, "swim").length, `none for the water creature (${JSON.stringify(effects(nativeToken, "swim"))})`);
                h.assert(!effects(swimmerToken, "walk").length, `none for walking (${JSON.stringify(effects(swimmerToken, "walk"))})`);
                await live().activate(eye.uuid, vortex);
                await h.until(() => first.every((id) => !scene.regions.get(id)), `the first Vortex dismissed by using the action again (still there: ${first.filter((id) => scene.regions.get(id)).length}; zones now ${zones().length})`, { timeout: 6000 });
                return { spec };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of zones()) await region.delete().catch(() => null);
            }
        },

        // Vambrace of Gorum's Blade of Iron (scripts/objects.js create with material, lasts and effect; scripts/adjacent-bonus.js; scripts/expiring.js):
        // "The shield reforms into a +3 high-grade adamantine major striking greatsword for 1 minute. While wielding this sword, you gain a +1
        // circumstance bonus to AC for each adjacent enemy (up to a +4 bonus)." Applied: the greatsword in its user's hands (+3, major striking,
        // high-grade adamantine), flagged to go 60 seconds of world time on; the "a guard of iron" Effect's FlatModifier at 0. An enemy placed
        // adjacent: +1 and its AC 1 higher; a second: +2; an adjacent ally changes nothing; the first enemy teleported away: +1. Its time made up
        // (its end set to now, the world's clock 1 second on): the sword gone.
        async b4G3VambraceBladeOfIron(scene) {
            await h.clearSquares(scene, [[5, 5], [6, 5], [5, 6], [4, 5], [9, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Gorum Champion", { type: "character", x: 5, y: 5, level: 20 });
            const vambrace = await h.give(user, "Vambrace of Gorum");
            await vambrace.update(held(1));
            await userToken.object?.control?.();
            const card = await activated(vambrace, await activationIndex(vambrace, "Blade of Iron"), "objects", "Blade of Iron's card");
            const t0 = Number(game.time.worldTime);
            await live().apply(card.id, {});
            const sword = () => user.itemTypes.weapon.find((weapon) => weapon.flags?.[h.NS]?.made?.by === vambrace.id);
            await h.until(sword, `the greatsword made (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            const made = sword();
            h.assert(made.system.baseItem === "greatsword" && Number(made.system.runes.potency) === 3 && Number(made.system.runes.striking) === 3, `a +3 major striking greatsword (${made.system.baseItem}, ${JSON.stringify(made.system.runes)})`);
            h.assert(made.system.material?.type === "adamantine" && made.system.material.grade === "high", `of high-grade adamantine (${JSON.stringify(made.system.material)})`);
            h.assert(made.system.equipped.carryType === "held" && Number(made.system.equipped.handsHeld) === 2, `in both hands (${JSON.stringify(made.system.equipped)})`);
            h.assert(Number(made.flags[h.NS].expiresAt) === t0 + 60, `gone 60 seconds on (${made.flags[h.NS].expiresAt} vs ${t0})`);
            const guard = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.adjacentEnemies);
            await h.until(guard, `the guard's Effect (${effectNames(user)})`, { timeout: 8000 });
            h.assert(guard().system.duration.value === 1 && guard().system.duration.unit === "minutes", `for 1 minute (${JSON.stringify(guard().system.duration)})`);
            const bonus = () => Number((guard()?.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac"))?.value ?? NaN);
            const ac = () => Number(user.system.attributes.ac.value);
            await h.until(() => bonus() === 0, `+0 with no enemy beside it (${bonus()})`, { timeout: 5000 });
            const base = ac();
            const { token: one } = await h.creature(scene, "Gorum Foe One", { x: 6, y: 5, alliance: "opposition" });
            await h.until(() => bonus() === 1 && ac() === base + 1, `+1 with one adjacent enemy (${bonus()}, AC ${base} → ${ac()})`, { timeout: 8000 });
            await h.creature(scene, "Gorum Foe Two", { x: 5, y: 6, alliance: "opposition" });
            await h.until(() => bonus() === 2 && ac() === base + 2, `+2 with two (${bonus()}, AC ${ac()})`, { timeout: 8000 });
            await h.creature(scene, "Gorum Ally", { x: 4, y: 5, alliance: "party" });
            await h.wait(1500);
            h.assert(bonus() === 2, `an adjacent ally changes nothing (${bonus()})`);
            await teleport(one, 9, 5);
            await h.until(() => bonus() === 1 && ac() === base + 1, `+1 once the first enemy is away (${bonus()}, AC ${ac()})`, { timeout: 8000 });
            await made.setFlag(h.NS, "expiresAt", Number(game.time.worldTime));
            await game.time.advance(1);
            await h.until(() => !sword(), "the sword gone once its time is up", { timeout: 8000 });
            return { runes: made.system.runes, base, results: resultsOf(card) };
        },

        // Mountebank's Passage (src/live/portals.js, scripts/portals.js): "Choose a vertical surface within 120 feet … creates a white portal … Any
        // creature who moves through the white portal comes out through the mountebank's passage's black portal … the portal lasts until your next
        // daily preparations … Requirements the mountebank's passage isn't loaded." Unloaded: Doorway to Onyx's Pick makes the white portal Region,
        // Doorway to Pearl's the black one, each one's teleportToken leading to the other. A creature moving into the white portal comes out at the
        // black one (a move on the map: needs a visible pane). Its user's Rest for the Night removes both. Loaded, the activation is refused.
        async b4G3MountebankPortals(scene) {
            return h.unpaused(async () => {
                await h.clearSquares(scene, [[2, 2], [6, 2], [8, 2], [14, 10]]);
                const { actor: user, token: userToken } = await h.creature(scene, "Mountebank Thief", { type: "character", x: 2, y: 2, level: 15 });
                const { token: walkerToken } = await h.creature(scene, "Portal Walker", { x: 6, y: 2 });
                const pistol = await h.give(user, "Mountebank's Passage");
                await pistol.update(held(1));
                await userToken.object?.control?.();
                const { applyPortal } = await script("portals.js");
                const portals = () => scene.regions.filter((region) => region.flags?.[h.NS]?.portal?.itemUuid === pistol.uuid);
                const portalOf = (color) => portals().find((region) => region.flags[h.NS].portal.color === color);
                const onyx = await activationIndex(pistol, "Doorway to Onyx");
                const pearl = await activationIndex(pistol, "Doorway to Pearl");
                let card = await activated(pistol, onyx, "portal", "Doorway to Onyx's card");
                await applyPortal(current(card), { square: { x: 8 * SIZE, y: 2 * SIZE } });
                await h.until(() => portalOf("white"), `the white portal (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                card = await activated(pistol, pearl, "portal", "Doorway to Pearl's card");
                await applyPortal(current(card), { square: { x: 14 * SIZE, y: 10 * SIZE } });
                await h.until(() => portalOf("black"), "the black portal", { timeout: 8000 });
                const through = (region) => [...(region.behaviors ?? [])].find((entry) => entry.type === "teleportToken");
                const leadsTo = (region) => [...(through(region)?.system?.destinations ?? [])].map(String);
                await h.until(() => leadsTo(portalOf("white")).includes(portalOf("black").uuid), `the white portal leading to the black (${JSON.stringify(leadsTo(portalOf("white")))})`, { timeout: 5000 });
                h.assert(leadsTo(portalOf("black")).includes(portalOf("white").uuid), `the black one back to the white (${JSON.stringify(leadsTo(portalOf("black")))})`);
                await walkerToken.update({ x: 8 * SIZE, y: 2 * SIZE }, { animate: false });
                await h.until(() => Math.abs(walkerToken.x - 14 * SIZE) < SIZE && Math.abs(walkerToken.y - 10 * SIZE) < SIZE, `the walker out of the black portal (at ${walkerToken.x}, ${walkerToken.y})`, { timeout: 10000 });
                await game.pf2e.actions.restForTheNight({ actors: [user], skipDialog: true });
                await h.until(() => !portals().length, `both gone at its user's daily preparations (${portals().length} left)`, { timeout: 8000 });
                const rounds = await h.give(user, "Rounds (Flintlock Pistol)");
                await pistol.attach(rounds, { quantity: 1, stack: true });
                const loaded = () => [...(user.items.get(pistol.id)?.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
                await h.until(() => loaded() === 1, `loaded (${loaded()})`, { timeout: 5000 });
                const refused = await errorOf(live().activate(pistol.uuid, onyx));
                h.assert(/must not be loaded/.test(refused ?? ""), `refused while loaded (${refused})`);
                return { refused };
            });
        },

        // Belimarius's Invidious Halberd's Absorb Arcana (src/live/arcane-drain.js, scripts/arcane-drain.js; the failure's Quickened on its wielder):
        // "If the creature struck fails a DC 37 Will save, it loses an arcane spell … randomly determined from the highest rank available, starting
        // at 6th rank and working down." A wizard NPC with prepared arcane spells at ranks 5, 6 (two) and 7. Its Will card, failed (every die a
        // 1): one of its two 6th-rank spells expended, neither the 5th nor the 7th; the chat names it; the wielder Quickened.
        async b4G3HalberdAbsorbArcana(scene) {
            await h.clearSquares(scene, [[2, 10], [3, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Halberd Wielder", { type: "character", x: 2, y: 10, level: 17 });
            const { actor: wizard, token: wizardToken } = await h.creature(scene, "Absorbed Wizard", { x: 3, y: 10, save: -30, hp: 200, alliance: "opposition", level: 15 });
            const [entry] = await wizard.createEmbeddedDocuments("Item", [{ name: "Arcane Prepared Spells", type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "prepared", flexible: false }, ability: { value: "int" }, spelldc: { value: 25, dc: 35 } } }]);
            const spell = async (name) => {
                const item = await h.give(wizard, name, "pf2e.spells-srd");
                await item.update({ "system.location.value": entry.id });
                return item;
            };
            const cone = await spell("Cone of Cold");
            const chain = await spell("Chain Lightning");
            const disintegrate = await spell("Disintegrate");
            const spray = await spell("Prismatic Spray");
            await wizard.items.get(entry.id).update({
                "system.slots.slot5": { max: 1, value: 1, prepared: [{ id: cone.id, expended: false }] },
                "system.slots.slot6": { max: 2, value: 2, prepared: [{ id: chain.id, expended: false }, { id: disintegrate.id, expended: false }] },
                "system.slots.slot7": { max: 1, value: 1, prepared: [{ id: spray.id, expended: false }] }
            });
            const slot = (rank) => [...(wizard.items.get(entry.id)?.system?.slots?.[`slot${rank}`]?.prepared ?? [])];
            await h.until(() => slot(6).length === 2 && slot(5).length === 1 && slot(7).length === 1, `its prepared spells (${JSON.stringify(wizard.items.get(entry.id)?.system?.slots ?? null)})`, { timeout: 5000 });
            const halberd = await h.give(user, "Belimarius's Invidious Halberd");
            await halberd.update(held(2));
            await userToken.object?.control?.();
            const card = await activated(halberd, await activationIndex(halberd, "Absorb Arcana"), "expose", "Absorb Arcana's card");
            let since = Date.now();
            await live().apply(card.id, { targets: [wizardToken.uuid] });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(wizard)(message), { what: "the Will card at the wizard" });
            const check = abilityState(save).plan.resolution.check;
            h.assert(check.statistic === "will" && Number(check.against?.value) === 37, `DC 37 Will (${JSON.stringify(check)})`);
            since = Date.now();
            await h.withDie(1, () => h.rollAndApply(save));
            await h.until(() => slot(6).filter((spell) => spell?.expended).length === 1, `one 6th-rank spell expended (${JSON.stringify(slot(6))})`, { timeout: 10000 });
            h.assert(!slot(5).some((spell) => spell?.expended) && !slot(7).some((spell) => spell?.expended), `none at rank 5 or 7 (${JSON.stringify({ 5: slot(5), 7: slot(7) })})`);
            const line = await h.messageAfter(since, (message) => /loses (?:Chain Lightning|Disintegrate) \(rank 6/.test(text(message)), { what: "the chat's line" });
            await h.until(() => user.hasCondition("quickened"), `the wielder Quickened (${conditions(user)})`, { timeout: 8000 });
            return { degree: degreeOf(save, wizard), line: text(line), slot6: slot(6) };
        },

        // Reaper's Grasp (src/live/souls.js, scripts/souls.js; scripts/ends-on-strike.js endsOnStrike { slug }): "Whenever the reaper's grasp kills a
        // sapient living or undead creature, a portion of that creature's soul is drawn … Soul Shot … deals additional void damage equal to twice
        // the soul's level … Devour Captured Soul … gain temporary Hit Points equal to three times the soul's level … until the end of your next
        // turn." Its damage applied (with the arquebus as its item) kills a level-3 humanoid: its soul stored on the weapon, the chat says so. A
        // second soul kept on it; Soul Shot releases the first: its Effect's FlatModifier +6 void on the arquebus's damage (PF2e's roll shows a
        // 6 void instance). Devour Captured Soul releases the second: 9 temporary Hit Points, till the end of the next turn. Then the Strike: its
        // hit's damage roll carries the +6 void, and the Effect is gone after that Strike.
        async b4G3ReapersGraspSouls(scene) {
            await h.clearSquares(scene, [[2, 14], [3, 14], [3, 15]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Grasp Reaper", { type: "character", x: 2, y: 14, level: 11 });
            await hitPoints(user, 60);
            const { actor: prey, token: preyToken } = await h.creature(scene, "Grasp Prey", { x: 3, y: 14, hp: 1, ac: 1, alliance: "opposition", level: 3 });
            await prey.update({ "system.traits.value": ["human", "humanoid"] });
            const { token: targetToken } = await h.creature(scene, "Grasp Target", { x: 3, y: 15, hp: 300, ac: 1, alliance: "opposition" });
            const grasp = await h.give(user, "Reaper's Grasp");
            await grasp.update(held(2));
            const own = () => user.items.get(grasp.id);
            const action = () => (user.system.actions ?? []).find((entry) => entry.item?.id === grasp.id);
            await userToken.object?.control?.();
            // (The kill: the arquebus's damage, applied with it.)
            await h.target(preyToken);
            let since = Date.now();
            await action().damage({ event: h.shift() });
            const killing = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the arquebus's damage roll" });
            since = Date.now();
            await prey.applyDamage({ damage: killing.rolls[0], token: preyToken, item: killing.item ?? own() });
            await h.until(() => hpOf(prey) === 0, `the humanoid killed (${hpOf(prey)})`, { timeout: 8000 });
            const souls = () => own()?.getFlag(h.NS, "souls") ?? [];
            await h.until(() => souls().length === 1 && Number(souls()[0].level) === 3, `its soul stored (${JSON.stringify(souls())})`, { timeout: 8000 });
            const stored = await h.messageAfter(since, (message) => /soul is drawn into it/.test(text(message)), { what: "the chat's line of the soul" });
            await own().setFlag(h.NS, "souls", [...souls(), { name: "Grasp Second Soul", level: 3 }]);
            const { applySouls } = await script("souls.js");
            // (Soul Shot: the first soul.)
            let card = await activated(grasp, await activationIndex(grasp, "Soul Shot"), "souls", "Soul Shot's card");
            await applySouls(current(card), { pick: 0 });
            const shot = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.endsOnStrike?.slug === "reapers-grasp");
            await h.until(shot, `Soul Shot's Effect (${effectNames(user)})`, { timeout: 8000 });
            const rule = (shot().system.rules ?? []).find((entry) => entry.key === "FlatModifier");
            h.assert(rule && [].concat(rule.selector).includes(`${grasp.id}-damage`) && rule.damageType === "void" && Number(rule.value) === 6, `+6 void on the arquebus's damage (${JSON.stringify(rule)})`);
            h.assert(souls().length === 1 && souls()[0].name === "Grasp Second Soul", `the first soul released (${JSON.stringify(souls())})`);
            await h.target(targetToken);
            const preview = await action().damage({ event: h.shift(), createMessage: false });
            h.assert((preview?.instances ?? []).some((instance) => instance.type === "void" && Number(instance.total) === 6), `PF2e's damage has 6 void (${(preview?.instances ?? []).map((instance) => `${instance.total}[${instance.type}]`).join(", ")})`);
            // (Devour Captured Soul: the second.)
            card = await activated(grasp, await activationIndex(grasp, "Devour Captured Soul"), "souls", "Devour Captured Soul's card");
            await applySouls(current(card), { pick: 0 });
            await h.until(() => Number(user.system.attributes.hp.temp) === 9, `9 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
            const devour = user.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((entry) => entry.key === "TempHP"));
            h.assert(devour && devour.system.duration.value === 1 && devour.system.duration.unit === "rounds" && devour.system.duration.expiry === "turn-end", `till the end of its next turn (${JSON.stringify(devour?.system?.duration)})`);
            h.assert(!souls().length, `no soul left (${JSON.stringify(souls())})`);
            // (The Strike with Soul Shot.)
            const rounds = await h.give(user, "Rounds (Arquebus)");
            await own().attach(rounds, { quantity: 1, stack: true });
            await h.wait(500);
            const { attack } = await h.withDie(15, () => h.strike(user, own()));
            const outcome = attack.flags.pf2e.context.outcome;
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (${outcome})`);
            await h.wait(800);
            const still = Boolean(shot());
            since = Date.now();
            await (outcome === "criticalSuccess" ? action().critical : action().damage)({ event: h.shift() });
            const rolled = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the hit's damage roll" });
            const instances = rolled.rolls?.[0]?.instances ?? [];
            h.assert(instances.some((instance) => instance.type === "void" && Number(instance.total) >= 6), `the Strike's damage roll carries Soul Shot's +6 void (${instances.map((instance) => `${instance.total}[${instance.type}]`).join(", ")}; the Effect ${still ? "was still there" : "was already gone"} after the attack roll — scripts/ends-on-strike.js ends it at the attack roll)`);
            await h.until(() => !shot(), "Soul Shot's Effect gone after the Strike", { timeout: 8000 });
            return { stored: text(stored), rule, outcome };
        },

        // Crimson Fulcrum Lens's possession (scripts/lens-possession.js; scripts/activations.js's inert refusal): "make a melee spell attack roll with
        // a modifier of +18. On a hit, you force the splinter of Nhimbaloth's essence from the lens to possess the target. You're no longer invested
        // in the lens … The lens doesn't have any magical abilities until the possession effect ends." The attack card at +18 (every die a 10 against
        // AC 10, a hit): PF2e's Effect: Crimson Fulcrum Lens and the possession's note Effect on the creature, the lens no longer invested and inert,
        // the chat says so; its other activation refused. The note Effect deleted: the lens no longer inert, its activation's card posted.
        async b4G3CrimsonLensPossession(scene) {
            await h.clearSquares(scene, [[2, 18], [3, 18]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Lens Bearer", { type: "character", x: 2, y: 18, level: 9 });
            const { actor: host, token: hostToken } = await h.creature(scene, "Lens Host", { x: 3, y: 18, ac: 10, alliance: "opposition" });
            const lens = await h.give(user, "Crimson Fulcrum Lens");
            await lens.update({ ...held(1), "system.equipped.invested": true });
            const own = () => user.items.get(lens.id);
            await h.until(() => own().system.equipped.invested === true, "the lens invested", { timeout: 5000 });
            await userToken.object?.control?.();
            const card = await activated(lens, 1, "expose", "the possession's card");
            let since = Date.now();
            await live().apply(card.id, { targets: [hostToken.uuid] });
            const attack = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(host)(message), { what: "the attack card at the creature" });
            h.assert(Number(abilityState(attack).plan.resolution.check.modifier) === 18, `at +18 (${JSON.stringify(abilityState(attack).plan.resolution.check)})`);
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(attack));
            const benefit = () => host.itemTypes.effect.find((effect) => effect.name === "Effect: Crimson Fulcrum Lens");
            const note = () => host.itemTypes.effect.find((effect) => /: Possessed by Nhimbaloth's essence$/.test(effect.name));
            await h.until(() => benefit() && note(), `the lens's Effect and the possession's note on the creature (${effectNames(host)})`, { timeout: 10000 });
            await h.until(() => own().system.equipped.invested === false && own().getFlag(h.NS, "inert"), `the lens uninvested and inert (${own().system.equipped.invested}; ${JSON.stringify(own().flags?.[h.NS] ?? {})})`, { timeout: 8000 });
            const said = await h.messageAfter(since, (message) => /its essence possesses/.test(text(message)), { what: "the chat's line" });
            const refused = await errorOf(live().activate(lens.uuid, 0));
            h.assert(/inert/.test(refused ?? ""), `its other activation refused (${refused})`);
            await note().delete();
            await h.until(() => !own().getFlag(h.NS, "inert") && !own().getFlag(h.NS, "possessed"), `the essence back: not inert (${JSON.stringify(own().flags?.[h.NS] ?? {})})`, { timeout: 8000 });
            since = Date.now();
            await live().activate(lens.uuid, 0);
            await h.messageAfter(since, h.itemCard("strike"), { what: "its other activation's card once the possession ends" });
            return { degree: degreeOf(attack, host), line: text(said) };
        },

        // Scene Stealer's Tunic's Look At Me! (no new code: the question live play alone answers): its rows give PF2e's own Effect: Look at Me!,
        // whose rules are predicated on "origin:signature:{item|origin.signature}". Its Will card critically failed (−30, every die a 10): the
        // creature has the Effect, its origin the tunic's wearer, each rule's predicate resolved to the wearer's own signature (not left as
        // "{item|…}", not the creature's own), none ignored; Off-Guard and Slowed 1 beside it; its Perception 1 lower (the penalty against
        // anyone but the wearer).
        async b4G3LookAtMeOrigin(scene) {
            await h.clearSquares(scene, [[6, 18], [8, 18]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Scene Stealer", { type: "character", x: 6, y: 18, level: 13 });
            const { actor: mark, token: markToken } = await h.creature(scene, "Stolen Audience", { x: 8, y: 18, save: -30, alliance: "opposition" });
            const tunic = await h.give(user, "Scene Stealer's Tunic");
            await tunic.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            await userToken.object?.control?.();
            const perception = Number(mark.perception?.mod ?? mark.system.perception?.mod);
            const card = await activated(tunic, await activationIndex(tunic, "Look At Me!"), "expose", "Look At Me!'s card");
            const since = Date.now();
            await live().apply(card.id, { targets: [markToken.uuid] });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && aimsAt(mark)(message), { what: "the Will card" });
            await h.withDie(10, () => h.rollAndApply(save));
            const effect = () => mark.itemTypes.effect.find((entry) => entry.name === "Effect: Look at Me!");
            await h.until(effect, `PF2e's Effect: Look at Me! (${effectNames(mark)})`, { timeout: 10000 });
            h.assert(effect().system.context?.origin?.actor === user.uuid, `its origin the wearer (${JSON.stringify(effect().system.context?.origin ?? null)})`);
            const signature = user.signature;
            const predicates = (effect().rules ?? []).map((rule) => JSON.stringify(rule.predicate ?? []));
            h.assert(signature && predicates.length === 3 && predicates.every((predicate) => predicate.includes(`origin:signature:${signature}`) && !predicate.includes("{item|")), `its predicates resolved to the wearer's signature ${signature} (theirs ${mark.signature}; ${predicates.join(" | ")})`);
            h.assert(!(effect().rules ?? []).some((rule) => rule.ignored), "none of its rules ignored");
            await h.until(() => mark.hasCondition("off-guard") && valueOf(mark, "slowed") === 1, `Off-Guard and Slowed 1 (${conditions(mark)})`, { timeout: 8000 });
            await h.until(() => Number(mark.perception?.mod ?? mark.system.perception?.mod) === perception - 1, `Perception 1 lower (${perception} → ${mark.perception?.mod})`, { timeout: 5000 });
            return { signature, predicates, degree: degreeOf(save, mark) };
        },

        // Old Tillimaquin's Luck of the Mascot (src/live/reroll-card.js laterRefusal, withLaterUse; scripts/rerolls.js): "You can reroll a single
        // failed saving throw within the next 24 hours, but you must take the second result … Each person who rubs the claws can benefit only once
        // per month." A creature fails a Will save; the card pressed with it targeted: PF2e rerolls that save (the new result kept). Activated again
        // and pressed for the same creature after another failed save: refused ("had its luck this month"). That card made 24 hours and a second
        // old (its time turned back, so the world's clock isn't moved), pressed for another creature: refused ("24 hours are over").
        async b4G3TillimaquinLuck(scene) {
            await h.clearSquares(scene, [[10, 2], [11, 2], [11, 3]]);
            const { actor: keeper } = await h.creature(scene, "Tillimaquin Keeper", { type: "character", x: 10, y: 2, level: 12 });
            const { actor: rubber, token: rubberToken } = await h.creature(scene, "Claw Rubber", { x: 11, y: 2, save: 0 });
            const { actor: late, token: lateToken } = await h.creature(scene, "Late Rubber", { x: 11, y: 3, save: 0 });
            const mascot = await h.give(keeper, "Old Tillimaquin");
            const saveBy = (actor) => (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === actor.id;
            const failWill = async (actor) => {
                const since = Date.now();
                await h.withDie(5, () => actor.saves.will.roll({ dc: { value: 30 }, skipDialog: true }));
                const message = await h.messageAfter(since, saveBy(actor), { what: `${actor.name}'s Will save` });
                h.assert(["failure", "criticalFailure"].includes(message.flags.pf2e.context.outcome), `${actor.name} fails (${message.flags.pf2e.context.outcome})`);
                return message;
            };
            const luck = await activationIndex(mascot, "Luck of the Mascot");
            await failWill(rubber);
            let card = await activated(mascot, luck, "reroll", "the luck's reroll card");
            h.assert(Number.isFinite(Number(stateOf(card).at)), `when it was given (${stateOf(card).at})`);
            let since = Date.now();
            await live().apply(card.id, { targets: [rubberToken.uuid] });
            const rerolled = await h.messageAfter(since, (message) => saveBy(rubber)(message) && message.flags.pf2e.context.isReroll, { what: "PF2e's reroll of its failed save", timeout: 10000 });
            h.assert(rubber.uuid in (keeper.items.get(mascot.id)?.getFlag(h.NS, "rerollsBy") ?? {}), `its use this month recorded (${JSON.stringify(keeper.items.get(mascot.id)?.getFlag(h.NS, "rerollsBy") ?? null)})`);
            await failWill(rubber);
            card = await activated(mascot, luck, "reroll", "the luck's card again");
            const again = await errorOf(live().apply(card.id, { targets: [rubberToken.uuid] }));
            h.assert(/that creature has had its luck this month/.test(again ?? ""), `the same creature again this month refused (${again})`);
            await failWill(late);
            await current(card).update({ [`flags.${h.NS}.card.at`]: Number(game.time.worldTime) - 86_401 });
            since = Date.now();
            const expired = await errorOf(live().apply(card.id, { targets: [lateToken.uuid] }));
            h.assert(/its 24 hours are over/.test(expired ?? ""), `past its 24 hours refused (${expired})`);
            await h.wait(500);
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && saveBy(late)(message) && message.flags.pf2e.context.isReroll), "no reroll for it");
            return { rerolled: rerolled.flags.pf2e.context.outcome, again, expired };
        },

        // Phoenix Necklace's first activation (scripts/activations.js item.endsPrevious; the note Effect's PF2e toggle): "The selected creatures can
        // make nonlethal attacks without taking a penalty … until you remove the necklace or use this activation again." Pressed at its wearer and an
        // ally: each the note Effect with its "Nonlethal attacks" toggle; ticked, the wearer's club Strike has the nonlethal trait (not before).
        // Activated again: both old Effects deleted before the new card is applied.
        async b4G3PhoenixNonlethal(scene) {
            await h.clearSquares(scene, [[14, 2], [15, 2]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Phoenix Wearer", { type: "character", x: 14, y: 2, level: 20 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Phoenix Teammate", { x: 15, y: 2 });
            const necklace = await h.give(user, "Phoenix Necklace");
            await necklace.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            const club = await h.give(user, "Club");
            await club.update(held(1));
            await userToken.object?.control?.();
            const notes = (actor) => actor.itemTypes.effect.filter((effect) => /: Nonlethal without penalty$/.test(effect.name));
            let card = await activated(necklace, 0, "item", "the necklace's card");
            await live().apply(card.id, { targets: [userToken.uuid, allyToken.uuid] });
            await h.until(() => notes(user).length === 1 && notes(ally).length === 1, `the note Effect on both (${effectNames(user)} / ${effectNames(ally)})`, { timeout: 8000 });
            const traits = () => {
                const action = (user.system.actions ?? []).find((entry) => entry.item?.id === club.id);
                return [...(action?.item?.system?.traits?.value ?? []), ...(action?.traits ?? []).map((trait) => trait?.name ?? trait)];
            };
            h.assert(!traits().includes("nonlethal"), `not nonlethal before the toggle (${traits()})`);
            await user.toggleRollOption("all", "phoenix-necklace-nonlethal", notes(user)[0].id, true);
            await h.until(() => traits().includes("nonlethal"), `the club Strike nonlethal once ticked (${traits()})`, { timeout: 5000 });
            card = await activated(necklace, 0, "item", "the necklace's card again");
            await h.until(() => !notes(user).length && !notes(ally).length, `the old Effects deleted as it's used again (${effectNames(user)} / ${effectNames(ally)})`, { timeout: 8000 });
            h.assert(stateOf(card).status === "open", "the new card open");
            return { traits: traits() };
        },

        // The Trader (src/live/skill-swap.js, scripts/skill-swap.js): "select two skills. Your proficiency rank with those two skills swaps for 1
        // hour. For example, if you were a master in Athletics and untrained in Crafting, you would become untrained in Athletics and a master in
        // Crafting." Master in Athletics, untrained in Crafting: swapped, PF2e's ranks read untrained and master, its Effect for 1 hour; deleted, back.
        async b4G3TraderSwap(scene) {
            await h.clearSquares(scene, [[16, 6]]);
            const { actor: user } = await h.creature(scene, "Trader Bearer", { type: "character", x: 16, y: 6, level: 20 });
            await user.update({ "system.skills.athletics.rank": 3, "system.skills.crafting.rank": 0 });
            const ranks = () => [Number(user.skills.athletics.rank), Number(user.skills.crafting.rank)];
            await h.until(() => ranks()[0] === 3 && ranks()[1] === 0, `master in Athletics, untrained in Crafting (${ranks()})`, { timeout: 5000 });
            const trader = await h.give(user, "The Trader");
            await trader.update({ "system.equipped.invested": true });
            const card = await activated(trader, 0, "skill-swap", "the Trader's card");
            const { applySwap } = await script("skill-swap.js");
            const { SKILLS } = await import(`/modules/${h.NS}/src/live/skill-swap.js`);
            await applySwap(current(card), { first: SKILLS.indexOf("athletics"), second: SKILLS.indexOf("crafting") });
            await h.until(() => ranks()[0] === 0 && ranks()[1] === 3, `untrained in Athletics, master in Crafting (${ranks()})`, { timeout: 8000 });
            const swap = user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.skillSwap);
            h.assert(swap && swap.system.duration.value === 1 && swap.system.duration.unit === "hours", `for 1 hour (${JSON.stringify(swap?.system?.duration)})`);
            await swap.delete();
            await h.until(() => ranks()[0] === 3 && ranks()[1] === 0, `back once it ends (${ranks()})`, { timeout: 5000 });
            return { results: resultsOf(card) };
        },

        // Soulheart (Pure)'s Restore Life (scripts/revive.js revive.maxLevel and destroysItem): "a dead creature of 20th level or lower … the pure
        // soulheart flashes with red light and is destroyed. The targeted dead creature is restored to life with 1 Hit Point." Its card at a dead
        // level-21 NPC: refused, the soulheart kept. Again at a dead level-10 NPC: back with 1 Hit Point, no dead status, the "back from death" note
        // Effect, and the soulheart deleted.
        async b4G3SoulheartRestore(scene) {
            await h.clearSquares(scene, [[2, 2], [3, 2], [2, 3]]);
            const { actor: user } = await h.creature(scene, "Soulheart Bearer", { type: "character", x: 2, y: 2, level: 20 });
            const corpse = async (name, x, y, level) => {
                const { actor } = await h.creature(scene, name, { x, y, hp: 0, level });
                await actor.toggleStatusEffect("dead", { active: true, overlay: true });
                await h.until(() => actor.statuses?.has?.("dead") && hpOf(actor) === 0, `${actor.name} dead`, { timeout: 5000 });
                return actor;
            };
            const titan = await corpse("Soulheart Titan", 3, 2, 21);
            const hero = await corpse("Soulheart Hero", 2, 3, 10);
            const soulheart = await h.give(user, "Soulheart (Pure)");
            await soulheart.update(held(1));
            const index = await activationIndex(soulheart, "Restore Life");
            const at = (card, actor) => stateOf(card).drinkers.findIndex((entry) => entry.actorUuid === actor.uuid);
            let card = await activated(soulheart, index, "item", "Restore Life's card");
            h.assert(at(card, titan) > 0 && at(card, hero) > 0, `both dead creatures offered (${JSON.stringify(stateOf(card).drinkers.map((entry) => entry.name))})`);
            await live().apply(card.id, { drinker: at(card, titan) });
            await h.until(() => resultsOf(card).some((line) => /is level 21: .* brings back only a creature of level 20 or lower/.test(line)), `refused above 20th level (${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(titan.statuses?.has?.("dead") && hpOf(titan) === 0 && user.items.get(soulheart.id), "still dead, the soulheart kept");
            card = await activated(soulheart, index, "item", "Restore Life's card again");
            await live().apply(card.id, { drinker: at(card, hero) });
            await h.until(() => !hero.statuses?.has?.("dead") && hpOf(hero) === 1, `back with 1 Hit Point (${hpOf(hero)}, dead ${hero.statuses?.has?.("dead")}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
            h.assert(hero.itemTypes.effect.some((effect) => /: back from death$/.test(effect.name)), `its "back from death" note Effect (${effectNames(hero)})`);
            await h.until(() => !user.items.get(soulheart.id), "the soulheart destroyed", { timeout: 8000 });
            h.assert(resultsOf(card).some((line) => /is destroyed/.test(line)), `its line (${JSON.stringify(resultsOf(card))})`);
            return { titan: resultsOf(card), hero: hpOf(hero) };
        },

        // Reaper's Lancet (src/live/reservoir.js, scripts/reservoir.js): "large enough to hold only 3 doses at a time … You poison the creature you
        // hit with the poison currently in the reservoir." Fill with its user's 3 doses of Giant Wasp Venom: the reservoir holds 3, the venom gone
        // from the inventory. Poison, the creature hit targeted: the venom's save card at it (the ability module's), 2 doses left.
        async b4G3LancetReservoir(scene) {
            await h.clearSquares(scene, [[10, 10], [11, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Lancet Duelist", { type: "character", x: 10, y: 10, level: 5 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Lancet Victim", { x: 11, y: 10, alliance: "opposition" });
            const lancet = await h.give(user, "Reaper's Lancet");
            await lancet.update(held(1));
            const venom = await h.give(user, "Giant Wasp Venom");
            await venom.update({ "system.quantity": 3 });
            await userToken.object?.control?.();
            const { applyReservoir } = await script("reservoir.js");
            const record = () => user.items.get(lancet.id)?.getFlag(h.NS, "reservoir");
            let card = await activated(lancet, 0, "reservoir", "the reservoir card");
            const pick = (stateOf(card).poisons ?? []).findIndex((entry) => entry.name === "Giant Wasp Venom");
            h.assert(pick >= 0, `the venom offered (${JSON.stringify(stateOf(card).poisons)})`);
            await applyReservoir(current(card), { action: "fill", pick });
            await h.until(() => record()?.doses === 3 && record().poison?.name === "Giant Wasp Venom", `3 doses in it (${JSON.stringify(record() ?? null)})`, { timeout: 8000 });
            h.assert(!user.items.get(venom.id), "the doses taken from the inventory");
            card = await activated(lancet, 0, "reservoir", "the reservoir card again");
            const since = Date.now();
            await applyReservoir(current(card), { action: "poison", targets: [foeToken.uuid] });
            const save = await h.messageAfter(since, (message) => Boolean(abilityState(message)) && aimsAt(foe)(message), { what: "the venom's save card at the creature" });
            await h.until(() => record()?.doses === 2, `2 doses left (${JSON.stringify(record() ?? null)})`, { timeout: 8000 });
            h.assert(resultsOf(card).some((line) => /Giant Wasp Venom \(2 doses left\)/.test(line)), `its line (${JSON.stringify(resultsOf(card))})`);
            return { card: save.id, statistic: abilityState(save)?.plan?.resolution?.check?.statistic ?? null };
        },

        // The Hollow Star's summon (scripts/creature-pick.js's rarity): "summon a common aberration of 3rd level or lower". The pick's list (its
        // DialogV2) offers only common aberrations of level 3 or lower from PF2e's bestiaries — none uncommon or rare — and cancelled, nothing made.
        async b4G3HollowStarPick(scene) {
            await h.clearSquares(scene, [[14, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Hollow Star Bearer", { type: "character", x: 14, y: 14, level: 9 });
            const star = await h.give(user, "The Hollow Star");
            await star.update(held(1));
            await userToken.object?.control?.();
            const before = new Set(scene.tokens.map((token) => token.id));
            const dialog = () => [...foundry.applications.instances.values()].find((app) => app.constructor.name === "DialogV2" && app.title === "The Hollow Star" && app.state !== app.constructor.RENDER_STATES?.CLOSED);
            // (The activation waits for the pick: not awaited until it's answered.)
            const pending = live().activate(star.uuid, 2).then(() => null, (error) => error?.message ?? String(error));
            try {
                await h.until(() => dialog()?.element?.querySelector?.("select[name=creature] option"), "the creature pick's list", { timeout: 20000 });
                const offered = [...dialog().element.querySelectorAll("select[name=creature] option")].map((option) => option.value);
                const { CORE_PACKS } = await import(`/modules/${ABILITY}/src/compiler/gm-fallback.js`);
                const rows = [];
                for (const pack of game.packs.filter((entry) => entry.documentName === "Actor" && entry.metadata.packageName === "pf2e" && CORE_PACKS.has(entry.metadata.name))) {
                    const index = await pack.getIndex({ fields: ["system.details.level.value", "system.traits.value", "system.traits.rarity", "type"] });
                    for (const entry of index) rows.push({ uuid: entry.uuid ?? `Compendium.${pack.collection}.Actor.${entry._id}`, name: entry.name, level: Number(entry.system?.details?.level?.value), traits: entry.system?.traits?.value ?? [], rarity: entry.system?.traits?.rarity ?? "common" });
                }
                const byUuid = new Map(rows.map((row) => [row.uuid, row]));
                const wrong = offered.filter((uuid) => {
                    const row = byUuid.get(uuid);
                    return !row || row.rarity !== "common" || !row.traits.includes("aberration") || !(row.level <= 3);
                });
                h.assert(offered.length && !wrong.length, `only common aberrations of level 3 or lower (${offered.length} offered; wrong: ${wrong.map((uuid) => byUuid.get(uuid)?.name ?? uuid).join(", ")})`);
                const rare = rows.filter((row) => row.traits.includes("aberration") && row.level <= 3 && row.rarity !== "common");
                h.assert(!rare.some((row) => offered.includes(row.uuid)), "no uncommon or rare one offered");
                dialog().element.querySelector('button[data-action="cancel"]')?.click();
                await h.until(() => !dialog(), "the pick cancelled", { timeout: 5000 });
                const result = await pending;
                await h.wait(500);
                h.assert(!scene.tokens.some((token) => !before.has(token.id)), "nothing made once cancelled");
                return { offered: offered.length, rareLeftOut: rare.map((row) => row.name).slice(0, 5), result };
            } finally {
                if (dialog()) await dialog().close().catch(() => null);
                await pending;
            }
        },

        // Guiding Star Orb (Heroic)'s Embed Location (src/live/embedded-places.js, scripts/embedded-places.js): "can have up to three locations
        // embedded at a time; if this activity is used a fourth time, the new location replaces the oldest stored one." Embedded at four squares in
        // turn: the orb keeps the last three (this scene, their squares in order), and the fourth card says it replaces the oldest.
        async b4G3OrbEmbedPlaces(scene) {
            await h.clearSquares(scene, [[1, 16], [3, 16], [5, 16], [7, 16]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Orb Wayfinder", { type: "character", x: 1, y: 16, level: 20 });
            const orb = await h.give(user, "Guiding Star Orb (Heroic)");
            await orb.update({ ...held(1), "system.equipped.invested": true });
            const embed = await activationIndex(orb, "Embed Location");
            let last = null;
            for (const x of [1, 3, 5, 7]) {
                if (squareOf(userToken) !== `${x},16`) await teleport(userToken, x, 16);
                await h.until(() => squareOf(userToken) === `${x},16`, `at square ${x},16`, { timeout: 5000 });
                const since = Date.now();
                await live().activate(orb.uuid, embed);
                last = await h.messageAfter(since, (message) => /place is embedded/.test(text(message)), { what: `the card at square ${x},16` });
            }
            const places = user.items.get(orb.id)?.getFlag(h.NS, "embeddedPlaces") ?? [];
            h.assert(places.length === 3 && JSON.stringify(places.map((place) => place.x)) === JSON.stringify([300, 500, 700]) && places.every((place) => place.scene === scene.id), `the last three kept, oldest gone (${JSON.stringify(places)})`);
            h.assert(/replaces the oldest/.test(text(last)), `the fourth card's words (${text(last)})`);
            return { places };
        }
    };
};
