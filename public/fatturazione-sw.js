/* Service worker minimo per l'app Fatturazione (rende l'app installabile). Rete sempre prima: i dati devono essere freschi. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
