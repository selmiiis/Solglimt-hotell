// Solglimt Hotel – service worker (offline-støtte). Versjon 88a76043
const CACHE='solglimt-88a76043';
const FILES=["./", "index.html", "manifest.webmanifest", "personvern.html", "nunito.woff", "grandstander.woff", "icon-192.png", "icon-512.png", "maskable-192.png", "maskable-512.png", "apple-touch-icon.png", "favicon-32.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.indexOf('/api/')===0)return; // hotellkatalogen går alltid rett på nett
  // Spillet selv: nett først (får nye versjoner), cache som reserve når du er offline
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return r;}).catch(()=>caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
