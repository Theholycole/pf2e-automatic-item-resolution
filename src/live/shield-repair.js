// What an item's use stops until its user's next daily preparations (2026-10-27): Forgefather's Seal's Seal of Mending, after which "the seal's
// ability to automatically repair shields becomes inactive" — objects.pauses { what, untilRest }, an Effect on its user with no rules that
// scripts/shield-repair.js reads (no repair while it's there) and deletes at its next rest. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const PAUSED = { "shield-repair": { name: "shields not repaired", words: "Its shields don't recover Hit Points at the start of its turns" } };

// "its shields' repair at each turn's start stops until its next daily preparations".
export const pauseWords = (pauses) => `${(PAUSED[pauses?.what]?.words ?? "Its effect stops").replace(/^Its/, "its")}${pauses?.untilRest ? " until its next daily preparations" : ""}`;

export function pauseEffectSource(pauses, { item = {}, user = {}, worldTime = 0, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: `${item.name}: ${PAUSED[pauses.what]?.name ?? "paused"}`,
        type: "effect",
        img: item.img ?? "icons/svg/cancel.svg",
        flags: { [moduleId]: { pauses: pauses.what, ...(pauses.untilRest ? { untilRest: true } : {}), from: item.name ?? null } },
        system: {
            description: { value: `<p>${escape(pauseWords(pauses).replace(/^./, (letter) => letter.toUpperCase()))}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative: null },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules: []
        }
    };
}
