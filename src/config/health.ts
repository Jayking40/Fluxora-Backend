export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
    name: string;
    status: HealthStatus;
    latency?: number; // milliseconds
    error?: string | undefined;
    lastChecked: string; // ISO timestamp
}

export interface HealthReport {
  status: HealthStatus;
  version: string;
  timestamp: string;
  uptime: number;
  dependencies: DependencyHealth[];
}

export interface HealthChecker {
  name: string;
  check(): Promise<{ latency: number; error?: string }>;
}

export class HealthCheckManager {
  private checkers: Map<string, HealthChecker> = new Map();
  private lastResults: Map<string, DependencyHealth> = new Map();
  private startTime: number = Date.now();

  registerChecker(checker: HealthChecker): void {
    this.checkers.set(checker.name, checker);
    this.lastResults.set(checker.name, {
      name: checker.name,
      status: 'healthy',
      lastChecked: new Date().toISOString(),
    });
  }

  async checkAll(version = '0.1.0'): Promise<HealthReport> {
    const dependencies = await Promise.all(
      Array.from(this.checkers.values()).map((checker) => this.checkOne(checker)),
    );

    return this.buildReport(dependencies, version);
  }

  private async checkOne(checker: HealthChecker): Promise<DependencyHealth> {
    const startTime = Date.now();

    try {
      const result = await checker.check();
      const health: DependencyHealth = {
        name: checker.name,
        status: result.error ? 'unhealthy' : 'healthy',
        latency: result.latency ?? Date.now() - startTime,
        error: result.error,
        lastChecked: new Date().toISOString(),
      };

      this.lastResults.set(checker.name, health);
      return health;
    } catch (error) {
      const health: DependencyHealth = {
        name: checker.name,
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        lastChecked: new Date().toISOString(),
      };

      this.lastResults.set(checker.name, health);
      return health;
    }
  }

  private aggregateStatus(deps: DependencyHealth[]): HealthStatus {
    if (deps.some((d) => d.status === 'unhealthy')) return 'unhealthy';
    if (deps.some((d) => d.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  private buildReport(deps: DependencyHealth[], version: string): HealthReport {
    return {
      status: this.aggregateStatus(deps),
      version,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      dependencies: deps,
    };
  }

  getLastReport(version = '0.1.0'): HealthReport {
    return this.buildReport(Array.from(this.lastResults.values()), version);
  }
}

function makeHealthyChecker(name: string): HealthChecker {
  return {
    name,
    async check() {
      const startTime = Date.now();
      return { latency: Date.now() - startTime };
    },
  };
}

export function createDatabaseHealthChecker(): HealthChecker {
  return makeHealthyChecker('database');
}

export function createRedisHealthChecker(): HealthChecker {
  return makeHealthyChecker('redis');
}

export function createHorizonHealthChecker(_url: string): HealthChecker {
  return makeHealthyChecker('horizon');
}
