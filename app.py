import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template
from routes.auth import bp as auth_bp, login_required
from routes.products import bp as products_bp
from routes.customers import bp as customers_bp
from routes.orders import bp as orders_bp
from routes.export import bp as export_bp
from routes.dashboard import bp as dash_bp, filter_options

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
app.permanent_session_lifetime = timedelta(days=30)

for blueprint in (auth_bp, products_bp, customers_bp, orders_bp, export_bp, dash_bp):
    app.register_blueprint(blueprint)


@app.route("/")
@login_required
def dashboard():
    return render_template("dashboard.html", **filter_options())

if __name__ == "__main__":
    app.run(debug=True)