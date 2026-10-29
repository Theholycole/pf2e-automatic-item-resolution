// Live play for the boons (src/compiler/boons.js plan.boon, src/live/boons.js; 2026-10-29, the user's answer A to question 7 of
// docs/decisions-for-user.md): Elder Seed, Heartblood Ring, Phoenix Cinder and Void Fragment. Taken in — as it's used (the "boon" route),
// or once the user's own save card is applied with a failure (the ability module's applied hook; a success gives the seed back) — its
// first stage is an Effect on the creature: the stage's PF2e rules, its badge the stage, a "Held" toggle for the GM; its first stage's
// riders come with it (PF2e's Spell Effect: Regenerate, a fire immunity or a note for days, Heartblood Ring's counteract card at each of
// its turns while that Regenerate lasts). With each stage, on the active GM's client: the innate spells' entry, the item that carries its
// activation, the Hit Points it takes. Once the world's time passes a stage's end (Foundry's updateWorldTime), the next stage replaces
// that Effect with a card saying so; held, its end is put off by the time that passed. The badge moved by hand sets that stage. Its last
// stage kills the creature. Deleting the Effect ends the boon and takes its spells and item with it. Whenever it rolls initiative (its
// combatant's initiative set), a stage's condition at initiative, once an encounter.

import { boonActivationSource, boonAt, boonCounteract, boonEffectSource, boonFlag, boonSpellEntrySource, boonStep, heldOf, hpLossOf, initiativeCondition, initiativeEffectSource, innateLocation, riderEffectSource, stageCardHTML, stageOf } from "../src/live/boons.js";
import { ABILITY_ID, MODULE_ID, SOCKET, entryOf, isActiveGM, startInitiative } from "./foundry.js";
import { postCounteractCard } from "./counteract.js";
import { initiativeRollOf } from "./initiative-thrice.js";

const BOON = "boon";
// (A stage replaced by the next: its deletion isn't the boon's end.)
const REPLACED = "boonStage";
const FAILED = ["failure", "criticalFailure"];
const flagOf = (effect) => effect?.flags?.[MODULE_ID]?.[BOON] ?? null;
const boonsOf = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => flagOf(effect));
// (Its side items of a type, by their flag: "spellcastingEntry" boonSpells, "spell" boonSpell, "equipment" boonActivation.)
const ownOf = (actor, type, key, name) => (actor?.itemTypes?.[type] ?? []).filter((item) => item.flags?.[MODULE_ID]?.[key]?.name === name);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const say = (actor, html, whisper = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: html, ...(whisper ? { whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id) } : {}) });
// (One at a time on the GM's client: the clock's quick steps, a badge, an initiative set twice — never the same stage begun twice.)
let queue = Promise.resolve();
const inTurn = (label, work) => {
    queue = queue.then(work).catch((error) => console.error(`${MODULE_ID} | ${label}`, error));
    return queue;
};
// (Every creature: the world's actors and the scenes' unlinked tokens.)
const everyActor = () => [...(game.actors?.contents ?? []), ...(game.scenes?.contents ?? []).flatMap((scene) => (scene.tokens?.contents ?? []).filter((token) => !token.actorLink && token.actor).map((token) => token.actor))];

// The "boon" route (scripts/live.js): Heartblood Ring, Phoenix Cinder — begun as it's used.
export async function postBoonCard({ plan, used, actor, token }) {
    return beginBoon(actor, plan.boon, { item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, token, lines: plan.notes ?? [] });
}

