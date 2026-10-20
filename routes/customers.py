from flask import Blueprint, render_template, request, session
from mysql.connector.errors import IntegrityError
from db import query, execute, get_conn
from routes.auth import login_required
from routes.helpers import ok, fail, paginate, order_by

bp = Blueprint("customers", __name__, url_prefix="/customers")


def read_form():
    """Read and validate the customer form. Returns (data, error)."""
    name = request.form.get("customer_name", "").strip()
    city = request.form.get("city", "").strip() or None        # empty -> NULL
    phone = request.form.get("phone", "").strip() or None

    if not name:
        return None, "Customer name is required."
    if phone and not all(ch.isdigit() or ch in "+-() " for ch in phone):
        return None, "Phone may only contain digits, spaces, + - ( )."
    return {"customer_name": name, "city": city, "phone": phone}, None


# ---------- PAGE: list + search + KPIs ----------
@bp.route("/")
@login_required
def index():
    q = request.args.get("q", "").strip()

    where, params = ["1 = 1"], []
    if q:
        where.append("(c.customer_name LIKE %s OR c.city LIKE %s OR c.phone LIKE %s)")
        params += [f"%{q}%"] * 3
    where_sql = " AND ".join(where)

    total = query(f"SELECT COUNT(*) AS n FROM customer c WHERE {where_sql}",
                  tuple(params), one=True)["n"]
    page, pages, offset, per_page = paginate(total)

    sort_key, sort_dir, order_sql = order_by(
    {"id": "c.customer_id", "name": "c.customer_name", "city": "c.city",
        "phone": "c.phone", "orders": "order_count", "spent": "spent"},
    default_key="name", tiebreak="c.customer_id", nullable=("city", "phone"))

    customers = query(f"""
        SELECT c.customer_id, c.customer_name, c.city, c.phone,
               COUNT(DISTINCT o.order_id) AS order_count,
               COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS spent
        FROM customer c
        LEFT JOIN orders o       ON o.customer_id = c.customer_id AND o.status <> 'cancelled'
        LEFT JOIN order_items oi ON oi.order_id   = o.order_id
        WHERE {where_sql}
        GROUP BY c.customer_id, c.customer_name, c.city, c.phone
        ORDER BY {order_sql}
        LIMIT %s OFFSET %s
    """, tuple(params) + (per_page, offset))

    # ----- KPIs (whole table, not affected by the search) -----
    all_customers = query("SELECT COUNT(*) AS n FROM customer", one=True)["n"]
    buyers = query("""
        SELECT COUNT(*) AS buyer_count, COALESCE(SUM(n_orders >= 2), 0) AS repeat_count
        FROM (SELECT COUNT(*) AS n_orders FROM orders
              WHERE status <> 'cancelled' GROUP BY customer_id) t
    """, one=True)
    revenue = float(query("""
        SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
        FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
        WHERE o.status <> 'cancelled'
    """, one=True)["revenue"])
    top = query("""
        SELECT c.customer_name, SUM(oi.quantity * oi.unit_price) AS spent
        FROM customer c
        JOIN orders o       ON o.customer_id = c.customer_id
        JOIN order_items oi ON oi.order_id   = o.order_id
        WHERE o.status <> 'cancelled'
        GROUP BY c.customer_id, c.customer_name
        ORDER BY spent DESC, c.customer_name LIMIT 1
    """, one=True)
    archived = query("SELECT COUNT(*) AS n FROM deleted_customers", one=True)["n"]

    buyer_count, repeat_count = int(buyers["buyer_count"]), int(buyers["repeat_count"])
    stats = {
        "total": int(all_customers),
        "archived": int(archived),
        "repeat": repeat_count,
        "repeat_pct": repeat_count / buyer_count * 100 if buyer_count else 0,
        "top_name": top["customer_name"] if top else "-",
        "top_spent": float(top["spent"]) if top else 0,
        "avg_spend": revenue / buyer_count if buyer_count else 0,
    }

    deleted = query("""
        SELECT d.*, a.username AS deleted_by_name
        FROM deleted_customers d
        LEFT JOIN admin a ON a.admin_id = d.deleted_by
        ORDER BY d.deleted_at DESC LIMIT 200
    """)

    return render_template("customers.html", customers=customers, q=q, stats=stats,
                        deleted=deleted, page=page, pages=pages,
                        total=total, per_page=per_page,
                        sort_key=sort_key, sort_dir=sort_dir)


# ---------- ADD (JSON) ----------
@bp.post("/add")
@login_required
def add():
    data, error = read_form()
    if error:
        return fail(error)
    execute("INSERT INTO customer (customer_name, city, phone) VALUES (%s, %s, %s)",
            (data["customer_name"], data["city"], data["phone"]))
    return ok("Customer added.")


# ---------- EDIT (JSON) ----------
@bp.post("/<int:customer_id>/edit")
@login_required
def edit(customer_id):
    if not query("SELECT 1 FROM customer WHERE customer_id = %s", (customer_id,), one=True):
        return fail("Customer not found.", 404)
    data, error = read_form()
    if error:
        return fail(error)
    execute("UPDATE customer SET customer_name=%s, city=%s, phone=%s WHERE customer_id=%s",
            (data["customer_name"], data["city"], data["phone"], customer_id))
    return ok("Customer updated.")


# ---------- DELETE = move to archive (JSON) ----------
@bp.post("/<int:customer_id>/delete")
@login_required
def delete(customer_id):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO deleted_customers "
            "(customer_id, customer_name, city, phone, deleted_by) "
            "SELECT customer_id, customer_name, city, phone, %s "
            "FROM customer WHERE customer_id = %s",
            (session["admin_id"], customer_id))
        if cur.rowcount == 0:
            conn.rollback()
            return fail("Customer not found.", 404)
        cur.execute("DELETE FROM customer WHERE customer_id = %s", (customer_id,))
        conn.commit()
    except IntegrityError:
        conn.rollback()
        return fail("Cannot delete: this customer has existing orders.", 409)
    finally:
        conn.close()
    return ok("Customer moved to the deleted records.")