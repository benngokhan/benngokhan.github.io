/* ============================================================================
   Görünüm: Kapak Yükle (9:16 Shorts) — dikey kapak önizleme, otomatik eşleme,
   Drive'a yazma ve yayındaki Shorts videosuna tek tıkla uygulama.
   ========================================================================== */
(function () {
  'use strict';
  const { store, bytes } = window.BD;
  const VIEWS = window.VIEWS;

  const HEDEF = { w: 1080, h: 1920, label: '9:16 Dikey Shorts (1080×1920)' };

  function parseUploadedIds(text) {
    const out = {};
    String(text || '').split('\n').forEach((line) => {
      const m = line.match(/(video_\d+)\.mp4/i);
      const id = line.match(/(?:youtu\.be\/|shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/);
      if (m && id) out[m[1].toLowerCase() + '.mp4'] = id[1];
    });
    return out;
  }

  VIEWS.kapak = {
    name: 'KapakView',
    data() {
      return {
        s: store,
        no: '',
        kaynakTipi: 'drive', // 'drive' | 'yerel'
        fileName: '',
        driveFileId: '',
        driveThumbHata: false,
        imgEl: null,
        imgW: 0,
        imgH: 0,
        mode: 'cover',
        zoom: 1,
        offsetY: 0,
        videoId: '',
        temizle: true,
        busy: false,
        runId: null,
        sonuc: null,
        pollTimer: null
      };
    },
    computed: {
      kuyruk() {
        return (this.s.telemetryQueue() || [])
          .filter((x) => x.type !== 'long')
          .slice()
          .sort((a, b) => {
            if (a.is_ready !== b.is_ready) return a.is_ready ? -1 : 1;
            return Number(a.number) - Number(b.number);
          });
      },
      yayinIdleri() {
        return parseUploadedIds(this.s.files && this.s.files.uploaded);
      },
      driveKapaklar() {
        const inv = this.s.inventory ? this.s.inventory() : {};
        const liste = inv.shorts_covers || [];
        return liste.slice().sort((a, b) => {
          const na = Number((a.name.match(/(\d+)/) || [])[1] || 0);
          const nb = Number((b.name.match(/(\d+)/) || [])[1] || 0);
          return na - nb;
        });
      },
      secilen() {
        return this.kuyruk.find((x) => String(x.number) === String(this.no)) || null;
      },
      secilenDriveKapak() {
        return this.driveKapaklar.find((x) => x.id === this.driveFileId) || null;
      },
      driveThumbUrl() {
        if (!this.driveFileId) return '';
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(this.driveFileId)}&sz=w720`;
      },
      hedef() {
        return HEDEF;
      },
      tahminiVideoId() {
        if (!this.secilen) return '';
        const fromQueue = (this.secilen.youtube_url || '').match(/(?:youtu\.be\/|shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/);
        if (fromQueue) return fromQueue[1];
        return this.yayinIdleri[String(this.secilen.file_name || '').toLowerCase()] || '';
      },
      hazir() {
        return Boolean(this.no) && Boolean(this.driveFileId || this.imgEl) && !this.busy;
      }
    },
    watch: {
      no(yeniNo) {
        this.otomatikEsle(yeniNo);
        this.$nextTick(() => this.ciz());
      },
      driveFileId(id) {
        this.driveThumbHata = false;
        const f = this.driveKapaklar.find((x) => x.id === id);
        if (f) {
          this.fileName = f.name;
          this.kaynakTipi = 'drive';
          this.imgEl = null;
        }
      },
      mode() { this.ciz(); },
      zoom() { this.ciz(); },
      offsetY() { this.ciz(); }
    },
    methods: {
      bytes,
      openLink(u) { if (u) window.open(u, '_blank', 'noopener'); },
      dosyaAdiFor() {
        return `kapak_${this.no}.jpg`;
      },
      otomatikEsle(numara) {
        this.videoId = this.tahminiVideoId || '';
        if (!numara) return;
        const nStr = String(numara).trim();
        // video_N seçilince Drive'daki kapak_N.jpg / .png dosyasını otomatik seç
        const eslesen = this.driveKapaklar.find((f) => {
          const ad = String(f.name || '').toLowerCase();
          return ad === `kapak_${nStr}.jpg` || ad === `kapak_${nStr}.jpeg` || ad === `kapak_${nStr}.png` || ad === `short_kapak_${nStr}.jpg`;
        });
        if (eslesen) {
          this.driveFileId = eslesen.id;
          this.fileName = eslesen.name;
          this.kaynakTipi = 'drive';
          this.imgEl = null;
        } else if (this.secilen && this.secilen.drive_cover_id) {
          this.driveFileId = this.secilen.drive_cover_id;
          this.fileName = this.secilen.expected_cover || `kapak_${nStr}.jpg`;
          this.kaynakTipi = 'drive';
          this.imgEl = null;
        } else {
          this.driveFileId = '';
          if (this.kaynakTipi === 'drive') this.fileName = '';
        }
      },
      yerelTetikle() {
        if (this.$refs.fileInput) this.$refs.fileInput.click();
      },
      dosyaSec(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          this.s.notify('error', 'Lütfen JPG, PNG veya WebP görseli seçin.');
          return;
        }
        this.kaynakTipi = 'yerel';
        this.driveFileId = '';
        this.fileName = file.name;
        const mNum = file.name.match(/(\d+)/);
        if (!this.no && mNum) this.no = mNum[1];

        const img = new Image();
        const reader = new FileReader();
        reader.onload = () => {
          img.onload = () => {
            this.imgEl = img;
            this.imgW = img.naturalWidth;
            this.imgH = img.naturalHeight;
            this.zoom = 1;
            this.offsetY = 0;
            this.$nextTick(() => this.ciz());
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      },
      ciz() {
        const cv = this.$refs.canvas;
        if (!cv || !this.imgEl) return;
        const { w, h } = this.hedef;
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#07090d';
        ctx.fillRect(0, 0, w, h);
        const img = this.imgEl;

        if (this.mode === 'contain') {
          const k = Math.min(w / img.width, h / img.height) * this.zoom;
          const dw = img.width * k;
          const dh = img.height * k;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 + this.offsetY * h, dw, dh);
          return;
        }
        const k = Math.max(w / img.width, h / img.height) * this.zoom;
        const dw = img.width * k;
        const dh = img.height * k;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 + this.offsetY * h, dw, dh);
      },
      oranUyari() {
        if (!this.imgEl) return '';
        const r = this.imgW / this.imgH;
        const ideal = 9 / 16;
        if (Math.abs(r - ideal) < 0.03) return '';
        return `Seçilen görsel oranı ${r.toFixed(2)} — 9:16 dikey Shorts oranına (${ideal.toFixed(2)}) otomatik kırpılıyor.`;
      },
      async yukle() {
        if (!this.hazir) return;
        this.busy = true;
        this.sonuc = null;
        try {
          let path = '';
          if (!this.driveFileId && this.imgEl) {
            const cv = this.$refs.canvas;
            const b64 = cv.toDataURL('image/jpeg', 0.92).split(',')[1];
            path = `kapak_gelen/${this.dosyaAdiFor()}`;
            await this.s.commitBinary(
              path,
              b64,
              `chore: panelden 9:16 Shorts kapagi eklendi (${this.dosyaAdiFor()}) [skip ci]`
            );
          }

          const body = {
            ref: 'main',
            inputs: {
              tip: 'short',
              numara: String(this.no),
              dosya: path,
              drive_file_id: this.driveFileId || '',
              video_id: (this.videoId || '').trim(),
              temizle: this.temizle ? 'true' : 'false'
            }
          };
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/kapak-ekle.yml/dispatches`, { method: 'POST', body });
          this.s.notify('success', `${this.dosyaAdiFor()} işleme alındı — 15-40 sn içinde Drive ve YouTube güncellenir.`);
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
                if (txt) { try { this.sonuc.detay = JSON.parse(txt); } catch (e) { /* sessiz */ } }
                this.s.notify(r.conclusion === 'success' ? 'success' : 'error', 'Kapak işlemi tamamlandı: ' + r.conclusion);
                if (this.s.loadTelemetry) this.s.loadTelemetry(true);
              }
            } catch (e) { /* sessiz */ }
          }, 8000);
        } catch (e) { /* sessiz */ }
      }
    },
    mounted() {
      if (!this.s.files || !this.s.files.uploaded) {
        if (this.s.loadFiles) this.s.loadFiles();
      }
      // İlk hazır Shorts videosunu varsayılan seç ki dikey önizleme hemen dolu gelsin
      const ilkHazir = this.kuyruk.find((x) => x.is_ready) || this.kuyruk[0];
      if (ilkHazir && !this.no) {
        this.no = String(ilkHazir.number);
      }
    },
    beforeUnmount() {
      if (this.pollTimer) clearInterval(this.pollTimer);
    },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Kapak Yükle · 9:16 Shorts</h2>
            <p>Kuyruktan Shorts videosunu seçtiğinde eşleşen <code>kapak_N.jpg</code> otomatik yüklenir; dilersen cihazdan yeni dikey kapak yükleyip kırpabilirsin.</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="s.loadTelemetry()">Drive listesini yenile</el-button>
          </div>
        </div>

        <div class="alert-strip ok" style="margin-bottom:14px">
          <el-icon><CircleCheckFilled /></el-icon>
          <span>Yalnızca <b>9:16 dikey Shorts (1080×1920)</b> kapakları aktif. Video seçildiğinde Drive'daki <code>kapak_N.jpg</code> otomatik eşleşir.</span>
        </div>

        <div class="grid c2" style="gap:16px;align-items:start">
          <!-- SOL: video & kapak seçimi -->
          <div class="card">
            <div class="card-body">
              <h3 style="margin:0 0 12px">1 · Shorts Videosu ve Kapak Kaynağı</h3>

              <div style="font-size:12px;color:#606266;margin-bottom:5px;font-weight:600">Kuyruktan Shorts Seç</div>
              <el-select v-model="no" filterable clearable placeholder="video_176.mp4 … video_196.mp4" style="width:100%;margin-bottom:12px">
                <el-option v-for="x in kuyruk" :key="x.number"
                  :label="x.file_name + ' — ' + (x.title || '').slice(0, 42)"
                  :value="String(x.number)">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                    <span><b>{{ x.file_name }}</b> <span style="color:#909399;font-size:12px">{{ (x.title || '').slice(0, 34) }}</span></span>
                    <el-tag size="small" :type="x.has_drive_cover ? 'success' : 'warning'" effect="plain">
                      {{ x.has_drive_cover ? ('kapak_' + x.number + ' hazır') : 'kapak eksik' }}
                    </el-tag>
                  </div>
                </el-option>
              </el-select>

              <div class="kv" style="margin-bottom:12px">
                <span class="k">veya doğrudan video numarası</span>
                <el-input v-model="no" size="small" placeholder="ör. 176" style="width:130px" clearable />
              </div>

              <div style="font-size:12px;color:#606266;margin-bottom:5px;font-weight:600">
                Drive'daki Hazır Kapaklar ({{ driveKapaklar.length }} adet)
              </div>
              <el-select v-model="driveFileId" filterable clearable placeholder="Drive'dan kapak_N.jpg seç" style="width:100%;margin-bottom:10px">
                <el-option v-for="f in driveKapaklar" :key="f.id" :label="f.name" :value="f.id">
                  <span>{{ f.name }}</span>
                  <span style="float:right;color:#909399;font-size:12px">{{ bytes(f.size) }}</span>
                </el-option>
              </el-select>

              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 14px">
                <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="dosyaSec" />
                <el-button size="small" icon="Upload" @click="yerelTetikle">Cihazdan Yeni Görsel Seç (JPG/PNG)</el-button>
                <span v-if="fileName" style="font-size:12px;color:#67c23a;font-weight:600">
                  ✓ Seçili: {{ fileName }} ({{ kaynakTipi === 'drive' ? 'Drive' : 'Cihaz' }})
                </span>
              </div>

              <div v-if="imgEl" style="background:#f8fafc;border:1px solid #ebeef5;border-radius:6px;padding:10px 12px;margin-bottom:14px">
                <div class="kv" style="font-size:12.5px">
                  <span>Yerleşim modu</span>
                  <el-radio-group v-model="mode" size="small" @change="ciz">
                    <el-radio-button label="cover">9:16 Doldur</el-radio-button>
                    <el-radio-button label="contain">Sığdır</el-radio-button>
                  </el-radio-group>
                </div>
                <div class="kv" style="font-size:12.5px">
                  <span>Yakınlaştır</span>
                  <el-slider v-model="zoom" :min="1" :max="2.2" :step="0.02" style="width:180px" />
                </div>
                <div class="kv" style="font-size:12.5px">
                  <span>Dikey hizalama</span>
                  <el-slider v-model="offsetY" :min="-0.45" :max="0.45" :step="0.01" style="width:180px" />
                </div>
                <div v-if="oranUyari()" style="font-size:12px;color:#e6a23c;margin-top:6px">{{ oranUyari() }}</div>
              </div>

              <h3 style="margin:16px 0 8px">2 · Hedef ve Uygulama</h3>
              <div class="kv">
                <span class="k">Drive hedef dosya adı</span>
                <span class="v mono-sm">{{ no ? dosyaAdiFor() : '—' }}</span>
              </div>
              <div class="kv" v-if="secilen">
                <span class="k">Video başlığı</span>
                <span class="v" style="max-width:65%">{{ secilen.title || '—' }}</span>
              </div>

              <el-checkbox v-model="temizle" style="display:block;margin:10px 0">
                Aynı numaralı eski/mükerrer kapak kopyalarını temizle
              </el-checkbox>

              <div class="kv" style="align-items:center">
                <span class="k">YouTube Video ID <small>(yayındaysa anında uygular)</small></span>
                <el-input v-model="videoId" size="small" placeholder="Kuyruktaki video için boş bırakın" style="width:230px" clearable />
              </div>
              <div v-if="tahminiVideoId" style="font-size:12px;color:#67c23a;margin-top:4px">
                Yayındaki video otomatik algılandı: <code>{{ tahminiVideoId }}</code>
              </div>

              <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <el-button type="primary" icon="Check" :disabled="!hazir" :loading="busy" @click="yukle">
                  {{ videoId ? 'Drive + YouTube Kapağını Güncelle' : '9:16 Kapağı Drive Kuyruğuna Kaydet' }}
                </el-button>
                <el-button v-if="driveFileId" size="small" plain
                  @click="openLink('https://drive.google.com/file/d/' + driveFileId + '/view')">
                  Drive'da Aç
                </el-button>
              </div>
            </div>
          </div>

          <!-- SAĞ: gerçek 9:16 DİKEY telefon önizleme çerçevesi -->
          <div class="card">
            <div class="card-body" style="display:flex;flex-direction:column;align-items:center">
              <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="margin:0">Dikey Önizleme · 9:16</h3>
                <el-tag size="small" type="info" effect="plain">1080 × 1920 px</el-tag>
              </div>

              <!-- Dikey 9:16 Shorts Çerçevesi (asla yatay olmaz) -->
              <div style="width:262px;aspect-ratio:9/16;background:#090d14;border:3px solid #263445;border-radius:18px;
                          overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;
                          box-shadow:0 12px 32px rgba(0,0,0,.22)">
                <!-- Yerel görsel kırpma önizlemesi -->
                <canvas v-show="Boolean(imgEl)" ref="canvas" style="width:100%;height:100%;object-fit:cover;display:block"></canvas>

                <!-- Drive'daki hazır kapak önizlemesi -->
                <img v-if="!imgEl && driveFileId && !driveThumbHata"
                     :src="driveThumbUrl"
                     :alt="fileName"
                     @error="driveThumbHata = true"
                     style="width:100%;height:100%;object-fit:cover;display:block" />

                <!-- Oturum çerezi nedeniyle Drive küçük resmi engellenirse şık dikey bilgi kartı -->
                <div v-if="!imgEl && driveFileId && driveThumbHata"
                     style="padding:22px 18px;text-align:center;color:#e5eaf3;display:flex;flex-direction:column;align-items:center;gap:10px">
                  <div style="border:1.5px solid #4fe3d0;color:#4fe3d0;border-radius:999px;padding:3px 12px;font-size:11px;letter-spacing:1.5px;font-weight:700">
                    BİLGİ DOZU · 9:16
                  </div>
                  <div style="font-size:16px;font-weight:800;color:#ffd633;margin-top:6px">{{ fileName }}</div>
                  <div style="font-size:12px;color:#a3b3c6;line-height:1.5">
                    Drive'da eşleşen dikey Shorts kapağı hazır ({{ secilenDriveKapak ? bytes(secilenDriveKapak.size) : '' }}).
                  </div>
                  <el-button size="small" type="primary" plain
                    @click="openLink('https://drive.google.com/file/d/' + driveFileId + '/view')">
                    Görseli Tam Boyut Aç
                  </el-button>
                </div>

                <!-- Henüz seçim yapılmadıysa -->
                <div v-if="!imgEl && !driveFileId"
                     style="padding:24px 18px;text-align:center;color:#8fa3b8;font-size:12.5px;line-height:1.6">
                  Soldan bir <b>Shorts videosu</b> seçin veya cihazdan <b>9:16 dikey kapak</b> yükleyin.
                </div>
              </div>

              <div v-if="secilen" style="margin-top:12px;text-align:center;font-size:12px;color:#606266">
                <b>{{ secilen.file_name }}</b> · {{ secilen.has_drive_cover ? ('Eşleşen kapak: ' + (fileName || ('kapak_' + no + '.jpg'))) : 'Henüz Drive kapağı yok' }}
              </div>

              <div v-if="sonuc" style="width:100%;margin-top:16px">
                <div :class="['alert-strip', sonuc.durum === 'success' ? 'ok' : 'warn']">
                  <el-icon><component :is="sonuc.durum === 'success' ? 'CircleCheckFilled' : 'WarningFilled'" /></el-icon>
                  <span>
                    Sonuç: <b>{{ sonuc.durum === 'success' ? 'Başarılı' : sonuc.durum }}</b>
                    <template v-if="sonuc.detay"> · {{ sonuc.detay.drive_ad }} · {{ sonuc.detay.boyut }}</template>
                    <a :href="sonuc.url" target="_blank" style="margin-left:8px">işlem kaydı</a>
                  </span>
                </div>
                <div v-if="sonuc.detay && sonuc.detay.hata" style="color:#f56c6c;font-size:12.5px;margin-top:4px">
                  {{ sonuc.detay.hata }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
