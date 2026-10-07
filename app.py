import datetime as dt
import logging
import math
import os
import re
import threading
import time
from contextlib import contextmanager
from decimal import ROUND_HALF_UP, Decimal
from functools import wraps
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, send_from_directory, session
from flask.json.provider import DefaultJSONProvider

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PRIVATE_DIR = BASE_DIR / "private"
PUBLIC_DIR = BASE_DIR / "public"

TIPOS_COMPRA_GASTO = [
    "Compras y servicios",
    "Alquileres",
    "Reparaciones",
    "Suministros",
    "Tributos",
    "Sueldos/salarios",
    "S.S/autónomos",
    "Inversiones",
    "Otros",
]

PROVEEDOR_COLUMNS = "id, nif, nombre, telefono, email, direccion, ciudad, provincia, cp, fecha_registro"
PROVEEDOR_SORT = {
    "id", "nif", "nombre", "telefono", "email", "direccion", "ciudad", "provincia", "cp", "fecha_registro",
}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
log = logging.getLogger("libro")


class JsonProvider(DefaultJSONProvider):
    """Serializa como mysql2 con dateStrings: fechas y decimales como texto."""

    ensure_ascii = False

    @staticmethod
    def default(o):
        if isinstance(o, dt.datetime):
            return o.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(o, dt.date):
            return o.isoformat()
        if isinstance(o, Decimal):
            return str(o)
        return DefaultJSONProvider.default(o)


class DuplicateEntry(Exception):
    pass


class Database:
    """Acceso a MySQL con PyMySQL. Cada operacion abre su propia conexion."""

    def __init__(self):
        self._config = None

    def _connect(self):
        import pymysql
        from pymysql.cursors import DictCursor

        kwargs = {}
        if os.environ.get("DB_SSL") == "true":
            import ssl

            ctx = ssl.create_default_context()
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            kwargs["ssl"] = ctx
        return pymysql.connect(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", 3306)),
            user=os.environ.get("DB_USER", "root"),
            password=os.environ.get("DB_PASS", ""),
            database=os.environ.get("DB_NAME", "app_pedidos_guty"),
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
            **kwargs,
        )

    @contextmanager
    def transaction(self):
        import pymysql

        conn = self._connect()
        try:
            yield _Tx(conn)
            conn.commit()
        except pymysql.err.IntegrityError as exc:
            conn.rollback()
            if exc.args and exc.args[0] == 1062:
                raise DuplicateEntry() from exc
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def fetchall(self, sql, params=()):
        with self.transaction() as tx:
            return tx.fetchall(sql, params)

    def fetchone(self, sql, params=()):
        with self.transaction() as tx:
            return tx.fetchone(sql, params)

    def execute(self, sql, params=()):
        with self.transaction() as tx:
            return tx.execute(sql, params)


class _Tx:
    def __init__(self, conn):
        self._conn = conn

    def fetchall(self, sql, params=()):
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return list(cur.fetchall())

    def fetchone(self, sql, params=()):
        rows = self.fetchall(sql, params)
        return rows[0] if rows else None

    def execute(self, sql, params=()):
        """Devuelve (filas afectadas, ultimo id insertado)."""
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount, cur.lastrowid


DDL_PROVEEDORES = """
    CREATE TABLE IF NOT EXISTS proveedores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nif VARCHAR(15) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      telefono VARCHAR(15) DEFAULT NULL,
      email VARCHAR(100) DEFAULT NULL,
      direccion VARCHAR(255) DEFAULT NULL,
      ciudad VARCHAR(50) DEFAULT NULL,
      provincia VARCHAR(50) DEFAULT NULL,
      cp VARCHAR(10) DEFAULT NULL,
      fecha_registro TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_proveedores_nif (nif)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_LIBRO = """
    CREATE TABLE IF NOT EXISTS libro_compras_gastos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha_factura DATE NOT NULL,
      proveedor VARCHAR(100) NOT NULL,
      nif_cif VARCHAR(15) NOT NULL,
      numero_factura VARCHAR(50) NOT NULL,
      tipo_compra_gasto ENUM(
        'Compras y servicios',
        'Alquileres',
        'Reparaciones',
        'Suministros',
        'Tributos',
        'Sueldos/salarios',
        'S.S/autónomos',
        'Inversiones',
        'Otros'
      ) NOT NULL,
      base_4 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      iva_4 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      base_10 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      iva_10 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      base_21 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      iva_21 DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      ret_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      retencion DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_factura DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      fecha_registro TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_ret_percent CHECK (ret_percent >= 0 AND ret_percent <= 100)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


