import express from 'express';
import cors from 'cors';
import fs from 'fs';
import readline from 'readline';
import { createClient } from '@clickhouse/client';

const app = express();
app.use(cors());
app.use(express.json());

const client = createClient({
  url: 'http://localhost:8123',
  username: 'dev',
  password: 'dev',
  database: 'logs_db',
});

// ─── POST /ingest ────────────────────────────────────────────────────────────
app.post('/ingest', async (req, res) => {
  const filePath = req.body.filePath as string;

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(400).json({ error: 'Geçerli bir filePath gönder' });
    return;
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let inserted = 0;
  let skipped = 0;
  const batch: object[] = [];
  const BATCH_SIZE = 1000;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    await client.insert({
      table: 'logs',
      values: batch,
      format: 'JSONEachRow',
    });
    inserted += batch.length;
    batch.length = 0; // diziyi temizle
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }

    batch.push({
      timestamp: new Date(),
      level: String(parsed.level ?? ''),
      service: String(parsed.service ?? ''),
      event_type: String(parsed.eventType ?? ''),
      message: String(parsed.message ?? ''),
      console: 0,
      source_folder: '',
      source_file: '',
      is_service_log: 0,
    });

    if (batch.length >= BATCH_SIZE) await flushBatch();
  }

  await flushBatch(); // kalan satırları gönder

  res.json({ inserted, skipped });
});

// ─── GET /logs ───────────────────────────────────────────────────────────────
app.get('/logs', async (req, res) => {
  const result = await client.query({
    query: 'SELECT * FROM logs LIMIT 100',
    format: 'JSONEachRow',
  });

  const rows = await result.json();
  res.json(rows);
});

// ─── Sunucu ──────────────────────────────────────────────────────────────────
app.listen(3000, () => {
  console.log('Backend çalışıyor: http://localhost:3000');
});
