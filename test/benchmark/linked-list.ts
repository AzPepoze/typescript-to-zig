/**
 * Linked List implementation with generic types
 */

import { IComparable } from './interfaces';

class Node<T> {
	value: T;
	next: Node<T> | null = null;

	constructor(value: T) {
		this.value = value;
	}
}

export class LinkedList<T extends IComparable> {
	private head: Node<T> | null = null;
	private length: number = 0;

	add(value: T): void {
		const node = new Node(value);
		if (this.head === null) {
			this.head = node;
		} else {
			let current = this.head;
			while (current.next !== null) {
				current = current.next;
			}
			current.next = node;
		}
		this.length++;
	}

	size(): number {
		return this.length;
	}
}

// Benchmark
import { ComparableNumber } from "./comparable-number";

console.log("LinkedList Test");

const list = new LinkedList<ComparableNumber>();

for (let i = 0; i < 20; i++) {
	list.add(new ComparableNumber(i));
}

console.log("Size: " + list.size());
console.log("LinkedList Test Complete");
