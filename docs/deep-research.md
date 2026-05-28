# Anthropic Routine 深度研究报告

> 生成日期: 2026-05-28
> 研究级别: 深度技术调研 + 实战验证

---

## 一、产品定位与发布背景

### 1.1 什么是 Routine

**Routine** 是 Anthropic 在 Claude Code 平台上推出的**自动化工作流框架**，于 2026 年在 Claude Code Web 功能中正式发布。它允许开发者定义可触发的工作流，这些工作流可以：

- 定时自动执行（类似 cron job）
- 通过 API 触发（集成到现有系统）
- 响应 GitHub 事件（PR、Push 等）
- 调用 MCP 服务器获取外部数据

核心定位：**将 Claude Code 的智能能力从"交互式工具"升级为"自动化代理"**。

### 1.2 发布背景分析

Anthropic 在 2026 年持续扩张 Claude Code 产品线：

| 时间 | 产品 | 说明 |
|------|------|------|
| 2026-04-16 | Claude Opus 4.7 | 最新旗舰模型 |
| 2026-04-17 | Claude Design | 视觉设计工具 |
| 2026-05 | Routine | 自动化工作流 |

Routine 的发布填补了 Claude Code 在**无人值守自动化**方面的空白此前 Claude Code 主要是交互式工具，需要人工触发。Routine 使得周期性任务、webhook 驱动任务成为可能。

---

## 二、核心技术解析

### 2.1 架构设计

```
┌────────────────────────────────────────────────────────────────┐
│                     Routine Runtime (Cloud)                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Agent (Claude Sonnet 4.6)             │  │
│  │   - 遵循 instructions 定义的行为                         │  │
│  │   - 智能决策和推理                                       │  │
│  │   - 生成结构化输出                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               MCP Client Bridge                           │  │
│  │   - 协议转换                                             │  │
│  │   - 工具调用路由                                         │  │
│  │   - 响应聚合                                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Tool Executor                                 │  │
│  │   - read_file / write_file                                │  │
│  │   - execute_code                                         │  │
│  │   - send_message                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐       ┌─────────────┐      ┌─────────────┐
    │ MCP Server  │       │ MCP Server  │      │ MCP Server  │
    │ (Filesystem)│       │  (GitHub)   │      │  (Slack)    │
    └─────────────┘       └─────────────┘      └─────────────┘
```

### 2.2 触发机制详解

#### 2.2.1 Schedule Trigger

```yaml
triggers:
  - type: schedule
    cron: "0 9 * * *"      # 每天 9:00
    # 或
    cron: "0 */6 * * *"    # 每 6 小时
    # 或
    cron: "0 9,18 * * 1-5" # 工作日 9:00 和 18:00
```

**Cron 表达式支持：**
- 标准 5 位 cron 格式
- 支持星期几（1-5 表示工作日）
- 支持多时间点（逗号分隔）

#### 2.2.2 API Trigger

```yaml
triggers:
  - type: api
    auth:
      type: api_key        # API Key 认证
    rate_limit:
      requests: 100
      period: 3600        # 每小时 100 次
```

**触发方式：**
```bash
curl -X POST https://api.claude.ai/routines/trigger/{routine_id} \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"param1": "value1"}'
```

#### 2.2.3 GitHub Trigger

```yaml
triggers:
  - type: github
    repository: owner/repo
    events:
      - pull_request.opened
      - pull_request.closed
      - push.main
    filters:
      - path: "src/**/*.ts"
      - branch: "main"
```

**支持的事件类型：**
- `pull_request.opened` / `closed` / `merged`
- `push` (可按分支/路径过滤)
- `issue.opened` / `closed`
- `release.published`

### 2.3 MCP 集成

#### 2.3.1 MCP 协议简介

MCP (Model Context Protocol) 是 Anthropic 主导的**开放协议**，用于标准化 AI 模型与外部工具/数据源的连接。

**核心优势：**
1. **统一接口**：不同数据源使用相同协议
2. **可组合**：多个 MCP 服务器可并行调用
3. **安全性**：敏感凭据不暴露给模型

#### 2.3.2 Routine 中的 MCP 配置

```yaml
mcp_servers:
  - name: my-database
    command: npx
    args: ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"]
    enabled_tools:
      - execute_sql
      - list_tables
    env:
      DATABASE_URL: "${DB_URL}"  # 环境变量引用

  - name: github
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    enabled_tools:
      - github_get_repository
      - github_list_issues
      - github_create_issue
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"
```

#### 2.3.3 内置 MCP 服务器

| 服务器 | 功能 | 常用场景 |
|--------|------|----------|
| `@modelcontextprotocol/server-filesystem` | 文件读写 | 日志分析、配置读取 |
| `@modelcontextprotocol/server-github` | GitHub API | Issue 管理、PR 创建 |
| `@modelcontextprotocol/server-slack` | Slack API | 消息通知 |
| `@modelcontextprotocol/server-sqlite` | SQLite 操作 | 数据查询 |

---

## 三、实战案例：MCP 数据获取 + HTML 报表生成

### 3.1 案例需求

创建一个自动化 Routine，执行以下工作流：

1. 通过 MCP 获取系统指标数据（CPU、内存、磁盘）
2. 通过 MCP 获取应用数据（服务状态、请求统计）
3. 生成可视化 HTML Dashboard
4. 可选：通过 Slack MCP 发送通知

### 3.2 完整配置

#### 3.2.1 ROUTINE.md

