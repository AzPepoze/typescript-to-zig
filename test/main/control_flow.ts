/**
 * control_flow.ts
 * Tests control flow structures.
 */

function demoControlFlow(value: number): string {
    // If/Else
    if (value > 10) {
        return "greater than 10";
    } else if (value === 10) {
        return "equal to 10";
    } else {
        return "less than 10";
    }
}

function demoSwitch(color: "red" | "green" | "blue"): number {
    // Switch
    switch (color) {
        case "red":
            return 1;
        case "green":
            return 2;
        case "blue":
            return 3;
        default:
            return 0;
    }
}

function demoLoops(count: number): number {
    let sum: number = 0;

    // For loop
    for (let i = 0; i < count; i++) {
        sum += i;
    }

    // While loop
    let j: number = 0;
    while (j < count) {
        sum += j;
        j++;
    }

    // Do/While
    let k: number = 0;
    do {
        sum += k;
        k++;
    } while (k < count);

    return sum;
}

console.log(demoControlFlow(5));
console.log(demoControlFlow(15));
console.log(demoSwitch("red"));
console.log(demoSwitch("green"));
console.log(demoLoops(5));

export {
    demoControlFlow,
    demoSwitch,
    demoLoops
};
