import csv
from io import StringIO
from datetime import datetime
from flask import Blueprint, Response
from db import query
from routes.auth import login_required

bp = Blueprint("export", __name__, url_prefix="/export")

COLUMNS = ["order_id", "order_date", "customer_name", "flavor", "category",
           "quantity", "unit_price", "total_price", "status", "encoded_by"]


@bp.route("/sales.csv")
@login_required
def sales_csv():
    rows = query("""
        SELECT o.order_id,
               DATE(o.order_date)            AS order_date,
               c.customer_name,
               p.flavor,
               p.category,
               oi.quantity,
               oi.unit_price,
               oi.quantity * oi.unit_price   AS total_price,
               o.status,
               a.username                    AS encoded_by
        FROM order_items oi
        JOIN orders   o ON o.order_id    = oi.order_id
        JOIN customer c ON c.customer_id = o.customer_id
        JOIN product  p ON p.product_id  = oi.product_id
        JOIN admin    a ON a.admin_id    = o.admin_id
        ORDER BY o.order_date, o.order_id, p.flavor
    """)

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)
    for r in rows:
        writer.writerow([r[c] for c in COLUMNS])

    filename = f"banaging_sales_{datetime.now():%Y%m%d}.csv"
    # utf-8-sig adds a BOM so Excel reads characters like "Niña" correctly
    return Response(
        buf.getvalue().encode("utf-8-sig"),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"})