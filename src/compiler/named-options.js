// An activation whose Effect offers named options to choose from (2026-10-26, docs/needs.md "Choices on the card"): Heart of Sarnax's Two Hearts
// as One, "Choose one of the following effects to apply to the targeted creature" (Bestow Vim, Crush Heart and its degrees), Tactician's
// Helm's "you choose one of the following effects" (Charge!, Move It!, Protect!, Re-Arm!). Before, only one option was read and the others were
// dropped, the plan whole all the same. Each option is now read as the activation would be with that option for its Effect: the Effect's
// words before the choice, then the option's, with its own degree rows. The plan is the ways card's builtin "ways", a button for each option;
// it's partial when an option is. An option that is only its user's own moves and basic actions (Charge!'s "Stride twice") is a line of the
// card. Pure.

const CHOOSE = /\s*(?:,?\s*and )?(?:you )?(?:Choose|choose) one of the following (?:effects|options)\b[^.]*\.?\s*$/;
const OPTION = /<(li|p)>\s*<strong>([^<]{2,40}?)<\/strong>([\s\S]*?)<\/\1>/g;
const NOT_OPTION = /^(?:Critical Success|Success|Failure|Critical Failure|Activate|Frequency|Trigger|Requirements|Effect|Destruction|Craft Requirements|Special)\b/;
const ROW = /<p>\s*<strong>(?:Critical Success|Success|Failure|Critical Failure)<\/strong>[\s\S]*?<\/p>/g;
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The user's own moves and basic actions, nothing else: "Stride twice.", "If you're wielding a shield, Stride to a space adjacent to an ally,
// then Raise your Shield.", "Interact up to three times. Each of these actions must be used to do something listed under Interact."
const OWN_ACTION = /^(?:If you're wielding a (?:shield|weapon), )?(?:Stride|Step|Interact|Take Cover|Raise your Shield|Seek)\b[^.]*\.$|^Each of these actions must be used to do something listed under (?:Interact|Stride)\.$/i;
const ownActionsOnly = (text) => {
    const sentences = plainOf(text).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    return sentences.length > 0 && sentences.every((sentence) => OWN_ACTION.test(sentence));
};
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const plays = (plan) => Boolean(plan) && !plan.noteOnly && plan.builtin !== "no-effect" && plan.builtin !== "ways";

// The activation's html → [{ name, html }]: each option's own activation html, or null when it offers none.
export function namedOptions(html) {
    const text = String(html ?? "");
    const effect = /<p>\s*<strong>Effect<\/strong>([\s\S]*?)<\/p>/.exec(text);
    if (!effect || !CHOOSE.test(effect[1].replace(/<[^>]+>/g, " ").trimEnd())) return null;
    const head = text.slice(0, effect.index).replace(/<hr\s*\/?>/g, "");
    const intro = effect[1].trimEnd().replace(/<[^>]+>\s*$/, "").replace(CHOOSE, "").replace(/,\s*$/, ".").trim();
    const rest = text.slice(effect.index + effect[0].length);
    const options = [...rest.matchAll(OPTION)].filter((match) => !NOT_OPTION.test(match[2].trim()));
    if (options.length < 2) return null;
    return options.map((match, index) => {
        // (Its degree rows: those after it, before the next option.)
        const after = rest.slice(match.index + match[0].length, index + 1 < options.length ? options[index + 1].index : undefined);
        const rows = (after.match(ROW) ?? []).join("");
        const name = match[2].trim().replace(/[:.]$/, "");
        // (Its own traits, Crush Heart's "(death)": the way's plan's too.)
        const traits = /^\(([a-z, -]+)\)/i.exec(match[3].trim())?.[1].split(/,\s*/).map((trait) => trait.trim().toLowerCase()).filter(Boolean) ?? [];
        const own = match[3].trim().replace(/^\([^)]*\)\s*/, "");
        return { name, text: own, traits, html: `${head}<p><strong>Effect</strong> ${intro ? `${intro.replace(/\.?$/, ".")} ` : ""}${own}</p>${rows}` };
    });
}

// The options' plans (compiled from each option's html) and the activation's base → the ways plan, or null.
export function namedOptionsPlan(options, plans, base) {
    if (!options?.length || options.length !== plans.length) return null;
    const ways = options.map((option, index) => {
        const plan = plans[index];
        if (plays(plan)) return { name: option.name, html: option.html, plan: option.traits?.length ? { ...plan, traits: [...new Set([...(plan.traits ?? []), ...option.traits])] } : plan };
        // (Its user's own moves and actions: a line of the card.)
        if (ownActionsOnly(option.text)) return { name: option.name, html: option.html, plan: { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [`${plainOf(option.text).replace(/\.$/, "")} (its own actions).`] } };
        return { name: option.name, html: option.html, plan: plan ?? { ...base, noteOnly: true, notes: [plainOf(option.text)] }, unplayed: true };
    });
    const partial = ways.some((way) => way.unplayed || way.plan.partial || way.plan.noteOnly);
    return {
        ...base,
        builtin: "ways",
        automation: { level: partial ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        ways: ways.map(({ unplayed, ...way }) => way),
        once: true,
        ...(partial ? { partial: true } : {})
    };
}
