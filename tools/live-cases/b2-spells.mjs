// The second batch's spells group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code, and the vehicles the ability module's conjuring and cards never had before:
// - Gate Attenuator (Major): a kineticist's impulse numbers for a spell of its element (scripts/casts.js castImpulse, impulseNumbers; the cast
//   card's impulse line and castLines, src/live/cast-card.js).
// - Alchemist's Haversack: a versatile vial through PF2e's updateResource (scripts/focus.js resourceOf's slug).
// - Marvelous Miniature (Boat), Folding Boat: PF2e's vehicle actors conjured (src/compiler/vehicles.js → the ability module's makeConjured with
//   an actor of type "vehicle"), gone at 0 Hit Points, dismissed from the card.
// - Feather Token (Swan Boat) (Ammunition), Wind-Up Cart: marker tokens from the text's numbers (a gargantuan swimmer; AC, HP, Speed and a
//   minute in an encounter).
// - Feather Token (Anchor), Feather Token (Fan) "Toward a sail": a note Effect alone on the vehicle targeted (src/live/route.js targetedRow's
//   "vehicle" branch), straight and through a ways card.
// - Blessed Reformer: its Redeemer Wielder critical-hit rider, only for a champion of redemption against an unholy creature (scripts/rune-strikes.js
//   wielderFits).
// The others feed what these prove or what's live-checked already: Anglerfish Lantern (Submersible)'s Bathysphere (the vehicle conjure),
// Kraken Figurehead's Lash Out! (the anchor's row), Wind At Your Back's "Aboard a vehicle" (the fan's way), Detect Anathema Fulu (the save
// route's damage row and an unending note Effect).

