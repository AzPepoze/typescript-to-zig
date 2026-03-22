import { join, basename } from "node:path";
import { platform } from "node:os";

const joined = join("src", "index.ts");
const base = basename("/tmp/example.txt");
const isPlatformString = typeof platform() === "string";

console.log("Node Core Modules");
console.log("join: " + joined);
console.log("basename: " + base);
console.log("platform is string: " + isPlatformString);
