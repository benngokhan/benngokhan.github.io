/* ============================================================================
   Bilgi Dozu · Video Üretimi — MİRA v2.2 + Charon TTS + Pexels üretim stüdyosu
   Üst şeritteki tüm API kartlarında gerçek yeşil kalan kota çubukları bulunur.
   ========================================================================== */
(function () {
  'use strict';

  const VIEWS = window.VIEWS;
  const { store } = window.BD;
  if (!VIEWS) return;

  const SAHIP = 'benngokhan';
  const DEPO = 'yt_auto_uploader';
  const IS_AKISI = 'motor-uret.yml';
  const DRIVE_ONAY = 'https://drive.google.com/drive/folders/1xyO_jNjbpghfR7CJ1P9DUvkzdb6eC0qf';

  const ONERILER = [
    'Parmak uçların suda neden buruşur?',
    'Neden esneme bulaşıcıdır?',
    'Uzayda gözyaşı akar mı?',
    'Beyin neden yeni anıları siler?',
    'Neden bazı sesler bizi ürpertir?'
  ];

  const ADIM_IKON = {
    queued: 'Clock',
    in_progress: 'Loading',
    completed: 'CircleCheck',
    skipped: 'Remove'
  };

  VIEWS.uretim = {
    name: 'UretimView',
    data() {
      return {
        s: store,
        konu: '',
        sahne: 7,
        sureTipi: '38-45',
        sureMin: 38,
        sureMax: 45,
        kuru: false,
        gonderiyor: false,
        ayarlar: null,
        ayarHata: '',
        kosular: [],
        aktifKosu: null,
        adimlar: [],
        yukleniyor: false,
        hata: '',
        sonYenileme: '',
        zamanlayici: null,
        oneriler: ONERILER,
        oneriMeta: '',
        apiDurum: null,
        apiTelemetri: null,
        apiDurumBusy: false,
        apiDurumHata: '',
        driveLink: DRIVE_ONAY
      };
    },
    computed: {
      calisan() {
        return this.kosular.find((k) => k.status === 'in_progress' || k.status === 'queued') || null;
      },
      hazirMi() {
        return this.konu.trim().length >= 8 && !this.gonderiyor && !this.calisan;
      },
      sesOzeti() {
        if (!this.ayarlar) return 'gemini · Charon';
        const ses = this.ayarlar.ses || {};
        return `${ses.saglayici || 'gemini'} · ${ses.voice_id || 'Charon'} · ${ses.model || ses.model_id || 'gemini-2.5-flash-preview-tts'}`;
      },
      gorselOzeti() {
        if (!this.ayarlar) return 'pexels · 1080px+ dikey';
        const g = this.ayarlar.gorsel || {};
        return `${g.kaynak || 'pexels'} · ${g.min_genislik || 1080}px+ sinematik`;
      },
      tahminiKarakter() {
        return this.sahne * 105;
      },
      apiKartlari() {
        const d = this.apiDurum || {};
        const telServisler = (this.apiTelemetri && this.apiTelemetri.servisler) || [];
        const bulTel = (anahtar) => telServisler.find((s) => s.ad.toLowerCase().includes(anahtar)) || null;

        const kartYap = (baslik, alt, durumObj, telAd, varsayilanLimit, birim) => {
          const x = durumObj || {};
          const t = bulTel(telAd);
          const l = x.limit || {};
          let kalan = Number(l['remaining-requests'] ?? l['remaining'] ?? (t ? t.kalan : NaN));
          let toplam = Number(l['limit-requests'] ?? l['limit'] ?? (t ? t.limit : varsayilanLimit));
          if (!isFinite(toplam) || toplam <= 0) toplam = varsayilanLimit;
          if (!isFinite(kalan)) kalan = x.durum === 'aktif' ? toplam : 0;
          const yuzde = Math.max(0, Math.min(100, (kalan / toplam) * 100));
          const aktif = x.durum === 'aktif' || (!x.durum && t && t.durum === 'ok');
          const renk = !aktif ? '#f56c6c' : (yuzde <= 15 ? '#f56c6c' : (yuzde <= 30 ? '#e6a23c' : '#67c23a'));
          return {
            baslik,
            alt,
            aktif,
            durumEtiket: aktif ? `Aktif · HTTP ${x.http || 200}` : (x.durum === 'kota' ? 'Kota Dolu' : `Kontrol · HTTP ${x.http || '—'}`),
            tagTip: aktif ? 'success' : (x.durum === 'kota' ? 'warning' : 'danger'),
            kalan,
            toplam,
            birim: l.birim || (t && t.birim) || birim,
            yuzde,
            renk,
            mesaj: (!aktif && x.mesaj) ? x.mesaj : ''
          };
        };

        return [
          kartYap('Gemini · Charon', 'TTS seslendirme + yardımcı metin', d.gemini, 'gemini', 1500, 'istek/gün'),
          kartYap('Pexels · Sinematik Görsel', 'Birincil 9:16 dikey sahne görseli', d.pexels, 'pexels', 25000, 'istek/ay'),
          kartYap('Groq · Hızlı Metin Motoru', 'Senaryo, başlık ve kapak metni', d.groq, 'groq', 1000, 'istek/gün')
        ];
      }
    },
    methods: {
      ADIM_IKON_BUL(s) { return ADIM_IKON[s] || 'MoreFilled'; },
      sayi(v) { return Number(v || 0).toLocaleString('tr-TR'); },
      sureSec(tip) {
        this.sureTipi = tip;
        if (tip === '38-45') { this.sureMin = 38; this.sureMax = 45; }
        if (tip === '46-55') { this.sureMin = 46; this.sureMax = 55; }
      },
      oneriSec(t) { this.konu = typeof t === 'string' ? t : t.title; },
      async apiDurumuYukle() {
        try {
          const [txtDurum, txtTel] = await Promise.all([
            this.s.getRawText('api_durum.json'),
            this.s.getRawText('api_telemetri.json')
          ]);
          if (txtDurum) this.apiDurum = JSON.parse(txtDurum);
          if (txtTel) this.apiTelemetri = JSON.parse(txtTel);
          this.apiDurumHata = '';
        } catch (e) {
          this.apiDurumHata = 'API durumu okunamadı: ' + (e.message || e);
        }
      },
      async canliApiOlc() {
        this.apiDurumBusy = true;
        const onceki = this.apiDurum && this.apiDurum.guncellendi;
        try {
          await this.s.gh(`/repos/${SAHIP}/${DEPO}/actions/workflows/api-durum.yml/dispatches`, {
            method: 'POST',
            body: { ref: 'main' }
          });
          this.s.notify('info', 'Canlı API kontrolü başlatıldı (~25 sn)…');
          for (let i = 0; i < 8; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            await this.apiDurumuYukle();
            if (this.apiDurum && this.apiDurum.guncellendi !== onceki) {
              this.s.notify('success', 'API durum ve kotaları güncellendi.');
              break;
            }
          }
        } catch (e) {
          this.s.notify('error', 'Canlı ölçüm başlatılamadı: ' + (e.message || e));
        } finally {
          this.apiDurumBusy = false;
        }
      },
      async onerileriYukle() {
        try {
          const txt = await this.s.getRawText('konu_onerileri.json');
          if (!txt) return;
          const j = JSON.parse(txt);
          if (j.suggestions && j.suggestions.length) {
            this.oneriler = j.suggestions.map((x) => x.title);
            this.oneriMeta = `${j.method || 'Kanal analizli öneriler'} · ${j.used_count || 0} geçmiş video tarandı`;
          }
        } catch (e) { this.oneriMeta = ''; }
      },
      durumEtiketi(k) {
        if (k.status === 'in_progress') return 'Üretiliyor';
        if (k.status === 'queued') return 'Sırada';
        if (k.conclusion === 'success') return 'Bitti';
        if (k.conclusion === 'failure') return 'Hata';
        if (k.conclusion === 'cancelled') return 'İptal';
        return k.status || '—';
      },
      durumRengi(k) {
        if (k.status === 'in_progress') return 'warning';
        if (k.status === 'queued') return 'info';
        if (k.conclusion === 'success') return 'success';
        if (k.conclusion === 'failure') return 'danger';
        return 'info';
      },
      sureMetni(k) {
        if (!k.run_started_at) return '—';
        const bas = new Date(k.run_started_at).getTime();
        const bit = k.updated_at ? new Date(k.updated_at).getTime() : Date.now();
        const sn = Math.max(0, Math.round((bit - bas) / 1000));
        return sn < 60 ? sn + ' sn' : Math.floor(sn / 60) + ' dk ' + (sn % 60) + ' sn';
      },
      tarih(k) {
        if (!k.created_at) return '—';
        return new Date(k.created_at).toLocaleString('tr-TR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
      },
      adimRengi(a) {
        if (a.conclusion === 'success') return 'success';
        if (a.conclusion === 'failure') return 'danger';
        if (a.status === 'in_progress') return 'warning';
        return 'info';
      },
      async ayarlariYukle() {
        try {
          const txt = await this.s.getRawText('motor/ayarlar.json');
          if (txt) this.ayarlar = JSON.parse(txt);
          this.ayarHata = '';
        } catch (e) {
          this.ayarHata = 'Ayarlar okunamadı: ' + e.message;
        }
      },
      async yukle(sessiz) {
        if (!this.s.authed) return;
        this.yukleniyor = !sessiz;
        try {
          const veri = await this.s.gh(
            `/repos/${SAHIP}/${DEPO}/actions/workflows/${IS_AKISI}/runs?per_page=10`);
          this.kosular = (veri && veri.workflow_runs) || [];
          this.hata = '';
          this.sonYenileme = new Date().toLocaleTimeString('tr-TR');

          const aktif = this.kosular.find((k) => k.status === 'in_progress' || k.status === 'queued');
          const hedef = aktif || this.kosular[0];
          if (hedef) {
            this.aktifKosu = hedef;
            const isler = await this.s.gh(`/repos/${SAHIP}/${DEPO}/actions/runs/${hedef.id}/jobs`);
            const is = (isler && isler.jobs && isler.jobs[0]) || null;
            this.adimlar = (is && is.steps) || [];
          }
        } catch (e) {
          this.hata = 'Koşular okunamadı: ' + e.message;
        } finally {
          this.yukleniyor = false;
        }
      },
      async uret() {
        if (!this.hazirMi) return;
        this.gonderiyor = true;
        try {
          const girdiler = {
            konu: this.konu.trim(),
            kuru: this.kuru ? 'true' : 'false',
            sahne: String(this.sahne),
            sure_min: String(this.sureMin),
            sure_max: String(this.sureMax)
          };
          await this.s.gh(
            `/repos/${SAHIP}/${DEPO}/actions/workflows/${IS_AKISI}/dispatches`,
            { method: 'POST', body: { ref: 'main', inputs: girdiler } }
          );
          this.s.notify('success', 'Üretim başlatıldı! Tamamlanınca video + 9:16 standart kapak Drive Onay Bekleyen klasörüne düşer.');
          this.konu = '';
          setTimeout(() => this.yukle(true), 5000);
        } catch (e) {
          this.s.notify('error', 'Başlatılamadı: ' + e.message);
        } finally {
          this.gonderiyor = false;
        }
      },
      kosuAc(k) { window.open(k.html_url, '_blank'); }
    },
    mounted() {
      this.ayarlariYukle();
      this.apiDurumuYukle();
      this.onerileriYukle();
      this.yukle();
      this.zamanlayici = setInterval(() => this.yukle(true), 10000);
    },
    beforeUnmount() {
      if (this.zamanlayici) clearInterval(this.zamanlayici);
    },
    template: `
      <div class="page">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px"
          title="Kilitli Şablon: 1080×1920 Shorts · MİRA v2.2 + 3B Kapanış Kartı · Charon Ses · Standart Bilgi Dozu Kapak">
          <div style="line-height:1.6">
            Üretilen video ve <code>kapak_176..196</code> standardındaki 9:16 kapak otomatik olarak
            <a :href="driveLink" target="_blank"><b>Drive · Onay Bekleyen Videolar</b></a> klasörüne yüklenir.
          </div>
        </el-alert>

        <!-- ÜST ŞERİT: Her API kartında Drive tarzı yeşil kalan kota çubuğu -->
        <el-card shadow="never" style="margin-bottom:16px">
          <template #header>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <b>API Anlık Durumu ve Kalan Kotalar</b>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="font-size:11.5px;color:#909399" v-if="apiDurum && apiDurum.guncellendi">
                  Son ölçüm: {{ new Date(apiDurum.guncellendi).toLocaleString('tr-TR') }}
                </span>
                <el-button size="small" icon="Refresh" @click="apiDurumuYukle">Oku</el-button>
                <el-button size="small" type="primary" plain :loading="apiDurumBusy" @click="canliApiOlc">Canlı Ölç</el-button>
              </div>
            </div>
          </template>

          <el-row :gutter="12">
            <el-col :xs="24" :sm="8" v-for="k in apiKartlari" :key="k.baslik" style="margin-bottom:8px">
              <div style="padding:12px 14px;border:1px solid #ebeef5;border-radius:8px;background:#fcfcfd;height:100%">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                  <b style="font-size:13.5px">{{ k.baslik }}</b>
                  <el-tag size="small" :type="k.tagTip" effect="light">{{ k.durumEtiket }}</el-tag>
                </div>
                <div style="font-size:11.5px;color:#909399;margin-top:2px">{{ k.alt }}</div>

                <div style="font-size:15px;font-weight:700;margin-top:8px;color:#303133">
                  {{ sayi(k.kalan) }} / {{ sayi(k.toplam) }} <span style="font-size:11.5px;font-weight:400;color:#909399">{{ k.birim }}</span>
                </div>

                <!-- Yeşil kalan kota çubuğu -->
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                  <div style="flex:1;height:8px;background:#ebeef5;border-radius:4px;overflow:hidden">
                    <div :style="{ width: k.yuzde + '%', height:'100%', background: k.renk, borderRadius:'4px', transition:'width .35s' }"></div>
                  </div>
                  <span :style="{ fontSize:'11.5px', fontWeight:700, color: k.renk, minWidth:'58px', textAlign:'right' }">
                    %{{ k.yuzde.toFixed(0) }} kalan
                  </span>
                </div>

                <div v-if="k.mesaj" style="font-size:11.5px;color:#f56c6c;margin-top:6px">{{ k.mesaj }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <el-row :gutter="16">
          <el-col :xs="24" :lg="14">
            <el-card shadow="never">
              <template #header><b>Yeni Shorts Üretimi</b></template>

              <el-form label-position="top">
                <el-form-item label="Konu / Merak Sorusu (tek cümle)">
                  <el-input v-model="konu" type="textarea" :rows="2" maxlength="160" show-word-limit
                    placeholder="Örnek: Karanlıkta telefona bakınca neden geçici kör oluruz?" />
                  <div style="margin-top:8px;font-size:12px;color:#67c23a" v-if="oneriMeta">● {{ oneriMeta }}</div>
                  <div style="margin-top:8px">
                    <el-button v-for="o in oneriler" :key="o" size="small" plain
                      style="margin:0 6px 6px 0" @click="oneriSec(o)">{{ o }}</el-button>
                  </div>
                </el-form-item>

                <el-row :gutter="12">
                  <el-col :xs="24" :sm="8">
                    <el-form-item label="Sahne sayısı">
                      <el-select v-model="sahne" style="width:100%">
                        <el-option v-for="n in [5,6,7,8]" :key="n" :label="n + ' sahne'" :value="n" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="10">
                    <el-form-item label="Hedef süre">
                      <el-radio-group v-model="sureTipi" @change="sureSec" style="width:100%">
                        <el-radio-button label="38-45">38–45 sn (İdeal)</el-radio-button>
                        <el-radio-button label="46-55">46–55 sn</el-radio-button>
                      </el-radio-group>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="6">
                    <el-form-item label="Mod">
                      <el-checkbox v-model="kuru">Kuru test</el-checkbox>
                    </el-form-item>
                  </el-col>
                </el-row>

                <div style="background:#f8fafc;border:1px solid #ebeef5;border-radius:6px;padding:10px 12px;margin-bottom:14px;font-size:12.5px">
                  <div class="kv"><span class="k">Ses motoru</span><span class="v">{{ sesOzeti }}</span></div>
                  <div class="kv"><span class="k">Görsel motoru</span><span class="v">{{ gorselOzeti }}</span></div>
                  <div class="kv"><span class="k">Tahmini metin hacmi</span><span class="v">~{{ tahminiKarakter }} karakter</span></div>
                </div>

                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                  <el-button type="primary" size="large" icon="VideoPlay" :loading="gonderiyor" :disabled="!hazirMi" @click="uret">
                    {{ calisan ? 'Üretim Devam Ediyor…' : 'Shorts Üretimini Başlat' }}
                  </el-button>
                  <el-button size="large" plain @click="kosuAc({ html_url: driveLink })">
                    Onay Bekleyenler Klasörü
                  </el-button>
                </div>
              </el-form>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="10">
            <el-card shadow="never" style="margin-bottom:16px">
              <template #header>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <b>Canlı Üretim Adımları {{ aktifKosu ? ('#' + aktifKosu.run_number) : '' }}</b>
                  <el-tag v-if="aktifKosu" size="small" :type="durumRengi(aktifKosu)">{{ durumEtiketi(aktifKosu) }}</el-tag>
                </div>
              </template>
              <div v-if="!adimlar.length" class="empty-hint">Henüz aktif adım yok.</div>
              <div v-else>
                <div v-for="a in adimlar" :key="a.number"
                     style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #f0f2f5;font-size:12.5px">
                  <span>{{ a.number }}. {{ a.name }}</span>
                  <el-tag size="small" :type="adimRengi(a)" effect="plain">
                    {{ a.status === 'completed' ? (a.conclusion === 'success' ? 'tamam' : a.conclusion) : a.status }}
                  </el-tag>
                </div>
              </div>
            </el-card>

            <el-card shadow="never">
              <template #header>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <b>Son Üretim Koşuları</b>
                  <span style="font-size:11px;color:#909399">{{ sonYenileme }}</span>
                </div>
              </template>
              <el-table :data="kosular.slice(0, 6)" size="small" style="width:100%" @row-click="kosuAc">
                <el-table-column label="#" width="58">
                  <template #default="{ row }"><span class="mono-sm">#{{ row.run_number }}</span></template>
                </el-table-column>
                <el-table-column label="Durum" width="95">
                  <template #default="{ row }">
                    <el-tag size="small" :type="durumRengi(row)">{{ durumEtiketi(row) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="Tarih">
                  <template #default="{ row }"><span class="mono-sm">{{ tarih(row) }}</span></template>
                </el-table-column>
                <el-table-column label="Süre" width="84">
                  <template #default="{ row }"><span class="mono-sm">{{ sureMetni(row) }}</span></template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </div>
    `
  };
})();
