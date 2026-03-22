/**
 * arrays_tuples.ts
 * Tests arrays and tuples mapping to Zig arrays/slices.
 */

// Basic array
const numbers: number[] = [1, 2, 3, 4, 5];

// Typed array (useful for fixed-size Zig arrays)
const fixedNumbers: [number, number, number] = [10, 20, 30];

// String array
const fruits: Array<string> = ["apple", "banana", "cherry"];

// Multi-dimensional array
const matrix: number[][] = [
    [1, 2],
    [3, 4]
];

// Tuple
const userRecord: [number, string, boolean] = [1, "Alice", true];

// Array methods (likely require a runtime lib in Zig)
function sumArray(arr: number[]): number {
    let total: number = 0;
    for (const num of arr) {
        total += num;
    }
    return total;
}

console.log(sumArray(numbers));
console.log(fixedNumbers[0], fixedNumbers[1], fixedNumbers[2]);
console.log(fruits[0]);
console.log(matrix[0][0], matrix[1][1]);
console.log(userRecord[0], userRecord[1], userRecord[2]);

export {
    numbers,
    fixedNumbers,
    fruits,
    matrix,
    userRecord,
    sumArray
};
