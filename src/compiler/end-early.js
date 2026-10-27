// How a creature ends an item's effect on it early, said by the item (2026-10-27): Fire-Douse Snare's Interact with its flat check — DC 10 the
// first try, DC 5 the next, the third ending it outright —, Dust Pods' one try at DC 5, Grease Snare's and Hoof Stakes Snare's three Interact
// actions. → plan.endEarly { how: { kind: "flat", steps } |
// { kind: "actions", count }, conditions, said }: the end-early card the item module posts at each creature its card affected
// (scripts/end-early.js). steps: each try's DC, "auto" when that try ends it outright. Pure.

const COUNT = { an: 1, one: 1, two: 2, three: 3, four: 4 };
const CONDITIONS = /\b(blinded|dazzled|deafened|clumsy|enfeebled|sickened|frightened|stupefied|fatigued|immobilized|slowed)\b/gi;

export function readEndEarly(text) {
    const plain = String(text ?? "");
    const flat = /\bA creature ([\w ]+?) by the [\w ]+? can use an Interact action to attempt a @Check\[flat\|dc:(\d+)[^\]]*\](?: check)?(?:; on a success, it removes the condition| to remove the condition)\./i.exec(plain);
    if (flat) {
        const again = /\bOn a failure, it can try again, with a @Check\[flat\|dc:(\d+)[^\]]*\] check on the next Interact check\./i.exec(plain);
        const auto = /\bIf it fails a second time, it automatically removes the condition with a third Interact action\./i.exec(plain);
        const conditions = [...new Set([...flat[1].matchAll(CONDITIONS)].map((match) => match[1].toLowerCase()))];
        return { how: { kind: "flat", steps: [Number(flat[2]), ...(again ? [Number(again[1])] : []), ...(again && auto ? ["auto"] : [])] }, conditions, said: [flat[0], ...(again ? [again[0]] : []), ...(again && auto ? [auto[0]] : [])] };
    }
    const actions = /\b(?:A creature can use|until the creature or an ally spends) (one|two|three|four) Interact actions? to (?:carefully )?(?:remove|wipe away) the (\w+)\b[^.]*\./i.exec(plain);
    if (actions) return { how: { kind: "actions", count: COUNT[actions[1].toLowerCase()] }, conditions: [], said: [actions[0].replace(/^until /i, "")] };
    return null;
}

// (Or one row's own way out, Blindpepper Bolt's success: "It can end the effect early if it spends an action, which has the manipulate trait, to
// wipe down its eyes" — its action, the row's degree from the text before it: endEarly.degrees, the card only for the creatures that rolled it
// (scripts/end-early.js); how.trait the action's, not an Interact.)
const ROW_ACTION = /^It can end the effect early if it spends (an|one|two|three) actions?, which (?:has|have) the (manipulate) trait, to [^.]+\.$/i;
const ROWS = /\b(Critical Success|Critical Failure|Success|Failure)\b/g;
const DEGREES = { "critical success": "criticalSuccess", success: "success", failure: "failure", "critical failure": "criticalFailure" };

// A note and its item's text (plain) → the end-early for that note's row, or null.
export function readRowEndEarly(note, text) {
    const said = String(note ?? "").trim();
    const found = ROW_ACTION.exec(said);
    const at = found ? String(text ?? "").indexOf(said) : -1;
    const row = at >= 0 ? [...String(text).slice(0, at).matchAll(ROWS)].at(-1) : null;
    if (!row) return null;
    return { how: { kind: "actions", count: COUNT[found[1].toLowerCase()], trait: found[2].toLowerCase() }, conditions: [], degrees: [DEGREES[row[1].toLowerCase()]], said: [said] };
}

// (Or a skill check to pull free, Antler Arrow's bow critical specialization — "It's stuck to the surface until it pulls the missile free: an
// Interact action and a DC 10 Athletics check." — and its harder DC after a critical hit, "If the hit with the antler arrow is a critical hit
// and you have access to the bow critical specialization effect, the DC of the Athletics check increases to 15": how { kind: "check", skill,
// dc, criticalDC }, the card's tick for that DC (its archer's specialization the card can't see), ending the Immobilized. 2026-10-27.)
const STUCK = /^It's stuck to the surface until it pulls the missile free: an Interact action and a DC (\d+) (Athletics|Acrobatics) check\.$/i;
const STUCK_CRITICAL = /^If the hit with the [\w' -]+? is a critical hit and you have access to the bow critical specialization effect, the DC of the (?:Athletics|Acrobatics) check increases to (\d+)\.$/i;

// Notes and the rows' degrees with that condition → { endEarly, said } or null.
export function readPullFree(notes, degrees) {
    const sentences = (notes ?? []).map((note) => String(note).trim());
    const stuck = sentences.map((sentence) => STUCK.exec(sentence)).find(Boolean);
    if (!stuck || !degrees.length) return null;
    const critical = sentences.map((sentence) => STUCK_CRITICAL.exec(sentence)).find(Boolean);
    const said = [stuck[0], ...(critical ? [critical[0]] : [])];
    return { endEarly: { how: { kind: "check", skill: stuck[2].toLowerCase(), dc: Number(stuck[1]), ...(critical ? { criticalDC: Number(critical[1]) } : {}) }, conditions: ["immobilized"], degrees, said }, said };
}

// (Or a way for each row, read from its modifiers' "until" — Glittering Snare's "for 1 minute or until it uses an Interact action to remove the
// glitter", "or until it spends a 2-action activity, which has the manipulate trait, to remove the glitter", the critical failure's 3-action one:
// endEarly.byDegree { degree: how }, the card's try for each creature by the degree it rolled; all its Effects on that creature gone. 2026-10-27.)
const UNTIL_ACTION = /^it uses an? Interact action to remove (?:the [\w ]+|it)$/i;
const UNTIL_ACTIVITY = /^it spends an? (\d)-action activity, which has the (\w+) trait, to remove (?:the [\w ]+|it)$/i;
export function readRowWays(outcomes) {
    const byDegree = {};
    const said = [];
    for (const [degree, row] of Object.entries(outcomes ?? {})) {
        const until = (row?.modifiers ?? []).map((modifier) => String(modifier.until ?? "").trim()).find(Boolean);
        if (!until) continue;
        const activity = UNTIL_ACTIVITY.exec(until);
        if (UNTIL_ACTION.test(until)) byDegree[degree] = { kind: "actions", count: 1 };
        else if (activity) byDegree[degree] = { kind: "actions", count: Number(activity[1]), trait: activity[2].toLowerCase() };
        else return null;
        said.push(until);
    }
    const degrees = Object.keys(byDegree);
    if (!degrees.length) return null;
    return { how: byDegree[degrees[0]], byDegree, conditions: [], degrees, said };
}
