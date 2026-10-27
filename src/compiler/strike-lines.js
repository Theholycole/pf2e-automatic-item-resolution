// What a Strike card's notes say that's only its user's to do or PF2e's own rule said again (2026-10-27, docs/needs.md "Changes to a Strike"):
// lines of the card (strike.lines, src/live/strike-card.js), not notes left to the table — the user's rule for lines about its user's own
// action and the map.
// - Fairy Bullet's "You choose which corner of the target's space you want the burst to extend out from at the time you declare the associated
//   Strike": where its cast's burst starts, its user's pick on the map; and "Since the fairy bullet is fired before revealing light can reveal
//   the target, the effects don't affect the flat check for the attack roll with the fairy bullet if the target is Hidden from you": PF2e's own
//   order, the flat check before the hit.
// - Serpent's Lash's "you also Reposition the creature 5 feet (10 feet on a critical hit)": PF2e's own Reposition's distances, its card's rows
//   (strike.follow) — the follow's note said again, gone.
// Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const LINES = [
    /^You choose which corner of the target's space you want the burst to extend out from at the time you declare the associated Strike\.$/i,
    /^Since the [\w' -]+? is fired before [\w' -]+? can reveal the target, the effects don't affect the flat check for the attack roll with the [\w' -]+? if the target is Hidden from you\.$/i
];
// (A maneuver's own distances, as PF2e's action has them: Reposition 5 feet, 10 on a critical success.)
const OWN_DISTANCES = { reposition: /^Reposition the creature 5 feet \(10 feet on a critical hit\)\.$/i };

export function withStrikeLines(plan) {
    const strike = plan?.strike;
    if (!strike) return plan;
    const lines = (strike.notes ?? []).filter((note) => LINES.some((pattern) => pattern.test(said(note))));
    const own = OWN_DISTANCES[strike.follow?.action?.slug];
    const restated = own ? (strike.follow.notes ?? []).filter((note) => own.test(said(note))) : [];
    if (!lines.length && !restated.length) return plan;
    const notes = (strike.notes ?? []).filter((note) => !lines.includes(note));
    const followNotes = (strike.follow?.notes ?? []).filter((note) => !restated.includes(note));
    const follow = strike.follow ? (() => {
        const { notes: _, ...rest } = strike.follow;
        return followNotes.length ? { ...rest, notes: followNotes } : rest;
    })() : undefined;
    const left = [...notes, ...followNotes, ...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    return {
        ...plan,
        strike: { ...strike, ...(strike.notes ? { notes } : {}), ...(lines.length ? { lines: [...(strike.lines ?? []), ...lines.map(said)] } : {}), ...(follow ? { follow } : {}) },
        ...(plan.partial && !left.length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
