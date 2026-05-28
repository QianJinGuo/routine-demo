// metrics-collector.js
// 指标收集工具 - 模拟从各种数据源获取系统指标

/**
 * 模拟获取系统指标
 * 实际场景中会通过 MCP 连接到各类型数据源
 */
export async function collectSystemMetrics() {
  return {
    timestamp: new Date().toISOString(),
    system: {
      cpu: {
        usage: Math.round(30 + Math.random() * 40 * 10) / 10,
        cores: require('os').cpus().length,
        loadAvg: require('os').loadavg()
      },
      memory: {
        used: Math.round(require('os').totalmem() / (1024 ** 3) * (0.4 + Math.random() * 0.2) * 100) / 100,
        total: Math.round(require('os').totalmem() / (1024 ** 3) * 100) / 100,
        free: Math.round(require('os').freemem() / (1024 ** 3) * 100) / 100
      },
      disk: {
        used: 256,
        total: 512,
        unit: 'GB'
      }
    },
    network: {
      bytesIn: Math.round(Math.random() * 1000000),
      bytesOut: Math.round(Math.random() * 800000),
      connections: Math.floor(50 + Math.random() * 200)
    }
  };
}

/**
 * 模拟获取服务健康状态
 */
export async function collectServiceMetrics() {
  const services = [
    { name: 'api-gateway', status: 'healthy', responseTime: 80 + Math.floor(Math.random() * 80) },
    { name: 'auth-service', status: 'healthy', responseTime: 45 + Math.floor(Math.random() * 30) },
    { name: 'database-primary', status: 'healthy', responseTime: 25 + Math.floor(Math.random() * 50) },
    { name: 'cache-redis', status: 'healthy', responseTime: 5 + Math.floor(Math.random() * 10) },
    { name: 'queue-worker', status: Math.random() > 0.1 ? 'healthy' : 'degraded', responseTime: 100 + Math.floor(Math.random() * 200) },
    { name: 'cdn-edge', status: 'healthy', responseTime: 15 + Math.floor(Math.random() * 20) }
  ];
  return services;
}

/**
 * 模拟获取应用指标
 */
export async function collectAppMetrics() {
  const total = 45000 + Math.floor(Math.random() * 5000);
  const errors = Math.floor(total * (0.005 + Math.random() * 0.01));
  return {
    requests: {
      total,
      success: total - errors,
      errors,
      p50Latency: 45 + Math.floor(Math.random() * 30),
      p95Latency: 180 + Math.floor(Math.random() * 100),
      p99Latency: 350 + Math.floor(Math.random() * 150)
    },
    business: {
      activeUsers: 1250 + Math.floor(Math.random() * 500),
      newSignups: 45 + Math.floor(Math.random() * 30),
      revenue: Math.round((50000 + Math.random() * 20000) * 100) / 100
    }
  };
}

/**
 * 聚合所有指标
 */
export async function collectAllMetrics() {
  const [system, services, app] = await Promise.all([
    collectSystemMetrics(),
    collectServiceMetrics(),
    collectAppMetrics()
  ]);

  return {
    ...system,
    services,
    ...app
  };
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  collectAllMetrics().then(metrics => {
    console.log(JSON.stringify(metrics, null, 2));
  });
}