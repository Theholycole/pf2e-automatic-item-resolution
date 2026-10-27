// An item that casts a spell in words the linked forms (consumables.js castPlan) don't cover: "You cast a 4th-rank Dream
// Message spell", "The armor casts mislead, affecting you", "The wayfinder can cast 4th-rank Fireball", "The contract
// casts paranoia (DC 19)", "The crystal ball casts a DC 33 Scrying spell", "You cast either Darkvision or See the
// Unseen on yourself", "cast one of the following spells at 10th-rank: Cleanse Affliction, Detect Poison, Heal, or
// Light". The spell by its name in PF2e's spells (options.spells, spellIndex below), linked or not; the builtin
// "cast-spell" the spell module casts (the user's answer 4, 2026-10-15), with choices when the text gives several. Pure.

const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)`;
// Names from before PF2e's remaster that item texts still use.
const LEGACY = { "dimensional lock": "planar seal", "dimension door": "translocate", "planar binding": "binding circle", "remove disease": "cleanse affliction", "remove poison": "cleanse affliction", "magic missile": "force barrage", "true seeing": "truesight", "see invisibility": "see the unseen", "comprehend language": "translate", "shield other": "share life", "plane shift": "interplanar teleport", "feather fall": "gentle landing", "faerie fire": "revealing light", "magic weapon": "runic weapon", "magic fang": "runic body", "burning hands": "breathe fire", "color spray": "dizzying colors", "sound burst": "noise blast", "chill touch": "void warp", "disrupt undead": "vitality lash", "ray of frost": "frostbite", "produce flame": "ignition", "tanglefoot": "tangle vine", "acid splash": "caustic blast" };

// PF2e's spells by name in lower case: { uuid, name, area, targets, ritual, rank, mythic, duration, sustained, range } — from the spells
// pack's documents or index entries ({ _id | uuid, name, system: { area, target, ritual, level, traits, duration, range } }). (mythic: the
// mythic trait, which costs a Mythic Point to cast — src/compiler/spend.js; duration and range: their words, which a cast's note may only
// restate — honest.js withCastNotes.)
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
            rank: Number(spell.system?.level?.value) || null,
            mythic: (spell.system?.traits?.value ?? []).includes("mythic"),
            duration: String(spell.system?.duration?.value ?? "").trim() || null,
            sustained: Boolean(spell.system?.duration?.sustained),
            range: String(spell.system?.range?.value ?? "").trim() || null
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
        // (A damage roll's formula as its words, its flavor brackets inside: "@Damage[4d8[healing]]" → "4d8".)
        .replace(/@Damage\[((?:[^\[\]]|\[[^\]]*\])*)\](?:\{([^}]*)\})?/g, (whole, formula, label) => label ?? formula.replace(/\[[^\]]*\]/g, "").replace(/\|.*$/, ""))
        .replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (whole, label) => label ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const body = numberRanks(text.replace(/\s*\b(?:Craft Requirements|Destruction)\b.*$/s, ""));
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
// subject of the Sanctuary spell", "The ring replicates the effects of an 8th-rank Spell Turning", "Cast Bless or Heal", Crown of the
// Companion's "as if you cast Share Life targeting the ally" — not a ritual.)
const VERB = /\b(?:you (?:can |immediately |then )?cast|(?:the|this) [\w' -]{1,40}? (?:can cast|casts)|(?:the|these) [\w' -]{1,20}?s cast|it (?:can cast|casts)|to cast|and casts?|casting|(?:is|are) targeted (?:with|by)|(?:you )?(?:generate|produce|replicates?|replicating) the effects of|(?:creating|creates?) the effects? of|you're the subject of|you(?:'re| are) affected by|subjecting (?:it|the target|the creature) to the effects of|then casts?|have (?:it|the [\w' -]{1,30}?) cast|(?:obtain|gain)s? the effects? of|(?:this|it) has the effects? of|as if you cast(?! (?:the |a )?[\w' -]+? ritual\b))\s+|^Cast\s+|^(?:[A-Z][\w'’-]*\s+){1,4}(?:can cast|casts)\s+/gi;
const NOT_A_CAST = /\b(?:your (?:next|last) action (?:is|was) to cast|(?<!\bas )if you cast|when you cast|when casting|after you cast|while casting|able to cast|ability to cast|can't cast|cannot cast|Supply a casting|spell slot|as if you had used it to cast|used as a catalyst|innate spells?|unless it succeeds)\b|\beach once per (?:day|hour|week)\b(?<!^Cast\b.*)/i;
// A cast only under some condition ("On a failed or critically failed saving throw, the whip casts …"): not the activation's.
const CONDITIONAL = /^(?:On a|If|When|Whenever|After|Until|Once)\b/i;
// What comes before the spells: "a", "either", "the three-action version of a", "one of the following spells from the crown
// at 10th-rank:", "one of the following as a 3rd-rank spell (DC 24 save as appropriate):", "4th-rank versions of", "a DC
// 33", "good". Groups: the list's rank, its DC, a rank, a DC.
const LEAD = new RegExp(String.raw`^(?:(?:a|an|the|either|your choice of|good|evil|holy|unholy)\s+)*(?:(?:the )?(?:one|two|three|\d)-action versions? of (?:a|an)\s+)?(?:one of the following(?: spells)?(?: from (?:the|your) [\w' -]+?)?(?: (?:at|as an?) ${ORDINAL}[- ](?:rank|level)(?: spell)?)?(?: \(DC (\d+)[^)]*\))?:?\s+)?(?:${ORDINAL}[- ](?:rank|level) (?:versions of )?)?(?:(?:arcane|divine|occult|primal) )?(?:\(DC (\d+)\) |DC (\d+) )?`, "i");
// Ranks in words: "a first level Command spell".
const WORD_RANKS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const SUFFIX = (n) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
const numberRanks = (text) => text.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[- ](rank|level)\b/gi, (_, word, kind) => `${WORD_RANKS[word.toLowerCase()]}${SUFFIX(WORD_RANKS[word.toLowerCase()])}-${kind.toLowerCase()}`);

// Whether a place in the sentence is inside parentheses ("(such as the space where a creature just cast Translocate)").
const inParentheses = (sentence, at) => (sentence.slice(0, at).match(/\(/g)?.length ?? 0) > (sentence.slice(0, at).match(/\)/g)?.length ?? 0);

// The sentence's spells after its verb: [{ spell, rank }], with what the list leaves (the sentence's rest).
function spellList(rest, spells, names) {
    // ("2nd-rank or 4th-rank Enlarge": both ranks the loop's, not the first the lead's.)
    const pair = new RegExp(String.raw`^(?:(?:a|an|the)\s+)?(?=${ORDINAL}[- ]rank or ${ORDINAL}[- ]rank )`, "i").exec(rest);
    // ("one of the following spells, heightened to 10th rank, to your specifications:", "… at the lowest level possible (unless
    // otherwise specified):", "… as a 3rd-rank spell (DC 24 save as appropriate):": its rank and DC from what's before the colon.)
    const following = pair ? null : /^(?:(?:a|an|the|either|your choice of)\s+)*one of the following(?: spells)?([^:.]{0,100}):\s*/i.exec(rest);
    // ("a 5th-rank spell that depends on the active rune: Acid Grip for corrosive, Fireball for flaming, …".)
    const depends = pair || following ? null : new RegExp(String.raw`^(?:a|an) (?:${ORDINAL}[- ](?:rank|level) )?spell (?:that depends on|from|of) [^:.]{1,60}:\s*`, "i").exec(rest);
    const lead = pair || following || depends ? null : LEAD.exec(rest);
    let at = pair ? pair[0].length : following ? following[0].length : depends ? depends[0].length : lead ? lead[0].length : 0;
    // (A tradition word that's a spell's first: "good Divine Wrath" isn't a divine Wrath.)
    if (lead && /(?:arcane|divine|occult|primal) $/i.test(lead[0]) && !spellAt(rest.slice(at), spells, names)) at -= /(?:arcane|divine|occult|primal) $/i.exec(lead[0])[0].length;
    const inner = following?.[1] ?? "";
    const leadRank = lead?.[1] ?? lead?.[3] ?? new RegExp(String.raw`\b(?:at|as an?|heightened to) ${ORDINAL}[- ](?:rank|level)\b`, "i").exec(inner)?.[1] ?? depends?.[1] ?? null;
    const leadDC = lead?.[2] ?? lead?.[4] ?? lead?.[5] ?? /\bDC (\d+)\b/.exec(inner)?.[1] ?? null;
    const list = [];
    let dangling = false;
    let noted = false;
    // (A rank holds for the spells after it: "4th-rank Holy Light or Vital Beacon".)
    let current = leadRank ? Number(leadRank) : null;
    for (;;) {
        // ("2nd-rank or 4th-rank Enlarge": the spell at each rank, a choice.)
        const ranks = new RegExp(String.raw`^${ORDINAL}[- ]rank or ${ORDINAL}[- ]rank `, "i").exec(rest.slice(at));
        if (ranks) {
            const spell = spellAt(rest.slice(at + ranks[0].length), spells, names);
            if (spell) {
                list.push({ spell: spell.spell, rank: Number(ranks[1]) }, { spell: spell.spell, rank: Number(ranks[2]) });
                at += ranks[0].length + spell.length;
                break;
            }
        }
        const own = new RegExp(String.raw`^(?:(?:a|an|the) )?(?:\d-action )?(?:${ORDINAL}[- ](?:rank|level) )?`, "i").exec(rest.slice(at));
        const found = spellAt(rest.slice(at + own[0].length), spells, names);
        // ("Harm, Heal, or the 1st-rank spell from your deity's cleric spells": a choice not read.)
        if (!found) {
            dangling = list.length > 0;
            break;
        }
        if (own[1]) current = Number(own[1]);
        const entry = { spell: found.spell, rank: current };
        at += own[0].length + found.length;
        // (After it: "(3rd)" or "(heightened to 4th rank)" its rank, "(DC 45)" its DC — "(heightened to 8th level, (DC 34) save)"
        // both — another parenthetical, "for corrosive", "affecting you" or "if you have 3 dark charges" a note.)
        const after = /^(?: (?:spell|cantrip))?(?: \(((?:[^()]|\([^)]*\))*)\))?(?: for [\w-]+(?: [\w-]+)?)?( (?:affecting|on|upon|targeting) (?:you|yourself))?( if [^,;().]*?(?= or (?:a|an|the) |,|;|\(|\.|$))?/i.exec(rest.slice(at));
        const said = after[1] ?? "";
        const ownRank = new RegExp(String.raw`^${ORDINAL}(?:[- ](?:rank|level))?$|\bheightened to ${ORDINAL}[- ](?:rank|level)\b`, "i").exec(said);
        const ownDC = /\bDC (\d+)\b/i.exec(said);
        if (ownRank) entry.rank = Number(ownRank[1] ?? ownRank[2]);
        if (ownDC) entry.dc = Number(ownDC[1]);
        // ("a 5th-rank Elemental Form spell affecting you or a 5th-rank Summon Elemental spell": that one on its user.)
        if (after[2]) entry.self = true;
        const leftover = said.replace(new RegExp(String.raw`^${ORDINAL}(?:[- ](?:rank|level))?$|\bheightened to ${ORDINAL}[- ](?:rank|level)\b|\(?\bDC \d+\)?(?: save)?|[,\s]+`, "gi"), "");
        if (leftover || after[3]) noted = true;
        list.push(entry);
        at += after[0].length;
        const joint = /^\s*(?:,\s*or |,\s*| or )/i.exec(rest.slice(at));
        if (!joint) break;
        at += joint[0].length;
    }
    return { list, rest: rest.slice(at), dc: leadDC ? Number(leadDC) : list.find((entry) => entry.dc)?.dc ?? null, dangling: dangling || noted };
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
    for (const [index, full] of sentences.entries()) {
        // ("If your last action was to Cast a prepared Spell with the plant or wood trait, you … obtain the effect of a 2nd-rank
        // Oaken Resilience spell": what it needs, its own cast after; the sentence a note.)
        const needs = /^If your (?:last|next) action (?:was|is) to Cast [^,]{1,120},\s*(?=.*\b(?:obtain|gain)s? the effects? of\b)/i.exec(full);
        const sentence = needs ? full.slice(needs[0].length) : full;
        if (NOT_A_CAST.test(sentence) || CONDITIONAL.test(sentence)) continue;
        // ("Choose Summon Lesser Servitor or Command. You Cast the chosen Spell at 1st rank (DC 19).")
        const choose = /^Choose (.+)$/i.exec(sentence);
        const chosen = choose && /\bthe chosen spell\b/i.test(sentences[index + 1] ?? "") ? spellList(choose[1], spells, names) : null;
        // (Every cast in the sentence, as choices: "to cast a 6th-rank Runic Weapon on it, or onto a creature to cast a 6th-rank Runic Body on it".)
        const firstVerb = [...sentence.matchAll(VERB)][0]?.index ?? 0;
        const lists = chosen?.list.length ? [{ ...chosen, rest: sentences[index + 1].replace(/^.*?\bthe chosen spell\b/i, "") }] : [...sentence.matchAll(VERB)].filter((verb) => !inParentheses(sentence, verb.index)).map((verb) => spellList(sentence.slice(verb.index + verb[0].length), spells, names)).filter((entry) => entry.list.length);
        if (!lists.length || lists.some((entry) => entry.list.some((one) => one.spell.ritual))) continue;
        // (Each spell once at each rank: "2nd-rank or 4th-rank Enlarge" is two.)
        const list = lists.flatMap((entry) => entry.list).filter((entry, at, all) => all.findIndex((other) => other.spell.uuid === entry.spell.uuid && other.rank === entry.rank) === at);
        const { rest, dc: leadDC } = lists[0];
        const whole = `${sentence} ${sentences[index + 1] ?? ""}`;
        const rank = new RegExp(String.raw`\b(?:heightened to|at|as an?) ${ORDINAL}[- ](?:rank|level)\b`, "i").exec(rest) ?? /\bcounteract rank of (\d+)\b/i.exec(rest);
        // (Its DC in the sentence or the next, or a sentence on the spells' DC: "The DC for any of these spells is 18".)
        // (Or "any save DC is 30", Zuhra's Gloves, anywhere in the text.)
        const dc = leadDC ?? (Number(/\(DC (\d+)\)|\bwith a DC of (\d+)|\bspell DC (?:is |of )?(\d+)|\bThe DC is (\d+)|\bDC (\d+)\b/i.exec(rest + " " + (sentences[index + 1] ?? ""))?.slice(1).find(Boolean)) || Number(/\bThe (?:spell )?DC (?:for (?:any of )?(?:these|the|this) spells? )?is (\d+)|\bany save DC is (\d+)/i.exec(sentences.join(" "))?.slice(1).find(Boolean)) || null);
        // (And "a counteract bonus of +21", Scarlet Queen; "a +19 modifier to its counteract check", Chalice of Ozem; "a single counteract
        // check at +25", Leydroth Spellbreaker; "The counteract check is +15", Spellender — or a sentence of its own on the spells' counteract
        // modifier, Symbol of Conflict's "The counteract DC of these effects is 38, and the counteract modifier is +28".)
        const COUNTERACT = /\bcounteract (?:modifier|bonus) (?:is |of |are )?(?:1d20 ?)?\+(\d+)|\+(\d+) (?:counteract )?modifier for the roll|\bspell attack (?:modifier|roll) (?:is |of |are )?\+(\d+)|\+(\d+) modifier to (?:its|the) counteract check|\bcounteract check (?:is |at )\+(\d+)|\+(\d+) counteract check modifier/i;
        const attack = Number((COUNTERACT.exec(whole) ?? COUNTERACT.exec(sentences.filter((other) => /^The counteract\b/.test(other)).join(" ")))?.slice(1).find(Boolean)) || null;
        // (On its user: the words after the list, or after its last spell — "Darkvision or See the Unseen on yourself" is both on
        // you; after an earlier one only that one is, a choice's own.)
        const lastSelf = list.length > 0 && list.at(-1).self && list.slice(0, -1).every((entry) => !entry.self);
        const self = lastSelf || /\b(?:on (?:you|yourself)|upon yourself|affecting you|targeting yourself|you're affected)\b(?! request| choice)/i.test(rest) || /\byou're the subject of\b|\byou(?:'re| are) affected by\b|\b(?:you )?(?:obtain|gain)s? the effects? of\b/i.test(sentence);
        const choices = list.map((entry) => ({ spell: { uuid: entry.spell.uuid, name: entry.spell.name }, rank: entry.rank ?? (rank ? Number(rank[1]) : null), ...(entry.dc ? { dc: entry.dc } : {}), ...(entry.self && !self ? { self: true } : {}), area: entry.spell.area, targets: entry.spell.targets }));
        // (Not its Activate, Usage or Frequency lines.)
        const notes = sentences.filter((other, at) => at !== index && !/^Choose\b/.test(other) && !/\bthe chosen spell\b/i.test(other) && !/^(?:Activat(?:e|ion)|Usage|Frequency|Trigger|Requirements?)\b/.test(other)).map((other) => other.trim());
        return {
            choices,
            dc,
            attack,
            self,
            area: list.every((entry) => entry.spell.area),
            targets: list.some((entry) => entry.spell.targets),
            // (The cast's own sentence too when it says more: a choice not read, what the item changes, a cost before the cast — "You
            // become fatigued and cast …" — or the actions it's cast with, "the three-action version of".)
            notes: [...(needs || lists.some((entry) => entry.dangling) || (rest.replace(/^[\s,.;]+|[\s.]+$/g, "").length > 3 && /\b(?:except|but|though|instead|only|loses|can target|with|and)\b/i.test(rest)) || /\b(?:become|becomes|take|takes|gain|gains|lose|loses|expend|spend|spends)\b/i.test(sentence.slice(0, firstVerb)) || /-action\b/i.test(sentence) ? [full.trim()] : []), ...notes]
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

// The ability compiler's cast of the same spell, with what its words say and it left out: on its user ("You cast Vapor Form
// on yourself"), a DC ("The cauldron casts Nightmare (DC 35)"), a counteract or spell attack modifier ("with a spell attack
// modifier of +10"), a rank. Only for the spell its reading names; otherwise the plan as it is.
export function fillCast(plan, html, options = {}) {
    if (plan?.builtin !== "cast-spell" || !options.spells) return plan;
    const read = readCastWords(html, options);
    const first = read?.choices?.[0];
    if (!first || first.spell.uuid !== plan.spell?.uuid) return plan;
    const filled = {
        ...(read.self && !plan.self ? { self: true } : {}),
        ...(read.dc && !plan.dc ? { dc: read.dc } : {}),
        ...(read.attack && !plan.attack ? { attack: read.attack } : {}),
        ...(first.rank && !plan.rank ? { rank: first.rank } : {}),
        // (A spell with no target, Translocate's: no creature to target first, 2026-10-27 — the card's needsTargets.)
        ...(plan.targets === undefined && read.targets === false && !read.area && !plan.self ? { targets: false } : {})
    };
    return Object.keys(filled).length ? { ...plan, ...filled } : plan;
}
