// The third batch's moving group (the adventure books) live cases (2026-10-28): tools/live-check.mjs joins them to its own. h: its helpers.
// (Only the items whose live play is new code have a case here: Invisible Net — scripts/falls.js netsUnder, read through api.fallEases — and
// the Bonmuan Swapping Stone's Strike — scripts/poisons.js attackChoices' "ranged-proficiency" pick. The group's other asked-for checks feed
// mechanisms already checked live: Void Shackles (PF2e's Effect: Manacles from the compendium, a note Effect, and the creature's own save card
// kept open — plan.again own), Anchor Spear (a note Effect, and a kept card whose save card rolls a skill against a set DC — the ability
// module's getStatistic, as b4-1's b4G1EssencePrismReligion checks for a skill), Paradise Light (zone.inside rules — paradiseMeadow; its
// FastHealing and Note are PF2e's own), Gravity Inverter (zone.inside GrantItem of Off-Guard — Ghost Lantern's and Candle of Revealing's
// inside rules) and Dupe's Gold Nugget (a note Effect and a kept own save card for its rounds — again.rounds).)

const ABILITY = "pf2e-automatic-ability-resolution";
const CORE = "pf2e-resolution-core";
const ENV = "pf2e-automatic-environment-resolution";
const UNLIMITED = { value: -1, unit: "unlimited", expiry: null, sustained: false };

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const stateOf = (message) => game.messages.get(message.id)?.getFlag(h.NS, "card") ?? null;
    const abilityOf = (message) => game.messages.get(message.id)?.flags?.[ABILITY]?.card ?? null;

    return {
        // Invisible Net (2026-10-27, moving-readings.js; scripts/falls.js netsUnder, api.fallEases): "a creature that falls onto it takes no
        // falling damage". Used, its 30-foot square is the ability module's zone flagged zone.fall { noDamage }, placed where its user puts it
        // (the placement click stood in for: at its user's token). A PC 30 feet up over the square (its centre inside, tested at the zone's own
        // bottom): the item module's api.fallEases names the net, and the fall the environment module rolls from its cards (the core's easedFall
        // over its fallEasesOf, as its applyRow does) deals no damage, by Invisible Net. A PC outside the square: the same 30-foot fall deals
        // damage. The net's zone gone (its minute up, or ended on its card): the first PC's fall deals damage again.
        async b3MovingInvisibleNetSoftLanding(scene) {
            h.assert(game.modules.get(ENV)?.active, "PF2e Automatic Environment Resolution active in pftest");
            await h.clearSquares(scene, [[5, 5], [6, 6], [15, 15]]);
            const { easedFall } = await import(`/modules/${CORE}/src/environment/disasters.js?v=${Date.now()}`);
            const { fallEasesOf } = await import(`/modules/${ENV}/scripts/foundry.js?v=${Date.now()}`);
            const { actor: user, token: userToken } = await h.creature(scene, "Net Spreader", { type: "character", x: 5, y: 5 });
            const { actor: faller, token: fallerToken } = await h.creature(scene, "Net Faller", { type: "character", x: 6, y: 6 });
            const { actor: misser } = await h.creature(scene, "Net Misser", { type: "character", x: 15, y: 15 });
            const net = await h.give(user, "Invisible Net");
            await userToken.object?.control?.();
            const zone = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Invisible Net/.test(region.name));
            const placing = canvas.regions.placeRegion;
            canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
            try {
                await net.consume();
                await h.until(zone, `the net's zone (${scene.regions.map((region) => region.name).join(", ") || "no regions"})`, { timeout: 8000 });
                const flags = zone().flags[ABILITY].zone;
                h.assert(flags.zone?.fall?.noDamage === true && flags.zone.area?.type === "square" && Number(flags.zone.area.value) === 30, `a 30-foot square flagged fall { noDamage } (${JSON.stringify({ area: flags.zone?.area, fall: flags.zone?.fall })})`);
                // (The faller 30 feet up, over the square: its token's centre inside the zone's shape.)
                const size = canvas.grid.size;
                const centre = { x: fallerToken.x + size / 2, y: fallerToken.y + size / 2 };
                h.assert(zone().testPoint({ ...centre, elevation: 0 }), `the faller's square under the net (${JSON.stringify(zone().shapes.map((shape) => shape.toObject?.() ?? shape))})`);
                await fallerToken.update({ elevation: 30 }, { teleport: true, animate: false });
                await h.until(() => Number(fallerToken.elevation) === 30, `the faller 30 feet up (${fallerToken.elevation})`, { timeout: 5000 });
                const eases = game.modules.get(h.NS).api.fallEases(faller);
                h.assert(eases.some((entry) => entry.noDamage && entry.source === "Invisible Net"), `api.fallEases names the net (${JSON.stringify(eases)})`);
                const onNet = easedFall(30, fallEasesOf(faller));
                h.assert(onNet.damage === 0 && !onNet.prone && onNet.by === "Invisible Net", `no falling damage onto the net, by Invisible Net (${JSON.stringify(onNet)})`);
                const missed = easedFall(30, fallEasesOf(misser));
                h.assert(missed.damage > 0 && !fallEasesOf(misser).some((entry) => entry.noDamage), `the fall off the net deals damage (${JSON.stringify(missed)})`);
                // (The net's minute up — out of an encounter the ability module ends it from its card: its Region deleted, as End does.)
                await zone().delete();
                await h.until(() => !zone(), "the net's zone gone", { timeout: 5000 });
                const after = easedFall(30, fallEasesOf(faller));
                h.assert(after.damage > 0 && !game.modules.get(h.NS).api.fallEases(faller).some((entry) => entry.noDamage), `with the net gone, the fall deals damage (${JSON.stringify(after)})`);
                return { onNet, missed, after };
            } finally {
                canvas.regions.placeRegion = placing;
                for (const region of scene.regions.filter((entry) => /Invisible Net/.test(entry.name))) await region.delete().catch(() => null);
            }
        },

        // Bonmuan Swapping Stone (Lesser) (2026-10-27, moving-readings.js; scripts/poisons.js attackChoices "ranged-proficiency"): a ranged Strike at
        // its user's best ranged weapon proficiency whose hit brings a DC 28 Will save, a failure teleporting the creature beside its user — and "thrown at a space" its user's own Dimension Door within 100 feet. Its thrower (5th level,
        // expert in martial weapons through PF2e's ActiveEffectLike, as a class gives it) picks "Hurled at a creature" on the ways card: the card
        // offers "Ranged (highest proficiency) +N", N its Dexterity modifier + its level + 2 × its best weapon rank (martial 2), and the ability
        // module's attack card is that modifier against AC. A hit (AC −10), the card's second step: the DC 28 Will save card at the creature hit;
        // its failure (Will −30), a teleport card for the creature, picked by its thrower: a space 10 feet from the thrower refused (the item allows
        // 5), one beside it taken — the creature teleported there. A second stone thrown at a space: the teleport card for its user, who teleports
        // 45 feet.
        async b3MovingBonmuanSwap(scene) {
            await h.clearSquares(scene, [[3, 10], [5, 10], [3, 11], [3, 12], [12, 10]]);
            const { actor: thrower, token: throwerToken } = await h.creature(scene, "Bonmuan Thrower", { type: "character", x: 3, y: 10, level: 5 });
            const { token: foeToken } = await h.creature(scene, "Bonmuan Mark", { x: 5, y: 10, ac: -10, hp: 100, save: -30, alliance: "opposition" });
            await thrower.createEmbeddedDocuments("Item", [{ name: `${h.PREFIX} Martial Expertise`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "ActiveEffectLike", mode: "upgrade", path: "system.proficiencies.attacks.martial.rank", value: 2 }], duration: UNLIMITED } }]);
            await h.until(() => Number(thrower.system.proficiencies?.attacks?.martial?.rank) === 2, `expert in martial weapons (${JSON.stringify(thrower.system.proficiencies?.attacks ?? {})})`, { timeout: 5000 });
            const dex = Number(thrower.system.abilities?.dex?.mod ?? 0) || 0;
            const ranks = ["simple", "martial", "advanced"].map((category) => Number(thrower.system.proficiencies.attacks[category]?.rank)).filter(Number.isFinite);
            const expected = dex + Number(thrower.level) + 2 * Math.max(...ranks);
            await throwerToken.object?.control?.();
            await h.target();
            const throwStone = async () => {
                const stone = await h.give(thrower, "Bonmuan Swapping Stone (Lesser)");
                const since = Date.now();
                await stone.consume();
                return h.messageAfter(since, h.itemCard("ways"), { what: "the stone's ways card" });
            };
            let ways = await throwStone();
            const hurl = stateOf(ways).plan.ways.findIndex((way) => /^Hurled at a creature/.test(way.name));
            h.assert(hurl >= 0, `its "Hurled at a creature" way (${stateOf(ways).plan.ways.map((way) => way.name).join(" | ")})`);
            let since = Date.now();
            await api().apply(ways.id, { choice: hurl });
            const card = await h.messageAfter(since, h.itemCard("expose"), { what: "the hurl's card" });
            const choices = stateOf(card).attackChoices ?? [];
            const proficient = choices.find((choice) => choice.kind === "ranged-proficiency");
            h.assert(proficient && proficient.modifier === expected && proficient.label === `Ranged (highest proficiency) ${expected >= 0 ? "+" : ""}${expected}`, `"Ranged (highest proficiency) +${expected}" offered (Dex ${dex}, level ${thrower.level}, ranks ${ranks}: ${JSON.stringify(choices)})`);
            since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(proficient) });
            const attack = await h.messageAfter(since, h.abilitySaveCard, { what: "the ability module's attack card" });
            const check = abilityOf(attack).plan.resolution.check;
            h.assert(Number(check.modifier) === expected && check.against?.statistic === "ac", `the attack at +${expected} against AC (${JSON.stringify(check)})`);
            await h.withDie(10, () => h.rollAndApply(attack));
            await h.until(() => (abilityOf(attack)?.targets ?? []).every((target) => target.degree), "the attack rolled", { timeout: 8000 });
            const hit = abilityOf(attack).targets[0].degree;
            h.assert(["success", "criticalSuccess"].includes(hit), `a hit at AC −10 (${hit})`);
            await h.until(() => stateOf(card)?.step === "then", `the card's second step, the save (${stateOf(card)?.step ?? "none"}; ${stateOf(card)?.status})`, { timeout: 8000 });
            since = Date.now();
            await api().apply(card.id, { targets: [foeToken.uuid] });
            const save = await h.messageAfter(since, (message) => h.abilitySaveCard(message) && message.id !== attack.id, { what: "the DC 28 Will save card" });
            const saveCheck = abilityOf(save).plan.resolution.check;
            h.assert(saveCheck.statistic === "will" && Number(saveCheck.against?.value) === 28, `a DC 28 Will save (${JSON.stringify(saveCheck)})`);
            since = Date.now();
            await h.withDie(10, () => h.rollAndApply(save));
            const teleport = await h.messageAfter(since, h.itemCard("teleport"), { what: "the teleport card for the creature", timeout: 10000 });
            const moved = stateOf(teleport);
            h.assert(moved.user?.tokenUuid === foeToken.uuid && Number(moved.plan?.teleport?.place?.nearSource) === 5 && moved.plan.teleport.place.by?.actorUuid === thrower.uuid, `the creature moved, its thrower picking within 5 feet of itself (${JSON.stringify({ user: moved.user, teleport: moved.plan?.teleport })})`);
            const size = canvas.grid.size;
            let refused = null;
            await api().apply(teleport.id, { destination: { x: 3 * size, y: 12 * size }, targets: [] }).catch((error) => { refused = error.message; });
            h.assert(/the item allows 5/.test(refused ?? ""), `a space 10 feet from the thrower refused (${refused})`);
            await api().apply(teleport.id, { destination: { x: 3 * size, y: 11 * size }, targets: [] });
            await h.until(() => foeToken.x === 3 * size && foeToken.y === 11 * size, `the creature teleported beside its thrower (${foeToken.x / size}, ${foeToken.y / size})`, { timeout: 8000 });
            // (The other way: thrown at a space, its user's own teleport within 100 feet.)
            ways = await throwStone();
            const space = stateOf(ways).plan.ways.findIndex((way) => /^Thrown at a space/.test(way.name));
            since = Date.now();
            await api().apply(ways.id, { choice: space });
            const own = await h.messageAfter(since, h.itemCard("teleport"), { what: "its user's teleport card" });
            h.assert(stateOf(own).user?.tokenUuid === throwerToken.uuid && Number(stateOf(own).plan?.teleport?.within) === 100, `its user's teleport within 100 feet (${JSON.stringify({ user: stateOf(own).user, teleport: stateOf(own).plan?.teleport })})`);
            await api().apply(own.id, { destination: { x: 12 * size, y: 10 * size }, targets: [] });
            await h.until(() => throwerToken.x === 12 * size && throwerToken.y === 10 * size, `the thrower teleported 45 feet (${throwerToken.x / size}, ${throwerToken.y / size})`, { timeout: 8000 });
            return { choice: proficient, hit, refused, results: stateOf(teleport).results, own: stateOf(own).results };
        }
    };
};
