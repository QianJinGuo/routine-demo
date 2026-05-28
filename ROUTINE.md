# ROUTINE.md - Metrics Dashboard Generator

name: metrics-dashboard-generator
description: "Fetch system metrics via MCP and generate HTML monitoring dashboard"
triggers:
  - type: schedule
    cron: "0 */6 * * *"  # Every 6 hours
  - type: api
    auth:
      type: api_key
mcp_servers:
  - name: local-metrics
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-filesystem"
      - "./data"
    enabled_tools:
      - read_directory
      - read_file
  - name: github
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"
    enabled_tools:
      - github_get_repository
      - github_list_issues
instructions: |
  You are a metrics dashboard generator. Follow these steps:
  
  1. Check for metrics data files using MCP filesystem tools
  2. Parse any JSON/CSV metrics files found in the data directory
  3. Generate a comprehensive HTML dashboard with:
     - System metrics overview (CPU, Memory, Disk)
     - Service health status table
     - Request statistics
     - Time-series charts using vanilla JS
     - Current status indicators
  4. Save the dashboard to output/dashboard-{timestamp}.html
  5. Commit the dashboard to the repository if changes detected
  
  The dashboard should be visually polished with a dark theme.
  Use accurate real-time data from the MCP tools.
environments:
  - name: production
    variables:
      OUTPUT_BRANCH: main
      DASHBOARD_REPO: your-org/dashboard-repo