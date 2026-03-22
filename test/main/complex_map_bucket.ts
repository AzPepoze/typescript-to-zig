class BucketMap {
	private store: Map<string, number[]> = new Map();

	add(key: string, value: number): void {
		if (!this.store.has(key)) {
			this.store.set(key, []);
		}
		const bucket = this.store.get(key)!;
		bucket.push(value);
	}

	sum(key: string): number {
		const bucket = this.store.get(key);
		if (bucket === undefined) return 0;

		let total = 0;
		for (const value of bucket) {
			total += value;
		}
		return total;
	}

	totalItems(): number {
		let count = 0;
		for (const bucket of this.store.values()) {
			count += bucket.length;
		}
		return count;
	}
}

const bm = new BucketMap();
bm.add("a", 3);
bm.add("a", 7);
bm.add("b", 5);

console.log("Complex Map Bucket");
console.log("sum(a): " + bm.sum("a"));
console.log("sum(b): " + bm.sum("b"));
console.log("items: " + bm.totalItems());
