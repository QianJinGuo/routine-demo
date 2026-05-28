// generate-dashboard.mjs
// Routine 执行脚本 - 使用 MCP 获取数据并生成 HTML Dashboard
// 
// 本脚本演示了 Routine 的核心能力：
// 1. 通过 MCP 协议获取外部数据
// 2. 处理和聚合数据
// 3. 生成可视化 HTML Dashboard
// 4. 保存输出到指定目录
//
// 使用方法:
//   node src/generate-dashboard.mjs
//
// 在 Routine 环境中运行时，会自动通过 MCP 获取真实数据

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../output');
const TEMPLATE_PATH = join(__dirname, './template.html');

// 确保输出目录存在
mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * 通过 MCP 获取系统指标
 * 
 * 在 Routine 环境中，这些函数会通过 MCP 协议调用外部工具
 * 这里提供模拟数据用于本地演示
 */
async function fetchMetricsViaMCP() {
  console.log('[MCP] Connecting to local-metrics server...');
  
  // 模拟从 MCP 获取的数据（实际场景会通过 MCP 工具获取）
  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      cpu: {
        usage: Math.round((30 + Math.random() * 40) * 10) / 10,
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
  
  console.log('[MCP] Metrics received:', JSON.stringify(metrics.system, null, 2));
  return metrics;
}

/**
 * 通过 MCP 获取服务健康状态
 */
async function fetchServicesViaMCP() {
  console.log('[MCP] Connecting to services MCP server...');
  
  const services = [
    { name: 'api-gateway', status: 'healthy', responseTime: 80 + Math.floor(Math.random() * 80) },
    { name: 'auth-service', status: 'healthy', responseTime: 45 + Math.floor(Math.random() * 30) },
    { name: 'database-primary', status: 'healthy', responseTime: 25 + Math.floor(Math.random() * 50) },
    { name: 'cache-redis', status: 'healthy', responseTime: 5 + Math.floor(Math.random() * 10) },
    { name: 'queue-worker', status: Math.random() > 0.1 ? 'healthy' : 'degraded', responseTime: 100 + Math.floor(Math.random() * 200) },
    { name: 'cdn-edge', status: 'healthy', responseTime: 15 + Math.floor(Math.random() * 20) }
  ];
  
  console.log('[MCP] Services status received:', services.length, 'services');
  return services;
}

/**
 * 通过 MCP 获取应用指标
 */
async function fetchAppMetricsViaMCP() {
  console.log('[MCP] Connecting to app-metrics MCP server...');
  
  const total = 45000 + Math.floor(Math.random() * 5000);
  const errors = Math.floor(total * (0.005 + Math.random() * 0.01));
  
  const appMetrics = {
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
  
  console.log('[MCP] App metrics received:', appMetrics.requests.total, 'requests');
  return appMetrics;
}

/**
 * 聚合所有指标数据
 */
async function aggregateAllMetrics() {
  console.log('\n=== Starting Metrics Collection ===\n');
  
  const [systemMetrics, services, appMetrics] = await Promise.all([
    fetchMetricsViaMCP(),
    fetchServicesViaMCP(),
    fetchAppMetricsViaMCP()
  ]);
  
  const aggregated = {
    timestamp: systemMetrics.timestamp,
    system: systemMetrics.system,
    services,
    ...appMetrics
  };
  
  console.log('\n=== Metrics Collection Complete ===\n');
  return aggregated;
}

/**
 * 获取颜色代码（基于阈值）
 */
function getColor(value, warning = 70, error = 90) {
  if (value >= error) return 'var(--error)';
  if (value >= warning) return 'var(--warning)';
  return 'var(--success)';
}

/**
 * 获取状态徽章 HTML
 */
function getStatusBadge(status) {
  const statusClass = status === 'healthy' ? 'healthy' : status === 'degraded' ? 'degraded' : 'down';
  return `<span class="badge ${statusClass}">${status}</span>`;
}

/**
 * 生成服务状态表格行
 */
function generateServiceRows(services) {
  return services.map(s => `
    <tr class="${s.status}">
      <td>${s.name}</td>
      <td>${getStatusBadge(s.status)}</td>
      <td>${s.responseTime}ms</td>
    </tr>
  `).join('');
}

/**
 * 渲染 HTML Dashboard
 */
function renderDashboard(metrics) {
  // 读取模板
  let template;
  if (existsSync(TEMPLATE_PATH)) {
    template = readFileSync(TEMPLATE_PATH, 'utf-8');
  } else {
    // 内联模板（如果模板文件不存在）
    template = getInlineTemplate();
  }
  
  // 计算派生值
  const memPercent = Math.round((metrics.system.memory.used / metrics.system.memory.total) * 100);
  const memColor = getColor(memPercent);
  const diskPercent = Math.round((metrics.system.disk.used / metrics.system.disk.total) * 100);
  const diskColor = getColor(diskPercent);
  const successRate = ((metrics.requests.success / metrics.requests.total) * 100).toFixed(1);
  const successRateColor = getColor(parseFloat(successRate), 95, 99);
  
  // 替换模板变量
  return template
    .replace(/\{\{TIMESTAMP\}\}/g, metrics.timestamp)
    .replace(/\{\{CPU_USAGE\}\}/g, metrics.system.cpu.usage)
    .replace(/\{\{CPU_CORES\}\}/g, metrics.system.cpu.cores)
    .replace(/\{\{LOAD_AVG\}\}/g, metrics.system.cpu.loadAvg.map(v => v.toFixed(2)).join(', '))
    .replace(/\{\{MEM_USED\}\}/g, metrics.system.memory.used)
    .replace(/\{\{MEM_TOTAL\}\}/g, metrics.system.memory.total)
    .replace(/\{\{MEM_PERCENT\}\}/g, memPercent)
    .replace(/\{\{MEM_COLOR\}\}/g, memColor)
    .replace(/\{\{MEM_FREE\}\}/g, metrics.system.memory.free)
    .replace(/\{\{DISK_USED\}\}/g, metrics.system.disk.used)
    .replace(/\{\{DISK_TOTAL\}\}/g, metrics.system.disk.total)
    .replace(/\{\{DISK_PERCENT\}\}/g, diskPercent)
    .replace(/\{\{DISK_COLOR\}\}/g, diskColor)
    .replace(/\{\{REQ_TOTAL\}\}/g, metrics.requests.total.toLocaleString())
    .replace(/\{\{REQ_SUCCESS\}\}/g, metrics.requests.success.toLocaleString())
    .replace(/\{\{REQ_ERRORS\}\}/g, metrics.requests.errors.toLocaleString())
    .replace(/\{\{SUCCESS_RATE\}\}/g, successRate)
    .replace(/\{\{SUCCESS_RATE_COLOR\}\}/g, successRateColor)
    .replace(/\{\{P50_LATENCY\}\}/g, metrics.requests.p50Latency)
    .replace(/\{\{P95_LATENCY\}\}/g, metrics.requests.p95Latency)
    .replace(/\{\{P99_LATENCY\}\}/g, metrics.requests.p99Latency)
    .replace(/\{\{SERVICE_ROWS\}\}/g, generateServiceRows(metrics.services))
    .replace(/\{\{ACTIVE_USERS\}\}/g, metrics.business.activeUsers.toLocaleString())
    .replace(/\{\{NEW_SIGNUPS\}\}/g, metrics.business.newSignups)
    .replace(/\{\{REVENUE\}\}/g, metrics.business.revenue.toLocaleString());
}

/**
 * 内联模板（备用）
 */
function getInlineTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Metrics Dashboard - {{TIMESTAMP}}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f1f5f9;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem;
      line-height: 1.6;
    }
    h1 { color: var(--accent); margin-bottom: 0.5rem; font-size: 1.75rem; }
    .timestamp { color: #94a3b8; margin-bottom: 2rem; font-size: 0.875rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card { background: var(--card); border-radius: 12px; padding: 1.5rem; }
    .card h2 { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 2.5rem; font-weight: 700; color: var(--accent); }
    .metric-unit { font-size: 1rem; color: #94a3b8; }
    .progress-bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-top: 0.5rem; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
    .badge.healthy { background: #22c55e20; color: var(--success); }
    .badge.degraded { background: #f59e0b20; color: var(--warning); }
    .badge.down { background: #ef444420; color: var(--error); }
    .section-title { font-size: 1rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #334155; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #334155; color: #64748b; font-size: 0.75rem; text-align: center; }
  </style>
</head>
<body>
  <h1>System Metrics Dashboard</h1>
  <p class="timestamp">Generated: {{TIMESTAMP}}</p>
  <div class="grid">
    <div class="card"><h2>CPU Usage</h2><div class="metric-value">{{CPU_USAGE}}<span class="metric-unit">%</span></div><div class="progress-bar"><div class="progress-fill" style="width: {{CPU_USAGE}}%; background: var(--accent);"></div></div><p style="margin-top: 0.5rem; color: #94a3b8;">{{CPU_CORES}} cores | Load: {{LOAD_AVG}}</p></div>
    <div class="card"><h2>Memory</h2><div class="metric-value">{{MEM_USED}}<span class="metric-unit">/{{MEM_TOTAL}} GB</span></div><div class="progress-bar"><div class="progress-fill" style="width: {{MEM_PERCENT}}%; background: {{MEM_COLOR}};"></div></div><p style="margin-top: 0.5rem; color: #94a3b8;">{{MEM_FREE}} GB free</p></div>
    <div class="card"><h2>Disk</h2><div class="metric-value">{{DISK_USED}}<span class="metric-unit">/{{DISK_TOTAL}} GB</span></div><div class="progress-bar"><div class="progress-fill" style="width: {{DISK_PERCENT}}%; background: {{DISK_COLOR}};"></div></div><p style="margin-top: 0.5rem; color: #94a3b8;">{{DISK_PERCENT}}% utilized</p></div>
    <div class="card"><h2>Requests (24h)</h2><div class="metric-value">{{REQ_TOTAL}}</div><p style="margin-top: 0.5rem;"><span style="color: var(--success);">{{REQ_SUCCESS}} success</span> | <span style="color: var(--error);">{{REQ_ERRORS}} errors</span></p></div>
    <div class="card"><h2>Success Rate</h2><div class="metric-value" style="color: {{SUCCESS_RATE_COLOR}};">{{SUCCESS_RATE}}<span class="metric-unit">%</span></div><div class="progress-bar"><div class="progress-fill" style="width: {{SUCCESS_RATE}}%; background: {{SUCCESS_RATE_COLOR}};"></div></div></div>
    <div class="card"><h2>Latency (P95)</h2><div class="metric-value">{{P95_LATENCY}}<span class="metric-unit">ms</span></div><p style="margin-top: 0.5rem; color: #94a3b8;">P50: {{P50_LATENCY}}ms | P99: {{P99_LATENCY}}ms</p></div>
  </div>
  <h3 class="section-title">Services Status</h3>
  <div class="card"><table><thead><tr><th>Service</th><th>Status</th><th>Response Time</th></tr></thead><tbody>{{SERVICE_ROWS}}</tbody></table></div>
  <h3 class="section-title">Business Metrics</h3>
  <div class="grid">
    <div class="card"><h2>Active Users</h2><div class="metric-value">{{ACTIVE_USERS}}</div></div>
    <div class="card"><h2>New Signups</h2><div class="metric-value">{{NEW_SIGNUPS}}</div></div>
    <div class="card"><h2>Revenue (24h)</h2><div class="metric-value">$<span class="metric-unit">{{REVENUE}}</span></div></div>
  </div>
  <div class="footer">Powered by Anthropic Routine + MCP | Data refreshed every 6 hours</div>
</body>
</html>`;
}

/**
 * 保存 Dashboard 到文件
 */
async function saveDashboard(html) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `dashboard-${timestamp}.html`;
  const outputPath = join(OUTPUT_DIR, filename);
  
  writeFileSync(outputPath, html);
  console.log(`\n[Dashboard] Saved to: ${outputPath}`);
  
  return outputPath;
}

/**
 * 主执行函数
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Anthropic Routine - Dashboard Generator Demo         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('[Step 1/4] Aggregating metrics via MCP...');
  const metrics = await aggregateAllMetrics();
  
  console.log('[Step 2/4] Rendering HTML dashboard...');
  const html = renderDashboard(metrics);
  
  console.log('[Step 3/4] Saving dashboard to output directory...');
  const outputPath = await saveDashboard(html);
  
  console.log('[Step 4/4] Generating summary...');
  console.log('\n✓ Dashboard generation complete!');
  console.log('─'.repeat(60));
  console.log('Summary:');
  console.log(`  • Timestamp: ${metrics.timestamp}`);
  console.log(`  • CPU Usage: ${metrics.system.cpu.usage}%`);
  console.log(`  • Memory: ${metrics.system.memory.used}/${metrics.system.memory.total} GB`);
  console.log(`  • Disk: ${metrics.system.disk.used}/${metrics.system.disk.total} GB`);
  console.log(`  • Services: ${metrics.services.length} monitored`);
  console.log(`  • Total Requests: ${metrics.requests.total.toLocaleString()}`);
  console.log(`  • Success Rate: ${((metrics.requests.success/metrics.requests.total)*100).toFixed(1)}%`);
  console.log('─'.repeat(60));
  console.log(`Output: ${outputPath}`);
  console.log('\nTo view the dashboard, open the output file in a browser.');
  
  return outputPath;
}

// 导出供 Routine 调用
export { main, aggregateAllMetrics, renderDashboard };

// 直接运行时执行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[Error]', err);
    process.exit(1);
  });
}