// Its first stage on the creature, with that stage's riders and side items, and its card.
export async function beginBoon(actor, boon, { item = {}, token = null, lines = [] } = {}) {
    if (!actor?.createEmbeddedDocuments || !boon?.stages?.length) return null;
    // (One of it at a time: a second dose while one lasts is the GM's call.)
    if (boonsOf(actor).some((effect) => flagOf(effect).name === boon.name)) return say(actor, `<p><strong>${escape(boon.name)}</strong>: ${escape(actor.name)} already has this boon; what a second dose does is the GM's call (nothing was changed).</p>`, true);
    const worldTime = game.time.worldTime;
    const flag = boonFlag(boon, { stage: 1, worldTime, item, user: entryOf(token, actor) });
    const [effect] = await actor.createEmbeddedDocuments("Item", [boonEffectSource(flag, { worldTime, initiative: startInitiative(actor), img: item.img ?? undefined, moduleId: MODULE_ID })]);
    const done = [...await stageItems(actor, flag, { from: 0, effectId: effect?.id ?? null }), ...await firstRiders(actor, flag, { token })];
    return say(actor, stageCardHTML(flag, { actorName: actor.name, begun: true, worldTime, lines: [...done, ...lines] }));
}

// Its first stage's riders: PF2e's Spell Effect (Regenerate), an immunity or a note for days, the counteract card → the card's lines.
async function firstRiders(actor, flag, { token = null } = {}) {
    const stage = stageOf(flag.boon, 1);
    const lines = [];
    const worldTime = game.time.worldTime;
    const initiative = startInitiative(actor);
    const counteract = (stage?.first ?? []).find((rider) => rider.kind === "counteract") ?? null;
    for (const rider of stage?.first ?? []) {
        if (rider.kind === "effect") {
            const source = (await fromUuid(rider.uuid).catch(() => null))?.toObject?.();
            if (!source) {
                lines.push(`${rider.name}: its Effect isn't in PF2e's compendium here (by hand).`);
                continue;
            }
            delete source._id;
            source.system = { ...source.system, start: { value: worldTime, initiative }, context: { origin: { actor: actor.uuid, token: token?.document?.uuid ?? token?.uuid ?? null, item: flag.item?.uuid ?? null } } };
            // (Heartblood Ring's counteract at each of its turns while this lasts.)
            if (counteract && counteract.whileEffect === rider.name) source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { boonCounteract: { name: flag.boon.name, level: flag.boon.level, rider: counteract } } };
            await actor.createEmbeddedDocuments("Item", [source]);
            lines.push(`${actor.name} is affected as if by ${rider.name} (PF2e's Effect, for its time).`);
        } else if (rider.kind === "immunity" || rider.kind === "note") {
            await actor.createEmbeddedDocuments("Item", [riderEffectSource(rider, { name: flag.boon.name, worldTime, initiative, moduleId: MODULE_ID })]);
            lines.push(rider.kind === "immunity" ? `Immune to ${rider.type} for ${rider.days} days.` : `${rider.words} for ${rider.days} days.`);
        }
    }
    if (counteract) {
        await postBoonCounteract(actor, flag.boon, counteract, token);
        lines.push("Its counteract card for one disease or poison follows, again at each of its turns while Regenerate lasts.");
    }
    return lines;
}

async function postBoonCounteract(actor, boon, rider, token = null) {
    return postCounteractCard({ message: null, plan: { item: { counteract: boonCounteract(rider, boon.level) } }, used: { data: { name: `${boon.name} (Regenerate)`, uuid: null } }, actor, token: token ?? actor.getActiveTokens?.(true)?.[0] ?? null });
}

