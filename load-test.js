#!/usr/bin/env node

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const TARGET_URL = process.env.TARGET_URL || 'https://nextjs-effect-batching-lm5tufzsq-tobiaslins.vercel.app/api';
const REQUESTS_PER_SECOND = parseInt(process.env.RPS) || 200;
const DURATION_SECONDS = parseInt(process.env.DURATION) || 60 * 5;
const CONCURRENT_CONNECTIONS = parseInt(process.env.CONCURRENCY) || 100;

// Random payload generators
const generateRandomPayload = () => {
  const payloadTypes = [
    () => ({ type: 'user', data: { id: Math.floor(Math.random() * 10000), name: `user_${Math.random().toString(36).substr(2, 8)}` }}),
    () => ({ type: 'order', data: { orderId: Math.random().toString(36), amount: Math.floor(Math.random() * 1000), items: Math.floor(Math.random() * 10) + 1 }}),
    () => ({ type: 'event', data: { eventType: ['click', 'view', 'purchase'][Math.floor(Math.random() * 3)], timestamp: Date.now() }}),
    () => ({ type: 'analytics', data: { sessionId: Math.random().toString(36), duration: Math.floor(Math.random() * 3600) }}),
    () => ({ type: 'notification', data: { message: `Alert ${Math.random().toString(36).substr(2, 6)}`, priority: Math.floor(Math.random() * 5) + 1 }})
  ];
  
  const generator = payloadTypes[Math.floor(Math.random() * payloadTypes.length)];
  return generator();
};

// HTTP client function
const makeRequest = (url, payload) => {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Load-Test-Script/1.0'
      }
    };

    const startTime = Date.now();
    const req = client.request(options, (res) => {
      const endTime = Date.now();
      let data = '';
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          responseTime: endTime - startTime,
          bodyLength: data.length
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 'ERROR',
        responseTime: Date.now() - startTime,
        error: error.message
      });
    });

    req.write(postData);
    req.end();
  });
};

// Statistics tracking
let stats = {
  totalRequests: 0,
  successfulRequests: 0,
  errorRequests: 0,
  responseTimes: [],
  statusCodes: {}
};

// Main load test function
const runLoadTest = async () => {
  console.log(`Starting load test:`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Rate: ${REQUESTS_PER_SECOND} req/sec`);
  console.log(`Duration: ${DURATION_SECONDS} seconds`);
  console.log(`Concurrency: ${CONCURRENT_CONNECTIONS}`);
  console.log('---');

  const intervalMs = 1000 / REQUESTS_PER_SECOND;
  const batchIntervalMs = Math.max(10, Math.min(100, intervalMs)); // Adaptive batch interval
  const requestsPerInterval = Math.max(1, Math.floor(REQUESTS_PER_SECOND * batchIntervalMs / 1000));

  console.log(`Batch configuration:`);
  console.log(`  Interval: ${intervalMs.toFixed(2)}ms per request`);
  console.log(`  Batch interval: ${batchIntervalMs}ms`);
  console.log(`  Requests per batch: ${requestsPerInterval}`);
  console.log(`  Actual RPS: ${(requestsPerInterval * 1000 / batchIntervalMs).toFixed(2)}`);
  console.log('---');

  const startTime = Date.now();
  const endTime = startTime + (DURATION_SECONDS * 1000);
  
  const sendBatch = async () => {
    const promises = [];
    for (let i = 0; i < requestsPerInterval; i++) {
      const payload = generateRandomPayload();
      promises.push(makeRequest(TARGET_URL, payload));
    }
    
    const results = await Promise.all(promises);
    
    results.forEach(result => {
      stats.totalRequests++;
      stats.responseTimes.push(result.responseTime);
      
      if (result.status === 'ERROR') {
        stats.errorRequests++;
      } else {
        stats.successfulRequests++;
        stats.statusCodes[result.status] = (stats.statusCodes[result.status] || 0) + 1;
      }
    });
  };

  // Start the load test
  const interval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      printFinalStats();
      return;
    }
    
    await sendBatch();
    
    // Print progress every 5 seconds
    if (stats.totalRequests % (REQUESTS_PER_SECOND * 5) === 0) {
      printProgress();
    }
  }, batchIntervalMs);
};

const printProgress = () => {
  const avgResponseTime = stats.responseTimes.length > 0 
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : 0;
  
  console.log(`Requests: ${stats.totalRequests}, Success: ${stats.successfulRequests}, Errors: ${stats.errorRequests}, Avg RT: ${avgResponseTime}ms`);
};

const printFinalStats = () => {
  console.log('\n=== FINAL STATISTICS ===');
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Successful: ${stats.successfulRequests}`);
  console.log(`Errors: ${stats.errorRequests}`);
  console.log(`Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%`);
  
  if (stats.responseTimes.length > 0) {
    const sorted = stats.responseTimes.sort((a, b) => a - b);
    const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    console.log(`Response Times (ms):`);
    console.log(`  Average: ${avg}`);
    console.log(`  50th percentile: ${p50}`);
    console.log(`  95th percentile: ${p95}`);
    console.log(`  99th percentile: ${p99}`);
    console.log(`  Min: ${Math.min(...sorted)}`);
    console.log(`  Max: ${Math.max(...sorted)}`);
  }
  
  console.log(`Status Codes:`);
  Object.keys(stats.statusCodes).forEach(code => {
    console.log(`  ${code}: ${stats.statusCodes[code]}`);
  });
  
  process.exit(0);
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping load test...');
  printFinalStats();
});

// Start the load test
runLoadTest().catch(console.error);