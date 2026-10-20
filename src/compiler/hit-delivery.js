// A poison or curse a weapon gives the creature it hits, read by the ability compiler as an affliction's save on a Strike. Two ways:
// - The hit already made, its trigger's: Lionfish Spear's "Trigger You successfully Strike a creature with the lionfish spear … The
//   spear injects lionfish poison into the target", Serpent Dagger's "Trigger You damage a creature with the serpent dagger". The save
//   card on use, at the creature hit (the presser's target).
// - The next hit: Alghollthu Lash's "The next creature you successfully Strike with this weapon is exposed to alghollthu slime",
//   Protector's Final Gift's venom that "affects the next creature successfully struck with the blade", Viper's Fang's "If you hit with
//   this attack, the creature is exposed to viper fang venom". The injury poison's coat card: the weapon carries it to its next hit —
//   the item itself when it's a weapon (coats "self"), else any of its user's weapons (coats "any", a talisman's affixed one). Pure.

const AFTER_HIT = /^You (?:successfully Strike|Strike|hit|critically hit|damage) a creature\b/i;
const NEXT_HIT = /\b(?:The next creature you (?:successfully )?Strike with (?:this|the) [\w' -]+? is exposed to|affects the next creature (?:successfully )?struck with the [\w' -]+?|If you hit with this attack, the (?:creature|target) is exposed to)\b/i;

// (Not a hit of its user's: whoever hits its drinker, Frogskin Tincture's toxin "affecting any creature that hits you with a jaws Strike or
// other bite attack" — the card kept for the item's time, set off by that creature, src/live/poison-card.js ATTACKER.)
const HITS_YOU = /\bany creature that hits you with\b/i;
const AFTER_MISS = /^You fail, but don't critically fail, an attack\b/i;

// The plan, the activation's plain text, its Trigger's words and the item's type → the plan as it's played, or as it was.
export function withHitDelivery(plan, text, { trigger = null, itemType = null } = {}) {
    if (plan?.resolution?.kind !== "save" || plan.trigger?.event !== "strike" || !plan.resolution.afflictionHandoff || plan.resolution.check?.against?.dc !== "fixed") return plan;
    if (HITS_YOU.test(String(text ?? ""))) return { ...plan, trigger: { event: "use", ...(plan.trigger.frequency ? { frequency: plan.trigger.frequency } : {}) }, targeting: { target: "the creature that hits you", range: null, area: null } };
    if (trigger && AFTER_HIT.test(String(trigger).trim())) return { ...plan, trigger: { event: "use", ...(plan.trigger.frequency ? { frequency: plan.trigger.frequency } : {}) }, targeting: { target: "the creature hit", range: null, area: null } };
    // (Or the miss already made, Viper Rapier's "Trigger You fail, but don't critically fail, an attack using the viper rapier": the creature
    // missed, the presser's target.)
    if (trigger && AFTER_MISS.test(String(trigger).trim())) {
        // (A named poison it's exposed to, "The target is exposed to cave worm venom": the affliction that poison's, not the weapon's.)
        const named = /\bThe target is exposed to ([a-z][a-z' ]+? (?:venom|poison|toxin))\./i.exec(String(text ?? ""))?.[1] ?? null;
        const title = named ? named.replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
        const handoff = named ? { ...plan.resolution.afflictionHandoff, name: title, slug: named.toLowerCase().replace(/[^a-z0-9]+/g, "-"), traits: ["injury", "poison"] } : plan.resolution.afflictionHandoff;
        return { ...plan, resolution: { ...plan.resolution, afflictionHandoff: handoff }, trigger: { event: "use", ...(plan.trigger.frequency ? { frequency: plan.trigger.frequency } : {}) }, targeting: { target: "the creature missed", range: null, area: null } };
    }
    // (For how long, when it says: "within the next minute".)
    const within = /\bwithin the next (?:(\d+) )?(minutes?|rounds?|hours?)\b/i.exec(String(text ?? ""));
    const unit = within ? { minute: "minutes", round: "rounds", hour: "hours" }[within[2].toLowerCase().replace(/s$/, "")] : null;
    if (NEXT_HIT.test(String(text ?? ""))) return { ...plan, coats: itemType === "weapon" ? "self" : "any", ...(within ? { coatLasts: { value: Number(within[1] ?? 1), unit } } : {}) };
    return plan;
}
