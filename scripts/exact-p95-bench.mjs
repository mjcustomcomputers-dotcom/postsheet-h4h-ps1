#!/usr/bin/env node
// Exact Float64 per-request p50 / p95 / p97.5 / p99 latency benchmark at 100 concurrent connections
import { request, Agent } from 'node:http';

const url = new URL(process.argv[2] || 'http://127.0.0.1:8788/api/events/seed-event/board?limit=100');
const concurrency = Number(process.argv[3] || 100);
const durationMs = Number(process.argv[4] || 5000);
const agent = new Agent({ keepAlive: true, maxSockets: concurrency });

const samples = [];
let errors = 0, non2xx = 0, active = 0, stopping = false;
const deadline = performance.now() + durationMs;

function fire() {
  if (stopping || performance.now() >= deadline) return;
  active++;
  const t0 = performance.now();
  const req = request(url, { agent, method: 'GET' }, res => {
    res.resume();
    res.on('end', () => {
      samples.push(performance.now() - t0);
      if (res.statusCode !== 200) non2xx++;
      active--;
      if (performance.now() < deadline) fire();
      else if (active === 0) report();
    });
  });
  req.on('error', () => {
    errors++;
    active--;
    if (performance.now() < deadline) fire();
    else if (active === 0) report();
  });
  req.end();
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((q / 100) * sorted.length) - 1);
  return Number(sorted[idx].toFixed(2));
}

let reported = false;
function report() {
  if (reported) return;
  reported = true;
  stopping = true;
  agent.destroy();
  samples.sort((a, b) => a - b);
  const out = {
    url: url.href,
    concurrency,
    durationMs,
    requests: samples.length,
    errors,
    non2xx,
    p50Ms: pct(samples, 50),
    p90Ms: pct(samples, 90),
    p95Ms: pct(samples, 95),
    p97_5Ms: pct(samples, 97.5),
    p99Ms: pct(samples, 99),
    passP95Under200Ms: samples.length >= 100 && errors === 0 && non2xx === 0 && pct(samples, 95) < 200
  };
  console.log(JSON.stringify(out));
  process.exit(out.passP95Under200Ms ? 0 : 1);
}

for (let i = 0; i < concurrency; i++) fire();
