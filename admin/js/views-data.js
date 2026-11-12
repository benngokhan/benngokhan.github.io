/* ============================================================================
   Görünümler: Video Kuyruğu · Excel Tablo · Drive Envanteri · İşçiler · Onarım
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime, trClock, ago, dur, bytes, runDuration } = window.BD;
  const VIEWS = window.VIEWS;
  const ui = window.BD.ui;

  const coverNameFor = (item) => item.expected_cover || (item.type === 'long' ? `uzun_kapak_${item.number}.png` : `kapak_${item.number}.jpg`);

  /* ============================ VİDEO KUYRUĞU ========================== */
  VIEWS.queue = {
    name: 'QueueView',
    data() {
      return {
        s: store,
        typeFilter: 'all',
        readyOnly: false,
        search: '',
        showDesc: false,
        selected: null
      };
    },
    computed: {
      all() { return this.s.telemetryQueue().filter((x) => x.type !== 'long'); },
      forceLock() { return (this.s.files.force || '').trim(); },
      stats() {
        const q = this.all;
        return {
          total: q.length,
          ready: q.filter((x) => x.is_ready).length,
          published: q.filter((x) => x.is_published).length,
          noCover: q.filter((x) => x.is_ready && !x.has_drive_cover).length,
          shorts: q.length
        };
      },
      filtered() {
        return this.all.filter((x) => {
          if (this.readyOnly && !x.is_ready) return false;
          if (this.search) {
            const q = this.search.toLowerCase();
            return (x.file_name + ' ' + (x.title || '')).toLowerCase().includes(q);
          }
          return true;
        });
      }
    },
    methods: {
      coverNameFor,
      async lock(item) {
        try {
          await ElementPlus.ElMessageBox.confirm(
            `${item.file_name} bir sonraki çalıştırmada sıranın başına alınacak (force_next_video.txt). Onaylıyor musun?`,
            'Sıradaki videoyu kilitle',
            { confirmButtonText: 'Kilitle', cancelButtonText: 'Vazgeç', type: 'warning' }
          );
          await this.s.writeForceNext(item.file_name);
        } catch (e) { if (e !== 'cancel') this.s.notify('error', e.message || String(e)); }
      },
      async clearLock() {
        try {
          await this.s.writeForceNext('');
        } catch (e) { this.s.notify('error', e.message || String(e)); }
      },
      async refreshTelemetry() {
        try {
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/panel-telemetry.yml/dispatches`, {
            method: 'POST', body: { ref: this.s.branch, inputs: { push_table_to_drive: 'false' } }
          });
          this.s.notify('success', 'Kuyruk telemetrisi yeniden hesaplanıyor (panel-telemetri tetiklendi).');
          setTimeout(() => this.s.loadRuns(), 4000);
        } catch (e) { this.s.notify('error', e.message); }
      },
      copy(text) {
        navigator.clipboard.writeText(text).then(() => this.s.notify('success', 'Kopyalandı: ' + text)).catch(() => {});
      },
      async publishNow(item) {
        try {
          await ElementPlus.ElMessageBox.confirm(
            `${item.file_name} için yükleme tetiklenecek. Sıra kilidi otomatik uygulanır. Devam?`,
            'Hemen yayınla',
            { confirmButtonText: 'Yayınla', cancelButtonText: 'Vazgeç', type: 'warning' }
          );
          await this.s.writeForceNext(item.file_name);
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/youtube-drive-uploader.yml/dispatches`, {
            method: 'POST',
            body: { ref: this.s.branch, inputs: { dry_run: 'false', video_type: item.type === 'long' ? 'long' : 'short', force_file: item.file_name } }
          });
          this.s.notify('success', item.file_name + ' yüklemesi tetiklendi.');
          setTimeout(() => this.s.loadRuns(), 4000);
        } catch (e) { if (e !== 'cancel') this.s.notify('error', e.message || String(e)); }
      },
      showRow(row) { this.selected = row; this.showDesc = true; }
    },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Video Kuyruğu</h2>
            <p>Drive tablosundan canlı okunan yayın kuyruğu · {{ all.length }} satır · telemetri {{ s.telemetry ? s.telemetry.generated_at : '—' }}</p>
          </div>
          <div class="head-actions">
            <el-input v-model="search" size="small" placeholder="Dosya veya başlık ara" clearable prefix-icon="Search" style="width:210px" />
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="s.loadTelemetry()">Yenile</el-button>
            <el-button size="small" type="primary" plain icon="Sort" @click="refreshTelemetry">Kuyruğu yeniden hesapla</el-button>
          </div>
        </div>

        <div v-if="forceLock" class="alert-strip warn">
          <el-icon><Lock /></el-icon>
          <span>Sıradaki yayın için seçili dosya: <b>{{ forceLock }}</b></span>
          <span class="spacer"></span>
          <el-button size="small" type="warning" plain @click="clearLock">Normal sıraya dön</el-button>
        </div>

        <div class="grid c4" style="margin-bottom:14px">
          <div class="stat blue"><div class="bar"></div><div class="k">Hazır Shorts</div><div class="v">{{ stats.ready }}</div>
            <div class="d">her gün 19:30 TR yayına hazır</div></div>
          <div class="stat green"><div class="bar"></div><div class="k">Yayınlandı</div><div class="v">{{ stats.published }}</div>
            <div class="d">aktif seride toplam {{ stats.total }} kayıt</div></div>
          <div class="stat orange"><div class="bar"></div><div class="k">Kapaksız Hazır Video</div><div class="v">{{ stats.noCover }}</div>
            <div class="d">{{ stats.noCover ? 'Kapak Yükle ekranından tamamla' : 'tüm hazır kapaklar tam' }}</div></div>
          <div class="stat grey"><div class="bar"></div><div class="k">Sıradaki Yayın</div>
            <div class="v" style="font-size:17px">{{ (s.telemetry && s.telemetry.queue_summary && s.telemetry.queue_summary.next_short) || '—' }}</div>
            <div class="d">19:30 TR otomatik Shorts</div></div>
        </div>

        <div class="card">
          <div class="card-head">
            <el-switch v-model="readyOnly" size="small" active-text="Yalnızca hazır bekleyenleri göster" />
            <span class="sub" style="margin-left:auto">{{ filtered.length }} Shorts kaydı</span>
          </div>
          <div class="card-body tight">
            <el-table :data="filtered" size="small" style="width:100%" height="520" v-loading="s.telemetryBusy">
              <el-table-column label="Satır" width="62" prop="row" />
              <el-table-column label="Dosya" width="150">
                <template #default="{ row }">
                  <b class="mono-sm">{{ row.file_name }}</b>
                  <el-tag size="small" :type="row.type === 'long' ? 'danger' : 'primary'" effect="plain" style="margin-left:4px">
                    {{ row.type === 'long' ? 'UZUN' : 'SHORT' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Durum" width="112">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.is_published ? 'success' : (row.is_ready ? 'warning' : 'info')" effect="light">
                    {{ row.is_published ? 'YÜKLENDİ' : row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Video" width="86">
                <template #default="{ row }">
                  <span class="tag-status"><span class="dot" :class="row.has_drive_video ? 'success' : 'failure'"></span>{{ row.has_drive_video ? 'var' : 'yok' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Kapak" width="120">
                <template #default="{ row }">
                  <el-tooltip :content="coverNameFor(row)" placement="top">
                    <span class="tag-status"><span class="dot" :class="row.has_drive_cover ? 'success' : 'failure'"></span>
                      {{ row.has_drive_cover ? coverNameFor(row) : 'eksik' }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="Başlık" min-width="300">
                <template #default="{ row }">
                  <div class="queue-title" :title="row.title">{{ row.title }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Boyut" width="86">
                <template #default="{ row }"><span class="mono-sm">{{ row.drive_video_size_mb ? row.drive_video_size_mb + ' MB' : '—' }}</span></template>
              </el-table-column>
              <el-table-column label="İşlem" width="188" fixed="right">
                <template #default="{ row }">
                  <el-button link size="small" type="primary" @click="showRow(row)">Detay</el-button>
                  <el-button link size="small" @click="goTo('kapak')">Kapak</el-button>
                  <el-button v-if="row.is_ready && !row.is_published" link size="small" type="danger" @click="publishNow(row)">Yayınla</el-button>
                  <el-button v-if="row.is_published && row.youtube_url" link size="small" @click="openLink(row.youtube_url)">İzle</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <el-drawer v-model="showDesc" size="46%" :title="selected ? selected.file_name : ''" v-if="selected">
          <div class="card">
            <div class="card-head"><h3><el-icon><Document /></el-icon> Kayıt detayı</h3>
              <div class="head-actions"><el-button size="small" @click="copy(selected.title)">Başlığı kopyala</el-button></div>
            </div>
            <div class="card-body">
              <div class="kv"><span class="k">Dosya</span><span class="v mono-sm">{{ selected.file_name }}</span></div>
              <div class="kv"><span class="k">Tür / sıra</span><span class="v">{{ selected.type === 'long' ? 'Uzun video' : 'Shorts' }} · {{ selected.number }}</span></div>
              <div class="kv"><span class="k">Durum</span><span class="v">{{ selected.status }} · hazır: {{ selected.is_ready ? 'evet' : 'hayır' }}</span></div>
              <div class="kv"><span class="k">Kategori</span><span class="v">{{ selected.category_name || '—' }}</span></div>
              <div class="kv"><span class="k">Kapak</span><span class="v">{{ selected.has_drive_cover ? coverNameFor(selected) : 'eksik (kapaksız yayınlanır)' }}</span></div>
              <div class="kv"><span class="k">Video boyutu</span><span class="v">{{ selected.drive_video_size_mb ? selected.drive_video_size_mb + ' MB' : '—' }}</span></div>
              <div class="kv"><span class="k">Etiketler</span><span class="v">{{ selected.tags || '—' }}</span></div>
              <div class="kv" v-if="selected.youtube_url"><span class="k">YouTube</span>
                <span class="v"><span class="link-btn" @click="openLink(selected.youtube_url)">{{ selected.youtube_url }}</span></span></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><EditPen /></el-icon> Başlık</h3></div>
            <div class="card-body"><div style="font-size:13px;line-height:1.5">{{ selected.title }}</div></div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><Tickets /></el-icon> Açıklama</h3></div>
            <div class="card-body"><pre style="white-space:pre-wrap;font-size:12px;line-height:1.55;margin:0;max-height:340px;overflow:auto">{{ selected.description }}</pre></div>
          </div>
        </el-drawer>
      </div>
    `
  };

  /* ============================== EXCEL TABLO =========================== */
  VIEWS.excel = {
    name: 'ExcelView',
    data() {
      return {
        s: store,
        editMode: false,
        page: 1,
        pageSize: 50,
        search: '',
        saving: false
      };
    },
    computed: {
      wb() { return this.s.wb; },
      rowsRaw() { return (this.wb.sheets && this.wb.sheets[this.wb.active]) || []; },
      headers() {
        const h = this.rowsRaw[0] || [];
        let last = h.length - 1;
        while (last > 0 && (h[last] === '' || h[last] === undefined || h[last] === null)) last--;
        return h.slice(0, last + 1);
      },
      bodyRows() {
        const out = [];
        for (let i = 1; i < this.rowsRaw.length; i++) {
          const cells = this.rowsRaw[i] || [];
          if (!cells.length) continue;
          if (this.search) {
            const q = this.search.toLowerCase();
            const joined = cells.join(' ').toLowerCase();
            if (!joined.includes(q)) continue;
          }
          out.push({ idx: i, cells, no: i });
        }
        return out;
      },
      paged() {
        const start = (this.page - 1) * this.pageSize;
        return this.bodyRows.slice(start, start + this.pageSize);
      },
      totalRows() { return this.bodyRows.length; }
    },
    watch: {
      'wb.active'() { this.page = 1; }
    },
    methods: {
      bytes,
      setCell(row, ci, value) {
        this.s.setCell(this.wb.active, row.idx, ci, value);
      },
      addRow() {
        const key = this.wb.active;
        const arr = this.wb.sheets[key];
        arr.push(new Array(this.headers.length).fill(''));
        this.wb.dirty = true;
        this.page = Math.ceil((this.totalRows + 1) / this.pageSize);
        this.s.notify('info', 'Boş satır eklendi (kaydetmeyi unutmayın).');
      },
      async save(push) {
        this.saving = true;
        try { await this.s.saveWorkbook(push); } finally { this.saving = false; }
      },
      exportCsv() {
        const rows = this.rowsRaw;
        const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows));
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.wb.active}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      async uploadFile(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheets = {};
        workbook.SheetNames.forEach((name) => {
          sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '' });
        });
        this.s.wb.sheets = sheets;
        this.s.wb.names = workbook.SheetNames;
        this.s.wb.active = workbook.SheetNames.includes('DRIVE') ? 'DRIVE' : workbook.SheetNames[0];
        this.s.wb.dirty = true;
        this.s.notify('success', 'Yerel Excel yüklendi — Drive’a yazmak için "Kaydet + Drive" kullanın.');
        ev.target.value = '';
      }
    },
    mounted() {
      if (!this.wb.loaded) this.s.loadWorkbook().catch(() => {});
    },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Ana Tablo · baslik.xlsx</h2>
            <p>baslik.xlsx · {{ wb.loaded ? (wb.names.length + ' sayfa · ' + (wb.meta.commit ? 'son commit ' + ago(wb.meta.commit.author.date) + ' · ' + (wb.meta.commit.author.name || '') : '')) : 'yükleniyor…' }}</p>
          </div>
          <div class="head-actions">
            <el-switch v-model="editMode" size="small" active-text="Düzenleme modu" :disabled="!wb.loaded" />
            <el-button size="small" icon="Refresh" :loading="wb.busy" @click="s.loadWorkbook(true)">Yeniden yükle</el-button>
            <el-button size="small" plain icon="Download" :disabled="!wb.loaded" @click="exportCsv">CSV</el-button>
            <el-button size="small" type="warning" plain icon="Upload" :loading="saving" :disabled="!wb.dirty" @click="save(false)">GitHub'a kaydet</el-button>
            <el-button size="small" type="primary" icon="Promotion" :loading="saving" :disabled="!wb.dirty" @click="save(true)">Kaydet + Drive'a yaz</el-button>
          </div>
        </div>

        <div v-if="!wb.loaded" class="card"><div class="card-body"><el-skeleton :rows="6" animated /></div></div>

        <template v-else>
          <div class="alert-strip" :class="wb.dirty ? 'warn' : 'info'">
            <el-icon><component :is="wb.dirty ? 'WarningFilled' : 'InfoFilled'" /></el-icon>
            <span v-if="wb.dirty">Kaydedilmemiş değişiklikler var. "Kaydet + Drive'a yaz" GitHub'a commit atar ve Google Drive <b>YOUTUBE_OTOMASYON / CEO</b> klasöründeki ana tabloyu günceller. Not: ilk kayıtta orijinal dosya <b>admin_backups/</b> altına yedeklenir; tarayıcı tabanlı yazma hücre stillerini sadeleştirebilir.</span>
            <span v-else>Tablo canlı depodan yüklendi ({{ (wb.meta.size/1024).toFixed(0) }} KB). Düzenleme modunu açarak hücreleri değiştirebilirsin. <b>Not:</b> 30 dakikalık senkron tabloyu Drive'daki ana kopyadan yeniler; kalıcı düzenleme için <b>Kaydet + Drive'a yaz</b> kullan.</span>
          </div>

          <div class="card">
            <div class="card-head">
              <el-tabs v-model="wb.active" style="width:100%" @tab-change="page = 1">
                <el-tab-pane v-for="n in wb.names" :key="n" :label="n + ' · ' + ((wb.sheets[n] || []).length - 1) + ' satır'" :name="n" />
              </el-tabs>
            </div>
            <div class="card-head" style="border-top:0">
              <el-input v-model="search" size="small" placeholder="Sayfada ara" clearable prefix-icon="Search" style="width:240px" />
              <el-tag size="small" effect="plain" type="info">{{ headers.length }} kolon · {{ totalRows }} satır</el-tag>
              <div class="head-actions">
                <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="uploadFile" />
                <el-button size="small" icon="FolderAdd" @click="$refs.fileInput.click()">Yerel dosya yükle</el-button>
                <el-button size="small" icon="Plus" @click="addRow" :disabled="!editMode">Satır ekle</el-button>
              </div>
            </div>
            <div class="card-body tight">
              <el-table :data="paged" size="small" border height="520" style="width:100%">
                <el-table-column label="#" width="58" fixed>
                  <template #default="{ row }"><span class="mono-sm">{{ row.no }}</span></template>
                </el-table-column>
                <el-table-column v-for="(h, ci) in headers" :key="ci" :min-width="ci === 2 ? 260 : 140">
                  <template #header>
                    <span style="font-size:11.5px">{{ h || ('Kol ' + (ci + 1)) }}</span>
                  </template>
                  <template #default="{ row }">
                    <el-input v-if="editMode" :model-value="row.cells[ci]" size="small"
                              @change="(v) => setCell(row, ci, v)" />
                    <div v-else class="queue-title" :title="row.cells[ci]" style="max-width:100%">{{ row.cells[ci] }}</div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div class="card-body flex" style="justify-content:space-between">
              <span class="muted">Sayfa başına {{ pageSize }} satır · düzenlemeler yalnızca kaydedince kalıcı olur</span>
              <el-pagination layout="prev, pager, next" :page-size="pageSize" :total="totalRows" v-model:current-page="page" background small />
            </div>
          </div>
        </template>
      </div>
    `
  };

  /* ============================ DRİVE ENVANTERİ ======================== */
  VIEWS.drive = {
    name: 'DriveView',
    data() { return { s: store, tab: 'shorts_videos', search: '' }; },
    computed: {
      t() { return this.s.telemetry || {}; },
      inv() { return (this.t.drive_inventory) || {}; },
      folders() { return this.t.folders || {}; },
      groups() {
        return [
          { key: 'shorts_videos', title: 'Shorts Videoları', icon: 'VideoCamera', folder: this.folders.shorts_video, color: 'blue' },
          { key: 'shorts_covers', title: '9:16 Kapaklar', icon: 'Picture', folder: this.folders.shorts_cover, color: 'green' },
          { key: 'ceo_files', title: 'Ana Klasör (baslik.xlsx)', icon: 'FolderOpened', folder: this.folders.ceo, color: 'grey' }
        ];
      },
      current() {
        const list = this.inv[this.tab] || [];
        if (!this.search) return list;
        const q = this.search.toLowerCase();
        return list.filter((f) => f.name.toLowerCase().includes(q));
      },
      coverMatrix() {
        const covers = (this.inv.shorts_covers || []).map((f) => f.name.toLowerCase());
        const longCovers = (this.inv.long_covers || []).map((f) => f.name.toLowerCase());
        // Uzantıdan bağımsız TAM ad eşleşmesi (kapak_164.jpeg de geçerli).
        // Gevşek "includes(num)" kontrolü 155 ile 1555'i karıştırıyordu.
        const check = (name, list, isLong) => {
          const num = (name.match(/(\d+)/) || [])[1];
          if (!num) return false;
          const stems = isLong ? ['uzun_kapak_' + num, 'kapak_uzun_' + num] : ['kapak_' + num, 'short_kapak_' + num];
          const exts = isLong ? ['png', 'jpg', 'jpeg'] : ['jpg', 'png', 'jpeg'];
          return stems.some((st) => exts.some((e) => list.includes((st + '.' + e).toLowerCase())));
        };
        return (this.inv.shorts_videos || []).map((v) => ({
          name: v.name, type: 'short', num: (v.name.match(/(\d+)/) || [])[1], hasCover: check(v.name, covers, false), size: v.size
        })).concat(
          (this.inv.long_videos || []).map((v) => ({
            name: v.name, type: 'long', num: (v.name.match(/(\d+)/) || [])[1], hasCover: check(v.name, longCovers, true), size: v.size
          }))
        ).filter((x) => x.num).sort((a, b) => Number(a.num) - Number(b.num));
      },
      missingCovers() { return this.coverMatrix.filter((x) => !x.hasCover); }
    },
    methods: {
      bytes, ago, trTime,
      folderLink(id) { return 'https://drive.google.com/drive/folders/' + id; },
      fileLink(f) {
        if (f.mimeType && f.mimeType.indexOf('folder') >= 0) return 'https://drive.google.com/drive/folders/' + f.id;
        return 'https://drive.google.com/file/d/' + f.id + '/view';
      },
      refresh() {
        this.s.loadTelemetry();
        this.s.notify('info', 'Drive envanteri telemetriden okunuyor.');
      }
    },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Drive Envanteri</h2>
            <p>YOUTUBE_OTOMASYON klasör ağacı · telemetri {{ t.generated_at || '—' }}</p>
          </div>
          <div class="head-actions">
            <el-input v-model="search" size="small" clearable prefix-icon="Search" placeholder="Dosya ara" style="width:200px" />
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="refresh">Yenile</el-button>
            <el-button size="small" plain icon="FolderOpened" @click="openLink(folderLink(folders.youtube_otomasyon))">Kök klasör</el-button>
          </div>
        </div>

        <div class="grid c3" style="margin-bottom:14px">
          <div class="stat blue" v-for="g in groups" :key="g.key" :class="g.color">
            <div class="bar"></div>
            <div class="k"><el-icon><component :is="g.icon" /></el-icon> {{ g.title }}</div>
            <div class="v">{{ (inv[g.key] || []).length }}</div>
            <div class="d"><span class="link-btn" @click="openLink(folderLink(g.folder))">klasörü aç</span>
              · {{ (inv[g.key] || []).length ? bytes((inv[g.key] || []).reduce((a, x) => a + (x.size || 0), 0)) : '—' }}</div>
          </div>
          <div class="stat" :class="missingCovers.length ? 'red' : 'green'">
            <div class="bar"></div>
            <div class="k"><el-icon><Warning /></el-icon> Kapak eşleşmesi</div>
            <div class="v">{{ missingCovers.length }} eksik</div>
            <div class="d">{{ coverMatrix.length }} video tarandı · hazır kapak kuralı</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <el-tabs v-model="tab" style="width:100%">
              <el-tab-pane v-for="g in groups" :key="g.key" :name="g.key" :label="g.title + ' (' + (inv[g.key] || []).length + ')'" />
            </el-tabs>
          </div>
          <div class="card-body tight">
            <el-table :data="current" size="small" style="width:100%" height="420">
              <el-table-column label="Ad" min-width="240">
                <template #default="{ row }">
                  <el-icon style="vertical-align:-2px;color:#909399"><Document v-if="row.mimeType && row.mimeType.indexOf('folder') < 0" /><Folder v-else /></el-icon>
                  <span style="margin-left:6px">{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Tür" width="150">
                <template #default="{ row }"><span class="mono-sm">{{ (row.mimeType || '').split('.').pop() }}</span></template>
              </el-table-column>
              <el-table-column label="Boyut" width="100">
                <template #default="{ row }"><span class="mono-sm">{{ bytes(row.size) }}</span></template>
              </el-table-column>
              <el-table-column label="Değişti" width="150">
                <template #default="{ row }"><span class="mono-sm">{{ trTime(row.modifiedTime) }}</span></template>
              </el-table-column>
              <el-table-column label="İşlem" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button link size="small" type="primary" @click="openLink(fileLink(row))">Drive</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><el-icon><Picture /></el-icon> Kapak eşleşme matrisi</h3>
            <span class="sub">video → kapak (numaraya göre)</span>
            <div class="head-actions">
              <el-tag size="small" type="danger" effect="plain">{{ missingCovers.length }} kapaksız</el-tag>
            </div>
          </div>
          <div class="card-body tight">
            <el-table :data="coverMatrix" size="small" height="300" style="width:100%">
              <el-table-column label="Video" width="180" prop="name" />
              <el-table-column label="Tür" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.type === 'long' ? 'danger' : 'primary'" effect="plain">{{ row.type }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Kapak" width="150">
                <template #default="{ row }">
                  <span class="tag-status"><span class="dot" :class="row.hasCover ? 'success' : 'failure'"></span>{{ row.hasCover ? 'hazır' : 'eksik' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Boyut" width="110">
                <template #default="{ row }"><span class="mono-sm">{{ bytes(row.size) }}</span></template>
              </el-table-column>
              <el-table-column label="Not">
                <template #default="{ row }">
                  <span class="muted" v-if="row.hasCover">Yüklemede otomatik eşleşir.</span>
                  <span class="muted" v-else>Kural gereği otomatik üretilmez; video kapaksız yayınlanır.</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    `
  };

  /* =========================== İŞÇİLER & UYARILAR ====================== */
  VIEWS.workers = {
    name: 'WorkersView',
    data() { return { s: store, now: Date.now() }; },
    computed: {
      workers() {
        const t = this.s.telemetry || {};
        const fromTelemetry = t.isciler || [];
        const status = this.s.files.status ? JSON.parse(this.s.files.status) : null;
        return fromTelemetry.map((w) => {
          const match = status && (status.workers || []).find((x) => x.name && w.name && x.name.split(' ')[0] === w.name.split(' ')[0]);
          return Object.assign({}, w, { extra: match || null });
        });
      },
      statusReport() {
        try { return this.s.files.status ? JSON.parse(this.s.files.status) : null; } catch (e) { return null; }
      },
      alerts() { return (this.s.telemetry && this.s.telemetry.uyarilar) || []; },
      cycles() {
        return this.s.runs.filter((r) => (r.path || '').endsWith('panel-telemetry.yml')).slice(0, 14);
      },
      watchdogRuns() {
        return this.s.runs.filter((r) => (r.path || '').endsWith('slot-watchdog.yml')).slice(0, 8);
      },
      gaps() {
        const list = this.cycles;
        const out = [];
        for (let i = 0; i < list.length - 1; i++) {
          const a = new Date(list[i].created_at).getTime();
          const b = new Date(list[i + 1].created_at).getTime();
          out.push({ id: list[i].id, gap: Math.round((a - b) / 60000), created: list[i].created_at });
        }
        return out;
      },
      avgGap() {
        if (!this.gaps.length) return null;
        return Math.round(this.gaps.reduce((a, x) => a + x.gap, 0) / this.gaps.length);
      },
      cycleHealth() {
        if (!this.s.telemetry || !this.s.telemetry.generated_at_iso) return { label: 'bilinmiyor', type: 'info' };
        const age = (Date.now() - new Date(this.s.telemetry.generated_at_iso).getTime()) / 60000;
        if (age <= 40) return { label: 'zamanında', type: 'success', age: Math.round(age) };
        if (age <= 75) return { label: 'gecikmeli', type: 'warning', age: Math.round(age) };
        return { label: 'durmuş olabilir', type: 'danger', age: Math.round(age) };
      }
    },
    methods: { ago, trTime, dur, runDuration, ui },
    mounted() { this._t = setInterval(() => { this.now = Date.now(); }, 5000); },
    beforeUnmount() { clearInterval(this._t); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>İşçiler &amp; Uyarılar</h2>
            <p>30 dakikalık işçi döngüsü · ISCILER &amp; UYARILAR sayfaları + GitHub çalıştırma geçmişi</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.runsBusy" @click="s.autoRefresh()">Yenile</el-button>
            <el-button size="small" type="primary" plain icon="Timer" @click="s.gh('/repos/' + s.repo + '/actions/workflows/panel-telemetry.yml/dispatches', {method:'POST', body:{ref:s.branch, inputs:{push_table_to_drive:'false'}}}).then(() => s.notify('success','Döngü tetiklendi')).catch(e => s.notify('error', e.message))">
              Döngüyü çalıştır
            </el-button>
          </div>
        </div>

        <div class="grid c4" style="margin-bottom:14px">
          <div class="stat" :class="cycleHealth.type === 'success' ? 'green' : (cycleHealth.type === 'warning' ? 'orange' : 'red')">
            <div class="bar"></div>
            <div class="k"><el-icon><Timer /></el-icon> Döngü sağlığı</div>
            <div class="v" style="font-size:19px">{{ cycleHealth.label }}</div>
            <div class="d">son telemetri {{ cycleHealth.age !== undefined ? cycleHealth.age + ' dk önce' : '—' }}</div>
          </div>
          <div class="stat blue"><div class="bar"></div><div class="k">Ortalama döngü aralığı</div>
            <div class="v">{{ avgGap === null ? '—' : avgGap }}<span v-if="avgGap !== null" style="font-size:14px"> dk</span></div>
            <div class="d">hedef 30 dk · {{ cycles.length }} son çalıştırma</div></div>
          <div class="stat grey"><div class="bar"></div><div class="k">Durum raporu</div>
            <div class="v" style="font-size:17px">{{ statusReport ? statusReport.overall_label : '—' }}</div>
            <div class="d">{{ statusReport ? statusReport.updated_at : 'status_report.json' }}</div></div>
          <div class="stat orange"><div class="bar"></div><div class="k">Bekçi çalıştırması</div>
            <div class="v">{{ watchdogRuns.length }}</div>
            <div class="d">son: {{ watchdogRuns.length ? ago(watchdogRuns[0].created_at) : '—' }}</div></div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><Cpu /></el-icon> İşçi durumları</h3>
              <span class="sub">ISCILER sayfası</span></div>
            <div class="card-body">
              <div v-for="w in workers" :key="w.row" style="border:1px solid #f0f2f5;border-radius:6px;padding:10px 12px;margin-bottom:8px">
                <div class="flex between">
                  <b style="font-size:13px">{{ w.name }}</b>
                  <el-tag size="small" :type="w.status === 'Çalışıyor' ? 'success' : 'warning'">{{ w.status }}</el-tag>
                </div>
                <div class="muted" style="margin-top:4px">{{ w.last_action }}</div>
                <div class="flex between" style="margin-top:6px">
                  <span class="mono-sm" style="color:#a8abb2">{{ w.updated_at }}</span>
                  <span class="mono-sm" style="color:#a8abb2">{{ w.jobs_done }} iş · satır {{ w.row }}</span>
                </div>
                <div v-if="w.error_message" class="alert-strip err" style="margin:6px 0 0;padding:6px 10px">{{ w.error_message }}</div>
              </div>
              <div v-if="!workers.length" class="empty-hint">Telemetri bekleniyor…</div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3><el-icon><Bell /></el-icon> Uyarılar</h3><span class="sub">UYARILAR sayfası</span></div>
            <div class="card-body tight">
              <el-table :data="alerts" size="small" style="width:100%">
                <el-table-column label="Başlık" prop="title" min-width="200" />
                <el-table-column label="Durum" width="110">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.status === 'Sorunsuz' ? 'success' : 'warning'" effect="plain">{{ row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="Renk" width="90" prop="updated_at" />
                <el-table-column label="Zaman" width="130" prop="detail" />
              </el-table>
              <div v-if="!alerts.length" class="empty-hint">Uyarı kaydı yok.</div>
            </div>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><Odometer /></el-icon> Telemetri döngüsü geçmişi</h3>
              <span class="sub">her 30 dakika · cron */30 * * * *</span></div>
            <div class="card-body">
              <div v-for="r in cycles" :key="r.id" class="timeline-item">
                <span class="t mono-sm">{{ trTime(r.created_at) }}</span>
                <span class="tag-status" style="flex:1">
                  <span class="dot" :class="r.conclusion === 'success' ? 'success' : (r.conclusion === 'failure' ? 'failure' : 'in_progress')"></span>
                  {{ ui.statusLabel(r.status, r.conclusion) }}
                </span>
                <span class="mono-sm muted">{{ dur(runDuration(r)) }}</span>
                <span class="link-btn" @click="s.openRun(r.id)">log</span>
              </div>
              <div v-if="!cycles.length" class="empty-hint">Döngü kaydı yok.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><AlarmClock /></el-icon> Slot bekçisi geçmişi</h3>
              <span class="sub">12:50 / 13:00 / 19:50 / 20:00 TR</span></div>
            <div class="card-body">
              <div v-for="r in watchdogRuns" :key="r.id" class="timeline-item">
                <span class="t mono-sm">{{ trTime(r.created_at) }}</span>
                <span class="tag-status" style="flex:1">
                  <span class="dot" :class="r.conclusion === 'success' ? 'success' : (r.conclusion === 'failure' ? 'failure' : 'in_progress')"></span>
                  {{ ui.statusLabel(r.status, r.conclusion) }}
                </span>
                <span class="mono-sm muted">{{ dur(runDuration(r)) }}</span>
                <span class="link-btn" @click="s.openRun(r.id)">log</span>
              </div>
              <div v-if="!watchdogRuns.length" class="empty-hint">Bekçi kaydı yok.</div>
            </div>
          </div>
        </div>
      </div>
    `
  };

  /* ============================ HATA & ONARIM ========================= */
  VIEWS.diagnostics = {
    name: 'DiagnosticsView',
    data() {
      return {
        s: store,
        forceDraft: '',
        repairDraft: '',
        repairError: '',
        forceDirty: false,
        repairDirty: false,
        claimDraft: ''
      };
    },
    computed: {
      files() { return this.s.files; },
      failedRuns() {
        return this.s.runs.filter((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out').slice(0, 8);
      },
      uploadedTail() {
        const txt = this.files.uploaded || '';
        return txt.trim().split('\n').slice(-15).reverse();
      },
      claims() {
        return (this.files.slotClaims || '').split('\n').filter((l) => l && !l.startsWith('#')).slice(-20).reverse();
      },
      statusReport() {
        try { return this.files.status ? JSON.parse(this.files.status) : null; } catch (e) { return null; }
      }
    },
    watch: {
      'files.force': {
        handler(v) { if (!this.forceDirty) this.forceDraft = (v || '').trim(); },
        immediate: true
      },
      'files.repair': {
        handler(v) { if (!this.repairDirty) this.repairDraft = v || ''; },
        immediate: true
      }
    },
    methods: {
      ago, trTime, ui, dur, runDuration,
      async saveForce() {
        try {
          await this.s.writeForceNext(this.forceDraft.trim());
          this.forceDirty = false;
        } catch (e) { this.s.notify('error', e.message); }
      },
      async clearForce() {
        this.forceDraft = '';
        await this.saveForce();
      },
      validateRepair() {
        if (!this.repairDraft.trim()) { this.repairError = ''; return true; }
        try { JSON.parse(this.repairDraft); this.repairError = ''; return true; }
        catch (e) { this.repairError = e.message; return false; }
      },
      async saveRepair() {
        if (!this.validateRepair()) return;
        try {
          await this.s.saveRepair(this.repairDraft);
          this.repairDirty = false;
        } catch (e) { this.s.notify('error', e.message); }
      },
      repairTemplate() {
        this.repairDraft = JSON.stringify({ file_name: 'video_1XX.mp4', title: '', description: '', apply_on_next_run: true }, null, 2);
        this.repairDirty = true;
      },
      async loadFiles() {
        await this.s.loadFiles();
        this.s.notify('success', 'Durum dosyaları yenilendi.');
      },
      async rerun(workflowFile, inputs) {
        try {
          await this.s.gh('/repos/' + this.s.repo + '/actions/workflows/' + workflowFile + '/dispatches', {
            method: 'POST', body: { ref: this.s.branch, inputs: inputs || {} }
          });
          this.s.notify('success', workflowFile + ' tetiklendi.');
          setTimeout(() => this.s.loadRuns(), 4000);
        } catch (e) { this.s.notify('error', e.message); }
      }
    },
    mounted() { if (!this.files.force && !this.files.slotClaims) this.s.loadFiles(); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Hata &amp; Onarım</h2>
            <p>Hata dalları, tek seferlik onarım talepleri ve sıra/slot kilitleri — hepsi gerçek depo dosyaları</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.filesBusy" @click="loadFiles">Dosyaları yenile</el-button>
          </div>
        </div>

        <div class="grid c2" style="margin-bottom:14px">
          <div class="stat orange"><div class="bar"></div><div class="k">Son 30 Çalıştırmada Hata</div>
            <div class="v">{{ failedRuns.length }}</div><div class="d">başarısız / zaman aşımı koşu</div></div>
          <div class="stat green"><div class="bar"></div><div class="k">Tescillenen Yayın Slotları</div>
            <div class="v">{{ claims.length }}</div><div class="d">son 20 yayın kaydı</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><CircleClose /></el-icon> Hata dalları (başarısız çalıştırmalar)</h3>
            <span class="sub">tıkla → adım adım log</span></div>
          <div class="card-body tight">
            <el-table :data="failedRuns" size="small" style="width:100%">
              <el-table-column label="#" width="70"><template #default="{ row }"><span class="mono-sm">#{{ row.run_number }}</span></template></el-table-column>
              <el-table-column label="İş akışı" min-width="200">
                <template #default="{ row }"><span style="font-size:12px">{{ row.name }}</span></template>
              </el-table-column>
              <el-table-column label="Zaman" width="150">
                <template #default="{ row }"><span class="mono-sm">{{ trTime(row.created_at) }}</span></template>
              </el-table-column>
              <el-table-column label="Süre" width="90">
                <template #default="{ row }"><span class="mono-sm">{{ dur(runDuration(row)) }}</span></template>
              </el-table-column>
              <el-table-column label="İşlem" width="180">
                <template #default="{ row }">
                  <el-button link size="small" type="primary" @click="s.openRun(row.id)">Adım logları</el-button>
                  <el-button link size="small" @click="openLink(row.html_url)">GitHub</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="!failedRuns.length" class="empty-hint">Son çalıştırmalarda hata yok 🎉</div>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><Calendar /></el-icon> slot_claims.txt</h3><span class="sub">kalıcı slot talepleri (UTC)</span></div>
            <div class="card-body">
              <div v-for="c in claims" :key="c" class="kv"><span class="k mono-sm">{{ c }}</span>
                <span class="v">{{ trTime(c.replace('Z',':00Z')) }}</span></div>
              <div v-if="!claims.length" class="empty-hint">Kayıt yok.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><Files /></el-icon> uploaded.txt (son 15)</h3></div>
            <div class="card-body">
              <div v-for="u in uploadedTail" :key="u" class="kv"><span class="k mono-sm">{{ u }}</span></div>
              <div v-if="!uploadedTail.length" class="empty-hint">Kayıt yok.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><Warning /></el-icon> Acil durum işlemleri</h3>
            <span class="sub">elle tetikleme · gerçek çalıştırma başlatır</span></div>
          <div class="card-body flex">
            <el-button size="small" type="primary" plain @click="rerun('youtube-drive-uploader.yml', {dry_run: 'true', video_type: 'auto'})">Kuru çalıştırma (dry run)</el-button>
            <el-button size="small" plain @click="rerun('panel-telemetry.yml')">Telemetriyi yenile</el-button>
            <el-button size="small" plain @click="rerun('slot-watchdog.yml')">Slot bekçisini çalıştır</el-button>
            <el-button size="small" plain @click="rerun('retansiyon-raporu.yml', {save_report: 'false'})">Retansiyon raporunu üret</el-button>
          </div>
        </div>
      </div>
    `
  };
})();
