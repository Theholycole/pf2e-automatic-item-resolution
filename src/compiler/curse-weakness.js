// A spell's weakness added to a curse's (2026-10-27, docs/needs.md "afflictions"): Arboreal's Revenge's Arboreal's Grace, "You cast Oaken
// Resilience from the blunderbuss as a 2nd-rank primal spell. However, the weakness to fire imposed by oaken resilience is cumulative with the
// weakness to fire imposed by this weapon's curse, for a total of weakness 8 to fire." PF2e keeps only the highest weakness of a type, so the
// cast's 3 beside the curse's 5 would be 5: the ways card — on its wielder, PF2e's own Spell Effect: Oaken Resilience (Arboreal's Revenge),
// which the text links (resistance 2, weakness 8 to fire); on another creature, the cast as read (no curse there to add to). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const CUMULATIVE = /^Effect You cast ([A-Z][\w' -]+?) from the [\w' -]+? as an? (\d+)(?:st|nd|rd|th)-rank (?:arcane|divine|occult|primal) spell\. However, the weakness to (\w+) imposed by \1 is cumulative with the weakness to \3 imposed by this weapon's curse, for a total of weakness (\d+) to \3\.(?: Spell Effect: \1 \([^)]*\))?$/i;
const LINKED = /@UUID\[(Compendium\.pf2e\.spell-effects\.Item\.[A-Za-z0-9]{16})\]\{(Spell Effect: [^}]+)\}/;

// An activation's plan (the cast), its item and its entry → the ways card, or the same plan.
export function withCumulativeWeakness(plan, item, entry) {
    if (plan?.builtin !== "cast-spell") return plan;
    const html = String(entry?.activation?.html ?? "");
    const found = CUMULATIVE.exec(plainText(html).replace(/^.*?(?=\bEffect\b)/s, "").trim());
    const linked = LINKED.exec(html);
    if (!found || !linked || found[1].toLowerCase() !== String(plan.spell?.name ?? "").toLowerCase()) return plan;
    const { notes: _notes, partial: _partial, ...cast } = plan;
    const { builtin: _builtin, spell: _spell, dc: _dc, attack: _attack, tradition: _tradition, self: _self, ...base } = cast;
    const own = { modelVersion: MODEL_VERSION, ...base, rank: 1, activation: { time: entry.activation.time ?? null, traits: entry.activation.traits ?? [] }, trigger: { ...(plan.trigger ?? {}), event: "use" }, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, resolution: { kind: "effect", applications: [{ kind: "native-spell-effect", uuid: linked[1], label: linked[2], recipients: "self" }] }, notes: [`With the curse's, its weakness to ${found[3]} is ${found[4]} in all.`] };
    return {
        ...base,
        rank: 1,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        ways: [
            { name: "On its wielder", html: "", plan: own },
            { name: "On another creature", html: "", plan: { ...cast, automation: { level: "automatic" } } }
        ],
        once: true
    };
}
