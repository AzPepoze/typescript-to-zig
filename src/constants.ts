interface ZigPreludeOptions {
	includeMapHelper?: boolean;
}

const PRELUDE_HEADER = `const std = @import("std");
`;

const MAP_KEY_EQUALS_HELPER = `
fn __mapKeyEquals(comptime K: type, a: K, b: K) bool {
    const info = @typeInfo(K);
    if (info == .pointer and info.pointer.size == .slice and info.pointer.child == u8) {
        return std.mem.eql(u8, a, b);
    }
    return a == b;
}
`;

const SLICE_PUSH_HELPER = `
fn __slicePush(comptime T: type, src: []T, value: T) []T {
    const out = std.heap.page_allocator.alloc(T, src.len + 1) catch return src;
    std.mem.copyForwards(T, out[0..src.len], src);
    out[src.len] = value;
    return out;
}
`;

const TO_I32_HELPER = `
fn __toI32(value: f64) i32 {
    var n = @mod(value, 4294967296.0);
    if (n < 0) n += 4294967296.0;
    if (n >= 2147483648.0) n -= 4294967296.0;
    return @as(i32, @intFromFloat(n));
}
`;

const MAKE_2D_HELPER = `
fn __make2D(rows: f64, cols: f64) [][]f64 {
    const r: usize = @as(usize, @intFromFloat(rows));
    const c: usize = @as(usize, @intFromFloat(cols));
    const data = std.heap.page_allocator.alloc([]f64, r) catch return @constCast(&[_][]f64{});
    var i: usize = 0;
    while (i < r) : (i += 1) {
        data[i] = std.heap.page_allocator.alloc(f64, c) catch @constCast(&[_]f64{});
        @memset(data[i], 0);
    }
    return data;
}
`;

const MAP_HELPER = `
fn Map(comptime K: type, comptime V: type) type {
    return struct {
        keys: [1024]K = undefined,
        vals: [1024]V = undefined,
        len: usize = 0,

        pub fn has(self: *const @This(), key: K) bool {
            var i: usize = 0;
            while (i < self.len) : (i += 1) {
                if (__mapKeyEquals(K, self.keys[i], key)) return true;
            }
            return false;
        }

        pub fn get(self: *const @This(), key: K) ?V {
            var i: usize = 0;
            while (i < self.len) : (i += 1) {
                if (__mapKeyEquals(K, self.keys[i], key)) return self.vals[i];
            }
            return null;
        }

        pub fn set(self: *@This(), key: K, value: V) bool {
            var i: usize = 0;
            while (i < self.len) : (i += 1) {
                if (__mapKeyEquals(K, self.keys[i], key)) {
                    self.vals[i] = value;
                    return true;
                }
            }
            if (self.len >= self.keys.len) return false;
            self.keys[self.len] = key;
            self.vals[self.len] = value;
            self.len += 1;
            return true;
        }

        pub fn values(self: *const @This()) []const V {
            return self.vals[0..self.len];
        }
    };
}
`;

export function createDefaultZigPrelude(file: string, options: ZigPreludeOptions = {}): string {
	const includeMapHelper = options.includeMapHelper ?? true;
	const sections = [
		PRELUDE_HEADER,
		MAP_KEY_EQUALS_HELPER,
		SLICE_PUSH_HELPER,
		TO_I32_HELPER,
		MAKE_2D_HELPER,
		includeMapHelper ? MAP_HELPER : "",
	].filter(Boolean);
	const preludeBody = sections.join("\n").trimEnd();

	return `// Generated from ${file}
${preludeBody}

`;
}
