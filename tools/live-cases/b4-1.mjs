// The fourth batch's first group (unique items and artifacts) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// (docs/mechanics.md "Unique items and artifacts, built in full: the first group". Only the items whose live play is new code have a case here:
// the own skill check against a set DC (plan.ownSave, scripts/poisons.js), Effects that grant a condition ended with it (reduce granter "ends",
// scripts/live.js), Effects until rest and in place of the last (scripts/until-rest.js), a zone after a cast (castZone), one object taken or
// dropped (dropHeld.one/take, scripts/drop-held.js, src/live/drop-card.js listedItems; route.js targetedRow), Hit Points lost by level
// (hpLoss, loseHitPoints) with the immunity on the targeted creature (immunity.on "targets"), any PF2e item made for a time (anyItemChoices,
// objects.lasts, whileAttended), temporary Hit Points by what's held (levelTemp ifHeld), the structure card (scripts/structure.js), the
// soulhearts' phantom (src/compiler/unique-rules.js withPhantomBolster, scripts/live.js bolsterPhantom), a cast that spends an Effect
// (castEndsRule) and one with a save card for later (castNote, castAgain), an Effect of rules on its user (userEffects kind "rules") and a save
// card after a zone's damage (scripts/after-damage.js). Shadowpiercer's Rebuff Gloom and the Mirror of Sorshen's Second Glance feed mechanisms
// already checked live: the ways card's counteract card, a Mythic Point spent or refused (spend — chromaticRobe, regainMythic) and a
// condition given as it's used (userEffects condition — Pharasmin Visor's); a plain save card with conditions and a note Effect.)

