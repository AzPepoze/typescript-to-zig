/**
 * Fibonacci calculation with memoization
 */

export class Fibonacci {
	private memo: Map<number, number> = new Map();

	calculate(n: number): number {
		if (n <= 1) return n;
		if (this.memo.has(n)) {
			return this.memo.get(n)!;
		}
		const result = this.calculate(n - 1) + this.calculate(n - 2);
		this.memo.set(n, result);
		return result;
	}
}

// Benchmark
const fib = new Fibonacci();
const result = fib.calculate(20);

console.log("Fibonacci Test");
console.log("Fib(20): " + result);
console.log("Fibonacci Test Complete");
