/* ============================================================================
   Görünümler: YouTube Analitik · Retansiyon · Zamanlayıcı · Sistem
   ========================================================================== */
(function () {
  'use strict';
  const { store, trTime, trClock, ago, dur, bytes, nextCronRun, nextCronRuns, cronHuman, runDuration } = window.BD;
  const VIEWS = window.VIEWS;
  const ui = window.BD.ui;

  /* ============================ YOUTUBE ANALİTİK ======================= */
  VIEWS.analytics = {
    name: 'AnalyticsView',
    data() {
      return {
        s: store,
        search: '',
        sort: 'published_date',
        sortOrder: 'descending',
        typeFilter: 'all',
        curveOnly: false
      };
    },
    computed: {
      retention() { return this.s.retention(); },
      info() { return this.retention.info || {}; },
      metrics() { return this.retention.metrics || []; },
      curves() { return this.retention.curves || []; },
      curveIds() { return new Set(this.curves.map((c) => c.video_id)); },
      rows() {
        let list = this.metrics.slice();
        if (this.typeFilter !== 'all') {
          list = list.filter((m) => (this.typeFilter === 'short' ? (m.duration_sec || 0) <= 65 : (m.duration_sec || 0) > 65));
        }
        if (this.curveOnly) list = list.filter((m) => this.curveIds.has(m.video_id));
        if (this.search) {
          const q = this.search.toLowerCase();
          list = list.filter((m) => (m.title + ' ' + m.video_id).toLowerCase().includes(q));
        }
        return list;
      },
      totals() {
        const m = this.rows;
        const views = m.reduce((a, x) => a + (x.views || 0), 0);
        const wt = m.reduce((a, x) => a + (x.watch_time_min || 0), 0);
        const withPct = m.filter((x) => x.avg_view_pct !== null && x.avg_view_pct !== undefined);
        const withHook = m.filter((x) => x.hook_3s_pct !== null && x.hook_3s_pct !== undefined);
        return {
          count: m.length,
          views,
          watchHours: Math.round(wt / 60),
          avgPct: withPct.length ? (withPct.reduce((a, x) => a + x.avg_view_pct, 0) / withPct.length) : null,
          avgHook: withHook.length ? (withHook.reduce((a, x) => a + x.hook_3s_pct, 0) / withHook.length) : null,
          best: m.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null
        };
      },
      shortsCount() { return this.metrics.filter((m) => (m.duration_sec || 0) <= 65).length; },
      longCount() { return this.metrics.filter((m) => (m.duration_sec || 0) > 65).length; }
    },
    methods: {
      trTime, ui,
      pct(v) { return v === null || v === undefined ? '—' : '%' + Number(v).toFixed(1); },
      num(v) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('tr-TR'); },
      openCurve(row) {
        this.s.view = 'retention';
        location.hash = '#/retention?video=' + row.video_id;
      },
      renderCharts() {
        const m = this.metrics;
        if (!m.length) return;
        const byDate = m.slice().sort((a, b) => (a.published_date > b.published_date ? 1 : -1));
        ui.draw(this, 'chartTrend', {
          grid: { left: 46, right: 46, top: 30, bottom: 40 },
          tooltip: { trigger: 'axis' },
          legend: { top: 0, itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11 } },
          xAxis: {
            type: 'category', data: byDate.map((x) => String(x.published_date).slice(5)),
            axisLabel: { fontSize: 10, color: '#909399', rotate: 45 }, axisLine: { lineStyle: { color: '#e4e7ed' } }
          },
          yAxis: [
            { type: 'value', name: 'izlenme', nameTextStyle: { fontSize: 10, color: '#909399' }, splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
            { type: 'value', name: '%', min: 0, max: 120, splitLine: { show: false }, axisLabel: { fontSize: 10, color: '#909399' } }
          ],
          series: [
            { name: 'Görüntülenme', type: 'bar', data: byDate.map((x) => x.views || 0), itemStyle: { color: '#c6e2ff' }, barMaxWidth: 14 },
            { name: 'Ortalama izlenme %', type: 'line', yAxisIndex: 1, smooth: true, data: byDate.map((x) => x.avg_view_pct), symbolSize: 5, lineStyle: { width: 2, color: '#409eff' }, itemStyle: { color: '#409eff' }, connectNulls: true },
            { name: '3. saniye %', type: 'line', yAxisIndex: 1, smooth: true, data: byDate.map((x) => x.hook_3s_pct), symbolSize: 4, lineStyle: { width: 1.6, color: '#67c23a', type: 'dashed' }, itemStyle: { color: '#67c23a' }, connectNulls: true }
          ]
        });

        const top = m.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 12).reverse();
        ui.draw(this, 'chartTop', {
          grid: { left: 186, right: 46, top: 12, bottom: 20 },
          tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: (p) => {
              const d = top[p[0].dataIndex];
              return `<b>${d.title.slice(0, 60)}…</b><br/>${d.views} izlenme<br/>Ort. izlenme %${d.avg_view_pct ?? '—'}<br/>${d.published_date}`;
            }
          },
          xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          yAxis: {
            type: 'category', data: top.map((x) => (x.title || '').slice(0, 40)),
            axisLabel: { fontSize: 10, color: '#606266', width: 176, overflow: 'truncate' }, axisLine: { lineStyle: { color: '#e4e7ed' } }
          },
          series: [{
            type: 'bar', data: top.map((x) => x.views || 0), barMaxWidth: 14,
            itemStyle: { color: '#409eff', borderRadius: [0, 3, 3, 0] },
            label: { show: true, position: 'right', fontSize: 10, color: '#909399' }
          }]
        });

        const withPct = m.filter((x) => x.avg_view_pct !== null && x.avg_view_pct !== undefined);
        ui.draw(this, 'chartScatter', {
          grid: { left: 46, right: 20, top: 20, bottom: 40 },
          tooltip: {
            formatter: (p) => {
              const d = withPct[p.dataIndex];
              return `<b>${(d.title || '').slice(0, 50)}</b><br/>Süre: ${d.duration_sec}s<br/>Ort. izlenme: %${d.avg_view_pct}<br/>İzlenme: ${d.views}`;
            }
          },
          xAxis: { name: 'süre (sn)', nameTextStyle: { fontSize: 10 }, type: 'value', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          yAxis: { name: 'ort. izlenme %', nameTextStyle: { fontSize: 10 }, type: 'value', max: 130, splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          series: [{
            type: 'scatter', symbolSize: 11,
            data: withPct.map((x) => [x.duration_sec, x.avg_view_pct]),
            itemStyle: { color: '#9b59b6', opacity: 0.75 }
          }]
        });
      }
    },
    mounted() {
      this.$nextTick(() => this.renderCharts());
      this._r = () => ui.resize(this);
      window.addEventListener('resize', this._r);
      if (!this.s.telemetry) this.s.loadTelemetry();
    },
    updated() { this.$nextTick(() => this.renderCharts()); },
    beforeUnmount() { window.removeEventListener('resize', this._r); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>YouTube Analitik</h2>
            <p>Drive'daki özel retansiyon raporundan canlı veri · {{ info['Dönem'] || '—' }} · hazırlanma {{ info['Hazırlanma (Türkiye)'] || '—' }}</p>
          </div>
          <div class="head-actions">
            <el-input v-model="search" size="small" clearable prefix-icon="Search" placeholder="Video ara" style="width:200px" />
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="s.loadTelemetry()">Yenile</el-button>
            <el-button size="small" type="primary" plain icon="DataAnalysis"
              @click="s.gh('/repos/' + s.repo + '/actions/workflows/retansiyon-raporu.yml/dispatches', {method:'POST', body:{ref:s.branch, inputs:{save_report:'true'}}}).then(()=>s.notify('success','Retansiyon raporu tetiklendi')).catch(e=>s.notify('error', e.message))">
              Raporu üret
            </el-button>
          </div>
        </div>

        <div class="grid c4" style="margin-bottom:14px">
          <div class="stat blue"><div class="bar"></div><div class="k">Toplam görüntülenme</div>
            <div class="v">{{ num(totals.views) }}</div><div class="d">{{ totals.count }} video · {{ shortsCount }} shorts / {{ longCount }} uzun</div></div>
          <div class="stat green"><div class="bar"></div><div class="k">Ortalama izlenme</div>
            <div class="v">{{ pct(totals.avgPct) }}</div><div class="d">video başına izlenen yüzde</div></div>
          <div class="stat orange"><div class="bar"></div><div class="k">3. saniye tutma</div>
            <div class="v">{{ pct(totals.avgHook) }}</div><div class="d">hook performansı (eğrisi olanlar)</div></div>
          <div class="stat grey"><div class="bar"></div><div class="k">İzlenme süresi</div>
            <div class="v">{{ num(totals.watchHours) }}<span style="font-size:14px"> sa</span></div>
            <div class="d">en iyi: {{ totals.best ? totals.best.views + ' izlenme' : '—' }}</div></div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><TrendCharts /></el-icon> Görüntülenme &amp; izlenme yüzdesi trendi</h3>
              <span class="sub">yayın tarihine göre</span></div>
            <div class="card-body"><div ref="chartTrend" class="chart tall"></div></div>
          </div>
          <div class="card">
            <div class="card-head"><h3><el-icon><Histogram /></el-icon> En çok izlenen 12 video</h3></div>
            <div class="card-body"><div ref="chartTop" class="chart tall"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><Aim /></el-icon> Süre / izlenme dağılımı</h3>
            <span class="sub">her nokta bir video</span></div>
          <div class="card-body"><div ref="chartScatter" class="chart"></div></div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><el-icon><List /></el-icon> Video metrikleri</h3>
            <el-radio-group v-model="typeFilter" size="small">
              <el-radio-button label="all">Tümü</el-radio-button>
              <el-radio-button label="short">Shorts</el-radio-button>
              <el-radio-button label="long">Uzun</el-radio-button>
            </el-radio-group>
            <el-switch v-model="curveOnly" size="small" active-text="Yalnız eğrisi olanlar" />
            <span class="sub" style="margin-left:auto">{{ rows.length }} kayıt</span>
          </div>
          <div class="card-body tight">
            <el-table :data="rows" size="small" height="460" style="width:100%">
              <el-table-column label="Video" min-width="300">
                <template #default="{ row }">
                  <div class="queue-title" :title="row.title">{{ row.title }}</div>
                  <div class="mono-sm" style="color:#b3bac5">{{ row.video_id }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Yayın" width="110" prop="published_date" sortable />
              <el-table-column label="Süre" width="86" sortable prop="duration_sec">
                <template #default="{ row }"><span class="mono-sm">{{ row.duration_sec ? row.duration_sec + ' sn' : '—' }}</span></template>
              </el-table-column>
              <el-table-column label="İzlenme" width="100" prop="views" sortable>
                <template #default="{ row }"><b class="small-num">{{ num(row.views) }}</b></template>
              </el-table-column>
              <el-table-column label="Ort. izlenme" width="118" prop="avg_view_pct" sortable>
                <template #default="{ row }">
                  <el-progress v-if="row.avg_view_pct != null" :percentage="Math.min(100, row.avg_view_pct)" :stroke-width="8"
                               :color="row.avg_view_pct >= 70 ? '#67c23a' : (row.avg_view_pct >= 40 ? '#e6a23c' : '#f56c6c')" />
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
              <el-table-column label="3s hook" width="90" prop="hook_3s_pct" sortable>
                <template #default="{ row }"><span class="mono-sm">{{ pct(row.hook_3s_pct) }}</span></template>
              </el-table-column>
              <el-table-column label="İz. süresi" width="100" prop="watch_time_min" sortable>
                <template #default="{ row }"><span class="mono-sm">{{ row.watch_time_min ? Math.round(row.watch_time_min) + ' dk' : '—' }}</span></template>
              </el-table-column>
              <el-table-column label="Eğri" width="90">
                <template #default="{ row }">
                  <span class="tag-status" v-if="curveIds.has(row.video_id)">
                    <span class="dot success"></span>
                    <span class="link-btn" @click="openCurve(row)">aç</span>
                  </span>
                  <span v-else class="muted" style="font-size:11px">{{ row.curve_status || 'yok' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="" width="70" fixed="right">
                <template #default="{ row }">
                  <el-button link size="small" type="primary" @click="openLink(row.url)">İzle</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><InfoFilled /></el-icon> Rapor notları</h3></div>
          <div class="card-body">
            <div v-for="(v, k) in info" :key="k" class="kv">
              <span class="k">{{ k }}</span><span class="v" style="font-weight:400;max-width:70%">{{ v }}</span>
            </div>
          </div>
        </div>
      </div>
    `
  };

  /* ============================ RETANSİYON ============================= */
  VIEWS.retention = {
    name: 'RetentionView',
    data() {
      return { s: store, selectedIds: [], focus: null };
    },
    computed: {
      retention() { return this.s.retention(); },
      curves() { return this.retention.curves || []; },
      curveMap() {
        const map = {};
        this.curves.forEach((c) => (map[c.video_id] = c));
        return map;
      },
      focusCurve() {
        if (this.focus && this.curveMap[this.focus]) return this.curveMap[this.focus];
        return this.curves[0] || null;
      },
      focusPoints() { return this.focusCurve ? this.focusCurve.points : []; },
      focusStats() {
        const pts = this.focusPoints;
        if (!pts.length) return null;
        const hook = pts.reduce((best, p) => (Math.abs(p.sec - 3) < Math.abs(best.sec - 3) ? p : best), pts[0]);
        const end = pts[pts.length - 1];
        const peak = pts.reduce((a, b) => (b.pct > a.pct ? b : a), pts[0]);
        const avg = pts.reduce((a, b) => a + b.pct, 0) / pts.length;
        return { hook, end, peak, avg };
      }
    },
    methods: {
      selAll() { this.selectedIds = this.curves.map((c) => c.video_id); },
      selNone() { this.selectedIds = []; },
      focusOn(id) { this.focus = id; this.$nextTick(() => { this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }); },
      render() {
        const sel = this.selectedIds.length ? this.curves.filter((c) => this.selectedIds.includes(c.video_id)) : this.curves.slice(0, 3);
        const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#9b59b6', '#00b7c2', '#d4a017', '#7b68ee', '#ff7f50'];
        ui.draw(this, 'chartOverlay', {
          color: colors,
          grid: { left: 52, right: 24, top: 30, bottom: 46 },
          tooltip: {
            trigger: 'axis',
            formatter: (params) => {
              const rows = params.slice(0, 9).map((p) => {
                const c = sel[p.seriesIndex] || {};
                return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>%${Number(p.value).toFixed(1)} · ${(c.title || '').slice(0, 34)}…`;
              });
              return `<b>${params[0].axisValue}%</b><br/>` + rows.join('<br/>');
            }
          },
          legend: { bottom: 0, type: 'scroll', itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 10 } },
          xAxis: {
            type: 'category', name: 'izlenen %', nameLocation: 'middle', nameGap: 26,
            data: (sel[0] ? sel[0].points : []).map((p) => String(Math.round(p.ratio))),
            axisLabel: { fontSize: 9, color: '#909399', interval: 9 }, axisLine: { lineStyle: { color: '#e4e7ed' } }
          },
          yAxis: { type: 'value', name: 'izleyici oranı %', nameTextStyle: { fontSize: 10 }, splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          series: sel.map((c) => ({
            name: (c.title || c.video_id).slice(0, 26),
            type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 1.8 },
            data: c.points.map((p) => p.pct)
          }))
        });

        const pts = this.focusPoints;
        ui.draw(this, 'chartFocus', {
          grid: { left: 58, right: 28, top: 30, bottom: 44 },
          tooltip: {
            trigger: 'axis',
            formatter: (p) => {
              const d = pts[p[0].dataIndex];
              return `<b>%${Math.round(d.ratio)}</b> noktası<br/>${d.sec} sn · izleyici oranı %${d.pct}`;
            }
          },
          xAxis: {
            type: 'category', name: 'video zamanı (sn)', nameLocation: 'middle', nameGap: 26,
            data: pts.map((p) => String(Math.round(p.sec))),
            axisLabel: { fontSize: 9, color: '#909399', interval: 9 }, axisLine: { lineStyle: { color: '#e4e7ed' } }
          },
          yAxis: { type: 'value', max: Math.max(120, Math.ceil(Math.max.apply(null, pts.map((p) => p.pct)) / 10) * 10), splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { fontSize: 10, color: '#909399' } },
          series: [{
            type: 'line', smooth: true, symbolSize: 4, showSymbol: false,
            data: pts.map((p) => p.pct),
            lineStyle: { width: 2.4, color: '#409eff' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(64,158,255,.35)' }, { offset: 1, color: 'rgba(64,158,255,.03)' }] } },
            markLine: {
              silent: true, symbol: 'none',
              data: [
                { yAxis: 100, lineStyle: { color: '#c0c4cc', type: 'dashed' }, label: { formatter: '%100', fontSize: 10, color: '#909399' } },
                { xAxis: 2, lineStyle: { color: '#67c23a', type: 'dotted' }, label: { formatter: '3. sn hook', fontSize: 10, color: '#67c23a', position: 'insideEndTop' } }
              ]
            }
          }]
        });
      }
    },
    mounted() {
      const m = (location.hash.match(/video=([\w-]+)/) || [])[1];
      this.focus = m || null;
      if (!this.selectedIds.length) this.selectedIds = this.curves.slice(0, 4).map((c) => c.video_id);
      this.$nextTick(() => this.render());
      this._r = () => ui.resize(this);
      window.addEventListener('resize', this._r);
    },
    updated() { this.$nextTick(() => this.render()); },
    beforeUnmount() { window.removeEventListener('resize', this._r); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Retansiyon Eğrileri</h2>
            <p>{{ retention.curve_count || 0 }} eğri · {{ retention.video_count || 0 }} video metriği · 1%–100% izleyici dağılımı</p>
          </div>
          <div class="head-actions">
            <el-button size="small" @click="selAll">Tümünü seç</el-button>
            <el-button size="small" @click="selNone">Temizle</el-button>
            <el-button size="small" icon="Refresh" :loading="s.telemetryBusy" @click="s.loadTelemetry()">Yenile</el-button>
          </div>
        </div>

        <div v-if="!curves.length" class="card"><div class="card-body empty-hint">Eğri verisi yok. Retansiyon raporu üretildiğinde burada görünür.</div></div>

        <template v-else>
          <div class="card">
            <div class="card-head">
              <h3><el-icon><DataLine /></el-icon> Eğri karşılaştırma</h3>
              <span class="sub">seçili {{ selectedIds.length }} / {{ curves.length }} · %100 üzeri = tekrar izleme</span>
            </div>
            <div class="card-body">
              <el-select v-model="selectedIds" multiple collapse-tags collapse-tags-tooltip size="small" style="width:100%;margin-bottom:10px"
                         placeholder="Karşılaştırılacak videoları seç">
                <el-option v-for="c in curves" :key="c.video_id" :label="c.title" :value="c.video_id" />
              </el-select>
              <div ref="chartOverlay" class="chart tall"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3><el-icon><View /></el-icon> Tek video eğrisi</h3>
              <el-select v-model="focus" size="small" filterable style="width:420px" placeholder="Video seç" @change="render">
                <el-option v-for="c in curves" :key="c.video_id" :label="c.title" :value="c.video_id" />
              </el-select>
            </div>
            <div class="card-body">
              <div class="grid c4" style="margin-bottom:10px" v-if="focusStats">
                <div class="stat green"><div class="bar"></div><div class="k">3. saniye tutma</div>
                  <div class="v">%{{ focusStats.hook.pct }}</div><div class="d">{{ focusStats.hook.sec }} sn noktası</div></div>
                <div class="stat blue"><div class="bar"></div><div class="k">Tepe nokta</div>
                  <div class="v">%{{ focusStats.peak.pct }}</div><div class="d">%{{ Math.round(focusStats.peak.ratio) }} noktasında</div></div>
                <div class="stat orange"><div class="bar"></div><div class="k">Ortalama</div>
                  <div class="v">%{{ focusStats.avg.toFixed(1) }}</div><div class="d">tüm noktalar</div></div>
                <div class="stat grey"><div class="bar"></div><div class="k">Son nokta</div>
                  <div class="v">%{{ focusStats.end.pct }}</div><div class="d">%100 · {{ focusStats.end.sec }} sn</div></div>
              </div>
              <div ref="chartFocus" class="chart tall"></div>
              <div class="flex" style="justify-content:space-between;margin-top:8px">
                <span class="muted">{{ focusCurve ? focusCurve.title : '' }}</span>
                <el-button size="small" link type="primary" @click="openLink('https://youtu.be/' + (focusCurve ? focusCurve.video_id : ''))">YouTube'da aç</el-button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3><el-icon><List /></el-icon> Eğri listesi</h3></div>
            <div class="card-body tight">
              <el-table :data="curves" size="small" style="width:100%" @row-click="(row) => focusOn(row.video_id)">
                <el-table-column label="Video" min-width="320">
                  <template #default="{ row }"><div class="queue-title" :title="row.title">{{ row.title }}</div></template>
                </el-table-column>
                <el-table-column label="Video ID" width="140"><template #default="{ row }"><span class="mono-sm">{{ row.video_id }}</span></template></el-table-column>
                <el-table-column label="Nokta" width="90"><template #default="{ row }">{{ row.points.length }}</template></el-table-column>
                <el-table-column label="3s" width="90">
                  <template #default="{ row }">
                    <span class="mono-sm" v-if="row.points.length">%{{ (row.points.find(p => p.sec >= 3) || row.points[0]).pct }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="Son nokta" width="100">
                  <template #default="{ row }"><span class="mono-sm" v-if="row.points.length">%{{ row.points[row.points.length-1].pct }}</span></template>
                </el-table-column>
                <el-table-column label="" width="120">
                  <template #default="{ row }">
                    <el-button link size="small" type="primary" @click.stop="focusOn(row.video_id)">İncele</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </template>
      </div>
    `
  };

  /* ============================ ZAMANLAYICI ============================ */
  VIEWS.scheduler = {
    name: 'SchedulerView',
    data() { return { s: store, now: Date.now() }; },
    computed: {
      rules() { return (this.s.telemetry && this.s.telemetry.schedule_rules) || {}; },
      week() {
        const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
        return days.map((d, i) => ({
          day: d,
          isFriday: d === 'Cuma',
          slots: [
            { time: '12:12', type: 'cold', label: 'Isınma (kuyruk gecikmesi önleyici)' },
            { time: '12:30', type: 'long', label: d === 'Cuma' ? 'Uzun video yayını' : 'Shorts yayını' },
            { time: '12:50', type: 'watch', label: 'Bekçi erken uyarı' },
            { time: '13:00', type: 'watch', label: 'Bekçi tescil / kurtarma' },
            { time: '19:12', type: 'cold', label: 'Isınma' },
            { time: '19:30', type: 'short', label: 'Shorts yayını' },
            { time: '19:50', type: 'watch', label: 'Bekçi erken uyarı' },
            { time: '20:00', type: 'watch', label: 'Bekçi tescil / kurtarma' }
          ]
        }));
      },
      upcoming() {
        const list = [];
        this.s.workflows.forEach((w) => {
          (w.crons || []).forEach((c) => {
            nextCronRuns(c, 4).forEach((d) => list.push({ wf: w.name, file: w.file, cron: c, at: d }));
          });
        });
        list.sort((a, b) => a.at - b.at);
        return list.slice(0, 14);
      },
      cronRows() {
        return this.s.workflows.filter((w) => (w.crons || []).length || w.file === 'retansiyon-raporu.yml');
      }
    },
    methods: {
      trTime, trClock, cronHuman, dur, runDuration, ui,
      fmt(ms) {
        if (ms === null || ms === undefined) return '—';
        const m = Math.floor(ms / 60000);
        if (m < 60) return m + ' dk';
        const h = Math.floor(m / 60);
        if (h < 48) return h + ' sa ' + (m % 60) + ' dk';
        return Math.floor(h / 24) + ' gün';
      },
      typeName(type) { return type === 'long' ? 'UZUN' : (type === 'short' ? 'SHORT' : (type === 'watch' ? 'bekçi' : 'ısınma')); },
      editCron(w) { this.s.openCronEditor(w); },
      trigger(w) { this.s.openDispatch(w); }
    },
    mounted() { this._t = setInterval(() => { this.now = Date.now(); }, 30000); },
    beforeUnmount() { clearInterval(this._t); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Zamanlayıcı &amp; Cron</h2>
            <p>Yayın slotları, bekçi zamanlamaları ve workflow cron tanımları · cron ifadeleri UTC, gösterim TR</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" :loading="s.booting" @click="s.loadWorkflows()">Cron'ları yenile</el-button>
            <el-button size="small" type="primary" plain icon="VideoPlay"
              @click="openLink('https://github.com/' + s.repo + '/actions')">Actions</el-button>
          </div>
        </div>

        <div class="alert-strip info">
          <el-icon><InfoFilled /></el-icon>
          <span>Kural: <b>Cuma 12:30 uzun video</b>, diğer günler ve her akşam 19:30 Shorts. Bekçi 12:50/13:00 ve 19:50/20:00'de durumu tescil eder ve gerekirse kurtarma yapar.</span>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><Calendar /></el-icon> Haftalık slot planı</h3>
            <span class="sub">Türkiye saati (UTC+3)</span></div>
          <div class="card-body">
            <div class="slot-grid">
              <div class="slot-day" v-for="d in week" :key="d.day">
                <div class="dh">
                  <span>{{ d.day }}</span>
                  <small v-if="d.isFriday">uzun gün</small>
                </div>
                <div class="slot-body">
                  <div v-for="(sl, i) in d.slots" :key="i" class="slot-chip" :class="sl.type">
                    <b>{{ sl.time }}</b> · {{ typeName(sl.type) }}
                    <div style="opacity:.75;font-size:10.5px">{{ sl.label }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><Timer /></el-icon> Yaklaşan tetikleyiciler</h3>
              <span class="sub">tüm cron'lar</span></div>
            <div class="card-body scroll-y">
              <div v-for="(u, i) in upcoming" :key="i" class="timeline-item">
                <span class="t mono-sm">{{ trTime(u.at.toISOString()) }}</span>
                <span style="flex:1;font-size:12px">{{ u.wf }}</span>
                <span class="mono-sm muted">{{ u.cron }}</span>
                <el-tag size="small" effect="plain" type="info">{{ fmt(u.at.getTime() - now) }}</el-tag>
              </div>
              <div v-if="!upcoming.length" class="empty-hint">Cron tanımı bulunamadı.</div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3><el-icon><Operation /></el-icon> Cron düzenleyici</h3>
              <span class="sub">doğrudan workflow dosyasına yazılır</span></div>
            <div class="card-body">
              <div v-for="w in cronRows" :key="w.id" style="border:1px solid #f0f2f5;border-radius:6px;padding:10px 12px;margin-bottom:8px">
                <div class="flex between">
                  <b style="font-size:12.5px">{{ w.name }}</b>
                  <el-button size="small" link type="primary" icon="Edit" @click="editCron(w)">Düzenle</el-button>
                </div>
                <div v-if="!(w.crons || []).length" class="muted" style="font-size:11.5px;margin-top:4px">cron yok · elle tetiklenir</div>
                <div v-for="c in w.crons" :key="c" class="flex" style="justify-content:space-between;margin-top:4px">
                  <span class="mono-sm">{{ c }}</span>
                  <span class="muted" style="font-size:11.5px">{{ cronHuman(c) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><Setting /></el-icon> Uygulanan kurallar</h3>
            <span class="sub">config + slot_guard</span></div>
          <div class="card-body">
            <div class="grid c2">
              <div>
                <div class="kv"><span class="k">Günlük slotlar (TR)</span><span class="v">{{ (rules.daily_slots_tr || []).join(' · ') }}</span></div>
                <div class="kv"><span class="k">Isınma tetikleri (TR)</span><span class="v">{{ (rules.prewarm_tr || []).join(' · ') }}</span></div>
                <div class="kv"><span class="k">Bekçi (TR)</span><span class="v">{{ (rules.watchdog_tr || []).join(' · ') }}</span></div>
                <div class="kv"><span class="k">Cuma 12:30</span><span class="v">{{ rules.friday_1230 === 'long' ? 'Uzun video' : rules.friday_1230 }}</span></div>
              </div>
              <div>
                <div class="kv"><span class="k">Cuma 19:30</span><span class="v">{{ rules.friday_1930 === 'short' ? 'Shorts' : rules.friday_1930 }}</span></div>
                <div class="kv"><span class="k">Diğer günler</span><span class="v">{{ rules.other_days === 'short' ? 'Shorts' : rules.other_days }}</span></div>
                <div class="kv"><span class="k">Kuyruk tabanı</span><span class="v">Short ≥ {{ rules.min_shorts_number ?? 155 }} · Uzun ≥ {{ rules.min_long_number ?? 8 }}</span></div>
                <div class="kv"><span class="k">Kapak üretimi / çapraz paylaşım</span>
                  <span class="v">{{ rules.cover_fallback_generation ? 'açık' : 'kapalı' }} / {{ rules.crosspost_enabled ? 'açık' : 'pasif' }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  };

  /* ============================== SİSTEM =============================== */
  VIEWS.system = {
    name: 'SystemView',
    data() { return { s: store, raw: '', showRaw: false }; },
    computed: {
      t() { return this.s.telemetry || {}; },
      ratePercent() {
        if (this.s.rate.limit === null || this.s.rate.limit === undefined) return 0;
        return Math.round(((this.s.rate.limit - this.s.rate.remaining) / this.s.rate.limit) * 100);
      },
      rateReset() { return this.s.rate.reset ? new Date(this.s.rate.reset).toISOString() : null; },
      folders() { return this.t.folders || {}; },
      claimsCount() { return (this.s.files.slotClaims || '').split('\n').filter((l) => l && l[0] !== '#').length; },
      uploadedCount() { return (this.s.files.uploaded || '').trim().split('\n').filter(Boolean).length; },
      statusReport() {
        try { return this.s.files.status ? JSON.parse(this.s.files.status) : null; } catch (e) { return null; }
      }
    },
    methods: {
      trTime, ago, bytes, ui,
      async load() {
        await Promise.all([this.s.loadTelemetry(), this.s.loadFiles(), this.s.loadWorkflows(), this.s.loadRuns()]);
        this.s.notify('success', 'Tüm canlı veriler yenilendi.');
      },
      downloadTelemetry() {
        const blob = new Blob([JSON.stringify(this.t, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'panel_telemetry.json';
        a.click();
        URL.revokeObjectURL(a.href);
      },
      showJson() { this.raw = JSON.stringify(this.t, null, 2); this.showRaw = true; }
    },
    mounted() { if (!this.s.files.status) this.s.loadFiles(); },
    template: `
      <div>
        <div class="page-head">
          <div>
            <h2>Sistem Durumu</h2>
            <p>Depo, erişim, telemetri ve dosya sağlığı · {{ s.repo }}@{{ s.branch }}</p>
          </div>
          <div class="head-actions">
            <el-button size="small" icon="Refresh" @click="load">Tümünü yenile</el-button>
            <el-button size="small" type="primary" plain icon="Download" @click="downloadTelemetry">Telemetri indir</el-button>
            <el-button size="small" icon="Document" @click="showJson">Ham JSON</el-button>
          </div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h3><el-icon><User /></el-icon> Erişim &amp; API</h3></div>
            <div class="card-body">
              <div class="kv"><span class="k">Oturum</span><span class="v">{{ s.user ? '@' + s.user.login : '—' }}</span></div>
              <div class="kv"><span class="k">Depo</span><span class="v mono-sm">{{ s.repo }}</span></div>
              <div class="kv"><span class="k">Dal</span><span class="v mono-sm">{{ s.branch }}</span></div>
              <div class="kv"><span class="k">Token durumu</span><span class="v"><el-tag size="small" type="success" effect="plain">geçerli · repo+workflow</el-tag></span></div>
              <div class="kv"><span class="k">API kotası</span>
                <span class="v" style="min-width:180px">
                  <el-progress :percentage="ratePercent" :stroke-width="10"
                    :color="ratePercent > 85 ? '#f56c6c' : (ratePercent > 60 ? '#e6a23c' : '#67c23a')" />
                  {{ s.rate.remaining }} / {{ s.rate.limit }} · sıfırlanma {{ rateReset ? trTime(rateReset) : '—' }}
                </span>
              </div>
              <div class="kv"><span class="k">Son otomatik yenileme</span><span class="v">{{ ago(new Date(s.lastAutoRefresh).toISOString()) }}</span></div>
              <div class="flex" style="margin-top:10px">
                <el-button size="small" type="danger" plain icon="SwitchButton" @click="s.logout()">Oturumu kapat</el-button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3><el-icon><DataLine /></el-icon> Telemetri</h3></div>
            <div class="card-body">
              <div class="kv"><span class="k">Üretildi</span><span class="v">{{ t.generated_at || '—' }}</span></div>
              <div class="kv"><span class="k">ISO</span><span class="v mono-sm">{{ t.generated_at_iso || '—' }}</span></div>
              <div class="kv"><span class="k">Kuyruk satırı</span><span class="v">{{ (t.active_queue || []).length }}</span></div>
              <div class="kv"><span class="k">Drive dosyası</span><span class="v">{{ (t.drive_inventory ? ((t.drive_inventory.shorts_videos||[]).length + (t.drive_inventory.shorts_covers||[]).length + (t.drive_inventory.long_videos||[]).length + (t.drive_inventory.long_covers||[]).length + (t.drive_inventory.ceo_files||[]).length) : 0) }}</span></div>
              <div class="kv"><span class="k">Retansiyon</span><span class="v">{{ (t.retention && t.retention.video_count) || 0 }} video · {{ (t.retention && t.retention.curve_count) || 0 }} eğri</span></div>
              <div class="kv"><span class="k">Tablo kimliği</span><span class="v mono-sm">{{ folders.table_file_id || 'ada göre çözülür' }}</span></div>
              <div class="flex" style="margin-top:10px">
                <el-button size="small" @click="openLink('https://github.com/' + s.repo + '/blob/main/panel_telemetry.json')">Depoda gör</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><FolderOpened /></el-icon> Drive klasör kimlikleri</h3>
            <span class="sub">YOUTUBE_OTOMASYON ağacı</span></div>
          <div class="card-body">
            <el-table :data="Object.entries(folders).map(([k, v]) => ({ key: k, id: v }))" size="small" style="width:100%">
              <el-table-column label="Anahtar" width="200" prop="key" />
              <el-table-column label="Klasör / dosya kimliği" min-width="300">
                <template #default="{ row }"><span class="mono-sm">{{ row.id || '—' }}</span></template>
              </el-table-column>
              <el-table-column label="" width="110">
                <template #default="{ row }">
                  <el-button v-if="row.id" link size="small" type="primary" @click="openLink('https://drive.google.com/drive/folders/' + row.id)">Aç</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3><el-icon><Document /></el-icon> Durum dosyaları</h3></div>
          <div class="card-body">
            <div class="kv"><span class="k">force_next_video.txt</span><span class="v mono-sm">{{ (s.files.force || '').trim() || 'boş' }}</span></div>
            <div class="kv"><span class="k">repair_video.json</span><span class="v mono-sm">{{ (s.files.repair || '').trim() ? 'dolu' : 'boş' }}</span></div>
            <div class="kv"><span class="k">slot_claims.txt</span><span class="v mono-sm">{{ claimsCount }} talep</span></div>
            <div class="kv"><span class="k">uploaded.txt</span><span class="v mono-sm">{{ uploadedCount }} kayıt</span></div>
            <div class="kv"><span class="k">status_report.json</span>
              <span class="v">{{ statusReport ? statusReport.overall_label + ' · ' + statusReport.updated_at : '—' }}</span></div>
          </div>
        </div>

        <el-dialog v-model="showRaw" title="panel_telemetry.json" width="72%">
          <pre class="log-box" style="max-height:64vh">{{ raw }}</pre>
        </el-dialog>
      </div>
    `
  };

  /* uygulamayı başlat (tüm görünümler kayıtlı) */
  window.dispatchEvent(new Event('panel-views-ready'));
  if (document.readyState === 'complete') { /* load zaten tetiklendi */ }
})();
