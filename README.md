# typescript-to-zig

A TypeScript to Zig transpiler. This project is in early development and may not support all TypeScript features yet.

## Prerequisites

- [Bun](https://bun.sh/) (for running the transpiler and tests)
- [Zig](https://ziglang.org/) (for compiling the generated Zig code)
- [Node.js](https://nodejs.org/) (for running the tests for comparison)

## Usage

### Install dependencies

```bash
bun install
```

### Transpile a TypeScript file

```bash
bun run transpile -- src/example.ts src/example.zig
```

## Test

### Test the transpiler

```bash
bun run test
```

### Test the benchmark

```bash
bun run benchmark
```
