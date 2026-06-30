# Log Viewer — Geliştirici Rehberi

> Staj projesi: localhost'ta çalışan log görüntüleyici.
> Mimari: **React + Node/Express + embedded DuckDB** (Docker yok, ayrı sunucu yok).
> Durum: **Çalışan temel hazır** — 30M satır / 4.5 GB test edildi, 20-30 sn'de yüklenip akıcı görüntüleniyor.

---

## 1. Stack

| Katman         | Teknoloji                                 | Rol                                                |
| -------------- | ----------------------------------------- | -------------------------------------------------- |
| Frontend       | React + Vite + TypeScript                 | Arayüz                                             |
| Upload         | Uppy (core, react, dashboard, xhr-upload) | Klasör sürükle-bırak, dosyaları backend'e yükler   |
| Backend        | Node.js + Express + TypeScript            | Upload alır, DuckDB'ye yazar, sorguları çalıştırır |
| Veritabanı     | embedded DuckDB (@duckdb/node-api)        | Columnar, diske yazar, GB ölçeğini kaldırır        |
| Virtual Scroll | react-window                              | (Kurulu, henüz kullanılmıyor — sıradaki adım)      |

---

## 2. Klasör Yapısı

```
log-viewer/
├── generate-mock-logs.mjs        ← test verisi üretici
├── backend/
│   ├── package.json              ← "type": "module", script: tsx watch src/index.ts
│   ├── logs.db                   ← DuckDB veritabanı (ilk çalıştırmada otomatik oluşur)
│   ├── uploads/                  ← multer geçici dosya klasörü (otomatik, işlem sonrası temizlenir)
│   └── src/
│       └── index.ts
└── frontend/
    ├── package.json
    └── src/
        ├── App.tsx               ← state, pagination, reset
        └── Components/
            ├── FileUploader.tsx  ← Uppy Dashboard + XHRUpload
            └── LogTable.tsx      ← düz tablo (react-window'a çevrilecek)
```

---

## 3. Kurulum (sıfırdan)

### Gereksinim

```bash
node -v    # 20+
```

### Backend

```bash
cd backend
npm install express cors multer @duckdb/node-api
npm install -D typescript tsx @types/node @types/express @types/cors @types/multer
npx tsc --init
```

`backend/package.json` içine:

```json
"type": "module",
"scripts": { "dev": "tsx watch src/index.ts" }
```

### Frontend

```bash
cd frontend
npm install @uppy/core @uppy/react @uppy/dashboard @uppy/xhr-upload react-window
npm install -D @types/react-window
```

### Mock veri üret

```bash
node generate-mock-logs.mjs 2000     # her dosyaya 2000 satır → ~60k satır
```

Üretilen yapı: `mock-logs/console_{1,2,3}/serviceLogs/*.ndjson` + `console_{1,2,3}/*.ndjson` (other logs).

### Çalıştır

```bash
# terminal 1
cd backend && npm run dev      # → Log server is ready: http://localhost:3000
# terminal 2
cd frontend && npm run dev     # → http://localhost:5173
```

---

## 5. Log Formatı

NDJSON. Her satır tek bir JSON objesi:

```json
{
  "timestamp": "27.06.2026 11:35:29596",
  "level": "info",
  "service": "auth-service",
  "eventType": "query",
  "message": "Health check passed"
}
```

**Timestamp:** `DD.MM.YYYY HH:MM:SSmmm`

- `SS` = saniye (her zaman ilk 2 hane, < 60)
- `mmm` = milisaniye, **sondaki sıfırlar kırpılmış** → kuyruk 1-5 hane arası değişken

**Decode mantığı:** kuyruğu 5 haneye `rpad`'le, ilk 2 = saniye, son 3 = ms:

| gelen   | rpad→5  | saniye | ms  |
| ------- | ------- | ------ | --- |
| `1`     | `10000` | 10     | 000 |
| `12`    | `12000` | 12     | 000 |
| `123`   | `12300` | 12     | 300 |
| `1234`  | `12340` | 12     | 340 |
| `12345` | `12345` | 12     | 345 |

| Alan        | Değer                                   |
| ----------- | --------------------------------------- |
| `level`     | info / warning / error                  |
| `service`   | microservis adı                         |
| `eventType` | event / query / command / commandResult |
| `message`   | serbest metin                           |

---

## 6. DuckDB Şeması

```sql
CREATE TABLE IF NOT EXISTS logs (
  timestamp      VARCHAR,    -- ham değer (DD.MM.YYYY HH:MM:SSmmm)
  timestamp_iso  TIMESTAMP,  -- parse edilmiş, SIRALAMA bununla yapılır
  level          VARCHAR,
  service        VARCHAR,
  event_type     VARCHAR,
  message        VARCHAR,
  source_path    VARCHAR,    -- dosyanın klasör yolu (relativePath)
  console        INTEGER,    -- 1 / 2 / 3 (yoldan regex ile)
  is_service_log INTEGER     -- 1 = serviceLogs altında, 0 = değil
);
```

