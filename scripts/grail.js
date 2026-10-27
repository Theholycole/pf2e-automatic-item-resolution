// Live play for plan.item.wine (src/live/grail.js, 2026-10-27: Grail of Twisted Desires): as the way is used, the GM's secret d6 (a blind roll)
// unless its user is chaotic (PF2e's chaotic trait), the wine's kind by it and the day's use (the item's activation count), and the wine in
// its user's inventory; the GM is whispered what it really is. Drunk (scripts/live.js), its plan is the wine's own.

import { twistedKind, wineSource } from "../src/live/grail.js";
import { usesNow } from "../src/live/activations-card.js";
import { MODULE_ID } from "./foundry.js";

const USES = "activationUses";

// The wine filled → the card's line.
export async function fillWine(wine, { actor, used }) {
    const itemId = /\.Item\.([A-Za-z0-9]+)$/.exec(String(used?.data?.uuid ?? ""))?.[1] ?? null;
    const holder = itemId ? actor.items.get(itemId) : null;
    const index = Number(wine.index) || 0;
    const use = holder ? usesNow(holder.getFlag(MODULE_ID, USES) ?? {}, index, { max: 3, per: "day" }, { worldTime: game.time.worldTime }) || 1 : 1;
    const chaotic = [...(actor.traits ?? new Set(actor.system?.traits?.value ?? []))].includes("chaotic");
    let kind = wine.kind;
    if (!chaotic) {
        const roll = await new Roll("1d6").evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${wine.from}: the secret roll (its ${use === 1 ? "first" : use === 2 ? "second" : "third"} use today, ${Math.min(3, use)} in 6)` }, { rollMode: "blindroll" });
        kind = twistedKind(wine.kinds.map((entry) => entry.kind), wine.kind, { roll: roll.total, use, chaotic });
    }
    const real = wine.kinds.find((entry) => entry.kind === kind) ?? wine.kinds[0];
    await actor.createEmbeddedDocuments("Item", [wineSource({ kind: real.kind, cast: real.cast ?? null }, { from: wine.from, level: wine.level, moduleId: MODULE_ID })]);
    await ChatMessage.create({ whisper: game.users.filter((user) => user.isGM).map((user) => user.id), content: `<p><strong>${wine.from}</strong>: ${actor.name} chose ${wine.kind} wine; it's really ${real.kind}${kind === wine.kind ? "" : " (the twist)"}.</p>` });
    return `The chalice fills with wine: it's in ${actor.name}'s inventory${chaotic ? " (chaotic: as chosen)" : ""}.`;
}
