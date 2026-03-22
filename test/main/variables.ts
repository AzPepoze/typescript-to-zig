/**
 * variables.ts
 * Tests various variable declaration styles.
 */

// const -> Zig const
const constantNumber: number = 100;

// let -> Zig var
let mutableNumber: number = 200;
mutableNumber = 300;

// Re-assignment tests
let status: string = "initial";
status = "updated";

// Multi-declaration (if supported by transpiler)
const x: number = 1, y: number = 2;

console.log(constantNumber);
console.log(mutableNumber);
console.log(status);
console.log(x, y);

export {
    constantNumber,
    mutableNumber,
    status,
    x,
    y
};
