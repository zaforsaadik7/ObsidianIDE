import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://127.0.0.1:5000';
const CONCURRENT_REQUESTS = 250;
const STRESS_PASS_COUNT = 250;

async function runLoadEvaluation() {
  console.log(`===========================================================`);
  console.log(`🚀 OBSIDIAN-IDE EMPIRICAL SYSTEM EVALUATION BENCHMARK`);
  console.log(`Target Host: ${BASE_URL}`);
  console.log(`===========================================================\n`);

  // --- PASS 1: CONCURRENT THROUGHPUT & LATENCY ---
  console.log(`[PASS 1] Executing ${CONCURRENT_REQUESTS} Concurrent API Requests...`);
  const startTime = Date.now();
  const requests = [];

  for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
    const isSecure = i % 2 === 0;
    const url = isSecure ? `${BASE_URL}/api/secure-health` : `${BASE_URL}/api/health`;
    
    const reqStartTime = Date.now();
    const reqPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sample_empirical_eval_jwt_token'
      }
    })
      .then(async (res) => {
        const duration = Date.now() - reqStartTime;
        return { id: i, status: res.status, duration, ok: res.ok, rateLimited: res.status === 429 };
      })
      .catch((err) => {
        const duration = Date.now() - reqStartTime;
        return { id: i, status: 0, duration, ok: false, error: err.message, rateLimited: false };
      });

    requests.push(reqPromise);
  }

  const pass1Results = await Promise.all(requests);
  const pass1TotalTimeMs = Date.now() - startTime;

  let pass1Success = 0;
  let pass1RateLimited = 0;
  let pass1TotalLatency = 0;
  const latencies = [];

  pass1Results.forEach(r => {
    pass1TotalLatency += r.duration;
    latencies.push(r.duration);
    if (r.ok || r.status === 200 || r.status === 401 || r.status === 403) pass1Success++;
    if (r.rateLimited) pass1RateLimited++;
  });

  latencies.sort((a, b) => a - b);
  const avgLatency = (pass1TotalLatency / CONCURRENT_REQUESTS).toFixed(2);
  const p50 = latencies[Math.floor(CONCURRENT_REQUESTS * 0.50)];
  const p95 = latencies[Math.floor(CONCURRENT_REQUESTS * 0.95)];
  const p99 = latencies[Math.floor(CONCURRENT_REQUESTS * 0.99)];
  const rps = ((CONCURRENT_REQUESTS / pass1TotalTimeMs) * 1000).toFixed(2);

  // --- PASS 2: RATE LIMITER THROTTLING STRESS TEST ---
  console.log(`\n[PASS 2] Executing Rapid Sequential Throttling Test (${STRESS_PASS_COUNT} Requests)...`);
  let pass2RateLimitedCount = 0;
  let pass2AcceptedCount = 0;

  for (let i = 1; i <= STRESS_PASS_COUNT; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 429) {
        pass2RateLimitedCount++;
      } else {
        pass2AcceptedCount++;
      }
    } catch (e) {}
  }

  // --- PASS 3: PATCH STAGING PIPELINE MICRO-BENCHMARK ---
  console.log(`\n[PASS 3] Benchmarking Save & Sync Staging Patch Pipeline...`);
  
  // 1. Stage Patch (POST /api/projects/save-and-sync)
  const patchStartTime = Date.now();
  let stagePatchLatency = 0;
  let stagePatchSuccess = false;
  let createdPatchObj = null;

  try {
    const stageRes = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sample_eval_jwt'
      },
      body: JSON.stringify({
        projectId: 'quantum-router-01',
        fileId: 'f-01',
        filePath: 'src/main.rs',
        content: `// Benchmark Refactored Code\nfn main() { println!("Empirical Evaluation Stage"); }`,
        oldContent: `// Previous Version`,
        userEmail: 'zafor@bubt.edu.bd',
        userName: 'Md. Emam Zafor Saadik',
        summaryNote: 'Automated empirical evaluation patch staging test'
      })
    });
    stagePatchLatency = Date.now() - patchStartTime;
    const stageData = await stageRes.json();
    if (stageRes.ok && stageData.patch) {
      stagePatchSuccess = true;
      createdPatchObj = stageData.patch;
    }
  } catch (err) {
    console.warn("Patch staging benchmark notice:", err);
  }

  // 2. Resolve Patch (POST /api/projects/resolve-patch)
  const resolveStartTime = Date.now();
  let resolvePatchLatency = 0;
  let resolvePatchSuccess = false;

  if (createdPatchObj) {
    try {
      const resolveRes = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sample_eval_jwt'
        },
        body: JSON.stringify({
          projectId: 'quantum-router-01',
          patchId: createdPatchObj.patchId,
          action: 'APPROVE'
        })
      });
      resolvePatchLatency = Date.now() - resolveStartTime;
      const resolveData = await resolveRes.json();
      if (resolveRes.ok) {
        resolvePatchSuccess = true;
      }
    } catch (err) {
      console.warn("Patch resolve benchmark notice:", err);
    }
  }

  // --- FINAL BENCHMARK SUMMARY ---
  console.log(`\n===========================================================`);
  console.log(`📊 EMPIRICAL EVALUATION TELEMETRY REPORT`);
  console.log(`===========================================================`);
  console.log(`[PASS 1] Concurrent Throughput Benchmark:`);
  console.log(`  - Total Completed Requests  : ${CONCURRENT_REQUESTS}`);
  console.log(`  - Total Elapsed Duration    : ${pass1TotalTimeMs} ms`);
  console.log(`  - Request Throughput (RPS)  : ${rps} req/sec`);
  console.log(`  - Average Latency           : ${avgLatency} ms`);
  console.log(`  - Latency Percentiles       : p50 = ${p50}ms | p95 = ${p95}ms | p99 = ${p99}ms`);
  console.log(`-----------------------------------------------------------`);
  console.log(`[PASS 2] Rate-Limiter Throttling Efficacy:`);
  console.log(`  - Sequential Requests Fired : ${STRESS_PASS_COUNT}`);
  console.log(`  - Allowed Requests (Window) : ${pass2AcceptedCount}`);
  console.log(`  - Rate Limited (429 Blocks) : ${pass2RateLimitedCount} (${((pass2RateLimitedCount/STRESS_PASS_COUNT)*100).toFixed(1)}% Throttling Efficacy)`);
  console.log(`-----------------------------------------------------------`);
  console.log(`[PASS 3] Collaborative Patch Staging Pipeline:`);
  console.log(`  - Stage Patch (Save & Sync) : ${stagePatchLatency} ms [Status: ${stagePatchSuccess ? 'SUCCESS' : 'FAILED'}]`);
  console.log(`  - Resolve Patch (Approve)   : ${resolvePatchLatency} ms [Status: ${resolvePatchSuccess ? 'SUCCESS' : 'FAILED'}]`);
  console.log(`  - Total Pipeline Latency    : ${stagePatchLatency + resolvePatchLatency} ms`);
  console.log(`===========================================================\n`);

  // --- EXPORT TELEMETRY TO CSV FILE ---
  try {
    const csvHeaders = 'RequestID,Status,Duration_ms,RateLimited\n';
    const csvRows = pass1Results.map(r => `${r.id},${r.status},${r.duration},${r.rateLimited ? 1 : 0}`).join('\n');
    const csvContent = csvHeaders + csvRows;

    const exportPath = path.join(__dirname, 'telemetry_export.csv');
    fs.writeFileSync(exportPath, csvContent, 'utf-8');
    console.log(`📁 Telemetry empirical evaluation exported successfully to: ${exportPath}\n`);
  } catch (fsErr) {
    console.warn("CSV export warning:", fsErr.message);
  }
}

runLoadEvaluation();
