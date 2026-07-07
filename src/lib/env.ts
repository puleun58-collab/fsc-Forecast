export type RuntimeRole = "app" | "worker";

export interface RuntimeEnv {
  databaseUrl: string;
  nodeEnv: string;
  runtimeFamily: "container-web-postgres-cron";
  runtimeRole: RuntimeRole;
  datasetKey: string;
  queueDomain: string;
  appRuntimeId: string;
  workerRuntimeId: string;
  scheduledJobName: string;
}

const LOCKED_RUNTIME_FAMILY = "container-web-postgres-cron";
const DEFAULT_DATASET_KEY = "national-average-opinet-diesel";
const DEFAULT_QUEUE_DOMAIN = "national-average-opinet-diesel";
const DEFAULT_SCHEDULED_JOB_NAME = "scheduled-national-average-ingest";

function readRequiredString(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function readRuntimeRole(): RuntimeRole {
  const runtimeRole = readOptionalString("RUNTIME_ROLE", "app");

  if (runtimeRole !== "app" && runtimeRole !== "worker") {
    throw new Error("RUNTIME_ROLE must be either 'app' or 'worker'.");
  }

  return runtimeRole;
}

function readRuntimeFamily(): "container-web-postgres-cron" {
  const runtimeFamily = readOptionalString("RUNTIME_FAMILY", LOCKED_RUNTIME_FAMILY);

  if (runtimeFamily !== LOCKED_RUNTIME_FAMILY) {
    throw new Error(
      `RUNTIME_FAMILY must remain locked to '${LOCKED_RUNTIME_FAMILY}'.`,
    );
  }

  return runtimeFamily;
}

function readLockedValue(name: string, lockedValue: string): string {
  const value = readOptionalString(name, lockedValue);

  if (value !== lockedValue) {
    throw new Error(`${name} must remain locked to '${lockedValue}'.`);
  }

  return value;
}

function createRuntimeEnv(): RuntimeEnv {
  return Object.freeze({
    databaseUrl: readRequiredString("DATABASE_URL"),
    nodeEnv: readOptionalString("NODE_ENV", "development"),
    runtimeFamily: readRuntimeFamily(),
    runtimeRole: readRuntimeRole(),
    datasetKey: readLockedValue("OPINET_DATASET_KEY", DEFAULT_DATASET_KEY),
    queueDomain: readLockedValue("QUEUE_DOMAIN", DEFAULT_QUEUE_DOMAIN),
    appRuntimeId: readOptionalString("APP_RUNTIME_ID", "web-app"),
    workerRuntimeId: readOptionalString("WORKER_RUNTIME_ID", "scheduled-worker"),
    scheduledJobName: readOptionalString("SCHEDULED_JOB_NAME", DEFAULT_SCHEDULED_JOB_NAME),
  });
}

export const env = createRuntimeEnv();
