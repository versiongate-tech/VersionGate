import { FastifyRequest, FastifyReply } from "fastify";
import { ReconciliationService } from "../services/reconciliation.service";
import { SystemMetricsService } from "../services/system-metrics.service";
import { logger } from "../utils/logger";

const reconciliationService = new ReconciliationService();

// Singleton shared with server.ts via module-level export
export const systemMetrics = new SystemMetricsService();

const EMPTY_STATS = {
  status: "unavailable",
  cpu_percent: 0,
  memory_percent: 0,
  memory_used: 0,
  memory_total: 0,
  disk_percent: 0,
  disk_used: 0,
  disk_total: 0,
  network_sent: 0,
  network_recv: 0,
  network_sent_rate: 0,
  network_recv_rate: 0,
  uptime: 0,
  load_avg: [0, 0, 0],
  process_count: 0,
  timestamp: new Date().toISOString(),
};

export async function reconcileHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.info("API: manual reconcile requested");
  const report = await reconciliationService.reconcile();
  reply.code(200).send({ ok: true, report });
}

export async function getServerStatsHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.code(200).send(systemMetrics.getStats() ?? EMPTY_STATS);
}

export async function getServerDashboardHandler(
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const dashboard = systemMetrics.getDashboard();
  if (!dashboard) {
    reply.code(200).send({
      status: "unavailable",
      system_stats: EMPTY_STATS,
      connections: [],
      listening_ports: [],
      top_processes: [],
      alerts: [],
    });
    return;
  }
  reply.code(200).send(dashboard);
}
