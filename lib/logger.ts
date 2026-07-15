import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getDefaultLogLevel(): LogLevel {
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return getDefaultLogLevel();
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }

  return getDefaultLogLevel();
}

function normalizeFields(fields: LogFields) {
  const normalized = Object.entries(fields).reduce<LogFields>((acc, entry) => {
    const [key, value] = entry;

    if (value === undefined) {
      return acc;
    }

    if (value instanceof Error) {
      acc[key] = {
        name: value.name,
        message: value.message,
      };
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});

  return normalized;
}

function shouldLog(level: LogLevel) {
  const minimumLevel = parseLogLevel(process.env.LOG_LEVEL);
  return LOG_LEVELS[level] >= LOG_LEVELS[minimumLevel];
}

function writeLog(level: LogLevel, event: string, fields: LogFields) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...normalizeFields(fields),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "info") {
    console.info(line);
    return;
  }

  console.debug(line);
}

type Logger = {
  child: (fields: LogFields) => Logger;
  debug: (event: string, fields?: LogFields) => void;
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
};

function createLogger(baseFields: LogFields = {}): Logger {
  const logAtLevel =
    (level: LogLevel) =>
    (event: string, fields: LogFields = {}) => {
      writeLog(level, event, {
        ...baseFields,
        ...fields,
      });
    };

  return {
    child: (fields) => createLogger({ ...baseFields, ...fields }),
    debug: logAtLevel("debug"),
    info: logAtLevel("info"),
    warn: logAtLevel("warn"),
    error: logAtLevel("error"),
  };
}

export const logger = createLogger();
