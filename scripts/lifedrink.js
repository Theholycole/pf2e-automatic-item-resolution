// Live play for plan.lifedrink (src/compiler/special-sentences.js: Meloth's Lifedrinker's Lifedrink, "If the creature struck by the critical hit
// is slain by its damage … The first time this happens when its wielder is at least 10th level, Meloth's Lifedrinker's +1 weapon potency rune
// permanently becomes a +2 weapon potency rune …"). Once the ability module's card at the creature is applied (its "applied" hook, on the GM's
// client) and that creature is dead, the weapon's runes are raised for its wielder's level (src/live/card.js runesAfter), each step once.

import { ABILITY_ID, MODULE_ID } from "./foundry.js";
import { runesAfter } from "../src/live/card.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dead = (actor) => Boolean(actor?.isDead) || Number(actor?.system?.attributes?.hp?.value ?? 1) <= 0;

async function drink({ state, targets }) {
    const lifedrink = state?.plan?.lifedrink;
    if (!lifedrink || !state.ability?.uuid) return;
    const slain = [];
    for (const target of targets ?? []) {
        const actor = target.actorUuid ? await fromUuid(target.actorUuid).catch(() => null) : null;
        if (dead(actor)) slain.push(actor);
    }
    if (!slain.length) return;
    const weapon = await fromUuid(state.ability.uuid).catch(() => null);
    const wielder = weapon?.actor;
    if (!weapon || !wielder) return;
    const after = runesAfter(weapon.system?.runes, lifedrink.upgrades, wielder.level);
    if (after.lines.length) await weapon.update({ "system.runes.potency": after.runes.potency, "system.runes.striking": after.runes.striking });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: wielder }), content: `<p><strong>${escape(weapon.name)}</strong>: ${escape(slain.map((actor) => actor.name).join(", "))} slain. ${escape(lifedrink.words ?? "")}${after.lines.length ? ` For good, ${escape(after.lines.join("; "))}.` : ""}</p>` });
}

export function setUpLifedrink() {
    Hooks.on(`${ABILITY_ID}.applied`, (payload) => {
        if (!game.user.isGM) return;
        drink(payload ?? {}).catch((error) => console.error(`${MODULE_ID} | lifedrink`, error));
    });
}
