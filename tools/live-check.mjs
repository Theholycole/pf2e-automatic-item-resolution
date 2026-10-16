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
        const arrow = await give(archer, "Roc-Shaft Arrow (Lesser)");
        let since = Date.now();
        await arrow.consume();
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(archer, bow);
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