const ABILITY = "pf2e-automatic-ability-resolution";
const SPELLS = "pf2e-automatic-resolution";
// (tools/live-check.mjs's flag on its own fixtures: its cleanup removes only those — the iconics and the rowboat made here carry it.)
const FIXTURE = "liveCheckFixture";
// (PF2e's own actors: Yoon, a level-5 fire kineticist; Fumbus, a level-5 alchemist with the Versatile Vials feature; a Rowboat.)
const YOON = "Compendium.pf2e.iconics.Actor.XaBCp3DygrjJaqR7";
const FUMBUS = "Compendium.pf2e.iconics.Actor.yU4m6Ameqs3NLsNH";
const ROWBOAT = "Compendium.pf2e.vehicles.Actor.l0RfYgabnbNoHnkS";
// (The Versatile Vial item PF2e's special resource counts, its SpecialResource itemUUID.)
const VIAL = "Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card");
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const textOf = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    // (A vehicle's too: PF2e's vehicles take Effects.)
    const effectsOf = (actor) => actor.itemTypes?.effect ?? actor.items.filter((item) => item.type === "effect");
    const effectNames = (actor) => effectsOf(actor).map((effect) => effect.name).join(", ") || "none";
    const castMessage = (since) => h.messageAfter(since, (message) => Boolean(message.flags?.[SPELLS]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    // (The conjured tokens an item made on this scene, and the ability module's card that lists them.)
    const madeBy = (scene, itemUuid) => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemUuid === itemUuid);
    const conjureCardFor = (since, actorId) => h.messageAfter(since, (message) => (message.flags?.[ABILITY]?.conjureCard?.actorIds ?? []).includes(actorId), { what: "the ability module's conjure card" });
    async function removeMade(scene, uuids) {
        for (const uuid of uuids) {
            for (const token of madeBy(scene, uuid)) {
                const base = game.actors.get(token.actorId);
                await token.delete().catch(() => null);
                if (base?.flags?.[ABILITY]?.conjured) await base.delete().catch(() => null);
            }
        }
    }

    // Waits for test, then asserts it with describe()'s words (read as it fails, so they show the values then).
    async function waitFor(test, describe, timeout = 8000) {
        for (const end = Date.now() + timeout; Date.now() < end; ) {
            if (test()) return;
            await h.wait(150);
        }
        h.assert(test(), typeof describe === "function" ? describe() : describe);
    }

    // A PF2e actor from its compendium as one of this check's fixtures ("PFTEST ITEM …", flagged, linked), its token on the lab at (x, y).
    async function fixtureFrom(scene, uuid, name, { x, y }) {
        const found = await fromUuid(uuid).catch(() => null);
        h.assert(found, `${uuid} in PF2e's compendiums`);
        const source = found.toObject();
        delete source._id;
        source.name = `${h.PREFIX} ${name}`;
        source.folder = null;
        source.flags = foundry.utils.mergeObject(source.flags ?? {}, { [h.NS]: { [FIXTURE]: true } }, { inplace: false });
        source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name, actorLink: true };
        const actor = await Actor.create(source);
        const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), actorId: actor.id, actorLink: true, x: x * 100, y: y * 100 }]);
        await h.wait(300);
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await h.wait(100);
        return { actor, token };
    }

    // A class item alone, its features left out (its system.items emptied: PF2e would grant them all, with their ChoiceSet prompts).
    async function classOnly(actor, name) {
        const pack = game.packs.get("pf2e.classes");
        const row = (await pack.getIndex()).find((entry) => entry.name === name);
        h.assert(row, `${name} isn't in PF2e's classes.`);
        const source = (await pack.getDocument(row._id)).toObject();
        delete source._id;
        source.system.items = {};
        const [item] = await actor.createEmbeddedDocuments("Item", [source]);
        return item;
    }

    // The windows a cast through the spell module may leave open (its caster choices, a confirmation): closed, so the next case starts clear.
    async function closeWindows(pattern) {
        for (const app of [...foundry.applications.instances.values()]) {
            if (app.rendered && pattern.test(String(app.title ?? ""))) await app.close().catch(() => null);
        }
    }

    return {
        // Gate Attenuator (Major)'s Elemental Spell (src/compiler/cast-changes.js castImpulse, each choice's element; scripts/casts.js with
        // impulseNumbers): "If you're a kineticist and the spell's element matches one of your kinetic elements, you can use your impulse attack
        // modifier instead of the spell attack modifier or your impulse DC instead of the spell DC." Yoon (PF2e's iconic, a fire kineticist),
        // her impulse DC and attack raised past the item's DC 37 and +27 by a fixture Effect. The cast card shows the impulse line and the
        // element-trait castLine; Boil Blood (fire) picked: the spell module's cast carries her impulse DC and attack, and the card's result reads
        // "<name>'s impulse numbers: DC x, attack +y.". Then Whirlwind (air, not hers) from the same attenuator: DC 37 and +27, no such line.
        async b2SpellsGateImpulse(scene) {
            assertSpells();
            await h.clearSquares(scene, [[4, 1], [5, 1]]);
            const { actor: user, token: userToken } = await fixtureFrom(scene, YOON, "Gate Kineticist", { x: 4, y: 1 });
            const { token: foeToken } = await h.creature(scene, "Gate Boil Target", { x: 5, y: 1, alliance: "opposition", hp: 400 });
            const elements = (user.flags?.system?.kineticist?.elements ?? []).map((entry) => entry?.value ?? entry);
            h.assert(elements.includes("fire") && !elements.includes("air"), `a fire kineticist, not air (${JSON.stringify(elements)})`);
            const impulse = () => user.getStatistic?.("impulse") ?? null;
            h.assert(impulse(), "PF2e's impulse statistic on the kineticist");
            // (Her impulse attack and DC both past the item's: PF2e's FlatModifiers on the impulse statistic's attack-roll and DC domains.)
            await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Impulse Boost`, type: "effect", img: "icons/svg/upgrade.svg", system: { duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: [{ key: "FlatModifier", selector: "impulse-attack-roll", type: "untyped", value: 20, label: "Live check" }, { key: "FlatModifier", selector: "impulse-dc", type: "untyped", value: 20, label: "Live check" }] } }]);
            await waitFor(() => Number(impulse()?.dc?.value) > 37 && Number(impulse()?.check?.mod) > 27, () => `her impulse DC above 37 and attack above +27 (DC ${impulse()?.dc?.value}, +${impulse()?.check?.mod})`);
            const gate = await h.give(user, "Gate Attenuator (Major)");
            await userToken.object?.control?.();
            try {
                let since = Date.now();
                await api().activate(gate.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "the attenuator's cast card" });
                const plan = stateOf(card).plan;
                const boil = (plan.choices ?? []).findIndex((choice) => choice.spell?.name === "Boil Blood");
                const whirl = (plan.choices ?? []).findIndex((choice) => choice.spell?.name === "Whirlwind");
                h.assert(boil >= 0 && plan.choices[boil].element === "fire" && whirl >= 0 && plan.choices[whirl].element === "air", `Boil Blood (fire) and Whirlwind (air) among its picks (${(plan.choices ?? []).map((choice) => `${choice.spell?.name}:${choice.element}`).join(", ")})`);
                h.assert(plan.castImpulse && plan.dc === 37 && plan.attack === 27, `its impulse reading at DC 37, +27 (${JSON.stringify({ castImpulse: plan.castImpulse, dc: plan.dc, attack: plan.attack })})`);
                const said = textOf(card);
                h.assert(/kinetic elements include the spell/.test(said), `the card's impulse line (${said.slice(0, 400)})`);
                h.assert(/gains that element's trait/.test(said), `its element-trait line, a castLine on the card (${said.slice(0, 400)})`);
                // (The better numbers, read just before the cast: hers.)
                const want = { dc: Math.max(37, Number(impulse().dc.value)), attack: Math.max(27, Number(impulse().check.mod)) };
                since = Date.now();
                await api().apply(card.id, { choice: boil, targets: [foeToken.uuid] });
                const cast = await castMessage(since);
                const flag = cast.flags[SPELLS].castFromItem;
                h.assert(flag.dc === want.dc && flag.counteract === want.attack, `Boil Blood cast at her impulse DC ${want.dc} and +${want.attack} (${JSON.stringify({ dc: flag.dc, counteract: flag.counteract, rank: flag.rank })})`);
                const line = `${user.name}'s impulse numbers: DC ${want.dc}, attack +${want.attack}.`;
                await waitFor(() => resultsOf(card).includes(line), () => `the line "${line}" (${resultsOf(card).join(" | ")})`);
                // (Whirlwind, air: not one of her elements — the item's own numbers. The second use of the day is the GM's warning, not a refusal.)
                since = Date.now();
                await api().activate(gate.uuid, 0);
                const again = await h.messageAfter(since, (message) => h.itemCard("cast")(message) && message.id !== card.id, { what: "the attenuator's second cast card" });
                since = Date.now();
                await api().apply(again.id, { choice: whirl, targets: [foeToken.uuid] });
                const second = await castMessage(since);
                const other = second.flags[SPELLS].castFromItem;
                h.assert(other.dc === 37 && other.counteract === 27, `Whirlwind at the item's DC 37 and +27 (${JSON.stringify({ dc: other.dc, counteract: other.counteract, rank: other.rank })})`);
                await waitFor(() => resultsOf(again).length > 0, "the second card's results");
                h.assert(!resultsOf(again).some((entry) => /impulse numbers/.test(entry)), `no impulse line for an air spell (${resultsOf(again).join(" | ")})`);
                return { boil: { dc: flag.dc, attack: flag.counteract, rank: flag.rank }, whirlwind: { dc: other.dc, attack: other.counteract }, results: resultsOf(card) };
            } finally {
                await closeWindows(/Boil Blood|Whirlwind/);
            }
        },

        // Alchemist's Haversack (src/compiler/focus.js resource "versatile-vials"; scripts/focus.js through PF2e's actor.updateResource): "you
        // gain a versatile vial" on the Focus Point card. Fumbus (PF2e's level-5 iconic alchemist) at one vial below his maximum: the card reads
        // "1 versatile vial", and Apply raises PF2e's versatile-vials resource and his Versatile Vial item's quantity by 1. At the maximum, a second
        // use's card says the vials are full and changes nothing; a character with no such resource "can't have versatile vials".
        async b2SpellsHaversackVial(scene) {
            await h.clearSquares(scene, [[7, 3], [9, 3]]);
            const { actor: alchemist } = await fixtureFrom(scene, FUMBUS, "Haversack Alchemist", { x: 7, y: 3 });
            const vials = () => alchemist.system.resources?.versatileVials ?? null;
            h.assert(Number(vials()?.max) >= 2, `PF2e's versatile vials resource (${JSON.stringify(vials())})`);
            const max = Number(vials().max);
            await alchemist.updateResource("versatile-vials", max - 1);
            await waitFor(() => Number(vials()?.value) === max - 1, () => `his vials at ${max - 1} of ${max} first (${JSON.stringify(vials())})`);
            const vialItem = () => alchemist.items.find((item) => item.sourceId === VIAL) ?? alchemist.items.find((item) => item.slug === "versatile-vial");
            const sack = await h.give(alchemist, "Alchemist's Haversack");
            // (Its activation's Focus Point card, its words read while open, then applied: → the card.)
            let opened = "";
            const use = async (item, what) => {
                const since = Date.now();
                await api().activate(item.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("focus"), { what });
                opened = textOf(card);
                await api().apply(card.id);
                await waitFor(() => stateOf(card)?.status === "applied" && resultsOf(card).length > 0, `${what}'s result`);
                return card;
            };
            const first = await use(sack, "the haversack's card");
            h.assert(/: 1 versatile vial\b/.test(opened) && /Gain the versatile vial\b/.test(opened), `the card's "1 versatile vial" and its button (${opened.slice(0, 300)})`);
            await waitFor(() => Number(vials()?.value) === max, () => `a vial gained: ${max} of ${max} (${JSON.stringify(vials())})`);
            await waitFor(() => Number(vialItem()?.quantity) === max, () => `his Versatile Vial item at ${max} (${vialItem()?.quantity ?? "no such item"})`);
            h.assert(resultsOf(first).some((line) => line.endsWith(` gains 1 versatile vial (${max} of ${max}).`)), `its line (${resultsOf(first).join(" | ")})`);
            const full = await use(sack, "the haversack's second card");
            h.assert(resultsOf(full).some((line) => line.endsWith(`'s versatile vials are full (${max} of ${max}): no versatile vial gained.`)), `full (${resultsOf(full).join(" | ")})`);
            h.assert(Number(vials()?.value) === max && Number(vialItem()?.quantity) === max, `nothing more (${JSON.stringify(vials())}, item ${vialItem()?.quantity})`);
            const { actor: other } = await h.creature(scene, "Haversack Borrower", { type: "character", x: 9, y: 3 });
            const borrowed = await h.give(other, "Alchemist's Haversack");
            const none = await use(borrowed, "the borrower's card");
            h.assert(resultsOf(none).some((line) => line.endsWith(" can't have versatile vials: nothing gained.")), `no vials for a non-alchemist (${resultsOf(none).join(" | ")})`);
            return { max, quantity: vialItem()?.quantity, results: [resultsOf(first), resultsOf(full), resultsOf(none)] };
        },

        // Marvelous Miniature (Boat) and Folding Boat (src/compiler/vehicles.js vehiclePlan → the ability module's conjure builtin, an actor of type
        // "vehicle" — its makeConjured sets an alliance only for npc or hazard): "It transforms into a Cutter. The cutter lasts 1 day." and "The
        // other form is a Rowboat". Used, each makes PF2e's vehicle (from its vehicles compendium) as a token beside its user; the conjure card
        // lists it with the item's lines ("Lasts 24 hours", the large body of water; "until dismissed", the two shapes) and a Dismiss button.
        // The Cutter at 0 Hit Points is gone (vanishAtZero: broken), token and actor; the Rowboat goes with the card's Dismiss (folded back).
        async b2SpellsVehicleConjured(scene) {
            const squares = [];
            for (let x = 2; x <= 17; x++) for (let y = 7; y <= 19; y++) squares.push([x, y]);
            await h.clearSquares(scene, squares);
            const { actor: user, token: userToken } = await h.creature(scene, "Boat Tosser", { type: "character", x: 9, y: 13 });
            await h.until(() => userToken.object, "the user's token drawn", { timeout: 5000 });
            const miniature = await h.give(user, "Marvelous Miniature (Boat)");
            const folding = await h.give(user, "Folding Boat");
            // (The miniature is used up: its uuid kept, as its conjured flag has it.)
            const miniatureUuid = miniature.uuid;
            const foldingUuid = folding.uuid;
            try {
                let since = Date.now();
                await miniature.consume();
                await waitFor(() => madeBy(scene, miniatureUuid).length === 1, () => `the Cutter's token (${madeBy(scene, miniatureUuid).length})`, 10000);
                const cutter = madeBy(scene, miniatureUuid)[0];
                const cutterId = cutter.actorId;
                h.assert(cutter.actor?.type === "vehicle" && /Cutter/.test(cutter.actor.name), `PF2e's Cutter, a vehicle (${cutter.actor?.type}: ${cutter.actor?.name})`);
                h.assert(Number(cutter.actor.system.attributes?.hp?.value) > 0, `with its Hit Points (${JSON.stringify(cutter.actor.system.attributes?.hp)})`);
                const card = await conjureCardFor(since, cutterId);
                const said = textOf(card);
                h.assert(/Lasts 24 hours/.test(said) && /tossed into a large body of water/.test(said), `its card's time and line (${said.slice(0, 400)})`);
                h.assert(/data-conjure-end/.test(card.content ?? ""), "its Dismiss button");
                await cutter.actor.update({ "system.attributes.hp.value": 0 });
                await waitFor(() => !madeBy(scene, miniatureUuid).length && !game.actors.get(cutterId), () => `the Cutter gone at 0 Hit Points (tokens ${madeBy(scene, miniatureUuid).length}, actor ${Boolean(game.actors.get(cutterId))})`, 10000);
                since = Date.now();
                await api().activate(foldingUuid, 0);
                await waitFor(() => madeBy(scene, foldingUuid).length === 1, () => `the Rowboat's token (${madeBy(scene, foldingUuid).length})`, 10000);
                const rowboat = madeBy(scene, foldingUuid)[0];
                const rowboatId = rowboat.actorId;
                h.assert(rowboat.actor?.type === "vehicle" && /Rowboat/.test(rowboat.actor.name), `PF2e's Rowboat, a vehicle (${rowboat.actor?.type}: ${rowboat.actor?.name})`);
                const foldCard = await conjureCardFor(since, rowboatId);
                const foldSaid = textOf(foldCard);
                h.assert(/until dismissed/.test(foldSaid) && /can take two shapes/.test(foldSaid), `its card: no time, its lines (${foldSaid.slice(0, 400)})`);
                let button = null;
                await waitFor(() => (button = document.querySelector(`[data-message-id="${foldCard.id}"] button[data-conjure-end]`)), "the Rowboat card's Dismiss button in the chat log");
                button.click();
                await waitFor(() => !madeBy(scene, foldingUuid).length && !game.actors.get(rowboatId), () => `the Rowboat folded back by Dismiss (tokens ${madeBy(scene, foldingUuid).length}, actor ${Boolean(game.actors.get(rowboatId))})`, 10000);
                return { cutter: cutter.name, rowboat: rowboat.name, cards: [card.id, foldCard.id] };
            } finally {
                await removeMade(scene, [miniatureUuid, foldingUuid]);
            }
        },

        // Feather Token (Swan Boat) (Ammunition) and Wind-Up Cart (vehicles.js markers, the ability module's conjuredActorData): "It transforms
        // into a swan-shaped boat … The boat moves on the water at a Speed of 50 feet, and lasts 1 day" → a gargantuan marker (4 squares) with
        // swim Speed 50, its capacity a line of its card. "The wind-up cart has AC 15, Hardness 2, 24 Hit Points …" and "moves forward at a speed
        // of 30 feet per round … for up to 1 minute" → a tiny marker with AC 15, 24 HP and a land Speed of 30, Hardness and Break Threshold a
        // line; in an encounter it ends at its user's turn 10 rounds on: still there the round before, gone at it.
        async b2SpellsMarkerBoatCart(scene) {
            const squares = [];
            for (let x = 3; x <= 16; x++) for (let y = 1; y <= 12; y++) squares.push([x, y]);
            await h.clearSquares(scene, squares);
            const { actor: user, token: userToken } = await h.creature(scene, "Marker Maker", { type: "character", x: 9, y: 6 });
            await h.until(() => userToken.object, "the user's token drawn", { timeout: 5000 });
            const feather = await h.give(user, "Feather Token (Swan Boat) (Ammunition)");
            const cart = await h.give(user, "Wind-Up Cart");
            const featherUuid = feather.uuid;
            const cartUuid = cart.uuid;
            let combat = null;
            try {
                let since = Date.now();
                await api().activate(featherUuid, 0);
                await waitFor(() => madeBy(scene, featherUuid).length === 1, () => `the swan boat's marker (${madeBy(scene, featherUuid).length})`, 10000);
                const swan = madeBy(scene, featherUuid)[0];
                const speeds = () => swan.actor.system.movement?.speeds ?? {};
                h.assert(swan.actor.type === "npc" && swan.actor.system.traits?.size?.value === "grg" && Number(swan.width) === 4, `a gargantuan marker, 4 squares (${swan.actor.type}, ${swan.actor.system.traits?.size?.value}, ${swan.width}×${swan.height})`);
                h.assert(Number(speeds().swim?.value) === 50, `swim Speed 50 (${JSON.stringify(speeds().swim ?? null)}; its source ${JSON.stringify(swan.actor._source.system?.attributes?.speed ?? null)})`);
                const swanCard = await conjureCardFor(since, swan.actorId);
                const swanSaid = textOf(swanCard);
                h.assert(/32 Medium creatures/.test(swanSaid) && /Lasts 24 hours/.test(swanSaid), `its card's capacity line and day (${swanSaid.slice(0, 400)})`);
                combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 15 }]);
                await combat.startCombat();
                await h.wait(500);
                const start = Number(combat.round);
                since = Date.now();
                await cart.consume();
                await waitFor(() => madeBy(scene, cartUuid).length === 1, () => `the cart's marker (${madeBy(scene, cartUuid).length})`, 10000);
                const cartToken = madeBy(scene, cartUuid)[0];
                const cartId = cartToken.actorId;
                const marker = cartToken.actor;
                const ac = Number(marker.armorClass?.value ?? marker.system.attributes?.ac?.value);
                const hp = marker.system.attributes?.hp ?? {};
                const land = Number(marker.system.movement?.speeds?.land?.value ?? NaN);
                h.assert(marker.system.traits?.size?.value === "tiny" && ac === 15 && Number(hp.value) === 24 && Number(hp.max) === 24 && land === 30, `a tiny marker, AC 15, 24 HP, 30 feet (${marker.system.traits?.size?.value}, AC ${ac}, HP ${hp.value}/${hp.max}, land ${land})`);
                const cartCard = await conjureCardFor(since, cartId);
                const cartSaid = textOf(cartCard);
                h.assert(/Hardness 2, Break Threshold 12/.test(cartSaid), `its object's line (${cartSaid.slice(0, 400)})`);
                const endsAt = marker.flags?.[ABILITY]?.conjured?.endsAt ?? null;
                h.assert(endsAt?.round === start + 10 && endsAt.at === "turn-start", `its end at its user's turn 10 rounds on, round ${start + 10} (${JSON.stringify(endsAt)})`);
                // (The rounds moved on at once — Foundry's turn events run for each one skipped, PF2e's start of turn for the last.)
                await combat.update({ round: endsAt.round - 1, turn: 0 });
                await h.wait(1500);
                h.assert(madeBy(scene, cartUuid).length === 1, `still there in round ${endsAt.round - 1}`);
                await combat.update({ round: endsAt.round, turn: 0 });
                await waitFor(() => !madeBy(scene, cartUuid).length && !game.actors.get(cartId), () => `the cart gone at the start of its user's turn in round ${endsAt.round} (tokens ${madeBy(scene, cartUuid).length})`, 10000);
                return { swan: { size: swan.actor.system.traits.size.value, swim: speeds().swim?.value }, cart: { ac, hp: hp.max, land, endsAt } };
            } finally {
                await removeMade(scene, [featherUuid, cartUuid]);
                await combat?.delete().catch(() => null);
            }
        },

        // Feather Token (Anchor) and Feather Token (Fan)'s "Toward a sail" (vehicles.js vehicleNote; src/live/route.js targetedRow's vehicle branch:
        // a note Effect alone, targeting "1 vehicle", goes to the presser's targets): a PF2e Rowboat targeted. The anchor's card, then the ability
        // module's card at the boat — a vehicle, not refused — whose Apply puts "Feather Token (Anchor): Anchored" on it for 24 hours ("it can't
        // move for 1 day"). The fan's ways card, its first way's card at the boat, and "Fanned sail" on it for 8 hours.
        async b2SpellsVehicleNotes(scene) {
            await h.clearSquares(scene, [[3, 15], [5, 15], [6, 15], [5, 16], [6, 16]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Boat Captain", { type: "character", x: 3, y: 15 });
            const { actor: boat, token: boatToken } = await fixtureFrom(scene, ROWBOAT, "Anchored Rowboat", { x: 5, y: 15 });
            h.assert(boat.type === "vehicle", `PF2e's Rowboat, a vehicle (${boat.type})`);
            const anchor = await h.give(user, "Feather Token (Anchor)");
            const fan = await h.give(user, "Feather Token (Fan)");
            await userToken.object?.control?.();
            await h.target(boatToken);
            const noteOn = (label) => effectsOf(boat).find((effect) => effect.name.endsWith(`: ${label}`));
            const atBoat = (message) => h.abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((target) => target.actorUuid === boat.uuid);
            let since = Date.now();
            await anchor.consume();
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the anchor's card" });
            since = Date.now();
            await api().apply(card.id, { targets: [boatToken.uuid] });
            const ability = await h.messageAfter(since, atBoat, { what: "the ability module's card at the boat" });
            await h.applyAbilityCard(ability);
            await waitFor(() => noteOn("Anchored"), () => `the Anchored note on the boat (${effectNames(boat)})`);
            const anchored = noteOn("Anchored");
            h.assert(Number(anchored.system.duration?.value) === 24 && anchored.system.duration?.unit === "hours", `for 24 hours (${JSON.stringify(anchored.system.duration)})`);
            h.assert(/can't move for 1 day/.test(String(anchored.system.description?.value ?? "").replace(/&#39;/g, "'")), `its words (${anchored.system.description?.value})`);
            since = Date.now();
            await fan.consume();
            const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the fan's ways card" });
            h.assert((stateOf(ways).plan.ways ?? [])[0]?.name === "Toward a sail", `its first way "Toward a sail" (${(stateOf(ways).plan.ways ?? []).map((way) => way.name).join(", ")})`);
            since = Date.now();
            await api().apply(ways.id, { choice: 0 });
            const sail = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && message.id !== card.id, { what: "the sail's card" });
            since = Date.now();
            await api().apply(sail.id, { targets: [boatToken.uuid] });
            const sailCard = await h.messageAfter(since, atBoat, { what: "the ability module's card at the boat (the sail)" });
            await h.applyAbilityCard(sailCard);
            await waitFor(() => noteOn("Fanned sail"), () => `the Fanned sail note on the boat (${effectNames(boat)})`);
            const fanned = noteOn("Fanned sail");
            h.assert(Number(fanned.system.duration?.value) === 8 && fanned.system.duration?.unit === "hours", `for 8 hours (${JSON.stringify(fanned.system.duration)})`);
            return { effects: effectNames(boat) };
        },

        // Blessed Reformer's Redeemer Wielder (src/compiler/wielder-riders.js through rune-strikes.js runeCritRiders; scripts/rune-strikes.js
        // wielderFits): "When you critically hit an unholy creature with the blessed reformer, until the end of your next turn, the creature takes
        // a –10-foot penalty to its Speeds and can't Step", only "If you're a champion with the redemption cause". A champion (PF2e's class, its
        // features left out) with the Redemption class feature critically hits an unholy creature (AC −20, every d20 at 15): the ability module's
        // card "Blessed Reformer" at it, whose Apply gives it PF2e's all-speeds −10 (its land Speed 10 lower) and the "Can't Step" note. The same
        // champion's critical hit on a creature without the unholy trait, and then — Redemption traded for Justice — on the unholy one: no card.
        async b2SpellsRedeemerCrit(scene) {
            await h.clearSquares(scene, [[15, 1], [16, 1], [16, 2]]);
            const { actor: champion, token: championToken } = await h.creature(scene, "Redeemer Champion", { type: "character", x: 15, y: 1, level: 10 });
            const { actor: imp, token: impToken } = await h.creature(scene, "Redeemer Unholy Foe", { x: 16, y: 1, alliance: "opposition", ac: -20, hp: 400 });
            const { token: plainToken } = await h.creature(scene, "Redeemer Plain Foe", { x: 16, y: 2, alliance: "opposition", ac: -20, hp: 400 });
            await imp.update({ "system.traits.value": ["fiend", "unholy"] });
            h.assert(imp.traits?.has?.("unholy") || (imp.system.traits.value ?? []).includes("unholy"), `the unholy trait (${[...(imp.traits ?? [])].join(", ")})`);
            await classOnly(champion, "Champion");
            const redemption = await h.give(champion, "Redemption", "pf2e.classfeatures");
            const slugs = () => champion.itemTypes.feat.map((feat) => feat.slug);
            h.assert(champion.class?.slug === "champion" && slugs().includes("redemption"), `a champion of redemption (${champion.class?.slug}; ${slugs().join(", ")})`);
            const hammer = await h.give(champion, "Blessed Reformer");
            await hammer.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await h.wait(500);
            await championToken.object?.control?.();
            const reformerCards = (since) => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && h.abilitySaveCard(message) && message.flags[ABILITY].card.ability?.name === "Blessed Reformer");
            // (A critical hit at that token: → the time just before its Strike.)
            const critAt = async (token) => {
                await h.target(token);
                const since = Date.now();
                const { attack } = await h.withDie(15, () => h.strike(champion, hammer));
                h.assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC −20): ${attack.flags.pf2e.context.outcome}`);
                return since;
            };
            const land = (actor) => Number(actor.system.movement?.speeds?.land?.value ?? NaN);
            const before = land(imp);
            let since = await critAt(impToken);
            const card = await h.messageAfter(since, (message) => reformerCards(since).includes(message), { what: "Blessed Reformer's critical-hit card", timeout: 10000 });
            h.assert((card.flags[ABILITY].card.targets ?? []).some((target) => target.actorUuid === imp.uuid), "its card at the unholy creature");
            await h.applyAbilityCard(card);
            const penalty = () => effectsOf(imp).flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("all-speeds") && Number(rule.value) === -10);
            const cantStep = () => effectsOf(imp).find((effect) => /Can't Step$/.test(effect.name));
            await waitFor(() => penalty() && cantStep(), () => `the −10 all-speeds penalty and the Can't Step note (${effectNames(imp)})`);
            if (Number.isFinite(before) && before > 10) await waitFor(() => land(imp) === before - 10, () => `its land Speed ${before} → ${before - 10} (${land(imp)})`);
            // (Not unholy: no card.)
            since = await critAt(plainToken);
            await h.wait(3000);
            h.assert(!reformerCards(since).length, `no card for a creature without the unholy trait (${reformerCards(since).length})`);
            // (Not of redemption — the Justice cause instead: no card, even at the unholy one.)
            await redemption.delete();
            await h.give(champion, "Justice", "pf2e.classfeatures");
            h.assert(!slugs().includes("redemption") && slugs().includes("justice"), `a champion of justice now (${slugs().join(", ")})`);
            since = await critAt(impToken);
            await h.wait(3000);
            h.assert(!reformerCards(since).length, `no card for a champion without the redemption cause (${reformerCards(since).length})`);
            return { card: card.id, effects: effectNames(imp), speed: { before, after: land(imp) } };
        }
    };
};
