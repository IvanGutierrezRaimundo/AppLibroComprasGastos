import copy
import re
from contextlib import contextmanager

import pytest

import app as libro_app

TS = "2026-10-07 08:00:00"


class FakeDb:
    """Base de datos en memoria que reconoce las consultas usadas por la app."""

    def __init__(self):
        self.next_id = 1
        self.proveedores = []
        self.libro = []

    @staticmethod
    def _norm(sql):
        return re.sub(r"\s+", " ", sql).strip()

    def _hydrate(self, row):
        p = next((x for x in self.proveedores if x["nif"] == row["nif_cif"]), None)
        g = (lambda k: p[k] if p else None)
        return {
            "id": row["id"], "fecha_factura": row["fecha_factura"],
            "proveedor_nombre": row["proveedor"], "nif_cif": row["nif_cif"],
            "proveedor_id": g("id"), "proveedor_telefono": g("telefono"),
            "proveedor_email": g("email"), "proveedor_direccion": g("direccion"),
            "proveedor_ciudad": g("ciudad"), "proveedor_provincia": g("provincia"),
            "codigo_postal": g("cp"), "proveedor_fecha_registro": g("fecha_registro"),
            **{k: row[k] for k in (
                "numero_factura", "tipo_compra_gasto", "base_4", "iva_4", "base_10", "iva_10",
                "base_21", "iva_21", "ret_percent", "retencion", "total_factura", "fecha_registro")},
        }

    def fetchall(self, sql, params=()):
        q = self._norm(sql)
        if q.startswith("SELECT * FROM proveedores WHERE id"):
            return [p for p in self.proveedores if p["id"] == params[0]]
        if q.startswith("SELECT id, nif, nombre") and "WHERE id = %s" in q:
            return [p for p in self.proveedores if p["id"] == params[0]]
        if q.startswith("SELECT id FROM proveedores WHERE nif"):
            return [{"id": p["id"]} for p in self.proveedores if p["nif"] == params[0]]
        if q.startswith("SELECT id, nif, nombre"):
            rows = list(self.proveedores)
            if params:
                term = params[0].replace("%", "").lower()
                rows = [r for r in rows if any(
                    term in str(r[c] or "").lower()
                    for c in ("nombre", "nif", "telefono", "email", "direccion", "ciudad", "provincia", "cp"))]
            if "ORDER BY nombre ASC" in q:
                rows.sort(key=lambda r: r["nombre"])
            return rows
        if q.startswith("SELECT id, fecha_factura, proveedor AS proveedor_nombre"):
            row = next((r for r in self.libro if r["id"] == params[0]), None)
            return [] if not row else [{
                "id": row["id"], "fecha_factura": row["fecha_factura"],
                "proveedor_nombre": row["proveedor"], "nif_cif": row["nif_cif"],
                **{k: row[k] for k in (
                    "numero_factura", "tipo_compra_gasto", "base_4", "iva_4", "base_10", "iva_10",
                    "base_21", "iva_21", "ret_percent", "retencion", "total_factura", "fecha_registro")}}]
        if q.startswith("SELECT l.id"):
            rows = sorted(self.libro, key=lambda r: (r["fecha_factura"], r["id"]))
            return [self._hydrate(r) for r in rows]
        return []

    def fetchone(self, sql, params=()):
        rows = self.fetchall(sql, params)
        return rows[0] if rows else None

    def execute(self, sql, params=()):
        q = self._norm(sql)
        if q.startswith("CREATE TABLE"):
            return 0, 0
        if q.startswith("INSERT INTO proveedores"):
            nif, nombre = params
            if any(p["nif"] == nif for p in self.proveedores):
                raise libro_app.DuplicateEntry()
            row = {"id": self.next_id, "nif": nif, "nombre": nombre, "telefono": None, "email": None,
                   "direccion": None, "ciudad": None, "provincia": None, "cp": None, "fecha_registro": TS}
            self.next_id += 1
            self.proveedores.append(row)
            return 1, row["id"]
        if q.startswith("UPDATE proveedores SET"):
            nif, nombre, telefono, email, direccion, ciudad, provincia, cp, pid = params
            if any(p["nif"] == nif and p["id"] != pid for p in self.proveedores):
                raise libro_app.DuplicateEntry()
            for p in self.proveedores:
                if p["id"] == pid:
                    p.update(nif=nif, nombre=nombre, telefono=telefono, email=email,
                             direccion=direccion, ciudad=ciudad, provincia=provincia, cp=cp)
                    return 1, 0
            return 0, 0
        if q.startswith("UPDATE libro_compras_gastos SET"):
            nombre, nif_new, nif_old = params
            for r in self.libro:
                if r["nif_cif"] == nif_old:
                    r.update(proveedor=nombre, nif_cif=nif_new)
            return 1, 0
        if q.startswith("INSERT INTO libro_compras_gastos"):
            keys = ("fecha_factura", "proveedor", "nif_cif", "numero_factura", "tipo_compra_gasto",
                    "base_4", "iva_4", "base_10", "iva_10", "base_21", "iva_21",
                    "ret_percent", "retencion", "total_factura")
            row = {"id": self.next_id, **dict(zip(keys, params)), "fecha_registro": TS}
            self.next_id += 1
            self.libro.append(row)
            return 1, row["id"]
        if q.startswith("DELETE FROM libro_compras_gastos"):
            before = len(self.libro)
            self.libro = [r for r in self.libro if r["id"] != params[0]]
            return before - len(self.libro), 0
        return 0, 0

    @contextmanager
    def transaction(self):
        snapshot = copy.deepcopy((self.proveedores, self.libro, self.next_id))
        try:
            yield self
        except Exception:
            self.proveedores, self.libro, self.next_id = snapshot
            raise


