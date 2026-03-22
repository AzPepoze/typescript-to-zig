const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

class Logger {
	level: LogLevel = LogLevel.INFO;

	constructor() {
		const envLevel = process.env.LOG_LEVEL;
		if (envLevel) {
			this.level = LogLevel[envLevel.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;
		}
	}

	private log(level: LogLevel, prefix: string, color: string, message: string, ...args: any[]) {
		if (level < this.level) return;
		const colorPrefix = `${color}${colors.bright}[${prefix}]${colors.reset}`;
		console.log(`${colorPrefix} ${message}`, ...args);
	}

	debug(message: string, ...args: any[]) {
		this.log(LogLevel.DEBUG, "DEBUG", colors.dim, message, ...args);
	}

	info(message: string, ...args: any[]) {
		this.log(LogLevel.INFO, "INFO ", colors.cyan, message, ...args);
	}

	warn(message: string, ...args: any[]) {
		this.log(LogLevel.WARN, "WARN ", colors.yellow, message, ...args);
	}

	error(message: string, ...args: any[]) {
		this.log(LogLevel.ERROR, "ERROR", colors.red, message, ...args);
	}
}

export const logger = new Logger();
