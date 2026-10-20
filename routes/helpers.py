from datetime import datetime
from math import ceil
from flask import jsonify, flash, request

PER_PAGE = 25


def ok(message):
    """Success: queue a toast for the next page load and tell the browser."""
    flash(message, "success")
    return jsonify(ok=True, message=message)


def fail(error, status=400):
    """Failure: the modal shows this text inline."""
    return jsonify(ok=False, error=error), status


def paginate(total, per_page=PER_PAGE):
    """Returns (page, pages, offset, per_page) from ?page=."""
    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    pages = max(1, ceil(total / per_page))
    page = min(max(1, page), pages)
    return page, pages, (page - 1) * per_page, per_page


def parse_day(text):
    """'2026-01-31' -> date, or None if empty or invalid."""
    try:
        return datetime.strptime((text or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        return None

def order_by(allowed, default_key, default_dir="asc", tiebreak="", nullable=()):
    """Build a safe ORDER BY from ?sort=...&dir=...

    `allowed` maps a sort key to a SQL expression. Only keys in that dict are
    accepted, so nothing typed in the URL ever reaches the SQL text.
    `nullable` lists keys whose empty values should always come last.
    Returns (key, direction, sql).
    """
    key = request.args.get("sort", "")
    if key in allowed:
        direction = "desc" if request.args.get("dir") == "desc" else "asc"
    else:
        key, direction = default_key, default_dir

    expr = allowed[key]
    sql = f"{expr} {direction.upper()}"
    if key in nullable:
        sql = f"({expr} IS NULL), {sql}"           # NULLs last in both directions
    if tiebreak:
        sql += f", {tiebreak}"                      # keeps page order stable
    return key, direction, sql