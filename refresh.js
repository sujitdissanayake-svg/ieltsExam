// This project does not use a live-reload websocket client.
// Some dev tools inject <script src="/refresh.js"> and expect it to exist.
// Provide a harmless no-op so local testing remains stable.
(function () {
  // no-op
})();
