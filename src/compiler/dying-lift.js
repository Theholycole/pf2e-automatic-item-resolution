// A dying ally lifted back up (2026-10-27, docs/needs.md "dying"): Banner of the Rising Star's Rise Up, "An ally within the banner's aura with
// the Dying condition regains 30 Hit Points, does not increase their Wounded condition, and can Stand as a free action. They become immune to
// Rise Up for 1 day." Its healing, its Wounded kept (item.keepWounded, the core's end of Dying) and its day's immunity are the item card's
// already; who it's for (a Dying ally in the aura) and the ally's own Stand are lines of the card, in place of the whole text's reminder. Pure.

const LIFT = /\bAn ally within the banner's aura with the Dying condition regains (\d+) Hit Points, does not increase their Wounded condition, and can Stand as a free action\.$/;
const FLAVOR = /^(?:\S.*?\bEffect )?The magical banner lifts your allies from the brink of death\.\s*/;

// The plan → the plan with its lines, or the same plan.
export function withDyingLift(plan) {
    const row = plan?.resolution?.outcomes?.success;
    const reminder = (row?.noteEffects ?? []).find((note) => note.reminder);
    const found = reminder ? LIFT.exec(String(reminder.text).replace(FLAVOR, "").trim()) : null;
    const healed = (row?.effects ?? []).find((effect) => effect.kind === "heal");
    if (!found || Number(healed?.amount) !== Number(found[1]) || !plan.item?.keepWounded || !plan.item?.immunity || (plan.unread ?? []).length || (plan.notes ?? []).length) return plan;
    const outcomes = { ...plan.resolution.outcomes, success: { ...row, noteEffects: row.noteEffects.filter((note) => note !== reminder) } };
    const left = Object.values(outcomes).some((one) => (one?.manualInstructions ?? []).length);
    const { unread: _unread, ...rest } = plan;
    return {
        ...rest,
        resolution: { ...plan.resolution, outcomes },
        notes: ["Only for an ally within the banner's aura who is Dying.", "That ally can Stand as a free action."],
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
