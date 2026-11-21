// (2026-11-21, Cole after a playtest: "Drake rifle assumes all shots are the activation when striking".)
// PF2e's drake rifles carry a Note rule with no predicate: every hit's damage roll says "On a hit, the target is pushed 10 feet
// away from you, and if it's on the ground, it falls Prone" (or its type's other effect) — but that's Drake Shot's alone, the
// once-a-day activation. Its notes are left on a damage roll only when Drake Shot is readied for that rifle (scripts/strikes.js,
// the readied Strike's Effect); a plain Strike's damage roll loses them. Pure.

export const ACTIVATION_NOTE_PREFIXES = Object.freeze(["PF2E.SpecificRule.Equipment.DrakeRifle.Note."]);

export const isActivationNote = (note) => ACTIVATION_NOTE_PREFIXES.some((prefix) => String(note?.text ?? "").startsWith(prefix));

// The weapon a Strike's roll is with: PF2e's "item:id:…" roll option, else its origin's uuid.
export function weaponIdOf(context = {}, origin = null) {
    const option = (context.options ?? []).find((entry) => /^item:id:[^:]+$/.test(entry));
    if (option) return option.slice("item:id:".length);
    const uuid = String(origin?.uuid ?? "");
    return uuid.includes(".Item.") ? uuid.split(".Item.").at(-1).split(".")[0] : null;
}

// Whether one of the actor's readied Strikes (their Effects' flags) is that weapon's activation.
export function activationReadied(riders = [], weaponId = null) {
    return riders.some((rider) => rider && (!rider.weaponId || !weaponId || rider.weaponId === weaponId) && rider.plan?.strike?.own);
}

// The notes a plain Strike's damage roll keeps: those that aren't an activation's. → { notes, dropped }.
export function plainStrikeNotes(notes = []) {
    const dropped = notes.filter(isActivationNote);
    return { notes: notes.filter((note) => !isActivationNote(note)), dropped };
}
