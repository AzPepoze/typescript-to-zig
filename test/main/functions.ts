/**
 * functions.ts
 * Tests function declarations, parameters, and return types.
 */

// Basic function declaration
function add(a: number, b: number): number {
    return a + b;
}

// Arrow function
const multiply = (a: number, b: number): number => a * b;

// Function with optional parameters
function greet(name: string, title?: string): string {
    if (title) {
        return `Hello, ${title} ${name}`;
    }
    return `Hello, ${name}`;
}

// Default parameters
function power(base: number, exponent: number = 2): number {
    return Math.pow(base, exponent);
}

// Higher-order function
function executeOperation(a: number, b: number, operation: (x: number, y: number) => number): number {
    return operation(a, b);
}

// Function with multiple return types (Union)
function parseID(id: string | number): number {
    if (typeof id === "string") {
        return parseInt(id, 10);
    }
    return id;
}

console.log(add(5, 3));
console.log(multiply(4, 2));
console.log(greet("Zig"));
console.log(greet("Zig", "Master"));
console.log(power(2));
console.log(power(2, 3));
console.log(executeOperation(10, 5, add));
console.log(parseID("123"));
console.log(parseID(456));

export {
    add,
    multiply,
    greet,
    power,
    executeOperation,
    parseID
};
