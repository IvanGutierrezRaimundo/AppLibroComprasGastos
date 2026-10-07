const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

function makeDbState() {
  const state = {
    nextId: 1,
    proveedores: [],
    libroComprasGastos: [],
  };

  function normalizeQuery(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
  }

  function hydrateLibroRow(row) {
    const proveedor = state.proveedores.find((item) => item.nif === row.nif_cif) || null;
    return {
      id: row.id,
      fecha_factura: row.fecha_factura,
      proveedor_nombre: row.proveedor,
      nif_cif: row.nif_cif,
      proveedor_id: proveedor ? proveedor.id : null,
      proveedor_telefono: proveedor ? proveedor.telefono : null,
      proveedor_email: proveedor ? proveedor.email : null,
      proveedor_direccion: proveedor ? proveedor.direccion : null,
      proveedor_ciudad: proveedor ? proveedor.ciudad : null,
      proveedor_provincia: proveedor ? proveedor.provincia : null,
      codigo_postal: proveedor ? proveedor.cp : null,
      proveedor_fecha_registro: proveedor ? proveedor.fecha_registro : null,
      numero_factura: row.numero_factura,
      tipo_compra_gasto: row.tipo_compra_gasto,
      base_4: row.base_4,
      iva_4: row.iva_4,
      base_10: row.base_10,
      iva_10: row.iva_10,
      base_21: row.base_21,
      iva_21: row.iva_21,
      ret_percent: row.ret_percent,
      retencion: row.retencion,
      total_factura: row.total_factura,
      fecha_registro: row.fecha_registro,
    };
  }

  const db = {
    state,
    execute(sql, params = []) {
      const query = normalizeQuery(sql);

      if (query.startsWith('CREATE TABLE IF NOT EXISTS')) {
        return Promise.resolve([[]]);
      }

      if (query === 'SELECT * FROM proveedores WHERE id = ? LIMIT 1') {
        const id = Number(params[0]);
        return Promise.resolve([state.proveedores.filter((item) => item.id === id)]);
      }

      if (query === 'SELECT id, nif, nombre, telefono, email, direccion, ciudad, provincia, cp, fecha_registro FROM proveedores WHERE id = ? LIMIT 1') {
        const id = Number(params[0]);
        return Promise.resolve([state.proveedores.filter((item) => item.id === id)]);
      }

      if (query === 'SELECT id FROM proveedores WHERE nif = ? LIMIT 1') {
        const nif = String(params[0] || '').trim().toUpperCase();
        const proveedor = state.proveedores.find((item) => item.nif === nif);
        return Promise.resolve([proveedor ? [{ id: proveedor.id }] : []]);
      }

      if (query.startsWith('SELECT id, nif, nombre, telefono, email, direccion, ciudad, provincia, cp, fecha_registro FROM proveedores')) {
        let rows = [...state.proveedores];
        const sortByNombre = query.includes('ORDER BY nombre ASC');
        const sortByFecha = query.includes('ORDER BY fecha_registro DESC');

        if (sortByNombre) {
          rows.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
        } else if (sortByFecha) {
          rows.sort((a, b) => String(b.fecha_registro).localeCompare(String(a.fecha_registro)));
        }

        if (params.length >= 8) {
          const term = String(params[0] || '').replace(/%/g, '').toLowerCase();
          rows = rows.filter((item) => {
            return [item.nombre, item.nif, item.telefono, item.email, item.direccion, item.ciudad, item.provincia, item.cp]
              .some((value) => String(value || '').toLowerCase().includes(term));
          });
        }

        return Promise.resolve([rows]);
      }

      if (query === 'INSERT INTO proveedores (nif, nombre) VALUES (?, ?)') {
        const nif = String(params[0] || '').trim().toUpperCase();
        const nombre = params[1];
        if (state.proveedores.some((item) => item.nif === nif)) {
          const error = new Error('Duplicate entry');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const row = {
          id: state.nextId++,
          nif,
          nombre,
          telefono: null,
          email: null,
          direccion: null,
          ciudad: null,
          provincia: null,
          cp: null,
          fecha_registro: '2026-10-07 08:00:00',
        };
        state.proveedores.push(row);
        return Promise.resolve([{ insertId: row.id }]);
      }

      if (query.startsWith('UPDATE proveedores SET nif = ?, nombre = ?, telefono = ?, email = ?, direccion = ?, ciudad = ?, provincia = ?, cp = ? WHERE id = ?')) {
        const [nif, nombre, telefono, email, direccion, ciudad, provincia, cp, id] = params;
        const targetId = Number(id);
        const duplicate = state.proveedores.find((item) => item.nif === nif && item.id !== targetId);
        if (duplicate) {
          const error = new Error('Duplicate entry');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const index = state.proveedores.findIndex((item) => item.id === targetId);
        if (index >= 0) {
          state.proveedores[index] = {
            ...state.proveedores[index],
            nif,
            nombre,
            telefono,
            email,
            direccion,
            ciudad,
            provincia,
            cp,
          };
        }
        return Promise.resolve([{ affectedRows: index >= 0 ? 1 : 0 }]);
      }

      if (query.startsWith('UPDATE libro_compras_gastos SET proveedor = ?, nif_cif = ? WHERE nif_cif = ?')) {
        const [proveedorNombre, nifNuevo, nifAnterior] = params;
        state.libroComprasGastos = state.libroComprasGastos.map((item) => (
          item.nif_cif === nifAnterior
            ? { ...item, proveedor: proveedorNombre, nif_cif: nifNuevo }
            : item
        ));
        return Promise.resolve([{ affectedRows: 1 }]);
      }

      if (query.startsWith('INSERT INTO libro_compras_gastos')) {
        const [
          fecha_factura,
          proveedor,
          nif_cif,
          numero_factura,
          tipo_compra_gasto,
          base_4,
          iva_4,
          base_10,
          iva_10,
          base_21,
          iva_21,
          ret_percent,
          retencion,
          total_factura,
        ] = params;

        const row = {
          id: state.nextId++,
          fecha_factura,
          proveedor,
          nif_cif,
          numero_factura,
          tipo_compra_gasto,
          base_4,
          iva_4,
          base_10,
          iva_10,
          base_21,
          iva_21,
          ret_percent,
          retencion,
          total_factura,
          fecha_registro: '2026-10-07 08:00:00',
        };

        state.libroComprasGastos.push(row);
        return Promise.resolve([{ insertId: row.id }]);
      }

      if (query.startsWith('SELECT id, fecha_factura, proveedor AS proveedor_nombre, nif_cif, numero_factura, tipo_compra_gasto,')) {
        const id = Number(params[0]);
        const row = state.libroComprasGastos.find((item) => item.id === id);
        if (!row) {
          return Promise.resolve([[]]);
        }
        return Promise.resolve([[
          {
            id: row.id,
            fecha_factura: row.fecha_factura,
            proveedor_nombre: row.proveedor,
            nif_cif: row.nif_cif,
            numero_factura: row.numero_factura,
            tipo_compra_gasto: row.tipo_compra_gasto,
            base_4: row.base_4,
            iva_4: row.iva_4,
            base_10: row.base_10,
            iva_10: row.iva_10,
            base_21: row.base_21,
            iva_21: row.iva_21,
            ret_percent: row.ret_percent,
            retencion: row.retencion,
            total_factura: row.total_factura,
            fecha_registro: row.fecha_registro,
          }
        ]]);
      }

      if (query.startsWith('SELECT l.id, l.fecha_factura, l.proveedor AS proveedor_nombre, l.nif_cif, p.id AS proveedor_id,')) {
        const rows = state.libroComprasGastos
          .slice()
          .sort((a, b) => String(a.fecha_factura).localeCompare(String(b.fecha_factura)) || a.id - b.id)
          .map(hydrateLibroRow);
        return Promise.resolve([rows]);
      }

      if (query === 'DELETE FROM libro_compras_gastos WHERE id = ?') {
        const id = Number(params[0]);
        const before = state.libroComprasGastos.length;
        state.libroComprasGastos = state.libroComprasGastos.filter((item) => item.id !== id);
        return Promise.resolve([{ affectedRows: before - state.libroComprasGastos.length }]);
      }

      return Promise.resolve([[]]);
    },
    getConnection() {
      return {
        beginTransaction: async () => {},
        execute: async (sql, params = []) => db.execute(sql, params),
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      };
    },
  };

  return db;
}

function loadAppWithDb(db) {
  delete require.cache[require.resolve('../server')];
  global.pool = db;
  const { app } = require('../server');
  return app;
}

test('GET /health responde OK y la raiz redirige al acceso privado', async () => {
  const app = loadAppWithDb(makeDbState());

  const health = await request(app).get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const root = await request(app).get('/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/admin');
});

test('el acceso privado muestra login y despues redirige al libro', async () => {
  const app = loadAppWithDb(makeDbState());
  const agent = request.agent(app);

  const loginPage = await agent.get('/admin');
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.text, /Libro de gastos y compras/);

  const login = await agent.post('/admin/login').send({ username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);

  const admin = await agent.get('/admin');
  assert.equal(admin.status, 302);
  assert.equal(admin.headers.location, '/admin/libro-gastos-compras');

  const libroPage = await agent.get('/admin/libro-gastos-compras');
  assert.equal(libroPage.status, 200);
  assert.match(libroPage.text, /Crear registro/);
});

test('crear, listar y borrar registros del libro mantiene proveedor minimo', async () => {
  const db = makeDbState();
  const app = loadAppWithDb(db);
  const agent = request.agent(app);

  await agent.post('/admin/login').send({ username: 'admin', password: 'admin123' });

  const createRes = await agent.post('/admin/api/libro-gastos-compras').send({
    fecha_factura: '2026-10-07',
    proveedor_nombre: 'Proveedor Fiscal',
    nif_cif: 'B12345678',
    numero_factura: 'FAC-001',
    tipo_compra_gasto: 'Suministros',
    base_4: 0,
    base_10: 100,
    base_21: 50,
    base_0: 25,
    ret_percent: 10,
  });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.ok, true);
  assert.equal(createRes.body.data.total_factura, 178);
  assert.equal(db.state.proveedores.length, 1);
  assert.equal(db.state.proveedores[0].nombre, 'Proveedor Fiscal');

  const listRes = await agent.get('/admin/api/libro-gastos-compras');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 1);
  assert.equal(listRes.body.data[0].proveedor_id, db.state.proveedores[0].id);

  const deleteRes = await agent.delete(`/admin/api/libro-gastos-compras/${createRes.body.data.id}`);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.ok, true);
  assert.equal(db.state.libroComprasGastos.length, 0);
});

