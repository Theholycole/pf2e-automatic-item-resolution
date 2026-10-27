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
// (Any of them a test token covers, a larger creature's too.)
async function clearSquares(scene, squares) {
    const size = canvas.grid.size;
    const covers = (token, [x, y]) => token.x < (x + 1) * size && token.x + (Number(token.width) || 1) * size > x * size && token.y < (y + 1) * size && token.y + (Number(token.height) || 1) * size > y * size;
    const ids = scene.tokens.filter((token) => String(token.name ?? token.actor?.name ?? "").startsWith(PREFIX) && squares.some((square) => covers(token, square))).map((token) => token.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
}

// A move on the map (not Foundry's teleport) waits while the game is paused (Foundry 14): the case run unpaused, the pause put back after.
async function unpaused(fn) {
    const was = game.paused;
    if (was) await game.togglePause(false, { broadcast: true });
    try {
        return await fn();
    } finally {
        if (was) await game.togglePause(true, { broadcast: true });
    }
}

// The lab scene's temperature set through PF2e Automatic Environment Resolution while fn runs, then put back.
const ENVIRONMENT = "pf2e-automatic-environment-resolution";
const weatherName = (actor) => (actor.itemTypes?.effect ?? []).find((effect) => effect.flags?.[ENVIRONMENT]?.weather)?.name ?? "";
async function withTemperature(scene, temperature, fn) {
    const env = game.modules.get(ENVIRONMENT);
    assert(env?.active && env.api?.setWeather, "PF2e Automatic Environment Resolution active");
    const before = env.api.weather(scene)?.state ?? {};
    await env.api.setWeather(scene, { ...before, temperature });
    await env.api.sync(scene);
    try {
        return await fn(env);
    } finally {
        await env.api.setWeather(scene, { ...before, temperature: before.temperature ?? "normal" });
        await env.api.sync(scene);
    }
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

// A spell from PF2e's pack dropped on an element, as a drag from the compendium does.
async function dropSpell(element, name) {
    const entry = (await game.packs.get("pf2e.spells-srd").getIndex()).find((row) => row.name === name);
    assert(entry && element, `${name} dropped`);
    const transfer = new DataTransfer();
    transfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: `Compendium.pf2e.spells-srd.Item.${entry._id}` }));
    element.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
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

// Every die at that face while fn runs (Foundry's CONFIG.Dice.randomUniform, a face of ceil((1 − r) × faces)): a d20 at 10 for the degree a
// case needs, whatever the luck.
async function withDie(face, fn) {
    const random = CONFIG.Dice.randomUniform;
    CONFIG.Dice.randomUniform = () => 1 - face / 20 + 1e-9;
    try {
        return await fn();
    } finally {
        CONFIG.Dice.randomUniform = random;
    }
}

