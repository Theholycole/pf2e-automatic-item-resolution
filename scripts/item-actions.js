// Live play for an item used by taking a skill action with it (src/compiler/item-actions.js, src/live/action-card.js):
// Apply, on the active GM's client, rolls PF2e's own action for the item's user (game.pf2e.actions.get(slug).use, as the
// spell module rolls its maneuvers), the item's bonus a PF2e Modifier on it, at the creature the presser targeted; then
// the ability module's row for that action and degree goes on the target (scripts/foundry.js applyRiders).

import { actionCardHTML, actionText, chosenAction, createActionCard, outcomeText } from "../src/live/action-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, applyRiders, entryOf, lowerAfflictionStage, recover, stateOf } from "./foundry.js";

const sluggify = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function postActionCard({ message, plan, used, actor, token }) {
    const state = createActionCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: actionCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// The variant of a PF2e action that has several (Administer First Aid's "stabilize" and "stop-bleeding"): by the target's
// state — dying, stabilize; taking persistent bleed damage, stop it — else the first.
function variantFor(pf2eAction, target) {
    const variants = [...(pf2eAction.variants?.keys?.() ?? [])];
    if (variants.length < 2) return null;
    const bleeding = (target?.itemTypes?.condition ?? []).some((condition) => condition.slug === "persistent-damage" && condition.system?.persistent?.damageType === "bleed");
    if (variants.includes("stabilize") && target?.hasCondition?.("dying")) return "stabilize";
    if (variants.includes("stop-bleeding") && bleeding) return "stop-bleeding";
    return variants[0];
}

// Stabilize's DC (Administer First Aid): 5 + the dying creature's recovery DC + its dying value, as PF2e's own macro has it.
function stabilizeDC(target) {
    const dying = target?.system?.attributes?.dying;
    if (!Number(dying?.value)) return null;
    return { value: 5 + (Number(dying.recoveryDC) || 10) + Number(dying.value) };
}

// A check's degree against a DC: by 10 either way a critical, a natural 20 one better and a natural 1 one worse.
const DEGREES = ["criticalFailure", "failure", "success", "criticalSuccess"];
function degreeAgainst(total, dc, natural = null) {
    let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total > dc - 10 ? 1 : 0;
    if (natural === 20) degree = Math.min(3, degree + 1);
    if (natural === 1) degree = Math.max(0, degree - 1);
    return DEGREES[degree];
}

// A condition on a creature from the card: the ability module's own (its timed or plain condition), else PF2e's.
async function giveCondition(actor, token, { slug, value, duration = null }, state) {
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const own = { plan: {}, ability: { name: state.item.name, uuid: state.item.uuid ?? null, slug: sluggify(state.item.name) }, source: { actorUuid: state.user.actorUuid ?? null, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name }, targets: [{ id: "t0", actorUuid: actor.uuid, tokenUuid: token?.uuid ?? token?.document?.uuid ?? null, name: token?.name ?? actor.name }] };
    const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug, value, target: "t0", duration }, own) : null;
    if (line !== null || ability?.applyChange) return line ?? `${token?.name ?? actor.name} is ${slug} ${value}`;
    await actor.increaseCondition?.(slug, { value });
    return `${token?.name ?? actor.name} is ${slug} ${value}`;
}

// What the item does after its user's own action (src/compiler/item-actions.js readWithinActivity), by the outcome: Yarrow-Root Bandage's bleed as
// PF2e's stop bleeding — a success's assisted recovery (the flat check at DC 10), a critical failure's bleed at once —; Curled Cure Gel's highest
// of its conditions lowered; Artevil Suspension's poison a stage lower (Pseudo Afflictions' badge), then its Sickened 2. → lines for the card.
const VECTORS = ["ingested", "inhaled", "contact", "injury"];
async function withinResults(action, outcome, token, state) {
    const actor = token?.actor;
    if (!actor || !outcome) return [];
    const name = token.name ?? actor.name;
    const won = outcome === "success" || outcome === "criticalSuccess";
    const lines = [];
    if (action.both && won) lines.push(...(await recover(actor, name, { types: ["bleed"], dc: 10 })));
    if (action.both && outcome === "criticalFailure") {
        for (const condition of (actor.itemTypes?.condition ?? []).filter((entry) => entry.slug === "persistent-damage" && entry.system?.persistent?.damageType === "bleed")) {
            const roll = await new Roll(String(condition.system.persistent.formula)).evaluate();
            await actor.applyDamage({ damage: roll.total, token });
            lines.push(`${name} takes its ${condition.system.persistent.formula} bleed at once: ${roll.total} damage`);
        }
    }
    if (action.reduce && won) {
        const present = action.reduce.choose.map((slug) => [slug, Number(actor.getCondition?.(slug)?.value) || 0]).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
        if (!present.length) lines.push(`${name} has none of ${action.reduce.choose.join(", ")}: nothing to lower`);
        else {
            for (let step = 0; step < action.reduce.by; step++) await actor.decreaseCondition(present[0][0]);
            lines.push(`${name}'s ${present[0][0]} lowered by ${action.reduce.by}`);
        }
    }
    if (action.stage && won) {
        // (Its vector when its traits say one: only a poison given that way.)
        const only = (one) => {
            const traits = [...(one.traits ?? []), ...(one.document?.traits ? [...one.document.traits] : [])];
            const vectors = VECTORS.filter((vector) => traits.includes(vector));
            return !vectors.length || vectors.includes(action.stage.vector);
        };
        const lowered = await lowerAfflictionStage(actor, name, { traits: ["poison"], by: action.stage.by, min: action.stage.min, only });
        lines.push(...lowered);
        if (lowered.lowered && action.stage.then) lines.push(await giveCondition(actor, token, action.stage.then, state));
    }
    return lines.filter(Boolean);
}

