// Readings of a consumable's own data, around the ability compiler's reading
// of its text: who it acts on, the healing PF2e rolls for it, and the PF2e
// Effect it links. Pure.

// The packs PF2e keeps its effect items in.
const EFFECT_LINK = /@UUID\[(Compendium\.pf2e\.(?:equipment-effects|other-effects|spell-effects|feat-effects|bestiary-effects|campaign-effects)\.Item\.[A-Za-z0-9]+)\](?:\{([^}]*)\})?/g;

// Categories that are drunk, eaten or injected: the creature who takes it gets
// its benefit, which can be another creature than the one who uses it
// (feeding an ally a potion).
const INGESTED = new Set(["potion", "elixir", "mutagen", "drug"]);
// (And fed to another: Energizing Treat's "When you feed your animal companion or familiar an energizing treat".)
const INGEST_WORDS = /\b(?:drink|drinks|drinking|drunk|imbib\w+|consum(?:e|es|ed|ing)|eat|eats|eating|ingest\w*|swallow\w*|quaff\w*|feed your (?:animal companion|familiar|mount)\b)/i;

const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// "drinker": the creature who drinks or eats it (the user, or an adjacent creature they feed it to);
// "user": the creature using it (a talisman's wearer, an oil's or a tool's user).
export function recipientOf(item) {
    const category = item?.system?.category;
    if (INGESTED.has(category)) return "drinker";
    const traits = item?.system?.traits?.value ?? [];
    if (traits.includes("ingested") || INGEST_WORDS.test(plain(item?.system?.description?.value))) return "drinker";
    // ("applied to yourself or an adjacent target", "sprinkling it on yourself or another creature within reach": either.)
    if (/\b(?:to|on) yourself or (?:an?|another|one) (?:adjacent |willing ){0,2}(?:target|creature|ally)\b|\bapplied to up to (?:\d+|two|three|four|five|six) willing creatures\b|\bWhen (?:smeared|applied|rubbed|spread) (?:over|on|onto|to) (?:a|an) (?:willing )?creature\b/i.test(plain(item?.system?.description?.value))) return "drinker";
    return "user";
}

