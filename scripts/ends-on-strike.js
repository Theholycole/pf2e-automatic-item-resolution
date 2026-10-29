// An Effect its creature's next Strike ends (flags.<module>.endsOnStrike, src/live/card.js ruleEffectSource: Amulet of the Hellcat's Invisible
// until after the Strike its Invisible Pounce makes): once PF2e's attack roll for a Strike by that creature is in the chat, on the active GM's
// client, its Effect is deleted (the condition it granted with it). One for a Strike with a weapon of a trait only (Magnetite Scope's scatter)
// waits for such a Strike.

import { MODULE_ID } from "./foundry.js";

// A Strike's attack roll: PF2e's own context, "action:strike" among its options (not a spell attack).
export const isStrikeRoll = (context) => context?.type === "attack-roll" && Boolean(context.outcome) && (context.options ?? []).includes("action:strike");

export async function endOnStrike(message) {
    const context = message?.flags?.pf2e?.context;
    const actor = message?.actor;
    const options = context?.options ?? [];
    // (Or only a Strike with a weapon of a trait, Magnetite Scope's scatter: endsOnStrike { trait }, its options' "item:trait:scatter-10".)
    // (Or only a Strike with one weapon, Reaper's Grasp's Soul Shot: endsOnStrike { slug }, its options' "item:slug:reapers-grasp".)
    const fits = (flag) => flag === true || (!!flag?.trait && options.some((option) => option === `item:trait:${flag.trait}` || option.startsWith(`item:trait:${flag.trait}-`))) || (!!flag?.slug && options.includes(`item:slug:${flag.slug}`));
    const effects = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.endsOnStrike && fits(effect.flags[MODULE_ID].endsOnStrike));
    // (One whose rules add to the Strike's damage, Soul Shot's +2 per level, ends with that damage roll, not the attack's: a hit marks it
    // struck, a miss ends it — found by the 2026-10-28 case writers, the damage never had the void.)
    const later = (effect) => Boolean(effect.flags[MODULE_ID].endsOnStrike?.afterDamage);
    if (context?.type === "damage-roll") {
        const ids = effects.filter((effect) => later(effect) && effect.flags[MODULE_ID].struck).map((effect) => effect.id);
        if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
        return ids;
    }
    if (!isStrikeRoll(context)) return [];
    const hit = context.outcome === "success" || context.outcome === "criticalSuccess";
    for (const effect of effects.filter((entry) => later(entry) && hit)) await effect.update({ [`flags.${MODULE_ID}.struck`]: true });
    const ids = effects.filter((effect) => !(later(effect) && hit)).map((effect) => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    return ids;
}
