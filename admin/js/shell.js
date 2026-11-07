/* ============================================================================
   Kabuk: giriş ekranı, sol menü, üst bar, hash yönlendirici
   ========================================================================== */
(function () {
  'use strict';
  const { store } = window.BD;
  window.VIEWS = window.VIEWS || {};

  const MENU = [
    {
      title: 'Operasyon', icon: 'Monitor', children: [
        { key: 'dashboard', title: 'Kontrol Paneli', icon: 'Odometer' },
        { key: 'uretim', title: 'Video Üretimi', icon: 'MagicStick' },
        { key: 'runs', title: 'Çalıştırmalar', icon: 'VideoPlay' },
        { key: 'workflows', title: 'İş Akışları', icon: 'Promotion' }
      ]
    },
    {
      title: 'İçerik', icon: 'Files', children: [
        { key: 'queue', title: 'Video Kuyruğu', icon: 'List' },
        { key: 'excel', title: 'Excel Tablo', icon: 'Document' },
        { key: 'drive', title: 'Drive Envanteri', icon: 'FolderOpened' },
        { key: 'kapak', title: 'Kapak Yükle', icon: 'Picture' },
        { key: 'ses', title: 'Ses & Kredi', icon: 'Microphone' },
        { key: 'api', title: 'API & Kota', icon: 'Coin' }
      ]
    },
    {
      title: 'Gözetim', icon: 'Aim', children: [
        { key: 'workers', title: 'İşçiler & Uyarılar', icon: 'Cpu' },
        { key: 'diagnostics', title: 'Hata & Onarım', icon: 'Tools' }
      ]
    },
    {
      title: 'Analitik', icon: 'DataAnalysis', children: [
        { key: 'analytics', title: 'YouTube Analitik', icon: 'DataLine' },
        { key: 'retention', title: 'Retansiyon Eğrileri', icon: 'TrendCharts' }
      ]
    },
    {
      title: 'Sistem', icon: 'Setting', children: [
        { key: 'guvenlik', title: 'Güvenlik & Şifre', icon: 'Lock' },
        { key: 'scheduler', title: 'Zamanlayıcı & Cron', icon: 'Timer' },
        { key: 'system', title: 'Sistem Durumu', icon: 'InfoFilled' }
      ]
    }
  ];

  const TITLES = {};
  MENU.forEach((g) => g.children.forEach((c) => (TITLES[c.key] = { title: c.title, group: g.title })));

  const LoginView = {
    name: 'LoginView',
    data() {
      return { password: '', remember: false, showPass: false };
    },
    computed: {
      s() { return store; }
    },
    methods: {
      async submit() {
        if (!this.password) { store.loginError = 'Şifre gerekli.'; return; }
        const ok = await store.login(this.password, this.remember);
        if (ok) {
          this.password = '';
          store.view = 'dashboard';
          location.hash = '#/dashboard';
          syncRoute();
        }
      }
    },
    template: `
      <div class="login-page">
        <div class="login-card">
          <div class="login-brand">
            <div class="login-logo">B</div>
            <div>
              <div class="login-title">Bilgi Dozu · Kontrol Merkezi</div>
              <div class="login-sub">YouTube otomasyonu · canlı operasyon paneli</div>
            </div>
          </div>
          <el-form @submit.prevent style="margin-top:22px" label-position="top">
            <el-form-item label="Erişim şifresi">
              <el-input v-model="password" type="password" show-password size="large" placeholder="••••••••"
                        prefix-icon="Lock" autofocus @keyup.enter="submit" clearable />
            </el-form-item>
            <div class="flex between" style="margin:-6px 0 14px">
              <el-checkbox v-model="remember" size="small">Beni hatırla</el-checkbox>
              <span class="muted mono-sm">AES-256-GCM</span>
            </div>
            <el-button type="primary" size="large" style="width:100%" :loading="s.loginBusy" @click="submit">
              Giriş yap ve canlı veriye bağlan
            </el-button>
            <el-alert v-if="s.loginError" :title="s.loginError" type="error" :closable="false" show-icon class="login-error" />
          </el-form>
          <div class="login-hint">
            Bu panel yalnızca içerik sahibine açıktır. Şifre, GitHub erişim anahtarını yerel olarak çözer;
            anahtar hiçbir yere gönderilmez, düz metin olarak saklanmaz.
          </div>
          <div class="login-foot">benngokhan/yt_auto_uploader · Bilgi Dozu Otomasyonu</div>
        </div>
      </div>
    `
  };

  const ShellView = {
    name: 'ShellView',
    data() {
      return {
        menu: MENU,
        titles: TITLES,
        now: Date.now(),
        isMobile: window.innerWidth < 900,
        drawerOpen: false
      };
    },
    computed: {
      s() { return store; },
      view() { return store.view; },
      menuCollapsed() { return !this.isMobile && store.sidebarCollapsed; },
      pageMeta() { return TITLES[store.view] || { title: 'Kontrol Paneli', group: 'Operasyon' }; },
      currentComponent() {
        const c = window.VIEWS[store.view];
        return c || window.VIEWS.dashboard || { template: '<div class="empty-hint">Modül yüklenemedi.</div>' };
      },
      telemetryAge() {
        if (!this.s.telemetry || !this.s.telemetry.generated_at_iso) return null;
        return Math.floor((Date.now() - new Date(this.s.telemetry.generated_at_iso).getTime()) / 1000);
      },
      telemetryAgeText() {
        if (this.telemetryAge === null) return '—';
        const a = this.telemetryAge;
        if (a < 0) return 'şimdi';
        if (a < 3600) return Math.max(1, Math.round(a / 60)) + ' dk';
        return (a / 3600).toFixed(1) + ' sa';
      },
      nextCycle() { return this.s.nextTelemetryCycle(); },
      nextCycleText() {
        if (!this.nextCycle) return '—';
        const diff = Math.max(0, this.nextCycle.getTime() - this.now);
        const m = Math.floor(diff / 60000);
        const sec = Math.floor((diff % 60000) / 1000);
        return `${m} dk ${String(sec).padStart(2, '0')} sn`;
      },
      rateText() {
        const r = this.s.rate;
        if (r.remaining === null) return '—';
        return r.remaining + '/' + r.limit;
      }
    },
    methods: {
      select(key) {
        location.hash = '#/' + key;
        if (this.isMobile) this.drawerOpen = false;
      },
      toggleSidebar() {
        if (this.isMobile) this.drawerOpen = !this.drawerOpen;
        else store.sidebarCollapsed = !store.sidebarCollapsed;
      },
      onResize() {
        const mobile = window.innerWidth < 900;
        if (mobile !== this.isMobile) {
          this.isMobile = mobile;
          if (!mobile) this.drawerOpen = false;
        }
      },
      refresh() {
        store.notify('info', 'Canlı veriler yenileniyor…');
        store.autoRefresh();
        if (store.view === 'workflows') store.loadWorkflows();
        if (store.view === 'queue' || store.view === 'drive') { /* telemetri zaten yenilendi */ }
      },
      logout() {
        ElementPlus.ElMessageBox.confirm('Panel oturumunu kapatmak istiyor musun?', 'Çıkış', {
          confirmButtonText: 'Çıkış yap', cancelButtonText: 'Vazgeç', type: 'warning'
        }).then(() => store.logout()).catch(() => {});
      }
    },
    mounted() {
      window.addEventListener('resize', this.onResize);
      this.timer = setInterval(() => { this.now = Date.now(); }, 1000);
      this.auto = setInterval(() => { store.autoRefresh(); }, 30000);
      this.clock = setInterval(() => { store.tick++; }, 30000);
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.onResize);
      clearInterval(this.timer); clearInterval(this.auto); clearInterval(this.clock);
    },
    template: `
      <div class="app-shell">
        <div v-if="isMobile && drawerOpen" class="sidebar-backdrop" @click="drawerOpen = false"></div>
        <aside class="sidebar" :class="{ collapsed: menuCollapsed, open: drawerOpen }">
          <div class="sidebar-logo">
            <div class="mark">B</div>
            <div class="name" v-show="!menuCollapsed">BİLGİ DOZU<small>AUTOMATION OPS</small></div>
            <el-icon v-if="isMobile" class="sidebar-close" @click="drawerOpen = false"><Close /></el-icon>
          </div>
          <div class="sidebar-scroll">
            <el-menu :default-active="view" :collapse="menuCollapsed" unique-opened
                     background-color="#304156" text-color="#bfcbd9" active-text-color="#409eff" @select="select">
              <el-sub-menu v-for="g in menu" :key="g.title" :index="g.title">
                <template #title>
                  <el-icon><component :is="g.icon" /></el-icon>
                  <span>{{ g.title }}</span>
                </template>
                <el-menu-item v-for="it in g.children" :key="it.key" :index="it.key">
                  <el-icon><component :is="it.icon" /></el-icon>
                  <template #title>{{ it.title }}</template>
                </el-menu-item>
              </el-sub-menu>
            </el-menu>
          </div>
          <div class="sidebar-foot" v-show="!menuCollapsed">
            <div>v2.6 · main</div>
            <div class="mono-sm" style="color:#5f7186">{{ s.repo }}@{{ s.branch }}</div>
          </div>
        </aside>

        <div class="main-wrap">
          <header class="topbar">
            <div class="hamburger" @click="toggleSidebar">
              <el-icon v-if="isMobile"><component :is="drawerOpen ? 'Close' : 'Menu'" /></el-icon>
              <el-icon v-else><Fold v-if="!s.sidebarCollapsed" /><Expand v-else /></el-icon>
            </div>
            <div class="crumbs">
              <span>Kontrol Merkezi</span><el-icon><ArrowRight /></el-icon><b>{{ pageMeta.title }}</b>
            </div>
            <div class="topbar-right">
              <span class="flex" style="gap:6px">
                <span class="pulse-dot"></span>
                <span class="muted nowrap" style="font-size:12px">Canlı · telemetri {{ telemetryAgeText }} önce</span>
              </span>
              <el-tooltip content="Sonraki 30 dk'lık telemetri/işçi döngüsü" placement="bottom">
                <el-tag size="small" type="info" effect="plain" class="nowrap">
                  <el-icon><Timer /></el-icon> {{ nextCycleText }}
                </el-tag>
              </el-tooltip>
              <el-tooltip :content="'GitHub API kotası (saatlik)'" placement="bottom">
                <el-tag size="small" :type="s.rate.remaining !== null && s.rate.remaining < 800 ? 'warning' : 'success'" effect="plain">
                  API {{ rateText }}
                </el-tag>
              </el-tooltip>
              <el-button size="small" :icon="'Refresh'" circle :loading="s.runsBusy" @click="refresh" />
              <el-dropdown trigger="click">
                <span class="flex" style="cursor:pointer;gap:6px">
                  <el-avatar :size="26" style="background:#304156;font-size:12px">{{ (s.user && s.user.login || 'BD').slice(0,2).toUpperCase() }}</el-avatar>
                  <el-icon><CaretBottom /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item disabled>{{ s.user ? '@' + s.user.login : 'oturum' }}</el-dropdown-item>
                    <el-dropdown-item divided @click="goTo('system')">Sistem durumu</el-dropdown-item>
                    <el-dropdown-item @click="logout">Çıkış yap</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </header>
          <main class="content">
            <component :is="currentComponent" :key="view" />
          </main>
        </div>
      </div>
    `
  };

  /* --- Hash yönlendirici -------------------------------------------------- */
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return h || '';
  }

  function syncRoute() {
    const key = parseHash();
    if (!store.authed) {
      store.view = 'login';
      return;
    }
    if (!key || key === 'login') {
      location.hash = '#/dashboard';
      return;
    }
    store.view = window.VIEWS[key] ? key : 'dashboard';
  }

  window.addEventListener('hashchange', syncRoute);

  /* --- Uygulama ---------------------------------------------------------- */
  function mount() {
    const app = Vue.createApp({
      data() { return { s: store }; },
      computed: {
        ready() { return store.authed && store.view !== 'login'; }
      },
      template: `<login-view v-if="!ready" /><shell-view v-else />`
    });
    app.component('login-view', LoginView);
    app.component('shell-view', ShellView);
    if (window.ElementPlusIconsVue) {
      Object.entries(window.ElementPlusIconsVue).forEach(([name, comp]) => app.component(name, comp));
    }
    Object.entries(window.VIEWS).forEach(([k, comp]) => app.component('view-' + k, comp));
    Object.assign(app.config.globalProperties, {
      ui: window.BD.ui || {},
      openLink: (u) => window.open(u, '_blank', 'noopener'),
      goTo: (k) => { location.hash = '#/' + k; },
      trTime: window.BD.trTime,
      trClock: window.BD.trClock,
      ago: window.BD.ago,
      dur: window.BD.dur,
      bytes: window.BD.bytes,
      runDuration: window.BD.runDuration,
      cronHuman: window.BD.cronHuman,
      nextCronRun: window.BD.nextCronRun
    });
    app.use(ElementPlus, { locale: window.ElementPlusLocaleTr || undefined });
    app.mount('#app');

    // oturum geri yükleme
    if (store.restoreSession()) {
      if (!parseHash() || parseHash() === 'login') location.hash = '#/dashboard';
      syncRoute();
      store.bootstrap();
    } else {
      syncRoute();
    }
  }

  window.addEventListener('load', () => {
    if (window.ElementPlus) {
      // Türkçe dil paketi yoksa varsayılan dil kullanılır (tüm metinler zaten TR).
    }
    mount();
  });

  window.BD.MENU = MENU;
  window.BD.TITLES = TITLES;
  window.BD.syncRoute = syncRoute;
})();
