// The readied-roll card (src/compiler/fortune.js, src/compiler/readied-bonus.js): an item that has its user roll their
// next roll of a kind twice and keep the better (Sunweave's initiative, Gorum's Tear's attack roll), or that gives its user
// a bonus for a moment (Eclipse's +2 to the Stealth check, Sparkwarden's +1 to AC and saves and resistance 2 for the
// turn). Apply gives the user an Effect with PF2e's own rules — RollTwice, or FlatModifier and Resistance — for that roll
// or that long; PF2e removes a RollTwice Effect after its roll, and scripts/fortune.js removes one for a single roll
// after that roll. Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "rollTwice";
const SAVES = new Set(["saving-throw", "fortitude", "reflex", "will"]);
export const isFortune = (plan) => (plan?.builtin === "roll-twice" && Boolean(plan.rollTwice?.selector)) || (plan?.builtin === "readied-bonus" && Boolean(plan.bonus?.modifiers?.length || plan.bonus?.degree || plan.bonus?.resistance || plan.bonus?.immunity || plan.bonus?.halfDamage));

const ROLL_WORDS = { initiative: "initiative roll", "attack-roll": "attack roll", "saving-throw": "saving throw", "skill-check": "skill check", perception: "Perception check", fortitude: "Fortitude save", reflex: "Reflex save", will: "Will save", ac: "AC", check: "check" };
const actionWords = (predicate) => (predicate?.[0]?.or ?? []).map((option) => String(option).replace(/^action:/, "").replace(/-/g, " ")).join(", ");
const nameOf = (selector) => ROLL_WORDS[selector] ?? (/-dc$/.test(selector) ? `${selector.charAt(0).toUpperCase()}${selector.slice(1, -3)} DC` : `${selector.charAt(0).toUpperCase()}${selector.slice(1)} check`);

// The roll in words: "initiative roll", "Athletics check (force open, reposition, shove)".
export function rollWords(rollTwice) {
    if (rollTwice.selector === "legendary") return `d20 roll with legendary proficiency, if it's its next action${rollTwice.rolls ? ` (${rollTwice.rolls.map((roll) => roll.label ?? roll.selector).join(", ") || "none"})` : ""}`;
    const actions = actionWords(rollTwice.predicate);
    return actions ? `${nameOf(rollTwice.selector)} (${actions})` : nameOf(rollTwice.selector);
}

const DEGREE_WORDS = { all: "one degree better", success: "a success becomes a critical success", criticalFailure: "a critical failure becomes a failure", "to-success": "at least a success" };

// A bonus in words: "+1 status bonus to AC and saving throws, resistance 2 to damage", "Performance check: a success becomes a
// critical success".
export function bonusWords(bonus) {
    const [first] = bonus.modifiers;
    // (Several rolls, one spending it: "Deception check or Diplomacy check …"; else "AC and saving throw".)
    const targets = bonus.modifiers.map((modifier) => nameOf(modifier.selector)).join((bonus.spend?.length ?? 0) > 1 ? " or " : " and ");
    const actions = first ? actionWords(first.predicate) : "";
    const degree = bonus.degree ? `${nameOf(bonus.degree.selector)}${actionWords(bonus.degree.predicate) ? ` (${actionWords(bonus.degree.predicate)})` : ""}: ${[...new Set(Object.entries(bonus.degree.adjustment).map(([key, value]) => DEGREE_WORDS[value === "to-success" ? "to-success" : key]))].join(", ")}` : null;
    // ("resistance 5 to physical damage", "resistance 5 to mental, poison or spirit damage" — the one that hit.)
    const types = [].concat(bonus.resistance?.type ?? []).filter((type) => type !== "all-damage");
    const resistance = bonus.resistance ? `resistance ${bonus.resistance.value} to ${types.length ? `${types.length > 1 ? `${types.slice(0, -1).join(", ")} or ${types.at(-1)}` : types[0]} damage` : "damage"}${(bonus.resistanceAlso ?? []).map((entry) => ` (${entry.value} to damage from ${entry.from})`).join("")}` : null;
    // ("immunity to physical damage": none of it.)
    const immunity = bonus.immunity ? `immunity to ${bonus.immunity.type} damage` : null;
    // (Laurel of the Empath's: half of it.)
    const halved = bonus.halfDamage ? "half damage from the triggering attack" : null;
    // ("against mental effects": a trait predicate, Psychic Warding Bracelet's.)
    const traits = (first?.predicate ?? []).filter((term) => typeof term === "string" && term.startsWith("item:trait:")).map((term) => term.slice("item:trait:".length));
    const against = traits.length ? ` against ${traits.join(" or ")} effects` : "";
    // (Resolute Shield's: the shield takes what gets through too.)
    const shared = bonus.shieldShare ? "the shield taking the rest of the damage too" : null;
    // (Thrice-Fried Mudwings': its Speed lowered the first time, ended the second.)
    const steps = bonus.speedSteps ? `its ${bonus.speedSteps.type} Speed ${bonus.speedSteps.feet} feet or half its Speed the first time${bonus.speedSteps.secondEnds ? ", ended the second" : ""}` : null;
    // (Pyrefeather Cloak's: a flat check to end its persistent fire at once.)
    const recovery = bonus.recovery ? `a flat check now to end persistent ${bonus.recovery.types.join(" or ")} damage` : null;
    // (Crown of the Fire Eater's: healing just after the damage.)
    const healed = bonus.healAfter ? `then it regains Hit Points equal to its ${bonus.healAfter.type} damage before resistance, at most ${bonus.healAfter.max}` : null;
    // (Scale of Igroon's: ended by its user's next activation or Shield Block.)
    const ends = bonus.endsOn ? "ending if it Activates another item or uses Shield Block" : null;
    // (Boots of the Blight's: Quickened after a success, its extra action only to Stride.)
    const success = bonus.onSuccess ? `on a success, ${bonus.onSuccess.condition.slug} for ${bonus.onSuccess.condition.duration.value} ${bonus.onSuccess.condition.duration.value === 1 ? bonus.onSuccess.condition.duration.unit.replace(/s$/, "") : bonus.onSuccess.condition.duration.unit}${bonus.onSuccess.only ? ` (its extra action only to ${bonus.onSuccess.only})` : ""}` : null;
    // (Warrior's Training Ring's more for an expert: "+4 for an expert in any weapon".)
    const expert = first?.ifExpert ? ` (+${first.ifExpert} for an expert in any weapon)` : "";
    return [first ? `+${first.value} ${first.type} bonus to ${targets}${actions ? ` (${actions})` : ""}${against}${expert}` : null, resistance, immunity, halved, degree, shared, success, steps, recovery, healed, ends].filter(Boolean).join(", ");
}

