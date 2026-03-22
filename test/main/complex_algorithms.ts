function gcd(a: number, b: number): number {
	let x = a;
	let y = b;
	while (y !== 0) {
		const t = y;
		y = x % y;
		x = t;
	}
	return x;
}

function fib(n: number): number {
	if (n <= 1) return n;
	return fib(n - 1) + fib(n - 2);
}

function rollingChecksum(values: number[]): number {
	let hash = 0;
	for (let i = 0; i < values.length; i++) {
		hash = (hash << 5) - hash + values[i];
		hash = hash & hash;
	}
	return hash;
}

const values: number[] = [];
for (let i = 1; i <= 8; i++) {
	values.push(i * 3);
}

const checksum = rollingChecksum(values);
console.log("Complex Algorithms");
console.log("gcd(252, 198): " + gcd(252, 198));
console.log("fib(10): " + fib(10));
console.log("checksum: " + checksum);
