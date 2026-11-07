/* ============================================================================
   Bilgi Dozu · Video Üretimi — detaylı üretim ekranı
   Konu + sahne sayısı + süre hedefi verilir, motor (motor-uret.yml) çalıştırılır,
   adımlar canlı izlenir. Şablon sabittir; buradan stil değiştirilemez.
   ========================================================================== */
(function () {
  'use strict';

  const VIEWS = window.VIEWS;
  const { store } = window.BD;
  if (!VIEWS) return;

  const SAHIP = 'benngokhan';
  const DEPO = 'yt_auto_uploader';
  const IS_AKISI = 'motor-uret.yml';
  const DRIVE_ONAY = 'https://drive.google.com/drive/folders/1N6mMUu3rEvCIie4o4XUWegPzFngMgHHM';

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
        sahne: 4,
        sureTipi: '38-42',
        sureMin: 38,
        sureMax: 42,
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
        if (!this.ayarlar) return '—';
        const ses = this.ayarlar.ses || {};
        return `${ses.saglayici || '?'} · ${ses.voice_id || '?'} · ${ses.model || ses.model_id || '?'}`;
      },
      gorselOzeti() {
        if (!this.ayarlar) return '—';
        const g = this.ayarlar.gorsel || {};
        return `${g.kaynak || '?'} · ${g.min_genislik || 1080}px+`;
      },
      tahminiKarakter() {
        // kaba: sahne başına ~110 karakter
        return this.sahne * 110;
      }
    },
    methods: {
      sureSec(tip) {
        this.sureTipi = tip;
        if (tip === '38-42') { this.sureMin = 38; this.sureMax = 42; }
        if (tip === '50-58') { this.sureMin = 50; this.sureMax = 58; }
      },
      oneriSec(t) { this.konu = typeof t === 'string' ? t : t.title; },
      async onerileriYukle() {
        try {
          const v = await this.s.gh(`/repos/${SAHIP}/${DEPO}/contents/konu_onerileri.json?ref=main`);
          const metin = decodeURIComponent(escape(atob((v.content || '').replace(/\n/g, ''))));
          const j = JSON.parse(metin);
          this.oneriler = (j.suggestions || []).map(x => x.title);
          this.oneriMeta = `${j.method || 'Analizli öneriler'} · ${j.used_count || 0} geçmiş kayıt kontrol edildi`;
        } catch (e) { this.oneriMeta = 'Yedek öneriler'; }
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
          const v = await this.s.gh(`/repos/${SAHIP}/${DEPO}/contents/motor/ayarlar.json?ref=main`);
          const metin = decodeURIComponent(escape(atob((v.content || '').replace(/\n/g, ''))));
          this.ayarlar = JSON.parse(metin);
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
          this.s.notify('success', 'Üretim başlatıldı. Bittiğinde Drive "Onay Bekleyen Videolar" klasörüne düşer.');
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
          title="Şablon sabittir: 1080x1920 · 60 fps · üst başlık beyaz+sarı · karaoke altyazı · TAKİP ET butonu">
          <div style="line-height:1.6">
            Buradan yalnızca <b>konu</b> ve <b>üretim ayarları</b> değişir; görünüm değişmez.
            Video bitince <a :href="driveLink" target="_blank">Drive · Onay Bekleyen Videolar</a> klasörüne düşer.
          </div>
        </el-alert>

        <el-row :gutter="16">
          <el-col :xs="24" :lg="14">
            <el-card shadow="never">
              <template #header><b>Üretim ayarları</b></template>

              <el-form label-position="top">
                <el-form-item label="Konu (tek cümle)">
                  <el-input v-model="konu" type="textarea" :rows="2" maxlength="160" show-word-limit
                    placeholder="Örnek: Parmak uçların suda neden buruşur?" />
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
                        <el-option v-for="n in [4,5,6,7,8]" :key="n" :label="n + ' sahne'" :value="n" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="16">
                    <el-form-item label="Süre hedefi">
                      <el-radio-group v-model="sureTipi" @change="sureSec">
                        <el-radio-button label="38-42">38-42 sn</el-radio-button>
                        <el-radio-button label="50-58">50-58 sn</el-radio-button>
                      </el-radio-group>
                      <span style="margin-left:10px;color:#909399;font-size:12px">{{ sureMin }}-{{ sureMax }} sn</span>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-form-item label="Ses ve görsel (şablondan gelir, değiştirilemez)">
                  <el-tag type="success" style="margin-right:8px">Ses: {{ sesOzeti }}</el-tag>
                  <el-tag type="info">Görsel: {{ gorselOzeti }}</el-tag>
                  <el-alert v-if="ayarHata" type="warning" :closable="false" :title="ayarHata" style="margin-top:8px" />
                </el-form-item>

                <el-form-item>
                  <el-switch v-model="kuru" active-text="Deneme (Drive'a koyma, sadece üret)" />
                </el-form-item>

                <el-divider />
                <div style="color:#909399;font-size:12px;margin-bottom:12px">
                  Tahmini ses kullanımı: ~{{ tahminiKarakter }} karakter ·
                  Süre: {{ sureMin }}-{{ sureMax }} sn · Render: 1080x1920 / 60 fps
                </div>

                <el-button type="primary" size="large" :loading="gonderiyor" :disabled="!hazirMi" @click="uret">
                  Üretimi başlat
                </el-button>
                <span v-if="calisan" style="margin-left:12px;color:#e6a23c">
                  Bir video üretiliyor · {{ sureMetni(calisan) }}
                </span>
              </el-form>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="10">
            <el-card shadow="never">
              <template #header>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <b>Canlı durum</b>
                  <el-button v-if="aktifKosu" size="small" text type="primary" @click="kosuAc(aktifKosu)">Koşuyu aç</el-button>
                </div>
              </template>
              <div v-if="!aktifKosu" class="empty-hint">Henüz üretim yok.</div>
              <div v-else>
                <div style="margin-bottom:10px">
                  <el-tag :type="durumRengi(aktifKosu)" size="small">{{ durumEtiketi(aktifKosu) }}</el-tag>
                  <span style="margin-left:8px;color:#909399;font-size:12px">
                    #{{ aktifKosu.run_number }} · {{ sureMetni(aktifKosu) }} · {{ tarih(aktifKosu) }}
                  </span>
                </div>
                <el-steps direction="vertical" :active="adimlar.filter(a => a.conclusion === 'success').length" space="46px">
                  <el-step v-for="a in adimlar" :key="a.number" :title="a.name"
                    :status="a.status === 'in_progress' ? 'process' : (a.conclusion === 'success' ? 'success' : (a.conclusion === 'failure' ? 'error' : 'wait'))" />
                </el-steps>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-card shadow="never" style="margin-top:16px">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>Son üretimler</b>
              <span style="font-size:12px;color:#909399">
                {{ sonYenileme ? 'Yenilendi: ' + sonYenileme : '' }}
                <el-button size="small" text :loading="yukleniyor" @click="yukle()">Yenile</el-button>
              </span>
            </div>
          </template>
          <el-alert v-if="hata" type="error" :closable="false" :title="hata" style="margin-bottom:12px" />
          <el-table :data="kosular" size="small" empty-text="Henüz üretim yok">
            <el-table-column label="Durum" width="110">
              <template #default="p"><el-tag :type="durumRengi(p.row)" size="small">{{ durumEtiketi(p.row) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="Tarih" width="130">
              <template #default="p">{{ tarih(p.row) }}</template>
            </el-table-column>
            <el-table-column label="Süre" width="90">
              <template #default="p">{{ sureMetni(p.row) }}</template>
            </el-table-column>
            <el-table-column label="Konu">
              <template #default="p">{{ p.row.display_title || p.row.name }}</template>
            </el-table-column>
            <el-table-column width="80" align="right">
              <template #default="p"><el-button size="small" text type="primary" @click="kosuAc(p.row)">Aç</el-button></template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    `
  };
})();
