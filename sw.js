"use strict";

const VERSION = "5bf80cb8c448";
const FILES = {
  ".nojekyll": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "fonts/BlackHanSans.woff2": "f159826362af38709c164afc9609564cda1b91eeee55d2f1d7214777bcaecbcd",
  "fonts/IBMPlexSansKR-400.woff2": "fc71fd17323bad4210c3678a4764abcc73207c7edd4f2eb69af873ad04531a5f",
  "fonts/IBMPlexSansKR-600.woff2": "e59a717b7cf733bb3e3623306c7d940e5bbd2550bcc0802058d2e7c79309022b",
  "fonts/OFL-BlackHanSans.txt": "c324192c8b3a988bae45a9a7e4ac1258b684739003bda114e0523423440457c9",
  "fonts/OFL-IBMPlexSansKR.txt": "7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da",
  "icons/icon-192.png": "756086d8a76278761966941d9fb5f9626f7dbc3c5e14dbc2f46cc48a66400c34",
  "icons/icon-512.png": "f7d1264b0ecd517d2c66b4ea33e2872d25e4d6b9382aff89110be08424a02691",
  "icons/icon-maskable-512.png": "c129938df2d4857f0b9f9f84a14d628cacd319651a4d3cb1bc9b0a16ac310a8c",
  "index.html": "5519fd7c72aad96e16e7bb41126957c3ebaf51025014aabf297091342628c52d",
  "manifest.webmanifest": "77e240fe5d55e178a4d86d1aeb57de39f411e1497c869cbbf400dbb73ab7fe86"
};
const CACHE_NAME = "srlotto-" + VERSION;
const fileURL = name => new URL(name, self.registration.scope).href;
let firstInstall = false;

self.addEventListener("install", event => {
  firstInstall = !self.registration.active;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Sequential writes ensure no unfinished fetch can recreate a failed cache.
      for (const [name, expected] of Object.entries(FILES)) {
        const url = fileURL(name);
        const response = await fetch(url, {cache: "reload"});
        if (!response.ok || response.type === "opaque" || response.url !== url) {
          throw new Error("파일 응답 실패: " + name);
        }
        const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (actual !== expected) throw new Error("SHA-256 불일치: " + name);
        await cache.put(url, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("srlotto-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    if (firstInstall) await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(event.request.mode === "navigate" ? fileURL("index.html") : event.request);
    return response || fetch(event.request);
  })());
});

self.addEventListener("message", event => {
  const reply = data => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(data);
  };
  if (event.data === "status") {
    event.waitUntil((async () => {
      try {
        let ready = await caches.has(CACHE_NAME);
        if (ready) {
          const cache = await caches.open(CACHE_NAME);
          for (const name of Object.keys(FILES)) {
            if (!await cache.match(fileURL(name))) { ready = false; break; }
          }
        }
        reply({ready, version: VERSION});
      } catch (_) {
        reply({ready: false, version: VERSION});
      }
    })());
  } else if (event.data === "apply") {
    event.waitUntil((async () => {
      try {
        // A waiting worker controls no windows yet, so include uncontrolled
        // clients and count only windows inside this registration's scope.
        const windows = (await self.clients.matchAll({type: "window", includeUncontrolled: true}))
          .filter(client => client.url.startsWith(self.registration.scope));
        if (windows.length !== 1) {
          reply({applied: false, reason: "window-count", windows: windows.length});
          return;
        }
        await self.skipWaiting();
        reply({applied: true, version: VERSION});
      } catch (_) {
        reply({applied: false, reason: "apply-failed"});
      }
    })());
  }
});