// A stage's side items made to fit it: the innate spells' entry and spells, the item carrying its activation, the Hit Points it takes, and
// death at its last → the card's lines.
async function stageItems(actor, flag, { from = 0, effectId = null } = {}) {
    const { boon } = flag;
    const stage = stageOf(boon, flag.stage);
    const lines = [];
    // (The innate spells: an entry of their tradition, each spell PF2e's own at its rank and uses a day.)
    const spells = stage?.dies ? [] : stage?.spells ?? [];
    const entries = ownOf(actor, "spellcastingEntry", "boonSpells", boon.name);
    const known = ownOf(actor, "spell", "boonSpell", boon.name);
    if (!spells.length) await removeAll(actor, [known, entries]);
    else {
        let entry = entries[0] ?? null;
        if (!entry) [entry] = await actor.createEmbeddedDocuments("Item", [boonSpellEntrySource(flag, spells[0].tradition, { moduleId: MODULE_ID })]);
        const updates = [];
        const creates = [];
        for (const spell of spells) {
            const have = known.find((one) => one.flags[MODULE_ID].boonSpell.uuid === spell.uuid);
            const location = innateLocation(spell, entry.id);
            if (have) {
                if ((have.system?.location?.heightenedLevel ?? null) !== (location.heightenedLevel ?? null)) updates.push({ _id: have.id, "system.location.heightenedLevel": location.heightenedLevel ?? null });
                continue;
            }
            const source = (await fromUuid(spell.uuid).catch(() => null))?.toObject?.();
            if (!source) {
                lines.push(`${spell.name}: not in PF2e's spells here (add it by hand).`);
                continue;
            }
            delete source._id;
            source.system = { ...source.system, location };
            source.flags = { ...(source.flags ?? {}), [MODULE_ID]: { boonSpell: { name: boon.name, uuid: spell.uuid } } };
            creates.push(source);
        }
        const gone = known.filter((one) => !spells.some((spell) => spell.uuid === one.flags[MODULE_ID].boonSpell.uuid));
        if (gone.length) await actor.deleteEmbeddedDocuments("Item", gone.map((one) => one.id));
        if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
        if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
    }
    // (Its activation, on an item of its own: its sheet's Activate button.)
    const holders = ownOf(actor, "equipment", "boonActivation", boon.name);
    const holder = stage?.dies ? null : boonActivationSource(flag, { effectId, moduleId: MODULE_ID });
    if (!holder && holders.length) await actor.deleteEmbeddedDocuments("Item", holders.map((one) => one.id));
    else if (holder && holders.length) await holders[0].update({ "system.description.value": holder.system.description.value, [`flags.${MODULE_ID}.boonActivation`]: holder.flags[MODULE_ID].boonActivation });
    else if (holder) await actor.createEmbeddedDocuments("Item", [holder]);
    // (Its current Hit Points lower by what the stage takes more than the last — from those it had, not PF2e's figure already held under the
    // lower maximum.)
    const loss = hpLossOf(boon, from, flag.stage, actor.level ?? actor.system?.details?.level?.value);
    const hp = actor.system?.attributes?.hp;
    const had = Number(actor._source?.system?.attributes?.hp?.value ?? hp?.value);
    if (loss > 0 && hp && Number.isFinite(had)) {
        await actor.update({ "system.attributes.hp.value": Math.max(0, had - loss) });
        lines.push(`${actor.name} loses ${loss} Hit Points, its maximum ${loss} lower too.`);
    }
    // (Its last stage: dead.)
    if (stage?.dies) {
        await actor.update({ "system.attributes.hp.value": 0 });
        if (!actor.statuses?.has?.("dead")) await actor.toggleStatusEffect?.("dead", { active: true, overlay: true }).catch(() => null);
    }
    return lines;
}

// The stage Effect replaced by the one its flag says (the next stage, or the badge's), its hold kept; its card.
async function setStage(actor, effect, next, entered) {
    // (Already replaced, by the clock or the badge before it.)
    if (!boonsOf(actor).some((one) => one.id === effect.id)) return null;
    const from = flagOf(effect)?.stage ?? 0;
    const held = heldOf(effect.system?.rules);
    const worldTime = game.time.worldTime;
    const [made] = await actor.createEmbeddedDocuments("Item", [boonEffectSource(next, { held, worldTime, initiative: startInitiative(actor), img: effect.img ?? undefined, moduleId: MODULE_ID })]);
    await actor.deleteEmbeddedDocuments("Item", [effect.id], { [MODULE_ID]: { [REPLACED]: true } });
    const lines = await stageItems(actor, next, { from, effectId: made?.id ?? null });
    return say(actor, stageCardHTML(next, { actorName: actor.name, entered, worldTime, lines }));
}

