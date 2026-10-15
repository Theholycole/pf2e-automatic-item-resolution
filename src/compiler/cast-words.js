// An item that casts a spell in words the linked forms (consumables.js castPlan) don't cover: "You cast a 4th-rank Dream
// Message spell", "The armor casts mislead, affecting you", "The wayfinder can cast 4th-rank Fireball", "The contract
// casts paranoia (DC 19)", "The crystal ball casts a DC 33 Scrying spell", "You cast either Darkvision or See the
// Unseen on yourself", "cast one of the following spells at 10th-rank: Cleanse Affliction, Detect Poison, Heal, or
// Light". The spell by its name in PF2e's spells (options.spells, spellIndex below), linked or not; the builtin
// "cast-spell" the spell module casts (the user's answer 4, 2026-10-15), with choices when the text gives several. Pure.

const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)`;
// Names from before PF2e's remaster that item texts still use.
const LEGACY = { "dimension door": "translocate", "planar binding": "binding circle", "remove disease": "cleanse affliction", "remove poison": "cleanse affliction", "magic missile": "force barrage", "true seeing": "truesight", "see invisibility": "see the unseen", "comprehend language": "translate", "shield other": "share life", "plane shift": "interplanar teleport", "feather fall": "gentle landing", "faerie fire": "revealing light", "magic weapon": "runic weapon", "magic fang": "runic body", "burning hands": "breathe fire", "color spray": "dizzying colors", "sound burst": "noise blast", "chill touch": "void warp", "disrupt undead": "vitality lash", "ray of frost": "frostbite", "produce flame": "ignition", "tanglefoot": "tangle vine", "acid splash": "caustic blast" };

// PF2e's spells by name in lower case: { uuid, name, area, targets, ritual, rank } — from the spells pack's documents
// or index entries ({ _id | uuid, name, system: { area, target, ritual, level } }).
export function spellIndex(spells) {
    const index = {};
    for (const spell of spells ?? []) {
        const uuid = spell.uuid ?? (spell._id ? `Compendium.pf2e.spells-srd.Item.${spell._id}` : null);
        if (!uuid || !spell.name) continue;
        index[spell.name.toLowerCase()] ??= {
            uuid,
            name: spell.name,
            area: Boolean(spell.system?.area?.type || spell.system?.area?.value),
            targets: Boolean(String(spell.system?.target?.value ?? "").trim()),
            ritual: Boolean(spell.system?.ritual),
            rank: Number(spell.system?.level?.value) || null
        };
    }
    return index;
}

// The text as sentences: links by their names, a check's DC as "(DC 33)", no tags; from its Effect on (all of it: whole).
function sentencesOf(html, { whole = false } = {}) {
    const header = /<strong>\s*Effect\s*<\/strong>/i.exec(String(html ?? ""));
    const text = String(header && !whole ? String(html).slice(header.index + header[0].length) : html ?? "")
        .replace(/@Check\[[^\]]*?\bdc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "(DC $1)")
        .replace(/\[\[\/\w+ ([^\]]*?)(?: #[^\]]*)?\]\](?:\{([^}]*)\})?/g, (whole, formula, label) => label ?? formula)
        .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
        .replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (whole, label) => label ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const body = text.replace(/\s*\b(?:Craft Requirements|Destruction)\b.*$/s, "");
    return body.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
}

// A spell name at the start of the text: the longest of PF2e's (or a legacy one) — { spell, length } or null.
function spellAt(text, spells, names) {
    const lower = text.toLowerCase();
    for (const name of names) {
        if (!lower.startsWith(name)) continue;
        const after = lower.charAt(name.length);
        if (after && /[a-z0-9]/.test(after)) continue;
        const spell = spells[LEGACY[name] ?? name];
        if (spell) return { spell, length: name.length };
    }
    return null;
}

// "You cast", "you can cast", "The wayfinder can cast", "the tattoo casts", "It casts", "to cast" — not a cast of the
// user's own ("If your next action is to Cast a Spell", "able to cast", "Supply a casting").
// (And "The creature is targeted with Death Knell (DC 24)", "You generate the effects of a Vitality Lash cantrip", "You're the
// subject of the Sanctuary spell", "The ring replicates the effects of an 8th-rank Spell Turning", "Cast Bless or Heal".)
const VERB = /\b(?:you (?:can |immediately |then )?cast|(?:the|this) [\w' -]{1,40}? (?:can cast|casts)|it (?:can cast|casts)|to cast|and cast|casting|(?:is|are) targeted (?:with|by)|(?:you )?(?:generate|produce|replicates?) the effects of|you're the subject of)\s+|^Cast\s+/gi;
const NOT_A_CAST = /\b(?:your (?:next|last) action (?:is|was) to cast|if you cast|when you cast|when casting|after you cast|while casting|able to cast|ability to cast|can't cast|cannot cast|Supply a casting|spell slot|as if you had used it to cast|used as a catalyst|innate spells?|unless it succeeds)\b|\beach once per (?:day|hour|week)\b(?<!^Cast\b.*)/i;
// A cast only under some condition ("On a failed or critically failed saving throw, the whip casts …"): not the activation's.
const CONDITIONAL = /^(?:On a|If|When|Whenever|After|Until|Once)\b/i;
const LEAD = new RegExp(String.raw`^(?:(?:a|an|the|either|your choice of|one of the following(?: spells)?(?: at ${ORDINAL}[- ](?:rank|level))?:?)\s+)*(?:${ORDINAL}[- ](?:rank|level) )?(?:(?:arcane|divine|occult|primal) )?(?:\(DC (\d+)\) |DC (\d+) )?`, "i");

// Whether a place in the sentence is inside parentheses ("(such as the space where a creature just cast Translocate)").
const inParentheses = (sentence, at) => (sentence.slice(0, at).match(/\(/g)?.length ?? 0) > (sentence.slice(0, at).match(/\)/g)?.length ?? 0);

// The sentence's spells after its verb: [{ spell, rank }], with what the list leaves (the sentence's rest).
function spellList(rest, spells, names) {
    const lead = LEAD.exec(rest);
    let at = lead ? lead[0].length : 0;
    const leadRank = lead?.[1] ?? lead?.[2] ?? null;
    const leadDC = lead?.[3] ?? lead?.[4] ?? null;
    const list = [];
    let dangling = false;
    // (A rank holds for the spells after it: "4th-rank Holy Light or Vital Beacon".)
    let current = leadRank ? Number(leadRank) : null;
    for (;;) {
        const own = new RegExp(String.raw`^(?:(?:a|an|the) )?(?:${ORDINAL}[- ](?:rank|level) )?`, "i").exec(rest.slice(at));
        const found = spellAt(rest.slice(at + own[0].length), spells, names);
        // ("Harm, Heal, or the 1st-rank spell from your deity's cleric spells": a choice not read.)
        if (!found) {
            dangling = list.length > 0;
            break;
        }
        if (own[1]) current = Number(own[1]);
        list.push({ spell: found.spell, rank: current });
        at += own[0].length + found.length;
        const joint = /^(?: (?:spell|cantrip))?(?:, or |, | or )/i.exec(rest.slice(at));
        if (!joint) break;
        at += joint[0].length;
    }
    return { list, rest: rest.slice(at), dc: leadDC ? Number(leadDC) : null, dangling };
}

// The activation's (or consumable's) cast in words: { choices: [{ spell: { uuid, name }, rank }], dc, attack, self, area,
// targets, notes } or null. options.spells: spellIndex's.
export function readCastWords(html, { spells = null } = {}) {
    if (!spells) return null;
    const names = Object.keys(spells).concat(Object.keys(LEGACY)).sort((a, b) => b.length - a.length);
    const sentences = sentencesOf(html);
    // (A random table — "14-16 You are pushed 30 feet …", Pistol of Wonder; "roll a 1d20 on the following table" — isn't a
    // choice of spells.)
    const all = sentencesOf(html, { whole: true }).join(" ");
    if ((all.match(/\b\d{1,2}[–-]\d{1,3} [A-Z]/g)?.length ?? 0) >= 2 || /\broll (?:a )?\d*d(?:\d+|%)\b[^.]*\b(?:table|determine)\b/i.test(all)) return null;
    for (const [index, sentence] of sentences.entries()) {
        if (NOT_A_CAST.test(sentence) || CONDITIONAL.test(sentence)) continue;
        // ("Choose Summon Lesser Servitor or Command. You Cast the chosen Spell at 1st rank (DC 19).")
        const choose = /^Choose (.+)$/i.exec(sentence);
        const chosen = choose && /\bthe chosen spell\b/i.test(sentences[index + 1] ?? "") ? spellList(choose[1], spells, names) : null;
        // (Every cast in the sentence, as choices: "to cast a 6th-rank Runic Weapon on it, or onto a creature to cast a 6th-rank Runic Body on it".)
        const lists = chosen?.list.length ? [{ ...chosen, rest: sentences[index + 1].replace(/^.*?\bthe chosen spell\b/i, "") }] : [...sentence.matchAll(VERB)].filter((verb) => !inParentheses(sentence, verb.index)).map((verb) => spellList(sentence.slice(verb.index + verb[0].length), spells, names)).filter((entry) => entry.list.length);
        if (!lists.length || lists.some((entry) => entry.list.some((one) => one.spell.ritual))) continue;
        const list = lists.flatMap((entry) => entry.list).filter((entry, at, all) => all.findIndex((other) => other.spell.uuid === entry.spell.uuid) === at);
        const { rest, dc: leadDC } = lists[0];
        const whole = `${sentence} ${sentences[index + 1] ?? ""}`;
        const rank = new RegExp(String.raw`\b(?:heightened to|at|as an?) ${ORDINAL}[- ](?:rank|level)\b`, "i").exec(rest) ?? /\bcounteract rank of (\d+)\b/i.exec(rest);
        // (Its DC in the sentence or the next, or a sentence on the spells' DC: "The DC for any of these spells is 18".)
        const dc = leadDC ?? (Number(/\(DC (\d+)\)|\bwith a DC of (\d+)|\bspell DC (?:is |of )?(\d+)|\bThe DC is (\d+)|\bDC (\d+)\b/i.exec(rest + " " + (sentences[index + 1] ?? ""))?.slice(1).find(Boolean)) || Number(/\bThe (?:spell )?DC (?:for (?:any of )?(?:these|the|this) spells? )?is (\d+)/i.exec(sentences.join(" "))?.[1]) || null);
        const attack = Number(/\bcounteract modifier (?:is |of |are )?(?:1d20 ?)?\+(\d+)|\+(\d+) (?:counteract )?modifier for the roll|\bspell attack (?:modifier|roll) (?:is |of |are )?\+(\d+)/i.exec(whole)?.slice(1).find(Boolean)) || null;
        const self = /\b(?:on (?:you|yourself)|affecting you|targeting yourself|you're affected)\b(?! request| choice)/i.test(rest) || /\byou're the subject of\b/i.test(sentence);
        const choices = list.map((entry) => ({ spell: { uuid: entry.spell.uuid, name: entry.spell.name }, rank: entry.rank ?? (rank ? Number(rank[1]) : null) }));
        const notes = sentences.filter((other, at) => at !== index && !/^Choose\b/.test(other) && !/\bthe chosen spell\b/i.test(other)).map((other) => other.trim());
        return {
            choices,
            dc,
            attack,
            self,
            area: list.every((entry) => entry.spell.area),
            targets: list.some((entry) => entry.spell.targets),
            notes: [...(lists.some((entry) => entry.dangling) || (rest.replace(/^[\s,.;]+|[\s.]+$/g, "").length > 3 && /\b(?:except|but|though|instead|only|loses|can target|with|and)\b/i.test(rest)) ? [sentence.trim()] : []), ...notes]
        };
    }
    return null;
}

// The builtin the item's cast card plays: { builtin: "cast-spell", spell, rank, dc, attack, tradition, self, notes,
// choices?, area, targets }.
export function castWordsPlan(item, options = {}) {
    // (Activated ammunition's spell is its hit's: not a cast on activating it.)
    if (item?.type === "ammo" || (item?.system?.traits?.value ?? []).includes("ammunition")) return null;
    const read = readCastWords(item?.system?.description?.value, options);
    if (!read) return null;
    const [first] = read.choices;
    return {
        builtin: "cast-spell",
        source: { name: item.name, uuid: item.uuid ?? null, slug: item.system?.slug ?? null },
        spell: first.spell,
        rank: first.rank,
        dc: read.dc,
        attack: read.attack,
        tradition: null,
        self: read.self,
        notes: read.notes,
        area: read.area,
        targets: read.targets,
        ...(read.choices.length > 1 ? { choices: read.choices } : {})
    };
}
