// A benefit for a while, then a temporary immunity to the item (2026-10-27, docs/needs.md "Immunities and resistances by situation"): what
// the immunity tracker (src/compiler/immunity.js, scripts/immunity.js) didn't hold to, as these items were note-only or a note:
// - Spiced Demonade: "you ignore all effects and penalties from the consumption of alcohol and lack of sleep for 1 hour. These effects resume
//   when the spiced demonade wears off, and you become temporarily immune to spiced demonade for 24 hours." Words on its drinker's Effect for
//   the hour (no PF2e rule tells a fatigue from lack of sleep from another), and item.immunity from its use for the hour and the 24 after.
// - Shell of Easy Breathing's Fill the Shell: "a creature can submerge its head … as a 3-action activity. For the next hour, the creature can
//   breathe underwater. The creature is then temporarily immune to shells of easy breathing until the next time it makes its daily
//   preparations." The creatures its user targets get "Can breathe underwater" for the hour (8 for the Greater; item.ruleEffects, as Submersible Helmet's) and
//   the immunity to its next daily preparations; filling the shell and keeping it still are lines of the card.
// - Scholar's Drop's Secondary Effect: "Ignore the effects of the fatigued condition for 10 minutes. The drop's other effects end for you, and
//   when the 10 minutes are up, you're temporarily immune to scholar's drops for 1 hour." The ways card's second way: Fatigued's penalties
//   suppressed for 10 minutes (item.suppress, as Ring of the Weary Traveler's), the immunity from then for 70 minutes; its first use's bonus
//   ended and its three uses in a day lines of its card.
// - Journeybread (Power)'s "If you subsist on nothing else for a week, you become temporarily immune to journeybread until you eat real food and
//   drink water normally for 24 hours": a week of meals at the table, the GM's to keep — a line of its card, beside its PF2e Effect.
// Pure.

import { familySlug } from "./immunity.js";

const ALL = ["criticalSuccess", "success", "failure", "criticalFailure"];
const flat = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const time = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const immunityOf = (raw, name, duration, extra = {}) => ({ scope: "target", raw, duration, degrees: [...ALL], against: "all", slug: familySlug(name), ...extra });
const whole = (plan) => ({ ...plan, noteOnly: undefined, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } });

const DEMONADE = /\bAfter consuming [\w ]+?, you ignore all effects and penalties from the consumption of alcohol and lack of sleep for (\d+) hours?\. (These effects resume when the [\w ]+? wears off, and you become temporarily immune to [\w ]+? for (\d+) hours)\./i;

// A consumable's plan and the item → the plan with its time and immunity, or the same plan.
export function withSoberedImmunity(plan, item) {
    const read = DEMONADE.exec(flat(item?.system?.description?.value));
    const success = plan?.resolution?.outcomes?.success;
    if (!read || !success || !(success.noteEffects ?? []).some((note) => note.reminder)) return plan;
    const [, hours, raw, immune] = read;
    const note = { label: "Awake and sober", text: "You ignore all effects and penalties from the consumption of alcohol and from lack of sleep (a Fatigued from lack of sleep among them); they resume when this ends.", duration: time(Number(hours), "hours") };
    return {
        ...whole(plan),
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, noteEffects: [...success.noteEffects.filter((entry) => !entry.reminder), note] } } },
        // (From its use: the hour it lasts, then the 24 hours.)
        item: { ...plan.item, immunity: immunityOf(`${raw}.`, item.name, { value: Number(hours) + Number(immune), unit: "hours" }) }
    };
}

const SHELL = /\bWhile the shell is activated, a creature can submerge its head and let water and bubbles fill its nose and mouth \(or whatever body part it uses for breathing\) as a 3-action activity\. For the next (hour|(\d+) hours), the creature can breathe underwater\. (The creature is then temporarily immune to shells of easy breathing until the next time it makes its daily preparations)\.\s*$/i;
const FILL = /^You place the shell on a level surface and sprinkle a few drops of water into its basin\. The shell slowly fills with saltwater over the course of 1 minute\. The shell's magic then becomes active, indicated by a steady stream of bubbles\. Moving the shell disturbs its contents, causing the item to deactivate and the water inside to evaporate; otherwise, it remains activated for an unlimited duration\./i;

