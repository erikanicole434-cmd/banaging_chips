import re
from datetime import datetime, date, timedelta
from flask import Blueprint, jsonify, request
from db import query
from routes.auth import login_required

bp = Blueprint("dash", __name__, url_prefix="/dashboard")

FROM_SQL = """
    FROM order_items oi
    JOIN orders   o ON o.order_id    = oi.order_id
    JOIN product  p ON p.product_id  = oi.product_id
    JOIN customer c ON c.customer_id = o.customer_id
"""
VALID = "o.status <> 'cancelled'"
REVENUE = "SUM(oi.quantity * oi.unit_price)"
# No DATE_FORMAT on purpose: its "%Y" collides with the %s placeholders
MONTH_EXPR = "CONCAT(YEAR(o.order_date), '-', LPAD(MONTH(o.order_date), 2, '0'))"

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
STATUSES = ["pending", "paid", "completed", "cancelled"]
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


# ---------------------------------------------------------------- helpers
def month_label(m):
    return datetime.strptime(m, "%Y-%m").strftime("%b %Y")


def fmt_day(d):
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def short_day(d):
    return f"{d.strftime('%b')} {d.day}"


def peso(v):
    return f"PHP {v:,.0f}"


def parse_day(text):
    """'2026-01-31' -> date, or None if empty/invalid."""
    try:
        return datetime.strptime((text or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def get_range():
    """Read ?from=...&to=... Either side may be missing. Swaps them if reversed."""
    d_from = parse_day(request.args.get("from"))
    d_to = parse_day(request.args.get("to"))
    if d_from and d_to and d_from > d_to:
        d_from, d_to = d_to, d_from
    return d_from, d_to


def selected_months():
    """?months=2026-01&months=2026-02 -> ['2026-01', '2026-02'] (validated)."""
    return sorted({m for m in request.args.getlist("months") if MONTH_RE.match(m)})


def period_text(d_from, d_to, months):
    if d_from and d_to:
        text = f"{fmt_day(d_from)} to {fmt_day(d_to)}"
    elif d_from:
        text = f"{fmt_day(d_from)} onwards"
    elif d_to:
        text = f"up to {fmt_day(d_to)}"
    else:
        text = ""
    if months:
        labels = ", ".join(month_label(m) for m in months)
        return f"{labels}, within {text}" if text else labels
    return text or "all dates"


def filter_options():
    """Everything the page needs to draw its filters."""
    row = query("SELECT MIN(DATE(order_date)) AS lo, MAX(DATE(order_date)) AS hi "
                "FROM orders WHERE status <> 'cancelled'", one=True)
    lo, hi = row["lo"], row["hi"]
    months = [r["m"] for r in query(
        "SELECT DISTINCT CONCAT(YEAR(order_date), '-', LPAD(MONTH(order_date), 2, '0')) AS m "
        "FROM orders WHERE status <> 'cancelled' ORDER BY m")]
    return {
        "date_min": lo.isoformat() if isinstance(lo, date) else "",
        "date_max": hi.isoformat() if isinstance(hi, date) else "",
        "as_of": fmt_day(hi) if isinstance(hi, date) else "",
        "months": months,
        "flavors": [r["flavor"] for r in query("SELECT flavor FROM product ORDER BY flavor")],
        "customers": query("SELECT customer_id, customer_name FROM customer "
                           "ORDER BY customer_name"),
        "statuses": STATUSES,
    }


def build_where(d_from, d_to, use_dates=True):
    """Safe WHERE clause + params. Only the text %s is ever placed in the SQL."""
    where, params = [], []

    # Status: nothing picked = everything except cancelled
    statuses = [s for s in request.args.getlist("statuses") if s in STATUSES]
    if statuses:
        where.append(f"o.status IN ({','.join(['%s'] * len(statuses))})")
        params += statuses
    else:
        where.append(VALID)

    if use_dates:                                   # date range and months
        if d_from:
            where.append("o.order_date >= %s")
            params.append(d_from.isoformat())
        if d_to:
            # < the next day, so the whole "to" day is included
            where.append("o.order_date < DATE_ADD(%s, INTERVAL 1 DAY)")
            params.append(d_to.isoformat())
        months = selected_months()
        if months:
            where.append(f"{MONTH_EXPR} IN ({','.join(['%s'] * len(months))})")
            params += months

    flavors = [f.strip() for f in request.args.getlist("flavors") if f.strip()]
    if flavors:
        where.append(f"p.flavor IN ({','.join(['%s'] * len(flavors))})")
        params += flavors

    days = [int(w) for w in request.args.getlist("weekdays") if w.isdigit() and 0 <= int(w) <= 6]
    if days:
        where.append(f"WEEKDAY(o.order_date) IN ({','.join(['%s'] * len(days))})")
        params += days

    cid = request.args.get("customer", "")
    if cid.isdigit():
        where.append("c.customer_id = %s")
        params.append(int(cid))

    return " AND ".join(where), tuple(params)


def last_30_days(end, where_nd, params_nd):
    """30 daily totals ending on `end`, or on the latest sale in view."""
    if not end:
        end = query(f"SELECT MAX(DATE(o.order_date)) AS hi {FROM_SQL} WHERE {where_nd}",
                    params_nd, one=True)["hi"]
    if not end:
        return [], None, None

    start = end - timedelta(days=29)
    rows = query(
        f"SELECT DATE(o.order_date) AS d, {REVENUE} AS revenue {FROM_SQL} "
        f"WHERE {where_nd} AND o.order_date >= %s "
        f"AND o.order_date < DATE_ADD(%s, INTERVAL 1 DAY) GROUP BY d ORDER BY d",
        params_nd + (start.isoformat(), end.isoformat()))
    by_day = {r["d"]: float(r["revenue"]) for r in rows}

    series = []
    for i in range(30):                       # zero-sale days stay in the chart
        day = start + timedelta(days=i)
        series.append({"label": short_day(day), "revenue": by_day.get(day, 0.0)})
    return series, start, end


# ---------------------------------------------------------------- text
def build_captions(months, flavors, weekdays, top, top_share, daily, d_start, d_end):
    """One plain-language sentence per chart, written from the current numbers."""
    none = "No sales match the current filters."
    cap = {"trend": none, "flavor": none, "share": none, "weekday": none, "daily": none}

    if months:
        hi = max(months, key=lambda r: r["revenue"])
        lo = min(months, key=lambda r: r["revenue"])
        if len(months) == 1:
            cap["trend"] = f"All sales in view fall in {hi['label']}, totaling {peso(hi['revenue'])}."
        else:
            last = months[-1]
            text = (f"Revenue peaked in {hi['label']} at {peso(hi['revenue'])} and was lowest "
                    f"in {lo['label']} at {peso(lo['revenue'])}.")
            if last["label"] not in (hi["label"], lo["label"]):     # skip when it just repeats
                text += f" The latest month, {last['label']}, came in at {peso(last['revenue'])}."
            cap["trend"] = text

    if flavors:
        if len(flavors) == 1:
            cap["flavor"] = f"{flavors[0]['flavor']} is the only flavor in view, earning {peso(flavors[0]['revenue'])}."
        else:
            a, b = flavors[0], flavors[-1]
            cap["flavor"] = (f"{a['flavor']} earns the most at {peso(a['revenue'])}, while {b['flavor']} "
                             f"earns the least at {peso(b['revenue'])}, a gap of {peso(a['revenue'] - b['revenue'])}.")

        total = sum(f["revenue"] for f in flavors)
        if total and len(flavors) == 1:
            cap["share"] = f"{flavors[0]['flavor']} makes up all of the sales in view."
        elif total:
            a, b = flavors[0], flavors[1]
            cap["share"] = (f"{a['flavor']} takes the largest slice at {a['revenue'] / total * 100:.0f}% "
                            f"of revenue, followed by {b['flavor']} at {b['revenue'] / total * 100:.0f}%.")

    total_wd = sum(w["revenue"] for w in weekdays)
    if total_wd:
        best_i = max(range(7), key=lambda i: weekdays[i]["revenue"])
        worst_i = min(range(7), key=lambda i: weekdays[i]["revenue"])
        weekend = weekdays[5]["revenue"] + weekdays[6]["revenue"]
        cap["weekday"] = (f"{FULL_DAYS[best_i]} is the busiest day at {peso(weekdays[best_i]['revenue'])}, "
                          f"and {FULL_DAYS[worst_i]} the quietest at {peso(weekdays[worst_i]['revenue'])}. "
                          f"Monday to Friday bring in {100 - weekend / total_wd * 100:.1f}% of revenue.")

    if daily:
        values = [d["revenue"] for d in daily]
        total = sum(values)
        active = [v for v in values if v > 0]
        window = f"{short_day(d_start)} to {fmt_day(d_end)}"
        if not total:
            cap["daily"] = f"There were no sales between {window}."
        else:
            best_i = max(range(len(values)), key=lambda i: values[i])
            cap["daily"] = (f"From {window}, sales totaled {peso(total)} across {len(active)} active days, "
                            f"averaging {peso(total / len(active))} on each of them. "
                            f"The best day was {daily[best_i]['label']} at {peso(values[best_i])}.")

    if top:
        spread = ("so revenue is spread across many buyers" if top_share < 25
                  else "so a small group drives a large share of revenue")
        cap["customers"] = (f"{top[0]['name']} is the biggest spender at {peso(top[0]['revenue'])}. "
                            f"The top {len(top)} together account for {top_share:.1f}% of all-time revenue, "
                            f"{spread}.")
    else:
        cap["customers"] = "No customer sales recorded yet."
    return cap


def build_summary(k, all_rev, all_lines, months, flavors, weekdays, top, top_share, period):
    if k["lines"] == 0:
        return ["No transactions match the current filters. Clear a filter to see data again."]

    rev, units, lines = k["revenue"], k["units"], k["lines"]
    pct_all = rev / all_rev * 100 if all_rev else 0
    out = [
        f"Period: {period}. Current view: {lines:,} of {all_lines:,} transactions. "
        f"Total revenue is PHP {rev:,.0f} from {units:,} bags "
        f"(PHP {rev / lines:,.2f} per transaction), {pct_all:.1f}% of all-time sales."
    ]

    best_f = flavors[0]
    line = (f"Flavor performance: {best_f['flavor']} leads with PHP {best_f['revenue']:,.0f} "
            f"({best_f['revenue'] / rev * 100:.1f}% of the revenue in view).")
    if len(flavors) > 1:
        line += f" Lowest seller: {flavors[-1]['flavor']} at PHP {flavors[-1]['revenue']:,.0f}."
    out.append(line)

    best_m = max(months, key=lambda r: r["revenue"])
    best_d = max(weekdays, key=lambda r: r["revenue"])
    out.append(f"Timing: the best month in view is {best_m['label']} (PHP {best_m['revenue']:,.0f}), "
               f"and the strongest weekday is {best_d['label']} (PHP {best_d['revenue']:,.0f}).")

    if top:
        out.append(f"Customers (all time): {top[0]['name']} is the top buyer with "
                   f"PHP {top[0]['revenue']:,.0f} over {top[0]['purchases']} purchases; the top "
                   f"{len(top)} customers together spent PHP {sum(t['revenue'] for t in top):,.0f} "
                   f"({top_share:.1f}% of all-time revenue).")

    # Static advice taken from your Excel report: edit this sentence freely
    out.append("Recommendation: stock the best-selling flavors first, run promos before the slow "
               "Mar-May months (sales rebounded in June), try a weekend or event pop-up since "
               "almost all sales fall on Mon-Fri, and reward repeat buyers because sales are "
               "spread across many one-time customers.")
    return out


# ---------------------------------------------------------------- route
@bp.route("/data")
@login_required
def data():
    d_from, d_to = get_range()
    chosen_months = selected_months()
    where, params = build_where(d_from, d_to)
    where_nd, params_nd = build_where(d_from, d_to, use_dates=False)

    k = query(f"SELECT COALESCE({REVENUE}, 0) AS revenue, "
              f"COALESCE(SUM(oi.quantity), 0) AS units, COUNT(*) AS tx "
              f"{FROM_SQL} WHERE {where}", params, one=True)
    k = {"revenue": float(k["revenue"]), "units": int(k["units"]), "lines": int(k["tx"])}

    allt = query(f"SELECT COALESCE({REVENUE}, 0) AS revenue, COUNT(*) AS tx "
                 f"{FROM_SQL} WHERE {VALID}", one=True)
    all_rev, all_lines = float(allt["revenue"]), int(allt["tx"])

    months = [{"label": month_label(r["m"]), "revenue": float(r["revenue"])} for r in query(
        f"SELECT {MONTH_EXPR} AS m, {REVENUE} AS revenue {FROM_SQL} "
        f"WHERE {where} GROUP BY m ORDER BY m", params)]

    flavors = [{"flavor": r["flavor"], "revenue": float(r["revenue"]), "units": int(r["units"])}
               for r in query(
        f"SELECT p.flavor, {REVENUE} AS revenue, SUM(oi.quantity) AS units {FROM_SQL} "
        f"WHERE {where} GROUP BY p.flavor ORDER BY revenue DESC", params)]

    by_wd = {r["wd"]: float(r["revenue"]) for r in query(
        f"SELECT WEEKDAY(o.order_date) AS wd, {REVENUE} AS revenue {FROM_SQL} "
        f"WHERE {where} GROUP BY wd", params)}
    weekdays = [{"label": WEEKDAYS[i], "revenue": by_wd.get(i, 0.0)} for i in range(7)]

    # The 30-day window ends on the To date, else on the last day of the latest
    # selected month, else on the latest sale in view
    end_hint = d_to
    if not end_hint and chosen_months:
        y, m = map(int, chosen_months[-1].split("-"))
        end_hint = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    daily, d_start, d_end = last_30_days(end_hint, where_nd, params_nd)

    # Top customers ignore every filter (all time), like your Excel chart
    top = [{"name": r["customer_name"], "revenue": float(r["revenue"]),
            "purchases": int(r["purchases"])} for r in query(
        f"SELECT c.customer_name, {REVENUE} AS revenue, COUNT(*) AS purchases {FROM_SQL} "
        f"WHERE {VALID} GROUP BY c.customer_id, c.customer_name "
        f"ORDER BY revenue DESC, c.customer_name LIMIT 10")]
    top_share = sum(t["revenue"] for t in top) / all_rev * 100 if all_rev else 0

    best = flavors[0] if flavors else None
    kpi = {
        "revenue": k["revenue"],
        "units": k["units"],
        "lines": k["lines"],
        "pct_all": k["revenue"] / all_rev * 100 if all_rev else 0,
        "avg_units": k["units"] / k["lines"] if k["lines"] else 0,
        "avg_revenue": k["revenue"] / k["lines"] if k["lines"] else 0,
        "top_flavor": best["flavor"] if best else None,
        "top_flavor_pct": best["revenue"] / k["revenue"] * 100 if best and k["revenue"] else 0,
    }

    return jsonify(
        kpi=kpi, by_month=months, by_flavor=flavors, by_weekday=weekdays,
        daily=daily, top_customers=top,
        captions=build_captions(months, flavors, weekdays, top, top_share, daily, d_start, d_end),
        summary=build_summary(k, all_rev, all_lines, months, flavors, weekdays,
                              top, top_share, period_text(d_from, d_to, chosen_months)))