// A burst its user sets off once each round while the item's Effect lasts (2026-10-20): Phoenix Flask's "For 1 minute, you gain a Fly speed
// of 40 feet. The first time each round that you Fly (including to hover in place), you shed burning feathers that deal 3d4 fire damage to all
// creatures in a 10-foot emanation at the end of your movement (… basic Reflex save)". The ability compiler read only the burst's save, at
// once, and not the Fly Speed. The item's own plan is its linked Effect, and the burst a "later" save card kept open for the Effect's time
// (plan.again), pressed at the creatures around its user each time. Pure.

const BURST = /\bFor (\d+) (minute|round)s?, you gain an? [\w ]+? Speed of \d+ feet\. The first time each round that you (\w+)( \([^)]*\))?, [^.]*?\bdeal \d+d\d+ \w+ damage to all creatures in an? (\d+)-foot emanation at the end of your movement\b/i;

// The save plan the ability compiler read, the item's plain text, its own plan (its linked Effect) → that plan with the burst for later.
export function withRoundBurst(plan, text, own) {
    const match = BURST.exec(String(text ?? ""));
    if (!match || plan?.resolution?.kind !== "save" || plan.resolution.check?.roll !== "save" || own?.resolution?.kind !== "effect" || !own.resolution.applications?.length) return plan;
    const rounds = Number(match[1]) * (match[2].toLowerCase() === "minute" ? 10 : 1);
    const feet = Number(match[5]);
    return {
        ...own,
        again: {
            plan: { ...plan, targeting: { target: `the creatures within ${feet} feet of its user`, range: null, area: { type: "emanation", value: feet } } },
            rounds,
            when: `the first time each round {user} uses ${match[3]}${match[4] ?? ""}, at the end of that movement`
        }
    };
}
