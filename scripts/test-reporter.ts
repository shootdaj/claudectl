#!/usr/bin/env bun
/**
 * Custom test reporter that generates HTML reports with dark mode
 *
 * Usage: bun test 2>&1 | bun scripts/test-reporter.ts
 *
 * Generates: test-reports/YYYY-MM-DD-HH-MM-SS.html and test-reports/latest.html
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

interface TestResult {
  name: string;
  status: "pass" | "skip" | "fail";
  duration?: string;
  file?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  skipped: number;
  failed: number;
  duration: string;
  expects: number;
  files: number;
}

function parseTestOutput(input: string): { results: TestResult[]; summary: TestSummary; files: Map<string, TestResult[]> } {
  const lines = input.split("\n");
  const results: TestResult[] = [];
  const files = new Map<string, TestResult[]>();
  let currentFile = "";

  const summary: TestSummary = {
    total: 0,
    passed: 0,
    skipped: 0,
    failed: 0,
    duration: "0s",
    expects: 0,
    files: 0,
  };

  for (const line of lines) {
    // Match file headers like "src/integration.test.ts:"
    const fileMatch = line.match(/^(src\/[^:]+\.ts):$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!files.has(currentFile)) {
        files.set(currentFile, []);
      }
      continue;
    }

    // Match test results like "(pass) Test Name [10.00ms]"
    const passMatch = line.match(/^\(pass\)\s+(.+?)(?:\s+\[(\d+(?:\.\d+)?ms)\])?$/);
    if (passMatch) {
      const result: TestResult = {
        name: passMatch[1],
        status: "pass",
        duration: passMatch[2] || "<1ms",
        file: currentFile,
      };
      results.push(result);
      files.get(currentFile)?.push(result);
      continue;
    }

    // Match skipped tests
    const skipMatch = line.match(/^\(skip\)\s+(.+)$/);
    if (skipMatch) {
      const result: TestResult = {
        name: skipMatch[1],
        status: "skip",
        file: currentFile,
      };
      results.push(result);
      files.get(currentFile)?.push(result);
      continue;
    }

    // Match failed tests
    const failMatch = line.match(/^\(fail\)\s+(.+?)(?:\s+\[(\d+(?:\.\d+)?ms)\])?$/);
    if (failMatch) {
      const result: TestResult = {
        name: failMatch[1],
        status: "fail",
        duration: failMatch[2] || "",
        file: currentFile,
      };
      results.push(result);
      files.get(currentFile)?.push(result);
      continue;
    }

    // Match summary line like "295 pass"
    const passCountMatch = line.match(/^\s*(\d+)\s+pass/);
    if (passCountMatch) {
      summary.passed = parseInt(passCountMatch[1]);
    }

    const skipCountMatch = line.match(/^\s*(\d+)\s+skip/);
    if (skipCountMatch) {
      summary.skipped = parseInt(skipCountMatch[1]);
    }

    const failCountMatch = line.match(/^\s*(\d+)\s+fail/);
    if (failCountMatch) {
      summary.failed = parseInt(failCountMatch[1]);
    }

    // Match final summary line like "Ran 310 tests across 18 files. [3.27s]"
    const totalMatch = line.match(/Ran\s+(\d+)\s+tests\s+across\s+(\d+)\s+files\.\s+\[([^\]]+)\]/);
    if (totalMatch) {
      summary.total = parseInt(totalMatch[1]);
      summary.files = parseInt(totalMatch[2]);
      summary.duration = totalMatch[3];
    }

    // Match expect() calls like "566 expect() calls"
    const expectMatch = line.match(/(\d+)\s+expect\(\)\s+calls/);
    if (expectMatch) {
      summary.expects = parseInt(expectMatch[1]);
    }
  }

  return { results, summary, files };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateHtmlReport(results: TestResult[], summary: TestSummary, files: Map<string, TestResult[]>): string {
  const now = new Date();
  const timestamp = now.toISOString();
  const passRate = summary.total > 0 ? ((summary.passed / (summary.total - summary.skipped)) * 100).toFixed(1) : "0";
  const isAllPass = summary.failed === 0;
  const environment = process.env.CI ? "Docker (CI)" : "Local";

  let filesSections = "";
  for (const [file, fileResults] of files) {
    const passed = fileResults.filter(r => r.status === "pass").length;
    const skipped = fileResults.filter(r => r.status === "skip").length;
    const failed = fileResults.filter(r => r.status === "fail").length;
    const total = fileResults.length;

    let testsRows = "";
    for (const result of fileResults) {
      const statusClass = result.status;
      const statusIcon = result.status === "pass" ? "✓" : result.status === "skip" ? "○" : "✗";
      const duration = result.duration || "-";
      testsRows += `
        <tr class="test-row ${statusClass}">
          <td class="status-cell"><span class="status-icon ${statusClass}">${statusIcon}</span></td>
          <td class="test-name">${escapeHtml(result.name)}</td>
          <td class="duration">${duration}</td>
        </tr>`;
    }

    const fileStatus = failed > 0 ? "has-failures" : skipped > 0 ? "has-skipped" : "all-pass";
    filesSections += `
      <div class="file-section ${fileStatus}">
        <div class="file-header" onclick="toggleFile(this)">
          <span class="file-toggle">▶</span>
          <span class="file-name">${escapeHtml(file)}</span>
          <span class="file-stats">
            <span class="stat pass">${passed} pass</span>
            ${skipped > 0 ? `<span class="stat skip">${skipped} skip</span>` : ""}
            ${failed > 0 ? `<span class="stat fail">${failed} fail</span>` : ""}
          </span>
        </div>
        <div class="file-tests" style="display: none;">
          <table class="tests-table">
            <tbody>
              ${testsRows}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${now.toLocaleDateString()}</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-primary: #c9d1d9;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --pass-color: #3fb950;
      --skip-color: #d29922;
      --fail-color: #f85149;
      --accent-color: #58a6ff;
      --card-shadow: 0 3px 6px rgba(0,0,0,0.16);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
    }

    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo {
      font-size: 1.75rem;
    }

    .meta {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: var(--card-shadow);
    }

    .summary-card.result {
      grid-column: 1 / -1;
      text-align: center;
      padding: 2rem;
    }

    .summary-card.result.success {
      border-color: var(--pass-color);
      background: rgba(63, 185, 80, 0.1);
    }

    .summary-card.result.failure {
      border-color: var(--fail-color);
      background: rgba(248, 81, 73, 0.1);
    }

    .summary-label {
      color: var(--text-secondary);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .summary-value {
      font-size: 2rem;
      font-weight: 700;
    }

    .summary-value.pass { color: var(--pass-color); }
    .summary-value.skip { color: var(--skip-color); }
    .summary-value.fail { color: var(--fail-color); }

    .result-text {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .result-text.success { color: var(--pass-color); }
    .result-text.failure { color: var(--fail-color); }

    .progress-bar {
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 1rem;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--pass-color), #2ea043);
      transition: width 0.3s ease;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .file-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }

    .file-section.has-failures {
      border-left: 3px solid var(--fail-color);
    }

    .file-section.has-skipped {
      border-left: 3px solid var(--skip-color);
    }

    .file-section.all-pass {
      border-left: 3px solid var(--pass-color);
    }

    .file-header {
      padding: 0.75rem 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      transition: background 0.2s;
    }

    .file-header:hover {
      background: var(--bg-tertiary);
    }

    .file-toggle {
      color: var(--text-secondary);
      font-size: 0.75rem;
      transition: transform 0.2s;
    }

    .file-toggle.open {
      transform: rotate(90deg);
    }

    .file-name {
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 0.875rem;
      flex: 1;
    }

    .file-stats {
      display: flex;
      gap: 0.75rem;
    }

    .stat {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
    }

    .stat.pass {
      background: rgba(63, 185, 80, 0.15);
      color: var(--pass-color);
    }

    .stat.skip {
      background: rgba(210, 153, 34, 0.15);
      color: var(--skip-color);
    }

    .stat.fail {
      background: rgba(248, 81, 73, 0.15);
      color: var(--fail-color);
    }

    .file-tests {
      border-top: 1px solid var(--border-color);
    }

    .tests-table {
      width: 100%;
      border-collapse: collapse;
    }

    .test-row {
      border-bottom: 1px solid var(--border-color);
    }

    .test-row:last-child {
      border-bottom: none;
    }

    .test-row:hover {
      background: var(--bg-tertiary);
    }

    .test-row td {
      padding: 0.5rem 1rem;
    }

    .status-cell {
      width: 40px;
      text-align: center;
    }

    .status-icon {
      font-weight: 700;
    }

    .status-icon.pass { color: var(--pass-color); }
    .status-icon.skip { color: var(--skip-color); }
    .status-icon.fail { color: var(--fail-color); }

    .test-name {
      font-size: 0.875rem;
    }

    .duration {
      color: var(--text-muted);
      font-size: 0.75rem;
      font-family: 'SF Mono', Consolas, monospace;
      text-align: right;
      width: 80px;
    }

    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .expand-all-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      margin-bottom: 1rem;
      transition: background 0.2s;
    }

    .expand-all-btn:hover {
      background: var(--border-color);
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .header-content {
        flex-direction: column;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>
        <span class="logo">🧪</span>
        claudectl Test Report
      </h1>
      <div class="meta">
        <div>${timestamp}</div>
        <div>Environment: ${environment}</div>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="summary-card result ${isAllPass ? "success" : "failure"}">
      <div class="result-text ${isAllPass ? "success" : "failure"}">
        ${isAllPass ? "✓ ALL TESTS PASS" : `✗ ${summary.failed} FAILURES`}
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${passRate}%"></div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Total Tests</div>
        <div class="summary-value">${summary.total}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Passed</div>
        <div class="summary-value pass">${summary.passed}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Skipped</div>
        <div class="summary-value skip">${summary.skipped}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Failed</div>
        <div class="summary-value fail">${summary.failed}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Duration</div>
        <div class="summary-value">${summary.duration}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Test Files</div>
        <div class="summary-value">${summary.files}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Assertions</div>
        <div class="summary-value">${summary.expects}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Pass Rate</div>
        <div class="summary-value pass">${passRate}%</div>
      </div>
    </div>

    <h2 class="section-title">Test Results by File</h2>
    <button class="expand-all-btn" onclick="toggleAll()">Expand All</button>

    ${filesSections}

    <footer>
      <p>Generated by claudectl test reporter</p>
      <p>bun test v1.3.8</p>
    </footer>
  </div>

  <script>
    function toggleFile(header) {
      const tests = header.nextElementSibling;
      const toggle = header.querySelector('.file-toggle');
      const isOpen = tests.style.display !== 'none';
      tests.style.display = isOpen ? 'none' : 'block';
      toggle.classList.toggle('open', !isOpen);
    }

    let allExpanded = false;
    function toggleAll() {
      allExpanded = !allExpanded;
      const sections = document.querySelectorAll('.file-section');
      sections.forEach(section => {
        const tests = section.querySelector('.file-tests');
        const toggle = section.querySelector('.file-toggle');
        tests.style.display = allExpanded ? 'block' : 'none';
        toggle.classList.toggle('open', allExpanded);
      });
      document.querySelector('.expand-all-btn').textContent = allExpanded ? 'Collapse All' : 'Expand All';
    }
  </script>
</body>
</html>`;
}

async function main() {
  // Read from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  const input = Buffer.concat(chunks).toString();

  // Also echo the input to stdout so user sees test results
  console.log(input);

  // Parse and generate report
  const { results, summary, files } = parseTestOutput(input);
  const report = generateHtmlReport(results, summary, files);

  // Create reports directory
  const reportsDir = join(process.cwd(), "test-reports");
  try {
    mkdirSync(reportsDir, { recursive: true });
  } catch {
    // Directory exists
  }

  // Generate filename with timestamp
  const now = new Date();
  const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}.html`;
  const filepath = join(reportsDir, filename);

  // Write report
  writeFileSync(filepath, report);
  console.log(`\n📊 Test report saved to: ${filepath}`);

  // Also save as latest.html for easy access
  const latestPath = join(reportsDir, "latest.html");
  writeFileSync(latestPath, report);
  console.log(`📊 Latest report: ${latestPath}`);

  // Exit with appropriate code
  process.exit(summary.failed > 0 ? 1 : 0);
}

main();
