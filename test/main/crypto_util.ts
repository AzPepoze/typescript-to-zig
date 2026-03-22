import crypto from "node:crypto";
import { inspect } from "node:util";

const hash = crypto.createHash("sha1").update("ts2zig").digest("hex").slice(0, 8);
const rendered = inspect({ ok: true, n: 2 }, { compact: true });

console.log("Node Common Modules");
console.log("hash: " + hash);
console.log("inspect: " + rendered);