const ABILITY = "pf2e-automatic-ability-resolution";
const ENV = "pf2e-automatic-environment-resolution";
const SPELLS = "pf2e-automatic-resolution";
// (tools/live-check.mjs's flag on its own fixtures, here for this file's encounters: its cleanup removes only those.)
const FIXTURE = "liveCheckFixture";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };
const GRABBED = "Compendium.pf2e.conditionitems.Item.kWc1fhmv9LBiTuei";
const SLOWED = "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3";

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card") ?? null;
    const resultsOf = (message) => stateOf(message)?.results ?? [];
    const abilityOf = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? null;
    const effects = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none";
    const conditions = (actor) => actor.itemTypes.condition.map((condition) => `${condition.slug}${condition.value ? ` ${condition.value}` : ""}`).join(", ") || "none";
    const held = (hands = 1) => ({ "system.equipped.carryType": "held", "system.equipped.handsHeld": hands });
    const invested = { "system.equipped.carryType": "worn", "system.equipped.invested": true };
    const hp = (actor) => Number(actor.system.attributes.hp.value);
    const temp = (actor) => Number(actor.system.attributes.hp.temp) || 0;
    const assertSpells = () => h.assert(game.modules.get(SPELLS)?.api?.castFromItem, "The spell module's castFromItem isn't there.");
    // (The ability module's card whose creatures include that actor, posted since then.)
    const abilityCardAt = (actor) => (message) => h.abilitySaveCard(message) && (message.flags?.[ABILITY]?.card?.targets ?? []).some((target) => target.actorUuid === actor.uuid);
    // (An Effect of this file's own on a fixture: PF2e's rules, no end.)
    const fixtureEffect = async (actor, name, rules, system = {}) => (await actor.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} ${name}`, type: "effect", img: "icons/svg/aura.svg", system: { rules, duration: UNLIMITED, ...system } }]))[0];
    // (An activation's number as the sheet's button has it — the item's own reading, src/compiler/permanent.js —, found by its name; else the one
    // given, for an activation with no name.)
    const activationOf = async (item, name, fallback) => {
        try {
            const { compileActivations } = await import(`/modules/${h.NS}/src/compiler/permanent.js`);
            const found = compileActivations({ ...item.toObject(false), uuid: item.uuid }).find((entry) => entry.activation?.name === name);
            return found?.index ?? fallback;
        } catch {
            return fallback;
        }
    };
    // (The spell module's dialogs a cast left open for these spells — its "— Apply Effect" confirmation, its caster choices: closed, so the next
    // case starts clean.)
    const closeSpellDialogs = async (pattern) => {
        for (const app of [...foundry.applications.instances.values()]) {
            const title = String(app.title ?? "");
            if ((app.constructor.name === "DialogV2" || /caster choices/i.test(title)) && pattern.test(title)) await app.close?.().catch(() => null);
        }
        for (const app of Object.values(ui.windows ?? {})) if (pattern.test(String(app.title ?? "")) && /Dialog/.test(app.constructor.name)) await app.close?.().catch(() => null);
    };

    return {
        // Essence Prism's first activation (2026-10-27, artifact-readings.js; plan.ownSave in scripts/poisons.js, saveText "check"): "You must
        // succeed at a secret DC 30 skill check with a skill associated with a magical tradition that uses the essence you chose." Its card is its
        // user's own (no targets), its eight picks the essences and their traditions' skills; "Spiritual essence: Religion" picked, the ability
        // module's card is at its user's own token, Religion against DC 30, secret. Rolled (Religion +15, a natural 20: a critical success), its user gets the prism's
        // note Effect for the quality it chose, of spiritual essence. (The Religion roll's whisper is returned: the secret roll is the ability
        // module's to make.)
        async b4G1EssencePrismReligion(scene) {
            await h.clearSquares(scene, [[4, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Prism Setter", { type: "character", x: 4, y: 4 });
            // (Religion +15: a natural 20 is 35, a critical success — at +0 it's 20 against DC 30, a failure, PF2e's natural 20 one step up.)
            await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Religion bonus`, type: "effect", system: { duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: [{ key: "FlatModifier", selector: "religion", type: "untyped", value: 15 }] } }]);
            const prism = await h.give(user, "Essence Prism");
            await userToken.object?.control?.();
            await h.target();
            let since = Date.now();
            await api().activate(prism.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the prism's own-check card" });
            const labels = (stateOf(card).plan.checkChoices ?? []).map((choice) => choice.label);
            const religion = labels.indexOf("Spiritual essence: Religion");
            h.assert(stateOf(card).own && labels.length === 8 && religion >= 0, `its user's own check, of eight picks (own: ${stateOf(card).own}; ${labels.join(", ")})`);
            since = Date.now();
            await api().apply(card.id, { checkChoice: religion });
            const check = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's Religion card" });
            const rolled = abilityOf(check).plan.resolution.check;
            h.assert(rolled.statistic === "religion" && Number(rolled.against?.value) === 30 && rolled.secret === true, `Religion against DC 30, secret (${JSON.stringify(rolled)})`);
            const targets = abilityOf(check).targets ?? [];
            h.assert(targets.length === 1 && targets[0].actorUuid === user.uuid && targets[0].tokenUuid === userToken.uuid, `at its user's own token (${JSON.stringify(targets)})`);
            since = Date.now();
            await h.withDie(20, () => h.rollAndApply(check));
            const set = () => user.itemTypes.effect.find((effect) => /^Essence Prism\b/.test(effect.name) && /the quality its user chose, of spiritual essence/.test(effect.system.description?.value ?? ""));
            await h.until(set, `the prism set for the quality it chose, of spiritual essence (${effects(user)})`, { timeout: 10000 });
            const roll = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && message.actor?.id === user.id && message.flags?.pf2e?.context?.type === "skill-check").at(-1) ?? null;
            return { degree: abilityOf(check).targets?.[0]?.degree ?? null, effect: set().name, roll: roll ? { whisper: roll.whisper?.length ?? 0, blind: Boolean(roll.blind), total: roll.rolls?.[0]?.total ?? null } : null };
        },

        // Cayden's Tankard's second activation (2026-10-27, artifact-readings.js; scripts/live.js reduce granter "ends"): "ending the controlled,
        // Grabbed, Immobilized, Paralyzed, Restrained, and slowed conditions on yourself and creatures of your choice … Any effect causing these
        // conditions ends, and if the source of the effect is an item, that item can't produce the effect for 1 week, provided it is of a level
        // lower than the tankard's." An ally Grabbed by a grab's Effect (PF2e's GrantItem of Grabbed, its origin a level-0 Rope of the grabber's)
        // and its user Slowed by a spell's Effect (GrantItem of Slowed): the tankard used with the ally targeted, both Effects are deleted, the
        // ally no longer Grabbed, its user no longer Slowed, and the card names each Effect — the grab's with the rope's week.
        async b4G1CaydensTankardEndsGranters(scene) {
            await h.clearSquares(scene, [[4, 6], [5, 6], [6, 6]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Tankard Drinker", { type: "character", x: 4, y: 6 });
            const { actor: ally, token: allyToken } = await h.creature(scene, "Grabbed Ally", { x: 5, y: 6 });
            const { actor: grabber, token: grabberToken } = await h.creature(scene, "Grabbing Brute", { x: 6, y: 6, alliance: "opposition" });
            const rope = await h.give(grabber, "Rope");
            const origin = (item) => ({ context: { origin: { actor: grabber.uuid, token: grabberToken.uuid, item: item?.uuid ?? null, spellcasting: null, rollOptions: [] }, target: null, roll: null } });
            const hold = await fixtureEffect(ally, "Grab Hold", [{ key: "GrantItem", uuid: GRABBED }], origin(rope));
            const slow = await fixtureEffect(user, "Slow Spell", [{ key: "GrantItem", uuid: SLOWED }], origin(null));
            const grantedBy = (actor, slug) => actor.getCondition?.(slug)?.flags?.pf2e?.grantedBy?.id ?? null;
            await h.until(() => grantedBy(ally, "grabbed") === hold.id && grantedBy(user, "slowed") === slow.id, `Grabbed and Slowed granted by the Effects (ally: ${conditions(ally)}; user: ${conditions(user)})`, { timeout: 8000 });
            h.assert(hold.system.context?.origin?.item === rope.uuid, `the grab's origin the rope (${JSON.stringify(hold.system.context)})`);
            const tankard = await h.give(user, "Cayden's Tankard");
            await tankard.update(held(1));
            await userToken.object?.control?.();
            const since = Date.now();
            await api().activate(tankard.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the tankard's card" });
            await api().apply(card.id, { targets: [allyToken.uuid] });
            await h.until(() => !ally.hasCondition("grabbed") && !user.hasCondition("slowed"), `Grabbed and Slowed ended (ally: ${conditions(ally)}; user: ${conditions(user)})`, { timeout: 10000 });
            h.assert(!ally.items.get(hold.id) && !user.items.get(slow.id), `both granting Effects deleted (ally: ${effects(ally)}; user: ${effects(user)})`);
            const lines = resultsOf(card);
            h.assert(lines.some((line) => line.includes(`${hold.name} ends`) && /Rope can't produce it again for 1 week/.test(line)), `the grab's Effect named, the rope kept from it for a week (${JSON.stringify(lines)})`);
            h.assert(lines.some((line) => line.includes(`${slow.name} ends`) && !/can't produce it again/.test(line)), `the spell's Effect named (${JSON.stringify(lines)})`);
            return { results: lines };
        },

        // Slithermaw's Bane (Heroic)'s Terrain Adaptation (2026-10-27, artifact-readings.js; scripts/until-rest.js replacedBy and setUpUntilRest,
        // src/live/card.js ruleEffectSource/temperatureEffectSource untilRest and replaces): "You ignore difficult terrain within the chosen
        // environment and gain a +2 circumstance bonus to saving throws against environmental hazards … You're also protected from severe and
        // extreme heat or severe and extreme cold … until your next daily preparations or the next time you activate it". The ways card's eighteen:
        // "Forest, protected from cold" gives its wearer the rule Effect (PF2e's difficult terrain ignored in a forest — its
        // system.movement.terrain.difficult.ignored —, +2 circumstance to saves there) and the temperature Effect (severe cold counts as mild).
        // Activated again, "Desert, protected from heat": one of each still, the desert's and the heat's, the forest's gone. PF2e's Rest for the
        // Night: both gone.
        async b4G1TerrainAdaptationRest(scene) {
            await h.clearSquares(scene, [[4, 8]]);
            const { actor: wearer } = await h.creature(scene, "Slithermaw Wearer", { type: "character", x: 4, y: 8, level: 20 });
            const armor = await h.give(wearer, "Slithermaw's Bane (Heroic)");
            await armor.update({ ...invested, "system.equipped.inSlot": true });
            const index = await activationOf(armor, "Terrain Adaptation", 2);
            const adapt = async (wayName) => {
                let since = Date.now();
                await api().activate(armor.uuid, index);
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "Terrain Adaptation's ways card" });
                const all = stateOf(ways).plan.ways.map((way) => way.name);
                const at = all.indexOf(wayName);
                h.assert(all.length === 18 && at >= 0, `"${wayName}" among its eighteen ways (${all.join(" | ")})`);
                since = Date.now();
                await api().apply(ways.id, { choice: at });
                const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && message.id !== ways.id, { what: `${wayName}'s card` });
                await api().apply(card.id);
                return card;
            };
            const rules = () => wearer.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.ruleEffect === "Terrain Adaptation");
            const temperatures = () => wearer.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.temperature);
            const counts = () => temperatures()[0]?.flags?.[ENV]?.temperature?.counts ?? {};
            const ignored = () => JSON.stringify(wearer.system.movement?.terrain?.difficult?.ignored ?? []);
            await adapt("Forest, protected from cold");
            await h.until(() => rules().length === 1 && temperatures().length === 1, `the rule Effect and the temperature Effect (${effects(wearer)})`, { timeout: 8000 });
            const forest = rules()[0];
            const save = (forest.system.rules ?? []).find((rule) => rule.key === "FlatModifier");
            h.assert(forest.flags[h.NS].untilRest && forest.flags[h.NS].replaces && [].concat(save?.selector).includes("saving-throw") && save.type === "circumstance" && Number(save.value) === 2 && JSON.stringify(save.predicate ?? []).includes("terrain:forest"), `until rest, in place of the last, +2 circumstance to saves in a forest (${JSON.stringify({ flags: forest.flags[h.NS], save })})`);
            await h.until(() => ignored().includes('"forest"'), `PF2e's difficult terrain ignored in a forest (${ignored()})`, { timeout: 5000 });
            h.assert(counts()["severe-cold"] === "mild-cold" && counts()["extreme-cold"] === "mild-cold" && !counts()["severe-heat"] && temperatures()[0].flags[h.NS].untilRest, `severe and extreme cold count as mild, until rest (${JSON.stringify(counts())})`);
            const cold = temperatures()[0].id;
            await adapt("Desert, protected from heat");
            await h.until(() => rules().length === 1 && rules()[0].id !== forest.id && temperatures().length === 1 && temperatures()[0].id !== cold, `the desert's two in place of the forest's (${effects(wearer)})`, { timeout: 8000 });
            h.assert(counts()["severe-heat"] === "mild-heat" && !counts()["severe-cold"], `the heat's protection now, not the cold's (${JSON.stringify(counts())})`);
            await h.until(() => ignored().includes('"desert"') && !ignored().includes('"forest"'), `difficult terrain ignored in a desert, no longer a forest (${ignored()})`, { timeout: 5000 });
            Hooks.callAll("pf2e.restForTheNight", wearer);
            await h.until(() => !rules().length && !temperatures().length, `both gone at its daily preparations (${effects(wearer)})`, { timeout: 8000 });
            return { forest: forest.name, ignoredAfter: ignored() };
        },

        // The Beating (2026-10-27, artifact-readings.js castZone; scripts/casts.js startItemZone after the cast): "you cast Pernicious Poltergeist,
        // and the area of the spell is treated as difficult terrain". A 14th-level user with a spell DC (26): the cast card, the creature in the
        // burst targeted, the spell module casts Pernicious Poltergeist; then the ability module's zone placement starts (its placement click
        // stood in for — on this, the applying active GM's client): a 10-foot burst with PF2e's difficult terrain (a modifyMovementCost
        // behaviour) for the spell's minute, and the card's line to place it.
        async b4G1BeatingDifficultTerrain(scene) {
            assertSpells();
            await h.clearSquares(scene, [[4, 10], [7, 10]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Beating Bearer", { x: 4, y: 10, level: 14 });
            const { token: foeToken } = await h.creature(scene, "Beating Mark", { x: 7, y: 10, alliance: "opposition", hp: 200 });
            await user.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Occult Innate`, type: "spellcastingEntry", system: { spelldc: { value: 16, dc: 26 }, tradition: { value: "occult" }, prepared: { value: "innate" } } }]);
            await h.until(() => Number(user.system.attributes.spellDC?.value) === 26, `its spell DC 26 (${user.system.attributes.spellDC?.value})`, { timeout: 8000 });
            const beating = await h.give(user, "The Beating");
            await beating.update(invested);
            await userToken.object?.control?.();
            const zone = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /The Beating/.test(region.name));
            const placing = canvas.regions.placeRegion;
            const placements = [];
            canvas.regions.placeRegion = async (data) => {
                placements.push({ user: game.user.id, zone: Boolean(data?.flags?.[ABILITY]?.zone), name: data?.name ?? null });
                return (await scene.createEmbeddedDocuments("Region", [data]))[0];
            };
            try {
                let since = Date.now();
                await api().activate(beating.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("cast"), { what: "The Beating's cast card" });
                h.assert(stateOf(card).plan.castZone?.zone?.terrain?.[0]?.difficulty === 2, `its zone of difficult terrain beside the cast (${JSON.stringify(stateOf(card).plan.castZone?.zone ?? null)})`);
                since = Date.now();
                await api().apply(card.id, { targets: [foeToken.uuid] });
                await h.until(() => resultsOf(card).some((line) => /casts Pernicious Poltergeist/.test(line)) && resultsOf(card).some((line) => /Place its difficult terrain over Pernicious Poltergeist's area/.test(line)), `the cast, then the zone's line (${JSON.stringify(resultsOf(card))})`, { timeout: 15000 });
                await h.until(zone, `the difficult terrain's zone (${scene.regions.map((region) => region.name).join(", ") || "no regions"})`, { timeout: 8000 });
                const flags = zone().flags[ABILITY].zone;
                const terrain = zone().behaviors.find((behavior) => behavior.type === "modifyMovementCost");
                h.assert(terrain && flags.zone.area?.type === "burst" && Number(flags.zone.area.value) === 10 && Number(flags.zone.lasts?.value) === 1 && flags.zone.lasts.unit === "minutes", `a 10-foot burst of difficult terrain for 1 minute (${JSON.stringify({ area: flags.zone.area, lasts: flags.zone.lasts, behaviours: zone().behaviors.map((behavior) => behavior.type) })})`);
                const placed = placements.filter((entry) => entry.zone);
                h.assert(placed.length === 1 && placed[0].user === game.user.id && game.users.activeGM?.isSelf, `placed once, on the applying active GM's client (${JSON.stringify(placements)})`);
                const cast = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && message.flags?.[SPELLS]?.castFromItem).at(-1);
                return { results: resultsOf(card), placedBy: game.users.get(placed[0].user)?.name ?? null, cast: cast?.flags?.[SPELLS]?.castFromItem ?? null, difficulties: terrain.system?.difficulties ?? null };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of scene.regions.filter((entry) => /The Beating/.test(entry.name))) await region.delete().catch(() => null);
                await closeSpellDialogs(/Pernicious Poltergeist|The Beating/);
            }
        },

        // The Crows (2026-10-27, artifact-readings.js dropHeld one/take/attended/maxBulk; scripts/drop-held.js, src/live/drop-card.js listedItems):
        // an object of its user's choice (2 Bulk or less) taken by its user's Thievery against the creature's Reflex DC: into its user's hand on a
        // critical success, on the ground between them on a success. Two
        // ogres, each holding a greatsword (2 Bulk), wearing full plate (4) and with a dagger inside its worn backpack, their Reflex DCs set so a
        // d20 of 10 critically succeeds at the one and succeeds at the other. The Thievery card at both, then the object card: for each, the
        // greatsword listed and the full plate and the contained dagger not, nothing ticked; the first "into its user's hand", the second
        // "dropped". Each greatsword ticked: the first is moved into the user's hand (PF2e's transfer, held) and gone from the ogre, the second
        // dropped by its ogre.
        async b4G1CrowsTakeOrDrop(scene) {
            await h.clearSquares(scene, [[4, 12], [6, 12], [7, 12]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Crows Thief", { type: "character", x: 4, y: 12 });
            const thievery = Number(user.skills?.thievery?.mod);
            h.assert(Number.isFinite(thievery), `its Thievery modifier (${user.skills?.thievery?.mod})`);
            const ogre = async (name, x, save) => {
                const { actor, token } = await h.creature(scene, name, { x, y: 12, save, alliance: "opposition" });
                const sword = await h.give(actor, "Greatsword");
                await sword.update(held(2));
                const plate = await h.give(actor, "Full Plate");
                await plate.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true });
                const pack = await h.give(actor, "Backpack");
                await pack.update({ "system.equipped.carryType": "worn" });
                const dagger = await h.give(actor, "Dagger");
                await dagger.update({ "system.containerId": pack.id, "system.equipped.carryType": "worn" });
                return { actor, token, sword, plate, dagger };
            };
            // (Reflex DC = 10 + its save: its Thievery + 0 for the first — a d20 of 10 is 10 over it —, its Thievery + 10 for the second.)
            const near = await ogre("Crows Ogre Near", 6, thievery - 10);
            const far = await ogre("Crows Ogre Far", 7, thievery);
            const crows = await h.give(user, "The Crows");
            await crows.update(invested);
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(crows.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "The Crows' card" });
            since = Date.now();
            await api().apply(card.id, { targets: [near.token.uuid, far.token.uuid] });
            const check = await h.messageAfter(since, h.abilitySaveCard, { what: "the Thievery card" });
            h.assert(abilityOf(check).plan.resolution.check.statistic === "thievery", `its user's Thievery (${JSON.stringify(abilityOf(check).plan.resolution.check)})`);
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(check));
            const drop = await h.messageAfter(since, h.itemCard("drop"), { what: "the object card", timeout: 10000 });
            const degrees = Object.fromEntries((abilityOf(check).targets ?? []).map((target) => [target.actorUuid, target.degree]));
            h.assert(degrees[near.actor.uuid] === "criticalSuccess" && degrees[far.actor.uuid] === "success", `a critical success and a success (${JSON.stringify(degrees)})`);
            const entries = stateOf(drop).entries ?? [];
            const a = entries.findIndex((entry) => entry.actorUuid === near.actor.uuid);
            const b = entries.findIndex((entry) => entry.actorUuid === far.actor.uuid);
            h.assert(a >= 0 && b >= 0 && entries[a].take && !entries[b].take, `the first into its user's hand, the second dropped (${JSON.stringify(entries.map((entry) => ({ name: entry.name, take: entry.take ?? false })))})`);
            for (const [at, one] of [[a, near], [b, far]]) {
                const listed = entries[at].held.map((item) => item.id);
                h.assert(listed.includes(one.sword.id) && !listed.includes(one.plate.id) && !listed.includes(one.dagger.id) && entries[at].held.every((item) => !item.ticked), `${one.actor.name}: its greatsword listed, not its full plate (4 Bulk) nor the dagger in its backpack, none ticked (${JSON.stringify(entries[at].held)})`);
            }
            const tick = (at, one) => `${at}:${entries[at].held.findIndex((item) => item.id === one.sword.id)}`;
            await api().apply(drop.id, { ticked: [tick(a, near), tick(b, far)] });
            const taken = () => user.items.find((item) => item.name === "Greatsword" && item.system.equipped?.carryType === "held");
            await h.until(() => taken() && !near.actor.items.get(near.sword.id), `the first greatsword in the user's hand, gone from its ogre (user: ${user.items.map((item) => `${item.name} ${item.system.equipped?.carryType ?? ""}`).join(", ")})`, { timeout: 8000 });
            await h.until(() => far.actor.items.get(far.sword.id)?.system.equipped?.carryType === "dropped", `the second dropped (${far.actor.items.get(far.sword.id)?.system.equipped?.carryType})`, { timeout: 8000 });
            h.assert(near.actor.items.get(near.plate.id) && far.actor.items.get(far.sword.id), "nothing else moved");
            return { degrees, results: resultsOf(drop) };
        },

        // The Juggler (2026-10-27, artifact-readings.js; src/live/route.js targetedRow for plan.dropHeld, scripts/drop-held.js take): "Trigger An
        // item of 1 Bulk or less falls within your reach … You grab the triggering item." Its automatic row at the creature it came from, the one
        // targeted: once the ability module's card applies, the object card lists that creature's dropped dagger (light) and not its greatsword
        // (2 Bulk); the dagger ticked, it's moved into the user's hand, held.
        async b4G1JugglerCatch(scene) {
            await h.clearSquares(scene, [[4, 14], [6, 14]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Juggler Catcher", { type: "character", x: 4, y: 14 });
            const { actor: thrower, token: throwerToken } = await h.creature(scene, "Juggler Dagger Thrower", { x: 6, y: 14, alliance: "opposition" });
            const dagger = await h.give(thrower, "Dagger");
            await dagger.update({ "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 });
            const sword = await h.give(thrower, "Greatsword");
            await sword.update(held(2));
            const juggler = await h.give(user, "The Juggler");
            await juggler.update(invested);
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(juggler.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "The Juggler's card at the creature" });
            since = Date.now();
            await api().apply(card.id, { targets: [throwerToken.uuid] });
            const row = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's card" });
            since = Date.now();
            await h.applyAbilityCard(row);
            const drop = await h.messageAfter(since, h.itemCard("drop"), { what: "the object card", timeout: 10000 });
            const entry = stateOf(drop).entries?.[0];
            const listed = (entry?.held ?? []).map((item) => item.id);
            h.assert(entry?.take && entry.actorUuid === thrower.uuid && listed.includes(dagger.id) && !listed.includes(sword.id), `the thrower's dagger listed for its user's hand, not its greatsword (${JSON.stringify(entry)})`);
            await api().apply(drop.id, { ticked: [`0:${listed.indexOf(dagger.id)}`] });
            const caught = () => user.items.find((item) => item.name === "Dagger" && item.system.equipped?.carryType === "held");
            await h.until(() => caught() && !thrower.items.get(dagger.id), `the dagger in the user's hand, gone from the thrower (${user.items.map((item) => item.name).join(", ")})`, { timeout: 8000 });
            return { results: resultsOf(drop) };
        },

        // The Rakshasa (2026-10-27, artifact-readings.js item.hpLoss; scripts/live.js loseHitPoints, scripts/immunity.js immunity.on "targets"):
        // "You regain Hit Points equal to twice your level, and a pledged follower of your choice loses Hit Points equal to your level (no effects
        // apply that would decrease this Hit Point loss). If this loss kills your pledged follower, you also gain temporary Hit Points equal to your
        // level. The pledged follower is temporarily immune to this activation for 24 hours." A 20th-level user at 10 of 50 Hit Points: Apply
        // with none targeted refused; with its follower (15 Hit Points) targeted, the user is at 50, the follower at 0 (PF2e's final damage, 20),
        // the user has 20 temporary Hit Points, and the follower — not the user — has the "Immune:" Effect. Used again at it: refused, still immune.
        async b4G1RakshasaFollower(scene) {
            await h.clearSquares(scene, [[4, 16], [5, 16]]);
            const { actor: user } = await h.creature(scene, "Rakshasa Holder", { x: 4, y: 16, level: 20, hp: 10 });
            const { actor: follower, token: followerToken } = await h.creature(scene, "Pledged Follower", { x: 5, y: 16, hp: 15 });
            const rakshasa = await h.give(user, "The Rakshasa");
            await rakshasa.update(invested);
            let since = Date.now();
            await api().activate(rakshasa.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "The Rakshasa's card" });
            let untargeted = null;
            await api().apply(card.id, { targets: [] }).catch((error) => { untargeted = error.message; });
            h.assert(/Target the one creature that loses the Hit Points/.test(untargeted ?? "") && hp(user) === 10, `refused with none targeted, nothing done (${untargeted}; ${hp(user)} HP)`);
            await api().apply(card.id, { targets: [followerToken.uuid] });
            await h.until(() => hp(follower) === 0 && hp(user) === 50 && temp(user) === 20, `the user healed 40 and given 20 temporary Hit Points, the follower at 0 (user ${hp(user)} + ${temp(user)}, follower ${hp(follower)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
            const immune = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.immunity === "the-rakshasa" || /^Immune:.*Rakshasa/i.test(effect.name));
            await h.until(() => immune(follower).length === 1, `the follower's "Immune:" Effect (${effects(follower)})`, { timeout: 8000 });
            h.assert(!immune(user).length, `none on its user (${effects(user)})`);
            h.assert(resultsOf(card).some((line) => /loses 20 Hit Points/.test(line)) && resultsOf(card).some((line) => /is killed by it: .* gains 20 temporary Hit Points/.test(line)), `its lines (${JSON.stringify(resultsOf(card))})`);
            since = Date.now();
            await api().activate(rakshasa.uuid, 0);
            const again = await h.messageAfter(since, h.itemCard("item"), { what: "The Rakshasa's second card" });
            let refused = null;
            await api().apply(again.id, { targets: [followerToken.uuid] }).catch((error) => { refused = error.message; });
            h.assert(/still immune to The Rakshasa/.test(refused ?? ""), `the second use at it refused (${refused})`);
            return { refused, results: resultsOf(card), immune: immune(follower).map((effect) => effect.name) };
        },

        // The Wanderer (2026-10-27, artifact-readings.js; src/live/objects-card.js anyItemChoices, scripts/objects.js objects.lasts and
        // whileAttended, scripts/expiring.js): "an object of Light bulk in your hand. The object can be any Common permanent magic item, weapon, or
        // piece of gear of a level no higher than your level -2. The item exists for 1 minute, or until it is no longer attended by you". A 12th-level
        // user: every item the card offers is a common permanent PF2e item (weapon, armor, shield, equipment, container) of level 10 or less and
        // Light Bulk or less, the Dagger among them and the Longsword (1 Bulk) not. The Dagger picked: in the user's hand, ending a minute on;
        // dropped, it's gone. Made again: once its minute is up (its end moved to a second from now), it's gone too.
        async b4G1WandererObject(scene) {
            await h.clearSquares(scene, [[4, 18]]);
            const { actor: user } = await h.creature(scene, "Wanderer Juggler", { type: "character", x: 4, y: 18, level: 12 });
            const wanderer = await h.give(user, "The Wanderer");
            await wanderer.update(invested);
            const index = await game.packs.get("pf2e.equipment-srd").getIndex({ fields: ["system.level.value", "system.traits.rarity", "system.traits.value", "system.bulk.value"] });
            const PERMANENT = ["weapon", "armor", "shield", "equipment", "backpack"];
            const conjure = async () => {
                const since = Date.now();
                await api().activate(wanderer.uuid, 0);
                return h.messageAfter(since, h.itemCard("objects"), { what: "The Wanderer's objects card" });
            };
            const made = () => user.items.find((item) => item.flags?.[h.NS]?.made?.whileAttended && /^Dagger \(/.test(item.name));
            const card = await conjure();
            const choices = stateOf(card).choices ?? [];
            const wrong = choices.filter((choice) => {
                const row = index.get(choice.id);
                return !row || !PERMANENT.includes(row.type) || (row.system?.traits?.rarity ?? "common") !== "common" || (Number(row.system?.level?.value) || 0) > 10 || (Number(row.system?.bulk?.value) || 0) > 0.1 || (row.system?.traits?.value ?? []).includes("artifact");
            });
            h.assert(choices.length > 20 && !wrong.length, `${choices.length} items, all common, permanent, level 10 or less, Light Bulk at most (not so: ${wrong.slice(0, 5).map((choice) => choice.name).join(", ")})`);
            const daggerAt = (state) => (state.choices ?? []).findIndex((choice) => choice.name === "Dagger (level 0)");
            h.assert(daggerAt(stateOf(card)) >= 0 && !choices.some((choice) => /^Longsword \(/.test(choice.name)), "the Dagger offered, the Longsword (1 Bulk) not");
            await api().apply(card.id, { pick: daggerAt(stateOf(card)) });
            await h.until(made, `the dagger made (${user.items.map((item) => item.name).join(", ")})`, { timeout: 8000 });
            const first = made();
            h.assert(first.system.equipped?.carryType === "held" && Math.abs(Number(first.flags[h.NS].expiresAt) - game.time.worldTime - 60) <= 1, `in hand, for a minute (${first.system.equipped?.carryType}, ends in ${Number(first.flags[h.NS].expiresAt) - game.time.worldTime} s)`);
            await first.update({ "system.equipped.carryType": "dropped", "system.equipped.handsHeld": 0 });
            await h.until(() => !user.items.get(first.id), "the dropped dagger gone", { timeout: 8000 });
            const second = await conjure();
            await api().apply(second.id, { pick: daggerAt(stateOf(second)) });
            await h.until(made, "the dagger made again", { timeout: 8000 });
            const next = made();
            await next.update({ [`flags.${h.NS}.expiresAt`]: game.time.worldTime + 1 });
            await game.time.advance(1);
            await h.until(() => !user.items.get(next.id), "the dagger gone once its minute is up", { timeout: 8000 });
            return { offered: choices.length, results: resultsOf(card) };
        },

        // Blood-Drinker's Drink Blood (2026-10-27, artifact-readings.js levelTemp ifHeld; scripts/live.js): "You gain a number of temporary Hit
        // Points equal to twice the creature's level. If you're also wielding Fleshrender in your other hand, you instead gain temporary Hit Points
        // equal to three times the creature's level. These Hit Points remain for 1 minute." Its user holding Blood-Drinker and Fleshrender, the
        // 8th-level creature it felled targeted: 24 temporary Hit Points for 1 minute (the ability module's TempHP Effect). Fleshrender put away
        // (worn, not held) and the Hit Points gone: 16.
        async b4G1BloodDrinkerFleshrender(scene) {
            await h.clearSquares(scene, [[8, 4], [9, 4]]);
            const { actor: user } = await h.creature(scene, "Blood Drinker", { x: 8, y: 4, level: 18, hp: 200 });
            const { token: felledToken } = await h.creature(scene, "Felled Victim", { x: 9, y: 4, level: 8, hp: 0, alliance: "opposition" });
            const drinker = await h.give(user, "Blood-Drinker");
            await drinker.update(held(1));
            const render = await h.give(user, "Fleshrender");
            await render.update(held(1));
            const index = await activationOf(drinker, "Drink Blood", 0);
            const tempEffects = () => user.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.tempHp);
            const drink = async () => {
                const since = Date.now();
                await api().activate(drinker.uuid, index);
                const card = await h.messageAfter(since, h.itemCard("item"), { what: "Drink Blood's card" });
                await api().apply(card.id, { targets: [felledToken.uuid] });
                await h.until(() => tempEffects().length === 1, `its temporary Hit Points' Effect (${effects(user)}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                const effect = tempEffects()[0];
                return { amount: Number(effect.flags[ABILITY].tempHp.amount), rule: (effect.system.rules ?? []).find((rule) => rule.key === "TempHP"), duration: effect.system.duration, results: resultsOf(card) };
            };
            const both = await drink();
            h.assert(both.amount === 24 && Number(both.rule?.value) === 24 && Number(both.duration?.value) === 1 && both.duration.unit === "minutes", `24 temporary Hit Points for 1 minute with Fleshrender held too (${JSON.stringify(both)})`);
            await h.until(() => temp(user) === 24, `24 temporary Hit Points on its user (${temp(user)})`, { timeout: 5000 });
            await user.deleteEmbeddedDocuments("Item", tempEffects().map((effect) => effect.id));
            await user.update({ "system.attributes.hp.temp": 0 });
            await render.update({ "system.equipped.carryType": "worn", "system.equipped.handsHeld": 0 });
            await h.until(() => temp(user) === 0 && !tempEffects().length, "its temporary Hit Points gone", { timeout: 5000 });
            const one = await drink();
            h.assert(one.amount === 16 && Number(one.rule?.value) === 16, `16 with Fleshrender not held (${JSON.stringify(one)})`);
            return { both: both.amount, one: one.amount };
        },

        // The Guiding Chisel (2026-10-27, artifact-readings.js plan.structure; src/live/structure-card.js, scripts/structure.js, the environment
        // module's api.placeStructure and removeStructure): "The building can take any shape you wish, filling up to ten contiguous 10-foot cubes
        // … The building lasts until you use the chisel to create another building." Its structure card offers three squares (30 feet across one
        // story high, 20 across two, 10 across ten); the 30-foot one placed at the lab's middle (the click given as the destination): the
        // environment module's hewn stone walls with a stone door in the south wall, the creature standing inside pushed out, the structure's id
        // kept on the chisel, its card's line. Used again for the 20-foot one elsewhere: the first building's walls gone, the new one's id kept.
        async b4G1GuidingChiselBuilding(scene) {
            h.assert(game.modules.get(ENV)?.active && game.modules.get(ENV).api?.placeStructure && game.modules.get(ENV).api?.placedStructures, "PF2e Automatic Environment Resolution with api.placeStructure active in pftest");
            const env = game.modules.get(ENV).api;
            // (Its two buildings' squares cleared of earlier cases' tokens — the first 7–12 across and down, the second 13–16 across, 2–5 down —, and
            // its user's.)
            const square = (left, top, across) => Array.from({ length: across * across }, (_, at) => [left + (at % across), top + Math.floor(at / across)]);
            await h.clearSquares(scene, [[18, 1], ...square(7, 7, 6), ...square(13, 2, 4)]);
            const { actor: user, token: userToken } = await h.creature(scene, "Chisel Mason", { type: "character", x: 18, y: 1, level: 16 });
            const { token: bystander } = await h.creature(scene, "Chisel Bystander", { x: 9, y: 9 });
            const chisel = await h.give(user, "Guiding Chisel");
            await chisel.update(held(1));
            await userToken.object?.control?.();
            const size = canvas.grid.size;
            const build = async (choice, at) => {
                const since = Date.now();
                await api().activate(chisel.uuid, 0);
                const card = await h.messageAfter(since, h.itemCard("structure"), { what: "the chisel's structure card" });
                const sizes = (stateOf(card).plan.structure?.sizes ?? []).map((one) => [one.feet, one.height]);
                h.assert(JSON.stringify(sizes) === JSON.stringify([[30, 10], [20, 20], [10, 100]]), `its three squares (${JSON.stringify(sizes)})`);
                await api().apply(card.id, { choice, destination: at });
                await h.until(() => stateOf(card)?.status === "applied", `the card applied (${JSON.stringify(resultsOf(card))})`, { timeout: 10000 });
                return card;
            };
            const ours = () => (env.placedStructures(scene) ?? []).filter((entry) => entry.source?.itemUuid === chisel.uuid);
            const flag = () => chisel.getFlag(h.NS, "structure") ?? null;
            const wallsOf = (id) => scene.walls.filter((wall) => wall.flags?.[ENV]?.structure?.placed?.id === id);
            try {
                const first = await build(0, { x: 10 * size, y: 10 * size });
                await h.until(() => ours().length === 1 && flag()?.id === ours()[0].id && flag()?.sceneId === scene.id, `one building, its id on the chisel (${JSON.stringify({ placed: ours(), flag: flag() })})`, { timeout: 8000 });
                const firstId = ours()[0].id;
                const walls = wallsOf(firstId);
                const door = walls.find((wall) => wall.door === CONST.WALL_DOOR_TYPES.DOOR);
                h.assert(walls.length >= 4 && walls.filter((wall) => wall !== door).every((wall) => wall.flags[ENV].structure.kind === "wall-hewn"), `hewn stone walls (${walls.map((wall) => wall.flags[ENV].structure.kind).join(", ")})`);
                // (The 30-foot square round the middle: from 7 to 13 squares across and down, its south side at 13.)
                h.assert(door && door.c[1] === 13 * size && door.c[3] === 13 * size && door.flags[ENV].structure.kind === "door-stone", `a stone door in the south wall (${JSON.stringify(door ? { c: door.c, kind: door.flags[ENV].structure.kind } : null)})`);
                const inside = (token) => token.x >= 7 * size && token.x < 13 * size && token.y >= 7 * size && token.y < 13 * size;
                await h.until(() => !inside(bystander), `the bystander pushed out (${bystander.x / size}, ${bystander.y / size})`, { timeout: 5000 });
                h.assert(resultsOf(first).some((line) => /A 30-foot-square building, 10 feet high \(9 cubes\) stands there; 1 creature moved out of it/.test(line)), `its line (${JSON.stringify(resultsOf(first))})`);
                const second = await build(1, { x: 15 * size, y: 4 * size });
                await h.until(() => ours().length === 1 && ours()[0].id !== firstId && flag()?.id === ours()[0].id, `the second building alone, its id on the chisel (${JSON.stringify({ placed: ours(), flag: flag() })})`, { timeout: 8000 });
                h.assert(!wallsOf(firstId).length && wallsOf(ours()[0].id).length >= 4, `the first building's walls gone (${wallsOf(firstId).length} left)`);
                h.assert(resultsOf(second).some((line) => /Its last building is gone/.test(line)) && resultsOf(second).some((line) => /A 20-foot-square building, 20 feet high/.test(line)), `its lines (${JSON.stringify(resultsOf(second))})`);
                return { first: resultsOf(first), second: resultsOf(second), walls: walls.length };
            } finally {
                // (Its walls off the lab, so no later case meets them.)
                for (const entry of ours()) await env.removeStructure(scene, entry.id).catch(() => null);
            }
        },

        // Soulheart (Major)'s Bolster Maiserene Phantom (src/compiler/unique-rules.js withPhantomBolster — kept at the merge over the first group's —;
        // scripts/live.js bolsterPhantom): "When touched to a rank 2 Maiserene phantom, the soulheart flashes with bright red light and is destroyed.
        // As it does so, it permanently increases the targeted phantom to rank 3, and increases each PC's maximum Hit Points by 3 for as long as
        // they remain within Bastardhall". The PCs are PF2e's active party's members: for the case two fixture PCs alone (its members put back after;
        // with no party, the characters players own — the fixtures given to a player). The phantom targeted and Applied: its "rank 3" note Effect,
        // each PC an Effect of PF2e's FlatModifier +3 to Hit Points (its maximum 3 higher), and the soulheart gone from its user. A second soulheart
        // spent so: each PC's same Effect at +6, still one each. (No such Effect may be on any actor before: the case won't touch another's; any it
        // made is deleted after.)
        async b4G1SoulheartPhantom(scene) {
            await h.clearSquares(scene, [[12, 4], [13, 4], [12, 6], [13, 6]]);
            const { actor: user } = await h.creature(scene, "Soulheart Bearer", { type: "character", x: 12, y: 4 });
            const { actor: pcA } = await h.creature(scene, "Bastardhall PC A", { type: "character", x: 12, y: 6 });
            const { actor: pcB } = await h.creature(scene, "Bastardhall PC B", { type: "character", x: 13, y: 6 });
            const { actor: phantom, token: phantomToken } = await h.creature(scene, "Maiserene Phantom", { x: 13, y: 4 });
            const KEY = "soulheart-major-bastardhall";
            const bolsters = () => game.actors.contents.flatMap((actor) => (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[h.NS]?.partyHp?.key === KEY).map((effect) => ({ actor, effect })));
            h.assert(!bolsters().length, `no soulheart's Hit Points Effect on any actor before (${bolsters().map(({ actor }) => actor.name).join(", ")}): the case won't touch another's`);
            const maxBefore = [pcA, pcB].map((pc) => Number(pc.system.attributes.hp.max) || 0);
            const party = game.actors.party;
            const members = party ? foundry.utils.deepClone(party._source.system?.details?.members ?? []) : null;
            try {
                if (party) {
                    await party.update({ "system.details.members": [{ uuid: pcA.uuid }, { uuid: pcB.uuid }] });
                    await h.until(() => party.members.length === 2 && [pcA, pcB].every((pc) => party.members.includes(pc)), `the two PCs alone in ${party.name} (${party.members.map((member) => member.name).join(", ")})`, { timeout: 5000 });
                } else {
                    const player = game.users.find((one) => !one.isGM && one.role >= CONST.USER_ROLES.PLAYER);
                    h.assert(player, "No party and no player in pftest: the soulheart has no PCs to find.");
                    for (const pc of [pcA, pcB]) await pc.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
                    await h.until(() => pcA.hasPlayerOwner && pcB.hasPlayerOwner, "the two PCs owned by a player", { timeout: 5000 });
                }
                const hpRule = (pc) => (pc.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.partyHp?.key === KEY)?.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("hp"));
                const bolster = async () => {
                    const heart = await h.give(user, "Soulheart (Major)");
                    const index = await activationOf(heart, "Bolster Maiserene Phantom", 1);
                    const since = Date.now();
                    await api().activate(heart.uuid, index);
                    const card = await h.messageAfter(since, h.itemCard("item"), { what: "the soulheart's card" });
                    await api().apply(card.id, { targets: [phantomToken.uuid] });
                    await h.until(() => !user.items.get(heart.id), `the soulheart destroyed (${user.items.map((item) => item.name).join(", ")}; ${JSON.stringify(resultsOf(card))})`, { timeout: 8000 });
                    return card;
                };
                const first = await bolster();
                await h.until(() => [pcA, pcB].every((pc) => Number(hpRule(pc)?.value) === 3), `+3 maximum Hit Points on each PC (${[pcA, pcB].map((pc) => `${pc.name}: ${effects(pc)}`).join("; ")})`, { timeout: 8000 });
                await h.until(() => [pcA, pcB].every((pc, at) => Number(pc.system.attributes.hp.max) === maxBefore[at] + 3), `each PC's maximum 3 higher (${[pcA, pcB].map((pc) => pc.system.attributes.hp.max)})`, { timeout: 5000 });
                h.assert(phantom.itemTypes.effect.some((effect) => /: rank 3$/.test(effect.name)), `the phantom at rank 3 for good (${effects(phantom)})`);
                h.assert(!user.itemTypes.effect.some((effect) => effect.flags?.[h.NS]?.partyHp), `none on its user, not a party member here (${effects(user)})`);
                const second = await bolster();
                await h.until(() => [pcA, pcB].every((pc) => Number(hpRule(pc)?.value) === 6 && pc.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.partyHp?.key === KEY).length === 1), `one Effect each, now +6 (${[pcA, pcB].map((pc) => `${pc.name}: ${effects(pc)}`).join("; ")})`, { timeout: 8000 });
                return { first: resultsOf(first), second: resultsOf(second), party: party?.name ?? null };
            } finally {
                if (party && members) await party.update({ "system.details.members": members }).catch(() => null);
                for (const { effect } of bolsters()) await effect.delete().catch(() => null);
            }
        },

        // Flame of The Radiant Spark (2026-10-27, artifact-readings.js; ruleEffects replaces "any" — scripts/until-rest.js —, scripts/casts.js
        // castEndsRule): "the crackling blue energy … settle[s] in one of your hands … shedding illumination equivalent to a candle … extinguished
        // only by your death or by expending it … to cast a 6th-rank raise dead … You can hold only one flame of the Radiant Spark at a time".
        // Claimed on its ways card: its user's Effect with PF2e's TokenLight (blue, 10 feet of dim light) and its token's light. A second flame
        // claimed: still one flame's Effect, the new one; its ways card stays open. Its "Spend it" way, the dead creature targeted: the spell
        // module casts Raise Dead, and the flame's Effect is deleted, said on the card.
        async b4G1FlameRadiantSpark(scene) {
            assertSpells();
            await h.clearSquares(scene, [[15, 8], [16, 8]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Flame Claimer", { type: "character", x: 15, y: 8, level: 13 });
            const { token: corpseToken } = await h.creature(scene, "Flame Fallen Friend", { x: 16, y: 8, hp: 0, level: 5 });
            const flames = () => user.itemTypes.effect.filter((effect) => effect.flags?.[h.NS]?.ruleEffect === "Flame of the Radiant Spark");
            await userToken.object?.control?.();
            const claim = async () => {
                const flame = await h.give(user, "Flame of The Radiant Spark");
                let since = Date.now();
                await flame.consume();
                const ways = await h.messageAfter(since, h.itemCard("ways"), { what: "the flame's ways card" });
                const names = stateOf(ways).plan.ways.map((way) => way.name);
                h.assert(names[0] === "Claim the flame" && names[1] === "Spend it: 6th-rank Raise Dead", `Claim and Spend (${names.join(" | ")})`);
                since = Date.now();
                await api().apply(ways.id, { choice: 0 });
                const card = await h.messageAfter(since, (message) => h.itemCard("item")(message) && message.id !== ways.id, { what: "the claim's card" });
                await api().apply(card.id);
                return ways;
            };
            await claim();
            await h.until(() => flames().length === 1, `the flame's Effect (${effects(user)})`, { timeout: 8000 });
            const first = flames()[0];
            const light = (first.system.rules ?? []).find((rule) => rule.key === "TokenLight");
            h.assert(light && String(light.value?.color).toLowerCase() === "#3a8bff" && Number(light.value?.dim) === 10, `PF2e's TokenLight, blue, 10 feet dim (${JSON.stringify(light)})`);
            await h.until(() => Number(userToken.light?.dim) === 10, `its token's dim light of 10 feet (${JSON.stringify({ dim: userToken.light?.dim, color: String(userToken.light?.color ?? "") })})`, { timeout: 5000 });
            const ways = await claim();
            await h.until(() => flames().length === 1 && flames()[0].id !== first.id, `one flame, the new one in place of the first (${effects(user)})`, { timeout: 8000 });
            h.assert(stateOf(ways).status === "open", `its ways card still open (${stateOf(ways).status})`);
            const since = Date.now();
            await api().apply(ways.id, { choice: 1 });
            const cast = await h.messageAfter(since, h.itemCard("cast"), { what: "Raise Dead's cast card" });
            try {
                await api().apply(cast.id, { targets: [corpseToken.uuid] });
                await h.until(() => resultsOf(cast).some((line) => /casts Raise Dead/.test(line)), `the cast (${JSON.stringify(resultsOf(cast))})`, { timeout: 15000 });
                await h.until(() => !flames().length, `the flame's Effect spent (${effects(user)})`, { timeout: 8000 });
                h.assert(resultsOf(cast).some((line) => /Flame of the Radiant Spark is spent/.test(line)), `its line (${JSON.stringify(resultsOf(cast))})`);
                return { results: resultsOf(cast), light: { dim: userToken.light?.dim ?? null, color: String(userToken.light?.color ?? "") } };
            } finally {
                await closeSpellDialogs(/Raise Dead/);
            }
        },

        // Whispering Remnant's Hear My Words (2026-10-27, artifact-readings.js castNote and castAgain; scripts/casts.js): "casts an Enthrall spell
        // (DC 30) … perceive and remember the whispering remnant … as something commonplace … the next time you sleep, you endure horrific
        // nightmares and must succeed at a DC 30 Will save upon waking to avoid becoming Stupefied 1 for 24 hours". Its cast card, a listener
        // targeted: the spell module casts Enthrall, its user gets the "Hear My Words" note Effect, and its own DC 30 Will save card for later
        // follows. Not Stupefied till it's pressed; pressed, the ability module's card at its user (Will 0, a d20 of 10: a critical failure) —
        // Stupefied 1.
        async b4G1WhisperingRemnantNightmare(scene) {
            assertSpells();
            await h.clearSquares(scene, [[15, 12], [17, 12]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Remnant Whisperer", { type: "character", x: 15, y: 12, level: 13 });
            const { token: listenerToken } = await h.creature(scene, "Remnant Listener", { x: 17, y: 12, alliance: "opposition", save: -30 });
            const remnant = await h.give(user, "Whispering Remnant");
            await remnant.update(held(1));
            await userToken.object?.control?.();
            const index = await activationOf(remnant, "Hear My Words", 0);
            let since = Date.now();
            await api().activate(remnant.uuid, index);
            const cast = await h.messageAfter(since, h.itemCard("cast"), { what: "Hear My Words' cast card" });
            try {
                since = Date.now();
                await api().apply(cast.id, { targets: [listenerToken.uuid] });
                await h.until(() => resultsOf(cast).some((line) => /casts Enthrall/.test(line)), `the cast (${JSON.stringify(resultsOf(cast))})`, { timeout: 15000 });
                const note = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.note && /: Hear My Words$/.test(effect.name));
                await h.until(note, `the "Hear My Words" note Effect on its user (${effects(user)})`, { timeout: 8000 });
                const later = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && Boolean(stateOf(message)?.own) && Boolean(stateOf(message)?.later), { what: "its own save's card for later", timeout: 10000 });
                const check = stateOf(later).plan.resolution.check;
                h.assert(check.statistic === "will" && Number(check.against?.value) === 30, `a DC 30 Will save (${JSON.stringify(check)})`);
                h.assert(!user.hasCondition("stupefied"), `not Stupefied before it's pressed (${conditions(user)})`);
                since = Date.now();
                await api().apply(later.id);
                const save = await h.messageAfter(since, abilityCardAt(user), { what: "the nightmares' save card at its user" });
                await h.withDie(10, () => h.rollAndApply(save));
                await h.until(() => user.getCondition("stupefied")?.value === 1, `Stupefied 1 (${conditions(user)})`, { timeout: 10000 });
                const cardCast = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since - 60000 && message.flags?.[SPELLS]?.castFromItem?.itemUuid === remnant.uuid).at(-1);
                return { results: resultsOf(cast), note: note().name, degree: abilityOf(save).targets?.[0]?.degree ?? null, cast: cardCast?.flags?.[SPELLS]?.castFromItem ?? null };
            } finally {
                await closeSpellDialogs(/Enthrall/);
            }
        },

        // Starless Scope's second activation (2026-10-27, artifact-readings.js; scripts/live.js giveUserConditions kind "rules"): "The starless
        // scope adds a +2 item bonus to this check [Recall Knowledge] … Failure As success [shines with starlight for 1 round, -1 status penalty to
        // saving throws against divine effects], but … An incorporeal creature loses its incorporeal trait as long as it shines with starlight.
        // Any other creature becomes slowed 1". Activated: its user gets the Effect of PF2e's rule, +2 item to Recall Knowledge to the end of the
        // turn. Its DC 27 Will save at an incorporeal ghost and a cultist (each Will 12, a d20 of 10: failures): each gets the Starlight note Effect
        // with its −1 status to saves against divine effects; the ghost loses its incorporeal trait (PF2e's ActorTraits) and isn't Slowed, the
        // cultist is Slowed 1 (the note's GrantItem, only for a creature that isn't incorporeal).
        async b4G1StarlessScopeStarlight(scene) {
            await h.clearSquares(scene, [[4, 2], [6, 2], [7, 2]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Scope Stargazer", { type: "character", x: 4, y: 2, level: 9 });
            const { actor: ghost, token: ghostToken } = await h.creature(scene, "Starlit Ghost", { x: 6, y: 2, alliance: "opposition", save: 12 });
            const { actor: cultist, token: cultistToken } = await h.creature(scene, "Starlit Cultist", { x: 7, y: 2, alliance: "opposition", save: 12 });
            await ghost.update({ "system.traits.value": ["undead", "incorporeal", "spirit"] });
            await h.until(() => ghost.traits.has("incorporeal"), `the ghost incorporeal (${[...ghost.traits]})`, { timeout: 5000 });
            const scope = await h.give(user, "Starless Scope");
            await scope.update(held(1));
            await userToken.object?.control?.();
            let since = Date.now();
            await api().activate(scope.uuid, 1);
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the scope's save card" });
            const recall = () => user.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.ruleEffect === "Starless Scope");
            await h.until(recall, `its user's Recall Knowledge Effect (${effects(user)})`, { timeout: 8000 });
            const bonus = (recall().system.rules ?? []).find((rule) => rule.key === "FlatModifier");
            const duration = recall().system.duration;
            h.assert(bonus && [].concat(bonus.selector).includes("skill-check") && bonus.type === "item" && Number(bonus.value) === 2 && JSON.stringify(bonus.predicate ?? []).includes("action:recall-knowledge"), `+2 item to Recall Knowledge (${JSON.stringify(bonus)})`);
            h.assert(Number(duration.value) === 0 && duration.unit === "rounds" && duration.expiry === "turn-end", `to the end of the turn (${JSON.stringify(duration)})`);
            since = Date.now();
            await api().apply(card.id, { targets: [ghostToken.uuid, cultistToken.uuid] });
            const save = await h.messageAfter(since, h.abilitySaveCard, { what: "the DC 27 Will save card" });
            h.assert(abilityOf(save).plan.resolution.check.statistic === "will" && Number(abilityOf(save).plan.resolution.check.against?.value) === 27, `a DC 27 Will save (${JSON.stringify(abilityOf(save).plan.resolution.check)})`);
            await h.withDie(10, () => h.rollAndApply(save));
            const degrees = () => (abilityOf(save)?.targets ?? []).map((target) => target.degree);
            const starlight = (actor) => actor.itemTypes.effect.find((effect) => /: Starlight$/.test(effect.name));
            await h.until(() => starlight(ghost) && starlight(cultist), `the Starlight note Effects (ghost: ${effects(ghost)}; cultist: ${effects(cultist)}; degrees ${degrees()})`, { timeout: 10000 });
            h.assert(degrees().every((degree) => degree === "failure"), `two failures (${degrees()})`);
            const divine = (starlight(ghost).system.rules ?? []).find((rule) => rule.key === "FlatModifier");
            h.assert(divine && Number(divine.value) === -1 && divine.type === "status" && [].concat(divine.selector).includes("saving-throw"), `−1 status to saves against divine effects (${JSON.stringify(divine)})`);
            await h.until(() => !ghost.traits.has("incorporeal"), `the ghost no longer incorporeal (${[...ghost.traits]})`, { timeout: 5000 });
            await h.until(() => cultist.getCondition("slowed")?.value === 1, `the cultist Slowed 1 (${conditions(cultist)})`, { timeout: 5000 });
            h.assert(!ghost.hasCondition("slowed"), `the ghost not Slowed (${conditions(ghost)})`);
            return { degrees: degrees(), ghostTraits: [...ghost.traits], cultist: conditions(cultist) };
        },

        // Horn of Rust's aura (2026-10-27, artifact-readings.js afterDamage; scripts/after-damage.js on the ability module's applied hook): "Creatures
        // and objects that begin their turn in this area take 4d6 slashing damage from the shards (DC 19 Reflex save). A creature damaged by this
        // aura is exposed to a potent form of tetanus … DC 19 Fortitude save". In an encounter, its user's 5-foot aura (the ability module's zone on
        // its token); the foe beside it begins its turn there: the zone's Reflex save card, failed (save 0, a d20 of 10), its damage; then its own
        // DC 19 Fortitude card follows, at it with nothing targeted (plan.struckToken), handing on Horn of Rust Tetanus (onset 10 days). Pressed
        // and failed: Pseudo Afflictions' Effect for Horn of Rust Tetanus on the foe.
        async b4G1HornOfRustTetanus(scene) {
            await h.clearSquares(scene, [[10, 16], [11, 16]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Rust Horn Blower", { type: "character", x: 10, y: 16, level: 5 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Rust Shard Foe", { x: 11, y: 16, alliance: "opposition", save: 0, hp: 200 });
            const horn = await h.give(user, "Horn of Rust");
            await horn.update(held(1));
            await h.target();
            const zone = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Horn of Rust/.test(region.name));
            const combat = await Combat.create({ scene: scene.id, active: true, flags: { [h.NS]: { [FIXTURE]: true } } });
            try {
                await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
                await combat.startCombat();
                await h.wait(500);
                await api().activate(horn.uuid, 1);
                await h.until(zone, `the shards' zone (${scene.regions.map((region) => region.name).join(", ") || "no regions"})`, { timeout: 8000 });
                h.assert(zone().flags[ABILITY].zone.zone.saves?.[0]?.plan?.afterDamage?.plan, `its Reflex save with the tetanus after it (${JSON.stringify(zone().flags[ABILITY].zone.zone.saves?.[0]?.plan?.afterDamage?.degrees ?? null)})`);
                const before = hp(foe);
                let since = Date.now();
                await combat.nextTurn();
                const shards = await h.messageAfter(since, abilityCardAt(foe), { what: "the shards' Reflex save card at the foe's turn start", timeout: 10000 });
                h.assert(abilityOf(shards).plan.resolution.check.statistic === "reflex" && Number(abilityOf(shards).plan.resolution.check.against?.value) === 19, `the DC 19 Reflex save (${JSON.stringify(abilityOf(shards).plan.resolution.check)})`);
                since = Date.now();
                await h.withDie(10, () => h.rollAndApply(shards));
                await h.until(() => hp(foe) < before, `the shards' damage (${hp(foe)} of ${before})`, { timeout: 10000 });
                const tetanus = await h.messageAfter(since, (message) => h.itemCard("expose")(message) && stateOf(message)?.plan?.struckToken === foeToken.uuid, { what: "the tetanus's Fortitude card at the foe", timeout: 10000 });
                const plan = stateOf(tetanus).plan;
                h.assert(plan.resolution.check.statistic === "fortitude" && Number(plan.resolution.check.against?.value) === 19 && plan.resolution.afflictionHandoff?.name === "Horn of Rust Tetanus" && Number(plan.resolution.afflictionHandoff.onset?.value) === 10 && plan.resolution.afflictionHandoff.onset.unit === "days", `DC 19 Fortitude, Horn of Rust Tetanus with its 10 days' onset (${JSON.stringify({ check: plan.resolution.check, handoff: plan.resolution.afflictionHandoff ? { name: plan.resolution.afflictionHandoff.name, onset: plan.resolution.afflictionHandoff.onset } : null })})`);
                since = Date.now();
                await api().apply(tetanus.id, { targets: [] });
                const fortitude = await h.messageAfter(since, abilityCardAt(foe), { what: "the tetanus's save card", timeout: 10000 });
                h.assert(abilityOf(fortitude).plan.resolution.afflictionHandoff?.name === "Horn of Rust Tetanus", `its save card hands on Horn of Rust Tetanus (${JSON.stringify(abilityOf(fortitude).plan.resolution.afflictionHandoff?.name ?? null)})`);
                await h.withDie(10, () => h.rollAndApply(fortitude));
                await h.until(() => abilityOf(fortitude)?.status === "applied", `the tetanus's save applied (${abilityOf(fortitude)?.status})`, { timeout: 10000 });
                const degree = abilityOf(fortitude).targets?.[0]?.degree ?? null;
                h.assert(degree === "failure", `a failure (Fortitude 0, a d20 of 10 against DC 19: ${degree})`);
                // (Pseudo Afflictions keys its own afflictions by slug — the item's, or the DC label's "Horn of Rust Tetanus" — and has none of that
                // name (its Tetanus and Ferrugon Tetanus only, 2026-10-28): if none is made, the hand-off did nothing.)
                const afflicted = () => foe.itemTypes.effect.find((effect) => effect.flags?.["pseudo-afflictions"] && /Tetanus/i.test(effect.name));
                await h.until(afflicted, `Pseudo Afflictions' tetanus on the foe — none made: it has no "Horn of Rust Tetanus" to key the hand-off by (${effects(foe)}; the card: ${JSON.stringify(abilityOf(fortitude)?.results ?? [])})`, { timeout: 10000 });
                return { hp: [before, hp(foe)], degree, affliction: afflicted().name };
            } finally {
                await combat.delete().catch(() => null);
                for (const region of scene.regions.filter((entry) => entry.flags?.[ABILITY]?.zone && /Horn of Rust/.test(entry.name))) await region.delete().catch(() => null);
            }
        }
    };
};