// The world's clock moved: each boon's next stages, or its end put off while it's held.
async function stepBoons(delta) {
    const worldTime = game.time.worldTime;
    for (const actor of everyActor()) {
        for (const effect of boonsOf(actor)) {
            const flag = flagOf(effect);
            const held = heldOf(effect.system?.rules);
            const { flag: next, entered } = boonStep(flag, worldTime, { held, delta });
            if (held && next.endsAt !== flag.endsAt) await effect.update({ [`flags.${MODULE_ID}.${BOON}.endsAt`]: next.endsAt });
            else if (entered.length) await setStage(actor, effect, next, entered);
        }
    }
}

// (Each list deleted in turn — the spells before their entry, which PF2e may empty itself — → how many.)
async function removeAll(actor, lists) {
    let count = 0;
    for (const list of lists) {
        const ids = list.map((item) => item.id);
        if (!ids.length) continue;
        await actor.deleteEmbeddedDocuments("Item", ids);
        count += ids.length;
    }
    return count;
}

// Its spells and item gone with it.
async function endBoon(actor, flag) {
    const gone = await removeAll(actor, [ownOf(actor, "spell", "boonSpell", flag.name), ownOf(actor, "spellcastingEntry", "boonSpells", flag.name), ownOf(actor, "equipment", "boonActivation", flag.name)]);
    return say(actor, `<p><strong>${escape(flag.name)}</strong>: ${escape(actor.name)}'s boon ends (its Effect removed)${gone ? "; its innate spells and activation go with it" : ""}.</p>`);
}

// (Elder Seed's seed brought back up whole: the used item's quantity one more, or PF2e's own seed again.)
async function giveBack(actor, boon, used) {
    const own = used?.uuid ? await fromUuid(used.uuid).catch(() => null) : null;
    if (own?.actor?.uuid === actor.uuid && own.update) {
        await own.update({ "system.quantity": (Number(own.system?.quantity) || 0) + 1 });
        return `${actor.name} brings ${boon.name} back up whole.`;
    }
    const source = boon.source ? (await fromUuid(boon.source).catch(() => null))?.toObject?.() : null;
    if (!source) return `${actor.name} brings ${boon.name} back up whole: give it back by hand.`;
    delete source._id;
    await actor.createEmbeddedDocuments("Item", [source]);
    return `${actor.name} brings ${boon.name} back up whole: it's in its inventory again.`;
}

// The user's own save card applied (the ability module's "applied" hook, on the GM's client): a failure begins the boon.
async function afterSave({ state, targets }) {
    const boon = state?.plan?.boon;
    if (!boon?.save) return;
    for (const target of targets ?? []) {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (!actor) continue;
        const item = { name: state.ability?.name ?? boon.name, uuid: state.ability?.uuid ?? null, img: state.ability?.img ?? null };
        if (FAILED.includes(target.degree)) {
            const token = state.source?.tokenUuid ? await fromUuid(state.source.tokenUuid).catch(() => null) : null;
            await beginBoon(actor, boon, { item, token });
        } else if (boon.save.back) await say(actor, `<p><strong>${escape(boon.name)}</strong>: ${escape(await giveBack(actor, boon, item))}</p>`);
        else await say(actor, `<p><strong>${escape(boon.name)}</strong>: ${escape(actor.name)} resists it; it vanishes, to turn up elsewhere on this world.</p>`);
    }
}

