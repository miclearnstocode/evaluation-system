"""Flask application factory and process entry point."""

from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if __package__:
    from .core import *
    from .routes.admin import bp as admin_bp
    from .routes.auth import bp as auth_bp
    from .routes.evaluator import bp as evaluator_bp
else:
    from core import *
    from routes.admin import bp as admin_bp
    from routes.auth import bp as auth_bp
    from routes.evaluator import bp as evaluator_bp


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        FRONTEND_ORIGINS=[
            item.strip()
            for item in os.getenv(
                "FRONTEND_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000,https://gsu.capsu.edu.ph",
            ).split(",")
            if item.strip()
        ],
        COOKIE_SECURE=os.getenv("COOKIE_SECURE", "0") == "1",
        MIN_RESULT_COUNT=int(os.getenv("MIN_RESULT_COUNT", "5")),
        MAX_CONTENT_LENGTH=64 * 1024,
        DB_FACTORY=_connect,
        TESTING=False,
    )
    if test_config:
        app.config.update(test_config)
    if not app.config["SECRET_KEY"]:
        raise RuntimeError(
            "Set SECRET_KEY in backend/.env, or backend/.env.production with APP_ENV=production, "
            "before starting the API."
        )
    if app.config["MIN_RESULT_COUNT"] < 2:
        raise RuntimeError("MIN_RESULT_COUNT must be at least 2.")
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=app.config["COOKIE_SECURE"],
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    )
    logging.getLogger("werkzeug").addFilter(SuppressSubmissionAccessLog())

    @app.before_request
    def enforce_origin() -> None:
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("Origin")
            if origin and origin not in app.config["FRONTEND_ORIGINS"]:
                raise ApiError("Origin is not allowed.", 403)

    @app.after_request
    def cors_headers(response):
        origin = request.headers.get("Origin")
        if origin in app.config["FRONTEND_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers.add("Vary", "Origin")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return jsonify(error=error.message), error.status

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception):
        if request.path == "/api/evaluator/submit":
            return jsonify(error="Submission could not be completed. Please try again."), 503
        app.logger.exception("Unhandled API error")
        return jsonify(error="The request could not be completed."), 500

    @app.route("/api/<path:_path>", methods=["OPTIONS"])
    def options(_path: str):
        return "", 204

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")








































    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(evaluator_bp)
    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=os.getenv("FLASK_DEBUG") == "1")
