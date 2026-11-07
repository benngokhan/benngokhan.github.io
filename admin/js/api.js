/* ============================================================================
   Bilgi Dozu · Otomasyon Kontrol Merkezi — çekirdek (auth + canlı GitHub API)
   100% gerçek veri: GitHub Actions API, repo içeriği ve panel_telemetry.json
   ========================================================================== */
(function () {
  'use strict';

  const CFG = {
    owner: 'benngokhan',
    repo: 'yt_auto_uploader',
    branch: 'main',
    pagesRepo: 'benngokhan.github.io',
    api: 'https://api.github.com',
    telemetryPath: 'panel_telemetry.json',
    tablePath: 'bilgidozu_yukleme_tablosu.xlsx',
    forceNextPath: 'force_next_video.txt',
    repairPath: 'repair_video.json',
    slotClaimsPath: 'slot_claims.txt',
    uploadedPath: 'uploaded.txt',
    statusPath: 'status_report.json',
    uyariPath: 'api_uyarilari.json',
    workflowsDir: '.github/workflows'
  };

  /* --- Şifre kasası: PAT, AES-256-GCM + PBKDF2(100k) ile sarılıdır --------- */
  const VAULT = [
    { s: 'slqUfK6K/Tc/yqnXOVCsmQ==', i: 'ttxWDrdbB5ug+hP6', c: '1nh47Pzm7GRQ2FcNsnMSQnYnAEBUIVh0cdJisG5/a+Lzs9hyrSPJTo4sbL/ye2N/m3WTypo9waWLARvSJjM9xeiNqqsn1bdtDwViZZ6mHOUXiAv6ciKVeW43q63HpzYCcGUNuKHVEtjZ9K7Lng==' },
    { s: '7pKGiBDlMhncgYTa8a2bow==', i: 'pA4rXP1+JUkLCR2L', c: 'ut2s0zBu5SUOkdTH2JjI//+pph63+5lydt3T4O/vXz9pESTTk1RyxwttnjgU+kiyXs1nIW9RkNDKBsesuEAL3oPHqrTWQnT8pkb+vxemGmUNekfSfRPxEJ95lTV9Tshg48B8TbMZ652eRvnasg==' },
    { s: 'dysQ7si6x0Ywt287la0WlQ==', i: 'Uy67dA0zO86t1TKU', c: 'Tm7JHXa40EcuygB6QwiPvCgYDrnNXRgXZ/nf4ySTDxjsDKRVMYTlkIF2ffNb/qmxBz+HW/SeuG13ER/AGDlzIDrrE7c6JtJDq5HUUoUTArPftfCS95L5RbNicjpDwtdod9uodNIUbJmhx0Ux/g==' }
  ];

  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  async function decryptVault(password) {
    const subtle = (window.crypto && window.crypto.subtle) || null;
    if (!subtle) throw new Error('Tarayıcı WebCrypto desteklemiyor. Modern tarayıcı kullanın.');
    const enc = new TextEncoder();
    for (const entry of VAULT) {
      try {
        const salt = b64ToBytes(entry.s);
        const iv = b64ToBytes(entry.i);
        const baseKey = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: entry.it || 100000, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, b64ToBytes(entry.c));
        const token = new TextDecoder().decode(plain).trim();
        if (token) return token;
      } catch (e) {
        /* yanlış şifre -> sonraki kayıt */
      }
    }
    return null;
  }

  /* --- Yardımcılar -------------------------------------------------------- */
  const TR = 'Europe/Istanbul';
  const pad = (n) => String(n).padStart(2, '0');

  function trTime(iso, withDate = true) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const f = new Intl.DateTimeFormat('tr-TR', {
      timeZone: TR, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: withDate ? '2-digit' : undefined, hour12: false
    });
    const parts = {};
    f.formatToParts(d).forEach((p) => (parts[p.type] = p.value));
    const time = `${parts.hour}:${parts.minute}${withDate && parts.second ? ':' + parts.second : ''}`;
    return withDate ? `${parts.day}.${parts.month}.${parts.year} ${time}` : time;
  }

  function trClock(iso) {
    if (!iso) return '—';
    return trTime(iso, false);
  }

  function ago(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 0) return 'şimdi';
    if (diff < 60) return diff + ' sn önce';
    const m = Math.floor(diff / 60);
    if (m < 60) return m + ' dk önce';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' sa ' + (m % 60) + ' dk önce';
    return Math.floor(h / 24) + ' gün önce';
  }

  function dur(sec) {
    if (sec === null || sec === undefined) return '—';
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return s + ' sn';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return m + ' dk ' + pad(r) + ' sn';
    return Math.floor(m / 60) + ' sa ' + pad(m % 60) + ' dk';
  }

  function runDuration(run) {
    if (!run || !run.run_started_at) return null;
    const end = run.updated_at ? new Date(run.updated_at) : new Date();
    return (end - new Date(run.run_started_at)) / 1000;
  }

  function bytes(n) {
    if (!n) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = Number(n);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(i === 0 || v >= 100 ? 0 : 1) + ' ' + u[i];
  }

  /* --- Cron yardımcıları (GitHub Actions daima UTC) ---------------------- */
  function parseCronField(field, min, max) {
    const out = new Set();
    (field || '*').split(',').forEach((chunk) => {
      const part = chunk.trim();
      if (!part) return;
      let step = 1, range = part;
      if (part.includes('/')) {
        const [r, st] = part.split('/');
        range = r;
        step = parseInt(st, 10) || 1;
      }
      let lo = min, hi = max;
      if (range !== '*') {
        if (range.includes('-')) {
          const [a, b] = range.split('-');
          lo = parseInt(a, 10); hi = parseInt(b, 10);
        } else {
          lo = hi = parseInt(range, 10);
          if (step > 1) hi = max;
        }
      }
      if (isNaN(lo) || isNaN(hi)) return;
      for (let v = lo; v <= hi; v += step) out.add(v);
    });
    return out;
  }

  function nextCronRuns(expr, count = 4, fromDate = new Date()) {
    const parts = String(expr || '').trim().split(/\s+/);
    if (parts.length < 5) return [];
    const minutes = parseCronField(parts[0], 0, 59);
    const hours = parseCronField(parts[1], 0, 23);
    const doms = parseCronField(parts[2], 1, 31);
    const months = parseCronField(parts[3], 1, 12);
    const dows = parseCronField(parts[4], 0, 6);
    const domStar = parts[2] === '*';
    const dowStar = parts[4] === '*';
    const results = [];
    const d = new Date(Math.ceil(fromDate.getTime() / 60000) * 60000);
    d.setUTCSeconds(0, 0);
    for (let i = 0; i < 60 * 24 * 120 && results.length < count; i++) {
      const okHour = hours.has(d.getUTCHours());
      const okDom = doms.has(d.getUTCDate());
      const okMonth = months.has(d.getUTCMonth() + 1);
      const okDow = dows.has(d.getUTCDay());
      let okDay;
      if (domStar && dowStar) okDay = true;
      else if (domStar) okDay = okDow;
      else if (dowStar) okDay = okDom;
      else okDay = okDom || okDow;
      if (okHour && okMonth && okDay && minutes.has(d.getUTCMinutes())) results.push(new Date(d));
      d.setUTCMinutes(d.getUTCMinutes() + 1);
    }
    return results;
  }

  function nextCronRun(expr) {
    const list = nextCronRuns(expr, 1);
    return list.length ? list[0] : null;
  }

  const DOW_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

  function cronHuman(expr) {
    const p = String(expr || '').trim().split(/\s+/);
    if (p.length < 5) return 'geçersiz';
    const [mi, ho, , , dw] = p;
    let timeStr = '';
    if (mi === '*' && ho === '*') timeStr = 'her dakika';
    else if (/^\*\/\d+$/.test(mi) && ho === '*') timeStr = `her ${mi.split('/')[1]} dakikada bir`;
    else if (/^\d+$/.test(mi) && /^\d+$/.test(ho)) {
      const h = (parseInt(ho, 10) + 3) % 24;
      timeStr = `${pad(h)}:${pad(parseInt(mi, 10))} TR`;
    } else if (ho === '*') timeStr = `saat ${mi}. dakikada`;
    else timeStr = `${mi} ${ho} (UTC)`;
    let dayStr = 'her gün';
    if (dw === '1-5') dayStr = 'hafta içi';
    else if (dw !== '*') {
      const map = { 0: 'Pazar', 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt' };
      dayStr = dw.split(',').map((x) => map[x] || x).join(', ') + ' günü';
    }
    return `${timeStr} · ${dayStr}`;
  }

  /* --- GitHub istemcisi --------------------------------------------------- */
  const store = Vue.reactive({
    token: '',
    authed: false,
    loginBusy: false,
    loginError: '',
    remember: false,

    repo: CFG.owner + '/' + CFG.repo,
    branch: CFG.branch,
    view: 'dashboard',
    sidebarCollapsed: false,
    booting: false,
    lastError: '',
    rate: { remaining: null, limit: null, reset: null },
    user: null,

    telemetry: null,
    telemetryLoadedAt: 0,
    telemetryBusy: false,

    apiUyarilari: [],
    apiUyariOzet: {},
    apiUyariBusy: false,

    workflows: [],
    workflowsLoadedAt: 0,
    runs: [],
    runsTotal: 0,
    runsPage: 1,
    runsBusy: false,
    runsFilter: 'all',
    runDetailOpen: false,
    selectedRun: null,
    jobs: [],
    jobsBusy: false,
    logs: {},
    logBusy: false,
    logJobId: null,
    logFilter: '',

    files: { force: null, repair: null, slotClaims: null, uploaded: null, status: null },
    filesBusy: false,

    wb: { loaded: false, sheets: {}, names: [], active: 'DRIVE', sha: '', dirty: false, busy: false, meta: {}, origB64: '', backupDone: false },

    dispatchOpen: false,
    dispatchWorkflow: null,
    dispatchInputs: {},
    dispatchBusy: false,

    cronDialog: false,
    cronWorkflow: null,
    cronDraft: [],

    lastAutoRefresh: 0,
    tick: 0,

    /* --- oturum güvenliği: 30 dk boşta kalınca kilitlen ---------------------- */
    idleLimitMs: 30 * 60 * 1000,
    idleTimer: null,
    _idleTouch: null,
    startIdleWatch() {
      this.stopIdleWatch();
      const reset = () => {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
          if (this.authed) {
            this.logout();
            this.notify('warning', '30 dakika işlem yapılmadı — güvenlik için oturum kapatıldı.');
          }
        }, this.idleLimitMs);
      };
      this._idleTouch = reset;
      ['click', 'keydown', 'touchstart', 'scroll'].forEach((e) =>
        document.addEventListener(e, reset, { passive: true })
      );
      reset();
    },
    stopIdleWatch() {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = null;
      if (this._idleTouch) {
        ['click', 'keydown', 'touchstart', 'scroll'].forEach((e) =>
          document.removeEventListener(e, this._idleTouch)
        );
        this._idleTouch = null;
      }
    },

    notify(type, message) {
      try {
        ElementPlus.ElMessage({ type, message, duration: type === 'error' ? 6000 : 3200, showClose: true, grouping: true });
      } catch (e) { console.log('[notify]', type, message); }
    },

    async login(password, remember) {
      this.loginBusy = true;
      this.loginError = '';
      try {
        const token = await decryptVault(password);
        if (!token) throw new Error('Şifre hatalı. Erişim reddedildi.');
        this.token = token;
        const me = await this.gh('/user');
        this.user = me;
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('bd_panel_token', token);
        this.authed = true;
        this.loginBusy = false;
        this.startIdleWatch();
        // Girişi telemetri yüklemesine bağlama: panel hemen açılsın,
        // canlı veriler arka planda yüklensin.
        this.bootstrap().catch((e) => {
          this.lastError = e.message || String(e);
          this.notify('error', 'Canlı veriler yüklenemedi: ' + this.lastError);
        });
        return true;
      } catch (e) {
        this.loginError = (e && String(e.message || e).toLowerCase().includes('bad credentials'))
          ? 'Panel şifresi doğru; kayıtlı GitHub PAT geçersiz veya iptal edilmiş.'
          : (e.message || String(e));
        this.token = '';
        this.authed = false;
        this.loginBusy = false;
        return false;
      }
    },

    restoreSession() {
      const token = sessionStorage.getItem('bd_panel_token') || localStorage.getItem('bd_panel_token');
      if (!token) return false;
      this.token = token;
      this.authed = true;
      return true;
    },

    logout() {
      this.stopIdleWatch();
      sessionStorage.removeItem('bd_panel_token');
      localStorage.removeItem('bd_panel_token');
      this.token = '';
      this.authed = false;
      this.telemetry = null;
      this.workflows = [];
      this.runs = [];
      this.selectedRun = null;
      this.jobs = [];
      this.logs = {};
      this.wb = { loaded: false, sheets: {}, names: [], active: 'DRIVE', sha: '', dirty: false, busy: false, meta: {} };
      this.files = { force: null, repair: null, slotClaims: null, uploaded: null, status: null };
      location.hash = '#/login';
    },

    async gh(path, opts) {
      const o = opts || {};
      const headers = Object.assign(
        {
          Authorization: 'Bearer ' + this.token,
          Accept: o.accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        o.headers || {}
      );
      if (o.body && !o.accept) headers['Content-Type'] = 'application/json';
      const res = await fetch(CFG.api + path, {
        method: o.method || 'GET',
        headers,
        body: o.body ? JSON.stringify(o.body) : undefined,
        cache: 'no-store',
        redirect: o.redirect || 'follow'
      });
      const rl = {
        remaining: res.headers.get('x-ratelimit-remaining'),
        limit: res.headers.get('x-ratelimit-limit'),
        reset: res.headers.get('x-ratelimit-reset')
      };
      if (rl.remaining !== null) this.rate = { remaining: Number(rl.remaining), limit: Number(rl.limit), reset: Number(rl.reset) * 1000 };
      if (res.status === 204) return null;
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          msg = j.message || msg;
          if (j.errors && j.errors.length) msg += ' — ' + j.errors.map((e) => e.message || e.code).join(', ');
        } catch (e) { /* ignore */ }
        if (res.status === 401) { this.logout(); this.loginError = 'Oturum anahtarı geçersiz (401). Yeniden giriş yapın.'; }
        throw new Error(msg);
      }
      if (o.accept === 'application/vnd.github.raw') return await res.text();
      return await res.json();
    },

    async bootstrap() {
      this.booting = true;
      this.lastError = '';
      try {
        await Promise.allSettled([this.loadTelemetry(), this.loadWorkflows(), this.loadRuns(), this.loadFiles(), this.loadApiUyarilari()]);
      } finally {
        this.booting = false;
        this.lastAutoRefresh = Date.now();
      }
    },

    /* --- Telemetri (30 dk'lık işçi döngüsü çıktısı) --------------------- */
    async loadTelemetry(silent) {
      this.telemetryBusy = true;
      try {
        const txt = await this.gh(
          `/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.telemetryPath}?ref=${CFG.branch}`,
          { accept: 'application/vnd.github.raw' }
        );
        const data = JSON.parse(txt);
        this.telemetry = data;
        this.telemetryLoadedAt = Date.now();
        return data;
      } catch (e) {
        if (!silent) this.notify('error', 'Telemetri okunamadı: ' + e.message);
        return null;
      } finally {
        this.telemetryBusy = false;
      }
    },

    /* --- İş akışları (cron + dispatch girdileri) ------------------------ */
    async loadWorkflows() {
      const res = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/workflows?per_page=100`);
      const list = (res.workflow_runs || res.workflows || []).slice();
      const enriched = await Promise.all(
        list.map(async (w) => {
          const file = (w.path || '').split('/').pop();
          let raw = '';
          try {
            raw = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${w.path}?ref=${CFG.branch}`, {
              accept: 'application/vnd.github.raw'
            });
          } catch (e) { /* ignore */ }
          const crons = [];
          const cronRe = /-\s*cron:\s*["']([^"']+)["']/g;
          let m;
          while ((m = cronRe.exec(raw)) !== null) crons.push(m[1]);
          return Object.assign({}, w, {
            file,
            raw,
            crons,
            inputs: parseDispatchInputs(raw),
            sha: null
          });
        })
      );
      this.workflows = enriched.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      this.workflowsLoadedAt = Date.now();
      return this.workflows;
    },

    /* --- Çalıştırmalar -------------------------------------------------- */
    async loadRuns(page) {
      this.runsBusy = true;
      if (page) this.runsPage = page;
      try {
        const res = await this.gh(
          `/repos/${CFG.owner}/${CFG.repo}/actions/runs?per_page=50&page=${this.runsPage}`
        );
        this.runs = res.workflow_runs || [];
        this.runsTotal = res.total_count || 0;
        return this.runs;
      } catch (e) {
        this.notify('error', 'Çalıştırmalar alınamadı: ' + e.message);
        return [];
      } finally {
        this.runsBusy = false;
      }
    },

    async openRun(runId) {
      const run = this.runs.find((r) => r.id === runId) || { id: runId };
      this.selectedRun = run;
      this.runDetailOpen = true;
      this.jobs = [];
      this.jobsBusy = true;
      try {
        const full = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/runs/${runId}`);
        this.selectedRun = full;
        const jr = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/runs/${runId}/jobs?per_page=50`);
        this.jobs = (jr.jobs || []).map((j) => Object.assign({}, j, { open: true }));
      } catch (e) {
        this.notify('error', 'Detay alınamadı: ' + e.message);
      } finally {
        this.jobsBusy = false;
      }
    },

    async refreshSelectedRun() {
      if (!this.selectedRun || !this.selectedRun.id) return;
      const id = this.selectedRun.id;
      try {
        const full = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/runs/${id}`);
        this.selectedRun = full;
        const jr = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/runs/${id}/jobs?per_page=50`);
        this.jobs = (jr.jobs || []).map((j, i) => Object.assign({}, j, { open: (this.jobs[i] || {}).open !== false }));
      } catch (e) { /* sessiz */ }
    },

    async loadLogs(job) {
      this.logJobId = job.id;
      this.logBusy = true;
      try {
        const res = await fetch(`${CFG.api}/repos/${CFG.owner}/${CFG.repo}/actions/jobs/${job.id}/logs`, {
          headers: { Authorization: 'Bearer ' + this.token, Accept: 'application/vnd.github+json' },
          redirect: 'follow'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 410 ? ' (log süresi dolmuş)' : ''));
        const text = await res.text();
        this.logs[job.id] = text;
      } catch (e) {
        this.logs[job.id] = null;
        this.notify('warning', 'Adım logu doğrudan alınamadı: ' + e.message + ' — adım listesi yukarıda. Logu indirmek için bağlantıyı kullanın.');
      } finally {
        this.logBusy = false;
      }
    },

    logHtml(jobId) {
      const txt = this.logs[jobId];
      if (!txt) return '';
      const lines = txt.split('\n');
      const tail = lines.length > 3000 ? lines.slice(-3000) : lines;
      const filter = (this.logFilter || '').toLowerCase();
      const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const out = [];
      tail.forEach((line) => {
        const m = line.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s?(.*)$/);
        const time = m ? m[1].slice(11, 19) : '';
        let body = m ? m[2] : line;
        if (filter && body.toLowerCase().indexOf(filter) === -1) return;
        let cls = '';
        if (body.indexOf('##[group]') !== -1) { cls = 'grp'; body = body.replace('##[group]', '▸ '); }
        else if (/##\[error\]|\berror\b|\bERROR\b|Traceback|FAILED/.test(body)) cls = 'err';
        else if (/##\[warning\]|\bWARNING\b|uyarı|UYARI/.test(body)) cls = 'warn';
        else if (/success|SUCCESS|Başarılı|yayınlandı|OK\b|tamamlandı/.test(body)) cls = 'ok';
        const clean = esc(body).replace(/##\[endgroup\]/g, '');
        if (!clean.trim()) return;
        out.push('<div class="' + cls + '">' + (time ? '<span style="color:#6a6a6a">' + time + '</span> ' : '') + clean + '</div>');
      });
      return out.join('') + '<div style="color:#6a6a6a;padding-top:6px">— ' + lines.length + ' satır (son ' + tail.length + ' gösteriliyor)</div>';
    },

    async cancelRun(runId) {
      await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/runs/${runId}/cancel`, { method: 'POST', body: {} });
      this.notify('success', 'İptal isteği gönderildi.');
      setTimeout(() => this.refreshSelectedRun(), 2500);
    },

    async rerun(runId, failedOnly) {
      await this.gh(
        `/repos/${CFG.owner}/${CFG.repo}/actions/runs/${runId}/${failedOnly ? 'rerun-failed-jobs' : 'rerun'}`,
        { method: 'POST', body: {} }
      );
      this.notify('success', 'Yeniden çalıştırma kuyruğa alındı.');
      setTimeout(() => this.loadRuns(), 4000);
    },

    /* --- Tetikleme ------------------------------------------------------ */
    openDispatch(workflow) {
      this.dispatchWorkflow = workflow;
      const inputs = {};
      (workflow.inputs || []).forEach((i) => {
        if (i.type === 'boolean') inputs[i.name] = i.default === 'true' || i.default === true;
        else inputs[i.name] = i.default !== undefined ? i.default : '';
      });
      this.dispatchInputs = inputs;
      this.dispatchOpen = true;
    },

    async runDispatch() {
      const w = this.dispatchWorkflow;
      if (!w) return;
      this.dispatchBusy = true;
      try {
        const body = { ref: CFG.branch };
        const filled = {};
        Object.keys(this.dispatchInputs).forEach((k) => {
          let v = this.dispatchInputs[k];
          if (typeof v === 'boolean') v = v ? 'true' : 'false';
          if (v !== '' && v !== null && v !== undefined) filled[k] = v;
        });
        if (Object.keys(filled).length) body.inputs = filled;
        await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/workflows/${w.file}/dispatches`, { method: 'POST', body });
        this.notify('success', `${w.name} tetiklendi (ref: ${CFG.branch}).`);
        this.dispatchOpen = false;
        setTimeout(() => this.loadRuns(), 4000);
      } catch (e) {
        this.notify('error', 'Tetiklenemedi: ' + e.message);
      } finally {
        this.dispatchBusy = false;
      }
    },

    /* Binary dosyayı blob URL olarak aç (özel repoda ses/görsel oynatmak için) */
    async getMediaUrl(path) {
      const res = await fetch(`${CFG.api}/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${CFG.branch}`, {
        headers: { Authorization: 'Bearer ' + this.token, Accept: 'application/vnd.github.raw' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return URL.createObjectURL(await res.blob());
    },

    /* repository_dispatch — gizli veri (ör. API anahtarı) git geçmişine yazılmadan CI'ya gider */
    async repoDispatch(eventType, payload) {
      return this.gh(`/repos/${CFG.owner}/${CFG.repo}/dispatches`, {
        method: 'POST',
        body: { event_type: eventType, client_payload: payload || {} }
      });
    },

    async setWorkflowEnabled(workflow, enabled) {
      try {
        await this.gh(
          `/repos/${CFG.owner}/${CFG.repo}/actions/workflows/${workflow.id}/${enabled ? 'enable' : 'disable'}`,
          { method: 'PUT', body: {} }
        );
        workflow.state = enabled ? 'active' : 'disabled_manually';
        this.notify('success', `${workflow.name} ${enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`);
      } catch (e) {
        this.notify('error', 'Durum değiştirilemedi: ' + e.message);
      }
    },

    /* --- Dosya işlemleri (repo) ---------------------------------------- */
    async getContent(path) {
      const res = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${CFG.branch}`);
      return res;
    },

    async getRawText(path) {
      try {
        return await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${CFG.branch}`, {
          accept: 'application/vnd.github.raw'
        });
      } catch (e) {
        if (/HTTP 404/.test(e.message)) return null;
        throw e;
      }
    },

    async commitText(path, text, message, sha) {
      const body = {
        message: message,
        content: btoa(unescape(encodeURIComponent(text))),
        branch: CFG.branch
      };
      if (sha) body.sha = sha;
      return this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, { method: 'PUT', body });
    },

    /* Binary (kapak görseli) commit — base64 gövde doğrudan gönderilir */
    async commitBinary(path, base64, message) {
      let sha = null;
      try {
        const cur = await this.getContent(path);
        sha = cur.sha;
      } catch (e) { /* dosya yok -> oluştur */ }
      const body = { message: message, content: base64, branch: CFG.branch };
      if (sha) body.sha = sha;
      return this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, { method: 'PUT', body });
    },

    async saveTextFile(path, text, message) {
      let sha = null;
      try {
        const cur = await this.getContent(path);
        sha = cur.sha;
      } catch (e) { /* dosya yok -> oluştur */ }
      return this.commitText(path, text, message, sha);
    },

    async loadApiUyarilari(silent) {
      this.apiUyariBusy = true;
      try {
        const txt = await this.getRawText(CFG.uyariPath);
        if (!txt) { this.apiUyarilari = []; this.apiUyariOzet = {}; return; }
        const d = JSON.parse(txt);
        this.apiUyarilari = d.uyarilar || [];
        this.apiUyariOzet = d.ozet || {};
      } catch (e) {
        if (!silent) { this.apiUyarilari = []; this.apiUyariOzet = {}; }
      } finally {
        this.apiUyariBusy = false;
      }
    },

    async loadFiles() {
      this.filesBusy = true;
      const get = async (p) => {
        try { return await this.getRawText(p); } catch (e) { return null; }
      };
      try {
        const [force, repair, slotClaims, uploaded, status] = await Promise.all([
          get(CFG.forceNextPath),
          get(CFG.repairPath),
          get(CFG.slotClaimsPath),
          get(CFG.uploadedPath),
          get(CFG.statusPath)
        ]);
        this.files = { force, repair, slotClaims, uploaded, status };
      } finally {
        this.filesBusy = false;
      }
    },

    async writeForceNext(filename) {
      const body = (filename || '').trim();
      await this.saveTextFile(
        CFG.forceNextPath,
        body ? body + '\n' : '',
        body ? `chore(panel): siradaki video kilidi -> ${body}` : 'chore(panel): siradaki video kilidi temizlendi'
      );
      await this.loadFiles();
      this.notify('success', body ? `Sıradaki video kilidi: ${body}` : 'Sıra kilidi temizlendi (otomatik sıra).');
    },

    async saveRepair(jsonText) {
      JSON.parse(jsonText); // doğrulama
      await this.saveTextFile(CFG.repairPath, jsonText.replace(/\s+$/, '') + '\n', 'chore(panel): video onarim talebi guncellendi [skip ci]');
      await this.loadFiles();
      this.notify('success', 'repair_video.json kaydedildi — sonraki yükleme çalıştırmasında uygulanacak.');
    },

    /* --- Cron düzenleme (gerçek workflow dosyası) ---------------------- */
    async openCronEditor(workflow) {
      this.cronWorkflow = workflow;
      this.cronDraft = (workflow.crons || []).slice();
      if (!this.cronDraft.length) this.cronDraft = [''];
      this.cronDialog = true;
    },

    async saveCron() {
      const w = this.cronWorkflow;
      if (!w) return;
      const cleaned = this.cronDraft.map((c) => (c || '').trim()).filter(Boolean);
      for (const c of cleaned) {
        if (c.split(/\s+/).length !== 5) {
          this.notify('error', `Geçersiz cron: "${c}" (5 alan olmalı)`);
          return;
        }
      }
      try {
        const cur = await this.getContent(w.path);
        const raw = decodeURIComponent(escape(atob(cur.content.replace(/\n/g, ''))));
        let updated = raw;
        // Bilinen cron satırlarını sırayla değiştir
        const existing = [];
        const re = /(\s*-\s*cron:\s*)(["'])([^"']+)\2/g;
        let m;
        while ((m = re.exec(raw)) !== null) existing.push({ full: m[0], prefix: m[1], q: m[2], value: m[3] });
        if (existing.length) {
          let i = 0;
          updated = raw.replace(re, (all, prefix, q) => {
            const v = cleaned[i] !== undefined ? cleaned[i] : existing[i].value;
            i++;
            return `${prefix}${q}${v}${q}`;
          });
          for (; i < cleaned.length; i++) {
            updated = updated.replace(/\n(\s*)schedule:\s*\n/, `\n$1schedule:\n$1  - cron: "${cleaned[i]}"\n`);
          }
        } else if (cleaned.length) {
          updated = raw.replace(/\non:\n/, `\non:\n  schedule:\n    - cron: "${cleaned[0]}"\n`);
        }
        if (updated === raw) {
          this.notify('warning', 'Değişiklik algılanmadı.');
          return;
        }
        await this.commitText(w.path, updated, `chore(cron): ${w.file} zamanlamasi panelden guncellendi [skip ci]`, cur.sha);
        this.notify('success', 'Cron zamanlaması güncellendi ve commit edildi. GitHub yeni zamanlamayı birkaç dakikada devreye alır.');
        this.cronDialog = false;
        await this.loadWorkflows();
      } catch (e) {
        this.notify('error', 'Cron güncellenemedi: ' + e.message);
      }
    },

    /* --- Excel tablosu (SheetJS <-> repo <-> Drive) --------------------- */
    async loadWorkbook(force) {
      if (this.wb.loaded && !force) return;
      this.wb.busy = true;
      try {
        const res = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.tablePath}?ref=${CFG.branch}`);
        const bin = atob(res.content.replace(/\n/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
        const sheets = {};
        workbook.SheetNames.forEach((name) => {
          sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '' });
        });
        const active = sheets['DRIVE'] ? 'DRIVE' : (workbook.SheetNames.find((n) => !n.startsWith('#')) || workbook.SheetNames[0]);
        this.wb = {
          loaded: true,
          sheets,
          names: workbook.SheetNames,
          active,
          sha: res.sha,
          dirty: false,
          busy: false,
          meta: { size: res.size, updated: res.commit ? res.commit.author.date : null, commit: res.commit || null },
          origB64: res.content.replace(/\n/g, ''),
          book: workbook
        };
      } catch (e) {
        this.notify('error', 'Excel tablosu yüklenemedi: ' + e.message);
        this.wb.busy = false;
      }
    },

    setCell(sheetName, r, c, value) {
      const rows = this.wb.sheets[sheetName];
      if (!rows || !rows[r]) return;
      if (rows[r][c] === value) return;
      rows[r][c] = value;
      this.wb.dirty = true;
    },

    async saveWorkbook(pushToDrive) {
      this.wb.busy = true;
      try {
        // İlk kayıttan önce orijinal dosyayı depoda yedekle (SheetJS biçimlendirmeyi sadeleştirebilir)
        if (!this.wb.backupDone && this.wb.origB64) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          try {
            await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/admin_backups/bilgidozu_yukleme_tablosu_${ts}.xlsx`, {
              method: 'PUT',
              body: { message: 'chore(panel): tablo yedegi (panel duzenlemesi oncesi) [skip ci]', content: this.wb.origB64, branch: CFG.branch }
            });
            this.wb.backupDone = true;
            this.notify('info', 'Orijinal tablo depoda yedeklendi: admin_backups/');
          } catch (e) {
            this.notify('warning', 'Yedek alınamadı: ' + e.message);
          }
        }
        const book = XLSX.utils.book_new();
        this.wb.names.forEach((name) => {
          const rows = trimSheet(this.wb.sheets[name] || []);
          const ws = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(book, ws, name);
        });
        const b64 = XLSX.write(book, { bookType: 'xlsx', type: 'base64' });
        const res = await this.gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.tablePath}`, {
          method: 'PUT',
          body: {
            message: 'chore(panel): yukleme tablosu panelden guncellendi [skip ci]',
            content: b64,
            sha: this.wb.sha,
            branch: CFG.branch
          }
        });
        this.wb.sha = res.content.sha;
        this.wb.dirty = false;
        this.notify('success', 'Excel tablosu GitHub deposuna işlendi.');
        if (pushToDrive) {
          const telemetryWf = this.workflows.find((w) => w.file === 'panel-telemetry.yml');
          if (!telemetryWf) throw new Error('panel-telemetry.yml bulunamadı');
          await this.gh(`/repos/${CFG.owner}/${CFG.repo}/actions/workflows/${telemetryWf.file}/dispatches`, {
            method: 'POST',
            body: { ref: CFG.branch, inputs: { push_table_to_drive: 'true' } }
          });
          this.notify('success', 'Drive yazımı tetiklendi (panel-telemetri · push_table_to_drive=true).');
        }
        setTimeout(() => { this.loadWorkbook(true); this.loadTelemetry(true); }, 5000);
      } catch (e) {
        this.notify('error', 'Tablo kaydedilemedi: ' + e.message);
      } finally {
        this.wb.busy = false;
      }
    },

    /* --- Türetilmiş veriler -------------------------------------------- */
    telemetryQueue() {
      return (this.telemetry && this.telemetry.active_queue) || [];
    },
    workers() {
      return (this.telemetry && this.telemetry.isciler) || [];
    },
    warnings() {
      return (this.telemetry && this.telemetry.uyarilar) || [];
    },
    inventory() {
      return (this.telemetry && this.telemetry.drive_inventory) || {};
    },
    retention() {
      return (this.telemetry && this.telemetry.retention) || { metrics: [], curves: [], info: {} };
    },
    scheduleRules() {
      return (this.telemetry && this.telemetry.schedule_runs) || (this.telemetry && this.telemetry.schedule_rules) || {};
    },
    workflowByName(file) {
      return this.workflows.find((w) => w.file === file) || null;
    },
    telemetryRuns() {
      return this.runs.filter((r) => (r.path || '').endsWith('panel-telemetry.yml'));
    },
    nextTelemetryCycle() {
      const wf = this.workflowByName('panel-telemetry.yml');
      if (!wf || !wf.crons || !wf.crons.length) return null;
      const dates = wf.crons.map((c) => nextCronRun(c)).filter(Boolean).sort((a, b) => a - b);
      return dates.length ? dates[0] : null;
    },
    async autoRefresh() {
      if (!this.authed) return;
      try {
        await Promise.allSettled([this.loadRuns(), this.loadTelemetry(true), this.loadApiUyarilari(true)]);
        this.lastAutoRefresh = Date.now();
        if (this.selectedRun && this.runDetailOpen) await this.refreshSelectedRun();
      } catch (e) { /* sessiz */ }
    }
  });

  /* Boş satır/kolonları kırp (dosya şişmesini önler) */
  function trimSheet(rows) {
    const isBlank = (v) => v === '' || v === null || v === undefined;
    let lastRow = rows.length - 1;
    while (lastRow >= 0 && (rows[lastRow] || []).every(isBlank)) lastRow--;
    if (lastRow < 0) return [];
    let lastCol = 0;
    for (let r = 0; r <= lastRow; r++) {
      const row = rows[r] || [];
      for (let c = row.length - 1; c >= 0; c--) {
        if (!isBlank(row[c])) { if (c > lastCol) lastCol = c; break; }
      }
    }
    const out = [];
    for (let r = 0; r <= lastRow; r++) out.push((rows[r] || []).slice(0, lastCol + 1));
    return out;
  }

  function parseDispatchInputs(raw) {
    const inputs = [];
    if (!raw) return inputs;
    const idx = raw.indexOf('workflow_dispatch:');
    if (idx === -1) return inputs;
    const after = raw.slice(idx);
    const stopMatch = after.slice('workflow_dispatch:'.length).search(/\n {0,2}[a-zA-Z_]+:/);
    const block = stopMatch === -1 ? after : after.slice(0, stopMatch + 'workflow_dispatch:'.length);
    const lines = block.split('\n');
    let inInputs = false;
    let baseIndent = -1;
    let current = null;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const indent = line.length - line.trimStart().length;
      if (/^inputs:/.test(trimmed)) { inInputs = true; baseIndent = indent; return; }
      if (!inInputs) return;
      if (indent <= baseIndent) { inInputs = false; return; }
      const keyMatch = /^([A-Za-z0-9_\-]+):\s*$/.exec(trimmed);
      if (keyMatch && indent === baseIndent + 2) {
        current = { name: keyMatch[1], description: '', required: false, type: 'string', default: '', options: [] };
        inputs.push(current);
        return;
      }
      if (!current) return;
      const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(trimmed);
      if (!kv) return;
      const [, k, vRaw] = kv;
      const v = vRaw.replace(/^["']|["']$/g, '');
      if (k === 'description') current.description = v;
      else if (k === 'required') current.required = v === 'true';
      else if (k === 'type') current.type = v;
      else if (k === 'default') current.default = v;
      else if (k === 'options') current.options = [];
    });
    return inputs;
  }

  window.BD = { CFG, store, decryptVault, trTime, trClock, ago, dur, runDuration, bytes, nextCronRun, nextCronRuns, cronHuman, DOW_TR, pad, parseDispatchInputs };
})();
