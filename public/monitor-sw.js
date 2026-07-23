/* Service worker minimo per l'app di monitoraggio (rende l'app installabile). */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());
self.addEventListener("fetch", (e) => {
  /* Rete prima di tutto: i dati devono essere sempre freschi. */
});
