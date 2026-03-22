/**
 * Utility functions and type guards
 */

import { ISerializable, NumericComparable } from './interfaces';
import { ComparableNumber } from './comparable-number';

export function isSerializable(obj: any): obj is ISerializable {
	return typeof obj === 'object' && 'serialize' in obj && 'deserialize' in obj;
}

export function convertToComparable(value: NumericComparable): ComparableNumber {
	if (value instanceof ComparableNumber) {
		return value;
	}
	return new ComparableNumber(value);
}
