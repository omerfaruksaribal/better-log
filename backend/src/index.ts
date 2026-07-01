import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { DuckDBInstance } from '@duckdb/node-api';

// BigInt -> JSON count(*) returns BigInt, JSON.stringify will crash without it.
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

// timestamp_iso: original timestamp -> iso form
// source_path / console / is_service_log: files location (comes from relativePath)
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

// multer: it writes files temporarly to the /uploads file
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage, limits: { fileSize: Infinity } });

// Windows'ta bir dosya hâlâ açık bir handle'a sahipse (AV taraması, native binary'nin
// handle'ı geç bırakması gibi) unlink EBUSY/EPERM ile başarısız olabilir — macOS/Linux'ta
// bu sorun yaşanmaz çünkü POSIX açık dosyaların silinmesine izin verir. Kısa gecikmeyle
// birkaç kez tekrar deniyoruz; hâlâ olmuyorsa gerçek hata kodunu logluyoruz.
async function safeUnlink(filePath: string, attempt = 1): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error(
      `Temp file deletion failed (attempt ${attempt}): ${filePath} — code: ${code}`,
    );
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      return safeUnlink(filePath, attempt + 1);
    }
    console.error(`Giving up on deleting: ${filePath}`);
  }
}

/**
 * ENDPOINT: POST /upload
 * Uppy sends XHRUpload files with field of 'files', sendsr elativePath with meta field.
 * bundle: false + limit:1 -> each request brings 1 file -> req.body.relativePath belongs to that file.
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
      //! multer'ın temp yolunda bu bilgi yok; o yüzden Uppy'nin relativePath meta'sını kullanıyoruz.
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
        await safeUnlink(filePath);
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
