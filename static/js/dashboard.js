(function () {
  "use strict";

  var dash = document.getElementById("dash");
  var errBox = document.getElementById("dashError");

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }
  function hideError() { errBox.hidden = true; }

  if (typeof Chart === "undefined" || typeof ChartDataLabels === "undefined") {
    showError("The charts could not load. Chart.js comes from a CDN, so check your internet connection and refresh.");
    return;
  }

  /* ---------- Look and feel ---------- */
  var INK = "#3B2A14", GRID = "#EFE2BF", FONT = 12;
  var FLAVOR_COLORS = { "Cheese": "#F2B705", "BBQ": "#C0392B", "Original": "#B08968", "Sour Cream": "#6AA84F" };
  var FALLBACK = ["#F2B705", "#C0392B", "#B08968", "#6AA84F", "#8E6C4A", "#E67E22"];
  function colorFor(name, i) { return FLAVOR_COLORS[name] || FALLBACK[i % FALLBACK.length]; }

  var nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function n0(v) { return nf0.format(v); }
  function n2(v) { return nf2.format(v); }

  Chart.defaults.font.family = '"Poppins", system-ui, sans-serif';
  Chart.defaults.font.size = FONT;               // same 12px text on every chart
  Chart.defaults.color = INK;

  function ctx(id) { return document.getElementById(id).getContext("2d"); }
  var base = { responsive: true, maintainAspectRatio: false, animation: { duration: 400 } };

  function tip(horizontal) {
    return { callbacks: { label: function (c) { return "PHP " + n0(horizontal ? c.parsed.x : c.parsed.y); } } };
  }
  function labels(extra) {                         // same data-label style everywhere
    return Object.assign({ color: INK, font: { size: FONT }, formatter: function (v) { return n0(v); } }, extra);
  }
  var moneyAxis = { beginAtZero: true, grid: { color: GRID }, ticks: { callback: function (v) { return n0(v); } } };

  /* ---------- Charts ---------- */
  var trend = new Chart(ctx("chartTrend"), {
    type: "line",
    data: { labels: [], datasets: [{
      data: [], borderColor: "#C0392B", backgroundColor: "#C0392B",
      borderWidth: 3, tension: 0.4, pointRadius: 5, pointHoverRadius: 7
    }] },
    options: Object.assign({}, base, {
      layout: { padding: { top: 34, right: 20, left: 4 } },
      plugins: { legend: { display: false }, tooltip: tip(false),
                 datalabels: labels({ anchor: "end", align: "top", offset: 10 }) },
      scales: { y: moneyAxis, x: { grid: { display: false } } }
    }),
    plugins: [ChartDataLabels]
  });

  function columnChart(id) {
    return new Chart(ctx(id), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: "#6AA84F", borderRadius: 2, maxBarThickness: 56 }] },
      options: Object.assign({}, base, {
        layout: { padding: { top: 24 } },
        plugins: { legend: { display: false }, tooltip: tip(false),
                   datalabels: labels({ anchor: "end", align: "top" }) },
        scales: { y: moneyAxis, x: { grid: { display: false } } }
      }),
      plugins: [ChartDataLabels]
    });
  }
  var flavorBar = columnChart("chartFlavor");
  var weekdayBar = columnChart("chartWeekday");

  var share = new Chart(ctx("chartShare"), {
    type: "doughnut",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: "#fff", borderWidth: 2 }] },
    options: Object.assign({}, base, {
      cutout: "55%",
      layout: { padding: 8 },
      plugins: {
        legend: { position: window.innerWidth < 600 ? "bottom" : "right",
                  labels: { boxWidth: 12, padding: 16, font: { size: FONT } } },
        tooltip: { callbacks: { label: function (c) { return c.label + ": PHP " + n0(c.parsed); } } },
        datalabels: {
          color: "#fff", font: { weight: "700", size: FONT },
          formatter: function (v, c) {
            var t = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
            return t ? Math.round(v / t * 100) + "%" : "";
          }
        }
      }
    }),
    plugins: [ChartDataLabels]
  });

  var daily = new Chart(ctx("chartDaily"), {
    type: "line",
    data: { labels: [], datasets: [{
      data: [], borderColor: "#C0392B", backgroundColor: "rgba(192, 57, 43, .14)",
      fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3, pointHoverRadius: 6
    }] },
    options: Object.assign({}, base, {
      layout: { padding: { top: 8, right: 12 } },
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: tip(false), datalabels: { display: false } },
      scales: {
        y: moneyAxis,
        x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } }
      }
    })
  });

  var customers = new Chart(ctx("chartCustomers"), {
    type: "bar",
    data: { labels: [], datasets: [{
      data: [], backgroundColor: "#B08968",
      barPercentage: 0.7, categoryPercentage: 0.85, maxBarThickness: 28, borderRadius: 3
    }] },
    options: Object.assign({}, base, {
      indexAxis: "y",
      layout: { padding: { right: 48 } },
      plugins: { legend: { display: false }, tooltip: tip(true),
                 datalabels: labels({ anchor: "end", align: "end", offset: 4 }) },
      scales: {
        x: { beginAtZero: true, grid: { color: GRID }, ticks: { callback: function (v) { return n0(v); } } },
        y: { grid: { display: false }, ticks: { autoSkip: false } }
      }
    }),
    plugins: [ChartDataLabels]
  });

  /* ---------- Draw one response ---------- */
  function setText(id, text) { document.getElementById(id).textContent = text; }

  function render(d) {
    var k = d.kpi;
    setText("kpiRevenue", "PHP " + n0(k.revenue));
    setText("kpiRevenueSub", k.pct_all.toFixed(1) + "% of all-time revenue");
    setText("kpiUnits", n0(k.units) + " bags");
    setText("kpiUnitsSub", "Avg " + k.avg_units.toFixed(2) + " bags per transaction");
    setText("kpiTx", n0(k.lines));
    setText("kpiAvg", "PHP " + n2(k.avg_revenue));
    setText("kpiAvgSub", k.top_flavor
      ? "Top flavor: " + k.top_flavor + " (" + Math.round(k.top_flavor_pct) + "%)"
      : "No sales in selection");

    trend.data.labels = d.by_month.map(function (r) { return r.label; });
    trend.data.datasets[0].data = d.by_month.map(function (r) { return r.revenue; });
    trend.update();

    var fl = d.by_flavor;
    flavorBar.data.labels = fl.map(function (r) { return r.flavor; });
    flavorBar.data.datasets[0].data = fl.map(function (r) { return r.revenue; });
    flavorBar.data.datasets[0].backgroundColor = fl.map(function (r, i) { return colorFor(r.flavor, i); });
    flavorBar.update();

    share.data.labels = fl.map(function (r) { return r.flavor; });
    share.data.datasets[0].data = fl.map(function (r) { return r.revenue; });
    share.data.datasets[0].backgroundColor = fl.map(function (r, i) { return colorFor(r.flavor, i); });
    share.update();

    weekdayBar.data.labels = d.by_weekday.map(function (r) { return r.label; });
    weekdayBar.data.datasets[0].data = d.by_weekday.map(function (r) { return r.revenue; });
    weekdayBar.update();

    daily.data.labels = d.daily.map(function (r) { return r.label; });
    daily.data.datasets[0].data = d.daily.map(function (r) { return r.revenue; });
    daily.update();

    customers.data.labels = d.top_customers.map(function (r) { return r.name; });
    customers.data.datasets[0].data = d.top_customers.map(function (r) { return r.revenue; });
    customers.update();

    var c = d.captions;
    setText("capTrend", c.trend);
    setText("capFlavor", c.flavor);
    setText("capShare", c.share);
    setText("capWeekday", c.weekday);
    setText("capDaily", c.daily);
    setText("capCustomers", c.customers);

    var list = document.getElementById("report");
    list.textContent = "";
    d.summary.forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;                     // textContent keeps it XSS-safe
      list.appendChild(li);
    });
  }

  /* =========================================================
     Filters: staged in the form, applied when Search is pressed
     ========================================================= */
  var form = document.getElementById("filterForm");
  var fromInput = document.getElementById("dateFrom");
  var toInput = document.getElementById("dateTo");
  var custInput = document.getElementById("custInput");
  var custOptions = document.getElementById("custList").options;
  var custNote = document.getElementById("custNote");
  var summaryEl = document.getElementById("filtersSummary");
  var allDataText = summaryEl.textContent;           // "Showing all data (min to max)"
  var badge = document.getElementById("filtersBadge");
  var toggleBtn = document.getElementById("filterToggle");
  var panel = document.getElementById("filtersPanel");
  var absMin = fromInput.min, absMax = fromInput.max;

  // What the dashboard is currently showing
  var applied = { from: "", to: "", customer: "", customerName: "", flavors: [], weekdays: [], statuses: [] };

  function niceDate(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-US",
      { month: "short", day: "numeric", year: "numeric" });
  }
  function joinText(list) { return list.map(function (x) { return x.text; }).join(", "); }

  function pressed(group) {
    return Array.prototype.map.call(
      document.querySelectorAll('.chip[data-group="' + group + '"][aria-pressed="true"]'),
      function (c) { return { value: c.dataset.value, text: c.textContent.trim() }; });
  }

  function findCustomer(typed) {
    var t = typed.trim().toLowerCase();
    if (!t) return { id: "", name: "" };
    for (var i = 0; i < custOptions.length; i++) {
      if (custOptions[i].value.toLowerCase() === t) {
        return { id: custOptions[i].dataset.id, name: custOptions[i].value };
      }
    }
    return null;                                      // typed something that isn't a customer
  }

  function setCustNote(msg) {
    custNote.textContent = msg;
    custNote.classList.toggle("is-error", !!msg);
  }

  function updateSummary() {
    var parts = [];
    if (applied.from && applied.to) parts.push(niceDate(applied.from) + " to " + niceDate(applied.to));
    else if (applied.from) parts.push(niceDate(applied.from) + " onwards");
    else if (applied.to) parts.push("up to " + niceDate(applied.to));
    if (applied.customer) parts.push("Customer: " + applied.customerName);
    if (applied.flavors.length) parts.push("Flavor: " + joinText(applied.flavors));
    if (applied.weekdays.length) parts.push("Weekday: " + joinText(applied.weekdays));
    if (applied.statuses.length) parts.push("Status: " + joinText(applied.statuses));

    summaryEl.textContent = parts.length ? "Showing: " + parts.join(" \u00b7 ") : allDataText;

    badge.hidden = parts.length === 0;
    badge.textContent = parts.length;
    toggleBtn.setAttribute("aria-label", parts.length ? "More filters, " + parts.length + " applied" : "More filters");
  }

  /* ---------- Load data (and ignore out-of-date responses) ---------- */
  var seq = 0;

  function load() {
    var mine = ++seq;
    var params = new URLSearchParams();
    if (applied.from) params.append("from", applied.from);
    if (applied.to) params.append("to", applied.to);
    if (applied.customer) params.append("customer", applied.customer);
    applied.flavors.forEach(function (x) { params.append("flavors", x.value); });
    applied.weekdays.forEach(function (x) { params.append("weekdays", x.value); });
    applied.statuses.forEach(function (x) { params.append("statuses", x.value); });

    dash.classList.add("is-loading");
    fetch("/dashboard/data?" + params.toString(), {
      headers: { "Accept": "application/json" }, credentials: "same-origin"
    })
      .then(function (res) {
        if (res.redirected) { window.location.href = res.url; return null; }   // session expired
        if (!res.ok) throw new Error("Server returned " + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || mine !== seq) return;
        render(d);
        hideError();
      })
      .catch(function (err) {
        if (mine === seq) showError("Could not load the dashboard data (" + err.message + "). Check the terminal running Flask.");
      })
      .finally(function () {
        if (mine === seq) dash.classList.remove("is-loading");
      });
  }

  /* ---------- Apply and reset ---------- */
  function apply() {
    var cust = findCustomer(custInput.value);
    if (!cust) {
      setCustNote("Pick a customer from the suggestions, or clear the box.");
      custInput.focus();
      return;
    }
    setCustNote("");

    applied = {
      from: fromInput.value, to: toInput.value,
      customer: cust.id, customerName: cust.name,
      flavors: pressed("flavors"), weekdays: pressed("weekdays"), statuses: pressed("statuses")
    };
    updateSummary();
    load();
  }

  function resetAll() {
    fromInput.value = ""; toInput.value = ""; custInput.value = "";
    toInput.min = absMin; fromInput.max = absMax;
    setCustNote("");
    document.querySelectorAll(".chip[aria-pressed='true']").forEach(function (c) {
      c.setAttribute("aria-pressed", "false");
    });
    syncClear();
    apply();
  }

  /* ---------- Form wiring ---------- */
  form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });

  document.querySelectorAll("[data-reset]").forEach(function (b) {
    b.addEventListener("click", resetAll);
  });

  toggleBtn.addEventListener("click", function () {
    var open = panel.hidden;                         // hidden now means it is about to open
    panel.hidden = !open;
    toggleBtn.setAttribute("aria-expanded", String(open));
  });

  // Keep the date pair consistent: "To" can't be before "From" and vice versa
  function syncDateLimits() {
    toInput.min = fromInput.value || absMin;
    fromInput.max = toInput.value || absMax;
  }
  fromInput.addEventListener("change", syncDateLimits);
  toInput.addEventListener("change", syncDateLimits);

  custInput.addEventListener("input", function () { if (custNote.textContent) setCustNote(""); });

  // Chips and the per-group Clear links (these change the form only; Search applies them)
  function syncClear() {
    panel.querySelectorAll("[data-clear]").forEach(function (b) {
      b.hidden = !panel.querySelector('.chip[data-group="' + b.dataset.clear + '"][aria-pressed="true"]');
    });
  }

  panel.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (chip) {
      chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
      syncClear();
      return;
    }
    var clear = e.target.closest("[data-clear]");
    if (clear) {
      panel.querySelectorAll('.chip[data-group="' + clear.dataset.clear + '"]').forEach(function (c) {
        c.setAttribute("aria-pressed", "false");
      });
      syncClear();
    }
  });

  syncClear();
  updateSummary();
  load();
})();