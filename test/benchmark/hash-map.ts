/**
 * HashMap implementation with generic types
 */

export class HashMap<K extends string | number, V> {
	private table: Map<K, V[]> = new Map();
	private capacity: number = 16;

	set(key: K, value: V): void {
		const index = this.hash(key);
		if (!this.table.has(index)) {
			this.table.set(index, []);
		}
		const bucket = this.table.get(index)!;
		for (let i = 0; i < bucket.length; i++) {
			if ((bucket[i] as any).key === key) {
				(bucket[i] as any).value = value;
				return;
			}
		}
		bucket.push(value);
	}

	get(key: K): V | undefined {
		const index = this.hash(key);
		const bucket = this.table.get(index);
		if (bucket) {
			for (const item of bucket) {
				if ((item as any).key === key) {
					return item;
				}
			}
		}
		return undefined;
	}

	private hash(key: K): number {
		let hash = 0;
		const str = String(key);
		for (let i = 0; i < str.length; i++) {
			hash = (hash << 5) - hash + str.charCodeAt(i);
			hash = hash & hash;
		}
		return Math.abs(hash) % this.capacity;
	}

	size(): number {
		let count = 0;
		for (const bucket of this.table.values()) {
			count += bucket.length;
		}
		return count;
	}
}

// Benchmark
const map = new HashMap<string, number>();
for (let i = 0; i < 5; i++) {
	map.set("key_" + i, i);
}

console.log("HashMap Test");
console.log("Size: " + map.size());
console.log("HashMap Test Complete");
