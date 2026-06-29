# Log Viewer — Geliştirici Rehberi

> Bu dosya her phase tamamlandıkça güncellenir.
> Mimari: **React + Node/Express + embedded DuckDB** (Docker yok, ayrı sunucu yok)
> Son güncelleme: **Phase 0'a hazır** (fresh kurulum)

---

## 1. Amaç ve Temel Kural

**Amaç:** Onlarca GB'a ulaşabilen NDJSON log dosyalarını akıcı biçimde görüntülemek.

**Temel kural:** İlk yüklemede 20-30 saniye beklemek kabul edilebilir. Sonrasında sıfır lag, sıfır donma.

**Neden bu mimari:** Veriyi tarayıcı belleğinde tutmak imkânsız (4.5 GB gerçek veride sekme çöktü). DuckDB veriyi **diske** yazar ve bellekten büyük veri setlerini diske spill ederek işler. Tarayıcı her seferinde yalnızca bir sayfa (100 satır) tutar, dolayısıyla çökme olmaz. Docker çalışmadığı için ClickHouse yerine embedded DuckDB kullanıyoruz — sadece bir npm paketi, ayrı sunucu/container yok.

---

## 2. Stack

| Katman         | Teknoloji                          | Neden                                                   |
| -------------- | ---------------------------------- | ------------------------------------------------------- |
| Frontend       | React + Vite + TypeScript          | Hızlı geliştirme, tip güvenliği                         |
| Virtual Scroll | react-window                       | Milyonlarca satırda sadece görünen ~30 satır DOM'da     |
| Backend        | Node.js + Express + TypeScript     | DuckDB'yi besler, sorguları çalıştırır                  |
| Veritabanı     | embedded DuckDB (@duckdb/node-api) | Columnar, diske yazar, GB ölçeğini kaldırır, Docker yok |

**Kullanılmayan (eski plandan):** Docker, ClickHouse, Uppy, TanStack Query/Virtual. İhtiyaç olursa sonra eklenir.

---

## 3. Klasör Yapısı

```
log-viewer/
├── LOG_VIEWER_DEV.md          ← bu dosya
├── generate-mock-logs.mjs     ← test verisi üretici
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── logs.db                ← DuckDB'nin diske yazdığı veritabanı (otomatik oluşur)
│   └── src/
│       └── index.ts
└── frontend/
    ├── package.json
    └── src/
        └── App.tsx
```

---

## 4. Mimari Akış

### Ingestion (klasör → DuckDB) — bir kerelik, 20-30 sn bütçesi burada

```
Kullanıcı klasör YOLUNU verir (POST /ingest, body: { folderPath })
        ↓
Node tek SQL çalıştırır:
  read_json_auto('<folder>/**/*.ndjson', filename = true)
        ↓
DuckDB tüm klasörü kendisi diskten tarar (Node RAM'i dolmaz)
        ↓
filename kolonundan metadata türetilir: console no, is_service_log
        ↓
logs.db dosyasına yazılır (diskte, sıkıştırılmış)
```

Tarayıcıya hiçbir dosya yüklenmez. 4.5 GB diskte kalır, sadece DuckDB okur.

### Query (her filtre/scroll'da) — lag olmaması gereken kısım

```
React UI — tab seç / filtre uygula / aşağı kaydır
        ↓
GET /logs?console=1&level=error&page=2&limit=100
        ↓
Node → SQL: WHERE + ORDER BY + LIMIT/OFFSET → runAndReadAll
        ↓
DuckDB → sadece 100 satır döner
        ↓
react-window → DOM'da sadece görünen ~30 satır
        ↓ (kullanıcı aşağı kaydırır)
Sonraki sayfa istenir
```

---

## 5. DuckDB Tablo Şeması

Ayrı bir `CREATE TABLE` yazmaya gerek yok; tablo ingestion sırasında `read_json_auto`'dan türetiliyor. Oluşan kolonlar:

| Kolon            | Tip     | Kaynak                                                         |
| ---------------- | ------- | -------------------------------------------------------------- |
| `timestamp`      | VARCHAR | log'daki ham değer (sıralama gerekince timestamp'e çevrilecek) |
| `level`          | VARCHAR | info / warning / error                                         |
| `service`        | VARCHAR | microservis adı                                                |
| `event_type`     | VARCHAR | event / query / command / commandResult                        |
| `message`        | VARCHAR | serbest metin                                                  |
| `source_path`    | VARCHAR | `filename` — dosyanın tam yolu                                 |
| `console`        | INTEGER | dosya yolundan regex ile (`console_1` → 1)                     |
| `is_service_log` | INTEGER | yol `serviceLogs` içeriyorsa 1, değilse 0                      |

