// A creature impaled on a shield's blades after a critical hit (2026-10-27, docs/needs.md "Changes to a Strike"): Highhelm War Shield's
// "Trigger You critically hit with the shield's integrated blades Effect The shield's blades grow and dig themselves into your foe. The creature
// becomes Grabbed as it becomes impaled on the shield spikes. While you have a creature grabbed in this way, you can't Raise the Shield, but the
// creature takes persistent bleed damage every round equal to the number of damage dice. This persistent bleed can't end as long as the creature
// is impaled on the shield. You can Release the shield to leave it embedded in the creature. This ends the grab but doesn't end the persistent
// bleed damage. The creature can remove the shield and end the grab by attempting a check to Escape. This normally uses your Athletics DC to
// Escape, but if you're no longer holding the shield, the Escape DC is 43."
// The row: its Grabbed until it Escapes, against its user's Athletics DC (escape { ownerDC: "athletics" }, src/compiler/grab-ability.js); PF2e's
// persistent bleed of the blades' damage dice (1 + their striking rune's, from "a +3 major striking weapon"); and a note Effect on it while that
// bleed lasts saying it can't end while impaled and the Escape DC once the shield's let go. Its user's own part — no Raise a Shield while it
// holds one, its Release — lines of the card. Pure.

const BLEED = /^\{target\}: While you have a creature grabbed in this way, you can't Raise the Shield, but the creature takes persistent bleed damage every round equal to the number of damage dice\.$/i;
const RELEASED = /^\{target\}: This ends the grab but doesn't end the persistent bleed damage\.$/i;
const ESCAPES = /^\{target\}: The creature can remove the shield and end the grab by attempting a check to Escape\.$/i;
const RUNES = /\bmaking them an? \+\d (?:(greater|major) )?striking weapon\b/i;
const LET_GO = /\bThis normally uses your Athletics DC to Escape, but if you're no longer holding the shield, the Escape DC is (\d+)\./i;
const STRIKING = { greater: 2, major: 3 };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The plan and the item's html (its runes are said before the activation) → the plan with the impaling row, or the same plan.
export function withImpaled(plan, itemHtml) {
    const row = plan?.resolution?.outcomes?.success;
    const grab = (row?.effects ?? []).find((effect) => effect?.slug === "grabbed");
    const lines = (row?.manualInstructions ?? []).map(said);
    const text = plain(itemHtml);
    const runes = RUNES.exec(text);
    const letGo = LET_GO.exec(text);
    if (!grab || !runes || !letGo || !lines.some((line) => BLEED.test(line)) || !lines.some((line) => ESCAPES.test(line))) return plan;
    const dice = 1 + (STRIKING[runes[1]?.toLowerCase()] ?? 1);
    const ours = (line) => BLEED.test(line) || RELEASED.test(line) || ESCAPES.test(line);
    const kept = (row.manualInstructions ?? []).filter((entry) => !ours(said(entry)));
    const effects = row.effects.map((effect) => (effect === grab ? { ...effect, duration: { mode: "until-escape", escape: { ownerDC: "athletics" } } } : effect));
    const note = { label: "Impaled on the shield", text: `Its persistent bleed can't end while it's impaled on the shield. It Escapes against the shield's wielder's Athletics DC, or DC ${letGo[1]} once the wielder no longer holds the shield; a Release leaves the shield embedded (the grab ends, the bleed doesn't).`, whilePersistent: "bleed" };
    const success = { ...row, effects, damage: { mode: "formulas", formulas: [{ formula: `${dice}[persistent,bleed]` }], rollScope: "outcome" }, noteEffects: [...(row.noteEffects ?? []), note] };
    if (kept.length) success.manualInstructions = kept;
    else delete success.manualInstructions;
    const notes = (plan.notes ?? []).filter((note) => !ours(`{target}: ${said(note)}`));
    const own = ["While it holds a creature impaled, its wielder can't Raise the Shield.", "Release the shield to leave it embedded: the grab ends, the persistent bleed doesn't."];
    const left = kept.length || notes.length || (plan.unread ?? []).length;
    return { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success } }, notes: [...notes, ...own], ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
