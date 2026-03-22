/**
 * enums.ts
 * Tests TypeScript enums mapping to Zig enums.
 */

// Numerical enum
enum Direction {
    Up,
    Down,
    Left,
    Right
}

// String enum
enum Color {
    Red = "RED",
    Green = "GREEN",
    Blue = "BLUE"
}

const currentDirection: Direction = Direction.Up;
const favoriteColor: Color = Color.Blue;

function getDirectionName(dir: Direction): string {
    switch (dir) {
        case Direction.Up: return "Up";
        case Direction.Down: return "Down";
        case Direction.Left: return "Left";
        case Direction.Right: return "Right";
    }
}

console.log(currentDirection);
console.log(favoriteColor);
console.log(getDirectionName(Direction.Down));

export {
    Direction,
    Color,
    currentDirection,
    favoriteColor,
    getDirectionName
};
