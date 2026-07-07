import { PrismaClient } from "@prisma/client";

import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __fscForecastPrisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: env.databaseUrl,
      },
    },
  });
}

export const db = globalThis.__fscForecastPrisma__ ?? createPrismaClient();

if (env.nodeEnv !== "production") {
  globalThis.__fscForecastPrisma__ = db;
}
