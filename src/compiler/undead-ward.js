// Unseen by undead for a while, a save to see through it (2026-10-27, docs/needs.md): Corpseward Pendant's "You become undetectable to undead
// creatures for 10 minutes. Undead can't see, hear, or smell you, or detect you with sensory capabilities such as tremorsense. A creature can
// attempt a DC 18 Will saving throw to ignore this effect. If an undead has reason to believe that Undetected opponents are present, it can still
// attempt to Seek or Strike you. If you attempt to use a vitality spell to damage undead, touch or damage an undead creature, or attack any
// creature while warded in this manner, the pendant's effects immediately end. An undead creature who observes you in this manner or one who
// succeeds at the Will save is immune to the corpseward pendant for 24 hours." PF2e keeps Undetected as one condition on its user, not by
// observer, so the ward is words on its user's Effect for the 10 minutes, ended by its attack or damage roll (PF2e's roll option
// "air-ends-on:attack", scripts/ends-on-hostile.js); its touch of an undead the GM's. The Will save is plan.again, a card kept for the 10 minutes
// for the undead its presser targets (only undead: ifTarget lacks), each success its 24 hours' immunity (trigger.immunity, the ability
// module's save card). Pure.

const WARD = /\bYou become undetectable to undead creatures for (\d+) minutes\. Undead can't see, hear, or smell you, or detect you with sensory capabilities such as tremorsense\. A creature can attempt a @Check\[will\|dc:(\d+)\] saving throw to ignore this effect\. If an undead has reason to believe that (?:@UUID\[[^\]]*\]\{Undetected\}|Undetected) opponents are present, it can still attempt to (?:@UUID\[[^\]]*\]\{Seek\}|Seek) or Strike you\. If you attempt to use a vitality spell to damage undead, touch or damage an undead creature, or attack any creature while warded in this manner, the pendant's effects immediately end\. An undead creature who observes you in this manner or one who succeeds at the Will save is immune to the corpseward pendant for (\d+) hours\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

// The undead's save: Will against its DC, a success's immunity for its hours.
export function wardSavePlan({ dc, hours, name, raw }) {
    return {
        source: { name: `${name}: seeing through the ward` },
        automation: { level: "automatic" },
        targeting: { target: "an undead the ward hides its wearer from", range: null, area: null },
        trigger: { event: "use", immunity: { scope: "target", raw, duration: { value: hours, unit: "hours" }, degrees: ["criticalSuccess", "success"], against: "all", slug: "corpseward-pendant" } },
        resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        ifTarget: [{ traits: ["undead"], lacks: true, immune: true }],
        notes: ["A success ignores the ward: the undead perceives its wearer as usual, and it's immune to the pendant for a day."]
    };
}

// The activation's plan (its whole text's note) and html → its user's Effect and the undead's save card after it, or the same plan.
export function withUndeadWard(plan, html) {
    const ward = WARD.exec(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!ward || !plan?.resolution?.outcomes?.success || plan.resolution.check?.roll !== "automatic") return plan;
    const [minutes, dc, hours] = ward.slice(1, 4).map(Number);
    const duration = { mode: "fixed", value: minutes, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
    const note = {
        label: "Warded from undead",
        text: "Undetected by undead: they can't see, hear or smell its wearer, nor sense it any other way (tremorsense too), though one that thinks Undetected foes are near can still Seek or Strike it. It ends at once if its wearer attacks any creature, touches or damages an undead, or damages undead with a vitality spell (its attack and damage rolls end it; a touch by hand). An undead that observes it so is immune to the pendant for a day.",
        duration,
        rules: [{ key: "RollOption", option: "air-ends-on:attack" }]
    };
    const { noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        resolution: { ...plan.resolution, outcomes: { success: { ...plan.resolution.outcomes.success, noteEffects: [note] } } },
        again: { plan: wardSavePlan({ dc, hours, name: String(plan.source?.name ?? "Corpseward Pendant"), raw: ward[0].slice(ward[0].lastIndexOf("An undead creature who observes")) }), later: true, repeat: true, time: { value: minutes, unit: "minutes" } }
    };
}
