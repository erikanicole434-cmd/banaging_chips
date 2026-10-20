from flask import Blueprint, render_template, request, session, jsonify
from db import query, execute, get_conn
from routes.auth import login_required
from routes.helpers import ok, fail, paginate, parse_day, order_by

bp = Blueprint("orders", __name__, url_prefix="/orders")

STATUSES = ["pending", "paid", "completed", "cancelled"]


# ---------- PAGE: list + filters + KPIs ----------
@bp.route("/")
@login_required
def index():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "")
    d_from = parse_day(request.args.get("from"))
    d_to = parse_day(request.args.get("to"))
    if d_from and d_to and d_from > d_to:
        d_from, d_to = d_to, d_from

    where, params = ["1 = 1"], []
    if q:
        where.append("(c.customer_name LIKE %s OR o.order_id = %s)")
        params += [f"%{q}%", int(q) if q.isdigit() else 0]
    if status in STATUSES:
        where.append("o.status = %s")
        params.append(status)
    if d_from:
        where.append("o.order_date >= %s")
        params.append(d_from.isoformat())
    if d_to:
        where.append("o.order_date < DATE_ADD(%s, INTERVAL 1 DAY)")
        params.append(d_to.isoformat())
    where_sql = " AND ".join(where)

    total = query(f"SELECT COUNT(*) AS n FROM orders o "
                  f"JOIN customer c ON c.customer_id = o.customer_id WHERE {where_sql}",
                  tuple(params), one=True)["n"]
    page, pages, offset, per_page = paginate(total)

    sort_key, sort_dir, order_sql = order_by(
    {"id": "o.order_id", "date": "o.order_date", "customer": "c.customer_name",
        "units": "units", "total": "total_amount", "status": "CAST(o.status AS CHAR)"},
    default_key="date", default_dir="desc", tiebreak="o.order_id DESC")

    orders = query(f"""
        SELECT o.order_id, c.customer_name, o.order_date, o.status,
               COALESCE(SUM(oi.quantity), 0) AS units,
               COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount
        FROM orders o
        JOIN customer c ON c.customer_id = o.customer_id
        LEFT JOIN order_items oi ON oi.order_id = o.order_id
        WHERE {where_sql}
        GROUP BY o.order_id, c.customer_name, o.order_date, o.status
        ORDER BY {order_sql}
        LIMIT %s OFFSET %s
    """, tuple(params) + (per_page, offset))

    # ----- KPIs (whole table, not affected by the filters) -----
    t = query("""
        SELECT COUNT(*) AS order_count,
               COALESCE(SUM(status = 'pending'), 0)   AS pending_count,
               COALESCE(SUM(status <> 'cancelled'), 0) AS valid_count
        FROM orders
    """, one=True)
    revenue = float(query("""
        SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
        FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
        WHERE o.status <> 'cancelled'
    """, one=True)["revenue"])

    order_count, valid = int(t["order_count"]), int(t["valid_count"])
    pending = int(t["pending_count"])
    stats = {
        "orders": order_count, "valid": valid, "revenue": revenue,
        "avg_order": revenue / valid if valid else 0,
        "pending": pending,
        "pending_pct": pending / order_count * 100 if order_count else 0,
    }

    # ----- data for the "New order" modal -----
    customers = query("SELECT customer_id, customer_name FROM customer ORDER BY customer_name")
    products = query("SELECT product_id, flavor, price FROM product "
                     "WHERE is_active = TRUE ORDER BY flavor")
    product_json = [{"id": p["product_id"], "flavor": p["flavor"], "price": float(p["price"])}
                    for p in products]

    return render_template(
        "orders.html", orders=orders, q=q, status=status, statuses=STATUSES,
        date_from=d_from.isoformat() if d_from else "",
        date_to=d_to.isoformat() if d_to else "",
        stats=stats, customers=customers, product_json=product_json,
        page=page, pages=pages, total=total, per_page=per_page,
        sort_key=sort_key, sort_dir=sort_dir)


