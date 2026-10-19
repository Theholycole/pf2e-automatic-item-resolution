// A no-damage attack whose result is PF2e's own Effect on the creature it's aimed at, Doom Switch's Bragging Rights: "You attempt to
// Strike a significant enemy with the doom switch … The switch is treated as a simple melee weapon for the purpose of proficiency. This
// attack deals no damage." Its degrees are PF2e's two linked Effects, "(Success or Better)" and "(Failure or Worse)", which PF2e built
// for the target: those who attack it get the bonus or the penalty, the second's ChoiceSet the degree (the ability module presets it
// from the row's). The plan: its user's own attack against the target's AC (a simple weapon's: Strength or Dexterity, and simple
// proficiency — the attack picked on the card), each degree's Effect on its row. The rest of the degrees' words — temporary Hit Points
// when the target drops — notes. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const NO_DAMAGE = /\bYou attempt to Strike (?:a|an|one) [\w' -]+? with the [\w' -]+?[,.][^]*?\bis treated as a simple (melee|ranged) weapon for the purpose of proficiency\.\s*This attack deals no damage\./i;
const LINK = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]*?\((Success or Better|Failure or Worse)\))\}/g;
const DEGREES = { "Success or Better": ["criticalSuccess", "success"], "Failure or Worse": ["failure", "criticalFailure"] };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The activation's html, its base → the plan, or null.
export function effectStrikePlan(html, base) {
    const text = String(html ?? "");
    const attack = NO_DAMAGE.exec(plain(text));
    const links = [...text.matchAll(LINK)];
    if (!attack || links.length < 2) return null;
    const outcomes = { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() };
    for (const [, uuid, label, which] of links) for (const degree of DEGREES[which]) outcomes[degree].nativeEffects = [...(outcomes[degree].nativeEffects ?? []), { uuid, label }];
    if (Object.values(outcomes).some((row) => !row.nativeEffects)) return null;
    // (What the Effects don't do: the temporary Hit Points when the target drops — the degrees' sentences that say so.)
    // (A success "As critical success, except …": said as the success's own.)
    const notes = plain(text).split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\btemporary Hit Points\b/i.test(sentence))
        .map((sentence) => sentence.replace(/^Success As critical success, except\s+/i, "On a success, instead: ").replace(/\.$/, ""))
        .map((sentence) => `${sentence} (by hand).`);
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        ownCheck: { kind: "attack", modifier: 0, choose: [attack[1].toLowerCase() === "melee" ? "melee" : "thrown"] },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: 0 }, outcomes },
        ...(notes.length ? { notes, partial: true } : {})
    };
}
