// Readings of a consumable's own data, around the ability compiler's reading
// of its text: who it acts on, the healing PF2e rolls for it, and the PF2e
// Effect it links. Pure.

// The packs PF2e keeps its effect items in.
const EFFECT_LINK = /@UUID\[(Compendium\.pf2e\.(?:equipment-effects|other-effects|spell-effects|feat-effects|bestiary-effects|campaign-effects)\.Item\.[A-Za-z0-9]+)\](?:\{([^}]*)\})?/g;

// Categories that are drunk, eaten or injected: the creature who takes it gets
// its benefit, which can be another creature than the one who uses it
// (feeding an ally a potion).
const INGESTED = new Set(["potion", "elixir", "mutagen", "drug"]);
const INGEST_WORDS = /\b(?:drink|drinks|drinking|drunk|imbib\w+|consum(?:e|es|ed|ing)|eat|eats|eating|ingest\w*|swallow\w*|quaff\w*)\b/i;

const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// "drinker": the creature who drinks or eats it (the user, or an adjacent creature they feed it to);
// "user": the creature using it (a talisman's wearer, an oil's or a tool's user).
export function recipientOf(item) {
    const category = item?.system?.category;
    if (INGESTED.has(category)) return "drinker";
    const traits = item?.system?.traits?.value ?? [];
    if (traits.includes("ingested") || INGEST_WORDS.test(plain(item?.system?.description?.value))) return "drinker";
    return "user";
}

// The distinct PF2e effect items the text links: [{ uuid, label }].
export function effectLinks(item) {
    const links = new Map();
    for (const match of String(item?.system?.description?.value ?? "").matchAll(EFFECT_LINK)) {
        if (!links.has(match[1])) links.set(match[1], { uuid: match[1], label: match[2]?.trim() || null });
    }
    return [...links.values()];
}

// The healing PF2e's own Use rolls (system.damage of kind "healing"), as the core's native healing.
// Undead (void healing) aren't healed: recipients "living".
export function nativeHealing(item) {
    const damage = item?.system?.damage;
    if (damage?.kind !== "healing" || !damage.formula) return null;
    return { components: [{ id: "healing", formula: String(damage.formula), kinds: ["healing"] }], recipients: "living" };
}

// What PF2e rolls itself when the item is used (its system.damage): live play takes that roll instead of a second one.
export function pf2eRoll(item) {
    const damage = item?.system?.damage;
    return damage?.formula ? { formula: String(damage.formula), kind: damage.kind ?? "damage", type: damage.type ?? "untyped" } : null;
}

// "you gain the effects of a 2nd-rank Oaken Resilience for 10 minutes", "grants you the effects of Haste for 1 minute":
// the spell, its rank and the time the item gives. [{ spell: { uuid, name }, rank, duration }]
const ORDINAL_RANK = String.raw`(\d+)(?:st|nd|rd|th)[- ](?:rank|level)`;
const GRANTS_SPELL = new RegExp(String.raw`\b(?:gains?|grants? you|gives? you|has|have|receives?) the (?:same )?(?:effects?|benefits?) of (?:an? |the )?(?:${ORDINAL_RANK} )?@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{([^}]*)\}(?: spell)?(?: for (\d+|one|an?) (rounds?|minutes?|hours?|days?))?`, "gi");
const COUNT = { one: 1, a: 1, an: 1 };
const UNIT = (unit) => (/^round/i.test(unit) ? "rounds" : /^minute/i.test(unit) ? "minutes" : /^hour/i.test(unit) ? "hours" : "days");

export function grantedSpells(item) {
    return [...String(item?.system?.description?.value ?? "").matchAll(GRANTS_SPELL)].map((match) => ({
        spell: { uuid: match[2], name: match[3].trim() },
        rank: match[1] ? Number(match[1]) : null,
        duration: match[4] ? { value: COUNT[match[4].toLowerCase()] ?? Number(match[4]), unit: UNIT(match[5]) } : null
    }));
}

// The PF2e spell Effect for each spell the item grants, when PF2e has one (options.spellEffects: { "haste": { uuid, name } }, by the
// spell's name in lower case): an application at the item's rank (the Effect's rules read @item.level) and for the item's time.
export function spellEffectApplications(item, spellEffects, recipient) {
    const applications = [];
    for (const granted of grantedSpells(item)) {
        const effect = spellEffects?.[granted.spell.name.toLowerCase()];
        if (!effect?.uuid) return null;
        applications.push({ kind: "native-spell-effect", uuid: effect.uuid, label: effect.name ?? null, recipients: recipientsFor(recipient), level: granted.rank, ...(granted.duration ? { duration: granted.duration } : {}), spell: granted.spell });
    }
    return applications.length ? applications : null;
}

// An application's recipients for the item: the drinker is the plan's target (the user, by default).
const recipientsFor = (recipient) => (recipient === "drinker" ? "target" : "self");

const application = (link, recipient) => ({ kind: "native-spell-effect", uuid: link.uuid, label: link.label, recipients: recipientsFor(recipient) });

// A plan of the item's own, when the ability compiler read nothing: its one linked
// Effect (or the PF2e spell Effects of the spells it grants) and the healing PF2e
// rolls. Items linking several Effects (a stage or a degree each) are left to the
// readings that know which one applies.
export function ownPlan(item, base, options = {}) {
    const recipient = recipientOf(item);
    const healing = nativeHealing(item);
    const links = effectLinks(item);
    const applications = links.length === 1 ? [application(links[0], recipient)] : !links.length ? spellEffectApplications(item, options.spellEffects, recipient) ?? [] : [];
    if (!healing && !applications.length) return null;
    const resolution = healing && !applications.length
        ? { kind: "healing", native: { healing } }
        : { kind: "effect", applications, ...(healing ? { native: { healing } } : {}) };
    return { ...base, automation: { level: "automatic" }, targeting: { target: recipient === "drinker" ? "the drinker" : null, range: null, area: null }, trigger: { event: "use" }, resolution };
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
