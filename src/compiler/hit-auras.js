// A wound that makes the creature hit give off an aura for a while: Ghoul Stiletto's "afflicts the next living target struck by the
// dagger with a terrible wound … The creature emits a stench aura in a @Template[type:emanation|distance:10] for 1 minute. During that
// time, the affected creature, as well as any creature that starts or ends its turn in the aura, must succeed at a @Check[fortitude|dc:17]
// save or become Sickened 1 (plus Slowed 1 as long as it's sickened on a critical failure)", Ghast Stiletto's "For the next minute, the
// target creature, as well as any creatures within a @Template[emanation|distance:10], must succeed at …". The weapon's next Strike: on a
// hit, the creature's save card, and strike.zone — the ability module's zone attached to that creature's token, the same save for the
// others in it (at a turn's start or end, or there as it starts and on entering). What a critical failure adds while it's sickened, the
// immunity and a penalty inside are notes. Pure.

import { compileStrike } from "./strikes.js";

const NEXT_STRUCK = /\b(?:afflicts|affects) the next (living )?(?:target|creature) struck by the [\w' -]+? with\b/i;
const EMITS = /\bThe creature emits an? [\w ]+? aura in an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? for (\d+) (minutes?|rounds?)\./i;
const NEXT_MINUTE = /\bFor the next (minute|\d+ minutes), the target creature, as well as any creatures within an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})?, must\b/i;
const SAVE_OR = /\bmust succeed at an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save or become (@UUID\[[^\]]+\]\{[^}]+\})(?: \(plus ([^)]*?) on a critical failure\))?\./i;
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds" };

// The activation's html, its base, the item → the Strike plan with strike.zone, or null.
export function hitAuraPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const next = NEXT_STRUCK.exec(text);
    const emits = EMITS.exec(text);
    const minute = emits ? null : NEXT_MINUTE.exec(text);
    const save = SAVE_OR.exec(text);
    if (!next || !(emits || minute) || !save) return null;
    // (The weapon's next Strike, its hit's save — the Strike reader's own plan of these words.)
    const words = `<p><strong>Effect</strong> The next Strike you make with this weapon carries it. On a hit, the target must succeed at a ${save[1]} save or become ${save[2]}.</p>`;
    const strike = compileStrike({ ...item, system: { ...(item?.system ?? {}), description: { value: words } } }, base, options);
    const saved = strike?.strike?.save;
    if (!saved?.resolution || saved.resolution.kind !== "save") return null;
    const radius = Number(emits ? emits[1] : minute[2]);
    const lasts = emits ? { value: Number(emits[2]), unit: UNITS[emits[3].toLowerCase()] } : { value: /^\d+/.test(minute[1]) ? Number(minute[1].split(" ")[0]) : 1, unit: "minutes" };
    const plain = text.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const notes = [
        ...(next[1] ? ["Only a living creature: the GM's call for any other."] : []),
        ...(save[3] ? [`On a critical failure, it's also ${save[3].replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")} (by hand).`] : []),
        ...[/\bA creature that succeeds at its save is temporarily immune[^.]*\./i, /\bWhile within the emanation, [^.]*\./i].map((pattern) => pattern.exec(plain)?.[0]).filter(Boolean)
    ];
    const zone = {
        area: { type: "emanation", value: radius },
        centre: "self",
        range: null,
        lasts: { mode: "fixed", ...lasts, expiry: "turn-start", anchor: "effect-start" },
        untilReused: false,
        concealed: false,
        terrain: [],
        others: false,
        hazard: null,
        // (Ghoul's at a turn's start or end in it; Ghast's for those in it as it starts and on entering.)
        saves: [{ when: emits ? ["start", "end"] : ["initial", "enter"], plan: { ...saved, trigger: { event: "zone" }, targeting: { target: "a creature in the aura", range: null, area: null } } }],
        damage: [],
        effect: null,
        modifiers: [],
        notes
    };
    return { ...strike, automation: { level: "guided" }, strike: { ...strike.strike, zone }, notes: [...(strike.notes ?? []), ...notes], partial: true };
}