// Granted to others, the creatures the presser targets (plan.item.recipient "targets"), on the item card: allies — "You and
// all allies within a 60-foot emanation gain …", "All allies within 60 feet who can see the crosier receive …", "You grant
// allies within 100 feet …", "Up to 5 creatures of your choice within 30 feet regain …" — or one creature — "a creature
// you touch", "Choose an adjacent creature. Until the end of your turn, that creature takes …", "granting your companion
// …", "you and your familiar", "Both you and the triggering enemy", "the most recent creature damaged by the weapon
// regains …". Not an aura Effect (PF2e spreads it from its user) or the wearer's own one of two. Each wording also gives
// the plan's targeting, who and how far, for the simulator ({ target: "up to 5 creatures", range: "30 feet" }, an
// emanation for "allies within 60 feet").
const COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countOf = (word) => COUNTS[String(word).toLowerCase()] ?? Number(word);
// (A banner's aura is 30 feet.)
const radiusOf = (phrase) => Number(/(\d+)-foot (?:emanation|aura|radius)/i.exec(phrase)?.[1] ?? /\bwithin (?:a )?(\d+) feet/i.exec(phrase)?.[1] ?? (/\bbanner's aura\b/i.test(phrase) ? 30 : null)) || null;
const feet = (phrase) => (/\bwithin (\d+) feet/i.exec(phrase) ? `${/\bwithin (\d+) feet/i.exec(phrase)[1]} feet` : null);
const inArea = (who) => (match) => {
    const radius = radiusOf(match[0]);
    return { target: radius ? `${who} in the area` : who, range: null, area: radius ? { type: "emanation", value: radius } : null };
};
const one = (who, range = null) => (match) => ({ target: typeof who === "function" ? who(match) : who, range: typeof range === "function" ? range(match) : range, area: null });
const OTHERS_GRANT = [
    [/\bYou and (?:all |each )?(?:of )?(?:your )?(?:nearby )?allies\b[^.]*?\b(?:gain|gains|receive|receives|can|regain|regains)\b/i, inArea("you and your allies")],
    [/\b(?:All|Each) (?:mounted )?(?:allies|ally|allied creatures)\b[^.]*?\b(?:gain|gains|receive|receives|regain|regains)\b/i, inArea("your allies")],
    [/\bYou grant allies(?: within (?:a )?\d+(?: feet|-foot emanation))?/i, inArea("your allies")],
    [/\ballies within \d+ feet, granting them\b/i, inArea("your allies")],
    [/(?:^|[.:]\s+)Allies within \d+ feet gain\b/i, inArea("your allies")],
    // (Not one its user gains a bonus against, Spectacles of Inquiry's "Choose a creature you can see. You gain … against that creature":
    // the mark's, src/compiler/marked.js.)
    [/\bChoose (?:a|one|an) (adjacent |willing )?(ally|creature|foe|enemy)\b(?![^.]*\.\s+You (?:gain|get|have)\b[^.]*\bagainst that creature\b)([^.]*)/i, one((match) => `1 ${match[2].toLowerCase()}`, (match) => (match[1]?.trim() === "adjacent" ? "5 feet" : feet(match[3])))],
    [/\bUp to (\w+) (?:willing )?creatures of your choice within (\d+) feet/i, one((match) => `up to ${countOf(match[1])} creatures`, (match) => `${match[2]} feet`)],
    // (Energy Ointment's "This thick grease can be applied to up to 5 willing creatures": each one touched.)
    [/\bcan be applied to up to (\w+) willing creatures\b/i, one((match) => `up to ${countOf(match[1])} creatures`, "touch")],
    [/\bCreatures of your choosing within (\d+) feet/i, one("creatures of your choice", (match) => `${match[1]} feet`)],
    [/\b(?:An?|One) (?:Medium or smaller )?(ally|creature) within (?:the|your) banner's aura\b/i, one((match) => `1 ${match[1].toLowerCase()}`, "30 feet")],
    [/\bgiving all creatures within \d+ feet\b/i, inArea("all creatures")],
    [/\b(a single target|a creature|an ally|a willing creature) you touch\b/i, one((match) => (/ally/i.test(match[1]) ? "1 ally" : "1 creature"), "touch")],
    [/\ba willing creature\b[^.]*\.\s+The creature gains\b/i, one("1 willing creature", "touch")],
    [/\bgranting your (?:animal )?(companion|familiar|mount|eidolon)\b/i, one((match) => `your ${match[1].toLowerCase()}`)],
    [/\byou and your (familiar|companion|mount|eidolon)\b/i, one((match) => `you and your ${match[1].toLowerCase()}`)],
    [/\bBoth you and the triggering (enemy|creature|ally)\b/i, one((match) => `you and the triggering ${match[1].toLowerCase()}`)],
    [/\bthe triggering creature (?:rolls|is forced|takes|gains)\b/i, one("the triggering creature")],
    [/\bThe triggering ally gains\b/, one("the triggering ally")],
    // ("An ally within 60 feet of you … Your ally regains 2d8 hit points".)
    [/\bYour ally regains\b/i, one("1 ally", (match) => feet(match.input))],
    // (Digly's Oil of Sympathy: "the most recent creature damaged by the weapon regains 2d10+5 Hit Points".)
    [/\bthe (?:most recent )?creature (?:damaged|hit) by (?:the|this) weapon regains\b/i, one("the creature the weapon last damaged")]
];
// (Its Effect, before any degree rows: Doom Switch's "Critical Success You and your allies gain …" is its attack's.)
const effectPart = (text) => String(text ?? "").replace(/^.*?\bEffect\b/s, "").split(/\b(?:Critical )?(?:Success|Failure)\b/)[0];
export function grantsOthers(text) {
    const effect = effectPart(text);
    return OTHERS_GRANT.some(([pattern]) => pattern.test(effect));
}
// Who and how far, from the first wording that grants it: { target, range, area } or null.
export function othersTargeting(text) {
    const effect = effectPart(text);
    for (const [pattern, build] of OTHERS_GRANT) {
        const match = pattern.exec(effect);
        if (match) return build(match);
    }
    return null;
}
// (A plan for the item card — healing, Effects, an automatic row — whose text grants it to allies.)
export function targetedRecipient(plan, text) {
    if (!plan || plan.builtin || plan.allyArea || !["healing", "effect", "check"].includes(plan.resolution?.kind)) return false;
    if (plan.resolution.kind === "check" && plan.resolution.check?.roll !== "automatic") return false;
    const labels = (plan.resolution.applications ?? []).map((entry) => String(entry.label ?? ""));
    if (labels.some((label) => /^Aura:|\((?:Wearer|Self|You)\)$/i.test(label.trim()))) return false;
    return grantsOthers(text);
}

// The distinct PF2e effect items the text links: [{ uuid, label }].
// (A third-party module's own Effect, "@UUID[Compendium.<module>.<pack>.<id>]{Effect: …}" — often without the document
// type: its uuid in full, marked to be checked against the item's text before it's applied, src/compiler/verify-effect.js.)
const MODULE_EFFECT_LINK = /@UUID\[Compendium\.((?!pf2e\.)[\w-]+)\.([\w-]+)\.(?:Item\.)?([A-Za-z0-9]{16})\]\{(Effect:[^}]*)\}/g;
export function effectLinks(item) {
    const html = String(item?.system?.description?.value ?? "");
    const links = new Map();
    for (const match of html.matchAll(EFFECT_LINK)) {
        if (!links.has(match[1])) links.set(match[1], { uuid: match[1], label: match[2]?.trim() || null });
    }
    for (const match of html.matchAll(MODULE_EFFECT_LINK)) {
        const uuid = `Compendium.${match[1]}.${match[2]}.Item.${match[3]}`;
        if (!links.has(uuid)) links.set(uuid, { uuid, label: match[4]?.trim() || null, verify: html });
    }
    return [...links.values()];
}

// The healing PF2e's own Use rolls (system.damage of kind "healing"), as the core's native healing.
// Undead (void healing) aren't healed: recipients "living".
// (Only when the text heals: Potion of Annulment keeps its counteract roll, 1d20+17, in that field so PF2e rolls it on Use.)
const HEALS = /\b(?:regain|restore|recover|heal)\w*\b[^.]{0,80}\bHit Points\b/i;
export function nativeHealing(item) {
    const damage = item?.system?.damage;
    if (damage?.kind !== "healing" || !damage.formula || !HEALS.test(plain(item.system?.description?.value))) return null;
    return { components: [{ id: "healing", formula: String(damage.formula), kinds: ["healing"] }], recipients: "living" };
}

// The healing its text gives its own user beside a linked Effect, when PF2e's data has none: Kindler Cameo's "You regain
// @Damage[(3d10+12)[healing]] Hit Points, and you gain a +2 status bonus to Will saves", Wine of the Blood's "When you drink wine of
// the blood, you recover @Damage[2d10[healing]] Hit Points" — the core's native healing, rolled with the Effect applied. Not under a
// condition ("If you spend 10 minutes …") nor for others.
const OWN_HEALING = /^(?:When you (?:Activate|drink|eat|consume|imbibe)\b[^,]*,\s*|[^.]*?\b(?:Effect\s+)?)?You (?:[a-z]+ [^,.]*?(?:, | and ))?(?:regain|recover) @Damage\[\(?([^\[\]()]+)\)?\[healing\](?:\|[^\]]*)?\](?:\{[^}]*\})?(?: Hit Points)?/i;
// (An item that gives its bearer void healing, Emerald Fulcrum Lens: its own healing heals them still — any recipient.)
export function statedHealing(text, whole = text) {
    for (const sentence of String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        if (/^\s*(?:If|Whenever|While|Each time|At the start|At the end)\b/i.test(sentence)) continue;
        const match = OWN_HEALING.exec(sentence.trim());
        if (match && /^[\dd+\s-]+$/.test(match[1])) return { components: [{ id: "healing", formula: match[1].replace(/\s+/g, ""), kinds: ["healing"] }], recipients: /\bYou gain void healing\b/i.test(String(whole ?? "")) ? "any" : "living" };
    }
    return null;
}
// (An Effect plan with it: the healing beside the Effect.)
export function withStatedHealing(plan, text, whole = text) {
    if (plan?.resolution?.kind !== "effect" || plan.resolution.native?.healing) return plan;
    const healing = statedHealing(text, whole);
    return healing ? { ...plan, resolution: { ...plan.resolution, native: { ...(plan.resolution.native ?? {}), healing } } } : plan;
}

