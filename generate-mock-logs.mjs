/**
 * Mock Log Generator
 * Üretilen yapı:
 *   mock-logs/
 *     console_1/
 *       serviceLogs/
 *         auth-service.ndjson
 *         payment-service.ndjson
 *         user-service.ndjson
 *       gateway.ndjson
 *       scheduler.ndjson
 *     console_2/
 *       ...aynı yapı...
 *     console_3/
 *       ...aynı yapı...
 *
 * Timestamp formatı: DD.MM.YYYY HH:MM.mmmmm
 *   - mmmmm → 5 haneli milisaniye (00000-99999)
 *   - Gerçek formatla uyuşmuyorsa sadece formatTimestamp() fonksiyonunu düzenle.
 *
 * Kullanım:
 *   node generate-mock-logs.mjs              → her dosyaya 500 satır (varsayılan)
 *   node generate-mock-logs.mjs 2000         → her dosyaya 2000 satır
 *   node generate-mock-logs.mjs 10000        → her dosyaya 10k satır (toplam ~150k satır)
 */

import fs from 'fs';
import path from 'path';

// ─── Konfigürasyon ──────────────────────────────────────────────────────────

const ROWS_PER_FILE = parseInt(process.argv[2] ?? '500', 10);
const OUTPUT_DIR = 'mock-logs';

const CONSOLES = ['console_1', 'console_2', 'console_3'];

const SERVICE_LOG_FILES = [
  'auth-service',
  'payment-service',
  'user-service',
  'order-service',
  'notification-service',
];

const OTHER_LOG_FILES = [
  'gateway',
  'scheduler',
  'config-watcher',
  'health-check',
  'audit',
];

const LEVELS = ['info', 'info', 'info', 'warning', 'error']; // info ağırlıklı
const EVENT_TYPES = ['event', 'query', 'command', 'commandResult'];

const MESSAGES = {
  info: [
    'Request processed successfully',
    'Cache hit for key {key}',
    'Connection established to {host}',
    'Scheduled job started: {job}',
    'User session created',
    'Configuration reloaded',
    'Health check passed',
    'Message published to queue: {queue}',
    'Response time: {ms}ms',
    'Token refreshed for client {id}',
  ],
  warning: [
    'Retry attempt {n} of 3 for {host}',
    'Response time exceeded threshold: {ms}ms',
    'Cache miss — falling back to DB',
    'Queue depth high: {n} messages pending',
    'Deprecated endpoint called: {endpoint}',
    'Rate limit approaching for client {id}',
  ],
  error: [
    'Unhandled exception in {service}: {err}',
    'Database connection timeout after {ms}ms',
    'Failed to publish message to {queue}',
    'Authentication failed for client {id}',
    'Circuit breaker OPEN for {host}',
    'Disk usage critical: {pct}% used',
  ],
};

const ERRORS = [
  'NullPointerException',
  'TimeoutException',
  'ConnectionRefused',
  'OutOfMemoryError',
];
const QUEUES = [
  'orders.created',
  'payments.processed',
  'notifications.send',
  'audit.log',
];
const HOSTS = [
  'db-primary:5432',
  'redis-cluster:6379',
  'kafka-broker:9092',
  'es-node:9200',
];
const JOBS = [
  'daily-report',
  'cleanup-stale-sessions',
  'sync-external-data',
  'rebuild-index',
];

// ─── Yardımcı fonksiyonlar ──────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/**
 * Timestamp üretir: DD.MM.YYYY HH:MM.mmmmm
 * Gerçek formatla uyuşmuyorsa sadece bu fonksiyonu düzenle.
 */
function formatTimestamp(date) {
  const dd = pad(date.getDate(), 2);
  const mm = pad(date.getMonth() + 1, 2);
  const yyyy = date.getFullYear();
  const HH = pad(date.getHours(), 2);
  const MM = pad(date.getMinutes(), 2);
  const ms5 = pad(date.getMilliseconds() * 100 + randInt(0, 99), 5); // 5 hane
  return `${dd}.${mm}.${yyyy} ${HH}:${MM}.${ms5}`;
}

function fillTemplate(template) {
  return template
    .replace('{key}', `key_${randInt(1000, 9999)}`)
    .replace('{host}', pick(HOSTS))
    .replace('{job}', pick(JOBS))
    .replace('{queue}', pick(QUEUES))
    .replace('{ms}', randInt(10, 5000))
    .replace('{id}', `client_${randInt(100, 999)}`)
    .replace('{n}', randInt(1, 3))
    .replace(
      '{endpoint}',
      `/api/v${randInt(1, 2)}/${pick(['users', 'orders', 'payments'])}`,
    )
    .replace('{service}', pick(SERVICE_LOG_FILES))
    .replace('{err}', pick(ERRORS))
    .replace('{pct}', randInt(85, 99));
}

function generateRow(service, timestamp) {
  const level = pick(LEVELS);
  const eventType = pick(EVENT_TYPES);
  const msgPool = MESSAGES[level];
  const message = fillTemplate(pick(msgPool));

  return JSON.stringify({ timestamp, level, service, eventType, message });
}

/**
 * Belirtilen satır sayısı kadar log üretir.
 * Timestamp'ler sıralı (kronolojik) olarak artar.
 */
function generateRows(serviceName, count) {
  const lines = [];
  // Son 7 günün içinde rastgele başlangıç zamanı
  let current = new Date(Date.now() - randInt(0, 7 * 24 * 60 * 60 * 1000));

  for (let i = 0; i < count; i++) {
    // Her satır arasına 100ms–5s arası rastgele aralık
    current = new Date(current.getTime() + randInt(100, 5000));
    lines.push(generateRow(serviceName, formatTimestamp(current)));
  }
  return lines.join('\n');
}

// ─── Klasör + dosya üretimi ─────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

let totalFiles = 0;
let totalRows = 0;

for (const consoleName of CONSOLES) {
  const consoleDir = path.join(OUTPUT_DIR, consoleName);
  const serviceLogsDir = path.join(consoleDir, 'serviceLogs');

  ensureDir(serviceLogsDir);

  // serviceLogs/ altındaki dosyalar
  for (const svc of SERVICE_LOG_FILES) {
    const filePath = path.join(serviceLogsDir, `${svc}.ndjson`);
    const content = generateRows(svc, ROWS_PER_FILE);
    fs.writeFileSync(filePath, content, 'utf8');
    totalFiles++;
    totalRows += ROWS_PER_FILE;
    console.log(`  ✓ ${filePath}  (${ROWS_PER_FILE} satır)`);
  }

  // Doğrudan console altındaki diğer log dosyaları
  for (const other of OTHER_LOG_FILES) {
    const filePath = path.join(consoleDir, `${other}.ndjson`);
    const content = generateRows(other, ROWS_PER_FILE);
    fs.writeFileSync(filePath, content, 'utf8');
    totalFiles++;
    totalRows += ROWS_PER_FILE;
    console.log(`  ✓ ${filePath}  (${ROWS_PER_FILE} satır)`);
  }
}

console.log('');
console.log(
  `✅ Tamamlandı: ${totalFiles} dosya, toplam ${totalRows.toLocaleString()} satır`,
);
console.log(`📁 Klasör: ${path.resolve(OUTPUT_DIR)}`);
console.log('');
console.log('Örnek satır:');
const sample = generateRow('auth-service', formatTimestamp(new Date()));
console.log(' ', sample);
