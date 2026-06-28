# Log Viewer — Geliştirici Rehberi

> Bu dosya her phase tamamlandıkça güncellenir.
> Son güncelleme: **Phase 1** ✅

---

## Mimari Özet

**Amaç:** Onlarca GB'a ulaşabilen JSON log dosyalarını tarayıcıda akıcı biçimde görüntülemek.

**Temel kural:** İlk 20-30 saniyelik yükleme beklentisi kabul edilebilir. Sonrasında sıfır lag, sıfır loading ekranı.

### Stack

| Katman           | Teknoloji                      | Neden                                                    |
| ---------------- | ------------------------------ | -------------------------------------------------------- |
| Frontend         | React + Vite + TypeScript      | Hızlı geliştirme, tip güvenliği                          |
| UI State / Cache | TanStack Query                 | Pagination + otomatik cache                              |
| Virtual Scroll   | TanStack Virtual               | Milyonlarca satırda DOM hafif kalır                      |
| File Upload      | Uppy                           | Chunked + resumable upload (büyük dosyalar için)         |
| Backend          | Node.js + Express + TypeScript | Stream-based ingestion                                   |
| Veritabanı       | ClickHouse (self-hosted)       | Log analytics için sektör standardı, columnar, çok hızlı |
| Container        | Docker + docker-compose        | Ortam tutarlılığı                                        |

### Klasör Yapısı

```
log-viewer/
├── docker-compose.yml
├── LOG_VIEWER_DEV.md       ← bu dosya
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
└── frontend/
    ├── package.json
    └── src/
```

---

## Ingestion Pipeline (yükleme → ClickHouse)

> Bir kerelik çalışır. 20-30 sn bütçesi burada harcanır.

```
Kullanıcı drag-drop (Uppy)
        ↓
Chunked HTTP upload → backend
        ↓
Chunk'lar temp diske birleşir
        ↓
fs.createReadStream — dosyayı parça parça okur (RAM'e tamamen almaz)
        ↓
Satır satır JSON.parse (NDJSON)
        ↓
Her satıra metadata eklenir:
  console, source_folder, source_file, is_service_log, timestamp → DateTime64
        ↓
10k-100k satırlık batch paketleri oluşturulur
        ↓
Tek SQL ile bulk insert (JSONEachRow formatı)
        ↓
ClickHouse — MergeTree, disk'te sıkıştırılmış
```

## Query Pipeline (her scroll / filtre değişiminde)

> Lag olmaması gereken kısım.

```
React UI — tab seç, filtre uygula, aşağı kaydır
        ↓
TanStack Query → GET /logs?console=1&level=error&page=2&limit=100
        ↓
Backend → WHERE + ORDER BY timestamp + LIMIT/OFFSET
        ↓
ClickHouse → sadece istenen 100 satır döner
        ↓
TanStack Virtual → DOM'da sadece görünen ~20-30 satır render edilir
        ↓  (kullanıcı aşağı kaydırır)
Otomatik next page isteği
```

---

## ClickHouse Schema

```sql
CREATE DATABASE logs_db;

CREATE TABLE logs_db.logs (
    timestamp      DateTime64(3),         -- DD.MM.YYYY string'i parse edilip buraya yazılır
    level          LowCardinality(String), -- info / error / warning
    service        LowCardinality(String), -- microservis adı
    event_type     LowCardinality(String), -- event / query / command / commandResult
    message        String,
    console        UInt8,                  -- 1 / 2 / 3
    source_folder  LowCardinality(String), -- serviceLogs, otherLogs vs.
    source_file    String,                 -- kaynak dosya adı
    is_service_log UInt8                   -- 1 = serviceLogs altında, 0 = değil
) ENGINE = MergeTree()
ORDER BY (console, service, timestamp);
-- ORDER BY filtre pattern'ine göre seçildi: önce console, sonra service, sonra zaman
```

> **Önemli:** `timestamp` asla string olarak saklanmaz. `DD.MM.YYYY HH:MM:...` formatı
> insert sırasında `DateTime64(3)`'e çevrilir. String olarak saklanırsa lexical sort bozulur.

> **LowCardinality:** Az sayıda farklı değeri olan kolonlarda (level, service, event_type)
> otomatik dictionary encoding uygular — compression ve filtre hızı belirgin biçimde artar.

---

## Roadmap

