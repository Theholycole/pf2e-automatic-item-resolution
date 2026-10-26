// A talisman used with a free action or with 1 action, the action more for more (2026-10-26): Golden Liberator's Feather's "Activate F or 1 …
// When you activate the talisman, you sprout feathery wings until the end of your turn, granting you a fly Speed of 50 feet and a +4
// circumstance bonus to AC against reactions triggered by your movement. You then Fly. If you activate the talisman with 1 action, the wings
// buffet adjacent enemies either before or after you Fly, dealing 8d8 spirit damage (basic Fortitude)". The ways card's two ways: the free
// action's wings — its user's fly Speed until the end of its turn (PF2e's BaseSpeed on the item card's Effect), the AC bonus a note Effect
// on it, its Fly its own move — and the 1 action's, those wings and then the buffet's save card for the enemies its presser targets
// (plan.again, posted once the Effect is on). Pure.

const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<span class="action-glyph">([^<]*)<\/span>/g, " $1 ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const WINGS = /\bWhen you activate the talisman, you sprout [\w ]+? until the end of your turn, granting you an? (fly|swim|climb|burrow) Speed of (\d+) feet and an? \+(\d+) (circumstance|status|item) bonus to AC against reactions triggered by your movement\. You then (Fly|Swim|Climb|Burrow)\./i;
const MORE = /\bIf you activate the talisman with 1 action, /i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const END_OF_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };

// The plan (its save the 1 action's), the item → the ways card, or the same plan.
export function withActionWays(plan, item) {
    const text = plainOf(item?.system?.description?.value);
    const wings = WINGS.exec(text);
    if (!wings || !MORE.test(text) || !/\bActivate\s+F\s+or\s+1\b/.test(text) || plan?.resolution?.kind !== "save" || plan.builtin) return plan;
    const [, type, feet, bonus, bonusType, move] = wings;
    const note = { label: `+${bonus} AC against reactions to its movement`, text: `+${bonus} ${bonusType.toLowerCase()} bonus to AC against reactions triggered by your movement, until the end of your turn.`, duration: END_OF_TURN };
    const { notes: _notes, partial: _partial, ...save } = plan;
    const own = {
        ...save,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [note] } } },
        item: { ...(plan.item ?? {}), recipient: "user", speeds: [{ type: type.toLowerCase(), value: Number(feet), duration: END_OF_TURN }] },
        notes: [`Then ${move} (its own move on the map).`]
    };
    const buffet = { ...save, automation: { level: "automatic" }, targeting: { ...(plan.targeting ?? {}), target: "each adjacent enemy" } };
    return {
        ...save,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        ways: [
            { name: "Free action: the wings", html: `<p>${wings[0]}</p>`, plan: own },
            { name: "1 action: the wings and the buffet", html: `<p>${wings[0]}</p><p>${text.slice(text.search(MORE))}</p>`, plan: { ...own, again: { plan: buffet, later: false } } }
        ],
        once: true
    };
}