// targets: the token uuids the presser had targeted.
export async function applyActionCard(message, { targets = [], choice = null } = {}) {
    let state = stateOf(message);
    if (!state || state.kind !== "item-action" || state.status !== "open") return null;
    // (One of several actions, as picked.)
    if (Number.isInteger(choice) && state.plan.action?.slugs?.[choice]) state = { ...state, choice };
    const action = chosenAction(state);
    const actor = await fromUuid(state.user.actorUuid).catch(() => null);
    if (!actor) throw new Error(`${state.user.name} isn't there any more.`);
    const targetToken = action.targeted && Array.isArray(targets) && targets[0] ? await fromUuid(targets[0]).catch(() => null) : null;
    if (action.targeted && !targetToken?.actor) throw new Error("Target the creature first.");
    // (One check at several: the others, up to its number, compared with the same roll.)
    const others = action.maxTargets > 1 ? (await Promise.all(targets.slice(1, action.maxTargets).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor) : [];
    const pf2eAction = game.pf2e?.actions?.get?.(action.slug);
    if (!pf2eAction?.use) throw new Error(`PF2e has no ${action.name} action here; roll it by hand.`);
    const Modifier = game.pf2e?.Modifier;
    const modifiers = action.bonus && Modifier ? [new Modifier({ label: state.item.name, slug: sluggify(state.item.name), modifier: action.bonus.value, type: action.bonus.type })] : [];
    // (The item's modifier when it's higher than the user's: the difference, on top of the user's own.)
    if (action.minimum && Modifier) {
        const own = Number(actor.getStatistic?.(action.minimum.skill)?.mod ?? actor.skills?.[action.minimum.skill]?.mod);
        // (Else its bonus to the user's own, when it gives one: Ravenous Flytrap's +2 item bonus.)
        const ownBonus = action.minimum.ownBonus;
        if (Number.isFinite(own) && action.minimum.value > own + (ownBonus?.value ?? 0)) modifiers.push(new Modifier({ label: `${state.item.name} (+${action.minimum.value})`, slug: sluggify(state.item.name), modifier: action.minimum.value - own, type: "untyped" }));
        else if (Number.isFinite(own) && ownBonus) modifiers.push(new Modifier({ label: state.item.name, slug: sluggify(state.item.name), modifier: ownBonus.value, type: ownBonus.type }));
    }
    // (No roll dialog on the GM's client: the GM is rolling the user's check.)
    const event = typeof KeyboardEvent === "function" ? new KeyboardEvent("keydown", { shiftKey: game.user.settings?.showCheckDialogs !== false }) : undefined;
    // (The variant the item is for, Lady's Blessing Oil's stabilize, when PF2e's action has it.)
    const variant = action.variant && [...(pf2eAction.variants?.keys?.() ?? [])].includes(action.variant) ? action.variant : variantFor(pf2eAction, targetToken?.actor ?? null);
    // (PF2e's action-system First Aid has no stabilize DC of its own: the rule's, 5 + the target's recovery DC + its dying value — less or more as
    // the item says, Lady's Blessing Oil's 5 lower, Yarrow-Root Bandage's 5 higher.)
    const stabilize = action.slug === "administer-first-aid" && variant === "stabilize" ? stabilizeDC(targetToken?.actor) : null;
    const difficultyClass = stabilize ? { value: stabilize.value - (Number(action.dc?.less) || 0) + (Number(action.dc?.more) || 0) } : null;
    const results = await pf2eAction.use({ actors: [actor], ...(targetToken ? { target: targetToken.object ?? targetToken.actor } : {}), modifiers, ...(action.statistic ? { statistic: action.statistic } : {}), ...(variant ? { variant } : {}), ...(difficultyClass ? { difficultyClass } : {}), ...(event ? { event } : {}) });
    const rolled = results?.[0]?.outcome ?? null;
    // (A degree the item changes, Ensnaring Disk's critical failure made a failure: the outcome the card acts on, said.)
    const outcome = rolled ? action.degree?.[rolled] ?? rolled : null;
    const lines = [];
    if (!outcome) lines.push(`${actionText(action)}: no result (cancelled).`);
    else {
        lines.push(`${state.user.name}'s ${action.name}${targetToken ? ` against ${targetToken.name ?? targetToken.actor.name}` : ""}: ${outcomeText(outcome)}${outcome !== rolled ? ` (${outcomeText(rolled)} rolled, made ${outcomeText(outcome)} by ${state.item.name})` : ""}.`);
        if (action.basic && targetToken) lines.push(...(await applyRiders({ plan: action.basic, degree: outcome, user: state.user, target: entryOf(targetToken.object ?? targetToken, targetToken.actor), item: state.item })));
        // (Its own damage for that degree — Bracers of Strength's crush on a success, double on a critical one: the ability module's
        // card at the creature, which rolls and applies it.)
        const damage = action.damage?.[outcome] ?? null;
        const postCard = game.modules.get(ABILITY_ID)?.api?.live?.postCard;
        if (damage && targetToken && postCard) {
            await postCard({ plan: damage, item: { name: state.item.name, uuid: state.item.uuid ?? null }, sourceActor: actor, sourceToken: actor.getActiveTokens?.(true, true)?.[0] ?? null, tokens: [targetToken.object ?? targetToken], cause: outcomeText(outcome) });
            lines.push(`${state.item.name}'s damage for ${outcomeText(outcome)}: its card.`);
        } else if (damage && targetToken) lines.push(`${state.item.name}: ${targetToken.name ?? targetToken.actor.name} takes ${damage.resolution.sharedDamage.components[0].formula} ${damage.resolution.sharedDamage.components[0].type ?? ""} damage; apply it by hand.`.replace(/\s+damage;/, " damage;"));
        // (Each other creature: the same total and die against its own DC — the action's defense, Demoralize's Will DC — or, when
        // the item says so, a roll of its own: Windlass Bola's "Roll a separate Athletics check for each target".)
        const roll = results?.[0]?.roll ?? null;
        const statistic = action.basic?.resolution?.check?.against?.statistic ?? null;
        for (const other of action.separate ? others : []) {
            const own = await pf2eAction.use({ actors: [actor], target: other.object ?? other.actor, modifiers, ...(action.statistic ? { statistic: action.statistic } : {}), ...(event ? { event } : {}) });
            const degree = own?.[0]?.outcome ?? null;
            const name = other.name ?? other.actor.name;
            if (!degree) {
                lines.push(`${name}: no result (cancelled).`);
                continue;
            }
            lines.push(`${state.user.name}'s ${action.name} against ${name}: ${outcomeText(degree)}.`);
            if (action.basic) lines.push(...(await applyRiders({ plan: action.basic, degree, user: state.user, target: entryOf(other.object ?? other, other.actor), item: state.item })));
        }
        for (const other of action.separate ? [] : others) {
            const dc = Number(other.actor.getStatistic?.(statistic)?.dc?.value);
            const degree = Number.isFinite(dc) && Number.isFinite(roll?.total) ? degreeAgainst(roll.total, dc, roll.dice?.[0]?.total ?? null) : null;
            const name = other.name ?? other.actor.name;
            if (!degree) {
                lines.push(`${name}: compare ${state.user.name}'s ${action.name} result with its DC by hand.`);
                continue;
            }
            lines.push(`${state.user.name}'s ${action.name} against ${name} (DC ${dc}): ${outcomeText(degree)}.`);
            if (action.basic) lines.push(...(await applyRiders({ plan: action.basic, degree, user: state.user, target: entryOf(other.object ?? other, other.actor), item: state.item })));
        }
    }
    // (What the item does after its user's own action: withinResults.)
    if (outcome && action.within) lines.push(...(await withinResults(action, outcome, targetToken, state)));
    // (A condition on its user after it, Jug of Fond Remembrance's Stupefied 1 for 3 rounds: the ability module's timed condition.)
    if (outcome && action.selfAfter) {
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        const token = actor.getActiveTokens?.(true, true)?.[0] ?? null;
        const own = { plan: {}, ability: { name: state.item.name, uuid: state.item.uuid ?? null, slug: sluggify(state.item.name) }, source: { actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? null, name: actor.name }, targets: [{ id: "t0", actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? null, name: token?.name ?? actor.name }] };
        const condition = action.selfAfter;
        const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug: condition.slug, value: condition.value, target: "t0", duration: condition.duration }, own) : null;
        lines.push(line ?? `${actor.name} is then ${condition.slug} ${condition.value} for ${condition.duration.value} ${condition.duration.unit} (by hand).`);
    }
    const next = { ...state, status: outcome ? "applied" : "open", results: [...state.results, ...lines].slice(-6) };
    return message.update({ content: actionCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}
