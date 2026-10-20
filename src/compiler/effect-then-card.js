// A consumable that gives its user its own PF2e Effect and also a save for others (2026-10-20). The breath potions: Blight, Frost and Storm
// Breath's resistance, Cayden's Brew's and Rovagug's Mud's, "After you inhale … you gain resistance 10 to poison … You can exhale …". Draft of
// Stellar Radiance's light and Vermin Repellent Agent's bonus, each with a save for whoever attacks its user. Matsuki's Medicinal Wine's
// "Regardless of the saving throw's results, you gain a +2 item bonus …" beside its drinker's own save. The ability compiler read the save
// alone, so the card was only that save, and the Effect was never given. The item's own plan is now its linked Effect, and the save card follows
// it (plan.again), as the card for that save would have been: kept for later, used again for the item's time, set off by an attacker, or
// its drinker's own. Not an addiction's stages (a drug's Effects are its stages'), nor one with several Effects of its own. Pure.

import { ATTACKER, isLaterSave, isOwnSave, repeatsLater } from "../live/poison-card.js";
import { itemDuration } from "./rows.js";

// The save plan the ability compiler read, the item's plain text, its own plan (its linked Effect, src/compiler/consumables.js ownPlan), the
// item → its own plan with the save card to follow, or the plan as it was.
export function withEffectThenCard(plan, text, own, item) {
    const plain = String(text ?? "");
    if (item?.type !== "consumable" || plan?.again || plan?.resolution?.kind !== "save" || plan.resolution.afflictionHandoff || plan.item?.delivery) return plan;
    if (own?.resolution?.kind !== "effect" || own.resolution.applications?.length !== 1 || own.partial) return plan;
    // (Its own linked Effect, not a granted spell's: Roaring Potion's Bullhorn is another activation it gives, not what drinking does.)
    const [application] = own.resolution.applications;
    if (application.spell || !/-effects\.Item\./.test(String(application.uuid ?? ""))) return plan;
    const later = isLaterSave(plan, plain);
    const ownSave = !later && isOwnSave(plan, plain);
    const repeat = later && repeatsLater(plain);
    const time = repeat ? itemDuration(plain) : null;
    const attacker = /\bcreature (?:that|who) touches you\b/i.test(plain) ? "touch" : ATTACKER.test(plain);
    // (Blight Breath's resistance "for as long as you hold your breath": the exhale ends its Effect.)
    const ends = later && /\bfor as long as you hold your breath\b/i.test(plain) ? { ends: { uuid: application.uuid, label: application.label } } : {};
    return { ...own, again: { plan, later, ...(repeat ? { repeat: true } : {}), ...(time ? { time } : {}), ...(attacker ? { attacker } : {}), ...(ownSave ? { own: true } : {}), ...ends } };
}
