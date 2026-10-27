// A whetstone's cone at the kill, and a frightened floor while it can see its user (2026-10-27, docs/needs.md): Penultimate Heartbeat's "When
// you reduce a living creature to 0 Hit Points with a weapon under the effect of a penultimate heartbeat … Foes in a 30-foot cone … are
// sprayed with gore", its failure's "For the remainder of the penultimate heartbeat's duration, the creature can't reduce the value of the
// frightened condition below 1 if it ends its turn where it can see you" (below 2 on a critical failure). The save card is kept for later,
// open for the whetstone's hour and pressed at each such kill (src/live/poison-card.js KILLED); each failing row's floor is the core's
// conditionFloor, the ability module's floor Effect, for the hour at most — that it holds only at the end of turns the creature can see its
// user, and for what's left of the hour, words on that row's note Effect. Its user's Reposition before it dies and the cone's aim are lines of
// the card. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const FLOOR = /^\{target\} \((?:critical )?failure, the rest by hand\): The creature takes (?:full|double) damage and is Frightened (\d)\. For the remainder of the [\w ']+? duration, the creature can't reduce the value of the frightened condition below (\d) if it ends its turn where it can see you\.$/;
const KILL = /\bWhen you reduce a living creature to 0 Hit Points with a weapon under the effect of a penultimate heartbeat ?, it doesn't perish immediately \(though is visibly on the brink of death\)\. You can Reposition the creature up to (\d+) feet as a free action, after which it dies in a dramatic fashion appropriate to the injury that killed it\./i;
const HOUR = /\beffects last for (\d+) (hours?|minutes?)\b/i;
const flat = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// A consumable's plan and the item → the plan with its floors and lines, or the same plan.
export function withHeartbeatFloor(plan, item) {
    const text = flat(item?.system?.description?.value);
    const kill = KILL.exec(text);
    const hour = HOUR.exec(text);
    if (!kill || !hour || plan?.resolution?.kind !== "save") return plan;
    const unit = /^hour/i.test(hour[2]) ? "hours" : "minutes";
    let read = 0;
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => {
        const line = (row?.manualInstructions ?? []).find((entry) => FLOOR.test(said(entry)));
        if (!line) return [degree, row];
        const [, , below] = FLOOR.exec(said(line));
        read += 1;
        const { manualInstructions, ...rest } = row;
        const kept = manualInstructions.filter((entry) => entry !== line);
        const note = { label: "Its soul's gore", text: `It can't reduce its frightened value below ${below} at the end of a turn it ends where it can see the whetstone's wielder, for what's left of the whetstone's ${hour[1]} ${unit.replace(/s$/, "")}${Number(hour[1]) === 1 ? "" : "s"}; at the end of one where it can't, it lowers it as usual (lower it then by hand), and the floor ends with the whetstone's time (sooner than this Effect's).`, duration: { mode: "fixed", value: Number(hour[1]), unit, expiry: "turn-start", anchor: "effect-start" } };
        return [degree, { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), conditionFloor: { slug: "frightened", value: Number(below), lifetime: "fixed", duration: { value: Number(hour[1]), unit } }, noteEffects: [...(rest.noteEffects ?? []), note] }];
    }));
    if (!read) return plan;
    const left = (plan.unread ?? []).length || Object.values(outcomes).some((row) => (row?.manualInstructions ?? []).length) || (plan.notes ?? []).length;
    // (No range of its own: the ability compiler took the Reposition's 10 feet for one; its cone is from where the creature fell — 2026-10-27.)
    return {
        ...plan,
        ...(plan.targeting ? { targeting: { ...plan.targeting, range: null } } : {}),
        resolution: { ...plan.resolution, outcomes },
        notes: [...(plan.notes ?? []), `Press it when its wielder reduces a living creature to 0 Hit Points with the weapon in the whetstone's ${hour[1]} ${unit.replace(/s$/, "")}: the wielder can Reposition it up to ${kill[1]} feet first (a free action, their own), then target the foes in the 30-foot cone they aim from where it dies.`],
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
