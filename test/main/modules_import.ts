/**
 * modules_import.ts
 * Tests module imports mapping to Zig's `@import`.
 */

import { PI, calculateCircumference, Circle } from "./modules_export";
import Logger from "./modules_export";

const radius = 10;
const circ = calculateCircumference(radius);

const circleObj: Circle = {
    radius,
    color: "red"
};

const logger = new Logger();
logger.log(`Circumference: ${circ}`);

export {
    radius,
    circ,
    circleObj
};
