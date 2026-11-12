/* ============================================================================
   Görünüm: API & Kotalar — tüm aktif servislerde Drive tarzı yeşil kalan kota
   çubukları + çalışan API anahtarı ekleme/yenileme (gereksiz kartlar kaldırıldı)
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime, bytes } = window.BD;
  const VIEWS = window.VIEWS;

  const SECRET_SECENEK = [
    { ad: 'PEXELS_API_KEY', aciklama: 'Birincil 9:16 sinematik görsel kaynağı (pexels.com/api)' },
    { ad: 'GEMINI_API_KEY', aciklama: 'Gemini Charon TTS seslendirme + yardımcı metin (aistudio.google.com)' },
    { ad: 'GROQ_API_KEY', aciklama: 'Hızlı senaryo ve başlık motoru (console.groq.com)' },
    { ad: 'PIXABAY_API_KEY', aciklama: 'Yedek görsel API anahtarı (pixabay.com/api/docs)' },
    { ad: 'TELEGRAM_BOT_TOKEN', aciklama: 'Telegram onay ve bildirim botu (@BotFather)' }
  ];

  // Eski telemetri dosyasında kalmış emekli servisleri arayüzde gösterme
  const EMEKLI_SERVISLER = new Set(['ElevenLabs', 'OpenRouter']);

  VIEWS.api = {
    name: 'ApiView',
    data() {
      return {
        s: store,
        veri: null,
        yukleniyor: false,
        hata: '',
        beklemede: false,
        secretAdi: 'PEXELS_API_KEY',
        secretDeger: '',
        kaydetBusy: false,
        kaydetSonuc: null,
        secenekler: SECRET_SECENEK
      };
    },
    computed: {
      servisler() {
        return ((this.veri && this.veri.servisler) || []).filter((s) => !EMEKLI_SERVISLER.has(s.ad));
      },
      calisanSayisi() {
        return this.servisler.filter((s) => s.durum === 'ok').length;
      },
      sorunluSayisi() {
        return this.servisler.filter((s) => s.durum !== 'ok').length;
      }
    },
    methods: {
      trZaman(v) { try { return trTime(v); } catch (e) { return v || '—'; } },
      boyut(v) { try { return bytes(v); } catch (e) { return v; } },
      durumEtiket(s) {
        return ({ ok: 'çalışıyor', yok: 'anahtar yok', gecersiz: 'anahtar geçersiz', hata: 'kontrol gerekli' })[s] || s;
      },
      durumRenk(s) {
        return ({ ok: '#67c23a', yok: '#909399', gecersiz: '#f56c6c', hata: '#e6a23c' })[s] || '#909399';
      },
      // KALAN KOTA YÜZDESİ (Drive tarzı: dolu yeşil çubuk = bol kota var, azaldıkça turuncu/kırmızı)
      kalanYuzde(s) {
        let lim = s.limit;
        let kal = s.kalan;
        if ((s.ad === 'GitHub' || s.ad === 'GitHub Actions') && s.actions_limit) {
          lim = s.actions_limit;
          kal = s.actions_kalan;
        }
        if (!lim || lim <= 0) return s.durum === 'ok' ? 100 : 0;
        if (kal === null || kal === undefined) {
          if (s.kullanilan !== null && s.kullanilan !== undefined) kal = Math.max(0, lim - s.kullanilan);
          else return s.durum === 'ok' ? 100 : 0;
        }
        return Math.max(0, Math.min(100, (Number(kal) / Number(lim)) * 100));
      },
      barRenk(kalanPct, durum) {
        if (durum && durum !== 'ok') return '#f56c6c';
        if (kalanPct <= 12) return '#f56c6c';
        if (kalanPct <= 30) return '#e6a23c';
        return '#67c23a';
      },
      kalanMetin(s) {
        if (s.ad === 'Google Drive') return this.boyut(s.kalan) + ' boş / ' + this.boyut(s.limit);
        if ((s.ad === 'GitHub' || s.ad === 'GitHub Actions') && s.actions_limit !== undefined) {
          return this.sayi(s.actions_kalan) + ' / ' + this.sayi(s.actions_limit) + ' dk kalan';
        }
        if (s.kalan === null || s.kalan === undefined) return s.durum === 'ok' ? 'Aktif' : '—';
        return this.sayi(s.kalan) + (s.limit ? ' / ' + this.sayi(s.limit) : '') + (s.birim ? ' · ' + s.birim : '');
      },
      kullanimMetin(s) {
        if (s.ad === 'Google Drive' && s.limit) {
          const doluPct = ((s.kullanilan || 0) / s.limit) * 100;
          return `Kullanılan: ${this.boyut(s.kullanilan)} (%${doluPct.toFixed(1)} dolu)`;
        }
        let lim = s.limit;
        let kul = s.kullanilan;
        if ((s.ad === 'GitHub' || s.ad === 'GitHub Actions') && s.actions_limit !== undefined) {
          lim = s.actions_limit;
          kul = s.actions_dakika;
        }
        if (!lim) return '';
        if (kul === null || kul === undefined) kul = Math.max(0, lim - (s.kalan || 0));
        const doluPct = Math.max(0, Math.min(100, (kul / lim) * 100));
        return `Kullanılan: ${this.sayi(kul)} / ${this.sayi(lim)} (%${doluPct.toFixed(1)})`;
      },
      kirilimYuzde(s, k) {
        const toplam = s.kullanilan || (s.kirilim || []).reduce((a, x) => a + (x.boyut || 0), 0) || 1;
        return Math.max(1, Math.min(100, ((k.boyut || 0) / toplam) * 100));
      },
      sayi(v) {
        const n = Number(v);
        if (!isFinite(n)) return String(v);
        return n.toLocaleString('tr-TR', { maximumFractionDigits: n < 100 && n % 1 !== 0 ? 1 : 0 });
      },
      ekstra(s) {
        const out = [];
        if (s.actions_kosu !== undefined) out.push(`Bu ay ${s.actions_kosu} koşu`);
        if (s.api_kalan !== undefined && s.api_limit !== undefined) out.push(`Saatlik REST: ${this.sayi(s.api_kalan)}/${this.sayi(s.api_limit)}`);
        if (s.bugun_yukleme !== undefined) out.push(`Bugün ${s.bugun_yukleme} Shorts yüklendi`);
        if (s.reset_iso) out.push('Sıfırlanma: ' + s.reset_iso.slice(0, 10));
        if (s.model_sayisi !== undefined) out.push(`${s.model_sayisi} aktif model`);
        if (s.bot) out.push(s.bot);
        if (s.hesap) out.push(s.hesap);
        return out;
      },
      async yukle(sessiz) {
        if (!sessiz) this.yukleniyor = true;
        this.hata = '';
        try {
          const txt = await this.s.getRawText('api_telemetri.json');
          if (!txt) { this.hata = 'api_telemetri.json bulunamadı — "Canlı Ölç" ile ilk okumayı başlatın.'; return; }
          this.veri = JSON.parse(txt);
        } catch (e) {
          this.hata = 'Telemetri okunamadı: ' + (e.message || e);
        } finally {
          if (!sessiz) this.yukleniyor = false;
        }
      },
      bekle() {
        let tur = 0;
        const once = this.veri ? this.veri.zaman : '';
        this.beklemede = true;
        const t = setInterval(async () => {
          tur += 1;
          await this.yukle(true);
          if (tur >= 12 || (this.veri && this.veri.zaman !== once)) {
            clearInterval(t);
            this.beklemede = false;
            if (this.veri && this.veri.zaman !== once) {
              this.s.notify('success', 'Tüm API kotaları canlı olarak güncellendi.');
            }
          }
        }, 8000);
      },
      async yenile() {
        try {
          await this.s.repoDispatch('api_kota', {});
          this.s.notify('success', 'Canlı kota ölçümü başlatıldı (~35 sn içinde güncellenir).');
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        }
      },
      async kaydet() {
        const deger = (this.secretDeger || '').trim();
        if (deger.length < 10) {
          this.s.notify('error', 'Lütfen geçerli uzunlukta bir API anahtarı yapıştırın.');
          return;
        }
        this.kaydetBusy = true;
        this.kaydetSonuc = null;
        const baslangicMs = Date.now() - 5000;
        const hedefAd = this.secretAdi;
        try {
          await this.s.repoDispatch('api_anahtar', { secret_adi: hedefAd, deger: deger });
          this.s.notify('info', `${hedefAd} gönderildi — GitHub Secrets doğrulaması bekleniyor (~35 sn)…`);
          this.secretDeger = '';
          const sonuc = await this.sonucBekle(hedefAd, baslangicMs, 95);
          if (sonuc && sonuc.ok === true) {
            this.kaydetSonuc = { ok: true, mesaj: `${hedefAd} GitHub Secrets'a başarıyla yazıldı ve canlı doğrulandı.` };
            this.s.notify('success', this.kaydetSonuc.mesaj);
            await this.yukle(true);
          } else if (sonuc && sonuc.ok === false) {
            this.kaydetSonuc = {
              ok: false,
              mesaj: (sonuc.mesaj || 'SITE_SYNC_TOKEN yetkisi yetersiz') + ' — GitHub → Settings → Secrets → Actions üzerinden ekleyebilirsiniz.'
            };
            this.s.notify('error', this.kaydetSonuc.mesaj);
          } else {
            this.kaydetSonuc = { ok: true, mesaj: `${hedefAd} iş akışına iletildi; kota verileri arka planda tazeleniyor.` };
            this.bekle();
          }
        } catch (e) {
          this.kaydetSonuc = { ok: false, mesaj: 'Gönderilemedi: ' + (e.message || e) };
          this.s.notify('error', this.kaydetSonuc.mesaj);
        } finally {
          this.kaydetBusy = false;
        }
      },
      async sonucBekle(hedefAd, baslangicMs, saniye) {
        const bitis = Date.now() + saniye * 1000;
        while (Date.now() < bitis) {
          await new Promise((r) => setTimeout(r, 6000));
          try {
            const txt = await this.s.getRawText('api_secret_sonuc.json');
            if (!txt) continue;
            const d = JSON.parse(txt);
            const zMs = d && d.zaman ? new Date(d.zaman).getTime() : 0;
            if (d && d.secret_adi === hedefAd && zMs >= baslangicMs) return d;
          } catch (e) { /* devam */ }
        }
        return null;
      }
    },
    mounted() { this.yukle(); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>API &amp; Kotalar</h2>
            <p>Aktif tüm servislerin gerçek kalan kotaları ve doluluk çubukları · Son ölçüm: {{ veri ? trZaman(veri.zaman) : '—' }}</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="yukleniyor" @click="yukle()">Yeniden oku</el-button>
            <el-button size="small" type="primary" icon="Promotion" :loading="beklemede" @click="yenile">Canlı ölç (~35 sn)</el-button>
          </div>
        </div>

        <div v-if="hata" class="alert-strip warn" style="margin-bottom:14px">
          <el-icon><WarningFilled /></el-icon><span>{{ hata }}</span>
        </div>

        <div class="grid c3" style="margin-bottom:14px">
          <div class="stat green">
            <div class="bar"></div>
            <div class="k">Aktif &amp; Sağlıklı</div>
            <div class="v">{{ calisanSayisi }} / {{ servisler.length }}</div>
            <div class="d">canlı doğrulanan servis</div>
          </div>
          <div class="stat" :class="sorunluSayisi ? 'red' : 'blue'">
            <div class="bar"></div>
            <div class="k">Uyarı / Eksik</div>
            <div class="v">{{ sorunluSayisi }}</div>
            <div class="d">{{ sorunluSayisi ? 'kontrol gerektiren servis' : 'tüm anahtarlar aktif' }}</div>
          </div>
          <div class="stat grey">
            <div class="bar"></div>
            <div class="k">Son Ölçüm</div>
            <div class="v" style="font-size:16px;margin-top:10px">{{ veri ? trZaman(veri.zaman) : '—' }}</div>
            <div class="d">6 saatte bir otomatik + istediğiniz an canlı</div>
          </div>
        </div>

        <!-- Tüm servis kartları: her birinde Drive tarzı yeşil/renkli kalan kota çubuğu -->
        <div class="grid c2" style="gap:14px;margin-bottom:16px">
          <div class="card" v-for="sv in servisler" :key="sv.ad" style="margin-bottom:0">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <b style="font-size:14.5px">{{ sv.ad }}</b>
                <span :style="{ marginLeft:'auto', fontSize:'12px', fontWeight:600, color: durumRenk(sv.durum) }">
                  ● {{ durumEtiket(sv.durum) }}
                </span>
              </div>

              <div style="font-size:18px;font-weight:700;margin-bottom:6px">{{ kalanMetin(sv) }}</div>

              <!-- Drive tarzı kalan kapasite çubuğu (her kartta görünür) -->
              <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
                <div style="flex:1;height:9px;background:#ebeef5;border-radius:5px;overflow:hidden">
                  <div :style="{
                    width: kalanYuzde(sv) + '%',
                    height: '100%',
                    background: barRenk(kalanYuzde(sv), sv.durum),
                    borderRadius: '5px',
                    transition: 'width .4s ease'
                  }"></div>
                </div>
                <span :style="{
                  fontSize: '12px',
                  fontWeight: 700,
                  minWidth: '68px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: barRenk(kalanYuzde(sv), sv.durum)
                }">
                  %{{ kalanYuzde(sv).toFixed(kalanYuzde(sv) < 99.5 && kalanYuzde(sv) > 0 ? 0 : 0) }} kalan
                </span>
              </div>

              <div v-if="kullanimMetin(sv)" style="font-size:11.5px;color:#606266;margin-bottom:6px">
                {{ kullanimMetin(sv) }}
              </div>

              <div v-if="sv.yenilenme"
                   style="font-size:11.5px;color:#2f6fbf;background:#eef5ff;display:inline-block;
                          padding:2px 8px;border-radius:10px;margin-bottom:8px">
                ⟳ {{ sv.yenilenme }}
              </div>

              <div v-if="sv.mesaj" style="font-size:12px;color:#f56c6c;margin-bottom:6px">{{ sv.mesaj }}</div>

              <div style="font-size:12px;color:#8a8a8a;line-height:1.6">
                <span v-for="(e, i) in ekstra(sv)" :key="i" style="margin-right:10px">• {{ e }}</span>
              </div>

              <div v-if="sv.kirilim && sv.kirilim.length" style="margin-top:10px;border-top:1px dashed #eef1f5;padding-top:8px">
                <div style="font-size:11.5px;color:#8a8a8a;margin-bottom:6px">Klasör bazlı dağılım:</div>
                <div v-for="k in sv.kirilim" :key="k.ad" style="margin-bottom:6px">
                  <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px">
                    <span>{{ k.ad }}</span>
                    <span style="color:#8a8a8a">{{ boyut(k.boyut) }} · {{ k.dosya }} dosya</span>
                  </div>
                  <div style="height:5px;background:#f2f5f8;border-radius:3px;overflow:hidden">
                    <div :style="{ width: kirilimYuzde(sv, k) + '%', height:'100%', background:'#409eff' }"></div>
                  </div>
                </div>
              </div>

              <div v-if="sv.not_" style="font-size:11.5px;color:#909399;margin-top:6px">{{ sv.not_ }}</div>
            </div>
          </div>
        </div>

        <!-- Tek ve temiz API Anahtarı Ekle / Yenile kartı -->
        <div class="card">
          <div class="card-head">
            <h3><el-icon><Key /></el-icon> API Anahtarı Ekle / Yenile</h3>
            <span class="sub">Anahtar şifreli olarak GitHub Secrets'a işlenir; kod geçmişine yazılmaz</span>
          </div>
          <div class="card-body">
            <div class="grid c2" style="gap:12px;align-items:end">
              <div>
                <div style="font-size:12px;color:#606266;margin-bottom:5px;font-weight:600">Servis Anahtarı Seç</div>
                <el-select v-model="secretAdi" style="width:100%">
                  <el-option v-for="o in secenekler" :key="o.ad" :label="o.ad" :value="o.ad">
                    <span><b>{{ o.ad }}</b></span>
                    <span style="float:right;color:#909399;font-size:11.5px">{{ o.aciklama }}</span>
                  </el-option>
                </el-select>
              </div>
              <div>
                <div style="font-size:12px;color:#606266;margin-bottom:5px;font-weight:600">Yeni Anahtar Değeri</div>
                <div style="display:flex;gap:8px">
                  <el-input v-model="secretDeger" type="password" show-password
                            placeholder="Yeni API anahtarını buraya yapıştırın" @keyup.enter="kaydet" clearable />
                  <el-button type="primary" :loading="kaydetBusy" @click="kaydet">Kaydet ve Doğrula</el-button>
                </div>
              </div>
            </div>
            <div style="font-size:11.5px;color:#909399;margin-top:8px">
              {{ (secenekler.find(o => o.ad === secretAdi) || {}).aciklama }}
            </div>
            <div v-if="kaydetSonuc" :class="['alert-strip', kaydetSonuc.ok ? 'ok' : 'err']" style="margin-top:10px;margin-bottom:0">
              <el-icon><component :is="kaydetSonuc.ok ? 'CircleCheckFilled' : 'WarningFilled'" /></el-icon>
              <span>{{ kaydetSonuc.mesaj }}</span>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