// What PF2e rolls itself when the item is used (its system.damage): live play takes that roll instead of a second one.
export function pf2eRoll(item) {
    const damage = item?.system?.damage;
    return damage?.formula ? { formula: String(damage.formula), kind: damage.kind ?? "damage", type: damage.type ?? "untyped" } : null;
}

// "you gain the effects of a 2nd-rank Oaken Resilience for 10 minutes", "grants you the effects of Haste for 1 minute":
// the spell, its rank and the time the item gives. [{ spell: { uuid, name }, rank, duration }]
const ORDINAL_RANK = String.raw`(\d+)(?:st|nd|rd|th)[- ](?:rank|level)`;
const GRANTS_SPELL = new RegExp(String.raw`\b(?:gains?|grants? you|granting you|gives? you|has|have|receives?) the (?:same )?(?:effects?|benefits?) of (?:an? |the )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]*)\}(?: spell)?(?: for (\d+|one|an?) (rounds?|minutes?|hours?|days?))?`, "gi");
const COUNT = { one: 1, a: 1, an: 1 };
const UNIT = (unit) => (/^round/i.test(unit) ? "rounds" : /^minute/i.test(unit) ? "minutes" : /^hour/i.test(unit) ? "hours" : "days");

// (A talisman's "it casts a 6th-rank Heroism on you", "the talisman casts Fly on you, though the duration is 1 minute": the
// same, on the item's user.)
const CASTS_ON_YOU = new RegExp(String.raw`\b(?:it|the [\w' -]+?|this [\w' -]+?) casts (?:an? )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]*)\}(?: spell)? on you\b(?:,? though the duration is (\d+|one|an?) (rounds?|minutes?|hours?|days?))?`, "gi");