**timestamp_iso parse'ı:** ham kuyruk `rpad(5)` ile `SS.mmm` formuna sokulup `strptime(..., '%d.%m.%Y %H:%M:%S.%f')` ile parse edilir. Sabit 3 haneli ms sayesinde sıralama, DuckDB'nin `%f` pad yönünden bağımsız olarak doğru.

---

## 7. Backend Endpoint'leri

| Method | Yol                  | İş                                                                                                                                                                                     |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/upload`            | Uppy'den gelen dosyaları multer ile temp diske yazar, DuckDB `read_json_auto` ile `logs` tablosuna ekler, temp dosyayı siler. `relativePath`'ten `console` + `is_service_log` türetir. |
| GET    | `/logs?page=&limit=` | `timestamp_iso DESC` sıralı, sayfalı satırlar (LIMIT/OFFSET).                                                                                                                          |
| POST   | `/reset`             | `TRUNCATE TABLE logs` — veritabanını temizler.                                                                                                                                         |

**Akış:** Uppy klasör sürükle-bırak → her dosya ayrı istek (bundle:false, limit:1) → multer temp diske yazar + `relativePath` meta'sı `req.body`'ye gelir → DuckDB dosyayı diskten okur, metadata türetir, ekler → temp dosya silinir.

---

## 8. Şu Ana Kadar Yapılanlar (✅)

- [x] Embedded DuckDB kurulumu, kalıcı `logs.db`, BigInt → JSON patch
- [x] `POST /upload` — Uppy + multer + `read_json_auto`, temp dosya temizliği (try/finally)
- [x] `GET /logs` — sayfalı sorgu, `timestamp_iso DESC`
- [x] `POST /reset` — tablo temizleme
- [x] Frontend: App.tsx (state + pagination + reset), FileUploader.tsx (Uppy Dashboard), LogTable.tsx (düz tablo, level renklendirme)
- [x] **Bug fix — metadata:** `console` + `is_service_log` artık `relativePath`'ten türetiliyor (multer temp yolundan değil). Doğrulandı: console 1/2/3 dolu, is_service_log 0 ve 1 mevcut
- [x] **Bug fix — timestamp sıralaması:** kuyruk `rpad(5)` + `SS.mmm` normalizasyonuyla parse, pad yönünden bağımsız doğru sıralama
- [x] SQL string literal escape (`'` → `''`)
- [x] **Ölçek testi geçti:** 4.5 GB / ~30M satır, 20-30 sn'de yüklenip akıcı görüntüleniyor

---

## 9. TODO (sıradaki adımlar)

### react-window (önce bu)

- [ ] LogTable'ı react-window'a çevir (`FixedSizeList`) — sadece görünen ~30 satır DOM'da
- [ ] Sonsuz scroll mu / prev-next mi kalsın kararı (kullanıcı henüz seçmedi)
- [ ] Milyonlarca satırda akıcı scroll testi
- > Neden önce: navigation tıklamaları da uzun listeler render edecek; react-window önce oturursa navigation onun üstüne biner, yeniden taşıma olmaz

### Navigation (sketch'teki gezinme — hepsi SQL WHERE)

- [ ] Üst tab'lar: console_1 / console_2 / console_3 → `WHERE console = ?`
- [ ] Sol tree: serviceLogs + other logs (sığ yapı; basitse kendi component'in, library şart değil)
- [ ] serviceLogs'a giriş: `WHERE console=? AND is_service_log=1 ORDER BY timestamp_iso` → tüm dosyalar tek sıralı merged görünüm (JS'te merge YOK)
- [ ] Tek dosyaya tıklama: `WHERE source_path = ?`
- [ ] Klasör tıklama mantığı: merge edilmemiş alt klasör varsa onları göster, sadece log varsa direkt listele

### Filtreler + Reset

- [ ] Filtre UI (üst sağ): level, timestamp aralığı, service, eventType
- [ ] Her filtre `WHERE`'e eklenir (parametre ile, string birleştirme değil)
- [ ] Filtreler + seçili tab/dosya tek sorguda birleşir
- [ ] Yüklenen klasör adını üst sağda göster
- [ ] Reset butonu: filtre/seçim state'ini sıfırla, ilk ekrana dön (`/reset` ile tabloyu da temizle)

### Polish

- [ ] Upload sırasında progress / loading göstergesi
- [ ] Hata durumları: klasör bulunamadı, boş klasör, bozuk satır sayısı
- [ ] Tek dosya yüklemede `source_path` null fallback'ini sağlamlaştır (gerekirse)
- [ ] (Deferred) search bar — `WHERE message ILIKE '%...%'`
- [ ] (Deferred) kolon başlığına tıklayınca sorting
- [ ] CSS / tasarım cilası (AI yardımı serbest)

---

## Notlar

- **Logic senin:** Mentör kuralı gereği SQL sorguları ve uygulama mantığı senin yazacağın kısım; kurulum/boilerplate serbest.
- **Tarayıcı asla GB tutmaz:** sadece o anki sayfa bellekte → çökme imkânsız.
- **Klasör sürükle-bırak şart:** Uppy'nin "browse folder" butonu Chrome'da `relativePath`'i null verir; metadata için klasör sürüklenmeli.
- **Eski ClickHouse/Docker ve frontend-only planları** terk edildi; bu dosya tek geçerli kaynak.
