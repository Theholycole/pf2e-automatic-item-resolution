// Live play for a lasting area or a snare (the zone builtin): the ability module's zone, placed on the scene, acting
// on the creatures entering or staying in it (its api.live.startZone; a snare once, for the first creature). Without
// that export, the GM places it by hand. And a creature the item becomes (the conjure builtin, src/compiler/conjured.js):
// the ability module's conjured token beside its user (its api.live.startConjure), or the GM's by hand.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";
import { effectSource } from "../src/live/card.js";
import { lightZone } from "./placed-light.js";
import { pickConjured } from "./creature-pick.js";
import { conjuredChanges, countNow, pickedPlan } from "../src/live/conjured.js";
import { SLAIN } from "./slain-wait.js";
import { pauseItem } from "./paused-item.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function startItemZone({ plan, used, actor, token }) {
    const startZone = game.modules.get(ABILITY_ID)?.api?.live?.startZone;
    // (The item may be used up already: its name, uuid and actor are all the zone needs.)
    const item = { name: used.data.name, uuid: used.data.uuid ?? null, actor, img: used.data.img ?? null };
    // (Its user's own PF2e Effect beside the zone, src/compiler/aura-zones.js: Horn of Rust's +1 item bonus to AC.)
    if (plan.ownEffect?.uuid && actor) {
        const template = await fromUuid(plan.ownEffect.uuid).catch(() => null);
        if (template) await actor.createEmbeddedDocuments("Item", [effectSource(template.toObject(), { item: { name: used.data.name, uuid: used.data.uuid ?? null }, user: { actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null }, worldTime: game.time.worldTime, flags: { [MODULE_ID]: { card: true } } })]);
    }
    if (startZone) {
        const started = await startZone({ item, plan, sourceToken: token?.document ?? token });
        // (Its light at the zone, Spark Wafer's: scripts/placed-light.js.)
        if (plan.zone?.light) await lightZone(plan.zone.light, plan.zone.lasts, { scene: (token?.document ?? token)?.parent ?? canvas.scene, item }).catch((error) => console.error(`${MODULE_ID} | zone light`, error));
        return started;
    }
    const what = plan.zone?.once ? "Set the snare in a square within reach; the first creature to enter it attempts its save." : "Mark its area on the scene.";
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${used.data.name}</strong>: ${what} (the ability module's zones aren't there to place it).</p>`
    });
}

// The made creatures as the item's text has them (src/live/conjured.js conjuredChanges): its creature type traded for the traits the item
// gives (Fossil Fragments' construct and earth), traits and weaknesses it lacks (a Galvasphere's zombie), its immunities added — PF2e's own
// entries —, its size, its Strikes gone (Cordelia's Construct Key's broom).
async function finishConjured(made, plan) {
    const creature = plan.creatures?.[0];
    if (!creature) return;
    for (const { actor } of made ?? []) {
        if (!actor) continue;
        const source = actor._source?.system ?? {};
        const changes = conjuredChanges({ traits: actor.system?.traits?.value ?? [], immunities: source.attributes?.immunities ?? [], weaknesses: source.attributes?.weaknesses ?? [], size: source.traits?.size?.value ?? null, items: [...(actor.items ?? [])].map((entry) => ({ id: entry.id, type: entry.type })) }, creature);
        if (changes && Object.keys(changes.update).length) await actor.update(changes.update);
        if (changes?.deleteIds.length) await actor.deleteEmbeddedDocuments("Item", changes.deleteIds);
        // (Its entry's own: an Effect of PF2e's rules — the Onyx Dog's +4 to Track and darkvision, Kotodama Bells' object failing every save —,
        // its words on it for what PF2e can't play — the Onyx Dog's scent —, a condition — the tree's Immobilized.)
        if (creature.own?.rules?.length || creature.own?.text) await actor.createEmbeddedDocuments("Item", [{ name: `${plan.source?.name ?? "Conjured"}: its own`, type: "effect", img: "icons/svg/aura.svg", system: { description: { value: creature.own.text ? `<p>${escape(creature.own.text)}</p>` : "" }, duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, rules: creature.own.rules ?? [] } }]);
        for (const slug of creature.own?.conditions ?? []) await actor.increaseCondition?.(slug);
    }
}

export async function startItemConjure({ plan, used, actor, token }) {
    const startConjure = game.modules.get(ABILITY_ID)?.api?.live?.startConjure;
    const item = { name: used.data.name, uuid: used.data.uuid ?? null, actor, img: used.data.img ?? null };
    if (startConjure) {
        // (A creature its user picks from the compendiums first, Dust of Corpse Animation's: scripts/creature-pick.js — on this client, as the
        // item may be used up by now; none picked, nothing made.)
        if (plan.pick) {
            const picked = await pickConjured(plan, used.data.name);
            if (!picked) return null;
            plan = pickedPlan(plan, picked);
        }
        // (One of a pair slain within its wait, Golden Lions': the other comes alone — scripts/slain-wait.js; none while both wait.)
        if (plan.slainWait?.each && used.data.uuid) {
            const holder = await fromUuid(used.data.uuid).catch(() => null);
            const count = countNow(plan.creatures?.[0]?.count, holder?.getFlag?.(MODULE_ID, SLAIN), game.time.worldTime);
            if (!count) throw new Error(`${used.data.name}: every one of them was slain within its wait, and none can be called yet.`);
            plan = { ...plan, creatures: plan.creatures.map((creature, index) => (index ? creature : { ...creature, count })) };
        }
        const made = await startConjure({ item, plan, sourceToken: token?.document ?? token });
        await finishConjured(made, plan);
        // (The item's other benefits off while it's out, Horns of Naraga's helm: scripts/paused-item.js.)
        if (plan.pauseItem && made?.length) await pauseItem(used.data.uuid, made);
        return made;
    }
    const names = (plan.creatures ?? []).map((creature) => `${creature.count > 1 ? `${creature.count} ` : ""}${creature.name}`).join(", ");
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: (game.users?.filter?.((user) => user.isGM) ?? []).map((user) => user.id),
        content: `<p><strong>${used.data.name}</strong>: place ${names} beside its user by hand (the ability module's conjuring isn't there).</p>`
    });
}