// (At someone else: "the charm casts a Rewrite Memory spell (DC 26 Will) against a single target", the dispelling sliver's
// "with the effects of an 8th-rank Dispel Magic" on the target; and "casting a 5th-rank Summon Elemental spell".)
const CASTS_AT = new RegExp(String.raw`\b(?:it|the [\w' -]+?|this [\w' -]+?) casts (?:an? )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]*)\}(?: spell)?(?: \(@Check\[(?:fortitude|reflex|will)\|dc:(\d+)[^\]]*\]\))? (?:against|on|at|targeting) (?:a single target|the target|the triggering creature|a creature|one creature|an? (?:enemy|foe|ally))\b`, "gi");
const WITH_EFFECTS_AT = new RegExp(String.raw`\b(?:on|at|against) the target\b[^.]*?\bwith the effects of (?:an? |the )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]*)\}`, "gi");
const CASTING_SUMMON = new RegExp(String.raw`\bcasting (?:an? )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{(Summon [^}]*)\}`, "gi");

export function grantedSpells(item) {
    const html = String(item?.system?.description?.value ?? "");
    const entry = (match, { self, dc = null } = {}) => ({
        spell: { uuid: match[2], name: match[3].trim() },
        rank: match[1] ? Number(match[1]) : null,
        duration: self && match[4] && match[5] ? { value: COUNT[match[4].toLowerCase()] ?? Number(match[4]), unit: UNIT(match[5]) } : null,
        self,
        dc
    });
    return [
        ...[...html.matchAll(GRANTS_SPELL), ...html.matchAll(CASTS_ON_YOU)].map((match) => entry(match, { self: true })),
        ...[...html.matchAll(CASTS_AT)].map((match) => entry(match, { self: false, dc: match[4] ? Number(match[4]) : null })),
        ...[...html.matchAll(WITH_EFFECTS_AT)].map((match) => entry(match, { self: false })),
        ...[...html.matchAll(CASTING_SUMMON)].map((match) => entry(match, { self: true }))
    ];
}

