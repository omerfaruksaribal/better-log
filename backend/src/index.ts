import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { DuckDBInstance } from '@duckdb/node-api';

// BigInt -> JSON uyumu. count(*) BigInt döner, JSON.stringify onsuz patlar.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

// SQL string literal escape: tek tırnağı ikile (' -> ''). Dosya adı/path'te tırnak olursa sorgu kırılmasın.
const sqlEscape = (s: string) => s.replace(/'/g, "''");

const app = express();
app.use(cors());
app.use(express.json());

const instance = await DuckDBInstance.create('logs.db');
const connection = await instance.connect();

// timestamp: ham değer ("DD.MM.YYYY HH:MM:SSmmm", SS=saniye, mmm=ms, sondaki sıfırlar kırpık)
// timestamp_iso: sıralama için parse edilmiş gerçek TIMESTAMP
// source_path / console / is_service_log: dosyanın klasör konumu (relativePath'ten türetilir)
await connection.run(`
  CREATE TABLE IF NOT EXISTS logs (
    timestamp VARCHAR,
    timestamp_iso TIMESTAMP,
    level VARCHAR,
    service VARCHAR,
    event_type VARCHAR,
    message VARCHAR,
    source_path VARCHAR,
    console INTEGER,
    is_service_log INTEGER
  )
`);

// multer: gelen dosyaları geçici olarak diskteki /uploads klasörüne yazar.
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage, limits: { fileSize: Infinity } });

/**
 * ENDPOINT: POST /upload
 * Uppy XHRUpload dosyaları 'files' alanıyla, klasör yolunu da 'relativePath' meta alanıyla gönderir.
 * bundle:false + limit:1 olduğu için her istekte tek dosya gelir -> req.body.relativePath o dosyaya aittir.
 */
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'There are no files to be uploaded.' });
      return;
    }
    console.log(`Files received: ${files.length}. Transfer to DuckDB started.`);

    for (const file of files) {
      // filePath: okumak için gerçek disk yolu (uploads/...)
      const filePath = sqlEscape(file.path.replace(/\\/g, '/'));

      // relPath: METADATA için mantıksal yol. Klasör yapısı (console_x, serviceLogs) burada.
      // multer'ın temp yolunda bu bilgi YOK; o yüzden Uppy'nin relativePath meta'sını kullanıyoruz.
      const relPath = sqlEscape(
        String(req.body.relativePath || file.originalname).replace(/\\/g, '/'),
      );

      try {
        await connection.run(`
          INSERT INTO logs
          SELECT
            timestamp,
            COALESCE(try_strptime(rebuilt_ts, '%d.%m.%Y %H:%M:%S.%f'), NOW()) AS timestamp_iso,
            level, service, event_type, message, source_path, console, is_service_log
          FROM (
            SELECT
              CAST(timestamp AS VARCHAR) AS timestamp,
              -- saniye+ms kuyruğunu 5 haneye rpad'le, ilk 2 = saniye, son 3 = ms, "SS.mmm" formuna sok
              split_part(CAST(timestamp AS VARCHAR), ':', 1) || ':' ||
              split_part(CAST(timestamp AS VARCHAR), ':', 2) || ':' ||
              substr(rpad(split_part(CAST(timestamp AS VARCHAR), ':', 3), 5, '0'), 1, 2) || '.' ||
              substr(rpad(split_part(CAST(timestamp AS VARCHAR), ':', 3), 5, '0'), 3, 3) AS rebuilt_ts,
              CAST(level AS VARCHAR)     AS level,
              CAST(service AS VARCHAR)   AS service,
              CAST(eventType AS VARCHAR) AS event_type,
              CAST(message AS VARCHAR)   AS message,
              '${relPath}' AS source_path,
              TRY_CAST(regexp_extract('${relPath}', 'console[_-]?([0-9]+)', 1) AS INTEGER) AS console,
              CASE WHEN '${relPath}' LIKE '%serviceLogs%' THEN 1 ELSE 0 END AS is_service_log
            FROM read_json_auto('${filePath}', format = 'newline_delimited',
                                ignore_errors = true, union_by_name = true)
          )
        `);
      } finally {
        // delete the temp file even if INSERT fails (uploads/ shouldn't get full)
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }

    const reader = await connection.runAndReadAll(
      'SELECT count(*) AS total FROM logs',
    );
    const totalRows = Number(reader.getRowObjects()[0]?.total || 0);

    console.log(`Done. Total rows in DB: ${totalRows}`);
    res.json({ success: true, totalInDB: totalRows });
  } catch (error) {
    console.error('Upload failed: ', (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * ENDPOINT: GET /logs?page=&limit=
 * timestamp_iso DESC
 */
app.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 100));
    const offset = (page - 1) * limit;

    const reader = await connection.runAndReadAll(`
      SELECT * FROM logs
      ORDER BY timestamp_iso DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json(reader.getRowObjects());
  } catch (error) {
    console.error('Query error: ', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * ENDPOINT: POST /reset
 */
app.post('/reset', async (_req, res) => {
  try {
    await connection.run('TRUNCATE TABLE logs');
    res.json({ message: 'Database successfully cleaned.' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Log server is ready: http://localhost:${PORT}`);
});

const check = await connection.runAndReadAll(
  'SELECT console, is_service_log, count(*) AS c FROM logs GROUP BY 1, 2 ORDER BY 1, 2',
);
console.log(check.getRowObjects());
