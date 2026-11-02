/* ============================================================================
   Görünüm: Ses & Kredi — ElevenLabs kalan kredi, anahtar yenileme, ses kilidi
   Veri: repo kökündeki ses_telemetri.json (workflow 6 saatte bir tazeler)
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime } = window.BD;
  const VIEWS = window.VIEWS;

  const PLAN_ADI = {
    free: 'Free (ticari lisans yok)',
    starter: 'Starter · $6',
    creator: 'Creator · $22',
    pro: 'Pro · $99',
    scale: 'Scale · $299',
    business: 'Business · $990'
  };

  VIEWS.ses = {
    name: 'SesView',
    data() {
      return {
        s: store,
        veri: null,
        yukleniyor: false,
        hata: '',
        anahtar: '',
        anahtarBusy: false,
        kilitBusy: '',
        model: 'eleven_multilingual_v2',
        beklemede: false,
        zaman: '',
        aciklama: 'Türkçe, 30-40 yaş erkek anlatıcı; sıcak, sakin ve güven veren ton; belgesel sunucusu gibi net telaffuz; hafif alçak perde, orta tempo, abartılı duygu yok.',
        ornek: 'Buz, eksi derecelerde neden kaygan hale gelir? Bilim insanları bunu uzun süre tartıştı. Bugün biliyoruz ki yüzeyde ince bir sıvı filmi oluşuyor ve kayganlık tam olarak bu filmden geliyor.',
        ttvModel: 'eleven_multilingual_ttv_v2',
        tasarimBusy: false,
        onizleme: null,
        onizlemeUrl: {},
        kaydetBusy: '',
        sesAdi: 'Bilgi Dozu Anlatıcı'
      };
    },
    computed: {
      kalan() { return this.veri ? this.veri.kalan : 0; },
      limit() { return this.veri ? this.veri.limit : 0; },
      yuzde() { return this.veri ? this.veri.yuzde_kalan : 0; },
      planAdi() { return this.veri ? (PLAN_ADI[this.veri.tier] || this.veri.tier) : '—'; },
      tahmin() { return (this.veri && this.veri.tahmin) || {}; },
      klon() { return (this.veri && this.veri.klonlama) || {}; },
      sesler() { return (this.veri && this.veri.sesler) || []; },
      gecmis() { return ((this.veri && this.veri.gecmis) || []).slice(-24); },
      renk() {
        if (this.yuzde <= 10) return '#f56c6c';
        if (this.yuzde <= 30) return '#e6a23c';
        return '#67c23a';
      },
      gecmisMax() {
        const m = Math.max.apply(null, this.gecmis.map((g) => g.kalan || 0).concat([1]));
        return m || 1;
      }
    },
    methods: {
      trZaman(v) { try { return trTime(v); } catch (e) { return v || '—'; } },
      async yukle(sessiz) {
        if (!sessiz) this.yukleniyor = true;
        this.hata = '';
        try {
          const txt = await this.s.getRawText('ses_telemetri.json');
          if (!txt) { this.hata = 'ses_telemetri.json yok — "Yenile" ile ilk okumayı başlat.'; return; }
          this.veri = JSON.parse(txt);
        } catch (e) {
          this.hata = 'Okunamadı: ' + (e.message || e);
        } finally {
          if (!sessiz) this.yukleniyor = false;
        }
      },
      async yenile() {
        try {
          await this.s.repoDispatch('ses_kredi', {});
          this.s.notify('success', 'Kredi okuması kuyruğa alındı — ~40 saniye.');
          this.beklemede = true;
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        }
      },
      bekle() {
        let tur = 0;
        const t = setInterval(async () => {
          tur += 1;
          await this.yukle(true);
          if (tur >= 8 || (this.veri && this.veri.zaman && this.veri.zaman !== this.zaman)) {
            clearInterval(t);
            this.beklemede = false;
            this.zaman = this.veri ? this.veri.zaman : '';
          }
        }, 12000);
      },
      async anahtarYukle() {
        const k = (this.anahtar || '').trim();
        if (k.length < 20) { this.s.notify('error', 'Anahtar çok kısa görünüyor.'); return; }
        this.anahtarBusy = true;
        try {
          await this.s.repoDispatch('ses_anahtar', { anahtar: k });
          this.s.notify('success', 'Anahtar gönderildi — secret güncelleniyor, kredi okunuyor.');
          this.anahtar = '';
          this.beklemede = true;
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Anahtar gönderilemedi: ' + (e.message || e));
        } finally {
          this.anahtarBusy = false;
        }
      },
      async sesKilitle(ses) {
        this.kilitBusy = ses.id;
        try {
          await this.s.repoDispatch('ses_voice', { voice_id: ses.id, model: this.model });
          this.s.notify('success', `"${ses.ad}" kilitlendi → ses/voice.json (${this.model})`);
          this.beklemede = true;
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Kilitlenemedi: ' + (e.message || e));
        } finally {
          this.kilitBusy = '';
        }
      },
      async onizlemeYukle() {
        try {
          const txt = await this.s.getRawText('ses_onizleme.json');
          if (!txt) { this.onizleme = null; return; }
          this.onizleme = JSON.parse(txt);
          for (const o of this.onizleme.onizlemeler || []) {
            if (!this.onizlemeUrl[o.id]) {
              try { this.onizlemeUrl[o.id] = await this.s.getMediaUrl(o.dosya); } catch (e) { /* yut */ }
            }
          }
        } catch (e) { this.s.notify('error', 'Önizlemeler okunamadı: ' + (e.message || e)); }
      },
      async tasarla() {
        const a = (this.aciklama || '').trim();
        const o = (this.ornek || '').trim();
        if (a.length < 20) { this.s.notify('error', 'Açıklama en az 20 karakter olmalı.'); return; }
        if (o.length < 100) { this.s.notify('error', 'Örnek metin en az 100 karakter olmalı.'); return; }
        this.tasarimBusy = true;
        try {
          await this.s.repoDispatch('ses_design', {
            aciklama: a, ornek: o, ttv_model: this.ttvModel
          });
          this.s.notify('success', 'Ses tasarlanıyor — 30-60 saniye, sonra 3 aday burada çıkacak.');
          this.bekle();
          setTimeout(() => this.onizlemeYukle(), 45000);
        } catch (e) {
          this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        } finally {
          this.tasarimBusy = false;
        }
      },
      async secVeKilitle(o) {
        this.kaydetBusy = o.id;
        try {
          await this.s.repoDispatch('ses_kaydet', {
            generated_voice_id: o.id,
            ad: this.sesAdi || 'Bilgi Dozu Anlatıcı',
            ses_aciklama: this.aciklama,
            tts_model: 'eleven_multilingual_v2'
          });
          this.s.notify('success', 'Ses kütüphaneye ekleniyor ve kilitlenecek — ~40 saniye.');
          this.bekle();
          setTimeout(() => this.yukle(true), 45000);
        } catch (e) {
          this.s.notify('error', 'Kaydedilemedi: ' + (e.message || e));
        } finally {
          this.kaydetBusy = '';
        }
      },
      kopyala(text) {
        try {
          navigator.clipboard.writeText(text);
          this.s.notify('success', 'Kopyalandı: ' + text);
        } catch (e) {
          this.s.notify('error', 'Kopyalanamadı');
        }
      }
    },
    mounted() { this.yukle(); this.onizlemeYukle(); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Ses &amp; Kredi</h2>
            <p>ElevenLabs kalan kredi, anahtar yenileme ve ses kilidi. Salt-okunur API — kredi harcamaz.
               Son okuma: {{ veri ? trZaman(veri.zaman) : '—' }}</p>
          </div>
          <div class="head-actions">
            <el-button size="small" :loading="yukleniyor" icon="Refresh" @click="yukle()">Dosyadan oku</el-button>
            <el-button size="small" type="primary" :loading="beklemede" icon="Promotion" @click="yenile">Krediyi yenile</el-button>
          </div>
        </div>

        <div v-if="hata" class="alert-strip warn" style="margin-bottom:14px">
          <el-icon><WarningFilled /></el-icon><span>{{ hata }}</span>
        </div>

        <div v-if="veri && veri.anahtar_durumu !== 'ok'" class="alert-strip warn" style="margin-bottom:14px">
          <el-icon><Key /></el-icon>
          <span>
            Anahtar durumu: <b>{{ veri.anahtar_durumu }}</b>
            <template v-if="veri.mesaj"> — {{ veri.mesaj }}</template>
            · Aşağıya yeni anahtarı yapıştırıp "Anahtarı yükle" de, gerisi otomatik.
          </span>
        </div>

        <div class="grid c4" style="margin-bottom:14px">
          <div class="stat" :style="{ borderTop: '3px solid ' + renk }">
            <div class="k">Kalan kredi</div>
            <div class="v">{{ kalan.toLocaleString('tr-TR') }}</div>
            <div class="d">{{ limit ? limit.toLocaleString('tr-TR') + ' kredi / dönem' : '—' }}</div>
          </div>
          <div class="stat">
            <div class="k">Doluluk</div>
            <div class="v">{{ yuzde }}%</div>
            <div class="d">kullanılan: {{ (veri ? veri.kullanilan : 0).toLocaleString('tr-TR') }}</div>
          </div>
          <div class="stat">
            <div class="k">Kaç short daha</div>
            <div class="v">{{ tahmin.kac_short || 0 }}</div>
            <div class="d">Flash modelle ~{{ tahmin.flash_kac_short || 0 }} · short ≈ {{ tahmin.karakter_per_short || 900 }} karakter</div>
          </div>
          <div class="stat">
            <div class="k">Yenilenme</div>
            <div class="v">{{ veri && veri.reset_gun !== null && veri.reset_gun !== undefined ? veri.reset_gun + ' gün' : '—' }}</div>
            <div class="d">{{ veri && veri.reset_iso ? veri.reset_iso.slice(0, 10) : '—' }}</div>
          </div>
        </div>

        <div class="grid c2" style="gap:16px;align-items:start">
          <div class="card">
            <h3 style="margin-top:0">Plan &amp; izinler</h3>
            <div class="kv"><span>Plan</span><b>{{ planAdi }}</b></div>
            <div class="kv"><span>Durum</span><span>{{ veri ? (veri.durum || '—') : '—' }}</span></div>
            <div class="kv"><span>Instant klonlama</span>
              <span :style="{ color: klon.instant ? '#67c23a' : '#f56c6c' }">{{ klon.instant ? 'açık' : 'kapalı' }}</span></div>
            <div class="kv"><span>Profesyonel klonlama</span>
              <span :style="{ color: klon.profesyonel ? '#67c23a' : '#f56c6c' }">{{ klon.profesyonel ? 'açık' : 'kapalı' }}</span></div>
            <div class="kv"><span>Ses slotu</span><span>{{ klon.kullanilan_slot || 0 }} / {{ klon.ses_slotu || '—' }}</span></div>

            <h3 style="margin:18px 0 8px">API anahtarı yenile</h3>
            <p style="font-size:12.5px;color:#8a8a8a;margin:0 0 8px">
              elevenlabs.io → Settings → API Keys → yeni anahtar (yetkiler: <b>User: read</b>, <b>Voices: read</b>,
              Text to Speech: write). Anahtar loglarda maskelenir, secret'a yazılır.
            </p>
            <el-input v-model="anahtar" type="password" show-password size="small"
                      placeholder="sk_..." style="margin-bottom:8px" />
            <el-button size="small" type="primary" :loading="anahtarBusy" @click="anahtarYukle">Anahtarı yükle</el-button>

            <h3 style="margin:18px 0 8px">Kredi geçmişi</h3>
            <div v-if="!gecmis.length" style="font-size:12.5px;color:#8a8a8a">Henüz kayıt yok.</div>
            <div v-else style="display:flex;align-items:flex-end;gap:3px;height:64px">
              <div v-for="(g, i) in gecmis" :key="i"
                   :title="trZaman(g.zaman) + ' · ' + (g.kalan || 0)"
                   :style="{ flex: '1 1 0', height: Math.max(4, (g.kalan || 0) / gecmisMax * 60) + 'px',
                             background: '#409eff', borderRadius: '3px', opacity: 0.35 + (0.65 * i / gecmis.length) }"></div>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-top:0">Yapay ses üret <span style="font-weight:400;color:#8a8a8a;font-size:12px">
              (Voice Design · 3 aday)</span></h3>
            <p style="font-size:12.5px;color:#8a8a8a;margin:0 0 8px">
              Ses tarifini yaz → 3 aday üretilir → beğendiğini dinle ve kilitle. Kaydedilen ses
              <code>ses/voice.json</code>'a yazılır, üretim onu kullanır.
            </p>
            <el-input v-model="aciklama" type="textarea" :rows="3" size="small"
                      placeholder="Ses tarifi (20-1000 karakter)" style="margin-bottom:8px" />
            <el-input v-model="ornek" type="textarea" :rows="3" size="small"
                      placeholder="Önizleme metni (100-1000 karakter)" style="margin-bottom:8px" />
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
              <el-select v-model="ttvModel" size="small" style="flex:1">
                <el-option label="eleven_multilingual_ttv_v2 · çok dilli" value="eleven_multilingual_ttv_v2" />
                <el-option label="eleven_ttv_v3 · daha doğal, deneysel" value="eleven_ttv_v3" />
              </el-select>
              <el-button size="small" type="primary" :loading="tasarimBusy" @click="tasarla">Önizleme üret</el-button>
            </div>

            <div v-if="onizleme">
              <div style="font-size:11.5px;color:#8a8a8a;margin-bottom:6px">
                {{ onizleme.zaman }} · kredi farkı: {{ onizleme.kredi_farki === null ? '?' : onizleme.kredi_farki }}
              </div>
              <div v-for="o in onizleme.onizlemeler" :key="o.id"
                   style="border:1px solid #eef1f5;border-radius:10px;padding:8px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:11px;color:#8a8a8a;font-family:ui-monospace,monospace">{{ o.id.slice(0, 12) }}…</span>
                  <el-button size="small" type="primary" plain style="margin-left:auto"
                             :loading="kaydetBusy === o.id" @click="secVeKilitle(o)">Bu sesi kilitle</el-button>
                </div>
                <audio v-if="onizlemeUrl[o.id]" :src="onizlemeUrl[o.id]" controls
                       style="width:100%;margin-top:6px;height:34px"></audio>
              </div>
              <div class="kv">
                <span>Ses adı (kütüphanede görünecek)</span>
                <el-input v-model="sesAdi" size="small" style="width:180px" />
              </div>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-top:0">Sesler <span style="font-weight:400;color:#8a8a8a;font-size:12px">
              ({{ sesler.length }}) · kilitlenecek model:</span></h3>
            <el-select v-model="model" size="small" style="width:100%;margin-bottom:10px">
              <el-option label="eleven_multilingual_v2 · kaliteli, 1 kredi/karakter" value="eleven_multilingual_v2" />
              <el-option label="eleven_flash_v2_5 · yarı fiyat, hızlı" value="eleven_flash_v2_5" />
              <el-option label="eleven_turbo_v2_5 · dengeli" value="eleven_turbo_v2_5" />
            </el-select>

            <div v-if="!sesler.length" style="font-size:12.5px;color:#8a8a8a">
              Ses listesi boş (anahtar geçersiz olabilir).
            </div>
            <div v-for="ses in sesler" :key="ses.id" class="kv" style="align-items:center;gap:8px">
              <div style="min-width:0">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ ses.ad }}</div>
                <div style="font-size:11px;color:#8a8a8a">
                  {{ ses.kategori }}<template v-if="ses.etiket"> · {{ ses.etiket }}</template>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <el-button size="small" text @click="kopyala(ses.id)">ID kopyala</el-button>
                <el-button size="small" type="primary" plain
                           :loading="kilitBusy === ses.id" @click="sesKilitle(ses)">Kilitle</el-button>
              </div>
            </div>

            <div class="alert-strip ok" style="margin-top:14px">
              <el-icon><InfoFilled /></el-icon>
              <span>Kilitleme <code>ses/voice.json → kilit.voice_id</code> alanını yazar. Üretim yalnızca
                <code>ses/ses_uret.py</code> üzerinden yürür; kural: ses değişmez, hata olursa üretim durur.</span>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
