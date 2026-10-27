// A flat shadow's form (2026-10-27, docs/needs.md "Changes to a Strike"): Silhouette Cloak's "You and objects you wear or carry fall into your
// shadow, becoming a two-dimensional silhouette. In this form you aren't incorporeal, but you also don't have a solid form and don't occupy your
// space, allowing other creatures to pass through or end their turn there. You gain resistance 20 to all damage except force damage, damage
// from effects with the light trait, and damage from Strikes with the ghost touch property rune. This increases to resistance 40 against
// nonmagical damage. Other creatures can't attempt Strength-based skill checks against you. Your land and climb Speeds both become 40 feet. You
// can't use actions except Climb, Step, or Stride actions using the granted Speeds or an Interact activation to return to your normal form. If
// your current space doesn't have sufficient room for you to return to your normal form, you return to your normal form in the nearest open
// space." Its resistance the card's own Effect (plan.item.resist, read already: the light trait among its exceptions too, PF2e's "light"); the
// rest a note Effect on its user for the same time with PF2e's BaseSpeed for each Speed, its words what PF2e can't play — the user's rule. Its
// reaction, "gaining the benefits of the first activation until the end of the current creature's turn", gets the same for that time. Pure.

const BECOME = /\bYour (land|climb|swim|fly|burrow)(?: and (land|climb|swim|fly|burrow))? Speeds? (?:both )?become (\d+) feet\./i;
const FORM = /\bYou and objects you wear or carry fall into your shadow, becoming a two-?dimensional silhouette\.[\s\S]*?in the nearest open space\./i;
const LIGHT = /\bdamage from effects with the light trait\b/i;
// (Or as src/compiler/item-data.js words it, "gaining the first activation's resistance".)
const FIRST = /\bgaining (?:the benefits of the first activation|the first activation's resistance)\b/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan, its activation's plain text and the item's (for a reaction that borrows the first activation's words) → the plan, or the same plan.
export function withSilhouette(plan, text, itemText) {
    const resist = plan?.item?.resist;
    const row = plan?.resolution?.outcomes?.success;
    if (!resist?.length || !row) return plan;
    const own = FORM.exec(String(text ?? ""));
    const borrowed = !own && FIRST.test(String(text ?? "")) ? FORM.exec(String(itemText ?? "")) : null;
    const form = (own ?? borrowed)?.[0];
    const speeds = form ? BECOME.exec(form) : null;
    if (!form || !speeds) return plan;
    const duration = resist[0].duration ?? null;
    const types = [speeds[1], speeds[2]].filter(Boolean).map((type) => type.toLowerCase());
    const sentences = form.split(/(?<=\.)\s+(?=[A-Z])/).filter((sentence) => !/^You gain resistance\b|^This increases to resistance\b/i.test(sentence) && !BECOME.test(sentence));
    const note = { label: `${plan.source?.name ?? "Item"} (silhouette)`, text: `${sentences.join(" ")} Your ${types.join(" and ")} Speed${types.length > 1 ? "s are" : " is"} ${speeds[3]} feet.`, duration, rules: types.map((type) => ({ key: "BaseSpeed", selector: type, value: Number(speeds[3]) })) };
    const exceptions = (entry) => (LIGHT.test(form) && !(entry.exceptions ?? []).includes("light") ? { ...entry, exceptions: [...(entry.exceptions ?? []), "light"] } : entry);
    // (What it leaves unread or notes that its note now says: its sentences, the reaction's own restatement of the resistance, "Its other benefits".)
    const held = (line) => form.includes(said(line)) || /^You fold the cloak over yourself\b|^Until the end of the current turn, you gain resistance\b|^Its other benefits of the first activation apply\b/i.test(said(line));
    const unread = (plan.unread ?? []).filter((line) => !held(line));
    const notes = (plan.notes ?? []).filter((line) => !held(line));
    const left = unread.length || notes.length || (row.manualInstructions ?? []).length;
    return {
        ...plan,
        item: { ...plan.item, resist: resist.map(exceptions) },
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []), note] } } },
        unread: unread.length ? unread : undefined,
        notes: notes.length ? notes : undefined,
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