def ensure_schema(db):
    db.execute(DDL_PROVEEDORES)
    db.execute(DDL_LIBRO)


# ---------- validaciones ----------

def round2(value):
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def null_if_empty(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def js_number(value):
    """Equivalente a Number(value) de JS; devuelve None si no es finito."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and value.strip() == "":
        return 0.0
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def is_valid_iso_date(value):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value or "")):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"


def is_valid_spanish_nif(value):
    if not value:
        return False
    v = str(value).strip().upper()
    if re.fullmatch(r"\d{8}[A-Z]", v):
        return NIF_LETTERS[int(v[:8]) % 23] == v[8]
    if re.fullmatch(r"[XYZ]\d{7}[A-Z]", v):
        num = int(str("XYZ".index(v[0])) + v[1:8])
        return NIF_LETTERS[num % 23] == v[8]
    return re.fullmatch(r"[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9]", v) is not None


def is_valid_phone(value):
    return bool(value) and re.fullmatch(r"\d{9}", str(value).strip()) is not None


def is_valid_email(value):
    return bool(value) and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", str(value).strip()) is not None


def parse_positive_id(raw):
    try:
        number = int(raw)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def int_or(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------- limitador de intentos ----------

class RateLimiter:
    def __init__(self, window_seconds, max_hits):
        self.window = window_seconds
        self.max = max_hits
        self.hits = {}
        self.lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self.lock:
            recent = [t for t in self.hits.get(key, []) if now - t < self.window]
            if len(recent) >= self.max:
                self.hits[key] = recent
                return False
            recent.append(now)
            self.hits[key] = recent
            return True


# ---------- aplicacion ----------

def create_app(db=None):
    app = Flask(__name__, static_folder=None)
    app.json = JsonProvider(app)
    app.secret_key = os.environ.get("SESSION_SECRET", "change-me")
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("FLASK_ENV") == "production"
        or os.environ.get("NODE_ENV") == "production",
    )
    db = db or Database()
    app.config["DB"] = db
    login_limiter = RateLimiter(15 * 60, 20)

    def fail(message, status):
        return jsonify({"ok": False, "error": message}), status

    @app.before_request
    def log_request():
        log.info("%s %s", request.method, request.full_path.rstrip("?"))

    @app.after_request
    def secure_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.path.startswith("/admin"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def ensure_admin(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            if session.get("admin"):
                return view(*args, **kwargs)
            if request.path.startswith("/admin/api/"):
                return fail("No autorizado", 401)
            return redirect("/admin")

        return wrapper

    def private_html(name):
        return send_from_directory(PRIVATE_DIR, name, max_age=0)

    @app.errorhandler(404)
    def not_found(_error):
        return "Not Found", 404

    @app.errorhandler(Exception)
    def internal_error(error):
        from werkzeug.exceptions import HTTPException

        if isinstance(error, HTTPException):
            return error
        log.exception("Error no controlado: %s", error)
        if request.path.startswith("/admin/api/") or request.path == "/admin/login":
            return fail("Error interno", 500)
        return "Error interno", 500

    # ----- estaticos -----

    @app.get("/")
    def index():
        return redirect("/admin")

    @app.get("/styles.css")
    def styles():
        return send_from_directory(PUBLIC_DIR, "styles.css")

    @app.get("/assets/<path:filename>")
    def assets(filename):
        return send_from_directory(PUBLIC_DIR, filename)

    @app.get("/vendor/<path:filename>")
    def vendor(filename):
        return send_from_directory(PUBLIC_DIR / "vendor", filename)

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    # ----- autenticacion -----

    @app.post("/admin/login")
    def login():
        if not login_limiter.allow(request.remote_addr or "-"):
            return fail("Demasiados intentos, intentalo de nuevo mas tarde.", 429)

        body = request.get_json(silent=True) or request.form or {}
        username = body.get("username")
        password = body.get("password")
        admin_user = os.environ.get("ADMIN_USER", "admin")
        admin_hash = os.environ.get("ADMIN_PASS_HASH", "")

        if not username or not password:
            return fail("Usuario y contrasena requeridos", 400)
        if username != admin_user:
            return fail("Credenciales invalidas", 401)

        if admin_hash:
            try:
                valid = bcrypt.checkpw(str(password).encode(), admin_hash.encode())
            except ValueError:
                valid = False
        else:
            valid = password == "admin123"
        if not valid:
            return fail("Credenciales invalidas", 401)

        session["admin"] = {"username": username}
        return jsonify({"ok": True})

    @app.post("/admin/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    # ----- paginas -----

    @app.get("/admin")
    def admin_home():
        if session.get("admin"):
            return redirect("/admin/libro-gastos-compras")
        return private_html("admin_login.html")

    @app.get("/admin/libro-gastos-compras")
    @ensure_admin
    def libro_page():
        return private_html("libro_gastos_compras.html")

    @app.get("/admin/crear-registro-libro")
    @ensure_admin
    def crear_page():
        return private_html("crear_registro_libro.html")

    # ----- API proveedores -----

    @app.get("/admin/api/proveedores")
    @ensure_admin
    def list_proveedores():
        q = request.args.get("q", "").strip()
        page = max(int_or(request.args.get("page"), 1), 1)
        page_size = min(max(int_or(request.args.get("pageSize"), 20), 1), 500)
        sort = request.args.get("sort", "fecha_registro")
        sort_col = sort if sort in PROVEEDOR_SORT else "fecha_registro"
        sort_dir = "ASC" if request.args.get("dir", "desc").lower() == "asc" else "DESC"
        offset = (page - 1) * page_size

        where = ""
        params = []
        if q:
            cols = ["nombre", "nif", "telefono", "email", "direccion", "ciudad", "provincia", "cp"]
            where = "WHERE (" + " OR ".join(f"{c} LIKE %s" for c in cols) + ")"
            params = [f"%{q}%"] * len(cols)

        sql = (
            f"SELECT {PROVEEDOR_COLUMNS} FROM proveedores {where} "
            f"ORDER BY {sort_col} {sort_dir}, id DESC LIMIT {page_size} OFFSET {offset}"
        )
        return jsonify({"ok": True, "data": db.fetchall(sql, params)})

    @app.put("/admin/api/proveedores/<raw_id>")
    @ensure_admin
    def update_proveedor(raw_id):
        pid = parse_positive_id(raw_id)
        if pid is None:
            return fail("ID invalido", 400)

        current = db.fetchone("SELECT * FROM proveedores WHERE id = %s LIMIT 1", (pid,))
        if not current:
            return fail("Proveedor no encontrado", 404)

        body = request.get_json(silent=True) or {}

        def final(key):
            return null_if_empty(body[key]) if key in body else current.get(key)

        nombre = final("nombre")
        nif = final("nif")
        telefono = final("telefono")
        email = final("email")
        direccion = final("direccion")
        ciudad = final("ciudad")
        provincia = final("provincia")
        cp = final("cp")

        if not nombre:
            return fail("El nombre es obligatorio.", 400)
        if not nif or not is_valid_spanish_nif(nif):
            return fail("El NIF es obligatorio y debe ser valido.", 400)
        if telefono and not is_valid_phone(telefono):
            return fail("El telefono debe tener exactamente 9 digitos.", 400)
        if email and not is_valid_email(email):
            return fail("Introduce un email valido.", 400)

        previous_nif = str(current["nif"]).strip().upper() if current.get("nif") else None
        next_nif = str(nif).strip().upper()
        next_nombre = str(nombre).strip()

        try:
            with db.transaction() as tx:
                tx.execute(
                    "UPDATE proveedores SET nif = %s, nombre = %s, telefono = %s, email = %s, "
                    "direccion = %s, ciudad = %s, provincia = %s, cp = %s WHERE id = %s",
                    (
                        next_nif,
                        next_nombre,
                        str(telefono).strip() if telefono else None,
                        str(email).strip() if email else None,
                        direccion,
                        ciudad,
                        provincia,
                        cp,
                        pid,
                    ),
                )
                if previous_nif:
                    tx.execute(
                        "UPDATE libro_compras_gastos SET proveedor = %s, nif_cif = %s WHERE nif_cif = %s",
                        (next_nombre, next_nif, previous_nif),
                    )
        except DuplicateEntry:
            return fail("El NIF ya existe en otro proveedor.", 400)

        updated = db.fetchone(
            f"SELECT {PROVEEDOR_COLUMNS} FROM proveedores WHERE id = %s LIMIT 1", (pid,)
        )
        return jsonify({"ok": True, "data": updated})

    # ----- API libro -----

    @app.get("/admin/api/libro-gastos-compras")
    @ensure_admin
    def list_libro():
        rows = db.fetchall(
            """SELECT l.id, l.fecha_factura, l.proveedor AS proveedor_nombre, l.nif_cif, p.id AS proveedor_id,
                      p.telefono AS proveedor_telefono, p.email AS proveedor_email, p.direccion AS proveedor_direccion,
                      p.ciudad AS proveedor_ciudad, p.provincia AS proveedor_provincia, p.cp AS codigo_postal,
                      p.fecha_registro AS proveedor_fecha_registro, l.numero_factura, l.tipo_compra_gasto,
                      l.base_4, l.iva_4, l.base_10, l.iva_10, l.base_21, l.iva_21, l.ret_percent, l.retencion,
                      l.total_factura, l.fecha_registro
               FROM libro_compras_gastos l
               LEFT JOIN proveedores p ON p.nif = l.nif_cif
               ORDER BY l.fecha_factura ASC, l.id ASC"""
        )
        return jsonify({"ok": True, "data": rows})

    @app.post("/admin/api/libro-gastos-compras")
    @ensure_admin
    def create_libro():
        body = request.get_json(silent=True) or {}

        def text(key):
            return str(body.get(key) or "").strip()

        fecha = text("fecha_factura")
        proveedor = text("proveedor_nombre")
        nif = text("nif_cif").upper()
        numero = text("numero_factura")
        tipo = text("tipo_compra_gasto")

        if not is_valid_iso_date(fecha):
            return fail("La fecha de factura no es valida.", 400)
        if not proveedor:
            return fail("El proveedor es obligatorio.", 400)
        if not is_valid_spanish_nif(nif):
            return fail("Introduce un N.I.F. / C.I.F. valido.", 400)
        if not numero:
            return fail("El numero de factura es obligatorio.", 400)
        if tipo not in TIPOS_COMPRA_GASTO:
            return fail("El tipo de compra/gasto no es valido.", 400)

        def to_base(key):
            number = js_number(body[key]) if key in body else None
            return number if number is not None and number >= 0 else None

        base4, base10, base21, base0 = (to_base(k) for k in ("base_4", "base_10", "base_21", "base_0"))
        ret_percent = js_number(body["ret_percent"]) if "ret_percent" in body else None

        if None in (base4, base10, base21, base0):
            return fail("Las bases deben ser importes validos mayores o iguales a 0.", 400)
        if ret_percent is None or ret_percent < 0 or ret_percent > 100:
            return fail("La retencion debe estar entre 0% y 100%.", 400)

        iva4 = round2(base4 * 0.04)
        iva10 = round2(base10 * 0.10)
        iva21 = round2(base21 * 0.21)
        suma_bases = base4 + base10 + base21 + base0
        retencion = round2(suma_bases * (ret_percent / 100))
        total = round2(suma_bases + iva4 + iva10 + iva21 - retencion)

        try:
            with db.transaction() as tx:
                _, new_id = tx.execute(
                    """INSERT INTO libro_compras_gastos
                      (fecha_factura, proveedor, nif_cif, numero_factura, tipo_compra_gasto,
                       base_4, iva_4, base_10, iva_10, base_21, iva_21, ret_percent, retencion, total_factura)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (fecha, proveedor, nif, numero, tipo, base4, iva4, base10, iva10,
                     base21, iva21, ret_percent, retencion, total),
                )
                if not tx.fetchone("SELECT id FROM proveedores WHERE nif = %s LIMIT 1", (nif,)):
                    tx.execute("INSERT INTO proveedores (nif, nombre) VALUES (%s, %s)", (nif, proveedor))
                row = tx.fetchone(
                    """SELECT id, fecha_factura, proveedor AS proveedor_nombre, nif_cif, numero_factura, tipo_compra_gasto,
                              base_4, iva_4, base_10, iva_10, base_21, iva_21, ret_percent, retencion, total_factura, fecha_registro
                       FROM libro_compras_gastos
                       WHERE id = %s LIMIT 1""",
                    (new_id,),
                )
        except DuplicateEntry:
            return fail("Ese proveedor ya existe en la base de datos.", 400)

        return jsonify({"ok": True, "data": row}), 201

    @app.delete("/admin/api/libro-gastos-compras/<raw_id>")
    @ensure_admin
    def delete_libro(raw_id):
        rid = parse_positive_id(raw_id)
        if rid is None:
            return fail("ID invalido", 400)
        affected, _ = db.execute("DELETE FROM libro_compras_gastos WHERE id = %s", (rid,))
        if not affected:
            return fail("Registro no encontrado", 404)
        return jsonify({"ok": True, "affectedRows": affected})

    return app


def main():
    db = Database()
    ensure_schema(db)
    app = create_app(db)
    port = int(os.environ.get("PORT", 3000))
    print(f"Servidor en http://localhost:{port}")
    from waitress import serve

    serve(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
