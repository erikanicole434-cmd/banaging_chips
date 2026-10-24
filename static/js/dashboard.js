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

  /* ---------- Look and feel (gold / brown / olive) ---------- */
  var INK = "#3B2A14", GRID = "#E3E3E3", FONT = 12;
  var GOLD = "#F5B400", BROWN = "#85592E";
  var FLAVOR_COLORS = { "Cheese": "#F5B400", "BBQ": "#85592E", "Original": "#D9A66B", "Sour Cream": "#76923C" };
  var FALLBACK = ["#F5B400", "#85592E", "#76923C", "#D9A66B", "#A9D18E", "#C0392B"];
  function colorFor(name, i) { return FLAVOR_COLORS[name] || FALLBACK[i % FALLBACK.length]; }

  var nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function n0(v) { return nf0.format(v); }
  function n2(v) { return nf2.format(v); }

  Chart.defaults.font.family = '"Poppins", system-ui, sans-serif';
  Chart.defaults.font.size = FONT;
  Chart.defaults.color = INK;

  function ctx(id) { return document.getElementById(id).getContext("2d"); }
  var base = { responsive: true, maintainAspectRatio: false, animation: { duration: 400 } };

  function tip(horizontal) {
    return { callbacks: { label: function (c) { return "PHP " + n0(horizontal ? c.parsed.x : c.parsed.y); } } };
  }
  function labels(extra) {                         // bold labels like the Excel charts
    return Object.assign({ color: INK, font: { size: FONT, weight: "700" }, formatter: function (v) { return n0(v); } }, extra);
  }
  function axisTitle(text) {
    return { display: true, text: text, color: "#555", font: { size: 11, weight: "600" } };
  }
  function moneyAxis(title) {
    return { beginAtZero: true, grace: "12%", grid: { color: GRID }, title: axisTitle(title),
             ticks: { callback: function (v) { return n0(v); } } };
  }

  /* ---------- Charts ---------- */
  var trend = new Chart(ctx("chartTrend"), {
    type: "line",
    data: { labels: [], datasets: [{
      data: [], borderColor: GOLD, backgroundColor: GOLD,
      borderWidth: 3, tension: 0.4, pointRadius: 5, pointHoverRadius: 7
    }] },
    options: Object.assign({}, base, {
      layout: { padding: { top: 34, right: 20, left: 6 } },
      plugins: { legend: { display: false }, tooltip: tip(false),
                 datalabels: labels({ anchor: "end", align: "top", offset: 10, clip: false }) },
      scales: { y: moneyAxis("Revenue (PHP)"),
                x: { offset: true, grid: { display: false }, title: axisTitle("Month") } }
    }),
    plugins: [ChartDataLabels]
  });

  function columnChart(id, xTitle) {
    return new Chart(ctx(id), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: GOLD, borderRadius: 2, maxBarThickness: 56 }] },
      options: Object.assign({}, base, {
        layout: { padding: { top: 26 } },
        plugins: { legend: { display: false }, tooltip: tip(false),
                   datalabels: labels({ anchor: "end", align: "top" }) },
        scales: { y: moneyAxis("Revenue (PHP)"),
                  x: { grid: { display: false }, title: axisTitle(xTitle) } }
      }),
      plugins: [ChartDataLabels]
    });
  }
  var flavorBar = columnChart("chartFlavor", "Flavor");
  var weekdayBar = columnChart("chartWeekday", "Weekday");


  var customers = new Chart(ctx("chartCustomers"), {
    type: "bar",
    data: { labels: [], datasets: [{
      data: [], backgroundColor: GOLD,
      barPercentage: 0.7, categoryPercentage: 0.85, maxBarThickness: 28, borderRadius: 2
    }] },
    options: Object.assign({}, base, {
      indexAxis: "y",
      layout: { padding: { right: 48 } },
      plugins: { legend: { display: false }, tooltip: tip(true),
                 datalabels: labels({ anchor: "end", align: "end", offset: 4 }) },
      scales: {
        x: { beginAtZero: true, grid: { color: GRID }, title: axisTitle("Revenue (PHP)"),
             ticks: { callback: function (v) { return n0(v); } } },
        y: { grid: { display: false }, title: axisTitle("Customer"), ticks: { autoSkip: false } }
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
    setText("kpiTxSub", k.lines
      ? "Avg PHP " + n2(k.avg_revenue) + (k.top_flavor ? " \u00b7 Top flavor: " + k.top_flavor + " (" + Math.round(k.top_flavor_pct) + "%)" : "")
      : "No sales in selection");

    trend.data.labels = d.by_month.map(function (r) { return r.label; });
    trend.data.datasets[0].data = d.by_month.map(function (r) { return r.revenue; });
    trend.update();

    var fl = d.by_flavor;
    flavorBar.data.labels = fl.map(function (r) { return r.flavor; });
    flavorBar.data.datasets[0].data = fl.map(function (r) { return r.revenue; });
    flavorBar.update();


    weekdayBar.data.labels = d.by_weekday.map(function (r) { return r.label; });
    weekdayBar.data.datasets[0].data = d.by_weekday.map(function (r) { return r.revenue; });
    weekdayBar.update();

    customers.data.labels = d.top_customers.map(function (r) { return r.name; });
    customers.data.datasets[0].data = d.top_customers.map(function (r) { return r.revenue; });
    customers.update();

    var c = d.captions;
    setText("capTrend", c.trend);
    setText("capFlavor", c.flavor);
    setText("capWeekday", c.weekday);
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
     Filters: every click applies right away (like Excel slicers)
     ========================================================= */
  var state = { from: "", to: "", customer: "", customerName: "",
                months: new Set(), flavors: new Set(), weekdays: new Set(), statuses: new Set() };

  var side = document.querySelector(".side");
  var fromInput = document.getElementById("dateFrom");
  var toInput = document.getElementById("dateTo");
  var custInput = document.getElementById("custInput");
  var custOptions = document.getElementById("custList").options;
  var custNote = document.getElementById("custNote");
  var summaryEl = document.getElementById("filtersSummary");
  var allDataText = "Showing all data";
  var resetBtn = document.getElementById("resetAll");
  var absMin = fromInput.min, absMax = fromInput.max;

  function niceDate(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-US",
      { month: "short", day: "numeric", year: "numeric" });
  }
  function chipTexts(group) {
    return Array.prototype.map.call(
      side.querySelectorAll('.sl-item[data-group="' + group + '"][aria-pressed="true"]'),
      function (c) { return c.textContent.trim(); });
  }
  function groupActive(g) {
    if (g === "dates") return !!(state.from || state.to);
    if (g === "customer") return !!state.customer;
    return state[g].size > 0;
  }

  function updateUi() {
    var parts = [];
    if (state.months.size) parts.push("Month: " + chipTexts("months").join(", "));
    if (state.from && state.to) parts.push(niceDate(state.from) + " to " + niceDate(state.to));
    else if (state.from) parts.push(niceDate(state.from) + " onwards");
    else if (state.to) parts.push("up to " + niceDate(state.to));
    if (state.customer) parts.push("Customer: " + state.customerName);
    if (state.flavors.size) parts.push("Flavor: " + chipTexts("flavors").join(", "));
    if (state.weekdays.size) parts.push("Weekday: " + chipTexts("weekdays").join(", "));
    if (state.statuses.size) parts.push("Status: " + chipTexts("statuses").join(", "));

    summaryEl.textContent = parts.length ? "Showing: " + parts.join(" \u00b7 ") : allDataText;
    resetBtn.disabled = parts.length === 0;
    side.querySelectorAll("[data-clear]").forEach(function (b) { b.disabled = !groupActive(b.dataset.clear); });
  }

  /* ---------- Load data (and ignore out-of-date responses) ---------- */
  var seq = 0, timer = null;

  function load() {
    var mine = ++seq;
    var params = new URLSearchParams();
    if (state.from) params.append("from", state.from);
    if (state.to) params.append("to", state.to);
    if (state.customer) params.append("customer", state.customer);
    ["months", "flavors", "weekdays", "statuses"].forEach(function (g) {
      state[g].forEach(function (v) { params.append(g, v); });
    });

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

  function schedule() { updateUi(); clearTimeout(timer); timer = setTimeout(load, 120); }

  /* ---------- Dates ---------- */
  function onDateChange() {
    state.from = fromInput.value;
    state.to = toInput.value;
    toInput.min = state.from || absMin;             // keep the pair consistent
    fromInput.max = state.to || absMax;
    schedule();
  }
  fromInput.addEventListener("change", onDateChange);
  toInput.addEventListener("change", onDateChange);

  /* ---------- Customer search ---------- */
  function setCustNote(msg) {
    custNote.textContent = msg;
    custNote.classList.toggle("is-error", !!msg);
  }
  function onCustomer() {
    var typed = custInput.value.trim().toLowerCase();
    var id = "", name = "";
    if (typed) {
      for (var i = 0; i < custOptions.length; i++) {
        if (custOptions[i].value.toLowerCase() === typed) { id = custOptions[i].dataset.id; name = custOptions[i].value; break; }
      }
      setCustNote(id ? "" : "Pick a name from the suggestions to filter.");
    } else {
      setCustNote("");
    }
    if (id !== state.customer) { state.customer = id; state.customerName = name; schedule(); }
  }
  custInput.addEventListener("input", onCustomer);
  custInput.addEventListener("change", onCustomer);

  /* ---------- Buttons and clear icons ---------- */
  function clearGroup(g) {
    if (g === "dates") {
      fromInput.value = ""; toInput.value = ""; state.from = ""; state.to = "";
      toInput.min = absMin; fromInput.max = absMax;
    } else if (g === "customer") {
      custInput.value = ""; state.customer = ""; state.customerName = ""; setCustNote("");
    } else {
      state[g].clear();
      side.querySelectorAll('.sl-item[data-group="' + g + '"]').forEach(function (c) {
        c.setAttribute("aria-pressed", "false");
      });
    }
  }

  side.addEventListener("click", function (e) {
    var item = e.target.closest(".sl-item");
    if (item) {
      var on = item.getAttribute("aria-pressed") !== "true";
      item.setAttribute("aria-pressed", String(on));
      var set = state[item.dataset.group];
      if (on) set.add(item.dataset.value); else set.delete(item.dataset.value);
      schedule();
      return;
    }
    var clear = e.target.closest("[data-clear]");
    if (clear && !clear.disabled) { clearGroup(clear.dataset.clear); schedule(); }
  });

  resetBtn.addEventListener("click", function () {
    ["months", "dates", "customer", "flavors", "weekdays", "statuses"].forEach(clearGroup);
    schedule();
  });

  updateUi();
  load();
})();