import * as path from "path";
import { runTranspiler } from "./compiler";

const testDir = path.join(process.cwd(), "test", "main");
const outDir = path.join(process.cwd(), "out", "main");

runTranspiler(testDir, outDir);