> **Timestamp notu:** Format `DD.MM.YYYY HH:MM.mmmmm` standart değil. Şimdilik VARCHAR olarak saklanıyor. Sıralama (merged serviceLogs görünümü) gerektiğinde `strptime` ile gerçek `TIMESTAMP`'e çevrilecek (Phase 4). String olarak sıralanırsa gün-önce formatı yanlış sıralanır.

---

## 6. Roadmap

| Phase | İçerik                                                                       | Durum       |
| ----- | ---------------------------------------------------------------------------- | ----------- |
| **0** | Fresh kurulum — proje, backend (DuckDB testi), frontend, mock üretici        | 🔲 Sıradaki |
| **1** | Thin slice — /ingest (klasör yolu) + /logs + düz tablo                       | 🔲          |
| **2** | Gerçek ölçek — 4.5 GB testi, metadata kolonları, sorgu hızı                  | 🔲          |
| **3** | Pagination + react-window — lag yok kanıtı                                   | 🔲          |
| **4** | Navigation — console tab'ları, serviceLogs/other tree, merged sıralı görünüm | 🔲          |
| **5** | Filtreler (level/time/service/eventType) + reset butonu                      | 🔲          |
| **6** | Polish — error handling, progress, deferred (search/sort), CSS               | 🔲          |

---

## Phase 0 — Fresh Kurulum 🔲

> **Amaç:** Boş klasörden başlayıp backend'in DuckDB'ye bağlandığını ve frontend'in açıldığını kanıtlamak.

### 0.0 Gereksinim kontrolü

```bash
node -v    # 20+ olmalı
npm -v
```

> **Staj makinesi riski:** `@duckdb/node-api` native bir binary indirir. Docker'ı engelleyen güvenlik politikası bunu da engelleyebilir. Staja gidince **ilk iş** `npm install @duckdb/node-api`'nin çalıştığını teyit et. Kendi bilgisayarında sorun olmaz.

### 0.1 Proje klasörü

```bash
mkdir log-viewer && cd log-viewer
git init
```

`generate-mock-logs.mjs` dosyasını proje köküne koy (ayrı dosya olarak verildi).

### 0.2 Backend kurulumu

```bash
mkdir backend && cd backend
npm init -y
npm install express cors @duckdb/node-api
npm install -D typescript tsx @types/node @types/express @types/cors
npx tsc --init
```

`backend/package.json` içine ekle/düzenle:

```json
"type": "module",
"scripts": { "dev": "tsx watch src/index.ts" }
```

`backend/src/index.ts` — DuckDB bağlantı testi:

```ts
import { DuckDBInstance } from '@duckdb/node-api';

const instance = await DuckDBInstance.create('logs.db'); // diske yazan kalıcı DB
const connection = await instance.connect();

const reader = await connection.runAndReadAll(
  "SELECT 'DuckDB bağlı ✅' AS status",
);
console.log(reader.getRowObjects());
```

Çalıştır:

```bash
npm run dev
# Beklenen: [ { status: 'DuckDB bağlı ✅' } ]
```

> `getRowObjects()` hata verirse method adı sürümle farklı olabilir — `getRows()` dene.

### 0.3 Frontend kurulumu

Yeni terminal, `log-viewer` kökünden:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-window
npm install -D @types/react-window
npm run dev
# http://localhost:5173 açılmalı
```

### 0.4 Mock veri üret

`log-viewer` kökünden:

```bash
node generate-mock-logs.mjs 2000     # her dosyaya 2000 satır → toplam ~60k satır
```

Üretilen yapı:

```
mock-logs/
  console_1/
    serviceLogs/  (auth-service.ndjson, payment-service.ndjson, ...)
    gateway.ndjson, scheduler.ndjson, audit.ndjson, ...
  console_2/  (aynı yapı)
  console_3/  (aynı yapı)
```

Örnek satır:

```json
{
  "timestamp": "28.06.2026 12:45.19405",
  "level": "error",
  "service": "auth-service",
  "eventType": "query",
  "message": "Authentication failed for client client_737"
}
```

### Phase 0 Checklist

- [ ] `node -v` 20+
- [ ] `npm install @duckdb/node-api` sorunsuz kuruldu (binary indi)
- [ ] Backend `npm run dev` → `[ { status: 'DuckDB bağlı ✅' } ]`
- [ ] Frontend `npm run dev` → `localhost:5173` açılıyor
- [ ] `generate-mock-logs.mjs` çalıştı, `mock-logs/` üretildi

---

## Phase 1 — Thin Vertical Slice 🔲

> **Amaç:** Klasör yolundan ingest et, /logs ile geri çek, frontend'de düz tablo göster. Uçtan uca hattı kanıtla.

### 1.1 Backend — /ingest ve /logs

`backend/src/index.ts`'i şununla değiştir:

```ts
import express from 'express';
import cors from 'cors';
import { DuckDBInstance } from '@duckdb/node-api';