// The ability module's card for a new save at a creature's turns (its scripts/recurring.js): the next one for that creature, and its buttons.
const recurringFor = (actor) => (message) => message.flags?.["pf2e-automatic-ability-resolution"]?.recurring?.actorUuid === actor.uuid;
async function pressRecurring(message, action) {
    let button = null;
    for (const stop = Date.now() + 8000; Date.now() < stop && !button; ) {
        button = document.querySelector(`[data-message-id="${message.id}"] [data-aar-recurring="${action}"]`);
        if (!button) await wait(200);
    }
    assert(button, `the card's ${action} button`);
    button.click();
}
const recurringResult = (message) => game.messages.get(message.id)?.flags?.["pf2e-automatic-ability-resolution"]?.recurring;

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

    // Silver Orb (Lesser): a hit's bomb card names the cloud; its Apply sets the ability module's 5-foot zone down at the target's square.
    async silverOrbCloud(scene) {
        const { actor: thrower, token: throwerToken } = await creature(scene, "Orb Thrower", { type: "character", x: 2, y: 12 });
        const { token: foeToken } = await creature(scene, "Orb Target", { x: 5, y: 12, ac: 1, alliance: "opposition", hp: 200 });
        const orb = await give(thrower, "Silver Orb (Lesser)");
        await orb.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await throwerToken.object?.control?.();
        await target(foeToken);
        const { action, attack } = await strike(thrower, orb);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const since = Date.now();
        await action.damage({ event: shift() });
        const card = await messageAfter(since, itemCard("bomb"), { what: "the bomb card" });
        assert(/5-foot cloud around/.test(card.content), "the cloud on the card");
        const regions = () => (canvas.scene?.regions?.contents ?? []).filter((region) => region.name?.includes("Silver Orb"));
        const before = regions().length;
        await game.modules.get(NS).api.live.apply(card.id, {});
        await until(() => regions().length > before, "the cloud's zone", { timeout: 10000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results, regions: regions().length };
    },

    // Blade Phantom's Guide: the whip picked gets PF2e's MartialProficiency at its user's highest weapon proficiency rank for 1 minute.
    async bladePhantom(scene) {
        const { actor: user } = await creature(scene, "Phantom Student", { type: "character", x: 4, y: 14 });
        const whip = await give(user, "Whip");
        await whip.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const guide = await give(user, "Blade Phantom's Guide");
        const since = Date.now();
        await guide.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the guide's card" });
        const at = card.getFlag(NS, "card").weapons.findIndex((weapon) => weapon.id === whip.id);
        assert(at >= 0, "the whip offered");
        await game.modules.get(NS).api.live.apply(card.id, { runeWeapon: at });
        const rule = () => user.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((entry) => entry.key === "MartialProficiency");
        await until(rule, "the MartialProficiency Effect", { timeout: 8000 });
        assert(JSON.stringify(rule().definition).includes(whip.id), `for the whip (${JSON.stringify(rule())})`);
        return { rule: rule(), results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Doom Switch's Bragging Rights: its user's simple melee attack on the ability module's card; whatever the degree, PF2e's own Bragging
    // Rights Effect for it on the target.
    async doomSwitch(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Doom Bragger", { type: "character", x: 6, y: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Doom Target", { x: 7, y: 12, alliance: "opposition" });
        const doom = await give(user, "Doom Switch");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(doom.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the switch's card" });
        assert((card.getFlag(NS, "card").attackChoices ?? []).some((choice) => choice.kind === "melee"), `a melee attack choice (${JSON.stringify(card.getFlag(NS, "card").attackChoices)})`);
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        await rollAndApply(attack);
        await until(() => foe.itemTypes.effect.some((effect) => /^Effect: Bragging Rights/.test(effect.name)), "a Bragging Rights Effect on the target", { timeout: 10000 });
        return { effects: foe.itemTypes.effect.map((effect) => effect.name) };
    },

    // Three whetstones on a longsword (Frenzied Quintessence, Analysis Eye, Leeching Fangs): its hit (AC 1) Quickens its user and tells the
    // GM and its user the target's one weakness; its damage, applied as PF2e's damage button does (the weapon its origin), heals its user
    // half as much.
    async whetstoneRiders(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Whetstone Duelist", { type: "character", x: 8, y: 14 });
        const { actor: foe, token: foeToken } = await creature(scene, "Whetstone Target", { x: 9, y: 14, ac: 1, hp: 80, alliance: "opposition" });
        await foe.update({ "system.attributes.weaknesses": [{ type: "fire", value: 5 }] });
        const sword = await give(user, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        // (A bare character has no maximum Hit Points: 30, so the healing shows.)
        await user.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 30 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await until(() => user.system.attributes.hp.max >= 30, "30 maximum Hit Points", { timeout: 5000 });
        await user.update({ "system.attributes.hp.value": 1 });
        for (const name of ["Frenzied Quintessence", "Analysis Eye", "Leeching Fangs"]) {
            const stone = await give(user, name);
            const since = Date.now();
            await stone.consume();
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            const at = card.getFlag(NS, "card").weapons.findIndex((weapon) => weapon.id === sword.id);
            assert(at >= 0, `the longsword offered (${name})`);
            await game.modules.get(NS).api.live.apply(card.id, { runeWeapon: at });
        }
        const watches = () => user.itemTypes.effect.filter((effect) => effect.getFlag(NS, "attackRiders")?.weapon?.id === sword.id);
        await until(() => watches().length === 3, "three watch Effects on the longsword", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(foeToken);
        let since = Date.now();
        const { action, attack } = await strike(user, sword);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        await until(() => user.hasCondition("quickened"), "Quickened", { timeout: 8000 });
        const learned = await messageAfter(since, (message) => /Analysis Eye/.test(message.content) && /weakness fire 5/i.test(message.content), { what: "the weakness learned" });
        since = Date.now();
        await action.damage({ event: shift() });
        const rolled = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
        const before = user.system.attributes.hp.value;
        await foe.applyDamage({ damage: rolled.rolls[0], token: foeToken, item: rolled.item });
        const healed = await messageAfter(since, (message) => /Leeching Fangs/.test(message.content) && /heals \d+/.test(message.content), { what: "the leech healing" });
        const amount = Number(/heals (\d+)/.exec(healed.content)[1]);
        assert(amount >= 1 && before + amount <= user.system.attributes.hp.max, `room to heal ${amount} from ${before} (max ${user.system.attributes.hp.max})`);
        await until(() => user.system.attributes.hp.value === before + amount, `healed ${amount}`, { timeout: 8000 });
        return { watches: watches().map((effect) => effect.name), learned: learned.content, healed: healed.content, hp: [before, user.system.attributes.hp.value, user.system.attributes.hp.max] };
    },

    // Champion's Laurels (Amateur): +1 status to the triggering Athletics check; its critical success (DC -20) gives 2 temporary Hit Points for
    // 1 minute, and that check spends the Effect.
    async laurelsCritical(scene) {
        const { actor: user } = await creature(scene, "Laurel Athlete", { type: "character", x: 8, y: 16 });
        let outcome = null;
        for (let tries = 0; tries < 3 && outcome !== "criticalSuccess"; tries++) {
            const laurels = await give(user, "Champion's Laurels (Amateur)");
            let since = Date.now();
            await laurels.consume();
            const card = await messageAfter(since, itemCard("fortune"), { what: "the laurels' card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => user.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")?.onCritical), "the bonus Effect", { timeout: 8000 });
            since = Date.now();
            await user.skills.athletics.roll({ dc: { value: -20 }, skipDialog: true });
            const check = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "skill-check", { what: "the Athletics check" });
            outcome = check.flags.pf2e.context.outcome;
            await until(() => !user.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")), "the Effect spent by the check", { timeout: 8000 });
        }
        assert(outcome === "criticalSuccess", `a critical success (DC -20): ${outcome}`);
        await until(() => user.system.attributes.hp.temp === 2, `2 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        return { outcome, temp: user.system.attributes.hp.temp };
    },

    // Living Leaf Weave with an Elixir of Life (Moderate) installed: its +2 item bonus to Athletics to Grapple and to the Fortitude and
    // Reflex DCs for 3 rounds, the elixir used up; Dread Helm's moderate ampoule: +1 to Intimidation and 2 mental damage to the creature
    // next to its user.
    async installedItems(scene) {
        const { actor: user } = await creature(scene, "Installed Wearer", { type: "character", x: 10, y: 16 });
        const { actor: foe } = await creature(scene, "Installed Neighbour", { x: 11, y: 16, hp: 40, alliance: "opposition" });
        const weave = await give(user, "Living Leaf Weave");
        const elixir = await give(user, "Elixir of Life (Moderate)");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(weave.uuid, 0);
        let card = await messageAfter(since, itemCard("item"), { what: "the weave's card" });
        let at = card.getFlag(NS, "card").installed.findIndex((entry) => entry.id === elixir.id);
        assert(at >= 0, `the elixir offered (${JSON.stringify(card.getFlag(NS, "card").installed)})`);
        await game.modules.get(NS).api.live.apply(card.id, { installedPick: at });
        const rules = () => user.itemTypes.effect.filter((effect) => effect.getFlag(NS, "installed")).flatMap((effect) => effect.system.rules ?? []);
        // (PF2e keeps a selector as a list.)
        await until(() => rules().some((rule) => [].concat(rule.selector).includes("fortitude-dc") && rule.value === 2), "+2 to the Fortitude DC", { timeout: 8000 });
        assert(!user.items.get(elixir.id), "the elixir used up");
        const helm = await give(user, "Dread Helm");
        const ampoule = await give(user, "Dread Ampoule (Moderate)");
        const hp = foe.system.attributes.hp.value;
        since = Date.now();
        await game.modules.get(NS).api.live.activate(helm.uuid, 0);
        card = await messageAfter(since, itemCard("item"), { what: "the helm's card" });
        at = card.getFlag(NS, "card").installed.findIndex((entry) => entry.id === ampoule.id);
        await game.modules.get(NS).api.live.apply(card.id, { installedPick: at });
        await until(() => foe.system.attributes.hp.value === hp - 2, `2 mental damage on the neighbour (${hp} → ${foe.system.attributes.hp.value})`, { timeout: 8000 });
        assert(rules().some((rule) => [].concat(rule.selector).includes("intimidation") && rule.value === 1), "+1 to Intimidation");
        return { rules: rules().map((rule) => `${[].concat(rule.selector).join(",")} +${rule.value}`), hp: [hp, foe.system.attributes.hp.value] };
    },

    // Potion Patch (Lesser): a Healing Potion (Lesser) of its user's picked and used through it — PF2e's own use, so the potion's own card
    // follows and the potion is gone.
    async potionPatch(scene) {
        const { actor: user } = await creature(scene, "Patch Drinker", { type: "character", x: 12, y: 16 });
        const patch = await give(user, "Potion Patch (Lesser)");
        const potion = await give(user, "Healing Potion (Lesser)");
        let since = Date.now();
        await patch.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the patch's card" });
        const at = card.getFlag(NS, "card").potions.findIndex((entry) => entry.id === potion.id);
        assert(at >= 0, `the potion offered (${JSON.stringify(card.getFlag(NS, "card").potions)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { potionPick: at });
        const potionCard = await messageAfter(since, (message) => message.getFlag(NS, "card")?.item?.name === "Healing Potion (Lesser)", { what: "the potion's own card" });
        await until(() => !user.items.get(potion.id), "the potion used up", { timeout: 8000 });
        return { potionCard: potionCard.id };
    },

    // Ginger Chew's secondary effect: the ways card's second way, its own card lowering sickened 2 to 1; the ways card stays open.
    async gingerChewSecondary(scene) {
        const { actor: user } = await creature(scene, "Chew Chewer", { x: 14, y: 16 });
        await user.increaseCondition("sickened", { value: 2 });
        const chew = await give(user, "Ginger Chew");
        let since = Date.now();
        await chew.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const card = await messageAfter(since, itemCard("item"), { what: "the secondary effect's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.getCondition("sickened")?.value === 1, `sickened 2 → 1 (${user.getCondition("sickened")?.value})`, { timeout: 8000 });
        assert(game.messages.get(ways.id).getFlag(NS, "card").status === "open", "the ways card open");
        return { sickened: user.getCondition("sickened")?.value };
    },

    // Grim Ring: its user's drained 2 lowered to 1, and the undead targeted gets the ability module's 2d6 vitality card.
    async grimRing(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Grim Wearer", { type: "character", x: 16, y: 16 });
        const { token: undeadToken } = await creature(scene, "Grim Undead", { x: 17, y: 16, alliance: "opposition" });
        await user.increaseCondition("drained", { value: 2 });
        const ring = await give(user, "Grim Ring");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(ring.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the ring's card" });
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [undeadToken.uuid] });
        const damage = await messageAfter(since, abilitySaveCard, { what: "the 2d6 vitality card" });
        assert(damage.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage.components[0].formula === "2d6", "its 2d6");
        await until(() => user.getCondition("drained")?.value === 1, `drained 2 → 1 (${user.getCondition("drained")?.value})`, { timeout: 8000 });
        return { drained: user.getCondition("drained")?.value };
    },

    // Floating Shield's Float: +1 circumstance bonus to its user's AC for a minute, the shield not even held.
    async floatingShield(scene) {
        const { actor: user } = await creature(scene, "Float Wearer", { type: "character", x: 18, y: 16 });
        const shield = await give(user, "Floating Shield");
        const before = user.system.attributes.ac.value;
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the shield's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.system.attributes.ac.value === before + 1, `AC ${before} + 1 (${user.system.attributes.ac.value})`, { timeout: 8000 });
        return { ac: [before, user.system.attributes.ac.value] };
    },

    // Viper Rapier's miss: the creature missed gets the ability module's cave worm venom save card at DC 43.
    async viperRapier(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Viper Duelist", { type: "character", x: 14, y: 18 });
        const { token: foeToken } = await creature(scene, "Viper Target", { x: 15, y: 18, alliance: "opposition" });
        const rapier = await give(user, "Viper Rapier");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(rapier.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the rapier's card" });
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the venom's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && Number(check.against.value) === 43, `Fortitude DC 43 (${JSON.stringify(check)})`);
        return { check };
    },

    // Powered Full Plate with a Bottled Lightning (Moderate) installed: +1 item to Athletics to Shove, and the armor's Strength requirement
    // 1 lower (PF2e's ItemAlteration), the bomb used up.
    async poweredPlate(scene) {
        const { actor: user } = await creature(scene, "Plate Wearer", { type: "character", x: 18, y: 18 });
        const plate = await give(user, "Powered Full Plate");
        const bomb = await give(user, "Bottled Lightning (Moderate)");
        const strength = () => user.items.get(plate.id)?.system?.strength;
        const before = strength();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(plate.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the plate's card" });
        const at = card.getFlag(NS, "card").installed.findIndex((entry) => entry.id === bomb.id);
        await game.modules.get(NS).api.live.apply(card.id, { installedPick: at });
        await until(() => strength() === before - 1, `Strength requirement ${before} − 1 (now ${strength()})`, { timeout: 8000 });
        assert(!user.items.get(bomb.id), "the bottled lightning used up");
        return { strength: [before, strength()] };
    },

    // Paradise Light's Sanctum: the 30-foot meadow on its user's token (the ability module's zone), +1 item to Will saves for a creature
    // that steps into it.
    async paradiseMeadow(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Meadow Holder", { type: "character", x: 4, y: 1 });
        const { actor: friend, token: friendToken } = await creature(scene, "Meadow Friend", { x: 11, y: 1 });
        const light = await give(user, "Paradise Light");
        const earlier = new Set(scene.regions.map((region) => region.id));
        const meadow = () => scene.regions.find((region) => !earlier.has(region.id) && region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Paradise Light/.test(region.name));
        try {
            await game.modules.get(NS).api.live.activate(light.uuid, 0);
            await until(() => meadow(), "the meadow's Region", { timeout: 8000 });
            await friendToken.update({ x: 600, y: 100 });
            const calm = () => friend.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("will") && rule.value === 1));
            await until(calm, "+1 item to Will saves inside the meadow", { timeout: 10000 });
            return { region: meadow()?.name };
        } finally {
            await meadow()?.delete().catch(() => null);
        }
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
        // (Only against what triggered it: the damage it then takes, 5 slashing less 3, spends it.)
        const hp = wearer.system.attributes.hp.value;
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await wearer.applyDamage({ damage: await new DamageRoll("5[slashing]").evaluate(), token: wearer.getActiveTokens(true, true)[0] });
        await until(() => !wearer.itemTypes.effect.some((entry) => entry.getFlag(NS, "rollTwice")), "the Effect spent by the damage", { timeout: 8000 });
        assert(wearer.system.attributes.hp.value === hp - 2, `5 less 3: ${hp} → ${wearer.system.attributes.hp.value}`);
        return { duration: effect.system.duration, hp: [hp, wearer.system.attributes.hp.value] };
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
        // ("You and the shield each take any remaining damage": 30 bludgeoning less 24 — 6 to its user, and 6 to the shield.)
        const hp = wearer.system.attributes.hp.value;
        const shieldHP = shield.system.hp.value;
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await wearer.applyDamage({ damage: await new DamageRoll("30[bludgeoning]").evaluate(), token: wearer.getActiveTokens(true, true)[0] });
        await until(() => shield.system.hp.value === shieldHP - 6, `the shield's 6 (${shieldHP} → ${shield.system.hp.value})`, { timeout: 8000 });
        assert(wearer.system.attributes.hp.value === hp - 6, `its user's 6: ${hp} → ${wearer.system.attributes.hp.value}`);
        return { resistances: resistances.map((entry) => `${entry.type} ${entry.value}`), shield: [shieldHP, shield.system.hp.value], hp: [hp, wearer.system.attributes.hp.value] };
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

    // Shawl of Seasons' Change of Seasons: the toggle card's Spring way switches PF2e's own season toggle, its +5-foot Speed with it.
    async shawlSeasons(scene) {
        const { actor: wearer } = await creature(scene, "Shawl Wearer", { type: "character", x: 18, y: 16 });
        const shawl = await give(wearer, "Shawl of Seasons");
        await shawl.update({ "system.equipped.invested": true, "system.equipped.carryType": "worn" });
        await wait(500);
        const before = wearer.system.attributes.speed?.total ?? wearer.system.movement?.speeds?.land?.value ?? null;
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shawl.uuid, 0);
        const card = await messageAfter(since, itemCard("toggle"), { what: "the toggle card" });
        await game.modules.get(NS).api.live.apply(card.id, { choice: 0 });
        await wait(800);
        const rule = (wearer.items.get(shawl.id).system.rules ?? []).find((entry) => entry.key === "RollOption" && entry.option === "shawl-of-seasons:change-of-seasons");
        assert(rule?.selection === "spring", `spring selected (${rule?.selection})`);
        const after = wearer.system.attributes.speed?.total ?? wearer.system.movement?.speeds?.land?.value ?? null;
        return { selection: rule.selection, speed: [before, after], results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Iron Wine: of its two linked Effects, its own (Effect: Iron Wine) on a first cup; the weakness one is for a second cup in a day (plan.dose,
    // secondDoseAndSoap), not a note.
    async ironWine(scene) {
        const { actor: drinker } = await creature(scene, "Wine Drinker", { x: 12, y: 18 });
        const wine = await give(drinker, "Iron Wine");
        const since = Date.now();
        await wine.consume();
        const card = await messageAfter(since, itemCard("item"));
        assert(!/Iron Wine Weakness is linked too/.test(card.content), "no note of the other link");
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

    // Numerian Steel Breastplate's electric field: an activation's retaliation card, kept open; a press sends 1d10 electricity at the creature.
    async fieldRetaliation(scene) {
        const { actor: wearer } = await creature(scene, "Field Wearer", { type: "character", x: 10, y: 21 });
        const { token: foeToken } = await creature(scene, "Field Toucher", { x: 11, y: 21, alliance: "opposition" });
        const plate = await give(wearer, "Numerian Steel Breastplate");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(plate.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the field's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const damage = await messageAfter(since, abilitySaveCard, { what: "the ability module's no-save card" });
        const components = damage.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage?.components ?? [];
        assert(components.some((component) => /^1d10/.test(component.formula) && component.type === "electricity"), `1d10 electricity (${JSON.stringify(components)})`);
        const state = game.messages.get(card.id).getFlag(NS, "card");
        assert(state.status === "open", `still open (${state.status})`);
        return { uses: state.uses };
    },

    // Thunder Mail's Call Down Lightning: beside its own card, the retaliation card for the next minute, kept open; a press sends 1d8
    // electricity at the creature that hit.
    async thunderRetaliation(scene) {
        await clearSquares(scene, [[14, 21], [15, 21]]);
        const { actor: wearer } = await creature(scene, "Thunder Wearer", { type: "character", x: 14, y: 21 });
        const { token: foeToken } = await creature(scene, "Thunder Hitter", { x: 15, y: 21, alliance: "opposition" });
        const mail = await give(wearer, "Thunder Mail");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(mail.uuid, 0);
        const card = await messageAfter(since, (message) => itemCard("expose")(message) && Boolean(message.getFlag(NS, "card")?.plan?.retaliation), { what: "the retaliation card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const damage = await messageAfter(since, abilitySaveCard, { what: "the ability module's no-save card" });
        const components = damage.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage?.components ?? [];
        assert(components.some((component) => /^1d8/.test(component.formula) && component.type === "electricity"), `1d8 electricity (${JSON.stringify(components)})`);
        assert(game.messages.get(card.id).getFlag(NS, "card").status === "open", "still open");
        return { formula: components[0]?.formula };
    },

    // Cooling Elixir (Lesser) in severe heat (PF2e Automatic Environment Resolution on the lab scene): its Effect, the environment module's
    // flag on it — the creature's weather no longer severe heat (mild heat, which does nothing in a fight).
    async coolingElixirHeat(scene) {
        await clearSquares(scene, [[17, 23]]);
        const { actor: drinker } = await creature(scene, "Elixir Drinker", { type: "character", x: 17, y: 23 });
        return withTemperature(scene, "severe-heat", async (env) => {
            await env.api.sync(scene);
            await until(() => /Severe heat/.test(weatherName(drinker)), `severe heat first (${weatherName(drinker)})`, { timeout: 8000 });
            const elixir = await give(drinker, "Cooling Elixir (Lesser)");
            const since = Date.now();
            await elixir.consume();
            const card = await messageAfter(since, itemCard("item"), { what: "the elixir's card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => drinker.itemTypes.effect.some((effect) => effect.flags?.[ENVIRONMENT]?.temperature?.counts?.["severe-heat"] === "mild-heat"), "the Effect with the environment module's flag", { timeout: 8000 });
            // (Mild heat does nothing in a fight: the environment module's weather Effect gone, or without the heat.)
            await until(() => !/Severe heat/.test(weatherName(drinker)), `no severe heat after it (${weatherName(drinker)})`, { timeout: 8000 });
            return { weather: weatherName(drinker) };
        });
    },

    // Shade Hat worn and invested in severe heat: api.temperatureProtections(actor) — mild and severe heat count as normal, so no heat on
    // the creature's weather.
    async shadeHatHeat(scene) {
        await clearSquares(scene, [[18, 23]]);
        const { actor: wearer } = await creature(scene, "Hat Wearer", { type: "character", x: 18, y: 23 });
        return withTemperature(scene, "severe-heat", async (env) => {
            await env.api.sync(scene);
            await until(() => /Severe heat/.test(weatherName(wearer)), `severe heat first (${weatherName(wearer)})`, { timeout: 8000 });
            const hat = await give(wearer, "Shade Hat");
            await hat.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
            const protections = game.modules.get(NS).api.temperatureProtections(wearer);
            assert(protections.some((entry) => entry.source === "Shade Hat" && entry.counts["severe-heat"] === "normal"), `the hat's protection (${JSON.stringify(protections)})`);
            await env.api.sync(scene);
            await until(() => !/heat/i.test(weatherName(wearer)), `no heat with the hat (${weatherName(wearer)})`, { timeout: 8000 });
            return { weather: weatherName(wearer), protections };
        });
    },

    // Retrieval Belt: Store Item puts the held dagger in the belt (a PF2e container), Retrieve Item brings it back to a hand.
    async retrievalBelt(scene) {
        const { actor: user } = await creature(scene, "Belt Wearer", { type: "character", x: 1, y: 30 });
        const belt = await give(user, "Retrieval Belt");
        await belt.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        const dagger = await give(user, "Dagger");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(belt.uuid, 0);
        let card = await messageAfter(since, itemCard("objects"), { what: "Store Item's card" });
        const choices = card.getFlag(NS, "card").choices.map((choice) => choice.name);
        assert(choices.includes("Dagger"), `the dagger offered (${choices.join(", ")})`);
        await game.modules.get(NS).api.live.apply(card.id, { pick: choices.indexOf("Dagger") });
        await until(() => dagger.system.containerId === belt.id, `the dagger in the belt (${dagger.system.containerId})`, { timeout: 8000 });
        since = Date.now();
        await game.modules.get(NS).api.live.activate(belt.uuid, 1);
        card = await messageAfter(since, itemCard("objects"), { what: "Retrieve Item's card" });
        await game.modules.get(NS).api.live.apply(card.id, { pick: 0 });
        await until(() => !dagger.system.containerId && dagger.system.equipped.carryType === "held", `the dagger in hand (${dagger.system.equipped.carryType})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // The Forge repairs a damaged steel shield of its user's to its full Hit Points; Crushing Coils are worn once activated.
    async forgeAndCoils(scene) {
        const { actor: user } = await creature(scene, "Forge User", { type: "character", x: 2, y: 30 });
        const forge = await give(user, "The Forge");
        const shield = await give(user, "Steel Shield");
        const max = Number(shield.system.hp.max);
        await shield.update({ "system.hp.value": Math.floor(max / 3) });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(forge.uuid, 0);
        const card = await messageAfter(since, itemCard("objects"), { what: "The Forge's card" });
        const choices = card.getFlag(NS, "card").choices.map((choice) => choice.name);
        await game.modules.get(NS).api.live.apply(card.id, { pick: choices.indexOf("Steel Shield") });
        await until(() => Number(shield.system.hp.value) === max, `the shield repaired (${shield.system.hp.value}/${max})`, { timeout: 8000 });
        const coils = await give(user, "Crushing Coils");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(coils.uuid, 0);
        const worn = await messageAfter(since, itemCard("objects"), { what: "Crushing Coils' card" });
        await game.modules.get(NS).api.live.apply(worn.id, {});
        await until(() => coils.system.equipped.carryType === "worn" && coils.system.equipped.inSlot, `the coils worn (${JSON.stringify(coils.system.equipped)})`, { timeout: 8000 });
        return { hp: shield.system.hp.value };
    },

    // Navigator's Star (information): whispered to the GM and its user. Codebreaker's Parchment's Decode Writing (speech): its note Effect.
    // Winterstep Elixir (Lesser): PF2e's own rule ignoring difficult terrain from ice and snow on its user.
    async decidedAndTerrain(scene) {
        const { actor: user } = await creature(scene, "Decided User", { type: "character", x: 3, y: 30 });
        const star = await give(user, "Navigator's Star");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(star.uuid, 0);
        const whisper = await messageAfter(since, (message) => message.flags?.[NS]?.whisper?.item === "Navigator's Star", { what: "the whispered card" });
        assert(whisper.whisper.length > 0 && /which direction you(?:&#39;|')re facing/.test(whisper.content), `whispered, with its words (${whisper.whisper.length})`);
        const parchment = await give(user, "Codebreaker's Parchment");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(parchment.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "Decode Writing's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => /scrambled words align/i.test(effect.system?.description?.value ?? "")), "its note Effect", { timeout: 8000 });
        const elixir = await give(user, "Winterstep Elixir (Lesser)");
        since = Date.now();
        await elixir.consume();
        const drink = await messageAfter(since, itemCard("item"), { what: "the elixir's card" });
        await game.modules.get(NS).api.live.apply(drink.id);
        await until(() => (user.system.movement?.terrain?.difficult?.ignored ?? []).some((entry) => entry.feature === "ice"), `ice ignored (${JSON.stringify(user.system.movement?.terrain)})`, { timeout: 8000 });
        return { ignored: user.system.movement.terrain.difficult.ignored };
    },

    // Row readings (src/compiler/row-readings.js): Reducer Round's critical failure, PF2e's size rule (Tiny, reach 0) with its Enfeebled 2 from
    // that Effect; Splintering Spear's Shatter, a critical failure taking the spear's bleed as persistent damage beside the save's; Chiromantic
    // Lines, its user's Strike finding the creature Off-Guard.
    async rowReadings(scene) {
        await clearSquares(scene, [[4, 30], [5, 30]]);
        const { actor: user, token: userToken } = await creature(scene, "Row Reader", { type: "character", x: 4, y: 30, level: 13 });
        // (Hit Points enough for Shatter's critical failure, 24d6 piercing, with its bleed after.)
        const { actor: foe, token: foeToken } = await creature(scene, "Row Target", { x: 5, y: 30, hp: 400, ac: 1, save: 0, alliance: "opposition" });
        const saveAt = async (item, what) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("expose"), { what: `${what}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            const save = await messageAfter(since, abilitySaveCard, { what: `${what}'s save card` });
            await withDie(2, () => rollAndApply(save));
        };
        await saveAt(await give(user, "Reducer Round"), "Reducer Round");
        await until(() => foe.system.traits?.size?.value === "tiny", `Tiny (${foe.system.traits?.size?.value})`, { timeout: 8000 });
        await until(() => foe.getCondition?.("enfeebled")?.value === 2, `Enfeebled 2 (${foe.getCondition?.("enfeebled")?.value})`, { timeout: 8000 });
        const shrunk = foe.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "CreatureSize"));
        assert(shrunk && shrunk.system.duration.value === 1 && shrunk.system.duration.unit === "minutes", `its minute (${JSON.stringify(shrunk?.system?.duration)})`);
        await saveAt(await give(user, "Splintering Spear"), "Shatter");
        await until(() => foe.itemTypes.condition.some((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "bleed"), "persistent bleed", { timeout: 8000 });
        const lines = await give(user, "Chiromantic Lines");
        const dagger = await give(user, "Dagger");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(lines.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "Cunning Consultation's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "EphemeralEffect")), "its Off-Guard Effect", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(user, dagger);
        const options = attack.flags.pf2e.context.options ?? [];
        assert(options.includes("target:condition:off-guard"), `the target Off-Guard to it (${options.filter((option) => /off-guard/.test(option)).join(", ") || "none"})`);
        return { size: foe.system.traits.size.value, enfeebled: foe.getCondition("enfeebled").value };
    },

    // Life's Last Breath's Envision at a creature that fails its Fortitude save: its void damage, and its user's temporary Hit Points of that
    // damage. Blast Lance at a creature that fails: the push the row makes, the Stride after it a line on the save card's item card.
    async damageAndPush(scene) {
        // (In the lab, the push's squares free: 10 feet east of the target, Avalanche Boots' row.)
        await clearSquares(scene, [[10, 14], [11, 14], [12, 14], [13, 14]]);
        const { actor: user } = await creature(scene, "Breath Wielder", { type: "character", x: 10, y: 14, level: 18 });
        const { actor: foe, token: foeToken } = await creature(scene, "Lance Target", { x: 11, y: 14, hp: 400, save: 0, alliance: "opposition" });
        const saveAt = async (item, index, what) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, index);
            const card = await messageAfter(since, itemCard("expose"), { what: `${what}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            const save = await messageAfter(since, abilitySaveCard, { what: `${what}'s save card` });
            await withDie(2, () => rollAndApply(save));
            return card;
        };
        const sword = await give(user, "Life's Last Breath");
        await saveAt(sword, 1, "Life's Last Breath");
        await until(() => Number(foe.system.attributes.hp.value) < 400, `the void damage (${foe.system.attributes.hp.value})`, { timeout: 8000 });
        const dealt = 400 - Number(foe.system.attributes.hp.value);
        await until(() => Number(user.system.attributes.hp.temp) > 0, `its user's temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        const temp = Number(user.system.attributes.hp.temp);
        const x = foeToken.x;
        const lance = await give(user, "Blast Lance");
        const card = await saveAt(lance, 0, "Blast Lance");
        assert((card.getFlag(NS, "card").plan.notes ?? []).some((note) => /Stride after the creature/.test(note)), "the Stride after it on the card");
        await until(() => foeToken.x - x >= scene.grid.size, `pushed east (${(foeToken.x - x) / scene.grid.size} squares)`, { timeout: 8000 });
        return { dealt, temp, moved: (foeToken.x - x) / scene.grid.size };
    },

    // Weather ignores through PF2e Automatic Environment Resolution: Ixamè's Eye's Effect (fog and mist for a minute), Cape of the Open Sky worn
    // and Wintershot held through api.weatherIgnores — all three in the environment module's own reading of the creature.
    async weatherIgnored(scene) {
        assert(game.modules.get(ENVIRONMENT)?.active, "PF2e Automatic Environment Resolution isn't active in pftest.");
        const { weatherIgnoresOf } = await import(`/modules/${ENVIRONMENT}/scripts/foundry.js?v=${Date.now()}`);
        await clearSquares(scene, [[19, 16]]);
        const { actor: user } = await creature(scene, "Weather Watcher", { type: "character", x: 19, y: 16, level: 20 });
        const cape = await give(user, "Cape of the Open Sky");
        // (A cloak: worn in its slot, as PF2e equips it.)
        await cape.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const bow = await give(user, "Wintershot");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const eye = await give(user, "Ixamè's Eye");
        const since = Date.now();
        await eye.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "Ixamè's Eye's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => effect.flags?.[ENVIRONMENT]?.weatherIgnores?.ignores?.includes("fog-mist")), "the eye's Effect", { timeout: 8000 });
        const read = weatherIgnoresOf(user);
        const by = (source) => read.find((entry) => String(entry.source).startsWith(source));
        assert(by("Ixamè's Eye")?.ignores.includes("fog-mist"), `the eye's (${JSON.stringify(read)})`);
        assert(by("Cape of the Open Sky")?.ignores.includes("wind-movement"), `the cape's (${JSON.stringify(read)})`);
        assert(by("Wintershot")?.weapon === bow.id && by("Wintershot").windUpTo === 2, `the bow's, its own Strikes (${JSON.stringify(read)})`);
        return { read };
    },

    // An activation's own wait: Storm Hammer's Electrify kept on the item for 10 minutes, its user told; a second use warns the GM.
    async activationWait(scene) {
        await clearSquares(scene, [[16, 18]]);
        const { actor: user } = await creature(scene, "Hammer Waiter", { type: "character", x: 16, y: 18, level: 9 });
        const hammer = await give(user, "Storm Hammer");
        await hammer.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(hammer.uuid, 0);
        await messageAfter(since, (message) => /usable again in 10 minutes/.test(message.content), { what: "the wait told" });
        const until = Number(hammer.getFlag(NS, "activationRecharges")?.[0]);
        assert(until - game.time.worldTime === 600, `600 seconds on the item (${until - game.time.worldTime})`);
        since = Date.now();
        await game.modules.get(NS).api.live.activate(hammer.uuid, 0);
        const warning = await messageAfter(since, (message) => /usable again only in 10 minutes/.test(message.content), { what: "the GM's warning" });
        assert(warning.whisper.length > 0, "whispered");
        return { until };
    },

    // The Bewitching Bloom tattoos at a chosen ally: Amaranth's floor holds it at 1 Hit Point against an enemy's damage (an ally's doesn't use it
    // up), Cherry Blossom's recovery DC is 10 while dying, Red Rose's toggle gives +1 to saves, Magnolia's Effect then the ally's save card.
    async bloomAllies(scene) {
        await clearSquares(scene, [[7, 9], [8, 9]]);
        const { actor: user } = await creature(scene, "Bloom Bearer", { type: "character", x: 7, y: 9, level: 15 });
        const { actor: ally, token: allyToken } = await creature(scene, "Bloom Ally", { x: 8, y: 9, hp: 60 });
        const bloom = async (name) => {
            const tattoo = await give(user, `Bewitching Bloom (${name})`);
            await tattoo.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
            await wait(800);
            return since;
        };
        const effectNamed = (words) => ally.itemTypes.effect.find((effect) => effect.name.includes(words));
        await bloom("Amaranth");
        await until(() => effectNamed("hp floor"), "the hp floor Effect", { timeout: 8000 });
        await ally.applyDamage({ damage: 5, token: allyToken, rollOptions: new Set(["origin:ally"]) });
        assert(ally.system.attributes.hp.value === 55 && effectNamed("hp floor"), `an ally's damage leaves it (${ally.system.attributes.hp.value})`);
        let since = Date.now();
        await ally.applyDamage({ damage: 500, token: allyToken, rollOptions: new Set(["origin:enemy"]) });
        await messageAfter(since, (message) => /stays at 1 Hit Point/.test(message.content), { what: "the floor's line" });
        assert(ally.system.attributes.hp.value === 1 && !effectNamed("hp floor"), `held at 1 and used up (${ally.system.attributes.hp.value})`);
        await bloom("Cherry Blossom");
        await until(() => effectNamed("recovery DC"), "the recovery DC Effect", { timeout: 8000 });
        await ally.increaseCondition("dying", { value: 2 });
        await until(() => ally.system.attributes.dying.value === 2, "dying 2", { timeout: 4000 });
        const dc = ally.system.attributes.dying.recoveryDC + ally.system.attributes.dying.value;
        assert(dc === 10, `recovery DC 10 while dying 2 (${dc})`);
        await ally.decreaseCondition("dying", { forceRemove: true });
        await bloom("Red Rose");
        await until(() => effectNamed("beloved"), "the beloved Effect", { timeout: 8000 });
        const before = ally.saves.fortitude.mod;
        await ally.toggleRollOption("all", "beloved-within-10-feet", effectNamed("beloved").id, true);
        await until(() => ally.saves.fortitude.mod === before + 1, `+1 to saves with the toggle on (${ally.saves.fortitude.mod} from ${before})`, { timeout: 4000 });
        since = await bloom("Magnolia");
        await until(() => effectNamed("Magnolia"), "Magnolia's Effect", { timeout: 8000 });
        const expose = await messageAfter(since, itemCard("expose"), { what: "the ally's save card for later" });
        return { hp: ally.system.attributes.hp.value, dc, saves: [before, ally.saves.fortitude.mod], saveCard: Boolean(expose) };
    },

    // Golden Liberator's Feather with 1 action: its ways card; the wings' item card gives its user a fly Speed of 50; the buffet's save card
    // follows, Fortitude DC 41 (basic), at the adjacent enemy targeted.
    async featherBuffet(scene) {
        await clearSquares(scene, [[17, 17], [18, 17]]);
        const { actor: user } = await creature(scene, "Feather User", { type: "character", x: 17, y: 17, level: 19 });
        const { token: foeToken } = await creature(scene, "Feather Foe", { x: 18, y: 17, hp: 400, alliance: "opposition" });
        const feather = await give(user, "Golden Liberator's Feather");
        let since = Date.now();
        await feather.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const card = await messageAfter(since, itemCard("item"), { what: "the wings' card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id);
        const fly = () => Number(user.system.movement?.speeds?.fly?.value ?? user.system.attributes?.speed?.otherSpeeds?.find((entry) => entry.type === "fly")?.value);
        await until(() => fly() === 50, `fly 50 (${fly()})`, { timeout: 8000 });
        const expose = await messageAfter(since, itemCard("expose"), { what: "the buffet's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the buffet's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.against?.value === 41 && check.basic === true && check.statistic === "fortitude", `basic Fortitude DC 41 (${JSON.stringify(check)})`);
        return { fly: fly(), check };
    },

    // Shield of Snakes' Snap Up, held: its card raises the shield with PF2e's own Raise a Shield (its Effect on the user).
    async snakeShieldRaise(scene) {
        await clearSquares(scene, [[19, 15]]);
        const { actor: user } = await creature(scene, "Snake Shield Bearer", { type: "character", x: 19, y: 15, level: 10 });
        const shield = await give(user, "Shield of Snakes");
        await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "Snap Up's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => effect.slug === "raise-a-shield" || /Raise a Shield/.test(effect.name)), "PF2e's Raise a Shield Effect", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Falls through PF2e Automatic Environment Resolution: the environment module's falling hook offers Tumbler's Belt's reaction to the GMs and
    // its owners; Gliding Membranes (Lesser) worn eases a 60-foot fall to 35 feet (17 damage, Prone) through api.fallEases; Land With Grace's
    // Effect (120 feet shorter, on its feet) leaves none.
    async fallsEased(scene) {
        assert(game.modules.get(ENVIRONMENT)?.active, "PF2e Automatic Environment Resolution isn't active in pftest.");
        const { easedFall } = await import(`/modules/pf2e-resolution-core/src/environment/disasters.js?v=${Date.now()}`);
        const { fallEasesOf } = await import(`/modules/${ENVIRONMENT}/scripts/foundry.js?v=${Date.now()}`);
        await clearSquares(scene, [[19, 14]]);
        const { actor: user, token } = await creature(scene, "Belted Faller", { type: "character", x: 19, y: 14 });
        const belt = await give(user, "Tumbler's Belt");
        await belt.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        const membranes = await give(user, "Gliding Membranes (Lesser)");
        // (A graft: implanted, as PF2e equips it.)
        await membranes.update({ "system.equipped.carryType": "implanted", "system.equipped.invested": true });
        let since = Date.now();
        Hooks.callAll(`${ENVIRONMENT}.falling`, { token, feet: 60 });
        const offer = await messageAfter(since, (message) => /is falling 60 feet\. Its reactions: Tumbler/.test(message.content), { what: "the reaction offer" });
        assert(offer.whisper.length > 0, "whispered");
        const worn = easedFall(60, fallEasesOf(user));
        assert(worn.feet === 35 && worn.damage === 17 && worn.prone, `the membranes alone: 35 feet (${JSON.stringify(worn)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.activate(belt.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "Land With Grace's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => effect.flags?.[ENVIRONMENT]?.fall?.shorter === 120), "the belt's Effect", { timeout: 8000 });
        const belted = easedFall(60, fallEasesOf(user));
        assert(belted.damage === 0 && !belted.prone, `no damage, on its feet (${JSON.stringify(belted)})`);
        return { worn, belted };
    },

    // Impact Foam Chassis (Moderate) worn, through the environment module (env f06ece4, core 0e35ee9): its reading of the creature's eases
    // takes 30 off a 60-foot fall's 30 damage; its fell hook then uses the chassis up and leaves the foam with 10 Hit Points around it —
    // Immobilized, its cover's +2 to AC, the ability module's Escape DC 15.
    async foamChassis(scene) {
        assert(game.modules.get(ENVIRONMENT)?.active, "PF2e Automatic Environment Resolution isn't active in pftest.");
        const { easedFall } = await import(`/modules/pf2e-resolution-core/src/environment/disasters.js?v=${Date.now()}`);
        const { fallEasesOf } = await import(`/modules/${ENVIRONMENT}/scripts/foundry.js?v=${Date.now()}`);
        await clearSquares(scene, [[19, 11]]);
        const { actor: user, token } = await creature(scene, "Foam Faller", { type: "character", x: 19, y: 11 });
        const chassis = await give(user, "Impact Foam Chassis (Moderate)");
        // (Worn on the body, as PF2e equips a worn garment: in its slot.)
        await chassis.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true });
        const fall = easedFall(60, fallEasesOf(user));
        assert(fall.before === 30 && fall.damage === 0 && !fall.prone && fall.reductions[0]?.amount === 30 && fall.reductions[0]?.itemUuid === chassis.uuid, `30 off a 60-foot fall (${JSON.stringify(fall)})`);
        const since = Date.now();
        Hooks.callAll(`${ENVIRONMENT}.fell`, { token, feet: 60, damage: fall.before, applied: fall.damage, reductions: fall.reductions });
        const line = await messageAfter(since, (message) => /activates as .*falls: it takes 30 off the falling damage, and its foam \(10 Hit Points\)/.test(message.content), { what: "the foam's line" });
        await until(() => !user.items.get(chassis.id), "the chassis used up", { timeout: 8000 });
        await until(() => user.itemTypes.effect.some((effect) => effect.flags?.[NS]?.foam?.hp === 10), "the foam's Effect with 10 Hit Points", { timeout: 8000 });
        await until(() => user.hasCondition("immobilized"), "Immobilized", { timeout: 8000 });
        const foam = user.itemTypes.effect.find((effect) => effect.flags?.[NS]?.foam);
        const cover = user.armorClass.modifiers.find((modifier) => modifier.slug === "cover");
        assert(cover?.enabled && cover.modifier === 2, `its cover's +2 to AC (${JSON.stringify(cover ?? null)})`);
        assert(Number(foam.flags["pf2e-automatic-ability-resolution"]?.escape?.dc) === 15 && foam.system.duration.value === 1 && foam.system.duration.unit === "minutes", `Escape DC 15, 1 minute (${JSON.stringify(foam.system.duration)})`);
        return { fall, whisper: line.whisper.length, foam: foam.name };
    },

    // Blood-Drinker Blade (Greater)'s Exsanguinate: its card at the creature deals 6d6 persistent bleed and marks it; the bleed's first tick
    // applied gives its user half the Hit Points the creature lost as PF2e's TempHP, for the rest of the minute, the mark used up.
    async exsanguinate(scene) {
        await clearSquares(scene, [[17, 11], [18, 11]]);
        const { actor: user } = await creature(scene, "Exsanguinator", { type: "character", x: 17, y: 11, level: 9 });
        const { actor: foe, token: foeToken } = await creature(scene, "Exsanguinated", { x: 18, y: 11, hp: 200, alliance: "opposition", level: 9 });
        const blade = await give(user, "Blood-Drinker Blade (Greater)");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "Exsanguinate's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const damage = await messageAfter(since, abilitySaveCard, { what: "the damage card at the creature" });
        await applyAbilityCard(damage);
        const bleed = () => foe.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "bleed");
        await until(bleed, "persistent bleed", { timeout: 8000 });
        assert(/6d6/.test(bleed().system.persistent.formula), `6d6 (${bleed().system.persistent.formula})`);
        await until(() => foe.itemTypes.effect.some((effect) => effect.flags?.[NS]?.drain), "the drained mark", { timeout: 8000 });
        const hp = foe.system.attributes.hp.value;
        since = Date.now();
        await bleed().onEndTurn({ token: foeToken.object ?? foeToken });
        const tick = await messageAfter(since, (message) => message.rolls?.[0]?.instances?.some((instance) => instance.type === "bleed"), { what: "the bleed's tick" });
        await foe.applyDamage({ damage: tick.rolls[0], token: foeToken });
        const lost = hp - foe.system.attributes.hp.value;
        assert(lost > 0, `the tick dealt damage (${lost})`);
        await until(() => Number(user.system.attributes.hp.temp) === Math.floor(lost / 2), `half of ${lost} as temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        await until(() => !foe.itemTypes.effect.some((effect) => effect.flags?.[NS]?.drain), "the mark used up", { timeout: 8000 });
        const temp = user.itemTypes.effect.find((effect) => effect.flags?.[NS]?.drainTemp);
        assert(temp && temp.system.duration.value === 1 && temp.system.duration.unit === "minutes", `its Effect for the minute (${JSON.stringify(temp?.system?.duration)})`);
        return { lost, temp: user.system.attributes.hp.temp };
    },

    // Tactician's Helm: a ways card with its four options; Move It! gives PF2e's own Effect, Charge! is a line of the card.
    async tacticianWays(scene) {
        await clearSquares(scene, [[1, 1]]);
        const { actor: user } = await creature(scene, "Tactician", { type: "character", x: 1, y: 1, level: 5 });
        const helm = await give(user, "Tactician's Helm");
        await helm.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(helm.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the helm's ways card" });
        const names = game.messages.get(ways.id).getFlag(NS, "card").plan.ways.map((way) => way.name);
        assert(names.join("|") === "Charge!|Move It!|Protect!|Re-Arm!", `its four options (${names.join(", ")})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const card = await messageAfter(since, itemCard("item"), { what: "Move It!'s card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => /Move It!/.test(effect.name)), "PF2e's Move It! Effect", { timeout: 8000 });
        return { names };
    },

    // Heart of Sarnax: Crush Heart's critical failure stuns the creature (its 7d6 spirit doubled); once Stunned is gone it's Slowed 2 for a
    // minute. Bestow Vim's Quickened for a minute, then Fatigued for an hour once that Quickened ends.
    async sarnaxAfter(scene) {
        await clearSquares(scene, [[2, 1], [3, 1], [4, 1]]);
        const { actor: user } = await creature(scene, "Sarnax Holder", { type: "character", x: 2, y: 1, level: 10 });
        const { actor: foe, token: foeToken } = await creature(scene, "Sarnax Victim", { x: 3, y: 1, hp: 500, save: 0, alliance: "opposition", level: 10 });
        const { actor: ally, token: allyToken } = await creature(scene, "Sarnax Ally", { x: 4, y: 1, level: 10 });
        const use = async (choice, token) => {
            // (A heart for each: its once a day.)
            const heart = await give(user, "Heart of Sarnax");
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(heart.uuid, 0);
            const ways = await messageAfter(since, itemCard("ways"), { what: "the heart's ways card" });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(ways.id, { choice });
            const expose = await messageAfter(since, itemCard("expose"), { what: "the option's card" });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(expose.id, { targets: [token.uuid] });
            return messageAfter(since, abilitySaveCard, { what: "the card at the creature" });
        };
        const crush = await use(1, foeToken);
        await withDie(1, () => rollAndApply(crush));
        await until(() => foe.hasCondition("stunned"), "Stunned", { timeout: 8000 });
        await until(() => foe.itemTypes.effect.some((effect) => effect.flags?.[NS]?.afterEnds?.when === "stunned"), "its mark", { timeout: 8000 });
        await foe.itemTypes.condition.find((condition) => condition.slug === "stunned").delete();
        await until(() => foe.getCondition?.("slowed")?.value === 2, `Slowed 2 (${foe.getCondition?.("slowed")?.value})`, { timeout: 8000 });
        const slowed = foe.itemTypes.effect.find((effect) => effect.flags?.[NS]?.afterEndsThen === "slowed");
        assert(slowed?.system.duration.value === 1 && slowed.system.duration.unit === "minutes", `for a minute (${JSON.stringify(slowed?.system?.duration)})`);
        const vim = await use(0, allyToken);
        await applyAbilityCard(vim);
        await until(() => ally.hasCondition("quickened"), "Quickened", { timeout: 8000 });
        await ally.itemTypes.effect.find((effect) => /Quickened/.test(effect.name) && effect.flags?.["pf2e-automatic-ability-resolution"]?.timedCondition)?.delete();
        await until(() => ally.hasCondition("fatigued"), "Fatigued after", { timeout: 8000 });
        return { slowed: slowed.name, fatigued: ally.itemTypes.effect.find((effect) => effect.flags?.[NS]?.afterEndsThen === "fatigued")?.system.duration };
    },

    // Imposing Shield's Terrifying Block: the ways card's second button — the Shield Block took all the damage — Frightened 3.
    async imposingWorse(scene) {
        await clearSquares(scene, [[5, 1], [6, 1]]);
        const { actor: user } = await creature(scene, "Imposing Blocker", { type: "character", x: 5, y: 1, level: 6 });
        const { actor: foe, token: foeToken } = await creature(scene, "Imposing Attacker", { x: 6, y: 1, alliance: "opposition" });
        const shield = await give(user, "Imposing Shield");
        await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the shield's ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const expose = await messageAfter(since, itemCard("expose"), { what: "the block's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [foeToken.uuid] });
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the card at the attacker" }));
        await until(() => foe.getCondition?.("frightened")?.value === 3, `Frightened 3 (${foe.getCondition?.("frightened")?.value})`, { timeout: 8000 });
        return { frightened: 3 };
    },

    // Skull Bomb thrown: its thrower Blinded for good.
    async skullBlind(scene) {
        await clearSquares(scene, [[7, 1]]);
        const { actor: thrower } = await creature(scene, "Skull Thrower", { x: 7, y: 1, level: 8 });
        const bomb = await give(thrower, "Skull Bomb");
        const since = Date.now();
        await bomb.consume();
        await messageAfter(since, itemCard("expose"), { what: "the bomb's card" });
        await until(() => thrower.hasCondition("blinded"), "its thrower Blinded", { timeout: 8000 });
        return { blinded: true };
    },

    // Starsong Nectar: its Effect on the drinker, the immunity once that Effect is gone.
    async starsongAfter(scene) {
        await clearSquares(scene, [[8, 1]]);
        const { actor: drinker, token } = await creature(scene, "Starsong Drinker", { type: "character", x: 8, y: 1, level: 20 });
        const nectar = await give(drinker, "Starsong Nectar");
        const since = Date.now();
        await nectar.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the nectar's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        await until(() => drinker.itemTypes.effect.some((effect) => effect.flags?.[NS]?.immunityAfter), "its Effect, flagged", { timeout: 8000 });
        const immune = () => drinker.itemTypes.effect.some((effect) => effect.flags?.["pf2e-automatic-ability-resolution"]?.immunity?.slug === "starsong-nectar");
        assert(!immune(), "not immune while it lasts");
        await drinker.itemTypes.effect.find((effect) => effect.flags?.[NS]?.immunityAfter).delete();
        await until(immune, "immune once it's gone", { timeout: 8000 });
        return { immune: true };
    },

    // Captivating Bauble: a failed Will save fascinates; once Fascinated ends, immune for 24 hours.
    async baubleAfter(scene) {
        await clearSquares(scene, [[9, 1], [10, 1]]);
        const { actor: user } = await creature(scene, "Bauble Talker", { type: "character", x: 9, y: 1, level: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Bauble Listener", { x: 10, y: 1, save: 0, alliance: "opposition", level: 12 });
        const bauble = await give(user, "Captivating Bauble");
        let since = Date.now();
        await bauble.consume();
        const expose = await messageAfter(since, itemCard("expose"), { what: "the bauble's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [foeToken.uuid] });
        await withDie(2, async () => rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the Will save card" })));
        await until(() => foe.hasCondition("fascinated"), "Fascinated", { timeout: 8000 });
        await until(() => foe.itemTypes.effect.some((effect) => effect.flags?.[NS]?.afterEnds?.when === "fascinated"), "its mark", { timeout: 8000 });
        const immune = () => foe.itemTypes.effect.some((effect) => effect.flags?.["pf2e-automatic-ability-resolution"]?.immunity?.slug === "captivating-bauble");
        assert(!immune(), "not immune while fascinated");
        const fascinated = foe.itemTypes.condition.find((condition) => condition.slug === "fascinated") ?? foe.itemTypes.effect.find((effect) => /Fascinated/.test(effect.name));
        await fascinated.delete();
        await until(immune, "immune once it ends", { timeout: 8000 });
        return { immune: true };
    },

    // Celestial Peachwood Sword's Violent Exorcism: a failed save destroys the undead, its user's backlash 1d6 void per its level.
    async peachwoodBacklash(scene) {
        await clearSquares(scene, [[11, 1], [12, 1]]);
        const { actor: user } = await creature(scene, "Peachwood Exorcist", { x: 11, y: 1, hp: 300, level: 17 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Peachwood Undead", { x: 12, y: 1, save: 0, alliance: "opposition", level: 4 });
        await undead.update({ "system.traits.value": [...(undead.system.traits.value ?? []), "undead"] });
        const sword = await give(user, "Celestial Peachwood Sword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(sword.uuid, 0);
        const expose = await messageAfter(since, itemCard("expose"), { what: "the exorcism's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [undeadToken.uuid] });
        const hp = user.system.attributes.hp.value;
        await withDie(2, async () => rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the Fortitude save card" })));
        await until(() => user.system.attributes.hp.value < hp, `the backlash (${user.system.attributes.hp.value} of ${hp})`, { timeout: 8000 });
        const lost = hp - user.system.attributes.hp.value;
        assert(lost >= 4 && lost <= 24, `4d6 (${lost})`);
        return { lost, undeadHp: undead.system.attributes.hp.value, dead: undead.hasCondition?.("dead") ?? null };
    },

    // Horns of Naraga's touch: 5d6 void at the creature, its undead wearer healed by what the creature lost.
    async hornsHeal(scene) {
        await clearSquares(scene, [[13, 1], [14, 1]]);
        const { actor: wearer } = await creature(scene, "Naraga Wearer", { x: 13, y: 1, hp: 300, level: 20 });
        await wearer.update({ "system.traits.value": [...(wearer.system.traits.value ?? []), "undead"], "system.attributes.hp.value": 100 });
        const { actor: foe, token: foeToken } = await creature(scene, "Naraga Victim", { x: 14, y: 1, hp: 200, alliance: "opposition", level: 10 });
        const horns = await give(wearer, "Horns of Naraga");
        await horns.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(horns.uuid, 0);
        const expose = await messageAfter(since, itemCard("expose"), { what: "the touch's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [foeToken.uuid] });
        const before = foe.system.attributes.hp.value;
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the damage card" }));
        await until(() => foe.system.attributes.hp.value < before, "the void damage", { timeout: 8000 });
        const lost = before - foe.system.attributes.hp.value;
        await until(() => wearer.system.attributes.hp.value === 100 + lost, `healed ${lost} (${wearer.system.attributes.hp.value})`, { timeout: 8000 });
        return { lost };
    },

    // Swarmeater's Clasp: the damage card at the swarm, its wearer healed by the roll — the swarm's resistance 5 leaves it 5 short of that.
    async swarmeaterHeal(scene) {
        await clearSquares(scene, [[16, 1], [17, 1]]);
        const { actor: wearer } = await creature(scene, "Clasp Wearer", { x: 16, y: 1, hp: 300, level: 10 });
        await wearer.update({ "system.attributes.hp.value": 100 });
        const { actor: swarm, token: swarmToken } = await creature(scene, "Clasp Swarm", { x: 17, y: 1, hp: 200, alliance: "opposition", level: 8 });
        await swarm.update({ "system.traits.value": [...(swarm.system.traits.value ?? []), "swarm"], "system.attributes.resistances": [{ type: "bludgeoning", value: 5 }] });
        const clasp = await give(wearer, "Swarmeater's Clasp");
        await clasp.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(clasp.uuid, 0);
        const expose = await messageAfter(since, itemCard("expose"), { what: "the clasp's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [swarmToken.uuid] });
        const before = swarm.system.attributes.hp.value;
        await applyAbilityCard(await messageAfter(since, abilitySaveCard, { what: "the damage card" }));
        await until(() => swarm.system.attributes.hp.value < before, "the bludgeoning damage", { timeout: 8000 });
        const lost = before - swarm.system.attributes.hp.value;
        await until(() => wearer.system.attributes.hp.value === 100 + lost + 5, `healed ${lost} + 5 (${wearer.system.attributes.hp.value})`, { timeout: 8000 });
        return { lost, healed: lost + 5 };
    },

    // Spark Wafer: its zone placed (the placement click stood in for) with its light at the zone's centre, the light gone with the zone.
    async sparkZoneLight(scene) {
        await clearSquares(scene, [[15, 3]]);
        const { actor: user, token } = await creature(scene, "Spark Thrower", { type: "character", x: 15, y: 3 });
        const wafer = await give(user, "Spark Wafer");
        await token.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        try {
            await wafer.consume();
            const zone = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Spark Wafer/.test(region.name));
            await until(zone, "the sparks' Region", { timeout: 8000 });
            const light = () => scene.lights.find((entry) => entry.flags?.[NS]?.placedLight?.regionUuid === zone()?.uuid);
            await until(light, "its light at the zone", { timeout: 8000 });
            const shape = zone().shapes[0];
            assert(light().config.bright === 5 && light().config.dim === 10 && Math.abs(light().x - shape.x) < 2, `bright 5, dim 10 at its centre (${light().config.bright}/${light().config.dim} ${light().x},${light().y} vs ${shape.x},${shape.y})`);
            const id = light().id;
            await zone().delete();
            await until(() => !scene.lights.get(id), "the light gone with the zone", { timeout: 8000 });
            return { placed: true };
        } finally {
            canvas.regions.placeRegion = placing;
        }
    },

    // Verdant Branch: its fruits in its user's inventory, gone once their 10 minutes are up (their end moved to a second from now).
    async verdantWither(scene) {
        await clearSquares(scene, [[16, 3]]);
        const { actor: user } = await creature(scene, "Verdant Grower", { type: "character", x: 16, y: 3, level: 7 });
        const branch = await give(user, "Verdant Branch");
        await branch.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(branch.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the branch's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const fruit = () => user.items.find((item) => item.name === "Verdant Branch Fruit");
        await until(fruit, "its fruit", { timeout: 8000 });
        assert(Number(fruit().flags[NS].expiresAt) === game.time.worldTime + 600, `withering in 10 minutes (${fruit().flags[NS].expiresAt - game.time.worldTime})`);
        await fruit().update({ [`flags.${NS}.expiresAt`]: game.time.worldTime + 1 });
        await game.time.advance(1);
        await until(() => !fruit(), "the fruit withered", { timeout: 8000 });
        return { withered: true };
    },

    // Sweet Hag's Eye's Meltaway Mint: its own Reflex DC 18 at the creature holding it, 1d4 persistent fire on a failure.
    async meltawayMint(scene) {
        await clearSquares(scene, [[17, 3], [18, 3]]);
        const { actor: hag } = await creature(scene, "Sweet Hag", { x: 17, y: 3, level: 6 });
        const { actor: holder, token: holderToken } = await creature(scene, "Eye Holder", { x: 18, y: 3, save: 0, alliance: "opposition" });
        const eye = await give(hag, "Sweet Hag's Eye");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(eye.uuid, 0);
        const expose = await messageAfter(since, itemCard("expose"), { what: "the mint's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [holderToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the Reflex save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "reflex" && check.against.value === 18, `Reflex DC 18 (${JSON.stringify(check)})`);
        await withDie(5, () => rollAndApply(save));
        await until(() => holder.itemTypes.condition.some((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "fire"), "persistent fire", { timeout: 8000 });
        return { check };
    },

    // Elysian Dew drunk by an unholy creature: no aura, its Fortitude DC 30 save card at it instead.
    async elysianUnholy(scene) {
        await clearSquares(scene, [[1, 5]]);
        const { actor: drinker, token } = await creature(scene, "Unholy Drinker", { x: 1, y: 5, level: 12 });
        await drinker.update({ "system.traits.value": [...(drinker.system.traits.value ?? []), "unholy"] });
        const dew = await give(drinker, "Elysian Dew");
        let since = Date.now();
        await dew.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the dew's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "its save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 30, `Fortitude DC 30 (${JSON.stringify(check)})`);
        assert(!drinker.itemTypes.effect.some((effect) => /Elysian Dew/.test(effect.name) && !/Immune/.test(effect.name)), "no aura");
        return { check };
    },

    // Flame Layer Balm: its wearer marked for the hour; the first fire damage it takes gives it PF2e's Spell Effect: Fiery Body.
    async balmBurst(scene) {
        await clearSquares(scene, [[2, 5]]);
        const { actor: wearer, token } = await creature(scene, "Balm Wearer", { x: 2, y: 5, hp: 200, level: 17 });
        const balm = await give(wearer, "Flame Layer Balm");
        const since = Date.now();
        await balm.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the balm's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        await until(() => wearer.itemTypes.effect.some((effect) => effect.flags?.[NS]?.armed), "the balm's mark", { timeout: 8000 });
        assert(!wearer.itemTypes.effect.some((effect) => /Fiery Body/.test(effect.name)), "no Fiery Body yet");
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await wearer.applyDamage({ damage: await new DamageRoll("6[fire]").evaluate(), token });
        await until(() => wearer.itemTypes.effect.some((effect) => /Fiery Body/.test(effect.name)), "Fiery Body after the fire", { timeout: 8000 });
        assert(!wearer.itemTypes.effect.some((effect) => effect.flags?.[NS]?.armed), "the mark used up");
        const fiery = wearer.itemTypes.effect.find((effect) => /Fiery Body/.test(effect.name));
        return { duration: fiery.system.duration };
    },

    // Ablative Shield Plating (Moderate): its held shield plated with 10 temporary Hit Points; a Shield Block of 15 (Hardness 5) takes 10 of the
    // shield's Hit Points, all off the plating — the shield whole, the plating gone.
    async ablativePlating(scene) {
        await clearSquares(scene, [[5, 5]]);
        const { actor: user, token } = await creature(scene, "Plating Bearer", { type: "character", x: 5, y: 5, level: 5 });
        const shield = await give(user, "Steel Shield");
        await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const plating = await give(user, "Ablative Shield Plating (Moderate)");
        const since = Date.now();
        await plating.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the plating's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        const effect = () => user.itemTypes.effect.find((one) => one.flags?.[NS]?.shieldTemp?.shieldId === shield.id);
        await until(effect, "the plating's Effect", { timeout: 8000 });
        assert(effect().system.badge?.value === 10, `its counter at 10 (${effect().system.badge?.value})`);
        await game.pf2e.actions.raiseAShield({ actors: [user] });
        await until(() => user.attributes.shield?.raised, "the shield raised", { timeout: 8000 });
        const hp = shield.system.hp.value;
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await user.applyDamage({ damage: await new DamageRoll("15[bludgeoning]").evaluate(), token, shieldBlockRequest: true });
        await until(() => !effect(), "the plating used up", { timeout: 8000 });
        assert(shield.system.hp.value === hp, `the shield's Hit Points kept (${shield.system.hp.value} of ${hp})`);
        return { shieldHp: shield.system.hp.value };
    },

    // Ring of the Tiger (Greater): with +1 striking handwraps, its claw's Strike rule has 1 die of its own — PF2e's striking makes it 2d6, not
    // 3d6.
    async tigerClawStriking(scene) {
        await clearSquares(scene, [[6, 5]]);
        const { actor: user, token } = await creature(scene, "Tiger Ring Wearer", { type: "character", x: 6, y: 5, level: 10 });
        const wraps = await give(user, "Handwraps of Mighty Blows");
        await wraps.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true, "system.runes.potency": 1, "system.runes.striking": 1 });
        const ring = await give(user, "Ring of the Tiger (Greater)");
        await ring.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(ring.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the ring's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        const claw = () => user.system.actions.find((action) => /claw/i.test(action.label ?? action.item?.name ?? "") && action.item?.system?.category === "unarmed");
        await until(claw, "the claw's Strike", { timeout: 8000 });
        // (Its own die, the Strike rule's; PF2e's prepared dice with the striking rune's.)
        const base = claw().item._source.system.damage.dice;
        const dice = claw().item.system.damage.dice;
        const striking = claw().item.system.runes?.striking ?? 0;
        assert(base === 1 && striking === 1 && dice === 2, `1 die of its own, striking 1, 2d6 in all (${base}, ${striking}, ${dice})`);
        return { base, striking, dice };
    },

    // Nap Gas Dispenser: a creature that fails is Slowed at once and marked; the end of the user's turn (the one under way) gives nothing, the
    // end of the creature's own next turn gives it Prone and Unconscious for 1 minute.
    async napGasLater(scene) {
        await clearSquares(scene, [[7, 5], [8, 5]]);
        const { actor: user, token: userToken } = await creature(scene, "Nap Gas Thrower", { type: "character", x: 7, y: 5 });
        const { actor: foe, token: foeToken } = await creature(scene, "Nap Gas Sleeper", { x: 8, y: 5, alliance: "opposition", hp: 100, save: -30 });
        const gas = await give(user, "Nap Gas Dispenser");
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            const since = Date.now();
            await gas.consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the gas's card" });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the gas's save card" }));
            const mark = () => foe.itemTypes.effect.find((effect) => effect.flags?.[NS]?.later);
            await until(mark, "the mark for its next turn's end", { timeout: 8000 });
            assert(foe.hasCondition("slowed") && !foe.hasCondition("unconscious"), "slowed now, not asleep yet");
            await combat.nextTurn();
            await wait(800);
            assert(!foe.hasCondition("unconscious"), "not asleep at the user's turn's end");
            await combat.nextTurn();
            await until(() => foe.hasCondition("unconscious") && foe.hasCondition("prone"), "prone and unconscious at its own turn's end", { timeout: 8000 });
            assert(!mark(), "the mark used up");
            return { asleep: true };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Coldstar Pistols' two Strikes on one roll: the readied Strike's attack rolled twice keeping the higher (PF2e's RollTwice), and on a hit
    // the second Strike's damage roll posted by itself.
    async coldstarTwin(scene) {
        await clearSquares(scene, [[9, 5], [10, 5]]);
        const { actor: user, token: userToken } = await creature(scene, "Coldstar Gunner", { type: "character", x: 9, y: 5, level: 20 });
        const { token: foeToken } = await creature(scene, "Coldstar Target", { x: 10, y: 5, alliance: "opposition", ac: 1, hp: 300 });
        const pistols = await give(user, "Coldstar Pistols");
        // (Its rounds, picked as PF2e's ammunition for it: reload 0.)
        const rounds = await give(user, "Rounds (Dueling Pistol)");
        await rounds.update({ "system.quantity": 4 });
        await pistols.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.selectedAmmoId": rounds.id });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(pistols.uuid, 1);
        const card = await messageAfter(since, itemCard("strike"), { what: "the twin Strike's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "RollTwice")), "the readied Strike's RollTwice", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const { attack } = await strike(user, pistols);
        const d20 = attack.rolls[0]?.dice?.[0]?.results?.length ?? 0;
        assert(d20 === 2, `the attack rolled twice (${d20} d20 results)`);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit at AC 1 (${attack.flags.pf2e.context.outcome})`);
        const damage = await messageAfter(since, (message) => message.flags?.pf2e?.context?.type === "damage-roll" && message.actor?.id === user.id, { what: "the second Strike's damage roll" });
        return { d20, outcome: attack.flags.pf2e.context.outcome, damage: damage.rolls[0]?.total };
    },

    // Blackfinger Blight: a contact poison, its card at the creature touched, the save card failed (save −30) — the creature marked; at the
    // start of its own turn its DC 5 flat check to keep hold is rolled (a failure drops its dagger).
    async blackfingerTurns(scene) {
        await clearSquares(scene, [[11, 5], [12, 5]]);
        const { actor: rogue, token: rogueToken } = await creature(scene, "Blight Rogue", { type: "character", x: 11, y: 5, level: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Blight Victim", { x: 12, y: 5, alliance: "opposition", ac: 1, save: -30, hp: 400 });
        const dagger = await give(foe, "Dagger");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const sword = await give(rogue, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const blight = await give(rogue, "Blackfinger Blight");
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: rogueToken.id, sceneId: scene.id, actorId: rogue.id, initiative: 20 }, { tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await blight.consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the poison's card" });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the poison's save card" }));
            const mark = () => foe.itemTypes.effect.find((effect) => effect.flags?.[NS]?.afflictedTurns);
            await until(mark, "the flat check's mark", { timeout: 8000 });
            since = Date.now();
            await combat.nextTurn();
            const flat = await messageAfter(since, (message) => /flat check to keep hold/.test(message.flavor ?? ""), { what: "its turn's flat check", timeout: 8000 });
            const total = flat.rolls[0]?.total;
            if (total < 5) await until(() => foe.items.get(dagger.id)?.system.equipped.carryType === "dropped", "the dagger dropped", { timeout: 8000 });
            return { flat: total, afflicted: foe.itemTypes.effect.filter((effect) => effect.flags?.["pseudo-afflictions"]).map((effect) => effect.name) };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Diplomat's Badge's Diplomat's Bearing: Apply refused before a Recall Knowledge roll; after one (Society, the action's option) reaching DC 20
    // — its user's modifier made huge — PF2e's Effect: Diplomat's Badge on its user.
    async diplomatGate(scene) {
        await clearSquares(scene, [[13, 5]]);
        const { actor: user } = await creature(scene, "Badge Diplomat", { type: "character", x: 13, y: 5, level: 5 });
        const badge = await give(user, "Diplomat's Badge");
        await badge.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(badge.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the badge's card" });
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id).catch((error) => { refused = error.message; });
        assert(/Roll .* recall knowledge first/i.test(refused ?? ""), `refused before the roll (${refused})`);
        await user.skills.society.roll({ dc: { value: 20 }, modifiers: [new game.pf2e.Modifier({ slug: "pftest-sure", label: "Sure", modifier: 40 })], extraRollOptions: ["action:recall-knowledge"], skipDialog: true });
        await wait(500);
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => effect.name === "Effect: Diplomat's Badge"), "PF2e's Effect: Diplomat's Badge", { timeout: 8000 });
        return { refused };
    },

    // Doom Switch's Bragging Rights: its attack card hits (AC 1), the target marked; its user's sword damage that leaves it at 0 gives its user
    // temporary Hit Points equal to its level (twice on a critical success).
    async doomFelled(scene) {
        await clearSquares(scene, [[14, 7], [15, 7]]);
        const { actor: user, token: userToken } = await creature(scene, "Doom Bragger", { type: "character", x: 14, y: 7, level: 8 });
        const { actor: foe, token: foeToken } = await creature(scene, "Doom Target", { x: 15, y: 7, alliance: "opposition", ac: 1, hp: 20, level: 6 });
        const doom = await give(user, "Doom Switch");
        const sword = await give(user, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(doom.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "Bragging Rights' card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the attack card" }));
        const mark = () => foe.itemTypes.effect.find((effect) => effect.flags?.[NS]?.felled);
        await until(mark, "the creature marked", { timeout: 8000 });
        const multiplier = mark().flags[NS].felled.multiplier;
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await foe.applyDamage({ damage: await new DamageRoll("40[slashing]").evaluate(), token: foeToken, item: sword });
        await until(() => user.system.attributes.hp.temp === 6 * multiplier, `temporary Hit Points ${6 * multiplier} (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        return { multiplier, temp: user.system.attributes.hp.temp, userToken: userToken.id };
    },

    // Flashblade's Prepare Flash: the readied Strike's Effect with reach 15 feet; gone before the Strike is made (its time up), the activation's
    // use is given back on the blade's record.
    async flashbladeRefund(scene) {
        await clearSquares(scene, [[16, 7]]);
        const { actor: user } = await creature(scene, "Flash Fencer", { type: "character", x: 16, y: 7, level: 10 });
        const blade = await give(user, "Flashblade");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const record = () => JSON.stringify(user.items.get(blade.id)?.flags?.[NS] ?? {});
        const before = record();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the readied Strike's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const effect = () => user.itemTypes.effect.find((one) => one.flags?.[NS] && Object.values(one.flags[NS]).some((value) => value?.plan?.strike?.readied));
        await until(effect, "the readied Strike's Effect", { timeout: 8000 });
        const used = record();
        assert(used !== before, "the use recorded");
        await effect().delete();
        await until(() => record() !== used, "the use given back", { timeout: 8000 });
        return { before, used, after: record() };
    },

    // Anchor Spear: its card's other shape, a longspear — PF2e's longspear numbers on it (a d8, two hands, reach), its runes kept.
    async anchorReshape(scene) {
        await clearSquares(scene, [[17, 9]]);
        const { actor: user } = await creature(scene, "Anchor Wielder", { type: "character", x: 17, y: 9, level: 10 });
        const spear = await give(user, "Anchor Spear");
        const runes = JSON.stringify(spear.system.runes);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(spear.uuid, 0);
        const card = await messageAfter(since, itemCard("objects"), { what: "the reshape card" });
        await game.modules.get(NS).api.live.apply(card.id, { pick: 0 });
        await until(() => user.items.get(spear.id)?.system.baseItem === "longspear", "the longspear shape", { timeout: 8000 });
        const item = user.items.get(spear.id);
        assert(item.system.damage.die === "d8" && item.system.usage.value === "held-in-two-hands" && item.system.traits.value.includes("reach"), `a longspear's numbers (${item.system.damage.die}, ${item.system.usage.value}, ${item.system.traits.value.join(",")})`);
        assert(JSON.stringify(item.system.runes) === runes, "its runes kept");
        return { die: item.system.damage.die, traits: item.system.traits.value };
    },

    // A longsword etched with Shifting: its rune's card offers PF2e's one-handed melee weapons; a rapier picked — the rapier's numbers on it.
    async shiftingReshape(scene) {
        await clearSquares(scene, [[18, 9]]);
        const { actor: user } = await creature(scene, "Shifting Fencer", { type: "character", x: 18, y: 9, level: 10 });
        const sword = await give(user, "Longsword");
        await sword.update({ "system.runes": { potency: 1, striking: 1, property: ["shifting"] } });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(sword.uuid, "rune:shifting:0");
        const card = await messageAfter(since, itemCard("objects"), { what: "the Shifting card" });
        const choices = card.getFlag(NS, "card").choices;
        const rapier = choices.findIndex((choice) => choice.name === "Rapier");
        assert(rapier >= 0 && !choices.some((choice) => choice.name === "Greatsword"), `one-handed shapes only, the rapier among them (${choices.length})`);
        await game.modules.get(NS).api.live.apply(card.id, { pick: rapier });
        await until(() => user.items.get(sword.id)?.system.baseItem === "rapier", "the rapier shape", { timeout: 8000 });
        const item = user.items.get(sword.id);
        assert(item.system.traits.value.includes("finesse") && item.system.runes.property.includes("shifting"), `a rapier's traits, its runes kept (${item.system.traits.value.join(",")})`);
        return { shapes: choices.length, traits: item.system.traits.value };
    },

    // Armory Bracelet (Moderate): its charm's longbow picked — a +2 striking longbow in hand with 20 arrows, both flagged to crumble; PF2e's Rest for
    // the Night hook (called here, no real rest) takes them away.
    async armoryCharm(scene) {
        await clearSquares(scene, [[19, 9]]);
        const { actor: user } = await creature(scene, "Charm Archer", { type: "character", x: 19, y: 9, level: 8 });
        const bracelet = await give(user, "Armory Bracelet (Moderate)");
        await bracelet.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bracelet.uuid, 0);
        const card = await messageAfter(since, itemCard("objects"), { what: "the charm's card" });
        const choices = card.getFlag(NS, "card").choices;
        const bow = choices.findIndex((choice) => choice.name === "Longbow (bow)");
        assert(bow >= 0, `the longbow among ${choices.length} choices`);
        await game.modules.get(NS).api.live.apply(card.id, { pick: bow });
        const made = () => user.items.filter((item) => item.flags?.[NS]?.made?.by === bracelet.id);
        await until(() => made().length === 2, "the longbow and its arrows", { timeout: 8000 });
        const longbow = made().find((item) => item.type === "weapon");
        const arrows = made().find((item) => item.type === "ammo");
        assert(longbow.system.runes.potency === 2 && longbow.system.runes.striking === 1 && longbow.flags[NS].made.downgradeAt > game.time.worldTime && arrows.system.quantity === 20, `+2 striking, its minute, 20 arrows (${JSON.stringify(longbow.system.runes)}, ${arrows.system.quantity})`);
        Hooks.callAll("pf2e.restForTheNight", user);
        await until(() => made().length === 0, "crumbled at the rest", { timeout: 8000 });
        return { choices: choices.length };
    },

    // Amulet of the Hellcat's Invisible Pounce: Invisible on its Effect, gone with its user's next Strike.
    async hellcatPounce(scene) {
        await clearSquares(scene, [[3, 5], [4, 5]]);
        const { actor: user, token } = await creature(scene, "Hellcat Pouncer", { type: "character", x: 3, y: 5, level: 7 });
        const { token: foeToken } = await creature(scene, "Hellcat Prey", { x: 4, y: 5, alliance: "opposition" });
        const amulet = await give(user, "Amulet of the Hellcat");
        await amulet.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const dagger = await give(user, "Dagger");
        await dagger.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(amulet.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the pounce's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        await until(() => user.hasCondition("invisible"), "Invisible", { timeout: 8000 });
        await token.object?.control?.();
        await target(foeToken);
        await strike(user, dagger);
        await until(() => !user.hasCondition("invisible"), "no longer invisible after the Strike", { timeout: 8000 });
        return { invisible: false };
    },

    // Golden Blade of Mzali's second activation: PF2e's "used Elemental Form" toggle on, the form's Effect at fire.
    async goldenBladeForm(scene) {
        await clearSquares(scene, [[5, 5]]);
        const { actor: user, token } = await creature(scene, "Golden Blade Wielder", { type: "character", x: 5, y: 5, level: 15 });
        const blade = await give(user, "Golden Blade of Mzali");
        await blade.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the form's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        await until(() => user.getRollOptions?.(["all"])?.includes("used-elemental-form") || user.rollOptions?.all?.["used-elemental-form"], "PF2e's toggle on", { timeout: 8000 });
        const form = () => user.itemTypes.effect.find((effect) => /Elemental Form/.test(effect.name));
        await until(form, "the form's Effect", { timeout: 8000 });
        const choice = form().system.rules.find((rule) => rule.key === "ChoiceSet")?.selection ?? form().flags?.pf2e?.rulesSelections?.spellEffectElementalForm;
        assert(choice === "fire", `fire (${choice})`);
        return { choice };
    },

    // Cauthooj Bagpipes' Disorienting Fugue: a critical success's "Immune:" Effect an hour long; a critical failure's creature confused and hit
    // by its own Strike.
    async bagpipesFugue(scene) {
        await clearSquares(scene, [[6, 5], [7, 5], [8, 5]]);
        const { actor: piper } = await creature(scene, "Bagpiper", { type: "character", x: 6, y: 5, level: 13 });
        const { actor: calm, token: calmToken } = await creature(scene, "Fugue Calm", { x: 7, y: 5, save: 40, alliance: "opposition" });
        const { actor: lost, token: lostToken } = await creature(scene, "Fugue Lost", { x: 8, y: 5, hp: 200, save: 0, alliance: "opposition" });
        await lost.createEmbeddedDocuments("Item", [{ name: "Fist", type: "melee", system: { damageRolls: { fist: { damage: "1d4+2", damageType: "bludgeoning" } }, bonus: { value: 5 }, traits: { value: [] }, attackEffects: { value: [] } } }]);
        const pipes = await give(piper, "Cauthooj Bagpipes");
        await pipes.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(pipes.uuid, 0);
        const expose = await messageAfter(since, itemCard("expose"), { what: "the fugue's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(expose.id, { targets: [calmToken.uuid] });
        await withDie(20, async () => rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the calm one's save card" })));
        const immune = () => calm.itemTypes.effect.find((effect) => effect.flags?.["pf2e-automatic-ability-resolution"]?.immunity);
        await until(() => immune()?.system.duration.unit === "hours", `immune for an hour (${JSON.stringify(immune()?.system?.duration)})`, { timeout: 8000 });
        since = Date.now();
        await game.modules.get(NS).api.live.activate(pipes.uuid, 0).catch(() => null);
        const again = await messageAfter(since, itemCard("expose"), { what: "the fugue's second card" }).catch(() => null);
        assert(again, "a second fugue card");
        since = Date.now();
        await game.modules.get(NS).api.live.apply(again.id, { targets: [lostToken.uuid] });
        const before = lost.system.attributes.hp.value;
        await withDie(1, async () => rollAndApply(await messageAfter(since, abilitySaveCard, { what: "the lost one's save card" })));
        await until(() => lost.hasCondition("confused"), "Confused", { timeout: 8000 });
        await until(() => lost.system.attributes.hp.value < before, "hit by its own Strike", { timeout: 10000 });
        return { lost: before - lost.system.attributes.hp.value };
    },

    // Furnace of Endings: a scroll of Harm (void) burned into it on its first card, then cast from it at a foe through the spell module, the
    // furnace empty after.
    async furnaceStored(scene) {
        await clearSquares(scene, [[9, 5], [10, 5]]);
        const { actor: user, token } = await creature(scene, "Furnace Keeper", { type: "character", x: 9, y: 5, level: 5 });
        const { token: foeToken } = await creature(scene, "Furnace Foe", { x: 10, y: 5, hp: 200, alliance: "opposition" });
        const furnace = await give(user, "Furnace of Endings");
        await furnace.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        const harm = await fromUuid((await game.packs.get("pf2e.spells-srd").getIndex()).find((entry) => entry.name === "Harm").uuid);
        // (As PF2e's own scroll keeps it: an id and a location of its own.)
        const spell = { ...harm.toObject(), _id: foundry.utils.randomID() };
        spell.system.location = { value: null, heightenedLevel: 1 };
        await user.createEmbeddedDocuments("Item", [{ name: "Scroll of Harm (Rank 1)", type: "consumable", system: { category: "scroll", quantity: 1, level: { value: 1 }, spell, traits: { value: ["consumable", "magical", "scroll"], rarity: "common" } } }]);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(furnace.uuid, 0);
        const store = await messageAfter(since, itemCard("objects"), { what: "the furnace's card" });
        await game.modules.get(NS).api.live.apply(store.id, { pick: 0 });
        await until(() => furnace.flags?.[NS]?.storedSpell?.name === "Harm", "Harm stored", { timeout: 8000 });
        assert(!user.items.some((item) => item.name === "Scroll of Harm (Rank 1)"), "the scroll burned");
        await token.object?.control?.();
        await target(foeToken);
        since = Date.now();
        await game.modules.get(NS).api.live.activate(furnace.uuid, 0);
        const cast = await messageAfter(since, itemCard("objects"), { what: "the furnace's cast card" });
        await game.modules.get(NS).api.live.apply(cast.id, { targets: [foeToken.uuid] });
        await until(() => !furnace.flags?.[NS]?.storedSpell, "the furnace empty", { timeout: 15000 });
        const spellCard = game.messages.contents.slice(-12).find((message) => message.flags?.["pf2e-automatic-resolution"]?.castFromItem?.itemName === "Furnace of Endings");
        assert(spellCard, "the spell module's cast of Harm");
        return { cast: spellCard.flags["pf2e-automatic-resolution"].castFromItem };
    },

    // Blessed Lantern Flail's Purge Unholy Magic: the readied Strike hits, its Will save card at the creature; a critical failure gives it the
    // spell module's flat check to Cast a Spell, DC 11 for a minute.
    async flailFlatCheck(scene) {
        await clearSquares(scene, [[11, 5], [12, 5]]);
        const { actor: user, token } = await creature(scene, "Lantern Wielder", { type: "character", x: 11, y: 5, level: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Unholy Caster", { x: 12, y: 5, hp: 300, ac: 5, save: 0, alliance: "opposition", level: 10 });
        const flail = await give(user, "Blessed Lantern Flail");
        await flail.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(flail.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await token.object?.control?.();
        await target(foeToken);
        since = Date.now();
        await withDie(15, () => strike(user, flail));
        const save = await messageAfter(since, abilitySaveCard, { what: "the Will save card", timeout: 10000 });
        await withDie(1, () => rollAndApply(save));
        const flat = () => foe.itemTypes.effect.find((effect) => effect.flags?.["pf2e-automatic-resolution"]?.runtime?.castFlatCheck);
        await until(flat, "the flat check's Effect", { timeout: 8000 });
        assert(flat().flags["pf2e-automatic-resolution"].runtime.castFlatCheck.dc === 11 && flat().system.duration.unit === "minutes", `DC 11 for a minute (${JSON.stringify(flat().flags["pf2e-automatic-resolution"].runtime.castFlatCheck)} ${flat().system.duration.unit})`);
        return { dc: 11 };
    },

    // Chromatic Robe's Align Energy used twice (a mythic NPC with 2 Mythic Points): fire, then cold — one resistance Effect left, cold 15, its
    // words saying the others are lost.
    async chromaticReplace(scene) {
        await clearSquares(scene, [[13, 5]]);
        const { actor: user } = await creature(scene, "Chromatic Wearer", { x: 13, y: 5, level: 16 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 2 });
        const robe = await give(user, "Chromatic Robe");
        await robe.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        for (const resistType of [3, 1]) {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(robe.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: "the robe's card" });
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, resistType });
            await until(() => user.itemTypes.effect.some((effect) => effect.flags?.[NS]?.resist && (effect.system.rules ?? []).some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes(["acid", "cold", "electricity", "fire"][resistType]))), `its resistance (${resistType})`, { timeout: 8000 });
        }
        const resists = user.itemTypes.effect.filter((effect) => effect.flags?.[NS]?.resist);
        // (PF2e keeps a Resistance rule's type as a list.)
        assert(resists.length === 1 && resists[0].system.rules.some((rule) => [].concat(rule.type).includes("cold") && rule.value === 15), `one Effect, cold 15 (${resists.map((effect) => JSON.stringify(effect.system.rules)).join(" | ")})`);
        assert(/no resistance from it to the other three types/.test(resists[0].system.description.value), "its words");
        return { left: user.system.resources.mythicPoints.value };
    },

    // Perfected Robes' fortune: its user legendary in Athletics — the Effect's RollTwice for Athletics, spent by the next Athletics check.
    async robesLegendary(scene) {
        await clearSquares(scene, [[14, 5]]);
        const { actor: user } = await creature(scene, "Perfected Monk", { type: "character", x: 14, y: 5, level: 20 });
        await user.update({ "system.skills.athletics.rank": 4 });
        const robes = await give(user, "Perfected Robes");
        await robes.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(robes.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the robes' card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const effect = () => user.itemTypes.effect.find((entry) => (entry.system.rules ?? []).some((rule) => rule.key === "RollTwice"));
        await until(effect, "its RollTwice Effect", { timeout: 8000 });
        // (PF2e keeps a selector as a list.)
        const selectors = effect().system.rules.flatMap((rule) => [].concat(rule.selector ?? []));
        assert(selectors.includes("athletics"), `Athletics among them (${selectors.join(", ")})`);
        await user.skills.athletics.roll({ skipDialog: true });
        await until(() => !effect(), "spent by the Athletics check", { timeout: 8000 });
        return { selectors };
    },

    // Possum's Play: its user Prone, and once its card applies the GM's disbelief card (Perception DC 18): an enemy's roll of 19 sees through
    // it — named on the card, an Effect on it saying so; a second's roll of 2 is still fooled.
    async possumDisbelief(scene) {
        await clearSquares(scene, [[16, 14], [17, 14], [18, 14]]);
        const { actor: user } = await creature(scene, "Possum Player", { type: "character", x: 16, y: 14 });
        const { actor: wolf, token: wolfToken } = await creature(scene, "Possum Wolf", { x: 17, y: 14, alliance: "opposition" });
        const { token: ogreToken } = await creature(scene, "Possum Ogre", { x: 18, y: 14, alliance: "opposition" });
        const charm = await give(user, "Possum's Play");
        let since = Date.now();
        await charm.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "Possum's Play's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.hasCondition("prone"), "its user Prone", { timeout: 8000 });
        const disbelief = await messageAfter(since, itemCard("disbelief"), { what: "the disbelief card" });
        assert(disbelief.whisper.length > 0 && /Perception DC 18/.test(disbelief.content), `whispered, DC 18 (${disbelief.whisper.length})`);
        await withDie(19, () => game.modules.get(NS).api.live.apply(disbelief.id, { targets: [wolfToken.uuid] }));
        await withDie(2, () => game.modules.get(NS).api.live.apply(disbelief.id, { targets: [ogreToken.uuid] }));
        const state = game.messages.get(disbelief.id).getFlag(NS, "card");
        assert(state.saw.length === 1 && /Possum Wolf/.test(state.saw[0]) && /Possum Ogre/.test(state.fooled[0] ?? ""), `the wolf saw through, the ogre fooled (${JSON.stringify([state.saw, state.fooled])})`);
        await until(() => wolf.itemTypes.effect.some((effect) => effect.getFlag(NS, "disbelieved")?.item === "Possum's Play"), "the wolf's Effect", { timeout: 8000 });
        return { saw: state.saw, fooled: state.fooled };
    },

    // Spiritual Warhorn (Lesser) at one enemy: both warriors' Strikes at it, an attack card each (+11, 2d6 force).
    async warhornWarriors(scene) {
        await clearSquares(scene, [[14, 14], [15, 14]]);
        const { actor: user } = await creature(scene, "Warhorn Bugler", { type: "character", x: 14, y: 14 });
        const { token: foeToken } = await creature(scene, "Warhorn Target", { x: 15, y: 14, hp: 300, ac: 1, alliance: "opposition" });
        const horn = await give(user, "Spiritual Warhorn (Lesser)");
        const since = Date.now();
        await horn.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the warhorn's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        await until(() => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).length === 2, "two attack cards", { timeout: 8000 });
        const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
        assert(cards.every((message) => message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.modifier === 11), "each at +11");
        return { cards: cards.length };
    },

    // Boots of the Secret Blade (Greater): a +1 striking dagger in its user's hand, a Strike of its user's, the next activation's dagger
    // replacing it; Necklace of Knives' dagger gone once it's out of the hand; Rust Scrub's 2d4 Hit Points back to a damaged shield.
    async madeBlades(scene) {
        await clearSquares(scene, [[6, 30]]);
        const { actor: user } = await creature(scene, "Blade Drawer", { type: "character", x: 6, y: 30 });
        const draw = async (item, what) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("objects"), { what: `${what}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, {});
        };
        const boots = await give(user, "Boots of the Secret Blade (Greater)");
        const made = (by) => user.items.filter((item) => item.flags?.[NS]?.made?.by === by.id);
        await draw(boots, "Draw Secret Blade");
        await until(() => made(boots).length === 1, "the dagger", { timeout: 8000 });
        const first = made(boots)[0].id;
        await draw(boots, "Draw Secret Blade again");
        await until(() => made(boots).length === 1 && made(boots)[0].id !== first, `one new dagger (${made(boots).length})`, { timeout: 8000 });
        const [dagger] = made(boots);
        assert(dagger.system.equipped.carryType === "held" && dagger.system.runes.potency === 1 && dagger.system.runes.striking === 1, `held, +1 striking (${JSON.stringify(dagger.system.runes)})`);
        assert((user.system.actions ?? []).some((action) => action.item?.id === dagger.id), "a Strike with it");
        const necklace = await give(user, "Necklace of Knives");
        await draw(necklace, "Necklace of Knives");
        await until(() => made(necklace).length === 1, "the knife", { timeout: 8000 });
        await made(necklace)[0].update({ "system.equipped.carryType": "worn", "system.equipped.handsHeld": 0 });
        await until(() => made(necklace).length === 0, "the knife gone out of the hand", { timeout: 8000 });
        // (Rust Scrub: 2d4 Hit Points back to the damaged shield picked.)
        const shield = await give(user, "Steel Shield");
        await shield.update({ "system.hp.value": 4 });
        const scrub = await give(user, "Rust Scrub");
        const since = Date.now();
        await scrub.consume();
        const card = await messageAfter(since, itemCard("objects"), { what: "Rust Scrub's card" });
        const choices = card.getFlag(NS, "card").choices.map((choice) => choice.name);
        await game.modules.get(NS).api.live.apply(card.id, { pick: choices.indexOf("Steel Shield") });
        await until(() => Number(shield.system.hp.value) >= 6 && Number(shield.system.hp.value) <= 12, `2d4 back (${shield.system.hp.value})`, { timeout: 8000 });
        return { dagger: dagger.name, shield: shield.system.hp.value };
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

    // Splithead Bow's Two-Headed Arrow: its PF2e healing toggle off as it's used, back on once its Effect is gone.
    async splitheadToggle(scene) {
        await clearSquares(scene, [[11, 7]]);
        const { actor: archer } = await creature(scene, "Splithead Archer", { type: "character", x: 11, y: 7, level: 8 });
        const bow = await give(archer, "Splithead Bow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        const on = () => Boolean(archer.rollOptions?.all?.["splithead-bow-healing"]);
        await until(on, "the bow's healing on at first", { timeout: 4000 });
        await game.modules.get(NS).api.live.activate(bow.uuid, 0);
        await until(() => !on(), "its healing off", { timeout: 8000 });
        const effect = archer.itemTypes.effect.find((entry) => entry.getFlag(NS, "toggleOff"));
        assert(effect, "its Effect");
        await effect.delete();
        await until(on, "its healing back on", { timeout: 8000 });
        return { effect: effect.name };
    },

    // Bone Dreadnought Plate with a lodestone bomb: its resistance Effect for 20 minutes, a minute shorter after an enemy's slashing hit.
    async boneShortened(scene) {
        await clearSquares(scene, [[9, 7], [10, 7]]);
        const { actor: wearer, token } = await creature(scene, "Bone Plate Wearer", { type: "character", x: 9, y: 7, level: 10 });
        const { actor: foe } = await creature(scene, "Bone Plate Foe", { x: 10, y: 7, alliance: "opposition" });
        const plate = await give(wearer, "Bone Dreadnought Plate");
        await plate.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const bomb = await give(wearer, "Lodestone Bomb");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(plate.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the plate's card" });
        const at = card.getFlag(NS, "card").installed.findIndex((entry) => entry.id === bomb.id);
        await game.modules.get(NS).api.live.apply(card.id, { installedPick: at });
        const effect = () => wearer.itemTypes.effect.find((entry) => entry.getFlag(NS, "shortensOnHit"));
        await until(() => effect()?.system.duration.value === 20, "the 20-minute Effect", { timeout: 8000 });
        const sword = await give(foe, "Longsword");
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        const roll = await new DamageRoll("5[slashing]").evaluate();
        since = Date.now();
        await wearer.applyDamage({ damage: roll, token, item: sword, rollOptions: new Set(["origin:enemy"]) });
        await until(() => effect()?.system.duration.value === 19, `19 minutes left (${effect()?.system.duration.value})`, { timeout: 8000 });
        return { left: effect().system.duration.value };
    },

    // Death Tusk Helm at wounded 2: its roar's save card at DC 18 (16 and its wounded), and its user's 5 temporary Hit Points as it's used.
    async deathTuskRoar(scene) {
        await clearSquares(scene, [[7, 7], [8, 7]]);
        const { actor: wearer } = await creature(scene, "Tusk Wearer", { type: "character", x: 7, y: 7, level: 6 });
        await creature(scene, "Tusk Target", { x: 8, y: 7, alliance: "opposition" });
        await wearer.increaseCondition("wounded", { value: 2 });
        const helm = await give(wearer, "Death Tusk Helm");
        await helm.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(helm.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the roar's card" });
        const dc = game.messages.get(card.id).getFlag(NS, "card").plan.resolution.check.against.value;
        assert(dc === 18, `DC 18 at wounded 2 (${dc})`);
        await until(() => Number(wearer.system.attributes.hp.temp) === 5, `5 temporary Hit Points (${wearer.system.attributes.hp.temp})`, { timeout: 8000 });
        return { dc, temp: wearer.system.attributes.hp.temp };
    },

    // Emetic Paste on its sickened user: an Effect with PF2e's Retch FlatModifier and a roll note while sickened — not a bonus to every
    // Fortitude save.
    async emeticRetch(scene) {
        await clearSquares(scene, [[5, 7]]);
        const { actor: eater, token } = await creature(scene, "Emetic Eater", { type: "character", x: 5, y: 7, level: 4 });
        await eater.increaseCondition("sickened", { value: 1 });
        const paste = await give(eater, "Emetic Paste (Lesser)");
        const before = eater.saves.fortitude.mod;
        const since = Date.now();
        await paste.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the paste's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        const effect = () => eater.itemTypes.effect.find((entry) => (entry.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && JSON.stringify(rule.predicate) === JSON.stringify(["action:retch"])));
        await until(effect, "the Retch Effect", { timeout: 8000 });
        assert(eater.saves.fortitude.mod === before, `its plain Fortitude unchanged (${eater.saves.fortitude.mod} from ${before})`);
        return { effect: effect().name };
    },

    // Three Bird Pinion: its user's Effect ignores difficult and greater difficult terrain (PF2e's rule) for its minute.
    async pinionLevitate(scene) {
        await clearSquares(scene, [[3, 7]]);
        const { actor: flier } = await creature(scene, "Pinion Flier", { type: "character", x: 3, y: 7, level: 4 });
        const pinion = await give(flier, "Three Bird Pinion");
        const since = Date.now();
        await pinion.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the pinion's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const ignored = () => flier.itemTypes.effect.some((entry) => (entry.system.rules ?? []).some((rule) => rule.path === "system.movement.terrain.greater.ignored"));
        await until(ignored, "the levitation's terrain Effect", { timeout: 8000 });
        return { effects: flier.itemTypes.effect.map((entry) => entry.name) };
    },

    // Autoload Leathers: the objects card's reload — its user's Flintlock Pistol (reload 1) loaded with one of its rounds (PF2e's own attach).
    async autoloadReload(scene) {
        await clearSquares(scene, [[17, 11]]);
        const { actor: gunner } = await creature(scene, "Autoload Gunner", { type: "character", x: 17, y: 11, level: 6 });
        const leathers = await give(gunner, "Autoload Leathers");
        await leathers.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const rounds = await give(gunner, "Rounds (Flintlock Pistol)");
        await rounds.update({ "system.quantity": 4 });
        const loaded = () => [...(pistol.subitems ?? [])].filter((entry) => entry.type === "ammo").reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
        assert(loaded() === 0, `empty at first (${loaded()})`);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(leathers.uuid, 0);
        const card = await messageAfter(since, itemCard("objects"), { what: "the reload card" });
        await game.modules.get(NS).api.live.apply(card.id, { pick: 0 });
        await until(() => loaded() === 1, `one round loaded (${loaded()})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results, left: gunner.items.get(rounds.id)?.quantity ?? 0 };
    },

    // Anima Robe (Heroic)'s Billowing Distraction: the robe's own Feint at its Deception +35 against the adjacent creature targeted.
    async animaFeint(scene) {
        await clearSquares(scene, [[15, 9], [16, 9]]);
        const { actor: wearer } = await creature(scene, "Anima Wearer", { type: "character", x: 15, y: 9, level: 18 });
        const { token: foeToken } = await creature(scene, "Anima Mark", { x: 16, y: 9, alliance: "opposition" });
        const robe = await give(wearer, "Anima Robe (Heroic)");
        await robe.update({ "system.equipped.carryType": "worn", "system.equipped.inSlot": true, "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(robe.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the Feint's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const check = (await messageAfter(since, abilitySaveCard, { what: "the Feint's check card" })).flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.modifier === 35 && check.statistic === "deception" && check.against?.statistic === "perception", `Deception +35 against Perception (${JSON.stringify(check)})`);
        return { check };
    },

    // Golden-Cased Bullet (Greater) fired at a target in lesser cover: the attack's DC is its AC without the cover's +1 (PF2e's
    // EphemeralEffect suppressing it, on the readied Strike).
    async goldenCover(scene) {
        await clearSquares(scene, [[17, 9], [19, 9]]);
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Golden Gunner", { type: "character", x: 17, y: 9, level: 10 });
        const { actor: foe, token: foeToken } = await creature(scene, "Covered Mark", { x: 19, y: 9, ac: 18, alliance: "opposition" });
        await give(foe, "Effect: Cover", "pf2e.other-effects");
        await until(() => foe.system.attributes.ac.value === 19, `AC 19 in lesser cover (${foe.system.attributes.ac.value})`, { timeout: 4000 });
        const pistol = await give(gunner, "Flintlock Pistol");
        const rounds = await give(gunner, "Golden-Cased Bullet (Greater)");
        await rounds.update({ "system.quantity": 3, "system.baseItem": "rounds" });
        // (Reload 0 for the test: the readied Strike is what's checked here.)
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.selectedAmmoId": rounds.id, "system.reload.value": "0" });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(rounds.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await gunnerToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(gunner, pistol);
        const dc = attack.flags.pf2e.context.dc?.value;
        assert(dc === 18, `the attack's DC 18, the cover ignored (${dc})`);
        return { dc };
    },

    // Armbands of the Gorgon: the card's picker lists only its user's conditions (slowed, frightened); the one picked is removed, the other stays.
    async armbandsCondition(scene) {
        await clearSquares(scene, [[13, 9]]);
        const { actor: wearer } = await creature(scene, "Gorgon Wearer", { type: "character", x: 13, y: 9, level: 17 });
        await wearer.increaseCondition("frightened", { value: 2 });
        await wearer.increaseCondition("slowed", { value: 1 });
        const armbands = await give(wearer, "Armbands of the Gorgon");
        await armbands.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armbands.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the armbands' card" });
        const choose = game.messages.get(card.id).getFlag(NS, "card").plan.item.reduce[0].choose;
        assert(JSON.stringify(choose) === JSON.stringify(["frightened", "slowed"]), `only its conditions (${JSON.stringify(choose)})`);
        await game.modules.get(NS).api.live.apply(card.id, { reduceChoice: 1 });
        await until(() => !wearer.hasCondition("slowed"), "slowed removed", { timeout: 8000 });
        assert(wearer.hasCondition("frightened"), "frightened stays");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Oracular Crown at cursebound 3: its healing rolled at 7d8, not 3d8 (the formula picked from its user's cursebound value).
    async oracularHeal(scene) {
        await clearSquares(scene, [[11, 9]]);
        const { actor: oracle } = await creature(scene, "Crowned Oracle", { type: "character", x: 11, y: 9, level: 12 });
        await oracle.increaseCondition("cursebound", { value: 3 });
        await until(() => oracle.getCondition?.("cursebound")?.value === 3, `cursebound 3 (${oracle.getCondition?.("cursebound")?.value})`, { timeout: 4000 });
        const crown = await give(oracle, "Oracular Crown");
        await crown.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(crown.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the crown's card" });
        await game.modules.get(NS).api.live.apply(card.id, {});
        await until(() => (game.messages.get(card.id).getFlag(NS, "card").results ?? []).some((line) => /^Rolled 7d8 = /.test(line)), `7d8 rolled (${JSON.stringify(game.messages.get(card.id).getFlag(NS, "card").results)})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Commander's Signet's "a creature you touch": PF2e's Effect on the ally targeted, not on its user (its "self" each target's, 2026-10-26).
    async signetTouch(scene) {
        await clearSquares(scene, [[9, 11], [10, 11]]);
        const { actor: user } = await creature(scene, "Signet Wearer", { type: "character", x: 9, y: 11, level: 8 });
        const { actor: ally, token: allyToken } = await creature(scene, "Signet Ally", { x: 10, y: 11 });
        const signet = await give(user, "Commander's Signet");
        await signet.update({ "system.equipped.carryType": "worn", "system.equipped.invested": true });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(signet.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the signet's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const has = (actor) => actor.itemTypes.effect.some((effect) => effect.name === "Effect: Commander's Signet");
        await until(() => has(ally), "the Effect on the ally", { timeout: 8000 });
        assert(!has(user), "not on its user");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
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

    // A generic spellgun loaded with Acid Grip at rank 2, used up as PF2e uses it (a user's report, 2026-10-20: its card stopped working once
    // the gun was gone). The spell's persistent acid is "@item.level" in its own text, which PF2e reads from the item — the gun, deleted by
    // then: now its loaded rank. The hit's acid and its persistent acid both land on the target.
    async genericSpellgunDamage(scene) {
        await clearSquares(scene, [[10, 13], [13, 13]]);
        const { actor: gunner } = await creature(scene, "Generic Damage Gunner", { type: "character", x: 10, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Generic Damage Target", { x: 13, y: 13, alliance: "opposition", ac: -10, hp: 80 });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const gun = await ownItem(gunner, "generic-spellgun.json");
        const dialog = await dialogTitled(`Load ${gun.name}`);
        const input = dialog.element.querySelector("[name=spell]");
        input.value = optionFor(dialog.element, input, "Acid Grip");
        assert(input.value, "Acid Grip is offered");
        input.dispatchEvent(new Event("input"));
        dialog.element.querySelector("[name=rank]").value = "2";
        dialog.element.querySelector('button[data-action="load"]').click();
        await until(() => /^Acid Grip Spellgun/.test(gun.name), "loaded with Acid Grip");
        const stored = JSON.stringify(gun.getFlag(NS, "genericSpellgun")?.plan ?? {});
        assert(!/@item\./.test(stored), "its plan holds the rank, not @item references");
        const uuid = gun.uuid;
        let since = Date.now();
        await gun.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
        await until(() => !fromUuidSync(uuid), "the spellgun used up", { timeout: 5000 });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const firearm = choices.find((choice) => choice.kind === "firearm");
        assert(firearm, `the firearm attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(firearm) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const before = foe.system.attributes.hp.value;
        await withDie(15, () => rollAndApply(attack));
        const persistent = () => foe.itemTypes.condition.some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "acid");
        await until(() => foe.system.attributes.hp.value < before && persistent(), "the acid and its persistent acid on the target", { timeout: 10000 });
        return { lost: before - foe.system.attributes.hp.value };
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

    // A spell dropped on a character sheet's inventory (the user's request, 2026-10-20): PF2e's maker of scrolls and wands offers a
    // spellgun too. Fireball at rank 5 is a loaded Fireball Spellgun (Rank 5), twice a stack of 2; Ray of Frost, a cantrip, asks its rank
    // (the character's cantrip rank first); Invisibility, which a hit can't carry, makes nothing. None holds PF2e's spell.
    async spellgunFromMaker(scene) {
        await clearSquares(scene, [[10, 21]]);
        const { actor } = await creature(scene, "Spellgun Maker", { type: "character", level: 5, x: 10, y: 21 });
        await actor.sheet.render(true);
        await until(() => actor.sheet.rendered, "the sheet open");
        actor.sheet._tabs?.[0]?.activate?.("inventory");
        await wait(300);
        const make = async (name, kind, rank) => {
            const root = actor.sheet.element?.[0] ?? actor.sheet.element;
            await dropSpell(root.querySelector('.tab[data-tab="inventory"]'), name);
            let maker = null;
            await until(() => (maker = [...foundry.applications.instances.values()].find((app) => app.rendered && app.constructor.name === "SpellcastingItemCreator")), `PF2e's maker for ${name}`);
            const type = maker.element.querySelector("select[name=type]");
            assert([...type.options].some((option) => option.value === kind), `a spellgun offered for ${name} (${[...type.options].map((option) => option.value)})`);
            type.value = kind;
            type.dispatchEvent(new Event("change", { bubbles: true }));
            await wait(200);
            const ranks = maker.element.querySelector("select[name=rank]");
            if (rank && ranks) {
                ranks.value = String(rank);
                ranks.dispatchEvent(new Event("change", { bubbles: true }));
                await wait(200);
            }
            maker.element.querySelector('button[type="submit"]').click();
        };
        const guns = () => actor.items.filter((item) => item.getFlag(NS, "genericSpellgun") || item.system?.spell);
        await make("Fireball", "spellgun", 5);
        await until(() => actor.items.some((item) => item.name === "Fireball Spellgun (Rank 5)"), "the Fireball spellgun");
        await make("Fireball", "spellgun", 5);
        await until(() => actor.items.find((item) => item.name === "Fireball Spellgun (Rank 5)")?.quantity === 2, "a stack of 2");
        await make("Ray of Frost", "spellgunCantrip");
        const asked = await dialogTitled("Ray of Frost Spellgun");
        const usual = asked.element.querySelector("[name=rank]").value;
        assert(usual === "3", `a level 5 character's cantrip rank first (${usual})`);
        asked.element.querySelector("[name=rank]").value = "4";
        asked.element.querySelector('button[data-action="make"]').click();
        await until(() => actor.items.some((item) => item.name === "Ray of Frost Spellgun (Rank 4)"), "the Ray of Frost spellgun");
        await make("Invisibility", "spellgun", 2);
        await wait(2500);
        const made = guns().map((item) => ({ name: item.name, quantity: item.quantity, level: item.level, rank: item.getFlag(NS, "genericSpellgun")?.rank, spell: Boolean(item.system?.spell) }));
        assert(made.length === 2 && made.every((gun) => !gun.spell && gun.rank), `two loaded spellguns, none holding PF2e's spell (${JSON.stringify(made)})`);
        assert(made.find((gun) => gun.name.startsWith("Fireball")).level === 9, "a rank-5 scroll's level");
        await actor.sheet.close();
        return { made };
    },

    // Lacquered Waist Drum's Memories of Joy (docs/needs.md, 2026-10-25): a ghost's save card has its Stupefied, another undead's doesn't.
    async ghostDrum(scene) {
        await clearSquares(scene, [[2, 4], [3, 4], [4, 4]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: drummer } = await creature(scene, "Drum Player", { type: "character", x: 2, y: 4 });
        const { actor: ghost, token: ghostToken } = await creature(scene, "Drum Ghost", { x: 3, y: 4, alliance: "opposition" });
        const { actor: zombie, token: zombieToken } = await creature(scene, "Drum Zombie", { x: 4, y: 4, alliance: "opposition" });
        await ghost.update({ "system.traits.value": ["undead", "ghost"] });
        await zombie.update({ "system.traits.value": ["undead"] });
        const drum = await give(drummer, "Lacquered Waist Drum");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(drum.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the drum's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [ghostToken.uuid, zombieToken.uuid] });
        await until(() => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).length >= 2, "two save cards", { timeout: 10000 });
        const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).map((message) => message.flags[ABILITY].card);
        const failureFor = (actor) => (cards.find((state) => state.targets.some((entry) => entry.actorUuid === actor.uuid))?.plan?.resolution?.outcomes?.failure?.effects ?? []).map((effect) => effect.slug);
        assert(failureFor(ghost).includes("stupefied") && !failureFor(zombie).includes("stupefied"), `the ghost's Stupefied only (${failureFor(ghost)} / ${failureFor(zombie)})`);
        return { ghost: failureFor(ghost), zombie: failureFor(zombie) };
    },

    // Brooch of Inspiration (docs/needs.md, 2026-10-25): its card gives PF2e's RollTwice for the next Lore check.
    async broochLore(scene) {
        await clearSquares(scene, [[6, 4]]);
        const { actor: scholar } = await creature(scene, "Brooch Scholar", { type: "character", x: 6, y: 4 });
        const brooch = await give(scholar, "Brooch of Inspiration");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(brooch.uuid, 0);
        const card = await messageAfter(since, (message) => Boolean(message.getFlag(NS, "card")), { what: "the brooch's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const effect = () => scholar.itemTypes.effect.find((entry) => (entry.system.rules ?? []).some((rule) => rule.key === "RollTwice" && [].concat(rule.selector).includes("lore-skill-check")));
        await until(effect, "the RollTwice Effect for a Lore check", { timeout: 8000 });
        return { effect: effect().name };
    },

    // Submersible Helmet (docs/needs.md, 2026-10-25): its swim Speed and its water breathing, each on its user's Effect for 8 hours.
    async helmetBreathing(scene) {
        await clearSquares(scene, [[8, 4]]);
        const { actor: diver } = await creature(scene, "Helmet Diver", { type: "character", x: 8, y: 4 });
        const helmet = await give(diver, "Submersible Helmet");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(helmet.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the helmet's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const named = (name) => diver.itemTypes.effect.find((entry) => entry.name === `Submersible Helmet: ${name}`);
        await until(() => named("swim Speed") && named("water breathing"), "its two Effects", { timeout: 8000 });
        assert(named("water breathing").system.duration.value === 8 && named("water breathing").system.duration.unit === "hours", "breathing for 8 hours");
        return { swim: diver.system.movement?.speeds?.swim?.value ?? null };
    },

    // Preordained Spear's Delay Doom (docs/needs.md, 2026-10-25): its user's doomed lowered by 1 and a Mythic Point given back once the card applies
    // (a mythic NPC: PF2e gives characters Mythic Points only in a mythic campaign).
    async regainMythic(scene) {
        await clearSquares(scene, [[2, 0]]);
        const { actor: user } = await creature(scene, "Spear Bearer", { x: 2, y: 0 });
        await user.update({ "system.traits.value": [...(user.system.traits.value ?? []), "mythic"] });
        await user.update({ "system.resources.mythicPoints.value": 1 });
        await user.increaseCondition("doomed");
        const spear = await give(user, "Preordained Spear");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(spear.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the spear's card" });
        await game.modules.get(NS).api.live.apply(card.id, {});
        await until(() => !user.hasCondition("doomed") && user.system.resources.mythicPoints.value === 2, "doomed lowered and the point back", { timeout: 8000 });
        return { mythic: user.system.resources.mythicPoints.value };
    },

    // Belt of the Five Kings (docs/needs.md, 2026-10-25): its wearer's Effect, and the allies' own on each ally within 20 feet of it — not one
    // farther away, nor a foe.
    async alliesBelt(scene) {
        await clearSquares(scene, [[4, 0], [6, 0], [10, 0], [5, 1]]);
        const { actor: wearer } = await creature(scene, "Belt Wearer", { type: "character", x: 4, y: 0 });
        const { actor: near } = await creature(scene, "Belt Near Ally", { x: 6, y: 0 });
        const { actor: far } = await creature(scene, "Belt Far Ally", { x: 10, y: 0 });
        const { actor: foe } = await creature(scene, "Belt Foe", { x: 5, y: 1, alliance: "opposition" });
        const belt = await give(wearer, "Belt of the Five Kings");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(belt.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the belt's card" });
        await game.modules.get(NS).api.live.apply(card.id, {});
        const has = (actor, label) => actor.itemTypes.effect.some((effect) => effect.name === `Effect: Belt of the Five Kings (${label})`);
        await until(() => has(wearer, "Wearer") && has(near, "Allies"), "the wearer's and the near ally's Effects", { timeout: 8000 });
        await wait(500);
        assert(!has(far, "Allies") && !has(foe, "Allies") && !has(wearer, "Allies"), "none for the far ally, the foe or the wearer");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Instinct Crown (Dragon) (docs/needs.md, 2026-10-25): its retaliation card kept open while its user rages, closed when its Rage Effect goes.
    async rageCrown(scene) {
        await clearSquares(scene, [[12, 0]]);
        const { actor: barbarian } = await creature(scene, "Crown Barbarian", { type: "character", x: 12, y: 0 });
        const pack = game.packs.get("pf2e.feat-effects");
        const entry = (await pack.getIndex()).find((row) => row.name === "Effect: Rage");
        assert(entry, "PF2e's Effect: Rage");
        const rage = (await pack.getDocument(entry._id)).toObject();
        delete rage._id;
        const [raging] = await barbarian.createEmbeddedDocuments("Item", [rage]);
        const crown = await give(barbarian, "Instinct Crown (Dragon)");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(crown.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the crown's retaliation card" });
        assert(card.getFlag(NS, "card").plan.retaliation.untilRage && card.getFlag(NS, "card").status === "open", "open while raging");
        await raging.delete();
        await until(() => game.messages.get(card.id).getFlag(NS, "card").status === "applied", "closed as the rage ends", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Flare Beacon (docs/needs.md, 2026-10-25): its light at its user's square as it's used (bright 20, dim 40 feet), gone once its time is up.
    // (Its end moved to a second from now, and the world's time a second on: not its whole minute.)
    async flareLight(scene) {
        await clearSquares(scene, [[14, 0]]);
        const { actor: user, token } = await creature(scene, "Flare Thrower", { type: "character", x: 14, y: 0 });
        const flare = await give(user, "Flare Beacon (Lesser)");
        const ours = () => scene.lights.filter((light) => light.flags?.[NS]?.placedLight?.item === "Flare Beacon (Lesser)");
        const before = ours().length;
        await flare.consume();
        await until(() => ours().length === before + 1, "the beacon's light", { timeout: 8000 });
        const light = ours().at(-1);
        const center = token.object?.center ?? { x: token.x + 50, y: token.y + 50 };
        assert(light.config.bright === 20 && light.config.dim === 40 && Math.abs(light.x - center.x) < 2 && Math.abs(light.y - center.y) < 2, `at its square, 20 and 40 feet (${light.x},${light.y} ${light.config.bright}/${light.config.dim})`);
        await light.update({ [`flags.${NS}.placedLight.endsAt`]: game.time.worldTime + 1 });
        await game.time.advance(1);
        await until(() => !scene.lights.get(light.id), "the light gone when its time is up", { timeout: 8000 });
        return { placed: true };
    },

    // Spirit Fan (docs/needs.md, 2026-10-25): its living target healed instead of a save; its undead target's save card. And Lance of Sun's
    // Radiance's dragon: its own save card, at 6d12 spirit.
    async kindHealAndDamage(scene) {
        await clearSquares(scene, [[2, 2], [3, 2], [4, 2], [6, 2], [7, 2]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user } = await creature(scene, "Fan Wielder", { type: "character", x: 2, y: 2 });
        const { actor: living, token: livingToken } = await creature(scene, "Fan Living", { x: 3, y: 2, hp: 50 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Fan Undead", { x: 4, y: 2, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"] });
        await living.update({ "system.attributes.hp.value": 10 });
        const fan = await give(user, "Spirit Fan");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(fan.uuid, 0);
        let card = await messageAfter(since, itemCard("expose"), { what: "the fan's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [livingToken.uuid, undeadToken.uuid] });
        await until(() => living.system.attributes.hp.value > 10, "the living one healed", { timeout: 8000 });
        const fanCards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).map((message) => message.flags[ABILITY].card);
        assert(fanCards.length === 1 && fanCards[0].targets.every((target) => target.actorUuid === undead.uuid), `one save card, the undead's (${fanCards.length})`);
        const { actor: wielder } = await creature(scene, "Lance Wielder", { type: "character", x: 6, y: 2 });
        const { actor: dragon, token: dragonToken } = await creature(scene, "Lance Dragon", { x: 7, y: 2, alliance: "opposition" });
        await dragon.update({ "system.traits.value": ["dragon"] });
        const lance = await give(wielder, "Lance of Sun's Radiance");
        since = Date.now();
        await game.modules.get(NS).api.live.activate(lance.uuid, 1);
        card = await messageAfter(since, itemCard("expose"), { what: "the lance's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [dragonToken.uuid, undeadToken.uuid] });
        await until(() => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).length >= 2, "two save cards", { timeout: 10000 });
        const lanceCards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).map((message) => message.flags[ABILITY].card);
        const formulaFor = (actor) => JSON.stringify(lanceCards.find((state) => state.targets.some((target) => target.actorUuid === actor.uuid))?.plan?.resolution?.sharedDamage ?? null);
        assert(/6d12\[spirit\]/.test(formulaFor(dragon)) && /6d8\[spirit\]/.test(formulaFor(undead)), `the dragon's 6d12, the other's 6d8 (${formulaFor(dragon)} / ${formulaFor(undead)})`);
        return { healedTo: living.system.attributes.hp.value };
    },

    // Pharasmin Visor's Pharasma's Disdain (docs/needs.md, 2026-10-25): its user Dazzled as it's used, beside the undead's save card.
    async visorDazzle(scene) {
        await clearSquares(scene, [[9, 2]]);
        const { actor: user } = await creature(scene, "Visor Wearer", { type: "character", x: 9, y: 2 });
        const visor = await give(user, "Pharasmin Visor");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(visor.uuid, 0);
        await messageAfter(since, itemCard("expose"), { what: "the visor's card" });
        await until(() => user.hasCondition("dazzled"), "its user dazzled", { timeout: 8000 });
        return { dazzled: true };
    },

    // Staff of Sun Wukong's Meteor Slam (docs/needs.md, 2026-10-25): the creature targeted's damage and Enfeebled with no save, then the save
    // card for the others within 10 feet of it — not its wielder.
    async meteorSlam(scene) {
        await clearSquares(scene, [[11, 2], [12, 2], [13, 2]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: wielder } = await creature(scene, "Meteor Wielder", { type: "character", x: 11, y: 2 });
        const { actor: struck, token: struckToken } = await creature(scene, "Meteor Struck", { x: 12, y: 2, alliance: "opposition" });
        const { actor: beside } = await creature(scene, "Meteor Beside", { x: 13, y: 2, alliance: "opposition" });
        const staff = await give(wielder, "Staff of Sun Wukong");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(staff.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the staff's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [struckToken.uuid] });
        await until(() => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).length >= 2, "its two cards", { timeout: 10000 });
        await wait(800);
        const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).map((message) => message.flags[ABILITY].card);
        const forActor = (actor) => cards.find((state) => state.targets.some((target) => target.actorUuid === actor.uuid));
        assert(forActor(struck)?.plan?.resolution?.check?.roll === "automatic" && forActor(beside)?.plan?.resolution?.check?.roll === "save" && !forActor(wielder), `the struck one's automatic card, the other's save, none for the wielder (${cards.length})`);
        return { cards: cards.length };
    },

    // Horned Lion Amulet (docs/needs.md, 2026-10-25): its ways card; the persistent fire way gives both Effects and the DC 10 flat check.
    async hornedLionWays(scene) {
        await clearSquares(scene, [[15, 2]]);
        const { actor: user } = await creature(scene, "Lion Wearer", { type: "character", x: 15, y: 2 });
        const amulet = await give(user, "Horned Lion Amulet");
        let since = Date.now();
        await amulet.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the amulet's ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const card = await messageAfter(since, itemCard("item"), { what: "the persistent fire way's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const has = (name) => user.itemTypes.effect.some((effect) => effect.name === name);
        await until(() => has("Effect: Horned Lion Amulet") && has("Effect: Horned Lion Amulet Recovery"), "both Effects", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Steamflight Pack (docs/needs.md, 2026-10-25): its switch turns its 20-foot fly Speed on, and off again.
    async steamflightToggle(scene) {
        await clearSquares(scene, [[17, 2]]);
        const { actor: pilot } = await creature(scene, "Steam Pilot", { type: "character", x: 17, y: 2 });
        const pack = await give(pilot, "Steamflight Pack");
        const press = async () => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(pack.uuid, 1);
            const card = await messageAfter(since, itemCard("item"), { what: "the switch's card" });
            await game.modules.get(NS).api.live.apply(card.id);
            return card;
        };
        const fly = () => pilot.itemTypes.effect.filter((effect) => effect.flags?.[NS]?.speed === "fly");
        await press();
        await until(() => fly().length === 1 && pilot.system.movement?.speeds?.fly?.value === 20, `a fly Speed of 20 (${pilot.system.movement?.speeds?.fly?.value})`, { timeout: 8000 });
        await press();
        await until(() => fly().length === 0, "turned off", { timeout: 8000 });
        return { toggled: true };
    },

    // A spell dropped on a Generic Spellgun's row in an inventory opens its picker with that spell (not PF2e's maker); loaded with Acid Grip
    // at rank 4, Fear dropped on its sheet makes it Fear's spellgun, with nothing of Acid Grip left in its plan.
    async spellDroppedOnSpellgun(scene) {
        await clearSquares(scene, [[12, 21]]);
        const { actor } = await creature(scene, "Spellgun Dropper", { type: "character", x: 12, y: 21 });
        const gun = await ownItem(actor, "generic-spellgun.json");
        (await dialogTitled(`Load ${gun.name}`)).element.querySelector('button[data-action="later"]').click();
        await actor.sheet.render(true);
        await until(() => actor.sheet.rendered, "the sheet open");
        actor.sheet._tabs?.[0]?.activate?.("inventory");
        await wait(300);
        let row = null;
        await until(() => (row = (actor.sheet.element?.[0] ?? actor.sheet.element)?.querySelector(`.tab[data-tab="inventory"] [data-item-id="${gun.id}"]`)), "its row");
        await dropSpell(row.querySelector(".item-name") ?? row, "Acid Grip");
        let dialog = await dialogTitled(`Load ${gun.name}`);
        assert(dialog.element.querySelector("[name=spell]").value === "Acid Grip", "the spell dropped, in the picker");
        assert(dialog.element.querySelector("[name=rank]").value === "2", "at its own rank first");
        assert(![...foundry.applications.instances.values()].some((app) => app.rendered && app.constructor.name === "SpellcastingItemCreator"), "PF2e's maker not opened too");
        dialog.element.querySelector("[name=rank]").value = "4";
        dialog.element.querySelector('button[data-action="load"]').click();
        await until(() => gun.name === "Acid Grip Spellgun (Rank 4)", "loaded with Acid Grip");
        await actor.sheet.close();
        await gun.sheet.render(true);
        await until(() => gun.sheet.rendered, "its sheet open");
        await dropSpell(gun.sheet.element?.[0] ?? gun.sheet.element, "Fear");
        dialog = await dialogTitled(`Load ${gun.name}`);
        assert(/It holds Acid Grip now/.test(dialog.element.textContent), "the spell it holds, said");
        dialog.element.querySelector('button[data-action="load"]').click();
        await until(() => gun.name === "Fear Spellgun (Rank 1)", "Fear's spellgun");
        const stored = JSON.stringify(gun.getFlag(NS, "genericSpellgun"));
        assert(!/Acid Grip|acid/i.test(stored) && /frightened/.test(stored), "nothing of Acid Grip left");
        await gun.sheet.close();
        return { name: gun.name };
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
    // Fortitude save card at DC 19; a failure (a 5 on the die, 13), and once it's applied (ability 0.9.2's hook) the card for its attacker
    // to pick the space within 10 feet — 15 feet off refused, 10 moved.
    async rocShaftArrow(scene) {
        await clearSquares(scene, [[2, 19], [4, 19], [4, 17], [7, 19]]);
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
        since = Date.now();
        await withDie(5, () => rollAndApply(save));
        const place = await messageAfter(since, itemCard("teleport"), { what: "the card to pick the space" });
        const state = place.getFlag(NS, "card");
        assert(state.user.name.endsWith("Roc Target") && state.plan.teleport.within === 10 && /Archer/.test(state.presser?.name ?? ""), `the target moved, its archer picking (${JSON.stringify([state.user.name, state.plan.teleport.within, state.presser])})`);
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(place.id, { destination: { x: 7 * size, y: 19 * size } }).catch((error) => { refused = error.message; });
        assert(/15 feet away \(the item allows 10\)/.test(refused ?? ""), `15 feet refused (${refused})`);
        await game.modules.get(NS).api.live.apply(place.id, { destination: { x: 4 * size, y: 17 * size } });
        await until(() => foeToken.x === 4 * size && foeToken.y === 17 * size, `the target moved to (4, 17) (${foeToken.x / size}, ${foeToken.y / size})`, { timeout: 8000 });
        return { check, refused, results: game.messages.get(place.id).getFlag(NS, "card").results };
    },

    // Dispersing Bullet: a sling's hit — the Fortitude DC 21 save card at the creature beside the one hit (not it), a failure (a 5, 13)
    // pushing it 10 feet away from the creature hit (down, away from it), not from the slinger (ability 0.9.2's moveFrom).
    async dispersingPush(scene) {
        // (Every square within 10 feet of the creature hit, and the push's path: the save card goes to every creature there.)
        const around = [];
        for (let x = 11; x <= 15; x++) for (let y = 13; y <= 18; y++) around.push([x, y]);
        await clearSquares(scene, [[10, 15], ...around]);
        const { actor: slinger, token: slingerToken } = await creature(scene, "Dispersing Slinger", { type: "character", x: 10, y: 15 });
        const { token: foeToken } = await creature(scene, "Dispersing Target", { x: 13, y: 15, ac: 1, alliance: "opposition" });
        const { token: besideToken } = await creature(scene, "Dispersing Bystander", { x: 13, y: 16, alliance: "opposition" });
        const sling = await give(slinger, "Sling");
        const bullets = await give(slinger, "Dispersing Bullet");
        await bullets.update({ "system.quantity": 3, "system.baseItem": "sling-bullets" });
        await sling.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1, "system.selectedAmmoId": bullets.id, "system.reload.value": "0" });
        let since = 0;
        let attack = null;
        for (let tries = 0; tries < 3 && !["success", "criticalSuccess"].includes(attack?.flags?.pf2e?.context?.outcome); tries++) {
            since = Date.now();
            await game.modules.get(NS).api.live.activate(bullets.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            await slingerToken.object?.control?.();
            await target(foeToken);
            since = Date.now();
            ({ attack } = await strike(slinger, sling));
        }
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the save card around the creature hit" });
        const state = save.flags["pf2e-automatic-ability-resolution"].card;
        assert(state.targets.length === 1 && /Bystander/.test(state.targets[0].name) && state.moveFrom === foeToken.uuid, `the bystander alone, measured from the creature hit (${JSON.stringify([state.targets.map((entry) => entry.name), state.moveFrom])})`);
        await withDie(5, () => rollAndApply(save));
        const size = canvas.grid.size;
        await until(() => besideToken.y === 18 * size && besideToken.x === 13 * size, `pushed 10 feet down, away from the creature hit (${besideToken.x / size}, ${besideToken.y / size})`, { timeout: 10000 });
        return { at: [besideToken.x / size, besideToken.y / size] };
    },

    // Juxtaposition Ammunition from a shortbow (range increment 60 feet): a hit, then a critical failure of the Will DC 28 save (a 5, 13) —
    // Sickened 1, and the card to teleport it: a square 65 feet from the archer refused, one 45 feet from where it stood taken.
    async juxtapositionShot(scene) {
        await clearSquares(scene, [[2, 13], [5, 13], [5, 1], [5, 4]]);
        const { actor: archer, token: archerToken } = await creature(scene, "Juxtaposition Archer", { type: "character", x: 2, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Juxtaposition Target", { x: 5, y: 13, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const ammo = await give(archer, "Juxtaposition Ammunition");
        await ammo.update({ "system.quantity": 3 });
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": ammo.id });
        let since = 0;
        let attack = null;
        for (let tries = 0; tries < 3 && !["success", "criticalSuccess"].includes(attack?.flags?.pf2e?.context?.outcome); tries++) {
            since = Date.now();
            await game.modules.get(NS).api.live.activate(ammo.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            await archerToken.object?.control?.();
            await target(foeToken);
            since = Date.now();
            ({ attack } = await strike(archer, bow));
        }
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the Will save card" });
        const said = await messageAfter(since, (message) => /takes none of the Strike(?:&#39;|')s damage/.test(message.content ?? ""), { what: "the no-damage line" });
        since = Date.now();
        await withDie(5, () => rollAndApply(save));
        const place = await messageAfter(since, itemCard("teleport"), { what: "the card to teleport it" });
        const state = place.getFlag(NS, "card");
        assert(state.plan.teleport.within === 60 && state.plan.teleport.place.nearSource === 60 && state.plan.teleport.place.teleport, `60 feet, within the bow's 60 (${JSON.stringify(state.plan.teleport)})`);
        await until(() => (foe.getCondition("sickened")?.value ?? 0) === 1, "Sickened 1 on the critical failure", { timeout: 8000 });
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(place.id, { destination: { x: 5 * size, y: 1 * size } }).catch((error) => { refused = error.message; });
        assert(/65 feet from .*Juxtaposition Archer \(the item allows 60\)/.test(refused ?? ""), `65 feet from the archer refused (${refused})`);
        await game.modules.get(NS).api.live.apply(place.id, { destination: { x: 5 * size, y: 4 * size } });
        await until(() => foeToken.x === 5 * size && foeToken.y === 4 * size, `the target teleported (${foeToken.x / size}, ${foeToken.y / size})`, { timeout: 8000 });
        return { said: said.id, refused, results: game.messages.get(place.id).getFlag(NS, "card").results };
    },

    // Transposition Ammunition loaded in a shortbow (range increment 60 feet): its user teleported into the square shot — 65 feet off
    // refused, 60 taken.
    async transpositionShot(scene) {
        await clearSquares(scene, [[0, 14], [13, 14], [12, 14]]);
        const { actor: archer, token } = await creature(scene, "Transposition Archer", { type: "character", x: 0, y: 14 });
        const bow = await give(archer, "Shortbow");
        const ammo = await give(archer, "Transposition Ammunition");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": ammo.id });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(ammo.uuid, 0);
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        assert(card.getFlag(NS, "card").weaponRange === 60 && /first range increment \(60 feet\)/.test(card.content), `the bow's 60 feet (${card.getFlag(NS, "card").weaponRange})`);
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 13 * size, y: 14 * size } }).catch((error) => { refused = error.message; });
        assert(/65 feet away \(the item allows 60\)/.test(refused ?? ""), `65 feet refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 12 * size, y: 14 * size } });
        await until(() => token.x === 12 * size && token.y === 14 * size, `the archer teleported (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { refused, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Golden Spur: within 10 feet of the creature targeted, with line of effect — a space past a wall (the lab's own, gone with it) refused, one
    // on this side taken.
    async goldenSpurWall(scene) {
        await clearSquares(scene, [[1, 9], [3, 9], [5, 9], [3, 10]]);
        const { actor: rider, token } = await creature(scene, "Spur Rider", { type: "character", x: 1, y: 9 });
        const { token: foe } = await creature(scene, "Spur Mark", { x: 3, y: 9, alliance: "opposition" });
        const size = canvas.grid.size;
        await scene.createEmbeddedDocuments("Wall", [{ c: [4 * size, 7 * size, 4 * size, 12 * size], move: CONST.WALL_MOVEMENT_TYPES.NORMAL, sight: CONST.WALL_SENSE_TYPES.NORMAL, flags: { [NS]: { [FIXTURE]: true } } }]);
        const spur = await give(rider, "Golden Spur");
        const since = Date.now();
        await spur.consume();
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        assert(/line of effect/.test(card.content), "the card's line of effect");
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 5 * size, y: 9 * size }, targets: [foe.uuid] }).catch((error) => { refused = error.message; });
        assert(/no line of effect/.test(refused ?? ""), `past the wall refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 3 * size, y: 10 * size }, targets: [foe.uuid] });
        await until(() => token.x === 3 * size && token.y === 10 * size, `the rider teleported (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { refused };
    },

    // Whip-Tongue Sling's Tongue Twister: its user's Athletics against Fortitude DC 18 (an 18 on the die, a success); once applied, its
    // user picks the space — up to 15 feet from where the creature was, within 20 feet of them: 20 feet off refused, 25 feet from its user
    // refused, then moved.
    async whipTongue(scene) {
        await clearSquares(scene, [[15, 11], [17, 11], [17, 15], [19, 13], [16, 13]]);
        const { actor: user, token: userToken } = await creature(scene, "Tongue Slinger", { type: "character", x: 15, y: 11 });
        const { token: foeToken } = await creature(scene, "Tongue Mark", { x: 17, y: 11, alliance: "opposition" });
        const sling = await give(user, "Whip-Tongue Sling");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(sling.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "Tongue Twister's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the ability module's Athletics card" });
        since = Date.now();
        await withDie(18, () => rollAndApply(check));
        const place = await messageAfter(since, itemCard("teleport"), { what: "the card to pick the space" });
        const size = canvas.grid.size;
        const refusals = [];
        for (const [x, y] of [[17, 15], [19, 13]]) await game.modules.get(NS).api.live.apply(place.id, { destination: { x: x * size, y: y * size } }).catch((error) => refusals.push(error.message));
        assert(/20 feet away \(the item allows 15\)/.test(refusals[0] ?? "") && /25 feet from .*Tongue Slinger \(the item allows 20\)/.test(refusals[1] ?? ""), `both refused (${refusals.join(" / ")})`);
        await game.modules.get(NS).api.live.apply(place.id, { destination: { x: 16 * size, y: 13 * size } });
        await until(() => foeToken.x === 16 * size && foeToken.y === 13 * size, `the mark moved (${foeToken.x / size}, ${foeToken.y / size})`, { timeout: 8000 });
        assert(userToken.x === 15 * size, "its user where it was");
        return { refusals, results: game.messages.get(place.id).getFlag(NS, "card").results };
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
            // (Its own Region: not one an earlier case left in the scene.)
            const earlier = new Set(scene.regions.map((region) => region.id));
            const fresh = () => scene.regions.find((region) => !earlier.has(region.id) && region.flags?.["pf2e-automatic-ability-resolution"]?.zone);
            await game.modules.get(NS).api.live.activate(shield.uuid, 0);
            await until(() => fresh(), "the aura's Region", { timeout: 8000 });
            const region = fresh();
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

    // Candlecap: its activation lights its wearer's token (20 feet dim, no end); its next activation puts it out.
    async candlecapLight(scene) {
        const { actor: wearer, token } = await creature(scene, "Candle Wearer", { type: "character", x: 6, y: 18 });
        const cap = await give(wearer, "Candlecap");
        const lights = () => wearer.itemTypes.effect.filter((effect) => effect.system.rules.some((rule) => rule.key === "TokenLight"));
        const press = async (what) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(cap.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what });
            await game.modules.get(NS).api.live.apply(card.id, {});
            return card;
        };
        await press("the candlecap's card");
        await until(() => lights().some((effect) => effect.system.rules.some((rule) => rule.value?.dim === 20) && effect.system.duration.unit === "unlimited"), "the unlimited TokenLight Effect", { timeout: 8000 });
        await wait(500);
        const lit = { bright: token.light?.bright ?? null, dim: token.light?.dim ?? null };
        await press("the candlecap's second card");
        await until(() => lights().length === 0, "the light put out", { timeout: 8000 });
        return { lit };
    },

    // Flame Navette (Determination): its user's frightened ends outright on the counteract card, no DC or rank asked; no one else offered.
    async flameNavette(scene) {
        const { actor: user } = await creature(scene, "Navette Wearer", { type: "character", x: 8, y: 16 });
        await creature(scene, "Navette Neighbor", { type: "character", x: 9, y: 16 });
        await user.increaseCondition("frightened");
        const navette = await give(user, "Flame Navette");
        const since = Date.now();
        await navette.consume();
        const card = await messageAfter(since, itemCard("counteract"), { what: "the counteract card" });
        const drinkers = card.getFlag(NS, "card").drinkers.map((entry) => entry.name);
        assert(drinkers.length === 1, `only its user offered (${JSON.stringify(drinkers)})`);
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await wait(500);
        const rows = game.messages.get(card.id).getFlag(NS, "card").rows;
        assert(rows.some((row) => row.slug === "frightened" && row.ends), `frightened listed, ending outright (${JSON.stringify(rows)})`);
        await game.modules.get(NS).api.live.apply(card.id, { rows: rows.map((row) => ({ ticked: row.slug === "frightened" })) });
        await until(() => !user.hasCondition("frightened"), "frightened ended", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Iron Cudgel (Brutal Finish): readied, then a failed greataxe Strike posts the axe's 1d12 slashing at the foe it missed. (The foe's
    // AC is set so a failure is likely; the Strike is readied again until one fails.)
    async ironCudgel(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Cudgel Fighter", { type: "character", x: 13, y: 7 });
        const axe = await give(fighter, "Greataxe");
        await axe.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await wait(500);
        const modifier = (fighter.system.actions ?? []).find((entry) => entry.item?.id === axe.id)?.totalModifier ?? 0;
        const { actor: foe, token: foeToken } = await creature(scene, "Cudgel Target", { x: 14, y: 7, ac: modifier + 13, alliance: "opposition", hp: 200 });
        await fighterToken.object?.control?.();
        await target(foeToken);
        const outcomes = [];
        for (let attempt = 0; attempt < 8; attempt++) {
            const cudgel = await give(fighter, "Iron Cudgel");
            let since = Date.now();
            await cudgel.consume();
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), "the readied Strike", { timeout: 6000 });
            since = Date.now();
            const { attack } = await strike(fighter, axe);
            const outcome = attack.flags.pf2e.context.outcome;
            outcomes.push(outcome);
            if (outcome !== "failure") {
                // (The hit spends it too, on the GM's hook: whichever comes first.)
                for (const effect of fighter.itemTypes.effect.filter((entry) => entry.getFlag(NS, "strikeRider"))) await effect.delete().catch(() => null);
                continue;
            }
            const damage = await messageAfter(since, abilitySaveCard, { what: "the failure's damage card" });
            const component = damage.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.sharedDamage.components[0];
            assert(component.formula === "1d12" && component.type === "slashing", `the axe's die (${JSON.stringify(component)})`);
            const before = foe.system.attributes.hp.value;
            await applyAbilityCard(damage);
            await until(() => foe.system.attributes.hp.value < before, "the die's damage on the foe", { timeout: 10000 });
            assert(!fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), "the readied Strike spent");
            return { outcomes, lost: before - foe.system.attributes.hp.value };
        }
        throw new Error(`no failure in ${outcomes.length} Strikes (${outcomes.join(", ")})`);
    },

    // Energizing Lattice's release: the readied Strike's failure (not a critical failure) posts half of its 6d6 force on the ability module's
    // card at the creature missed, and the foe loses that much.
    async energizingLattice(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Lattice Fighter", { type: "character", x: 14, y: 3 });
        const axe = await give(fighter, "Greataxe");
        await axe.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await wait(500);
        const modifier = (fighter.system.actions ?? []).find((entry) => entry.item?.id === axe.id)?.totalModifier ?? 0;
        const { actor: foe, token: foeToken } = await creature(scene, "Lattice Target", { x: 15, y: 3, ac: modifier + 13, alliance: "opposition", hp: 200 });
        await fighterToken.object?.control?.();
        await target(foeToken);
        const lattice = await give(fighter, "Energizing Lattice");
        const outcomes = [];
        for (let attempt = 0; attempt < 8; attempt++) {
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(lattice.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), "the readied Strike", { timeout: 6000 });
            since = Date.now();
            const { attack } = await strike(fighter, axe);
            const outcome = attack.flags.pf2e.context.outcome;
            outcomes.push(outcome);
            if (outcome !== "failure") {
                for (const effect of fighter.itemTypes.effect.filter((entry) => entry.getFlag(NS, "strikeRider"))) await effect.delete().catch(() => null);
                continue;
            }
            const damage = await messageAfter(since, abilitySaveCard, { what: "the failure's half damage card" });
            const plan = damage.flags["pf2e-automatic-ability-resolution"].card.plan;
            const component = plan.resolution.sharedDamage.components[0];
            assert(component.formula === "6d6" && component.type === "force" && plan.resolution.outcomes.success.damage.multiplier === 0.5, `half of 6d6 force (${JSON.stringify(component)}, ${plan.resolution.outcomes.success.damage.multiplier})`);
            const before = foe.system.attributes.hp.value;
            await applyAbilityCard(damage);
            await until(() => foe.system.attributes.hp.value < before, "the half damage on the foe", { timeout: 10000 });
            const lost = before - foe.system.attributes.hp.value;
            assert(lost >= 3 && lost <= 18, `half of 6d6 (${lost})`);
            assert(!fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), "the readied Strike spent");
            return { outcomes, lost };
        }
        throw new Error(`no failure in ${outcomes.length} Strikes (${outcomes.join(", ")})`);
    },

    // Hydra Head Club's Reactive Snap: activated (a use on the item's record), then a miss with the club — the use given back.
    async hydraHeadClub(scene) {
        const { actor: fighter, token: fighterToken } = await creature(scene, "Hydra Club Fighter", { type: "character", x: 9, y: 6 });
        const club = await give(fighter, "Hydra Head Club");
        await club.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await wait(500);
        const modifier = (fighter.system.actions ?? []).find((entry) => entry.item?.id === club.id)?.totalModifier ?? 0;
        const { token: foeToken } = await creature(scene, "Hydra Club Target", { x: 10, y: 6, ac: modifier + 30, alliance: "opposition", hp: 200 });
        await fighterToken.object?.control?.();
        await target(foeToken);
        const uses = () => club.getFlag(NS, "activationUses")?.[0]?.count ?? 0;
        const outcomes = [];
        for (let attempt = 0; attempt < 4; attempt++) {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(club.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")) && uses() === 1, `readied, one use recorded (${uses()})`, { timeout: 6000 });
            const { attack } = await strike(fighter, club);
            const outcome = attack.flags.pf2e.context.outcome;
            outcomes.push(outcome);
            if (!["failure", "criticalFailure"].includes(outcome)) {
                for (const effect of fighter.itemTypes.effect.filter((entry) => entry.getFlag(NS, "strikeRider"))) await effect.delete().catch(() => null);
                await club.unsetFlag(NS, "activationUses");
                continue;
            }
            await until(() => uses() === 0 && !fighter.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider")), `the miss gives the use back (${uses()})`, { timeout: 8000 });
            return { outcomes };
        }
        throw new Error(`no miss in ${outcomes.length} Strikes (${outcomes.join(", ")})`);
    },

    // Warding Tattoo (Fiend)'s Inked Safeguard: the readied Effect with resistance 2 and, against fiends, 5 (PF2e's own predicate).
    async wardingTattoo(scene) {
        const { actor: user } = await creature(scene, "Tattoo Bearer", { type: "character", x: 1, y: 0 });
        const tattoo = await give(user, "Warding Tattoo (Fiend)");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the tattoo's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const resistances = () => user.itemTypes.effect.flatMap((effect) => (effect.system.rules ?? []).filter((rule) => rule.key === "Resistance").map((rule) => [rule.value, JSON.stringify(rule.predicate ?? null)]));
        await until(() => resistances().some(([value, predicate]) => value === 5 && /origin:trait:fiend/.test(predicate)) && resistances().some(([value]) => value === 2), `resistance 2 and 5 against fiends (${JSON.stringify(resistances())})`, { timeout: 8000 });
        return { resistances: resistances() };
    },

    // Mirrorblade's Mirage Guard: an Effect for 10 minutes with PF2e's flanking.offGuardable false on its user (as PF2e's Deny Advantage sets
    // it), read back from the actor's data.
    async mirrorbladeFlank(scene) {
        const { actor: user } = await creature(scene, "Mirror Duelist", { type: "character", x: 4, y: 0 });
        const blade = await give(user, "Mirrorblade");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the blade's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.system.attributes.flanking?.offGuardable === false, `flanking.offGuardable false (${JSON.stringify(user.system.attributes.flanking)})`, { timeout: 8000 });
        const effect = user.itemTypes.effect.find((entry) => entry.getFlag(NS, "ruleEffect"));
        assert(effect?.system.duration.value === 10 && effect.system.duration.unit === "minutes", `10 minutes (${JSON.stringify(effect?.system.duration)})`);
        return { flanking: user.system.attributes.flanking };
    },

    // Smoldering Armor: its Fire Shield activation used (on the item's record), then its second activation's card recharges it.
    async smolderingRecharge(scene) {
        const { actor: user } = await creature(scene, "Smoldering Wearer", { type: "character", x: 7, y: 0 });
        const armor = await give(user, "Smoldering Armor");
        const uses = (index) => armor.getFlag(NS, "activationUses")?.[index]?.count ?? 0;
        await game.modules.get(NS).api.live.activate(armor.uuid, 0);
        await until(() => uses(0) === 1, `Fire Shield used once (${uses(0)})`, { timeout: 6000 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(armor.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the recharge card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => uses(0) === 0, `Fire Shield recharged (${uses(0)})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Energy Ointment (Lesser), cold picked, on the creature targeted: resistance 5 to cold and the flat check to end its persistent cold
    // damage 2 lower (PF2e's ItemAlteration pd-recovery-dc on its persistent-damage conditions).
    async energyOintment(scene) {
        const { actor: user } = await creature(scene, "Ointment Applier", { type: "character", x: 1, y: 1 });
        const { actor: ally, token: allyToken } = await creature(scene, "Ointment Wearer", { type: "character", x: 2, y: 1 });
        const ointment = await give(user, "Energy Ointment (Lesser)");
        const since = Date.now();
        await ointment.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the ointment's card" });
        const choose = card.getFlag(NS, "card").plan.item.resist[0].choose;
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid], resistType: choose.indexOf("cold") });
        const rules = () => ally.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []);
        await until(() => rules().some((rule) => rule.key === "Resistance" && [].concat(rule.type).includes("cold") && rule.value === 5) && rules().some((rule) => rule.key === "ItemAlteration" && rule.property === "pd-recovery-dc" && rule.value === 2 && JSON.stringify(rule.predicate) === JSON.stringify(["item:damage:type:cold"])), `resistance and the lower DC (${JSON.stringify(rules())})`, { timeout: 8000 });
        return { rules: rules() };
    },

    // Glamorous Buckler's Dazzling Feint: refused after a failed Feint (its user's latest in the chat), then after a successful one the creature
    // targeted Dazzled for 1 round.
    async glamorousFeint(scene) {
        const { actor: user } = await creature(scene, "Glamour Duelist", { type: "character", x: 6, y: 4 });
        const { actor: foe, token: foeToken } = await creature(scene, "Glamour Mark", { x: 7, y: 4, alliance: "opposition" });
        const buckler = await give(user, "Glamorous Buckler");
        const feint = (outcome) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: user }), content: `<p>${PREFIX} Feint (${outcome})</p>`, flags: { pf2e: { context: { type: "skill-check", outcome, options: ["action:feint"] } } } });
        const use = async () => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(buckler.uuid, 0);
            return messageAfter(since, itemCard("expose"), { what: "the buckler's card" });
        };
        await feint("failure");
        let card = await use();
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] }).catch((error) => { refused = error.message; });
        assert(/wasn't a success/.test(refused ?? ""), `refused after a failure (${refused})`);
        await feint("success");
        card = await use();
        const since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the Dazzled's card" });
        await applyAbilityCard(save);
        await until(() => foe.hasCondition("dazzled"), "the mark Dazzled", { timeout: 8000 });
        return { refused };
    },

    // Broken Tusk Pendant: the ways card's +2 (the pendant's animal) — its readied bonus's card, then the Effect with +2 item to AC.
    async brokenTuskWays(scene) {
        const { actor: user } = await creature(scene, "Tusk Bearer", { type: "character", x: 6, y: 14 });
        const pendant = await give(user, "Broken Tusk Pendant");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(pendant.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 1 });
        const fortune = await messageAfter(since, itemCard("fortune"), { what: "the bonus card" });
        await game.modules.get(NS).api.live.apply(fortune.id);
        const bonus = () => user.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac"));
        await until(() => bonus()?.value === 2, `+2 item to AC (${JSON.stringify(bonus())})`, { timeout: 8000 });
        return { bonus: bonus() };
    },

    // Aerekostes's Forward Planning: the fortune Effect lasts to the end of the next turn (1 round, turn end), not a minute.
    async aerekostesFortune(scene) {
        const { actor: user } = await creature(scene, "Aerekostes Wielder", { type: "character", x: 4, y: 16, level: 15 });
        const blade = await give(user, "Aerekostes");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const effect = () => user.itemTypes.effect.find((entry) => (entry.system.rules ?? []).some((rule) => rule.key === "RollTwice"));
        await until(() => effect(), "the RollTwice Effect", { timeout: 8000 });
        const duration = effect().system.duration;
        assert(duration.value === 1 && duration.unit === "rounds" && duration.expiry === "turn-end", `to the end of the next turn (${JSON.stringify(duration)})`);
        return { duration };
    },

    // Copper Penny: its user prone stands up, and has PF2e's Immunity to prone to the end of the turn.
    async copperPenny(scene) {
        const { actor: user } = await creature(scene, "Penny Holder", { type: "character", x: 7, y: 7 });
        await user.increaseCondition("prone");
        await until(() => user.hasCondition("prone"), "prone", { timeout: 5000 });
        const penny = await give(user, "Copper Penny");
        const since = Date.now();
        await penny.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the penny's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const immune = () => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "Immunity" && [].concat(rule.type).includes("prone")));
        await until(() => !user.hasCondition("prone") && immune(), `standing, immune to prone (${user.conditions.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Blindpepper Bolt: after PF2e's critical hit, its DC 17 Fortitude save card carries -2 circumstance (the core's save bonus).
    async blindpepperCritical(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Pepper Archer", { type: "character", x: 8, y: 8 });
        const { token: foeToken } = await creature(scene, "Pepper Target", { x: 9, y: 8, ac: -20, alliance: "opposition" });
        // (A shortbow, the bolts as its arrows: a crossbow wants reloading first, which isn't what's checked here.)
        const bow = await give(archer, "Shortbow");
        await archerToken.object?.control?.();
        await target(foeToken);
        const outcomes = [];
        for (let attempt = 0; attempt < 4; attempt++) {
            const bolts = await give(archer, "Blindpepper Bolt");
            await bolts.update({ "system.baseItem": "arrows" });
            await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": bolts.id });
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(bolts.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            since = Date.now();
            const { attack } = await strike(archer, bow);
            outcomes.push(attack.flags.pf2e.context.outcome);
            const save = await messageAfter(since, abilitySaveCard, { what: "the bolt's save card" });
            const bonus = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.bonus ?? null;
            if (outcomes.at(-1) !== "criticalSuccess") {
                assert(!bonus, `no penalty after a hit (${JSON.stringify(bonus)})`);
                continue;
            }
            assert(bonus?.value === -2 && bonus.type === "circumstance", `-2 circumstance after a critical hit (${JSON.stringify(bonus)})`);
            return { outcomes, bonus };
        }
        throw new Error(`no critical hit in ${outcomes.length} Strikes (${outcomes.join(", ")})`);
    },

    // Admirer's Bouquet handed over: the triggering ally targeted gets +1 item to saves against emotion and mental effects, from the item
    // card's Apply.
    async admirersBouquet(scene) {
        const { actor: giver } = await creature(scene, "Bouquet Giver", { type: "character", x: 16, y: 16 });
        const { actor: ally, token: allyToken } = await creature(scene, "Bouquet Ally", { type: "character", x: 17, y: 16 });
        const bouquet = await give(giver, "Admirer's Bouquet");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bouquet.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the bouquet's card" });
        // (The item card's own Apply, at the creature targeted.)
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const bonus = () => ally.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && rule.type === "item" && Number(rule.value) === 1 && [].concat(rule.selector).includes("saving-throw"));
        await until(bonus, "+1 item to saves on the ally", { timeout: 8000 });
        assert(JSON.stringify(bonus().predicate ?? []).includes("item:trait:mental"), `against mental effects (${JSON.stringify(bonus().predicate)})`);
        return { predicate: bonus().predicate };
    },

    // Cauthooj Bagpipes' Throw Song: the triggering creature's DC 31 Will save card, its failure's redirect words for the GM.
    async throwSong(scene) {
        const { actor: piper } = await creature(scene, "Bagpiper", { type: "character", x: 16, y: 13 });
        const { token: foeToken } = await creature(scene, "Pipe Attacker", { x: 17, y: 13, alliance: "opposition" });
        const pipes = await give(piper, "Cauthooj Bagpipes");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(pipes.uuid, 1);
        const card = await messageAfter(since, itemCard("expose"), { what: "the save card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the ability module's save card" });
        const plan = save.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.statistic === "will" && plan.resolution.check.against.value === 31, `Will DC 31 (${JSON.stringify(plan.resolution.check)})`);
        assert(/redirects the Strike/.test(JSON.stringify(plan.resolution.outcomes.failure.manualInstructions)), "the redirect for the GM on a failure");
        return { save: save.id };
    },

    // Fast healing for the rage (the module's own wording, on an item made here): a raging level-9 wearer's Effect with PF2e's FastHealing 4,
    // gone with the Rage.
    async rageHealing(scene) {
        const { actor: barbarian } = await creature(scene, "Bark Rager", { type: "character", x: 15, y: 19 });
        await barbarian.update({ "system.details.level.value": 9 });
        const html = "<p>Only someone able to Rage can use this crest.</p><p><strong>Activate</strong> <span class=\"action-glyph\">2</span> (envision)</p><p><strong>Effect</strong> Bark knits over your hurts: you gain fast healing equal to one-half your level.</p>";
        const [crest] = await barbarian.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Bark Crest`, type: "equipment", system: { description: { value: html }, level: { value: 6 } } }]);
        const rageSource = (await fromUuid("Compendium.pf2e.feat-effects.Item.z3uyCMBddrPK5umr")).toObject();
        const [rage] = await barbarian.createEmbeddedDocuments("Item", [rageSource]);
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(crest.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the crest's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const healing = () => barbarian.itemTypes.effect.find((effect) => effect.getFlag(NS, "untilRage"))?.system.rules.find((rule) => rule.key === "FastHealing");
        await until(healing, "the FastHealing Effect", { timeout: 8000 });
        assert(Number(healing().value) === 4, `fast healing 4 (${JSON.stringify(healing())})`);
        await rage.delete();
        await until(() => !barbarian.itemTypes.effect.some((effect) => effect.getFlag(NS, "untilRage")), "gone with the Rage", { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // A spell slot an activation costs (the module's own wording, on an item made here): Apply spends the caster's one rank 2 slot (a
    // spontaneous entry's), then refuses with none left.
    async slotCost(scene) {
        const { actor: caster } = await creature(scene, "Slot Caster", { type: "character", x: 17, y: 19 });
        const [entry] = await caster.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Slot Spells`, type: "spellcastingEntry", system: { tradition: { value: "arcane" }, prepared: { value: "spontaneous" }, ability: { value: "cha" }, slots: { slot2: { max: 1, value: 1 } } } }]);
        const html = "<p><strong>Activate—Steel Ward</strong> <span class=\"action-glyph\">3</span> (concentrate)</p><p><strong>Frequency</strong> once per hour</p><p><strong>Cost</strong> a spell slot of rank 2 or higher</p><hr /><p>You gain a +1 status bonus to AC for 1 minute.</p>";
        const [scepter] = await caster.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Slot Scepter`, type: "equipment", system: { description: { value: html }, level: { value: 8 } } }]);
        const press = async (what) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(scepter.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what });
            let refused = null;
            await game.modules.get(NS).api.live.apply(card.id, {}).catch((error) => (refused = error.message));
            return { card, refused };
        };
        const first = await press("the scepter's card");
        await until(() => Number(caster.items.get(entry.id).system.slots.slot2.value) === 0, "the rank 2 slot spent", { timeout: 8000 });
        await until(() => caster.itemTypes.effect.some((effect) => effect.system.rules.some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("ac"))), "the +1 to AC", { timeout: 8000 });
        const second = await press("the scepter's second card");
        await wait(800);
        const state = game.messages.get(second.card.id).getFlag(NS, "card");
        assert(state.status === "open", `refused with no slot left (${second.refused ?? state.status})`);
        return { refused: second.refused, results: game.messages.get(first.card.id).getFlag(NS, "card").results };
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

    // Rhino Shot: after PF2e's critical hit, its DC 19 Fortitude save card has Prone on its success row too (only a critical success escapes).
    async rhinoShotCritical(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Rhino Archer", { type: "character", x: 5, y: 13 });
        const { token: foeToken } = await creature(scene, "Rhino Target", { x: 6, y: 13, ac: -20, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        await archerToken.object?.control?.();
        await target(foeToken);
        const outcomes = [];
        for (let attempt = 0; attempt < 4; attempt++) {
            const arrows = await give(archer, "Rhino Shot");
            await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
            let since = Date.now();
            await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
            const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(600);
            since = Date.now();
            const { attack } = await strike(archer, bow);
            const outcome = attack.flags.pf2e.context.outcome;
            outcomes.push(outcome);
            const save = await messageAfter(since, abilitySaveCard, { what: "the shot's save card" });
            const rows = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.outcomes;
            const prone = (degree) => (rows[degree]?.effects ?? []).some((effect) => effect.slug === "prone");
            if (outcome !== "criticalSuccess") {
                assert(!prone("success") && prone("failure"), `after a hit, the save as written (${outcome})`);
                continue;
            }
            assert(prone("success") && prone("failure") && !prone("criticalSuccess"), `after a critical hit, Prone on the success row (${JSON.stringify(Object.keys(rows).map((degree) => [degree, prone(degree)]))})`);
            return { outcomes };
        }
        throw new Error(`no critical hit in ${outcomes.length} Strikes (${outcomes.join(", ")})`);
    },

    // Guardian Rose, its user at 0 Hit Points and Dying 1 (PF2e's): the healing, Dying and Unconscious gone, Wounded not raised, Enfeebled 1.
    async guardianRose(scene) {
        const { actor: user } = await creature(scene, "Rose Bearer", { type: "character", x: 0, y: 10 });
        await user.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 30 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await until(() => user.system.attributes.hp.max >= 30, "30 maximum Hit Points", { timeout: 5000 });
        await user.update({ "system.attributes.hp.value": 0 });
        if (!user.hasCondition("dying")) await user.increaseCondition("dying");
        if (!user.hasCondition("unconscious")) await user.increaseCondition("unconscious");
        await until(() => user.hasCondition("dying") && user.hasCondition("unconscious"), "dying and unconscious", { timeout: 5000 });
        const wounded = user.getCondition("wounded")?.value ?? 0;
        const rose = await give(user, "Guardian Rose");
        const since = Date.now();
        await rose.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the rose's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.system.attributes.hp.value >= 7 && !user.hasCondition("dying") && !user.hasCondition("unconscious") && user.hasCondition("enfeebled"), `healed, awake, enfeebled (${user.system.attributes.hp.value} HP; ${user.conditions.map((condition) => condition.slug).join(", ")})`, { timeout: 10000 });
        assert((user.getCondition("wounded")?.value ?? 0) === wounded, `Wounded not raised (${wounded} → ${user.getCondition("wounded")?.value ?? 0})`);
        return { hp: user.system.attributes.hp.value, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Immortal Bastion, its user at 0 Hit Points and Dying 1: 1 Hit Point instead, Dying and Unconscious gone with no Wounded, 100 temporary
    // Hit Points.
    async immortalBastion(scene) {
        const { actor: user } = await creature(scene, "Bastion Wearer", { type: "character", x: 0, y: 14 });
        await user.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 30 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await until(() => user.system.attributes.hp.max >= 30, "30 maximum Hit Points", { timeout: 5000 });
        await user.update({ "system.attributes.hp.value": 0 });
        if (!user.hasCondition("dying")) await user.increaseCondition("dying");
        if (!user.hasCondition("unconscious")) await user.increaseCondition("unconscious");
        await until(() => user.hasCondition("dying") && user.hasCondition("unconscious"), "dying and unconscious", { timeout: 5000 });
        const wounded = user.getCondition("wounded")?.value ?? 0;
        const bastion = await give(user, "Immortal Bastion");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bastion.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the bastion's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.system.attributes.hp.value === 1 && user.system.attributes.hp.temp === 100 && !user.hasCondition("dying") && !user.hasCondition("unconscious"), `1 Hit Point, 100 temporary, awake (${user.system.attributes.hp.value}/${user.system.attributes.hp.temp}; ${user.conditions.map((condition) => condition.slug).join(", ")})`, { timeout: 10000 });
        assert((user.getCondition("wounded")?.value ?? 0) === wounded, `Wounded not raised (${wounded} → ${user.getCondition("wounded")?.value ?? 0})`);
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
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

    // Vanishing Wayfinder: its Invisibility for 5 minutes, not the spell's 10 — the spell module's Effect from the cast set to it.
    async wayfinderDuration(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: wearer, token: wearerToken } = await creature(scene, "Wayfinder Wearer", { type: "character", x: 11, y: 6, level: 10 });
        const wayfinder = await give(wearer, "Vanishing Wayfinder");
        await wearerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(wayfinder.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        await game.modules.get(NS).api.live.apply(card.id, {});
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        await until(() => game.messages.get(cast.id)?.getFlag(NS, "castDuration"), "the cast's duration mark", { timeout: 8000 });
        const mark = game.messages.get(cast.id).getFlag(NS, "castDuration");
        // (The spell module's card applies the spell's Effect: its button in the chat log.)
        await until(() => document.querySelector(`[data-message-id="${cast.id}"] .pf2e-auto-runtime-resolve`), "the spell card's Apply button", { timeout: 8000 });
        document.querySelector(`[data-message-id="${cast.id}"] .pf2e-auto-runtime-resolve`).click();
        const effect = () => wearer.itemTypes.effect.find((entry) => entry.system?.context?.origin?.item === mark.spellUuid);
        await until(() => effect(), `the cast's Effect (${wearer.itemTypes.effect.map((entry) => entry.name).join(", ")})`, { timeout: 10000 });
        await until(() => effect().system.duration.value === 5 && effect().system.duration.unit === "minutes", `5 minutes (${JSON.stringify(effect().system.duration)})`, { timeout: 8000 });
        return { effect: effect().name, duration: effect().system.duration, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Enveloping Light: Light cast, and an Effect on its user for 5 rounds that heals 1d4 at the end of each of its turns (the end of a turn
    // called as PF2e's hook would).
    async envelopingHeal(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: wearer, token } = await creature(scene, "Glowing Wearer", { x: 2, y: 18, hp: 20 });
        await wearer.update({ "system.attributes.hp.value": 10 });
        const tattoo = await give(wearer, "Enveloping Light");
        await token.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(tattoo.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [token.uuid] });
        await until(() => wearer.itemTypes.effect.some((effect) => effect.getFlag(NS, "turnHeal")), "the turn heal Effect", { timeout: 15000 });
        const effect = wearer.itemTypes.effect.find((entry) => entry.getFlag(NS, "turnHeal"));
        assert(effect.system.duration.value === 5 && effect.system.duration.unit === "rounds", `5 rounds (${JSON.stringify(effect.system.duration)})`);
        const { turnEndHeal } = await import("../scripts/turn-heal.js");
        const lines = await turnEndHeal(wearer, token);
        assert(wearer.system.attributes.hp.value > 10, `healed (${wearer.system.attributes.hp.value})`);
        return { lines, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Psyche Salts (Moderate): Clear Mind cast on the drinker, and PF2e's +2 item bonus to saves against mental effects for 10 minutes on them.
    async psycheSaltsBonus(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: user } = await creature(scene, "Salts Sniffer", { type: "character", x: 4, y: 18, level: 9 });
        const salts = await give(user, "Psyche Salts (Moderate)");
        const since = Date.now();
        await salts.consume();
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => user.itemTypes.effect.some((effect) => effect.getFlag(NS, "castBonus")), "the bonus Effect", { timeout: 15000 });
        const effect = user.itemTypes.effect.find((entry) => entry.getFlag(NS, "castBonus"));
        const rule = effect.system.rules[0];
        assert(rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && rule.value === 2 && JSON.stringify(rule.predicate) === JSON.stringify(["item:trait:mental"]), `the rule (${JSON.stringify(rule)})`);
        assert(effect.system.duration.value === 10 && effect.system.duration.unit === "minutes", `10 minutes (${JSON.stringify(effect.system.duration)})`);
        return { effect: effect.name, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Iris of the Sky's A Wish Granted With Inevitable Fire: its roll-twice Effect and the mark of what a failure costs; a failed attack roll
    // (its message as PF2e makes it, the failure stated) gives its user 5 persistent fire.
    async irisFailure(scene) {
        // (A creature with Hit Points: PF2e gives none at 0 the persistent damage.)
        const { actor: gunner } = await creature(scene, "Iris Gunner", { x: 6, y: 18, level: 6 });
        const iris = await give(gunner, "Iris of the Sky");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(iris.uuid, 1);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        assert(/5 persistent fire damage/.test(card.content), "the card's failure line");
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => gunner.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollAfter")), "the failure mark", { timeout: 8000 });
        const { fortuneRolled } = await import("../scripts/fortune.js");
        await fortuneRolled({ actor: gunner, token: null, flags: { pf2e: { context: { type: "attack-roll", domains: ["attack", "attack-roll", "strike-attack-roll"], options: [], outcome: "failure" } } } });
        const burning = () => gunner.itemTypes.condition.find((condition) => condition.slug === "persistent-damage" && condition.system.persistent?.damageType === "fire");
        await until(() => burning(), `5 persistent fire (${gunner.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
        assert(!gunner.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollAfter")), "the mark gone");
        return { formula: burning().system.persistent.formula };
    },

    // Warrior's Training Ring: +2 circumstance to the attack roll for a wearer untrained in all weapons, +4 for one expert in simple weapons.
    async trainingRingExpert(scene) {
        const bonusOf = async (name, x, expert) => {
            const { actor } = await creature(scene, name, { type: "character", x, y: 16, level: 5 });
            if (expert) await actor.update({ "system.proficiencies.attacks.simple.rank": 2 });
            const ring = await give(actor, "Warrior's Training Ring");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(ring.uuid, 0);
            const card = await messageAfter(since, itemCard("fortune"), { what: `${name}'s fortune card` });
            await game.modules.get(NS).api.live.apply(card.id);
            await until(() => actor.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")), `${name}'s Effect`, { timeout: 8000 });
            return actor.itemTypes.effect.find((effect) => effect.getFlag(NS, "rollTwice")).system.rules.find((rule) => rule.key === "FlatModifier")?.value;
        };
        const untrained = await bonusOf("Ring Novice", 12, false);
        const expert = await bonusOf("Ring Expert", 14, true);
        assert(untrained === 2 && expert === 4, `+2 and +4 (${untrained}, ${expert})`);
        return { untrained, expert };
    },

    // Boots of the Blight's Swift Sidestep: +2 status to the Reflex save; its success (the save's message as PF2e makes it) makes its user
    // Quickened for 1 minute, the ability module's timed condition.
    async blightSidestep(scene) {
        const { actor: walker } = await creature(scene, "Blight Walker", { x: 8, y: 18, level: 12 });
        const boots = await give(walker, "Boots of the Blight");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(boots.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        assert(/on a success, quickened for 1 minute/.test(card.content), "the card's success line");
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => walker.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")), "the bonus Effect", { timeout: 8000 });
        const { fortuneRolled } = await import("../scripts/fortune.js");
        await fortuneRolled({ actor: walker, token: null, flags: { pf2e: { context: { type: "saving-throw", domains: ["saving-throw", "reflex"], options: [], outcome: "success" } } } });
        await until(() => walker.hasCondition("quickened"), `Quickened (${walker.itemTypes.condition.map((condition) => condition.slug).join(", ")})`, { timeout: 8000 });
        assert(!walker.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")), "the bonus spent");
        return { effects: walker.itemTypes.effect.map((effect) => [effect.name, effect.system.duration?.value, effect.system.duration?.unit]) };
    },

    // Thrice-Fried Mudwings: eaten, a fly Speed Effect; its reaction the first time lowers that fly Speed's rule, the second ends it.
    async mudwingsSteps(scene) {
        const { actor: eater } = await creature(scene, "Mudwing Eater", { x: 10, y: 18, level: 12 });
        const wings = await give(eater, "Thrice-Fried Mudwings");
        let since = Date.now();
        await wings.consume();
        const ways = await messageAfter(since, itemCard("ways"), { what: "the ways card" });
        const pick = async (choice, kind) => {
            since = Date.now();
            await game.modules.get(NS).api.live.apply(ways.id, { choice });
            const card = await messageAfter(since, itemCard(kind), { what: `way ${choice}'s card` });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(800);
            return card;
        };
        await pick(0, "item");
        const fly = () => eater.itemTypes.effect.find((effect) => effect.getFlag(NS, "speed") === "fly");
        await until(() => fly(), "the fly Speed Effect", { timeout: 8000 });
        await pick(1, "fortune");
        await until(() => /min\(15/.test(String(fly()?.system.rules.find((rule) => rule.key === "BaseSpeed")?.value)), `fly lowered (${JSON.stringify(fly()?.system.rules)})`, { timeout: 8000 });
        await pick(1, "fortune");
        await until(() => !fly(), "the fly Speed ended", { timeout: 8000 });
        return { ok: true };
    },

    // Pyrefeather Cloak's Deflect Flame: fire resistance 5 and +1 to saves against the triggering effect, and PF2e's flat check to end its
    // user's persistent fire as the card is applied.
    async pyrefeatherRecovery(scene) {
        const { actor: wearer } = await creature(scene, "Pyrefeather Wearer", { x: 12, y: 18, level: 3 });
        const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
        await wearer.applyDamage({ damage: await new DamageRoll("1[persistent,fire]").evaluate(), token: wearer.getActiveTokens(true, true)[0] });
        await until(() => wearer.itemTypes.condition.some((condition) => condition.slug === "persistent-damage"), "persistent fire to start", { timeout: 8000 });
        const cloak = await give(wearer, "Pyrefeather Cloak");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(cloak.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the fortune card" });
        assert(/a flat check now to end persistent fire damage/.test(card.content), "the card's flat check");
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => (game.messages.get(card.id).getFlag(NS, "card").results ?? []).some((line) => /flat check \(DC \d+\)/.test(line)), `the flat check's line (${JSON.stringify(game.messages.get(card.id).getFlag(NS, "card").results)})`, { timeout: 10000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results, persistent: wearer.itemTypes.condition.filter((condition) => condition.slug === "persistent-damage").length };
    },

    // Medusa's Scream's Petrify at the shield's 30 feet: a creature 40 feet off refused, one 25 feet off cast at.
    async medusaRange(scene) {
        assert(game.modules.get("pf2e-automatic-resolution")?.api?.castFromItem, "The spell module's castFromItem isn't there.");
        const { actor: bearer, token: bearerToken } = await creature(scene, "Medusa Bearer", { type: "character", x: 2, y: 16, level: 14 });
        const { token: far } = await creature(scene, "Medusa Far Foe", { x: 10, y: 16, alliance: "opposition" });
        const { token: near } = await creature(scene, "Medusa Near Foe", { x: 7, y: 16, alliance: "opposition" });
        const shield = await give(bearer, "Medusa's Scream");
        await bearerToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("cast"), { what: "the cast card" });
        assert(/range 30 feet/.test(card.content), "the card's range");
        let refused = null;
        try {
            await game.modules.get(NS).api.live.apply(card.id, { targets: [far.uuid] });
        } catch (error) {
            refused = error.message;
        }
        assert(/beyond/.test(refused ?? ""), `the far foe refused (${refused})`);
        assert(game.messages.get(card.id).getFlag(NS, "card").status === "open", "the card still open");
        await game.modules.get(NS).api.live.apply(card.id, { targets: [near.uuid] });
        const cast = await messageAfter(since, (message) => Boolean(message.flags?.["pf2e-automatic-resolution"]?.castFromItem), { what: "the spell module's cast", timeout: 15000 });
        return { refused, cast: cast.flags["pf2e-automatic-resolution"].castFromItem.dc };
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
        // (Only against what triggered it: a monster's Strike at its user spends it.)
        const { actor: foe, token: foeToken } = await creature(scene, "Branch Attacker", { x: 16, y: 19, alliance: "opposition" });
        await foe.createEmbeddedDocuments("Item", [{ name: "Claw", type: "melee", system: { bonus: { value: 10 }, damageRolls: { claw: { damage: "1d4", damageType: "slashing" } }, traits: { value: [] } } }]);
        const claw = (foe.system.actions ?? []).find((entry) => entry.label === "Claw");
        assert(claw, "the attacker's Claw");
        await foeToken.object?.control?.();
        await target(userToken);
        const rolled = Date.now();
        await claw.variants[0].roll({ event: shift() });
        await messageAfter(rolled, (message) => message.flags?.pf2e?.context?.type === "attack-roll", { what: "the Claw's attack roll" });
        await until(() => !user.itemTypes.effect.some((effect) => effect.getFlag(NS, "rollTwice")), "the Effect spent by the attack", { timeout: 8000 });
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

    // Ghoul Stiletto: its activation readies the dagger's next Strike; a hit at an undead doesn't take it (nothing spent), then the hit at a
    // living one (AC 1) posts the target's DC 17 Fortitude save card and attaches the 10-foot stench aura to the target's token.
    async ghoulStench(scene) {
        const { actor: rogue, token: rogueToken } = await creature(scene, "Stiletto Rogue", { type: "character", x: 2, y: 13 });
        const { actor: foe, token: foeToken } = await creature(scene, "Stench Bearer", { x: 3, y: 13, ac: 1, alliance: "opposition" });
        const { actor: undead, token: undeadToken } = await creature(scene, "Stench Undead", { x: 2, y: 14, ac: 1, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"] });
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
            await target(undeadToken);
            since = Date.now();
            const first = await strike(rogue, dagger);
            if (["success", "criticalSuccess"].includes(first.attack.flags.pf2e.context.outcome)) await messageAfter(since, (message) => /isn't living \(undead\)/.test(message.content), { what: "the undead isn't the one" });
            assert(rogue.itemTypes.effect.some((effect) => effect.flags?.[NS]?.strikeRider), "the rider still readied");
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
        // (Its pull toward the creature hit, ability 0.9.2's moveFrom: on its rows, measured from that creature.)
        const pulled = pull.flags["pf2e-automatic-ability-resolution"].card;
        assert(pulled.moveFrom === foeToken.uuid && pulled.plan.resolution.outcomes.failure.forcedMovement?.kind === "pull", `the pull toward the target (${JSON.stringify([pulled.moveFrom, pulled.plan.resolution.outcomes.failure.forcedMovement])})`);
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

    // Rod of Razors' flechette at a creature 5 feet off: its user's thrown attack –2 for volley 30 feet, against AC, its 3d8 adamantine
    // piercing and, on a critical hit only, the deadly d10 undoubled.
    async rodOfRazors(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Razor Shooter", { type: "character", x: 7, y: 11 });
        const { token: foeToken } = await creature(scene, "Razor Target", { x: 8, y: 11, alliance: "opposition" });
        const rod = await give(user, "Rod of Razors");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(rod.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the rod's card" });
        const choices = card.getFlag(NS, "card").attackChoices ?? [];
        const thrown = choices.find((choice) => choice.kind === "thrown") ?? choices[0];
        assert(thrown, `an attack offered (${JSON.stringify(choices)})`);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid], attackChoice: choices.indexOf(thrown) });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const plan = attack.flags["pf2e-automatic-ability-resolution"].card.plan;
        assert(plan.resolution.check.modifier === thrown.modifier - 2, `volley's –2 (${plan.resolution.check.modifier} from ${thrown.modifier})`);
        const formulas = plan.resolution.sharedDamage.components.map((component) => component.formula);
        assert(formulas.join() === "3d8[piercing,adamantine],1d10[piercing,adamantine]", formulas.join(" / "));
        const critical = plan.resolution.outcomes.criticalSuccess.damage;
        assert(critical.componentMultipliers?.deadly === 1 && plan.resolution.outcomes.success.damage.sourceComponentIds.join() === "0", JSON.stringify(critical));
        assert(game.messages.get(card.id).getFlag(NS, "card").results.some((line) => /5 feet away: –2 volley within 30 feet/.test(line)), "the card says so");
        return { modifier: plan.resolution.check.modifier, formulas };
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
        // (Each ended by an Escape against DC 16, src/compiler/escape-ends.js — 2026-10-25.)
        assert(plan.resolution.outcomes.success.modifiers.every((modifier) => modifier.escape?.dc === 16) && plan.resolution.outcomes.criticalSuccess.effects.every((effect) => effect.duration?.escape?.dc === 16), "its Escape DC 16 on what it gives");
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
        const hardness = () => user.items.get(shield.id)?.system?.hardness;
        const hard = hardness();
        await press();
        await until(() => ac() === 2 && user.items.get(shield.id)?.system?.speedPenalty === -5, `a tower shield's +2 AC and –5 Speed (now ${ac()}, ${user.items.get(shield.id)?.system?.speedPenalty})`, { timeout: 8000 });
        // (Its Hardness 2 higher in this form, PF2e's ItemAlteration.)
        await until(() => hardness() === hard + 2, `Hardness ${hard} + 2 (now ${hardness()})`, { timeout: 8000 });
        await press();
        await until(() => ac() === before && hardness() === hard, `back to a buckler's +${before} and Hardness ${hard} (now ${ac()}, ${hardness()})`, { timeout: 8000 });
        return { before, tower: 2, hardness: [hard, hard + 2] };
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

    // Dweomerveil's Dimension Leap: a space 40 feet off refused, then the same space after a critical success (within 45 feet) — the token
    // there at once.
    async dweomerLeap(scene) {
        await clearSquares(scene, [[0, 2], [8, 2]]);
        const { actor: user, token } = await creature(scene, "Dweomer Leaper", { type: "character", x: 0, y: 2 });
        const veil = await give(user, "Dweomerveil");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(veil.uuid, 0);
        const card = await messageAfter(since, itemCard("teleport"), { what: "the teleport card" });
        const size = canvas.grid.size;
        let refused = null;
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 8 * size, y: 2 * size } }).catch((error) => { refused = error.message; });
        assert(/40 feet away/.test(refused ?? ""), `40 feet refused (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 8 * size, y: 2 * size }, critical: true });
        await until(() => token.x === 8 * size && token.y === 2 * size, `the token at (8, 2) (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Quartz-Coil Rail Transport (Lesser), a consumable: up to 20 feet — 25 feet off refused, then 20 feet off, the token there at once; 2
    // electricity damage to its user and the creature on the line between, not to the one beside it.
    async quartzCoil(scene) {
        await clearSquares(scene, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5]]);
        const { actor: user, token } = await creature(scene, "Coil Rider", { type: "character", x: 0, y: 4 });
        const { actor: between } = await creature(scene, "Coil Bystander", { x: 2, y: 4 });
        const { actor: beside } = await creature(scene, "Coil Onlooker", { x: 2, y: 5 });
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
        await until(() => between.system.attributes.hp.value === 48, `the bystander on the line took 2 (${between.system.attributes.hp.value})`, { timeout: 8000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(beside.system.attributes.hp.value === 50, `the onlooker off the line untouched (${beside.system.attributes.hp.value})`);
        assert(results.some((line) => /^2 electricity damage to .*Coil Rider.*Coil Bystander/.test(line)), results.join(" / "));
        return { results };
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

    // Squire's Tabard's At Your Aid, its user's own move (src/compiler/move.js): two Strides, its 25-foot Speed twice, ending beside an ally —
    // a space 10 feet from the ally refused, then one beside it, the token moved there.
    async squireAid(scene) {
        return unpaused(async () => {
            // (And every square beside where it stops: no other ally there.)
            const beside = [];
            for (let x = 4; x <= 8; x++) for (let y = 16; y <= 18; y++) beside.push([x, y]);
            await clearSquares(scene, [[0, 17], ...beside]);
            const { actor: user, token } = await creature(scene, "Squire Mover", { type: "character", x: 0, y: 17 });
            await creature(scene, "Squire Ally", { x: 7, y: 17 });
            const tabard = await give(user, "Squire's Tabard");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(tabard.uuid, 0);
            const card = await messageAfter(since, itemCard("teleport"), { what: "the move card" });
            const state = card.getFlag(NS, "card");
            assert(state.speed === 25 && state.plan.teleport.move?.verb === "Stride" && state.plan.teleport.speedTimes === 2, `a Stride at twice a 25-foot Speed (${state.speed}, ${JSON.stringify(state.plan.teleport)})`);
            assert(/Stride: Up to double its user(?:&#39;|')s Speed \(50 feet\)/.test(card.content), card.content.slice(0, 400));
            const size = canvas.grid.size;
            let refused = null;
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 5 * size, y: 17 * size } }).catch((error) => { refused = error.message; });
            assert(/must end beside an ally/.test(refused ?? ""), `not beside the ally refused (${refused})`);
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 6 * size, y: 17 * size } });
            await until(() => token.x === 6 * size && token.y === 17 * size, `the token beside the ally (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
            const results = game.messages.get(card.id).getFlag(NS, "card").results;
            assert(results.some((line) => /Squire Mover strides \(within 50 feet\)/.test(line)), results.join(" / "));
            return { refused, results };
        });
    },

    // Spleen Bloodstone of Arazni's Sure Footing: a Stride, then another for another action from where it ended — the card open after the
    // first, its button "Pick again", 30 feet from the new space refused.
    async spleenAgain(scene) {
        return unpaused(async () => {
            await clearSquares(scene, [[0, 18], [5, 18], [10, 18], [16, 18]]);
            const { actor: user, token } = await creature(scene, "Bloodstone Mover", { type: "character", x: 0, y: 18 });
            const stone = await give(user, "Spleen Bloodstone of Arazni");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(stone.uuid, 0);
            const card = await messageAfter(since, itemCard("teleport"), { what: "the move card" });
            const size = canvas.grid.size;
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 5 * size, y: 18 * size } });
            await until(() => token.x === 5 * size, `the first Stride (${token.x / size})`, { timeout: 8000 });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").results.length === 1, "the first result", { timeout: 8000 });
            const after = game.messages.get(card.id);
            assert(after.getFlag(NS, "card").status === "open" && /Pick again \(another action\)/.test(after.content), `still open (${after.getFlag(NS, "card").status})`);
            let refused = null;
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 16 * size, y: 18 * size } }).catch((error) => { refused = error.message; });
            assert(/55 feet away \(the item allows 25\)/.test(refused ?? ""), `55 feet from the new space refused (${refused})`);
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 10 * size, y: 18 * size } });
            await until(() => token.x === 10 * size, `the second Stride (${token.x / size})`, { timeout: 8000 });
            await until(() => game.messages.get(card.id).getFlag(NS, "card").results.length === 2, "the second result", { timeout: 8000 });
            return { refused, results: game.messages.get(card.id).getFlag(NS, "card").results };
        });
    },

    // Cape of the Open Sky's second activation: a Stride or Fly up to its user's Speed and 15 feet more (40) — 45 feet refused, 40 moved.
    async capeOpenSky(scene) {
        return unpaused(async () => {
            await clearSquares(scene, [[0, 19], [8, 19], [9, 19]]);
            const { actor: user, token } = await creature(scene, "Cape Mover", { type: "character", x: 0, y: 19 });
            const cape = await give(user, "Cape of the Open Sky");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(cape.uuid, 1);
            const card = await messageAfter(since, itemCard("teleport"), { what: "the move card" });
            assert(/Up to its user(?:&#39;|')s Speed \+ 15 feet \(40 feet\)/.test(card.content), card.content.slice(0, 400));
            const size = canvas.grid.size;
            let refused = null;
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 9 * size, y: 19 * size } }).catch((error) => { refused = error.message; });
            assert(/45 feet away \(the item allows 40\)/.test(refused ?? ""), `45 feet refused (${refused})`);
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 8 * size, y: 19 * size } });
            await until(() => token.x === 8 * size && token.y === 19 * size, `the token 40 feet on (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
            return { refused, results: game.messages.get(card.id).getFlag(NS, "card").results };
        });
    },

    // Phase Spike's Incorporeal Stride: the item card (resistance 10 to all damage) and the move card beside it — both applied.
    async phaseSpikeStride(scene) {
        return unpaused(async () => {
            await clearSquares(scene, [[0, 3], [5, 3]]);
            const { actor: user, token } = await creature(scene, "Phase Strider", { type: "character", x: 0, y: 3 });
            const spike = await give(user, "Phase Spike");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(spike.uuid, 0);
            const move = await messageAfter(since, itemCard("teleport"), { what: "the move card" });
            const card = await messageAfter(since, itemCard("item"), { what: "the item card" });
            await game.modules.get(NS).api.live.apply(card.id);
            const resisted = () => (user.system.attributes.resistances ?? []).some((entry) => entry.type === "all-damage" && entry.value === 10);
            await until(resisted, `resistance 10 to all damage (${JSON.stringify((user.system.attributes.resistances ?? []).map((entry) => [entry.type, entry.value]))})`, { timeout: 8000 });
            const size = canvas.grid.size;
            await game.modules.get(NS).api.live.apply(move.id, { destination: { x: 5 * size, y: 3 * size } });
            await until(() => token.x === 5 * size && token.y === 3 * size, `the token 25 feet on (${token.x / size}, ${token.y / size})`, { timeout: 8000 });
            return { lines: move.getFlag(NS, "card").plan.teleport.move.lines, results: game.messages.get(move.id).getFlag(NS, "card").results };
        });
    },

    // Umbral Armor's Shroud Stride: Concealed for 1 round as it's used, and the move card's Stride at twice its user's Speed (50 feet).
    async umbralShroud(scene) {
        return unpaused(async () => {
            await clearSquares(scene, [[12, 18], [19, 18]]);
            const { actor: user, token } = await creature(scene, "Shroud Strider", { type: "character", x: 12, y: 18 });
            const armor = await give(user, "Umbral Armor");
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(armor.uuid, 0);
            const card = await messageAfter(since, itemCard("teleport"), { what: "the move card" });
            await until(() => user.hasCondition("concealed"), "Concealed as it's used", { timeout: 8000 });
            const size = canvas.grid.size;
            await game.modules.get(NS).api.live.apply(card.id, { destination: { x: 19 * size, y: 18 * size } });
            await until(() => token.x === 19 * size, `the token 35 feet on (${token.x / size})`, { timeout: 8000 });
            return { lines: card.getFlag(NS, "card").plan.teleport.move.lines, results: game.messages.get(card.id).getFlag(NS, "card").results };
        });
    },

    // Tentacle Cannon's Grasping Deep Shot: its Grapple at +13 (a 10 on the die, 23 against Fortitude DC 18, a success) — Grabbed, and pulled 10
    // feet toward its user, beside them.
    async tentaclePull(scene) {
        await clearSquares(scene, [[10, 17], [11, 17], [12, 17], [13, 17]]);
        const { actor: user, token: userToken } = await creature(scene, "Tentacle Gunner", { type: "character", x: 10, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Tentacle Mark", { x: 13, y: 17, alliance: "opposition" });
        const cannon = await give(user, "Tentacle Cannon");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(cannon.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the Grapple's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const check = await messageAfter(since, abilitySaveCard, { what: "the ability module's Grapple card" });
        await withDie(10, () => rollAndApply(check));
        const size = canvas.grid.size;
        await until(() => foe.hasCondition("grabbed") && foeToken.x === 11 * size, `Grabbed and pulled beside its user (${foe.conditions.map((entry) => entry.slug).join(", ")}; at ${foeToken.x / size})`, { timeout: 10000 });
        assert(userToken.x === 10 * size, "its user where it was");
        return { at: foeToken.x / size };
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
    async rollOptionBonuses(scene) {
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

    // Area buffs: Inspiring Spotlight (Portable)'s placed 5-foot burst (the click stood in for), +1 item to saves and Charisma-based checks
    // for a creature that steps into it; Undead Compendium's +2 item to attack rolls against undead for the creatures targeted — the
    // target's trait, not an origin.
    async areaBuffs(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Spotlight Holder", { type: "character", x: 7, y: 2 });
        const { actor: ally, token: allyToken } = await creature(scene, "Spotlight Ally", { type: "character", x: 8, y: 2 });
        const ruled = (actor, test) => actor.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && test(rule)));
        await userToken.object?.control?.();
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const burst = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone && /Inspiring Spotlight/.test(region.name));
        try {
            const spotlight = await give(user, "Inspiring Spotlight (Portable)");
            await game.modules.get(NS).api.live.activate(spotlight.uuid, 0);
            await until(() => burst(), "the spotlight's Region", { timeout: 8000 });
            const shape = burst().shapes[0];
            await allyToken.update({ x: (shape.x ?? shape.points?.[0] ?? 0) - 50, y: (shape.y ?? shape.points?.[1] ?? 0) - 50 });
            const lit = (actor) => ruled(actor, (rule) => [].concat(rule.selector).includes("cha-based") && rule.value === 1);
            await until(() => lit(ally), "+1 item to Charisma-based checks for the creature in the burst", { timeout: 10000 });
        } finally {
            canvas.regions.placeRegion = placing;
            await burst()?.delete().catch(() => null);
        }
        const use = async (name) => {
            const item = await give(user, name);
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { targets: [userToken.uuid, allyToken.uuid] });
            await wait(800);
        };
        await use("Undead Compendium");
        const versed = (actor) => ruled(actor, (rule) => [].concat(rule.selector).includes("attack-roll") && JSON.stringify(rule.predicate ?? []).includes("target:trait:undead"));
        await until(() => versed(user) && versed(ally), "+2 item to attacks against undead for both", { timeout: 8000 });
        return { ok: true };
    },

    // Hollow Robes' Empty Robes: +2 item to Intimidation for the minute, its wearer not made Invisible (the robes stay seen).
    async emptyRobes(scene) {
        const { actor: wearer } = await creature(scene, "Empty Wearer", { type: "character", x: 20, y: 14 });
        const robes = await give(wearer, "Hollow Robes");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(robes.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the robes' card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const bonus = () => wearer.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("intimidation") && rule.value === 2));
        await until(bonus, "+2 item to Intimidation", { timeout: 8000 });
        const { value, unit } = bonus().system.duration;
        assert(value === 1 && unit === "minutes", `for 1 minute (${value} ${unit})`);
        assert(!wearer.conditions.bySlug?.("invisible")?.length && !wearer.itemTypes.condition.some((entry) => entry.slug === "invisible"), "not Invisible");
        return { duration: `${value} ${unit}` };
    },

    // Third-party bonuses read from their packs: Magic+'s Steady Support (+2 item to the Fortitude DC against forced movement, a Shove's or
    // Reposition's option), Tian Xia+'s Black Pearl of Mewru (+2 status to saves against curses), Alchemists+' Draconic Steak (+2
    // circumstance Intimidation) and Honeyed Voice (+2 item Performance).
    async thirdPartyBonuses(scene) {
        for (const module of ["pf2e-team-plus-magic", "pf2e-team-plus-tian-xia", "pf2e-team-plus-alchemists"]) assert(game.modules.get(module)?.active, `${module} isn't active in pftest.`);
        const { actor: user } = await creature(scene, "Third Bonus User", { type: "character", x: 20, y: 16 });
        const fortitudeDC = (options) => {
            const statistic = user.getStatistic("fortitude");
            const withOptions = statistic.withRollOptions?.({ extraRollOptions: options }) ?? statistic.clone?.({ rollOptions: options }) ?? statistic;
            return withOptions.dc.value;
        };
        const ruled = (test) => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && test(rule)));
        const before = [fortitudeDC(["forced-movement"]), fortitudeDC([])];
        const eat = async (name, pack) => {
            const item = await give(user, name, pack);
            const since = Date.now();
            await item.consume();
            const card = await messageAfter(since, itemCard("item"), { what: `${name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        };
        await eat("Steady Support", "pf2e-team-plus-magic.items");
        await until(() => fortitudeDC(["forced-movement"]) === before[0] + 2, `Fortitude DC against forced movement ${before[0]} → ${before[0] + 2} (${fortitudeDC(["forced-movement"])})`, { timeout: 8000 });
        assert(fortitudeDC([]) === before[1], `not otherwise (${fortitudeDC([])})`);
        await eat("Black Pearl of Mewru", "pf2e-team-plus-tian-xia.player-options");
        await until(() => ruled((rule) => [].concat(rule.selector).includes("saving-throw") && rule.type === "status" && JSON.stringify(rule.predicate ?? []).includes("item:trait:curse")), "+2 status to saves against curses", { timeout: 8000 });
        await eat("Draconic Steak", "pf2e-team-plus-alchemists.pf2e-items");
        await until(() => ruled((rule) => [].concat(rule.selector).includes("intimidation") && rule.type === "circumstance" && rule.value === 2), "+2 circumstance Intimidation", { timeout: 8000 });
        await eat("Honeyed Voice", "pf2e-team-plus-alchemists.pf2e-items");
        await until(() => ruled((rule) => [].concat(rule.selector).includes("performance") && rule.type === "item" && rule.value === 2), "+2 item Performance", { timeout: 8000 });
        return { before, after: [fortitudeDC(["forced-movement"]), fortitudeDC([])] };
    },

    // Spectacles of Inquiry and Oathbow: the creature targeted marked (PF2e's TokenMark), the +3 item bonus to Sense Motive and the bow's
    // extra 1d6 against it alone — another creature's rolls without them. Then Worldscale Shield's Absorb Blow: immunity to physical damage
    // for the attack, a Mythic Point (a mythic NPC's), the shield broken.
    async markedCreature(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Mark Maker", { type: "character", x: 20, y: 6, level: 12 });
        const { token: marked } = await creature(scene, "Mark Target", { x: 22, y: 6, alliance: "opposition" });
        const { token: other } = await creature(scene, "Unmarked Target", { x: 22, y: 8, alliance: "opposition" });
        const markOf = (slug) => user.synthetics.tokenMarks.get(marked.uuid) ?? [];
        const use = async (item) => {
            const since = Date.now();
            await game.modules.get(NS).api.live.activate(item.uuid, 0);
            const card = await messageAfter(since, itemCard("item"), { what: `${item.name}'s card` });
            await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, targets: [marked.uuid] });
            return card;
        };
        const spectacles = await give(user, "Spectacles of Inquiry");
        await use(spectacles);
        await until(() => markOf().includes("spectacles-of-inquiry-mark"), "the target marked by the spectacles", { timeout: 8000 });
        await userToken.object?.control?.();
        const senseMotive = async (token) => {
            await target(token);
            const since = Date.now();
            await game.pf2e.actions.get("sense-motive").use({ actors: [user], event: shift() });
            const message = await messageAfter(since, (entry) => (entry.flags?.pf2e?.context?.domains ?? []).includes("perception"), { what: "Sense Motive" });
            return (message.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "item" && modifier.modifier === 3 && modifier.enabled !== false);
        };
        assert(await senseMotive(marked), "+3 to Sense Motive against the marked creature");
        assert(!(await senseMotive(other)), "none against another creature");
        const bow = await give(user, "Oathbow");
        const arrows = await give(user, "Arrows");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        await use(bow);
        await until(() => markOf().includes("oathbow-mark"), "the target marked by the oath", { timeout: 8000 });
        const damageAt = async (token) => {
            await target(token);
            const action = (user.system.actions ?? []).find((entry) => entry.item?.id === bow.id);
            const since = Date.now();
            await action.damage({ event: shift() });
            const damage = await messageAfter(since, (entry) => entry.flags?.pf2e?.context?.type === "damage-roll", { what: "damage roll" });
            return (damage.rolls ?? []).map((roll) => roll.formula).join(" + ");
        };
        const against = await damageAt(marked);
        const elsewhere = await damageAt(other);
        assert(/1d6/.test(against) && !/1d6/.test(elsewhere), `+1d6 against the marked creature only (${against} | ${elsewhere})`);
        // (Worldscale Shield: a mythic NPC's.)
        const { actor: bearer } = await creature(scene, "Worldscale Bearer", { x: 20, y: 8 });
        await bearer.update({ "system.traits.value": [...(bearer.system.traits.value ?? []), "mythic"] });
        await bearer.update({ "system.resources.mythicPoints.value": 1 });
        const shield = await give(bearer, "Worldscale Shield");
        // (PF2e's data gives it no Hit Points; its text's 60, Broken Threshold 30.)
        await shield.update({ "system.hp.max": 60, "system.hp.value": 60 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("fortune"), { what: "the shield's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => bearer.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "Immunity" && [].concat(rule.type).includes("physical"))), "immunity to physical damage", { timeout: 8000 });
        await until(() => shield.system.hp.value <= shield.system.hp.brokenThreshold, `the shield broken (${shield.system.hp.value}/${shield.system.hp.brokenThreshold})`, { timeout: 8000 });
        assert(bearer.system.resources.mythicPoints.value === 0, `the Mythic Point spent (${bearer.system.resources.mythicPoints.value})`);
        return { against, elsewhere, shield: `${shield.system.hp.value}/${shield.system.hp.max}`, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Sky Hammer's Comet Fall: the spell module's 6th-rank Fireball at DC 45, not this module's card; Avalanche Boots: the ways card's push
    // after a critical Shove, 10 feet more and Prone.
    async hammerAndBoots(scene) {
        // (In the lab, the push's squares free: 10 feet east of the target.)
        await clearSquares(scene, [[10, 14], [11, 14], [12, 14], [13, 14]]);
        const { actor: user, token: userToken } = await creature(scene, "Hammer Wielder", { type: "character", x: 10, y: 14, level: 20 });
        const { actor: foe, token: foeToken } = await creature(scene, "Boot Target", { x: 11, y: 14, alliance: "opposition" });
        // (The spell module's cast — its own reading has the Fireball's centre and its user's immunity — not this module's card.)
        const hammer = await give(user, "Sky Hammer");
        const read = game.modules.get("pf2e-automatic-resolution")?.api?.itemCasts?.read?.(hammer);
        assert(read?.casts?.[0]?.name === "Fireball" && read.casts[0].rank === 6 && read.numbers?.dc === 45, `the spell module's Fireball, rank 6, DC 45 (${JSON.stringify(read?.casts?.[0] ?? null)})`);
        let refused = null;
        try { await game.modules.get(NS).api.live.activate(hammer.uuid, 0); } catch (error) { refused = error.message; }
        assert(refused, "not this module's card too");
        const boots = await give(user, "Avalanche Boots");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(boots.uuid, 0);
        const ways = await messageAfter(since, itemCard("ways"), { what: "the boots' ways card" });
        const names = ways.getFlag(NS, "card").plan.ways.map((way) => way.name);
        assert(names.length === 3 && /10 feet more, and Prone/.test(names[2]), `three ways (${names.join(" | ")})`);
        const startX = foeToken.x;
        await target(foeToken);
        since = Date.now();
        await game.modules.get(NS).api.live.apply(ways.id, { choice: 2 });
        const push = await messageAfter(since, itemCard("expose"), { what: "the push card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(push.id, { targets: [foeToken.uuid] });
        const ability = await messageAfter(since, abilitySaveCard, { what: "the ability module's card" });
        await applyAbilityCard(ability);
        await until(() => foe.itemTypes.condition.some((entry) => entry.slug === "prone"), "the target Prone", { timeout: 8000 });
        await until(() => foeToken.x - startX === 2 * scene.grid.size, `pushed 10 feet away (${foeToken.x - startX} px)`, { timeout: 8000 });
        return { names, moved: (foeToken.x - startX) / scene.grid.size };
    },

    // Spirit Bulb: the cast card's two choices at its rank (Plant Form on its user, Summon Plant or Fungus); Emetic Paste (Lesser): +2 item
    // to Fortitude saves for the hour, for the creature targeted.
    async bulbAndPaste(scene) {
        const { actor: user } = await creature(scene, "Bulb Eater", { type: "character", x: 20, y: 16, level: 10 });
        const { actor: ally, token: allyToken } = await creature(scene, "Paste Patient", { type: "character", x: 21, y: 16 });
        const bulb = await give(user, "Spirit Bulb");
        let since = Date.now();
        await bulb.consume();
        const cast = await messageAfter(since, itemCard("cast"), { what: "the bulb's cast card" });
        const choices = (cast.getFlag(NS, "card").plan.choices ?? []).map((choice) => `${choice.spell.name} ${choice.rank}${choice.self ? " (self)" : ""}`);
        assert(choices.join(" | ") === "Plant Form 5 (self) | Summon Plant or Fungus 5", `its two casts (${choices.join(" | ")})`);
        const paste = await give(user, "Emetic Paste (Lesser)");
        since = Date.now();
        await paste.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the paste's card" });
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const fortified = () => ally.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("fortitude") && rule.value === 2 && rule.type === "item"));
        await until(fortified, "+2 item to Fortitude saves for the creature targeted", { timeout: 8000 });
        assert(!user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("fortitude"))), "not its user's");
        return { choices, results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Next-Strike riders: Hyldarf's Fang's venom coats the hand cannon itself and its hit (AC 1) posts the DC 34 Fortitude save card; Sawtooth
    // Reaper's readied Strike makes its target Off-Guard to it (PF2e's EphemeralEffect); Scope of Limning's hit leaves its glow note on the
    // creature for a round; Starshot Arrow's readied Strike carries ignore-range-penalty:6.
    async nextStrikeRiders(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Rider Archer", { type: "character", x: 2, y: 13, level: 20 });
        const { actor: foe, token: foeToken } = await creature(scene, "Rider Target", { x: 3, y: 13, ac: 1, alliance: "opposition" });
        const live = game.modules.get(NS).api.live;
        // (A hand cannon: its rounds, and nothing to reload.)
        const fang = await give(user, "Hyldarf's Fang");
        const rounds = await give(user, "Rounds (Hand Cannon)");
        await rounds.update({ "system.quantity": 5, "system.baseItem": "rounds-hand-cannon" });
        await fang.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": rounds.id, "system.reload.value": "0" });
        let since = Date.now();
        await live.activate(fang.uuid, 1);
        const coat = await messageAfter(since, itemCard("poison"), { what: "the fang's coat card" });
        const weapons = coat.getFlag(NS, "card").weapons;
        assert(weapons.length === 1 && weapons[0].id === fang.id, `only the gun itself (${weapons.map((entry) => entry.name).join(", ")})`);
        await live.apply(coat.id, { weapon: 0 });
        await wait(600);
        await userToken.object?.control?.();
        await target(foeToken);
        since = Date.now();
        const shot = await strike(user, fang);
        assert(["success", "criticalSuccess"].includes(shot.attack.flags.pf2e.context.outcome), `a hit (AC 1): ${shot.attack.flags.pf2e.context.outcome}`);
        const save = await messageAfter(since, abilitySaveCard, { what: "the venom's save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "fortitude" && check.against.value === 34, `Fortitude DC 34 (${JSON.stringify(check)})`);
        const reaper = await give(user, "Sawtooth Reaper");
        await fang.update({ "system.equipped.carryType": "worn", "system.equipped.handsHeld": 0 });
        await reaper.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        since = Date.now();
        await live.activate(reaper.uuid, 1);
        let card = await messageAfter(since, itemCard("strike"), { what: "the reaper's Strike card" });
        await live.apply(card.id);
        await wait(600);
        assert(user.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider") && (effect.system.rules ?? []).some((rule) => rule.key === "EphemeralEffect")), "the readied Strike's EphemeralEffect");
        const whirl = await strike(user, reaper);
        const options = whirl.attack.flags.pf2e.context.options ?? [];
        assert(options.includes("target:condition:off-guard"), `the target Off-Guard to it (${options.filter((option) => option.startsWith("target:condition")).join(", ")})`);
        const scope = await give(user, "Scope of Limning");
        since = Date.now();
        await live.activate(scope.uuid, 0);
        card = await messageAfter(since, itemCard("strike"), { what: "the scope's Strike card" });
        await live.apply(card.id);
        await wait(600);
        const lit = await strike(user, reaper);
        assert(["success", "criticalSuccess"].includes(lit.attack.flags.pf2e.context.outcome), `a hit (AC 1): ${lit.attack.flags.pf2e.context.outcome}`);
        await until(() => foe.itemTypes.effect.some((effect) => /Scope of Limning/.test(effect.name) && effect.system.duration?.value === 1 && effect.system.duration?.unit === "rounds"), `the glow's note for a round (${foe.itemTypes.effect.map((effect) => `${effect.name} ${effect.system.duration?.value} ${effect.system.duration?.unit}`).join(", ")})`, { timeout: 10000 });
        const starshot = await give(user, "Starshot Arrow (Lesser)");
        since = Date.now();
        await live.activate(starshot.uuid, 0);
        card = await messageAfter(since, itemCard("strike"), { what: "the arrow's Strike card" });
        await live.apply(card.id);
        await wait(600);
        assert(user.itemTypes.effect.some((effect) => effect.getFlag(NS, "strikeRider") && (effect.system.rules ?? []).some((rule) => rule.key === "RollOption" && rule.option === "ignore-range-penalty:6")), "the readied Strike's ignore-range-penalty:6");
        return { save: save.id, offGuard: true };
    },

    // Coronet of Stars' reassurance: the targeted ally's failed check rerolled by PF2e, the higher kept.
    async coronetReroll(scene) {
        const { actor: user } = await creature(scene, "Coronet Wearer", { type: "character", x: 20, y: 18, level: 15 });
        const { actor: ally, token: allyToken } = await creature(scene, "Coronet Ally", { type: "character", x: 22, y: 18 });
        const live = game.modules.get(NS).api.live;
        let since;
        const coronet = await give(user, "Coronet of Stars");
        await ally.skills.athletics.roll({ dc: { value: 60 }, skipDialog: true });
        await wait(600);
        since = Date.now();
        await live.activate(coronet.uuid, 1);
        const reroll = await messageAfter(since, itemCard("reroll"), { what: "the coronet's reroll card" });
        since = Date.now();
        await live.apply(reroll.id, { targets: [allyToken.uuid] });
        const again = await messageAfter(since, (message) => message.flags?.pf2e?.context?.isReroll && message.actor?.id === ally.id, { what: "the ally's reroll" });
        const results = game.messages.get(reroll.id).getFlag(NS, "card").results;
        assert(results.some((line) => line.includes(ally.name) && /keeping the higher/.test(line)), `the ally's check rerolled, the higher kept (${JSON.stringify(results)})`);
        return { reroll: again.id, results };
    },

    // Tian Xia+'s Shei Long's Blade: its judgment's targeted card at the creature, then a DC 19 basic Reflex save card for that creature's
    // allies within 20 feet — not its user's own ally standing as near.
    async bladeJudgment(scene) {
        assert(game.modules.get("pf2e-team-plus-tian-xia")?.active, "Tian Xia+ isn't active in pftest.");
        const { actor: user } = await creature(scene, "Judgment Wielder", { type: "character", x: 6, y: 15, level: 6 });
        const { token: foeToken } = await creature(scene, "Judgment Target", { x: 7, y: 15, alliance: "opposition" });
        const { token: friendA } = await creature(scene, "Judgment Foe Ally", { x: 8, y: 15, alliance: "opposition" });
        const { token: friendB } = await creature(scene, "Judgment Foe Ally Two", { x: 9, y: 15, alliance: "opposition" });
        const { token: mine } = await creature(scene, "Judgment Party Ally", { type: "character", x: 8, y: 14 });
        const blade = await give(user, "Shei Long's Blade", "pf2e-team-plus-tian-xia.player-options");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the blade's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const reflex = await messageAfter(since, (message) => abilitySaveCard(message) && message.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check.statistic === "reflex", { what: "the allies' Reflex save card", timeout: 10000 });
        const state = reflex.flags["pf2e-automatic-ability-resolution"].card;
        const check = state.plan.resolution.check;
        assert(check.basic && check.against.value === 19, `a DC 19 basic Reflex save (${JSON.stringify(check)})`);
        const at = (state.targets ?? []).map((entry) => entry.tokenUuid ?? entry.uuid);
        assert(at.includes(friendA.uuid) && at.includes(friendB.uuid), `at the target's allies (${JSON.stringify(at)})`);
        assert(!at.includes(mine.uuid) && !at.includes(foeToken.uuid), "not its user's ally, nor the target");
        return { results: game.messages.get(card.id).getFlag(NS, "card").results, at: at.length };
    },

    // Megaphone Mutagen (Lesser): +1 item to skill checks of auditory actions — PF2e's Demoralize gets it, its Request (Diplomacy) doesn't.
    async megaphoneMutagen(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Megaphone Drinker", { type: "character", x: 20, y: 2 });
        const { token: foeToken } = await creature(scene, "Megaphone Target", { x: 21, y: 2, alliance: "opposition" });
        const mutagen = await give(user, "Megaphone Mutagen (Lesser)");
        let since = Date.now();
        await mutagen.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the mutagen's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => user.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("skill-check") && JSON.stringify(rule.predicate ?? []).includes("item:trait:auditory"))), "+1 to auditory skill checks", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(foeToken);
        const rolled = async (slug) => {
            const since = Date.now();
            await game.pf2e.actions.get(slug).use({ actors: [user], event: shift() });
            const message = await messageAfter(since, (entry) => entry.flags?.pf2e?.context?.type === "skill-check", { what: `${slug}'s check` });
            return (message.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "item" && modifier.modifier === 1 && modifier.enabled !== false);
        };
        assert(await rolled("demoralize"), "Demoralize (auditory, Intimidation) gets +1");
        assert(!(await rolled("request")), "Request (Diplomacy) doesn't");
        return { ok: true };
    },

    // Martial Mayhem Mutagen (Lesser): while it lasts, a melee hit (AC 1) makes the target off-guard to its user's next attack (the ability
    // module's scoped off-guard on its user), and a melee miss (AC 99) makes its user Clumsy 1.
    async martialMayhem(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Mayhem Drinker", { type: "character", x: 20, y: 4, level: 10 });
        const { token: soft } = await creature(scene, "Mayhem Soft Target", { x: 21, y: 4, ac: 1, alliance: "opposition" });
        const { token: hard } = await creature(scene, "Mayhem Hard Target", { x: 21, y: 5, ac: 99, alliance: "opposition" });
        const sword = await give(user, "Shortsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const mutagen = await give(user, "Martial Mayhem Mutagen (Lesser)");
        let since = Date.now();
        await mutagen.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the mutagen's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => user.itemTypes.effect.some((effect) => effect.getFlag(NS, "attackRiders")), "the watch Effect", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(soft);
        const hit = await strike(user, sword);
        assert(["success", "criticalSuccess"].includes(hit.attack.flags.pf2e.context.outcome), `a hit (AC 1): ${hit.attack.flags.pf2e.context.outcome}`);
        await until(() => user.itemTypes.effect.some((effect) => effect.flags?.["pf2e-automatic-ability-resolution"]?.scopedOffGuard?.target === soft.uuid), "the target off-guard to its user's next attack", { timeout: 8000 });
        await target(hard);
        const miss = await strike(user, sword);
        assert(["failure", "criticalFailure"].includes(miss.attack.flags.pf2e.context.outcome), `a miss (AC 99): ${miss.attack.flags.pf2e.context.outcome}`);
        await until(() => (user.getCondition?.("clumsy")?.value ?? 0) === 1 || user.itemTypes.condition.some((entry) => entry.slug === "clumsy"), "its user Clumsy 1", { timeout: 8000 });
        return { effects: user.itemTypes.effect.map((effect) => effect.name) };
    },

    // Alchemists+' Preserved Pteranodon: its own +8 attack on the ability module's card at the creature targeted, Dazzled for a round on its
    // critical success row.
    async pteranodonCritical(scene) {
        assert(game.modules.get("pf2e-team-plus-alchemists")?.active, "Alchemists+ isn't active in pftest.");
        const { actor: user } = await creature(scene, "Pteranodon Thrower", { type: "character", x: 20, y: 6, level: 5 });
        const { token: foeToken } = await creature(scene, "Pteranodon Target", { x: 21, y: 6, alliance: "opposition" });
        const jar = await give(user, "Preserved Pteranodon", "pf2e-team-plus-alchemists.pf2e-items");
        let since = Date.now();
        await jar.consume();
        const card = await messageAfter(since, itemCard("expose"), { what: "the jar's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
        const attack = await messageAfter(since, abilitySaveCard, { what: "the ability module's attack card" });
        const resolution = attack.flags["pf2e-automatic-ability-resolution"].card.plan.resolution;
        assert(resolution.check.modifier === 8 && resolution.check.against.statistic === "ac", `its +8 attack (${JSON.stringify(resolution.check)})`);
        const critical = resolution.outcomes.criticalSuccess.effects.find((effect) => effect.slug === "dazzled");
        assert(critical?.duration?.value === 1 && critical.duration.unit === "rounds", `Dazzled for a round on a critical hit (${JSON.stringify(resolution.outcomes.criticalSuccess.effects)})`);
        assert(!resolution.outcomes.success.effects.some((effect) => effect.slug === "dazzled"), "not on a plain hit");
        return { ok: true };
    },

    // Silkspinner's Shield: its Climb Effect on its user, and for the minute its shield bash (AC 1) leaves the creature struck -10 feet to its
    // Speeds (a hit) or Immobilized (a critical hit), for a round, a successful Escape against DC 30 ending it.
    async silkspinnerBash(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Silkspinner Bearer", { type: "character", x: 20, y: 10, level: 15 });
        const { actor: foe, token: foeToken } = await creature(scene, "Silkspinner Target", { x: 21, y: 10, ac: 1, alliance: "opposition" });
        const shield = await give(user, "Silkspinner's Shield");
        await shield.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(shield.uuid, 0);
        const card = await messageAfter(since, itemCard("item"), { what: "the shield's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        await until(() => user.itemTypes.effect.some((effect) => effect.name === "Effect: Silkspinner's Shield (Climb)"), "the Climb Effect", { timeout: 8000 });
        await until(() => user.itemTypes.effect.some((effect) => effect.getFlag(NS, "attackRiders")), "the bash watch", { timeout: 8000 });
        await userToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(user, shield);
        const outcome = attack.flags.pf2e.context.outcome;
        assert(["success", "criticalSuccess"].includes(outcome), `a hit (AC 1): ${outcome}`);
        if (outcome === "criticalSuccess") await until(() => foe.itemTypes.condition.some((entry) => entry.slug === "immobilized"), "Immobilized on the critical hit", { timeout: 8000 });
        else await until(() => foe.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("all-speeds") && rule.value === -10)), "-10 feet to its Speeds", { timeout: 8000 });
        // (Each ended by an Escape against DC 30: the ability module's escape flag on what it made.)
        await until(() => foe.itemTypes.effect.some((effect) => Number(effect.flags?.["pf2e-automatic-ability-resolution"]?.escape?.dc) === 30), "its Escape DC 30", { timeout: 8000 });
        return { outcome };
    },

    // The "Item DCs from their user" world setting: a level-8 NPC with a spellcasting entry (spell DC 26, over its class DC 24) posts Spark
    // Wafer's Reflex save at 26 (the wafer's own is 14), with the card's note; the setting off, the wafer's own 14. The setting is put back
    // as it was.
    async itemDCsFromUser(scene) {
        const before = game.settings.get(NS, "itemDCsFromUser");
        const { actor: user } = await creature(scene, "DC Caster", { x: 20, y: 12, level: 8 });
        await user.createEmbeddedDocuments("Item", [{ name: "Arcane Innate Spells", type: "spellcastingEntry", system: { spelldc: { value: 16, dc: 26 }, tradition: { value: "arcane" }, prepared: { value: "innate" } } }]);
        await until(() => Number(user.system.attributes.spellDC?.value) === 26, `its spell DC 26 (${user.system.attributes.spellDC?.value})`, { timeout: 8000 });
        const spellDC = 26;
        const wafer = async () => {
            const item = await give(user, "Spark Wafer");
            const since = Date.now();
            await item.consume();
            return messageAfter(since, itemCard("expose"), { what: "the wafer's card" });
        };
        try {
            await game.settings.set(NS, "itemDCsFromUser", true);
            const raised = (await wafer()).getFlag(NS, "card").plan;
            assert(raised.resolution.check.against.value === spellDC, `at the spell DC ${spellDC} (${raised.resolution.check.against.value})`);
            assert((raised.notes ?? []).some((note) => note.includes(`Its DC is ${spellDC}, its user's spell DC, over the item's own 14`)), `its note (${JSON.stringify(raised.notes)})`);
            // (A poison's too: Black Adder Venom's 18 at the spell DC.)
            const venom = await give(user, "Black Adder Venom");
            const since = Date.now();
            await venom.consume();
            const coat = await messageAfter(since, (message) => Boolean(message.getFlag(NS, "card")), { what: "the venom's card" });
            const poisonDC = Number(/"dc":"fixed","value":(\d+)/.exec(JSON.stringify(coat.getFlag(NS, "card").plan))?.[1]);
            assert(poisonDC === spellDC, `the venom at the spell DC ${spellDC} (${poisonDC})`);
            await game.settings.set(NS, "itemDCsFromUser", false);
            const own = (await wafer()).getFlag(NS, "card").plan;
            assert(own.resolution.check.against.value === 14, `the wafer's own 14 with the setting off (${own.resolution.check.against.value})`);
        } finally {
            await game.settings.set(NS, "itemDCsFromUser", before);
        }
        return { spellDC, classDC: user.system.attributes.classDC?.value ?? null };
    },

    // Bangles of Crowns' reaction: the frightened enemy targeted marked, +1 circumstance to its user's checks against it (PF2e's Demoralize at
    // it gets it, at another enemy not), and 15 temporary Hit Points.
    async banglesMark(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Bangles Wearer", { type: "character", x: 20, y: 14, level: 17 });
        const { token: marked } = await creature(scene, "Bangles Target", { x: 21, y: 14, alliance: "opposition" });
        const { token: other } = await creature(scene, "Bangles Other", { x: 21, y: 15, alliance: "opposition" });
        const bangles = await give(user, "Bangles of Crowns");
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(bangles.uuid, 1);
        const card = await messageAfter(since, itemCard("item"), { what: "the bangles' card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0, targets: [marked.uuid] });
        await until(() => (user.synthetics.tokenMarks.get(marked.uuid) ?? []).includes("bangles-of-crowns-mark"), "the triggering enemy marked", { timeout: 8000 });
        await until(() => user.system.attributes.hp.temp === 15, `15 temporary Hit Points (${user.system.attributes.hp.temp})`, { timeout: 8000 });
        await userToken.object?.control?.();
        const demoralize = async (token) => {
            await target(token);
            const at = Date.now();
            await game.pf2e.actions.get("demoralize").use({ actors: [user], event: shift() });
            const message = await messageAfter(at, (entry) => entry.flags?.pf2e?.context?.type === "skill-check", { what: "Demoralize" });
            return (message.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "circumstance" && modifier.modifier === 1 && modifier.enabled !== false);
        };
        assert(await demoralize(marked), "+1 circumstance against the marked enemy");
        assert(!(await demoralize(other)), "none against another");
        return { ok: true };
    },

    // Fulu Compendium's Paralyzing Page: the Spirit-Sealing Fulu's Will save at DC 25 on the ability module's card at the undead targeted (its
    // Will far below: Paralyzed for a round).
    async paralyzingPage(scene) {
        const { actor: user } = await creature(scene, "Compendium Reader", { type: "character", x: 20, y: 16, level: 9 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Compendium Undead", { x: 21, y: 16, alliance: "opposition", save: -30 });
        await undead.update({ "system.traits.value": [...(undead.system.traits.value ?? []), "undead"] });
        const book = await give(user, "Fulu Compendium");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(book.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the page's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [undeadToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the Will save card" });
        const check = save.flags["pf2e-automatic-ability-resolution"].card.plan.resolution.check;
        assert(check.statistic === "will" && check.against.value === 25, `Will DC 25 (${JSON.stringify(check)})`);
        await rollAndApply(save);
        await until(() => undead.itemTypes.condition.some((entry) => entry.slug === "paralyzed") || undead.itemTypes.effect.some((effect) => /paralyzed/i.test(effect.name)), "Paralyzed", { timeout: 10000 });
        return { ok: true };
    },

    // Savior Spike: its readied +1 to the next Grab an Edge (any check with PF2e's action:grab-an-edge); a plain Reflex save doesn't spend
    // it, PF2e's Grab an Edge gets it and spends it.
    async saviorSpike(scene) {
        const { actor: user, token: userToken } = await creature(scene, "Spike Climber", { type: "character", x: 20, y: 18 });
        const spike = await give(user, "Savior Spike");
        const since = Date.now();
        await spike.consume();
        const card = await messageAfter(since, itemCard("fortune"), { what: "the spike's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const readied = () => user.itemTypes.effect.find((effect) => effect.getFlag(NS, "rollTwice") && (effect.system.rules ?? []).some((rule) => rule.key === "AdjustDegreeOfSuccess"));
        await until(readied, "the readied bonus", { timeout: 8000 });
        await user.saves.reflex.roll({ skipDialog: true });
        await wait(1200);
        assert(readied(), "kept through a plain Reflex save");
        await userToken.object?.control?.();
        const at = Date.now();
        await game.pf2e.actions.get("grab-an-edge").use({ actors: [user], statistic: "reflex", event: shift() });
        const grab = await messageAfter(at, (message) => (message.flags?.pf2e?.context?.options ?? []).includes("action:grab-an-edge"), { what: "Grab an Edge" });
        assert((grab.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "item" && modifier.modifier === 1 && modifier.enabled !== false), "+1 item on Grab an Edge");
        await until(() => !readied(), "spent by it", { timeout: 8000 });
        return { ok: true };
    },

    // Psychic Warding Bracelet: its readied +2 item to the next save against a mental effect, kept with no time limit; a Fortitude save
    // doesn't spend it, a Will save against a mental effect gets it and spends it.
    async wardingBracelet(scene) {
        const { actor: wearer } = await creature(scene, "Bracelet Wearer", { type: "character", x: 20, y: 8 });
        const bracelet = await give(wearer, "Psychic Warding Bracelet");
        const since = Date.now();
        await bracelet.consume();
        const card = await messageAfter(since, itemCard("fortune"), { what: "the bracelet's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        const warded = () => wearer.itemTypes.effect.find((effect) => effect.getFlag(NS, "rollTwice") && (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && JSON.stringify(rule.predicate ?? []).includes("item:trait:mental")));
        await until(warded, "the readied bonus", { timeout: 8000 });
        assert(warded().system.duration.unit === "unlimited", `no time limit (${warded().system.duration.unit})`);
        await wearer.saves.fortitude.roll({ skipDialog: true });
        await wait(1200);
        assert(warded(), "kept through a Fortitude save");
        const before = Date.now();
        await wearer.saves.will.roll({ skipDialog: true, extraRollOptions: ["item:trait:mental"] });
        const will = await messageAfter(before, (message) => (message.flags?.pf2e?.context?.domains ?? []).includes("will"), { what: "the Will save" });
        assert((will.flags.pf2e.modifiers ?? []).some((modifier) => modifier.type === "item" && modifier.modifier === 2 && modifier.enabled !== false), "+2 item on the Will save against a mental effect");
        await until(() => !warded(), "spent by it", { timeout: 8000 });
        return { ok: true };
    },

    // Vine Arrow: activated, loaded in a shortbow; its hit (AC 1) gives the target a -10-foot circumstance penalty to its Speeds for 2d4
    // rounds (its rider in the paragraph after the hit's), Immobilized too on a critical hit.
    async vineArrow(scene) {
        const { actor: archer, token: archerToken } = await creature(scene, "Vine Archer", { type: "character", x: 2, y: 15, level: 10 });
        const { actor: foe, token: foeToken } = await creature(scene, "Vine Target", { x: 4, y: 15, ac: 1, alliance: "opposition" });
        const bow = await give(archer, "Shortbow");
        const arrows = await give(archer, "Vine Arrow");
        await bow.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2, "system.selectedAmmoId": arrows.id });
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(arrows.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(600);
        await archerToken.object?.control?.();
        await target(foeToken);
        const { attack } = await strike(archer, bow);
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        const slowed = () => foe.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("all-speeds") && rule.value === -10));
        await until(slowed, "-10 feet to its Speeds", { timeout: 10000 });
        const rounds = slowed().system.duration?.value;
        assert(rounds >= 2 && rounds <= 8 && slowed().system.duration.unit === "rounds", `for 2d4 rounds (${rounds} ${slowed().system.duration.unit})`);
        // (Ended early by an Escape against DC 19, the ability module's flag on its Effect — src/compiler/escape-ends.js, 2026-10-25.)
        assert(JSON.stringify(slowed().flags ?? {}).includes('"escape":{"dc":19}'), `its Escape DC 19 on the Effect (${JSON.stringify(slowed().flags)})`);
        if (attack.flags.pf2e.context.outcome === "criticalSuccess") await until(() => foe.itemTypes.condition.some((entry) => entry.slug === "immobilized"), "Immobilized on the critical hit", { timeout: 8000 });
        return { rounds, outcome: attack.flags.pf2e.context.outcome };
    },

    // Sprite Apple (Pink): beside its light (spriteAppleLight), the ability module's 20-foot zone on its eater's token, whose +1 item to
    // Performance a creature standing in it gets.
    async spriteAppleAura(scene) {
        await clearSquares(scene, [[12, 13], [13, 13]]);
        const { actor: eater } = await creature(scene, "Apple Eater", { type: "character", x: 12, y: 13 });
        const { actor: friend } = await creature(scene, "Apple Friend", { type: "character", x: 13, y: 13 });
        const apple = await give(eater, "Sprite Apple (Pink)");
        const since = Date.now();
        await apple.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the apple's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const regionOf = () => scene.regions.find((region) => region.flags?.["pf2e-automatic-ability-resolution"]?.zone?.itemName === "Sprite Apple (Pink)" && region.flags["pf2e-automatic-ability-resolution"].zone.sourceActorUuid === eater.uuid);
        await until(regionOf, "the light's zone on its token", { timeout: 8000 });
        const performs = (actor) => actor.itemTypes.effect.some((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("performance") && rule.value === 1));
        await until(() => performs(friend), "+1 item to Performance for the creature in the light", { timeout: 10000 });
        return { results: game.messages.get(card.id).getFlag(NS, "card").results };
    },

    // Sprite Apple (Golden): a creature in its light gets the -1 item penalty to its Will DC only against Diplomacy (PF2e's will-dc with
    // check:statistic:diplomacy); the light's Effect says its eater can't be concealed while visible.
    async spriteAppleGolden(scene) {
        await clearSquares(scene, [[15, 6], [16, 6]]);
        const { actor: eater } = await creature(scene, "Golden Apple Eater", { type: "character", x: 15, y: 6 });
        const { actor: friend } = await creature(scene, "Golden Apple Friend", { type: "character", x: 16, y: 6 });
        const apple = await give(eater, "Sprite Apple (Golden)");
        const since = Date.now();
        await apple.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the apple's card" });
        await game.modules.get(NS).api.live.apply(card.id, { drinker: 0 });
        const penalty = () => friend.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).find((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("will-dc"));
        await until(penalty, "the Will DC penalty for the creature in the light", { timeout: 10000 });
        assert(penalty().value === -1 && JSON.stringify(penalty().predicate) === JSON.stringify(["check:statistic:diplomacy"]), `-1 against Diplomacy only (${JSON.stringify(penalty())})`);
        const light = eater.itemTypes.effect.find((effect) => (effect.system.rules ?? []).some((rule) => rule.key === "TokenLight"));
        assert(/can't be concealed if it's visible/.test(light?.system.description.value ?? ""), "the light's words");
        return { penalty: penalty() };
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
    },

    // Serene Smelling Salts twice (question 18's tracker): the first lowers its user's Frightened by 1 and gives them the ability module's
    // "Immune:" Effect for an hour; the second, while that lasts, is refused (the card left open); with the Effect gone, it applies.
    async immuneSaltsTwice(scene) {
        await clearSquares(scene, [[18, 18]]);
        const { actor: user } = await creature(scene, "Salts Sniffer", { type: "character", x: 18, y: 18 });
        await user.increaseCondition("frightened", { value: 2 });
        const ABILITY = "pf2e-automatic-ability-resolution";
        const immune = () => user.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "serene-smelling-salts");
        const frightened = () => user.getCondition("frightened")?.value ?? 0;
        const sniff = async () => {
            const salts = await give(user, "Serene Smelling Salts");
            const since = Date.now();
            await salts.consume();
            return messageAfter(since, itemCard("item"), { what: "the salts' card" });
        };
        const first = await sniff();
        await game.modules.get(NS).api.live.apply(first.id);
        await until(() => immune().length === 1 && frightened() === 1, "the Immune: Effect and Frightened 1", { timeout: 8000 });
        const [effect] = immune();
        assert(effect.system.duration.value === 1 && effect.system.duration.unit === "hours", `for an hour (${effect.system.duration.value} ${effect.system.duration.unit})`);
        const second = await sniff();
        let refused = null;
        try {
            await game.modules.get(NS).api.live.apply(second.id);
        } catch (error) {
            refused = error.message;
        }
        assert(/still immune to Serene Smelling Salts/.test(refused ?? ""), `refused (${refused})`);
        await wait(500);
        assert(game.messages.get(second.id).getFlag(NS, "card").status !== "applied" && frightened() === 1 && immune().length === 1, `nothing applied (${game.messages.get(second.id).getFlag(NS, "card").status}, Frightened ${frightened()}, ${immune().length} Effects)`);
        await effect.delete();
        await game.modules.get(NS).api.live.apply(second.id);
        await until(() => game.messages.get(second.id).getFlag(NS, "card").status === "applied" && frightened() === 0 && immune().length === 1, "the second applied once the Effect was gone", { timeout: 8000 });
        return { refused, effect: effect.name };
    },

    // Spun Cloud (Red) twice on one creature (question 18's tracker): the first cloud's save card, applied, gives it the ability module's
    // "Immune:" Effect for 24 hours (regardless of its save); the second cloud, made on it while that lasts, posts no card for it.
    async immuneSpunCloudTwice(scene) {
        await clearSquares(scene, [[14, 9], [17, 9]]);
        const { actor: user, token: userToken } = await creature(scene, "Twice Spinner", { type: "character", x: 14, y: 9 });
        const { actor: foe, token: foeToken } = await creature(scene, "Twice Clouded", { x: 17, y: 9, alliance: "opposition", save: -30 });
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const ABILITY = "pf2e-automatic-ability-resolution";
        const immune = () => foe.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "spun-cloud-red");
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [{ ...data, shapes: (data.shapes ?? []).map((shape) => ({ ...shape, x: foeToken.x + canvas.grid.size / 2, y: foeToken.y + canvas.grid.size / 2 })) }]))[0];
        const cloud = () => scene.regions.find((entry) => entry.flags?.[ABILITY]?.zone && /Spun Cloud/.test(entry.name));
        const forFoe = (message) => abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid);
        try {
            let since = Date.now();
            await (await give(user, "Spun Cloud (Red)")).consume();
            await until(() => cloud(), "the first cloud's Region", { timeout: 8000 });
            const card = await messageAfter(since, forFoe, { what: "the first cloud's save card", timeout: 10000 });
            await rollAndApply(card);
            await until(() => immune().length === 1, "the Immune: Effect", { timeout: 10000 });
            const [effect] = immune();
            assert(effect.system.duration.value === 24 && effect.system.duration.unit === "hours", `for 24 hours (${effect.system.duration.value} ${effect.system.duration.unit})`);
            await cloud().delete();
            await until(() => !cloud(), "the first cloud gone", { timeout: 5000 });
            await foe.decreaseCondition("frightened", { forceRemove: true });
            since = Date.now();
            await (await give(user, "Spun Cloud (Red)")).consume();
            await until(() => cloud(), "the second cloud's Region", { timeout: 8000 });
            await wait(3000);
            const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && forFoe(message));
            assert(cards.length === 0, `no card for the immune creature (${cards.length})`);
            assert(!foe.itemTypes.condition.some((condition) => condition.slug === "frightened") && immune().length === 1, "nothing on it, one Effect");
            return { effect: effect.name };
        } finally {
            canvas.regions.placeRegion = placing;
            await cloud()?.delete().catch(() => null);
        }
    },

    // Aetheric Irritant, Lesser then Major (question 18's tracker): an undead that critically succeeds at the Lesser's save is immune to all
    // aetheric irritants for 24 hours, so entering the Major's area, it gets no card (every grade one key).
    async immuneIrritantGrades(scene) {
        await clearSquares(scene, [[1, 10], [6, 10]]);
        const { actor: user, token: userToken } = await creature(scene, "Grade Ringer", { type: "character", x: 1, y: 10 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Grade Zombie", { x: 6, y: 10, alliance: "opposition", save: 40 });
        await undead.update({ "system.traits.value": ["undead"] });
        await until(() => userToken.object && undeadToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const ABILITY = "pf2e-automatic-ability-resolution";
        const immune = () => undead.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "aetheric-irritant");
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [data]))[0];
        const area = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Aetheric Irritant/.test(region.name));
        const forZombie = (message) => abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === undead.uuid);
        const away = { x: undeadToken.x, y: undeadToken.y };
        // Into the area (from its square away): the cards for it since.
        const enter = async () => {
            await undeadToken.update(away);
            await wait(800);
            const shape = area().shapes[0];
            const since = Date.now();
            await undeadToken.update({ x: shape.x - canvas.grid.size / 2, y: shape.y + canvas.grid.size / 2 });
            await wait(2500);
            return game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && forZombie(message));
        };
        try {
            await (await give(user, "Aetheric Irritant (Lesser)")).consume();
            await until(() => area(), "the Lesser's Region", { timeout: 8000 });
            // (At +40 against DC 15, a critical success but for a natural 1: up to three tries.)
            for (let tries = 0; tries < 3 && !immune().length; tries++) {
                const [card] = await enter();
                assert(card, "the Lesser's save card");
                await rollAndApply(card);
                await wait(1500);
            }
            assert(immune().length === 1, "the Immune: Effect after a critical success");
            await area().delete();
            await until(() => !area(), "the Lesser's area gone", { timeout: 5000 });
            await (await give(user, "Aetheric Irritant (Major)")).consume();
            await until(() => area(), "the Major's Region", { timeout: 8000 });
            const cards = await enter();
            assert(cards.length === 0, `no card for the zombie in the Major's area (${cards.length})`);
            return { effect: immune()[0].name };
        } finally {
            canvas.regions.placeRegion = placing;
            await area()?.delete().catch(() => null);
        }
    },

    // Hydra Spear's Hydra Swipe (src/compiler/volley.js): up to three melee Strikes, each at a different creature — a second Strike at the
    // creature already struck isn't one of them and spends none; one at another creature spends the next.
    async volleyDifferent(scene) {
        await clearSquares(scene, [[12, 12], [13, 12], [13, 13]]);
        const { actor: spearman, token: spearToken } = await creature(scene, "Hydra Spearman", { type: "character", x: 12, y: 12 });
        const { token: firstToken } = await creature(scene, "Hydra First", { x: 13, y: 12, ac: 1, alliance: "opposition", hp: 200 });
        const { token: secondToken } = await creature(scene, "Hydra Second", { x: 13, y: 13, ac: 1, alliance: "opposition", hp: 200 });
        const spear = await give(spearman, "Hydra Spear");
        await spear.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 2 });
        await until(() => spearToken.object && firstToken.object && secondToken.object, "the tokens drawn", { timeout: 5000 });
        await spearToken.object?.control?.();
        const readied = () => spearman.itemTypes.effect.find((effect) => effect.flags?.[NS]?.strikeRider);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(spear.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        assert(/Up to 3 Strikes/.test(card.content) && /Each at a different creature within 20 feet/.test(card.content), "its lines");
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => readied()?.flags[NS].strikeRider.uses === 3, "three readied", { timeout: 8000 });
        await target(firstToken);
        await strike(spearman, spear);
        await until(() => readied()?.flags[NS].strikeRider.uses === 2, "one spent", { timeout: 8000 });
        since = Date.now();
        await strike(spearman, spear);
        const again = await messageAfter(since, (message) => /already struck by it/.test(message.content ?? ""), { what: "the line for the creature already struck" });
        assert(readied()?.flags[NS].strikeRider.uses === 2, `none spent (${readied()?.flags[NS].strikeRider.uses})`);
        await target(secondToken);
        await strike(spearman, spear);
        await until(() => readied()?.flags[NS].strikeRider.uses === 1, "the next spent at the second creature", { timeout: 8000 });
        return { again: again.content.replace(/<[^>]+>/g, "") };
    },

    // Minotaur Chair: an attack at every foe in the line — Apply with those targeted readies one Strike at each; a Strike at another isn't one
    // of them; the last spends it.
    async volleyEachTargeted(scene) {
        await clearSquares(scene, [[12, 15], [13, 15], [14, 15], [13, 16]]);
        const { actor: rider, token: riderToken } = await creature(scene, "Chair Rider", { type: "character", x: 12, y: 15 });
        const { token: oneToken } = await creature(scene, "Chair Foe One", { x: 13, y: 15, ac: 1, alliance: "opposition", hp: 200 });
        const { token: twoToken } = await creature(scene, "Chair Foe Two", { x: 14, y: 15, ac: 1, alliance: "opposition", hp: 200 });
        const { token: otherToken } = await creature(scene, "Chair Bystander", { x: 13, y: 16, ac: 1, alliance: "opposition", hp: 200 });
        const chair = await give(rider, "Minotaur Chair");
        const sword = await give(rider, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await until(() => riderToken.object && oneToken.object && twoToken.object && otherToken.object, "the tokens drawn", { timeout: 5000 });
        await riderToken.object?.control?.();
        const readied = () => rider.itemTypes.effect.find((effect) => effect.flags?.[NS]?.strikeRider);
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(chair.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        let refused = null;
        try {
            await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        } catch (error) {
            refused = error.message;
        }
        assert(/^Target each enemy/.test(refused ?? ""), `refused with none targeted (${refused})`);
        await game.modules.get(NS).api.live.apply(card.id, { targets: [oneToken.uuid, twoToken.uuid] });
        await until(() => readied()?.flags[NS].strikeRider.uses === 2, "one at each of the two", { timeout: 8000 });
        await target(oneToken);
        await strike(rider, sword);
        await until(() => readied()?.flags[NS].strikeRider.uses === 1, "one spent", { timeout: 8000 });
        await target(otherToken);
        since = Date.now();
        await strike(rider, sword);
        await messageAfter(since, (message) => /isn't one of those targeted for it/.test(message.content ?? ""), { what: "the line for a creature not targeted" });
        await target(twoToken);
        await strike(rider, sword);
        await until(() => !readied(), "all spent", { timeout: 8000 });
        return { refused };
    },

    // Caress of the Great Serpent's Serpent's Kiss: each Strike made of the eight deals its user 1d6 piercing, hit or miss; −2 to each.
    async volleySelfDamage(scene) {
        await clearSquares(scene, [[15, 12], [16, 12]]);
        const { actor: wielder, token: wielderToken } = await creature(scene, "Urumi Wielder", { type: "character", x: 15, y: 12, level: 18 });
        const { token: foeToken } = await creature(scene, "Urumi Foe", { x: 16, y: 12, ac: 1, alliance: "opposition", hp: 400 });
        const urumi = await give(wielder, "Caress of the Great Serpent");
        await urumi.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await until(() => wielderToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await wielderToken.object?.control?.();
        const since = Date.now();
        await game.modules.get(NS).api.live.activate(urumi.uuid, 0);
        const card = await messageAfter(since, itemCard("strike"), { what: "the Strike card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await wait(800);
        // (A bare character has no Hit Points, and PF2e then takes no damage: 50 for it, PF2e's FlatModifier on "hp".)
        await wielder.createEmbeddedDocuments("Item", [{ name: `${PREFIX} Hit Points`, type: "effect", system: { rules: [{ key: "FlatModifier", selector: "hp", value: 50 }], duration: { value: -1, unit: "unlimited", expiry: null, sustained: false } } }]);
        await wait(300);
        await wielder.update({ "system.attributes.hp.value": 50 });
        const hp = () => Number(wielder.system.attributes.hp.value) || 0;
        const before = hp();
        await target(foeToken);
        const { attack } = await strike(wielder, urumi);
        const penalty = (attack.flags.pf2e.modifiers ?? []).find((modifier) => modifier.modifier === -2 && modifier.enabled !== false);
        assert(penalty, `−2 on the Strike (${JSON.stringify((attack.flags.pf2e.modifiers ?? []).map((modifier) => [modifier.label, modifier.modifier]))})`);
        await until(() => hp() < before && hp() >= before - 6, "1d6 piercing on its user", { timeout: 8000 });
        return { lost: before - hp() };
    },

    // Devil's Breath Incense (burningZone): the ability module's 10-foot zone placed next to its user for 10 minutes; a creature in it as it's
    // lit gets the DC 23 Fortitude save card, and once that's applied it's immune for an hour — out and back in, no card.
    async incenseZone(scene) {
        await clearSquares(scene, [[2, 12], [3, 12], [7, 12]]);
        const { actor: user, token: userToken } = await creature(scene, "Incense Burner", { type: "character", x: 2, y: 12 });
        const { actor: foe, token: foeToken } = await creature(scene, "Incense Neighbour", { x: 3, y: 12, alliance: "opposition", save: -30 });
        const incense = await give(user, "Devil's Breath Incense");
        await until(() => userToken.object && foeToken.object, "the tokens drawn", { timeout: 5000 });
        await userToken.object?.control?.();
        const ABILITY = "pf2e-automatic-ability-resolution";
        const placing = canvas.regions.placeRegion;
        // (Its area centred on the neighbour's square.)
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [{ ...data, shapes: (data.shapes ?? []).map((shape) => ({ ...shape, x: foeToken.x + canvas.grid.size / 2, y: foeToken.y + canvas.grid.size / 2 })) }]))[0];
        const area = () => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && /Devil's Breath/.test(region.name));
        const forFoe = (message) => abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid);
        const immune = () => foe.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.immunity?.slug === "devils-breath-incense");
        try {
            let since = Date.now();
            await incense.consume();
            await until(() => area(), "the incense's Region", { timeout: 8000 });
            const lasts = area().flags[ABILITY].zone.zone.lasts;
            assert(lasts?.value === 10 && lasts.unit === "minutes", `10 minutes (${JSON.stringify(lasts)})`);
            const card = await messageAfter(since, forFoe, { what: "the neighbour's save card", timeout: 10000 });
            assert(card.flags[ABILITY].card.plan.resolution.check.against.value === 23, "DC 23 Fortitude");
            await rollAndApply(card);
            await until(() => immune().length === 1 && foe.itemTypes.condition.some((condition) => condition.slug === "sickened"), "Sickened and the hour's immunity", { timeout: 10000 });
            await foeToken.update({ x: 7 * canvas.grid.size });
            await wait(800);
            since = Date.now();
            await foeToken.update({ x: 3 * canvas.grid.size });
            await wait(2500);
            const later = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && forFoe(message));
            assert(later.length === 0, `no second card (${later.length})`);
            return { sickened: foe.itemTypes.condition.find((condition) => condition.slug === "sickened")?.value };
        } finally {
            canvas.regions.placeRegion = placing;
            await area()?.delete().catch(() => null);
        }
    },

    // Lit candles and incense (src/compiler/lit-area.js; ability c4b48ed): Candle of Inflamed Passions' −1 status to saves against emotion
    // effects for a creature inside (PF2e's "item:trait:emotion"); Incense of Distilled Death's fast healing 4 for an undead inside, not a
    // living one; Candle of Truth's Will save for its own user too.
    async litAreas(scene) {
        await clearSquares(scene, [[8, 18], [9, 18], [12, 18], [13, 18], [16, 18]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: lighter, token: lighterToken } = await creature(scene, "Candle Lighter", { type: "character", x: 8, y: 18 });
        const { actor: guest, token: guestToken } = await creature(scene, "Candle Guest", { x: 9, y: 18 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Incense Ghoul", { x: 12, y: 18, alliance: "opposition" });
        const { actor: living, token: livingToken } = await creature(scene, "Incense Living", { x: 13, y: 18, alliance: "opposition" });
        await undead.update({ "system.traits.value": ["undead"] });
        await until(() => lighterToken.object && guestToken.object && undeadToken.object && livingToken.object, "the tokens drawn", { timeout: 5000 });
        await lighterToken.object?.control?.();
        const zoneOf = (name) => scene.regions.find((region) => region.flags?.[ABILITY]?.zone && region.name.includes(name));
        const inside = (actor) => actor.itemTypes.effect.filter((effect) => / inside/.test(effect.name)).flatMap((effect) => effect.system.rules ?? []);
        const placing = canvas.regions.placeRegion;
        canvas.regions.placeRegion = async (data) => (await scene.createEmbeddedDocuments("Region", [{ ...data, shapes: (data.shapes ?? []).map((shape) => ({ ...shape, x: undeadToken.x + canvas.grid.size, y: undeadToken.y + canvas.grid.size / 2 })) }]))[0];
        try {
            await (await give(lighter, "Candle of Inflamed Passions")).consume();
            await until(() => zoneOf("Inflamed Passions"), "the candle's Region", { timeout: 8000 });
            await until(() => inside(guest).some((rule) => rule.key === "FlatModifier" && [].concat(rule.selector).includes("saving-throw") && rule.value === -1 && (rule.predicate ?? []).includes("item:trait:emotion")), "−1 to saves against emotion effects on the guest", { timeout: 8000 });
            await zoneOf("Inflamed Passions").delete();
            await (await give(lighter, "Incense of Distilled Death")).consume();
            await until(() => zoneOf("Distilled Death"), "the incense's Region", { timeout: 8000 });
            await until(() => inside(undead).some((rule) => rule.key === "FastHealing" && rule.value === 4), "fast healing 4 on the undead", { timeout: 8000 });
            assert(!inside(living).some((rule) => rule.key === "FastHealing"), "none on the living creature");
            await zoneOf("Distilled Death").delete();
            const since = Date.now();
            await (await give(lighter, "Candle of Truth")).consume();
            await until(() => zoneOf("Candle of Truth"), "the candle's Region", { timeout: 8000 });
            const own = await messageAfter(since, (message) => abilitySaveCard(message) && (message.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === lighter.uuid), { what: "its user's own save card", timeout: 10000 });
            assert(own.flags[ABILITY].card.plan.resolution.check.against.value === 26, "the DC 26 Will save");
            return { lie: inside(guest).find((rule) => [].concat(rule.selector).includes("deception"))?.value ?? null };
        } finally {
            canvas.regions.placeRegion = placing;
            for (const name of ["Inflamed Passions", "Distilled Death", "Candle of Truth"]) await zoneOf(name)?.delete().catch(() => null);
        }
    },

    // Moonlit Spellgun's critical success at two creatures (plan.ifTarget): Enfeebled 1 on the one weak to silver, not on the other — one
    // ability card for each (AC -30: a critical hit but for a natural 1).
    async moonlitEnfeebled(scene) {
        await clearSquares(scene, [[14, 16], [16, 16], [16, 17]]);
        const { actor: gunner, token: gunnerToken } = await creature(scene, "Moon Gunner", { type: "character", x: 14, y: 16 });
        const { actor: weak, token: weakToken } = await creature(scene, "Moon Werewolf", { x: 16, y: 16, ac: -30, hp: 300, alliance: "opposition" });
        const { actor: plain, token: plainToken } = await creature(scene, "Moon Bandit", { x: 16, y: 17, ac: -30, hp: 300, alliance: "opposition" });
        await weak.update({ "system.attributes.weaknesses": [{ type: "silver", value: 5 }] });
        const pistol = await give(gunner, "Flintlock Pistol");
        await pistol.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await until(() => gunnerToken.object && weakToken.object && plainToken.object, "the tokens drawn", { timeout: 5000 });
        await gunnerToken.object?.control?.();
        const ABILITY = "pf2e-automatic-ability-resolution";
        const enfeebled = (actor) => actor.itemTypes.condition.some((condition) => condition.slug === "enfeebled");
        const dazzled = (actor) => actor.itemTypes.condition.some((condition) => condition.slug === "dazzled");
        for (let tries = 0; tries < 3 && !enfeebled(weak); tries++) {
            const gun = await give(gunner, "Moonlit Spellgun (Lesser)");
            await wait(400);
            let since = Date.now();
            await gun.consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the spellgun's card" });
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [weakToken.uuid, plainToken.uuid], attackChoice: 0, damageChoice: 0 });
            await wait(1500);
            const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
            assert(cards.length === 2, `one card each (${cards.length})`);
            for (const entry of cards) await rollAndApply(entry);
            await wait(2500);
        }
        assert(enfeebled(weak) && dazzled(weak), "the werewolf Enfeebled and Dazzled");
        // (Its own card applied after the werewolf's: waited for.)
        await until(() => dazzled(plain), "the bandit Dazzled", { timeout: 10000 });
        assert(dazzled(plain) && !enfeebled(plain), `the bandit Dazzled, not Enfeebled (${plain.itemTypes.condition.map((condition) => condition.slug).join(", ")})`);
        return { werewolf: weak.itemTypes.condition.map((condition) => condition.slug) };
    },

    // Bane Oil (fiend picked) on a longsword: its 1d6 on a Strike's damage against a fiend (PF2e's DamageDice, target:trait:fiend), not
    // against a creature without the trait.
    async baneOilFiend(scene) {
        await clearSquares(scene, [[2, 16], [3, 16], [3, 17]]);
        const { actor: fighter, token: fighterToken } = await creature(scene, "Bane Fighter", { type: "character", x: 2, y: 16 });
        const { actor: fiend, token: fiendToken } = await creature(scene, "Bane Fiend", { x: 3, y: 16, ac: 1, hp: 300, alliance: "opposition" });
        const { token: plainToken } = await creature(scene, "Bane Bandit", { x: 3, y: 17, ac: 1, hp: 300, alliance: "opposition" });
        await fiend.update({ "system.traits.value": ["fiend"] });
        const sword = await give(fighter, "Longsword");
        await sword.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await until(() => fighterToken.object && fiendToken.object && plainToken.object, "the tokens drawn", { timeout: 5000 });
        await fighterToken.object?.control?.();
        const oil = await give(fighter, "Bane Oil");
        const since = Date.now();
        await oil.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the oil's card" });
        const state = card.getFlag(NS, "card");
        const weapon = (state.weapons ?? []).findIndex((entry) => entry.id === sword.id);
        const choice = state.plan.item.rune.choices.findIndex((entry) => entry.traits.includes("fiend"));
        await game.modules.get(NS).api.live.apply(card.id, { runeWeapon: weapon, runeChoice: choice });
        const bane = () => fighter.itemTypes.effect.find((effect) => effect.flags?.[NS]?.rune === "bane");
        await until(() => bane(), "the Bane Effect", { timeout: 8000 });
        const damageAt = async (token) => {
            await target(token);
            const action = (fighter.system.actions ?? []).find((entry) => entry.item?.id === sword.id);
            const at = Date.now();
            await action.damage({ event: shift() });
            const message = await messageAfter(at, (entry) => entry.flags?.pf2e?.context?.type === "damage-roll", { what: "the damage roll" });
            return message.rolls[0]?.formula ?? "";
        };
        const atFiend = await damageAt(fiendToken);
        const atBandit = await damageAt(plainToken);
        assert(/\b1d6\b/.test(atFiend) && !/\b1d6\b/.test(atBandit), `1d6 against the fiend only (${atFiend} / ${atBandit})`);
        return { atFiend, atBandit };
    },

    // Iron Wine twice in a day (plan.dose): the second cup gives PF2e's Iron Wine Weakness too; Invigorating Soap ends its user's Fatigued.
    async secondDoseAndSoap(scene) {
        await clearSquares(scene, [[6, 16]]);
        const { actor: drinker } = await creature(scene, "Wine Drinker", { type: "character", x: 6, y: 16 });
        const cup = async () => {
            const wine = await give(drinker, "Iron Wine");
            const since = Date.now();
            await wine.consume();
            const card = await messageAfter(since, itemCard("item"), { what: "the wine's card" });
            await game.modules.get(NS).api.live.apply(card.id);
            await wait(800);
            return card;
        };
        const weakness = () => drinker.itemTypes.effect.filter((effect) => /Iron Wine Weakness/.test(effect.name));
        await cup();
        assert(weakness().length === 0, "not on the first cup");
        const second = await cup();
        await until(() => weakness().length === 1, "the Weakness on the second cup", { timeout: 8000 });
        await drinker.increaseCondition("fatigued");
        const soap = await give(drinker, "Invigorating Soap");
        const since = Date.now();
        await soap.consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the soap's card" });
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => !drinker.hasCondition("fatigued"), "Fatigued ended", { timeout: 8000 });
        return { second: game.messages.get(second.id).getFlag(NS, "card").results };
    },

    // A new save at its turns (src/compiler/save-ends.js; the ability's duration.saveEnds): Tusk and Fang Chain's critical failure, Confused
    // for 1 minute; once its turn is over, its Will save card; a success ends it.
    async saveEndsChain(scene) {
        await clearSquares(scene, [[2, 17], [3, 17]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Chain Wearer", { type: "character", x: 2, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Chain Foe", { x: 3, y: 17, alliance: "opposition", save: -30, level: 16 });
        const confused = () => foe.itemTypes.condition.some((condition) => condition.slug === "confused");
        const tracked = () => foe.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.saveEnds);
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 20 }, { tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await (await give(user, "Tusk and Fang Chain")).consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the chain's card" });
            await userToken.object?.control?.();
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            const save = await messageAfter(since, abilitySaveCard, { what: "its save card" });
            await withDie(10, async () => {
                await rollAndApply(save);
                await until(() => confused() && tracked().length === 1, "Confused, with its save at its turns", { timeout: 10000 });
            });
            const flag = tracked()[0].flags[ABILITY].saveEnds;
            assert(flag.save === "will" && flag.dc === 35 && flag.mode === "end", `a Will save at DC 35 that ends it (${JSON.stringify(flag)})`);
            await foe.update({ "system.saves.will.value": 30 });
            since = Date.now();
            await combat.nextTurn();
            const again = await messageAfter(since, recurringFor(foe), { what: "the end-of-turn save card", timeout: 10000 });
            await withDie(10, async () => {
                await pressRecurring(again, "roll");
                await until(() => !confused() && !tracked().length, "the confusion ended by its save", { timeout: 10000 });
            });
            return { result: recurringResult(again)?.result };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Spirit-Sealing Fulu (Greater) at an undead (mode "reduce"): its critical failure paralyzed for 4 rounds; at the end of its turn, a
    // success at the new Will save takes a round off.
    async saveEndsFulu(scene) {
        await clearSquares(scene, [[5, 17], [6, 17]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Fulu Binder", { type: "character", x: 5, y: 17 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Fulu Undead", { x: 6, y: 17, alliance: "opposition", save: -30, level: 10 });
        await undead.update({ "system.traits.value": ["undead"] });
        const tracked = () => undead.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.saveEnds);
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: undeadToken.id, sceneId: scene.id, actorId: undead.id, initiative: 20 }, { tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await (await give(user, "Spirit-Sealing Fulu (Greater)")).consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the fulu's card" });
            await userToken.object?.control?.();
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [undeadToken.uuid] });
            const save = await messageAfter(since, abilitySaveCard, { what: "its save card" });
            await withDie(10, async () => {
                await rollAndApply(save);
                await until(() => undead.hasCondition("paralyzed") && tracked().length === 1, "paralyzed, with its save at its turns", { timeout: 10000 });
            });
            const [effect] = tracked();
            assert(effect.system.duration.value === 4 && effect.system.duration.unit === "rounds" && effect.flags[ABILITY].saveEnds.mode === "reduce", `4 rounds, a save taking rounds off (${effect.system.duration.value} ${effect.system.duration.unit}, ${JSON.stringify(effect.flags[ABILITY].saveEnds)})`);
            // (A 10 on the die at +17 against DC 27: a success.)
            await undead.update({ "system.saves.will.value": 17 });
            since = Date.now();
            await combat.nextTurn();
            const again = await messageAfter(since, recurringFor(undead), { what: "the end-of-turn save card", timeout: 10000 });
            await withDie(10, async () => {
                await pressRecurring(again, "roll");
                await until(() => recurringResult(again)?.status === "done", "the save's result", { timeout: 10000 });
            });
            assert(tracked().length === 1 && tracked()[0].system.duration.value === 3 && undead.hasCondition("paralyzed"), `a round off: 3 left, still paralyzed (${tracked()[0]?.system.duration.value}; ${recurringResult(again)?.result})`);
            return { result: recurringResult(again)?.result };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Gearbinder Oil (Lesser), mode "escalate" behind the GM's gate: its critical failure Slowed 2; once its turn is over the GM
    // says it acted (yes): a critical failure, Slowed 3 (at most 3); the next turn, no (no save); then a critical success ends it all.
    async saveEndsGearbinder(scene) {
        await clearSquares(scene, [[8, 17], [9, 17]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Oil Squirter", { type: "character", x: 8, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Oiled Construct", { x: 9, y: 17, alliance: "opposition", save: -30, level: 6 });
        const slowed = () => foe.getCondition("slowed")?.value ?? 0;
        const tracked = () => foe.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.saveEnds);
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        const foeTurnEnds = async () => {
            const since = Date.now();
            // (Its own turn ends: past the user's turn first, after the first.)
            if (combat.combatant?.actorId !== foe.id) await combat.nextTurn();
            await combat.nextTurn();
            return messageAfter(since, recurringFor(foe), { what: "the end-of-turn card", timeout: 10000 });
        };
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 20 }, { tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await (await give(user, "Gearbinder Oil (Lesser)")).consume();
            const card = await messageAfter(since, itemCard("expose"), { what: "the oil's card" });
            await userToken.object?.control?.();
            since = Date.now();
            await game.modules.get(NS).api.live.apply(card.id, { targets: [foeToken.uuid] });
            const save = await messageAfter(since, abilitySaveCard, { what: "its save card" });
            await withDie(10, async () => {
                await rollAndApply(save);
                await until(() => slowed() === 2 && tracked().length === 1, "Slowed 2, with its saves at its turns", { timeout: 10000 });
            });
            const flag = tracked()[0].flags[ABILITY].saveEnds;
            assert(flag.mode === "escalate" && flag.max === 3 && flag.rounds === 6 && /attack, manipulate, or move/.test(flag.gate ?? ""), `escalating, at most 3, 6 rounds, gated (${JSON.stringify(flag)})`);
            const first = await foeTurnEnds();
            await pressRecurring(first, "yes");
            await withDie(10, async () => {
                await pressRecurring(first, "roll");
                await until(() => recurringResult(first)?.status === "done", "the first save's result", { timeout: 10000 });
            });
            assert(slowed() === 3, `a critical failure: Slowed 3, at most (${slowed()}; ${recurringResult(first)?.result})`);
            const second = await foeTurnEnds();
            await pressRecurring(second, "no");
            await until(() => recurringResult(second)?.status === "done", "no save this turn", { timeout: 8000 });
            assert(slowed() === 3, `no save: still Slowed 3 (${slowed()})`);
            await foe.update({ "system.saves.fortitude.value": 30 });
            const third = await foeTurnEnds();
            await pressRecurring(third, "yes");
            await withDie(10, async () => {
                await pressRecurring(third, "roll");
                await until(() => slowed() === 0 && !tracked().length, "a critical success: it ends", { timeout: 10000 });
            });
            return { results: [first, second, third].map((message) => recurringResult(message)?.result) };
        } finally {
            await combat.delete().catch(() => null);
        }
    },

    // Phoenix Flask (src/compiler/round-burst.js): PF2e's Effect on its drinker (its Fly Speed), and the feathers' save card kept open; used at
    // a creature next to the drinker, the ability module's basic Reflex save card deals it the fire damage, and the card stays open.
    async phoenixFeathers(scene) {
        await clearSquares(scene, [[14, 17], [15, 17]]);
        const { actor: drinker, token: drinkerToken } = await creature(scene, "Phoenix Drinker", { type: "character", x: 14, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Feathered Foe", { x: 15, y: 17, alliance: "opposition" });
        let since = Date.now();
        await (await give(drinker, "Phoenix Flask")).consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the flask's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => drinker.itemTypes.effect.some((effect) => effect.name === "Effect: Phoenix Flask"), "PF2e's Phoenix Flask Effect", { timeout: 8000 });
        const later = await messageAfter(since, itemCard("expose"), { what: "the feathers' card" });
        assert(/first time each round/.test(later.content ?? ""), "its words: once each round, after flying");
        await drinkerToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(later.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the feathers' save card" });
        const before = foe.system.attributes.hp.value;
        await withDie(10, () => rollAndApply(save));
        await until(() => foe.system.attributes.hp.value < before, "fire damage on the creature next to it", { timeout: 10000 });
        assert(game.messages.get(later.id).getFlag(NS, "card").status === "open", "the card still open for its minute");
        return { lost: before - foe.system.attributes.hp.value };
    },

    // Blight Breath (src/compiler/effect-then-card.js): PF2e's Effect on its drinker (resistance 10 to poison), then the exhale's card for
    // later; used at a creature next to it, the ability module's basic Reflex save card, and the resistance ends with the breath let out.
    async effectThenBreath(scene) {
        await clearSquares(scene, [[17, 17], [18, 17]]);
        const { actor: drinker, token: drinkerToken } = await creature(scene, "Blight Breather", { type: "character", x: 17, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Blighted Foe", { x: 18, y: 17, alliance: "opposition", hp: 80 });
        const resisting = () => drinker.itemTypes.effect.filter((effect) => effect.name === "Effect: Blight Breath");
        let since = Date.now();
        await (await give(drinker, "Blight Breath")).consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the breath's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => resisting().length === 1, "PF2e's Blight Breath Effect", { timeout: 8000 });
        assert(drinker.system.attributes.resistances.some((entry) => entry.type === "poison" && entry.value === 10), "resistance 10 to poison");
        const later = await messageAfter(since, itemCard("expose"), { what: "the exhale's card" });
        await drinkerToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(later.id, { targets: [foeToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the exhale's save card" });
        await until(() => resisting().length === 0, "the resistance gone with the exhale", { timeout: 8000 });
        const before = foe.system.attributes.hp.value;
        await withDie(10, () => rollAndApply(save));
        await until(() => foe.system.attributes.hp.value < before, "poison damage on the creature next to it", { timeout: 10000 });
        return { lost: before - foe.system.attributes.hp.value };
    },

    // Horn of the Archon's Archon's Note (plan.again after a save card): its allies' +1 status bonus to attack rolls and saves, at the ally
    // targeted; then its enemies' Fortitude save card, at the foe: a critical failure, Stunned 2.
    async hornAlliesThenSave(scene) {
        await clearSquares(scene, [[2, 19], [3, 19], [4, 19]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Archon Herald", { type: "character", x: 2, y: 19 });
        const { actor: ally, token: allyToken } = await creature(scene, "Archon Ally", { x: 3, y: 19 });
        const { actor: foe, token: foeToken } = await creature(scene, "Archon Foe", { x: 4, y: 19, alliance: "opposition", save: -30, level: 12 });
        const horn = await give(user, "Horn of the Archon");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(horn.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the allies' card" });
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [allyToken.uuid] });
        const allies = await messageAfter(since, abilitySaveCard, { what: "the allies' card from the ability module" });
        await applyAbilityCard(allies);
        const rules = () => ally.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).filter((rule) => rule.key === "FlatModifier" && Number(rule.value) === 1 && rule.type === "status");
        await until(() => rules().length >= 2, "the ally's +1 status bonuses", { timeout: 10000 });
        const save = await messageAfter(since, (message) => itemCard("expose")(message) && message.id !== card.id, { what: "the enemies' save card", timeout: 10000 });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(save.id, { targets: [foeToken.uuid] });
        const foeCard = await messageAfter(since, abilitySaveCard, { what: "the foe's save card" });
        await withDie(10, () => rollAndApply(foeCard));
        await until(() => (foe.getCondition("stunned")?.value ?? 0) === 2, "Stunned 2 on the foe", { timeout: 10000 });
        return { selectors: rules().map((rule) => [].concat(rule.selector).join(",")), stunned: foe.getCondition("stunned")?.value };
    },

    // Lamentation of the Faithless's Lo and Behold (src/compiler/kind-saves.js): its save card for a holy creature at -2 status, another for a
    // plain one with none, and no card for an unholy one (immune), a line instead.
    async lamentationKinds(scene) {
        await clearSquares(scene, [[6, 19], [7, 19], [8, 19], [9, 19]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Lament Bearer", { type: "character", x: 6, y: 19 });
        const { actor: holy, token: holyToken } = await creature(scene, "Lament Holy", { x: 7, y: 19, alliance: "opposition" });
        const { actor: unholy, token: unholyToken } = await creature(scene, "Lament Unholy", { x: 8, y: 19, alliance: "opposition" });
        const { actor: plain, token: plainToken } = await creature(scene, "Lament Plain", { x: 9, y: 19, alliance: "opposition" });
        await holy.update({ "system.traits.value": ["holy"] });
        await unholy.update({ "system.traits.value": ["unholy"] });
        const blade = await give(user, "Lamentation of the Faithless");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(blade.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the blade's card" });
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [holyToken.uuid, unholyToken.uuid, plainToken.uuid] });
        await until(() => game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).length >= 2, "two save cards", { timeout: 10000 });
        await wait(1000);
        const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message)).map((message) => message.flags[ABILITY].card);
        const forActor = (actor) => cards.find((state) => (state.targets ?? []).some((target) => target.actorUuid === actor.uuid));
        assert(cards.length === 2, `two cards (${cards.length})`);
        assert(Number(forActor(holy)?.check?.bonus?.value) === -2 && forActor(holy).check.bonus.type === "status", `the holy creature's -2 status (${JSON.stringify(forActor(holy)?.check)})`);
        assert(!forActor(plain)?.check?.bonus, `none for the plain one (${JSON.stringify(forActor(plain)?.check)})`);
        assert(!forActor(unholy), "no card for the unholy one");
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /Lament Unholy: immune/.test(line)) && !results.some((line) => /Lament Unholy\b[^:]*: [^:]*card follows/.test(line)), `its line, and no card line for it (${JSON.stringify(results)})`);
        return { results };
    },

    // Maelstromic Destabilizer (src/compiler/weakened-around.js, ability f25a67d's zone.inside[i].who): its zone around its holder — the holder
    // resistance 2 to spirit, the creature next to it weakness 2 to spirit.
    async destabilizerAround(scene) {
        await clearSquares(scene, [[11, 19], [12, 19]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: holder, token: holderToken } = await creature(scene, "Destabilizer Holder", { type: "character", x: 11, y: 19 });
        const { actor: other } = await creature(scene, "Destabilized Neighbour", { x: 12, y: 19, alliance: "opposition" });
        const earlier = new Set(scene.regions.map((region) => region.id));
        const zone = () => scene.regions.find((region) => !earlier.has(region.id) && region.flags?.[ABILITY]?.zone);
        const resisted = () => (holder.system.attributes.resistances ?? []).some((entry) => entry.type === "spirit" && Number(entry.value) === 2);
        const weak = (actor) => (actor.system.attributes.weaknesses ?? []).some((entry) => entry.type === "spirit" && Number(entry.value) === 2);
        try {
            await holderToken.object?.control?.();
            await (await give(holder, "Maelstromic Destabilizer (Lesser)")).consume();
            await until(() => zone(), "the destabilizer's Region", { timeout: 8000 });
            await until(() => resisted() && weak(other), "the holder's resistance and the neighbour's weakness", { timeout: 10000 });
            assert(!weak(holder), "no weakness on the holder");
            return { holder: holder.system.attributes.resistances.map((entry) => `${entry.type} ${entry.value}`), other: other.system.attributes.weaknesses.map((entry) => `${entry.type} ${entry.value}`) };
        } finally {
            await zone()?.delete().catch(() => null);
        }
    },

    // Slumber Arrow (src/compiler/kind-saves.js, guards.js failureThenAlso): its save only for a living creature — an undead targeted gets a
    // line, no card — and the living one's critical failure Slowed 1 beside the -5-foot status penalty to its Speeds.
    async slumberLiving(scene) {
        await clearSquares(scene, [[14, 19], [15, 19], [16, 19]]);
        const { actor: archer, token: archerToken } = await creature(scene, "Slumber Archer", { type: "character", x: 14, y: 19 });
        const { actor: undead, token: undeadToken } = await creature(scene, "Slumber Undead", { x: 15, y: 19, alliance: "opposition" });
        const { actor: living, token: livingToken } = await creature(scene, "Slumber Living", { x: 16, y: 19, alliance: "opposition", save: -30 });
        await undead.update({ "system.traits.value": ["undead"] });
        const arrow = await give(archer, "Slumber Arrow");
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(arrow.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the arrow's card" });
        await archerToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [undeadToken.uuid, livingToken.uuid] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the living creature's save card" });
        await wait(800);
        const cards = game.messages.contents.filter((message) => Number(message.timestamp ?? 0) >= since && abilitySaveCard(message));
        assert(cards.length === 1 && !(cards[0].flags["pf2e-automatic-ability-resolution"].card.targets ?? []).some((entry) => entry.actorUuid === undead.uuid), `one card, not for the undead (${cards.length})`);
        await withDie(10, () => rollAndApply(save));
        const slowed = () => living.getCondition("slowed")?.value ?? 0;
        const slower = () => living.itemTypes.effect.flatMap((effect) => effect.system.rules ?? []).some((rule) => rule.key === "FlatModifier" && Number(rule.value) === -5 && [].concat(rule.selector).some((selector) => /speed/.test(selector)));
        await until(() => slowed() === 1 && slower(), "Slowed 1 and the -5-foot Speed penalty", { timeout: 10000 });
        const results = game.messages.get(card.id).getFlag(NS, "card").results;
        assert(results.some((line) => /Slumber Undead: immune/.test(line)), `the undead's line (${JSON.stringify(results)})`);
        return { results };
    },

    // Vermin Repellent Agent (Lesser) (src/compiler/effect-then-card.js): PF2e's Effect on its user, then its attackers' card, kept open for
    // its 4 hours; set off by an arthropod attacking, its save card at it.
    async verminThenCard(scene) {
        await clearSquares(scene, [[17, 19], [18, 19]]);
        const { actor: user, token: userToken } = await creature(scene, "Vermin Repelled", { type: "character", x: 17, y: 19 });
        const { token: bugToken } = await creature(scene, "Vermin Bug", { x: 18, y: 19, alliance: "opposition" });
        let since = Date.now();
        await (await give(user, "Vermin Repellent Agent (Lesser)")).consume();
        const card = await messageAfter(since, itemCard("item"), { what: "the repellent's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id);
        await until(() => user.itemTypes.effect.some((effect) => effect.name === "Effect: Vermin Repellent Agent"), "PF2e's Vermin Repellent Agent Effect", { timeout: 8000 });
        const later = await messageAfter(since, itemCard("expose"), { what: "its attackers' card" });
        const state = later.getFlag(NS, "card");
        assert(state.later && state.repeat && state.attacker && state.until - game.time.worldTime === 4 * 3600, `open for 4 hours, set off by an attacker (${JSON.stringify({ later: state.later, repeat: state.repeat, attacker: state.attacker, left: state.until - game.time.worldTime })})`);
        await userToken.object?.control?.();
        since = Date.now();
        await game.modules.get(NS).api.live.apply(later.id, { targets: [bugToken.uuid] });
        await messageAfter(since, abilitySaveCard, { what: "the attacking arthropod's save card" });
        assert(game.messages.get(later.id).getFlag(NS, "card").status === "open", "still open after it");
        return { uses: game.messages.get(later.id).getFlag(NS, "card").uses };
    },

    // Lion Badge's "Requirements You are an expert in Will saves" (src/compiler/requirement.js): a bare character, untrained, uses it — its card
    // as ever, and a whisper to the GM that the requirement isn't met.
    async requirementWarned(scene) {
        await clearSquares(scene, [[2, 21]]);
        const { actor: user } = await creature(scene, "Badge Wearer", { type: "character", x: 2, y: 21 });
        const since = Date.now();
        await (await give(user, "Lion Badge")).consume();
        await messageAfter(since, itemCard("item"), { what: "the badge's card" });
        const warned = await messageAfter(since, (message) => /its Requirements need its user to be expert in Will saves/.test(message.content ?? ""), { what: "the GM's warning" });
        assert((warned.whisper ?? []).length > 0, "whispered");
        return { warning: warned.content };
    },

    // Apotheosis Knife's "Requirements Your previous action was a successful Strike with the apotheosis knife" (src/compiler/strike-gate.js):
    // activated before any hit, refused; after a hit (AC 1), its save card at the creature struck, none targeted.
    async strikeGated(scene) {
        await clearSquares(scene, [[4, 21], [5, 21]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Knife Wielder", { type: "character", x: 4, y: 21 });
        const { actor: foe, token: foeToken } = await creature(scene, "Knife Target", { x: 5, y: 21, ac: 1, alliance: "opposition" });
        const knife = await give(user, "Apotheosis Knife");
        await knife.update({ "system.equipped.carryType": "held", "system.equipped.handsHeld": 1 });
        await wait(300);
        let refused = null;
        try {
            await game.modules.get(NS).api.live.activate(knife.uuid, 0);
        } catch (error) {
            refused = error.message;
        }
        assert(/its Requirements need a successful Strike/.test(refused ?? ""), `refused before a hit (${refused})`);
        await userToken.object?.control?.();
        await target(foeToken);
        const { attack } = await withDie(15, () => strike(user, knife));
        assert(["success", "criticalSuccess"].includes(attack.flags.pf2e.context.outcome), `a hit (AC 1): ${attack.flags.pf2e.context.outcome}`);
        await target();
        let since = Date.now();
        await game.modules.get(NS).api.live.activate(knife.uuid, 0);
        const card = await messageAfter(since, itemCard("expose"), { what: "the knife's card" });
        since = Date.now();
        await game.modules.get(NS).api.live.apply(card.id, { targets: [] });
        const save = await messageAfter(since, abilitySaveCard, { what: "the struck creature's save card" });
        assert((save.flags[ABILITY].card.targets ?? []).some((entry) => entry.actorUuid === foe.uuid), "at the creature struck");
        return { refused };
    },

    // Golden Silencer (Greater)'s Strike save (its note Effect's note.saveEnds): a critical failure silenced for 1 minute, a note Effect a new
    // Fortitude save at the end of its turns ends.
    async saveEndsSilencer(scene) {
        await clearSquares(scene, [[11, 17], [12, 17]]);
        const ABILITY = "pf2e-automatic-ability-resolution";
        const { actor: user, token: userToken } = await creature(scene, "Silencer Gunner", { type: "character", x: 11, y: 17 });
        const { actor: foe, token: foeToken } = await creature(scene, "Silenced Foe", { x: 12, y: 17, alliance: "opposition", save: -30, level: 10 });
        const tracked = () => foe.itemTypes.effect.filter((effect) => effect.flags?.[ABILITY]?.saveEnds);
        const silencer = await give(user, "Golden Silencer (Greater)");
        const plan = game.modules.get(NS).api.compileItem(silencer)?.strike?.save;
        assert(plan?.resolution?.outcomes?.criticalFailure?.noteEffects?.[0]?.saveEnds, "its Strike save's note Effect with saveEnds");
        const combat = await Combat.create({ scene: scene.id, active: true, flags: { [NS]: { [FIXTURE]: true } } });
        try {
            await combat.createEmbeddedDocuments("Combatant", [{ tokenId: foeToken.id, sceneId: scene.id, actorId: foe.id, initiative: 20 }, { tokenId: userToken.id, sceneId: scene.id, actorId: user.id, initiative: 10 }]);
            await combat.startCombat();
            await wait(500);
            let since = Date.now();
            await game.modules.get(ABILITY).api.live.postCard({ plan, item: { name: silencer.name, uuid: silencer.uuid }, sourceActor: user, sourceToken: userToken, tokens: [foeToken.object], cause: `${silencer.name} hit` });
            const save = await messageAfter(since, abilitySaveCard, { what: "its save card" });
            await withDie(10, async () => {
                await rollAndApply(save);
                await until(() => tracked().length === 1, "the silenced note Effect, with its save at its turns", { timeout: 10000 });
            });
            const [note] = tracked();
            assert(/silenced/i.test(note.system.description.value) && note.flags[ABILITY].saveEnds.save === "fortitude" && note.flags[ABILITY].saveEnds.dc === 27, `silenced, a Fortitude save at DC 27 (${note.name}: ${JSON.stringify(note.flags[ABILITY].saveEnds)})`);
            await foe.update({ "system.saves.fortitude.value": 30 });
            since = Date.now();
            await combat.nextTurn();
            const again = await messageAfter(since, recurringFor(foe), { what: "the end-of-turn save card", timeout: 10000 });
            await withDie(10, async () => {
                await pressRecurring(again, "roll");
                await until(() => !tracked().length, "the note Effect ended by its save", { timeout: 10000 });
            });
            return { note: note.name, result: recurringResult(again)?.result };
        } finally {
            await combat.delete().catch(() => null);
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
    // (And what other modules say about them with no speaker of theirs, the morale checks: by their names, this check's prefix — 2026-10-26.)
    const names = actors.map((actor) => actor.name);
    const messages = game.messages.filter((message) => ids.has(message.speaker?.actor) || (names.length && names.some((name) => String(message.content ?? "").includes(name)))).map((message) => message.id);
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
