/**
 * primitive_types.ts
 * Tests basic TypeScript primitive types that map to Zig types.
 */

// number -> f64 (or i32/u32 if inferred)
const integerValue: number = 42;
const floatValue: number = 3.14;

// string -> []const u8
const message: string = "Hello, Zig!";

// boolean -> bool
const isActive: boolean = true;
const isPending: boolean = false;

// null and undefined -> optional types or null in Zig
const nullableValue: number | null = null;
const undefinedValue: string | undefined = undefined;

// bigint -> i64/u64
const bigIntValue: bigint = 9007199254740991n;

// void -> void
function logMessage(msg: string): void {
    console.log(msg);
}

console.log(integerValue);
console.log(floatValue);
console.log(message);
console.log(isActive);
console.log(isPending);
console.log(bigIntValue);
console.log(nullableValue);
console.log(undefinedValue);

export {
    integerValue,
    floatValue,
    message,
    isActive,
    isPending,
    nullableValue,
    undefinedValue,
    logMessage,
    bigIntValue
};
