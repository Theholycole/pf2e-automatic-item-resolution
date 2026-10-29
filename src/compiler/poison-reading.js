// A poison's stages and its own lines (2026-10-27, docs/needs.md "afflictions"): Unending Itch's "Stages 1–5 1d6 poison damage (1 round)",
// one line for five stages alike, which the ability compiler's stat-block reader (one "Stage N" each) doesn't read — written out a stage each
// and the item compiled again, the poison then Pseudo Afflictions' as any other. Its words beside the stages that no reading plays are lines of
// the poison card, for the GM (the poison card shows plan.notes): how its victim notices it and the DCs to identify it, its secret saves
// (Unending Itch); Taster's Folly's Recall Knowledge DC, its two compounds' onset and their detection, and its Sickened that can't be ended
// while it lasts. (Its onset where the stat block's own field ran on into the next, "Onset 10 minutes Maximum Duration 6 minutes" on one line,
// read here before: the ability module's readAffliction stops a field at the next label now, 2026-10-28 — the plans the same without it.)
// Pure.

import { plainText } from "./rows.js";

const RANGE = /<p>\s*<strong>\s*Stages (\d+)\s*[–-]\s*(\d+)\s*<\/strong>([\s\S]*?)<\/p>/i;
const check = (skill) => String.raw`@Check\[${skill}\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?`;

// Each sentence a line of its card, in its own words.
const LINES = [
    [new RegExp(String.raw`^The victim experiences the poison damage as irritation rather than pain or sickness and must succeed at a ${check("perception")} check to realize they're poisoned\.$`, "i"), (found) => `Its victim feels only an itch: it realizes it's poisoned on a DC ${found[1]} Perception check.`],
    [new RegExp(String.raw`^The poison can also be identified with a ${check("medicine")} check\.$`, "i"), (found) => `A DC ${found[1]} Medicine check identifies it.`],
    [/^Once the victim has lost half or more of its Hit Points, the DC drops to (\d+) for either check\.$/i, (found) => `Both those DCs are ${found[1]} once the victim is down to half its Hit Points or fewer.`],
    [/^As long as the victim doesn't realize it's poisoned, the GM makes its saving throws in secret\.$/i, () => "Until the victim realizes it, the GM rolls its saves in secret."],
    [/^The DC to Recall Knowledge about this poison from one of its components is (\d+) and attempts to use magic to detect the unmixed components require a successful DC (\d+) counteract check\.$/i, (found) => `Recall Knowledge from one of its compounds: DC ${found[1]}; magic detects them unmixed only with a DC ${found[2]} counteract check (the GM's).`],
    [/^The onset period begins only if a victim consumes both compounds during the same hour\.$/i, () => "Its onset starts only once a victim has eaten both compounds within one hour (the GM's)."],
    [/^If the two compounds mix prior to consumption, they become toxic and are detectable as such\.$/i, () => "Mixed before they're eaten, the compounds are toxic and can be detected as a poison."],
    [/^The sickened condition can't be ended until the poison's effects end\.$/i, () => "The Sickened it gives can't be ended while the poison lasts."]
];
// (Its flavor, no rule in it.)
const FLAVOR = [/^Invented to cause a lengthy and unpleasant demise, this poison manifests as an itch that can't be soothed\.$/i, /^Devised to bypass detection, a dose of taster's folly consists of two compounds that aren't mixed but placed in the contents of one meal\.$/i, /^Each compound is harmless on its own\.$/i];
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// Its html with each stage of a range written out, or null when it has none.
export function expandStageRange(html) {
    const found = RANGE.exec(String(html ?? ""));
    if (!found) return null;
    const [first, last] = [Number(found[1]), Number(found[2])];
    if (!(last > first) || last - first > 10) return null;
    return String(html).replace(RANGE, Array.from({ length: last - first + 1 }, (_, index) => `<p><strong>Stage ${first + index}</strong>${found[3]}</p>`).join("\n"));
}

// The plan (a poison's) and the item's html → the plan with its lines, or the same plan. Only when every sentence before its stat
// block is a line or flavor.
export function withPoisonLines(plan, html) {
    const handoff = plan?.resolution?.afflictionHandoff;
    if (!handoff) return plan;
    const text = plainText(html).replace(/^\s*Activate\b[^)]*\)\s*/i, "");
    const body = text.replace(/\s*\bSaving Throw\b.*$/s, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim()).filter(Boolean);
    const lines = [];
    const read = new Set();
    for (const sentence of sentences) {
        const line = LINES.map(([pattern, words]) => [pattern.exec(sentence), words]).find(([found]) => found);
        if (line) {
            lines.push(line[1](line[0]));
            read.add(sentence);
        } else if (FLAVOR.some((pattern) => pattern.test(sentence))) read.add(sentence);
        else return plan;
    }
    if (!lines.length) return plan;
    // (Its notes that said those sentences again, now its lines.)
    const notes = [...(plan.notes ?? []).filter((note) => ![...read].some((sentence) => sentence.includes(said(note).slice(0, 50)) || said(note).includes(sentence.slice(0, 50)))), ...lines];
    const left = (plan.unread ?? []).length || Object.values(plan.resolution.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    return {
        ...plan,
        ...(notes.length ? { notes } : {}),
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}
