import { existsSync, readFileSync } from "node:fs";

const pkgExists = existsSync("package.json");
const packageName = JSON.parse(readFileSync("package.json", "utf-8")).name;

console.log("Node FS Module");
console.log("package.json exists: " + pkgExists);
console.log("package name: " + packageName);
