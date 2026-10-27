// A bonus against one kind of creature its user selects (2026-10-27, docs/needs.md "Changes to a Strike"): Undead Compendium's "Select ghost,
// ghoul, graveknight, lich, mummy, vampire, wight, or zombie. You and up to four allies that hear you read the information aloud during the
// activation gain a +2 item bonus on attack rolls and saving throws against that type of undead for the next 10 minutes. To benefit from the
// bonus, your allies must listen attentively and can't perform any other activities during the activation time." The ways card's pick of the
// kind, each way the card's bonus (to its presser's targets: its user and the allies who heard it) only against that kind — PF2e's
// "target:trait:ghost" on the attack rolls, "origin:trait:ghost" on the saves. A kind PF2e has no trait for (a lich, only undead and unholy)
// gets PF2e's toggle on its note Effect, "Against a lich", which the bonus needs: its user ticks it against one. Who may hear it and what
// listening asks of them, lines of the card. Pure.

const SELECTED = /\bSelect ((?:[a-z]+, )+(?:or )?[a-z]+)\. You and up to (\w+) allies that hear you read the information aloud during the activation gain an? \+(\d+) (item|status|circumstance) bonus on attack rolls and saving throws against that type of (\w+) for the next (\d+) (minutes?|rounds?|hours?)\.(?: (To benefit from the bonus, your allies must listen attentively and can't perform any other activities during the activation time\.))?/i;
// (The kinds PF2e has a trait for, among those an item names.)
const TRAITS = new Set(["ghost", "ghoul", "graveknight", "mummy", "vampire", "wight", "zombie", "skeleton", "mummy", "shadow", "wraith"]);
const PLURAL = { mummy: "mummies", lich: "liches" };
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The plan (its bonus read against the whole kind) and the item's own html (its words before src/compiler/item-data.js rewrites them) → the
// ways card, or the same plan.
export function withKindWays(plan, html) {
    const found = SELECTED.exec(plain(html));
    const row = plan?.resolution?.outcomes?.success;
    const modifiers = row?.modifiers ?? [];
    if (!found || !modifiers.length || plan.builtin) return plan;
    const [, list, allies, , , family, time, unit] = found;
    const kinds = list.replace(/\bor\s+/, "").split(/,\s*/).map((kind) => kind.trim().toLowerCase()).filter(Boolean);
    const duration = modifiers[0].duration;
    const lines = [`You and up to ${allies} allies who heard you read it aloud during the activation (target them all)`, ...(found[8] ? [found[8]] : [])];
    const ways = kinds.map((kind) => {
        const trait = TRAITS.has(kind);
        const toggle = `${String(plan.source?.slug ?? "item")}:${kind}`;
        const only = (prefix) => (trait ? [`${prefix}:trait:${kind}`] : [`${prefix}:trait:${family.toLowerCase()}`, toggle]);
        const own = modifiers.map((modifier) => ({ ...modifier, predicate: only(modifier.selector === "saving-throw" ? "origin" : "target") }));
        const many = PLURAL[kind] ?? `${kind}s`;
        const note = { label: `${plan.source?.name ?? "Item"}: ${kind}`, text: `+${modifiers[0].value} ${modifiers[0].type} bonus to attack rolls and saving throws against ${many} for ${time} ${unit}.${trait ? "" : ` PF2e has no ${kind} trait: tick "Against a ${kind}" (this Effect's toggle) against one.`}`, duration, ...(trait ? {} : { rules: [{ key: "RollOption", option: toggle, toggleable: true, label: `Against a ${kind}` }] }) };
        const { unread: _unread, partial: _partial, ...rest } = plan;
        return { name: kind.charAt(0).toUpperCase() + kind.slice(1), plan: { ...rest, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, modifiers: own, noteEffects: [note] } } }, notes: lines } };
    });
    const { unread: _unread, partial: _partial, ...rest } = plan;
    return { ...rest, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan.trigger ?? {}), event: "use" }, ways };
}
