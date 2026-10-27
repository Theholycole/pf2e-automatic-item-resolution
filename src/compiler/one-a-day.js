// Only one of its kind a day (2026-10-27, docs/needs.md "afflictions"): Flame Navette's "You can activate only one flame navette per day." — the
// immunity tracker's (plan.item.immunity, src/compiler/immunity.js's shape): its user, once one's used, holds the "Immune:" Effect for a day,
// and the item module's cards refuse another of its kind while it lasts (scripts/immunity.js). Pure.

import { plainText } from "./rows.js";

const ONE_A_DAY = /\bYou can activate only one ([a-z][a-z' -]+?) per day\./i;
const ALL = ["criticalSuccess", "success", "failure", "criticalFailure"];
const slugOf = (words) => String(words).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The plan and the item's html → the plan holding to it, or the same plan.
export function withOneADay(plan, html) {
    const found = ONE_A_DAY.exec(plainText(html));
    if (!found || !plan?.item || plan.item.immunity) return plan;
    const own = slugOf(found[1]);
    if (own !== slugOf(String(plan.source?.name ?? "").replace(/\s*\([^)]*\)\s*$/, ""))) return plan;
    return { ...plan, item: { ...plan.item, immunity: { scope: "target", raw: found[0], duration: { value: 1, unit: "days" }, degrees: ALL, against: "all", slug: own } } };
}
