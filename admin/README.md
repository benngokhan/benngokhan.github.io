# Bilgi Dozu · Otomasyon Kontrol Merkezi (`/admin`)

Canlı GitHub Actions + Google Drive + YouTube analitiği üzerinde çalışan **gerçek** yönetim paneli.
Hiçbir veri örnek/mock değildir: her sayı `benngokhan/yt_auto_uploader` deposundaki
`panel_telemetry.json`, GitHub Actions API'si ve Drive'daki özel retansiyon raporundan gelir.

- Adres: <https://benngokhan.github.io/admin/>
- Giriş: şifreli ekran (AES-256-GCM + PBKDF2 100k). Şifre, erişim anahtarını **tarayıcıda** çözer;
  anahtar düz metin olarak depoda veya sunucuda durmaz.
- Oturum: varsayılan olarak sekme kapanınca silinir ("Beni hatırla" seçilirse `localStorage`).

## Modüller

| Modül | Ne yapar | Canlı kaynak |
|---|---|---|
| Kontrol Paneli | Kuyruk/stok/kapak sayaçları, yayın hattı, son çalıştırmalar, işçiler, yaklaşan slotlar | `panel_telemetry.json`, Actions API |
| Çalıştırmalar | 50'lik sayfalama, filtreler, 20 sn otomatik yenileme, iş/adım listesi, **adım adım ham log** (aramalı), iptal/tekrar çalıştır | Actions API |
| İş Akışları | Workflow durumu, cron listesi (TR karşılığı + sonraki tetik), tetikleme formu (dispatch girdileriyle), etkinleştir/devre dışı, **cron düzenleme → commit** | Actions API + `workflow_dispatch` |
| Video Kuyruğu | 27 satırlık aktif kuyruk, kapak/video eşleşmesi, filtre, `force_next_video.txt` kilidi, tek tıkla yayınlama | Drive tablosu (telemetri) |
| Excel Tablo | `DRIVE`, `ISCILER`, `UYARILAR` sayfaları, hücre düzenleme, CSV, GitHub'a kaydet, **Drive'a yaz** | `bilgidozu_yukleme_tablosu.xlsx` |
| Drive Envanteri | Kısa/Uzun video + kapak + CEO klasör içerikleri, boyut/tarih, kapak eşleşme matrisi | Drive API (telemetri) |
| İşçiler & Uyarılar | ISCILER kartları, UYARILAR tablosu, **30 dakikalık döngü sağlığı** ve gecikme analizi, bekçi geçmişi | telemetri + Actions |
| Hata & Onarım | Başarısız çalıştırmalar, `force_next_video.txt`, `repair_video.json` editörü, `slot_claims.txt`, `uploaded.txt`, acil tetikler | repo dosyaları |
| YouTube Analitik | Trend, en çok izlenenler, süre/izlenme dağılımı, 78 video metrik tablosu | Retansiyon raporu |
| Retansiyon Eğrileri | 9 eğrinin karşılaştırması + tek video detayı (3. saniye hook, tepe, ortalama) | Retansiyon raporu |
| Zamanlayıcı & Cron | Haftalık slot ızgarası (Cuma 12:30 uzun), yaklaşan tetikler, cron düzenleyici | Actions + kurallar |
| Sistem | Token/kota durumu, telemetri tazeliği, Drive klasör kimlikleri, ham JSON | Actions + telemetri |

## Veri döngüsü

1. `.github/workflows/panel-telemetry.yml` **her 30 dakikada** çalışır (0 YouTube kotası):
   Drive klasörlerini, CEO tablosunu ve `Bilgi_Dozu_Retansiyon_Raporu.xlsx`i tarar → `panel_telemetry.json` commit eder.
2. Panel bu dosyayı + Actions API'yi okur; 30 sn'de bir kendini yeniler.
3. Panelden yapılan yazma işlemleri (`force_next_video.txt`, `repair_video.json`, cron, Excel) doğrudan repoya
   commit edilir; hepsi `[skip ci]` ile işaretlidir ki gereksiz yükleme çalıştırması tetiklenmesin.
4. Excel için kalıcı yol **Kaydet + Drive'a yaz**'dır: repo dosyasını commit eder, ardından
   `panel-telemetry` iş akışını `push_table_to_drive=true` ile tetikler. İlk kayıtta orijinal dosya
   `admin_backups/` altına yedeklenir (tarayıcı tabanlı yazma hücre stillerini sadeleştirebilir).

## Şifre değiştirme

Erişim anahtarı `js/api.js` içindeki `VAULT` dizininde AES-256-GCM ile şifreli durur.
Yeni şifre için anahtarı yeniden şifreleyip `VAULT` kaydını güncellemek yeterlidir:

```js
// tarayıcı konsolunda
const enc = new TextEncoder();
async function makeVault(password, token) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token)));
  const b = (u) => btoa(String.fromCharCode(...u));
  return { s: b(salt), i: b(iv), c: b(ct) };
}
```

## Notlar

- Panel `noindex, nofollow` ile yayınlanır; kök sayfa (`/`) ve `/miracoo` etkilenmez.
- Tüm kütüphaneler `vendor/` altında yereldir (CDN bağımlılığı yok).
- Drive'da panel üzerinden **dosya/folder oluşturma-silme-taşıma yapılmaz**; yalnızca tablo yazımı
  (açık kullanıcı onayıyla) gerçekleşir.
