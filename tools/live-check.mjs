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

// The lab's squares a case needs free (a teleport's): this module's test tokens a case before left there removed. (The lab is 20 squares
// across and nearly every one is some case's.)
async function clearSquares(scene, squares) {
    const size = canvas.grid.size;
    const ids = scene.tokens.filter((token) => String(token.name ?? token.actor?.name ?? "").startsWith(PREFIX) && squares.some(([x, y]) => token.x === x * size && token.y === y * size)).map((token) => token.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
}

async function lab() {
    assert(game.world.id === "pftest" && game.user.isGM, "Disposable pftest, as GM, only.");
    assert(game.modules.get(NS)?.active, "Enable PF2e Automatic Item Resolution first.");
    let scene = game.scenes.find((entry) => entry.name === `${PREFIX} Lab`);
    if (!scene) scene = await Scene.create({ name: `${PREFIX} Lab`, width: 2000, height: 2000, padding: 0, grid: { size: 100, distance: 5, units: "ft" }, flags: { [NS]: { [FIXTURE]: true } } });
    if (canvas.scene?.id !== scene.id) {
        await scene.view();
        await wait(1500);
    }
    // (A lab scene just made: its canvas drawn before the first case, or the creatures next to its user weren't found.)
    for (const stop = Date.now() + 10000; Date.now() < stop && !(canvas.ready && canvas.scene?.id === scene.id); ) await wait(100);
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
    // (Drawn on the canvas before the case goes on: on a lab scene just made, the first case's creatures weren't yet, and what looks for
    // creatures nearby found none.)
    for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === scene.id && !token.object; ) await wait(100);
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
    // ("Ammunition any": its type preset, so PF2e doesn't ask — arrows, for a bow.)
    if (source.type === "ammo" && !source.system?.baseItem) source.system.baseItem = "arrows";
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

// The module's own item, from its compendium (else, before Foundry has loaded the pack, its source in packs/_source/items): put
// into the actor's inventory, as a drop from the pack does.
async function ownItem(actor, file) {
    const pack = game.packs.get(`${NS}.items`);
    const wanted = await (await fetch(`/modules/${NS}/packs/_source/items/${file}`, { cache: "reload" })).json();
    const document = pack ? await pack.getDocument(wanted._id) : null;
    const source = document ? document.toObject() : wanted;
    delete source._id;
    const [item] = await actor.createEmbeddedDocuments("Item", [source]);
    return item;
}

// A DialogV2 open with that title (polls).
async function dialogTitled(title, { timeout = 8000 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const app = [...foundry.applications.instances.values()].find((entry) => entry.rendered && entry.constructor.name === "DialogV2" && entry.title === title);
        if (app) return app;
        await wait(150);
    }
    throw new Error(`No "${title}" dialog within ${timeout / 1000} seconds.`);
}

async function until(test, what, { timeout = 8000 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        if (test()) return;
        await wait(150);
    }
    throw new Error(`Not ${what} within ${timeout / 1000} seconds.`);
}

// A datalist's option for a name: that name alone, else that name from PF2e's own pack.
const optionFor = (root, input, name) => {
    const values = [...root.querySelectorAll(`#${input.getAttribute("list")} option`)].map((option) => option.value);
    return values.find((value) => value === name) ?? values.find((value) => value.startsWith(`${name} (`) && /Spells|Equipment/.test(value)) ?? null;
};

// The ability module's save or attack card: "Roll the rest", then Apply once it's ready.
async function rollAndApply(message) {
    let roll = null;
    for (const stop = Date.now() + 5000; Date.now() < stop && !roll; ) {
        roll = document.querySelector(`[data-message-id="${message.id}"] [data-aar-action="roll-all"]`);
        if (!roll) await wait(200);
    }
    assert(roll, "the card's roll button");
    roll.click();
    let button = null;
    for (const stop = Date.now() + 8000; Date.now() < stop && !button; ) {
        const found = document.querySelector(`[data-message-id="${message.id}"] [data-aar-action="apply"]`);
        if (found && !found.disabled) button = found;
        else await wait(200);
    }
    assert(button, "the card's Apply button");
    button.click();
}

// The ability module's card: "Roll the rest" when it has a roll, then Apply.
async function applyAbilityCard(message) {
    await wait(600);
    const roll = document.querySelector(`[data-message-id="${message.id}"] [data-aar-action="roll-all"]`);
    if (roll) return rollAndApply(message);
    let button = null;
    for (const stop = Date.now() + 8000; Date.now() < stop && !button; ) {
        const found = document.querySelector(`[data-message-id="${message.id}"] [data-aar-action="apply"]`);
        if (found && !found.disabled) button = found;
        else await wait(200);
    }
    assert(button, "the card's Apply button");
    button.click();
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

    // Alchemists+: Olobigonde Fugu's own Effect matches its text and is applied; Spotlight Sunflower (Moderate)'s doesn't (it
    // links the Lesser one's), but its text is a note only, so its Effect is applied anyway (the user's answer of 2026-10-19).
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
        const sunflower = await give(eater, "Spotlight Sunflower (Moderate)", PACK);
        since = Date.now();
        await sunflower.consume();
        card = await messageAfter(since, itemCard("item"), { what: "the sunflower's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        end = Date.now() + 6000;
        let results = [];
        while (Date.now() < end && !(results = game.messages.get(card.id).getFlag(NS, "card").results ?? []).length) await wait(250);
        await until(() => eater.itemTypes.effect.some((entry) => entry.name === "Effect: Spotlight Sunflower (Lesser)"), "the mismatching Effect applied anyway", { timeout: 6000 });
        assert(!results.some((line) => /wasn't applied/.test(line)), `no note instead (${JSON.stringify(results)})`);
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
    },

    // Gate Attenuator's Elemental Spell: its six element spells as the cast card's picks — Snowball (water) picked, the spell module's cast at
    // rank 1 at the creature targeted.
    async gateAttenuator(scene) {
        const { actor: user } = await creature(scene, "Attenuator Wearer", { type: "character", x: 15, y: 26 });
        const { token: foeToken } = await creature(scene, "Attenuator Target", { x: 17, y: 26, alliance: "opposition" });
        const gate = await give(user, "Gate Attenuator");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(gate.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        const state = card.getFlag(NS, "card");
        const names = state.plan.choices?.map((entry) => entry.spell.name) ?? [];
        assert(names.length === 6 && names[4] === "Snowball" && state.plan.dc === 17, `six spells, DC 17 (${names.join(", ")}; ${state.plan.dc})`);
        await game.modules.get(NS).api.live.apply(card.id, { choice: 4, targets: [foeToken.uuid] });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.rank === 1 && (/Snowball/.test(cast.flavor ?? "") || /Snowball/.test(cast.content ?? "") || cast.item?.name === "Snowball"), `Snowball at rank 1 (${flag.rank})`);
        return { cast: cast.id };
    },

    // Night Sky Elixir: a +1 item bonus to saves only against what devils make (PF2e's origin:trait:devil).
    async nightSkyBonus(scene) {
        const { actor: drinker } = await creature(scene, "Night Sky Drinker", { x: 14, y: 8 });
        const elixir = await give(drinker, "Night Sky Elixir (Lesser)");
        const since = Date.now();
        await elixir.consume();
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(800);
        const rule = drinker.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((entry) => entry.key === "FlatModifier" && JSON.stringify(entry.predicate ?? []).includes("origin:trait:devil"));
        assert(rule && rule.value === 1 && rule.type === "item", `the predicated +1 item bonus (${JSON.stringify(rule)})`);
        const bonusIn = async (options) => {
            const at = Date.now();
            await drinker.saves.will.roll({ skipDialog: true, extraRollOptions: options });
            const save = await messageAfter(at, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.speaker?.actor === drinker.id, { what: "the Will save" });
            return (save.flags.pf2e.modifiers ?? []).some((modifier) => modifier.modifier === 1 && modifier.type === "item" && modifier.enabled !== false);
        };
        assert(await bonusIn(["origin:trait:devil", "origin:trait:fiend"]), "the bonus against a devil's effect");
        assert(!(await bonusIn([])), "no bonus against anything else");
        return { rule, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Armorskin Robes of Air's Elemental Sheath: resistance 5 to slashing and piercing (the item card's Effect), -5 feet to
    // all Speeds and +1 AC against physical ranged attacks (the ability module's).
    async armorskinResist(scene) {
        const { actor: monk } = await creature(scene, "Sheathed Monk", { x: 16, y: 8 });
        const robes = await give(monk, "Armorskin Robes of Air");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(robes.uuid, 0);
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(1000);
        const resist = monk.itemTypes.effect.find((effect) => effect.getFlag(NS, "resist"));
        assert(resist, "the resistance Effect");
        assert(resist.system.duration.value === 10 && resist.system.duration.unit === "minutes", `10 minutes (${JSON.stringify(resist.system.duration)})`);
        const resistances = monk.attributes.resistances ?? monk.system.attributes.resistances ?? [];
        for (const type of ["slashing", "piercing"]) assert(resistances.some((entry) => entry.type === type && entry.value === 5), `resistance 5 to ${type} (${JSON.stringify(resistances.map((entry) => [entry.type, entry.value]))})`);
        const rules = monk.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).filter((rule) => rule.key === "FlatModifier");
        // (PF2e keeps a rule's selector as a list.)
        assert(rules.some((rule) => [].concat(rule.selector).includes("all-speeds") && rule.value === -5), "-5 feet to all Speeds");
        assert(rules.some((rule) => [].concat(rule.selector).includes("ac") && rule.value === 1 && JSON.stringify(rule.predicate).includes("item:ranged")), "+1 AC against ranged attacks");
        return { land: monk.system.movement?.speeds?.land?.value ?? null, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Ferrofluid Urchin: resistance 3 to physical damage for the turn (the fortune card's Effect).
    async ferrofluidResist(scene) {
        const { actor: wearer } = await creature(scene, "Urchin Wearer", { x: 14, y: 11 });
        const urchin = await give(wearer, "Ferrofluid Urchin (Lesser)");
        const since = Date.now();
        await urchin.consume();
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        const effect = wearer.itemTypes.effect.find((entry) => entry.getFlag(NS, "rollTwice"));
        assert(effect?.system.rules.some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes("physical") && rule.value === 3), `the Resistance rule (${JSON.stringify(effect?.system.rules)})`);
        const resistances = wearer.attributes.resistances ?? [];
        assert(resistances.some((entry) => entry.type === "physical" && entry.value === 3), `resistance 3 to physical (${JSON.stringify(resistances.map((entry) => [entry.type, entry.value]))})`);
        return { duration: effect.system.duration };
    },

    // Resolute Shield's Stand Firm: twice its Hardness 12 as resistance to the triggering physical damage (the fortune card's Effect, for the turn).
    async resoluteShield(scene) {
        const { actor: wearer } = await creature(scene, "Resolute Wearer", { x: 14, y: 13 });
        const shield = await give(wearer, "Resolute Shield");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        const resistances = wearer.attributes.resistances ?? [];
        assert(resistances.some((entry) => entry.type === "physical" && entry.value === 24), `resistance 24 to physical (${JSON.stringify(resistances.map((entry) => [entry.type, entry.value]))})`);
        return { resistances: resistances.map((entry) => `${entry.type} ${entry.value}`) };
    },

    // Potion of Resistance: the type picked on the card (fire, the fourth) — PF2e's Resistance 5 to fire for an hour.
    async resistTypePick(scene) {
        const { actor: drinker } = await creature(scene, "Resistance Drinker", { x: 16, y: 14 });
        const potion = await give(drinker, "Potion of Resistance (Lesser)");
        const since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("item"));
        assert(/data-air-field="resistType"/.test(card.content), "the type picker");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, resistType: 3 });
        await wait(800);
        const effect = drinker.itemTypes.effect.find((entry) => entry.getFlag(NS, "resist"));
        assert(effect?.system.rules.some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes("fire") && rule.value === 5), `Resistance 5 to fire (${JSON.stringify(effect?.system.rules)})`);
        const resistances = drinker.attributes.resistances ?? [];
        assert(resistances.some((entry) => entry.type === "fire" && entry.value === 5), `PF2e's fire resistance 5 (${JSON.stringify(resistances.map((entry) => [entry.type, entry.value]))})`);
        return { duration: effect.system.duration };
    },

    // The Mountain Man: "2nd-rank or 4th-rank Enlarge upon yourself" — the second choice, cast by the spell module at rank 4 on its user.
    async mountainManRank(scene) {
        const { actor: giant } = await creature(scene, "Mountain Caster", { type: "character", x: 18, y: 8 });
        const card = await give(giant, "The Mountain Man");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(card.uuid, 0);
        const castCard = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        assert(/Enlarge \(rank 4\)/.test(castCard.content), "both ranks offered");
        await game.modules.get(NS).api.live.apply(castCard.id, { choice: 1 });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.rank === 4, `rank 4 (${flag.rank})`);
        return { rank: flag.rank, results: game.messages.get(castCard.id).getFlag(NS, "card").results };
    },

    // Mask of Allure's Shine of Silver: +4 to the triggering Deception, Diplomacy, Intimidation or Performance check — a Deception
    // check spends it.
    async allureSpent(scene) {
        const { actor: charmer } = await creature(scene, "Allure Charmer", { x: 18, y: 11 });
        const mask = await give(charmer, "Mask of Allure");
        const index = (await import(`/modules/${NS}/src/compiler/permanent.js`)).compileActivations(mask).findIndex((entry) => entry.plan?.builtin === "readied-bonus");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(mask.uuid, index);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const effect = () => charmer.itemTypes.effect.find((entry) => entry.getFlag(NS, "rollTwice"));
        assert(effect()?.system.rules.filter((rule) => rule.key === "FlatModifier").length === 4, "four FlatModifiers");
        since = Date.now();
        await charmer.skills.deception.roll({ skipDialog: true });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check", { what: "the Deception check" });
        assert((roll.flags.pf2e.modifiers ?? []).some((modifier) => modifier.modifier === 4 && modifier.type === "status" && modifier.enabled !== false), "+4 on the check");
        const end = Date.now() + 5000;
        while (Date.now() < end && effect()) await wait(250);
        assert(!effect(), "spent by the Deception check");
        return { total: roll.rolls[0]?.total };
    },

    // Four-Ways Dogslicer's Gem Twist: the toggle card's Set has PF2e switch the item's gem-twist toggle to frost.
    async gemTwist(scene) {
        const { actor: wielder } = await creature(scene, "Gem Twister", { type: "character", x: 18, y: 14 });
        const blade = await give(wielder, "Four-Ways Dogslicer");
        // (Wielded: PF2e's rules of a weapon only apply then.)
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const index = (await import(`/modules/${NS}/src/compiler/permanent.js`)).compileActivations(blade).findIndex((entry) => entry.plan?.builtin === "modes");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, index);
        const card = await messageAfter(since, itemCard("toggle"), { what: "the toggle card" });
        await game.modules.get(NS).api.live.apply(card.id, { choice: 1 });
        await wait(800);
        const fresh = wielder.items.get(blade.id);
        const rule = (fresh.system.rules ?? []).find((entry) => entry.key === "RollOption" && entry.option === "gem-twist");
        const on = wielder.getRollOptions?.(["all"]) ?? [];
        assert(rule?.selection === "frost" || on.includes("gem-twist:frost"), `frost selected (${rule?.selection}; ${on.filter((option) => option.startsWith("gem-twist")).join(", ")})`);
        return { selection: rule?.selection ?? null, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Iron Wine: of its two linked Effects, its own (Effect: Iron Wine), the weakness one on the note.
    async ironWine(scene) {
        const { actor: drinker } = await creature(scene, "Wine Drinker", { x: 12, y: 18 });
        const wine = await give(drinker, "Iron Wine");
        const since = Date.now();
        await wine.consume();
        const card = await messageAfter(since, itemCard("item"));
        assert(/Iron Wine Weakness is linked too/.test(card.content), "the other link on the note");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(800);
        const names = drinker.itemTypes.effect.map((effect) => effect.name);
        assert(names.includes("Effect: Iron Wine") && !names.includes("Effect: Iron Wine Weakness"), `its own Effect only (${names.join(", ")})`);
        return { names };
    },

    // Winged: "a fly Speed of 25 feet or your land Speed, whichever is slower" for 5 minutes.
    async wingedFly(scene) {
        const { actor: flier } = await creature(scene, "Winged Flier", { x: 14, y: 18 });
        const armor = await give(flier, "Winged");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, 0);
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        const land = Number(flier.system.movement?.speeds?.land?.value ?? flier.system.attributes?.speed?.value);
        const fly = Number(flier.system.movement?.speeds?.fly?.value ?? flier.system.attributes?.speed?.otherSpeeds?.find((entry) => entry.type === "fly")?.value);
        assert(fly === Math.min(25, land), `fly ${Math.min(25, land)} (${fly})`);
        return { land, fly };
    },

    // Battering Ammunition: its readied ranged Strike's hit (AC 1) pushes the target 5 feet away from the archer.
    async batteringPush(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Battering Archer", { type: "character", x: 2, y: 23 });
        const { token: foeToken } = await creature(scene, "Battering Target", { x: 4, y: 23, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Battering Ammunition");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        const before = { x: foeToken.x, y: foeToken.y };
        const { attack } = await strike(archer, bow);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        const end = Date.now() + 8000;
        while (Date.now() < end && foeToken.x === before.x) await wait(250);
        const moved = (foeToken.x - before.x) / (scene.grid?.size ?? 100);
        assert(moved === 1, `pushed one square away (${moved})`);
        return { outcome, moved };
    },

    // Necklace of Fireballs III: the save card's bead picker — the third bead (6d6) — posts the ability module's save card with it.
    async necklaceBead(scene) {
        const { actor: thrower } = await creature(scene, "Bead Thrower", { type: "character", x: 2, y: 25 });
        const { token: foeToken } = await creature(scene, "Bead Target", { x: 6, y: 25, alliance: "opposition" });
        const necklace = await give(thrower, "Necklace of Fireballs III");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(necklace.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the save card" });
        assert(/data-air-field="damageChoice"/.test(card.content), "the bead picker");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], damageChoice: 2 });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const formula = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage.components[0].formula;
        assert(formula === "6d6[fire]", `the third bead's dice (${formula})`);
        return { formula };
    },

    // Truth Potion: the drinker's own save — the card rolls it for its user, no targets.
    async truthOwnSave(scene) {
        const { actor: drinker, token } = await creature(scene, "Truth Drinker", { x: 8, y: 25 });
        const potion = await give(drinker, "Truth Potion");
        let since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the save card" });
        assert(/own save/.test(card.content), "its user's own save");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const targets = save.flags["pf2e-automatic-ability-resolution"].card.targets ?? [];
        assert(targets.some((entry) => entry.tokenUuid === token.uuid || entry.actorUuid === drinker.uuid), `on its user (${JSON.stringify(targets.map((entry) => entry.name))})`);
        return { save: save.id };
    },

    // Knight Captain's Lance: +1 status to attack and damage rolls for its user and allies in the area — the ability module's
    // automatic card at the creatures targeted, its Apply giving each the bonus.
    async allyArea(scene) {
        const { actor: captain, token: captainToken } = await creature(scene, "Lance Captain", { type: "character", x: 2, y: 28 });
        const { actor: squire, token: squireToken } = await creature(scene, "Lance Squire", { x: 3, y: 28 });
        const lance = await give(captain, "Knight Captain's Lance");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(lance.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the item's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [captainToken.uuid, squireToken.uuid] });
        const automatic = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        let button = null;
        const end = Date.now() + 5000;
        while (Date.now() < end && !button) {
            const found = document.querySelector(`[data-message-id="${automatic.id}"] [data-aar-action="apply"]`);
            if (found && !found.disabled) button = found;
            else await wait(200);
        }
        assert(button, "the ability card's Apply button");
        button.click();
        await wait(1500);
        const bonuses = (actor) => actor.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).filter((rule) => rule.key === "FlatModifier" && rule.type === "status" && Number(rule.value) === 1).map((rule) => [].concat(rule.selector).join(","));
        for (const actor of [captain, squire]) assert(bonuses(actor).includes("attack-roll") && bonuses(actor).includes("damage"), `${actor.name}: +1 status to attack and damage rolls (${JSON.stringify(bonuses(actor))})`);
        return { captain: bonuses(captain), squire: bonuses(squire) };
    },

    // Elemental Ammunition: PF2e's own rules add its splash to the longbow's Strike, and the splash card lists the creature
    // next to the target (the bomb card, for any Strike with PF2e's splash-only rolls). (Squares inside the lab scene: the
    // splash needs the tokens' real places.)
    async ammoSplash(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Splash Archer", { type: "character", x: 10, y: 5 });
        const { token: foeToken } = await creature(scene, "Splash Target", { x: 14, y: 5, ac: 1, alliance: "opposition" });
        const { actor: other } = await creature(scene, "Splash Neighbour", { x: 15, y: 5, alliance: "opposition" });
        const bow = await give(archer, "Longbow");
        const ammo = await give(archer, "Elemental Ammunition (Moderate, Acid)");
        // (More than one, so the Strike's own use of it leaves it for the damage roll.)
        await ammo.update({ "system.quantity": 5 });
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": ammo.id });
        await archerToken.object?.control?.();
        await target(foeToken);
        const before = other.system.attributes.hp.value;
        const { action, attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.damage({ event: shift() });
        const damage = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "damage roll" });
        const splashOnly = (damage.rolls ?? []).filter((roll) => roll?.options?.splashOnly).length;
        const card = await messageAfter(since, itemCard("bomb"), { what: `the splash card (splash-only rolls: ${splashOnly})` });
        const state = card.getFlag(NS, "card");
        assert(state.splashed.some((entry) => entry.actorUuid === other.uuid), "the neighbour is listed for the splash");
        await game.modules.get(NS).api.live.apply(card.id, { included: state.splashed.map((entry, index) => index) });
        await wait(800);
        assert(other.system.attributes.hp.value < before, `the neighbour splashed: ${before} → ${other.system.attributes.hp.value}`);
        return { name: state.item.name, splash: state.splash, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Weapon Shot (Lesser): its activation readies the shortbow's next Strike with it, the bow a +1 striking weapon for it
    // (PF2e's rune upgrade): +1 item to the attack roll, two damage dice.
    async weaponShot(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Shot Archer", { type: "character", x: 10, y: 7 });
        const { token: foeToken } = await creature(scene, "Shot Target", { x: 14, y: 7, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const shot = await give(archer, "Weapon Shot (Lesser)");
        await shot.update({ "system.quantity": 3 });
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": shot.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(shot.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        await archerToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(archer, bow);
        const potency = (attack.flags.pf2e.modifiers ?? []).find((modifier) => modifier.type === "item" && modifier.modifier === 1 && modifier.enabled !== false);
        assert(potency, `+1 item to the attack roll (${(attack.flags.pf2e.modifiers ?? []).map((modifier) => `${modifier.label} ${modifier.modifier}`).join(", ")})`);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        since = Date.now();
        await action.damage({ event: shift() });
        const damage = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "damage roll" });
        const formula = damage.rolls[0]?.formula ?? "";
        assert(/\b2d6\b/.test(formula), `two damage dice (${formula})`);
        return { formula, potency: potency.label };
    },

    // Mycoweave Shield (Lesser): "a successful … save negates the damage" — its save card for the creature targeted, with the
    // spores' persistent poison damage on a failure.
    async negatingSave(scene) {
        const { actor: bearer } = await creature(scene, "Spore Bearer", { type: "character", x: 10, y: 9 });
        const { token: foeToken } = await creature(scene, "Spore Target", { x: 11, y: 9, alliance: "opposition" });
        const shield = await give(bearer, "Mycoweave Shield (Lesser)");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the item's save card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const components = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage?.components ?? [];
        assert(components.some((component) => /persistent,poison/.test(component.formula)), `the persistent poison damage (${JSON.stringify(components)})`);
        return { save: save.id };
    },

    // Torrent Spellgun (Lesser): the card offers its user's firearm attack (a held flintlock pistol), and the ability module's
    // card is that attack against the target's AC.
    async spellgun(scene) {
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Spellgunner", { type: "character", x: 10, y: 11 });
        const { token: foeToken } = await creature(scene, "Spellgun Target", { x: 13, y: 11, alliance: "opposition" });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await give(gunner, "Torrent Spellgun (Lesser)");
        await wait(500);
        let since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const firearm = choices.find((choice) => choice.kind === "firearm");
        assert(firearm, `the firearm attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(firearm) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const check = attack.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.modifier === firearm.modifier && check.against?.statistic === "ac", `the firearm attack against AC (${JSON.stringify(check)})`);
        return { choices, check };
    },

    // Twisting Twine (Lesser): Disarm or Trip at its own +9, picked on the card — Trip picked, the ability module's card is Trip's.
    async twineChoice(scene) {
        const { actor: user } = await creature(scene, "Twine User", { type: "character", x: 10, y: 13 });
        const { token: foeToken } = await creature(scene, "Twine Target", { x: 12, y: 13, alliance: "opposition" });
        const twine = await give(user, "Twisting Twine (Lesser)");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(twine.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the twine's card" });
        const choices = card.getFlag(NS, "card").plan.checkChoices ?? [];
        assert(choices.map((choice) => choice.label).join(",") === "Disarm,Trip", `Disarm or Trip (${choices.map((choice) => choice.label)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], checkChoice: 1 });
        const check = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        const plan = check.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.modifier === 9 && JSON.stringify(plan.resolution.outcomes) === JSON.stringify(choices[1].resolution.outcomes), "Trip's rows at +9");
        return { check: check.id };
    },

    // Potion of Fire Retaliation (Lesser): its card stays open for the minute; each press sends the ability module's no-save
    // card with 1d4 fire damage at the creature that touched the drinker.
    async retaliation(scene) {
        const { actor: drinker } = await creature(scene, "Retaliator", { x: 10, y: 15 });
        const { token: foeToken } = await creature(scene, "Toucher", { x: 11, y: 15, alliance: "opposition" });
        const potion = await give(drinker, "Potion of Fire Retaliation (Lesser)");
        let since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the retaliation card" });
        for (let time = 0; time < 2; time++) {
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            const damage = await messageAfter(since, abilitySaveCard, { what: "the ability module's no-save card" });
            const components = damage.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage?.components ?? [];
            assert(components.some((component) => component.formula === "1d4" && component.type === "fire"), `1d4 fire (${JSON.stringify(components)})`);
        }
        const state = game.messages.get(card.id).getFlag(NS, "card");
        assert(state.status === "open" && state.uses === 2, `still open, used twice (${state.status}, ${state.uses})`);
        return { uses: state.uses };
    },

    // Burial Oil: the card picks the longsword; its Effect's AdjustStrike gives that Strike the Vitalizing rune (PF2e's disrupting).
    async runeOil(scene) {
        const { actor: fighter } = await creature(scene, "Oiled Fighter", { type: "character", x: 10, y: 17 });
        const dagger = await give(fighter, "Dagger");
        const sword = await give(fighter, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const oil = await give(fighter, "Burial Oil");
        const since = Date.now();
        await oil.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the oil's card" });
        const weapons = card.getFlag(NS, "card").weapons ?? [];
        assert(weapons.some((weapon) => weapon.id === sword.id) && weapons.some((weapon) => weapon.id === dagger.id), `its weapons offered (${weapons.map((weapon) => weapon.name)})`);
        await game.modules.get(NS).api.live.apply(card.id, { runeWeapon: weapons.findIndex((weapon) => weapon.id === sword.id) });
        await wait(800);
        const strike = (fighter.system.actions ?? []).find((action) => action.item?.id === sword.id);
        const runes = strike?.item?.system?.runes?.property ?? [];
        assert(runes.includes("disrupting"), `the longsword's Strike has the rune (${JSON.stringify(runes)})`);
        const daggerRunes = (fighter.system.actions ?? []).find((action) => action.item?.id === dagger.id)?.item?.system?.runes?.property ?? [];
        assert(!daggerRunes.includes("disrupting"), "not the dagger's");
        return { runes, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // The Bear: Grapple, Shove or Trip picked on the card — Trip picked, PF2e's Trip with the +2 status bonus.
    async actionChoice(scene) {
        const { actor: user } = await creature(scene, "Bear User", { type: "character", x: 10, y: 19 });
        const { token: foeToken } = await creature(scene, "Bear Target", { x: 11, y: 19, alliance: "opposition" });
        const card = await give(user, "The Bear");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(card.uuid, 0);
        const posted = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foeToken.uuid], choice: 2 });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && (message.flags.pf2e.context.options ?? []).includes("action:trip"), { what: "PF2e's Trip" });
        const bonus = (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.type === "status" && modifier.modifier === 2);
        assert(bonus, `the +2 status bonus (${(roll.flags.pf2e.modifiers ?? []).map((modifier) => `${modifier.label} ${modifier.modifier}`)})`);
        return { roll: roll.id };
    },

    // A condition until the end of the rage (the module's own wording, on an item made here): quickened while raging, gone
    // with the Rage.
    async untilRage(scene) {
        const { actor: barbarian } = await creature(scene, "Raging Wearer", { type: "character", x: 13, y: 19 });
        const [crown] = await barbarian.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Fury Circlet`, type: "equipment", system: { description: { value: "<p><strong>Activate</strong> <span class=\"action-glyph\">1</span> (concentrate)</p><p><strong>Effect</strong> You become quickened until the end of your rage. You can use the extra action only to Stride or Strike.</p>" } } }]);
        const rageSource = (await fromUuid("Compendium.pf2e.feat-effects.Item.z3uyCMBddrPK5umr")).toObject();
        const [rage] = await barbarian.createEmbeddedDocuments("Item", [rageSource]);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(crown.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the circlet's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(1000);
        assert(barbarian.hasCondition("quickened"), "quickened while raging");
        await rage.delete();
        await wait(1000);
        assert(!barbarian.hasCondition("quickened") && !barbarian.itemTypes.effect.some((effect) => effect.getFlag(NS, "untilRage")), "gone with the Rage");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Stone Bullet: its activation readies the sling's next Strike with it; the hit has the spell module cast Petrify (rank 6,
    // DC 34) at the creature hit.
    async castOnHit(scene) {
        const { actor: slinger, token: slingerToken } = await creature(scene, "Stone Slinger", { type: "character", x: 13, y: 17 });
        const { token: foeToken } = await creature(scene, "Stone Target", { x: 16, y: 17, ac: 1, alliance: "opposition" });
        const sling = await give(slinger, "Sling");
        const bullets = await give(slinger, "Stone Bullet");
        // (Sling bullets: give() presets ammunition that names none to arrows.)
        await bullets.update({ "system.quantity": 3, "system.baseItem": "sling-bullets" });
        // (Reload 0 for the test: a reloading weapon takes its ammunition from what's loaded in it, not the selected one — the cast on
        // the hit is what's checked here.)
        await sling.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.selectedAmmoId": bullets.id, "system.reload.value": "0" });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(bullets.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await slingerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(slinger, sling);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        // (PF2e's own spell message for the cast, not this module's summary line.)
        const cast = await messageAfter(since, (message) => message.flags?.pf2e?.origin?.type === "spell" && /Petrify/.test(message.flags?.pf2e?.origin?.uuid ? fromUuidSync(message.flags.pf2e.origin.uuid)?.name ?? message.flavor ?? "" : message.flavor ?? ""), { what: "the spell module's Petrify", timeout: 15000 });
        return { cast: cast.id, origin: cast.flags.pf2e.origin.uuid };
    },

    // Warpipes' Inspirational Salute: "You and all allies within a 60-foot emanation gain …" — its Effect on each creature
    // targeted.
    async alliesEffect(scene) {
        const { actor: piper, token: piperToken } = await creature(scene, "Piper", { type: "character", x: 10, y: 31 });
        const { actor: ally, token: allyToken } = await creature(scene, "Piped Ally", { x: 11, y: 31 });
        const { actor: other } = await creature(scene, "Unpiped", { x: 12, y: 31 });
        const pipes = await give(piper, "Warpipes");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(pipes.uuid, 0);
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { targets: [piperToken.uuid, allyToken.uuid] });
        await wait(1000);
        const has = (actor) => actor.itemTypes.effect.some((entry) => entry.name === "Effect: Inspirational Salute");
        assert(has(piper) && has(ally) && !has(other), `the Effect on the two targeted (${[piper, ally, other].map(has).join(", ")})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Fearless Sash lowers frightened on each creature targeted; Golden-Souled Yang Na lowers the one picked.
    async lowerOthers(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Sash Wearer", { type: "character", x: 14, y: 31 });
        const { actor: ally, token: allyToken } = await creature(scene, "Sash Ally", { x: 15, y: 31 });
        for (const actor of [wearer, ally]) await actor.increaseCondition("frightened", { value: 2 });
        const sash = await give(wearer, "Fearless Sash");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(sash.uuid, 0);
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { targets: [wearerToken.uuid, allyToken.uuid] });
        await wait(800);
        const frightened = (actor) => actor.getCondition("frightened")?.value ?? 0;
        assert(frightened(wearer) === 1 && frightened(ally) === 1, `frightened 2 → 1 on both (${frightened(wearer)}, ${frightened(ally)})`);
        await wearer.decreaseCondition("frightened", { forceRemove: true });
        await wearer.increaseCondition("enfeebled", { value: 2 });
        await wearer.increaseCondition("clumsy", { value: 1 });
        const tattoo = await give(wearer, "Golden-Souled Yang Na");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
        const pick = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(pick.id, { reduceChoice: 1 });
        await wait(800);
        const value = (slug) => wearer.getCondition(slug)?.value ?? 0;
        assert(value("enfeebled") === 1 && value("clumsy") === 1, `enfeebled 2 → 1, clumsy untouched (${value("enfeebled")}, ${value("clumsy")})`);
        return { sash: game.messages.get(card.id).getFlag(NS, "card").results, tattoo: game.messages.get(pick.id).getFlag(NS, "card").results };
    },

    // Shadowmist Cape: "You cast Vapor Form on yourself" — cast by the spell module on its user (self filled from the words).
    async shadowmistSelf(scene) {
        const { actor: wearer, token } = await creature(scene, "Mist Wearer", { type: "character", x: 10, y: 25 });
        const cape = await give(wearer, "Shadowmist Cape");
        const index = (await import(`/modules/${NS}/src/compiler/permanent.js`)).compileActivations(cape, { spells: null }).findIndex((entry) => entry.plan?.builtin === "cast-spell");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(cape.uuid, index);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        assert(card.getFlag(NS, "card").plan.self === true, "on its user");
        await game.modules.get(NS).api.live.apply(card.id, {});
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        return { cast: cast.id, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Umbral Wings: a fly Speed equal to the land Speed until the end of the next turn (PF2e's BaseSpeed on PF2e 8.6's speeds).
    async umbralFly(scene) {
        const { actor: flier } = await creature(scene, "Umbral Flier", { x: 14, y: 14 });
        const wings = await give(flier, "Umbral Wings");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(wings.uuid, 0);
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        const effect = flier.itemTypes.effect.find((entry) => entry.getFlag(NS, "speed") === "fly");
        assert(effect, "the Speed Effect");
        const land = Number(flier.system.movement?.speeds?.land?.value ?? flier.system.attributes?.speed?.value);
        const fly = Number(flier.system.movement?.speeds?.fly?.value ?? flier.system.attributes?.speed?.otherSpeeds?.find((entry) => entry.type === "fly")?.value);
        assert(Number.isFinite(fly) && fly === land, `a fly Speed of ${land} (${fly})`);
        return { land, fly, duration: effect.system.duration };
    },

    // Quenching Potion: PF2e's own recovery check for the drinker's persistent fire damage, at DC 10; the DC back to 15 if it stays.
    async quenchRecovery(scene) {
        const { actor: burning } = await creature(scene, "Burning Drinker", { x: 16, y: 11 });
        const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        persistent.system.persistent = { formula: "1d6", damageType: "fire", dc: 15 };
        const [condition] = await burning.createEmbeddedDocuments("Item", [persistent]);
        const potion = await give(burning, "Quenching Potion");
        const since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("item"));
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const check = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === burning.id, { what: "PF2e's recovery check" });
        const dc = check.flags.pf2e.context.dc?.value;
        assert(dc === 10, `at DC 10 (${dc})`);
        const outcome = check.flags.pf2e.context.outcome;
        const end = Date.now() + 4000;
        while (Date.now() < end && !game.messages.get(card.id).getFlag(NS, "card").results?.length) await wait(200);
        const still = burning.items.get(condition.id);
        if (outcome === "success" || outcome === "criticalSuccess") assert(!still, "ended on a success");
        else assert(still && still.system.persistent.dc === 15, `stays at DC 15 on a failure (${still?.system.persistent.dc})`);
        return { outcome, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // The generic spellgun: put into an inventory, it asks for its spell; Fear at rank 2 picked in its dialog, it becomes Fear
    // Spellgun (Rank 2). Used, its card is the firearm attack against AC; a hit (AC -10) leaves the target frightened 2, or 3 on a
    // critical hit, as Fear's failure and critical failure.
    async genericSpellgun(scene) {
        const { actor: gunner } = await creature(scene, "Generic Gunner", { type: "character", x: 10, y: 15 });
        const { actor: foe, token: foeToken } = await creature(scene, "Generic Target", { x: 13, y: 15, alliance: "opposition", ac: -10 });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await ownItem(gunner, "generic-spellgun.json");
        const dialog = await dialogTitled(`Load ${gun.name}`);
        const input = dialog.element.querySelector("[name=spell]");
        input.value = optionFor(dialog.element, input, "Fear");
        assert(input.value, "Fear is offered");
        input.dispatchEvent(new Event("input"));
        dialog.element.querySelector("[name=rank]").value = "2";
        dialog.element.querySelector('button[data-action="load"]').click();
        await until(() => gun.name === "Fear Spellgun (Rank 2)", "loaded with Fear");
        assert(gun.system.level.value === 3 && gun.system.price.value.gp === 12, `level 3, 12 gp (${gun.system.level.value}, ${JSON.stringify(gun.system.price.value)})`);
        const plan = game.modules.get(NS).api.compileItem(gun);
        assert(plan?.resolution?.outcomes?.success?.effects?.[0]?.slug === "frightened" && plan.resolution.outcomes.success.effects[0].value === 2, "a hit: frightened 2");
        let since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const firearm = choices.find((choice) => choice.kind === "firearm");
        assert(firearm, `the firearm attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(firearm) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        await wait(500);
        document.querySelector(`[data-message-id="${attack.id}"] [data-aar-action="roll"]`)?.click();
        await until(() => game.messages.get(attack.id).flags["pf2e-automatic-ability-resolution"].card.targets.every((entry) => entry.degree), "rolled");
        const degree = game.messages.get(attack.id).flags["pf2e-automatic-ability-resolution"].card.targets[0].degree;
        await wait(500);
        document.querySelector(`[data-message-id="${attack.id}"] [data-aar-action="apply"]`)?.click();
        await until(() => (foe.getCondition("frightened")?.value ?? 0) >= 2, "frightened");
        const frightened = foe.getCondition("frightened").value;
        assert(frightened === (degree === "criticalSuccess" ? 3 : 2), `frightened ${frightened} on a ${degree}`);
        return { degree, frightened, fleeing: foe.hasCondition("fleeing") };
    },

    // An unloaded generic spellgun: its sheet has the button; used with no spell, it's back in the inventory and its user is told.
    async unloadedSpellgun(scene) {
        const { actor: gunner } = await creature(scene, "Unloaded Gunner", { type: "character", x: 10, y: 17 });
        const gun = await ownItem(gunner, "generic-spellgun.json");
        let dialog = await dialogTitled(`Load ${gun.name}`);
        dialog.element.querySelector('button[data-action="later"]').click();
        await wait(500);
        gun.sheet.render(true);
        await until(() => gun.sheet.rendered && (gun.sheet.element?.[0] ?? gun.sheet.element)?.querySelector?.(".air-generic-pick"), "the sheet's button");
        await gun.sheet.close();
        const since = Date.now();
        const id = gun.id;
        await gun.consume();
        const told = await messageAfter(since, (message) => /holds no spell yet, so nothing happened/.test(message.content), { what: "the message" });
        await until(() => gunner.items.get(id), "back in the inventory");
        dialog = await dialogTitled(`Load ${gunner.items.get(id).name}`);
        dialog.element.querySelector('button[data-action="later"]').click();
        return { told: told.id, back: Boolean(gunner.items.get(id)) };
    },

    // The gun staff: put into an inventory, it asks for its firearm and staff; an Arquebus and a Staff of Fire picked, it becomes
    // the Arquebus Staff of Fire, a +1 arquebus with a Reinforced Stock attached (its own Strike, +1 too) and the staff's spells.
    // A striking rune etched on it is etched on the stock too.
    async gunStaff(scene) {
        const { actor: witch } = await creature(scene, "Gunwitch", { type: "character", x: 10, y: 19 });
        const staff = await ownItem(witch, "gun-staff.json");
        const dialog = await dialogTitled(`Merge ${staff.name}`);
        for (const [name, value] of [["firearm", "Arquebus"], ["staff", "Staff of Fire"]]) {
            const input = dialog.element.querySelector(`[name=${name}]`);
            input.value = optionFor(dialog.element, input, value);
            assert(input.value, `${value} is offered`);
        }
        assert(!optionFor(dialog.element, dialog.element.querySelector("[name=firearm]"), "Flintlock Pistol"), "no one-handed firearm offered");
        dialog.element.querySelector('button[data-action="merge"]').click();
        await until(() => staff.name === "Arquebus Staff of Fire", "merged");
        assert(staff.system.runes.potency === 1 && staff.system.baseItem === "arquebus" && staff.system.usage.value === "held-in-two-hands", "a +1 arquebus, in two hands");
        assert(staff.traits.has("staff") && staff.traits.has("magical") && staff.isMagical, "a magical staff");
        assert(/\{Breathe Fire\}/.test(staff.system.description.value.match(/<ul>[\s\S]*?<\/ul>/g)?.at(-1) ?? ""), "the staff's spells as its last list");
        const stock = staff.subitems.find((sub) => sub.type === "weapon");
        assert(stock?.name === "Reinforced Stock" && stock.system.runes.potency === 1, "the Reinforced Stock, +1");
        await staff.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await wait(800);
        const strikes = (witch.system.actions ?? []).map((action) => ({ name: action.item?.name, id: action.item?.id, parent: action.item?.parentItem?.id ?? null, modifier: action.totalModifier }));
        const stockStrike = strikes.find((entry) => entry.parent === staff.id);
        assert(stockStrike, `the stock's own Strike (${JSON.stringify(strikes)})`);
        await staff.update({ "system.runes.striking": 1 });
        await until(() => staff.subitems.find((sub) => sub.type === "weapon")?.system.runes.striking === 1, "the stock etched too");
        return { strikes, level: staff.system.level.value, price: staff.system.price.value, dailies: game.modules.get("pf2e-dailies")?.active ?? false };
    },

    // A save against its owner's own DC (The Avalanche): an NPC's class DC is the card's DC.
    async ownerDC(scene) {
        const { actor: reader } = await creature(scene, "Card Reader", { x: 2, y: 4, level: 9 });
        const { token: foeToken } = await creature(scene, "Card Target", { x: 4, y: 4, alliance: "opposition" });
        const card = await give(reader, "The Avalanche");
        await target(foeToken);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(card.uuid, 0);
        const own = await messageAfter(since, itemCard("expose"), { what: "the card's own card" });
        const dc = own.getFlag(NS, "card").plan.resolution.check.against;
        const expected = reader.system.attributes.classOrSpellDC?.value ?? Math.max(reader.system.attributes.classDC?.value ?? 0, reader.system.attributes.spellDC?.value ?? 0);
        assert(dc?.dc === "fixed" && dc.value === expected && expected > 0, `the owner's DC ${expected} (${JSON.stringify(dc)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(own.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        return { dc: dc.value, save: save.id };
    },

    // An etched rune's activation from its weapon (a Vorpal longsword): the button on the weapon's row, not on a runestone's;
    // pressed, the Fortitude save card at DC 37 with death on a failure.
    async etchedRune(scene) {
        const { actor: knight } = await creature(scene, "Vorpal Knight", { type: "character", x: 2, y: 6 });
        const { token: foeToken } = await creature(scene, "Vorpal Target", { x: 4, y: 6, alliance: "opposition" });
        const sword = await give(knight, "Longsword");
        await sword.update({ "system.runes.potency": 1, "system.runes.property": ["vorpal"] });
        const stone = await give(knight, "Vorpal");
        knight.sheet.render(true);
        await until(() => knight.sheet.rendered && (knight.sheet.element?.[0] ?? knight.sheet.element)?.querySelector?.(`li[data-item-id="${sword.id}"] .air-activate`), "the sword's rune button", { timeout: 10000 });
        const root = knight.sheet.element?.[0] ?? knight.sheet.element;
        const button = root.querySelector(`li[data-item-id="${sword.id}"] .air-activate`);
        assert(button.dataset.airActivate === "rune:vorpal:0", `the rune's activation (${button.dataset.airActivate})`);
        assert(!root.querySelector(`li[data-item-id="${stone.id}"] .air-activate`) && root.querySelector(`li[data-item-id="${stone.id}"] .air-etch`), "the runestone: an Etch button, not the rune's activation");
        await knight.sheet.close();
        await target(foeToken);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(sword.uuid, "rune:vorpal:0");
        const card = await messageAfter(since, itemCard("expose"), { what: "Snicker-Snack's card" });
        const state = card.getFlag(NS, "card");
        assert(state.plan.resolution.check.against.value === 37 && state.plan.resolution.outcomes.failure.terminal?.kind === "death", "Fortitude DC 37, death on a failure");
        assert(/Vorpal: Snicker-Snack/.test(state.item.name), `named for the rune (${state.item.name})`);
        return { item: state.item.name };
    },

    // Etching from a runestone: Striking onto a longsword with no check (the stone used up); Vorpal with a Crafting check a
    // 3rd-level character fails (DC 36): nothing etched, the stone kept.
    async etchRune(scene) {
        const { actor: smith } = await creature(scene, "Rune Smith", { type: "character", x: 2, y: 8 });
        const sword = await give(smith, "Longsword");
        await sword.update({ "system.runes.potency": 1 });
        const striking = await give(smith, "Striking");
        const etch = game.modules.get(NS).api.live.etch;
        assert(await etch(striking, sword, { craft: false }), "etched");
        assert(sword.system.runes.striking === 1 && !smith.items.get(striking.id), "striking on the sword, the stone gone");
        const vorpal = await give(smith, "Vorpal");
        const since = Date.now();
        const done = await etch(vorpal, sword, { craft: true, skipDialog: true });
        const check = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check", { what: "the Crafting check" });
        const degree = check.flags.pf2e.context.outcome;
        assert(done === ["success", "criticalSuccess"].includes(degree), `etched only on a success (${degree}, ${done})`);
        if (!done) assert(smith.items.get(vorpal.id) && !sword.system.runes.property.includes("vorpal"), "nothing etched, the stone kept");
        return { degree, done, runes: sword.system.runes };
    },

    // A weapon's runes on a critical hit (AC -20, so PF2e's roll crits): Thundering's save card and Crushing's card with no roll
    // at the creature hit; Crushing applied, it's clumsy 1 and enfeebled 1.
    async runeCrit(scene) {
        const { actor: knight } = await creature(scene, "Rune Knight", { type: "character", x: 2, y: 10 });
        const { actor: foe, token: foeToken } = await creature(scene, "Rune Target", { x: 3, y: 10, alliance: "opposition", ac: -20 });
        const sword = await give(knight, "Longsword");
        await sword.update({ "system.runes.potency": 2, "system.runes.striking": 1, "system.runes.property": ["thundering", "crushing"], "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await wait(500);
        await target(foeToken);
        let attack = null;
        let since = 0;
        for (let tries = 0; tries < 3 && attack?.flags?.pf2e?.context?.outcome !== "criticalSuccess"; tries++) {
            since = Date.now();
            ({ attack } = await strike(knight, sword));
        }
        assert(attack.flags.pf2e.context.outcome === "criticalSuccess", "a critical hit");
        const cardFor = (rune) => messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.ability?.name?.includes(`(${rune})`), { what: `${rune}'s card` });
        const thundering = await cardFor("Thundering");
        const crushing = await cardFor("Crushing");
        const save = thundering.flags["pf2e-automatic-ability-resolution"].card;
        assert(save.plan.resolution.check.statistic === "fortitude" && save.plan.resolution.check.against.value === 24, `Thundering: Fortitude DC 24 (${JSON.stringify(save.plan.resolution.check)})`);
        await wait(500);
        document.querySelector(`[data-message-id="${crushing.id}"] [data-aar-action="apply"]`)?.click();
        await until(() => foe.hasCondition("clumsy") && foe.hasCondition("enfeebled"), "clumsy and enfeebled");
        return { thundering: thundering.id, clumsy: foe.getCondition("clumsy")?.value, enfeebled: foe.getCondition("enfeebled")?.value };
    },

    // Spellstrike Ammunition (Type II): its Activate's dialog casts an innate Ray of Frost (rank 2) into it; the shortbow's Strike
    // that fires it and hits (AC -20) casts Ray of Frost at the target through the spell module, the hit as its attack's degree.
    async spellstrike(scene) {
        const { actor: archer } = await creature(scene, "Spellstriker", { type: "character", x: 2, y: 12 });
        const { token: foeToken } = await creature(scene, "Spellstrike Target", { x: 5, y: 12, alliance: "opposition", ac: -20 });
        const [entry] = await archer.createEmbeddedDocuments("Item", [{ name: "PFTEST Innate", type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "innate" }, ability: { value: "cha" } } }]);
        const spells = game.packs.get("pf2e.spells-srd");
        const ray = (await spells.getDocument((await spells.getIndex()).find((row) => row.name === "Ray of Frost")._id)).toObject();
        delete ray._id;
        await archer.createEmbeddedDocuments("Item", [{ ...ray, system: { ...ray.system, location: { value: entry.id } } }]);
        const bow = await give(archer, "Shortbow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const ammo = await give(archer, "Spellstrike Ammunition (Type II)");
        // (Its dialog opens here, and the activation waits for it: answered before it's awaited.)
        const activating = game.modules.get(NS).api.live.activate(ammo.uuid, 0);
        const dialog = await dialogTitled(`Cast a spell into ${ammo.name}`);
        const option = [...dialog.element.querySelectorAll("[name=choice] option")].find((entry) => /Ray of Frost \(rank 2\)/.test(entry.textContent));
        assert(option, "Ray of Frost at rank 2 offered");
        dialog.element.querySelector("[name=choice]").value = option.value;
        dialog.element.querySelector('button[data-action="cast"]').click();
        await activating;
        await until(() => archer.flags?.[NS]?.spellstrike?.[ammo.id], "the ammunition holding it");
        assert(/Ray of Frost, rank 2/.test(archer.items.get(ammo.id)?.name ?? ""), `named for it (${archer.items.get(ammo.id)?.name})`);
        await bow.update({ "system.selectedAmmoId": ammo.id });
        await wait(500);
        await target(foeToken);
        let attack = null;
        let since = 0;
        for (let tries = 0; tries < 3 && !["success", "criticalSuccess"].includes(attack?.flags?.pf2e?.context?.outcome); tries++) {
            since = Date.now();
            ({ attack } = await strike(archer, bow));
        }
        const said = await messageAfter(since, (message) => /Ray of Frost is cast at it|by hand/.test(message.content), { what: "the cast", timeout: 12000 });
        assert(/Ray of Frost is cast at it/.test(said.content), `cast (${said.content})`);
        const cast = await messageAfter(since, (message) => message.flags?.["pf2e-automatic-resolution"]?.castFromItem, { what: "the spell module's cast", timeout: 12000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.attackDegree === attack.flags.pf2e.context.outcome && flag.rank === 2, `the hit as its attack (${JSON.stringify(flag)})`);
        return { outcome: attack.flags.pf2e.context.outcome, cast: flag };
    },

    // Soothing Powder: fire picked on the card (bleed too on the creature), PF2e's flat check at DC 10 for the fire only.
    async soothingPowder(scene) {
        const { actor: burning } = await creature(scene, "Soothed", { x: 2, y: 14 });
        const make = (type) => {
            const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
            persistent.system.persistent = { formula: "1d6", damageType: type, dc: 15 };
            return persistent;
        };
        await burning.createEmbeddedDocuments("Item", [make("fire"), make("bleed")]);
        const powder = await give(burning, "Soothing Powder (Lesser)");
        const since = Date.now();
        await powder.consume();
        const card = await messageAfter(since, itemCard("item"));
        const state = card.getFlag(NS, "card");
        const fire = state.plan.item.recovery.types.indexOf("fire");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, recoveryType: fire });
        const check = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === burning.id, { what: "PF2e's recovery check" });
        await wait(1500);
        const checks = game.messages.contents.filter((message) => Number(message.timestamp) >= since && message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === burning.id);
        assert(checks.length === 1 && check.flags.pf2e.context.dc?.value === 10, `one flat check at DC 10 (${checks.length}, ${check.flags.pf2e.context.dc?.value})`);
        const bleed = burning.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system.persistent.damageType === "bleed");
        assert(bleed, "the bleed untouched");
        return { outcome: check.flags.pf2e.context.outcome };
    },

    // Jade Bauble: the two enemies targeted are off-guard until the start of its user's next turn.
    async jadeBauble(scene) {
        const { actor: duelist } = await creature(scene, "Bauble Duelist", { x: 2, y: 16 });
        const { actor: one, token: oneToken } = await creature(scene, "Bauble Foe One", { x: 3, y: 16, alliance: "opposition" });
        const { actor: two, token: twoToken } = await creature(scene, "Bauble Foe Two", { x: 3, y: 17, alliance: "opposition" });
        const bauble = await give(duelist, "Jade Bauble");
        let since = Date.now();
        await bauble.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the bauble's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        const offGuard = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        await wait(500);
        document.querySelector(`[data-message-id="${offGuard.id}"] [data-aar-action="apply"]`)?.click();
        await until(() => one.hasCondition("off-guard") && two.hasCondition("off-guard"), "both off-guard");
        return { one: one.hasCondition("off-guard"), two: two.hasCondition("off-guard") };
    },

    // Energizing Treat: fed to the companion next to its user, the companion is quickened for 1 minute.
    async energizingTreat(scene) {
        const { actor: ranger, token: rangerToken } = await creature(scene, "Treat Ranger", { x: 6, y: 16 });
        const { actor: wolf } = await creature(scene, "Treat Wolf", { x: 7, y: 16 });
        const treat = await give(ranger, "Energizing Treat");
        const since = Date.now();
        await treat.consume();
        const card = await messageAfter(since, itemCard("item"));
        const drinkers = card.getFlag(NS, "card").drinkers;
        const index = drinkers.findIndex((entry) => entry.actorUuid === wolf.uuid);
        assert(index >= 0, `the companion offered (${JSON.stringify(drinkers.map((entry) => entry.name))})`);
        await game.modules.get(NS).api.live.apply(card.id, { drinker: index });
        await until(() => wolf.hasCondition("quickened"), "the wolf quickened");
        return { quickened: true, ranger: rangerToken.id };
    },

    // Grim Trophy: one Demoralize at two foes, PF2e's at the first and the same roll against the second's Will DC (both get frightened
    // on a success).
    async grimTrophy(scene) {
        const { actor: brute } = await creature(scene, "Trophy Brute", { type: "character", x: 10, y: 14 });
        const { actor: one, token: oneToken } = await creature(scene, "Trophy Foe One", { x: 11, y: 14, alliance: "opposition", save: -10 });
        const { actor: two, token: twoToken } = await creature(scene, "Trophy Foe Two", { x: 11, y: 15, alliance: "opposition", save: -10 });
        const trophy = await give(brute, "Grim Trophy");
        const since = Date.now();
        await trophy.consume();
        const card = await messageAfter(since, (message) => message.getFlag(NS, "card")?.kind === "item-action", { what: "the action card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "applied", { timeout: 15000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /against PFTEST ITEM Trophy Foe Two \(DC \d+\)/.test(line)), `the second compared (${JSON.stringify(results)})`);
        return { results, one: one.getCondition("frightened")?.value ?? 0, two: two.getCondition("frightened")?.value ?? 0 };
    },

    // Putrescent Glob: its Fortitude save card at DC 23 for the creature targeted; Taljjae Tassel lends Grievous to the weapon picked;
    // Ensnaring Disk's card is PF2e's Disarm with +2.
    async talismansAfterHit(scene) {
        const { actor: user } = await creature(scene, "Talisman User", { type: "character", x: 14, y: 14 });
        const { token: foeToken } = await creature(scene, "Talisman Foe", { x: 15, y: 14, alliance: "opposition" });
        const sword = await give(user, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const glob = await give(user, "Putrescent Glob");
        let since = Date.now();
        await glob.consume();
        const globCard = await messageAfter(since, itemCard("expose"), { what: "the glob's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(globCard.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 23, `Fortitude DC 23 (${JSON.stringify(check)})`);
        const tassel = await give(user, "Taljjae Tassel");
        since = Date.now();
        await tassel.consume();
        const tasselCard = await messageAfter(since, itemCard("item"), { what: "the tassel's card" });
        await game.modules.get(NS).api.live.apply(tasselCard.id, { runeWeapon: 0 });
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "AdjustStrike" && rule.value === "grievous")), "Grievous on the sword");
        const disk = await give(user, "Ensnaring Disk");
        since = Date.now();
        await disk.consume();
        const diskCard = await messageAfter(since, (message) => message.getFlag(NS, "card")?.kind === "item-action", { what: "the disk's card" });
        const action = diskCard.getFlag(NS, "card").plan.action;
        assert(action.slug === "disarm" && action.bonus?.value === 2, `Disarm +2 (${JSON.stringify(action)})`);
        return { save: check, disarm: action.bonus };
    },

    // Urn of Ashes' Spirit's Wrath: its +15 for a user with no spell attack (the attack card at +15 against AC).
    async urnAttack(scene) {
        const { actor: user } = await creature(scene, "Urn Bearer", { type: "character", x: 14, y: 16 });
        const { token: foeToken } = await creature(scene, "Urn Target", { x: 16, y: 16, alliance: "opposition" });
        const urn = await give(user, "Urn of Ashes");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(urn.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the urn's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        assert(choices.length === 1 && choices[0].modifier === 15, `the urn's +15 (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: 0 });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the attack card" });
        const check = attack.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.modifier === 15 && check.against?.statistic === "ac", `+15 against AC (${JSON.stringify(check)})`);
        return { choices, check };
    },

    // Horn of Exorcism's Rattle the Dead: one Demoralize at every undead targeted, the second compared with the same roll.
    async hornEveryone(scene) {
        const { actor: user } = await creature(scene, "Horn Blower", { type: "character", x: 2, y: 16 });
        const { token: oneToken } = await creature(scene, "Horn Ghoul One", { x: 3, y: 16, alliance: "opposition", save: -10 });
        const { token: twoToken } = await creature(scene, "Horn Ghoul Two", { x: 3, y: 17, alliance: "opposition", save: -10 });
        const horn = await give(user, "Horn of Exorcism");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(horn.uuid, 0);
        const card = await messageAfter(since, itemCard("item-action"), { what: "the horn's card" });
        assert(/Target all creatures with the undead or unholy trait within 30 feet/.test(card.content), "who it's for, on the card");
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "applied", { timeout: 15000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /against PFTEST ITEM Horn Ghoul Two \(DC \d+\)/.test(line)), `the second compared (${JSON.stringify(results)})`);
        return { results };
    },

    // Glacier Hammer's Grow Icicles: the toggle switched on, and off again at the end of the wielder's turn.
    async glacierToggle(scene) {
        const { actor: wielder } = await creature(scene, "Icicle Wielder", { type: "character", x: 6, y: 16 });
        const hammer = await give(wielder, "Glacier Hammer");
        await hammer.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await wait(300);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(hammer.uuid, 0);
        const card = await messageAfter(since, itemCard("toggle"), { what: "the toggle card" });
        assert(/goes off again at the end of/.test(card.content), "when it goes off, on the card");
        await game.modules.get(NS).api.live.apply(card.id, {});
        await until(() => wielder.rollOptions?.all?.["grow-icicles"] === true, "Grow Icicles on");
        assert(wielder.getFlag(NS, `optionUntil.${hammer.id}`)?.until === "turn-end", "kept until the turn's end");
        await (await import(`/modules/${NS}/scripts/toggle.js`)).togglesAtTurnEnd({ actor: wielder });
        await until(() => !wielder.rollOptions?.all?.["grow-icicles"], "Grow Icicles off");
        return { off: !wielder.rollOptions?.all?.["grow-icicles"], flag: wielder.getFlag(NS, `optionUntil.${hammer.id}`) ?? null };
    },

    // The Trumpet for a 15th-level owner: its damage step for that level (18d6), not the 14d6 written first.
    async trumpetLevel(scene) {
        const { actor: owner } = await creature(scene, "Trumpet Owner", { type: "character", x: 10, y: 16, level: 15 });
        // (A spellcasting entry, for the spell DC its save is against: a class would stop for its feature choices.)
        await owner.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Arcane Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "innate" }, ability: { value: "cha" }, proficiency: { value: 1 } } }]);
        const trumpet = await give(owner, "The Trumpet");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(trumpet.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the trumpet's card" });
        const formula = card.getFlag(NS, "card").plan.resolution.sharedDamage?.components?.[0]?.formula;
        assert(formula === "18d6[sonic]", `18d6 sonic at 15th level (${formula})`);
        return { formula, level: owner.level };
    },

    // Wolf Fang: its damage of its user's Strength modifier at the creature targeted (the user's own number, live).
    async wolfFang(scene) {
        const { actor: user } = await creature(scene, "Fang User", { type: "character", x: 2, y: 18 });
        const { token: foeToken } = await creature(scene, "Fang Foe", { x: 3, y: 18, alliance: "opposition" });
        const str = Number(user.abilities?.str?.mod);
        const fang = await give(user, "Wolf Fang");
        let since = Date.now();
        await fang.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the fang's card" });
        const formula = card.getFlag(NS, "card").plan.resolution.sharedDamage?.components?.[0]?.formula;
        assert(formula === `${str}[bludgeoning]`, `its Strength modifier ${str} (${formula})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await messageAfter(since, abilitySaveCard, { what: "the damage card" });
        return { formula };
    },

    // Bracers of Strength's Bear Hug: PF2e's Grapple, then on a success its crush, the ability module's damage card.
    async bearHug(scene) {
        const { actor: user } = await creature(scene, "Hugger", { type: "character", x: 6, y: 18 });
        const { token: foeToken } = await creature(scene, "Hugged", { x: 7, y: 18, alliance: "opposition", save: -20, ac: 0 });
        const bracers = await give(user, "Bracers of Strength");
        await bracers.update({ "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(bracers.uuid, 0);
        const card = await messageAfter(since, itemCard("item-action"), { what: "the bear hug's card" });
        const damage = card.getFlag(NS, "card").plan.action.damage;
        assert(damage?.success && damage?.criticalSuccess, `damage for a success and a critical one (${JSON.stringify(Object.keys(damage ?? {}))})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "applied", { timeout: 15000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        const crushed = results.some((line) => /damage for a (?:critical )?success: its card/.test(line));
        assert(crushed || results.some((line) => /: a (?:critical )?failure\./.test(line)), `the crush card on a success (${JSON.stringify(results)})`);
        return { results, crushed };
    },

    // Cayden's Tankard: its conditions ended on its user, no other creature targeted.
    async caydensTankard(scene) {
        const { actor: user } = await creature(scene, "Tankard Drinker", { type: "character", x: 10, y: 18 });
        await user.increaseCondition("grabbed");
        await user.increaseCondition("slowed");
        const tankard = await give(user, "Cayden's Tankard");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(tankard.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the tankard's card" });
        await target();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await until(() => !user.hasCondition("grabbed") && !user.hasCondition("slowed"), "grabbed and slowed ended");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Vambrace of Gorum's Blood of Iron: the area card's temporary Hit Points for each creature targeted, and their frightened lowered.
    async bloodOfIron(scene) {
        const { actor: bearer, token: bearerToken } = await creature(scene, "Iron Bearer", { type: "character", x: 14, y: 18 });
        const { actor: ally, token: allyToken } = await creature(scene, "Iron Ally", { x: 15, y: 18 });
        await ally.increaseCondition("frightened");
        await ally.increaseCondition("frightened");
        const vambrace = await give(bearer, "Vambrace of Gorum");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(vambrace.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the vambrace's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [bearerToken.uuid, allyToken.uuid] });
        await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        await until(() => (ally.getCondition("frightened")?.value ?? 0) === 1, "frightened 2 → 1");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Roc-Shaft Arrow (ammunition only in its words): its user's next ranged Strike carries its save — on a hit, the ability module's
    // Fortitude save card at DC 19.
    async rocShaftArrow(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Roc Archer", { type: "character", x: 2, y: 19 });
        const { token: foeToken } = await creature(scene, "Roc Target", { x: 4, y: 19, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Arrows");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        // (A natural 1 misses even AC 1: a few arrows.)
        let since = 0;
        let attack = null;
        for (let tries = 0; tries < 3 && !["success", "criticalSuccess"].includes(attack?.flags?.pf2e?.context?.outcome); tries++) {
            const arrow = await give(archer, "Roc-Shaft Arrow (Lesser)");
            since = Date.now();
            await arrow.consume();
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            await archerToken.object?.control?.();
            await target(foeToken);
            since = Date.now();
            ({ attack } = await strike(archer, bow));
        }
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 19, `Fortitude DC 19 (${JSON.stringify(check)})`);
        return { check };
    },

    // Atrophy Bomb (Lesser): its damage sentence's rider — Enfeebled 1 on the creature hit.
    async atrophyBomb(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Atrophy Bomber", { type: "character", x: 6, y: 19 });
        const { actor: foe, token: foeToken } = await creature(scene, "Atrophy Target", { x: 8, y: 19, ac: 1, alliance: "opposition" });
        const bomb = await give(thrower, "Atrophy Bomb (Lesser)");
        await bomb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(thrower, bomb);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.damage({ event: shift() });
        const card = await messageAfter(since, itemCard("bomb"));
        await game.modules.get(NS).api.live.apply(card.id, { included: [] });
        await until(() => (foe.getCondition("enfeebled")?.value ?? 0) === 1, "enfeebled 1 on the target");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Moonlit Spellgun (Lesser): its damage treated as silver — the attack card's damage formula carries the material.
    async moonlitSilver(scene) {
        const { actor: gunner } = await creature(scene, "Moonlit Gunner", { type: "character", x: 10, y: 19 });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await give(gunner, "Moonlit Spellgun (Lesser)");
        const since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        const choices = card.getFlag(NS, "card").plan.damageChoices.map((choice) => choice.formula);
        assert(choices.every((formula) => /\[fire,silver\]$/.test(formula)), `silver in its damage (${JSON.stringify(choices)})`);
        return { choices };
    },

    // Moonlit Spellgun on a creature weak to silver: the ability module's attack card applies PF2e's damage with the material, so
    // the weakness counts (silver 50: more than the most 3d8 can deal, doubled).
    async moonlitWeakness(scene) {
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Silver Gunner", { type: "character", x: 14, y: 19 });
        const { actor: foe, token: foeToken } = await creature(scene, "Silver-Weak Target", { x: 16, y: 19, ac: 1, hp: 300, alliance: "opposition" });
        await foe.update({ "system.attributes.weaknesses": [{ type: "silver", value: 50 }] });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await give(gunner, "Moonlit Spellgun (Lesser)");
        await wait(500);
        let since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const before = foe.system.attributes.hp.value;
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: 0, damageChoice: 0 });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        // (Its attack first — "Roll the rest" — then Apply.)
        let roll = null;
        for (const stop = Date.now() + 5000; Date.now() < stop && !roll; ) {
            roll = document.querySelector(`[data-message-id="${attack.id}"] [data-aar-action="roll-all"]`);
            if (!roll) await wait(200);
        }
        assert(roll, "the attack card's roll button");
        roll.click();
        let button = null;
        const end = Date.now() + 8000;
        while (Date.now() < end && !button) {
            const found = document.querySelector(`[data-message-id="${attack.id}"] [data-aar-action="apply"]`);
            if (found && !found.disabled) button = found;
            else await wait(200);
        }
        assert(button, "the attack card's Apply button");
        button.click();
        await until(() => foe.system.attributes.hp.value < before, "damage applied", { timeout: 10000 });
        const lost = before - foe.system.attributes.hp.value;
        assert(lost > 48, `silver weakness 50 applied (lost ${lost})`);
        return { lost, choices: choices.map((choice) => choice.label) };
    },

    // Ghost Charge's enfeebled only on undead or void healing: a living target gets none, an undead one gets it.
    async ghostChargeGate(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Ghost Bomber", { type: "character", x: 2, y: 8 });
        const { actor: living, token: livingToken } = await creature(scene, "Ghost Living Target", { x: 4, y: 8, ac: 1, alliance: "opposition" });
        const { actor: undead, token: undeadToken } = await creature(scene, "Ghost Undead Target", { x: 4, y: 10, ac: 1, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"], "system.attributes.hp.negativeHealing": true });
        const results = [];
        for (const [foe, foeToken] of [[living, livingToken], [undead, undeadToken]]) {
            // (A natural 1 misses even AC 1: a few throws.)
            let action = null;
            let attack = null;
            for (let tries = 0; tries < 3 && !["success", "criticalSuccess"].includes(attack?.flags?.pf2e?.context?.outcome); tries++) {
                const bomb = await give(thrower, "Ghost Charge (Lesser)");
                await bomb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
                await throwerToken.object?.control?.();
                await target(foeToken);
                ({ action, attack } = await strike(thrower, bomb));
            }
            assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
            const since = Date.now();
            await action.damage({ event: shift() });
            const card = await messageAfter(since, itemCard("bomb"));
            await game.modules.get(NS).api.live.apply(card.id, { included: [] });
            await wait(1200);
            results.push(...game.messages.get(card.id).getFlag(NS, "card").results);
        }
        assert(!living.hasCondition("enfeebled"), "no enfeebled on the living target");
        await until(() => undead.hasCondition("enfeebled"), "enfeebled on the undead target");
        return { results };
    },

    // Swallow-Spike etched on +1 armor: its second activation (the 1-action one) is the first's attack, at the armor's bonus (+15).
    async swallowSpike(scene) {
        const { actor: wearer } = await creature(scene, "Spike Wearer", { type: "character", x: 6, y: 8 });
        await creature(scene, "Spike Grabber", { x: 7, y: 8, alliance: "opposition" });
        const armor = await give(wearer, "Chain Mail");
        await armor.update({ "system.runes.potency": 1, "system.runes.property": ["swallowSpike"], "system.equipped.inSlot": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, "rune:swallowSpike:1");
        const card = await messageAfter(since, itemCard("expose"), { what: "the spikes' card" });
        const check = card.getFlag(NS, "card").plan.resolution.check;
        assert(check.modifier === 15 && check.against.statistic === "ac", `+15 against AC (${JSON.stringify(check)})`);
        return { check };
    },

    // Stony Hag Eye: on a critical failure, a creature that's already slowed is Petrified (the core's escalate).
    async stonyHagEye(scene) {
        const { actor: holder } = await creature(scene, "Hag Eye Holder", { type: "character", x: 10, y: 8 });
        const { actor: foe, token: foeToken } = await creature(scene, "Hag Eye Target", { x: 11, y: 8, alliance: "opposition", save: -30 });
        await foe.increaseCondition("slowed");
        const eye = await give(holder, "Stony Hag Eye");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(eye.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the eye's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the save card" }));
        await until(() => foe.hasCondition("petrified"), "petrified (it was already slowed)", { timeout: 10000 });
        return { conditions: foe.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Lion's Armor's Roar of the Pride: Demoralize at each enemy, Fleeing for 1 round added to the critical success.
    async lionsArmor(scene) {
        const { actor: wearer } = await creature(scene, "Lion Wearer", { type: "character", x: 10, y: 10 });
        const { actor: one, token: oneToken } = await creature(scene, "Lion Foe One", { x: 11, y: 10, alliance: "opposition", save: -30 });
        const { actor: two, token: twoToken } = await creature(scene, "Lion Foe Two", { x: 11, y: 11, alliance: "opposition", save: -30 });
        const armor = await give(wearer, "Lion's Armor");
        await armor.update({ "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, 0);
        const card = await messageAfter(since, itemCard("item-action"), { what: "the armor's card" });
        assert(/Target each enemy within 30 feet/.test(card.content), "who it's for, on the card");
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "applied", { timeout: 15000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        await until(() => one.hasCondition("fleeing") && two.hasCondition("fleeing"), `fleeing on both (${JSON.stringify(results)})`);
        return { results, frightened: [one, two].map((foe) => foe.getCondition("frightened")?.value ?? 0) };
    },

    // Lover's Knot with Battle Medicine: its owner's feat read, 2d6+7 healing.
    async loversKnot(scene) {
        const { actor: medic } = await creature(scene, "Knot Medic", { type: "character", x: 12, y: 10 });
        await give(medic, "Battle Medicine", "pf2e.feats-srd");
        await medic.update({ "system.attributes.hp.value": 1 });
        const knot = await give(medic, "Lover's Knot");
        const since = Date.now();
        await knot.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the knot's card" });
        const formula = card.getFlag(NS, "card").plan.resolution.outcomes.success.effects[0]?.formula;
        assert(formula === "2d6+7", `2d6+7 with Battle Medicine (${formula})`);
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        // (A lab character has no class, so no Hit Points to regain: the roll is what's checked.)
        await until(() => (game.messages.get(card.id).getFlag(NS, "card").results ?? []).some((line) => /^Rolled 2d6 \+ 7 = \d+/.test(line)), "2d6 + 7 rolled");
        return { formula, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Explosive Missive: the damage type its writer picks, on the save card.
    async explosiveMissive(scene) {
        const { actor: writer } = await creature(scene, "Missive Writer", { type: "character", x: 14, y: 10 });
        const { token: foeToken } = await creature(scene, "Missive Target", { x: 15, y: 10, alliance: "opposition" });
        const missive = await give(writer, "Explosive Missive");
        let since = Date.now();
        await missive.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the missive's card" });
        assert(/data-air-field="damageChoice"/.test(card.content), "the type picker");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], damageChoice: 3 });
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card" });
        const formula = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage.components[0].formula;
        assert(/\[fire\]/.test(formula), `fire picked (${formula})`);
        return { formula };
    },

    // Safeguarding's Adaptive Aegis: resistance 5 to the type its trigger names, picked on the card.
    async safeguardingPick(scene) {
        const { actor: wearer } = await creature(scene, "Aegis Wearer", { type: "character", x: 16, y: 10 });
        const armor = await give(wearer, "Chain Mail");
        await armor.update({ "system.runes.potency": 1, "system.runes.property": ["safeguarding"], "system.equipped.inSlot": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, "rune:safeguarding:0");
        const card = await messageAfter(since, itemCard("item"), { what: "the aegis card" });
        assert(/data-air-field="resistType"/.test(card.content), "the type picker");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, resistType: 2 });
        await until(() => (wearer.attributes.resistances ?? []).some((entry) => entry.type === "spirit" && entry.value === 5), "spirit resistance 5");
        return { resistances: (wearer.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]) };
    },

    // Blindpepper Bomb (thrown to explode, no Strike): a critical failure's Blinded, Sickened 1 and Dazzled.
    async blindpepperBomb(scene) {
        const { actor: thrower } = await creature(scene, "Pepper Thrower", { type: "character", x: 18, y: 10 });
        const { actor: foe, token: foeToken } = await creature(scene, "Pepper Target", { x: 19, y: 10, alliance: "opposition", save: -30 });
        const bomb = await give(thrower, "Blindpepper Bomb");
        let since = Date.now();
        await bomb.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the bomb's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the save card" }));
        // (PF2e's blinded overrides dazzled, which is there but inactive: the conditions held, not the active ones.)
        const held = (slug) => foe.itemTypes.condition.some((condition) => condition.slug === slug);
        await until(() => held("blinded") && held("sickened") && held("dazzled"), "blinded, sickened and dazzled", { timeout: 10000 });
        return { conditions: foe.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Zealous Banner: the ally targeted Quickened for 1 round.
    async zealousBanner(scene) {
        const { actor: bearer } = await creature(scene, "Banner Bearer", { type: "character", x: 2, y: 12 });
        const { actor: ally, token: allyToken } = await creature(scene, "Banner Ally", { x: 3, y: 12 });
        const banner = await give(bearer, "Zealous Banner");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(banner.uuid, 0);
        const card = await messageAfter(since, (message) => Boolean(message.getFlag(NS, "card")), { what: "the banner's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const ability = await messageAfter(since, abilitySaveCard, { what: "the ability module's card", timeout: 6000 }).catch(() => null);
        if (ability) await applyAbilityCard(ability);
        await until(() => ally.itemTypes.condition.some((condition) => condition.slug === "quickened") || ally.itemTypes.effect.some((effect) => /quickened/i.test(JSON.stringify(effect.system.rules ?? []))), "quickened on the ally", { timeout: 10000 });
        return { kind: card.getFlag(NS, "card").kind };
    },

    // Heedless Spurs: the mount targeted takes 2d6 persistent bleed and is Quickened.
    async heedlessSpurs(scene) {
        const { actor: rider } = await creature(scene, "Spur Rider", { type: "character", x: 5, y: 12 });
        const { actor: mount, token: mountToken } = await creature(scene, "Spur Mount", { x: 6, y: 12, hp: 80 });
        const spurs = await give(rider, "Heedless Spurs");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(spurs.uuid, 0);
        const card = await messageAfter(since, (message) => Boolean(message.getFlag(NS, "card")), { what: "the spurs' card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [mountToken.uuid] });
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the ability module's card" }));
        const held = (slug) => mount.itemTypes.condition.some((condition) => condition.slug === slug);
        await until(() => held("persistent-damage") && (held("quickened") || mount.itemTypes.effect.some((effect) => /quickened/i.test(JSON.stringify(effect.system.rules ?? [])))), "bleed and quickened on the mount", { timeout: 10000 });
        return { conditions: mount.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Nap Gas Dispenser: a critical failure is slowed now; prone and unconscious only at the end of its next turn (a note), not at once.
    async napGasLater(scene) {
        const { actor: user } = await creature(scene, "Gas User", { type: "character", x: 8, y: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Gas Target", { x: 10, y: 12, alliance: "opposition", save: -30 });
        const gas = await give(user, "Nap Gas Dispenser");
        let since = Date.now();
        await gas.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the gas card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the save card" }));
        await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "slowed"), "slowed", { timeout: 10000 });
        await wait(800);
        const slugs = foe.itemTypes.condition.map((condition) => condition.slug);
        assert(!slugs.includes("prone") && !slugs.includes("unconscious"), `not prone or unconscious yet (${JSON.stringify(slugs)})`);
        return { conditions: slugs, notes: foe.itemTypes.effect.map((effect) => effect.name) };
    },

    // Sparkshade Parasol: fire resistance 20 for the effect that triggered it (the fortune card's Effect).
    async sparkshadeParasol(scene) {
        const { actor: holder } = await creature(scene, "Parasol Holder", { type: "character", x: 12, y: 12 });
        const parasol = await give(holder, "Sparkshade Parasol");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(parasol.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the parasol's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => (holder.attributes.resistances ?? []).some((entry) => entry.type === "fire" && entry.value === 20), "fire resistance 20");
        return { resistances: (holder.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]) };
    },

    // Timpani of Panic: a critical failure's Frightened 1 and its floor (can't go below 1 for 1 minute), the ability module's floor Effect.
    async timpaniFloor(scene) {
        const { actor: drummer } = await creature(scene, "Timpani Drummer", { type: "character", x: 14, y: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Timpani Target", { x: 15, y: 12, alliance: "opposition", save: -30 });
        const drum = await give(drummer, "Timpani of Panic");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(drum.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the drum's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the save card" }));
        await until(() => foe.itemTypes.effect.some((effect) => /floor/i.test(effect.name)), "the floor Effect", { timeout: 10000 });
        const floor = foe.itemTypes.effect.find((effect) => /floor/i.test(effect.name));
        await until(() => foe.hasCondition("frightened"), "frightened");
        return { floor: floor.name, duration: floor.system.duration, frightened: foe.getCondition("frightened")?.value ?? 0 };
    },

    // Tallow Bomb (Lesser): a critical hit's Sickened 1 can't go below 1 while the persistent fire lasts; the floor goes with the fire.
    async tallowFloor(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Tallow Bomber", { type: "character", x: 16, y: 16 });
        const { actor: foe, token: foeToken } = await creature(scene, "Tallow Target", { x: 18, y: 16, ac: -20, hp: 200, alliance: "opposition" });
        let action = null;
        let attack = null;
        for (let tries = 0; tries < 3 && attack?.flags?.pf2e?.context?.outcome !== "criticalSuccess"; tries++) {
            const bomb = await give(thrower, "Tallow Bomb (Lesser)");
            await bomb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
            await throwerToken.object?.control?.();
            await target(foeToken);
            ({ action, attack } = await strike(thrower, bomb));
        }
        assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC -20): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.critical({ event: shift() });
        const card = await messageAfter(since, itemCard("bomb"));
        // (PF2e's own damage, its persistent fire with it, as the GM applies it from the damage roll.)
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken });
        await game.modules.get(NS).api.live.apply(card.id, { included: [] });
        const floorEffect = () => foe.itemTypes.effect.find((effect) => /floor/i.test(effect.name));
        await until(() => foe.hasCondition("sickened") && floorEffect(), "sickened with its floor", { timeout: 10000 });
        const fire = foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage");
        assert(fire, "the persistent fire damage");
        await fire.delete();
        await until(() => !floorEffect(), "the floor gone with the fire", { timeout: 10000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Windlass Bola: a Trip at each creature targeted, PF2e's action rolled for each; both knocked prone.
    async bolaTrips(scene) {
        const { actor: thrower } = await creature(scene, "Bola Thrower", { type: "character", x: 2, y: 4 });
        const { actor: one, token: oneToken } = await creature(scene, "Bola Target One", { x: 5, y: 4, alliance: "opposition", save: -30 });
        const { actor: two, token: twoToken } = await creature(scene, "Bola Target Two", { x: 5, y: 5, alliance: "opposition", save: -30 });
        const bola = await give(thrower, "Windlass Bola");
        await bola.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bola.uuid, 0);
        const card = await messageAfter(since, itemCard("item-action"), { what: "the bola's card" });
        assert(/a roll for each one/.test(card.content), "a roll for each, on the card");
        const rolls = game.messages.contents.length;
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "applied", { timeout: 15000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /Trip against PFTEST ITEM Bola Target Two: a (?:critical )?success/.test(line)), `the second's own roll (${JSON.stringify(results)})`);
        await until(() => one.hasCondition("prone") && two.hasCondition("prone"), "both prone", { timeout: 8000 });
        return { results, messages: game.messages.contents.length - rolls };
    },

    // Arctic Worm Chitin Shield's Misty Chill: an aura on its user (the ability module's zone, attached to the token); a creature that
    // ends its turn next to them gets the cold damage's save card.
    async arcticAura(scene) {
        const { actor: holder, token: holderToken } = await creature(scene, "Chill Holder", { type: "character", x: 4, y: 14 });
        const { actor: foe, token: foeToken } = await creature(scene, "Chill Neighbour", { x: 5, y: 14, alliance: "opposition", hp: 150, save: -30 });
        const shield = await give(holder, "Arctic Worm Chitin Shield");
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: holderToken.id, sceneId: scene.id, actorId: holder.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(shield.uuid, 0);
            await until(() => scene.regions.some((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone), "the aura's Region", { timeout: 8000 });
            const region = scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone);
            const attached = region.attachment?.token?.id ?? region.attachment?.token ?? null;
            assert(attached === holderToken.id, `attached to the holder's token (${attached})`);
            await combat.nextTurn();
            await wait(500);
            since = Date.now();
            await combat.nextTurn();
            const save = await messageAfter(since, abilitySaveCard, { what: "the zone's save card", timeout: 10000 });
            const before = foe.system.attributes.hp.value;
            await rollAndApply(save);
            await until(() => foe.system.attributes.hp.value < before, "cold damage on the neighbour", { timeout: 10000 });
            return { lost: before - foe.system.attributes.hp.value };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Alluring Lantern's Raise Lure: a creature that begins its turn within 20 feet saves or is Fascinated until the end of its own turn.
    async lanternAura(scene) {
        const { actor: holder, token: holderToken } = await creature(scene, "Lure Holder", { type: "character", x: 8, y: 14 });
        const { actor: foe, token: foeToken } = await creature(scene, "Lured Foe", { x: 11, y: 14, alliance: "opposition", save: -30 });
        const lantern = await give(holder, "Alluring Lantern");
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: holderToken.id, sceneId: scene.id, actorId: holder.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            await game.modules.get(NS).api.live.activate(lantern.uuid, 0);
            await until(() => scene.regions.some((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone), "the lure's Region", { timeout: 8000 });
            const since = Date.now();
            await combat.nextTurn();
            const save = await messageAfter(since, abilitySaveCard, { what: "the zone's save card", timeout: 10000 });
            await rollAndApply(save);
            const fascinated = () => foe.itemTypes.condition.some((condition) => condition.slug === "fascinated");
            await until(fascinated, "fascinated", { timeout: 10000 });
            await combat.nextTurn();
            await until(() => !fascinated(), "fascination gone at the end of its turn", { timeout: 10000 });
            return { round: combat.round };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Sniper's Bead: the readied ranged Strike carries PF2e's "ignore-range-penalty:2" — a javelin thrown into its second range
    // increment (45 feet) has no range penalty; the same throw before the bead has one.
    async sniperBead(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Bead Thrower", { type: "character", x: 0, y: 9 });
        const { token: foeToken } = await creature(scene, "Bead Target", { x: 9, y: 9, ac: 1, alliance: "opposition" });
        const javelin = await give(thrower, "Javelin");
        await javelin.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(foeToken);
        const penalty = (attack) => (attack.flags.pf2e.modifiers ?? []).find((modifier) => modifier.slug === "range-penalty" && modifier.enabled !== false && !modifier.ignored) ?? null;
        const before = await strike(thrower, javelin);
        assert(penalty(before.attack), `a range penalty without the bead (${JSON.stringify((before.attack.flags.pf2e.modifiers ?? []).map((modifier) => modifier.slug))})`);
        const bead = await give(thrower, "Sniper's Bead");
        const since = Date.now();
        await bead.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const readied = thrower.itemTypes.effect.find((effect) => effect.getFlag(NS, "strikeRider"));
        assert(readied?.system.rules.some((rule) => rule.key === "RollOption" && rule.option === "ignore-range-penalty:2"), "the readied Strike's roll option");
        const after = await strike(thrower, javelin);
        assert(!penalty(after.attack), `no range penalty with the bead (${JSON.stringify(penalty(after.attack))})`);
        return { before: penalty(before.attack)?.modifier, after: null };
    },

    // Alchemist's Damper: an arquebus's kickback penalty (its user's Strength under +2) suppressed for the readied Strike.
    async damperKickback(scene) {
        const { actor: shooter, token: shooterToken } = await creature(scene, "Damper Shooter", { type: "character", x: 0, y: 7 });
        const { token: foeToken } = await creature(scene, "Damper Target", { x: 1, y: 7, ac: 1, alliance: "opposition" });
        const gun = await give(shooter, "Arquebus");
        const rounds = await give(shooter, "Rounds (Arquebus)");
        await rounds.update({ "system.quantity": 5, "system.baseItem": "rounds-arquebus" });
        await gun.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": rounds.id, "system.reload.value": "0" });
        await shooterToken.object?.control?.();
        await target(foeToken);
        const kickback = (attack) => (attack.flags.pf2e.modifiers ?? []).find((modifier) => modifier.slug === "kickback" && modifier.enabled !== false && !modifier.ignored) ?? null;
        const before = await strike(shooter, gun);
        assert(kickback(before.attack), `kickback's penalty without the damper (${JSON.stringify((before.attack.flags.pf2e.modifiers ?? []).map((modifier) => modifier.slug))})`);
        const damper = await give(shooter, "Alchemist's Damper");
        const since = Date.now();
        await damper.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const after = await strike(shooter, gun);
        assert(!kickback(after.attack), `no kickback penalty with the damper (${JSON.stringify(kickback(after.attack))})`);
        return { before: kickback(before.attack)?.modifier };
    },

    // Jistkan War Crossbow's Bolt of War: its own Strike with PF2e's "ignore-range-penalty:3" and 10 piercing splash damage.
    async jistkanSplash(scene) {
        const { actor: shooter, token: shooterToken } = await creature(scene, "Jistkan Shooter", { type: "character", x: 3, y: 7 });
        const { token: foeToken } = await creature(scene, "Jistkan Target", { x: 4, y: 7, ac: 1, alliance: "opposition" });
        const crossbow = await give(shooter, "Jistkan War Crossbow");
        const bolts = await give(shooter, "Bolts");
        await bolts.update({ "system.quantity": 5, "system.baseItem": "bolts" });
        await crossbow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": bolts.id, "system.reload.value": "0" });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(crossbow.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await shooterToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(shooter, crossbow);
        const options = attack.flags.pf2e.context.options ?? [];
        assert(options.includes("ignore-range-penalty:3"), "the attack roll's ignore-range-penalty:3");
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        // (The splash a term of PF2e's roll, "splash" its category; not doubled on a critical hit.)
        assert(/\b10\b/.test(formula) && /splash/.test(JSON.stringify(rolled.rolls)), `PF2e's damage roll carries 10 piercing splash (${formula})`);
        return { formula };
    },

    // Magnifying Scope (Major)'s Zoom In: an Effect with PF2e's AdjustStrike, +20 feet to its user's ranged weapons' range increment.
    async scopeRange(scene) {
        const { actor: shooter } = await creature(scene, "Scope Shooter", { type: "character", x: 6, y: 7 });
        const bow = await give(shooter, "Shortbow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const scope = await give(shooter, "Magnifying Scope (Major)");
        const increment = () => shooter.items.get(bow.id)?.range?.increment ?? null;
        const before = increment();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(scope.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the scope's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => increment() === before + 20, `the range increment ${before} → ${before + 20} (now ${increment()})`, { timeout: 8000 });
        const effect = shooter.itemTypes.effect.find((entry) => entry.system.rules.some((rule) => rule.key === "AdjustStrike"));
        assert(effect?.system.duration.unit === "rounds" && effect.system.duration.value === 1 && effect.system.duration.expiry === "turn-start", `until the start of the next turn (${JSON.stringify(effect?.system.duration)})`);
        return { before, after: increment() };
    },

    // Dragonbone Arrowhead: until the end of the turn, its user's melee weapon gains thrown 20 feet (PF2e's AdjustStrike).
    async arrowheadThrown(scene) {
        const { actor: fighter } = await creature(scene, "Arrowhead Fighter", { type: "character", x: 9, y: 7 });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const arrowhead = await give(fighter, "Dragonbone Arrowhead");
        const since = Date.now();
        await arrowhead.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the arrowhead's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const traits = () => fighter.items.get(sword.id)?.system.traits.value ?? [];
        await until(() => traits().includes("thrown-20"), `thrown-20 on the shortsword (${JSON.stringify(traits())})`, { timeout: 8000 });
        return { traits: traits() };
    },

    // Quick Runner's Shirt: +10-foot item bonus to its user's Speed until the end of the turn.
    async runnersShirt(scene) {
        const { actor: runner } = await creature(scene, "Shirt Runner", { type: "character", x: 12, y: 7 });
        const shirt = await give(runner, "Quick Runner's Shirt");
        const speed = () => runner.system.movement?.speeds?.land?.value ?? runner.system.attributes?.speed?.total ?? null;
        const before = speed();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shirt.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the shirt's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => speed() === before + 10, `Speed ${before} → ${before + 10} (now ${speed()})`, { timeout: 8000 });
        return { before, after: speed(), effects: runner.itemTypes.effect.map((effect) => [effect.name, effect.system.duration]) };
    },

    // Etheric Essence Disruptor: a creature 15 feet away offered, its PF2e "Spell Effect: Bless" listed and counteracted.
    async disruptorSpell(scene) {
        const { actor: engineer, token: engineerToken } = await creature(scene, "Disruptor Engineer", { type: "character", x: 15, y: 9 });
        const { actor: foe } = await creature(scene, "Blessed Foe", { x: 18, y: 9, alliance: "opposition" });
        const bless = await give(foe, "Spell Effect: Bless", "pf2e.spell-effects");
        const disruptor = await give(engineer, "Etheric Essence Disruptor (Lesser)");
        await engineerToken.object?.control?.();
        const since = Date.now();
        await disruptor.consume();
        const card = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        const at = card.getFlag(NS, "card").drinkers.findIndex((entry) => entry.actorUuid === foe.uuid);
        assert(at > 0, `the foe 15 feet away offered (${JSON.stringify(card.getFlag(NS, "card").drinkers.map((entry) => entry.name))})`);
        await game.modules.get(NS).api.live.apply(card.id, { drinker: at });
        await wait(500);
        const rows = game.messages.get(card.id).getFlag(NS, "card").rows;
        assert(rows.some((row) => row.id === bless.id), `Bless listed (${JSON.stringify(rows)})`);
        await game.modules.get(NS).api.live.apply(card.id, { rows: rows.map((row) => ({ ticked: row.id === bless.id, dc: 5, rank: 1 })) });
        await until(() => !foe.items.get(bless.id), "Bless counteracted", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Magical Medal (Phoenix's Fire): its dying user regains 1 Hit Point and is no longer dying, Wounded unchanged.
    async phoenixMedal(scene) {
        const { actor: holder } = await creature(scene, "Medal Holder", { x: 15, y: 11, hp: 0 });
        await holder.increaseCondition("dying");
        const medal = await give(holder, "Magical Medal (Phoenix's Fire)");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(medal.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the medal's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => !holder.hasCondition("dying"), "no longer dying", { timeout: 8000 });
        assert(holder.system.attributes.hp.value === 1, `1 Hit Point (${holder.system.attributes.hp.value})`);
        assert((holder.getCondition("wounded")?.value ?? 0) === 0, `Wounded unchanged (${holder.getCondition("wounded")?.value})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Toadskin Salve: its Use posts the ways card; "Use it" on the second way posts the resistance card, whose Apply gives PF2e's
    // Resistance 3 to physical damage; the ways card stays open.
    async toadskinWays(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Salve User", { type: "character", x: 15, y: 13 });
        const salve = await give(user, "Toadskin Salve");
        await userToken.object?.control?.();
        let since = Date.now();
        await salve.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const card = await messageAfter(since, itemCard("fortune"), { what: "the resistance card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "Resistance" && rule.value === 3)), "resistance 3 on the user", { timeout: 8000 });
        const state = game.messages.get(ways.id).getFlag(NS, "card");
        assert(state.status === "open" && state.results.length === 1, `the ways card open (${JSON.stringify(state.results)})`);
        return { results: state.results };
    },

    // Resonant Guitar's Chord of Protection: +2 status bonus to AC on the ally targeted, not the bard.
    async guitarAlly(scene) {
        const { actor: bard, token: bardToken } = await creature(scene, "Guitar Bard", { type: "character", x: 15, y: 15 });
        const { actor: ally, token: allyToken } = await creature(scene, "Guarded Ally", { x: 17, y: 15 });
        const guitar = await give(bard, "Resonant Guitar");
        await bardToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(guitar.uuid, 1);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the bonus card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        await until(() => ally.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac") && rule.value === 2)), "+2 AC on the ally", { timeout: 8000 });
        assert(!bard.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac"))), "not on the bard");
        return { ac: ally.system.attributes.ac.value };
    },

    // Martial Mayhem Mutagen (Moderate): PF2e's DamageDice, 1d4 precision on melee Strikes against an off-guard target.
    async mayhemDamage(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Mayhem Fighter", { type: "character", x: 18, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Mayhem Target", { x: 19, y: 17, ac: 1, alliance: "opposition" });
        await foe.increaseCondition("off-guard");
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const mutagen = await give(fighter, "Martial Mayhem Mutagen (Moderate)");
        let since = Date.now();
        await mutagen.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the mutagen's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => fighter.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "DamageDice")), "the DamageDice Effect", { timeout: 8000 });
        await fighterToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(fighter, sword);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        assert(/1d4/.test(formula) && /precision/.test(JSON.stringify(rolled.rolls)), `+1d4 precision in PF2e's roll (${formula})`);
        return { formula };
    },

    // Clockwork Helm: its card offers its user's best ranged Strike's modifier (a shortbow) for the beam's attack.
    async helmRanged(scene) {
        const { actor: tinker, token: tinkerToken } = await creature(scene, "Helm Tinker", { type: "character", x: 12, y: 19 });
        const bow = await give(tinker, "Shortbow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const helm = await give(tinker, "Clockwork Helm");
        await tinkerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(helm.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the helm's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const strike = tinker.system.actions.find((action) => action.item?.id === bow.id);
        assert(choices.some((choice) => choice.kind === "ranged" && choice.modifier === strike.totalModifier), `the shortbow's ${strike?.totalModifier} offered (${JSON.stringify(choices)})`);
        return { choices };
    },

    // Octopus Potion (Lesser): the arms' Grapple at +12, on the ability module's card at the creature targeted.
    async octopusGrapple(scene) {
        const { actor: drinker, token: drinkerToken } = await creature(scene, "Octopus Drinker", { type: "character", x: 15, y: 19 });
        const { actor: foe, token: foeToken } = await creature(scene, "Octopus Foe", { x: 16, y: 19, alliance: "opposition", save: -30 });
        const potion = await give(drinker, "Octopus Potion (Lesser)");
        await drinkerToken.object?.control?.();
        let since = Date.now();
        await potion.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the potion's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        await rollAndApply(check);
        await until(() => ["grabbed", "restrained"].some((slug) => foe.hasCondition(slug)), "grabbed (Fortitude DC far below +12)", { timeout: 10000 });
        return { conditions: foe.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Medic's Shield's Adrenaline Boost: PF2e's Administer First Aid on a dying ally (its user's Medicine raised so it succeeds); the
    // success ends Dying, heals 6d6+20 and Quickens.
    async medicsShield(scene) {
        const { actor: medic, token: medicToken } = await creature(scene, "Shield Medic", { type: "character", x: 2, y: 5 });
        const { actor: ally, token: allyToken } = await creature(scene, "Fallen Ally", { type: "character", x: 3, y: 5 });
        await ally.update({ "system.attributes.hp.value": 0 });
        await ally.increaseCondition("dying");
        await medic.createEmbeddedDocuments("Item", [{ name: `${PREFIX} sure hands`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "medicine", value: 40 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        const shield = await give(medic, "Medic's Shield");
        await medicToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("item-action"), { what: "the First Aid card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        await until(() => ally.hasCondition("quickened"), "Quickened after the First Aid", { timeout: 15000 });
        assert(!ally.hasCondition("dying"), "no longer dying");
        return { hp: ally.system.attributes.hp.value, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Words of Wisdom: Deception picked on the card — its +1 item bonus and its critical failures made failures, beside Diplomacy's +1.
    async wordsPick(scene) {
        const { actor: speaker, token: speakerToken } = await creature(scene, "Phrase Speaker", { type: "character", x: 5, y: 5 });
        const tattoo = await give(speaker, "Words of Wisdom (Lesser)");
        await speakerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the tattoo's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, skillPick: 1 });
        const has = (key, selector) => speaker.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === key && [].concat(rule.selector).includes(selector)));
        await until(() => has("FlatModifier", "deception") && has("AdjustDegreeOfSuccess", "deception") && has("AdjustDegreeOfSuccess", "diplomacy"), "Deception's bonus and better degrees", { timeout: 8000 });
        await until(() => has("FlatModifier", "diplomacy"), "Diplomacy's +1", { timeout: 8000 });
        return { effects: speaker.itemTypes.effect.map((effect) => effect.name) };
    },

    // North Wind's Night Verse: a –5-foot status penalty to the targeted creature's Speeds for 1 round.
    async northWind(scene) {
        const { actor: wielder, token: wielderToken } = await creature(scene, "Verse Wielder", { type: "character", x: 8, y: 5 });
        const { actor: foe, token: foeToken } = await creature(scene, "Chilled Foe", { x: 9, y: 5, alliance: "opposition" });
        const verse = await give(wielder, "North Wind's Night Verse");
        await wielderToken.object?.control?.();
        const before = foe.system.movement?.speeds?.land?.value ?? foe.system.attributes?.speed?.total;
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(verse.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the verse's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the ability module's card" }));
        const speed = () => foe.system.movement?.speeds?.land?.value ?? foe.system.attributes?.speed?.total;
        await until(() => speed() === before - 5, `Speed ${before} → ${before - 5} (now ${speed()})`, { timeout: 10000 });
        assert(!wielder.itemTypes.effect.some((effect) => /Night Verse/.test(effect.name)), "not on its wielder");
        return { before, after: speed() };
    },

    // Lockpicker's Oil: its user's first critical failure on a Thievery check to Pick a Lock (Thievery lowered so it critically fails)
    // is a failure (PF2e's AdjustDegreeOfSuccess), and that roll removes the Effect.
    async lockpickFirst(scene) {
        const { actor: picker, token: pickerToken } = await creature(scene, "Lock Picker", { type: "character", x: 11, y: 5 });
        await picker.createEmbeddedDocuments("Item", [{ name: `${PREFIX} clumsy hands`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "thievery", value: -60 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        const oil = await give(picker, "Lockpicker's Oil");
        await pickerToken.object?.control?.();
        let since = Date.now();
        await oil.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the oil's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const first = () => picker.itemTypes.effect.find((effect) => effect.getFlag(NS, "firstDegree"));
        await until(() => first(), "the first-critical-failure Effect", { timeout: 8000 });
        since = Date.now();
        await picker.skills.thievery.roll({ extraRollOptions: ["action:pick-a-lock"], dc: { value: 20 }, skipDialog: true });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check", { what: "the Thievery check" });
        const { outcome, unadjustedOutcome } = rolled.flags.pf2e.context;
        assert(unadjustedOutcome === "criticalFailure" && outcome === "failure", `a critical failure made a failure (${unadjustedOutcome} → ${outcome})`);
        await until(() => !first(), "the Effect gone after that roll", { timeout: 8000 });
        return { outcome, unadjustedOutcome };
    },

    // Big Rock Bullet: readied, then a sling's hit (AC 1) posts the rock's 4d6 bludgeoning (doubled on a critical hit) at the target
    // on the ability module's card, in place of the sling's damage.
    async bigRockInstead(scene) {
        const { actor: slinger, token: slingerToken } = await creature(scene, "Rock Slinger", { type: "character", x: 13, y: 5 });
        const { actor: foe, token: foeToken } = await creature(scene, "Rock Target", { x: 15, y: 5, ac: 1, alliance: "opposition", hp: 200 });
        const sling = await give(slinger, "Sling");
        const bullets = await give(slinger, "Big Rock Bullet");
        await bullets.update({ "system.baseItem": "sling-bullets", "system.quantity": 2 });
        await sling.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        // (A reload weapon's ammunition is loaded into it, PF2e's subitem — the same id as the stack it came from.)
        await sling.attach(bullets, { quantity: 1, skipConfirm: true });
        await wait(500);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(bullets.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await slingerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(slinger, sling);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        const damage = await messageAfter(since, abilitySaveCard, { what: "the rock's damage card" });
        const plan = damage.flags["pf2e-automatic-ability-resolution"].card.plan;
        const formula = plan.resolution.sharedDamage.components[0].formula;
        const multiplier = plan.resolution.outcomes.success.damage.multiplier;
        assert(formula === "4d6" && multiplier === (outcome === "criticalSuccess" ? 2 : 1), `4d6 bludgeoning ×${multiplier} (${formula})`);
        const before = foe.system.attributes.hp.value;
        await applyAbilityCard(damage);
        await until(() => foe.system.attributes.hp.value < before, "the rock's damage on the target", { timeout: 10000 });
        assert(!slinger.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), "the readied Strike spent");
        return { outcome, lost: before - foe.system.attributes.hp.value };
    },

    // Striking Snare: spikes picked on the ways card; placed (the placement click stood in for), a creature entering its square
    // attempts the basic Reflex save against 9d8 piercing.
    async strikingSnareWays(scene) {
        const { actor: setter, token: setterToken } = await creature(scene, "Snare Setter", { type: "character", x: 2, y: 8 });
        const { actor: foe, token: foeToken } = await creature(scene, "Snare Walker", { x: 6, y: 8, alliance: "opposition", hp: 200, save: -30 });
        const snare = await give(setter, "Striking Snare");
        await setterToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        try {
            let since = Date.now();
            await snare.consume();
            const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
            await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
            await until(() => scene.regions.some((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Striking Snare/.test(region.name)), "the snare's Region", { timeout: 8000 });
            const region = scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Striking Snare/.test(entry.name));
            const save = region.flags["pf2e-automatic-ability-resolution"].zone.zone.saves[0].plan.resolution;
            assert(save.sharedDamage.components[0].formula === "9d8[piercing]" && save.check.basic, `basic Reflex against 9d8 piercing (${JSON.stringify(save.sharedDamage.components)})`);
            assert(game.messages.get(ways.id).getFlag(NS, "card").status === "applied", "the ways card closed");
            const shape = region.shapes[0];
            since = Date.now();
            await foeToken.update({ x: shape.x ?? shape.points?.[0], y: shape.y ?? shape.points?.[1] });
            const card = await messageAfter(since, abilitySaveCard, { what: "the snare's save card", timeout: 10000 });
            const before = foe.system.attributes.hp.value;
            await rollAndApply(card);
            await until(() => foe.system.attributes.hp.value < before, "piercing damage on the walker", { timeout: 10000 });
            return { lost: before - foe.system.attributes.hp.value };
        } finally {
            canvas.regions.placeRegion = placing;
        }
    },

    // Vaccine (Minor): +2 item bonus to saves against diseases for an hour, PF2e's own predicate.
    async vaccineBonus(scene) {
        const { actor: patient } = await creature(scene, "Vaccinated", { type: "character", x: 2, y: 10 });
        const vaccine = await give(patient, "Vaccine (Minor)");
        const since = Date.now();
        await vaccine.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the vaccine's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => patient.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && rule.value === 2 && JSON.stringify(rule.predicate ?? []).includes("item:trait:disease"))), "+2 to saves against diseases", { timeout: 8000 });
        const effect = patient.itemTypes.effect.find((entry) => (entry.system.rules ?? []).some((rule) => [].concat(rule.selector).includes("saving-throw")));
        return { duration: effect.system.duration };
    },

    // Sure-Step Crampons: Activate switches on PF2e's own toggle — +2 to the Reflex DC against a Trip — and moving its wearer's token
    // switches it off.
    async cramponsToggle(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Crampon Wearer", { type: "character", x: 4, y: 10 });
        const crampons = await give(wearer, "Sure-Step Crampons");
        await crampons.update({ "system.equipped.invested": true });
        const reflexDC = (options) => {
            const statistic = wearer.getStatistic("reflex");
            const withOptions = statistic.withRollOptions?.({ extraRollOptions: options }) ?? statistic.clone?.({ rollOptions: options }) ?? statistic;
            return withOptions.dc.value;
        };
        const before = reflexDC(["action:trip"]);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(crampons.uuid, 0);
        const card = await messageAfter(since, itemCard("toggle"), { what: "the toggle card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => wearer.rollOptions?.all?.["sure-step-crampons"], "PF2e's sure-step-crampons on", { timeout: 8000 });
        const on = reflexDC(["action:trip"]);
        assert(on === before + 2, `Reflex DC against a Trip ${before} → ${before + 2} (${on})`);
        await wearerToken.update({ x: wearerToken.x + 100 });
        await until(() => !wearer.rollOptions?.all?.["sure-step-crampons"], "switched off after moving", { timeout: 8000 });
        return { before, on, after: reflexDC(["action:trip"]) };
    },

    // Phantom Roll's Stealth, Infiltrator's Elixir's Deception DC, Armor Polishing Kit's Diplomacy to Make an Impression: on the whole
    // roll for their time.
    async narrowBonuses(scene) {
        const { actor: spy } = await creature(scene, "Narrow Spy", { type: "character", x: 6, y: 10 });
        const deceptionDC = () => spy.skills.deception.dc.value;
        const beforeDC = deceptionDC();
        const has = (selector, value) => spy.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes(selector) && rule.value === value));
        for (const [name, selector, value] of [["Phantom Roll", "stealth", 1], ["Infiltrator's Elixir", "deception-dc", 4], ["Armor Polishing Kit", "diplomacy", 1]]) {
            const item = await give(spy, name);
            const since = Date.now();
            await item.consume();
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
            await until(() => has(selector, value), `${name}: +${value} to ${selector}`, { timeout: 8000 });
        }
        assert(deceptionDC() === beforeDC + 4, `Deception DC ${beforeDC} → ${beforeDC + 4} (${deceptionDC()})`);
        return { beforeDC, afterDC: deceptionDC() };
    },

    // Elixir of Rejuvenation: its drinker (an NPC at 10 of 50 Hit Points, with Pseudo Afflictions' Viper Venom — PF2e's production builds
    // have no affliction items) healed to 50 and the venom gone.
    async rejuvenation(scene) {
        const { actor: drinker } = await creature(scene, "Rejuvenated", { x: 8, y: 10, hp: 10 });
        await drinker.update({ "system.attributes.hp.max": 50 });
        const pack = game.packs.get("pseudo-afflictions.effects");
        const entry = pack ? (await pack.getIndex()).find((row) => /Viper Venom/.test(row.name)) : null;
        const venom = entry ? (await pack.getDocument(entry._id)).toObject() : { name: "Affliction Effect: Viper Venom", type: "effect", system: { level: { value: 1 }, traits: { value: ["poison"] } }, flags: { "pseudo-afflictions": { save: { type: "fortitude", value: 16 }, stages: { 1: {} } } } };
        delete venom._id;
        const [affliction] = await drinker.createEmbeddedDocuments("Item", [venom]);
        const elixir = await give(drinker, "Elixir of Rejuvenation");
        const since = Date.now();
        await elixir.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the elixir's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => drinker.system.attributes.hp.value === drinker.system.attributes.hp.max, `full Hit Points (${drinker.system.attributes.hp.value}/${drinker.system.attributes.hp.max})`, { timeout: 8000 });
        if (affliction) await until(() => !drinker.items.get(affliction.id), "the affliction removed", { timeout: 8000 });
        return { hp: drinker.system.attributes.hp.value, afflictionMade: Boolean(affliction), results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Drake Rifle (Acid)'s Drake Shot: the rifle's readied Strike (AC 1) leaves its target Sickened 1.
    async drakeShot(scene) {
        const { actor: shooter, token: shooterToken } = await creature(scene, "Drake Shooter", { type: "character", x: 0, y: 0 });
        const { actor: foe, token: foeToken } = await creature(scene, "Drake Target", { x: 3, y: 0, ac: 1, alliance: "opposition", hp: 200 });
        const rifle = await give(shooter, "Drake Rifle (Acid)");
        await rifle.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const rounds = await give(shooter, "Rounds (Flintlock Musket)");
        await rounds.update({ "system.baseItem": "rounds-drake-rifle", "system.quantity": 3 });
        await rifle.attach(rounds, { quantity: 1, skipConfirm: true });
        await wait(500);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(rifle.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await shooterToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(shooter, shooter.items.get(rifle.id));
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await until(() => foe.hasCondition("sickened"), "Sickened on the target", { timeout: 10000 });
        return { outcome };
    },

    // Spider Gun's Web Shot: its square placed (the click stood in for); a creature entering it attempts the Reflex save (at −30, a
    // critical failure: Immobilized).
    async webShot(scene) {
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Web Gunner", { type: "character", x: 6, y: 0 });
        const { actor: foe, token: foeToken } = await creature(scene, "Web Walker", { x: 9, y: 0, alliance: "opposition", save: -30 });
        const gun = await give(gunner, "Spider Gun");
        await gunnerToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const web = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Spider Gun/.test(region.name));
        try {
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(gun.uuid, 0);
            await until(() => web(), "the web's Region", { timeout: 8000 });
            const shape = web().shapes[0];
            since = Date.now();
            await foeToken.update({ x: shape.x, y: shape.y });
            const card = await messageAfter(since, abilitySaveCard, { what: "the web's save card", timeout: 10000 });
            await rollAndApply(card);
            await until(() => foe.hasCondition("immobilized"), "Immobilized", { timeout: 10000 });
            return { region: web()?.name };
        } finally {
            canvas.regions.placeRegion = placing;
            await web()?.delete().catch(() => null);
        }
    },

    // Serpent Dagger: a critical hit (AC −20) posts its Fortitude save card at the target (DC 19); at −30 it's Sickened.
    async serpentCrit(scene) {
        const { actor: rogue, token: rogueToken } = await creature(scene, "Serpent Rogue", { type: "character", x: 12, y: 0 });
        const { actor: foe, token: foeToken } = await creature(scene, "Serpent Target", { x: 13, y: 0, ac: -20, alliance: "opposition", hp: 200, save: -30 });
        const dagger = await give(rogue, "Serpent Dagger");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await rogueToken.object?.control?.();
        await target(foeToken);
        const since = Date.now();
        const { attack } = await strike(rogue, dagger);
        assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC −20): ${attack.flags.pf2e.context.outcome}`);
        const card = await messageAfter(since, abilitySaveCard, { what: "the dagger's save card" });
        const check = card.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 19, `Fortitude DC 19 (${JSON.stringify(check)})`);
        await rollAndApply(card);
        await until(() => foe.hasCondition("sickened"), "Sickened", { timeout: 10000 });
        return { check };
    },

    // Thundercrasher: a critical hit's save is against its wielder's class DC — its card at that DC, or without one the GM's note.
    async thunderCrit(scene) {
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Thunder Gunner", { type: "character", x: 15, y: 0 });
        const { token: foeToken } = await creature(scene, "Thunder Target", { x: 16, y: 0, ac: -20, alliance: "opposition", hp: 200 });
        const gun = await give(gunner, "Thundercrasher");
        await gun.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const rounds = await give(gunner, "Rounds (Blunderbuss)");
        await rounds.update({ "system.quantity": 3 });
        await gun.attach(rounds, { quantity: 1, skipConfirm: true });
        await wait(500);
        await gunnerToken.object?.control?.();
        await target(foeToken);
        const since = Date.now();
        const { attack } = await strike(gunner, gunner.items.get(gun.id));
        assert(attack.flags.pf2e.context.outcome === "criticalSuccess", `a critical hit (AC −20): ${attack.flags.pf2e.context.outcome}`);
        const classDC = Number(gunner.system.attributes?.classDC?.value) || null;
        const found = await messageAfter(since, (message) => abilitySaveCard(message) || /Thundercrasher.*has no class DC/.test(message.content ?? ""), { what: "the save card or the GM's note" });
        const against = found.flags?.["pf2e-automatic-ability-resolution"]?.card?.plan?.resolution?.check?.against ?? null;
        assert(classDC ? against?.value === classDC : !against, `class DC ${classDC} → ${JSON.stringify(against)}`);
        return { classDC, against };
    },

    // Smogger: its smog an emanation attached to its wearer's token, concealing, for 1 minute.
    async smoggerZone(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Smog Wearer", { type: "character", x: 18, y: 0 });
        const smogger = await give(wearer, "Smogger");
        await smogger.update({ "system.equipped.invested": true });
        await wearerToken.object?.control?.();
        await game.modules.get(NS).api.live.activate(smogger.uuid, 0);
        const smog = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Smogger/.test(region.name));
        await until(() => smog(), "the smog's Region", { timeout: 8000 });
        const zone = smog().flags["pf2e-automatic-ability-resolution"].zone;
        const attached = smog().attachment?.token?.id ?? smog().attachment?.token ?? null;
        assert(zone.zone.concealed && attached === wearerToken.id, `concealing, attached to the wearer (${zone.zone.concealed}, ${attached})`);
        // (Gone again, so it conceals no later case's creatures.)
        await smog().delete();
        return { area: zone.zone.area };
    },

    // Smoke Screen Snare (Lesser): placed (the click stood in for); the first creature to enter sets it off, and its concealing smoke
    // appears at the snare's square (the ability module's zone.then) as the snare goes.
    async smokeSnareThen(scene) {
        const { actor: setter, token: setterToken } = await creature(scene, "Smoke Setter", { type: "character", x: 0, y: 1 });
        const { token: walkerToken } = await creature(scene, "Smoke Walker", { x: 4, y: 1, alliance: "opposition" });
        const snare = await give(setter, "Smoke Screen Snare (Lesser)");
        await setterToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        try {
            await snare.consume();
            const named = (test) => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Smoke Screen Snare/.test(region.name) && test(region.flags["pf2e-automatic-ability-resolution"].zone.zone));
            await until(() => named((zone) => zone.once), "the snare's Region", { timeout: 8000 });
            const shape = named((zone) => zone.once).shapes[0];
            await walkerToken.update({ x: shape.x, y: shape.y });
            await until(() => named((zone) => zone.concealed && !zone.once), "the smoke's Region", { timeout: 10000 });
            assert(!named((zone) => zone.once), "the snare spent");
            return { smoke: named((zone) => zone.concealed).flags["pf2e-automatic-ability-resolution"].zone.zone.area };
        } finally {
            canvas.regions.placeRegion = placing;
            for (const region of scene.regions.filter((entry) => /Smoke Screen Snare/.test(entry.name))) await region.delete().catch(() => null);
        }
    },

    // Mercurial Mantle's Cunning Dodge: the triggering enemy's Perception check against DC 38 (its Perception at −30): Off-Guard.
    async cunningDodge(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Dodging Wearer", { type: "character", x: 6, y: 1 });
        const { actor: foe, token: foeToken } = await creature(scene, "Dodged Foe", { x: 7, y: 1, alliance: "opposition" });
        await foe.update({ "system.perception.mod": -30 });
        const mantle = await give(wearer, "Mercurial Mantle");
        await mantle.update({ "system.equipped.invested": true });
        await wearerToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(mantle.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the mantle's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the Perception check card" });
        const statistic = check.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.statistic;
        assert(statistic === "perception", `a Perception check (${statistic})`);
        await rollAndApply(check);
        await until(() => foe.hasCondition("off-guard"), "Off-Guard", { timeout: 10000 });
        return { statistic };
    },

    // Violet Ray's Electric Love: the counteract card offers the adjacent ally; its Clumsy counteracted (+22 against the DC typed).
    async violetRay(scene) {
        const { actor: healer, token: healerToken } = await creature(scene, "Ray Healer", { type: "character", x: 9, y: 1 });
        const { actor: patient } = await creature(scene, "Ray Patient", { x: 10, y: 1 });
        await patient.increaseCondition("clumsy", { value: 1 });
        const ray = await give(healer, "Violet Ray");
        await healerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(ray.uuid, 0);
        const card = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        const at = card.getFlag(NS, "card").drinkers.findIndex((entry) => entry.actorUuid === patient.uuid);
        assert(at >= 0, `the adjacent patient offered (${JSON.stringify(card.getFlag(NS, "card").drinkers.map((entry) => entry.name))})`);
        await game.modules.get(NS).api.live.apply(card.id, { drinker: at });
        await wait(500);
        const rows = game.messages.get(card.id).getFlag(NS, "card").rows;
        assert(rows.some((row) => row.slug === "clumsy"), `Clumsy listed (${JSON.stringify(rows)})`);
        await game.modules.get(NS).api.live.apply(card.id, { rows: rows.map((row) => ({ ticked: row.slug === "clumsy", dc: 5, rank: 1 })) });
        await until(() => !patient.hasCondition("clumsy"), "Clumsy counteracted", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Core Bugle's Reveille: its prone user and the prone ally targeted stand.
    async coreBugle(scene) {
        const { actor: bugler, token: buglerToken } = await creature(scene, "Bugler", { type: "character", x: 12, y: 1 });
        const { actor: ally, token: allyToken } = await creature(scene, "Fallen Soldier", { x: 14, y: 1 });
        for (const actor of [bugler, ally]) await actor.increaseCondition("prone");
        const bugle = await give(bugler, "Core Bugle");
        await buglerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bugle.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the bugle's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        await until(() => !bugler.hasCondition("prone") && !ally.hasCondition("prone"), "both standing", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Energy Ointment (Lesser): resistance 5 to fire (picked) on each of the two creatures targeted.
    async ointmentTargets(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Ointment User", { type: "character", x: 16, y: 1 });
        const { actor: first, token: firstToken } = await creature(scene, "Anointed One", { x: 17, y: 1 });
        const { actor: second, token: secondToken } = await creature(scene, "Anointed Two", { x: 18, y: 1 });
        const ointment = await give(user, "Energy Ointment (Lesser)");
        await userToken.object?.control?.();
        const since = Date.now();
        await ointment.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the ointment's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [firstToken.uuid, secondToken.uuid], resistType: 3 });
        const resists = (actor) => actor.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes("fire") && rule.value === 5));
        await until(() => resists(first) && resists(second), "fire resistance 5 on both", { timeout: 8000 });
        assert(!resists(user), "not on its user");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Iron Cube: its readied melee Strike's hit (AC 1) posts PF2e's Trip card at the creature hit.
    async ironCubeTrip(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Cube Fighter", { type: "character", x: 2, y: 13 });
        const { token: foeToken } = await creature(scene, "Cube Target", { x: 3, y: 13, ac: 1, alliance: "opposition" });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const cube = await give(fighter, "Iron Cube");
        await fighterToken.object?.control?.();
        let since = Date.now();
        await cube.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(fighter, sword);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const trip = await messageAfter(since, itemCard("item-action"), { what: "the Trip card" });
        assert(trip.getFlag(NS, "card").plan.action.slug === "trip", "PF2e's Trip");
        return { card: trip.id };
    },

    // Stoneraiser Javelin: its stalagmites placed (the click stood in for) — difficult terrain; a creature moving in takes 4d4 piercing.
    async stoneraiserZone(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Javelin Thrower", { type: "character", x: 18, y: 19 });
        const { actor: foe, token: foeToken } = await creature(scene, "Stalagmite Walker", { x: 17, y: 17, alliance: "opposition", hp: 200 });
        const javelin = await give(thrower, "Stoneraiser Javelin");
        await throwerToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const field = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Stoneraiser/.test(region.name));
        try {
            await game.modules.get(NS).api.live.activate(javelin.uuid, 0);
            await until(() => field(), "the stalagmites' Region", { timeout: 8000 });
            const zone = field().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.terrain.length && zone.damage[0].when === "enter", `difficult terrain and damage on entering (${JSON.stringify(zone.damage)})`);
            const shape = field().shapes[0];
            const since = Date.now();
            await foeToken.update({ x: shape.x, y: shape.y });
            // (Not the save of those there as it appeared — its thrower among them — but the damage on moving in.)
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check?.roll !== "save", { what: "the stalagmites' damage card", timeout: 10000 });
            const before = foe.system.attributes.hp.value;
            await applyAbilityCard(card);
            await until(() => foe.system.attributes.hp.value < before, "piercing damage on the walker", { timeout: 10000 });
            return { lost: before - foe.system.attributes.hp.value };
        } finally {
            canvas.regions.placeRegion = placing;
            await field()?.delete().catch(() => null);
        }
    },

    // Metalmist Sphere (Lesser): its concealing mist, a 5-foot burst on its user for 1 minute.
    async metalmistZone(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Mist User", { type: "character", x: 17, y: 3 });
        const sphere = await give(user, "Metalmist Sphere (Lesser)");
        await userToken.object?.control?.();
        await sphere.consume();
        const mist = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Metalmist/.test(region.name));
        await until(() => mist(), "the mist's Region", { timeout: 8000 });
        const zone = mist().flags["pf2e-automatic-ability-resolution"].zone.zone;
        assert(zone.concealed && zone.area.type === "burst" && zone.area.value === 5, `a concealing 5-foot burst (${JSON.stringify(zone.area)})`);
        await mist().delete();
        return { area: zone.area };
    },

    // Chilled Fire Noodles: a Fatigued eater's AC and saves without Fatigued's −1 for the hour (PF2e's AdjustModifier suppressing it).
    async noodlesFatigue(scene) {
        const { actor: eater } = await creature(scene, "Noodle Eater", { type: "character", x: 19, y: 3 });
        const fresh = eater.system.attributes.ac.value;
        await eater.increaseCondition("fatigued");
        await until(() => eater.system.attributes.ac.value === fresh - 1, `Fatigued's −1 to AC (${eater.system.attributes.ac.value})`, { timeout: 5000 });
        const noodles = await give(eater, "Chilled Fire Noodles");
        const since = Date.now();
        await noodles.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the noodles' card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => eater.system.attributes.ac.value === fresh, `AC back to ${fresh} (${eater.system.attributes.ac.value})`, { timeout: 8000 });
        assert(eater.hasCondition("fatigued"), "still Fatigued");
        return { ac: eater.system.attributes.ac.value };
    },

    // Alchemists+ Nettle Balm (Lesser): PF2e's recovery check for the burning creature touched (targeted), at DC 4.
    async tpNettleBalm(scene) {
        const { actor: medic, token: medicToken } = await creature(scene, "Balm Medic", { type: "character", x: 8, y: 4 });
        const { actor: burning, token: burningToken } = await creature(scene, "Balm Patient", { x: 9, y: 4 });
        const persistent = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        persistent.system.persistent = { formula: "1d6", damageType: "fire", dc: 15 };
        await burning.createEmbeddedDocuments("Item", [persistent]);
        const balm = await give(medic, "Nettle Balm (Lesser)", "pf2e-team-plus-alchemists.pf2e-items");
        await medicToken.object?.control?.();
        const since = Date.now();
        await balm.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the balm's card" });
        const fire = card.getFlag(NS, "card").plan.item.recovery.types.indexOf("fire");
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, recoveryType: fire, targets: [burningToken.uuid] });
        const check = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "flat-check" && message.speaker?.actor === burning.id, { what: "the patient's recovery check" });
        assert(check.flags.pf2e.context.dc?.value === 4, `at DC 4 (${check.flags.pf2e.context.dc?.value})`);
        return { outcome: check.flags.pf2e.context.outcome };
    },

    // Alchemists+ Bristle Boar Flask: the boar's Shove at +10 on the ability module's card, at the creatures targeted along its line.
    async tpBristleBoar(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Boar Releaser", { type: "character", x: 12, y: 6 });
        const { token: first } = await creature(scene, "Boar Victim One", { x: 13, y: 6, alliance: "opposition" });
        const { token: second } = await creature(scene, "Boar Victim Two", { x: 14, y: 6, alliance: "opposition" });
        const flask = await give(user, "Bristle Boar Flask", "pf2e-team-plus-alchemists.pf2e-items");
        await userToken.object?.control?.();
        let since = Date.now();
        await flask.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the flask's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [first.uuid, second.uuid] });
        const shove = await messageAfter(since, abilitySaveCard, { what: "the Shove card" });
        const state = shove.flags["pf2e-automatic-ability-resolution"].card;
        const check = state.plan.resolution.check;
        assert(check.statistic === "athletics" && check.modifier === 10 && check.against?.statistic === "fortitude", `Athletics +10 against Fortitude DC (${JSON.stringify(check)})`);
        assert((state.targets ?? []).length === 2, `at both (${JSON.stringify(state.targets ?? null)})`);
        return { targets: state.targets.length };
    },

    // Alchemists+ Warrior's Chew: +1 item bonus to melee weapons' Strike damage for 10 minutes.
    async tpWarriorsChew(scene) {
        const { actor: chewer } = await creature(scene, "Jerky Chewer", { type: "character", x: 16, y: 4 });
        const chew = await give(chewer, "Warrior's Chew", "pf2e-team-plus-alchemists.pf2e-items");
        const since = Date.now();
        await chew.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the chew's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => chewer.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("strike-damage") && rule.value === 1)), "+1 to Strike damage", { timeout: 8000 });
        return { effects: chewer.itemTypes.effect.map((effect) => effect.name) };
    },

    // Tian Xia+ Arindham's Whip's Crack of the Vine: the whip loses nonlethal and its Strikes add persistent bleed, for 1 round.
    async tpThornWhip(scene) {
        const { actor: wielder, token: wielderToken } = await creature(scene, "Whip Wielder", { type: "character", x: 18, y: 4 });
        const whip = await give(wielder, "Arindham's Whip", "pf2e-team-plus-tian-xia.player-options");
        await whip.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await wielderToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(whip.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the whip's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const strikeTraits = () => (wielder.system.actions ?? []).find((action) => action.item?.id === whip.id)?.item?.system?.traits?.value ?? [];
        await until(() => wielder.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "DamageDice" && [].concat(rule.selector).includes(`${whip.id}-damage`))), "the whip's bleed dice", { timeout: 8000 });
        await until(() => !strikeTraits().includes("nonlethal"), `nonlethal gone from its Strike (${strikeTraits().join(", ")})`, { timeout: 8000 });
        return { traits: strikeTraits() };
    },

    // Alchemists+ Wrought Sirloin: its module's Effect, whose predicated resistance PF2e never applies, left for the text — resistance 8
    // to primal and PF2e's custom resistance 8 to damage from animals, elementals or fey.
    async tpWroughtSirloin(scene) {
        const { actor: eater } = await creature(scene, "Sirloin Eater", { type: "character", x: 10, y: 4 });
        const steak = await give(eater, "Wrought Sirloin", "pf2e-team-plus-alchemists.pf2e-items");
        const since = Date.now();
        await steak.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the steak's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const resistances = () => eater.system.attributes.resistances.map((entry) => [entry.type, entry.value]);
        await until(() => resistances().some(([type, value]) => type === "primal" && value === 8) && resistances().some(([type, value]) => type === "custom" && value === 8), `primal 8 and custom 8 (${JSON.stringify(resistances())})`, { timeout: 8000 });
        assert(!eater.itemTypes.effect.some((effect) => effect.name === "Effect: Wrought Sirloin"), "not its module's Effect");
        return { resistances: resistances() };
    },

    // Alchemists+ Purifying Pie: PF2e's custom resistance 8 to spirit and void damage from unholy creatures, for 24 hours.
    async tpPurifyingPie(scene) {
        const { actor: eater } = await creature(scene, "Pie Eater", { type: "character", x: 8, y: 13 });
        const pie = await give(eater, "Purifying Pie", "pf2e-team-plus-alchemists.pf2e-items");
        const since = Date.now();
        await pie.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the pie's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => eater.system.attributes.resistances.some((entry) => entry.type === "custom" && entry.value === 8), "custom resistance 8", { timeout: 8000 });
        const rule = eater.itemTypes.effect.flatMap((effect) => effect.system.rules).find((entry) => entry.key === "Resistance");
        assert(JSON.stringify(rule.definition).includes("origin:trait:unholy") && JSON.stringify(rule.definition).includes("damage:type:void"), `its definition (${JSON.stringify(rule.definition)})`);
        return { label: eater.system.attributes.resistances.find((entry) => entry.type === "custom")?.label };
    },

    // Sprite Apple (Pink): its eater sheds bright light in 20 feet and dim to 40 — PF2e's TokenLight on the token.
    async spriteAppleLight(scene) {
        const { actor: eater, token } = await creature(scene, "Apple Eater", { type: "character", x: 4, y: 18 });
        const apple = await give(eater, "Sprite Apple (Pink)");
        const since = Date.now();
        await apple.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the apple's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => eater.itemTypes.effect.some((effect) => effect.system.rules.some((rule) => rule.key === "TokenLight" && rule.value?.bright === 20 && rule.value?.dim === 40)), "the TokenLight Effect", { timeout: 8000 });
        await wait(500);
        return { light: { bright: token.light?.bright ?? null, dim: token.light?.dim ?? null } };
    },

    // Alchemists+ Halfling Sandwich (Lesser): Apply readies its +1 status bonus; the next save takes it and spends it.
    async tpHalflingSandwich(scene) {
        const { actor: eater } = await creature(scene, "Sandwich Eater", { x: 8, y: 18 });
        const sandwich = await give(eater, "Halfling Sandwich (Lesser)", "pf2e-team-plus-alchemists.pf2e-items");
        let since = Date.now();
        await sandwich.consume();
        const card = await messageAfter(since, itemCard("fortune"), { what: "the readied bonus card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const effect = () => eater.itemTypes.effect.find((entry) => entry.getFlag(NS, "rollTwice"));
        assert(effect()?.system.rules.filter((rule) => rule.key === "FlatModifier").length === 3, "three FlatModifiers");
        since = Date.now();
        await eater.saves.will.roll({ skipDialog: true });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw", { what: "the Will save" });
        assert((roll.flags.pf2e.modifiers ?? []).some((modifier) => modifier.modifier === 1 && modifier.type === "status" && modifier.enabled !== false), "+1 status on the save");
        await until(() => !effect(), "spent by the save", { timeout: 5000 });
        return { total: roll.rolls[0]?.total };
    },

    // Alchemists+ Concealing Puffball (Lesser): its Effect's status bonus isn't the text's item bonus, so the text: PF2e's Sneak with +1 item.
    async tpPuffball(scene) {
        const { actor: sneak } = await creature(scene, "Puffball Sneak", { type: "character", x: 12, y: 4 });
        const puffball = await give(sneak, "Concealing Puffball (Lesser)", "pf2e-team-plus-alchemists.pf2e-items");
        const since = Date.now();
        await puffball.consume();
        const card = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === sneak.id, { what: "PF2e's Sneak roll", timeout: 12000 });
        const bonus = (roll.flags.pf2e.modifiers ?? []).find((modifier) => modifier.label === "Concealing Puffball (Lesser)");
        assert(bonus?.modifier === 1 && bonus.type === "item", `the +1 item bonus on the roll (${JSON.stringify(bonus ?? null)})`);
        assert(!sneak.itemTypes.effect.some((effect) => /Concealing Puffball/.test(effect.name)), "not its module's Effect");
        return { roll: roll.id };
    },

    // Alchemists+ Ravenous Flytrap (Greater): PF2e's Grapple; its user's own Athletics (raised) is higher than +16, so the text's +2 item bonus.
    async tpFlytrapOwn(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Flytrap User", { type: "character", x: 7, y: 6 });
        const { token: foe } = await creature(scene, "Flytrap Foe", { x: 8, y: 6, alliance: "opposition" });
        await user.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Strong Arms`, type: "effect", img: "icons/svg/upgrade.svg", system: { rules: [{ key: "FlatModifier", selector: "athletics", value: 20 }] } }]);
        const flytrap = await give(user, "Ravenous Flytrap (Greater)", "pf2e-team-plus-alchemists.pf2e-items");
        await userToken.object?.control?.();
        const since = Date.now();
        await flytrap.consume();
        const card = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === user.id, { what: "PF2e's Grapple roll", timeout: 12000 });
        const mods = (roll.flags.pf2e.modifiers ?? []).filter((modifier) => /Ravenous Flytrap/.test(modifier.label));
        assert(mods.length === 1 && mods[0].modifier === 2 && mods[0].type === "item", `only the +2 item bonus (${JSON.stringify(mods)})`);
        return { roll: roll.id };
    },

    // Tian Xia+ Moss Cover (Greater): its Effect's 10 isn't the text's 35, so the text: 35 temporary Hit Points.
    async tpMossCover(scene) {
        const { actor: user } = await creature(scene, "Moss User", { type: "character", x: 14, y: 4 });
        const oil = await give(user, "Moss Cover (Greater)", "pf2e-team-plus-tian-xia.player-options");
        const since = Date.now();
        await oil.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the oil's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => user.system.attributes.hp.temp === 35, `35 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        return { temp: user.system.attributes.hp.temp };
    },

    // Alchemists+ Compressed Gogiteth: its +18 Strikes along its Strides, the ability module's attack card at the three creatures targeted.
    async tpGogiteth(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Gogiteth Releaser", { type: "character", x: 4, y: 13 });
        const foes = [];
        for (const x of [5, 6, 7]) foes.push((await creature(scene, `Gogiteth Foe ${x}`, { x, y: 13, alliance: "opposition" })).token);
        const flask = await give(user, "Compressed Gogiteth", "pf2e-team-plus-alchemists.pf2e-items");
        await userToken.object?.control?.();
        let since = Date.now();
        await flask.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the flask's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: foes.map((foe) => foe.uuid) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the attack card" });
        const state = attack.flags["pf2e-automatic-ability-resolution"].card;
        const check = state.plan.resolution.check;
        assert(check.modifier === 18 && check.against?.statistic === "ac", `+18 against AC (${JSON.stringify(check)})`);
        assert((state.targets ?? []).length === 3, `at all three (${(state.targets ?? []).length})`);
        return { targets: state.targets.length };
    },

    // Alchemists+ Fume Ammunition: its readied Strike; on PF2e's hit (AC 1) the target is Dazzled and the damage roll carries 3d4 persistent acid.
    async tpFumeAmmo(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Fume Archer", { type: "character", x: 0, y: 11 });
        const { actor: foe, token: foeToken } = await creature(scene, "Fume Target", { x: 3, y: 11, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Fume Ammunition", "pf2e-team-plus-alchemists.pf2e-items");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(archer, bow);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await until(() => foe.hasCondition("dazzled"), "dazzled on the hit", { timeout: 10000 });
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        assert(/3d4/.test(formula) && /persistent/.test(formula) && /acid/.test(formula), `3d4 persistent acid on the roll (${formula})`);
        return { formula };
    },

    // Alchemists+ Encapsulated Titanosaur: the spell module casts Earthquake at rank 8 (DC 35) at the creatures targeted.
    async tpTitanosaur(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: user, token: userToken } = await creature(scene, "Titanosaur Keeper", { type: "character", x: 5, y: 17, level: 15 });
        const { token: one } = await creature(scene, "Quake Foe One", { x: 7, y: 17, alliance: "opposition" });
        const { token: two } = await creature(scene, "Quake Foe Two", { x: 8, y: 17, alliance: "opposition" });
        const capsule = await give(user, "Encapsulated Titanosaur", "pf2e-team-plus-alchemists.pf2e-items");
        await userToken.object?.control?.();
        const since = Date.now();
        await capsule.consume();
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [one.uuid, two.uuid] });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.rank === 8, `rank 8 (${flag.rank})`);
        return { flag, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Alchemists+ Surfing Grass: its user, Prone, stands at the end of the Crawl (the extra distance a note).
    async tpSurfingGrass(scene) {
        const { actor: crawler } = await creature(scene, "Grass Crawler", { type: "character", x: 6, y: 11 });
        await crawler.increaseCondition("prone");
        const grass = await give(crawler, "Surfing Grass", "pf2e-team-plus-alchemists.pf2e-items");
        const since = Date.now();
        await grass.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the grass's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => !crawler.hasCondition("prone"), "no longer Prone", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Thousand-Pains Fulu (Stone): the affixed creature's basic DC 19 Fortitude save against 3d6 bludgeoning, on the ability module's card.
    async fuluBasicSave(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Fulu Affixer", { type: "character", x: 15, y: 7 });
        const { token: foe } = await creature(scene, "Fulu Bearer", { x: 16, y: 7, alliance: "opposition" });
        const fulu = await give(user, "Thousand-Pains Fulu (Stone)");
        await userToken.object?.control?.();
        let since = Date.now();
        await fulu.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the fulu's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card" });
        const { check, sharedDamage, outcomes } = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution;
        assert(check.basic && check.against?.value === 19 && /3d6/.test(sharedDamage.components[0].formula), `basic DC 19 against 3d6 (${JSON.stringify(check)})`);
        assert(outcomes.failure.noteEffects?.length === 1, "the failure's note");
        return { save: save.id };
    },

    // Blast Boots (Lesser): its card's pick of PF2e's High Jump or Long Jump; High Jump rolls PF2e's Athletics check.
    async blastBootsJump(scene) {
        const { actor: jumper } = await creature(scene, "Boot Jumper", { type: "character", x: 18, y: 7 });
        const boots = await give(jumper, "Blast Boots (Lesser)");
        const since = Date.now();
        await boots.consume();
        const card = await messageAfter(since, itemCard("item-action"), { what: "the action card" });
        assert(/High Jump/.test(card.content) && /Long Jump/.test(card.content), "both jumps offered");
        await game.modules.get(NS).api.live.apply(card.id, { targets: [], choice: 0 });
        const roll = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.speaker?.actor === jumper.id, { what: "PF2e's High Jump roll", timeout: 12000 });
        return { options: (roll.flags.pf2e.context.options ?? []).filter((option) => /jump/.test(option)) };
    },

    // Blood-Drinker's Drink Blood: temporary Hit Points of twice the targeted creature's level (level 3: 6).
    async bloodDrinkerTemp(scene) {
        const { actor: wielder, token: wielderToken } = await creature(scene, "Blood Wielder", { type: "character", x: 16, y: 5 });
        const { token: fallen } = await creature(scene, "Blood Fallen", { x: 17, y: 5, alliance: "opposition", level: 3 });
        const blade = await give(wielder, "Blood-Drinker");
        await wielderToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the blade's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, targets: [fallen.uuid] });
        await until(() => wielder.system.attributes.hp.temp === 6, `6 temporary Hit Points (${wielder.system.attributes.hp.temp})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Meloth's Lifedrinker (Level 7)'s Vision of Meloth: a basic Will save against 6d6 mental at its owner's class-or-spell DC.
    async lifedrinkerVision(scene) {
        const { actor: wielder } = await creature(scene, "Meloth Wielder", { x: 4, y: 9, level: 9 });
        const { token: foe } = await creature(scene, "Meloth Target", { x: 5, y: 9, alliance: "opposition" });
        const blade = await give(wielder, "Meloth's Lifedrinker (Level 7)");
        await target(foe);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the vision's card" });
        const against = card.getFlag(NS, "card").plan.resolution.check.against;
        const expected = wielder.system.attributes.classOrSpellDC?.value ?? Math.max(wielder.system.attributes.classDC?.value ?? 0, wielder.system.attributes.spellDC?.value ?? 0);
        assert(against?.value === expected && expected > 0, `the owner's DC ${expected} (${JSON.stringify(against)})`);
        assert(/reduced to 0 HP/.test(card.content), "the at-0-HP note");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        await messageAfter(since, abilitySaveCard, { what: "the save card" });
        return { dc: against.value };
    },

    // Wasp Guard: the triggering enemy (targeted) takes 1d8 persistent poison from the ability module's card.
    async waspGuardSwarm(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Wasp Wearer", { type: "character", x: 16, y: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Wasp Enemy", { x: 17, y: 12, alliance: "opposition" });
        const armor = await give(wearer, "Wasp Guard");
        await armor.update({ "system.equipped.inSlot": true, "system.equipped.invested": true });
        await wearerToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the armor's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the ability module's card" }));
        await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "poison"), "persistent poison on the enemy", { timeout: 10000 });
        return { conditions: foe.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Kindler Cameo: its PF2e Effect and the 3d10+12 Hit Points its text gives, rolled on the card.
    async kindlerCameoHeal(scene) {
        const { actor: wearer } = await creature(scene, "Cameo Wearer", { x: 16, y: 13, hp: 10 });
        const cameo = await give(wearer, "Kindler Cameo");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(cameo.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the cameo's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => wearer.system.attributes.hp.value >= 25, `healed by at least 15 (${wearer.system.attributes.hp.value})`, { timeout: 8000 });
        assert(wearer.itemTypes.effect.some((effect) => /Kindler Cameo/.test(effect.name)), "its Effect");
        return { hp: wearer.system.attributes.hp.value };
    },

    // Purloining Cloak's reaction: the attacker's Perception check against DC 38 on the ability module's card.
    async purloiningPerception(scene) {
        const { actor: wearer, token: wearerToken } = await creature(scene, "Cloak Wearer", { type: "character", x: 18, y: 13 });
        const { token: foe } = await creature(scene, "Cloak Attacker", { x: 19, y: 13, alliance: "opposition" });
        const cloak = await give(wearer, "Purloining Cloak");
        await wearerToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(cloak.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the cloak's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the Perception card" });
        const resolution = check.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(resolution.statistic === "perception" && resolution.against?.value === 38, `Perception against DC 38 (${JSON.stringify(resolution)})`);
        return { check: check.id };
    },

    // A holy longsword's Holy Healing: Hit Points regained of twice the targeted unholy creature's level (level 3: 6).
    async holyHealing(scene) {
        const { actor: knight, token: knightToken } = await creature(scene, "Holy Knight", { x: 18, y: 12, hp: 10 });
        const { token: fiend } = await creature(scene, "Unholy Foe", { x: 19, y: 12, alliance: "opposition", level: 3 });
        const sword = await give(knight, "Longsword");
        await sword.update({ "system.runes.potency": 1, "system.runes.property": ["holy"] });
        await knightToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(sword.uuid, "rune:holy:0");
        const card = await messageAfter(since, itemCard("item"), { what: "the rune's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, targets: [fiend.uuid] });
        await until(() => knight.system.attributes.hp.value === 16, `healed by 6 (${knight.system.attributes.hp.value})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Blood Sight Elixir (Lesser): imprecise bloodsense 60 feet for 10 minutes, PF2e's Sense rule on the drinker.
    async bloodSight(scene) {
        const { actor: drinker } = await creature(scene, "Blood Seer", { type: "character", x: 16, y: 6 });
        const elixir = await give(drinker, "Blood Sight Elixir (Lesser)");
        const since = Date.now();
        await elixir.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the elixir's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const senses = () => (drinker.perception?.senses ?? drinker.system.perception?.senses ?? []).map((sense) => [sense.type, sense.acuity, sense.range]);
        await until(() => senses().some(([type, acuity, range]) => type === "bloodsense" && acuity === "imprecise" && range === 60), `bloodsense on its senses (${JSON.stringify(senses())})`, { timeout: 8000 });
        return { senses: senses() };
    },

    // Blister Ammunition (Lesser): on PF2e's hit, its DC 19 Fortitude save at the creature hit; failed, the itch a note Effect on it.
    async blisterAmmoSave(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Blister Archer", { type: "character", x: 17, y: 6 });
        const { actor: foe, token: foeToken } = await creature(scene, "Blister Target", { x: 19, y: 6, ac: 1, save: -30, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Blister Ammunition (Lesser)");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the ammunition's save card" });
        await rollAndApply(save);
        await until(() => foe.itemTypes.effect.some((effect) => /^Blister Ammunition \(Lesser\): note$/.test(effect.name)), `the itch's note on the target (${foe.itemTypes.effect.map((effect) => effect.name).join(", ")})`, { timeout: 10000 });
        return { effects: foe.itemTypes.effect.map((effect) => [effect.name, effect.system.duration?.value, effect.system.duration?.unit]) };
    },

    // Magekiller Bullet: on PF2e's hit, its curse a note Effect on the creature hit for a week.
    async magekillerNote(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Magekiller Archer", { type: "character", x: 6, y: 9, level: 16 });
        const { actor: foe, token: foeToken } = await creature(scene, "Magekiller Target", { x: 8, y: 9, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const bullets = await give(archer, "Magekiller Bullet");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": bullets.id });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bullets.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        await until(() => foe.itemTypes.effect.some((effect) => /Magekiller Bullet/.test(effect.name) && effect.system.duration?.value === 7 && effect.system.duration?.unit === "days"), `the curse's note for 7 days (${foe.itemTypes.effect.map((effect) => `${effect.name} ${effect.system.duration?.value} ${effect.system.duration?.unit}`).join(", ")})`, { timeout: 10000 });
        return { effects: foe.itemTypes.effect.map((effect) => effect.name) };
    },

    // Dread Blindfold's Visions of Terror: the spell module casts Vision of Death at DC 37 at the creature targeted.
    async dreadBlindfoldCast(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: wearer, token: wearerToken } = await creature(scene, "Blindfold Wearer", { type: "character", x: 11, y: 4, level: 18 });
        const { token: foe } = await creature(scene, "Blindfold Foe", { x: 13, y: 4, alliance: "opposition" });
        const blindfold = await give(wearer, "Dread Blindfold");
        await wearerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blindfold.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        const flag = cast.flags["pf2e-automatic-resolution"].castFromItem;
        assert(flag.dc === 37, `DC 37 (${flag.dc})`);
        return { flag };
    },

    // Standard of the Sure-Footed's Help Up: the ally targeted, Prone, stands.
    async sureFootedStand(scene) {
        const { actor: bearer } = await creature(scene, "Banner Bearer", { type: "character", x: 15, y: 4 });
        const { actor: ally, token: allyToken } = await creature(scene, "Fallen Ally", { x: 17, y: 4 });
        await ally.increaseCondition("prone");
        const banner = await give(bearer, "Standard of the Sure-Footed");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(banner.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the banner's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, targets: [allyToken.uuid] });
        await until(() => !ally.hasCondition("prone"), "the ally no longer Prone", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Sparking Spellgun (Lesser): its hit's persistent fire and Dazzled for as long as that fire lasts (the ability module's condition
    // while a persistent damage lasts) — gone with the fire.
    async sparkingDazzled(scene) {
        const { actor: gunner } = await creature(scene, "Spark Gunner", { type: "character", x: 17, y: 7 });
        const { actor: foe, token: foeToken } = await creature(scene, "Spark Target", { x: 19, y: 7, ac: 1, alliance: "opposition" });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await give(gunner, "Sparking Spellgun (Lesser)");
        await wait(500);
        let since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const firearm = choices.find((choice) => choice.kind === "firearm");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(firearm) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the attack card" });
        await rollAndApply(attack);
        const fire = () => foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "fire");
        await until(() => fire() && foe.itemTypes.condition.some((condition) => condition.slug === "dazzled"), `persistent fire and Dazzled (${foe.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 10000 });
        await fire().delete();
        await until(() => !foe.itemTypes.condition.some((condition) => condition.slug === "dazzled"), "Dazzled gone with the fire", { timeout: 10000 });
        return { degree: game.messages.get(attack.id).flags["pf2e-automatic-ability-resolution"].card.targets?.[0]?.degree };
    },

    // Battlezoo's Runebranded Hide: its melee Strikes' extra electricity, 1d6 per point of its save bonus (a resilient rune: 2d6), for 1 minute.
    async runebrandedHide(scene) {
        assert(game.modules.get("battlezoo-bestiary-pf2e")?.active, "Battlezoo Bestiary isn't active in pftest.");
        const { actor: wearer } = await creature(scene, "Hide Wearer", { type: "character", x: 18, y: 5 });
        const hide = await give(wearer, "Runebranded Hide", "battlezoo-bestiary-pf2e.pf2e-battlezoo-equipment");
        await hide.update({ "system.runes.resilient": 1, "system.equipped.inSlot": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(hide.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the hide's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => wearer.itemTypes.effect.some((effect) => effect.system.rules.some((rule) => rule.key === "DamageDice" && rule.diceNumber === 2 && rule.dieSize === "d6" && rule.damageType === "electricity")), "2d6 electricity on its melee Strikes", { timeout: 8000 });
        return { effects: wearer.itemTypes.effect.map((effect) => effect.name) };
    },

    // Spider Satchel (Lesser): after PF2e's damage (its persistent poison) the bomb card's Fascinated, for as long as the poison lasts.
    async satchelFascinated(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Satchel Thrower", { type: "character", x: 12, y: 9 });
        const { actor: foe, token: foeToken } = await creature(scene, "Satchel Target", { x: 14, y: 9, ac: 1, alliance: "opposition" });
        const bomb = await give(thrower, "Spider Satchel (Lesser)");
        await bomb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(thrower, bomb);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        const since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const card = await messageAfter(since, itemCard("bomb"));
        await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken });
        const poison = () => foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "poison");
        await until(() => poison(), "the persistent poison", { timeout: 6000 });
        await game.modules.get(NS).api.live.apply(card.id, { included: [] });
        await until(() => foe.hasCondition("fascinated"), `Fascinated (${foe.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
        await poison().delete();
        await until(() => !foe.hasCondition("fascinated"), "Fascinated gone with the poison", { timeout: 10000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Thousand-Pains Fulu (Burl): its card on use (its text's "aura" is flavor, not an aura activation), the basic save at DC 35.
    async fuluBurlCard(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Burl Affixer", { type: "character", x: 12, y: 13 });
        const { token: foe } = await creature(scene, "Burl Bearer", { x: 13, y: 13, alliance: "opposition" });
        const fulu = await give(user, "Thousand-Pains Fulu (Burl)");
        await userToken.object?.control?.();
        let since = Date.now();
        await fulu.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the fulu's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.basic && check.against?.value === 35, `basic DC 35 (${JSON.stringify(check)})`);
        return { save: save.id };
    },

    // Colorful Coating (Violet): its square placed (the click stood in for), difficult terrain; a creature entering it attempts the
    // Reflex save (at −30, a critical failure: Immobilized).
    async violetCoating(scene) {
        const { actor: coater, token: coaterToken } = await creature(scene, "Coat Painter", { type: "character", x: 15, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Coat Walker", { x: 18, y: 13, alliance: "opposition", save: -30 });
        const coating = await give(coater, "Colorful Coating (Violet)");
        await coaterToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const square = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Colorful Coating/.test(region.name));
        try {
            await coating.consume();
            await until(() => square(), "the coating's Region", { timeout: 8000 });
            const zone = square().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.terrain.length && zone.saves[0].when.includes("enter"), `difficult terrain and the save on entering (${JSON.stringify(zone.terrain)})`);
            const shape = square().shapes[0];
            const since = Date.now();
            await foeToken.update({ x: shape.x, y: shape.y });
            const card = await messageAfter(since, abilitySaveCard, { what: "the coating's save card", timeout: 10000 });
            const check = card.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.statistic === "reflex" && check.against.value === 20, `Reflex DC 20 (${JSON.stringify(check)})`);
            await rollAndApply(card);
            await until(() => foe.hasCondition("immobilized"), "Immobilized", { timeout: 10000 });
            return { region: square()?.name };
        } finally {
            canvas.regions.placeRegion = placing;
            await square()?.delete().catch(() => null);
        }
    },

    // Alghollthu Lash: its activation readies the slime on the lash alone; a critical miss keeps it; the lash's hit (AC 1) posts the
    // DC 25 Fortitude save card and spends it.
    async lashNextHit(scene) {
        const { actor: wielder, token: wielderToken } = await creature(scene, "Lash Wielder", { type: "character", x: 15, y: 16 });
        const { token: foeToken } = await creature(scene, "Lash Target", { x: 16, y: 16, ac: 1, alliance: "opposition" });
        const sword = await give(wielder, "Shortsword");
        const lash = await give(wielder, "Alghollthu Lash");
        await lash.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(lash.uuid, 0);
        const card = await messageAfter(since, itemCard("poison"), { what: "the lash's card" });
        const state = card.getFlag(NS, "card");
        assert(state.weapons.length === 1 && state.weapons[0].id === lash.id, `only the lash (${state.weapons.map((entry) => entry.name).join(", ")}; not ${sword.name})`);
        await game.modules.get(NS).api.live.apply(card.id, { weapon: 0 });
        await wait(600);
        const readied = () => wielder.itemTypes.effect.find((entry) => entry.getFlag(NS, "poison")?.weaponId === lash.id);
        assert(readied(), "the slime on the lash");
        await wielderToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(wielder, lash);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the slime's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 25, `Fortitude DC 25 (${JSON.stringify(check)})`);
        await wait(500);
        assert(!readied(), "spent");
        return { save: save.id };
    },

    // Deflecting Branch: its reaction's card gives its user +4 circumstance AC for the turn (the ability compiler's "ac-reaction", a
    // monster's own, as the readied bonus).
    async branchDeflect(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Branch Deflector", { type: "character", x: 15, y: 19 });
        const branch = await give(user, "Deflecting Branch");
        await userToken.object?.control?.();
        const before = user.system.attributes.ac.value;
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(branch.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the branch's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac") && rule.value === 4 && rule.type === "circumstance")), "+4 circumstance AC", { timeout: 8000 });
        await until(() => user.system.attributes.ac.value === before + 4, `AC ${before} + 4`, { timeout: 8000 });
        return { ac: [before, user.system.attributes.ac.value] };
    },

    // Horn of Rust's shards: the 5-foot emanation on its user's token for 1 minute, and its user's own Effect: Horn of Rust (+1 item AC).
    async hornOfRustAura(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Rust Hornist", { type: "character", x: 15, y: 22 });
        const horn = await give(user, "Horn of Rust");
        await userToken.object?.control?.();
        const aura = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Horn of Rust/.test(region.name));
        try {
            await game.modules.get(NS).api.live.activate(horn.uuid, 1);
            await until(() => aura(), "the shards' Region", { timeout: 8000 });
            const zone = aura().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.area.value === 5 && zone.saves[0].when.includes("start"), `a 5-foot emanation, its save at a turn's start (${JSON.stringify(zone.area)})`);
            await until(() => user.itemTypes.effect.some((effect) => effect.name === "Effect: Horn of Rust"), "Effect: Horn of Rust on its user", { timeout: 8000 });
            return { region: aura().name };
        } finally {
            await aura()?.delete().catch(() => null);
        }
    },

    // Devil's Trident's Stay a Foe: its activation readies the trident's Strike; the hit has the spell module cast Paralyze (rank 3,
    // DC 25) at the creature hit. (On a crowded lab, late in a full run, the cast comes some 20 seconds after the hit.)
    async tridentParalyze(scene) {
        const { actor: wielder, token: wielderToken } = await creature(scene, "Trident Wielder", { type: "character", x: 15, y: 25 });
        const { token: foeToken } = await creature(scene, "Trident Target", { x: 16, y: 25, ac: 1, alliance: "opposition" });
        const trident = await give(wielder, "Devil's Trident");
        await trident.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(trident.uuid, 2);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await wielderToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(wielder, trident);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const cast = await messageAfter(since, (message) => message.flags?.pf2e?.origin?.type === "spell" && /Paralyze/.test(message.flags?.pf2e?.origin?.uuid ? fromUuidSync(message.flags.pf2e.origin.uuid)?.name ?? message.flavor ?? "" : message.flavor ?? ""), { what: "the spell module's Paralyze", timeout: 40000 });
        return { cast: cast.id };
    },

    // The Crows: its user's own Thievery check against the target's Reflex DC, on the ability module's card at the creature targeted.
    async crowsThievery(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Crows Thief", { type: "character", x: 18, y: 22 });
        const { token: foe } = await creature(scene, "Crows Mark", { x: 19, y: 22, alliance: "opposition" });
        const card = await give(user, "The Crows");
        await userToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(card.uuid, 0);
        const posted = await messageAfter(since, itemCard("expose"), { what: "the card's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foe.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the Thievery check's card" });
        const read = check.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(read.roll === "skill" && read.statistic === "thievery" && read.against?.statistic === "reflex", `Thievery against the Reflex DC (${JSON.stringify(read)})`);
        return { check: check.id };
    },

    // Reactive Mail's Quick Spike: pressed when a creature within 15 feet manipulates — its basic Reflex save (DC 20) at that creature.
    async reactiveMailSpike(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Spiked Wearer", { type: "character", x: 18, y: 25 });
        const { token: foe } = await creature(scene, "Spike Target", { x: 20, y: 25, alliance: "opposition" });
        const mail = await give(user, "Reactive Mail");
        await userToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(mail.uuid, 0);
        const posted = await messageAfter(since, itemCard("expose"), { what: "the mail's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the spike's save card" });
        const read = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(read.basic && read.statistic === "reflex" && read.against?.value === 20, `basic Reflex DC 20 (${JSON.stringify(read)})`);
        return { save: save.id };
    },

    // Bloodburn Censer: the ways card picks the smoke's type (Poison); its zone on the user's token, and a creature in it as it's made
    // attempts the DC 34 Fortitude save (at −30, a critical failure: Enfeebled 3).
    async censerSmoke(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Censer Bearer", { type: "character", x: 18, y: 28 });
        const { actor: foe } = await creature(scene, "Smoke Breather", { x: 19, y: 28, alliance: "opposition", save: -30 });
        const censer = await give(user, "Bloodburn Censer");
        await userToken.object?.control?.();
        const smoke = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Bloodburn Censer/.test(region.name));
        try {
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(censer.uuid, 0);
            const card = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { choice: 1 });
            await until(() => smoke(), "the smoke's Region", { timeout: 8000 });
            // (Its user's own card too, as it's made: an emanation's maker chooses whether it's affected. The foe's here.)
            const save = await messageAfter(since, (message) => abilitySaveCard(message) && (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid), { what: "the smoke's save card", timeout: 10000 });
            const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.statistic === "fortitude" && check.against.value === 34, `Fortitude DC 34 (${JSON.stringify(check)})`);
            await rollAndApply(save);
            await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "enfeebled" && condition.value === 3), "Enfeebled 3", { timeout: 10000 });
            return { region: smoke()?.name };
        } finally {
            await smoke()?.delete().catch(() => null);
        }
    },

    // Alkenstar Phalanx: its walls placed (the click stood in for) as one 120-foot line, greater difficult terrain; a creature entering
    // attempts the basic Fortitude save (DC 32).
    async phalanxWalls(scene) {
        // (On the scene: a token off it can't move. Row 8 east of the raiser, the line's.)
        const { actor: user, token: userToken } = await creature(scene, "Phalanx Raiser", { type: "character", x: 0, y: 8 });
        const { token: foeToken } = await creature(scene, "Wall Walker", { x: 3, y: 10, alliance: "opposition", hp: 400 });
        const phalanx = await give(user, "Alkenstar Phalanx");
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const walls = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Alkenstar Phalanx/.test(region.name));
        try {
            await game.modules.get(NS).api.live.activate(phalanx.uuid, 0);
            await until(() => walls(), "the walls' Region", { timeout: 8000 });
            const zone = walls().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.area.type === "line" && zone.area.value === 120 && zone.terrain[0]?.difficulty === 3, `a 120-foot line of greater difficult terrain (${JSON.stringify(zone.area)})`);
            const shape = walls().shapes[0];
            const since = Date.now();
            // (Three squares along the line from where it starts.)
            const turn = ((shape.rotation ?? 0) * Math.PI) / 180;
            const point = { x: shape.x + 3 * canvas.grid.size * Math.cos(turn), y: shape.y + 3 * canvas.grid.size * Math.sin(turn) };
            await foeToken.update({ x: point.x - (canvas.grid.size / 2), y: point.y - (canvas.grid.size / 2) });
            const card = await messageAfter(since, abilitySaveCard, { what: "the walls' save card", timeout: 10000 });
            const check = card.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.basic && check.statistic === "fortitude" && check.against.value === 32, `basic Fortitude DC 32 (${JSON.stringify(check)})`);
            return { region: walls().name };
        } finally {
            canvas.regions.placeRegion = placing;
            await walls()?.delete().catch(() => null);
        }
    },

    // Blessed Ampoule: used after the shortsword's hit (AC 1), it readies that Strike's damage roll as spirit; PF2e's roll is spirit,
    // and spends it.
    async blessedAmpouleSpirit(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Ampoule Striker", { type: "character", x: 0, y: 12 });
        const { token: foeToken } = await creature(scene, "Ampoule Target", { x: 1, y: 12, ac: 1, alliance: "opposition" });
        const sword = await give(fighter, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const ampoule = await give(fighter, "Blessed Ampoule");
        // (The tokens drawn before they're targeted.)
        await until(() => fighterToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await wait(600);
        await fighterToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(fighter, sword);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        let since = Date.now();
        await ampoule.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        const readied = () => fighter.itemTypes.effect.find((entry) => entry.getFlag(NS, "strikeRider"));
        assert(readied()?.system.rules.some((rule) => rule.key === "DamageAlteration" && rule.value === "spirit"), "the readied spirit damage");
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        assert(/spirit/.test(formula) && !/piercing/.test(formula), `PF2e's damage roll is spirit (${formula})`);
        const end = Date.now() + 6000;
        while (Date.now() < end && readied()) await wait(250);
        assert(!readied(), "spent by the damage roll");
        return { outcome, formula };
    },

    // Boom Snare: placed (the placement click stood in for), the creature entering its square takes its 1d4 persistent fire (no save);
    // then it's spent.
    async boomSnare(scene) {
        const { token: setterToken, actor: setter } = await creature(scene, "Boom Setter", { type: "character", x: 9, y: 14 });
        const { actor: foe, token: foeToken } = await creature(scene, "Boom Walker", { x: 12, y: 14, alliance: "opposition", hp: 200 });
        const snare = await give(setter, "Boom Snare");
        // (The tokens drawn first: its area needs its setter's token.)
        await until(() => setterToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await setterToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const boom = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Boom Snare/.test(entry.name));
        try {
            await snare.consume();
            await until(() => boom(), "the snare's Region", { timeout: 8000 });
            const shape = boom().shapes[0];
            const since = Date.now();
            await foeToken.update({ x: shape.x ?? shape.points?.[0], y: shape.y ?? shape.points?.[1] });
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check?.roll !== "save", { what: "the snare's damage card", timeout: 10000 });
            await applyAbilityCard(card);
            await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "persistent-damage"), "persistent fire on the walker", { timeout: 10000 });
            return { card: card.id };
        } finally {
            canvas.regions.placeRegion = placing;
            await boom()?.delete().catch(() => null);
        }
    },

    // Golden Silencer (Standard): it readies the bow's next ranged Strike; the hit (AC 1) posts the target's DC 20 Fortitude save card,
    // its failure's silence a note Effect.
    async silencerHit(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Silent Archer", { type: "character", x: 9, y: 16 });
        const { token: foeToken } = await creature(scene, "Silenced Target", { x: 11, y: 16, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Arrows");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        const silencer = await give(archer, "Golden Silencer (Standard)");
        await until(() => archerToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await silencer.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the silencer's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 20, `Fortitude DC 20 (${JSON.stringify(check)})`);
        return { save: save.id };
    },

    // Capsaicin Tonic: its cloud placed next to its user (the click stood in for), Concealed inside for 1 minute; a creature moving in
    // takes its 1d4 fire.
    async capsaicinCloud(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Tonic Belcher", { type: "character", x: 13, y: 9 });
        const { actor: foe, token: foeToken } = await creature(scene, "Cloud Walker", { x: 16, y: 9, alliance: "opposition", hp: 200 });
        const tonic = await give(user, "Capsaicin Tonic");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const cloud = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Capsaicin Tonic/.test(entry.name));
        try {
            await tonic.consume();
            await until(() => cloud(), "the cloud's Region", { timeout: 8000 });
            const zone = cloud().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.concealed && zone.lasts?.value === 1 && zone.damage.some((entry) => entry.when === "enter"), `Concealed, 1 minute, damage on entering (${JSON.stringify(zone.damage)})`);
            const shape = cloud().shapes[0];
            const since = Date.now();
            const before = foe.system.attributes.hp.value;
            await foeToken.update({ x: shape.x ?? shape.points?.[0], y: shape.y ?? shape.points?.[1] });
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check?.roll !== "save", { what: "the cloud's damage card", timeout: 10000 });
            await applyAbilityCard(card);
            await until(() => foe.system.attributes.hp.value < before, "fire damage on the walker", { timeout: 10000 });
            return { lost: before - foe.system.attributes.hp.value };
        } finally {
            canvas.regions.placeRegion = placing;
            await cloud()?.delete().catch(() => null);
        }
    },

    // Spun Cloud (Red): its 20-foot burst placed (the click stood in for) for 1 minute; a creature in it as it's made attempts the
    // DC 24 Will save (at −30, a critical failure: Frightened 3).
    async redSpunCloud(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Cloud Spinner", { type: "character", x: 13, y: 2 });
        const { actor: foe, token: foeToken } = await creature(scene, "Cloud Victim", { x: 17, y: 2, alliance: "opposition", save: -30 });
        const cloudItem = await give(user, "Spun Cloud (Red)");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        // (Its burst centred on the victim.)
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [{ ...data, shapes: (data.shapes ?? []).map((shape) => ({ ...shape, x: foeToken.x + canvas.grid.size / 2, y: foeToken.y + canvas.grid.size / 2 })) }]))[0];
        const cloud = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Spun Cloud/.test(entry.name));
        try {
            const since = Date.now();
            await cloudItem.consume();
            await until(() => cloud(), "the cloud's Region", { timeout: 8000 });
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid), { what: "the cloud's save card", timeout: 10000 });
            const check = card.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.statistic === "will" && check.against.value === 24, `Will DC 24 (${JSON.stringify(check)})`);
            await rollAndApply(card);
            await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "frightened" && condition.value === 3), "Frightened 3", { timeout: 10000 });
            return { region: cloud()?.name };
        } finally {
            canvas.regions.placeRegion = placing;
            await cloud()?.delete().catch(() => null);
        }
    },

    // Ghoul Stiletto: its activation readies the dagger's next Strike; the hit (AC 1) posts the target's DC 17 Fortitude save card and
    // attaches the 10-foot stench aura to the target's token.
    async ghoulStench(scene) {
        const { actor: rogue, token: rogueToken } = await creature(scene, "Stiletto Rogue", { type: "character", x: 2, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Stench Bearer", { x: 3, y: 13, ac: 1, alliance: "opposition" });
        const dagger = await give(rogue, "Ghoul Stiletto");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await until(() => rogueToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        const aura = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Ghoul Stiletto/.test(region.name));
        try {
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(dagger.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            await rogueToken.object?.control?.();
            await target(foeToken);
            since = Date.now();
            const { attack } = await strike(rogue, dagger);
            assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
            const save = await messageAfter(since, (message) => abilitySaveCard(message) && (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid), { what: "the stench save card" });
            const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.statistic === "fortitude" && check.against.value === 17, `Fortitude DC 17 (${JSON.stringify(check)})`);
            await until(() => aura(), "the stench aura's Region", { timeout: 10000 });
            const attached = aura().attachment?.token;
            assert((attached?.id ?? attached) === foeToken.id, `attached to the target's token (${attached?.id ?? attached})`);
            return { region: aura().name };
        } finally {
            await aura()?.delete().catch(() => null);
        }
    },

    // Singularity Ammunition: activated, loaded in a shortbow; the hit (AC 1) posts the pull's Fortitude save (DC 30) for the creature next
    // to the target, and the blast's basic Reflex save (DC 28) for the target and that creature.
    async singularityAround(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Singularity Archer", { type: "character", x: 5, y: 15 });
        const { actor: foe, token: foeToken } = await creature(scene, "Singularity Target", { x: 8, y: 15, ac: 1, alliance: "opposition" });
        const { actor: nearby, token: nearbyToken } = await creature(scene, "Singularity Bystander", { x: 9, y: 15, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Singularity Ammunition");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        await until(() => archerToken.object && foeToken.object && nearbyToken.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const forUuids = (message) => (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).map((entry) => entry.actorUuid);
        const pull = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check?.statistic === "fortitude", { what: "the pull's save card", timeout: 10000 });
        const blast = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check?.statistic === "reflex", { what: "the blast's save card", timeout: 10000 });
        assert(forUuids(pull).includes(nearby.uuid) && !forUuids(pull).includes(foe.uuid), `the pull for the bystander, not the target (${forUuids(pull).join(", ")})`);
        assert(forUuids(blast).includes(foe.uuid) && forUuids(blast).includes(nearby.uuid), `the blast for both (${forUuids(blast).join(", ")})`);
        return { pull: pull.id, blast: blast.id };
    },

    // Sanctified Beans: its square placed (the click stood in for); at the end of their turns there, an incorporeal undead gets the basic Will
    // save against 4d8+4 spirit and the incorporeal Fortitude save, a creature with none of the traits neither (the zone's only: { traits }).
    async sanctifiedBeans(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Bean Exhaler", { type: "character", x: 13, y: 5 });
        const { actor: plain, token: plainToken } = await creature(scene, "Bean Bystander", { x: 16, y: 5, alliance: "opposition" });
        const { actor: ghost, token: ghostToken } = await creature(scene, "Bean Ghost", { x: 17, y: 5, alliance: "opposition" });
        await ghost.update({ "system.traits.value": ["undead", "incorporeal"] });
        const beans = await give(user, "Sanctified Beans");
        await until(() => userToken.object && plainToken.object && ghostToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const square = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Sanctified Beans/.test(region.name));
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await beans.consume();
            await until(() => square(), "the beans' Region", { timeout: 8000 });
            const shape = square().shapes[0];
            const at = { x: (shape.x ?? shape.points?.[0]) - (shape.type === "rectangle" ? 0 : canvas.grid.size / 2), y: (shape.y ?? shape.points?.[1]) - (shape.type === "rectangle" ? 0 : canvas.grid.size / 2) };
            await plainToken.update(at);
            await ghostToken.update(at);
            await wait(800);
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 30 }, { tokenId: plainToken.id, sceneId: scene.id, actorId: plain.id, initiative: 20 }, { tokenId: ghostToken.id, sceneId: scene.id, actorId: ghost.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            const since = Date.now();
            for (let turn = 0; turn < 3; turn++) {
                await combat.nextTurn();
                await wait(900);
            }
            await wait(1500);
            const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
            const forActor = (actor) => cards.filter((message) => (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === actor.uuid));
            const statistics = forActor(ghost).map((message) => message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.statistic).sort();
            assert(forActor(plain).length === 0, `no card for the bystander (${forActor(plain).length})`);
            assert(JSON.stringify(statistics) === JSON.stringify(["fortitude", "will"]), `the ghost's Will and Fortitude saves (${statistics.join(", ")})`);
            return { ghost: statistics };
        } finally {
            canvas.regions.placeRegion = placing;
            await square()?.delete().catch(() => null);
            await combat.delete().catch(() => null);
        }
    },

    // Aetheric Irritant (Lesser): placed (the click stood in for), an undead entering it gets the DC 15 Will save, a creature with none of the
    // traits doesn't.
    async aethericChime(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Chime Ringer", { type: "character", x: 1, y: 18 });
        const { actor: plain, token: plainToken } = await creature(scene, "Chime Bystander", { x: 6, y: 16, alliance: "opposition" });
        const { actor: undead, token: undeadToken } = await creature(scene, "Chime Zombie", { x: 7, y: 16, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"] });
        const chime = await give(user, "Aetheric Irritant (Lesser)");
        await until(() => userToken.object && plainToken.object && undeadToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const area = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Aetheric Irritant/.test(region.name));
        try {
            await chime.consume();
            await until(() => area(), "the chime's Region", { timeout: 8000 });
            const shape = area().shapes[0];
            const at = { x: shape.x - canvas.grid.size / 2, y: shape.y - canvas.grid.size / 2 };
            const since = Date.now();
            await plainToken.update({ x: at.x + canvas.grid.size, y: at.y });
            await undeadToken.update({ x: at.x, y: at.y + canvas.grid.size });
            await wait(2500);
            const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
            const forActor = (actor) => cards.filter((message) => (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === actor.uuid));
            assert(forActor(plain).length === 0, `no card for the bystander (${forActor(plain).length})`);
            assert(forActor(undead).length === 1 && forActor(undead)[0].flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.against.value === 15, `the zombie's DC 15 Will save (${forActor(undead).length})`);
            return { cards: cards.length };
        } finally {
            canvas.regions.placeRegion = placing;
            await area()?.delete().catch(() => null);
        }
    },

    // Soulcutter's Soothe Souls: its 20-foot emanation on its user; at the start of their turns in it, an undead takes the 1d8 spirit damage
    // (its card), a creature with none of the traits doesn't (zone.damage[i].only).
    async soulcutterSoothe(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Soulcutter Wielder", { type: "character", x: 2, y: 4 });
        const { actor: plain, token: plainToken } = await creature(scene, "Soothed Bystander", { x: 3, y: 4, alliance: "opposition" });
        const { actor: undead, token: undeadToken } = await creature(scene, "Castigated Zombie", { x: 2, y: 5, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"] });
        const blade = await give(user, "Soulcutter");
        await until(() => userToken.object && plainToken.object && undeadToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const index = (await import(`/modules/${NS}/src/compiler/permanent.js`)).compileActivations(blade).findIndex((entry) => /Soothe/.test(entry.activation.name ?? ""));
        const area = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Soulcutter/.test(region.name));
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 30 }, { tokenId: plainToken.id, sceneId: scene.id, actorId: plain.id, initiative: 20 }, { tokenId: undeadToken.id, sceneId: scene.id, actorId: undead.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            await game.modules.get(NS).api.live.activate(blade.uuid, index);
            await until(() => area(), "the aura's Region", { timeout: 8000 });
            const since = Date.now();
            for (let turn = 0; turn < 2; turn++) {
                await combat.nextTurn();
                await wait(1200);
            }
            await wait(1500);
            const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
            const forActor = (actor) => cards.filter((message) => (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === actor.uuid));
            assert(forActor(plain).length === 0, `no card for the bystander (${forActor(plain).length})`);
            assert(forActor(undead).length === 1, `the zombie's damage card (${forActor(undead).length})`);
            return { cards: cards.length };
        } finally {
            await area()?.delete().catch(() => null);
            await combat.delete().catch(() => null);
        }
    },

    // Sack of Rotten Fruit: thrown as a Strike PF2e can't roll. The card offers its user's simple thrown attack; the ability module's card
    // is that attack against the target's AC with its 1d4 bludgeoning; then the card's second step is its DC 15 Fortitude save at the
    // creature hit.
    async thrownSack(scene) {
        const { actor: pitcher, token: pitcherToken } = await creature(scene, "Fruit Pitcher", { type: "character", x: 10, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Fruit Target", { x: 13, y: 13, alliance: "opposition" });
        const sack = await give(pitcher, "Sack of Rotten Fruit");
        await until(() => pitcherToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await sack.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the sack's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const thrown = choices.find((choice) => choice.kind === "thrown");
        assert(thrown, `the thrown attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(thrown) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const plan = attack.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.modifier === thrown.modifier && plan.resolution.check.against?.statistic === "ac" && plan.resolution.sharedDamage?.components?.[0]?.formula === "1d4", `the thrown attack against AC with 1d4 (${JSON.stringify(plan.resolution.check)})`);
        await until(() => game.messages.get(card.id)?.getFlag(NS, "card")?.step === "then", "the card's save step", { timeout: 5000 });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, (message) => abilitySaveCard(message) && (message.flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid), { what: "the hit's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against?.value === 15, `the DC 15 Fortitude save (${JSON.stringify(check)})`);
        assert(game.messages.get(card.id)?.getFlag(NS, "card")?.status === "applied", "the sack's card done");
        return { thrown, save: `${check.statistic} ${check.against.value}` };
    },

    // Spring-Loaded Net Launcher: an unattached Net thrown farther — its user's simple thrown attack against the target's AC, Off-Guard and
    // Immobilized on its critical success.
    async netLauncher(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Net Launcher", { type: "character", x: 10, y: 17 });
        const { token: foeToken } = await creature(scene, "Net Target", { x: 13, y: 17, alliance: "opposition" });
        const launcher = await give(user, "Spring-Loaded Net Launcher");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await launcher.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the launcher's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const thrown = choices.find((choice) => choice.kind === "thrown");
        assert(thrown, `the thrown attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(thrown) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const plan = attack.flags["pf2e-automatic-ability-resolution"].card.plan;
        const crit = plan.resolution.outcomes.criticalSuccess.effects.map((effect) => effect.slug);
        assert(plan.resolution.check.against?.statistic === "ac" && crit.includes("off-guard") && crit.includes("immobilized"), `the attack against AC, Off-Guard and Immobilized on a critical hit (${JSON.stringify(plan.resolution.check)}, ${crit.join(", ")})`);
        return { thrown, crit };
    },

    // Wondrous Figurine (Golden Lions) and Beetle Gel: the creatures they become, the ability module's conjured tokens beside their user —
    // two Lions (minions, from PF2e's own stat block), then a Flash Beetle from the oil.
    async conjuredCreatures(scene) {
        const { actor: owner, token: ownerToken } = await creature(scene, "Figurine Owner", { type: "character", x: 10, y: 15 });
        const lions = await give(owner, "Wondrous Figurine (Golden Lions)");
        const gel = await give(owner, "Beetle Gel");
        await until(() => ownerToken.object, "the owner's token drawn", { timeout: 5000 });
        const ABILITY = "pf2e-automatic-ability-resolution";
        const made = (item) => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemUuid === item.uuid);
        try {
            await game.modules.get(NS).api.live.activate(lions.uuid, 0);
            await until(() => made(lions).length === 2, "the two lions' tokens", { timeout: 10000 });
            const lion = made(lions)[0].actor;
            assert(lion.system.traits.value.includes("minion") && /Lion/.test(lion.name), `a lion with the minion trait (${lion.name}: ${lion.system.traits.value.join(", ")})`);
            assert(made(lions).every((token) => token.disposition === ownerToken.disposition), "on its user's side");
            await gel.consume();
            await until(() => made(gel).length === 1, "the beetle's token", { timeout: 10000 });
            return { lions: made(lions).map((token) => token.name), beetle: made(gel)[0].name };
        } finally {
            // (Its own: the tokens it made and their world actors.)
            for (const token of [...made(lions), ...made(gel)]) {
                const base = game.actors.get(token.actorId);
                await token.delete().catch(() => null);
                if (base?.flags?.[ABILITY]?.conjured) await base.delete().catch(() => null);
            }
        }
    },

    // Ring of the Tiger: its card gives its user an agile claw unarmed attack (1d6 slashing) until the end of the turn — PF2e's Strike rule,
    // a Strike PF2e lists among the user's actions.
    async tigerClaw(scene) {
        const { actor: brawler } = await creature(scene, "Tiger Brawler", { type: "character", x: 3, y: 9 });
        const ring = await give(brawler, "Ring of the Tiger");
        await ring.update({ "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(ring.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the ring's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const claw = () => (brawler.system.actions ?? []).find((action) => /claw/i.test(action.label ?? action.item?.name ?? ""));
        await until(() => claw(), `a claw Strike among ${(brawler.system.actions ?? []).map((action) => action.label).join(", ")}`, { timeout: 8000 });
        const strike = claw();
        const effect = brawler.itemTypes.effect.find((entry) => entry.system.rules.some((rule) => rule.key === "Strike"));
        assert(effect?.system.duration.expiry === "turn-end" && effect.system.duration.value === 0, `until the end of the turn (${JSON.stringify(effect?.system.duration)})`);
        assert((strike.item?.system?.traits?.value ?? strike.traits?.map((trait) => trait.name) ?? []).includes("agile"), "agile");
        return { strike: strike.label, damage: strike.item?.system?.damage };
    },

    // Gearblade's Disarm: the card's DC 36 Reflex save at the creature disarmed, 3d12 bludgeoning on a failure (6d12 on a critical failure).
    async gearbladeSave(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Gearblade Wielder", { type: "character", x: 3, y: 11 });
        const { token: foe } = await creature(scene, "Gearblade Foe", { x: 4, y: 11, alliance: "opposition" });
        const blade = await give(user, "Gearblade");
        await until(() => userToken.object && foe.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const posted = await messageAfter(since, itemCard("expose"), { what: "the gearblade's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the Reflex save's card" });
        const resolution = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution;
        assert(resolution.check.statistic === "reflex" && resolution.check.against.value === 36 && resolution.outcomes.failure.damage.formulas[0].formula === "3d12[bludgeoning]", `DC 36 Reflex, 3d12 on a failure (${JSON.stringify(resolution.check)})`);
        return { save: save.id };
    },

    // Shadowmist Cape's reaction: its user's Stealth check against the attacker's Perception DC; a success's Hidden its user's, by hand.
    async shadowmistStealth(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Shadowmist Wearer", { type: "character", x: 3, y: 13 });
        const { token: foe } = await creature(scene, "Shadowmist Attacker", { x: 4, y: 13, alliance: "opposition" });
        const cape = await give(user, "Shadowmist Cape");
        await cape.update({ "system.equipped.invested": true });
        await until(() => userToken.object && foe.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(cape.uuid, 0);
        const posted = await messageAfter(since, itemCard("expose"), { what: "the cape's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foe.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the Stealth check's card" });
        const plan = check.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.statistic === "stealth" && plan.resolution.check.against?.statistic === "perception", `Stealth against Perception (${JSON.stringify(plan.resolution.check)})`);
        assert(!(plan.resolution.outcomes.success.effects ?? []).length, "no Hidden on the attacker");
        return { check: check.id };
    },

    // Infernal Health: its user's Effect with PF2e's FastHealing 25 for 6 rounds.
    async infernalHealth(scene) {
        const { actor: user } = await creature(scene, "Infernal Patient", { type: "character", x: 3, y: 15 });
        const contract = await give(user, "Infernal Health");
        await contract.update({ "system.equipped.invested": true }).catch(() => null);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(contract.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the contract's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const effect = () => user.itemTypes.effect.find((entry) => entry.system.rules.some((rule) => rule.key === "FastHealing"));
        await until(() => effect(), "the fast healing Effect", { timeout: 8000 });
        const rule = effect().system.rules.find((entry) => entry.key === "FastHealing");
        assert(Number(rule.value) === 25 && effect().system.duration.value === 6 && effect().system.duration.unit === "rounds", `fast healing 25 for 6 rounds (${JSON.stringify(rule)}, ${JSON.stringify(effect().system.duration)})`);
        return { rule };
    },

    // Orb of Dragonkind's breath: the card's picker of its dragon's damage type; fire picked, the ability module's basic Reflex save card
    // (DC 40) with 25d6 fire.
    async orbBreath(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Orb Holder", { type: "character", x: 3, y: 17 });
        const { token: foe } = await creature(scene, "Orb Target", { x: 5, y: 17, alliance: "opposition" });
        const orb = await give(user, "Orb of Dragonkind");
        await until(() => userToken.object && foe.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(orb.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the breath's card" });
        assert(/data-air-field="damageChoice"/.test(card.content), "the damage type picker");
        const choices = card.getFlag(NS, "card").plan?.damageChoices ?? [];
        const fire = choices.findIndex((choice) => choice.label === "Fire");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], damageChoice: fire });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const resolution = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution;
        assert(resolution.sharedDamage.components[0].formula === "25d6[fire]" && resolution.check.basic && resolution.check.against.value === 40, `25d6 fire, basic DC 40 (${JSON.stringify(resolution.sharedDamage.components)})`);
        return { formula: resolution.sharedDamage.components[0].formula };
    },

    // Mirror Robe: the robe Creates a Diversion for its user at its own +9 Deception against the target's Perception DC.
    async mirrorDiversion(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Robe Wearer", { type: "character", x: 3, y: 19 });
        const { token: foe } = await creature(scene, "Robe Watcher", { x: 5, y: 19, alliance: "opposition" });
        const robe = await give(user, "Mirror Robe");
        await until(() => userToken.object && foe.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(robe.uuid, 0);
        const posted = await messageAfter(since, itemCard("expose"), { what: "the robe's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(posted.id, { targets: [foe.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the diversion's card" });
        const read = check.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(read.statistic === "deception" && read.modifier === 9 && read.against?.statistic === "perception", `Deception +9 against Perception (${JSON.stringify(read)})`);
        return { check: check.id };
    },

    // Stone of Unrivaled Skill: Stealth picked on the card (any skill) — its +3 status bonus for 10 minutes.
    async unrivaledSkill(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Stone Taster", { type: "character", x: 7, y: 19 });
        const stone = await give(user, "Stone of Unrivaled Skill");
        await userToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(stone.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the stone's card" });
        const skills = card.getFlag(NS, "card").plan.item.skillPick.skills;
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, skillPick: skills.indexOf("stealth") });
        const rule = () => user.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((entry) => entry.key === "FlatModifier" && [].concat(entry.selector).includes("stealth"));
        await until(() => rule(), "Stealth's bonus", { timeout: 8000 });
        assert(Number(rule().value) === 3 && rule().type === "status", `+3 status to Stealth (${JSON.stringify(rule())})`);
        return { rule: rule() };
    },

    // Beekeeper's Smoker: its smoke placed in a square next to its user (the click stood in for), Concealed inside.
    async smokerSquare(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Bee Keeper", { type: "character", x: 11, y: 19 });
        const smoker = await give(user, "Beekeeper's Smoker");
        await until(() => userToken.object, "the token drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const smoke = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Beekeeper's Smoker/.test(entry.name));
        try {
            await game.modules.get(NS).api.live.activate(smoker.uuid, 0);
            await until(() => smoke(), "the smoke's Region", { timeout: 8000 });
            const zone = smoke().flags["pf2e-automatic-ability-resolution"].zone.zone;
            assert(zone.concealed && zone.area?.type === "square", `a concealing square (${JSON.stringify(zone.area)})`);
            return { region: smoke().name };
        } finally {
            canvas.regions.placeRegion = placing;
            await smoke()?.delete().catch(() => null);
        }
    },

    // Bottle-O-Ooze (Moderate) (Alchemists+): its Large ooze beside its user — AC 15, 58 Hit Points from the item's own numbers.
    async bottledOoze(scene) {
        assert(game.modules.get("pf2e-team-plus-alchemists")?.active, "Alchemists+ isn't active in pftest.");
        const { actor: thrower, token: throwerToken } = await creature(scene, "Ooze Thrower", { type: "character", x: 15, y: 19 });
        const bottle = await give(thrower, "Bottle-O-Ooze (Moderate)", "pf2e-team-plus-alchemists.pf2e-items");
        await until(() => throwerToken.object, "the token drawn", { timeout: 5000 });
        const ABILITY = "pf2e-automatic-ability-resolution";
        const made = () => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemName === "Bottle-O-Ooze (Moderate)" && token.actor.flags[ABILITY].conjured.sourceTokenUuid === throwerToken.uuid);
        try {
            await bottle.consume();
            await until(() => made().length === 1, "the ooze's token", { timeout: 10000 });
            const ooze = made()[0].actor;
            assert(ooze.system.attributes.ac.value === 15 && ooze.system.attributes.hp.max === 58 && ooze.system.traits.size.value === "lg", `AC 15, 58 HP, Large (${ooze.system.attributes.ac.value}, ${ooze.system.attributes.hp.max}, ${ooze.system.traits.size.value})`);
            return { ooze: made()[0].name };
        } finally {
            for (const token of made()) {
                const base = game.actors.get(token.actorId);
                await token.delete().catch(() => null);
                if (base?.flags?.[ABILITY]?.conjured) await base.delete().catch(() => null);
            }
        }
    },

    // Heartening Missive (Bull): its +1 item bonus to Fortitude saves for 24 hours on the recipient the presser targets, not its writer.
    async missiveRecipient(scene) {
        const { actor: writer } = await creature(scene, "Missive Writer", { type: "character", x: 17, y: 15 });
        const { actor: recipient, token: recipientToken } = await creature(scene, "Missive Recipient", { type: "character", x: 18, y: 15 });
        const missive = await give(writer, "Heartening Missive (Bull)");
        const since = Date.now();
        await missive.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the missive's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [recipientToken.uuid] });
        const bonus = (actor) => actor.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("fortitude"));
        await until(() => bonus(recipient), "the recipient's Fortitude bonus", { timeout: 8000 });
        assert(Number(bonus(recipient).value) === 1 && bonus(recipient).type === "item" && !bonus(writer), `+1 item to Fortitude on the recipient only (${JSON.stringify(bonus(recipient))})`);
        return { rule: bonus(recipient) };
    },

    // Flying Blade Wheel Snare: the first creature into its square gets the snare's +35 attack card against its AC, 8d8 slashing on a hit.
    async bladeWheelSnare(scene) {
        const { token: setterToken, actor: setter } = await creature(scene, "Wheel Setter", { type: "character", x: 17, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Wheel Walker", { x: 19, y: 17, ac: 1, alliance: "opposition", hp: 300 });
        const snare = await give(setter, "Flying Blade Wheel Snare");
        await until(() => setterToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await setterToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const wheel = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Flying Blade Wheel Snare/.test(entry.name));
        try {
            await snare.consume();
            await until(() => wheel(), "the snare's Region", { timeout: 8000 });
            const shape = wheel().shapes[0];
            const since = Date.now();
            await foeToken.update({ x: shape.x ?? shape.points?.[0], y: shape.y ?? shape.points?.[1] });
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.targets?.some((entry) => entry.actorUuid === foe.uuid), { what: "the snare's attack card", timeout: 10000 });
            const check = card.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
            assert(check.statistic === "attack" && check.modifier === 35 && check.against?.statistic === "ac", `the snare's +35 against AC (${JSON.stringify(check)})`);
            const before = foe.system.attributes.hp.value;
            await applyAbilityCard(card);
            await until(() => foe.system.attributes.hp.value < before, "slashing damage on the walker", { timeout: 10000 });
            return { lost: before - foe.system.attributes.hp.value };
        } finally {
            canvas.regions.placeRegion = placing;
            await wheel()?.delete().catch(() => null);
        }
    },

    // Cloth of Nullification: a counteract at what isn't on a creature — the card's one row, the GM's DC 30 and rank 5, its +32 rolled at rank
    // 10 (any result but a critical failure counteracts rank 5), reported for the GM to end.
    async clothCounter(scene) {
        const { actor: user } = await creature(scene, "Cloth Waver", { type: "character", x: 1, y: 3 });
        const cloth = await give(user, "Cloth of Nullification");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(cloth.uuid, 0);
        const card = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        const state = card.getFlag(NS, "card");
        assert(state.step === "pick" && state.rows.length === 1 && state.rows[0].kind === "free", `straight to its one row (${JSON.stringify(state.rows)})`);
        await game.modules.get(NS).api.live.apply(card.id, { rows: [{ ticked: true, dc: 30, rank: 5 }] });
        await until(() => game.messages.get(card.id)?.getFlag(NS, "card")?.status === "applied", "the counteract rolled", { timeout: 8000 });
        const [line] = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(/against DC 30: a (?:critical )?(?:success|failure)/.test(line), `the result reported (${line})`);
        return { line };
    },

    // Golden Gloves' Heaven's Wings: the enemies' save card, and beside it the counteract card for one affliction its user suffers (+31, rank 9).
    async goldenGlovesHalo(scene) {
        const { actor: user } = await creature(scene, "Halo Wearer", { type: "character", x: 1, y: 5 });
        const gloves = await give(user, "Golden Gloves");
        await gloves.update({ "system.equipped.invested": true }).catch(() => null);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(gloves.uuid, 0);
        const save = await messageAfter(since, itemCard("expose"), { what: "the halo's save card" });
        const counter = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        assert(/Counteract \+31, rank 9/.test(counter.content), `its counteract (${counter.content.slice(0, 200)})`);
        return { save: save.id, counteract: counter.id };
    },

    // Dragon's Eye Charm, an item the spell module shares (its Ignition): the third activation, read here — fire resistance 5 for 10 minutes.
    async sharedCharm(scene) {
        const { actor: user } = await creature(scene, "Charm Wearer", { type: "character", x: 1, y: 11 });
        const charm = await give(user, "Dragon's Eye Charm");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(charm.uuid, 2);
        const card = await messageAfter(since, itemCard("item"), { what: "the charm's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => (user.attributes.resistances ?? []).some((entry) => entry.type === "fire" && entry.value === 5), "fire resistance 5", { timeout: 8000 });
        return { resistances: (user.attributes.resistances ?? []).map((entry) => `${entry.type} ${entry.value}`) };
    },

    // Key to the Stomach's Iron Gut: the counteract card for one poison its user suffers (+15, rank 5), as Cleanse Affliction.
    async ironGut(scene) {
        const { actor: user } = await creature(scene, "Iron Gut", { type: "character", x: 1, y: 9 });
        const key = await give(user, "Key to the Stomach");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(key.uuid, 0);
        const counter = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        assert(/Counteract \+15, rank 5/.test(counter.content), `its counteract (${counter.content.slice(0, 200)})`);
        assert(JSON.stringify(counter.getFlag(NS, "card").counteract.afflictions) === '["poison"]', "a poison's");
        return { counteract: counter.id };
    },

    // Limestone Shield's Block Elements: standard cover against the triggering effect — its card gives its user +2 circumstance AC and Reflex.
    async limestoneCover(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Limestone Bearer", { type: "character", x: 1, y: 7 });
        const shield = await give(user, "Limestone Shield");
        await userToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 1);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the shield's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const has = (selector) => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes(selector) && rule.value === 2 && rule.type === "circumstance"));
        await until(() => has("ac") && has("reflex"), "+2 circumstance AC and Reflex", { timeout: 8000 });
        return { ok: true };
    },

    // Bane Ammunition (Moderate): the ways card's pick of its type — Dragon — readies the bow's next Strike with that arrow, 2d6
    // persistent poison only against a creature with the dragon trait (PF2e's DamageDice predicate).
    async baneArrow(scene) {
        const { actor: archer } = await creature(scene, "Bane Archer", { type: "character", x: 1, y: 9 });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Bane Ammunition (Moderate)");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the type picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Dragon") });
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const dice = () => archer.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "DamageDice" && JSON.stringify(rule.predicate ?? []).includes("target:trait:dragon"));
        await until(() => dice(), "the dragon-only poison dice", { timeout: 8000 });
        assert(dice().diceNumber === 2 && dice().dieSize === "d6" && dice().category === "persistent" && dice().damageType === "poison", `2d6 persistent poison (${JSON.stringify(dice())})`);
        // (Against a dragon, PF2e's damage roll carries it.)
        const { actor: wyrm, token: wyrmToken } = await creature(scene, "Bane Wyrm", { x: 3, y: 9, ac: 1, alliance: "opposition", hp: 300 });
        await wyrm.update({ "system.traits.value": ["dragon"] });
        await until(() => wyrmToken.object, "the wyrm drawn", { timeout: 5000 });
        await target(wyrmToken);
        const { action, attack } = await strike(archer, bow);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await wait(800);
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        assert(/persistent/.test(formula) && /poison/.test(formula), `the dragon's damage carries the persistent poison (${formula})`);
        return { rule: dice(), formula };
    },

    // Warding Element Draught: Fire picked on the ways card — its drinker's +1 item bonus to saves against fire effects for 10 minutes.
    async wardingDraught(scene) {
        const { actor: drinker } = await creature(scene, "Draught Drinker", { type: "character", x: 5, y: 9 });
        const draught = await give(drinker, "Warding Element Draught");
        let since = Date.now();
        await draught.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the element picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Fire") });
        const card = await messageAfter(since, itemCard("item"), { what: "the Fire way's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const bonus = () => drinker.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && JSON.stringify(rule.predicate ?? []).includes("item:trait:fire"));
        await until(() => bonus(), "the fire-only save bonus", { timeout: 8000 });
        assert(Number(bonus().value) === 1 && bonus().type === "item", `+1 item (${JSON.stringify(bonus())})`);
        return { rule: bonus() };
    },

    // Clinging Bubbles (Moderate): its cloud placed (the click stood in for) for 1 minute; a creature moving into it takes its –10-foot
    // circumstance penalty to its Speed, which stays until it pops the bubbles.
    async clingingBubbles(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Bubble Blower", { type: "character", x: 9, y: 3 });
        const { actor: foe, token: foeToken } = await creature(scene, "Bubble Walker", { x: 13, y: 3, alliance: "opposition" });
        const vial = await give(user, "Clinging Bubbles (Moderate)");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const cloud = () => scene.regions.find((entry) => entry.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Clinging Bubbles/.test(entry.name));
        try {
            await vial.consume();
            await until(() => cloud(), "the bubbles' Region", { timeout: 8000 });
            const shape = cloud().shapes[0];
            const since = Date.now();
            await foeToken.update({ x: (shape.x ?? shape.points?.[0]) - (shape.type === "rectangle" ? 0 : canvas.grid.size / 2), y: (shape.y ?? shape.points?.[1]) - (shape.type === "rectangle" ? 0 : canvas.grid.size / 2) });
            const card = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.targets?.some((entry) => entry.actorUuid === foe.uuid), { what: "the bubbles' card", timeout: 10000 });
            await applyAbilityCard(card);
            const penalty = () => foe.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("land-speed"));
            await until(() => penalty(), "the walker's Speed penalty", { timeout: 10000 });
            assert(Number(penalty().value) === -10 && penalty().type === "circumstance", `−10 circumstance (${JSON.stringify(penalty())})`);
            return { rule: penalty() };
        } finally {
            canvas.regions.placeRegion = placing;
            await cloud()?.delete().catch(() => null);
        }
    },

    // Tooth and Claw Tattoo: Cat picked on the ways card — a claw Strike with its user's best unarmed die (a fist's d4) for 1 minute.
    async tattooClaw(scene) {
        const { actor: user } = await creature(scene, "Tattooed Brawler", { type: "character", x: 9, y: 1 });
        const tattoo = await give(user, "Tooth and Claw Tattoo");
        await tattoo.update({ "system.equipped.invested": true }).catch(() => null);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the animal picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Cat") });
        const card = await messageAfter(since, itemCard("item"), { what: "the Cat way's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const claw = () => (user.system.actions ?? []).find((action) => /claw/i.test(action.label ?? action.item?.name ?? ""));
        await until(() => claw(), `a claw Strike among ${(user.system.actions ?? []).map((action) => action.label).join(", ")}`, { timeout: 8000 });
        const damage = claw().item?.system?.damage;
        assert(damage?.die === "d4" && damage?.damageType === "slashing", `a slashing d4 claw (${JSON.stringify(damage)})`);
        return { damage };
    },

    // Sapling Shield (Moderate): the buckler becomes a tower shield (+2 AC, –5-foot Speed — PF2e's ItemAlteration on it); activated again,
    // a buckler again.
    async saplingShield(scene) {
        const { actor: user } = await creature(scene, "Sapling Bearer", { type: "character", x: 11, y: 1 });
        const shield = await give(user, "Sapling Shield (Moderate)");
        await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 }).catch(() => null);
        const ac = () => user.items.get(shield.id)?.system?.acBonus;
        const before = ac();
        const press = async () => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(shield.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: "the shield's card" });
            await game.modules.get(NS).api.live.apply(card.id);
        };
        await press();
        await until(() => ac() === 2 && user.items.get(shield.id)?.system?.speedPenalty === -5, `a tower shield's +2 AC and –5 Speed (now ${ac()}, ${user.items.get(shield.id)?.system?.speedPenalty})`, { timeout: 8000 });
        await press();
        await until(() => ac() === before, `back to a buckler's +${before} (now ${ac()})`, { timeout: 8000 });
        return { before, tower: 2 };
    },

    // Holy Water: PF2e's Strike; its splash card ticks only the creature beside the target with the unholy trait, which alone takes it.
    async holyWaterSplash(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Holy Thrower", { type: "character", x: 0, y: 13 });
        const { token: targetToken } = await creature(scene, "Holy Target", { x: 0, y: 15, ac: 1, alliance: "opposition" });
        const { actor: plain } = await creature(scene, "Holy Bystander", { x: 0, y: 16, alliance: "opposition" });
        const { actor: fiend } = await creature(scene, "Holy Fiend", { x: 1, y: 15, alliance: "opposition" });
        await fiend.update({ "system.traits.value": ["fiend", "unholy"] });
        const vial = await give(thrower, "Holy Water");
        await vial.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(targetToken);
        const hp = (actor) => actor.system.attributes.hp.value;
        const before = { plain: hp(plain), fiend: hp(fiend) };
        const { action, attack } = await strike(thrower, vial);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.damage({ event: shift() });
        const card = await messageAfter(since, itemCard("bomb"), { what: "the splash card" });
        const state = card.getFlag(NS, "card");
        const tick = (actor) => state.splashed.find((entry) => entry.actorUuid === actor.uuid)?.include;
        assert(tick(fiend) === true && tick(plain) === false, `the fiend ticked, the bystander not (${state.splashed.map((entry) => `${entry.name}:${entry.include}`).join(", ")})`);
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        assert(hp(fiend) < before.fiend && hp(plain) === before.plain, `only the fiend splashed: fiend ${before.fiend} → ${hp(fiend)}, bystander ${before.plain} → ${hp(plain)}`);
        return { splash: state.splash, hint: state.hint };
    },

    // Victory Plate: an ooze recalled (picked on the ways card) — resistance 10 to precision for 1 minute, as PF2e's Resistance rule.
    async victoryOoze(scene) {
        const { actor: user } = await creature(scene, "Victory Wearer", { type: "character", x: 1, y: 17 });
        const plate = await give(user, "Victory Plate");
        await plate.update({ "system.equipped.inSlot": true, "system.equipped.invested": true }).catch(() => null);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(plate.uuid, 1);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the trait picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Ooze: precision") });
        const card = await messageAfter(since, itemCard("item"), { what: "the ooze way's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const precision = () => (user.system.attributes.resistances ?? []).find((entry) => entry.type === "precision");
        await until(() => precision()?.value === 10, `resistance 10 to precision (${JSON.stringify((user.system.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]))})`, { timeout: 8000 });
        return { resistance: precision().value };
    },

    // Heartripper Blade's siphon: the ways card's "reduce" way, its item card's pick of enfeebled — enfeebled 2 → 1, clumsy untouched.
    async heartripperSiphon(scene) {
        const { actor: user } = await creature(scene, "Heartripper Wielder", { type: "character", x: 1, y: 19 });
        const blade = await give(user, "Heartripper Blade");
        await user.increaseCondition("enfeebled", { value: 2 });
        await user.increaseCondition("clumsy", { value: 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 1);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the effect picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.findIndex((name) => /^Reduce/.test(name)) });
        const card = await messageAfter(since, itemCard("item"), { what: "the reduce way's card" });
        await game.modules.get(NS).api.live.apply(card.id, { reduceChoice: 1 });
        const value = (slug) => user.getCondition(slug)?.value ?? 0;
        await until(() => value("enfeebled") === 1, `enfeebled 2 → 1 (${value("enfeebled")})`, { timeout: 8000 });
        assert(value("clumsy") === 1, `clumsy untouched (${value("clumsy")})`);
        return { ways: names, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Bloodknuckles: temporary Hit Points equal to the triggering bleed damage typed on the card (14), at most 10; none typed refuses.
    async bloodknucklesTemp(scene) {
        const { actor: user } = await creature(scene, "Bloodknuckles Brawler", { type: "character", x: 3, y: 19 });
        const knuckles = await give(user, "Bloodknuckles");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(knuckles.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the card" });
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, {}).catch((error) => { refused = error.message; });
        assert(/Type the amount/.test(refused ?? ""), `no amount refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { amount: 14 });
        await until(() => user.system.attributes.hp.temp === 10, `10 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        return { temp: user.system.attributes.hp.temp, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Spleen Bloodstone of Arazni's Break Bonds: its user's Grabbed and Restrained end.
    async breakBonds(scene) {
        const { actor: user } = await creature(scene, "Arazni Faithful", { type: "character", x: 5, y: 19 });
        const stone = await give(user, "Spleen Bloodstone of Arazni");
        await user.increaseCondition("grabbed");
        await user.increaseCondition("restrained");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(stone.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => !user.hasCondition("grabbed") && !user.hasCondition("restrained"), `grabbed and restrained ended (${user.conditions.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Dweomerveil's Dimension Leap: a space 40 feet off refused, then one 20 feet off — the token there at once.
    async dweomerLeap(scene) {
        const { actor: user, token } = await creature(scene, "Dweomer Leaper", { type: "character", x: 0, y: 2 });
        const veil = await give(user, "Dweomerveil");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(veil.uuid, 0);
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 8 * size, y: 2 * size } }).catch((error) => { refused = error.message; });
        assert(/40 feet away/.test(refused ?? ""), `40 feet refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 4 * size, y: 2 * size } });
        await until(() => token.x === 4 * size && token.y === 2 * size, `the token at (4, 2) (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Quartz-Coil Rail Transport (Lesser), a consumable: up to 20 feet — 25 feet off refused, then 20 feet off, the token there at once.
    async quartzCoil(scene) {
        await clearSquares(scene, [[0, 4], [4, 4], [5, 4]]);
        const { actor: user, token } = await creature(scene, "Coil Rider", { type: "character", x: 0, y: 4 });
        const coil = await give(user, "Quartz-Coil Rail Transport (Lesser)");
        const since = Date.now();
        await coil.consume();
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 5 * size, y: 4 * size } }).catch((error) => { refused = error.message; });
        assert(/25 feet away/.test(refused ?? ""), `25 feet refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 4 * size, y: 4 * size } });
        await until(() => token.x === 4 * size && token.y === 4 * size, `the token at (4, 4) (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Dimension Shot: a space adjacent to the creature hit (targeted) — one two squares off it refused, then one beside it, the token there.
    async dimensionShot(scene) {
        await clearSquares(scene, [[0, 6], [4, 6], [5, 6], [6, 6]]);
        const { actor: user, token } = await creature(scene, "Dimension Archer", { type: "character", x: 0, y: 6 });
        const { token: foeToken } = await creature(scene, "Dimension Mark", { x: 6, y: 6, alliance: "opposition" });
        const shot = await give(user, "Dimension Shot");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shot.uuid, 0);
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], destination: { x: 4 * size, y: 6 * size } }).catch((error) => { refused = error.message; });
        assert(refused, "two squares off the creature refused");
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], destination: { x: 5 * size, y: 6 * size } });
        await until(() => token.x === 5 * size && token.y === 6 * size, `the token beside the mark (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { refused, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Dragonclaw Scutcheon: fire picked on the ways card — immunity to fire until the end of the next turn, as PF2e's Immunity rule.
    async scutcheonImmunity(scene) {
        const { actor: user } = await creature(scene, "Scutcheon Bearer", { type: "character", x: 2, y: 2 });
        const scutcheon = await give(user, "Dragonclaw Scutcheon");
        let since = Date.now();
        await scutcheon.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the dragon type picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Fire") });
        const card = await messageAfter(since, itemCard("item"), { what: "the fire way's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const immune = () => (user.system.attributes.immunities ?? []).some((entry) => entry.type === "fire");
        await until(() => immune(), `immunity to fire (${JSON.stringify((user.system.attributes.immunities ?? []).map((entry) => entry.type))})`, { timeout: 8000 });
        return { immunities: user.system.attributes.immunities.map((entry) => entry.type) };
    },

    // Alchemists+'s Jabberwock Jar: its Confusion picked on the ways card — the ability module's DC 40 Will save card at the targeted creature,
    // Confused on a failure.
    async jabberwockConfusion(scene) {
        assert(game.modules.get("pf2e-team-plus-alchemists")?.active, "Alchemists+ isn't active in pftest.");
        const { actor: user } = await creature(scene, "Jabberwock Opener", { type: "character", x: 9, y: 2 });
        const { token: foe } = await creature(scene, "Burble Target", { x: 10, y: 2, alliance: "opposition" });
        const jar = await give(user, "Jabberwock Jar", "pf2e-team-plus-alchemists.pf2e-items");
        let since = Date.now();
        await jar.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the burble picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Confusion") });
        const card = await messageAfter(since, itemCard("expose"), { what: "the Confusion's save card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.against?.value === 40 && plan.resolution.check.statistic === "will", `a DC 40 Will save (${JSON.stringify(plan.resolution.check)})`);
        assert(plan.resolution.outcomes.failure.effects.some((effect) => effect.slug === "confused"), "Confused on a failure");
        return { ways: names };
    },

    // Hydrocannon's Tinker Shot: Slashing picked on the ways card — the readied Strike with the gun carries 1d6 persistent bleed, and PF2e's
    // damage roll on a hit has it.
    async hydrocannonBleed(scene) {
        const { actor: gunner } = await creature(scene, "Hydro Gunner", { type: "character", x: 13, y: 2 });
        const gun = await give(gunner, "Hydrocannon");
        await gun.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(gun.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the configuration picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Slashing") });
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const dice = () => gunner.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "DamageDice" && rule.damageType === "bleed");
        await until(() => dice(), "the bleed dice", { timeout: 8000 });
        assert([].concat(dice().selector ?? []).join(" ").startsWith(gun.id) && dice().category === "persistent", `the gun's own persistent bleed (${JSON.stringify(dice())})`);
        const { token: foeToken } = await creature(scene, "Hydro Target", { x: 15, y: 2, ac: 1, alliance: "opposition", hp: 300 });
        await until(() => foeToken.object, "the target drawn", { timeout: 5000 });
        await target(foeToken);
        const { action, attack } = await strike(gunner, gun);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await wait(800);
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const formula = rolled.rolls.map((roll) => roll.formula).join(" ");
        // (PF2e's formula names bleed without "persistent": "(2 * 1d6) bleed" on a critical hit.)
        assert(/\bbleed\b/.test(formula) && /\b1d6\b/.test(formula), `the hit carries the bleed (${formula})`);
        return { ways: names, formula };
    },

    // Quicksilver Cloak's Slide Through: the readied ranged Strike is silver — PF2e's AdjustStrike materials, in the hit's damage roll.
    async quicksilverShot(scene) {
        const { actor: archer } = await creature(scene, "Quicksilver Archer", { type: "character", x: 17, y: 2 });
        const cloak = await give(archer, "Quicksilver Cloak");
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Arrows");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(cloak.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const rule = () => archer.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((entry) => entry.key === "AdjustStrike" && entry.property === "materials");
        await until(() => rule(), "the silver AdjustStrike", { timeout: 8000 });
        const { token: foeToken } = await creature(scene, "Quicksilver Target", { x: 19, y: 2, ac: 1, alliance: "opposition", hp: 300 });
        await until(() => foeToken.object, "the target drawn", { timeout: 5000 });
        await target(foeToken);
        const { action, attack } = await strike(archer, bow);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        await wait(800);
        since = Date.now();
        await (outcome === "criticalSuccess" ? action.critical : action.damage)({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const materials = (rolled.rolls[0]?.instances ?? []).flatMap((instance) => [...(instance.materials ?? [])]);
        const options = rolled.flags.pf2e.context.options ?? [];
        assert(materials.includes("silver") || options.some((option) => /material:silver/.test(option)), `silver in the damage roll (${JSON.stringify(materials)}; ${options.filter((option) => /material/.test(option)).join(", ")})`);
        return { materials, outcome };
    },

    // Conflagration Club's Explosive Cone: 4 charges of fire typed and picked on the save card — the ability module's basic Reflex save card
    // at the target, its damage 4d6 fire; no amount typed refuses.
    async clubCharges(scene) {
        const { actor: user } = await creature(scene, "Club Wielder", { type: "character", x: 13, y: 4 });
        const { token: foe } = await creature(scene, "Cone Target", { x: 14, y: 4, alliance: "opposition" });
        const club = await give(user, "Conflagration Club");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(club.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the cone's save card" });
        const fire = card.getFlag(NS, "card").plan.damageChoices.findIndex((choice) => choice.label === "Fire");
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], damageChoice: fire }).catch((error) => { refused = error.message; });
        assert(/Type the amount/.test(refused ?? ""), `no amount refused (${refused})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], damageChoice: fire, scaled: 4 });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        const formula = plan.resolution.sharedDamage.components[0].formula;
        assert(formula === "4d6[fire]" && plan.resolution.check.basic && plan.resolution.check.against.value === 20, `4d6 fire, basic DC 20 Reflex (${formula}, ${JSON.stringify(plan.resolution.check)})`);
        return { formula };
    },

    // Spiral Labyrinth: the damage its user's shield blocked (12 typed) at the creature picked — the ability module's basic DC 32 Reflex save card.
    async spiralLabyrinth(scene) {
        const { actor: user } = await creature(scene, "Labyrinth Blocker", { type: "character", x: 13, y: 6 });
        const { token: foe } = await creature(scene, "Labyrinth Foe", { x: 14, y: 6, alliance: "opposition" });
        const talisman = await give(user, "Spiral Labyrinth");
        let since = Date.now();
        await talisman.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the talisman's save card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], scaled: 12 });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        const formula = plan.resolution.sharedDamage.components[0].formula;
        assert(formula === "12[untyped]" && plan.resolution.check.basic && plan.resolution.check.against.value === 32, `12 damage, basic DC 32 Reflex (${formula}, ${JSON.stringify(plan.resolution.check)})`);
        return { formula };
    },

    // Azarim's first activation: the creature carrying it targeted — the ability module's DC 23 Fortitude save card, Enfeebled 2 on a failure.
    async azarimEnfeeble(scene) {
        const { actor: user } = await creature(scene, "Azarim Holder", { type: "character", x: 13, y: 8 });
        const { token: carrier } = await creature(scene, "Azarim Carrier", { x: 14, y: 8 });
        const azarim = await give(user, "Azarim");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(azarim.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "Azarim's save card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [carrier.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        const failed = plan.resolution.outcomes.failure.effects.map((effect) => `${effect.slug} ${effect.value}`);
        assert(plan.resolution.check.statistic === "fortitude" && plan.resolution.check.against.value === 23 && failed.includes("enfeebled 2"), `DC 23 Fortitude, Enfeebled 2 on a failure (${JSON.stringify(plan.resolution.check)}, ${failed.join(", ")})`);
        return { failed };
    },

    // Save cards from rewords: Rusting Carapace (8d6 at a basic DC 24 Fortitude save, 2d6 persistent on a failure), Last Hope (3 typed: 3d10
    // vitality at the undead, basic DC 37 Fortitude), Briar's tenth activation (DC 50 Fortitude, Stunned 1, Stunned 3 on a critical failure).
    async rewordSaves(scene) {
        const { actor: user } = await creature(scene, "Reword Saver", { type: "character", x: 13, y: 10 });
        const { token: foe } = await creature(scene, "Reword Foe", { x: 14, y: 10, alliance: "opposition" });
        const saveFor = async (name, index, choices = {}) => {
            const item = await give(user, name);
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, index);
            const card = await messageAfter(since, itemCard("expose"), { what: `${name}'s save card` });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], ...choices });
            const save = await messageAfter(since, abilitySaveCard, { what: `the ability module's save card for ${name}` });
            return save.flags["pf2e-automatic-ability-resolution"].card.plan;
        };
        const rust = await saveFor("Rusting Carapace", 0);
        const persistent = rust.resolution.outcomes.failure.damage.formulas?.[0]?.formula;
        assert(rust.resolution.sharedDamage.components[0].formula === "8d6[untyped]" && rust.resolution.check.basic && rust.resolution.check.against.value === 24 && persistent === "2d6[persistent,untyped]", `8d6, basic DC 24, 2d6 persistent on a failure (${JSON.stringify(rust.resolution.check)}, ${persistent})`);
        const hope = await saveFor("Last Hope", 0, { scaled: 3 });
        assert(hope.resolution.sharedDamage.components[0].formula === "3d10[vitality]" && hope.resolution.check.against.value === 37, `3d10 vitality, DC 37 (${hope.resolution.sharedDamage.components[0].formula})`);
        const briar = await saveFor("Briar", 9);
        const rows = ["failure", "criticalFailure"].map((degree) => briar.resolution.outcomes[degree].effects.map((effect) => `${effect.slug} ${effect.value}`).join());
        assert(briar.resolution.check.against.value === 50 && rows[0] === "stunned 1" && rows[1] === "stunned 3", `DC 50, Stunned 1 and 3 (${rows.join(" / ")})`);
        return { persistent, hope: hope.resolution.sharedDamage.components[0].formula, rows };
    },

    // Pact of the Herald and Host's Breath of the Dragon: Reflex picked on the ways card, fire on the save card — a basic Reflex save card at
    // the target, at its user's spell DC, its damage 1d6 per level (3d6 at 3rd level).
    async benefactorBreath(scene) {
        const { actor: user } = await creature(scene, "Pact Breather", { type: "character", x: 16, y: 4 });
        const { token: foe } = await creature(scene, "Breath Foe", { x: 17, y: 4, alliance: "opposition" });
        await user.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Arcane Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "innate" }, ability: { value: "cha" }, proficiency: { value: 1 } } }]);
        const pact = await give(user, "Pact of the Herald and Host");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(pact.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the save picker" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf("Reflex") });
        const card = await messageAfter(since, itemCard("expose"), { what: "the breath's save card" });
        const choices = card.getFlag(NS, "card").plan.damageChoices;
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foe.uuid], damageChoice: choices.findIndex((choice) => choice.label === "Fire") });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        const formula = plan.resolution.sharedDamage.components[0].formula;
        assert(/^(?:3|\(3\)|\(@actor\.level\))d6\[fire\]$/.test(formula) && plan.resolution.check.statistic === "reflex" && plan.resolution.check.basic, `1d6 per level fire, a basic Reflex save (${formula}, ${JSON.stringify(plan.resolution.check)})`);
        return { formula, against: plan.resolution.check.against };
    },

    // Animal-Turning Fulu after a Strike at its user: the reroll card's degree of that attack roll again against the user's AC + 2 item.
    async fuluAC(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Fulu Bearer", { type: "character", x: 18, y: 6 });
        const { actor: wolf, token: wolfToken } = await creature(scene, "Fulu Wolf", { type: "character", x: 19, y: 6 });
        const fang = await give(wolf, "Shortsword");
        await fang.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await wolfToken.object?.control?.();
        await target(userToken);
        const { attack } = await strike(wolf, fang);
        const total = Number(attack.rolls[0].total);
        const ac = Number(attack.flags.pf2e.context.dc?.value);
        const fulu = await give(user, "Animal-Turning Fulu");
        const since = Date.now();
        await fulu.consume();
        const card = await messageAfter(since, itemCard("reroll"), { what: "the reroll card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await wait(800);
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => line.includes(`attack roll (${total}) against PFTEST ITEM Fulu Bearer's AC ${ac} + 2 item = ${ac + 2}`)), `the attack's degree again at AC ${ac} + 2 (${JSON.stringify(results)})`);
        return { total, ac, results };
    },

    // Madcap Top's table, a 2 rolled: its row's cast card — Slow at DC 27, the spell module's.
    async madcapTable(scene) {
        const { actor: user } = await creature(scene, "Top Spinner", { type: "character", x: 16, y: 8 });
        const top = await give(user, "Madcap Top");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(top.uuid, 0);
        const card = await messageAfter(since, itemCard("table"), { what: "the table card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { total: 2 });
        const cast = await messageAfter(since, itemCard("cast"), { what: "the row's cast card" });
        const plan = cast.getFlag(NS, "card").plan;
        assert(plan.spell?.name === "Slow" && plan.dc === 27, `Slow at DC 27 (${plan.spell?.name}, ${plan.dc})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Rod of Wonder: its card draws from PF2e's Rod of Wonder RollTable; the row drawn gets its own card, or its words for the GM.
    async rodOfWonder(scene) {
        const { actor: user } = await creature(scene, "Rod Waver", { type: "character", x: 16, y: 10 });
        const rod = await give(user, "Rod of Wonder");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(rod.uuid, 0);
        const card = await messageAfter(since, itemCard("table"), { what: "the table card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, {});
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the draw applied", { timeout: 8000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(/^Drawn: \S/.test(results[0] ?? "") && /Its card follows|The GM resolves it/.test(results[1] ?? ""), `a row drawn (${JSON.stringify(results)})`);
        if (/Its card follows/.test(results[1])) await messageAfter(since, (message) => Boolean(message.getFlag(NS, "card")) && message.id !== card.id, { what: "the row's card" });
        return { results };
    },

    // Silhouette Cloak's reaction: resistance 20 to all damage except force and ghost touch, doubled against non-magical, on its wearer.
    async silhouetteFold(scene) {
        const { actor: user } = await creature(scene, "Silhouette Wearer", { type: "character", x: 18, y: 10 });
        const cloak = await give(user, "Silhouette Cloak");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(cloak.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const resist = () => (user.system.attributes.resistances ?? []).find((entry) => entry.type === "all-damage");
        await until(() => resist()?.value === 20, `resistance 20 to all damage (${JSON.stringify((user.system.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]))})`, { timeout: 8000 });
        const entry = resist();
        assert([...(entry.exceptions ?? [])].includes("force") && [...(entry.doubleVs ?? [])].includes("non-magical"), `force excepted, double against non-magical (${JSON.stringify({ exceptions: entry.exceptions, doubleVs: entry.doubleVs })})`);
        return { exceptions: [...entry.exceptions], doubleVs: [...entry.doubleVs] };
    },

    // Verdant Branch: its 1d4 fruit in its user's inventory; one eaten is the module's heal card, 2d6+5 Hit Points.
    async verdantFruit(scene) {
        const { actor: user } = await creature(scene, "Branch Bearer", { type: "character", x: 18, y: 12 });
        const branch = await give(user, "Verdant Branch");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(branch.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the branch's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const fruit = () => user.items.find((entry) => entry.name === "Verdant Branch Fruit");
        await until(() => fruit(), "the fruit in the inventory", { timeout: 8000 });
        const count = fruit().quantity;
        assert(count >= 1 && count <= 4, `1d4 fruit (${count})`);
        since = Date.now();
        await fruit().consume();
        const eat = await messageAfter(since, itemCard("item"), { what: "the fruit's card" });
        const healing = eat.getFlag(NS, "card").plan.resolution.native?.healing?.components?.[0]?.formula;
        assert(healing === "2d6+5", `2d6+5 healing (${healing})`);
        return { count, healing };
    },

    // Coins and a robe after the roll: Lucky Silver flips its coin, then rerolls the failed save or does nothing; Fortune's Coin flips, then
    // counts the failed check's die as a 12 or does nothing; Robe of the Archmagi (Greater) turns the targeted ally's failed save into a success.
    async coinFlips(scene) {
        const { actor: hero } = await creature(scene, "Coin Flipper", { type: "character", x: 18, y: 14 });
        const { actor: ally, token: allyToken } = await creature(scene, "Robe Ally", { type: "character", x: 19, y: 14 });
        const results = {};
        const use = async (name, rolling, choices = {}) => {
            await rolling();
            await wait(600);
            const item = await give(hero, name);
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("reroll"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [], ...choices });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", `${name} applied`, { timeout: 8000 });
            return game.messages.get(card.id).getFlag(NS, "card").results;
        };
        results.silver = await use("Lucky Silver", () => hero.saves.reflex.roll({ skipDialog: true, dc: { value: 60 } }));
        assert(/nothing happens|Rerolled/.test(results.silver.join(" ")), `the coin, then a reroll or nothing (${JSON.stringify(results.silver)})`);
        results.coin = await use("Fortune's Coin", () => hero.perception.roll({ skipDialog: true, dc: { value: 60 } }));
        assert(/nothing happens|a 12 on the die/.test(results.coin.join(" ")), `the coin, then a 12 or nothing (${JSON.stringify(results.coin)})`);
        results.robe = await use("Robe of the Archmagi (Greater)", () => ally.saves.will.roll({ skipDialog: true, dc: { value: 60 } }), { targets: [allyToken.uuid] });
        assert(results.robe.some((line) => line.startsWith("PFTEST ITEM Robe Ally's roll") && /becomes a success/.test(line)), `the ally's failed save a success (${JSON.stringify(results.robe)})`);
        return results;
    },

    // The Demon's Lantern after a Strike at its user: its user's Reflex save against that attack roll; higher, the attacker is Dazzled.
    async lanternFlash(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Lantern Bearer", { type: "character", x: 18, y: 16 });
        const { actor: brute, token: bruteToken } = await creature(scene, "Lantern Brute", { type: "character", x: 19, y: 16 });
        const club = await give(brute, "Shortsword");
        await club.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await bruteToken.object?.control?.();
        await target(userToken);
        const { attack } = await strike(brute, club);
        const total = Number(attack.rolls[0].total);
        const lantern = await give(user, "The Demon's Lantern");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(lantern.uuid, 0);
        const card = await messageAfter(since, itemCard("reroll"), { what: "the lantern's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the save rolled", { timeout: 8000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        const said = new RegExp(`^PFTEST ITEM Lantern Bearer's Reflex save (\\d+) against PFTEST ITEM Lantern Brute's attack roll ${total}: (higher|not higher)`).exec(results[0] ?? "");
        assert(said, `the save against the attack's ${total} (${JSON.stringify(results)})`);
        const misses = said[2] === "higher";
        assert(misses === Number(said[1]) > total, `higher only when the save beats ${total} (${said[1]})`);
        await wait(600);
        assert(brute.hasCondition("dazzled") === misses, `the brute dazzled only on a miss (${misses}, ${brute.hasCondition("dazzled")})`);
        return { total, save: Number(said[1]), misses, results };
    },

    // The attack and save rolls the reroll card plays without "reroll": Scapular of Shields (a critical hit at AC 1 a hit), Phantom Fang (its
    // DC 5 flat check, the attack a hit), Keep Stone Amulet (the caster's Ray of Frost rerolled, the lower kept), Extra Lung (a new save).
    async attackRerolls(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Reroll Bearer", { x: 18, y: 18, ac: 1 });
        const { actor: brute, token: bruteToken } = await creature(scene, "Reroll Brute", { type: "character", x: 19, y: 18 });
        const blade = await give(brute, "Shortsword");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await bruteToken.object?.control?.();
        await target(userToken);
        const use = async (name, choices = {}) => {
            const item = await give(user, name);
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("reroll"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [], ...choices });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", `${name} applied`, { timeout: 8000 });
            return game.messages.get(card.id).getFlag(NS, "card").results;
        };
        const results = {};
        let { attack } = await strike(brute, blade);
        const outcome = attack.flags.pf2e.context.outcome;
        results.scapular = await use("Scapular of Shields");
        assert(outcome !== "criticalSuccess" || results.scapular[0] === `PFTEST ITEM Reroll Brute's attack roll (${attack.rolls[0].total}): a critical success becomes a success.`, `the critical hit a hit (${outcome}: ${JSON.stringify(results.scapular)})`);
        ({ attack } = await strike(brute, blade));
        results.fang = await use("Phantom Fang");
        // (A natural 1 misses even AC 1: then no flat check.)
        const missed = ["failure", "criticalFailure"].includes(attack.flags.pf2e.context.outcome);
        assert(missed ? /attack already missed .*: no flat check\.$/.test(results.fang[0] ?? "") : /^Flat check \d+ against DC 5: (?:PFTEST ITEM Reroll Brute's attack still hits|failed — PFTEST ITEM Reroll Brute's attack misses)/.test(results.fang[0] ?? ""), `the flat check against the hit (${JSON.stringify(results.fang)})`);
        // (Ray of Frost, the brute's innate spell, at the bearer: its spell attack rerolled, the lower kept.)
        const [entry] = await brute.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Innate`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "innate" }, ability: { value: "cha" } } }]);
        const spells = game.packs.get("pf2e.spells-srd");
        const ray = (await spells.getDocument((await spells.getIndex()).find((row) => row.name === "Ray of Frost")._id)).toObject();
        delete ray._id;
        const [spell] = await brute.createEmbeddedDocuments("Item", [{ ...ray, system: { ...ray.system, location: { value: entry.id } } }]);
        let since = Date.now();
        await spell.rollAttack(shift());
        await messageAfter(since, (message) => (message.flags?.pf2e?.context?.domains ?? []).includes("spell-attack-roll"), { what: "the spell attack roll" });
        since = Date.now();
        results.amulet = await use("Keep Stone Amulet");
        assert(results.amulet[0] === "Rerolled PFTEST ITEM Reroll Brute's attack roll, keeping the lower result.", `the spell attack rerolled (${JSON.stringify(results.amulet)})`);
        await messageAfter(since, (message) => (message.flags?.pf2e?.context?.domains ?? []).includes("spell-attack-roll") && message.flags.pf2e.context.isReroll, { what: "PF2e's reroll of the spell attack" });
        await user.saves.fortitude.roll({ skipDialog: true, dc: { value: 20 } });
        await wait(600);
        since = Date.now();
        results.lung = await use("Extra Lung");
        assert(results.lung[0] === "Rerolled PFTEST ITEM Reroll Bearer's saving throw.", `the save rerolled (${JSON.stringify(results.lung)})`);
        await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "saving-throw" && message.flags.pf2e.context.isReroll, { what: "PF2e's reroll of the save" });
        return { outcome, results };
    },

    // Bloodstained Waistcoat's Staunch Bleeding: the ally targeted's 2d6 persistent bleed ends, and its user takes on the same condition.
    async waistcoatBleed(scene) {
        const { actor: user } = await creature(scene, "Waistcoat Wearer", { type: "character", x: 18, y: 24 });
        const { actor: ally, token: allyToken } = await creature(scene, "Bleeding Ally", { type: "character", x: 19, y: 24 });
        const bleed = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject();
        bleed.system.persistent = { formula: "2d6", damageType: "bleed", dc: 15 };
        await ally.createEmbeddedDocuments("Item", [bleed]);
        const waistcoat = await give(user, "Bloodstained Waistcoat");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(waistcoat.uuid, 0);
        const card = await messageAfter(since, itemCard("take"), { what: "the waistcoat's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the bleed taken", { timeout: 8000 });
        const bleeding = (actor) => actor.itemTypes.condition.find((entry) => entry.system.slug === "persistent-damage" && entry.system.persistent?.damageType === "bleed");
        assert(!bleeding(ally), "the ally's bleed ended");
        assert(bleeding(user)?.system.persistent.formula === "2d6", `the wearer bleeding 2d6 (${bleeding(user)?.system.persistent?.formula})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Eye of Fortune: its user's flat check against the creature their latest Strike targeted, rolled twice (PF2e doesn't roll it) — DC 5 while
    // it's Concealed, DC 11 once it's Hidden.
    async eyeOfFortune(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Fortune Eye", { type: "character", x: 18, y: 22 });
        const { actor: foe, token: foeToken } = await creature(scene, "Fortune Mark", { x: 19, y: 22, ac: 1 });
        const eye = await give(user, "Eye of Fortune");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        const results = {};
        for (const [condition, dc] of [["concealed", 5], ["hidden", 11]]) {
            await foe.increaseCondition(condition);
            await userToken.object?.control?.();
            await target(foeToken);
            let since = Date.now();
            await user.system.actions[0].variants[0].roll({ event: shift() });
            await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "attack-roll", { what: "the Strike" });
            since = Date.now();
            await game.modules.get(NS).api.live.activate(eye.uuid, 0);
            const card = await messageAfter(since, itemCard("reroll"), { what: "Eye of Fortune's card" });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the flat check rolled", { timeout: 8000 });
            results[condition] = game.messages.get(card.id).getFlag(NS, "card").results;
            assert(new RegExp(`^Flat check \\d+ and \\d+, the higher \\d+ against DC ${dc}: `).test(results[condition][0] ?? ""), `two dice against DC ${dc} (${JSON.stringify(results[condition])})`);
        }
        return results;
    },

    // Degrees changed on another creature's roll: Crimson Bluff's Swap Places (the brute's critical hit at AC 1 a hit), Golden Greaves (the
    // brute's Shove at its user one degree down to a critical failure, when it failed), Tome of Dripping Shadows (the creature targeted's
    // critically failed save a failure); and The Lost's on its user's own failed save.
    async otherDegrees(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Degree Bearer", { x: 18, y: 20, ac: 1, save: 12 });
        const { actor: brute, token: bruteToken } = await creature(scene, "Degree Brute", { type: "character", x: 19, y: 20 });
        const { actor: foe, token: foeToken } = await creature(scene, "Degree Foe", { x: 20, y: 20, save: 0 });
        const blade = await give(brute, "Shortsword");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await bruteToken.object?.control?.();
        await target(userToken);
        const use = async (name, index, choices = {}) => {
            const item = await give(user, name);
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, index);
            const card = await messageAfter(since, itemCard("reroll"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [], ...choices });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", `${name} applied`, { timeout: 8000 });
            return game.messages.get(card.id).getFlag(NS, "card").results;
        };
        const results = {};
        const { attack } = await strike(brute, blade);
        const outcome = attack.flags.pf2e.context.outcome;
        results.bluff = await use("Crimson Bluff", 1);
        const after = { criticalSuccess: "becomes a success.", success: "becomes a failure.", failure: "becomes a critical failure.", criticalFailure: "a critical failure, nothing to change." }[outcome];
        assert(results.bluff[0]?.startsWith(`PFTEST ITEM Degree Brute's attack roll (${attack.rolls[0].total}):`) && results.bluff[0].endsWith(after), `one degree worse than ${outcome} (${JSON.stringify(results.bluff)})`);
        let since = Date.now();
        await game.pf2e.actions.get("shove").use({ actors: [brute], event: shift() });
        const shove = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check" && message.flags.pf2e.context.target?.actor === user.uuid, { what: "the Shove at the bearer" });
        results.greaves = await use("Golden Greaves", 0);
        const shoved = shove.flags.pf2e.context.outcome;
        assert(results.greaves[0]?.startsWith("PFTEST ITEM Degree Brute's check (") && results.greaves[0].endsWith(shoved === "failure" ? "a failure becomes a critical failure." : `${{ criticalSuccess: "a critical success", success: "a success", criticalFailure: "a critical failure" }[shoved]}, nothing to change.`), `a failed Shove a critical failure (${shoved}: ${JSON.stringify(results.greaves)})`);
        await foe.saves.reflex.roll({ skipDialog: true, dc: { value: 60 } });
        await wait(600);
        results.tome = await use("Tome of Dripping Shadows", 0, { targets: [foeToken.uuid] });
        assert(results.tome[0]?.startsWith("PFTEST ITEM Degree Foe's roll (") && results.tome[0].endsWith("a critical failure becomes a failure."), `the foe's critical failure a failure (${JSON.stringify(results.tome)})`);
        // (The Lost: its user's own failed save one degree better.)
        await user.saves.will.roll({ skipDialog: true, dc: { value: 60 } });
        await wait(600);
        results.lost = await use("The Lost", 0);
        assert(/^PFTEST ITEM Degree Bearer's roll \(\d+\): (?:a critical failure becomes a failure|a failure becomes a success)\.$/.test(results.lost[0] ?? ""), `the failed save one degree better (${JSON.stringify(results.lost)})`);
        return { outcome, shoved, results };
    },

    // Mythic Point costs (the user's answer of 2026-10-19): Chromatic Robe's Align Energy spends its user's Mythic Point once its card applies,
    // and refuses with none left (a mythic NPC: PF2e gives characters Mythic Points only in a mythic campaign); under the world setting, a
    // character's Hero Point instead.
    async mythicCost(scene) {
        const { actor: user } = await creature(scene, "Mythic Wearer", { x: 20, y: 2 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 1 });
        const mythic = () => user.system.resources.mythicPoints.value;
        assert(mythic() === 1, `one Mythic Point to start (${mythic()}; max ${user.system.resources.mythicPoints.max})`);
        const use = async (actor) => {
            const robe = actor.itemTypes.equipment.find((entry) => entry.name === "Chromatic Robe") ?? (await give(actor, "Chromatic Robe"));
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(robe.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: "the robe's card" });
            let refused = null;
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, resistType: 0 }).catch((error) => { refused = error.message; });
            return { card, refused };
        };
        const first = await use(user);
        assert(!first.refused && mythic() === 0, `the Mythic Point spent (${first.refused}; ${mythic()} left)`);
        const second = await use(user);
        assert(/has no Mythic Point to spend/.test(second.refused ?? ""), `refused with none left (${second.refused})`);
        assert(game.messages.get(second.card.id).getFlag(NS, "card").status === "open", "the refused card still open");
        const { actor: hero } = await creature(scene, "Hero Wearer", { type: "character", x: 21, y: 2 });
        await hero.update({ "system.resources.heroPoints.value": 1 });
        const SETTING = "heroPointsForMythic";
        await game.settings.set(NS, SETTING, true);
        try {
            const paid = await use(hero);
            assert(!paid.refused && hero.system.resources.heroPoints.value === 0, `a Hero Point spent instead (${paid.refused}; ${hero.system.resources.heroPoints.value} left)`);
            const again = await use(hero);
            assert(/has no Hero Point to spend/.test(again.refused ?? ""), `refused with no Hero Point (${again.refused})`);
        } finally {
            await game.settings.set(NS, SETTING, false);
        }
        return { mythic: mythic(), hero: hero.system.resources.heroPoints.value };
    },

    // A Mythic Point spent for more (the user's answer of 2026-10-19): One Day's Breath's two buttons — as it is, 24 hours and no point; spending
    // one, 7 days and the point gone (a mythic NPC's).
    async mythicUpgrade(scene) {
        const { actor: user } = await creature(scene, "Breath Drinker", { x: 20, y: 6 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 1 });
        const mythic = () => user.system.resources.mythicPoints.value;
        const drink = async (way) => {
            const potion = await give(user, "One Day's Breath");
            let since = Date.now();
            await potion.consume();
            const ways = await messageAfter(since, itemCard("ways"), { what: "the breath's buttons" });
            const names = ways.getFlag(NS, "card").plan.ways.map((entry) => entry.name);
            assert(names.join(",") === "As it is,Spending a Mythic Point", `its buttons (${names})`);
            since = Date.now();
            await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf(way) });
            const card = await messageAfter(since, itemCard("item"), { what: `the ${way} card` });
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
            await wait(800);
        };
        const lasting = () => user.itemTypes.effect.filter((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw"))).map((effect) => `${effect.system.duration.value} ${effect.system.duration.unit}`);
        await drink("As it is");
        assert(lasting().includes("24 hours") && mythic() === 1, `24 hours, no point spent (${lasting()}; ${mythic()})`);
        await drink("Spending a Mythic Point");
        assert(lasting().includes("7 days") && mythic() === 0, `7 days, the point spent (${lasting()}; ${mythic()})`);
        return { lasting: lasting(), mythic: mythic() };
    },

    // Hollow Robes' Hollow Target: its user's persistent fire and bleed ended outright, for a Mythic Point (a mythic NPC's).
    async hollowTarget(scene) {
        const { actor: user } = await creature(scene, "Hollow Wearer", { x: 20, y: 10 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 1 });
        const persistent = (formula, damageType) => { const source = game.pf2e.ConditionManager.getCondition("persistent-damage").toObject(); source.system.persistent = { formula, damageType, dc: 15 }; return source; };
        await user.createEmbeddedDocuments("Item", [persistent("1d6", "fire"), persistent("2", "bleed")]);
        const robes = await give(user, "Hollow Robes");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(robes.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the robes' card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => !user.itemTypes.condition.some((entry) => entry.slug === "persistent-damage"), "the persistent damage ended", { timeout: 8000 });
        assert(user.system.resources.mythicPoints.value === 0, `the Mythic Point spent (${user.system.resources.mythicPoints.value})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Skeletal Claw: the undead targeted gets 10 temporary Hit Points (the ability module's card, its automatic row).
    async skeletalClaw(scene) {
        const { actor: user } = await creature(scene, "Claw Caster", { type: "character", x: 20, y: 12 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Claw Skeleton", { x: 21, y: 12 });
        const claw = await give(user, "Skeletal Claw");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(claw.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the claw's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [undeadToken.uuid] });
        const ability = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        await applyAbilityCard(ability);
        await until(() => undead.system.attributes.hp.temp === 10, `10 temporary Hit Points (${undead.system.attributes.hp.temp})`, { timeout: 8000 });
        return { temp: undead.system.attributes.hp.temp };
    },

    // Whispering Veil's Spire Power: a Mythic Point gained (a mythic NPC's, from 1 to 2); a character under the Hero Points setting gains a Hero Point.
    async spirePower(scene) {
        const { actor: user } = await creature(scene, "Veil Wearer", { x: 20, y: 14 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 1 });
        const gain = async (actor) => {
            const veil = actor.itemTypes.equipment.find((entry) => entry.name === "Whispering Veil") ?? (await give(actor, "Whispering Veil"));
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(veil.uuid, 0);
            const card = await messageAfter(since, itemCard("focus"), { what: "the veil's card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the point gained", { timeout: 8000 });
            return game.messages.get(card.id).getFlag(NS, "card").results;
        };
        const mythic = await gain(user);
        assert(user.system.resources.mythicPoints.value === 2 && /gains 1 Mythic Point \(2 of 3\)/.test(mythic[0] ?? ""), `a Mythic Point gained (${JSON.stringify(mythic)})`);
        const { actor: hero } = await creature(scene, "Veil Hero", { type: "character", x: 21, y: 14 });
        await hero.update({ "system.resources.heroPoints.value": 1 });
        await game.settings.set(NS, "heroPointsForMythic", true);
        try {
            const heroic = await gain(hero);
            assert(hero.system.resources.heroPoints.value === 2 && /gains 1 Hero Point/.test(heroic[0] ?? ""), `a Hero Point gained (${JSON.stringify(heroic)})`);
        } finally {
            await game.settings.set(NS, "heroPointsForMythic", false);
        }
        return { mythic: user.system.resources.mythicPoints.value, hero: hero.system.resources.heroPoints.value };
    },

    // Mask of Mercy: its user's latest roll of Hit Points (here a Strike's damage roll, the same message kind) rolled again, the higher kept.
    async maskOfMercy(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Mercy Healer", { type: "character", x: 20, y: 16 });
        const { token: dummy } = await creature(scene, "Mercy Dummy", { x: 21, y: 16, ac: 1 });
        const sword = await give(user, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await userToken.object?.control?.();
        await target(dummy);
        const struck = await strike(user, sword);
        let since = Date.now();
        await struck.action.damage({ event: shift() });
        await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the roll" });
        const mask = await give(user, "Mask of Mercy");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(mask.uuid, 0);
        const card = await messageAfter(since, itemCard("reroll"), { what: "the mask's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the roll again", { timeout: 8000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(/healing rerolled: \d+, (?:higher than|not higher than) \d+/.test(results[0] ?? ""), `rolled again, the higher kept (${JSON.stringify(results)})`);
        return { results };
    },

    // Narrow bonuses on PF2e's roll options: Elixir of the Peaks (Lesser)'s +1 item to Athletics for Climb, High Jump and Long Jump; Potion of
    // Disguise (Lesser)'s +4 status Deception DC; Healing Vapor (Lesser)'s +1 item to saves against diseases and poisons for both creatures targeted.
    async narrowBonuses(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Bonus Drinker", { type: "character", x: 20, y: 18 });
        const { actor: ally, token: allyToken } = await creature(scene, "Bonus Ally", { type: "character", x: 21, y: 18 });
        const ruled = (actor, test) => actor.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && test(rule)));
        const drink = async (name, choices) => {
            const potion = await give(user, name);
            const since = Date.now();
            await potion.consume();
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, choices);
            await wait(800);
        };
        await drink("Elixir of the Peaks (Lesser)", { drinker: 0 });
        assert(ruled(user, (rule) => [].concat(rule.selector).includes("athletics") && rule.value === 1 && JSON.stringify(rule.predicate ?? []).includes("action:climb")), "+1 item to Athletics to Climb");
        await drink("Potion of Disguise (Lesser)", { drinker: 0 });
        assert(ruled(user, (rule) => [].concat(rule.selector).includes("deception-dc") && rule.value === 4 && rule.type === "status"), "+4 status Deception DC");
        await drink("Healing Vapor (Lesser)", { targets: [userToken.uuid, allyToken.uuid] });
        const vapor = (actor) => ruled(actor, (rule) => [].concat(rule.selector).includes("saving-throw") && rule.value === 1 && JSON.stringify(rule.predicate ?? []).includes("item:trait:disease"));
        await until(() => vapor(user) && vapor(ally), "+1 item to saves against diseases and poisons for both", { timeout: 8000 });
        return { ok: true };
    },

    // The Mythic runes' cards: Mythic Resilient's two buttons (any other effect: a critical failure a success), Mythic Armor Potency's (a
    // non-mythic creature's critical hit a failure, when it was one), Mythic Weapon Potency's reroll at mythic proficiency, Mythic Striking's damage
    // reroll — each spending a point (a character's Hero Point here, under the world setting).
    async mythicRunes(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Mythic Rune Bearer", { type: "character", x: 20, y: 4, level: 12 });
        const { actor: brute, token: bruteToken } = await creature(scene, "Mythic Brute", { type: "character", x: 21, y: 4 });
        const { token: dummyToken } = await creature(scene, "Mythic Dummy", { x: 22, y: 4, ac: 1 });
        // (A character: its Hero Points pay, under the world setting.)
        await user.update({ "system.resources.heroPoints.value": 3 });
        const mythic = () => user.system.resources.heroPoints.value;
        await game.settings.set(NS, "heroPointsForMythic", true);
        const results = {};
        try {
        const viaWays = async (name, way, choices = {}) => {
            const item = await give(user, name);
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const ways = await messageAfter(since, itemCard("ways"), { what: `${name}'s buttons` });
            const names = ways.getFlag(NS, "card").plan.ways.map((entry) => entry.name);
            since = Date.now();
            await game.modules.get(NS).api.live.apply(ways.id, { choice: names.indexOf(way) });
            const card = await messageAfter(since, itemCard("reroll"), { what: `${name}'s ${way} card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [], ...choices });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", `${name} applied`, { timeout: 8000 });
            return game.messages.get(card.id).getFlag(NS, "card").results;
        };
        await user.saves.reflex.roll({ skipDialog: true, dc: { value: 70 } });
        await wait(600);
        results.resilient = await viaWays("Mythic Resilient", "Against any other effect");
        assert(/a critical failure becomes a success\.$/.test(results.resilient[0] ?? "") && mythic() === 2, `the critical failure a success, a point spent (${JSON.stringify(results.resilient)}; ${mythic()})`);
        const blade = await give(brute, "Shortsword");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await bruteToken.object?.control?.();
        await target(userToken);
        const { attack } = await strike(brute, blade);
        results.armor = await viaWays("Mythic Armor Potency", "Any other creature's Strike");
        const outcome = attack.flags.pf2e.context.outcome;
        assert(outcome !== "criticalSuccess" || /a critical success becomes a failure\.$/.test(results.armor[0] ?? ""), `a non-mythic critical hit a failure (${outcome}: ${JSON.stringify(results.armor)})`);
        assert(mythic() === 1, `a second point spent (${mythic()})`);
        // (The bearer's own Strike at the dummy: its attack rerolled at mythic proficiency, then its damage rerolled.)
        const sword = await give(user, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await userToken.object?.control?.();
        await target(dummyToken);
        const struck = await strike(user, sword);
        const potency = await give(user, "Mythic Weapon Potency");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(potency.uuid, 0);
        let card = await messageAfter(since, itemCard("reroll"), { what: "Mythic Weapon Potency's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the mythic reroll", { timeout: 8000 });
        results.potency = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(/mythic proficiency over the roll's \d+/.test(results.potency[0] ?? "") && mythic() === 0, `rerolled at mythic proficiency, the last point spent (${JSON.stringify(results.potency)}; ${mythic()})`);
        await user.update({ "system.resources.heroPoints.value": 1 });
        since = Date.now();
        await struck.action.damage({ event: shift() });
        await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const striking = await give(user, "Mythic Striking");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(striking.uuid, 0);
        card = await messageAfter(since, itemCard("reroll"), { what: "Mythic Striking's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "the damage reroll", { timeout: 8000 });
        results.striking = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(/damage rerolled: \d+, (?:higher than|not higher than) \d+/.test(results.striking[0] ?? "") && mythic() === 0, `the damage rerolled, a point spent (${JSON.stringify(results.striking)}; ${mythic()})`);
        } finally {
            await game.settings.set(NS, "heroPointsForMythic", false);
        }
        return results;
    },

    // Fossil Fragment (Petrified Wood): its awakened tree, found by name in the compendiums, as the ability module's conjured token.
    async fossilTree(scene) {
        const { actor: owner, token: ownerToken } = await creature(scene, "Fossil Owner", { type: "character", x: 13, y: 1 });
        const fossil = await give(owner, "Fossil Fragment (Petrified Wood)");
        await until(() => ownerToken.object, "the token drawn", { timeout: 5000 });
        const ABILITY = "pf2e-automatic-ability-resolution";
        const made = () => scene.tokens.filter((token) => token.actor?.flags?.[ABILITY]?.conjured?.itemUuid === fossil.uuid);
        try {
            await game.modules.get(NS).api.live.activate(fossil.uuid, 0);
            await until(() => made().length === 1, "the tree's token", { timeout: 10000 });
            const tree = made()[0].actor;
            assert(/Awakened Tree/i.test(tree.name) && tree.system.traits.value.includes("construct"), `an awakened tree, now a construct (${tree.name}: ${tree.system.traits.value.join(", ")})`);
            return { tree: tree.name };
        } finally {
            for (const token of made()) {
                const base = game.actors.get(token.actorId);
                await token.delete().catch(() => null);
                if (base?.flags?.[ABILITY]?.conjured) await base.delete().catch(() => null);
            }
        }
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
    if (scene) {
        const id = scene.id;
        await scene.delete();
        // (Its canvas gone before a next run's lab is made: else the view leaving it landed after the new lab was drawn.)
        for (const stop = Date.now() + 5000; Date.now() < stop && canvas.scene?.id === id; ) await wait(100);
        await wait(1000);
    }
    return { actors: actors.length, messages: messages.length, combats: combats.length, scene: Boolean(scene) };
}
