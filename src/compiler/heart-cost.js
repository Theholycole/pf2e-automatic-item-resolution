// Healing an ally pays for with its user's own Hit Points (2026-10-28, docs/needs.md "dying"): Magic+'s Iron Heart, snapped as an ally
// within 60 feet starts dying (or dies further): the ally regains 2d8 Hit Points and its user loses as many, nothing lowering that loss —
// not resistances, immunities nor temporary Hit Points —, and the ally regains 2d8 more if that loss would leave its user dying. The heal
// was read before; the loss was dropped. Now plan.item.healCost { noTemp, dying: { heal } }: once the item card has healed its creature, its
// user loses what that healing gave (PF2e's final damage, its temporary Hit Points set aside meanwhile), and when that leaves it at 0 Hit
// Points the card heals its creature by the dice again (scripts/live.js payHealing). Its looks and its snap off the unread lines. Pure.

const LOSES = /\bYour ally regains\s+@Damage\[(\d+d\d+)\[healing\]\]\s+hit points, and you lose\s+the same number of Hit Points\./i;
const UNMITIGATED = /^You cannot mitigate this loss\s+of Hit Points with resistances,\s+immunities, or temporary Hit Points\.$/i;
const DYING = /^If this loss of Hit Points\s+would cause you to gain\s+the dying condition,\s+your ally gains an additional (\d+d\d+) Hit Points\.$/i;
const SNAP = /^Activate\s*[-–—]\s*[\w' ]+\((?:envision)\)\s+You snap the heart from its cord,\s+sending some of your hit points\s+to your ally\.$/i;
const LOOKS = /^A small hand forged iron heart\b/i;

// The plan (its item card's heal of one ally), its item's html → the plan with the cost, or the same plan.
export function withHeartCost(plan, html) {
    const row = plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" ? plan.resolution.outcomes?.success : null;
    const heal = (row?.effects ?? []).find((effect) => effect.kind === "heal");
    const loses = LOSES.exec(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!heal || !loses || heal.formula !== loses[1] || plan.item?.healCost) return plan;
    const unread = (plan.unread ?? []).map((line) => String(line).trim());
    const dying = unread.map((line) => DYING.exec(line)).find(Boolean);
    if (!dying || !unread.some((line) => UNMITIGATED.test(line))) return plan;
    const read = (line) => UNMITIGATED.test(line) || DYING.test(line) || SNAP.test(line) || LOOKS.test(line);
    const left = unread.filter((line) => !read(line));
    const { unread: _unread, partial, ...rest } = plan;
    return {
        ...rest,
        ...(left.length ? { unread: left, partial } : { automation: { ...(plan.automation ?? {}), level: "automatic" } }),
        notes: [...(plan.notes ?? []), "Target the ally within 60 feet that just started dying (or whose Dying rose)."],
        item: { ...(plan.item ?? {}), healCost: { noTemp: true, dying: { heal: dying[1] } } }
    };
}
