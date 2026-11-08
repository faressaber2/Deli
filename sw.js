/* Service worker — ديلي برجر كافيه
   غيّر رقم VERSION عند كل تحديث للتطبيق عشان الزباين ياخدوا النسخة الجديدة. */
const VERSION = 'v2';
const SHELL = 'deli-shell-' + VERSION;
const RUNTIME = 'deli-runtime-' + VERSION;

const SHELL_FILES = [
  './', 'manifest.webmanifest', 'favicon.ico',
  'icon-192.png', 'icon-512.png', 'icon-maskable-192.png',
  'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'favicon-64.png'
];
const FB = 'https://www.gstatic.com/firebasejs/13.2.0/';
const EXTRA = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js',
  'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&family=Lalezar&display=swap'];

const CACHEABLE_HOSTS = ['res.cloudinary.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map(u => c.add(u)));
    const r = await caches.open(RUNTIME);
    await Promise.allSettled(EXTRA.map(u => r.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

// الصفحة بتبعت لينا روابط صور المنيو عشان تتحفظ للعمل بدون نت
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'cache-urls') return;
  e.waitUntil((async () => {
    const c = await caches.open(RUNTIME);
    await Promise.allSettled((e.data.urls || []).filter(u => /^https:/.test(u)).map(async u => {
      if (await c.match(u)) return;
      try { await c.add(new Request(u, { mode: 'cors' })); } catch (_) { try { await c.add(new Request(u, { mode: 'no-cors' })); } catch (__) {} }
    }));
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.searchParams.has('__chk')) return;   // فحص النسخة الجديدة: دايمًا من النت

  // الصفحة نفسها: النت الأول، ولو مفيش نت النسخة المحفوظة
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch (_) {
        const c = await caches.open(SHELL);
        return (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // ملفات من نفس الدومين (أيقونات، manifest): من الكاش وتتحدّث في الخلفية
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // صور Cloudinary والخطوط وملفات Firebase: الكاش الأول وتتحدّث في الخلفية
  // (طلبات Firestore/Auth نفسها مش بتتخزّن)
  if (CACHEABLE_HOSTS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith((async () => {
      const c = await caches.open(RUNTIME);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
