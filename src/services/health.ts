import { pingDb } from "../db/client";
import { pingRedis } from "../queues/connection";
import { getAllProviderHealth, type ProviderHealthSnapshot } from "../providers/health";

export interface SystemHealth {
  ok: boolean;
  db: boolean;
  redis: boolean;
  providers: ProviderHealthSnapshot[];
  checkedAt: string;
}

/** Aggregate infra + provider health for /health and /status. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  const providers = getAllProviderHealth();
  return {
    // In degraded/dev mode DB & Redis may be absent; "ok" means the process is
    // responsive, not that every dependency is present.
    ok: true,
    db,
    redis,
    providers,
    checkedAt: new Date().toISOString(),
  };
}