// What the card says it gives: "next initiative roll: roll twice, take the better" / "+2 status bonus to Stealth check, for that roll".
export function readiedWords(plan) {
    if (plan.builtin === "roll-twice") return `next ${rollWords(plan.rollTwice)}: roll twice, take the better${plan.rollTwice.duration?.expiry === "turn-end" ? ", before the end of the next turn" : ""}${plan.rollTwice.onFailure ? `; on a failure, its user takes ${plan.rollTwice.onFailure.formula} ${plan.rollTwice.onFailure.persistent ? "persistent " : ""}${plan.rollTwice.onFailure.type} damage` : ""}`;
    const bonus = plan.bonus;
    // (Only against what triggered it: "against what triggered it, this turn".)
    const time = bonus.duration?.expiry === "turn-start" ? "until the start of the next turn" : bonus.duration?.value ? "until the end of the next turn" : "this turn";
    const until = bonus.lasting ? "for the next such roll, whenever it comes" : bonus.spend?.length ? "for the next such roll" : bonus.against ? `against what triggered it, ${time}` : time === "this turn" ? "until the end of this turn" : time;
    // (What the triggering attack's result does to the attacker: "if it misses, the attacker dazzled for 1 round".)
    const miss = bonus.onAttack?.miss?.condition;
    const hit = bonus.onAttack?.hit?.damage;
    // (And what a critical success at that roll gives: "on a critical success, 2 temporary Hit Points for 1 minute".)
    const critical = bonus.onCritical;
    const riders = [miss ? `if it misses, the attacker ${miss.slug}${miss.value ? ` ${miss.value}` : ""} for ${miss.duration.value} round${miss.duration.value === 1 ? "" : "s"}` : null, hit ? `if it hits, ${hit.formula} ${hit.type} damage to the attacker` : null, critical ? `on a critical success, ${critical.tempHP} temporary Hit Points for ${critical.duration.value} ${critical.duration.value === 1 ? critical.duration.unit.replace(/s$/, "") : critical.duration.unit}` : null].filter(Boolean);
    return `${bonusWords(bonus)}, ${until}${riders.length ? `; ${riders.join("; ")}` : ""}`;
}

// A bonus for the creature the presser targets, not its user (src/compiler/readied-bonus.js bonus.recipient).
export const isForTarget = (plan) => plan?.builtin === "readied-bonus" && plan.bonus?.recipient === "target";

export function createFortuneCard({ plan, item, user }) {
    return { kind: "fortune", status: "open", plan, item, user, results: [] };
}