| Phase | İçerik                                                          | Süre     | Durum         |
| ----- | --------------------------------------------------------------- | -------- | ------------- |
| **0** | Ortam kurulumu, Docker, ClickHouse, backend & frontend iskeleti | ~1 gün   | ✅ Tamamlandı |
| **1** | Thin vertical slice — tek dosyadan uçtan uca veri akışı         | ~1-2 gün | ✅ Tamamlandı |
| **2** | Gerçek ingestion — büyük dosya, metadata, batch insert          | ~2-3 gün | 🔲            |
| **3** | Pagination + virtual scroll — lag yok kanıtı                    | ~2 gün   | 🔲            |
| **4** | Klasör yükleme, navigation, tree view                           | ~2-3 gün | 🔲            |
| **5** | Filtreler + reset butonu                                        | ~2 gün   | 🔲            |
| **6** | Polish, error handling, deferred özellikler, buffer             | ~2 gün   | 🔲            |

---

## Phase 0 — Ortam Kurulumu ✅

### Gereksinimler

```bash
node -v      # 20+ olmalı
docker -v    # Docker Desktop çalışır durumda olmalı
git -v
```

### 1. docker-compose.yml

```yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - '8123:8123'
      - '9000:9000'
    environment:
      CLICKHOUSE_USER: dev
      CLICKHOUSE_PASSWORD: dev
      CLICKHOUSE_DB: logs_db
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    ulimits:
      nofile: { soft: 262144, hard: 262144 }
volumes:
  clickhouse_data:
```

```bash
docker compose up -d
curl http://localhost:8123    # "Ok." dönmeli
```

### 2. ClickHouse — database ve tablo oluşturma

```bash
docker compose exec clickhouse clickhouse-client --user dev --password dev
```

```sql
CREATE DATABASE logs_db;

CREATE TABLE logs_db.logs (
    timestamp      DateTime64(3),
    level          LowCardinality(String),
    service        LowCardinality(String),
    event_type     LowCardinality(String),
    message        String,
    console        UInt8,
    source_folder  LowCardinality(String),
    source_file    String,
    is_service_log UInt8
) ENGINE = MergeTree()
ORDER BY (console, service, timestamp);

SHOW TABLES IN logs_db;   -- "logs" görünmeli
```

> Tarayıcıdan SQL atmak için: `http://localhost:8123/play` (kullanıcı: dev, şifre: dev)

### 3. Backend

```bash
cd backend
npm init -y
npm install express cors @clickhouse/client
npm install -D typescript tsx @types/node @types/express @types/cors
npx tsc --init
```

`package.json` içinde:

```json
"type": "module",
"scripts": { "dev": "tsx watch src/index.ts" }
```

`src/index.ts` — bağlantı testi:

```ts
import { createClient } from '@clickhouse/client';

const client = createClient({
  url: 'http://localhost:8123',
  username: 'dev',
  password: 'dev',
  database: 'logs_db',
});

const result = await client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
console.log('ClickHouse bağlı:', await result.json());
```

```bash
npm run dev
# Beklenen çıktı: ClickHouse bağlı: [ { '1': 1 } ]
```

> **Dikkat:** URL `http://localhost:8123` olmalı. `clickhouse:8123` sadece Docker network
> içinden çözülür; backend host makinede koştuğu için `localhost` kullanılır.

### 4. Frontend

```bash
# log-viewer kökünden:
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query @tanstack/react-virtual
npm run dev
# http://localhost:5173 açılmalı
```

### 5. Mock Log Üretici

Gerçek loglar olmadan geliştirme yapmak için kullanılır. Proje köküne `generate-mock-logs.mjs` dosyasını koy.

```bash
node generate-mock-logs.mjs          # her dosyaya 500 satır (varsayılan)
node generate-mock-logs.mjs 2000     # her dosyaya 2000 satır
node generate-mock-logs.mjs 10000    # her dosyaya 10k satır → toplam ~300k satır
```

Üretilen klasör yapısı:

