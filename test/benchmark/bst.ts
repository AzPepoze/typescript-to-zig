/**
 * Binary Search Tree with generic types
 */

import { IComparable } from './interfaces';

class BSTNode<T extends IComparable> {
	value: T;
	left: BSTNode<T> | null = null;
	right: BSTNode<T> | null = null;

	constructor(value: T) {
		this.value = value;
	}
}

export class BinarySearchTree<T extends IComparable> {
	private root: BSTNode<T> | null = null;

	insert(value: T): void {
		if (this.root === null) {
			this.root = new BSTNode(value);
		} else {
			this.insertNode(this.root, value);
		}
	}

	private insertNode(node: BSTNode<T>, value: T): void {
		if (value.compareTo(node.value) < 0) {
			if (node.left === null) {
				node.left = new BSTNode(value);
			} else {
				this.insertNode(node.left, value);
			}
		} else {
			if (node.right === null) {
				node.right = new BSTNode(value);
			} else {
				this.insertNode(node.right, value);
			}
		}
	}

	search(value: T): BSTNode<T> | null {
		return this.searchNode(this.root, value);
	}

	private searchNode(node: BSTNode<T> | null, value: T): BSTNode<T> | null {
		if (node === null) {
			return null;
		}

		const cmp = value.compareTo(node.value);
		if (cmp < 0) {
			return this.searchNode(node.left, value);
		} else if (cmp > 0) {
			return this.searchNode(node.right, value);
		} else {
			return node;
		}
	}

	traverse(): T[] {
		const result: T[] = [];
		this.inOrder(this.root, result);
		return result;
	}

	private inOrder(node: BSTNode<T> | null, result: T[]): void {
		if (node !== null) {
			this.inOrder(node.left, result);
			result.push(node.value);
			this.inOrder(node.right, result);
		}
	}

	height(): number {
		return this.getHeight(this.root);
	}

	private getHeight(node: BSTNode<T> | null): number {
		if (node === null) return -1;
		return 1 + Math.max(this.getHeight(node.left), this.getHeight(node.right));
	}
}

// Benchmark
import { ComparableNumber } from './comparable-number';

const bst = new BinarySearchTree<ComparableNumber>();
const values = [50, 30, 70, 20, 40, 60, 80];
for (const val of values) {
	bst.insert(new ComparableNumber(val));
}

console.log("BST Test");
console.log("Height: " + bst.height());
console.log("BST Test Complete");
