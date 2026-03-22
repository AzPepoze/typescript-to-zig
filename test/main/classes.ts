/**
 * classes.ts
 * Tests class declarations, constructors, and methods mapping to Zig structs with methods.
 */

class Counter {
    private value: number;
    public name: string;

    constructor(initialValue: number, name: string) {
        this.value = initialValue;
        this.name = name;
    }

    public increment(): void {
        this.value++;
    }

    public getValue(): number {
        return this.value;
    }

    // Static member
    static createDefault(): Counter {
        return new Counter(0, "default");
    }
}

// Inheritance (more advanced mapping in Zig)
class ResetCounter extends Counter {
    public reset(): void {
        // Since value is private in base, would need protected or accessor
        // But for testing transpiler handle class ResetCounter
    }
}

const myCounter = new Counter(10, "myCounter");
console.log(myCounter.getValue());
myCounter.increment();
console.log(myCounter.getValue());
console.log(myCounter.name);

export {
    Counter,
    ResetCounter,
    myCounter
};
