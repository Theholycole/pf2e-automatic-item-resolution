// A Mythic Point an item's use can spend for more (the user's answer of 2026-10-19): Sorshen's Sinuous Guisarme's "If you use this activation
// and spend 1 Mythic Point, the save DC for the spell increases to DC 50", the day's breaths' "If you spend 1 Mythic Point, you don't need to
// breathe for 7 days", Vortex Pouch's and Paradigm Cube's bigger effects. The ways card's two buttons: "As it is", and "Spending a Mythic
// Point" — the same plan upgraded where the text says how (a cast's DC, the time it lasts), the upgrade's words a note otherwise, and its cost
// (plan.spend, src/compiler/spend.js). Pure.

const OPTIONAL = /[^.]*\bIf you (?:use this activation and )?spend (?:a|1|one) Mythic Point\b[^.]*\./gi;
const DC_TO = /\bthe save DC for the spell increases to DC (\d+)\b/i;
const BREATHE = /\bIf you spend (?:a|1|one) Mythic Point, you don't need to breathe for (\d+|a|one) (hours?|days?|years?)\b/i;
// (The general sentence the breaths' own number follows: "you inhale so deeply that you increase the effect's duration".)
const LONGER = /\byou increase the effect's duration\b/i;
const UNITS = { hour: ["hours", 1], day: ["days", 1], year: ["days", 365] };

const playable = (plan) => Boolean(plan) && !plan.noteOnly && plan.builtin !== "no-effect" && plan.builtin !== "ways" && !plan.spend && Boolean(plan.resolution || plan.builtin);

// Every set time in the plan the new one: its rows' Effects, modifiers and notes, and a linked Effect's own (its application's duration).
function retimed(value, to) {
    if (Array.isArray(value)) return value.map((entry) => retimed(entry, to));
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = key === "duration" && entry?.mode === "fixed" ? { ...to } : retimed(entry, to);
    if (value.kind === "native-spell-effect") out.duration = { ...to };
    return out;
}

// The plan, its activation's text (plain) and html → the ways plan, or the same plan.
export function withMythicUpgrade(plan, text, html = "") {
    const plain = String(text ?? "");
    const sentences = (plain.match(OPTIONAL) ?? []).map((sentence) => sentence.trim());
    if (!sentences.length || !playable(plan)) return plan;
    const said = (note) => sentences.some((sentence) => String(note).includes(sentence) || sentence.includes(String(note).trim()));
    const notes = (plan.notes ?? []).filter((note) => !said(note));
    const dc = plan.builtin === "cast-spell" ? DC_TO.exec(plain) : null;
    const breathe = BREATHE.exec(plain);
    // (A cast's DC, and its choices' own: Sorshen's Sinuous Guisarme's Charm and Subconscious Suggestion at DC 50.)
    let upgraded = { ...plan, ...(dc ? { dc: Number(dc[1]), ...(plan.choices ? { choices: plan.choices.map((choice) => (choice.dc ? { ...choice, dc: Number(dc[1]) } : choice)) } : {}) } : {}) };
    if (breathe) {
        const [unit, times] = UNITS[breathe[2].toLowerCase().replace(/s$/, "")];
        upgraded = retimed(upgraded, { mode: "fixed", value: (Number(breathe[1]) || 1) * times, unit, expiry: "turn-start", anchor: "effect-start" });
    }
    // (What the cost does that the plan doesn't: the card's notes.)
    const extra = sentences.filter((sentence) => !(dc && DC_TO.test(sentence)) && !(breathe && (BREATHE.test(sentence) || LONGER.test(sentence))));
    upgraded = { ...upgraded, spend: { mythicPoints: 1 }, notes: [...extra, ...notes].length ? [...extra, ...notes] : undefined };
    const base = { ...plan, notes: notes.length ? notes : undefined };
    const { resolution, spell, choices, dc: ownDC, attack, reroll, strike, teleport, take, table, scaled, damageChoices, ...rest } = plan;
    return {
        ...rest,
        notes: undefined,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(plan.trigger?.frequency ? { frequency: plan.trigger.frequency } : {}) },
        ways: [{ name: "As it is", html: String(html ?? ""), plan: base }, { name: "Spending a Mythic Point", html: String(html ?? ""), plan: upgraded }],
        once: true
    };
}
