/**
 * error_handling.ts
 * Tests try/catch/throw mapping to Zig error sets and error union types.
 */

enum ErrorType {
    InvalidInput,
    ProcessFailed
}

function riskyOperation(shouldFail: boolean): number {
    if (shouldFail) {
        throw new Error("Operation failed");
    }
    return 1;
}

function handleOperation(): string {
    try {
        riskyOperation(true);
        return "Success";
    } catch (e) {
        return "Caught Error";
    } finally {
        console.log("Cleanup");
    }
}

console.log(handleOperation());

export {
    riskyOperation,
    handleOperation
};
