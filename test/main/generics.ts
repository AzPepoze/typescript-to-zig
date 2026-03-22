/**
 * generics.ts
 * Tests TypeScript generics mapping to Zig's `comptime` parameters.
 */

// Generic function
function identity<T>(value: T): T {
    return value;
}

const numId = identity<number>(42);
const strId = identity<string>("hello");

// Generic interface
interface Container<T> {
    value: T;
}

const numContainer: Container<number> = { value: 100 };
const strContainer: Container<string> = { value: "packed" };

// Generic class
class Box<T> {
    private item: T;

    constructor(item: T) {
        this.item = item;
    }

    public getItem(): T {
        return this.item;
    }
}

const myBox = new Box<number>(100);

console.log(numId);
console.log(strId);
console.log(numContainer.value);
console.log(strContainer.value);
console.log(myBox.getItem());

export {
    identity,
    Container,
    Box,
    numId,
    strId,
    numContainer,
    strContainer,
    myBox
};
