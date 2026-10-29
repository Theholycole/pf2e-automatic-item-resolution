// An item used one of two ways its activation switches between, held or worn (2026-10-28, docs/needs.md "situational"): Pham Lê Ngọc's
// Sightglasses, opened and held to the eye or closed and worn. → the item module's builtin "ways" (scripts/ways.js, once: one pick a use),
// each way an item card whose Effect on its user takes the place of the other's (plan.item.ruleEffects, replaces "sightglass": scripts/
// until-rest.js replacedBy):
// - held: reading written Draconic through it — words on the Effect (a language's meaning, the GM's to tell: codes and metaphor not), no
//   investiture needed;
// - worn: its item bonus to Society checks in the place it names (PF2e's FlatModifier behind a toggle of its Effect, the place the
//   user's to say) and to that place's Lore checks (the Lore's own selector).
// Its look is flavor. Pure.

import { plainText } from "./rows.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const slug = (words) => String(words).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SWITCH = /^\s*Activate\s+(?:\[\w+\]\s*)?(?:\(manipulate\)\s*)?You either open the device\s+and hold it up\s+to your eye\s+or you close\s+the device and wear it\.\s*The effect of the item\s+changes depending on your usage\.\s*Held\s+(.+?)\s+Worn\s+(.+)$/s;
const READS = /^You can understand the meaning\s+of ([A-Z][a-z]+) as a written language\s+when you read it through the [\w ]+?\.\s+This effect doesn(?:'|’)t let you understand\s+codes, language couched in metaphor,\s+and the like \(subject to\s+GM discretion\)\.\s+You don(?:'|’)t need investiture to\s+use this effect\.$/;
const BONUS = /^You gain an? \+(\d+) (item|circumstance|status) bonus to (\w+) checks\s+while within ([A-Z][\w ]+?) as well as all\s+\4 Lore checks\.$/;

export function withHeldOrWorn(plan, { kind, entry, base, info, item }) {
    if (kind !== "activation" || (plan && !plan.noteOnly && plan.builtin !== "no-effect")) return plan;
    const own = plainText(entry?.activation?.html ?? "").trim();
    const whole = plainText(item?.system?.description?.value ?? "");
    const found = SWITCH.exec(own) ?? SWITCH.exec(whole.slice(whole.search(/\bActivate\b/)));
    if (!found) return plan;
    const reads = READS.exec(found[1].trim());
    const bonus = BONUS.exec(found[2].trim());
    if (!reads || !bonus) return plan;
    const [, value, type, skill, place] = bonus;
    const option = `sightglass:in-${slug(place)}`;
    const card = (ruleEffect) => ({ ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, item: { ...(info ?? {}), recipient: "user", ruleEffects: [{ ...ruleEffect, duration: null, replaces: "sightglass" }] } });
    const held = card({ name: "Sightglass held", words: `Reading through the sightglass, its user understands written ${reads[1]} (not codes or metaphor and the like: the GM's call). It works without investiture.`, rules: [] });
    const worn = card({
        name: "Sightglass worn",
        words: `+${value} ${type} bonus to ${skill} checks while in ${place} (its toggle) and to ${place} Lore checks.`,
        rules: [
            { key: "RollOption", domain: "all", option, toggleable: true, label: `In ${place}` },
            { key: "FlatModifier", selector: skill.toLowerCase(), type, value: Number(value), predicate: [option] },
            { key: "FlatModifier", selector: `${slug(place)}-lore`, type, value: Number(value) }
        ]
    });
    return {
        ...base,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan?.trigger ?? base?.trigger ?? {}), event: "use" },
        ways: [
            { name: "Held: open, at the eye", html: `<p>${found[1].trim()}</p>`, plan: held },
            { name: "Worn: closed", html: `<p>${found[2].trim()}</p>`, plan: worn }
        ],
        once: true,
        item: { ...(info ?? {}) }
    };
}
