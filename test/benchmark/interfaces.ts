/**
 * Interfaces and type definitions for benchmark
 */

import { ComparableNumber } from "./comparable-number";

export interface INode<T> {
	value: T;
	next: INode<T> | null;
}

export interface IComparable {
	compareTo(other: this): number;
}

export interface ISerializable {
	serialize(): string;
	deserialize(data: string): void;
}

// Union types
export type NumericComparable = ComparableNumber | number;
export type Serializable = ISerializable | string;
