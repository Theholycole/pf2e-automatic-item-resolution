// A candy's secondary effect the activation reader can't play (src/compiler/secondary.js leaves it the use's note), read here (2026-10-28,
// docs/needs.md): a third-party lozenge's song (Honeyed Voice: its Performance checks to Perform rolled twice for a minute, the higher kept —
// PF2e's RollTwice on its user's note Effect), a lollipop crunched as initiative is rolled (Rake's Lollipop: Quickened until the end of its
// user's first turn, the extra action's limit a note Effect beside it, a day's immunity after), a pastille bitten (Nectar Pastille: its user's
// next Strike readied with the item's extra spirit dice and the holy trait, PF2e's AdjustStrike on the readied Strike's Effect). Their uses
// made whole too: the voice-only bonus already on the lozenge's note Effect, the pastille's hour of See the Unseen (castDuration) and its
// user holy for it (PF2e's ActorTraits, plan.userEffects). → the item module's builtin "ways" as src/compiler/secondary.js makes it: the use,
// and the secondary effect whenever it comes (scripts/ways.js). Pure.

import { compileActivations } from "./permanent.js";
import { plainText } from "./rows.js";
import { splitSecondary } from "./secondary.js";
import { compileStrike } from "./strikes.js";

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const MINUTES = (value) => ({ mode: "fixed", value, unit: "minutes", expiry: "turn-start", anchor: "effect-start" });
const HOURS = (value) => ({ mode: "fixed", value, unit: "hours", expiry: "turn-start", anchor: "effect-start" });
// (Until the end of its user's next turn — the first of the fight, as initiative is rolled.)
const FIRST_TURN = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const automatic = (plan) => {
    const next = { ...plan, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    delete next.noteOnly;
    return next;
};
// (Its one row, automatic, with these effects and note Effects in place of the reminder the activation reader left.)
const ownRow = (plan, { effects = [], noteEffects = [] }) => automatic({ ...plan, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, noteEffects } } } });

// Each secondary effect: its words (plain, without its Activate line) → its plan from the activation reader's (secondary), with the use's
// plan (use) — or null.
const SECONDARIES = [
    // (The song: its Performance checks to Perform rolled twice for a minute, the higher kept.)
    {
        test: /\bFor (\d+) minutes?, when you\s+roll a Performance check\s+to Perform, you can\s+roll twice and take the higher result\.\s+This is a fortune effect\.$/,
        plan: (found, secondary) => ownRow(secondary, { noteEffects: [{ label: "Sweet song", text: "Its Performance checks to Perform are rolled twice, the higher kept (a fortune effect).", duration: MINUTES(Number(found[1])), rules: [{ key: "RollTwice", selector: "performance", keep: "higher", predicate: ["action:perform"] }] }] })
    },
    // (The crunch: Quickened for its user's first turn, its extra action's limit, then a day's immunity — the use's
    // immunity, which the whole text's reading gave it, is this way's.)
    {
        test: /\bYou become Quickened\s+for the first\s+turn of combat; you\s+can use this extra\s+action only to (Stride or Strike)\.\s+You are then\s+temporarily immune\b/,
        plan: (found, secondary, use) => {
            const row = ownRow(secondary, { effects: [{ kind: "condition", slug: "quickened", value: null, duration: FIRST_TURN }], noteEffects: [{ label: "Quickened's extra action", text: "The lollipop's extra action can only be used to Stride or Strike.", duration: FIRST_TURN }] });
            return use.item?.immunity ? { ...row, item: { ...(row.item ?? {}), immunity: use.item.immunity } } : null;
        },
        // (Its immunity, the crunch's, off the use.)
        use: (use) => {
            const { immunity, ...item } = use.item ?? {};
            return { ...use, item };
        }
    },
    // (The bite: its user's Strike, the item's extra spirit dice on a hit and the holy trait — said again in PF2e's own words, which the Strike
    // reader reads, with the item's dice.)
    {
        test: /\bYou Strike\.\s+If your Strike is\s+successful, you deal an additional (\d+)d(\d+) (spirit|vitality|void|fire|cold|electricity|acid|sonic|force) damage and your\s+Strike gains the (holy|unholy) trait\.$/,
        plan: (found, secondary, use, { base, item }) => {
            const strike = compileStrike({ ...item, system: { ...(item.system ?? {}), description: { value: `<p>Make a Strike. This Strike deals an additional ${found[1]}d${found[2]} ${found[3]} damage.</p>` } } }, { ...base, activation: secondary.activation });
            if (!strike?.strike || strike.partial) return null;
            return { ...strike, item: { ...(secondary.item ?? {}) }, strike: { ...strike.strike, userRules: [{ key: "AdjustStrike", mode: "add", property: "traits", value: found[4], definition: [] }], lines: [`On a hit it also has the ${found[4]} trait.`] } };
        }
    }
];

