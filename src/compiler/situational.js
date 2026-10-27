// Bonuses only in some situations (2026-10-27, docs/needs.md "Bonuses only in some situations"): a bonus to checks PF2e can't tell apart from
// the rest — Eidetic Potion's "+2 status bonus to create representations of that memory, whether using Crafting to create an artistic rendition
// or Society to create a Forgery", Fake Blood Pack's "When faking an injury, a punctured blood pack grants a +2 item bonus to relevant Deception
// checks", Empath's Cordial's "Perception check with a +2 item bonus … to discern that information", Restful Sleep Fulu's "+2 status bonus to
// saves against mental effects that occur in your dreams". PF2e's own rules on the item's note Effect for its time: a toggle for the situation
// (a RollOption its user switches on, domain all, as Red Rose's "Beloved within 10 feet") and the FlatModifier predicated on it, or on PF2e's
// own roll options where it has them (action:sense-motive, item:trait:mental). A bonus that lasts "until you benefit from the bonus … for the
// first time" is removed after that roll (removeAfterRoll "if-enabled"). The item's other words — what it senses, its memory, its rest — on
// the same Effect; what its user does to use it (puncture the pack) a line of the card. In place of the reminder of the whole text. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const flat = (html) => String(html ?? "").replace(/@Check\[[^\]]*dc:(\d+)[^\]]*\]/g, "DC $1 flat check").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const time = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
const bonus = (selector, type, value, predicate, once = false) => ({ key: "FlatModifier", selector, type, value, predicate, ...(once ? { removeAfterRoll: "if-enabled" } : {}) });

// Each item's reading: its sentences (all of its text after its Activate line, its flavor first), what its note Effect says and its rules.
const READINGS = [
    {
        // Eidetic Potion: the memory locked for a week or its bonus's first use.
        test: /^Bright pink, pale lavender, and vibrant orange colors swirl through this purplish liquid, making the eidetic potion resemble an unforgettable sunset\. When you drink this potion, for 1 round, anything you observe becomes locked into your memory\. You can recall the memory perfectly and gain a \+2 status bonus to create representations of that memory, whether using Crafting to create an artistic rendition or Society to create a Forgery\. The memory remains locked for 1 week or until you benefit from the bonus it imparts for the first time, whichever comes first; afterward, it becomes a normal, fallible memory\. You can only have a single memory locked in your mind at a time\. Using this potion while you have a locked memory from a previous use makes the previously locked memory fallible but allows you to lock a new memory\.$/,
        note: () => ({
            label: "Locked memory",
            text: "What you observed in the round after drinking is locked into your memory, and you recall it perfectly. +2 status bonus to Crafting checks to create an artistic rendition of that memory and to Society checks to create a Forgery of it (its toggle on for those): after the first such check, or after 1 week, it's a normal, fallible memory (this Effect gone). Only one memory is locked at a time: a new dose's replaces this one (delete this Effect then).",
            duration: time(7, "days"),
            rules: [toggle("eidetic-potion-memory", "Representing the locked memory"), bonus("crafting", "status", 2, ["eidetic-potion-memory"], true), bonus("society", "status", 2, ["eidetic-potion-memory"], true)]
        })
    },
    {
        // Empath's Cordial: emotions sensed within 30 feet for an hour.
        test: /^The pale liquid of empath's cordial changes color to reflect the mood of the creature nearest to it—turning blue for calm, red for anger, and green for envious, among other hues\. For 1 hour after you drink this potion, you can sense the presence of general emotions, such as hostility toward you or the presence of an emotion effect impacting a creature's emotions, within 30 feet\. A creature that failed a saving throw against Calm can't be detected\. This potion doesn't allow you to automatically tell what emotions a specific creature is experiencing, but you can attempt a Perception check with a \+2 item bonus \(DC set by the GM\) to discern that information\. The potion also grants you a \+1 item bonus to Perception checks to Sense Motive against creatures whose emotions you can sense\.$/,
        note: () => ({
            label: "Sensing emotions",
            text: "You sense the presence of general emotions within 30 feet, such as hostility toward you or an emotion effect on a creature, but not a creature that failed a saving throw against Calm. To tell what emotions a creature is feeling, attempt a Perception check with a +2 item bonus (its toggle on for it) at a DC the GM sets. +1 item bonus to Perception checks to Sense Motive against creatures within 30 feet whose emotions you sense.",
            duration: time(1, "hours"),
            rules: [toggle("empaths-cordial-discern", "Discerning a creature's emotions"), bonus("perception", "item", 2, ["empaths-cordial-discern"]), bonus("perception", "item", 1, ["action:sense-motive"])]
        })
    },
    {
        // Fake Blood Pack: once punctured, 4 hours of a faked injury.
        test: /^Adventurers have found a number of uses for these animal blood–filled bladders, which were originally used in theatrical productions\. Whenever you take slashing or piercing damage with the fake blood pack under your clothes or armor, roll a DC 11 flat check\. On a success, the blood pack is punctured\. You or an ally can puncture the hidden pack intentionally with an Interact action\. When faking an injury, a punctured blood pack grants a \+2 item bonus to relevant Deception checks, such as to Lie about being injured, for 4 hours after the pack has been punctured or until the blood is washed off, whichever comes first\. Abilities that trigger when a creature deals bleed damage, that determine if a creature is bleeding, or are otherwise based on bleed damage don't trigger or apply for blood from a fake blood pack, which might mean creatures with such abilities automatically realize the ruse\.$/,
        line: "Use it once the pack is punctured: by an Interact action (its wearer's or an ally's), or by a successful DC 11 flat check when its wearer takes slashing or piercing damage with it under their clothes or armor (their own roll).",
        note: () => ({
            label: "Fake blood",
            text: "When faking an injury, +2 item bonus to relevant Deception checks, such as to Lie about being injured (its toggle on for those), until the blood is washed off (delete this Effect then). Abilities that trigger on bleed damage, tell whether a creature is bleeding or are otherwise based on bleed damage don't apply to this blood, which might mean creatures with them realize the ruse.",
            duration: time(4, "hours"),
            rules: [toggle("fake-blood-pack-faking", "Faking an injury"), bonus("deception", "item", 2, ["fake-blood-pack-faking"])]
        })
    },
    {
        // Restful Sleep Fulu: sleep within its hour.
        test: /^This fulu depicts the five-spoke wheel of Qi Zhong, god of magic and medicine, and burns away slowly, like incense\. If you fall asleep within the fulu's duration, you regain double the amount of Hit Points you usually gain from resting\. You also gain a \+2 status bonus to saves against mental effects that occur in your dreams, such as the Nightmare spell\.$/,
        note: () => ({
            label: "Restful sleep",
            text: "If you fall asleep within the hour, you regain double the Hit Points you usually gain from resting (that rest's healing again after Rest for the Night). +2 status bonus to saves against mental effects that occur in your dreams, such as Nightmare (its toggle on for those).",
            duration: time(1, "hours"),
            rules: [toggle("restful-sleep-fulu-dreams", "A mental effect in its dreams"), bonus("saving-throw", "status", 2, ["restful-sleep-fulu-dreams", "item:trait:mental"])]
        })
    }
];

