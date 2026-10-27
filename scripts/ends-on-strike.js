// An Effect its creature's next Strike ends (flags.<module>.endsOnStrike, src/live/card.js ruleEffectSource: Amulet of the Hellcat's Invisible
// until after the Strike its Invisible Pounce makes): once PF2e's attack roll for a Strike by that creature is in the chat, on the active GM's
// client, its Effect is deleted (the condition it granted with it). One for a Strike with a weapon of a trait only (Magnetite Scope's scatter)
// waits for such a Strike.

import { MODULE_ID } from "./foundry.js";

// A Strike's attack roll: PF2e's own context, "action:strike" among its options (not a spell attack).
export const isStrikeRoll = (context) => context?.type === "attack-roll" && Boolean(context.outcome) && (context.options ?? []).includes("action:strike");

export async function endOnStrike(message) {
    const context = message?.flags?.pf2e?.context;
    if (!isStrikeRoll(context)) return [];
    const actor = message.actor;
    // (Or only a Strike with a weapon of a trait, Magnetite Scope's scatter: endsOnStrike { trait }, its options' "item:trait:scatter-10".)
    const options = context.options ?? [];
    const ends = (flag) => flag === true || (!!flag?.trait && options.some((option) => option === `item:trait:${flag.trait}` || option.startsWith(`item:trait:${flag.trait}-`)));
    const ids = (actor?.itemTypes?.effect ?? []).filter((effect) => ends(effect.flags?.[MODULE_ID]?.endsOnStrike)).map((effect) => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    return ids;
}
