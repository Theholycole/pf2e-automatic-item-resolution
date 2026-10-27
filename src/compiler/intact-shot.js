// Ammunition that stays in the creature it hits (2026-10-27, docs/needs.md): Treasure Vault's shots that "remain intact" — Lightning Rod Shot,
// Conduit Shot (three grades), Spell Echo Shot. "When a lightning rod shot strikes a target, it remains intact. It moves with a creature it
// struck, unless the GM determines otherwise, until that creature regains any Hit Points. If it doesn't stick to the target, it falls to the
// ground …", then its rule for the minute it stays active. The Strike card's hit already puts a note Effect on the creature for that minute;
// what it read of the rule there was a part. It now carries the whole rule: the creatures its user names (Conduit's and Spell Echo's), a spell
// including the shot in its area made larger or duplicated (no PF2e rule plays either), the electricity riders. Lightning Rod's "takes a –1
// circumstance penalty to the save" is PF2e's FlatModifier on that Effect, on saves against electricity effects. Whether it stays with the
// creature (the GM's call) and where a shot that doesn't stick falls are lines of the card. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const flat = (html) => String(html ?? "").replace(/@Damage\[(\d+)\[(\w+)\]\]/g, "$1 $2").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const FIRST = /^On a hit, it remains intact\.$/;
const STAYS = /^It moves with a creature it struck, unless the GM determines otherwise, until that creature regains any Hit Points \(the GM's call\)\.$/;
const FALLS = /^If it doesn't stick to the target, (?:it falls to the ground and becomes inactive|the active ammunition instead falls into the target's space, remaining active)\.$/;
const NAMED = /\bWhen you Activate it, you name up to four creatures, in addition to you, that the ammunition's magic works for\./;
const SAVE_PENALTY = /\bIf the spell or attack allows a saving throw to reduce the damage, the target of this shot takes a -1 circumstance penalty to the save\./;

// The plan and the item → the plan with its shot's whole rule on the hit's Effect, or the same plan.
export function withIntactShot(plan, item) {
    const notes = plan?.strike?.notes ?? [];
    if (!plan?.strike?.ammo || !FIRST.test(said(notes[0])) || !notes.some((note) => STAYS.test(said(note)))) return plan;
    const lines = notes.filter((note) => STAYS.test(said(note)) || FALLS.test(said(note)));
    const rule = notes.filter((note) => !FIRST.test(said(note)) && !lines.includes(note)).map(said);
    const text = flat(item?.system?.description?.value);
    const named = NAMED.exec(text)?.[0];
    const penalty = rule.some((sentence) => SAVE_PENALTY.test(sentence.replace(/[–—]/g, "-")));
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => {
        const at = (row?.noteEffects ?? []).findIndex((note) => /^On a hit, it remains intact\./.test(said(note)));
        if (at < 0) return [degree, row];
        const note = row.noteEffects[at];
        const whole = { ...note, label: "Shot lodged", text: [named, ...rule].filter(Boolean).join(" "), ...(penalty ? { rules: [{ key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: -1, predicate: ["item:trait:electricity"] }] } : {}) };
        return [degree, { ...row, noteEffects: row.noteEffects.map((entry, index) => (index === at ? whole : entry)) }];
    }));
    if (!Object.values(outcomes).some((row, index) => row !== Object.values(plan.resolution.outcomes)[index])) return plan;
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length || Object.values(outcomes).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        resolution: { ...plan.resolution, outcomes },
        strike: { ...plan.strike, notes: lines },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
