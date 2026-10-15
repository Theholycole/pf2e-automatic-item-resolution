// The item module's live check in the disposable world pftest (GM only), run in the browser:
//   const check = await import("/modules/pf2e-automatic-item-resolution/tools/live-check.mjs");
//   await check.runAll();            // or await check.runCase("potionToDyingAlly")
//   check.results();  await check.cleanup();
// Its test data is "PFTEST ITEM …" (the pftest queue's rule 5), flagged as this module's fixtures, on its own scene
// "PFTEST ITEM Lab", viewed (never activated) while it runs. Cleanup removes only that: its actors, its scene, and the
// chat messages its creatures spoke or its cards made. Each case drives PF2e's own Use or Strike and reads the card.

const NS = "pf2e-automatic-item-resolution";
const KEY = "liveCheck";
const FIXTURE = "liveCheckFixture";
const PREFIX = "PFTEST ITEM";
const shift = () => new MouseEvent("click", { shiftKey: true });
const assert = (value, message) => {
    if (!value) throw new Error(message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function store() {
    const saved = game.user.getFlag(NS, KEY) ?? { results: [] };
    return { saved, persist: () => game.user.setFlag(NS, KEY, saved) };
}

// Waits for a chat message that passes the test, made after since (polls; the hooks' work isn't awaited).
async function messageAfter(since, test, { timeout = 8000, what = "the card" } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const found = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since).reverse().find(test);
        if (found) return found;
        await wait(150);
    }
    throw new Error(`No ${what} within ${timeout / 1000} seconds.`);
}

const itemCard = (kind) => (message) => message.getFlag(NS, "card")?.kind === kind;
const abilitySaveCard = (message) => Boolean(message.flags?.["pf2e-automatic-ability-resolution"]?.card?.plan?.resolution?.check);

async function lab() {
    assert(game.world.id === "pftest" && game.user.isGM, "Disposable pftest, as GM, only.");
    assert(game.modules.get(NS)?.active, "Enable PF2e Automatic Item Resolution first.");
    let scene = game.scenes.find((entry) => entry.name === `${PREFIX} Lab`);
    if (!scene) scene = await Scene.create({ name: `${PREFIX} Lab`, width: 2000, height: 2000, padding: 0, grid: { size: 100, distance: 5, units: "ft" }, flags: { [NS]: { [FIXTURE]: true } } });
    if (canvas.scene?.id !== scene.id) {
        await scene.view();
        await wait(1500);
    }
    return scene;
}

// A creature of the lab: an NPC (HP, AC and saves as given) or a character (for Strikes with weapons and bombs).
async function creature(scene, name, { type = "npc", x = 0, y = 0, hp = 50, ac = 18, save = 8, alliance = "party", level = 3 } = {}) {
    const system = type === "npc"
        ? { details: { level: { value: level }, alliance }, attributes: { hp: { value: hp, max: Math.max(hp, 50) }, ac: { value: ac } }, saves: { fortitude: { value: save }, reflex: { value: save }, will: { value: save } } }
        : { details: { level: { value: level }, alliance } };
    const actor = await Actor.create({ name: `${PREFIX} ${name}`, type, system, flags: { [NS]: { [FIXTURE]: true } } });
    const [token] = await scene.createEmbeddedDocuments("Token", [{ ...actor.prototypeToken.toObject(), actorId: actor.id, actorLink: true, x: x * 100, y: y * 100 }]);
    await wait(300);
    return { actor, token };
}

async function give(actor, name, packId = "pf2e.equipment-srd") {
    const pack = game.packs.get(packId);
    assert(pack, `No pack ${packId}.`);
    const entry = (await pack.getIndex()).find((row) => row.name === name);
    assert(entry, `${name} isn't in ${packId}.`);
    const source = (await pack.getDocument(entry._id)).toObject();
    delete source._id;
    // (Its own ChoiceSets answered, so PF2e doesn't stop the check to ask: Hexing Jar's patron, the first choice.)
    for (const rule of source.system?.rules ?? []) if (rule.key === "ChoiceSet" && rule.selection === undefined && Array.isArray(rule.choices) && rule.choices.length) rule.selection = rule.choices[0].value;
    const [item] = await actor.createEmbeddedDocuments("Item", [source]);
    return item;
}

