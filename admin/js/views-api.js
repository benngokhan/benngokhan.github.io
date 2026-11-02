/* ============================================================================
   Görünüm: API & Kota — tüm servislerin kalan kullanımı + panelden anahtar yazma
   Veri: repo kökü api_telemetri.json (6 saatte bir tazelenir, salt-okunur çağrılar)
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime, bytes } = window.BD;
  const VIEWS = window.VIEWS;

  const SECRET_SECENEK = [
    { ad: 'ELEVENLABS_API_KEY', aciklama: 'ElevenLabs TTS (yetki: User read, Voices read, TTS write)' },
    { ad: 'OPENROUTER_API_KEY', aciklama: 'OpenRouter TTS + LLM (tek anahtar, ortak bakiye)' },
    { ad: 'GEMINI_API_KEY', aciklama: 'Gemini LLM + TTS (aistudio.google.com)' },
    { ad: 'GROQ_API_KEY', aciklama: 'Groq hızlı LLM (console.groq.com)' },
    { ad: 'TELEGRAM_BOT_TOKEN', aciklama: 'Telegram bot token (@BotFather)' }
  ];

  VIEWS.api = {
    name: 'ApiView',
    data() {
      return {
        s: store,
        veri: null,
        yukleniyor: false,
        hata: '',
        beklemede: false,
        secretAdi: 'ELEVENLABS_API_KEY',
        secretDeger: '',
        kaydetBusy: false,
        secenekler: SECRET_SECENEK,
        acik: {}
      };
    },
    computed: {
      servisler() { return (this.veri && this.veri.servisler) || []; },
      secretler() { return (this.veri && this.veri.secretler) || []; },
      eksikler() { return this.secretler.filter((s) => !s.var); },
      ozet() { return (this.veri && this.veri.ozet) || {}; },
      gecmis() { return ((this.veri && this.veri.gecmis) || []).filter((g) => g.elevenlabs_kalan !== null && g.elevenlabs_kalan !== undefined).slice(-24); },
      gecmisMax() { return Math.max.apply(null, this.gecmis.map((g) => g.elevenlabs_kalan || 0).concat([1])); }
    },
    methods: {
      trZaman(v) { try { return trTime(v); } catch (e) { return v || '—'; } },
      boyut(v) { try { return bytes(v); } catch (e) { return v; } },
      durumEtiket(s) {
        return ({ ok: 'çalışıyor', yok: 'anahtar yok', gecersiz: 'anahtar geçersiz', hata: 'hata' })[s] || s;
      },
      durumRenk(s) {
        return ({ ok: '#67c23a', yok: '#909399', gecersiz: '#f56c6c', hata: '#e6a23c' })[s] || '#909399';
      },
      yuzde(s) {
        if (s.kalan === null || s.kalan === undefined || !s.limit) return null;
        return Math.max(0, Math.min(100, (s.kalan / s.limit) * 100));
      },
      barRenk(p) {
        if (p === null) return '#909399';
        if (p <= 10) return '#f56c6c';
        if (p <= 30) return '#e6a23c';
        return '#67c23a';
      },
      deger(s) {
        const k = s.kalan;
        const l = s.limit;
        if (s.ad === 'Google Drive') return (this.boyut(k) + ' / ' + this.boyut(l));
        if (k === null || k === undefined) return '—';
        return this.sayi(k) + (l ? ' / ' + this.sayi(l) : '') + (s.birim ? ' · ' + s.birim : '');
      },
      sayi(v) {
        const n = Number(v);
        if (!isFinite(n)) return String(v);
        return n.toLocaleString('tr-TR', { maximumFractionDigits: n < 100 ? 2 : 0 });
      },
      ekstra(s) {
        const out = [];
        if (s.actions_dakika !== undefined) out.push(`Actions: ${this.sayi(s.actions_dakika)} / ${s.actions_limit} dk (${s.actions_kosu} koşu)`);
        if (s.bugun_yukleme !== undefined) out.push(`bugün ${s.bugun_yukleme} yükleme`);
        if (s.reset_iso) out.push('yenilenme: ' + s.reset_iso.slice(0, 10));
        if (s.tier) out.push('plan: ' + s.tier);
        if (s.klonlama !== undefined) out.push('klonlama: ' + (s.klonlama ? 'açık' : 'kapalı'));
        if (s.ucretsiz !== undefined) out.push(s.ucretsiz ? 'ücretsiz katman' : 'kredili');
        if (s.model_sayisi !== undefined) out.push(s.model_sayisi + ' model');
        if (s.bot) out.push(s.bot);
        if (s.hesap) out.push(s.hesap);
        return out;
      },
      async yukle(sessiz) {
        if (!sessiz) this.yukleniyor = true;
        this.hata = '';
        try {
          const txt = await this.s.getRawText('api_telemetri.json');
          if (!txt) { this.hata = 'api_telemetri.json yok — "Yenile" ile ilk okumayı başlat.'; return; }
          this.veri = JSON.parse(txt);
        } catch (e) {
          this.hata = 'Okunamadı: ' + (e.message || e);
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
          if (tur >= 10 || (this.veri && this.veri.zaman !== once)) {
            clearInterval(t);
            this.beklemede = false;
          }
        }, 12000);
      },
      async yenile() {
        try {
          await this.s.repoDispatch('api_kota', {});
          this.s.notify('success', 'Kota okuması kuyruğa alındı — ~40 saniye.');
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        }
      },
      async kaydet() {
        const deger = (this.secretDeger || '').trim();
        if (deger.length < 12) { this.s.notify('error', 'Anahtar çok kısa görünüyor.'); return; }
        this.kaydetBusy = true;
        try {
          await this.s.repoDispatch('api_anahtar', { secret_adi: this.secretAdi, deger: deger });
          this.s.notify('success', this.secretAdi + ' gönderildi — secret yazılıyor, kota okunuyor.');
          this.secretDeger = '';
          this.bekle();
        } catch (e) {
          this.s.notify('error', 'Gönderilemedi: ' + (e.message || e));
        } finally {
          this.kaydetBusy = false;
        }
      }
    },
    mounted() { this.yukle(); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>API &amp; Kota</h2>
            <p>Tüm servislerin kalan kullanımı tek ekranda. Hepsi salt-okunur, hiçbiri kota harcamaz.
               Son okuma: {{ veri ? trZaman(veri.zaman) : '—' }}</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="yukleniyor" @click="yukle()">Dosyadan oku</el-button>
            <el-button size="small" type="primary" icon="Promotion" :loading="beklemede" @click="yenile">Yenile</el-button>
          </div>
        </div>

        <div v-if="hata" class="alert-strip warn" style="margin-bottom:14px">
          <el-icon><WarningFilled /></el-icon><span>{{ hata }}</span>
        </div>

        <div class="grid c4" style="margin-bottom:14px">
          <div class="stat green"><div class="k">Çalışıyor</div><div class="v">{{ ozet.ok || 0 }}</div><div class="d">servis sağlıklı</div></div>
          <div class="stat grey"><div class="k">Anahtar yok</div><div class="v">{{ ozet.eksik || 0 }}</div><div class="d">aşağıdan ekle</div></div>
          <div class="stat orange"><div class="k">Geçersiz</div><div class="v">{{ ozet.gecersiz || 0 }}</div><div class="d">yenile</div></div>
          <div class="stat blue"><div class="k">Eksik secret</div><div class="v">{{ eksikler.length }}</div><div class="d">repo ayarlarında</div></div>
        </div>

        <div class="grid c2" style="gap:14px;margin-bottom:14px">
          <div class="card" v-for="s in servisler" :key="s.ad">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <b style="font-size:14px">{{ s.ad }}</b>
              <span :style="{ marginLeft:'auto', fontSize:'11.5px', color: durumRenk(s.durum) }">
                ● {{ durumEtiket(s.durum) }}
              </span>
            </div>
            <div style="font-size:18px;font-weight:700;margin-bottom:6px">{{ deger(s) }}</div>
            <div v-if="yuzde(s) !== null" style="height:7px;background:#eef1f5;border-radius:4px;overflow:hidden;margin-bottom:8px">
              <div :style="{ width: yuzde(s) + '%', height:'100%', background: barRenk(yuzde(s)), transition:'width .4s' }"></div>
            </div>
            <div v-if="s.mesaj" style="font-size:12px;color:#f56c6c;margin-bottom:6px">{{ s.mesaj }}</div>
            <div style="font-size:12px;color:#8a8a8a;line-height:1.6">
              <span v-for="(e, i) in ekstra(s)" :key="i" style="margin-right:10px">{{ e }}</span>
            </div>
            <div v-if="s.not_" style="font-size:11.5px;color:#a8a8a8;margin-top:6px">{{ s.not_ }}</div>
          </div>
        </div>

        <div class="grid c2" style="gap:16px;align-items:start">
          <div class="card">
            <h3 style="margin-top:0">Anahtar ekle / yenile</h3>
            <p style="font-size:12.5px;color:#8a8a8a;margin:0 0 8px">
              Değer loglarda maskelenir ve git geçmişine yazılmaz (repository_dispatch).
            </p>
            <el-select v-model="secretAdi" size="small" style="width:100%;margin-bottom:6px">
              <el-option v-for="o in secenekler" :key="o.ad" :label="o.ad" :value="o.ad">
                <span>{{ o.ad }}</span>
                <span style="float:right;color:#8a8a8a;font-size:11.5px">{{ o.aciklama }}</span>
              </el-option>
            </el-select>
            <div style="font-size:11.5px;color:#8a8a8a;margin-bottom:8px">
              {{ (secenekler.find(o => o.ad === secretAdi) || {}).aciklama }}
            </div>
            <el-input v-model="secretDeger" type="password" show-password size="small"
                      placeholder="anahtarı yapıştır" style="margin-bottom:8px" />
            <el-button size="small" type="primary" :loading="kaydetBusy" @click="kaydet">Kaydet ve dene</el-button>
          </div>

          <div class="card">
            <h3 style="margin-top:0">Secret durumu
              <span v-if="eksikler.length" style="font-weight:400;color:#e6a23c;font-size:12px">
                ({{ eksikler.length }} eksik)</span>
              <span v-else style="font-weight:400;color:#67c23a;font-size:12px">(tam ✅)</span>
            </h3>
            <div v-for="x in secretler" :key="x.ad" class="kv" style="align-items:center">
              <div style="min-width:0">
                <div style="font-size:12.5px;font-family:ui-monospace,monospace">{{ x.ad }}</div>
                <div style="font-size:11px;color:#8a8a8a">{{ x.aciklama }}</div>
              </div>
              <span :style="{ color: x.var ? '#67c23a' : '#f56c6c', fontSize:'12px', flexShrink:0 }">
                {{ x.var ? 'var' : 'eksik' }}
              </span>
            </div>

            <h3 style="margin:18px 0 8px">ElevenLabs kredi geçmişi</h3>
            <div v-if="!gecmis.length" style="font-size:12.5px;color:#8a8a8a">Kayıt yok.</div>
            <div v-else style="display:flex;align-items:flex-end;gap:3px;height:56px">
              <div v-for="(g, i) in gecmis" :key="i"
                   :title="trZaman(g.zaman) + ' · ' + g.elevenlabs_kalan"
                   :style="{ flex:'1 1 0', height: Math.max(4, (g.elevenlabs_kalan || 0) / gecmisMax * 54) + 'px',
                             background:'#409eff', borderRadius:'3px', opacity: 0.35 + (0.65 * i / gecmis.length) }"></div>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
