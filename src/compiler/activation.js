// An item's "Activate" lines: how many actions each takes, its traits and its
// name when it has one ("Activate—Tea Ceremony 10 minutes (concentrate,
// manipulate)"). Pure.

// PF2e's action glyphs: 1/A one action, 2/D two, 3/T three, R reaction, F free.
const GLYPHS = { 1: "1", a: "1", 2: "2", d: "2", 3: "3", t: "3", r: "reaction", f: "free" };

const ACTIVATE = /<strong>\s*Activat(?:e|ion)\s*(?:[—–-]\s*([^<]*?))?\s*<\/strong>([\s\S]*?)(?=<\/p>|<br\s*\/?>|<hr|<strong>|$)/gi;

const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function readOne(name, rest) {
    const glyph = /<span class="action-glyph">\s*([^<\s]+)\s*<\/span>/i.exec(rest)?.[1]?.toLowerCase();
    const text = plain(rest.replace(/<span class="action-glyph">[^<]*<\/span>/gi, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1"));
    const traits = /\(([^)]*)\)/.exec(text)?.[1]?.split(",").map((trait) => trait.trim().toLowerCase()).filter(Boolean) ?? [];
    let time = GLYPHS[glyph] ?? null;
    if (!time) time = /^(\d+\s+(?:minutes?|hours?|rounds?|days?))\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
    // "Activate Cast a Spell": the spell's own actions (the spell module's).
    if (!time && /^Cast a Spell\b/i.test(text)) time = "cast";
    // "Activate (manipulate) …" with the glyph in the name ("Activate—Drink [1]").
    const named = name ? plain(name) : null;
    return { name: named || null, time, traits, raw: plain(`Activate${named ? `—${named}` : ""} ${glyph ? `[${glyph}] ` : ""}${text}`).slice(0, 160) };
}

// Every activation, in order; [] when the item has none (most snares, talismans with only a trigger).
export function readActivations(html) {
    return [...String(html ?? "").matchAll(ACTIVATE)].map((match) => readOne(match[1], match[2]));
}

// The ability-compiler action type for an activation time.
export function actionTypeOf(time) {
    if (time === "reaction") return { actionType: "reaction", actions: null };
    if (time === "free") return { actionType: "free", actions: null };
    if (["1", "2", "3"].includes(time)) return { actionType: "action", actions: Number(time) };
    return { actionType: "passive", actions: null };
}