// The PF2e spell Effect for each spell the item grants, when PF2e has one (options.spellEffects: { "haste": { uuid, name } }, by the
// spell's name in lower case): an application at the item's rank (the Effect's rules read @item.level) and for the item's time.
export function spellEffectApplications(item, spellEffects, recipient) {
    const applications = [];
    for (const granted of grantedSpells(item)) {
        // (A spell at someone else isn't an Effect on the drinker.)
        if (!granted.self) return null;
        const effect = spellEffects?.[granted.spell.name.toLowerCase()];
        if (!effect?.uuid) return null;
        applications.push({ kind: "native-spell-effect", uuid: effect.uuid, label: effect.name ?? null, recipients: recipientsFor(recipient), level: granted.rank, ...(granted.duration ? { duration: granted.duration } : {}), spell: granted.spell });
    }
    return applications.length ? applications : null;
}

// A spell the item grants that has no PF2e Spell Effect (Invisibility, Truesight): cast, as the ability compiler's
// builtin { builtin: "cast-spell", spell, rank, dc, attack, tradition, self, notes } — the spell module's to cast (the
// user's answer 4, 2026-10-15). attack: a counteract modifier the text states ("a counteract modifier of +25");
// notes: what the item changes ("except that you use your Perception modifier …").
const plainSentences = (html) => String(html ?? "").replace(/\[\[\/\w+ 1d20\s*\+\s*(\d+)[^\]]*\]\](?:\{[^}]*\})?/g, "+$1").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/);
export function castPlan(item) {
    const granted = grantedSpells(item);
    if (granted.length !== 1) return null;
    const [spell] = granted;
    const sentences = plainSentences(item?.system?.description?.value);
    const counteract = sentences.map((sentence) => /\bcounteract modifier (?:of )?\+(\d+)|\+(\d+) counteract modifier/i.exec(sentence)).find(Boolean);
    const notes = sentences.filter((sentence) => sentence.includes(spell.spell.name) && /\b(?:except|but|though|instead)\b/i.test(sentence));
    return {
        builtin: "cast-spell",
        source: { name: item.name, uuid: item.uuid ?? null, slug: item.system?.slug ?? null },
        spell: spell.spell,
        rank: spell.rank,
        dc: spell.dc ?? null,
        attack: counteract ? Number(counteract[1] ?? counteract[2]) : null,
        tradition: null,
        self: spell.self !== false,
        notes,
        ...(spell.duration ? { duration: spell.duration } : {})
    };
}

// An application's recipients for the item: the drinker is the plan's target (the user, by default).
const recipientsFor = (recipient) => (recipient === "drinker" ? "target" : "self");

// (verify: a third-party Effect's item text, to check it against before it's applied.)
const application = (link, recipient) => ({ kind: "native-spell-effect", uuid: link.uuid, label: link.label, recipients: recipientsFor(recipient), ...(link.verify ? { verify: link.verify } : {}) });

