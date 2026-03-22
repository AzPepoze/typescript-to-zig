/**
 * ComparableNumber class implementing IComparable and ISerializable
 */

import { IComparable, ISerializable } from './interfaces';

export class ComparableNumber implements IComparable, ISerializable {
	private value: number;

	constructor(value: number) {
		this.value = value;
	}

	compareTo(other: ComparableNumber): number {
		return this.value - other.value;
	}

	serialize(): string {
		return this.value.toString();
	}

	deserialize(data: string): void {
		this.value = parseInt(data, 10);
	}

	getValue(): number {
		return this.value;
	}
}