# ---------- VIEW ONE ORDER (JSON for the modal) ----------
@bp.get("/<int:order_id>")
@login_required
def detail(order_id):
    order = query("""
        SELECT o.order_id, o.order_date, o.status,
               c.customer_name, a.username AS admin_name
        FROM orders o
        JOIN customer c ON c.customer_id = o.customer_id
        JOIN admin a    ON a.admin_id    = o.admin_id
        WHERE o.order_id = %s
    """, (order_id,), one=True)
    if not order:
        return fail("Order not found.", 404)

    items = query("""
        SELECT p.flavor, oi.quantity, oi.unit_price,
               oi.quantity * oi.unit_price AS subtotal
        FROM order_items oi
        JOIN product p ON p.product_id = oi.product_id
        WHERE oi.order_id = %s
        ORDER BY p.flavor
    """, (order_id,))

    return jsonify(
        ok=True,
        order={"order_id": order["order_id"],
               "date": order["order_date"].strftime("%b %d, %Y"),
               "status": order["status"],
               "customer": order["customer_name"],
               "admin": order["admin_name"]},
        items=[{"flavor": i["flavor"], "quantity": int(i["quantity"]),
                "unit_price": float(i["unit_price"]), "subtotal": float(i["subtotal"])}
               for i in items],
        total=float(sum(i["subtotal"] for i in items)))


# ---------- CREATE (JSON) ----------
@bp.post("/add")
@login_required
def add():
    customer_id = request.form.get("customer_id", "")
    pids = request.form.getlist("product_id")
    qtys = request.form.getlist("quantity")

    if not customer_id.isdigit():
        return fail("Please choose a customer.")

    wanted = {}                                    # {product_id: total quantity}
    for pid, qty in zip(pids, qtys):
        pid, qty = pid.strip(), qty.strip()
        if not pid and not qty:
            continue                               # blank row
        if not pid.isdigit() or not qty.isdigit() or int(qty) <= 0:
            return fail("Each item needs a flavor and a quantity of 1 or more.")
        wanted[int(pid)] = wanted.get(int(pid), 0) + int(qty)   # merge duplicates

    if not wanted:
        return fail("Add at least one item.")

    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)

        cur.execute("SELECT 1 FROM customer WHERE customer_id = %s", (customer_id,))
        if not cur.fetchone():
            return fail("That customer no longer exists.", 404)

        # prices come from the database, never from the browser
        marks = ",".join(["%s"] * len(wanted))     # only builds '%s,%s,%s'
        cur.execute("SELECT product_id, price FROM product "
                    f"WHERE is_active = TRUE AND product_id IN ({marks})", tuple(wanted))
        prices = {r["product_id"]: r["price"] for r in cur.fetchall()}
        if len(prices) != len(wanted):
            return fail("One of the flavors is unknown or inactive.")

        cur.execute("INSERT INTO orders (admin_id, customer_id) VALUES (%s, %s)",
                    (session["admin_id"], customer_id))
        order_id = cur.lastrowid
        cur.executemany(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) "
            "VALUES (%s, %s, %s, %s)",
            [(order_id, pid, qty, prices[pid]) for pid, qty in wanted.items()])
        conn.commit()                              # order + items saved together
    except Exception:
        conn.rollback()                            # or nothing is saved
        raise
    finally:
        conn.close()

    return ok(f"Order #{order_id} created.")


# ---------- CHANGE STATUS (JSON) ----------
@bp.post("/<int:order_id>/status")
@login_required
def update_status(order_id):
    new_status = request.form.get("status", "")
    if new_status not in STATUSES:
        return fail("Invalid status.")
    if not query("SELECT 1 FROM orders WHERE order_id = %s", (order_id,), one=True):
        return fail("Order not found.", 404)
    execute("UPDATE orders SET status = %s WHERE order_id = %s", (new_status, order_id))
    return ok(f"Order #{order_id} marked as {new_status}.")