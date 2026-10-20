import re
from functools import wraps
from flask import (Blueprint, render_template, request,
                   session, redirect, url_for, flash)
from mysql.connector.errors import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from db import query, execute

bp = Blueprint("auth", __name__)

# Password rules: change the number here, and the hint text in register.html
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def password_error(password):
    """Return a message saying what is wrong with the password, or None if it is fine."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
    if not re.search(r"\d", password):
        return "Password must include at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include at least one symbol, such as ! @ # $ %."
    return None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "admin_id" not in session:
            flash("Please log in first.")
            return redirect(url_for("auth.login"))
        return f(*args, **kwargs)
    return wrapper


@bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        fullname = request.form.get("fullname", "").strip() or None
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")

        problem = None
        if len(username) < 3:
            problem = "Username must be at least 3 characters."
        elif len(username) > 50:
            problem = "Username must be at most 50 characters."
        elif fullname and len(fullname) > 100:
            problem = "Full name must be at most 100 characters."
        else:
            problem = password_error(password)        # None when the password is fine

        if not problem and password != confirm:
            problem = "Passwords do not match."

        if problem:
            flash(problem)                            # red banner, form keeps what was typed
        else:
            try:
                execute(
                    "INSERT INTO admin (username, password, fullname) VALUES (%s, %s, %s)",
                    (username, generate_password_hash(password), fullname))
            except IntegrityError:                    # the UNIQUE rule on username
                flash("That username is already taken.")
            else:
                flash("Account created. You can log in now.", "success")
                return redirect(url_for("auth.login"))

    return render_template("register.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        admin = query(
            "SELECT admin_id, password, fullname FROM admin WHERE username = %s",
            (username,), one=True)

        if admin and check_password_hash(admin["password"], password):
            session.clear()
            session["admin_id"] = admin["admin_id"]
            session["name"] = admin["fullname"] or username
            session.permanent = "remember" in request.form   # Remember me
            return redirect(url_for("dashboard"))
        flash("Invalid username or password.")
    return render_template("login.html")


@bp.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("auth.login"))