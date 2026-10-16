"use strict";

const VERSION = "905984b44154";
const FILES = {
  ".nojekyll": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "fonts/BlackHanSans.woff2": "7dc14f9ec9bc8c5f24ae658edcad8dfc12c048372c86a7aedca6f8e4a305a64e",
  "fonts/IBMPlexSansKR-400.woff2": "b1c67eaed1570852ca2687d95a849703bf099842a7cd9bbbeac9666971d7b15f",
  "fonts/IBMPlexSansKR-600.woff2": "d337a2a918fafa269dc043957a1a98be1268ba06cc1704555704badc48fd840d",
  "fonts/OFL-BlackHanSans.txt": "c324192c8b3a988bae45a9a7e4ac1258b684739003bda114e0523423440457c9",
  "fonts/OFL-IBMPlexSansKR.txt": "7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da",
  "icons/icon-192.png": "ed5c1fe1a967bb43d25e1454a92e8cd75a56c7237e600a581b364ec18db6a982",
  "icons/icon-512.png": "43a57f4b652d0a2c03da2ec9a0b279b30edd6808ed89d050750cc3da0684260a",
  "icons/icon-maskable-512.png": "cf964569258fda8ff101d207c8800442ca416b51b3ccd4f6f098c62feec8a05e",
  "index.html": "ba18f6565f2d7b256b3c0aadc689f8cbcac73db6f74ae005635da77ebc347c61",
  "manifest.webmanifest": "a3a9c1e97b0e80a8b19aa96df3030ed2b7948e391d5b8daf78a86479ed189e94"
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
