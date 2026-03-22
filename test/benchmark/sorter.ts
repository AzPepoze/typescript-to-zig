/**
 * Sorter with Quicksort algorithm for generic comparable types
 */

import { IComparable } from './interfaces';

export class Sorter<T extends IComparable> {
	sort(arr: T[]): T[] {
		if (arr.length <= 1) return arr;
		return this.quickSort(arr, 0, arr.length - 1);
	}

	private quickSort(arr: T[], low: number, high: number): T[] {
		if (low < high) {
			const pi = this.partition(arr, low, high);
			this.quickSort(arr, low, pi - 1);
			this.quickSort(arr, pi + 1, high);
		}
		return arr;
	}

	private partition(arr: T[], low: number, high: number): number {
		const pivot = arr[high];
		let i = low - 1;

		for (let j = low; j < high; j++) {
			if (arr[j].compareTo(pivot) < 0) {
				i++;
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
		}
		[arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
		return i + 1;
	}
}

// Benchmark
import { ComparableNumber } from './comparable-number';

const sorter = new Sorter<ComparableNumber>();
const arr = [
	new ComparableNumber(50),
	new ComparableNumber(30),
	new ComparableNumber(70),
	new ComparableNumber(20),
	new ComparableNumber(40),
];
sorter.sort(arr);

console.log("Sorter Test");
console.log("First: " + arr[0].value);
console.log("Last: " + arr[4].value);
console.log("Sorter Test Complete");
