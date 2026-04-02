import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

interface MetricsSnapshot {
  totalRequests: number;
  totalErrors: number;
  p95LatencyMs: number;
  byRoute: Record<string, { count: number; errors: number; avgLatencyMs: number }>;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

class InMemoryMetrics {
  private totalRequests = 0;
  private totalErrors = 0;
  private routeStats = new Map<string, { count: number; errors: number; totalLatencyMs: number }>();
  private latencies: number[] = [];

  record(routeKey: string, statusCode: number, latencyMs: number): void {
    this.totalRequests += 1;
    if (statusCode >= 500) {
      this.totalErrors += 1;
    }

    const stats = this.routeStats.get(routeKey) ?? { count: 0, errors: 0, totalLatencyMs: 0 };
    stats.count += 1;
    if (statusCode >= 500) {
      stats.errors += 1;
    }
    stats.totalLatencyMs += latencyMs;
    this.routeStats.set(routeKey, stats);

    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  snapshot(): MetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p95Index = sorted.length > 0 ? Math.floor(sorted.length * 0.95) - 1 : -1;
    const p95LatencyMs = p95Index >= 0 ? sorted[Math.max(0, p95Index)] : 0;

    const byRoute: MetricsSnapshot['byRoute'] = {};
    for (const [route, stats] of this.routeStats.entries()) {
      byRoute[route] = {
        count: stats.count,
        errors: stats.errors,
        avgLatencyMs: Number((stats.totalLatencyMs / Math.max(stats.count, 1)).toFixed(2))
      };
    }

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      p95LatencyMs,
      byRoute
    };
  }
}

const metricsStore = new InMemoryMetrics();

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const requestId = req.header('x-request-id') ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const routeKey = `${req.method} ${req.path}`;
    metricsStore.record(routeKey, res.statusCode, durationMs);
  });

  next();
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return metricsStore.snapshot();
}