// Its text after its Activate (or Usage, Duration) lines: what the readings match.
const body = (html) => flat(html).replace(/^(?:Usage [^]*?(?=Activate))?Activate\s*(?:[123]|[ARFf])?\s*(?:\([^)]*\))?\s*(?:Duration \d+ (?:minutes?|hours?)\s*)?/, "").trim();

// The plan and the item → the plan with its situation's Effect, or the same plan.
export function withSituational(plan, item) {
    const success = plan?.resolution?.outcomes?.success;
    if (!success || !(success.noteEffects ?? []).some((note) => note.reminder)) return plan;
    const words = body(item?.system?.description?.value);
    const reading = READINGS.find((entry) => entry.test.test(words));
    if (!reading) return plan;
    return {
        ...plan,
        noteOnly: undefined,
        partial: undefined,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        ...(reading.line ? { notes: [...(plan.notes ?? []), reading.line] } : {}),
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, noteEffects: [...success.noteEffects.filter((entry) => !entry.reminder), reading.note()] } } }
    };
}

// (Oozepick's lock: item-data.js's "The bonus is only against the mechanism the ooze was first poured into, where the ooze counts as thieves'
// tools" — an object on the map, its user's to keep to: a line of the card, the plan whole beside it.)
const MECHANISM = /^The bonus is only against the mechanism the ooze was first poured into, where the ooze counts as thieves' tools\.$/;
export function withMechanismLine(plan) {
    const line = (plan?.unread ?? []).find((entry) => MECHANISM.test(said(entry)));
    if (!line) return plan;
    const unread = plan.unread.filter((entry) => entry !== line);
    const left = unread.length || (plan.notes ?? []).length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    const { unread: _, ...rest } = plan;
    const outcomes = left ? plan.resolution?.outcomes : Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((note) => !note.reminder) } : row]));
    return { ...rest, ...(unread.length ? { unread } : {}), notes: [...(plan.notes ?? []), said(line)], ...(outcomes ? { resolution: { ...plan.resolution, outcomes } } : {}), ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// (Rhyton of the Radiant Ifrit's Toast!, "You raise a toast to a creature or creatures you're about to socialize with. You gain a +2 item bonus
// to Deception, Diplomacy, or Intimidation checks against those creatures for 1 hour" — item-data.js's "The bonus is only against the
// creatures you toasted": the creatures its user targets marked, as marked.js's one creature is — PF2e's TokenMark at each of their tokens,
// item.mark { several } — and its bonuses predicated on the mark.)
const TOASTED = /^The bonus is only against the creatures you toasted\.$/;
const slugOf = (item) => String(item?.system?.slug || item?.name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function withToastedMarks(plan, item) {
    const line = (plan?.unread ?? []).find((entry) => TOASTED.test(said(entry)));
    const success = plan?.resolution?.outcomes?.success;
    if (!line || !success?.modifiers?.length || plan.item?.mark) return plan;
    const slug = `${slugOf(item)}-toast`;
    const modifiers = success.modifiers.map((modifier) => ({ ...modifier, predicate: [...(modifier.predicate ?? []), `target:mark:${slug}`] }));
    const unread = plan.unread.filter((entry) => entry !== line);
    const left = unread.length || (plan.notes ?? []).length || Object.values(plan.resolution.outcomes).some((row) => (row?.manualInstructions ?? []).length);
    // (Its reminder of the whole text gone once nothing is left unread, as src/compiler/honest.js's.)
    const noteEffects = left ? success.noteEffects : (success.noteEffects ?? []).filter((note) => !note.reminder);
    const { unread: _, ...rest } = plan;
    return {
        ...rest,
        ...(unread.length ? { unread } : {}),
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, modifiers, noteEffects } } },
        item: { ...plan.item, recipient: "user", mark: { slug, duration: modifiers.find((modifier) => modifier.duration?.mode === "fixed")?.duration ?? null, several: true } },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
