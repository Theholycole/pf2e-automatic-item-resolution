// A consumable or an activation that gives its user its own PF2e Effect and also a save for others (2026-10-20). The breath potions: Blight, Frost and Storm
// Breath's resistance, Cayden's Brew's and Rovagug's Mud's, "After you inhale … you gain resistance 10 to poison … You can exhale …". Draft of
// Stellar Radiance's light and Vermin Repellent Agent's bonus, each with a save for whoever attacks its user. Matsuki's Medicinal Wine's
// "Regardless of the saving throw's results, you gain a +2 item bonus …" beside its drinker's own save. The ability compiler read the save
// alone, so the card was only that save, and the Effect was never given. The item's own plan is now its linked Effect, and the save card follows
// it (plan.again), as the card for that save would have been: kept for later, used again for the item's time, set off by an attacker, or
// its drinker's own. Not an addiction's stages (a drug's Effects are its stages'), nor one with several Effects of its own. Pure.

import { ATTACKER, isLaterSave, isOwnSave, repeatsLater } from "../live/poison-card.js";
import { itemDuration } from "./rows.js";

// (An activation's, or a candy's Secondary Effect's: only when its words give its user the Effect — Final Scalecloak's "a nimbus … surrounds
// you … You gain a +4 status bonus", Kraken's Guard's "you gain a +3 item bonus", Morning Glow's "produces bright light" — and the Effect
// isn't a result's or another creature's: Crackling Bubble Gum's "(Failure)", Sinuous Recorder's "(Speed Penalty)", Bewitching Bloom's ally.)
const USER_GETS = /\b(?:surrounds you|you gain|you're surrounded|produces bright light)\b/i;
const OTHERS_GET = /\b(?:ally|allies|willing)\b/i;
const RESULT_LABEL = /\((?:Critical )?(?:Success|Failure)\)|\(Speed Penalty\)/i;

// The save plan the ability compiler read, the item's plain text, its own plan (its linked Effect, src/compiler/consumables.js ownPlan), the
// item → its own plan with the save card to follow, or the plan as it was. activation: an activation's or a Secondary Effect's text.
export function withEffectThenCard(plan, text, own, item, { activation = false } = {}) {
    const plain = String(text ?? "");
    // (Not ammunition, whose Effect is the creature hit's; not a zone or another builtin.)
    if (!item?.type || item.type === "ammo" || plan?.builtin || plan?.again || plan?.resolution?.kind !== "save" || plan.resolution.afflictionHandoff || plan.item?.delivery) return plan;
    if (own?.resolution?.kind !== "effect" || own.resolution.applications?.length !== 1 || own.partial) return plan;
    // (Its own linked Effect, not a granted spell's: Roaring Potion's Bullhorn is another activation it gives, not what drinking does.)
    const [application] = own.resolution.applications;
    if (application.spell || !/-effects\.Item\./.test(String(application.uuid ?? ""))) return plan;
    if (activation && (!USER_GETS.test(plain) || OTHERS_GET.test(plain) || RESULT_LABEL.test(String(application.label ?? "")))) return plan;
    // (A save set off at a creature's turn, in its light or next to its user, is a zone's: Mamlambo Scale's, Arctic Worm Chitin Shield's.)
    if (/\b(?:begins?|starts?|ends?) (?:its|their) turn\b/i.test(plain)) return plan;
    const later = isLaterSave(plan, plain);
    const ownSave = !later && isOwnSave(plan, plain);
    const repeat = later && repeatsLater(plain);
    const time = repeat ? itemDuration(plain) : null;
    const attacker = /\bcreature (?:that|who) touches you\b/i.test(plain) ? "touch" : ATTACKER.test(plain);
    // (Blight Breath's resistance "for as long as you hold your breath": the exhale ends its Effect.)
    const ends = later && /\bfor as long as you hold your breath\b/i.test(plain) ? { ends: { uuid: application.uuid, label: application.label } } : {};
    // (What the save card leaves the GM keeps the item partial.)
    const partial = plan.partial ? { partial: true, automation: { ...(own.automation ?? {}), level: "guided" }, ...(plan.notes?.length ? { notes: [...(own.notes ?? []), ...plan.notes] } : {}) } : {};
    return { ...own, ...partial, again: { plan, later, ...(repeat ? { repeat: true } : {}), ...(time ? { time } : {}), ...(attacker ? { attacker } : {}), ...(ownSave ? { own: true } : {}), ...ends } };
}
