// Live play for a curse on a creature's spellcasting (src/compiler/cast-curse.js: Magekiller Bullet's, 2026-10-29): each time a creature with
// such an Effect Casts a Spell (PF2e's cast message), on the active GM's client, its flat check is rolled against the Effect's DC; on a failure
// it takes the Effect's damage, through PF2e's applyDamage.

import { castCurseOf } from "../src/compiler/cast-curse.js";
import { MODULE_ID, isActiveGM } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const isCast = (message) => Boolean(message?.flags?.pf2e?.casting) && message?.flags?.pf2e?.origin?.type === "spell";

// Its creature's curses: [{ effect, dc, formula, type }].
export function castCursesOf(actor) {
    return (actor?.itemTypes?.effect ?? []).filter((effect) => !(effect.isExpired ?? effect.system?.expired)).flatMap((effect) => (effect.system?.rules ?? []).map((rule) => castCurseOf(rule?.option)).filter(Boolean).map((curse) => ({ effect, ...curse })));
}

export async function castCursed(actor) {
    const rolled = [];
    for (const { effect, dc, formula, type } of castCursesOf(actor)) {
        const check = await new Roll("1d20").evaluate();
        const failed = check.total < dc;
        await check.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${escape(effect.name)}</strong>: DC ${dc} flat check as ${escape(actor.name)} casts a spell — ${failed ? `a failure: ${escape(formula)} ${escape(type)} damage` : "a success"}` });
        if (failed) {
            const DamageRoll = CONFIG.Dice.rolls.find((roll) => roll.name === "DamageRoll");
            const damage = await new DamageRoll(`${formula}[${type}]`).evaluate();
            await damage.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${escape(effect.name)}</strong>: its curse's damage` });
            await actor.applyDamage({ damage, token: actor.getActiveTokens?.(true, true)?.[0] ?? null });
        }
        rolled.push({ effect: effect.name, total: check.total, failed });
    }
    return rolled;
}

export function setUpCastCurses() {
    Hooks.on("createChatMessage", (message) => {
        if (!isActiveGM() || !isCast(message)) return;
        const actor = message.actor ?? ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
        if (castCursesOf(actor).length) castCursed(actor).catch((error) => console.error(`${MODULE_ID} | curse on spellcasting`, error));
    });
}
