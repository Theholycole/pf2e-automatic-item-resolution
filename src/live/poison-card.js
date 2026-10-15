// Injury poisons on a weapon (PF2e leaves it to the table). Using the poison
// posts a card: which piercing or slashing weapon to coat. Apply puts an Effect
// on the user that marks the weapon. That weapon's next Strike that hits exposes
// the target (the poison's save card, the ability module's); a critical miss
// spends it; a miss keeps it ("expend it as normal for an injury poison by
// either hitting a target or critically failing an attack roll"). Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "poison";

// An injury poison's plan: a save against a fixed DC on the creature a Strike hits (the ability compiler's reading).
export const isInjuryPoison = (plan) => plan?.item?.delivery === "injury" && plan?.resolution?.kind === "save" && plan.trigger?.event === "strike" && plan.resolution.check?.against?.dc === "fixed";

// The weapons a poison can coat: piercing or slashing (or versatile P or S), held ones first.
export function poisonableWeapons(weapons) {
    const deals = (weapon) => {
        const type = weapon?.system?.damage?.damageType;
        const traits = weapon?.system?.traits?.value ?? [];
        return ["piercing", "slashing"].includes(type) || traits.includes("versatile-p") || traits.includes("versatile-s");
    };
    return (weapons ?? [])
        .filter(deals)
        .map((weapon) => ({ id: weapon.id ?? weapon._id, name: weapon.name, held: weapon.system?.equipped?.carryType === "held" }))
        .sort((a, b) => Number(b.held) - Number(a.held));
}

export function createPoisonCard({ plan, item, user, weapons }) {
    return { kind: "poison", status: "open", plan, item, user, weapons, weapon: weapons.length ? 0 : null, results: [] };
}

// "DC 18 Fortitude save", from the poison's plan.
export function saveText(plan) {
    const check = plan?.resolution?.check ?? {};
    const statistic = String(check.statistic ?? "fortitude");
    return `DC ${check.against?.value ?? "?"} ${statistic.charAt(0).toUpperCase()}${statistic.slice(1)} save`;
}

export function poisonCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const weapon = state.weapons[state.weapon];
    const choice = !state.weapons.length ? `<p class="aar-warning">${escape(state.user.name)} has no piercing or slashing weapon to coat.</p>`
        : open && canApply && state.weapons.length > 1
            ? `<p class="aar-actions">Coat: <select data-air-field="weapon">${state.weapons.map((entry, index) => `<option value="${index}"${index === state.weapon ? " selected" : ""}>${escape(entry.name)}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Coat: ${escape(weapon?.name ?? "")}</p>`;
    const hint = open ? `<p class="aar-hint">Its next Strike that hits exposes the target (${escape(saveText(state.plan))}); a critical miss wastes it.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.weapons.length ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Coat the weapon</button></footer>` : open && state.weapons.length ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to coat it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">injury poison</span></header>${choice}${hint}${results}${controls}</section>`;
}

// The Effect on the user that marks the coated weapon; it lasts until the poison is spent.
export function poisonEffectSource({ state, weapon, description = "", img = null, worldTime = 0, moduleId }) {
    return {
        name: `${state.item.name} (on ${weapon.name})`,
        type: "effect",
        img: img ?? "icons/svg/poison.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { weaponId: weapon.id, weaponName: weapon.name, item: state.item, plan: state.plan } } },
        system: {
            description: { value: `<p>${escape(saveText(state.plan))} on the next creature ${escape(weapon.name)} hits; a critical miss wastes it.</p>${description}` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative: null },
            rules: []
        }
    };
}

// What a Strike with the coated weapon does to the poison: "expose" the target, "spend" it unused, or "keep" it.
export function poisonStrike(outcome) {
    if (outcome === "success" || outcome === "criticalSuccess") return "expose";
    if (outcome === "criticalFailure") return "spend";
    return "keep";
}
