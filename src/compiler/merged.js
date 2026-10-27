// Merged with the water until expelled (2026-10-27, docs/needs.md): Tideplate's Submerge, "You merge with the water for 10 minutes. While
// merged, you can't move, you can see through the water if it's clear enough, and you can hear what's going on outside of the water. Water
// typically can't take damage, but if the water you're merged in is subject to electricity damage or an ability or effect that destroys or
// dries water, you're expelled from the water and take @Damage[10d6] damage. Control water expels you without dealing damage." As the spell
// module plays One with Stone's merge: an Effect on its user for the time, with PF2e's GrantItem of Immobilized (it can't move), gone with
// it — a note Effect (the ability module's, its rules). What expels it is no event PF2e has (the water damaged, dried, a Control Water): words
// on that Effect, the 10d6 the GM's to roll then. In place of the reminder of the whole text. Pure.

const MERGE = /\bEffect You merge with the (water|stone|earth) for (\d+) (minutes?|hours?)\. While merged, you can't move, (you can see through the \1 if it's clear enough, and you can hear what's going on outside of the \1)\. (\1 typically can't take damage, but if the \1 you're merged in is subject to [^.]+?, you're expelled from the \1 and take (\d+d\d+) damage)\. (Control water expels you without dealing damage)\.\s*$/i;
const IMMOBILIZED = "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe";
const flat = (html) => String(html ?? "").replace(/@\w+\[([^\]]*)\]\{([^}]*)\}/g, "$2").replace(/@Damage\[([^\]]*)\]/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The plan and its activation's html → the plan with the merge's Effect, or the same plan.
export function withMerged(plan, html) {
    const merge = MERGE.exec(flat(html));
    const success = plan?.resolution?.outcomes?.success;
    if (!merge || !success || !(success.noteEffects ?? []).some((note) => note.reminder)) return plan;
    const [, substance, value, unit, senses, expelled, , ends] = merge;
    const duration = { mode: "fixed", value: Number(value), unit: /^hour/i.test(unit) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" };
    const note = {
        label: `Merged with the ${substance.toLowerCase()}`,
        text: `While merged, you can't move (Immobilized), ${senses}. ${expelled.charAt(0).toUpperCase()}${expelled.slice(1)}: this Effect ends then. ${ends}.`,
        duration,
        rules: [{ key: "GrantItem", uuid: IMMOBILIZED, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }]
    };
    return {
        ...plan,
        noteOnly: undefined,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, noteEffects: [...success.noteEffects.filter((entry) => !entry.reminder), note] } } }
    };
}
