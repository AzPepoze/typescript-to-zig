/**
 * Matrix operations: multiplication, transpose, determinant
 */

export class Matrix {
	private data: number[][];
	private rows: number;
	private cols: number;

	constructor(rows: number, cols: number) {
		this.rows = rows;
		this.cols = cols;
		this.data = Array(rows).fill(0).map(() => Array(cols).fill(0));
	}

	set(i: number, j: number, value: number): void {
		if (i >= 0 && i < this.rows && j >= 0 && j < this.cols) {
			this.data[i][j] = value;
		}
	}

	get(i: number, j: number): number {
		if (i >= 0 && i < this.rows && j >= 0 && j < this.cols) {
			return this.data[i][j];
		}
		return 0;
	}

	multiply(other: Matrix): Matrix {
		const result = new Matrix(this.rows, other.cols);
		for (let i = 0; i < this.rows; i++) {
			for (let j = 0; j < other.cols; j++) {
				let sum = 0;
				for (let k = 0; k < this.cols; k++) {
					sum += this.data[i][k] * other.data[k][j];
				}
				result.set(i, j, sum);
			}
		}
		return result;
	}

	transpose(): Matrix {
		const result = new Matrix(this.cols, this.rows);
		for (let i = 0; i < this.rows; i++) {
			for (let j = 0; j < this.cols; j++) {
				result.set(j, i, this.data[i][j]);
			}
		}
		return result;
	}

	determinant(): number {
		if (this.rows !== this.cols) {
			throw new Error('Matrix must be square');
		}
		if (this.rows === 1) {
			return this.data[0][0];
		}
		if (this.rows === 2) {
			return this.data[0][0] * this.data[1][1] - this.data[0][1] * this.data[1][0];
		}
		let det = 0;
		for (let j = 0; j < this.cols; j++) {
			det += this.data[0][j] * this.getMinor(0, j).determinant() * (j % 2 === 0 ? 1 : -1);
		}
		return det;
	}

	private getMinor(row: number, col: number): Matrix {
		const minor = new Matrix(this.rows - 1, this.cols - 1);
		let mi = 0;
		for (let i = 0; i < this.rows; i++) {
			if (i === row) continue;
			let mj = 0;
			for (let j = 0; j < this.cols; j++) {
				if (j === col) continue;
				minor.set(mi, mj, this.data[i][j]);
				mj++;
			}
			mi++;
		}
		return minor;
	}
}

// Benchmark
const m1 = new Matrix(3, 3);
const m2 = new Matrix(3, 3);

for (let i = 0; i < 3; i++) {
	for (let j = 0; j < 3; j++) {
		m1.set(i, j, i + j);
		m2.set(i, j, i * j);
	}
}

const result = m1.multiply(m2);

console.log("Matrix Test");
console.log("Result[0][0]: " + result.get(0, 0));
console.log("Result[2][2]: " + result.get(2, 2));
console.log("Matrix Test Complete");