// Its combatant's initiative set: the stage's condition at initiative, once an encounter.
async function atInitiative(combatant) {
    const actor = combatant?.actor;
    const combatId = combatant?.parent?.id ?? combatant?.combat?.id ?? null;
    for (const effect of boonsOf(actor)) {
        const flag = flagOf(effect);
        const stage = stageOf(flag.boon, flag.stage);
        if (!stage?.initiative || stage.dies) continue;
        if ((actor.itemTypes?.effect ?? []).some((one) => one.flags?.[MODULE_ID]?.boonInitiative?.name === flag.name && one.flags[MODULE_ID].boonInitiative.combatId === combatId)) continue;
        const { natural } = initiativeRollOf(combatant);
        const given = initiativeCondition(stage.initiative, natural);
        if (!given) continue;
        const roll = given.rounds ? await new Roll(given.rounds).evaluate() : null;
        if (roll) await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${flag.name}: ${given.slug} for up to ${given.rounds} rounds` });
        const source = initiativeEffectSource(given, { name: flag.name, rounds: roll?.total ?? null, worldTime: game.time.worldTime, initiative: Number(combatant.initiative) || null, moduleId: MODULE_ID });
        source.flags[MODULE_ID].boonInitiative.combatId = combatId;
        await actor.createEmbeddedDocuments("Item", [source]);
        const die = Number.isFinite(Number(natural)) ? ` (its d20 a ${natural})` : stage.initiative.byDie ? " (its d20 not found: the mildest)" : "";
        await say(actor, `<p><strong>${escape(flag.name)}</strong>: ${escape(actor.name)} rolls initiative${escape(die)} and is ${escape(given.slug)}${given.value ? ` ${given.value}` : ""}${roll ? ` for up to ${roll.total} round${roll.total === 1 ? "" : "s"}` : " for the encounter"}.</p>`);
    }
}

export function setUpBoons() {
    // (On the active GM's client; applied on another, sent there — as scripts/arcane-drain.js does.)
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!payload?.state?.plan?.boon?.save) return;
        if (isActiveGM()) inTurn("boon save", () => afterSave(payload));
        else game.socket.emit(SOCKET, { action: "boon-save", state: { plan: { boon: payload.state.plan.boon }, ability: payload.state.ability ?? null, source: payload.state.source ?? null }, targets: (payload.targets ?? []).map((target) => ({ actorUuid: target.actorUuid, tokenUuid: target.tokenUuid, name: target.name, degree: target.degree })), userId: game.user.id });
    });
    game.socket.on(SOCKET, (data) => {
        if (data?.action !== "boon-save" || !isActiveGM()) return;
        inTurn("boon save", () => afterSave({ state: data.state, targets: data.targets }));
    });
    Hooks.on("updateWorldTime", (worldTime, delta) => {
        if (!isActiveGM()) return;
        inTurn("boon stages", () => stepBoons(Number(delta) || 0));
    });
    // (Its badge moved by the GM: that stage, begun now.)
    Hooks.on("updateItem", (item, changes) => {
        const flag = flagOf(item);
        const value = changes?.system?.badge?.value;
        if (!flag || !isActiveGM() || !Number.isInteger(value) || value === flag.stage || !stageOf(flag.boon, value) || !item.actor) return;
        inTurn("boon stage", () => setStage(item.actor, item, boonAt(flag, value, game.time.worldTime), [value]));
    });
    Hooks.on("deleteItem", (item, options) => {
        const flag = flagOf(item);
        if (!flag || !isActiveGM() || options?.[MODULE_ID]?.[REPLACED] || !item.actor) return;
        inTurn("boon end", () => endBoon(item.actor, flag));
    });
    Hooks.on("updateCombatant", (combatant, changes) => {
        if (!isActiveGM() || !Object.hasOwn(changes ?? {}, "initiative") || changes.initiative === null) return;
        inTurn("boon at initiative", () => atInitiative(combatant));
    });
    // (Heartblood Ring's counteract at each of its turns while its Regenerate lasts.)
    Hooks.on("pf2e.startTurn", (combatant) => {
        if (!isActiveGM() || !combatant?.actor) return;
        const regenerate = (combatant.actor.itemTypes?.effect ?? []).find((effect) => effect.flags?.[MODULE_ID]?.boonCounteract && !effect.isExpired);
        if (!regenerate) return;
        const { name, level, rider } = regenerate.flags[MODULE_ID].boonCounteract;
        postBoonCounteract(combatant.actor, { name, level }, rider, combatant.token?.object ?? null).catch((error) => console.error(`${MODULE_ID} | boon counteract`, error));
    });
}
