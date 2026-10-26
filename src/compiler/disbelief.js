// A creature's attempt to see through an item's illusion (the user's ruling, 2026-10-25, docs/needs.md "Illusions and disbelief": the spells'
// rule — disbelief a control the GM uses, the creature's check against the item's DC, who saw through it tracked). Possum's Play's "An
// illusion surrounds you, causing you to appear dead for up to 1 minute. Any creature that touches the illusion or uses the Seek action to
// examine you can attempt to disbelieve the illusion. The DC to disbelieve the illusion is 18. Any action requiring you to move or make noise
// immediately ends the illusion." → plan.disbelief { dc, statistic, when, lasts, ends }: once the item card applies, the GM's disbelief card
// for the illusion's time (src/live/disbelief-card.js, scripts/disbelief.js). Those sentences are no longer unread. Pure.

const WORDS = { one: 1, a: 1, an: 1 };
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
const plainOf = (html) => String(html ?? "").replace(/@Check\[perception\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $1 Perception").replace(/\[\[\/act ([\w-]+)[^\]]*\]\](?:\{([^}]*)\})?/g, (all, slug, label) => label ?? slug.replace(/-/g, " ")).replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

const WHO = /^(?:Any|A) creature (?:that|who) (.+?) can attempt to disbelieve (?:the|this) illusion(?: \(DC (\d+) Perception\))?\.$/i;
const DC = /^The DC to disbelieve the illusion is (\d+)\.$/i;
// (Only some creatures, Costume Change's "Only a creature that's benefiting from truesight or a similar effect can attempt to disbelieve this
// illusion, with a DC of 20" — 2026-10-26.)
const ONLY_WHO = /^Only a creature that's benefiting from (truesight) or a similar effect can attempt to disbelieve this illusion, with a DC of (\d+)\.$/i;
const LASTS = /\billusion\b[^.]*?\bfor up to (\d+|one|an?) (round|minute|hour)s?\b/i;
const ENDS = /^[^.]*\bimmediately ends the illusion\.$/i;

// The (activation's) html → { dc, statistic, when, lasts?, ends?, said: [sentences] } or null.
export function readDisbelief(html) {
    const sentences = SENTENCES(plainOf(html));
    const only = sentences.map((sentence) => [sentence, ONLY_WHO.exec(sentence)]).find(([, match]) => match);
    if (only) return { dc: Number(only[1][2]), statistic: "perception", when: `is benefiting from ${only[1][1].toLowerCase()} or a similar effect (no other creature can)`, said: [only[0]] };
    const who = sentences.map((sentence) => [sentence, WHO.exec(sentence)]).find(([, match]) => match);
    if (!who) return null;
    const dcSentence = sentences.find((sentence) => DC.test(sentence));
    const dc = Number(who[1][2] ?? (dcSentence ? DC.exec(dcSentence)[1] : NaN));
    if (!Number.isFinite(dc)) return null;
    const lasting = sentences.map((sentence) => LASTS.exec(sentence)).find(Boolean);
    const ends = sentences.find((sentence) => ENDS.test(sentence)) ?? null;
    const when = who[1][1].replace(/\buses the seek action\b/i, "Seeks").replace(/\byou\b/g, "its user");
    return {
        dc,
        statistic: "perception",
        when,
        ...(lasting ? { lasts: { value: WORDS[lasting[1].toLowerCase()] ?? Number(lasting[1]), unit: UNITS[lasting[2].toLowerCase()] } } : {}),
        ...(ends ? { ends: ends.replace(/\byou\b/g, "its user") } : {}),
        said: [who[0], ...(dcSentence ? [dcSentence] : []), ...(ends ? [ends] : [])]
    };
}

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan with plan.disbelief, its sentences no longer unread or notes; the same plan when there's none or nothing to carry it.
export function withDisbelief(plan, html) {
    if (!plan || plan.builtin || plan.noteOnly || !plan.resolution) return plan;
    const read = readDisbelief(html);
    if (!read) return plan;
    const { said: sentences, ...disbelief } = read;
    const kept = (list) => (list ?? []).filter((entry) => !sentences.some((sentence) => said(entry).includes(sentence.replace(/\.$/, "")) || sentence.includes(said(entry).replace(/\.$/, ""))));
    const next = { ...plan, disbelief, ...(plan.unread ? { unread: kept(plan.unread) } : {}), ...(plan.notes ? { notes: kept(plan.notes) } : {}) };
    if (next.notes && !next.notes.length) delete next.notes;
    // (Nothing else left: no longer partial.)
    const left = [...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// An illusion on its user's clothes, Costume Change's "You change the shape and appearance of any armor or clothing you wear to appear as
// ordinary or fancy clothing or armor of your imagining. The actual statistics for what you're wearing doesn't change." (Sihedron Ring,
// Raiment, Skirmisher's Coat): a note Effect on its user for as long as it keeps it, its disbelief the GM's control (withDisbelief). The
// activation's html and the plan's base → the plan, or null. 2026-10-26: nothing read before.
const COSTUME = /\bYou change the shape and appearance of (?:any armor or clothing you wear|this armor|all your clothing),? (?:making them )?(?:to )?appear as ordinary or (?:fancy|fine) (?:clothing or armor|clothes) of your imagining\./i;
const SAME_STATS = /^(?:The actual statistics for what you're wearing doesn't change|The armor's statistics don't change|This doesn't change the statistics of any armor you're wearing)\.$/i;
export function appearancePlan(html, base) {
    const text = plainOf(html);
    if (!COSTUME.test(text) || !readDisbelief(html)) return null;
    const left = SENTENCES(text.replace(/^.*?\bEffect\b\s*/s, "")).filter((sentence) => !COSTUME.test(sentence) && !SAME_STATS.test(sentence) && !ONLY_WHO.test(sentence));
    return {
        ...base,
        automation: { level: left.length ? "guided" : "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [{ label: "Costume", text: "Its armor and clothing look like ordinary or fine clothes or armor of its user's choosing; their statistics don't change (an illusion).", duration: null }] } } },
        ...(left.length ? { notes: left, partial: true } : {})
    };
}