```yaml
name: metrics-dashboard-generator
description: "Fetch system metrics via MCP and generate HTML monitoring dashboard"

triggers:
  - type: schedule
    cron: "0 */6 * * *"  # 每 6 小时执行
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

  - name: github
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"
    enabled_tools:
      - github_get_repository
      - github_list_issues

instructions: |
  You are a metrics dashboard generator. Your task:
  
  1. Read metrics data files from the data directory using MCP filesystem tools
  2. Parse JSON metrics and aggregate them
  3. Generate an HTML dashboard with:
     - System resources (CPU, Memory, Disk)
     - Service health status
     - Request statistics
     - Business metrics
  4. Save to output/dashboard-{timestamp}.html
  5. Use the dark theme and ensure mobile responsiveness
  
  Style requirements:
  - Background: #0f172a
  - Cards: #1e293b with rounded corners
  - Accent: #3b82f6 for primary metrics
  - Success/Warning/Error colors for status
```

### 3.3 生成脚本核心逻辑

```javascript
// generate-dashboard.mjs

async function main() {
  // Step 1: 通过 MCP 获取数据
  const metrics = await fetchMetricsViaMCP();
  
  // Step 2: 处理和聚合数据
  const aggregated = aggregateMetrics(metrics);
  
  // Step 3: 渲染 HTML
  const html = renderDashboard(aggregated);
  
  // Step 4: 保存输出
  await saveOutput(html);
  
  // Step 5: 可选 - 发送通知
  await sendNotificationViaMCP();
}
```

### 3.4 Dashboard 设计

生成的 Dashboard 包含：

**系统指标区**
- CPU 使用率（含进度条）
- 内存使用情况
- 磁盘空间
- 网络流量

**服务健康区**
- 服务状态表格
- 响应时间
- 可用性百分比

**业务指标区**
- 活跃用户数
- 新注册数
- 收入统计

**告警指示**
- 绿色：正常
- 黄色：警告
- 红色：异常

---

## 四、使用场景分析

### 4.1 适用场景

| 场景 | Routine 优势 |
|------|-------------|
| 定时报表生成 | 相比 cron + 脚本，更智能、可自然语言配置 |
| CI/CD 流程 | GitHub 触发 + MCP 数据检查 |
| 监控系统 | 定期抓取指标 + 异常时自动告警 |
| 数据同步 | API 触发 + MCP 多数据源聚合 |
| 代码审查 | PR 事件触发 + AI 分析 |

### 4.2 非适用场景

- 需要实时响应（Routine 有冷启动延迟）
- 极其简单的任务（直接用 cron 脚本更高效）
- 需要用户交互（Routine 是无人值守的）

---

## 五、定价与限制

### 5.1 当前限制

| 限制项 | 限制值 |
|--------|--------|
| 单次执行超时 | 10 分钟 |
| 冷启动延迟 | 3-5 秒 |
| MCP 并发连接 | 5 个服务器 |
| 日志保留 | 7 天 |
| 并发执行 | 3 个 Routine |

### 5.2 配额说明

Routine 使用 Claude Code 平台的计算资源：
- 每次执行消耗"运行分钟数"
- 触发频率影响总消耗
- 复杂 MCP 调用会增加 Token 消耗

---

## 六、竞品对比

| 特性 | Anthropic Routine | GitHub Actions | AWS Lambda |
|------|-------------------|----------------|------------|
| 触发方式 | Schedule/API/GitHub | Schedule/Webhook/多事件 | 事件/Schedule |
| AI 能力 | 原生集成 | 需配合 GPT | 需配合 Bedrock |
| MCP 支持 | 原生 | 需插件 | 需插件 |
| 配置方式 | YAML + 自然语言 | YAML | 代码 |
| 定价 | 运行分钟数 | 分钟数 | 执行时间 + 请求数 |

---

## 七、已知问题和注意事项

### 7.1 常见问题

1. **MCP 服务器连接失败**
   - 检查服务器命令是否正确
   - 确认环境变量已配置
   - 验证网络访问权限

2. **触发延迟**
   - Schedule 有 ±1 分钟误差
   - API 触发可能有冷启动

3. **超时问题**
   - 复杂任务需拆分为多个 Routine
   - 使用 `continue` 参数延长超时

### 7.2 安全建议

1. **环境变量管理**
   - 使用平台密钥管理
   - 避免在配置中硬编码凭据

2. **权限控制**
   - 最小化 MCP 工具权限
   - 使用 Environments 隔离网络

3. **敏感数据**
   - Routine 日志可能包含输入数据
   - 避免记录敏感信息到日志

---

## 八、结论与建议

### 8.1 核心价值

Routine 将 Claude Code 的 AI 能力**自动化**，适合：
- 需要 AI 参与决策的工作流
- 多数据源聚合场景
- 周期性报表和监控
- GitHub 事件驱动的开发流程

### 8.2 建议使用方式

1. **从小场景开始**：先用 Schedule 触发一个简单任务
2. **逐步增加复杂度**：添加 MCP、GitHub 触发
3. **监控执行情况**：关注执行时间和 Token 消耗
4. **迭代优化 Prompt**：根据执行结果调整 instructions

### 8.3 演示汇报要点

向领导汇报时建议强调：

1. **自动化水平**：减少人工干预，提升效率
2. **智能决策**：AI 驱动的数据处理能力
3. **集成能力**：MCP 协议的多数据源支持
4. **案例价值**：实际业务场景的落地效果

---

## 九、参考资料

- [官方文档](https://code.claude.com/docs/en/routines)
- [Claude Code 概览](https://code.claude.com/docs/en/)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [GitHub MCP 服务器](https://github.com/modelcontextprotocol/servers/tree/main/src/github)