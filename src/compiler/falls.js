// A fall an item eases, through PF2e Automatic Environment Resolution (2026-10-26, its session's contract: core a05e18c, environment
// c434cc6): an Effect on the creature flagged `flags["pf2e-automatic-environment-resolution"].fall = { shorter?, noDamage?, source }`, read
// as the environment module rolls a creature's falling damage (the largest shorter comes off, any noDamage means none). The item card's
// Effect for an activation or a consumable — Tumbler's Belt's "Treat your fall as if it were 120 feet shorter" (a reaction: a round),
// Aerial Cloak's 30 feet, Jade Cat's "For 1 minute after you activate the cat, you treat all falls as 20 feet shorter", Dragonaut's
// Wingsuit's "Your fall slows to 60 feet per round for 1 minute, and if you reach the ground during this time you take no damage from the
// fall" (no damage, a minute) — and, for an item worn with it always on, scripts/falls.js's api.fallEases (Gliding Membranes' "Treat
// falls as 25 feet shorter", Angelic Opera Cloak's "never take falling damage"). What else a sentence says stays a note. Pure.

export const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";
const WORDS = { one: 1, a: 1, an: 1 };
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
export const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

const SHORTER = /\b(?:you )?treat (?:your fall|all falls|falls) as (?:if it were )?(\d+) feet shorter\b/i;
// (And PF2e's Gentle Landing, no falling damage: Cape of the Open Sky's "whenever you fall while wearing the cape …, the cape automatically
// casts Gentle Landing on you", Soft-Landing's "You gain the effects of Gentle Landing for 1 minute".)
const NO_DAMAGE = /\b(?:you take no damage from the fall|never take falling damage|whenever you fall\b[^.]*?\bcasts? Gentle Landing on you|You gain the effects of Gentle Landing)\b/i;
// (Tumbler's Belt's "Regardless of whether you take damage or not from the fall, you land on your feet": landsOnFeet, no Prone — the
// environment module's, 2026-10-26.)
const ON_FEET = /\bRegardless of whether you take damage or not from the fall, you land on your feet\b/i;
const FOR = /\b[Ff]or (\d+|one|an?) (round|minute|hour)s?\b/;

// The text → { shorter?, noDamage?, said: [sentences], duration? } or null. duration: the sentence's "For 1 minute …", else a reaction's round.
export function readFall(text, { reaction = false } = {}) {
    const said = [];
    let shorter = null;
    let noDamage = false;
    let duration = null;
    let onFeet = false;
    for (const sentence of SENTENCES(text)) {
        if (ON_FEET.test(sentence)) {
            onFeet = true;
            said.push(sentence);
            continue;
        }
        const short = SHORTER.exec(sentence);
        const none = NO_DAMAGE.test(sentence);
        if (!short && !none) continue;
        if (short) shorter = Math.max(shorter ?? 0, Number(short[1]));
        if (none) noDamage = true;
        said.push(sentence);
        const time = FOR.exec(sentence);
        if (time && !duration) duration = { mode: "fixed", value: WORDS[time[1].toLowerCase()] ?? Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start" };
    }
    if (!shorter && !noDamage) return null;
    return { ...(shorter ? { shorter } : {}), ...(noDamage ? { noDamage: true } : {}), ...(onFeet ? { landsOnFeet: true } : {}), said, duration: duration ?? (reaction ? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } : null) };
}

// The fall in words: "Its falls count as 120 feet shorter; it lands on its feet", "It takes no damage from a fall".
export function fallText(fall) {
    const parts = [fall.noDamage ? "it takes no damage from a fall" : null, fall.shorter && !fall.noDamage ? `its falls count as ${fall.shorter} feet shorter` : null, fall.landsOnFeet ? "it lands on its feet" : null].filter(Boolean);
    const words = parts.join("; ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// (A sentence that says only the fall: no longer a note. One that says more, Jade Cat's Balance and terrain, stays one.)
const MORE = /\b(?:Off-Guard|Balance|difficult terrain|glide|space|bonus|penalty|check|Speed|slows?)\b/i;
const onlyFall = (sentence) => !MORE.test(sentence.replace(SHORTER, " ").replace(NO_DAMAGE, " ").replace(FOR, " "));
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|damage|condition|Off-Guard|terrain|space|feet)\b/i;

// The plan (or none), the activation's (or consumable's) html, its base → the plan with plan.fall, the item card's Effect for the
// environment module; one with nothing read becomes its own card.
export function withFalls(plan, html, base) {
    const text = plainOf(html);
    const reaction = /\bTrigger (?:You're|You are) falling\b|\bTrigger You (?:begin to )?fall\b/i.test(text);
    const read = readFall(text.replace(/^.*?\bEffect\b\s*/s, ""), { reaction });
    if (!read || plan?.fall || plan?.builtin && plan.builtin !== "no-effect") return plan;
    const { said: sentences, ...fall } = read;
    const kept = sentences.filter((sentence) => !onlyFall(sentence));
    const gone = (entry) => sentences.some((sentence) => onlyFall(sentence) && (said(entry).includes(sentence.replace(/\.$/, "")) || sentence.includes(said(entry).replace(/\.$/, ""))));
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    if (empty) {
        const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
        const notes = [...SENTENCES(body).filter((sentence) => !sentences.includes(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence)), ...kept];
        return { ...base, builtin: undefined, noteOnly: undefined, automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, fall, ...(notes.length ? { notes, partial: true } : {}) };
    }
    const notes = (plan.notes ?? []).filter((entry) => !gone(entry));
    const unread = (plan.unread ?? []).filter((entry) => !gone(entry));
    const next = { ...plan, fall, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread } : {}) };
    if (next.partial && !notes.length && !unread.length && !Object.values(next.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// An item's passive text (before its activations) → its fall when worn: { shorter?, noDamage? } or null.
export function passiveFallOf(text) {
    const passive = String(text ?? "").split(/\bActivat(?:e|ion)\b/)[0];
    const read = readFall(passive);
    return read ? { ...(read.shorter ? { shorter: read.shorter } : {}), ...(read.noDamage ? { noDamage: true } : {}) } : null;
}
