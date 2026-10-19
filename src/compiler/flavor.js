// An Effect's opening flavor, which keeps the ability compiler from the rest of it: Suit of False Impression's "You strike
// an intimidating pose that causes enemies to fear your supposedly heavily armored form. Each foe in a 15-foot emanation …
// must attempt a DC 22 Will saving throw …". The compilers try once more without it (src/compiler/index.js,
// src/compiler/permanent.js), keeping only a resolution read that way. Flavor is a first sentence with no link, no number
// and no word a rule uses ("the next living target struck by the dagger" is one), with more of the paragraph after it. Pure.

const RULE_WORDS = /\b(?:saves?|saving throws?|DC|damage|bonus|penalty|checks?|Strikes?|Hit Points|HP|conditions?|resistance|weakness|immun\w*|Speeds?|AC|actions?|reactions?|spells?|[Cc]ast(?:s|ing)?|teleport\w*|Stride|Step|Fly|Leap|Burrow|Climb|Swim|Interact|Sustain|Dismiss|rounds?|turns?|minutes?|hours?|days?|feet|foot|invisible|hidden|concealed|next|targets?|struck|hits?)\b/;

// The html with its Effect's first sentence left out when that's flavor, else as it was.
export function withoutFlavor(html) {
    const text = String(html ?? "");
    const effect = /<strong>\s*Effect\s*<\/strong>\s*/i.exec(text);
    if (!effect) return text;
    const start = effect.index + effect[0].length;
    const paragraphEnd = text.indexOf("</p>", start);
    const rest = text.slice(start, paragraphEnd < 0 ? text.length : paragraphEnd);
    const sentence = /^[^.!?]*[.!?](?=\s+\S)/.exec(rest);
    if (!sentence) return text;
    const plain = sentence[0].replace(/<[^>]+>/g, "");
    if (/@|\d/.test(sentence[0]) || RULE_WORDS.test(plain)) return text;
    return `${text.slice(0, start)}${rest.slice(sentence[0].length).trimStart()}${text.slice(start + rest.length)}`;
}

// That flavor sentence as the plan's notes give it, plain ("A gust swirls around you."), or null.
export function flavorSentence(html) {
    const text = String(html ?? "");
    if (withoutFlavor(text) === text) return null;
    const effect = /<strong>\s*Effect\s*<\/strong>\s*/i.exec(text);
    const rest = text.slice(effect.index + effect[0].length);
    return /^[^.!?]*[.!?]/.exec(rest)[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// The partial plan without that flavor among what it leaves the GM — its notes, unread sentences, a row's words ("{target}: …") — and no
// longer partial when that was all it left: a third-party blade's crit reaction, its damage, Slowed and allies' save read, its opening
// line a note. Pure.
// (Only a partial plan's: a card that's the GM's anyway, or a builtin's, keeps its words whole — its first line may be all it says.)
export function withoutFlavorNotes(plan, html) {
    const flavor = plan?.partial ? flavorSentence(html) : null;
    if (!plan || !flavor) return plan;
    const said = (entry) => String(entry ?? "").replace(/^\{target\}:\s*/, "").replace(/\s*\(by hand\)\.?$/, "").replace(/\s+/g, " ").trim().replace(/\.?$/, ".") === flavor.replace(/\.?$/, ".");
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !said(entry)) : list);
    const outcomes = plan.resolution?.outcomes ? Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: kept(row.manualInstructions) } : row])) : null;
    const next = {
        ...plan,
        ...(plan.notes ? { notes: kept(plan.notes) } : {}),
        ...(plan.unread ? { unread: kept(plan.unread) } : {}),
        ...(plan.strike?.notes ? { strike: { ...plan.strike, notes: kept(plan.strike.notes) } } : {}),
        ...(outcomes ? { resolution: { ...plan.resolution, outcomes } } : {})
    };
    if (JSON.stringify(next) === JSON.stringify(plan)) return plan;
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...(next.strike?.notes ?? []), ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? []), ...(next.resolution?.reminders ?? [])];
    if (!next.notes?.length) delete next.notes;
    if (Array.isArray(next.unread) && !next.unread.length) delete next.unread;
    if (next.partial && !left.length) {
        delete next.partial;
        if (next.automation?.level === "guided") next.automation = { ...next.automation, level: "automatic" };
    }
    return next;
}

// An Effect's later part that waits for something — Thunder Mail's "Additionally, for the next minute, whenever a creature touches
// you or hits you with a melee unarmed attack …, it takes 1d8 electricity damage" — which keeps the ability compiler from what it
// does now: { html without those sentences, notes: [their words] }, or null when there are none. The compilers try once more
// without them, keeping them as the plan's notes.
const LATER = /(?:^|(?<=[.!?]\s))(?:Additionally, |In addition, |Also, )?(?:for the next (?:minute|hour|\d+ rounds?|round)(?: after (?:that|this))?, |until the end of your next turn, )?whenever\b[^.]*\.\s*/gi;
export function withoutLater(html) {
    const text = String(html ?? "");
    const effect = /<strong>\s*Effect\s*<\/strong>\s*/i.exec(text);
    if (!effect) return null;
    const start = effect.index + effect[0].length;
    const end = text.indexOf("</p>", start);
    const body = text.slice(start, end < 0 ? text.length : end);
    const notes = [];
    const kept = body.replace(LATER, (sentence) => {
        notes.push(sentence.replace(/<[^>]+>/g, "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@Damage\[\(?([^\[\]|)]+)\)?\[(\w+)\][^\]]*\]/g, "$1 $2").trim());
        return "";
    }).trim();
    if (!notes.length || !kept) return null;
    return { html: `${text.slice(0, start)}${kept}${text.slice(start + body.length)}`, notes };
}
