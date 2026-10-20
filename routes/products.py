from decimal import Decimal, InvalidOperation
from flask import Blueprint, render_template, request, session
from mysql.connector.errors import IntegrityError
from db import query, execute, get_conn
from routes.auth import login_required
from routes.helpers import ok, fail, order_by

bp = Blueprint("products", __name__, url_prefix="/products")


def read_form():
    """Read and validate the product form. Returns (data, error)."""
    flavor = request.form.get("flavor", "").strip()
    category = request.form.get("category", "").strip() or "General"
    is_active = "is_active" in request.form          # checkbox: present only if ticked

    if not flavor:
        return None, "Flavor is required."
    try:
        price = Decimal(request.form.get("price", "").strip())
    except InvalidOperation:
        return None, "Price must be a number."
    if not price.is_finite() or price < 0 or price > 1000000:
        return None, "Price must be between 0 and 1,000,000."

    return {"flavor": flavor, "category": category,
            "price": price, "is_active": is_active}, None


# ---------- PAGE: list + search + KPIs ----------
@bp.route("/")
@login_required
def index():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "")

    where, params = ["1 = 1"], []
    if q:
        where.append("(p.flavor LIKE %s OR p.category LIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if status == "active":
        where.append("p.is_active = TRUE")
    elif status == "inactive":
        where.append("p.is_active = FALSE")

    sort_key, sort_dir, order_sql = order_by(
    {"id": "p.product_id", "flavor": "p.flavor", "category": "p.category",
        "price": "p.price", "units": "units", "status": "p.is_active"},
    default_key="flavor", tiebreak="p.product_id")

    products = query(f"""
        SELECT p.product_id, p.flavor, p.category, p.price, p.is_active,
               COALESCE(SUM(CASE WHEN o.status <> 'cancelled'
                                 THEN oi.quantity END), 0) AS units
        FROM product p
        LEFT JOIN order_items oi ON oi.product_id = p.product_id
        LEFT JOIN orders o       ON o.order_id    = oi.order_id
        WHERE {' AND '.join(where)}
        GROUP BY p.product_id, p.flavor, p.category, p.price, p.is_active
        ORDER BY {order_sql}
    """, tuple(params))

    totals = query("SELECT COUNT(*) AS total_count, "
                   "COALESCE(SUM(is_active), 0) AS active_count FROM product", one=True)
    best = query("""
        SELECT p.flavor, SUM(oi.quantity) AS units
        FROM order_items oi
        JOIN orders  o ON o.order_id   = oi.order_id
        JOIN product p ON p.product_id = oi.product_id
        WHERE o.status <> 'cancelled'
        GROUP BY p.product_id, p.flavor
        ORDER BY units DESC LIMIT 1
    """, one=True)
    archived = query("SELECT COUNT(*) AS n FROM deleted_products", one=True)["n"]

    total, active = int(totals["total_count"]), int(totals["active_count"])
    stats = {
        "total": total, "active": active, "inactive": total - active,
        "best_name": best["flavor"] if best else "-",
        "best_units": int(best["units"]) if best else 0,
        "archived": int(archived),
    }

    deleted = query("""
        SELECT d.*, a.username AS deleted_by_name
        FROM deleted_products d
        LEFT JOIN admin a ON a.admin_id = d.deleted_by
        ORDER BY d.deleted_at DESC LIMIT 200
    """)

    return render_template("products.html", products=products, q=q, status=status,
                        stats=stats, deleted=deleted,
                        sort_key=sort_key, sort_dir=sort_dir)


# ---------- ADD (JSON) ----------
@bp.post("/add")
@login_required
def add():
    data, error = read_form()
    if error:
        return fail(error)
    try:
        execute("INSERT INTO product (flavor, category, price, is_active) "
                "VALUES (%s, %s, %s, %s)",
                (data["flavor"], data["category"], data["price"], data["is_active"]))
    except IntegrityError:
        return fail("That flavor already exists.", 409)
    return ok("Product added.")


# ---------- EDIT (JSON) ----------
@bp.post("/<int:product_id>/edit")
@login_required
def edit(product_id):
    if not query("SELECT 1 FROM product WHERE product_id = %s", (product_id,), one=True):
        return fail("Product not found.", 404)
    data, error = read_form()
    if error:
        return fail(error)
    try:
        execute("UPDATE product SET flavor=%s, category=%s, price=%s, is_active=%s "
                "WHERE product_id=%s",
                (data["flavor"], data["category"], data["price"],
                 data["is_active"], product_id))
    except IntegrityError:
        return fail("That flavor already exists.", 409)
    return ok("Product updated.")


# ---------- DELETE = move to archive (JSON) ----------
@bp.post("/<int:product_id>/delete")
@login_required
def delete(product_id):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO deleted_products "
            "(product_id, flavor, category, price, is_active, deleted_by) "
            "SELECT product_id, flavor, category, price, is_active, %s "
            "FROM product WHERE product_id = %s",
            (session["admin_id"], product_id))
        if cur.rowcount == 0:
            conn.rollback()
            return fail("Product not found.", 404)
        cur.execute("DELETE FROM product WHERE product_id = %s", (product_id,))
        conn.commit()
    except IntegrityError:
        conn.rollback()
        return fail("Cannot delete: this product is used in existing orders. "
                    "Edit it and untick Active instead.", 409)
    finally:
        conn.close()
    return ok("Product moved to the deleted records.")