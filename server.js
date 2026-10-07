const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TIPOS_COMPRA_GASTO = [
  'Compras y servicios',
  'Alquileres',
  'Reparaciones',
  'Suministros',
  'Tributos',
  'Sueldos/salarios',
  'S.S/autónomos',
  'Inversiones',
  'Otros',
];

let pool = global.pool || null;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos, intentalo de nuevo mas tarde.' },
});

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/vendor/react', express.static(path.join(__dirname, 'node_modules', 'react', 'umd'), { index: false }));
app.use('/vendor/react-dom', express.static(path.join(__dirname, 'node_modules', 'react-dom', 'umd'), { index: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

app.use('/admin', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function getPool() {
  if (!pool && global.pool) {
    pool = global.pool;
  }
  if (!pool) {
    throw new Error('La conexion a la base de datos no esta inicializada.');
  }
  return pool;
}

function sendPrivateHtml(res, filename) {
  return res.sendFile(path.join(__dirname, 'private', filename), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nullIfEmpty(value) {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }
  const [year, month, day] = String(value).split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidSpanishNif(value) {
  if (!value) return false;
  const v = String(value).trim().toUpperCase();
  const dni = /^\d{8}[A-Z]$/;
  const nie = /^[XYZ]\d{7}[A-Z]$/;
  const cif = /^[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9]$/;
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';

  if (dni.test(v)) {
    const num = parseInt(v.slice(0, 8), 10);
    return letters[num % 23] === v.slice(8);
  }

  if (nie.test(v)) {
    const map = { X: '0', Y: '1', Z: '2' };
    const num = parseInt(map[v[0]] + v.slice(1, 8), 10);
    return letters[num % 23] === v.slice(8);
  }

  return cif.test(v);
}

function isValidSpanishPhone(value) {
  if (!value) return false;
  return /^\d{9}$/.test(String(value).trim());
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  if (req.originalUrl.startsWith('/admin/api/')) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  return res.redirect('/admin');
}

app.get('/', (_req, res) => {
  res.redirect('/admin');
});

app.get('/styles.css', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminHash = process.env.ADMIN_PASS_HASH || '';

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Usuario y contrasena requeridos' });
    }

    if (username !== adminUser) {
      return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
    }

    const valid = adminHash ? await bcrypt.compare(password, adminHash) : password === 'admin123';
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
    }

    req.session.admin = { username };
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error iniciando sesion:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.post('/admin/logout', (req, res) => {
  if (!req.session) {
    return res.json({ ok: true });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error('Error cerrando sesion:', error);
      return res.status(500).json({ ok: false, error: 'Error interno' });
    }
    return res.json({ ok: true });
  });
});

app.get('/admin', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/libro-gastos-compras');
  }

  return sendPrivateHtml(res, 'admin_login.html');
});

app.get('/admin/libro-gastos-compras', ensureAdmin, (_req, res) => {
  return sendPrivateHtml(res, 'libro_gastos_compras.html');
});

app.get('/admin/crear-registro-libro', ensureAdmin, (_req, res) => {
  return sendPrivateHtml(res, 'crear_registro_libro.html');
});

app.get('/admin/api/proveedores', ensureAdmin, async (req, res) => {
  try {
    const sortMap = {
      id: 'id',
      nif: 'nif',
      nombre: 'nombre',
      telefono: 'telefono',
      email: 'email',
      direccion: 'direccion',
      ciudad: 'ciudad',
      provincia: 'provincia',
      cp: 'cp',
      fecha_registro: 'fecha_registro',
    };

    const q = String(req.query.q || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 500);
    const sortParam = String(req.query.sort || 'fecha_registro');
    const dirParam = String(req.query.dir || 'desc').toLowerCase();
    const sortCol = sortMap[sortParam] || 'fecha_registro';
    const sortDir = dirParam === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];

    if (q) {
      const like = `%${q}%`;
      where.push('(nombre LIKE ? OR nif LIKE ? OR telefono LIKE ? OR email LIKE ? OR direccion LIKE ? OR ciudad LIKE ? OR provincia LIKE ? OR cp LIKE ?)');
      params.push(like, like, like, like, like, like, like, like);
    }

    const sql = `SELECT id, nif, nombre, telefono, email, direccion, ciudad, provincia, cp, fecha_registro
      FROM proveedores
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${sortCol} ${sortDir}, id DESC
      LIMIT ${pageSize} OFFSET ${offset}`;

    const [rows] = await getPool().execute(sql, params);
    return res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error listando proveedores:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.put('/admin/api/proveedores/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }

    const db = getPool();
    const [rows] = await db.execute('SELECT * FROM proveedores WHERE id = ? LIMIT 1', [id]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Proveedor no encontrado' });
    }

    const current = rows[0];
    const body = req.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

    const nombreFinal = has('nombre') ? nullIfEmpty(body.nombre) : current.nombre;
    const nifFinal = has('nif') ? nullIfEmpty(body.nif) : current.nif;
    const telefonoFinal = has('telefono') ? nullIfEmpty(body.telefono) : current.telefono;
    const emailFinal = has('email') ? nullIfEmpty(body.email) : current.email;
    const direccionFinal = has('direccion') ? nullIfEmpty(body.direccion) : current.direccion;
    const ciudadFinal = has('ciudad') ? nullIfEmpty(body.ciudad) : current.ciudad;
    const provinciaFinal = has('provincia') ? nullIfEmpty(body.provincia) : current.provincia;
    const cpFinal = has('cp') ? nullIfEmpty(body.cp) : current.cp;

    if (!nombreFinal) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
    }

    if (!nifFinal || !isValidSpanishNif(nifFinal)) {
      return res.status(400).json({ ok: false, error: 'El NIF es obligatorio y debe ser valido.' });
    }

    if (telefonoFinal && !isValidSpanishPhone(telefonoFinal)) {
      return res.status(400).json({ ok: false, error: 'El telefono debe tener exactamente 9 digitos.' });
    }

    if (emailFinal && !isValidEmail(emailFinal)) {
      return res.status(400).json({ ok: false, error: 'Introduce un email valido.' });
    }

    const previousNif = current.nif ? String(current.nif).trim().toUpperCase() : null;
    const nextNif = String(nifFinal).trim().toUpperCase();
    const nextNombre = String(nombreFinal).trim();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `UPDATE proveedores
         SET nif = ?, nombre = ?, telefono = ?, email = ?, direccion = ?, ciudad = ?, provincia = ?, cp = ?
         WHERE id = ?`,
        [
          nextNif,
          nextNombre,
          telefonoFinal ? String(telefonoFinal).trim() : null,
          emailFinal ? String(emailFinal).trim() : null,
          direccionFinal,
          ciudadFinal,
          provinciaFinal,
          cpFinal,
          id,
        ]
      );

      if (previousNif) {
        await conn.execute(
          `UPDATE libro_compras_gastos
           SET proveedor = ?, nif_cif = ?
           WHERE nif_cif = ?`,
          [nextNombre, nextNif, previousNif]
        );
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const [updatedRows] = await db.execute(
      'SELECT id, nif, nombre, telefono, email, direccion, ciudad, provincia, cp, fecha_registro FROM proveedores WHERE id = ? LIMIT 1',
      [id]
    );

    return res.json({ ok: true, data: updatedRows[0] || null });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, error: 'El NIF ya existe en otro proveedor.' });
    }
    console.error('Error actualizando proveedor:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.get('/admin/api/libro-gastos-compras', ensureAdmin, async (_req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT l.id, l.fecha_factura, l.proveedor AS proveedor_nombre, l.nif_cif, p.id AS proveedor_id,
              p.telefono AS proveedor_telefono, p.email AS proveedor_email, p.direccion AS proveedor_direccion,
              p.ciudad AS proveedor_ciudad, p.provincia AS proveedor_provincia, p.cp AS codigo_postal,
              p.fecha_registro AS proveedor_fecha_registro, l.numero_factura, l.tipo_compra_gasto,
              l.base_4, l.iva_4, l.base_10, l.iva_10, l.base_21, l.iva_21, l.ret_percent, l.retencion,
              l.total_factura, l.fecha_registro
       FROM libro_compras_gastos l
       LEFT JOIN proveedores p ON p.nif = l.nif_cif
       ORDER BY l.fecha_factura ASC, l.id ASC`
    );

    return res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error listando libro de gastos y compras:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.post('/admin/api/libro-gastos-compras', ensureAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const fechaFactura = String(body.fecha_factura || '').trim();
    const proveedorNombre = String(body.proveedor_nombre || '').trim();
    const nifCif = String(body.nif_cif || '').trim().toUpperCase();
    const numeroFactura = String(body.numero_factura || '').trim();
    const tipoCompraGasto = String(body.tipo_compra_gasto || '').trim();

    if (!isValidIsoDate(fechaFactura)) {
      return res.status(400).json({ ok: false, error: 'La fecha de factura no es valida.' });
    }

    if (!proveedorNombre) {
      return res.status(400).json({ ok: false, error: 'El proveedor es obligatorio.' });
    }

    if (!isValidSpanishNif(nifCif)) {
      return res.status(400).json({ ok: false, error: 'Introduce un N.I.F. / C.I.F. valido.' });
    }

    if (!numeroFactura) {
      return res.status(400).json({ ok: false, error: 'El numero de factura es obligatorio.' });
    }

    if (!TIPOS_COMPRA_GASTO.includes(tipoCompraGasto)) {
      return res.status(400).json({ ok: false, error: 'El tipo de compra/gasto no es valido.' });
    }

    const toBase = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : null;
    };

    const base4 = toBase(body.base_4);
    const base10 = toBase(body.base_10);
    const base21 = toBase(body.base_21);
    const base0 = toBase(body.base_0);
    const retPercent = Number(body.ret_percent);

    if (base4 === null || base10 === null || base21 === null || base0 === null) {
      return res.status(400).json({ ok: false, error: 'Las bases deben ser importes validos mayores o iguales a 0.' });
    }

    if (!Number.isFinite(retPercent) || retPercent < 0 || retPercent > 100) {
      return res.status(400).json({ ok: false, error: 'La retencion debe estar entre 0% y 100%.' });
    }

    const iva4 = round2(base4 * 0.04);
    const iva10 = round2(base10 * 0.10);
    const iva21 = round2(base21 * 0.21);
    const sumaBases = base4 + base10 + base21 + base0;
    const totalIva = iva4 + iva10 + iva21;
    const retencion = round2(sumaBases * (retPercent / 100));
    const totalFactura = round2(sumaBases + totalIva - retencion);

    const db = getPool();
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO libro_compras_gastos
          (fecha_factura, proveedor, nif_cif, numero_factura, tipo_compra_gasto,
           base_4, iva_4, base_10, iva_10, base_21, iva_21, ret_percent, retencion, total_factura)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fechaFactura,
          proveedorNombre,
          nifCif,
          numeroFactura,
          tipoCompraGasto,
          base4,
          iva4,
          base10,
          iva10,
          base21,
          iva21,
          retPercent,
          retencion,
          totalFactura,
        ]
      );

      const [proveedores] = await conn.execute('SELECT id FROM proveedores WHERE nif = ? LIMIT 1', [nifCif]);
      if (!Array.isArray(proveedores) || proveedores.length === 0) {
        await conn.execute('INSERT INTO proveedores (nif, nombre) VALUES (?, ?)', [nifCif, proveedorNombre]);
      }

      const [rows] = await conn.execute(
        `SELECT id, fecha_factura, proveedor AS proveedor_nombre, nif_cif, numero_factura, tipo_compra_gasto,
                base_4, iva_4, base_10, iva_10, base_21, iva_21, ret_percent, retencion, total_factura, fecha_registro
         FROM libro_compras_gastos
         WHERE id = ? LIMIT 1`,
        [result.insertId]
      );

      await conn.commit();
      return res.status(201).json({ ok: true, data: rows[0] || null });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, error: 'Ese proveedor ya existe en la base de datos.' });
    }
    console.error('Error creando registro del libro de gastos y compras:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.delete('/admin/api/libro-gastos-compras/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'ID invalido' });
    }

    const [result] = await getPool().execute('DELETE FROM libro_compras_gastos WHERE id = ?', [id]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    }

    return res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (error) {
    console.error('Error eliminando registro del libro de gastos y compras:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

app.use((_req, res) => {
  res.status(404).send('Not Found');
});

async function ensureSchema() {
  const db = getPool();

  const ddlProveedores = `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const ddlLibro = `
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    await db.execute(ddlProveedores);
    await db.execute(ddlLibro);
  } catch (error) {
    console.error('Error al asegurar esquema:', error);
    throw error;
  }
}

async function start() {
  try {
    if (!pool && global.pool) {
      pool = global.pool;
    }

    if (!pool) {
      pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'app_pedidos_guty',
        dateStrings: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined,
      });
    }

    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar la aplicacion:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start, ensureSchema };