// The Effect's rules: PF2e's RollTwice (removed after its roll), or a FlatModifier per bonus and a Resistance.
export function readiedRules(plan) {
    if (plan.builtin === "roll-twice") {
        const rollTwice = plan.rollTwice;
        // (Its user's legendary statistics, Perfected Robes': a RollTwice each, the first roll among them spending the Effect.)
        if (rollTwice.selector === "legendary") return (rollTwice.rolls ?? []).map((roll) => ({ key: "RollTwice", selector: roll.selector, keep: rollTwice.keep ?? "higher", removeAfterRoll: true, ...(roll.predicate ? { predicate: roll.predicate } : {}) }));
        return [{ key: "RollTwice", selector: rollTwice.selector, keep: rollTwice.keep ?? "higher", removeAfterRoll: true, ...(rollTwice.predicate ? { predicate: rollTwice.predicate } : {}) }];
    }
    const label = plan.source?.name ?? null;
    return [
        ...plan.bonus.modifiers.map((modifier) => ({ key: "FlatModifier", selector: modifier.selector, type: modifier.type, value: modifier.value, ...(label ? { label } : {}), ...(modifier.predicate ? { predicate: modifier.predicate } : {}) })),
        ...(plan.bonus.resistance ? [{ key: "Resistance", type: plan.bonus.resistance.type, value: plan.bonus.resistance.value }] : []),
        // (A higher one against some sources, a warding tattoo's against fiends: its own Resistance, predicated.)
        ...(plan.bonus.resistanceAlso ?? []).map((entry) => ({ key: "Resistance", type: entry.type, value: entry.value, predicate: entry.predicate })),
        ...(plan.bonus.immunity ? [{ key: "Immunity", type: plan.bonus.immunity.type }] : []),
        ...(plan.bonus.degree ? [{ key: "AdjustDegreeOfSuccess", selector: plan.bonus.degree.selector, adjustment: plan.bonus.degree.adjustment, ...(label ? { label } : {}), ...(plan.bonus.degree.predicate ? { predicate: plan.bonus.degree.predicate } : {}) }] : [])
    ];
}

// The Effect on the user: its rules, for its roll (a minute at most, should the roll not come) or its time.
export function fortuneEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId }) {
    const plan = state.plan;
    const fortune = plan.builtin === "roll-twice";
    const spend = fortune ? [plan.rollTwice.selector] : plan.bonus.spend ?? [];
    // (Kept until its roll comes, whenever: Psychic Warding Bracelet's next save against a mental effect.)
    // (A fortune with a time of its own, Aerekostes's to the end of the next turn: that.)
    const duration = plan.bonus?.lasting ? { value: -1, unit: "unlimited", expiry: null } : fortune && plan.rollTwice.duration ? plan.rollTwice.duration : fortune || spend.length ? { value: 1, unit: "minutes", expiry: "turn-start" } : plan.bonus.duration;
    return {
        name: `${state.item.name}: ${fortune ? "roll twice" : "bonus"}`,
        type: "effect",
        img: img ?? (fortune ? "icons/svg/d20-highlight.svg" : "icons/svg/upgrade.svg"),
        // (Only against what triggered it: what spends it — with resistance or immunity, the damage still to come after a hit; with a
        // bonus to saves, its creature's save.)
        flags: { [moduleId]: { [MODULE_KEY]: { item: state.item, user: state.user, selector: spend[0] ?? null, spend, ...(plan.bonus?.onCritical ? { onCritical: plan.bonus.onCritical } : {}), ...(plan.bonus?.onSuccess ? { onSuccess: plan.bonus.onSuccess } : {}), ...(plan.bonus?.shieldShare ? { shieldShare: { uuid: state.item.uuid ?? null, name: state.item.name } } : {}), ...(plan.bonus?.halfDamage ? { halfDamage: true } : {}), ...(plan.bonus?.healAfter ? { healAfter: plan.bonus.healAfter } : {}), ...(plan.bonus?.endsOn ? { endsOn: plan.bonus.endsOn } : {}), ...(plan.bonus?.against ? { against: { damage: Boolean(plan.bonus.resistance || plan.bonus.immunity || plan.bonus.halfDamage), save: plan.bonus.modifiers.some((modifier) => SAVES.has(modifier.selector)), ...(plan.bonus.onAttack ? { onAttack: plan.bonus.onAttack } : {}) } } : {}) } } },
        system: {
            description: { value: `<p>${escape(readiedWords(plan))}.${(plan.notes ?? []).length ? ` ${escape(plan.notes.join(" "))}` : ""}</p>` },
            duration: { ...duration, sustained: false },
            start: { value: worldTime, initiative },
            rules: readiedRules(plan)
        }
    };
}

export function fortuneCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const fortune = state.plan.builtin === "roll-twice";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    // (Another creature's bonus — Resonant Guitar's for the creature attacked: the one the presser targets.)
    const other = isForTarget(state.plan);
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${fortune ? "Roll it twice" : other ? "Give it to the creature targeted" : "Gain the bonus"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    const whose = other ? `For the creature targeted${state.plan.targeting?.range ? ` (within ${state.plan.targeting.range})` : ""}: ` : `${state.user.name}'s `;
    // (The roll it's for, its user's own: Mesmerizing Opal's Feint — said, then.)
    const then = open && state.plan.then ? `<p class="aar-hint">Then: ${escape(state.plan.then)}.</p>` : "";
    // (When it can't be used, Deflecting Branch's: its user's to keep to.)
    const limits = open && (state.plan.bonus?.limits ?? []).length ? `<p class="aar-hint">${state.plan.bonus.limits.map(escape).join(" ")}</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${fortune ? "Fortune" : "Bonus"}</span></header><p class="aar-actions">${escape(whose)}${escape(readiedWords(state.plan))}.</p>${then}${limits}${notes}${results}${controls}</section>`;
}
