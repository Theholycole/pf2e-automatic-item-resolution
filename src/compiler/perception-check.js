// A creature's Perception check against the item's DC, its degrees what it suffers: Mercurial Mantle's Cunning Dodge, "You Step, …, and
// then make a melee Strike against the triggering enemy if it's within your reach. If you do make a Strike, the target attempts a
// @Check[perception|dc:38] check before you roll. Failure This creature is Off-Guard against the Strike. Critical Failure This creature
// is off-guard against all your attacks until the end of its next turn." The core's save family with the Perception statistic (core
// 60e5ff9): the ability compiler reads the rows as a Will save's, and the statistic is then Perception. Off-guard "against the Strike"
// lasts the turn, and only its user's attacks counting is a note, as is the Step and the Strike itself. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";

// (Its other parameters too: Purloining Cloak's "@Check[perception|dc:38|name:Detect Reaction|showDC:all]".)
const CHECK = /\bthe (?:target|triggering (?:creature|enemy)) attempts an? @Check\[perception\|dc:(\d+)(?:\|[^\]]*)?\](?:\{[^}]*\})? check(?: before you roll)?\./i;

// The activation's html and the plan's base → a save plan at the creature targeted, or null.
export function perceptionCheckPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const check = CHECK.exec(text);
    if (!check) return null;
    const rows = text.slice(text.indexOf("</p>", check.index) + 4);
    if (!/<strong>\s*(?:Critical )?Failure\s*<\/strong>/i.test(rows)) return null;
    const worded = rows
        .replace(/\bThis creature is\b/g, "The target is")
        .replace(/\bagainst the Strike\./g, "against your melee attacks until the end of your turn.")
        .replace(/\b(?:off-guard|@UUID\[[^\]]*\]\{Off-Guard\}) against all your attacks until the end of (?:its|their) next turn\./gi, "@UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]{Off-Guard} against your attacks until the end of its next turn.");
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> The target must attempt a @Check[will|dc:${check[1]}] save.</p>${worded}` }, actionType: { value: "free" }, actions: { value: null } } }, options);
    if (read?.resolution?.kind !== "save" || read.resolution.check?.statistic !== "will") return null;
    const before = text.slice(0, check.index).replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").replace(/^.*?\bEffect\b\s*/s, "").trim();
    // (What its user does first, its flavor left out: "You Step, … and then make a melee Strike against the triggering enemy".)
    const does = before.replace(/\s*If you do make a Strike,\s*$/i, "").split(/(?<=[.!?])\s+/).filter((sentence) => /\b(?:Step|Stride|Strike|reach|move)\b/.test(sentence)).join(" ");
    const notes = [...(does ? [`${does.replace(/\.$/, "")} (by hand).`] : []), "Off-Guard only against its user's attacks: the Strike on a failure, all of them on a critical failure."];
    return {
        ...base,
        ...read,
        source: base.source,
        activation: base.activation,
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: { ...read.resolution, check: { ...read.resolution.check, statistic: "perception" } },
        notes,
        partial: true
    };
}
