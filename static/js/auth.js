(function () {
  "use strict";

  /* ---------- Show / hide password ---------- */
  document.querySelectorAll("[data-toggle-pw]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = btn.closest(".auth-pwd-wrap").querySelector("input");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  /* ---------- Close a message banner ---------- */
  document.querySelectorAll("[data-dismiss]").forEach(function (btn) {
    btn.addEventListener("click", function () { btn.closest(".auth-banner-error").remove(); });
  });

  /* ---------- Password strength + match (register page only) ---------- */
  var pw = document.getElementById("password");
  var meter = document.getElementById("strengthText");

  if (pw && meter) {
    var confirm = document.getElementById("confirm");
    var matchText = document.getElementById("matchText");
    var bars = [1, 2, 3].map(function (n) { return document.getElementById("bar" + n); });

    var COLORS = ["", "bar-red", "bar-amber", "bar-green"];   // bar 1 red, bar 2 amber, bar 3 green
    var NAMES = ["", "Weak", "Medium", "Strong"];
    var CLASSES = ["", "is-weak", "is-medium", "is-strong"];

    function level(v) {
      if (!v) return 0;
      var points = 0;
      if (v.length >= 6) points++;
      if (v.length >= 8) points++;
      if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) points++;
      return Math.max(points, 1);                  // typed something, so at least Weak
    }

    function paint() {
      var l = level(pw.value);
      bars.forEach(function (bar, i) {
        bar.className = "auth-strength-bar" + (i < l ? " " + COLORS[i + 1] : "");
      });
      meter.textContent = NAMES[l];
      meter.className = "auth-strength-text" + (l ? " " + CLASSES[l] : "");
    }

    function checkMatch() {
      if (!confirm.value) { matchText.textContent = ""; matchText.className = "auth-match"; return; }
      var same = confirm.value === pw.value;
      matchText.textContent = same ? "Passwords match" : "Passwords do not match";
      matchText.className = "auth-match " + (same ? "ok" : "bad");
    }

    pw.addEventListener("input", function () { paint(); checkMatch(); });
    confirm.addEventListener("input", checkMatch);
  }

  /* ---------- Submit button: loading state, blocks double clicks ---------- */
  document.querySelectorAll(".auth-form").forEach(function (form) {
    var btn = form.querySelector(".auth-btn-primary");
    var label = btn && btn.querySelector("span");
    if (!btn || !label) return;
    var original = label.textContent;
    var busy = false;

    form.addEventListener("submit", function (e) {
      if (busy) { e.preventDefault(); return; }
      busy = true;
      btn.classList.add("is-loading");
      btn.setAttribute("aria-disabled", "true");
      label.textContent = form.dataset.loadingText || "PLEASE WAIT...";
    });

    // Back button (bfcache): restore the button
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) {
        busy = false;
        btn.classList.remove("is-loading");
        btn.removeAttribute("aria-disabled");
        label.textContent = original;
      }
    });
  });
})();