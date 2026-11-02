/* ============================================================================
   Görünüm: Kapak Yükle — panelden kapak seç, kırp, Drive'a yaz, YouTube'a uygula
   Bot kapak atmadıysa Studio'ya gitmeden buradan tamamlanır.
   ========================================================================== */
(function () {
  'use strict';
  const { store } = window.BD;
  const VIEWS = window.VIEWS;

  const TARGET = { short: { w: 1080, h: 1920, label: '9:16 dikey' }, long: { w: 1920, h: 1080, label: '16:9 yatay' } };

  function parseUploadedIds(text) {
    /* uploaded.txt satırları: video_155.mp4 | 2026-11-02 10:11 | https://youtu.be/MgpEXhYe2-8 */
    const out = {};
    String(text || '').split('\n').forEach((line) => {
      const m = line.match(/(video_\d+|uzun_video_\d+)\.mp4/);
      const id = line.match(/(?:youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})/);
      if (m && id) out[m[1] + '.mp4'] = id[1];
    });
    return out;
  }

  VIEWS.kapak = {
    name: 'KapakView',
    data() {
      return {
        s: store,
        tip: 'short',
        no: '',
        fileName: '',
        imgEl: null,
        imgW: 0,
        imgH: 0,
        mode: 'cover',
        zoom: 1,
        offsetY: 0,
        videoId: '',
        temizle: false,
        busy: false,
        runId: null,
        sonuc: null,
        pollTimer: null,
        manuelNo: ''
      };
    },
    computed: {
      kuyruk() {
        return (this.s.telemetryQueue() || []).slice().sort((a, b) => Number(b.number) - Number(a.number));
      },
      yayinIdleri() {
        return parseUploadedIds(this.s.files && this.s.files.uploaded);
      },
      secilen() {
        return this.kuyruk.find((x) => String(x.number) === String(this.no) && x.type === this.tip) || null;
      },
      hedef() {
        return TARGET[this.tip];
      },
      tahminiVideoId() {
        if (!this.secilen) return '';
        return this.yayinIdleri[this.secilen.file_name] || '';
      },
      hazir() {
        return this.no && this.imgEl && !this.busy;
      }
    },
    watch: {
      no() { this.otomatikVideoId(); this.ciz(); },
      tip() { this.no = ''; this.videoId = ''; this.ciz(); },
      mode() { this.ciz(); },
      zoom() { this.ciz(); },
      offsetY() { this.ciz(); }
    },
    methods: {
      dosyaAdiFor() {
        return this.tip === 'short' ? `kapak_${this.no}.jpg` : `uzun_kapak_${this.no}.jpg`;
      },
      otomatikVideoId() {
        this.videoId = this.tahminiVideoId || '';
      },
      dosyaSec(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png)$/.test(file.type)) {
          this.s.notify('error', 'Sadece JPG veya PNG seç.');
          return;
        }
        this.fileName = file.name;
        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => {
          img.onload = () => {
            this.imgEl = img;
            this.imgW = img.naturalWidth;
            this.imgH = img.naturalHeight;
            this.zoom = 1;
            this.offsetY = 0;
            this.$nextTick(this.ciz);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      },
      ciz() {
        const cv = this.$refs.canvas;
        if (!cv || !this.imgEl) return;
        const { w, h } = this.hedef;
        const canvas = cv;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const img = this.imgEl;

        if (this.mode === 'contain') {
          /* Sığdır: hiç kırpma, siyah zemin */
          const k = Math.min(w / img.width, h / img.height) * this.zoom;
          const dw = img.width * k;
          const dh = img.height * k;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 + this.offsetY * h, dw, dh);
          return;
        }
        /* Kırp (cover): oranı koru, taşan kısmı kes */
        const k = Math.max(w / img.width, h / img.height) * this.zoom;
        const dw = img.width * k;
        const dh = img.height * k;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 + this.offsetY * h, dw, dh);
      },
      oranUyari() {
        if (!this.imgEl) return '';
        const r = this.imgW / this.imgH;
        const ideal = this.tip === 'short' ? 9 / 16 : 16 / 9;
        if (Math.abs(r - ideal) < 0.03) return '';
        return `Görsel oranı ${r.toFixed(2)} — hedef ${ideal.toFixed(2)}. Kırpma ile düzeltilecek.`;
      },
      async yukle() {
        if (!this.hazir) return;
        this.busy = true;
        this.sonuc = null;
        try {
          const cv = this.$refs.canvas;
          const b64 = cv.toDataURL('image/jpeg', 0.92).split(',')[1];
          const path = `kapak_gelen/${this.dosyaAdiFor()}`;

          /* 1) Görseli repoya koy (workflow oradan okur) */
          await this.s.commitBinary(
            path,
            b64,
            `chore: panelden kapak eklendi (${this.dosyaAdiFor()}) [skip ci]`
          );

          /* 2) Kapak iş akışını tetikle */
          const body = {
            ref: 'main',
            inputs: {
              tip: this.tip,
              numara: String(this.no),
              dosya: path,
              video_id: this.videoId || '',
              temizle: this.temizle ? 'true' : 'false'
            }
          };
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/kapak-ekle.yml/dispatches`, { method: 'POST', body });
          this.s.notify('success', 'Kapak kuyruğa alındı — 10-40 saniye içinde Drive ve YouTube güncellenir.');
          setTimeout(() => this.izle(), 6000);
        } catch (e) {
          this.s.notify('error', 'Kapak yüklenemedi: ' + (e.message || e));
        } finally {
          this.busy = false;
        }
      },
      async izle() {
        try {
          const res = await this.s.gh('/repos/' + this.s.repo + '/actions/runs?per_page=10');
          const run = (res.workflow_runs || []).find((r) => r.path && r.path.includes('kapak-ekle.yml'));
          if (!run) return;
          this.runId = run.id;
          if (this.pollTimer) clearInterval(this.pollTimer);
          this.pollTimer = setInterval(async () => {
            try {
              const r = await this.s.gh('/repos/' + this.s.repo + '/actions/runs/' + this.runId);
              if (r.status === 'completed') {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
                this.sonuc = { durum: r.conclusion, url: r.html_url };
                const txt = await this.s.getRawText('kapak_sonuc.json');
                if (txt) { try { this.sonuc.detay = JSON.parse(txt); } catch (e) { /* yut */ } }
                this.s.notify(r.conclusion === 'success' ? 'success' : 'error', 'Kapak işi bitti: ' + r.conclusion);
                this.s.loadTelemetry && this.s.loadTelemetry();
              }
            } catch (e) { /* sessiz */ }
          }, 8000);
        } catch (e) { /* sessiz */ }
      }
    },
    mounted() {
      if (!this.s.files || !this.s.files.uploaded) this.s.loadFiles && this.s.loadFiles();
    },
    unmounted() {
      if (this.pollTimer) clearInterval(this.pollTimer);
    },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Kapak Yükle</h2>
            <p>Kapak hazır değildi ya da yanlış kapak gitti mi? Buradan seç, kırp, tek tıkla Drive'a yaz ve yayındaki videoya uygula. Studio'ya girmeye gerek yok.</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" @click="s.loadTelemetry()">Kuyruğu yenile</el-button>
          </div>
        </div>

        <div class="alert-strip ok" style="margin-bottom:14px">
          <el-icon><InfoFilled /></el-icon>
          <span>Kural hatırlatması: bot kapak <b>üretmez</b>, yalnızca Drive'da <b>tam adıyla</b> eşleşen kapağı kullanır
            (<code>kapak_N.jpg</code> / <code>uzun_kapak_N.png</code>). Bu ekran o dosyayı doğru adla oluşturur.</span>
        </div>

        <div class="grid c2" style="gap:16px;align-items:start">
          <!-- SOL: seçim -->
          <div class="card">
            <h3 style="margin-top:0">1 · Video ve görsel</h3>

            <el-radio-group v-model="tip" size="small" style="margin-bottom:12px">
              <el-radio-button label="short">Shorts (9:16)</el-radio-button>
              <el-radio-button label="long">Uzun video (16:9)</el-radio-button>
            </el-radio-group>

            <el-select v-model="no" filterable clearable placeholder="Kuyruktan video seç" size="small" style="width:100%">
              <el-option v-for="x in kuyruk.filter(i => i.type === tip)" :key="x.type + x.number"
                :label="x.file_name + (x.is_published ? ' · yayınlandı' : ' · hazır')"
                :value="String(x.number)">
                <span>{{ x.file_name }}</span>
                <span style="float:right;color:#8a8a8a;font-size:12px">
                  {{ x.has_drive_cover ? 'kapak var' : 'kapak yok' }} · {{ x.is_published ? 'yayında' : 'sırada' }}
                </span>
              </el-option>
            </el-select>

            <div style="margin:12px 0">
              <input type="file" accept="image/jpeg,image/png" @change="dosyaSec" />
              <div v-if="fileName" style="font-size:12px;color:#8a8a8a;margin-top:6px">
                {{ fileName }} · {{ imgW }}×{{ imgH }}
              </div>
            </div>

            <div v-if="imgEl">
              <div class="kv" style="font-size:12.5px;margin-bottom:6px">
                <span>Kırpma</span>
                <el-radio-group v-model="mode" size="small" @change="ciz">
                  <el-radio-button label="cover">Kırp (doldur)</el-radio-button>
                  <el-radio-button label="contain">Sığdır (siyah zemin)</el-radio-button>
                </el-radio-group>
              </div>
              <div class="kv" style="font-size:12.5px">
                <span>Yakınlaştır</span>
                <el-slider v-model="zoom" :min="1" :max="2.2" :step="0.02" style="width:180px" />
              </div>
              <div class="kv" style="font-size:12.5px">
                <span>Dikey kaydır</span>
                <el-slider v-model="offsetY" :min="-0.45" :max="0.45" :step="0.01" style="width:180px" />
              </div>
              <div v-if="oranUyari()" style="font-size:12px;color:#e6a23c;margin-top:6px">{{ oranUyari() }}</div>
            </div>

            <h3 style="margin:18px 0 8px">2 · Uygulama</h3>
            <div style="font-size:12.5px;color:#8a8a8a;margin-bottom:8px">
              Drive'a yazılacak ad: <b>{{ no ? dosyaAdiFor() : '—' }}</b>
            </div>

            <el-checkbox v-model="temizle" style="display:block;margin-bottom:10px">
              Aynı numaralı eski/artık kopyaları çöpe at <span style="color:#8a8a8a">(ör. kapak_155_yeni.jpg)</span>
            </el-checkbox>

            <div class="kv" style="align-items:center">
              <span>Video ID (yayındaki videoya hemen uygula)</span>
              <el-input v-model="videoId" size="small" placeholder="boş bırakılırsa sadece Drive'a yazılır" style="width:260px" />
            </div>
            <div v-if="tahminiVideoId" style="font-size:12px;color:#67c23a;margin-top:4px">
              uploaded.txt'ten bulundu: {{ tahminiVideoId }}
            </div>

            <div style="margin-top:16px">
              <el-button type="primary" :disabled="!hazir" :loading="busy" @click="yukle">
                Kapağı yükle ve uygula
              </el-button>
            </div>
          </div>

          <!-- SAĞ: önizleme + sonuç -->
          <div class="card">
            <h3 style="margin-top:0">Önizleme · {{ hedef.label }}</h3>
            <div style="background:#0d1117;border-radius:10px;padding:10px;display:flex;justify-content:center">
              <canvas ref="canvas" style="max-width:100%;max-height:420px;border-radius:6px"></canvas>
            </div>
            <div v-if="!imgEl" style="text-align:center;color:#8a8a8a;font-size:13px;padding:8px">
              Görsel seçilince burada canlı önizleme çıkar.
            </div>

            <div v-if="sonuc" style="margin-top:16px">
              <h3 style="margin:0 0 6px">Sonuç</h3>
              <div :class="['alert-strip', sonuc.durum === 'success' ? 'ok' : 'warn']">
                <el-icon><component :is="sonuc.durum === 'success' ? 'CircleCheckFilled' : 'WarningFilled'" /></el-icon>
                <span>
                  İş durumu: <b>{{ sonuc.durum }}</b>
                  <template v-if="sonuc.detay">
                    · {{ sonuc.detay.drive_ad }} · {{ sonuc.detay.boyut }}
                  </template>
                  <a :href="sonuc.url" target="_blank" style="margin-left:8px">log</a>
                </span>
              </div>
              <ul v-if="sonuc.detay && sonuc.detay.adimlar" style="font-size:12.5px;color:#b9b9b9;padding-left:18px">
                <li v-for="(a, i) in sonuc.detay.adimlar" :key="i">{{ a }}</li>
              </ul>
              <div v-if="sonuc.detay && sonuc.detay.hata" style="color:#f56c6c;font-size:12.5px">
                {{ sonuc.detay.hata }}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