test('editar proveedor sincroniza el libro y el selector sigue funcionando', async () => {
  const db = makeDbState();
  const proveedorId = db.state.nextId++;

  db.state.proveedores.push({
    id: proveedorId,
    nif: 'B12345678',
    nombre: 'Proveedor Antiguo',
    telefono: '612345678',
    email: 'proveedor@ejemplo.com',
    direccion: 'Calle Uno',
    ciudad: 'Madrid',
    provincia: 'Madrid',
    cp: '28001',
    fecha_registro: '2026-10-07 08:00:00',
  });

  db.state.libroComprasGastos.push({
    id: db.state.nextId++,
    fecha_factura: '2026-10-01',
    proveedor: 'Proveedor Antiguo',
    nif_cif: 'B12345678',
    numero_factura: 'FAC-100',
    tipo_compra_gasto: 'Compras y servicios',
    base_4: 0,
    iva_4: 0,
    base_10: 0,
    iva_10: 0,
    base_21: 100,
    iva_21: 21,
    ret_percent: 0,
    retencion: 0,
    total_factura: 121,
    fecha_registro: '2026-10-07 08:00:00',
  });

  const app = loadAppWithDb(db);
  const agent = request.agent(app);

  await agent.post('/admin/login').send({ username: 'admin', password: 'admin123' });

  const updateRes = await agent.put(`/admin/api/proveedores/${proveedorId}`).send({
    nombre: 'Proveedor Renovado',
    nif: 'B87654321',
    telefono: '698765432',
    email: 'nuevo@ejemplo.com',
    direccion: 'Calle Dos',
    ciudad: 'Oviedo',
    provincia: 'Asturias',
    cp: '33001',
  });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.ok, true);
  assert.equal(db.state.libroComprasGastos[0].proveedor, 'Proveedor Renovado');
  assert.equal(db.state.libroComprasGastos[0].nif_cif, 'B87654321');

  const proveedores = await agent.get('/admin/api/proveedores?page=1&pageSize=50&sort=nombre&dir=asc');
  assert.equal(proveedores.status, 200);
  assert.equal(proveedores.body.data.length, 1);
  assert.equal(proveedores.body.data[0].nombre, 'Proveedor Renovado');
});

test('la pagina publica ya no existe', async () => {
  const app = loadAppWithDb(makeDbState());
  const res = await request(app).get('/public/index.html');
  assert.equal(res.status, 404);
});
