/**
 * objects_interfaces.ts
 * Tests object literals, interfaces, and type aliases mapping to Zig structs.
 */

interface Point {
    x: number;
    y: number;
}

type Size = {
    width: number;
    height: number;
};

// Object using interface
const origin: Point = {
    x: 0,
    y: 0
};

// Object using type alias
const viewport: Size = {
    width: 1920,
    height: 1080
};

// Nested objects
interface Rect {
    position: Point;
    size: Size;
}

const boundingBox: Rect = {
    position: { x: 10, y: 10 },
    size: viewport
};

// Structural typing check
function logPoint(p: Point): void {
    console.log(`Point: ${p.x}, ${p.y}`);
}

logPoint({ x: 5, y: 5 });

console.log(origin.x, origin.y);
console.log(viewport.width, viewport.height);
console.log(boundingBox.position.x, boundingBox.size.width);

export {
    Point,
    Size,
    Rect,
    origin,
    viewport,
    boundingBox,
    logPoint
};