@pytest.fixture
def db():
    return FakeDb()


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.delenv("ADMIN_PASS_HASH", raising=False)
    monkeypatch.delenv("ADMIN_USER", raising=False)
    return libro_app.create_app(db).test_client()


def login(client):
    res = client.post("/admin/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    return res


def test_health_y_raiz_redirige(client):
    health = client.get("/health")
    assert health.status_code == 200 and health.get_json()["ok"] is True
    root = client.get("/")
    assert root.status_code == 302 and root.headers["Location"].endswith("/admin")


def test_login_y_redireccion_al_libro(client):
    page = client.get("/admin")
    assert page.status_code == 200
    assert b"Libro de gastos y compras" in page.data

    assert client.get("/admin/libro-gastos-compras").status_code == 302
    assert client.get("/admin/api/libro-gastos-compras").status_code == 401

    login(client)
    admin = client.get("/admin")
    assert admin.status_code == 302 and admin.headers["Location"].endswith("/admin/libro-gastos-compras")
    libro = client.get("/admin/libro-gastos-compras")
    assert libro.status_code == 200 and b"Crear registro" in libro.data

    assert client.post("/admin/logout").get_json()["ok"] is True
    assert client.get("/admin/api/libro-gastos-compras").status_code == 401


def test_login_incorrecto(client):
    res = client.post("/admin/login", json={"username": "admin", "password": "mal"})
    assert res.status_code == 401


def test_assets_y_react_se_sirven(client):
    for url in ("/styles.css", "/assets/react-login.js",
                "/vendor/react/react.production.min.js", "/vendor/react-dom/react-dom.production.min.js"):
        assert client.get(url).status_code == 200, url


def test_crear_listar_y_borrar_registro(client, db):
    login(client)
    create = client.post("/admin/api/libro-gastos-compras", json={
        "fecha_factura": "2026-10-07", "proveedor_nombre": "Proveedor Fiscal", "nif_cif": "B12345678",
        "numero_factura": "FAC-001", "tipo_compra_gasto": "Suministros",
        "base_4": 0, "base_10": 100, "base_21": 50, "base_0": 25, "ret_percent": 10,
    })
    assert create.status_code == 201
    data = create.get_json()["data"]
    assert data["total_factura"] == 178
    assert len(db.proveedores) == 1 and db.proveedores[0]["nombre"] == "Proveedor Fiscal"

    listing = client.get("/admin/api/libro-gastos-compras").get_json()["data"]
    assert len(listing) == 1 and listing[0]["proveedor_id"] == db.proveedores[0]["id"]

    deleted = client.delete(f"/admin/api/libro-gastos-compras/{data['id']}")
    assert deleted.status_code == 200 and deleted.get_json()["ok"] is True
    assert db.libro == []
    assert client.delete("/admin/api/libro-gastos-compras/999").status_code == 404


def test_validaciones_de_alta(client):
    login(client)
    base = {"fecha_factura": "2026-10-07", "proveedor_nombre": "X", "nif_cif": "B12345678",
            "numero_factura": "1", "tipo_compra_gasto": "Otros",
            "base_4": 0, "base_10": 0, "base_21": 10, "base_0": 0, "ret_percent": 0}
    for patch in ({"fecha_factura": "2026-02-30"}, {"nif_cif": "123"}, {"tipo_compra_gasto": "x"},
                  {"base_21": -1}, {"ret_percent": 101}):
        res = client.post("/admin/api/libro-gastos-compras", json={**base, **patch})
        assert res.status_code == 400, patch


def test_editar_proveedor_sincroniza_libro(client, db):
    db.proveedores.append({"id": db.next_id, "nif": "B12345678", "nombre": "Antiguo", "telefono": "612345678",
                           "email": "a@b.com", "direccion": "Calle", "ciudad": "Madrid",
                           "provincia": "Madrid", "cp": "28001", "fecha_registro": TS})
    pid = db.next_id
    db.next_id += 1
    db.libro.append({"id": db.next_id, "fecha_factura": "2026-10-01", "proveedor": "Antiguo",
                     "nif_cif": "B12345678", "numero_factura": "F1", "tipo_compra_gasto": "Otros",
                     "base_4": 0, "iva_4": 0, "base_10": 0, "iva_10": 0, "base_21": 100, "iva_21": 21,
                     "ret_percent": 0, "retencion": 0, "total_factura": 121, "fecha_registro": TS})
    login(client)

    res = client.put(f"/admin/api/proveedores/{pid}", json={
        "nombre": "Renovado", "nif": "B87654321", "telefono": "698765432", "email": "n@e.com",
        "direccion": "Dos", "ciudad": "Oviedo", "provincia": "Asturias", "cp": "33001"})
    assert res.status_code == 200
    assert db.libro[0]["proveedor"] == "Renovado" and db.libro[0]["nif_cif"] == "B87654321"

    listing = client.get("/admin/api/proveedores?page=1&pageSize=50&sort=nombre&dir=asc").get_json()
    assert [p["nombre"] for p in listing["data"]] == ["Renovado"]


def test_pagina_publica_no_existe(client):
    assert client.get("/public/index.html").status_code == 404
