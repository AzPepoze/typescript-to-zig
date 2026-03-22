class ListNode<T> {
	value: T;
	next: ListNode<T> | null = null;

	constructor(value: T) {
		this.value = value;
	}
}

class LinkedList<T> {
	private head: ListNode<T> | null = null;
	private sizeCount: number = 0;

	add(value: T): void {
		const node = new ListNode(value);
		if (this.head === null) {
			this.head = node;
		} else {
			let current = this.head;
			while (current.next !== null) {
				current = current.next;
			}
			current.next = node;
		}
		this.sizeCount++;
	}

	size(): number {
		return this.sizeCount;
	}

	sumNumbers(): number {
		let total = 0;
		let current = this.head;
		while (current !== null) {
			total += current.value as number;
			current = current.next;
		}
		return total;
	}
}

const list = new LinkedList<number>();
for (let i = 1; i <= 6; i++) {
	list.add(i);
}

console.log("Complex Recursive Class");
console.log("size: " + list.size());
console.log("sum: " + list.sumNumbers());