// The use's own words, read here: the lozenge's voice-only bonus (an unread line its note Effect already holds), the pastille's hour of See
// the Unseen with its user holy.
const HOLY_CAST = /^While sucking on the [\w ]+?, you become (holy|unholy) \(if you weren(?:'|’)t already\) and gain\s+the effects of an? ([A-Z][\w' ]+?) spell for up to (\d+) (hours?|minutes?)\.$/;
const FLAVOR = /^Made of alchemically\s+purified ingredients\b[^.]*\.$/;
function withUseRead(use) {
    const rows = Object.values(use.resolution?.outcomes ?? {});
    const held = (line) => rows.some((row) => (row?.noteEffects ?? []).some((note) => note.reminder && said(note).includes(line)));
    const unread = (use.unread ?? []).filter((line) => !held(said(line)));
    let next = { ...use, unread: unread.length ? unread : undefined };
    const notes = (next.notes ?? []).map(said);
    const cast = next.builtin === "cast-spell" ? notes.map((note) => HOLY_CAST.exec(note)).find(Boolean) : null;
    if (cast && next.spell?.name === cast[2] && !next.castDuration) {
        const unit = /^h/.test(cast[4]) ? "hours" : "minutes";
        const lasts = unit === "hours" ? HOURS(Number(cast[3])) : MINUTES(Number(cast[3]));
        next = {
            ...next,
            castDuration: { value: Number(cast[3]), unit, said: `for up to ${cast[3]} ${cast[4]}` },
            userEffects: [...(next.userEffects ?? []), { kind: "rules", name: next.source?.name ?? "Holy", words: `${cast[1]} for ${cast[3]} ${cast[4]}`, rules: [{ key: "ActorTraits", add: [cast[1]] }], duration: lasts }],
            notes: notes.filter((note) => note !== cast[0] && !FLAVOR.test(note))
        };
        if (!next.notes.length) next.notes = undefined;
    }
    return next;
}

// The plan (the use's, its secondary effect a note), the item → the ways plan, or the plan as it was.
export function withSecondaryRules(plan, { kind, item, base }) {
    if (kind !== "consumable" || !plan || plan.builtin === "ways" || !(plan.notes ?? []).length) return plan;
    const split = splitSecondary(item?.system?.description?.value);
    if (!split) return plan;
    const words = plainText(split.secondary).replace(/^\s*Activate\b\s*/i, "").trim();
    // (Its note, or one of its sentences a row read left in the use's notes: Rake's Lollipop's Quickened.)
    const theirs = new Set(sentencesOf(words));
    if (!(plan.notes ?? []).some((note) => /^Secondary effect: /.test(said(note)) || theirs.has(said(note)))) return plan;
    const reading = SECONDARIES.map((entry) => [entry, entry.test.exec(words)]).find(([, found]) => found);
    if (!reading) return plan;
    const [entry, found] = reading;
    const [compiled] = compileActivations({ ...item, type: "equipment", system: { ...(item.system ?? {}), description: { value: split.secondary } } });
    const secondary = compiled?.plan ?? { ...base, activation: { time: null, traits: [] }, item: { recipient: "user" } };
    // (The use's notes without the secondary effect's words: its note, and any of its sentences a row read left there.)
    const notes = (plan.notes ?? []).filter((note) => !/^Secondary effect: /.test(said(note)) && !theirs.has(said(note)));
    let use = withUseRead({ ...plan, notes: notes.length ? notes : undefined });
    const played = entry.plan(found, secondary, use, { base, item });
    if (!played) return plan;
    if (entry.use) use = entry.use(use);
    const left = [...(use.notes ?? []), ...(use.unread ?? [])].length || Object.values(use.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    use = left ? use : automatic(use);
    const ways = [
        { name: "Its use", html: split.use, plan: use },
        { name: "Its secondary effect", html: split.secondary, plan: { ...played, item: { ...(played.item ?? {}), type: item.type } } }
    ];
    const partial = ways.some((way) => way.plan.partial);
    // (Not the use's own Effects on its user as the ways card is posted: they're that way's.)
    return { ...use, builtin: "ways", automation: { level: partial ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(partial ? { partial: true } : { partial: undefined }), notes: undefined, unread: undefined, userEffects: undefined };
}
