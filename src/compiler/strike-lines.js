// What a Strike card's notes say that's only its user's to do or PF2e's own rule said again (2026-10-27, docs/needs.md "Changes to a Strike"):
// lines of the card (strike.lines, src/live/strike-card.js), not notes left to the table — the user's rule for lines about its user's own
// action and the map.
// - Fairy Bullet's "You choose which corner of the target's space you want the burst to extend out from at the time you declare the associated
//   Strike": where its cast's burst starts, its user's pick on the map; and "Since the fairy bullet is fired before revealing light can reveal
//   the target, the effects don't affect the flat check for the attack roll with the fairy bullet if the target is Hidden from you": PF2e's own
//   order, the flat check before the hit.
// - Serpent's Lash's "you also Reposition the creature 5 feet (10 feet on a critical hit)": PF2e's own Reposition's distances, its card's rows
//   (strike.follow) — the follow's note said again, gone.
// - Hippopotamus Klar's Engulfing Jaws, "Make a melee Strike with the klar blade targeting two creatures adjacent to each other. Roll the attack
//   and damage once and apply it to each creature separately": strike.volley.oneRoll { count, adjacent } — the Strike card readies one Strike
//   at the creatures targeted, its one attack roll compared to each one's AC (scripts/strikes.js), its one damage roll applied to each it hits.
// - Iron Cube's "If you're wielding a two-handed melee weapon, you can ignore Trip's requirement that you have a free hand": its user's own
//   hands, a line; and "If you have the Slam Down feat, ignore the normal size restrictions for the trip and increase the damage dice if you
//   knock the target prone to the damage die of your weapon if it's higher than d6": follow.featDie { slug, name, atLeast } — the Trip card's
//   prone damage at the Strike's weapon's die when its user has the feat (src/live/strike-card.js withFeatDie, scripts/strikes.js), the size
//   limit a line (2026-10-27).
// Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const LINES = [
    /^You choose which corner of the target's space you want the burst to extend out from at the time you declare the associated Strike\.$/i,
    /^Since the [\w' -]+? is fired before [\w' -]+? can reveal the target, the effects don't affect the flat check for the attack roll with the [\w' -]+? if the target is Hidden from you\.$/i
];
const AT_TWO = /^Make a (melee|ranged) Strike with the [\w' -]+? targeting (two|three) creatures adjacent to each other\.$/i;
const ONCE = /^Roll the attack and damage once and apply it to each creature separately\.$/i;
const FREE_HAND = /^If you're wielding a two-handed melee weapon, you can ignore (\w+)'s requirement that you have a free hand\.$/i;
const FEAT_DIE = /^If you have the ([A-Z][\w' -]+?) feat, ignore the normal size restrictions for the (\w+) and increase the damage dice if you knock the target prone to the damage die of your weapon if it's higher than (d\d+)\.$/i;
// (A maneuver's own distances, as PF2e's action has them: Reposition 5 feet, 10 on a critical success.)
const OWN_DISTANCES = { reposition: /^Reposition the creature 5 feet \(10 feet on a critical hit\)\.$/i };

export function withStrikeLines(plan) {
    const strike = plan?.strike;
    if (!strike) return plan;
    const lines = (strike.notes ?? []).filter((note) => LINES.some((pattern) => pattern.test(said(note))));
    // (One roll at several, Hippopotamus Klar's: both sentences read, the volley's oneRoll.)
    const atTwo = (strike.notes ?? []).map((note) => [note, AT_TWO.exec(said(note))]).find(([, match]) => match);
    const once = (strike.notes ?? []).find((note) => ONCE.test(said(note)));
    const oneRoll = atTwo && once && !strike.volley ? { count: { two: 2, three: 3 }[atTwo[1][2].toLowerCase()], adjacent: true } : null;
    const own = OWN_DISTANCES[strike.follow?.action?.slug];
    const restated = own ? (strike.follow.notes ?? []).filter((note) => own.test(said(note))) : [];
    // (Iron Cube's two-handed weapon and Slam Down: lines, and the feat's die for the follow's damage.)
    const hands = (strike.follow?.notes ?? []).filter((note) => FREE_HAND.test(said(note)));
    const feat = strike.follow?.action?.damage ? (strike.follow.notes ?? []).map((note) => [note, FEAT_DIE.exec(said(note))]).find(([, match]) => match) : null;
    if (hands.length || feat) {
        restated.push(...hands, ...(feat ? [feat[0]] : []));
        lines.push(...hands.map((note) => said(note).replace(/^If you're wielding a two-handed melee weapon, you can ignore (\w+)'s requirement that you have a free hand\.$/i, "With a two-handed melee weapon, its $1 needs no free hand")));
        if (feat) lines.push(`With the ${feat[1][1]} feat: no size limit on the ${feat[1][2]} (by its user's say), and its prone damage dice are the weapon's when they're bigger than ${feat[1][3]}`);
    }
    if (!lines.length && !restated.length && !oneRoll) return plan;
    const notes = (strike.notes ?? []).filter((note) => !lines.includes(note) && !(oneRoll && (note === atTwo[0] || note === once)));
    const followNotes = (strike.follow?.notes ?? []).filter((note) => !restated.includes(note));
    const follow = strike.follow ? (() => {
        const { notes: _, ...rest } = strike.follow;
        const withFeat = feat ? { ...rest, featDie: { slug: feat[1][1].toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: feat[1][1], atLeast: feat[1][3].toLowerCase() } } : rest;
        return followNotes.length ? { ...withFeat, notes: followNotes } : withFeat;
    })() : undefined;
    const left = [...notes, ...followNotes, ...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    return {
        ...plan,
        strike: { ...strike, ...(strike.notes ? { notes } : {}), ...(lines.length ? { lines: [...(strike.lines ?? []), ...lines.map(said)] } : {}), ...(follow ? { follow } : {}), ...(oneRoll ? { volley: { each: "creature", oneRoll } } : {}) },
        ...(plan.partial && !left.length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