async function target(...tokens) {
    const ids = tokens.map((token) => token.id);
    if (canvas.tokens?.setTargets) canvas.tokens.setTargets(ids);
    else if (game.user.updateTokenTargets) game.user.updateTokenTargets(ids);
    else for (const [index, token] of tokens.entries()) token.object?.setTarget(true, { releaseOthers: index === 0 });
    await wait(200);
}

async function strike(actor, weapon) {
    const action = (actor.system.actions ?? []).find((entry) => entry.item?.id === weapon.id);
    assert(action, `${actor.name} has no Strike with ${weapon.name}.`);
    const since = Date.now();
    await action.variants[0].roll({ event: shift() });
    const attack = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "attack-roll", { what: "attack roll" });
    return { action, attack };
}

export const cases = {
    // A healing potion fed to a dying ally next to the user: PF2e's own roll heals her once, Dying ends, Wounded rises.
    async potionToDyingAlly(scene) {
        const { actor: user } = await creature(scene, "Medic", { x: 2, y: 2 });
        const { actor: ally } = await creature(scene, "Dying Ally", { x: 3, y: 2, hp: 0 });
        await ally.increaseCondition("dying");
        const potion = await give(user, "Healing Potion (Minor)");
        const since = Date.now();
        await potion.consume();
        const used = await messageAfter(since, (message) => message.flags?.pf2e?.origin?.type === "consumable" && message.rolls?.length, { what: "PF2e's Use message" });
        const card = await messageAfter(since, itemCard("item"));
        const state = card.getFlag(NS, "card");
        assert(state.drinkers.some((entry) => entry.actorUuid === ally.uuid), "the ally next to the user is offered");
        assert(used.getFlag(NS, "covered") === card.id && used.flags.pf2e.suppressDamageButtons, "PF2e's apply buttons come off its message");
        const healed = used.rolls[0].total;
        await game.modules.get(NS).api.live.apply(card.id, { drinker: state.drinkers.findIndex((entry) => entry.actorUuid === ally.uuid) });
        await wait(800);
        assert(ally.system.attributes.hp.value === Math.min(healed, ally.system.attributes.hp.max), `healed by PF2e's ${healed}: ${ally.system.attributes.hp.value}`);
        assert(!ally.hasCondition("dying"), "no longer dying");
        assert((ally.getCondition("wounded")?.value ?? 0) === 1, "wounded 1");
        return { healed, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // An elixir of life: healed, and its shared Effect made at the grade used, with no prompt.
    async elixirGrade(scene) {
        const { actor: user } = await creature(scene, "Elixir Drinker", { x: 5, y: 2, hp: 10 });
        const elixir = await give(user, "Elixir of Life (Lesser)");
        const since = Date.now();
        await elixir.consume();
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(800);
        const effect = user.itemTypes.effect.find((entry) => entry.name.startsWith("Effect: Elixir of Life"));
        assert(effect, "the Effect is on the drinker");
        const choice = effect.system.rules.find((rule) => rule.key === "ChoiceSet");
        assert(choice?.selection, "its grade chosen with no prompt");
        return { selection: choice.selection, hp: user.system.attributes.hp.value };
    },

    // Mistform Elixir: concealed for its time, through the ability module's applyChange.
    async mistform(scene) {
        const { actor: user } = await creature(scene, "Misty", { x: 7, y: 2 });
        const elixir = await give(user, "Mistform Elixir (Lesser)");
        const since = Date.now();
        await elixir.consume();
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(800);
        assert(user.hasCondition("concealed") || user.itemTypes.effect.some((entry) => /concealed/i.test(entry.name)), "concealed");
        return { effects: user.itemTypes.effect.map((entry) => entry.name) };
    },

    // A bottled lightning hit: the creature next to the target takes PF2e's splash; the target is off-guard.
    async bombSplash(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Bomber", { type: "character", x: 2, y: 6 });
        const { actor: goblin, token: goblinToken } = await creature(scene, "Bomb Target", { x: 5, y: 6, ac: 1, alliance: "opposition" });
        const { actor: other } = await creature(scene, "Bomb Neighbour", { x: 6, y: 6, alliance: "opposition" });
        const bomb = await give(thrower, "Bottled Lightning (Lesser)");
        await bomb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(goblinToken);
        const before = other.system.attributes.hp.value;
        const { action, attack } = await strike(thrower, bomb);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.damage({ event: shift() });
        const damage = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "damage roll" });
        const card = await messageAfter(since, itemCard("bomb"));
        const state = card.getFlag(NS, "card");
        assert(state.splashed.some((entry) => entry.actorUuid === other.uuid), "the neighbour is listed for the splash");
        assert(Array.isArray(damage.getFlag(NS, "coveredSplash")), "the splash-only roll's buttons come off");
        await game.modules.get(NS).api.live.apply(card.id, { included: state.splashed.map((entry, index) => index) });
        await wait(800);
        assert(other.system.attributes.hp.value < before, `the neighbour splashed: ${before} → ${other.system.attributes.hp.value}`);
        assert(goblin.hasCondition("off-guard") || goblin.itemTypes.effect.some((entry) => /off-guard/i.test(entry.name)), "the target off-guard");
        return { splash: state.splash, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Black adder venom on a shortsword: its next hit posts the poison's save card (the ability module's) and spends it.
    async poisonCoatAndHit(scene) {
        const { actor: rogue, token: rogueToken } = await creature(scene, "Poisoner", { type: "character", x: 2, y: 9 });
        const { token: ogreToken } = await creature(scene, "Poison Target", { x: 3, y: 9, ac: 1, alliance: "opposition" });
        const sword = await give(rogue, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const venom = await give(rogue, "Black Adder Venom");
        let since = Date.now();
        await venom.consume();
        const card = await messageAfter(since, itemCard("poison"));
        const state = card.getFlag(NS, "card");
        await game.modules.get(NS).api.live.apply(card.id, { weapon: state.weapons.findIndex((entry) => entry.id === sword.id) });
        await wait(600);
        assert(rogue.itemTypes.effect.some((entry) => entry.getFlag(NS, "poison")?.weaponId === sword.id), "the coated-weapon Effect");
        await rogueToken.object?.control?.();
        await target(ogreToken);
        since = Date.now();
        const { attack } = await strike(rogue, sword);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the poison's save card" });
        await wait(500);
        assert(!rogue.itemTypes.effect.some((entry) => entry.getFlag(NS, "poison")), "the poison spent");
        return { saveCard: save.id };
    },

    // Freezing Ammunition: activated, loaded in a shortbow; the bow's hit (AC 1) posts the target's DC 19 Fortitude save card,
    // the roll naming that ammunition.
    async ammoHit(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Ammo Archer", { type: "character", x: 2, y: 21 });
        const { token: foeToken } = await creature(scene, "Ammo Target", { x: 4, y: 21, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Freezing Ammunition");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const readied = () => archer.itemTypes.effect.find((entry) => entry.getFlag(NS, "strikeRider"));
        assert(readied()?.getFlag(NS, "strikeRider").ammoId === arrows.id, "the readied Strike for that ammunition");
        await archerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(archer, bow);
        const options = attack.flags.pf2e.context.options ?? [];
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const named = options.filter((option) => /ammo:id:/.test(option));
        const save = await messageAfter(since, abilitySaveCard, { what: `the ammunition's save card (ammunition options: ${named.join(", ") || "none"})` });
        await wait(500);
        assert(!readied(), "the readied Strike spent");
        return { saveCard: save.id, ammoOptions: named };
    },

    // Fear Gem: its card readies the next melee Strike; PF2e's hit (AC 1) leaves the target frightened.
    async strikeRider(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Gem Striker", { type: "character", x: 2, y: 15 });
        const { actor: foe, token: foeToken } = await creature(scene, "Gem Target", { x: 3, y: 15, ac: 1, alliance: "opposition" });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gem = await give(fighter, "Fear Gem");
        let since = Date.now();
        await gem.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        assert(fighter.itemTypes.effect.some((entry) => entry.getFlag(NS, "strikeRider")), "the readied-Strike Effect");
        await fighterToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(fighter, sword);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        const end = Date.now() + 8000;
        while (Date.now() < end && !foe.hasCondition?.("frightened")) await wait(250);
        const value = foe.getCondition?.("frightened")?.value ?? null;
        assert(value === (outcome === "criticalSuccess" ? 2 : 1), `frightened ${outcome === "criticalSuccess" ? 2 : 1} on the target (${value})`);
        assert(!fighter.itemTypes.effect.some((entry) => entry.getFlag(NS, "strikeRider")), "the readied Strike spent");
        return { outcome, frightened: value };
    },

    // Mantle of the Tikbalang: its activation readies a melee Strike whose Effect gives PF2e's damage roll 4d6 mental; the
    // hit (AC 1) keeps it for that roll, and the roll spends it.
    async strikeExtraDice(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Mantle Striker", { type: "character", x: 2, y: 17 });
        const { token: foeToken } = await creature(scene, "Mantle Target", { x: 3, y: 17, ac: 1, alliance: "opposition" });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const mantle = await give(fighter, "Mantle of the Tikbalang");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(mantle.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const readied = () => fighter.itemTypes.effect.find((entry) => entry.getFlag(NS, "strikeRider"));
        assert(readied()?.system.rules.some((rule) => rule.key === "DamageDice" && rule.diceNumber === 4 && rule.damageType === "mental"), "the readied Strike's DamageDice");
        await fighterToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(fighter, sword);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await wait(800);
        assert(readied()?.getFlag(NS, "strikeRider").awaiting === true, "kept for the damage roll");
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        assert(/4d6/.test(formula) && /mental/.test(formula), `PF2e's damage roll carries 4d6 mental (${formula})`);
        const end = Date.now() + 6000;
        while (Date.now() < end && readied()) await wait(250);
        assert(!readied(), "spent by the damage roll");
        return { outcome, formula };
    },

    // Gorum's Tear: its card gives PF2e's RollTwice for the next attack roll; the Strike is rolled 2d20kh, and the Effect goes.
    async rollTwice(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Tear Striker", { type: "character", x: 2, y: 19 });
        const { token: foeToken } = await creature(scene, "Tear Target", { x: 3, y: 19, alliance: "opposition" });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const tear = await give(fighter, "Gorum's Tear");
        const since = Date.now();
        await tear.consume();
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const effect = () => fighter.itemTypes.effect.find((entry) => entry.getFlag(NS, "rollTwice"));
        // (PF2e keeps a rule's selector as a list.)
        assert(effect()?.system.rules.some((rule) => rule.key === "RollTwice" && [].concat(rule.selector).includes("attack-roll")), "the RollTwice Effect");
        await fighterToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(fighter, sword);
        const formula = attack.rolls[0]?.formula ?? "";
        assert(/2d20kh/.test(formula), `rolled twice, the higher kept (${formula})`);
        const end = Date.now() + 6000;
        while (Date.now() < end && effect()) await wait(250);
        assert(!effect(), "the Effect gone after the roll");
        return { formula };
    },

    // Lucky Rabbit's Foot: after a Reflex save, its card has PF2e reroll that save (keeping the new result).
    async rerollSave(scene) {
        const { actor: hero } = await creature(scene, "Lucky One", { x: 6, y: 15 });
        const foot = await give(hero, "Lucky Rabbit's Foot");
        let since = Date.now();
        await hero.saves.reflex.roll({ skipDialog: true, dc: { value: 40 } });
        const save = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === hero.id, { what: "the Reflex save" });
        since = Date.now();
        await foot.consume();
        const card = await messageAfter(since, itemCard("reroll"), { what: "the reroll card" });
        await game.modules.get(NS).api.live.apply(card.id);
        // (PF2e's reroll replaces the message: the old one goes, a new one marked isReroll takes its place.)
        const rerolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.flags.pf2e.context.isReroll && message.speaker?.actor === hero.id, { what: "PF2e's rerolled save" });
        return { save: save.id, rerolled: rerolled.id, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Onyx Panther: its card rolls PF2e's own Sneak for the user, with the panther's +1 item bonus among the roll's modifiers.
    async itemAction(scene) {
        const { actor: sneak } = await creature(scene, "Panther Sneak", { type: "character", x: 9, y: 15 });
        const panther = await give(sneak, "Onyx Panther");
        const since = Date.now();
        await panther.consume();
        const card = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === sneak.id, { what: "PF2e's Sneak roll", timeout: 12000 });
        const bonus = (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.label === "Onyx Panther");
        assert(bonus?.modifier === 1 && bonus.type === "item", `the +1 item bonus on the roll (${JSON.stringify(bonus ?? null)})`);
        return { roll: roll.id, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Surging Serum: its counteract card finds the drinker's plain clumsy, takes the GM's DC 1 and rank 1, rolls, and ends it.
    async counteract(scene) {
        const { actor: drinker } = await creature(scene, "Clumsy Drinker", { type: "character", x: 12, y: 15 });
        await drinker.increaseCondition("clumsy");
        const serum = await give(drinker, "Surging Serum (Lesser)");
        const since = Date.now();
        await serum.consume();
        const card = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(500);
        const rows = game.messages.get(card.id).getFlag(NS, "card").rows;
        assert(rows.some((row) => row.kind === "condition" && row.slug === "clumsy"), `clumsy found (${JSON.stringify(rows)})`);
        await game.modules.get(NS).api.live.apply(card.id, { rows: rows.map((row) => ({ ticked: row.slug === "clumsy", dc: 1, rank: 1 })) });
        const end = Date.now() + 8000;
        while (Date.now() < end && drinker.hasCondition("clumsy")) await wait(250);
        assert(!drinker.hasCondition("clumsy"), "clumsy counteracted");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Longnight Tea with the Tea Ceremony ticked: its Effect lasts 8 hours and the drinker's fatigued goes.
    async teaCeremony(scene) {
        const { actor: drinker } = await creature(scene, "Tea Drinker", { type: "character", x: 2, y: 3 });
        await drinker.increaseCondition("fatigued");
        const tea = await give(drinker, "Longnight Tea");
        const since = Date.now();
        await tea.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the tea's card" });
        assert(card.getFlag(NS, "card").ceremony === false, "the Tea Ceremony tick");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, ceremony: true });
        const end = Date.now() + 8000;
        let effect = null;
        while (Date.now() < end && !(effect = drinker.itemTypes.effect.find((entry) => entry.name === "Effect: Longnight Tea"))) await wait(250);
        assert(effect, "the tea's Effect");
        assert(effect.system.duration.value === 8 && effect.system.duration.unit === "hours", `8 hours (${effect.system.duration.value} ${effect.system.duration.unit})`);
        assert(!drinker.hasCondition("fatigued"), "fatigued removed");
        return { duration: effect.system.duration, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Redsand Hourglass after a Reflex save: the card's own reroll with +4 circumstance, its degree against the same DC.
    async bonusReroll(scene) {
        const { actor: hero } = await creature(scene, "Sand Saver", { type: "character", x: 4, y: 3 });
        let since = Date.now();
        await hero.saves.reflex.roll({ skipDialog: true, dc: { value: 30 } });
        await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === hero.id, { what: "the Reflex save" });
        const glass = await give(hero, "Redsand Hourglass");
        const { compileActivations } = await import(`/modules/${NS}/src/compiler/permanent.js`);
        const index = compileActivations({ ...glass.toObject(false), uuid: glass.uuid }).find((entry) => entry.plan?.builtin === "reroll")?.index;
        assert(Number.isInteger(index), "the hourglass's reroll activation");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(glass.uuid, index);
        const card = await messageAfter(since, itemCard("reroll"), { what: "the reroll card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await wait(800);
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /\+ 4 circumstance\) against DC 30/.test(line)), `the card's own roll (${JSON.stringify(results)})`);
        return { results };
    },

    // Alchemists+: Olobigonde Fugu's own Effect matches its text and is applied; Concealing Puffball's doesn't (status for
    // item) and gives a note instead.
    async thirdPartyEffects(scene) {
        assert(game.modules.get("pf2e-team-plus-alchemists")?.active, "Alchemists+ isn't active in pftest.");
        const { actor: eater } = await creature(scene, "Fugu Eater", { type: "character", x: 6, y: 3 });
        const PACK = "pf2e-team-plus-alchemists.pf2e-items";
        const fugu = await give(eater, "Olobigonde Fugu", PACK);
        let since = Date.now();
        await fugu.consume();
        let card = await messageAfter(since, itemCard("item"), { what: "the fugu's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        let end = Date.now() + 8000;
        while (Date.now() < end && !eater.itemTypes.effect.some((entry) => entry.name === "Effect: Olobigonde Fugu")) await wait(250);
        assert(eater.itemTypes.effect.some((entry) => entry.name === "Effect: Olobigonde Fugu"), "the matching Effect applied");
        const puffball = await give(eater, "Concealing Puffball (Lesser)", PACK);
        since = Date.now();
        await puffball.consume();
        card = await messageAfter(since, itemCard("item"), { what: "the puffball's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        end = Date.now() + 6000;
        let results = [];
        while (Date.now() < end && !(results = game.messages.get(card.id).getFlag(NS, "card").results ?? []).length) await wait(250);
        assert(!eater.itemTypes.effect.some((entry) => entry.name === "Effect: Concealing Puffball (Lesser)"), "not the mismatching Effect");
        assert(results.some((line) => /wasn't applied/.test(line)), `a note instead (${JSON.stringify(results)})`);
        return { results };
    },

    // Magic+: a Fortune Dragonbreath Rapier's Unleash Dragonbreath — its runes' damage and DC, a basic save card at the target.
    async dragonbreath(scene) {
        assert(game.modules.get("pf2e-team-plus-magic")?.active, "Magic+ isn't active in pftest.");
        const { actor: wielder } = await creature(scene, "Dragon Wielder", { type: "character", x: 8, y: 3 });
        const { token: foe } = await creature(scene, "Breath Target", { x: 9, y: 3, alliance: "opposition" });
        const rapier = await give(wielder, "Fortune Dragonbreath Rapier", "pf2e-team-plus-magic.items");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(rapier.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the breath's save card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.against?.value === 23 && check.basic === true, `basic DC 23 (${JSON.stringify(check)})`);
        return { save: save.id, check };
    },

    // Crying Angel Pendant: PF2e's Administer First Aid at the targeted dying ally, with the pendant's +1 item bonus.
    async firstAid(scene) {
        const { actor: healer } = await creature(scene, "Angel Healer", { type: "character", x: 10, y: 3 });
        // (A character: PF2e's stabilize DC is a character's recovery DC.)
        const { actor: ally, token: allyToken } = await creature(scene, "First Aid Ally", { type: "character", x: 11, y: 3, hp: 0 });
        await ally.increaseCondition("dying");
        const pendant = await give(healer, "Crying Angel Pendant");
        const since = Date.now();
        await pendant.consume();
        const card = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === healer.id, { what: "PF2e's First Aid roll", timeout: 12000 });
        const bonus = (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.label === "Crying Angel Pendant");
        assert(bonus?.modifier === 1, `the +1 item bonus (${JSON.stringify(bonus ?? null)})`);
        // (Stabilize's DC, 5 + recovery DC + dying value: PF2e grades it.)
        assert(roll.flags.pf2e.context.outcome, `a degree against the stabilize DC (${JSON.stringify(roll.flags.pf2e.context.dc ?? null)})`);
        await wait(800);
        return { outcome: roll.flags.pf2e.context.outcome, results: game.messages.get(card.id).getFlag(NS, "card").results, dying: ally.hasCondition("dying") };
    },

    // Spark Wafer: its save goes to the creatures targeted, through the ability module's save card.
    async useSave(scene) {
        const { actor: user } = await creature(scene, "Snapper", { x: 2, y: 12 });
        const { token: foe } = await creature(scene, "Spark Target", { x: 3, y: 12, alliance: "opposition" });
        const wafer = await give(user, "Spark Wafer");
        const since = Date.now();
        await wafer.consume();
        const card = await messageAfter(since, itemCard("expose"));
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        await messageAfter(since, abilitySaveCard, { what: "the save card" });
        return { card: card.id };
    },

    // A cloak of elvenkind on the character sheet: its Activate button on the inventory row posts its cast card and counts
    // its daily use.
    async activations(scene) {
        const { actor: elf } = await creature(scene, "Activator", { type: "character", x: 12, y: 2 });
        const cloak = await give(elf, "Cloak of Elvenkind");
        await elf.sheet.render(true);
        let button = null;
        const end = Date.now() + 8000;
        while (Date.now() < end && !button) {
            await wait(250);
            const root = elf.sheet.element?.[0] ?? elf.sheet.element;
            button = root?.querySelector?.(`li[data-item-id="${cloak.id}"] .air-activate[data-air-activate="0"]`) ?? null;
        }
        try {
            assert(button, "the Activate button on the cloak's inventory row");
            assert(/once per day/.test(button.dataset.tooltip ?? ""), `its tooltip (${button.dataset.tooltip})`);
            const since = Date.now();
            button.click();
            const cast = await messageAfter(since, itemCard("cast"), { what: "the activation's cast card" });
            assert(cloak.getFlag(NS, "activationUses")?.[0]?.count === 1, "its use counted");
            return { cast: cast.id, tooltip: button.dataset.tooltip };
        } finally {
            await elf.sheet.close();
        }
    },

    // Hexing Jar: its Focus Point card adds a point to a witch's pool; in its own fixture encounter, the point is taken
    // back at the end of the witch's turn when unspent (PF2e's pf2e.endTurn).
    async focusPoint(scene) {
        const { actor: witch, token } = await creature(scene, "Hexer", { type: "character", x: 15, y: 2, level: 5 });
        const { token: other } = await creature(scene, "Bystander", { x: 17, y: 2 });
        // (A focus pool: a focus spellcasting entry with one hex; PF2e counts its non-cantrip focus spells for the pool's
        // maximum, so Cackle, not the Evil Eye cantrip.)
        const [entry] = await witch.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Hexes`, type: "spellcastingEntry", system: { prepared: { value: "focus" }, tradition: { value: "occult" }, ability: { value: "int" } } }]);
        const spells = game.packs.get("pf2e.spells-srd");
        const row = (await spells.getIndex()).find((candidate) => candidate.name === "Cackle");
        assert(row, "Cackle isn't in PF2e's spells.");
        const hex = (await spells.getDocument(row._id)).toObject();
        delete hex._id;
        hex.system.location = { value: entry.id };
        await witch.createEmbeddedDocuments("Item", [hex]);
        await witch.update({ "system.resources.focus.value": 0 });
        assert(Number(witch.system.resources?.focus?.max) >= 1, `a focus pool (max ${witch.system.resources?.focus?.max})`);
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: witch.id, initiative: 20 }, { tokenId: other.id, sceneId: scene.id, actorId: other.actorId, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            assert(combat.combatant?.actorId === witch.id, "the witch's turn first");
            const jar = await give(witch, "Hexing Jar");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(jar.uuid, 0);
            const focus = await messageAfter(since, itemCard("focus"), { what: "the Focus Point card" });
            await game.modules.get(NS).api.live.apply(focus.id);
            await wait(500);
            assert(witch.system.resources.focus.value === 1, `a Focus Point gained (${witch.system.resources.focus.value})`);
            assert(witch.getFlag(NS, "focusGrant")?.combatId === combat.id, "the gain kept for the turn's end");
            await combat.nextTurn();
            const end = Date.now() + 8000;
            while (Date.now() < end && witch.system.resources.focus.value !== 0) await wait(250);
            assert(witch.system.resources.focus.value === 0, `the unspent point lost at the end of the turn (${witch.system.resources.focus.value})`);
            return { card: focus.id, results: game.messages.get(focus.id).getFlag(NS, "card").results };
        } finally {
            await combat.delete();
        }
    },

    // Invisibility Potion: the spell module casts it on the drinker (its castFromItem; run after its own live check).
    async castFromPotion(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: user } = await creature(scene, "Vanisher", { type: "character", x: 9, y: 12, level: 9 });
        const potion = await give(user, "Invisibility Potion");
        const since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("cast"));
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        return { cast: cast.id, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Mask of the Mantis (Major)'s Enhance Vision, a cast in words with two spells: the card's picker, the second picked,
    // and the spell module casts See the Unseen at rank 5 on the wearer.
    async castChoice(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: user } = await creature(scene, "Mantis Seer", { type: "character", x: 9, y: 14, level: 12 });
        const mask = await give(user, "Mask of the Mantis (Major)");
        const since = Date.now();
        // (Its activations by name: Enhance Vision is the first.)
        await game.modules.get(NS).api.live.activate(mask.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        const state = card.getFlag(NS, "card");
        assert(state.plan.choices?.map((entry) => entry.spell.name).join(",") === "Darkvision,See the Unseen", `its choices (${state.plan.choices?.map((entry) => entry.spell.name)})`);
        assert(/data-air-field="choice"/.test(card.content), "the picker");
        await game.modules.get(NS).api.live.apply(card.id, { choice: 1 });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.rank === 5, `rank 5 (${flag.rank})`);
        assert(/See the Unseen/.test(cast.flavor ?? "") || /See the Unseen/.test(cast.content ?? "") || cast.item?.name === "See the Unseen", "See the Unseen cast");
        return { cast: cast.id, results: game.messages.get(card.id).getFlag(NS, "card").results };
    }
};

// One case: its result recorded (on this GM's user flag); a dialog left open over a minute is answered and fails it.
export async function runCase(name) {
    assert(cases[name], `Unknown case ${name}`);
    const scene = await lab();
    const { saved, persist } = store();
    const answered = [];
    const watchdog = setInterval(() => {
        for (const app of foundry.applications.instances.values()) {
            if (!app.rendered || app.constructor.name !== "DialogV2") continue;
            app.__itemCheckSeen ??= Date.now();
            if (Date.now() - app.__itemCheckSeen < 60000) continue;
            const button = app.element?.querySelector('button[data-action="ok"]') ?? app.element?.querySelector("button[autofocus]") ?? app.element?.querySelector("footer button, button");
            if (button) {
                answered.push(app.title ?? "a dialog");
                button.click();
            }
        }
    }, 5000);
    let result;
    try {
        result = { name, passed: true, at: new Date().toISOString(), details: await cases[name](scene) };
    } catch (error) {
        result = { name, passed: false, at: new Date().toISOString(), error: error.message, stack: error.stack };
    } finally {
        clearInterval(watchdog);
    }
    if (answered.length) result = { ...result, passed: false, error: `Dialogs left open: ${answered.join("; ")}${result.error ? ` — then: ${result.error}` : ""}` };
    saved.results.push(result);
    await persist();
    return result;
}

export async function runAll(names = Object.keys(cases)) {
    const out = [];
    for (const name of names) out.push(await runCase(name));
    return out.map((result) => `${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
}

export const results = () => store().saved;

// Only this check's data: its fixture actors, its lab scene, and the chat messages its creatures spoke or its cards made.
export async function cleanup() {
    const actors = game.actors.filter((actor) => actor.getFlag(NS, FIXTURE) && actor.name.startsWith(PREFIX));
    const ids = new Set(actors.map((actor) => actor.id));
    // (Every message its creatures spoke: PF2e's, this module's cards, the ability module's save cards for them.)
    const messages = game.messages.filter((message) => ids.has(message.speaker?.actor)).map((message) => message.id);
    for (let index = 0; index < messages.length; index += 200) await ChatMessage.deleteDocuments(messages.slice(index, index + 200)).catch(() => null);
    if (actors.length) await Actor.deleteDocuments(actors.map((actor) => actor.id));
    // (Its own encounters only, flagged as its fixtures: never another.)
    const combats = game.combats.filter((combat) => combat.getFlag(NS, FIXTURE));
    for (const combat of combats) await combat.delete();
    const scene = game.scenes.find((entry) => entry.name === `${PREFIX} Lab` && entry.getFlag(NS, FIXTURE));
    if (scene) await scene.delete();
    return { actors: actors.length, messages: messages.length, combats: combats.length, scene: Boolean(scene) };
}