// An activation's plan, its html and the item → the plan for the creatures breathing from the shell, or the same plan.
export function withShellBreathing(plan, html, item) {
    const words = flat(html).replace(/^.*?\bEffect\b\s*/, "");
    const read = SHELL.exec(words);
    if (!read || !FILL.test(words) || !plan?.noteOnly) return plan;
    return {
        ...whole(plan),
        targeting: { target: "each creature breathing from the shell", range: null, area: null },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [
            "The shell fills over 1 minute, then stays active until it's moved (which ends it).",
            "Target each creature that submerges its head in the active shell (its own 3-action activity) and press Apply; for one that does later, use it again."
        ],
        item: { ...plan.item, recipient: "targets", ruleEffects: [{ name: "water breathing", words: "Can breathe underwater", rules: [], duration: time(Number(read[2] ?? 1), "hours") }], immunity: immunityOf(`${read[3]}.`, item.name, { value: 1, unit: "days" }, { daily: true }) }
    };
}

const SECONDARY = /^Secondary effect: Requirements You're fatigued Effect Ignore the effects of the fatigued condition for (\d+) minutes\. (The drop's other effects end for you), and (when the \d+ minutes are up, you're temporarily immune to scholar's drops for (\d+) hours?)\. (If you use this effect three times in a single day, you become temporarily immune to scholar's drops entirely until you get a full night's rest)\.$/;

// A consumable's plan and the item → the ways plan with its secondary effect, or the same plan.
export function withSecondaryFatigue(plan, item) {
    const note = (plan?.notes ?? []).find((entry) => SECONDARY.test(String(entry)));
    if (!note || plan.builtin) return plan;
    const [, minutes, ends, , hours, thrice] = SECONDARY.exec(note);
    const notes = plan.notes.filter((entry) => entry !== note);
    const use = { ...plan, notes: notes.length ? notes : undefined, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    const html = String(item?.system?.description?.value ?? "");
    const at = html.search(/<p>\s*<strong>\s*Secondary Effect\s*<\/strong>/i);
    const secondary = {
        ...use,
        source: { ...plan.source, name: `${plan.source.name}: Secondary Effect` },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [`${ends}: delete its bonus's Effect.`, `${thrice} (its user's to keep).`],
        item: { ...plan.item, suppress: [{ slug: "fatigued", selectors: ["ac", "saving-throw"], duration: time(Number(minutes), "minutes") }], immunity: immunityOf(`When the ${minutes} minutes are up, you're temporarily immune to scholar's drops for ${hours} hour${Number(hours) === 1 ? "" : "s"}.`, item.name, { value: Number(minutes) + 60 * Number(hours), unit: "minutes" }) }
    };
    return {
        ...use,
        builtin: "ways",
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        notes: undefined,
        ways: [
            { name: "Its use", html: at > 0 ? html.slice(0, at) : html, plan: use },
            { name: "Its secondary effect", html: at > 0 ? html.slice(at) : "", plan: secondary }
        ]
    };
}

const FOOD = /^If you subsist on nothing else for a week, you become temporarily immune to journeybread until you eat real food and drink water normally for 24 hours\.$/;

// A consumable's plan → the plan with its week of meals a line of its card, or the same plan.
export function withFoodImmunityLine(plan) {
    const line = (plan?.notes ?? []).find((entry) => FOOD.test(String(entry)));
    if (!line || !plan.partial) return plan;
    const left = (plan.unread ?? []).length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length) || plan.notes.some((entry) => entry !== line);
    return { ...plan, notes: plan.notes.map((entry) => (entry === line ? `${line.replace(/\.$/, "")} (the GM's to keep).` : entry)), ...(left ? {} : { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}
