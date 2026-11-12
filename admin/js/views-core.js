/* ============================================================================
   Görünumler: Kontrol Paneli · Çalıştırmalar · İş Akışları
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime, trClock, ago, dur, runDuration, nextCronRun, cronHuman, bytes } = window.BD;
  const VIEWS = window.VIEWS;

  /* --- paylaşılan yardımcılar ------------------------------------------- */
  const ui = {
    draw(vm, ref, option) {
      const el = vm.$refs[ref];
      if (!el) return;
      if (!vm._charts) vm._charts = {};
      let inst = vm._charts[ref];
      if (!inst || inst.isDisposed()) { inst = echarts.init(el); vm._charts[ref] = inst; }
      inst.setOption(option, true);
    },
    resize(vm) {
      if (!vm._charts) return;
      Object.values(vm._charts).forEach((c) => c && !c.isDisposed() && c.resize());
    },
    go(key) { location.hash = '#/' + key; },
    statusType(status, conclusion) {
      if (status === 'in_progress') return 'warning';
      if (status === 'queued' || status === 'waiting' || status === 'requested' || status === 'pending') return 'info';
      if (conclusion === 'success') return 'success';
      if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'danger';
      return 'info';
    },
    statusLabel(status, conclusion) {
      const map = { in_progress: 'Çalışıyor', queued: 'Kuyrukta', waiting: 'Bekliyor', requested: 'İstendi', completed: 'Bitti', pending: 'Bekliyor' };
      if (status !== 'completed') return map[status] || status;
      const c = { success: 'Başarılı', failure: 'Başarısız', cancelled: 'İptal', skipped: 'Atlandı', timed_out: 'Zaman aşımı', neutral: 'Nötr', action_required: 'Eylem gerekli' };
      return c[conclusion] || conclusion || 'Bitti';
    },
    eventLabel(e) {
      return ({ schedule: 'Zamanlanmış', workflow_dispatch: 'Elle', push: 'Push', repository_dispatch: 'API' })[e] || e;
    }
  };
  window.BD.ui = ui;

  /* ============================ KONTROL PANELİ ========================== */
  VIEWS.dashboard = {
    name: 'DashboardView',
    data() { return { s: store, tick: 0 }; },
    computed: {
      telemetry() { return this.s.telemetry || {}; },
      q() { return this.telemetry.queue_summary || {}; },
      inv() { return this.telemetry.drive_inventory || {}; },
      rules() { return this.telemetry.schedule_rules || {}; },
      retention() { return this.telemetry.retention || { metrics: [] }; },
      workers() { return this.telemetry.isciler || []; },
      alerts() { return this.telemetry.uyarilar || []; },
      apiUyarilari() { return this.s.apiUyarilari || []; },
      apiKritikSayisi() { return this.apiUyarilari.filter(u => u.seviye === 'kritik').length; },
      apiUyariVar() { return this.apiUyarilari.length > 0; },
      queue() { return this.telemetry.active_queue || []; },
      stale() {
        if (!this.telemetry.generated_at_iso) return true;
        return (Date.now() - new Date(this.telemetry.generated_at_iso).getTime()) > 95 * 60 * 1000;
      },
      telemetryAgeText() {
        if (!this.telemetry.generated_at_iso) return '—';
        return ago(this.telemetry.generated_at_iso);
      },
      lastUploadRun() {
        return this.s.runs.find((r) => (r.path || '').endsWith('youtube-drive-uploader.yml')) || null;
      },
      lastTelemetryRun() {
        return this.s.runs.find((r) => (r.path || '').endsWith('panel-telemetry.yml')) || null;
      },
      lastRetentionRun() {
        return this.s.runs.find((r) => (r.path || '').endsWith('retansiyon-raporu.yml')) || null;
      },
      uploads24h() {
        const since = Date.now() - 24 * 3600 * 1000;
        return this.s.runs.filter(
          (r) => (r.path || '').endsWith('youtube-drive-uploader.yml') && r.conclusion === 'success' && new Date(r.created_at).getTime() > since
        ).length;
      },
      successRate() {
        const completed = this.s.runs.filter((r) => r.status === 'completed');
        if (!completed.length) return null;
        const ok = completed.filter((r) => r.conclusion === 'success').length;
        return Math.round((ok / completed.length) * 100);
      },
      nextSlots() {
        const now = new Date();
        const mk = (expr, label) => {
          const d = nextCronRun(expr);
          return d ? { label, at: d, diff: d.getTime() - now.getTime() } : null;
        };
        const list = [mk('30 16 * * *', '19:30 Akşam Shorts Slotu')].filter(Boolean);
        list.sort((a, b) => a.diff - b.diff);
        return list;
      },
      nextSlotDetail() {
        const s0 = this.nextSlots[0];
        if (!s0) return null;
        const name = this.q.next_short;
        const totalSec = Math.max(0, Math.floor(s0.diff / 1000));
        return {
          label: s0.label,
          type: 'short',
          name,
          at: s0.at,
          countdown: `${Math.floor(totalSec / 3600)} sa ${Math.floor((totalSec % 3600) / 60)} dk`,
          isFriday: false
        };
      },
      pipeline() {
        const hasVideo = (this.inv.shorts_videos || []).length;
        const hasCover = (this.inv.shorts_covers || []).length;
        const lastUploadOk = this.lastUploadRun && this.lastUploadRun.conclusion === 'success';
        const lastRetOk = this.lastRetentionRun && this.lastRetentionRun.conclusion === 'success';
        return [
          { name: 'Drive Video', ok: hasVideo > 0, detail: `${hasVideo} Shorts` },
          { name: '9:16 Kapak', ok: hasCover > 0, detail: `${hasCover} kapak` },
          { name: 'Shorts Kuyruğu', ok: (this.q.ready_shorts || 0) > 0, detail: `${this.q.ready_shorts || 0} hazır` },
          { name: 'Son Yayın', ok: !!lastUploadOk, detail: this.lastUploadRun ? ui.statusLabel(this.lastUploadRun.status, this.lastUploadRun.conclusion) : '—' },
          { name: 'Analitik', ok: !!lastRetOk, detail: `${this.retention.video_count || 0} video` }
        ];
      }
    },
    methods: {
      apiSayfasinaGit() { location.hash = '#/api'; },

      go(k) { location.hash = '#/' + k; },
      async triggerUploader() {
        try {
          await ElementPlus.ElMessageBox.confirm(
            'Sıradaki uygun video şimdi yayınlanacak (Prime Time slotu dışında elle tetikleme). Devam edilsin mi?',
            'Video yüklemeyi tetikle',
            { confirmButtonText: 'Tetikle', cancelButtonText: 'Vazgeç', type: 'warning' }
          );
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/youtube-drive-uploader.yml/dispatches`, {
            method: 'POST', body: { ref: this.s.branch, inputs: { dry_run: 'false', video_type: 'auto' } }
          });
          this.s.notify('success', 'YouTube Drive Uploader tetiklendi.');
          setTimeout(() => this.s.loadRuns(), 4000);
        } catch (e) {
          if (e !== 'cancel') this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        }
      },
      async triggerTelemetry() {
        try {
          await this.s.gh(`/repos/${this.s.repo}/actions/workflows/panel-telemetry.yml/dispatches`, {
            method: 'POST', body: { ref: this.s.branch, inputs: { push_table_to_drive: 'false' } }
          });
          this.s.notify('success', 'Telemetri senkronu tetiklendi.');
          setTimeout(() => this.s.loadRuns(), 4000);
        } catch (e) {
          this.s.notify('error', 'Tetiklenemedi: ' + (e.message || e));
        }
      },
      renderCharts() {
        const t = this.telemetry;
        if (!t || !t.queue_summary) return;
        const q = this.q;
        const yayinlananSayisi = (this.queue || []).filter((x) => x.is_published && x.type !== 'long').length;
        ui.draw(this, 'chartQueue', {
          tooltip: { trigger: 'item' },
          legend: { bottom: 0, itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11 } },
          series: [{
            type: 'pie', radius: ['46%', '68%'], center: ['50%', '44%'],
            avoidLabelOverlap: true,
            label: { show: true, formatter: '{b}\\n{c}', fontSize: 11, color: '#606266' },
            data: [
              { name: 'Hazır Shorts', value: q.ready_shorts || 0, itemStyle: { color: '#409eff' } },
              { name: 'Yayınlanan (Aktif Seri)', value: yayinlananSayisi, itemStyle: { color: '#67c23a' } }
            ]
          }]
        });

        // son 7 gün çalıştırma sonuçları
        const days = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          days.push({ key, label: key.slice(8) + '.' + key.slice(5, 7), ok: 0, fail: 0 });
        }
        this.s.runs.forEach((r) => {
          const key = (r.created_at || '').slice(0, 10);
          const d = days.find((x) => x.key === key);
          if (!d) return;
          if (r.conclusion === 'success') d.ok++;
          else if (r.conclusion === 'failure') d.fail++;
        });
        ui.draw(this, 'chartRuns', {
          grid: { left: 34, right: 14, top: 24, bottom: 26 },
          tooltip: { trigger: 'axis' },
          legend: { right: 0, top: 0, itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11 } },
          xAxis: { type: 'category', data: days.map((d) => d.label), axisLine: { lineStyle: { color: '#e4e7ed' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          series: [
            { name: 'Başarılı', type: 'bar', stack: 'a', data: days.map((d) => d.ok), itemStyle: { color: '#67c23a', borderRadius: [0, 0, 0, 0] }, barWidth: 16 },
            { name: 'Başarısız', type: 'bar', stack: 'a', data: days.map((d) => d.fail), itemStyle: { color: '#f56c6c' }, barWidth: 16 }
          ]
        });

        // retansiyon: son 12 videonun görüntülenmesi
        const metrics = (this.retention.metrics || []).slice().sort((a, b) => (a.published_date < b.published_date ? 1 : -1)).slice(0, 12).reverse();
        ui.draw(this, 'chartViews', {
          grid: { left: 44, right: 12, top: 16, bottom: 42 },
          tooltip: {
            trigger: 'axis',
            formatter: (p) => {
              const d = metrics[p[0].dataIndex];
              return `<b>${d.published_date}</b><br/>${d.views} görüntülenme<br/>Ortalama izlenme: %${d.avg_view_pct ?? '—'}`;
            }
          },
          xAxis: {
            type: 'category', data: metrics.map((m) => String(m.published_date).slice(5)),
            axisLabel: { fontSize: 10, color: '#909399', rotate: 40 }, axisLine: { lineStyle: { color: '#e4e7ed' } }
          },
          yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          series: [{ type: 'bar', data: metrics.map((m) => m.views || 0), itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 24 }]
        });
      }
    },
    mounted() {
      this.$nextTick(() => this.renderCharts());
      this._t = setInterval(() => { this.tick++; }, 1000);
      this._r = () => ui.resize(this);
      window.addEventListener('resize', this._r);
    },
    updated() { this.$nextTick(() => this.renderCharts()); },
    beforeUnmount() { clearInterval(this._t); window.removeEventListener('resize', this._r); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Kontrol Paneli</h2>
            <p>Canlı operasyon özeti · telemetri {{ telemetryAgeText }} · {{ telemetry.generated_at || '—' }}</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="s.loadTelemetry()">Telemetriyi yenile</el-button>
            <el-button size="small" icon="Timer" @click="triggerTelemetry">Döngüyü çalıştır</el-button>
            <el-button size="small" type="primary" icon="Upload" :loading="s.booting" @click="triggerUploader">Video yüklemeyi tetikle</el-button>
          </div>
        </div>

        <!-- API uyarıları: %90+ doluluk veya geçersiz anahtar. Sadece sorun varsa görünür. -->
        <div v-if="apiUyariVar" class="api-uyari-strip">
          <div class="au-bas">
            <el-icon class="au-ikon"><WarningFilled /></el-icon>
            <strong>{{ apiKritikSayisi ? apiKritikSayisi + ' kritik API uyarısı' : apiUyarilari.length + ' API uyarısı' }}</strong>
            <span class="au-link" @click="apiSayfasinaGit">API &amp; Kota →</span>
          </div>
          <div v-for="u in apiUyarilari" :key="u.id" class="au-satir">
            <span class="au-servis">{{ u.servis }}</span>
            <span class="au-mesaj">{{ u.mesaj }}</span>
            <span v-if="u.islem" class="au-islem">→ {{ u.islem }}</span>
          </div>
        </div>

        <div class="alert-strip" :class="stale ? 'warn' : 'ok'">
          <el-icon><component :is="stale ? 'WarningFilled' : 'CircleCheckFilled'" /></el-icon>
          <span v-if="stale">
            Telemetri {{ telemetryAgeText }} güncellendi. 30 dakikalık döngü gecikmiş olabilir —
            <span class="link-btn" @click="triggerTelemetry">senkronu elle çalıştır</span>.
          </span>
          <span v-else>30 dakikalık telemetri &amp; işçi döngüsü sağlıklı. Son güncelleme {{ telemetry.generated_at }}.</span>
        </div>

        <div class="grid c4">
          <div class="stat blue">
            <div class="bar"></div>
            <div class="k"><el-icon><VideoCamera /></el-icon> Hazır Shorts</div>
            <div class="v">{{ q.ready_shorts ?? '—' }}</div>
            <div class="d">9:16 dikey video kuyrukta hazır</div>
          </div>
          <div class="stat green">
            <div class="bar"></div>
            <div class="k"><el-icon><Timer /></el-icon> Yayın Stoğu</div>
            <div class="v">{{ q.ready_shorts ?? q.days_of_stock ?? '—' }}<span style="font-size:14px"> gün</span></div>
            <div class="d">her gün 19:30 TR · sıradaki {{ q.next_short || '—' }}</div>
          </div>
          <div class="stat orange">
            <div class="bar"></div>
            <div class="k"><el-icon><Picture /></el-icon> Eksik Kapak</div>
            <div class="v">{{ (q.missing_covers || []).length }}</div>
            <div class="d">{{ (q.missing_covers || []).join(', ') || 'Tüm hazır videoların kapağı tam' }}</div>
          </div>
          <div class="stat" :class="successRate !== null && successRate < 80 ? 'red' : 'grey'">
            <div class="bar"></div>
            <div class="k"><el-icon><DataAnalysis /></el-icon> Otomasyon Sağlığı</div>
            <div class="v">{{ successRate === null ? '—' : '%' + successRate }}</div>
            <div class="d">son {{ s.runs.length }} koşu · 24s içinde {{ uploads24h }} yayın</div>
          </div>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="card-head">
            <h3><el-icon><Connection /></el-icon> Yayın Hattı</h3>
            <span class="sub">Drive → 9:16 kapak → baslik.xlsx → YouTube Shorts → analitik</span>
            <div class="head-actions">
              <el-tag size="small" type="info" effect="plain">Sıradaki: {{ nextSlotDetail ? nextSlotDetail.label : '—' }}</el-tag>
              <el-tag size="small" type="primary" effect="dark" v-if="nextSlotDetail">
                {{ nextSlotDetail.name || 'Hazır' }} · {{ nextSlotDetail.countdown }}
              </el-tag>
            </div>
          </div>
          <div class="card-body">
            <div class="flex" style="gap:6px;align-items:stretch">
              <template v-for="(p, i) in pipeline" :key="p.name">
                <div style="flex:1;min-width:110px;border:1px solid #ebeef5;border-radius:6px;padding:10px 12px;background:#fcfcfd">
                  <div class="flex between">
                    <b style="font-size:12.5px">{{ p.name }}</b>
                    <span class="dot" :class="p.ok ? 'success' : 'failure'"></span>
                  </div>
                  <div class="muted" style="margin-top:4px">{{ p.detail }}</div>
                </div>
                <div v-if="i < pipeline.length - 1" style="display:flex;align-items:center;color:#c0c4cc">
                  <el-icon><Right /></el-icon>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="grid c3">
          <div class="card">
            <div class="card-head"><h3><el-icon><PieChart /></el-icon> Kuyruk dağılımı</h3></div>
            <div class="card-body"><div ref="chartQueue" class="chart"></div></div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><Histogram /></el-icon> 7 günlük çalıştırmalar</h3></div>
            <div class="card-body"><div ref="chartRuns" class="chart"></div></div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3><el-icon><View /></el-icon> Son 12 video · görüntülenme</h3>
              <span class="sub">retansiyon raporu</span>
            </div>
            <div class="card-body"><div ref="chartViews" class="chart"></div></div>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head">
              <h3><el-icon><VideoPlay /></el-icon> Son çalıştırmalar</h3>
              <div class="head-actions"><span class="link-btn" @click="go('runs')">tümü →</span></div>
            </div>
            <div class="card-body tight">
              <el-table :data="s.runs.slice(0, 7)" size="small" style="width:100%" @row-click="go('runs')">
                <el-table-column label="İş akışı" min-width="170">
                  <template #default="{ row }">
                    <span style="font-size:12px">{{ (row.name || '').replace(' (Ozel Analytics)', '') }}</span>
                    <div class="muted" style="font-size:11px">{{ ui.eventLabel(row.event) }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="Durum" width="112">
                  <template #default="{ row }">
                    <el-tag size="small" :type="ui.statusType(row.status, row.conclusion)" effect="light">
                      {{ ui.statusLabel(row.status, row.conclusion) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="Başlangıç" width="118">
                  <template #default="{ row }"><span class="mono-sm">{{ trClock(row.created_at) }}</span></template>
                </el-table-column>
                <el-table-column label="Süre" width="86">
                  <template #default="{ row }"><span class="mono-sm">{{ dur(runDuration(row)) }}</span></template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3><el-icon><Cpu /></el-icon> İşçiler</h3>
              <div class="head-actions"><span class="link-btn" @click="go('workers')">detay →</span></div>
            </div>
            <div class="card-body">
              <div v-for="w in workers" :key="w.row" class="timeline-item">
                <div style="flex:1;min-width:0">
                  <div class="flex between">
                    <b style="font-size:12.5px">{{ w.name }}</b>
                    <el-tag size="small" :type="w.status === 'Çalışıyor' ? 'success' : 'warning'" effect="plain">{{ w.status }}</el-tag>
                  </div>
                  <div class="muted" style="margin-top:3px">{{ w.last_action }}</div>
                  <div class="mono-sm" style="color:#b3bac5;margin-top:2px">{{ w.updated_at }} · {{ w.jobs_done }} iş</div>
                </div>
              </div>
              <div v-if="!workers.length" class="empty-hint">Telemetri bekleniyor…</div>
            </div>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><Calendar /></el-icon> Yayın Planı &amp; Kurallar</h3>
              <span class="sub">Haftanın 7 günü 19:30 TR Shorts</span></div>
            <div class="card-body">
              <div v-for="sl in nextSlots" :key="sl.label" class="kv">
                <span class="k">{{ sl.label }} ({{ sl.at.toISOString().slice(11, 16) }} UTC)</span>
                <span class="v">{{ trTime(sl.at.toISOString()) }}</span>
              </div>
              <div class="kv"><span class="k">Slot Bekçisi (kontrol / kurtarma)</span><span class="v">19:50 / 20:00 TR</span></div>
              <div class="kv"><span class="k">Ana Yayın Tablosu</span><span class="v mono-sm">baslik.xlsx</span></div>
              <div class="kv"><span class="k">Yayın Formatı</span><span class="v">Yalnızca 9:16 Shorts (1080×1920)</span></div>
              <div class="kv"><span class="k">Ekran Kilit Süresi</span><span class="v">Sekme değişiminde 3 dakika</span></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><Bell /></el-icon> Uyarı durumları</h3></div>
            <div class="card-body">
              <div v-for="a in alerts" :key="a.row" class="kv">
                <span class="k">{{ a.title }}</span>
                <span class="v">
                  <el-tag size="small" :type="a.status === 'Sorunsuz' ? 'success' : 'warning'" effect="plain">{{ a.status }}</el-tag>
                </span>
              </div>
              <div v-if="!alerts.length" class="empty-hint">Uyarı kaydı yok.</div>
              <div class="muted" style="margin-top:8px">Uyarılar Drive tablosundaki <b>UYARILAR</b> sayfasından okunur ({{ telemetry.generated_at }}).</div>
            </div>
          </div>
        </div>
      </div>
    `
  };

  /* ============================ ÇALIŞTIRMALAR =========================== */
  VIEWS.runs = {
    name: 'RunsView',
    data() {
      return {
        s: store,
        wfFilter: 'all',
        statusFilter: 'all',
        eventFilter: 'all',
        search: '',
        autoRefresh: true,
        autoLogs: true,
        lastRefresh: Date.now()
      };
    },
    computed: {
      filtered() {
        return this.s.runs.filter((r) => {
          if (this.wfFilter !== 'all' && !(r.path || '').endsWith(this.wfFilter)) return false;
          if (this.statusFilter !== 'all' && r.conclusion !== this.statusFilter) return false;
          if (this.eventFilter !== 'all' && r.event !== this.eventFilter) return false;
          if (this.search) {
            const q = this.search.toLowerCase();
            if (!((r.display_title || r.name || '') + ' #' + r.run_number + ' ' + (r.head_sha || '')).toLowerCase().includes(q)) return false;
          }
          return true;
        });
      },
      workflowOptions() {
        return this.s.workflows.map((w) => ({ label: w.name, value: w.file }));
      }
    },
    methods: {
      async open(row) {
        await this.s.openRun(row.id);
        if (this.autoLogs && this.s.jobs.length) this.s.loadLogs(this.s.jobs[0]);
      },
      async refresh() { await this.s.loadRuns(); this.lastRefresh = Date.now(); },
      async cancel(row) {
        try {
          await this.s.cancelRun(row.id);
        } catch (e) { this.s.notify('error', 'İptal edilemedi: ' + e.message); }
      },
      async rerun(row) {
        try { await this.s.rerun(row.id, false); } catch (e) { this.s.notify('error', 'Yeniden çalıştırılamadı: ' + e.message); }
      },
      goPage(p) { this.s.loadRuns(p); }
    },
    mounted() {
      this._t = setInterval(() => {
        if (this.autoRefresh && this.s.authed) this.refresh();
      }, 20000);
    },
    beforeUnmount() { clearInterval(this._t); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Çalıştırmalar</h2>
            <p>GitHub Actions geçmişi · {{ s.runsTotal }} kayıt · son yenileme {{ trClock(new Date(lastRefresh).toISOString()) }}</p>
          </div>
          <div class="head-actions">
            <el-switch v-model="autoRefresh" size="small" active-text="20 sn otomatik" />
            <el-button size="small" icon="Refresh" :loading="s.runsBusy" @click="refresh">Yenile</el-button>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <el-select v-model="wfFilter" size="small" style="width:220px" placeholder="İş akışı">
              <el-option label="Tüm iş akışları" value="all" />
              <el-option v-for="o in workflowOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-select v-model="statusFilter" size="small" style="width:150px">
              <el-option label="Tüm durumlar" value="all" />
              <el-option label="Başarılı" value="success" />
              <el-option label="Başarısız" value="failure" />
              <el-option label="İptal" value="cancelled" />
              <el-option label="Devam eden" value="" />
            </el-select>
            <el-select v-model="eventFilter" size="small" style="width:150px">
              <el-option label="Tüm tetikler" value="all" />
              <el-option label="Zamanlanmış" value="schedule" />
              <el-option label="Elle" value="workflow_dispatch" />
              <el-option label="Push" value="push" />
            </el-select>
            <el-input v-model="search" size="small" style="width:220px" placeholder="Başlık, #no veya SHA ara" clearable prefix-icon="Search" />
            <span class="sub" style="margin-left:auto">{{ filtered.length }} / {{ s.runs.length }} gösteriliyor</span>
          </div>
          <div class="card-body tight">
            <el-table :data="filtered" size="small" v-loading="s.runsBusy" style="width:100%" @row-click="open">
              <el-table-column label="#" width="82">
                <template #default="{ row }"><span class="mono-sm">#{{ row.run_number }}</span></template>
              </el-table-column>
              <el-table-column label="İş akışı" min-width="210">
                <template #default="{ row }">
                  <div style="font-size:12.5px">{{ (row.name || '').replace(' (Ozel Analytics)', '') }}</div>
                  <div class="muted mono-sm">{{ (row.path || '').split('/').pop() }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Durum" width="130">
                <template #default="{ row }">
                  <span class="tag-status">
                    <span class="dot" :class="row.status === 'completed' ? (row.conclusion === 'success' ? 'success' : 'failure') : 'in_progress'"></span>
                    {{ ui.statusLabel(row.status, row.conclusion) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="Tetik" width="132">
                <template #default="{ row }"><el-tag size="small" effect="plain" type="info" style="font-size:11px">{{ ui.eventLabel(row.event) }}</el-tag></template>
              </el-table-column>
              <el-table-column label="Başlangıç (TR)" width="150">
                <template #default="{ row }"><span class="mono-sm">{{ trTime(row.created_at) }}</span></template>
              </el-table-column>
              <el-table-column label="Süre" width="100">
                <template #default="{ row }"><span class="mono-sm">{{ dur(runDuration(row)) }}</span></template>
              </el-table-column>
              <el-table-column label="Commit" width="100">
                <template #default="{ row }"><span class="mono-sm">{{ (row.head_sha || '').slice(0, 7) }}</span></template>
              </el-table-column>
              <el-table-column label="İşlem" width="170" fixed="right">
                <template #default="{ row }">
                  <el-button link size="small" type="primary" @click.stop="open(row)">Detay</el-button>
                  <el-button v-if="row.status === 'completed'" link size="small" @click.stop="rerun(row)">Tekrar</el-button>
                  <el-button v-if="row.status !== 'completed'" link size="small" type="danger" @click.stop="cancel(row)">İptal</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="card-body flex" style="justify-content:flex-end">
            <el-pagination layout="prev, pager, next" :page-size="30" :total="s.runsTotal" :current-page="s.runsPage"
                           @current-change="goPage" background small />
          </div>
        </div>

        <el-drawer v-model="s.runDetailOpen" size="62%" :with-header="true" destroy-on-close>
          <template #header>
            <div class="flex" style="gap:10px">
              <b>{{ (s.selectedRun && s.selectedRun.name) || 'Çalıştırma' }}</b>
              <el-tag v-if="s.selectedRun" size="small" :type="ui.statusType(s.selectedRun.status, s.selectedRun.conclusion)">
                {{ ui.statusLabel(s.selectedRun.status, s.selectedRun.conclusion) }}
              </el-tag>
              <el-tag v-if="s.selectedRun" size="small" effect="plain">#{{ s.selectedRun.run_number }}</el-tag>
           </div>
          </template>
          <div v-if="s.selectedRun">
            <div class="grid c4" style="margin-bottom:12px">
              <div class="stat grey" style="min-height:70px"><div class="bar"></div>
                <div class="k">Başlangıç</div><div class="v" style="font-size:15px">{{ trTime(s.selectedRun.run_started_at || s.selectedRun.created_at) }}</div></div>
              <div class="stat grey" style="min-height:70px"><div class="bar"></div>
                <div class="k">Süre</div><div class="v" style="font-size:15px">{{ dur(runDuration(s.selectedRun)) }}</div></div>
              <div class="stat grey" style="min-height:70px"><div class="bar"></div>
                <div class="k">Tetik</div><div class="v" style="font-size:15px">{{ ui.eventLabel(s.selectedRun.event) }}</div></div>
              <div class="stat grey" style="min-height:70px"><div class="bar"></div>
                <div class="k">Commit</div><div class="v mono-sm" style="font-size:13px">{{ (s.selectedRun.head_sha || '').slice(0, 7) }}</div></div>
            </div>

            <div class="flex" style="margin-bottom:10px">
              <el-button size="small" icon="Refresh" @click="s.refreshSelectedRun()">Durumu yenile</el-button>
              <el-button size="small" icon="Link" @click="openLink(s.selectedRun.html_url)">GitHub'da aç</el-button>
              <el-button size="small" type="danger" plain icon="CircleClose" v-if="s.selectedRun.status !== 'completed'" @click="cancel(s.selectedRun)">İptal et</el-button>
            </div>

            <div class="card" v-for="job in s.jobs" :key="job.id" style="margin-bottom:12px">
              <div class="card-head">
                <h3><el-icon><Cpu /></el-icon> {{ job.name }}</h3>
                <el-tag size="small" :type="ui.statusType(job.status, job.conclusion)">{{ ui.statusLabel(job.status, job.conclusion) }}</el-tag>
                <span class="sub">{{ dur(runDuration({ run_started_at: job.started_at, updated_at: job.completed_at })) }}</span>
                <div class="head-actions">
                  <el-checkbox v-model="autoLogs" size="small" style="margin-right:6px">otomatik</el-checkbox>
                  <el-button size="small" :loading="s.logBusy && s.logJobId === job.id" @click="s.loadLogs(job)">Logları getir</el-button>
                </div>
              </div>
              <div class="card-body tight">
                <el-table :data="job.steps" size="small" style="width:100%">
                  <el-table-column label="#" width="46" type="index" />
                  <el-table-column label="Adım" min-width="240">
                    <template #default="{ row }"><span style="font-size:12px">{{ row.name }}</span></template>
                  </el-table-column>
                  <el-table-column label="Durum" width="120">
                    <template #default="{ row }">
                      <span class="tag-status"><span class="dot" :class="row.conclusion === 'success' ? 'success' : (row.conclusion ? 'failure' : 'in_progress')"></span>
                        {{ ui.statusLabel(row.status, row.conclusion) }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="Başlangıç" width="120">
                    <template #default="{ row }"><span class="mono-sm">{{ trClock(row.started_at) }}</span></template>
                  </el-table-column>
                  <el-table-column label="Süre" width="90">
                    <template #default="{ row }">
                      <span class="mono-sm">{{ row.completed_at ? dur((new Date(row.completed_at) - new Date(row.started_at)) / 1000) : '—' }}</span>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="s.logs[job.id]" style="padding:0 0 4px">
                  <div class="card-head" style="border-top:1px solid #f0f2f5">
                    <h3><el-icon><Tickets /></el-icon> Adım adım log</h3>
                    <el-input v-model="s.logFilter" size="small" placeholder="logda ara (ör. ERROR, video_, kapak)" clearable
                              prefix-icon="Search" style="width:240px" />
                    <div class="head-actions"><el-button size="small" link type="primary" @click="openLink(s.selectedRun.html_url)">arşiv</el-button></div>
                  </div>
                  <div style="padding:10px 14px">
                    <div class="log-box" v-html="s.logHtml(job.id)"></div>
                  </div>
                </div>
                <div v-else-if="s.logs[job.id] === null" class="empty-hint" style="padding:14px">
                  Log tarayıcıdan doğrudan okunamadı (imzalı URL kısıtı). Adım durumları yukarıda canlı; tam log için GitHub'da açın.
                </div>
              </div>
            </div>
            <div v-if="!s.jobs.length && !s.jobsBusy" class="empty-hint">Bu çalıştırma için iş kaydı yok.</div>
          </div>
        </el-drawer>
      </div>
    `
  };

  /* ============================ İŞ AKIŞLARI ============================= */
  VIEWS.workflows = {
    name: 'WorkflowsView',
    data() { return { s: store, now: Date.now() }; },
    computed: {
      rows() {
        return this.s.workflows.map((w) => {
          const runs = this.s.runs.filter((r) => (r.path || '').endsWith(w.file));
          const last = runs[0] || null;
          const nexts = (w.crons || []).map((c) => nextCronRun(c)).filter(Boolean).sort((a, b) => a - b);
          return {
            w,
            last,
            runs: runs.length,
            next: nexts[0] || null,
            nextIn: nexts[0] ? Math.max(0, nexts[0].getTime() - this.now) : null
          };
        });
      }
    },
    methods: {
      async refresh() { await Promise.all([this.s.loadWorkflows(), this.s.loadRuns()]); },
      fmtCountdown(ms) {
        if (ms === null) return '—';
        const m = Math.floor(ms / 60000);
        if (m < 60) return m + ' dk';
        const h = Math.floor(m / 60);
        if (h < 48) return h + ' sa ' + (m % 60) + ' dk';
        return Math.floor(h / 24) + ' gün ' + (h % 24) + ' sa';
      },
      dispatch(w) { this.s.openDispatch(w); },
      editCron(w) { this.s.openCronEditor(w); },
      toggle(w) { this.s.setWorkflowEnabled(w, w.state !== 'active'); },
      viewRuns(w) { this.s.view = 'runs'; location.hash = '#/runs'; this.$nextTick(() => { }); }
    },
    mounted() { this._t = setInterval(() => { this.now = Date.now(); }, 30000); },
    beforeUnmount() { clearInterval(this._t); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>İş Akışları</h2>
            <p>GitHub Actions tanımları · cron zamanlamaları canlı okunur ve buradan değiştirilebilir</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.booting" @click="refresh">Yenile</el-button>
            <el-button size="small" type="primary" icon="VideoPlay" @click="dispatch(s.workflowByName('youtube-drive-uploader.yml'))">Yükleme tetikle</el-button>
          </div>
        </div>

        <div class="alert-strip info">
          <el-icon><InfoFilled /></el-icon>
          <span>Cron ifadeleri <b>UTC</b>'dir. Panel her ifadeyi TR saatine çevirir ve GitHub API'si ile doğrudan workflow dosyasına yazar.</span>
        </div>

        <div class="grid c2">
          <div class="card" v-for="r in rows" :key="r.w.id">
            <div class="card-head">
              <h3><el-icon><Promotion /></el-icon> {{ r.w.name }}</h3>
              <el-tag size="small" :type="r.w.state === 'active' ? 'success' : 'info'" effect="plain">
                {{ r.w.state === 'active' ? 'Etkin' : 'Devre dışı' }}
              </el-tag>
              <div class="head-actions">
                <el-button size="small" type="primary" plain icon="VideoPlay" @click="dispatch(r.w)">Tetikle</el-button>
              </div>
            </div>
            <div class="card-body">
              <div class="kv"><span class="k">Dosya</span><span class="v mono-sm">{{ r.w.path }}</span></div>
              <div class="kv">
                <span class="k">Son çalıştırma</span>
                <span class="v">
                  <template v-if="r.last">
                    <el-tag size="small" :type="ui.statusType(r.last.status, r.last.conclusion)" effect="light">
                      {{ ui.statusLabel(r.last.status, r.last.conclusion) }}
                    </el-tag>
                    <span class="muted" style="margin-left:6px">{{ ago(r.last.created_at) }} · {{ dur(runDuration(r.last)) }}</span>
                  </template>
                  <span v-else class="muted">kayıt yok</span>
                </span>
              </div>
              <div class="kv"><span class="k">Sonraki tetik</span>
                <span class="v">{{ r.next ? trTime(r.next.toISOString()) + ' · ' + fmtCountdown(r.nextIn) + ' sonra' : '—' }}</span>
              </div>
              <div style="margin-top:10px">
                <div class="flex between" style="margin-bottom:6px">
                  <b style="font-size:12.5px">Cron zamanlaması ({{ (r.w.crons || []).length }})</b>
                  <el-button size="small" link type="primary" icon="Edit" @click="editCron(r.w)">Düzenle</el-button>
                </div>
                <div v-if="!(r.w.crons || []).length" class="muted">Bu iş akışı yalnızca elle (workflow_dispatch) çalışır.</div>
                <div v-for="c in r.w.crons" :key="c" class="flex" style="justify-content:space-between;border:1px solid #f0f2f5;border-radius:5px;padding:6px 10px;margin-bottom:5px;background:#fcfcfd">
                  <span class="mono-sm">{{ c }}</span>
                  <span class="muted">{{ cronHuman(c) }}</span>
                </div>
              </div>
              <div class="flex" style="margin-top:6px">
                <el-button size="small" type="info" plain icon="SwitchButton" @click="toggle(r.w)">
                  {{ r.w.state === 'active' ? 'Devre dışı bırak' : 'Etkinleştir' }}
                </el-button>
                <el-button size="small" plain icon="Link" @click="openLink('https://github.com/' + s.repo + '/actions/workflows/' + r.w.file)">GitHub</el-button>
                <span class="spacer"></span>
                <span class="muted">{{ r.runs }} çalıştırma</span>
              </div>
            </div>
          </div>
        </div>

        <el-dialog v-model="s.dispatchOpen" :title="'Tetikle · ' + ((s.dispatchWorkflow && s.dispatchWorkflow.name) || '')" width="520px">
          <div v-if="!s.dispatchWorkflow || !(s.dispatchWorkflow.inputs || []).length" class="muted">
            Bu iş akışının girdisi yok; doğrudan tetiklenecek.
          </div>
          <el-form label-position="top" v-else>
            <el-form-item v-for="i in s.dispatchWorkflow.inputs" :key="i.name" :label="i.name + (i.required ? ' *' : '')">
              <el-switch v-if="i.type === 'boolean'" v-model="s.dispatchInputs[i.name]" />
              <el-select v-else-if="i.options && i.options.length" v-model="s.dispatchInputs[i.name]" style="width:100%">
                <el-option v-for="o in i.options" :key="o" :label="o" :value="o" />
              </el-select>
              <el-input v-else v-model="s.dispatchInputs[i.name]" :placeholder="i.default" clearable />
              <div class="muted" style="margin-top:2px">{{ i.description }}</div>
            </el-form-item>
          </el-form>
          <div class="alert-strip info" style="margin-bottom:0">
            <el-icon><InfoFilled /></el-icon>
            <span>Branch: <b>{{ s.branch }}</b> · tetikleme gerçek bir GitHub Actions çalıştırması başlatır.</span>
          </div>
          <template #footer>
            <el-button @click="s.dispatchOpen = false">Vazgeç</el-button>
            <el-button type="primary" :loading="s.dispatchBusy" @click="s.runDispatch()">Tetikle</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="s.cronDialog" :title="'Cron düzenle · ' + ((s.cronWorkflow && s.cronWorkflow.file) || '')" width="560px">
          <div class="alert-strip warn">
            <el-icon><Warning /></el-icon>
            <span>Kaydettiğinde workflow dosyası commit edilir. GitHub yeni cron'u birkaç dakika içinde devreye alır.</span>
          </div>
          <div v-for="(c, idx) in s.cronDraft" :key="idx" class="flex" style="margin-bottom:8px">
            <el-input v-model="s.cronDraft[idx]" placeholder="dk saat gün ay haftagünü (UTC)" size="small" class="mono-sm" />
            <span class="muted nowrap" style="min-width:150px;text-align:right">{{ cronHuman(s.cronDraft[idx]) }}</span>
            <el-button size="small" link type="danger" icon="Delete" @click="s.cronDraft.splice(idx, 1)">sil</el-button>
          </div>
          <el-button size="small" icon="Plus" @click="s.cronDraft.push('')">Cron satırı ekle</el-button>
          <div class="muted" style="margin-top:10px">
            Örnek: <code>30 9 * * *</code> → 12:30 TR · <code>30 16 * * *</code> → 19:30 TR · <code>*/30 * * * *</code> → her 30 dakika.
          </div>
          <template #footer>
            <el-button @click="s.cronDialog = false">Vazgeç</el-button>
            <el-button type="primary" @click="s.saveCron()">Commit et</el-button>
          </template>
        </el-dialog>
      </div>
    `
  };
})();
