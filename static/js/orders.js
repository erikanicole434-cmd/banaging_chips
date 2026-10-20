(function () {
  "use strict";

  var money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function peso(v) { return "PHP " + money.format(v); }

  /* ============ NEW ORDER ============ */
  var dlg = document.getElementById("orderDialog");
  var form = document.getElementById("orderForm");
  var dataEl = document.getElementById("productData");

  if (dlg && form && dataEl) {
    var products = JSON.parse(dataEl.textContent);
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    var rows = document.getElementById("itemRows");
    var totalEl = document.getElementById("orderTotal");
    var customerInput = document.getElementById("customerInput");
    var customerId = document.getElementById("customerId");
    var datalist = document.getElementById("customerList");
    var errBox = form.querySelector(".form-error");

    function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }

    function addRow() {
      var row = document.createElement("div");
      row.className = "item-row";

      var sel = document.createElement("select");
      sel.name = "product_id";
      sel.setAttribute("aria-label", "Flavor");
      sel.add(new Option("Choose flavor", ""));
      products.forEach(function (p) { sel.add(new Option(p.flavor + " (PHP " + p.price.toFixed(2) + ")", p.id)); });

      var qty = document.createElement("input");
      qty.type = "number"; qty.name = "quantity";
      qty.min = "1"; qty.max = "1000"; qty.value = "1";
      qty.setAttribute("aria-label", "Quantity");

      var amount = document.createElement("output");
      amount.className = "line-total";
      amount.textContent = "0.00";

      var remove = document.createElement("button");
      remove.type = "button"; remove.className = "icon-btn";
      remove.setAttribute("aria-label", "Remove this row");
      remove.innerHTML = "&times;";

      row.append(sel, qty, amount, remove);
      rows.appendChild(row);
    }

    function recalc() {
      var total = 0;
      Array.prototype.forEach.call(rows.children, function (row) {
        var p = byId[row.querySelector("select").value];
        var q = parseInt(row.querySelector("input").value, 10);
        var line = p && q > 0 ? p.price * q : 0;
        row.querySelector(".line-total").textContent = money.format(line);
        total += line;
      });
      totalEl.textContent = peso(total);
    }

    rows.addEventListener("input", recalc);
    rows.addEventListener("change", recalc);
    rows.addEventListener("click", function (e) {
      var btn = e.target.closest(".icon-btn");
      if (!btn) return;
      if (rows.children.length > 1) btn.closest(".item-row").remove();
      else { var only = rows.children[0]; only.querySelector("select").value = ""; only.querySelector("input").value = "1"; }
      recalc();
    });
    document.getElementById("addItem").addEventListener("click", function () {
      addRow(); recalc();
      rows.lastElementChild.querySelector("select").focus();
    });

    // Fresh state every time the modal opens
    dlg.addEventListener("modal:open", function () {
      rows.textContent = "";
      addRow();
      recalc();
    });

    // Validate before the shared script sends the form
    form.addEventListener("submit", function (e) {
      var wanted = customerInput.value.trim().toLowerCase();
      var match = null;
      Array.prototype.forEach.call(datalist.options, function (o) {
        if (o.value.toLowerCase() === wanted) match = o;
      });

      var problem = "";
      if (!match) {
        problem = "Choose a customer from the suggestions. If they are new, add them on the Customers page first.";
      } else {
        var used = 0;
        Array.prototype.forEach.call(rows.children, function (row) {
          var flavor = row.querySelector("select").value;
          var q = parseInt(row.querySelector("input").value, 10);
          if (!flavor) problem = "Choose a flavor for every row, or remove the empty row.";
          else if (!(q >= 1)) problem = "Each quantity must be 1 or more.";
          else used++;
        });
        if (!problem && !used) problem = "Add at least one item.";
      }

      if (problem) {
        e.preventDefault();
        e.stopImmediatePropagation();          // stops the shared AJAX handler
        showError(problem);
        return;
      }
      customerId.value = match.dataset.id;
    });
  }

  /* ============ VIEW ORDER ============ */
  var view = document.getElementById("viewDialog");
  if (view) {
    function setText(id, text) { document.getElementById(id).textContent = text; }

    function cell(text, cls) {
      var td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      return td;
    }

    function showMessage(text) {
      var tbody = document.getElementById("vItems");
      tbody.textContent = "";
      var tr = document.createElement("tr");
      var td = cell(text, "empty");
      td.colSpan = 4;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    view.addEventListener("modal:open", function (e) {
      var id = e.detail && e.detail.dataset.orderId;
      if (!id) return;

      setText("vCustomer", "-"); setText("vDate", "-"); setText("vBy", "-");
      setText("vTotal", "-");
      document.getElementById("vStatusBadge").textContent = "-";
      showMessage("Loading...");
      view.querySelector('[data-slot="title"]').textContent = "Order #" + id;

      fetch("/orders/" + encodeURIComponent(id), {
        headers: { "Accept": "application/json", "X-Requested-With": "fetch" },
        credentials: "same-origin"
      })
        .then(function (res) {
          if (res.redirected) { window.location.href = res.url; return null; }
          return res.json();
        })
        .then(function (d) {
          if (!d) return;
          if (!d.ok) throw new Error(d.error || "Could not load the order.");

          setText("vCustomer", d.order.customer);
          setText("vDate", d.order.date);
          setText("vBy", d.order.admin);

          var badge = document.createElement("span");
          badge.className = "badge badge-" + d.order.status;
          badge.textContent = d.order.status;
          var holder = document.getElementById("vStatusBadge");
          holder.textContent = "";
          holder.appendChild(badge);
          document.getElementById("vStatus").value = d.order.status;

          var tbody = document.getElementById("vItems");
          tbody.textContent = "";
          d.items.forEach(function (it) {
            var tr = document.createElement("tr");
            tr.append(cell(it.flavor, "strong"), cell(it.quantity, "num"),
                      cell(peso(it.unit_price), "num"), cell(peso(it.subtotal), "num"));
            tbody.appendChild(tr);
          });
          if (!d.items.length) showMessage("This order has no items.");
          setText("vTotal", peso(d.total));
        })
        .catch(function (ex) {
          showMessage(ex.message || "Could not load the order.");
        });
    });
  }
})();