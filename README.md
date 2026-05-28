# Anthropic Routine 深度研究与实战演示

## 一、Routine 概述

**Routine** 是 Anthropic 在 Claude Code 平台上推出的自动化执行框架，允许用户定义可触发的工作流，集成 MCP (Model Context Protocol) 工具，实现数据获取、处理和输出的全流程自动化。

核心能力：
- **触发机制**：支持定时调度 (Schedule)、API 调用、GitHub Events 三种触发方式
- **MCP 集成**：通过 MCP 协议连接外部数据源和工具
- **无服务器执行**：云端运行，无需管理基础设施
- **会话管理**：每次触发生成独立会话，支持分支和权限控制

官网文档：https://code.claude.com/docs/en/routines

---

## 二、核心概念解析

### 2.1 Routine vs Skills vs Commands

| 特性 | Routine | Skills | Commands |
|------|---------|--------|----------|
| 触发方式 | 定时/Api/GitHub | API调用 | 手动触发 |
| 执行环境 | 云端自动化 | 运行时加载 | 终端交互 |
| MCP集成 | 原生支持 | 通过API | 需手动配置 |
| 适用场景 | 报表生成、监控 | 工具扩展 | 快速任务 |

### 2.2 触发类型详解

#### Schedule Trigger (定时触发)
```yaml
triggers:
  - type: schedule
    cron: "0 9 * * *"  # 每天9点执行
```

#### API Trigger (API触发)
```yaml
triggers:
  - type: api
    auth:
      type: api_key
```

#### GitHub Trigger (GitHub事件触发)
```yaml
triggers:
  - type: github
    events:
      - pull_request.opened
      - push
```

### 2.3 MCP 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Routine Runtime                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Agent (Claude)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              MCP Client Bridge                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │  MCP A    │   │  MCP B    │   │  MCP C    │
    │ (数据库)   │   │ (API数据) │   │ (文件)    │
    └───────────┘   └───────────┘   └───────────┘
```

---

## 三实战演示：MCP数据获取 + HTML报表生成

### 3.1 场景描述

创建一个 Routine，使用 MCP 获取系统指标数据，生成 HTML 格式的监控报表 Dashboard。

### 3.2 项目结构

```
routine-demo/
├── README.md                    # 本文档
├── ROUTINE.md                   # Routine 配置文件
├── mcp-config.json              # MCP 服务器配置
├── src/
│   ├── generate-dashboard.mjs  # Dashboard 生成脚本
│   ├── metrics-collector.js    # 指标收集工具
│   └── template.html            # HTML 模板
├── output/                      # 生成的报表输出目录
└── docs/
    └── deep-research.md        # 深度研究报告
```

### 3.3 配置文件

#### ROUTINE.md - Routine 定义
```yaml
name: metrics-dashboard-generator
description: "Fetch system metrics via MCP and generate HTML dashboard"
triggers:
  - type: schedule
    cron: "0 */6 * * *"  # 每6小时执行一次
  - type: api
    auth:
      type: api_key

mcp_servers:
  - name: local-metrics
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    enabled_tools:
      - read_directory
      - read_file

instructions: |
  You are a metrics dashboard generator. Follow these steps:
  
  1. Use the MCP filesystem tools to check for metrics data files
  2. Parse any JSON/CSV metrics files found
  3. Generate a comprehensive HTML dashboard with:
     - System metrics overview (CPU, Memory, Disk)
     - Time-series charts using vanilla JS
     - Current status indicators
  4. Save the dashboard to output/dashboard-{timestamp}.html
