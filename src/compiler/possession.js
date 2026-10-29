// A fulcrum lens's splinter possessing the creature it hits (2026-10-28, docs/needs.md; built three times in batch 4, one mechanism since):
// Crimson, Emerald and Ochre Fulcrum Lens's "While grasping the lens, make a melee spell attack roll with a modifier of +18. On a hit, you force
// the splinter of Nhimbaloth's essence from the lens to possess the target. You're no longer invested in the lens, and the target gains the
// benefits as though it had invested the lens but can't activate the lens's other abilities. This effect is permanent, but it can be ended by
// any effect that removes a possession effect. The lens doesn't have any magical abilities until the possession effect ends; when it does, the
// essence returns to the lens." Its own melee spell attack against AC (plan.ownCheck, the ability module's card at the creature); a hit gives
// the creature the lens's own PF2e Effect (its invested benefits, linked in the lens's text) and the possession's note Effect for good, its
// RollOption the possession's mark; plan.possess { degrees, option, effect }: once the card is applied with a hit, its user is no longer
// invested, loses the lens's Effect, and the lens refuses its activations until the possession ends — the note Effect deleted, the creature's
// Effect of the lens gone with it (scripts/possession.js). Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The lens's activation's matches ([attack]) and its item → the card, or null without its Effect's link.
export function lensPossession([attack], { itemHtml, base }) {
    const name = String(base?.source?.name ?? "").replace(/:.*$/, "");
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const link = new RegExp(String.raw`@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: ${escaped})\}`).exec(String(itemHtml ?? ""));
    if (!link) return null;
    const slug = base?.source?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const option = `air-possessed-by:${slug}`;
    const modifier = Number(attack[1]);
    const hit = () => ({
        ...none(),
        nativeEffects: [{ uuid: link[1], label: link[2] }],
        noteEffects: [{ label: "Possessed by Nhimbaloth's splinter", text: `A splinter of Nhimbaloth's essence from the ${name} possesses it, for good: it has the lens's benefits as if it had invested it (the lens's Effect beside this), but can't activate the lens. An effect that removes a possession ends it: delete this Effect then, and the essence returns to the lens.`, duration: null, rules: [{ key: "RollOption", domain: "all", option }] }]
    });
    return {
        traits: [...new Set([...(base?.traits ?? []), "attack", "possession"])],
        targeting: { target: "1 creature", range: "touch", area: null },
        ownCheck: { kind: "attack", modifier },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier }, sharedDamage: null, outcomes: { criticalSuccess: hit(), success: hit(), failure: none(), criticalFailure: none() } },
        possess: { degrees: ["criticalSuccess", "success"], option, effect: link[1] },
        notes: [`While grasping the lens: its own melee spell attack (+${modifier}). On a hit its user is no longer invested in it, and it has no magic until the possession ends.`]
    };
}