// A plan of the item's own, when the ability compiler read nothing: its one linked
// Effect (or the PF2e spell Effects of the spells it grants) and the healing PF2e
// rolls. Items linking several Effects (a stage or a degree each) are left to the
// readings that know which one applies.
// Of several linked Effects, the item's own: named like the item or its activation ("Effect: Rainbow Vinegar" beside "Effect:
// Rainbow Vinegar Weakness", "Effect: Belt of the Five Kings (Wearer)" beside "(Allies)"), when the others come later or under a
// condition (a second dose, a later activation) — not one per degree (Electromuscular Stimulator), nor one for allies in an
// area (The Hammer of Hooves). null when there's no one such.
const DEGREE_ROWS = /\b(?:Critical Success|Critical Failure)\b|\b(?:Success|Failure) (?:The|the|You|you|It|it)\b/;
// (The one of several that's its user's, by the item's slug where neither name nor text tells: Silkspinner's Shield's climb Speed — its
// "Animated Strike" Effect is the struck creature's, src/compiler/attack-riders.js.)
const OWN_LINKS = Object.freeze({ "silkspinners-shield": "Silkspinner's Shield (Climb)" });
// (And a linked Effect its attack riders give the struck creature, so not the GM's either: src/compiler/attack-riders.js.)
const RIDER_LINKS = Object.freeze(["Silkspinner's Shield (Animated Strike)"]);
export function ownLink(item, links, names = []) {
    if (links.length < 2) return null;
    const picked = OWN_LINKS[item?.system?.slug];
    if (picked) return links.find((link) => String(link.label ?? "").replace(/^Effect:\s*/i, "") === picked) ?? null;
    const text = plain(item?.system?.description?.value);
    if (DEGREE_ROWS.test(text) || (/\b(?:allies|emanation|aura)\b/i.test(text) && !links.some((link) => /\(Wearer\)$/i.test(link.label ?? "")))) return null;
    // (An activation's: its own name only — Weapon Siphon's unnamed activation fits a bomb, "Effect: Weapon Siphon Bomb Fitted", not
    // the item's "Effect: Weapon Siphon" — or the wearer's.)
    const activation = item?.system?.category === "permanent";
    const named = activation ? names.filter((name) => String(name ?? "").includes(": ")).map((name) => name.split(": ").at(-1)) : [item?.name, ...names];
    const bases = named.filter(Boolean).flatMap((name) => [name, name.replace(/\s*\([^)]*\)\s*$/, "")]).map((name) => name.toLowerCase().trim());
    const own = links.filter((link) => {
        const label = String(link.label ?? "").replace(/^Effect:\s*/i, "").toLowerCase().trim();
        return bases.includes(label) || /\(wearer\)$/.test(label);
    });
    return own.length === 1 ? own[0] : null;
}

// Whether several linked Effects all apply: each one's label is the item's own name with a part in brackets ("Effect: Thorn
// of Milani (Spirit Damage)"), none is a degree's or a choice's, and the text says one then the other ("You then gain …").
// Items whose words differ: EXTRA_ALL_LINKS, by slug — see docs/mechanics.md.
export const EXTRA_ALL_LINKS = Object.freeze([]);
function bothApply(item, links) {
    if (links.length < 2) return false;
    if (EXTRA_ALL_LINKS.includes(item?.system?.slug)) return true;
    const base = String(item?.name ?? "").replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
    const labels = links.map((link) => String(link.label ?? "").replace(/^Effect:\s*/i, "").toLowerCase());
    if (!base || !labels.every((label) => label.startsWith(`${base} (`)) || labels.some((label) => /\b(?:success|failure|or|choose)\b/.test(label))) return false;
    return /\bYou then (?:gain|become|take|are)\b/i.test(plain(item?.system?.description?.value));
}

