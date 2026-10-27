// Its user's own counteract statistics when they're better (2026-10-27, docs/needs.md "afflictions" and "counteract"): Flame Navette's "If you
// have the Determination feat, you can use your own modifier if it's better" — the feat's counteract check is a Will save — and Contagion
// Metabolizer's "If you're a chirurgeon alchemist and have powerful alchemy, you can substitute your statistics when you create a contagion
// metabolizer using Quick Alchemy, if your stats are higher. This replaces the counteract rank with half your level rounded up and the
// counteract modifier with your class DC – 10." → counteract.fromUser { rank?, modifier, better: true, needs: { features, infused? } }: the
// counteract card (scripts/counteract.js) takes its user's numbers only when they have those features (and the item was made by Quick
// Alchemy, PF2e's infused trait), and each only where it's higher than the item's. The by-hand note gone; whole once nothing else is left.
// Pure.

import { counteractLeaves } from "./counteract.js";
import { plainText } from "./rows.js";

const DETERMINATION = /\bIf you have the Determination feat, you can use your own modifier if it's better\./i;
const DETERMINATION_NOTE = /^With the Determination feat, use your own counteract modifier if it's better \(by hand\)\.$/;
const CHIRURGEON = /\bIf you're a chirurgeon alchemist and have powerful alchemy, you can substitute your statistics when you create an? [\w' -]+? using Quick Alchemy, if your stats are higher\. This replaces the counteract rank with half your level rounded up and the counteract modifier with your class DC\s*[-–—]\s*10\./i;
const CHIRURGEON_NOTE = /^This replaces the counteract rank with half your level rounded up and the counteract modifier with your class DC\s*[-–—]\s*10\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan (a counteract card's) and the item's html → the plan with its user's numbers when better, or the same plan.
export function withOwnCounteract(plan, html) {
    const counteract = plan?.item?.counteract;
    if (!counteract || counteract.fromUser || counteract.save) return plan;
    const text = plainText(html);
    const own = DETERMINATION.test(text) ? [{ modifier: "will", better: true, needs: { features: ["determination"] } }, DETERMINATION_NOTE]
        : CHIRURGEON.test(text) ? [{ rank: "half-level", modifier: "class-dc", better: true, needs: { features: ["chirurgeon", "powerful-alchemy"], infused: true } }, CHIRURGEON_NOTE]
            : null;
    if (!own) return plan;
    const [fromUser, note] = own;
    const notes = (counteract.notes ?? []).filter((entry) => !note.test(said(entry)));
    const next = { ...counteract, fromUser, ...(notes.length ? { notes } : { notes: undefined }) };
    const left = counteractLeaves(next).length || (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    return { ...plan, item: { ...plan.item, counteract: next }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}
