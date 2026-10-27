// The second batch's visibility group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// Only the group's new live code: Oil of Revelation's note rider on the damage its weapon deals (scripts/attack-riders.js weaponDamageDealt,
// rider.note + once), Alchemical Atomizer's elixirs, oils and potions used through it (scripts/live.js postCardFor's potions by
// plan.item.patch.categories, applyToRecipient's "used through it" line; src/live/card.js previewLines). The group's other readings feed
// mechanisms already live-checked: Octopus Bottle's save card then the teleport card (plan.placed — whipTongue, rocShaft…), Siege Shield's
// ways card and its way's item.ruleEffects on the creature targeted (gingerChewSecondary, bloomAllies, missiveRecipient), Phantom Roll's
// note Effect with its toggle and FlatModifier from a row (the ability module's note Effects with rules).

export default (h) => {
    const live = () => game.modules.get(h.NS).api.live;
    const names = (actor) => actor.itemTypes.effect.map((effect) => effect.name).join(", ");

    return {
        // Oil of Revelation (2026-10-27, visibility.js; scripts/attack-riders.js weaponDamageDealt, rider.note + once): "The first time a weapon
        // coated with this oil damages a creature, the wound glows … for 1 minute", the oil gone if it hasn't within an hour. Its card offers the
        // user's longsword and dagger; the longsword picked, a watch Effect on its user for 1 hour (flags.attackRiders.weapon the longsword's
        // id). A dagger hit's damage (PF2e's damage-taken message, the dagger its origin) does nothing: no glow, the watch kept. The longsword's
        // hit damage gives the creature hit the "Oil of Revelation: Glowing wound" note Effect for 1 minute, a chat line "(used up)", and the
        // watch Effect is gone. A second longsword hit, at another creature, gives it nothing.
        async b2VisibilityOilRevelationGlow(scene) {
            await h.clearSquares(scene, [[2, 3], [3, 3], [3, 4]]);
            const { actor: user, token: userToken } = await h.creature(scene, "Revelation Oiler", { type: "character", x: 2, y: 3 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Revelation Mark", { x: 3, y: 3, ac: 1, hp: 200, alliance: "opposition" });
            const { actor: other, token: otherToken } = await h.creature(scene, "Revelation Second Mark", { x: 3, y: 4, ac: 1, hp: 200, alliance: "opposition" });
            const sword = await h.give(user, "Longsword");
            await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const dagger = await h.give(user, "Dagger");
            await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const oil = await h.give(user, "Oil of Revelation");
            let since = Date.now();
            await oil.consume();
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the oil's card" });
            const weapons = card.getFlag(h.NS, "card").weapons ?? [];
            const at = weapons.findIndex((weapon) => weapon.id === sword.id);
            h.assert(at >= 0 && weapons.some((weapon) => weapon.id === dagger.id), `the longsword and the dagger offered (${JSON.stringify(weapons)})`);
            await live().apply(card.id, { runeWeapon: at });
            const watch = () => user.itemTypes.effect.find((effect) => effect.getFlag(h.NS, "attackRiders")?.item?.name === "Oil of Revelation");
            await h.until(() => watch(), `the oil's watch Effect on its user (${names(user)})`, { timeout: 8000 });
            const watched = watch();
            const watchId = watched.id;
            const flag = watched.getFlag(h.NS, "attackRiders");
            h.assert(flag.weapon?.id === sword.id, `the watch on the longsword (${JSON.stringify(flag.weapon)})`);
            h.assert(Number(watched.system.duration?.value) === 1 && watched.system.duration?.unit === "hours", `the watch for 1 hour (${JSON.stringify(watched.system.duration)})`);
            const rider = (flag.riders ?? [])[0];
            h.assert(rider?.once && (rider.on ?? []).includes("dealt") && rider.note?.label === "Glowing wound", `its once-only note rider on the damage dealt (${JSON.stringify(flag.riders)})`);
            const glows = (actor) => actor.itemTypes.effect.filter((effect) => effect.name === "Oil of Revelation: Glowing wound");
            // (A hit with that weapon, its damage applied as PF2e's damage button does — the weapon the damage-taken message's origin, which
            // weaponDamageDealt reads by its id.)
            const hitAndDamage = async (weapon, actor, token) => {
                await userToken.object?.control?.();
                await h.target(token);
                const { action, attack } = await h.strike(user, weapon);
                h.assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a ${weapon.name} hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
                let from = Date.now();
                await action.damage({ event: h.shift() });
                const rolled = await h.messageAfter(from, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: `${weapon.name}'s damage roll` });
                const hp = actor.system.attributes.hp.value;
                from = Date.now();
                await actor.applyDamage({ damage: rolled.rolls[0], token, item: rolled.item ?? weapon });
                const taken = await h.messageAfter(from, (message) => message.flags?.pf2e?.context?.type === "damage-taken", { what: `PF2e's damage-taken message (${weapon.name})` });
                const origin = String(taken.flags?.pf2e?.origin?.uuid ?? "");
                h.assert(origin.split(".").at(-1) === weapon.id, `PF2e's damage-taken message from ${weapon.name} (its origin ${origin || "none"})`);
                await h.until(() => actor.system.attributes.hp.value < hp, `${weapon.name}'s Hit Point damage (${hp} → ${actor.system.attributes.hp.value})`, { timeout: 5000 });
                return from;
            };
            // (Another weapon's damage: nothing.)
            await hitAndDamage(dagger, foe, foeToken);
            await h.wait(1500);
            h.assert(!glows(foe).length, `no glow from the dagger's damage (${names(foe)})`);
            h.assert(user.items.get(watchId), `the watch kept after the dagger's damage (${names(user)})`);
            // (The coated weapon's first damage: the glow, its line, the oil spent.)
            since = await hitAndDamage(sword, foe, foeToken);
            await h.until(() => glows(foe).length, `the Glowing wound Effect on the creature hit (${names(foe)})`, { timeout: 8000 });
            const glow = glows(foe)[0];
            h.assert(Number(glow.system.duration?.value) === 1 && glow.system.duration?.unit === "minutes", `the glow for 1 minute (${JSON.stringify(glow.system.duration)})`);
            h.assert(glow.getFlag(h.NS, "note") === true && /Hidden, not Undetected/.test(glow.system.description?.value ?? ""), `a note Effect with the glow's words (${glow.system.description?.value})`);
            const line = await h.messageAfter(since, (message) => /Oil of Revelation<\/strong>:/.test(message.content ?? "") && /Glowing wound \(used up\)/.test(message.content ?? ""), { what: "the glow's chat line" });
            await h.until(() => !user.items.get(watchId), `the watch Effect gone once spent (${names(user)})`, { timeout: 8000 });
            // (A second hit with it, at another creature: nothing more.)
            await hitAndDamage(sword, other, otherToken);
            await h.wait(1500);
            h.assert(!glows(other).length, `no glow on the second creature hit (${names(other)})`);
            h.assert(glows(foe).length === 1, `one glow on the first (${names(foe)})`);
            return { watch: { weapon: flag.weapon, duration: watched.system.duration }, glow: { name: glow.name, duration: glow.system.duration }, line: line.content, hp: [foe.system.attributes.hp.value, other.system.attributes.hp.value] };
        },

        // Alchemical Atomizer's first Activate (2026-10-27, visibility.js; scripts/live.js postCardFor potions by patch.categories,
        // applyToRecipient): "The target gains the effects of the elixir, oil, or potion" held in it. Its user holds an Elixir of Life (Minor), a
        // Healing Potion (Minor), an Oil of Weightlessness, an Acid Flask (Lesser) — a bomb, not a consumable's category — and a Bestial Mutagen
        // (Lesser): the card offers the elixir, the potion and the oil only, and says "Uses one of your elixirs, oils or potions through it".
        // The elixir picked and applied: PF2e's own use spends it (the rest still held), its own item card follows, and the atomizer's card says
        // it was "used through it". That card fed to the adjacent ally heals it by PF2e's roll and gives it the elixir's Effect, not its user.
        async b2VisibilityAtomizerElixir(scene) {
            await h.clearSquares(scene, [[2, 7], [3, 7]]);
            const { actor: user } = await h.creature(scene, "Atomizer Alchemist", { type: "character", x: 2, y: 7, level: 10 });
            const { actor: ally } = await h.creature(scene, "Atomizer Ally", { x: 3, y: 7, hp: 10 });
            const atomizer = await h.give(user, "Alchemical Atomizer");
            await atomizer.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const elixir = await h.give(user, "Elixir of Life (Minor)");
            const potion = await h.give(user, "Healing Potion (Minor)");
            const oil = await h.give(user, "Oil of Weightlessness");
            const flask = await h.give(user, "Acid Flask (Lesser)");
            const mutagen = await h.give(user, "Bestial Mutagen (Lesser)");
            let since = Date.now();
            // (Its spray onto an adjacent ally is its first activation, the cloud its second.)
            await live().activate(atomizer.uuid, 0);
            const card = await h.messageAfter(since, h.itemCard("item"), { what: "the atomizer's card" });
            const offered = card.getFlag(h.NS, "card").potions ?? [];
            const offeredNames = offered.map((entry) => entry.name).sort();
            h.assert(JSON.stringify(offeredNames) === JSON.stringify(["Elixir of Life (Minor)", "Healing Potion (Minor)", "Oil of Weightlessness"]), `the elixir, the potion and the oil offered, not the flask or the mutagen (${JSON.stringify(offered)})`);
            h.assert(/Uses one of your elixirs, oils or potions through it/.test(card.content ?? ""), `its line for what it holds (${String(card.content ?? "").replace(/<[^>]+>/g, " ").slice(0, 400)})`);
            const at = offered.findIndex((entry) => entry.id === elixir.id);
            since = Date.now();
            await live().apply(card.id, { potionPick: at });
            const elixirCard = await h.messageAfter(since, (message) => message.id !== card.id && message.getFlag(h.NS, "card")?.item?.name === "Elixir of Life (Minor)", { what: "the elixir's own card", timeout: 10000 });
            await h.until(() => !user.items.get(elixir.id), "the elixir used up", { timeout: 8000 });
            h.assert([potion, oil, flask, mutagen, atomizer].every((entry) => user.items.get(entry.id)), `the rest still held (${user.items.map((entry) => entry.name).join(", ")})`);
            const atomizerState = () => game.messages.get(card.id)?.getFlag(h.NS, "card") ?? {};
            const usedLine = () => (atomizerState().results ?? []).find((entry) => /Elixir of Life \(Minor\) used through it\b/.test(entry)) ?? (/Elixir of Life \(Minor\) used through it\b/.test(game.messages.get(card.id)?.content ?? "") ? "(in the card's content)" : null);
            await h.until(() => usedLine(), `the atomizer's card saying the elixir was used through it (${JSON.stringify(atomizerState().results ?? [])})`, { timeout: 8000 });
            // (PF2e's own Use message of the elixir: its healing roll.)
            const used = await h.messageAfter(since, (message) => message.flags?.pf2e?.origin?.type === "consumable" && message.rolls?.length, { what: "PF2e's Use message of the elixir" }).catch(() => null);
            const state = elixirCard.getFlag(h.NS, "card");
            const drinker = (state.drinkers ?? []).findIndex((entry) => entry.actorUuid === ally.uuid);
            h.assert(drinker >= 0, `the adjacent ally offered on the elixir's card (${JSON.stringify(state.drinkers)})`);
            const hp = ally.system.attributes.hp.value;
            await live().apply(elixirCard.id, { drinker });
            await h.until(() => ally.system.attributes.hp.value > hp, `the ally healed (${hp} → ${ally.system.attributes.hp.value})`, { timeout: 8000 });
            const healed = used ? used.rolls[0].total : null;
            if (healed !== null) h.assert(ally.system.attributes.hp.value === Math.min(hp + healed, ally.system.attributes.hp.max), `healed by PF2e's ${healed}: ${hp} → ${ally.system.attributes.hp.value}`);
            const elixirEffect = (actor) => actor.itemTypes.effect.some((effect) => effect.name.startsWith("Effect: Elixir of Life"));
            await h.until(() => elixirEffect(ally), `the elixir's Effect on the ally (${names(ally)})`, { timeout: 8000 });
            h.assert(!elixirEffect(user), `not on its user (${names(user)})`);
            return { offered: offeredNames, line: usedLine(), healed, hp: [hp, ally.system.attributes.hp.value], results: atomizerState().results ?? [] };
        }
    };
};
