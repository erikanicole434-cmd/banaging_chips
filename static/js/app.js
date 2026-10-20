(function () {
  "use strict";

  /* ---------- Toasts ---------- */
  var DURATION = 6000;
  var stack = document.getElementById("toastStack");

  function dismiss(toast) {
    if (toast.classList.contains("hide")) return;
    toast.classList.add("hide");
    toast.addEventListener("animationend", function () { toast.remove(); }, { once: true });
    setTimeout(function () { toast.remove(); }, 400);
  }

  function wireToast(toast) {
    var remaining = DURATION, timer, startedAt;
    function start() { startedAt = Date.now(); timer = setTimeout(function () { dismiss(toast); }, remaining); }
    function pause() { clearTimeout(timer); remaining -= Date.now() - startedAt; }
    toast.style.setProperty("--toast-time", DURATION + "ms");
    start();
    toast.addEventListener("mouseenter", pause);
    toast.addEventListener("mouseleave", start);
    toast.querySelector(".toast-close").addEventListener("click", function () {
      clearTimeout(timer);
      dismiss(toast);
    });
  }

  document.querySelectorAll(".toast").forEach(wireToast);

  // window.toast("Message", "success" | "error"): for messages created in JavaScript
  window.toast = function (message, type) {
    var good = type === "success";
    var t = document.createElement("div");
    t.className = "toast " + (good ? "toast-success" : "toast-error");
    t.setAttribute("role", good ? "status" : "alert");

    var icon = document.createElement("span");
    icon.className = "toast-icon"; icon.setAttribute("aria-hidden", "true");
    var text = document.createElement("p");
    text.className = "toast-text"; text.textContent = message;
    var close = document.createElement("button");
    close.type = "button"; close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss notification"); close.innerHTML = "&times;";
    var bar = document.createElement("span");
    bar.className = "toast-bar"; bar.setAttribute("aria-hidden", "true");

    t.append(icon, text, close, bar);
    stack.appendChild(t);
    wireToast(t);
  };

  /* ---------- Modals ---------- */
  function fillForm(form, values) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in values)) return;
      if (el.type === "checkbox") el.checked = !!values[el.name];
      else el.value = values[el.name] == null ? "" : values[el.name];
    });
  }

  function setSlot(dlg, name, text) {
    if (!text) return;
    var el = dlg.querySelector('[data-slot="' + name + '"]');
    if (el) el.textContent = text;
  }

  function openDialog(id, trigger) {
    var dlg = document.getElementById(id);
    if (!dlg || dlg.open) return;

    var form = dlg.querySelector("form");
    var err = dlg.querySelector(".form-error");
    if (err) { err.hidden = true; err.textContent = ""; }

    if (form) {
      if (!("defaultAction" in form.dataset)) form.dataset.defaultAction = form.getAttribute("action") || "";
      form.reset();
      var action = (trigger && trigger.dataset.formAction) || form.dataset.defaultAction;
      if (action) form.setAttribute("action", action);
      if (trigger && trigger.dataset.values) fillForm(form, JSON.parse(trigger.dataset.values));
    }
    if (trigger) {
      setSlot(dlg, "title", trigger.dataset.title);
      setSlot(dlg, "message", trigger.dataset.message);
      setSlot(dlg, "submit", trigger.dataset.submitLabel);
    }

    dlg.dispatchEvent(new CustomEvent("modal:open", { detail: trigger }));
    dlg.showModal();

    var first = dlg.querySelector("input:not([type=hidden]):not([type=checkbox]), select");
    if (first) first.focus();
  }
  window.openDialog = openDialog;

  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-open]");
    if (opener) {
      e.preventDefault();                       // the logout opener is a link
      openDialog(opener.dataset.open, opener);
      return;
    }
    var closer = e.target.closest("[data-close]");
    if (closer) { closer.closest("dialog").close(); }
  });

  // Click on the dark backdrop closes the modal (only if the press also started there)
  document.querySelectorAll("dialog.modal").forEach(function (dlg) {
    var downOnBackdrop = false;
    dlg.addEventListener("mousedown", function (e) { downOnBackdrop = (e.target === dlg); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg && downOnBackdrop) dlg.close();
    });
  });

  /* ---------- AJAX forms: <form data-ajax> ---------- */
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.matches("form[data-ajax]")) return;
    e.preventDefault();
    if (form.dataset.busy) return;

    var btn = form.querySelector('[type="submit"]');
    var err = form.querySelector(".form-error");
    var label = btn ? btn.textContent : "";

    function showError(msg) {
      if (err) { err.textContent = msg; err.hidden = false; }
      else window.toast(msg, "error");
    }
    function done() {
      delete form.dataset.busy;
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }

    form.dataset.busy = "1";
    if (btn) { btn.disabled = true; btn.textContent = form.dataset.loading || "Saving..."; }
    if (err) err.hidden = true;

    fetch(form.getAttribute("action"), {
      method: "POST",
      body: new FormData(form),
      headers: { "Accept": "application/json", "X-Requested-With": "fetch" },
      credentials: "same-origin"
    })
      .then(function (res) {
        if (res.redirected) { window.location.href = res.url; return null; }   // session expired
        return res.json().then(
          function (d) { return d; },
          function () { throw new Error("The server returned an unexpected response (" + res.status + ")."); }
        );
      })
      .then(function (d) {
        if (!d) return;
        if (d.ok) { window.location.reload(); return; }       // the success toast shows after reload
        showError(d.error || "Something went wrong.");
        done();
      })
      .catch(function (ex) {
        showError(ex.message || "Could not reach the server.");
        done();
      });
  });

  /* ---------- Browser-side sorting for small tables: <table data-client-sort> ---------- */
  document.querySelectorAll("table[data-client-sort]").forEach(function (table) {
    var tbody = table.tBodies[0];
    var heads = table.querySelectorAll("th[data-sort]");

    heads.forEach(function (th) {
      th.querySelector(".sort-btn").addEventListener("click", function () {
        var index = th.cellIndex;
        var asc = th.getAttribute("aria-sort") !== "ascending";     // first click = ascending
        var numeric = th.dataset.sort === "num";

        heads.forEach(function (h) { h.setAttribute("aria-sort", "none"); });
        th.setAttribute("aria-sort", asc ? "ascending" : "descending");

        function read(row) {
          var cell = row.cells[index];
          var v = cell.dataset.v != null ? cell.dataset.v : cell.textContent.trim();
          if (v === "" || v === "-") return null;                  // empty values
          return numeric ? parseFloat(v) : v;
        }

        var rows = Array.prototype.filter.call(tbody.rows, function (r) {
          return r.cells.length > index && !r.querySelector("td.empty");
        });

        rows.sort(function (a, b) {
          var x = read(a), y = read(b);
          if (x === null && y === null) return 0;
          if (x === null) return 1;                                // empty always last
          if (y === null) return -1;
          var c = numeric ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: "base", numeric: true });
          return asc ? c : -c;
        });

        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });
})();