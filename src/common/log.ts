declare const __DEV__: boolean;

type LogLevel = "debug" | "info" | "warn" | "error";

// Set to true to enable verbose logging.
const ENABLE_LOGS = false;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const currentLevel: LogLevel = __DEV__ ? "debug" : "warn";

export function logDebug(message: string, data?: unknown) {
  write("debug", message, data);
}

export function logInfo(message: string, data?: unknown) {
  write("info", message, data);
}

export function logWarn(message: string, data?: unknown) {
  write("warn", message, data);
}

export function logError(message: string, data?: unknown) {
  write("error", message, data);
}

function write(level: LogLevel, message: string, data?: unknown) {
  if (!ENABLE_LOGS) {
    return;
  }

  if (levelOrder[level] < levelOrder[currentLevel]) {
    return;
  }

  const prefix = `[links-ext] ${message}`;
  if (data === undefined) {
    console[level](prefix);
  } else {
    console[level](prefix, data);
  }
}
