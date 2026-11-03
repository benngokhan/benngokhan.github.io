/* ============================================================================
   Bilgi Dozu · Video Üretimi — kanalın kendi motorunu (motor-uret.yml) panelden
   tek düğmeyle çalıştırır. Şablon sabittir; buradan sadece konu verilir.
   ========================================================================== */
(function () {
  'use strict';

  const VIEWS = window.VIEWS;
  if (!VIEWS) return;

  const IS_AKISI = 'motor-uret.yml';
  const SAHIP = 'benngokhan';
  const DEPO = 'yt_auto_uploader';

  const DURUM_RENK = {
    success: 'success',
    failure: 'danger',
    cancelled: 'info',
    in_progress: 'warning',
    queued: 'info'
  };

  VIEWS.uretim = {
    name: 'UretimView',
    data() {
      return {
        s: store,
        konu: '',
        kuru: true,
        gonderiyor: false,
        kosular: [],
        yukleniyor: false,
        hata: '',
        sonYenileme: '',
        zamanlayici: null
      };
    },
    computed: {
      calisan() {
        return this.kosular.find((k) => k.status === 'in_progress' || k.status === 'queued') || null;
      },
      hazirMi() {
        return this.konu.trim().length >= 8 && !this.gonderiyor && !this.calisan;
      }
    },
    methods: {
      durumEtiketi(k) {
        if (k.status === 'in_progress') return 'Üretiliyor';
        if (k.status === 'queued') return 'Sırada';
        if (k.conclusion === 'success') return 'Bitti';
        if (k.conclusion === 'failure') return 'Hata';
        if (k.conclusion === 'cancelled') return 'İptal';
        return k.status || '—';
      },
      durumRengi(k) {
        return DURUM_RENK[k.status] || DURUM_RENK[k.conclusion] || 'info';
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
      async yukle(sessiz) {
        if (!this.s.authed) return;
        this.yukleniyor = !sessiz;
        try {
          const veri = await this.s.gh(
            `/repos/${SAHIP}/${DEPO}/actions/workflows/${IS_AKISI}/runs?per_page=8`
          );
          this.kosular = (veri && veri.workflow_runs) || [];
          this.hata = '';
          this.sonYenileme = new Date().toLocaleTimeString('tr-TR');
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
          const govde = {
            ref: 'main',
            inputs: { konu: this.konu.trim(), kuru: this.kuru ? 'true' : 'false' }
          };
          await this.s.gh(
            `/repos/${SAHIP}/${DEPO}/actions/workflows/${IS_AKISI}/dispatches`,
            { method: 'POST', body: govde }
          );
          this.s.notify('success', 'Üretim başlatıldı. Video bitince Drive CEO klasörüne düşer.');
          this.konu = '';
          setTimeout(() => this.yukle(true), 4000);
        } catch (e) {
          this.s.notify('error', 'Başlatılamadı: ' + e.message + ' (token izni: Actions yazma)');
        } finally {
          this.gonderiyor = false;
        }
      },
      kosuAc(k) {
        window.open(k.html_url, '_blank');
      }
    },
    mounted() {
      this.yukle();
      this.zamanlayici = setInterval(() => this.yukle(true), 15000);
    },
    beforeUnmount() {
      if (this.zamanlayici) clearInterval(this.zamanlayici);
    },
    template: `
      <div class="page">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px"
          title="Şablon sabittir: 1080x1920 · 60 fps · 38-42 sn · üst başlık beyaz+sarı · karaoke altyazı · TAKİP ET butonu">
          <div style="line-height:1.6">
            Konuyu yaz, Üret'e bas. Video GitHub'da üretilir, <b>onay bekleyen</b> olarak Drive'a düşer.
            Ses anahtarı (ElevenLabs) yoksa üretim <b>durur</b> — başka sese geçmez.
          </div>
        </el-alert>

        <el-card shadow="never">
          <template #header><b>Yeni video</b></template>
          <el-form label-position="top">
            <el-form-item label="Konu (tek cümle)">
              <el-input v-model="konu" type="textarea" :rows="2" maxlength="160" show-word-limit
                placeholder="Örnek: Parmak uçların suda neden buruşur?" />
            </el-form-item>
            <el-form-item>
              <el-switch v-model="kuru" active-text="Sadece üret (Drive'a yükleme)" />
            </el-form-item>
            <el-button type="primary" size="large" :loading="gonderiyor" :disabled="!hazirMi" @click="uret">
              Videoyu üret
            </el-button>
            <span v-if="calisan" style="margin-left:12px;color:#e6a23c">
              Şu an bir video üretiliyor ({{ sureMetni(calisan) }})
            </span>
          </el-form>
        </el-card>

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
            <el-table-column label="Durum" width="120">
              <template #default="p">
                <el-tag :type="durumRengi(p.row)" size="small">{{ durumEtiketi(p.row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Başlangıç" width="140">
              <template #default="p">{{ tarih(p.row) }}</template>
            </el-table-column>
            <el-table-column label="Süre" width="100">
              <template #default="p">{{ sureMetni(p.row) }}</template>
            </el-table-column>
            <el-table-column label="Konu">
              <template #default="p">{{ p.row.display_title || p.row.name }}</template>
            </el-table-column>
            <el-table-column width="90" align="right">
              <template #default="p">
                <el-button size="small" text type="primary" @click="kosuAc(p.row)">Aç</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    `
  };
})();
