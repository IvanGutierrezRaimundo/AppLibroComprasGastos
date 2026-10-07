# App Libro Compras y Gastos

Aplicacion privada centrada exclusivamente en la gestion del **libro de gastos y compras** y en el mantenimiento minimo de **proveedores** asociado a ese libro.

## Alcance actual

La aplicacion solo conserva:

- Acceso privado de administrador.
- Consulta del libro de gastos y compras.
- Alta de registros del libro.
- Edicion basica de proveedores ya vinculados al libro.
- Calculo de IVA, retencion y total de factura.

Se ha eliminado el sitio publico y el resto de modulos ajenos a este flujo.

## Stack

- Python 3 + Flask (servidor con Waitress)
- MySQL con `PyMySQL`
- React en cliente para el login, el formulario de creacion y la pantalla principal del libro
- HTML, CSS y JavaScript para las pantallas multipagina
- Sesion firmada en cookie para el acceso privado (React se sirve desde `public/vendor`, sin Node)
- Tests con `pytest`

## Variables de entorno

| Variable | Descripcion | Valor por defecto |
|---|---|---|
| `PORT` | Puerto HTTP | `3000` |
| `DB_HOST` | Host MySQL | `localhost` |
| `DB_PORT` | Puerto MySQL | `3306` |
| `DB_USER` | Usuario MySQL | `root` |
| `DB_PASS` | Contrasena MySQL | vacio |
| `DB_NAME` | Base de datos | `app_pedidos_guty` |
| `DB_SSL` | Activa TLS si vale `true` | vacio |
| `SESSION_SECRET` | Secreto de sesion | `change-me` |
| `ADMIN_USER` | Usuario administrador | `admin` |
| `ADMIN_PASS_HASH` | Hash bcrypt de la contrasena | vacio |
| `FLASK_ENV` | Con valor `production` activa la cookie segura | vacio |

Si `ADMIN_PASS_HASH` no esta definido, la contrasena por defecto es `admin123`. Cambiala antes de usar la aplicacion en produccion.

## Instalacion

```powershell
Push-Location "C:\Users\Guty\Desktop\AppLibroComprasGastos"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Tests:

```powershell
python -m pytest
```

## Rutas principales

- `/admin`: login o redireccion al libro si ya hay sesion.
- `/admin/libro-gastos-compras`: listado y calculos del libro.
- `/admin/crear-registro-libro`: alta de un registro.
- `/admin/api/proveedores`: listado de proveedores para el selector.
- `/admin/api/libro-gastos-compras`: API privada del libro.

## Esquema

Al arrancar, el servidor asegura solo estas tablas:

- `proveedores`
- `libro_compras_gastos`

No hace falta importar ningun dump para que la aplicacion funcione.