```
mock-logs/
  console_1/
    serviceLogs/
      auth-service.ndjson
      payment-service.ndjson
      user-service.ndjson
      order-service.ndjson
      notification-service.ndjson
    gateway.ndjson
    scheduler.ndjson
    config-watcher.ndjson
    health-check.ndjson
    audit.ndjson
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

> Timestamp formatı: `DD.MM.YYYY HH:MM.mmmmm` (5 haneli milisaniye)
> Gerçek loglarla karşılaştırınca format farklıysa scriptteki `formatTimestamp()` fonksiyonunu güncelle.

### Phase 0 Checklist

- [x] `docker compose up -d` → `curl localhost:8123` → "Ok."
- [x] `logs_db` database ve `logs` tablosu oluşturuldu
- [x] Backend `npm run dev` → "ClickHouse bağlı" logu
- [x] Frontend `npm run dev` → `localhost:5173` açılıyor
- [x] `generate-mock-logs.mjs` çalışıyor, `mock-logs/` klasörü üretildi

---

## Phase 1 — Thin Vertical Slice ✅

> **Amaç:** Upload UI olmadan, hardcode bir NDJSON dosyasından veriyi ClickHouse'a insert et
> ve frontend'de düz tablo olarak göster. Pipeline'ı uçtan uca kanıtlamak.

### Phase 1 Checklist

- [x] Backend: `POST /ingest` endpoint — dosya yolu body'den alınır, `createReadStream` ile okuma
- [x] Satır satır `JSON.parse`, 1000'lik batch insert (row-by-row çok yavaş olduğu için Phase 1'de batch'e geçildi)
- [x] Backend: `GET /logs` endpoint — ilk 100 satırı döner
- [x] Frontend: `fetch('/logs')` ile çek, düz `<table>` ile göster, level'a göre renklendirme
- [x] Test: `auth-service.ndjson` → `/ingest` → ClickHouse → `/logs` → tarayıcıda tablo

### Notlar

- `timestamp` Phase 1'de `new Date()` (insert zamanı) olarak kaydedildi — Phase 2'de gerçek değer parse edilecek.
- `metadata` kolonları (`console`, `source_file`, `is_service_log`) Phase 1'de boş / 0 — Phase 2'de dolacak.
- Batch size: 1000 satır. Row-by-row insert 500 satır için bile dakikalarca sürdü; 1000'lik batch saniyeler içinde bitti.

### Önemli Bulgu

`/ingest` endpoint'i şu an **senkron** çalışıyor — büyük dosyalarda HTTP isteği timeout'a düşebilir.
Phase 2'de bu asenkron hale getirilecek (ingest başlatılır, progress ayrıca sorgulanır).

---

## Phase 2 — Gerçek Ingestion 🔲

> **Amaç:** Timestamp parse'ı, metadata kolonları, büyük dosya testi. 20-30 sn bütçesini burada kanıtla.

### Yapılacaklar

- [ ] **Timestamp parse:** `DD.MM.YYYY HH:MM.mmmmm` → `DateTime64(3)` dönüşümü
  - `new Date()` yerine log'daki gerçek timestamp insert edilmeli
  - Parse hatalıysa satırı atla (`skipped` sayacına ekle)
- [ ] **Metadata kolonları:** her satıra `console`, `source_folder`, `source_file`, `is_service_log` ekle
  - Bu değerler dosya yolundan çıkarılacak (örn: path'te `serviceLogs` geçiyorsa `is_service_log = 1`)
- [ ] **Batch size optimizasyonu:** 1000 → 10.000 satır dene, ClickHouse'un tepkisini ölç
- [ ] **Backpressure:** batch insert sürerken stream'i duraklat (`rl.pause()` / `rl.resume()`), RAM patlamasın
- [ ] **Büyük dosya testi:** `generate-mock-logs.mjs 10000` ile ~300k satır üret, tüm klasörü ingest et
  - Hedef: 20-30 sn içinde bitmeli
- [ ] **Asenkron ingest:** `/ingest` isteği hemen `{ jobId }` dönsün, işlem arka planda devam etsin
  - `/ingest/status/:jobId` endpoint'i ile ilerleme sorgulanabilsin (`{ total, inserted, skipped, done }`)

### Milestone ✅ kriteri

> Gerçek timestamp'lerle büyük dosya ingest ediliyor, metadata kolonları dolu,
> 20-30 sn içinde tamamlanıyor, `/logs` sorgusu doğru sıralı veri döndürüyor.

### Notlar

- Timestamp parse fonksiyonu: `DD.MM.YYYY HH:MM.mmmmm` formatı standart değil, `Date` constructor'ı çözemez — elle parse etmek gerekecek.
- `source_file` için dosya adını (`path.basename(filePath)`) kullan.
- `console` numarasını path'ten çıkar: `path.includes('console_1')` → `1` gibi.

---
