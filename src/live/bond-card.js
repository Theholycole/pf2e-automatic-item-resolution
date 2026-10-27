// The bond card: a bond its user forms with a willing creature next to them (src/compiler/unique-rules.js withBond — The Marriage). Bond, with
// that creature targeted, gives both an Effect for the bond (the item's last bond gone first, on whoever had it); scripts/bonds.js then offers
// its user the counteract card when PF2e gives the bonded creature one of the bond's conditions. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const KEY = "bond";

export const isBond = (plan) => plan?.builtin === "bond" && Boolean(plan.bond?.conditions?.length);

export function createBondCard({ plan, item, user }) {
    return { kind: "bond", status: "open", plan, item, user, results: [] };
}

const listed = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0] ?? "");
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

// "A bond with the targeted willing creature next to its user (within 5 feet) until it's used again: …".
export const bondText = (bond) => `A bond with the targeted willing creature next to its user (within ${bond.reach} feet), until it's used again for another`;

// The words of each side's Effect.
export function bondWords(bond, { self, other, role }) {
    const shared = `${self} and ${other} share telepathy within ${bond.telepathy} feet, and while both are alive on the same plane each knows the other's direction, distance and conditions`;
    if (role !== "user") return shared;
    return `${shared}. If ${other} becomes ${listed(bond.conditions.map(capital))}, ${self} may use a reaction to counter it (the counteract card comes up: its class DC − 10, rank ${bond.counter.rank}); a failure gives ${self} that condition too, and either way the bond ends`;
}

// Each side's Effect source; partner: the other's actor uuid, role "user" or "partner".
export function bondEffectSource(bond, { item = {}, user = {}, self, other, partner, role, worldTime = 0, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: `${item.name}: bonded to ${other}`,
        type: "effect",
        img: item.img ?? "icons/svg/net.svg",
        flags: { [moduleId]: { [KEY]: { item: item.uuid ?? item.name ?? null, name: item.name ?? null, partner, role, conditions: [...bond.conditions], counter: { ...bond.counter }, user: role === "user" ? user : null } } },
        system: {
            description: { value: `<p>${escape(bondWords(bond, { self, other, role }))}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative: null },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules: []
        }
    };
}
export const bondOf = (effect, moduleId = "pf2e-automatic-item-resolution") => effect?.flags?.[moduleId]?.[KEY] ?? null;

// A condition the bonded creature just got that the bond counters: its slug, or null.
export function counteredBy(bond, slug) {
    return bond?.role === "partner" && (bond.conditions ?? []).includes(String(slug ?? "")) ? String(slug) : null;
}

// The counteract card's own numbers for it: { conditions, modifier, rank, failCopies, endsBond, notes }.
export function bondCounteract(bond, slug, classModifier) {
    const has = Number.isFinite(classModifier);
    return { conditions: [slug], modifier: has ? classModifier : 0, rank: bond.counter.rank, failCopies: Boolean(bond.counter.failCopies), endsBond: bond.item, notes: has ? [] : ["Its user has no class DC: give its modifier by hand."] };
}

export function bondCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const hint = open && canApply ? `<p class="aar-hint">Target the willing creature next to ${escape(state.user.name)}, then press Bond.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Bond</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">${escape(bondText(state.plan.bond))}.</p>${hint}${results}${controls}</section>`;
}
