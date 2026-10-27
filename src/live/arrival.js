// Which tokens are adjacent to some spaces (scripts/cast-arrival.js: Fiendish Teleportation's brimstone): spaces and tokens as { x, y, width,
// height } in pixels and grid squares, grid the square's size in pixels. A token is adjacent when its squares and a space's touch, side or
// corner, without overlapping it; each once. Pure.

const squaresOf = ({ x, y, width = 1, height = 1 }, grid) => {
    const left = Math.round(x / grid);
    const top = Math.round(y / grid);
    const squares = [];
    for (let dx = 0; dx < Math.max(1, Math.round(width)); dx++) for (let dy = 0; dy < Math.max(1, Math.round(height)); dy++) squares.push([left + dx, top + dy]);
    return squares;
};

export function adjacentTo(spaces, tokens, grid) {
    const near = new Set();
    for (const space of spaces) {
        const own = squaresOf(space, grid);
        for (const [index, token] of tokens.entries()) {
            const theirs = squaresOf(token, grid);
            const overlaps = theirs.some(([a, b]) => own.some(([c, d]) => a === c && b === d));
            const touches = theirs.some(([a, b]) => own.some(([c, d]) => Math.max(Math.abs(a - c), Math.abs(b - d)) === 1));
            if (touches && !overlaps) near.add(index);
        }
    }
    return [...near].map((index) => tokens[index]);
}