export function ownPlan(item, base, options = {}) {
    const recipient = recipientOf(item);
    const healing = nativeHealing(item);
    const links = effectLinks(item);
    // (Several: the item's own, the others on the note — or all of them, when each is the item's and the text has them one after
    // the other: Thorn of Milani's "you deal an additional 1d4 spirit damage … You then gain weakness 1 to unholy", its
    // Spirit Damage and Unholy Weakness Effects.)
    const own = ownLink(item, links, [base?.source?.name]);
    const all = !own && bothApply(item, links);
    const applications = links.length === 1 ? [application(links[0], recipient)] : all ? links.map((link) => application(link, recipient)) : own ? [application(own, recipient)] : !links.length ? spellEffectApplications(item, options.spellEffects, recipient) ?? [] : [];
    const others = own ? links.filter((link) => link !== own && !RIDER_LINKS.includes(String(link.label ?? "").replace(/^Effect:\s*/i, ""))).map((link) => `${link.label ?? "Another Effect"} is linked too: the GM's, when the text says it applies.`) : [];
    // (A granted spell with no PF2e Effect: a cast; only once the spell-effects index is known, so it isn't one by mistake.)
    if (!healing && !applications.length) return !links.length && options.spellEffects ? castPlan(item) : null;
    const resolution = healing && !applications.length
        ? { kind: "healing", native: { healing } }
        : { kind: "effect", applications, ...(healing ? { native: { healing } } : {}) };
    return { ...base, automation: { level: others.length ? "guided" : "automatic" }, targeting: { target: recipient === "drinker" ? "the drinker" : null, range: null, area: null }, trigger: { event: "use" }, resolution, ...(others.length ? { notes: others, partial: true } : {}) };
}

// The ability compiler's plan, fitted to the item: its "self" effects go to the
// drinker, PF2e's healing joins an effect plan that has none, and "gains the
// effects of Haste" becomes PF2e's Spell Effect: Haste when there is one (else it
// stays a cast, the spell module's). null when it read nothing.
export function fitPlan(item, plan, base, options = {}) {
    if (!plan) return null;
    const recipient = recipientOf(item);
    if (plan.builtin === "cast-spell" && plan.self) {
        const applications = spellEffectApplications(item, options.spellEffects, recipient);
        if (!applications) return plan;
        const healing = nativeHealing(item);
        return { ...base, automation: { level: "automatic" }, targeting: { target: recipient === "drinker" ? "the drinker" : null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "effect", applications, ...(healing ? { native: { healing } } : {}) }, notes: plan.notes ?? [] };
    }
    if (!plan.resolution) return plan;
    let resolution = plan.resolution;
    if (resolution.kind === "effect" && recipient === "drinker" && (resolution.applications ?? []).some((entry) => entry.recipients === "self")) {
        resolution = { ...resolution, applications: resolution.applications.map((entry) => (entry.recipients === "self" ? { ...entry, recipients: "target" } : entry)) };
    }
    const healing = nativeHealing(item);
    if (healing && resolution.kind === "effect" && !resolution.native?.healing) resolution = { ...resolution, native: { ...(resolution.native ?? {}), healing } };
    return resolution === plan.resolution ? plan : { ...plan, resolution };
}

// An Effect plan behind a check its text opens with — Diplomat's Badge's "Attempt a DC 20 check to Recall Knowledge … If you
// succeed, the badge's bonus increases": the check on the card, so the Effect is applied only on its success; partial.
export function checkGated(plan, text) {
    if (plan?.resolution?.kind !== "effect" || !(plan.resolution.applications ?? []).length) return plan;
    const effect = String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "");
    const check = /^Attempt an? DC \d+ [^.]*?\bcheck\b[^.]*\./i.exec(effect);
    const success = /\bIf you succeed\b[^.]*\./i.exec(effect);
    if (!check || !success) return plan;
    return { ...plan, automation: { level: "guided" }, notes: [...(plan.notes ?? []), `Only on a success: ${check[0].trim()} ${success[0].trim()}`], partial: true };
}

// The plan for what it gives its user and allies in an area (rows.js allyAreaRow): the core's check family with no roll, its
// row for each creature the presser targets (the ability module's card, as a save at targets would be). null without one.
export function allyAreaPlan(text, base, allyArea) {
    if (!allyArea) return null;
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    return {
        ...base,
        automation: { level: allyArea.notes.length ? "guided" : "automatic" },
        targeting: { target: allyArea.self ? "you and your allies in the area" : "your allies in the area", range: null, area: { type: "emanation", value: allyArea.radius } },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { damage: none().damage, effects: allyArea.row.effects, modifiers: allyArea.row.modifiers }, failure: none(), criticalFailure: none() } },
        allyArea: true,
        notes: allyArea.notes,
        ...(allyArea.notes.length ? { partial: true } : {})
    };
}