const app = express();
app.use(cors());
app.use(express.json());

const instance = await DuckDBInstance.create('logs.db');
const connection = await instance.connect();

// POST /ingest — klasör yolundan DuckDB'ye oku
app.post('/ingest', async (req, res) => {
  try {
    const folderPath = String(req.body.folderPath || '').replace(/\\/g, '/');
    if (!folderPath) {
      res.status(400).json({ error: 'folderPath gerekli' });
      return;
    }

    const glob = `${folderPath}/**/*.ndjson`;
    await connection.run(`
      CREATE OR REPLACE TABLE logs AS
      SELECT
        CAST(timestamp AS VARCHAR) AS timestamp,
        CAST(level     AS VARCHAR) AS level,
        CAST(service   AS VARCHAR) AS service,
        CAST(eventType AS VARCHAR) AS event_type,
        CAST(message   AS VARCHAR) AS message,
        filename                   AS source_path,
        TRY_CAST(regexp_extract(filename, 'console[_-]?([0-9]+)', 1) AS INTEGER) AS console,
        CASE WHEN filename LIKE '%serviceLogs%' THEN 1 ELSE 0 END AS is_service_log
      FROM read_json_auto('${glob}', filename = true, format = 'newline_delimited',
                          ignore_errors = true, union_by_name = true)
    `);

    const reader = await connection.runAndReadAll(
      'SELECT count(*) AS c FROM logs',
    );
    res.json({ inserted: Number(reader.getRowObjects()[0].c) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /logs — ilk 100 satır
app.get('/logs', async (_req, res) => {
  try {
    const reader = await connection.runAndReadAll(
      'SELECT * FROM logs LIMIT 100',
    );
    res.json(reader.getRowObjects());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(3000, () => console.log('Backend çalışıyor: http://localhost:3000'));
```

### 1.2 Test (curl)

```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{"folderPath": "/MUTLAK/YOL/mock-logs"}'
# Beklenen: { "inserted": 60000 }

curl http://localhost:3000/logs
# 100 satır JSON dönmeli
```

### 1.3 Frontend — düz tablo

`frontend/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';

interface Log {
  timestamp: string;
  level: string;
  service: string;
  event_type: string;
  message: string;
  console: number;
}

const COLORS: Record<string, string> = {
  info: '#4ade80',
  warning: '#facc15',
  error: '#f87171',
};

export default function App() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [status, setStatus] = useState('Yükleniyor...');

  useEffect(() => {
    fetch('http://localhost:3000/logs')
      .then((r) => r.json())
      .then((d) => {
        setLogs(d);
        setStatus(`${d.length} satır`);
      })
      .catch(() => setStatus("Backend'e bağlanılamadı"));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13 }}>
      <h2>Log Viewer — Phase 1 ({status})</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr
            style={{ background: '#1e1e1e', color: '#fff', textAlign: 'left' }}
          >
            <th style={{ padding: 8 }}>Timestamp</th>
            <th style={{ padding: 8 }}>Level</th>
            <th style={{ padding: 8 }}>Service</th>
            <th style={{ padding: 8 }}>Event</th>
            <th style={{ padding: 8 }}>Message</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <tr
              key={i}
              style={{ background: i % 2 ? '#1a1a1a' : '#111', color: '#ccc' }}
            >
              <td style={{ padding: 6 }}>{l.timestamp}</td>
              <td
                style={{ padding: 6, color: COLORS[l.level], fontWeight: 700 }}
              >
                {l.level}
              </td>
              <td style={{ padding: 6 }}>{l.service}</td>
              <td style={{ padding: 6 }}>{l.event_type}</td>
              <td style={{ padding: 6 }}>{l.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Phase 1 Checklist

- [ ] `/ingest` çağrısı `inserted` sayısı döndürüyor
- [ ] `/logs` 100 satır döndürüyor
- [ ] Frontend tabloda 100 satır görünüyor, level renkli
- [ ] `console` ve `is_service_log` kolonları doğru dolmuş (örn. serviceLogs dosyaları için 1)

---

## Phase 2 — Gerçek Ölçek 🔲

> **Amaç:** 4.5 GB gerçek klasörü ingest et, kabul edilebilir sürede bitsin, sorgular hızlı olsun.

### Yapılacaklar

- [ ] Gerçek 4.5 GB klasörü `/ingest` ile yükle, süreyi ölç (hedef: makul, ~30 sn bandında)
- [ ] `console` regex'inin gerçek klasör adlarıyla eşleştiğini doğrula
- [ ] `is_service_log`'un doğru ayrıştığını kontrol et (`SELECT is_service_log, count(*) FROM logs GROUP BY 1`)
- [ ] Bozuk satır sayısını kontrol et (`ignore_errors` kaç satır atladı)
- [ ] Basit sorgu hızını ölç: `SELECT count(*) FROM logs WHERE level='error'` anlık dönmeli
- [ ] (Opsiyonel) ingest'i asenkron yap: `/ingest` hemen dönsün, durum `/ingest/status` ile sorulsun (HTTP timeout'a karşı)

### Milestone

> 4.5 GB diskte DuckDB'de, filtreli count sorguları anında dönüyor, tarayıcı hiç zorlanmıyor.

---

## Phase 3 — Pagination + react-window 🔲

> **Amaç:** Sayfalı sorgu + sanal scroll ile "lag yok" garantisini kur.

### Yapılacaklar

- [ ] `/logs` endpoint'ine `page` ve `limit` query parametreleri (`LIMIT ? OFFSET ?`)
- [ ] Frontend: scroll dibe yaklaşınca sonraki sayfayı iste (infinite scroll), gelen satırları listeye ekle
- [ ] react-window `FixedSizeList` ile render — sadece görünen satırlar DOM'da
- [ ] Yüz binlerce satırda scroll'u test et, takılma olmamalı

### Milestone

> Büyük veride akıcı, kesintisiz scroll. Backend sadece görünen sayfayı sorguluyor.

---

## Phase 4 — Navigation 🔲

> **Amaç:** Sketch'teki gezinme — bütün UI navigasyonu SQL `WHERE`'e dönüşür.

### Yapılacaklar

- [ ] Timestamp'i gerçek tipe çevir: `strptime(timestamp, '%d.%m.%Y %H:%M.%f')` ile sıralanabilir kolon (5 haneli ms formatını test et, gerekirse normalize et)
- [ ] Üst tab'lar: console_1 / console_2 / console_3 → `WHERE console = ?`
- [ ] Sol tree: serviceLogs + diğer loglar (sığ yapı; basitse kendi recursive component'in, library şart değil)
- [ ] serviceLogs'a girince: `WHERE console=? AND is_service_log=1 ORDER BY ts` → tüm dosyalar tek sıralı görünüm (JS'te merge YOK)
- [ ] Tek dosyaya tıklayınca: `WHERE source_path = ?`
- [ ] Klasör tıklama mantığı: merge edilmemiş alt klasör varsa onları göster, sadece log varsa direkt listele

### Milestone

> Sketch'teki tüm gezinme çalışıyor; merged serviceLogs görünümü doğru zaman sırasında.

---

## Phase 5 — Filtreler + Reset 🔲

### Yapılacaklar

- [ ] Filtre UI (üst sağ): level, timestamp aralığı, service, eventType
- [ ] Her filtre `WHERE` clause'a eklenir (prepared statement / parametre ile, string birleştirme değil)
- [ ] Aktif filtreler + seçili tab/dosya birlikte çalışır (hepsi tek sorguda birleşir)
- [ ] Yüklenen klasör adını üst sağda göster
- [ ] Reset butonu: tüm filtre/seçim state'ini sıfırla, ilk ekrana dön

### Milestone

> Tüm zorunlu filtreler + reset çalışıyor, filtreler birbiriyle ve navigation ile birleşiyor.

---

## Phase 6 — Polish 🔲

### Yapılacaklar

- [ ] Ingest sırasında progress / loading göstergesi
- [ ] Hata durumları: klasör bulunamadı, boş klasör, bozuk satırlar
- [ ] (Deferred) search bar — `WHERE message ILIKE '%...%'`
- [ ] (Deferred) kolon başlığına tıklayınca sorting
- [ ] CSS / tasarım cilası (burada AI yardımı serbest)
- [ ] Reset sonrası `DROP TABLE logs` ile temiz başlangıç

---

## Notlar

- **logic senin:** Mentör kuralı gereği SQL sorguları ve uygulama mantığı senin yazacağın kısım; kurulum/boilerplate (npm, config, DuckDB init) serbest.
- **Tek SQL ingestion** en büyük basitleştirme: manuel stream + batch döngüsü yok, DuckDB klasörü kendi okuyor.
- **Tarayıcı asla GB tutmaz:** sadece o anki sayfa (100 satır) bellekte. Çökme bu yüzden imkânsız.
- **Eski ClickHouse/Docker planı** terk edildi; bu rehber tek geçerli kaynak.
