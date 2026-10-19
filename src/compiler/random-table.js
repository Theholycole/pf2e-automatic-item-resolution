// (Or one on a Foundry RollTable it links, Rod of Wonder's "Roll on the Rod of Wonder table": plan.table = { uuid, name, rows: [] } — live play
// draws from it and compiles the row drawn.)
// An item whose effect is a roll on its own table: Madcap Top's d20 ("roll a d20 on the table below to determine the top's effect"),
// Pistol of Wonder's d%. The table's rows → plan.table = { die: "1d20" | "1d100", rows: [{ low, high, text, plan? }] }; each row's
// words are compiled as the item's use (a cast of the spell it names — "Slow affects the target", "A 3rd-rank Illusory Disguise makes
// you look like the target" — or any other plan the readers find), so live play rolls the die and posts that row's own card, or its
// words for the GM (scripts/table.js). Pure.

const TABLE = /<table\b[^>]*>\s*<thead>\s*<tr>\s*<th>\s*(d20|d%|d100|d10|d12|d8|d6|d4)\s*<\/th>[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>\s*<\/table>/i;
// (Or one whose die is its first body row's, its cells in paragraphs: a third-party robe's "[[/r d20]] | Effect" then "1 | …".)
const BODY_TABLE = /<table\b[^>]*>\s*<tbody>\s*<tr[^>]*>\s*<td[^>]*>\s*(?:<p>)?\s*(?:<strong>)?\s*(?:\[\[\/r\s+)?(d20|d%|d100|d10|d12|d8|d6|d4)(?:\]\])?\s*(?:<\/strong>)?\s*(?:<\/p>)?\s*<\/td>[\s\S]*?<\/tr>([\s\S]*?)<\/tbody>\s*<\/table>/i;
const ROW = /<tr[^>]*>\s*<td[^>]*>\s*(?:<p>)?\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*(?:<\/p>)?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
const DIE = { "d%": "1d100", d100: "1d100" };

const plain = (html) => String(html ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (all, label) => label ?? "").replace(/\[\[\/\w+ ([^\]]*?)(?: #[^\]]*)?\]\](?:\{([^}]*)\})?/g, (all, formula, label) => label ?? formula).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// A row's spell named as what happens, as a cast the readers know: "@UUID[…]{Slow} affects the target" → "The item casts … on the target";
// "A 3rd-rank @UUID[…]{Illusory Disguise} makes you look like …" → "The item casts a 3rd-rank … on you".
const ordinal = (n) => `${n}${{ 1: "st", 2: "nd", 3: "rd" }[Number(n) % 10 > 3 || Math.floor(Number(n) / 10) === 1 ? 0 : Number(n) % 10] ?? "th"}`;
function asCast(html) {
    const text = String(html ?? "").replace(/<\/?p>/g, " ").trim();
    const affects = /^(?:A |An )?(?:(\d+)(?:st|nd|rd|th)-rank )?(@UUID\[[^\]]*\]\{[^}]+\})(?: \((\d+)(?:st|nd|rd|th) rank\))? (?:affects|targets|causes) (you|the target)\b/i.exec(text);
    if (affects) return `The item casts ${affects[1] ?? affects[3] ? `a ${ordinal(affects[1] ?? affects[3])}-rank ` : ""}${affects[2]} on ${affects[4].toLowerCase() === "you" ? "you" : "the target"}.${text.slice(affects.index + affects[0].length)}`;
    const makes = /^(?:A |An )(\d+)(?:st|nd|rd|th)-rank (@UUID\[[^\]]*\]\{[^}]+\}) (makes|gives|turns) you\b/i.exec(text);
    if (makes) return `The item casts a ${ordinal(makes[1])}-rank ${makes[2]} on you. ${text}`;
    // ("The top creates a Toxic Cloud centered on the target": that spell, at the target.)
    const creates = /^The [\w' -]+? creates an? (@UUID\[[^\]]*\]\{[^}]+\}) centered on the target\b/i.exec(text);
    if (creates) return `The item casts ${creates[1]} centered on the target.${text.slice(creates.index + creates[0].length)}`;
    return text;
}

// The activation's html, compile (a row's html → its plan, or null) → { die, rows } or null.
// (The table's own DC and spell attack for the spells it casts: "Any spell DC required is DC 27, and any spell attack roll required is +17".)
const TABLE_DC = /\bAny spell DC required is DC (\d+)(?:, and any spell attack (?:roll|modifier) required is \+(\d+))?/i;
export function readTable(html, compile = () => null) {
    const table = TABLE.exec(String(html ?? "")) ?? BODY_TABLE.exec(String(html ?? ""));
    if (!table) return null;
    const own = TABLE_DC.exec(plain(String(html ?? "").slice(0, table.index)));
    const rows = [...table[2].matchAll(ROW)].map(([, low, high, cell]) => {
        const read = compile(`<p><strong>Effect</strong> ${asCast(cell)}</p>`);
        const playable = read && !read.noteOnly && read.builtin !== "no-effect";
        const plan = playable && read.builtin === "cast-spell" && own ? { ...read, dc: read.dc ?? Number(own[1]), attack: read.attack ?? (own[2] ? Number(own[2]) : null) } : read;
        return { low: Number(low), high: Number(high ?? low), text: plain(cell), ...(playable ? { plan } : {}) };
    });
    if (rows.length < 2) return null;
    return { die: DIE[table[1].toLowerCase()] ?? `1${table[1].toLowerCase()}`, rows };
}

// The row a total falls in, or null.
export const rowFor = (table, total) => table?.rows?.find((row) => total >= row.low && total <= row.high) ?? null;

// A RollTable the text links for its roll: "Roll on the @UUID[…RollTable…]{Rod of Wonder} table" → { uuid, name } or null.
const LINKED = /\b[Rr]oll (?:d%|d\d+|an? d\d+ )?\s*on the @UUID\[(Compendium\.[\w-]+\.[\w-]+\.RollTable\.[A-Za-z0-9]+)\]\{([^}]+)\} table\b/;
// (Or a card drawn at random from a deck its whole text links, Deck of Illusions' "You draw a card, chosen randomly from the remaining cards
// in the deck": that RollTable.)
const DRAWN = /\bYou draw a card, chosen randomly\b/i;
const ANY_TABLE = /@UUID\[(Compendium\.[\w-]+\.[\w-]+\.RollTable\.[A-Za-z0-9]+)\]\{([^}]+)\}/;
export function readLinkedTable(html, whole = null) {
    const drawn = DRAWN.test(String(html ?? "")) ? ANY_TABLE.exec(String(whole ?? html ?? "")) : null;
    const linked = LINKED.exec(String(html ?? "")) ?? drawn;
    if (!linked) return null;
    // (Its DC and spell attack for the spells drawn, as for its own table's: Rod of Wonder's DC 27 and +17.)
    const own = /\bAny spell DC required is DC (\d+)(?:, and any spell attack (?:roll|modifier) required is (?:\+(\d+)|\[\[\/r 1d20\+(\d+)\]\]))?/i.exec(String(html ?? ""));
    return { uuid: linked[1], name: linked[2], ...(own ? { dc: Number(own[1]), ...(own[2] ?? own[3] ? { attack: Number(own[2] ?? own[3]) } : {}) } : {}) };
}
