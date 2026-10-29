// The fifth batch's PF2e leftovers live cases (2026-10-29): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the items whose live play is new code (the merge 692ebe8, docs/mechanics.md "The 2026-10-28 batch's leftovers"): Bomb Snare's ways read
// from PF2e's bombs indexed at ready (scripts/main.js bombIndex) with a direct hit's riders after the burst (a follow-up save, an Escape-ended
// penalty), Pistol of Wonder's table rows rolled again and played as lines (scripts/table.js row.again, row.lines), its rolled cast time
// (scripts/cast-duration.js castDuration.valueRoll) and its marked bullet, the fulcrum lenses' one possession (scripts/possession.js: the
// user's Effect handed over, the creature's taken back when it ends), the structure card's placed structures with commands and ends
// (scripts/structure.js: Instant Fortress, Warding Escutcheon, Testudo Shield), Cube of Force's faces for their times and its walls kept as a
// structure record (scripts/cube.js placedRecord), Kraken Bottle's ink zone whose poison is the bottle's own (src/live/zone-afflictions.js), and
// Feather Token (Whip)'s own-numbers whip, its Strike at a prone target and its vanishing (scripts/poisons.js selfFighting.own/vanishes,
// src/live/if-target.js conditions/instead).
// Skipped as covered: Slithermaw's Bane (base) — its Heroic grade's reading now (b4-1's b4G1TerrainAdaptationRest plays the same ways card and
// until-rest Effects); Lesser Cube of Nex — Cube of Nex's reading now (b4-3's cube cases); Hellfire Boots' trail — moving.mjs's
// movingHellfireTrail; Octopus Bottle — the same bottled-grasp reading as Kraken Bottle's (b2-visibility's save then teleport).

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
const ENV = "pf2e-automatic-environment-resolution";
const SIZE = 100;
// (PF2e's own documents these cases need.)
const OCHRE_EFFECT = "Compendium.pf2e.equipment-effects.Item.5KXsyN9J78glG25I";
const KRAKEN = "Compendium.pf2e.equipment-srd.Item.lu3kPHtKZTHPx4Fx";
const WAITS = "activationRecharges";

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const current = (message) => game.messages.get(message.id) ?? message;
    const text = (message) => String(current(message)?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const abilityState = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? message.flags?.[ABILITY]?.card;
    const checkOf = (message) => abilityState(message)?.plan?.resolution?.check ?? {};
    const targetUuidsOf = (message) => (abilityState(message)?.targets ?? []).flatMap((target) => [target.actorUuid, target.tokenUuid, target.uuid]).filter(Boolean);
    const aimsAt = (actor) => (message) => h.abilitySaveCard(message) && targetUuidsOf(message).includes(actor.uuid);
    const degreeOf = (message, actor) => (abilityState(message)?.targets ?? []).find((target) => target.actorUuid === actor.uuid)?.degree ?? null;
    const abilityCardsSince = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message));
    const effectNames = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditionNames = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${Number.isFinite(condition.value) ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const errorOf = (promise) => promise.then(() => null, (error) => error?.message ?? String(error));
    const squareOf = (token) => `${Math.round(Number(token.x) / SIZE)},${Math.round(Number(token.y) / SIZE)}`;
    const sourceOf = (item) => item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? null;
    const zonesNamed = (scene, pattern) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone && pattern.test(`${region.name ?? ""} ${region.flags[ABILITY].zone.itemName ?? ""}`));
    const zonesOf = (scene, item) => scene.regions.filter((region) => region.flags?.[ABILITY]?.zone?.itemUuid === item.uuid);
    const envApi = () => game.modules.get(ENV)?.api ?? null;
    const assertEnv = () => h.assert(game.modules.get(ENV)?.active && typeof envApi()?.placeStructure === "function" && typeof envApi()?.placedStructures === "function", "PF2e Automatic Environment Resolution active in pftest, with api.placeStructure and placedStructures");
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.active && typeof game.modules.get(SPELLS).api?.castFromItem === "function", "the spell module (pf2e-automatic-resolution) active, its castFromItem there");
    // (A move a zone must see — its enter and exit events —, as the snare cases in tools/live-check.mjs make it.)
    const walk = async (token, x, y) => {
        await token.update({ x: x * SIZE, y: y * SIZE }, { animate: false });
        await h.until(() => token.x === x * SIZE && token.y === y * SIZE, `${token.name} walked to ${x},${y}`, { timeout: 8000 });
    };
    // (PF2e's item from its pack, with its compendium source kept as a drag from the compendium keeps it — the zone's affliction names it.)
    async function giveFromPack(actor, name, packId = "pf2e.equipment-srd") {
        const pack = game.packs.get(packId);
        h.assert(pack, `No pack ${packId}.`);
        const entry = (await pack.getIndex()).find((row) => row.name === name);
        h.assert(entry, `${name} isn't in ${packId}.`);
        const document = await pack.getDocument(entry._id);
        const source = game.items?.fromCompendium ? game.items.fromCompendium(document) : document.toObject();
        delete source._id;
        foundry.utils.setProperty(source, "_stats.compendiumSource", document.uuid);
        foundry.utils.setProperty(source, "flags.core.sourceId", document.uuid);
        const [item] = await actor.createEmbeddedDocuments("Item", [source]);
        return item;
    }
    // (An item's activation → the first card of that kind after it.)
    const activated = async (item, index, kind, what) => {
        const since = Date.now();
        await live().activate(item.uuid, index);
        return h.messageAfter(since, h.itemCard(kind), { what });
    };
    // (Dice that come up as given, one roll after another — [face, faces] each, the last kept for any more —, while fn runs: Foundry's die face
    // is ceil((1 − r) × faces), as h.withDie's.)
    async function withFaces(rolls, fn) {
        const random = CONFIG.Dice.randomUniform;
        const queue = rolls.map(([face, faces]) => 1 - face / faces + 1e-9);
        const last = queue.at(-1);
        CONFIG.Dice.randomUniform = () => (queue.length ? queue.shift() : last);
        try {
            return await fn();
        } finally {
            CONFIG.Dice.randomUniform = random;
        }
    }
    // (The GM's whisper saying it's used again inside its wait or past its frequency, after since.)
    const warningAfter = (since, name, pattern, what) => h.messageAfter(since, (message) => (message.whisper ?? []).length > 0 && String(message.content ?? "").includes(name) && pattern.test(text(message)), { what, timeout: 8000 });

    // PF2e's ChoiceSet prompt open now (not by its rendered flag — a hidden pane never draws it): answered with its first choice.
    const promptOpen = () => [...foundry.applications.instances.values()].find((app) => Array.isArray(app.choices) && typeof app.resolveSelection === "function" && app.state !== app.constructor.RENDER_STATES?.CLOSED);
    async function answerPrompt() {
        const app = promptOpen();
        if (!app) return null;
        const choice = app.choices[0] ?? null;
        app.selection = choice;
        await app.close();
        return String(choice?.value ?? "(none)");
    }
    // The spell module's cast card resolved (as tools/live-cases/senses.mjs resolveSpellCard): its Resolve, its caster-choices dialog applied,
    // its "<Spell> — Apply Effect" confirmation's OK and PF2e's prompts, until test passes.
    async function resolveSpellCard(cast, test, { timeout = 15000 } = {}) {
        const clicked = new Set();
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            if (test()) return;
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
            await answerPrompt();
            await h.wait(200);
        }
        throw new Error(`Not the spell's Effect within ${timeout / 1000} seconds (Resolve ${clicked.has("resolve") ? "pressed" : "never there"}).`);
    }
    // (The dialogs and prompts opened since then closed: one left open fails the next case.)
    const openApps = () => new Set([...foundry.applications.instances.values()].filter((app) => app.constructor.name === "DialogV2" || (Array.isArray(app.choices) && typeof app.resolveSelection === "function")));
    const closeNew = async (before) => {
        for (const app of openApps()) if (!before.has(app) && app.state !== app.constructor.RENDER_STATES?.CLOSED) await app.close().catch(() => null);
    };

    // Bomb Snare set: its ways card (PF2e's bombs as indexed live at ready), the way of that bomb picked, its square placed (the click stood in
    // for, as tools/live-check.mjs's shrapnelBurst does) and snapped to the grid; a walker and a neighbour east of it. → what the case needs.
    async function setBombSnare(scene, { name, x, y, bomb }) {
        const squares = [];
        for (let dx = 0; dx <= 7; dx++) for (let dy = -1; dy <= 1; dy++) squares.push([x + dx, y + dy]);
        await h.clearSquares(scene, squares);
        const { actor: setter, token: setterToken } = await h.creature(scene, `${name} Setter`, { type: "character", x, y, level: 6 });
        const { actor: walker, token: walkerToken } = await h.creature(scene, `${name} Walker`, { x: x + 7, y, alliance: "opposition", hp: 200, save: 8 });
        const snare = await h.give(setter, "Bomb Snare");
        await setterToken.object?.control?.();
        const since = Date.now();
        await snare.consume();
        const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "Bomb Snare's ways card" });
        const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
        // (PF2e's 30 damaging moderate bombs: the index scripts/main.js builds at ready from its equipment pack — none without it.)
        h.assert(names.length >= 30, `its bombs read from PF2e's index at ready (${names.length} ways: ${names.slice(0, 4).join(" | ")}…)`);
        const index = names.findIndex((entry) => entry.startsWith(`${bomb} (Moderate)`));
        h.assert(index >= 0, `${bomb} (Moderate) among its ways (${names.join(" | ")})`);
        const square = () => zonesNamed(scene, /Bomb Snare/).find((region) => region.flags[ABILITY].zone.zone?.once);
        await live().apply(ways.id, { choice: index });
        await h.until(() => square(), "the snare's Region", { timeout: 8000 });
        // (On the grid: the stand-in placement leaves it half a square off, which a GM's placing doesn't.)
        const placed = square().shapes[0];
        await square().update({ shapes: [{ ...(placed.toObject?.() ?? placed), x: Math.round(placed.x / SIZE) * SIZE, y: Math.round(placed.y / SIZE) * SIZE }] });
        await h.wait(500);
        const shape = square().shapes[0];
        const at = { x: Math.round(shape.x / SIZE), y: Math.round(shape.y / SIZE) };
        const zone = square().flags[ABILITY].zone.zone;
        const { actor: near, token: nearToken } = await h.creature(scene, `${name} Neighbour`, { x: at.x + 1, y: at.y, alliance: "opposition", hp: 200, save: 8 });
        const { actor: far, token: farToken } = await h.creature(scene, `${name} Far`, { x: at.x + 3, y: at.y, alliance: "opposition", hp: 200, save: 8 });
        return { setter, walker, walkerToken, near, nearToken, far, farToken, at, zone, square, ways };
    }

    return {
        // Bomb Snare with Dwarven Daisy (src/compiler/bomb-snare.js; scripts/main.js's bombs index at ready; the ability module's zone.burst; a
        // row's followUps): its ways card offers PF2e's moderate bombs (30, from the index the module builds at ready). Dwarven Daisy's square:
        // the burst's Reflex DC 24 at three times the bomb's direct hit (6d6 fire); a walker set off by stepping in, its neighbour 5 feet away on the
        // one card, a creature 15 feet off not. Both fail (save +8, every die a 10: 18), each takes 18 (6d6 at 3s); then the core's follow-up save
        // — the daisy's own Fortitude DC 18 — on a card of its own at each of them; the walker's failed (a 5: 13) leaves it Dazzled.
        async b5LeftoversBombSnareDaisy(scene) {
            return h.unpaused(async () => {
                const placing = canvas.regions.placeRegion;
                canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
                try {
                    const { walker, walkerToken, near, far, at, zone, square } = await setBombSnare(scene, { name: "Daisy Snare", x: 1, y: 3, bomb: "Dwarven Daisy" });
                    const burst = zone.burst?.plan?.resolution;
                    h.assert(burst?.check?.statistic === "reflex" && Number(burst.check.against?.value) === 24, `the burst's Reflex DC 24 (${JSON.stringify(burst?.check ?? null)})`);
                    const components = (burst.sharedDamage?.components ?? []).map((component) => `${component.formula} ${component.type}`);
                    h.assert(JSON.stringify(components) === '["6d6 fire"]', `three times the daisy's direct hit: 6d6 fire (${JSON.stringify(components)})`);
                    h.assert((burst.outcomes?.failure?.followUps ?? []).some((follow) => follow.check?.statistic === "fortitude" && Number(follow.check.against?.value) === 18), `the daisy's own Fortitude DC 18 after a failure (${JSON.stringify(burst.outcomes?.failure?.followUps?.map((follow) => follow.check) ?? null)})`);
                    const before = { walker: hp(walker), near: hp(near), far: hp(far) };
                    let since = Date.now();
                    await walk(walkerToken, at.x, at.y);
                    const card = await h.messageAfter(since, (message) => aimsAt(walker)(message) && checkOf(message).statistic === "reflex", { what: "the burst's Reflex card", timeout: 10000 });
                    h.assert(aimsAt(near)(card) && !aimsAt(far)(card), `the walker and its neighbour, not the one 15 feet off (${JSON.stringify(targetUuidsOf(card).map((uuid) => fromUuidSync(uuid)?.name ?? uuid))})`);
                    since = Date.now();
                    await h.withDie(10, async () => {
                        await h.rollAndApply(card);
                        await h.until(() => hp(walker) < before.walker && hp(near) < before.near, `both burned (${hp(walker)}, ${hp(near)})`, { timeout: 10000 });
                    });
                    h.assert(degreeOf(card, walker) === "failure" && degreeOf(card, near) === "failure", `both fail (${degreeOf(card, walker)}, ${degreeOf(card, near)})`);
                    h.assert(before.walker - hp(walker) === 18 && before.near - hp(near) === 18, `6d6 at 3s, 18 each (${before.walker - hp(walker)}, ${before.near - hp(near)})`);
                    h.assert(hp(far) === before.far, "nothing for the one 15 feet off");
                    const daisy = (actor) => (message) => aimsAt(actor)(message) && checkOf(message).statistic === "fortitude" && Number(checkOf(message).against?.value) === 18;
                    const follow = await h.messageAfter(since, daisy(walker), { what: "the follow-up Fortitude DC 18 card at the walker", timeout: 10000 });
                    await h.messageAfter(since, daisy(near), { what: "the follow-up Fortitude DC 18 card at the neighbour", timeout: 10000 });
                    h.assert(!aimsAt(near)(follow), "the follow-up is each creature's own card");
                    await h.withDie(5, async () => {
                        await h.rollAndApply(follow);
                        await h.until(() => walker.hasCondition("dazzled"), `the walker Dazzled after its failed Fortitude save (${conditionNames(walker)})`, { timeout: 10000 });
                    });
                    await h.until(() => !square(), "the snare spent", { timeout: 8000 });
                    return { damage: [before.walker - hp(walker), before.near - hp(near)], follow: degreeOf(follow, walker) };
                } finally {
                    canvas.regions.placeRegion = placing;
                    for (const region of zonesNamed(scene, /Bomb Snare/)) await region.delete().catch(() => null);
                }
            });
        },

        // Bomb Snare with Goo Grenade (bomb-snare.js's riders: a penalty with modifier.escape, a note Effect with its own escape, persistent damage
        // once): set off and failed (every die a 10: 18 against DC 24), the walker has PF2e's −5 circumstance penalty to all its Speeds and the
        // "Clinging goo" note Effect, each flagged by the ability module to end on an Escape at DC 17, and 2 persistent acid. Its Escape at DC 17 (a
        // 20 on the die): both gone, a chat line saying so.
        async b5LeftoversBombSnareGoo(scene) {
            return h.unpaused(async () => {
                const placing = canvas.regions.placeRegion;
                canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
                try {
                    const { walker, walkerToken, at } = await setBombSnare(scene, { name: "Goo Snare", x: 1, y: 7, bomb: "Goo Grenade" });
                    let since = Date.now();
                    await walk(walkerToken, at.x, at.y);
                    const card = await h.messageAfter(since, (message) => aimsAt(walker)(message) && checkOf(message).statistic === "reflex", { what: "the burst's Reflex card", timeout: 10000 });
                    const before = hp(walker);
                    const penalty = () => walker.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("all-speeds") && Number(rule.value) === -5 && rule.type === "circumstance"));
                    const goo = () => walker.itemTypes.effect.find((effect) => /Clinging goo$/.test(effect.name));
                    const acid = () => walker.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "acid");
                    await h.withDie(10, async () => {
                        await h.rollAndApply(card);
                        await h.until(() => hp(walker) < before && penalty() && goo(), `the direct hit's rest on the walker (${hp(walker)} of ${before}; ${effectNames(walker)})`, { timeout: 10000 });
                    });
                    h.assert(degreeOf(card, walker) === "failure", `a failure (${degreeOf(card, walker)})`);
                    h.assert(Number(penalty().flags?.[ABILITY]?.escape?.dc) === 17, `the Speed penalty ends on an Escape at DC 17 (${JSON.stringify(penalty().flags?.[ABILITY] ?? {})})`);
                    h.assert(Number(goo().flags?.[ABILITY]?.escape?.dc) === 17, `the "Clinging goo" note ends on an Escape at DC 17 too (${JSON.stringify(goo().flags?.[ABILITY] ?? {})})`);
                    await h.until(() => acid(), `2 persistent acid (${conditionNames(walker)})`, { timeout: 8000 });
                    h.assert(/^2$/.test(String(acid().system.persistent.formula).trim()), `its 2 persistent acid (${acid().system.persistent.formula})`);
                    since = Date.now();
                    // (PF2e's Escape at the snare's DC, no creature targeted: its context carries DC 17, the ability module's match.)
                    await h.target();
                    const action = game.pf2e.actions.get?.("escape");
                    await h.withDie(20, async () => {
                        if (action) await action.use({ actors: [walker], event: h.shift(), difficultyClass: { value: 17 } });
                        else await game.pf2e.actions.escape({ actors: [walker], event: h.shift(), difficultyClass: { value: 17 } });
                        await h.messageAfter(since, (message) => message.speaker?.actor === walker.id && (message.flags?.pf2e?.context?.options ?? []).includes("action:escape"), { what: "PF2e's Escape roll", timeout: 8000 });
                    });
                    await h.until(() => !penalty() && !goo(), `both ended by the Escape (${effectNames(walker)})`, { timeout: 10000 });
                    const line = await h.messageAfter(since, (message) => /escapes:/.test(text(message)) && message.speaker?.actor === walker.id, { what: "the ability module's line of what the Escape ended" });
                    return { lost: before - hp(walker), line: text(line) };
                } finally {
                    canvas.regions.placeRegion = placing;
                    for (const region of zonesNamed(scene, /Bomb Snare/)) await region.delete().catch(() => null);
                }
            });
        },

        // Pistol of Wonder's 100 (src/compiler/wonder-table.js row.again; scripts/table.js's rolls again and row.lines): its Wonder Shot's table card
        // (its 1d4 hours' wait whispered as it's used). Applied at 100 (the harness's total): two more d% rolls are posted, each played in turn —
        // the first a 30 (its Heroism row: its own card follows, named for the row), the second a 10 (the flag row: its lines on the table card,
        // no card). Used again inside its wait: the GM's whisper.
        async b5LeftoversWonderAgain(scene) {
            await h.clearSquares(scene, [[2, 11], [5, 11]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Wonder Gunner", { type: "character", x: 2, y: 11, level: 13 });
            await h.creature(scene, "Wonder Orc", { x: 5, y: 11, alliance: "opposition", hp: 200 });
            const pistol = await h.give(user, "Pistol of Wonder");
            await pistol.update(held(1));
            await userToken.object?.control?.();
            let since = Date.now();
            const card = await activated(pistol, 0, "table", "Wonder Shot's table card");
            const rows = stateOf(card).plan.table.rows ?? [];
            const hundred = rows.find((row) => row.low === 100);
            h.assert(hundred?.again?.count === 2 && hundred.again.skip === 100, `the 100 rolls twice more (${JSON.stringify(hundred?.again ?? null)})`);
            await warningAfter(since, "Pistol of Wonder", /usable again in \d+ hours? \(rolled 1d4 = [1-4]\)/, "its 1d4 hours' wait whispered");
            since = Date.now();
            await withFaces([[30, 100], [10, 100]], () => live().apply(card.id, { total: 100 }));
            await h.until(() => stateOf(card)?.status === "applied", `the table card applied (${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            const again = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && /its table again \([12] of 2\)/.test(message.flavor ?? ""));
            h.assert(again.length === 2, `two more d% rolls posted (${again.map((message) => `${message.flavor}: ${message.rolls?.[0]?.total}`).join("; ") || "none"})`);
            h.assert(JSON.stringify(again.map((message) => Number(message.rolls?.[0]?.total))) === "[30,10]", `rolled 30 then 10 (${again.map((message) => message.rolls?.[0]?.total)})`);
            const results = resultsOf(card);
            const at = (pattern) => results.findIndex((line) => pattern.test(line));
            h.assert(at(/^100: /) === 0 && at(/^30: /) > 0 && results[at(/^30: /) + 1] === "Its card follows." && at(/^10: /) > at(/^30: /) && /Bang!/.test(results[at(/^10: /) + 1] ?? ""), `100, then 30 with its card, then 10 with its lines (${JSON.stringify(results)})`);
            const heroism = await h.messageAfter(since, (message) => Boolean(message.getFlag(h.NS, "card")) && message.id !== card.id && /\(26–30\)$/.test(message.getFlag(h.NS, "card").item?.name ?? ""), { what: "the 26–30 row's own card" });
            h.assert(!game.messages.contents.some((message) => Number(message.timestamp ?? 0) >= since && /\(7–13\)$/.test(message.getFlag?.(h.NS, "card")?.item?.name ?? "")), "no card for the flag row: its lines only");
            since = Date.now();
            await live().activate(pistol.uuid, 0);
            await warningAfter(since, "Pistol of Wonder", /activated again, though it's usable again only in/, "the GM's whisper of its wait");
            return { results, heroism: heroism.getFlag(h.NS, "card").item.name };
        },

        // Pistol of Wonder's 36 (castDuration.valueRoll; scripts/cast-duration.js rememberCastDuration, src/live/cast-card.js lastsWords): the row's
        // Cloak of Colors cast card says "lasts 1d10 rounds"; cast on its user, the duration's 1d10 is rolled in the chat, the cast's mark is that
        // many rounds, and the spell's Effect on its user lasts that many rounds. (The spell module casts it: its dialogs answered as a GM does.)
        async b5LeftoversWonderCloakRolled(scene) {
            assertSpells();
            await h.clearSquares(scene, [[2, 13]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Cloak Gunner", { type: "character", x: 2, y: 13, level: 13 });
            const pistol = await h.give(user, "Pistol of Wonder");
            await pistol.update(held(1));
            await userToken.object?.control?.();
            const before = openApps();
            try {
                const table = await activated(pistol, 0, "table", "Wonder Shot's table card");
                let since = Date.now();
                await live().apply(table.id, { total: 36 });
                const card = await h.messageAfter(since, (message) => h.itemCard("cast")(message) && /\(36–37\)$/.test(stateOf(message)?.item?.name ?? ""), { what: "the 36–37 row's cast card" });
                const duration = stateOf(card).plan.castDuration ?? stateOf(card).plan.choices?.[0]?.castDuration ?? null;
                h.assert(duration?.valueRoll === "1d10" && duration.unit === "rounds", `its time rolled as it's cast: 1d10 rounds (${JSON.stringify(duration)})`);
                h.assert(/lasts 1d10 rounds/.test(text(card)), `the card says "lasts 1d10 rounds" (${text(card).slice(0, 300)})`);
                since = Date.now();
                await live().apply(card.id, {});
                const cast = await h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
                const rolled = await h.messageAfter(since, (message) => /Its time \(1d10 rounds\)/.test(message.flavor ?? ""), { what: "the duration's 1d10 in the chat", timeout: 10000 });
                const rounds = Number(rolled.rolls?.[0]?.total);
                h.assert(rounds >= 1 && rounds <= 10, `1d10 rolled (${rounds})`);
                await h.until(() => game.messages.get(cast.id)?.getFlag(h.NS, "castDuration"), "the cast's duration mark", { timeout: 8000 });
                const mark = game.messages.get(cast.id).getFlag(h.NS, "castDuration");
                h.assert(Number(mark.value) === rounds && mark.unit === "rounds", `its mark the rolled ${rounds} rounds (${JSON.stringify(mark)})`);
                const effect = () => user.itemTypes.effect.find((entry) => entry.system?.context?.origin?.item === mark.spellUuid || /Cloak of Colors/.test(entry.name));
                await resolveSpellCard(cast, () => Boolean(effect()));
                await h.until(() => Number(effect()?.system?.duration?.value) === rounds && effect().system.duration.unit === "rounds", `its Effect for ${rounds} rounds (${JSON.stringify(effect()?.system?.duration)})`, { timeout: 8000 });
                return { rounds, effect: effect().name };
            } finally {
                await closeNew(before);
            }
        },

        // Pistol of Wonder's 33 (the row's item card: plan.item.mark and a note Effect with PF2e's RollTwice): Applied with the orc targeted, its
        // user gets the mark Effect (PF2e's TokenMark at the orc) and the "A bullet with its name" note Effect, RollTwice keeping the higher on its
        // Strikes with the pistol at the marked creature. Loaded (PF2e's Reload, a round attached), its Strike at the orc rolls two d20s, the
        // higher kept; with PF2e's "remove expired effects" on, the note Effect is gone after that roll.
        async b5LeftoversWonderNamedBullet(scene) {
            await h.clearSquares(scene, [[2, 15], [5, 15]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Bullet Gunner", { type: "character", x: 2, y: 15, level: 13 });
            const { token: orcToken } = await h.creature(scene, "Bullet Orc", { x: 5, y: 15, alliance: "opposition", hp: 300, ac: 10 });
            const pistol = await h.give(user, "Pistol of Wonder");
            await pistol.update(held(1));
            await userToken.object?.control?.();
            const table = await activated(pistol, 0, "table", "Wonder Shot's table card");
            let since = Date.now();
            await live().apply(table.id, { total: 33 });
            const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && /\(33–35\)$/.test(stateOf(message)?.item?.name ?? ""), { what: "the 33–35 row's card" });
            await h.target();
            const refused = await errorOf(live().apply(card.id, { targets: [] }));
            h.assert(/Target the one creature/.test(refused ?? ""), `refused with no creature targeted (${refused})`);
            await live().apply(card.id, { targets: [orcToken.uuid] });
            const mark = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.mark === "pistol-of-wonder-mark");
            const bullet = () => user.itemTypes.effect.find((effect) => /A bullet with its name$/.test(effect.name));
            await h.until(() => mark() && bullet(), `the mark and the note Effect on its user (${effectNames(user)})`, { timeout: 8000 });
            h.assert((mark().system.rules ?? []).some((rule) => rule.key === "TokenMark" && rule.uuid === orcToken.uuid), `PF2e's TokenMark at the orc (${JSON.stringify(mark().system.rules)})`);
            const twice = (bullet().system.rules ?? []).find((rule) => rule.key === "RollTwice");
            h.assert(twice?.keep === "higher" && JSON.stringify(twice.predicate ?? []).includes("target:mark:pistol-of-wonder-mark"), `RollTwice keeping the higher at the marked creature (${JSON.stringify(twice ?? null)})`);
            const rounds = await h.give(user, "Rounds (Flintlock Pistol)");
            await pistol.attach(rounds, { quantity: 1, stack: true });
            const loaded = () => [...(user.items.get(pistol.id)?.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity ?? entry.system?.quantity) || 0), 0);
            await h.until(() => loaded() === 1, `the pistol loaded (${loaded()})`, { timeout: 5000 });
            await h.target(orcToken);
            const { attack } = await h.strike(user, pistol);
            const die = attack.rolls?.[0]?.dice?.[0];
            h.assert(Number(die?.number) === 2 && (die?.modifiers ?? []).some((modifier) => /^kh/.test(String(modifier))), `two d20s, the higher kept (${attack.rolls?.[0]?.formula})`);
            if (game.pf2e.settings?.automation?.removeEffects) await h.until(() => !bullet(), `the note Effect gone after the roll (${effectNames(user)})`, { timeout: 8000 });
            return { formula: attack.rolls?.[0]?.formula, removeEffects: Boolean(game.pf2e.settings?.automation?.removeEffects), refused };
        },

        // Ochre Fulcrum Lens's possession (src/compiler/possession.js plan.possess { effect }; scripts/possession.js possessOnHit/possessionEnded):
        // held and invested, its user with PF2e's Effect: Ochre Fulcrum Lens. Its +21 attack card at an orc (AC 1, a 10 on the die: a hit): the
        // orc has the lens's Effect and the possession's note Effect; the lens is uninvested and flagged possessing (the orc, the lens's Effect),
        // its user's own Effect of the lens gone, a line says so; its other activation refused. The note Effect deleted: a line that the essence
        // is back, the flag gone, the orc's Effect of the lens gone with it; invested again, its other activation posts its card.
        async b5LeftoversOchrePossessionEnds(scene) {
            await h.clearSquares(scene, [[9, 11], [10, 11]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Ochre Bearer", { type: "character", x: 9, y: 11, level: 11 });
            const { actor: orc, token: orcToken } = await h.creature(scene, "Ochre Orc", { x: 10, y: 11, ac: 1, hp: 200, alliance: "opposition" });
            const lens = await h.give(user, "Ochre Fulcrum Lens");
            await lens.update({ ...held(1), "system.equipped.invested": true });
            const template = await fromUuid(OCHRE_EFFECT).catch(() => null);
            h.assert(template, "PF2e's Effect: Ochre Fulcrum Lens");
            const source = game.items?.fromCompendium ? game.items.fromCompendium(template) : template.toObject();
            delete source._id;
            foundry.utils.setProperty(source, "_stats.compendiumSource", OCHRE_EFFECT);
            await user.createEmbeddedDocuments("Item", [source]);
            const lensEffectOn = (actor) => () => actor.itemTypes.effect.find((effect) => sourceOf(effect) === OCHRE_EFFECT);
            const own = lensEffectOn(user);
            const lent = lensEffectOn(orc);
            await h.until(own, `its user's Effect: Ochre Fulcrum Lens (${effectNames(user)})`, { timeout: 5000 });
            const item = () => user.items.get(lens.id);
            await userToken.object?.control?.();
            const card = await activated(lens, 1, "expose", "the possession's card");
            let since = Date.now();
            await live().apply(card.id, { targets: [orcToken.uuid] });
            const attack = await h.messageAfter(since, aimsAt(orc), { what: "the +21 attack card at the orc" });
            h.assert(Number(checkOf(attack).modifier) === 21, `+21 (${JSON.stringify(checkOf(attack))})`);
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(attack));
            const note = () => orc.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "air-possessed-by:ochre-fulcrum-lens"));
            await h.until(() => lent() && note(), `the orc has the lens's Effect and the possession's note (${effectNames(orc)})`, { timeout: 10000 });
            await h.until(() => item()?.system?.equipped?.invested === false && item()?.getFlag(h.NS, "possessing"), `the lens uninvested and possessing (${item()?.system?.equipped?.invested}; ${JSON.stringify(item()?.flags?.[h.NS] ?? {})})`, { timeout: 8000 });
            const flag = item().getFlag(h.NS, "possessing");
            h.assert(flag.actorUuid === orc.uuid && flag.option === "air-possessed-by:ochre-fulcrum-lens" && flag.effect === OCHRE_EFFECT, `flagged for the orc and the lens's Effect (${JSON.stringify(flag)})`);
            await h.until(() => !own(), `its user's own Effect of the lens gone (${effectNames(user)})`, { timeout: 8000 });
            const said = await h.messageAfter(since, (message) => /its essence possesses/.test(text(message)) && /no longer invested in it, its benefits gone/.test(text(message)), { what: "the line that its user is no longer invested" });
            const refused = await errorOf(live().activate(lens.uuid, 0));
            h.assert(/its essence possesses another creature/.test(refused ?? ""), `its other activation refused (${refused})`);
            since = Date.now();
            await note().delete();
            await h.messageAfter(since, (message) => /the possession has ended, and its essence is back/.test(text(message)), { what: "the line that the essence is back" });
            await h.until(() => !item()?.getFlag(h.NS, "possessing"), "the possessing flag gone", { timeout: 8000 });
            await h.until(() => !lent(), `the orc's Effect of the lens gone with it (${effectNames(orc)})`, { timeout: 8000 });
            await lens.update({ "system.equipped.invested": true });
            since = Date.now();
            await live().activate(lens.uuid, 0);
            const back = await h.messageAfter(since, (message) => Boolean(message.getFlag(h.NS, "card")), { what: "its other activation's card once the essence is back" });
            return { said: text(said), refused, back: stateOf(back)?.kind ?? null };
        },

        // Instant Fortress (src/compiler/placed-structures.js; src/live/structure-card.js sideFacing, commandsOf; scripts/structure.js
        // commandStructure, endPlaced): its structure card placed west of its user (the click given as the destination): the environment
        // module's 20-foot square of high-grade adamantine walls, a creature inside pushed out, its door on the east side — the one facing its
        // user —, shut and not locked (DC 40 to Force Open or Pick). The card stays open for its commands: "Shut and lock its door" locks it,
        // "Open its door" opens it (the fortress still standing). "Fold it back into a cube": its walls gone, the item's record gone, its card
        // applied with its lines, its activation's 4-hour wait set; activated again, the GM's whisper of that wait.
        async b5LeftoversInstantFortress(scene) {
            assertEnv();
            const env = envApi();
            const square = (left, top, across) => Array.from({ length: across * across }, (_, at) => [left + (at % across), top + Math.floor(at / across)]);
            await h.clearSquares(scene, [[14, 10], ...square(7, 7, 6)]);
            const { actor: user, token: userToken } = await h.creature(scene, "Fortress Tosser", { type: "character", x: 14, y: 10, level: 16 });
            const { token: bystander } = await h.creature(scene, "Fortress Bystander", { x: 9, y: 9 });
            const fortress = await h.give(user, "Instant Fortress");
            await fortress.update(held(1));
            await userToken.object?.control?.();
            const ours = () => (env.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid === fortress.uuid);
            const record = () => user.items.get(fortress.id)?.getFlag(h.NS, "structure") ?? null;
            const wallsOf = (id) => scene.walls.filter((wall) => wall.flags?.[ENV]?.structure?.placed?.id === id);
            try {
                const card = await activated(fortress, 0, "structure", "the fortress's structure card");
                h.assert(stateOf(card).plan.structure?.door?.side === "facing" && Number(stateOf(card).plan.structure.door.command?.within) === 100, `its door facing its user, commanded within 100 feet (${JSON.stringify(stateOf(card).plan.structure?.door ?? null)})`);
                await live().apply(card.id, { choice: 0, destination: { x: 10 * SIZE, y: 10 * SIZE } });
                await h.until(() => stateOf(card)?.step === "placed" && ours().length === 1, `placed, the card kept open for its commands (${JSON.stringify({ step: stateOf(card)?.step, status: stateOf(card)?.status, results: resultsOf(card) })})`, { timeout: 10000 });
                h.assert(stateOf(card).status === "open", "the card still open once placed");
                const id = ours()[0].id;
                const walls = wallsOf(id);
                const door = walls.find((wall) => wall.door === CONST.WALL_DOOR_TYPES.DOOR);
                // (The 20-foot square round the click: 8 to 12 squares across and down; its east side at 12, its user at 14.)
                h.assert(door && door.c[0] === 12 * SIZE && door.c[2] === 12 * SIZE, `its door on the east side, facing its user (${JSON.stringify(door?.c ?? null)})`);
                h.assert(walls.filter((wall) => wall !== door).every((wall) => wall.flags[ENV].structure.material === "adamantine-high"), `high-grade adamantine walls (${walls.map((wall) => wall.flags[ENV].structure.material).join(", ")})`);
                h.assert(Number(door.ds) === CONST.WALL_DOOR_STATES.CLOSED && Number(door.flags[ENV].structure.forceDC) === 40 && Number(door.flags[ENV].structure.lockDC) === 40, `shut, not locked, DC 40 to Force Open or Pick (ds ${door.ds}; ${JSON.stringify({ force: door.flags[ENV].structure.forceDC, lock: door.flags[ENV].structure.lockDC })})`);
                const inside = (token) => token.x >= 8 * SIZE && token.x < 12 * SIZE && token.y >= 8 * SIZE && token.y < 12 * SIZE;
                await h.until(() => !inside(bystander), `the bystander pushed out (${squareOf(bystander)})`, { timeout: 5000 });
                h.assert(record()?.id === id && record().door === door.id && record().messageId === card.id && !record().endsAt, `the item's record: its id, its door, its card, no end of its own (${JSON.stringify(record())})`);
                // (Its commands, src/live/structure-card.js commandsOf: its door's two, then its end.)
                const commands = ["Open its door", "Shut and lock its door", "Fold it back into a cube"];
                h.assert(commands.every((label) => String(current(card).content ?? "").includes(label)), `its commands on the card (${text(card).slice(0, 300)})`);
                await live().apply(card.id, { choice: commands.indexOf("Shut and lock its door") });
                await h.until(() => Number(scene.walls.get(door.id)?.ds) === CONST.WALL_DOOR_STATES.LOCKED, `locked by its command (${scene.walls.get(door.id)?.ds})`, { timeout: 8000 });
                await live().apply(card.id, { choice: commands.indexOf("Open its door") });
                await h.until(() => Number(scene.walls.get(door.id)?.ds) === CONST.WALL_DOOR_STATES.OPEN, `opened by its command (${scene.walls.get(door.id)?.ds})`, { timeout: 8000 });
                await h.wait(1000);
                h.assert(ours().length === 1 && stateOf(card).status === "open", "still standing with its door open (only its fold ends it)");
                h.assert(resultsOf(card).some((line) => /slams shut and locks/.test(line)) && resultsOf(card).some((line) => /Its door opens/.test(line)), `its lines (${JSON.stringify(resultsOf(card))})`);
                const folded = Number(game.time.worldTime);
                await live().apply(card.id, { choice: commands.indexOf("Fold it back into a cube") });
                await h.until(() => stateOf(card)?.status === "applied" && !ours().length, `folded up: its walls gone, the card applied (${JSON.stringify({ placed: ours().length, results: resultsOf(card) })})`, { timeout: 10000 });
                h.assert(!wallsOf(id).length && !record(), `no walls nor record left (${wallsOf(id).length}; ${JSON.stringify(record())})`);
                h.assert(resultsOf(card).some((line) => /can't be activated again for 4 hours/.test(line)), `its wait's line (${JSON.stringify(resultsOf(card))})`);
                const waits = user.items.get(fortress.id)?.getFlag(h.NS, WAITS) ?? {};
                h.assert(Math.abs(Number(waits[0]) - folded - 4 * 3600) <= 5, `its activation waits 4 hours from its fold (${JSON.stringify(waits)}, folded at ${folded})`);
                const since = Date.now();
                await live().activate(fortress.uuid, 0);
                await warningAfter(since, "Instant Fortress", /activated again, though it's usable again only in 4 hours/, "the GM's whisper of its 4 hours");
                return { door: door.c, results: resultsOf(card), waits };
            } finally {
                for (const entry of ours()) await env.removeStructure(scene, entry.id).catch(() => null);
            }
        },

        // Warding Escutcheon (placed-structures.js; structure-card.js placedRecord whenOpened, opensOrBreaks; scripts/structure.js's updateWall
        // hook): its structure card's east–west way, the grid line under its user clicked: one locked stone door along it (Hardness 10, 40 Hit
        // Points, BT 20; DC 25 to Force Open or Pick), the card open with "End it", the item's record ending in an hour and as it's opened. The
        // door opened (Foundry's door state): its walls gone, the card applied ("Its door was opened"). Used again (once a day: the GM's whisper),
        // its north–south way: the door's breaking (the environment module's condition "broken") ends it the same way.
        async b5LeftoversWardingDoor(scene) {
            assertEnv();
            const env = envApi();
            await h.clearSquares(scene, [[5, 5], [5, 6], [7, 5], [8, 5]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Escutcheon Bearer", { type: "character", x: 5, y: 5, level: 9 });
            const shield = await h.give(user, "Warding Escutcheon");
            await shield.update(held(1));
            await userToken.object?.control?.();
            const ours = () => (env.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid === shield.uuid);
            const record = () => user.items.get(shield.id)?.getFlag(h.NS, "structure") ?? null;
            const doorOf = () => {
                const id = ours()[0]?.id;
                return id ? scene.walls.find((wall) => wall.flags?.[ENV]?.structure?.placed?.id === id && wall.door === CONST.WALL_DOOR_TYPES.DOOR) ?? null : null;
            };
            const placeDoor = async (choice, destination) => {
                const card = await activated(shield, 0, "structure", "the escutcheon's structure card");
                const placedAt = Number(game.time.worldTime);
                await live().apply(card.id, { choice, destination });
                await h.until(() => doorOf() && stateOf(card)?.step === "placed", `its door placed, the card kept open (${JSON.stringify({ placed: ours(), results: resultsOf(card) })})`, { timeout: 10000 });
                return { card, placedAt };
            };
            try {
                const first = await placeDoor(0, { x: 5.5 * SIZE, y: 6 * SIZE });
                const door = doorOf();
                h.assert(ours()[0].walls.length === 1, `one wall, the door itself (${ours()[0].walls.length})`);
                h.assert(door.c[1] === 6 * SIZE && door.c[3] === 6 * SIZE && Math.min(door.c[0], door.c[2]) === 5 * SIZE && Math.max(door.c[0], door.c[2]) === 6 * SIZE, `on the grid line clicked, 5 feet east–west (${JSON.stringify(door.c)})`);
                const state = door.flags[ENV].structure;
                h.assert(Number(door.ds) === CONST.WALL_DOOR_STATES.LOCKED && Number(state.stats?.hardness) === 10 && Number(state.stats?.hp) === 40 && Number(state.stats?.bt) === 20 && Number(state.lockDC) === 25 && Number(state.forceDC) === 25, `locked, the shield's numbers, DC 25 (${JSON.stringify({ ds: door.ds, stats: state.stats, lock: state.lockDC, force: state.forceDC })})`);
                h.assert(record()?.whenOpened === true && Math.abs(Number(record().endsAt) - first.placedAt - 3600) <= 5 && record().door === door.id, `its record: ended as it's opened, or in an hour (${JSON.stringify(record())})`);
                h.assert(/End it/.test(current(first.card).content ?? ""), "its End it on the card");
                await door.update({ ds: CONST.WALL_DOOR_STATES.OPEN });
                await h.until(() => !ours().length && !record() && stateOf(first.card)?.status === "applied", `gone as it's opened (${JSON.stringify({ placed: ours().length, record: record(), results: resultsOf(first.card) })})`, { timeout: 10000 });
                h.assert(resultsOf(first.card).some((line) => /Its door was opened: it's gone/.test(line)), `its line (${JSON.stringify(resultsOf(first.card))})`);
                const since = Date.now();
                const second = await placeDoor(1, { x: 8 * SIZE, y: 5.5 * SIZE });
                await warningAfter(since, "Warding Escutcheon", /activated again, though it's once per day/, "the GM's whisper of its once a day");
                const across = doorOf();
                h.assert(across.c[0] === 8 * SIZE && across.c[2] === 8 * SIZE, `north–south on the line clicked (${JSON.stringify(across.c)})`);
                await across.update({ [`flags.${ENV}.structure.condition`]: "broken" });
                await h.until(() => !ours().length && !record() && stateOf(second.card)?.status === "applied", `gone as it breaks (${JSON.stringify({ placed: ours().length, record: record(), results: resultsOf(second.card) })})`, { timeout: 10000 });
                h.assert(resultsOf(second.card).some((line) => /Its door is broken: it's gone/.test(line)), `its line (${JSON.stringify(resultsOf(second.card))})`);
                return { opened: resultsOf(first.card), broken: resultsOf(second.card) };
            } finally {
                for (const entry of ours()) await env.removeStructure(scene, entry.id).catch(() => null);
            }
        },

        // Testudo Shield's Tortoise Form (placed-structures.js; scripts/structure.js's updateWorldTime hook): its structure card's north–south way,
        // the grid line east of its user clicked: a barrier along it 15 feet long (Hardness 5, 20 Hit Points), see-through (no sight, light or
        // sound blocked; movement blocked), the card applied at once (nothing to command), the item's record ending in a minute. Its time up (the
        // record's end set a second off, the world's clock moved a second): its walls gone, the record gone, a chat line saying its time is up.
        async b5LeftoversTestudoBarrier(scene) {
            assertEnv();
            const env = envApi();
            await h.clearSquares(scene, [[5, 12], [6, 11], [6, 12], [6, 13]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Testudo Bearer", { type: "character", x: 5, y: 12, level: 5 });
            const shield = await h.give(user, "Testudo Shield");
            await shield.update(held(1));
            await userToken.object?.control?.();
            const ours = () => (env.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid === shield.uuid);
            const record = () => user.items.get(shield.id)?.getFlag(h.NS, "structure") ?? null;
            try {
                const card = await activated(shield, 0, "structure", "the shield's structure card");
                const placedAt = Number(game.time.worldTime);
                await live().apply(card.id, { choice: 1, destination: { x: 6 * SIZE, y: 12.5 * SIZE } });
                await h.until(() => ours().length === 1 && stateOf(card)?.status === "applied", `placed and applied at once (${JSON.stringify({ placed: ours(), status: stateOf(card)?.status, results: resultsOf(card) })})`, { timeout: 10000 });
                const walls = ours()[0].walls.map((id) => scene.walls.get(id));
                const ys = walls.flatMap((wall) => [wall.c[1], wall.c[3]]);
                h.assert(walls.every((wall) => wall.c[0] === 6 * SIZE && wall.c[2] === 6 * SIZE) && Math.max(...ys) - Math.min(...ys) === 3 * SIZE, `15 feet north–south on the line clicked (${JSON.stringify(walls.map((wall) => wall.c))})`);
                h.assert(walls.every((wall) => Number(wall.sight) === 0 && Number(wall.light) === 0 && Number(wall.sound) === 0 && Number(wall.move) > 0), `seen through, blocking movement (${JSON.stringify(walls.map((wall) => [wall.sight, wall.light, wall.sound, wall.move]))})`);
                h.assert(walls.every((wall) => Number(wall.flags[ENV].structure.stats?.hardness) === 5 && Number(wall.flags[ENV].structure.stats?.hp) === 20), `the shield's Hardness 5 and 20 Hit Points (${JSON.stringify(walls.map((wall) => wall.flags[ENV].structure.stats))})`);
                h.assert(Math.abs(Number(record()?.endsAt) - placedAt - 60) <= 5 && !record().messageId, `its record ends in a minute, no card kept (${JSON.stringify(record())})`);
                h.assert(resultsOf(card).some((line) => /for 1 minute/.test(line)), `its line (${JSON.stringify(resultsOf(card))})`);
                const since = Date.now();
                await shield.setFlag(h.NS, "structure", { ...record(), endsAt: Number(game.time.worldTime) + 1 });
                await game.time.advance(1);
                await h.until(() => !ours().length && !record(), `gone once its time is up (${JSON.stringify({ placed: ours().length, record: record() })})`, { timeout: 10000 });
                const line = await h.messageAfter(since, (message) => /Its time is up: it's gone/.test(text(message)), { what: "the chat line that its time is up" });
                return { walls: walls.length, line: text(line) };
            } finally {
                for (const entry of ours()) await env.removeStructure(scene, entry.id).catch(() => null);
            }
        },

        // Cube of Force (src/compiler/cube-faces.js withCubeWalls — its table's times; scripts/cube.js placeWallsAround's structure.lasts record):
        // its ways card names each face with its time (30, 10, 10 and 5 minutes; walls of force a minute). Face 1: the ability module's zone round
        // its user for 30 minutes, and the counteract card beside it (+20, rank 7) for a gas or wind effect crossing. Face 5 (activated again,
        // once a day: the GM's whisper): the environment module's walls round its user, invisible (sight not blocked, movement blocked), its user
        // not pushed out, kept on the item as a structure record ending in a minute; its time up (the record's end a second off, the clock moved a
        // second): its walls gone, the record gone, the chat line.
        async b5LeftoversCubeOfForceTimes(scene) {
            assertEnv();
            const env = envApi();
            await h.clearSquares(scene, [[14, 14], [15, 14], [14, 15], [15, 15]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Force Cube Holder", { type: "character", x: 14, y: 14, level: 13 });
            const cube = await h.give(user, "Cube of Force");
            await cube.update(held(1));
            await userToken.object?.control?.();
            const ours = () => (env.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid === cube.uuid);
            const record = () => user.items.get(cube.id)?.getFlag(h.NS, "structure") ?? null;
            try {
                const ways = await activated(cube, 0, "ways", "the cube's faces");
                const names = stateOf(ways).plan.ways.map((way) => way.name);
                const face = (n) => names.findIndex((name) => name.startsWith(`Face ${n}:`));
                const times = [1, 2, 3, 4, 5].map((n) => /\(([^)]+)\)$/.exec(names[face(n)] ?? "")?.[1] ?? null);
                h.assert(JSON.stringify(times) === JSON.stringify(["30 minutes", "10 minutes", "10 minutes", "5 minutes", "1 minute"]), `each face's time (${names.join(" | ")})`);
                let since = Date.now();
                await live().apply(ways.id, { choice: face(1) });
                await h.until(() => zonesOf(scene, cube).length === 1, "face 1's zone round its user", { timeout: 8000 });
                const lasts = zonesOf(scene, cube)[0].flags[ABILITY].zone.zone.lasts;
                h.assert(Number(lasts?.value) === 30 && lasts.unit === "minutes", `its zone for 30 minutes (${JSON.stringify(lasts)})`);
                const counter = await h.messageAfter(since, h.itemCard("counteract"), { what: "face 1's counteract card" });
                const counteract = stateOf(counter).counteract;
                h.assert(Number(counteract?.modifier) === 20 && Number(counteract.rank) === 7, `+20 at rank 7 (${JSON.stringify(counteract)})`);
                since = Date.now();
                const again = await activated(cube, 0, "ways", "the cube's faces again");
                await warningAfter(since, "Cube of Force", /activated again, though it's once per day/, "the GM's whisper of its once a day");
                const placedAt = Number(game.time.worldTime);
                await live().apply(again.id, { choice: face(5) });
                await h.until(() => ours().length === 1 && ours()[0].walls.length >= 4, `its walls of force round its user (${JSON.stringify(ours())})`, { timeout: 8000 });
                const walls = ours()[0].walls.map((id) => scene.walls.get(id));
                h.assert(walls.every((wall) => Number(wall.sight) === 0 && Number(wall.move) > 0 && Number(wall.flags[ENV].structure.stats?.hardness) === 30 && Number(wall.flags[ENV].structure.stats?.hp) === 60), `invisible, blocking movement, Hardness 30 and 60 Hit Points (${JSON.stringify(walls.map((wall) => [wall.sight, wall.move, wall.flags[ENV].structure.stats]))})`);
                h.assert(squareOf(userToken) === "14,14", `its user not pushed out (${squareOf(userToken)})`);
                await h.until(() => record()?.id === ours()[0].id, `the walls kept on the item as its structure record (${JSON.stringify(record())})`, { timeout: 8000 });
                h.assert(Math.abs(Number(record().endsAt) - placedAt - 60) <= 5, `ending in a minute (${JSON.stringify(record())}, placed at ${placedAt})`);
                since = Date.now();
                await cube.setFlag(h.NS, "structure", { ...record(), endsAt: Number(game.time.worldTime) + 1 });
                await game.time.advance(1);
                await h.until(() => !ours().length && !record(), `its walls gone once the minute is up (${JSON.stringify({ placed: ours().length, record: record() })})`, { timeout: 10000 });
                await h.messageAfter(since, (message) => /Its time is up: it's gone/.test(text(message)), { what: "the chat line that the walls' time is up" });
                return { times, lasts, counteract: { modifier: counteract.modifier, rank: counteract.rank } };
            } finally {
                for (const region of zonesOf(scene, cube)) await region.delete().catch(() => null);
                for (const entry of ours()) await env.removeStructure(scene, entry.id).catch(() => null);
            }
        },

        // Kraken Bottle opened in water (src/compiler/visibility.js bottledGrasp; plan.item.alsoZone; src/live/zone-afflictions.js
        // withAfflictionItem in scripts/zones.js): its ways card's "in water" way posts the arms' card and, beside it, the ability module's ink zone
        // round its user for a minute — Undetected inside, its kraken ink poison's affliction the bottle's own compendium item (not the used-up
        // bottle's uuid). The arms' card at two creatures: the DC 38 Fortitude card at both; failed (save +8, a 10: 18), both Grabbed. Each creature
        // in the ink as it's made: PF2e's undetected granted, the "Kraken ink" note, and the DC 39 Fortitude card of the poison; one's failed (18: a
        // critical failure) hands the affliction to Pseudo Afflictions, whose Effect it then has. (Its 80-foot ink covers the lab: the lab's other
        // test tokens are cleared first, so only this case's creatures get its cards.)
        async b5LeftoversKrakenInk(scene) {
            h.assert(game.modules.get("pseudo-afflictions")?.active, "Pseudo Afflictions active in pftest (it tracks the kraken ink poison)");
            const everywhere = [];
            for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) everywhere.push([x, y]);
            await h.clearSquares(scene, everywhere);
            const { actor: user, token: userToken } = await h.creature(scene, "Kraken Opener", { type: "character", x: 3, y: 3, level: 18 });
            const { actor: first, token: firstToken } = await h.creature(scene, "Kraken Prey A", { x: 6, y: 3, alliance: "opposition", hp: 300, save: 8 });
            const { actor: second, token: secondToken } = await h.creature(scene, "Kraken Prey B", { x: 6, y: 5, alliance: "opposition", hp: 300, save: 8 });
            const bottle = await giveFromPack(user, "Kraken Bottle");
            h.assert(sourceOf(bottle) === KRAKEN, `the bottle keeps its compendium source, as one dragged from the compendium (${sourceOf(bottle)})`);
            await userToken.object?.control?.();
            const ink = () => zonesNamed(scene, /Kraken Bottle/)[0] ?? null;
            try {
                let since = Date.now();
                await bottle.consume();
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the bottle's ways card" });
                const names = (stateOf(ways).plan?.ways ?? []).map((way) => way.name);
                const water = names.findIndex((name) => /in water/i.test(name));
                h.assert(water >= 0, `its in-water way (${names.join(" | ")})`);
                since = Date.now();
                await live().apply(ways.id, { choice: water });
                const arms = await h.messageAfter(since, h.itemCard("expose"), { what: "the arms' card" });
                await h.until(() => ink(), "the ink zone beside the arms' card", { timeout: 10000 });
                const zone = ink().flags[ABILITY].zone.zone;
                h.assert(zone.undetected === true && Number(zone.lasts?.value) === 1 && zone.lasts.unit === "minutes", `Undetected inside, for a minute (${JSON.stringify({ undetected: zone.undetected, lasts: zone.lasts })})`);
                const poison = zone.saves?.[0]?.plan?.resolution;
                h.assert(poison?.check?.statistic === "fortitude" && Number(poison.check.against?.value) === 39, `the kraken ink poison's Fortitude DC 39 (${JSON.stringify(poison?.check ?? null)})`);
                const affliction = poison.outcomes?.failure?.affliction ?? null;
                h.assert(affliction?.uuid === KRAKEN, `its affliction the bottle's own compendium item, which outlasts the bottle used up (${JSON.stringify(affliction)})`);
                // (In the ink as it's made: undetected, the note — and its poison's card.)
                for (const actor of [first, second]) await h.until(() => actor.hasCondition("undetected") && actor.itemTypes.effect.some((effect) => /: Kraken ink$/.test(effect.name)), `${actor.name} undetected in the ink, with its note (${effectNames(actor)}; ${conditionNames(actor)})`, { timeout: 10000 });
                const inkCard = await h.messageAfter(since, (message) => aimsAt(first)(message) && checkOf(message).statistic === "fortitude" && Number(checkOf(message).against?.value) === 39, { what: "the poison's card at the first creature in the ink", timeout: 10000 });
                h.assert(!abilityCardsSince(since).some((message) => aimsAt(user)(message) && Number(checkOf(message).against?.value) === 39), "none for its own user");
                // (The arms: the DC 38 Fortitude card at both.)
                const at = Date.now();
                await live().apply(arms.id, { targets: [firstToken.uuid, secondToken.uuid] });
                const grasp = await h.messageAfter(at, (message) => aimsAt(first)(message) && Number(checkOf(message).against?.value) === 38, { what: "the arms' DC 38 Fortitude card" });
                h.assert(checkOf(grasp).statistic === "fortitude" && aimsAt(second)(grasp), `DC 38 Fortitude at both (${JSON.stringify(checkOf(grasp))}; ${JSON.stringify(targetUuidsOf(grasp))})`);
                await h.withDie(10, async () => {
                    await h.rollAndApply(grasp);
                    await h.until(() => first.hasCondition("grabbed") && second.hasCondition("grabbed"), `both Grabbed (${conditionNames(first)} / ${conditionNames(second)})`, { timeout: 10000 });
                });
                // (The poison failed: its affliction handed on.)
                await h.withDie(10, () => h.rollAndApply(inkCard));
                await h.until(() => abilityState(inkCard)?.status === "applied", `the poison's card applied (${abilityState(inkCard)?.status})`, { timeout: 10000 });
                h.assert(degreeOf(inkCard, first) === "criticalFailure", `a critical failure (18 against DC 39: ${degreeOf(inkCard, first)})`);
                const afflicted = () => first.itemTypes.effect.find((effect) => effect.flags?.["pseudo-afflictions"] || String(sourceOf(effect) ?? "").startsWith("Compendium.pseudo-afflictions."));
                await h.until(afflicted, `Pseudo Afflictions' Effect for the ink on the creature (${effectNames(first)}; the card: ${JSON.stringify(abilityState(inkCard)?.results ?? [])})`, { timeout: 10000 });
                return { affliction, afflicted: afflicted().name, grasp: [degreeOf(grasp, first), degreeOf(grasp, second)] };
            } finally {
                for (const region of zonesNamed(scene, /Kraken Bottle/)) await region.delete().catch(() => null);
            }
        },

        // Feather Token (Whip) (src/compiler/dancing-whip.js; scripts/poisons.js selfFighting.own and vanishes; src/live/if-target.js conditions and
        // instead): used, its item card, then the whip's card kept open for the minute (its own +18, no weapon item read; its DC 6 flat check).
        // Pressed at a standing creature: the ability module's card is its Trip — Athletics +18 against the Reflex DC; the flat check (a 10) and it
        // fights on. Pressed at a prone creature: its Strike instead — +18 against AC, 2d4 slashing; fights on. Pressed again with a 3 on the flat
        // check: it vanishes (that line), the card closed, no wait set.
        async b5LeftoversFeatherWhip(scene) {
            await h.clearSquares(scene, [[2, 17], [3, 17], [3, 18]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Whip Token Holder", { type: "character", x: 2, y: 17, level: 9 });
            const { token: standingToken, actor: standing } = await h.creature(scene, "Whip Standing Foe", { x: 3, y: 17, alliance: "opposition", hp: 200 });
            const { token: proneToken, actor: prone } = await h.creature(scene, "Whip Prone Foe", { x: 3, y: 18, alliance: "opposition", hp: 200 });
            await prone.increaseCondition("prone");
            await h.until(() => prone.hasCondition("prone") && !standing.hasCondition("prone"), "one foe prone, the other standing", { timeout: 5000 });
            const token = await h.give(user, "Feather Token (Whip)");
            await userToken.object?.control?.();
            let since = Date.now();
            await token.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the token's item card" });
            since = Date.now();
            await live().apply(card.id, {});
            const whip = await h.messageAfter(since, h.itemCard("expose"), { what: "the whip's card" });
            const state = stateOf(whip);
            h.assert(state.repeat && state.plan?.selfFighting?.own === true && state.plan.selfFighting.vanishes === true && Number(state.plan.selfFighting.flat) === 6, `kept open, its own numbers, its DC 6 flat check (${JSON.stringify(state.plan?.selfFighting)})`);
            const press = async (target, face) => {
                const at = Date.now();
                await h.withDie(face, () => live().apply(whip.id, { targets: [target.uuid] }));
                const posted = await h.messageAfter(at, aimsAt(target.actor), { what: `the whip's card at ${target.name}` });
                const flat = await h.messageAfter(at, (message) => /flat check \(DC 6\)/.test(message.flavor ?? ""), { what: "its flat check" });
                return { posted, flat: Number(flat.rolls?.[0]?.total) };
            };
            const trip = await press(standingToken, 10);
            const tripCheck = checkOf(trip.posted);
            h.assert(tripCheck.statistic === "athletics" && Number(tripCheck.modifier) === 18 && tripCheck.against?.statistic === "reflex", `its Trip: Athletics +18 against the Reflex DC (${JSON.stringify(tripCheck)})`);
            h.assert(trip.flat === 10 && stateOf(whip).status === "open", `fights on at 10 (${trip.flat}, ${stateOf(whip).status})`);
            const strike = await press(proneToken, 10);
            const strikeCheck = checkOf(strike.posted);
            const components = (abilityState(strike.posted).plan.resolution.sharedDamage?.components ?? []).map((component) => `${component.formula} ${component.type}`);
            h.assert(strikeCheck.statistic === "attack" && Number(strikeCheck.modifier) === 18 && strikeCheck.against?.statistic === "ac" && JSON.stringify(components) === '["2d4 slashing"]', `at the prone foe its Strike instead: +18 against AC, 2d4 slashing (${JSON.stringify({ check: strikeCheck, components })})`);
            h.assert(stateOf(whip).status === "open", "still fighting");
            const last = await press(standingToken, 3);
            h.assert(last.flat === 3, `a 3 on the flat check (${last.flat})`);
            await h.until(() => stateOf(whip).status === "applied", `the whip's card closed (${stateOf(whip).status})`, { timeout: 8000 });
            h.assert(resultsOf(whip).some((line) => /Flat check 3 \(DC 6\): it vanishes\./.test(line)) && !resultsOf(whip).some((line) => /usable again/.test(line)), `it vanishes, no wait (${JSON.stringify(resultsOf(whip))})`);
            return { trip: tripCheck, strike: strikeCheck, results: resultsOf(whip) };
        }
    };
};
