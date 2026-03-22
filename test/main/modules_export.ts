/**
 * modules_export.ts
 * Tests module exports mapping to Zig public declarations.
 */

export const PI = 3.14159;

export function calculateCircumference(radius: number): number {
    return 2 * PI * radius;
}

export interface Circle {
    radius: number;
    color: string;
}

console.log(calculateCircumference(10));

export default class ExportedLogger {
    log(msg: string): void {
        console.log(`[log] ${msg}`);
    }
}