```

#### mcp-config.json - MCP 服务器配置
```json
{
  "mcpServers": {
    "local-metrics": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 3.4 核心代码

#### src/generate-dashboard.mjs
```javascript
// generate-dashboard.mjs
// Routine 执行脚本 - 使用 MCP 获取数据并生成 HTML Dashboard

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../output');

// 确保输出目录存在
mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * 从 MCP 获取指标数据
 * 这里模拟从 MCP 文件系统工具获取数据
 */
async function fetchMetrics() {
  // 模拟 metrics 数据（实际从 MCP 获取）
  const mockMetrics = {
    timestamp: new Date().toISOString(),
    system: {
      cpu: { usage: 42.5, cores: 8 },
      memory: { used: 16.2, total: 32, unit: 'GB' },
      disk: { used: 256, total: 512, unit: 'GB' }
    },
    services: [
      { name: 'api-gateway', status: 'healthy', responseTime: 120 },
      { name: 'database', status: 'healthy', responseTime: 45 },
      { name: 'cache', status: 'degraded', responseTime: 280 },
      { name: 'worker', status: 'healthy', responseTime: 89 }
    ],
    requests: {
      total: 45230,
      success: 44890,
      errors: 340,
      p95 latency: 245
    }
  };
  return mockMetrics;
}

/**
 * 生成 HTML Dashboard
 */
function generateDashboard(metrics) {
  const timestamp = new Date().toISOString();
  const serviceRows = metrics.services.map(s => `
    <tr class="${s.status === 'healthy' ? 'healthy' : 'degraded'}">
      <td>${s.name}</td>
      <td><span class="badge ${s.status}">${s.status}</span></td>
      <td>${s.responseTime}ms</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Metrics Dashboard - ${timestamp}</title>
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
    }
    h1 { color: var(--accent); margin-bottom: 0.5rem; }
    .timestamp { color: #94a3b8; margin-bottom: 2rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
    }
    .card h2 { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1rem; }
    .metric-value { font-size: 2.5rem; font-weight: 700; color: var(--accent); }
    .metric-unit { font-size: 1rem; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 500; }
    .badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.healthy { background: #22c55e20; color: var(--success); }
    .badge.degraded { background: #f59e0b20; color: var(--warning); }
    .badge.down { background: #ef444420; color: var(--error); }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .progress-fill { height: 100%; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>System Metrics Dashboard</h1>
  <p class="timestamp">Generated at: ${timestamp}</p>

  <div class="grid">
    <div class="card">
      <h2>CPU Usage</h2>
      <div class="metric-value">${metrics.system.cpu.usage}<span class="metric-unit">%</span></div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${metrics.system.cpu.usage}%; background: var(--accent);"></div>
      </div>
      <p style="margin-top: 0.5rem; color: #94a3b8;">${metrics.system.cpu.cores} cores</p>
    </div>

    <div class="card">
      <h2>Memory</h2>
      <div class="metric-value">${metrics.system.memory.used}<span class="metric-unit">/${metrics.system.memory.total} GB</span></div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(metrics.system.memory.used/metrics.system.memory.total*100)}%; background: var(--warning);"></div>
      </div>
    </div>

    <div class="card">
      <h2>Disk</h2>
      <div class="metric-value">${metrics.system.disk.used}<span class="metric-unit">/${metrics.system.disk.total} GB</span></div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(metrics.system.disk.used/metrics.system.disk.total*100)}%; background: var(--success);"></div>
      </div>
    </div>

    <div class="card">
      <h2>Total Requests</h2>
      <div class="metric-value">${metrics.requests.total.toLocaleString()}</div>
      <p style="margin-top: 0.5rem; color: var(--success);">${((metrics.requests.success/metrics.requests.total*100)).toFixed(1)}% success rate</p>
    </div>
  </div>

  <div class="card">
    <h2>Services Status</h2>
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Status</th>
          <th>Response Time</th>
        </tr>
      </thead>
      <tbody>
        ${serviceRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

/**
 * 主执行函数
 */
async function main() {
  console.log('[Routine] Starting metrics dashboard generation...');

  // 1. 获取指标数据 (via MCP)
  console.log('[Step 1] Fetching metrics via MCP...');
  const metrics = await fetchMetrics();
  console.log('[Step 1] Metrics fetched:', JSON.stringify(metrics, null, 2));

  // 2. 生成 Dashboard HTML
  console.log('[Step 2] Generating HTML dashboard...');
  const html = generateDashboard(metrics);

  // 3. 保存输出
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(OUTPUT_DIR, `dashboard-${timestamp}.html`);
  writeFileSync(outputPath, html);

  console.log(`[Complete] Dashboard saved to: ${outputPath}`);
  return outputPath;
}

main().catch(console.error);
```

### 3.5 使用方法

#### 本地运行演示
```bash
cd ~/projects/routine-demo

# 安装依赖
npm init -y
npm install node

# 运行生成脚本
node src/generate-dashboard.mjs
```

#### 部署到 Routine
```bash
# 登录 Claude Code Web
claude code login

# 部署 Routine
claude routine deploy ROUTINE.md
```

### 3.6 演示效果

生成的 Dashboard 包含：
- **系统指标卡片**：CPU、内存、磁盘使用率
- **服务状态表格**：各服务的健康状态和响应时间
- **请求统计**：总请求量和成功率
- **实时时间戳**：生成时间

---

## 四、高级用法

### 4.1 链式 MCP 调用

```javascript
// 从多个 MCP 服务器获取数据
const [metrics, logs, alerts] = await Promise.all([
  mcp.metrics.fetch(),
  mcp.logs.query({ last: '24h' }),
  mcp.alerts.getActive()
]);
```

### 4.2 条件分支

```yaml
instructions: |
  If disk usage > 90%:
    - Send alert via MCP pagerduty.notify
    - Generate emergency report
  Else:
    - Continue with normal dashboard generation
```

### 4.3 定时调度配置

```yaml
triggers:
  - type: schedule
    cron: "0 9,18 * * 1-5"  # 工作日早9点和晚6点
```

---

## 五、已知限制与注意事项

1. **MCP 服务器需提前配置**：Routine 运行时需要可访问的 MCP 服务器
2. **冷启动延迟**：云端 Routine 可能有 3-5 秒冷启动时间
3. **超时限制**：单个 Routine 执行最长 10 分钟
4. **网络隔离**：需配置 Environments 以访问内网资源

---

## 六、参考资料

- [官方文档](https://code.claude.com/docs/en/routines)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [示例项目](https://github.com/anthropics/claude-code/tree/main/.claude/commands)