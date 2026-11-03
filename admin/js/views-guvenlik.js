/* ============================================================================
   Bilgi Dozu · Güvenlik — panel şifresi değiştirme (PAT yeniden şifrelenir)
   Şifre değişince token, yeni şifreyle AES-256-GCM + PBKDF2(100k) ile sarılır ve
   admin/js/api.js içindeki VAULT bloğu güncellenir (GitHub Pages deposuna commit).
   Böylece yeni şifre her cihazda geçerli olur; eski şifre çalışmaz.
   ========================================================================== */
(function () {
  'use strict';

  const VIEWS = window.VIEWS;
  const { store } = window.BD;
  if (!VIEWS) return;

  const SAYFA_DEPO = 'benngokhan.github.io';
  const SAYFA_SAHIP = 'benngokhan';
  const API_YOLU = 'admin/js/api.js';

  const b64 = (buf) => {
    const bayt = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bayt.length; i++) s += String.fromCharCode(bayt[i]);
    return btoa(s);
  };

  const metinB64Coz = (b64veri) => {
    const bin = atob((b64veri || '').replace(/\n/g, ''));
    const bayt = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bayt[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bayt);
  };

  async function sifrele(token, sifre) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(sifre), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const sifreli = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
    return { s: b64(salt), i: b64(iv), c: b64(sifreli) };
  }

  VIEWS.guvenlik = {
    name: 'GuvenlikView',
    data() {
      return {
        s: store,
        eski: '',
        yeni: '',
        yeni2: '',
        busy: false,
        sonuc: '',
        sonHata: '',
        sifreGoster: false,
        kurallar: [
          'En az 10 karakter',
          'En az bir büyük harf ve bir rakam',
          'Eski şifreyle aynı olmamalı'
        ]
      };
    },
    computed: {
      gecerli() {
        const y = this.yeni;
        return y.length >= 10 && /[A-ZÇĞİÖŞÜ]/.test(y) && /[0-9]/.test(y) && y === this.yeni2 && y !== this.eski;
      },
      eslesme() {
        return this.yeni2.length > 0 && this.yeni === this.yeni2;
      }
    },
    methods: {
      async degistir() {
        if (!this.gecerli || this.busy) return;
        this.busy = true;
        this.sonuc = '';
        this.sonHata = '';
        try {
          // 1) mevcut token gerçekten çalışıyor mu?
          await this.s.gh('/user');

          // 2) yeni kasayı üret
          const kasa = await sifrele(this.s.token, this.yeni);
          const yeniBlok =
            '  const VAULT = [\n' +
            `    { s: '${kasa.s}', i: '${kasa.i}', c: '${kasa.c}' }\n` +
            '  ];';

          // 3) api.js dosyasını al ve VAULT bloğunu değiştir
          const yol = `/repos/${SAYFA_SAHIP}/${SAYFA_DEPO}/contents/${API_YOLU}`;
          const dosya = await this.s.gh(yol);
          const kaynak = metinB64Coz(dosya.content);
          const desen = /  const VAULT = \[[\s\S]*?\n  \];/;
          if (!desen.test(kaynak)) throw new Error('api.js içinde VAULT bloğu bulunamadı.');
          const guncel = kaynak.replace(desen, yeniBlok);
          if (guncel === kaynak) throw new Error('VAULT bloğu değişmedi, işlem iptal edildi.');

          // 4) commit
          await this.s.gh(yol, {
            method: 'PUT',
            body: {
              message: 'chore(guvenlik): panel sifresi degistirildi (VAULT yenilendi)',
              content: btoa(unescape(encodeURIComponent(guncel))),
              sha: dosya.sha,
              branch: 'main'
            }
          });

          this.sonuc = 'Şifre değiştirildi. Sayfa yenilendikten sonra YENİ şifreyle giriş yap ' +
                        '(eski şifre artık çalışmaz). Yayına alınması ~1 dakika sürer.';
          this.eski = '';
          this.yeni = '';
          this.yeni2 = '';
          this.s.notify('success', 'Panel şifresi güncellendi.');
        } catch (e) {
          this.sonHata = 'Değiştirilemedi: ' + (e.message || e);
        } finally {
          this.busy = false;
        }
      }
    },
    template: `
      <div class="page">
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom:16px"
          title="Panel şifresi = API anahtarının (PAT) kasasını açan anahtar">
          <div style="line-height:1.6">
            Değiştirdiğinde anahtar yeni şifreyle yeniden şifrelenir ve panel dosyasına yazılır.
            Eski şifre geçersiz olur. Yeni şifreyi bir yere not et — kaybedersen anahtarı yeniden üretmen gerekir.
          </div>
        </el-alert>

        <el-row :gutter="16">
          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header><b>Şifre değiştir</b></template>
              <el-form label-position="top">
                <el-form-item label="Mevcut şifre (doğrulama için)">
                  <el-input v-model="eski" type="password" show-password placeholder="şu anki şifre" />
                </el-form-item>
                <el-form-item label="Yeni şifre">
                  <el-input v-model="yeni" type="password" show-password placeholder="en az 10 karakter" />
                </el-form-item>
                <el-form-item label="Yeni şifre (tekrar)">
                  <el-input v-model="yeni2" type="password" show-password placeholder="aynı şifre" />
                  <div v-if="yeni2 && !eslesme" style="color:#f56c6c;font-size:12px;margin-top:4px">Şifreler uyuşmuyor.</div>
                </el-form-item>

                <el-alert v-if="sonuc" type="success" :closable="false" :title="sonuc" style="margin-bottom:12px" />
                <el-alert v-if="sonHata" type="error" :closable="false" :title="sonHata" style="margin-bottom:12px" />

                <el-button type="danger" :loading="busy" :disabled="!gecerli" @click="degistir">
                  Şifreyi değiştir
                </el-button>
              </el-form>
            </el-card>
          </el-col>

          <el-col :xs="24" :lg="12">
            <el-card shadow="never">
              <template #header><b>Kurallar</b></template>
              <ul style="line-height:1.9;padding-left:18px;margin:0">
                <li v-for="k in kurallar" :key="k">{{ k }}</li>
              </ul>
              <el-divider />
              <div style="font-size:13px;color:#606266;line-height:1.7">
                <b>Nasıl çalışıyor?</b><br />
                Anahtar (PAT) tarayıcıda tutulmaz; şifreyle açılan bir kasada durur.
                Şifre değişince kasa yeni şifreyle tekrar kurulur ve
                <code>admin/js/api.js</code> dosyasına yazılır.<br /><br />
                <b>Unutursan:</b> GitHub → Settings → Developer settings → Tokens bölümünden yeni anahtar
                üretip <code>kasa-yap.html</code> ile yeniden kurabilirsin.
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    `
  };
})();
