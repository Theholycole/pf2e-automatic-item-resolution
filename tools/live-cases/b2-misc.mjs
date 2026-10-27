// The second batch's misc group's live cases (2026-10-27): tools/live-check.mjs joins them to its own. h: its helpers.
// (Only the item whose live play is new code has cases: Awakened Adamantine Shot — scripts/strikes.js's applied Strike card setting the
// resolution core's ignoreResistance flag on the shot (core 321af5b stamps it onto the Strike's damage roll), and the Strike rider applying a
// Strike plan's own ifTarget, once. Twig of Knowledge and Memory, Potion of Shared Life and Armorskin Robes of Fire feed mechanisms already
// checked live: guitarAlly and wardingBracelet, alliesEffect and the note Effects with PF2e rules, thunderRetaliation.)

const CORE = "pf2e-resolution-core";
const ABILITY = "pf2e-automatic-ability-resolution";
const SHOT = "Awakened Adamantine Shot";
const IGNORED = { value: 20, types: ["physical", "all-damage", "piercing", "bludgeoning"] };

export default (h) => {
    const api = () => game.modules.get(h.NS).api.live;
    const text = (message) => String(game.messages.get(message.id)?.content ?? message.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const readiedOf = (actor) => () => actor.itemTypes.effect.find((effect) => effect.flags?.[h.NS]?.strikeRider);
    // (A summary line this module posts for the item after the Strike: not a card, its item's name in bold.)
    const lineFor = (name, actor) => (message) => !message.getFlag(h.NS, "card") && message.speaker?.actor === actor.id && String(message.content ?? "").includes(`<strong>${name}</strong>`);
    // (The ability module's timed Off-Guard: an Effect granting PF2e's condition, flagged timedCondition — its scripts/live.js timedCondition.)
    const offGuards = (actor) => actor.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.timedCondition?.slug === "off-guard");
    const offGuardConditions = (actor) => actor.itemTypes.condition.filter((condition) => condition.slug === "off-guard");
    const said = (actor) => `effects: ${actor.itemTypes.effect.map((effect) => effect.name).join(", ") || "none"}; conditions: ${actor.itemTypes.condition.map((condition) => condition.slug).join(", ") || "none"}`;
    const resistanceOf = (actor, type = "physical") => Number((actor.attributes?.resistances ?? []).find((entry) => entry.type === type)?.value ?? NaN);
    const sameIgnore = (entry) => Number(entry?.value) === IGNORED.value && JSON.stringify([...(entry?.types ?? [])].sort()) === JSON.stringify([...IGNORED.types].sort());
    const coreFlagOf = (message) => game.messages.get(message.id)?.flags?.[CORE]?.ignoreResistance ?? message.flags?.[CORE]?.ignoreResistance ?? null;

    // (The core with 321af5b: its damage patch lowers resistances in part, and says what it would lower.)
    const assertCore = () => h.assert(game.modules.get(CORE)?.active && typeof game.modules.get(CORE).api?.patches?.damage?.lowered === "function", "the resolution core with 321af5b (api.patches.damage.lowered) — update pftest's core first");

    // An archer holding a shortbow. (A gunslinger's round fired as an arrow: give() presets an ammunition with no base item to arrows, and the
    // shortbow's reload 0 makes PF2e take the selected ammunition — its id in the Strike's options, as the core's stamp wants.)
    const archerOf = async (scene, { name, x, y }) => {
        const { actor: archer, token: archerToken } = await h.creature(scene, `${name} Archer`, { type: "character", x, y, level: 18 });
        const bow = await h.give(archer, "Shortbow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await archerToken.object?.control?.();
        return { archer, archerToken, bow };
    };
    // One Awakened Adamantine Shot (or a stack) given and selected in the bow.
    const load = async (archer, bow, quantity = 1) => {
        const shot = await h.give(archer, SHOT);
        if (quantity !== 1) await shot.update({ "system.quantity": quantity });
        await bow.update({ "system.selectedAmmoId": shot.id });
        return shot;
    };
    // Activated and its Strike card applied: the readied Strike for that shot, and the core's flag on the shot (scripts/strikes.js applyStrikeCard).
    const ready = async (archer, shot) => {
        const since = Date.now();
        await api().activate(shot.uuid, 0);
        const card = await h.messageAfter(since, h.itemCard("strike"), { what: "the shot's Strike card" });
        h.assert(/as 20 lower/.test(text(card)) && /Off-Guard for 1 minute/.test(text(card)), `the card's lines (${text(card).slice(0, 500)})`);
        await api().apply(card.id);
        const readied = readiedOf(archer);
        await h.until(() => readied()?.flags[h.NS].strikeRider.ammoId === shot.id, "the readied Strike for the shot", { timeout: 8000 });
        const flag = () => archer.items.get(shot.id)?.getFlag(CORE, "ignoreResistance");
        await h.until(() => flag(), `the core's ignoreResistance flag on the shot (its flags: ${JSON.stringify(archer.items.get(shot.id)?.flags?.[CORE] ?? {})})`, { timeout: 8000 });
        h.assert(sameIgnore(flag()), `ignoreResistance { value 20, types physical, all-damage, piercing, bludgeoning } (${JSON.stringify(flag())})`);
        return { card, readied, flag: flag() };
    };
    // PF2e's Strike at that token, every d20 at that face; → { action, attack, outcome }.
    const shoot = async (archer, bow, token, face) => {
        await h.target(token);
        const { action, attack } = await h.withDie(face, () => h.strike(archer, bow));
        return { action, attack, outcome: attack.flags.pf2e.context.outcome };
    };
    // PF2e's damage roll of that Strike (its critical one after a critical hit).
    const damageRoll = async (action, outcome) => {
        const since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: h.shift() });
        return h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
    };
    // That damage roll applied as PF2e's Damage button does (the roll with its options, the core's stamp among them); → { total, lost, taken }.
    const dealt = async (foe, foeToken, rolled) => {
        const roll = game.messages.get(rolled.id)?.rolls?.[0] ?? rolled.rolls?.[0];
        const before = Number(foe.system.attributes.hp.value);
        const since = Date.now();
        await foe.applyDamage({ damage: roll, token: foeToken });
        const taken = await h.messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-taken" && message.speaker?.actor === foe.id, { what: "PF2e's damage-taken message" });
        await h.wait(300);
        return { total: Number(roll.total), lost: before - Number(foe.system.attributes.hp.value), taken, options: roll.options?.ignoreResistance ?? null };
    };
    const takenWords = (taken) => `${taken.flavor ?? ""} ${taken.content ?? ""}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    return {
        // Awakened Adamantine Shot at a creature with physical resistance 10 and no exceptions: "The shot ignores the first 20 resistance a creature
        // has to physical damage, all damage, or piercing or bludgeoning damage." Applying the Strike card sets the resolution core's
        // ignoreResistance { 20, [physical, all-damage, piercing, bludgeoning] } on the shot; the hit (d20 10 at AC 1) gets no Off-Guard (it's
        // neither a construct nor a creature adamantine gets past); PF2e's damage roll carries the core's stamp, and applied it takes all of its
        // total (resistance 10 counted as 0), PF2e's damage breakdown saying "Ignores 10 of its physical resistance". The resistance reads 10 again
        // after. (Needs core 321af5b.)
        async b2MiscAdamantineShotResistance(scene) {
            assertCore();
            await h.clearSquares(scene, [[2, 2], [5, 2]]);
            const { archer, bow } = await archerOf(scene, { name: "Adamantine Plain", x: 2, y: 2 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Adamantine Resistant", { x: 5, y: 2, ac: 1, hp: 300, alliance: "opposition" });
            await foe.update({ "system.attributes.resistances": [{ type: "physical", value: 10, exceptions: [] }] });
            await h.until(() => resistanceOf(foe) === 10, `physical resistance 10 on the target (${JSON.stringify((foe.attributes?.resistances ?? []).map((entry) => [entry.type, entry.value]))})`, { timeout: 5000 });
            const would = game.modules.get(CORE).api.patches.damage.lowered(foe, [IGNORED]);
            h.assert(would.length === 1 && would[0].type === "physical" && would[0].from === 10 && would[0].to === 0, `the core would lower physical 10 to 0 (${JSON.stringify(would)})`);
            const shot = await load(archer, bow);
            const { readied, flag } = await ready(archer, shot);
            let since = Date.now();
            const { action, outcome } = await shoot(archer, bow, foeToken, 10);
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (d20 10 at AC 1): ${outcome}`);
            const line = await h.messageAfter(since, lineFor(SHOT, archer), { what: "the shot's line after the Strike", timeout: 10000 });
            await h.until(() => !readied(), "the readied Strike spent by the hit", { timeout: 8000 });
            await h.wait(800);
            h.assert(!offGuards(foe).length && !foe.hasCondition("off-guard"), `no Off-Guard on a creature that isn't a construct and resists adamantine too (${said(foe)}; ${text(line)})`);
            const rolled = await damageRoll(action, outcome);
            h.assert([].concat(coreFlagOf(rolled) ?? []).some(sameIgnore), `the core's stamp on PF2e's damage roll (${JSON.stringify(coreFlagOf(rolled))})`);
            const { total, lost, taken, options } = await dealt(foe, foeToken, rolled);
            h.assert(total > 0 && lost === total, `all ${total} taken, its physical resistance 10 ignored (lost ${lost}; the roll's ignoreResistance ${JSON.stringify(options)})`);
            h.assert(/Ignores 10 of its physical resistance/.test(takenWords(taken)), `PF2e's damage breakdown names it (${takenWords(taken).slice(0, 300)})`);
            h.assert(resistanceOf(foe) === 10, `the resistance reads 10 again after (${resistanceOf(foe)})`);
            return { flag, line: text(line), total, lost, breakdown: takenWords(taken).slice(0, 200) };
        },

        // Awakened Adamantine Shot at a golem — a construct whose physical resistance 10 has an adamantine exception — and a miss: "Against a
        // construct or creature who already has a resistance bypassed by adamantine, or a weakness to adamantine, the shot shatters the target's
        // defenses, causing them to become Off-Guard for 1 minute instead." The hit (d20 10 at AC 1): Off-Guard for 1 minute, the ability module's
        // timed condition, exactly once though both of its kinds fit (the construct trait and the material — scripts/strikes.js's once). A second
        // shot readied and missed at another golem (d20 10 at AC 60): its Strike spent, nothing applied.
        async b2MiscAdamantineShotGolem(scene) {
            assertCore();
            await h.clearSquares(scene, [[2, 5], [5, 5], [5, 7]]);
            const { archer, bow } = await archerOf(scene, { name: "Adamantine Golem", x: 2, y: 5 });
            const golemOf = async (name, y, ac) => {
                const { actor, token } = await h.creature(scene, name, { x: 5, y, ac, hp: 300, alliance: "opposition" });
                await actor.update({ "system.traits.value": ["construct"], "system.attributes.resistances": [{ type: "physical", value: 10, exceptions: ["adamantine"] }] });
                await h.until(() => actor.system.traits.value.includes("construct") && resistanceOf(actor) === 10, `a construct with physical 10 except adamantine (${JSON.stringify(actor.system.traits.value)}; ${JSON.stringify(actor.system.attributes.resistances)})`, { timeout: 5000 });
                return { actor, token };
            };
            const { actor: golem, token: golemToken } = await golemOf("Adamantine Golem Hit", 5, 1);
            const { actor: missed, token: missedToken } = await golemOf("Adamantine Golem Missed", 7, 60);
            // (The hit.)
            const first = await ready(archer, await load(archer, bow));
            let since = Date.now();
            const hit = await shoot(archer, bow, golemToken, 10);
            h.assert(["success", "criticalSuccess"].includes(hit.outcome), `a hit (d20 10 at AC 1): ${hit.outcome}`);
            const line = await h.messageAfter(since, lineFor(SHOT, archer), { what: "the shot's line after the hit", timeout: 10000 });
            await h.until(() => offGuards(golem).length > 0, `Off-Guard on the golem (${said(golem)}; ${text(line)})`, { timeout: 8000 });
            await h.until(() => golem.hasCondition("off-guard"), `PF2e's Off-Guard condition granted (${said(golem)})`, { timeout: 5000 });
            await h.wait(1000);
            h.assert(offGuards(golem).length === 1 && offGuardConditions(golem).length === 1, `once, though both kinds fit (${offGuards(golem).length} Effects, ${offGuardConditions(golem).length} conditions; ${said(golem)})`);
            const duration = offGuards(golem)[0].system.duration;
            h.assert(duration.value === 1 && duration.unit === "minutes", `for 1 minute (${JSON.stringify(duration)})`);
            await h.until(() => !first.readied(), "the first readied Strike spent", { timeout: 8000 });
            // (The miss.)
            const second = await ready(archer, await load(archer, bow));
            since = Date.now();
            const miss = await shoot(archer, bow, missedToken, 10);
            h.assert(["failure", "criticalFailure"].includes(miss.outcome), `a miss (d20 10 at AC 60): ${miss.outcome}`);
            const missLine = await h.messageAfter(since, lineFor(SHOT, archer), { what: "the shot's line after the miss", timeout: 10000 });
            await h.until(() => !second.readied(), "the second readied Strike spent by the miss", { timeout: 8000 });
            await h.wait(1000);
            h.assert(!offGuards(missed).length && !missed.hasCondition("off-guard"), `nothing on the golem missed (${said(missed)}; ${text(missLine)})`);
            return { hit: text(line), miss: text(missLine), offGuard: `${duration.value} ${duration.unit}` };
        },

        // Awakened Adamantine Shot's two kinds on their own (plan.ifTarget's material entry and its construct entry, each read live by
        // src/live/if-target.js planFor): a giant whose physical resistance 10 has an adamantine exception (not a construct) and a construct with
        // no resistance at all, each hit by its own readied shot (d20 10 at AC 1) — each Off-Guard for 1 minute, once. (So the golem's single
        // Off-Guard in b2MiscAdamantineShotGolem isn't one kind standing in for another that doesn't fit.)
        async b2MiscAdamantineShotEachKind(scene) {
            assertCore();
            await h.clearSquares(scene, [[2, 10], [5, 10], [5, 12]]);
            const { archer, bow } = await archerOf(scene, { name: "Adamantine Kinds", x: 2, y: 10 });
            const { actor: giant, token: giantToken } = await h.creature(scene, "Adamantine Giant", { x: 5, y: 10, ac: 1, hp: 300, alliance: "opposition" });
            await giant.update({ "system.traits.value": ["giant", "humanoid"], "system.attributes.resistances": [{ type: "physical", value: 10, exceptions: ["adamantine"] }] });
            const { actor: construct, token: constructToken } = await h.creature(scene, "Adamantine Construct", { x: 5, y: 12, ac: 1, hp: 300, alliance: "opposition" });
            await construct.update({ "system.traits.value": ["construct"], "system.attributes.resistances": [] });
            await h.until(() => resistanceOf(giant) === 10 && !giant.system.traits.value.includes("construct") && construct.system.traits.value.includes("construct") && !(construct.attributes?.resistances ?? []).length, "the giant (adamantine past its resistance) and the construct (no resistance)", { timeout: 5000 });
            const results = {};
            for (const [actor, token] of [[giant, giantToken], [construct, constructToken]]) {
                const { readied } = await ready(archer, await load(archer, bow));
                const since = Date.now();
                const { outcome } = await shoot(archer, bow, token, 10);
                h.assert(["success", "criticalSuccess"].includes(outcome), `a hit at ${actor.name} (d20 10 at AC 1): ${outcome}`);
                const line = await h.messageAfter(since, lineFor(SHOT, archer), { what: `the shot's line after the hit at ${actor.name}`, timeout: 10000 });
                await h.until(() => offGuards(actor).length > 0 && actor.hasCondition("off-guard"), `Off-Guard on ${actor.name} (${said(actor)}; ${text(line)})`, { timeout: 8000 });
                await h.wait(800);
                h.assert(offGuards(actor).length === 1, `once on ${actor.name} (${said(actor)})`);
                const duration = offGuards(actor)[0].system.duration;
                h.assert(duration.value === 1 && duration.unit === "minutes", `${actor.name}'s for 1 minute (${JSON.stringify(duration)})`);
                await h.until(() => !readied(), `the readied Strike at ${actor.name} spent`, { timeout: 8000 });
                results[actor.name] = text(line);
            }
            return results;
        },

        // Awakened Adamantine Shot bought two to a stack, one activated: the shot activated ignores the resistance, the other one (fired after
        // it, never activated) doesn't — its damage takes physical resistance 10 as PF2e counts it. A probe of the bug reported with this file
        // (scripts/strikes.js sets the core's flag on the whole stack and nothing takes it off after the readied Strike is spent, so every later
        // shot of that stack keeps ignoring 20 resistance): it fails at its last checks until that's fixed. Both Strikes hit (d20 10 at AC 1).
        async b2MiscAdamantineShotStackProbe(scene) {
            assertCore();
            await h.clearSquares(scene, [[2, 15], [5, 15]]);
            const { archer, bow } = await archerOf(scene, { name: "Adamantine Stack", x: 2, y: 15 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Adamantine Stack Target", { x: 5, y: 15, ac: 1, hp: 300, alliance: "opposition" });
            await foe.update({ "system.attributes.resistances": [{ type: "physical", value: 10, exceptions: [] }] });
            await h.until(() => resistanceOf(foe) === 10, "physical resistance 10 on the target", { timeout: 5000 });
            const shots = await load(archer, bow, 2);
            const { readied } = await ready(archer, shots);
            // (The activated shot: its damage ignores the resistance.)
            let since = Date.now();
            const first = await shoot(archer, bow, foeToken, 10);
            h.assert(["success", "criticalSuccess"].includes(first.outcome), `the first a hit: ${first.outcome}`);
            await h.messageAfter(since, lineFor(SHOT, archer), { what: "the shot's line after the first Strike", timeout: 10000 });
            await h.until(() => !readied(), "the readied Strike spent by the first hit", { timeout: 8000 });
            await h.until(() => Number(archer.items.get(shots.id)?.system?.quantity) === 1, `one shot left in the stack (${archer.items.get(shots.id)?.system?.quantity})`, { timeout: 5000 });
            const one = await dealt(foe, foeToken, await damageRoll(first.action, first.outcome));
            h.assert(one.total > 0 && one.lost === one.total, `the activated shot ignores the resistance: all ${one.total} taken (${one.lost})`);
            // (The other shot, not activated.)
            const second = await shoot(archer, bow, foeToken, 10);
            h.assert(["success", "criticalSuccess"].includes(second.outcome), `the second a hit: ${second.outcome}`);
            const rolled = await damageRoll(second.action, second.outcome);
            const two = await dealt(foe, foeToken, rolled);
            const left = archer.items.get(shots.id)?.getFlag(CORE, "ignoreResistance") ?? null;
            h.assert(two.lost === Math.max(0, two.total - 10), `the shot not activated takes the resistance: ${two.total} − 10 → ${Math.max(0, two.total - 10)}, lost ${two.lost} (the damage roll's stamp ${JSON.stringify(coreFlagOf(rolled))}; the stack's flag still ${JSON.stringify(left)})`);
            h.assert(!coreFlagOf(rolled), `no stamp on its damage roll (${JSON.stringify(coreFlagOf(rolled))})`);
            return { first: one, second: { total: two.total, lost: two.lost }, stackFlag: left };
        },

        // Awakened Adamantine Shot as a gunslinger plays it: activated (its Strike card applied, the core's flag on the shot), then loaded into a
        // Flintlock Pistol (reload 1) with PF2e's own attach — the round becomes the pistol's subitem with its id and flags, and the stack of one is
        // deleted — and fired (d20 10 at AC 1) at a creature with physical resistance 10: its damage should ignore that resistance, all of it
        // taken. A probe of the bug reported with this file (the core's stamp reads only the actor's own items, scripts/patches.js rollIgnores(
        // document.actor.items …), so a round loaded into a firearm's subitems isn't found): it fails at its damage checks until that's fixed.
        async b2MiscAdamantineShotFirearmProbe(scene) {
            assertCore();
            await h.clearSquares(scene, [[2, 18], [5, 18]]);
            const { actor: gunner, token: gunnerToken } = await h.creature(scene, "Adamantine Gunslinger", { type: "character", x: 2, y: 18, level: 18 });
            const { actor: foe, token: foeToken } = await h.creature(scene, "Adamantine Gun Target", { x: 5, y: 18, ac: 1, hp: 300, alliance: "opposition" });
            await foe.update({ "system.attributes.resistances": [{ type: "physical", value: 10, exceptions: [] }] });
            await h.until(() => resistanceOf(foe) === 10, "physical resistance 10 on the target", { timeout: 5000 });
            const pistol = await h.give(gunner, "Flintlock Pistol");
            await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            const shot = await h.give(gunner, SHOT);
            await shot.update({ "system.baseItem": "rounds-flintlock-pistol" });
            await gunnerToken.object?.control?.();
            const { readied } = await ready(gunner, shot);
            // (Loaded: PF2e's Reload, as its sheet's load does — the round now the pistol's subitem.)
            const loadedShot = () => gunner.items.get(pistol.id)?.subitems?.get?.(shot.id) ?? [...(gunner.items.get(pistol.id)?.subitems ?? [])].find((entry) => entry.type === "ammo") ?? null;
            await pistol.attach(gunner.items.get(shot.id), { quantity: 1, stack: true });
            await h.until(() => Number(loadedShot()?.system?.quantity) === 1, `the round loaded in the pistol (subitems: ${JSON.stringify([...(gunner.items.get(pistol.id)?.subitems ?? [])].map((entry) => [entry.id, entry.name, entry.system?.quantity]))})`, { timeout: 5000 });
            const carried = { sameId: loadedShot()?.id === shot.id, flag: loadedShot()?.getFlag?.(CORE, "ignoreResistance") ?? null, stackLeft: Boolean(gunner.items.get(shot.id)) };
            const since = Date.now();
            const { action, outcome } = await shoot(gunner, pistol, foeToken, 10);
            h.assert(["success", "criticalSuccess"].includes(outcome), `a hit (d20 10 at AC 1): ${outcome}`);
            const line = await h.messageAfter(since, lineFor(SHOT, gunner), { what: "the shot's line after the Strike (the readied Strike fired with the loaded round)", timeout: 10000 });
            await h.until(() => !readied(), "the readied Strike spent by the hit", { timeout: 8000 });
            const rolled = await damageRoll(action, outcome);
            const { total, lost, options } = await dealt(foe, foeToken, rolled);
            h.assert(total > 0 && lost === total, `all ${total} taken, its physical resistance 10 ignored (lost ${lost}; the damage roll's stamp ${JSON.stringify(coreFlagOf(rolled))}, the roll's ignoreResistance ${JSON.stringify(options)}; the loaded round ${JSON.stringify(carried)})`);
            return { line: text(line), total, lost, carried };
        }
    };
};
