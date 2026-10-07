(function () {
  const e = React.createElement;

  const PDF_THEME = {
    fillColor: [139, 92, 246],
    textColor: [255, 255, 255]
  };

  const TIPOS_COMPRA_GASTO = [
    'Compras y servicios',
    'Alquileres',
    'Reparaciones',
    'Suministros',
    'Tributos',
    'Sueldos/salarios',
    'S.S/autónomos',
    'Inversiones',
    'Otros'
  ];

  function getYear(value) {
    const text = String(value || '').trim();
    const match = /^(\d{4})-\d{2}-\d{2}/.exec(text);
    if (match) return Number(match[1]);
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.getFullYear();
  }

  function getQuarter(value) {
    const text = String(value || '').trim();
    const match = /^\d{4}-(\d{2})-\d{2}/.exec(text);
    const month = match ? Number(match[1]) : (new Date(text)).getMonth() + 1;
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;
    return Math.ceil(month / 3);
  }

  function getMonth(value) {
    const text = String(value || '').trim();
    const match = /^\d{4}-(\d{2})-\d{2}/.exec(text);
    if (match) return Number(match[1]);
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.getMonth() + 1;
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function toDateValue(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text + 'T00:00:00').getTime();
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function formatDate(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parts = text.split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('es-ES');
  }

  function formatMoney(value) {
    return toNumber(value).toFixed(2).replace('.', ',') + ' €';
  }

  function formatMoneyPlain(value) {
    return toNumber(value).toFixed(2).replace('.', ',');
  }

  function formatPercent(value) {
    return toNumber(value).toFixed(2).replace('.', ',') + '%';
  }

  function isValidSpanishNif(value) {
    const nif = String(value || '').trim().toUpperCase();
    if (/^\d{8}[A-Z]$/.test(nif)) {
      return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(nif.slice(0, 8)) % 23] === nif[8];
    }
    if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
      const prefix = { X: '0', Y: '1', Z: '2' }[nif[0]];
      return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(prefix + nif.slice(1, 8)) % 23] === nif[8];
    }
    return /^[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9]$/.test(nif);
  }

  function isValidEmail(value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
  }

  function getYears(rows) {
    const years = Array.from(new Set(rows.map(function (row) {
      return getYear(row.fecha_factura);
    }).filter(function (year) {
      return year !== null;
    })));
    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) years.push(currentYear);
    years.sort(function (a, b) { return b - a; });
    return years;
  }

  function buildProcessedRows(rows, filters, gastoView) {
    const query = normalizeText(filters.q);
    const year = Number(filters.anio);
    const quarter = filters.trimestre === 'todos' ? null : Number(filters.trimestre);
    const month = filters.mes === 'todos' ? null : Number(filters.mes);
    const fromValue = filters.desde ? toDateValue(filters.desde) : null;
    const toValue = filters.hasta ? toDateValue(filters.hasta) : null;

    const categoryRows = rows
      .filter(function (row) {
        const isInvestment = normalizeText(row.tipo_compra_gasto) === 'inversiones';
        return gastoView === 'inversiones' ? isInvestment : !isInvestment;
      })
      .slice()
      .sort(function (a, b) {
        return toDateValue(a.fecha_factura) - toDateValue(b.fecha_factura);
      });

    const countByYear = new Map();
    const numberedRows = categoryRows.map(function (row) {
      const rowYear = getYear(row.fecha_factura);
      const nextNumber = (countByYear.get(rowYear) || 0) + 1;
      countByYear.set(rowYear, nextNumber);
      return Object.assign({}, row, { numero_registro: nextNumber });
    });

    return numberedRows.filter(function (row) {
      const searchFields = [
        row.numero_registro,
        row.proveedor_nombre,
        row.nif_cif,
        row.numero_factura,
        row.tipo_compra_gasto
      ].map(normalizeText);
      const rowDate = toDateValue(row.fecha_factura);
      const matchesYear = !year || getYear(row.fecha_factura) === year;
      const matchesQuarter = !quarter || getQuarter(row.fecha_factura) === quarter;
      const matchesMonth = !month || getMonth(row.fecha_factura) === month;
      const matchesQuery = !query || searchFields.some(function (field) { return field.includes(query); });
      const matchesFrom = fromValue === null || rowDate >= fromValue;
      const matchesTo = toValue === null || rowDate <= toValue;
      return matchesYear && matchesQuarter && matchesMonth && matchesQuery && matchesFrom && matchesTo;
    });
  }

  function buildTotals(rows) {
    const summary = rows.reduce(function (acc, row) {
      acc.base4 += toNumber(row.base_4);
      acc.base10 += toNumber(row.base_10);
      acc.base21 += toNumber(row.base_21);
      acc.iva4 += toNumber(row.iva_4);
      acc.iva10 += toNumber(row.iva_10);
      acc.iva21 += toNumber(row.iva_21);
      acc.retencion += toNumber(row.retencion);
      acc.total += toNumber(row.total_factura);
      return acc;
    }, {
      base4: 0,
      base10: 0,
      base21: 0,
      iva4: 0,
      iva10: 0,
      iva21: 0,
      retencion: 0,
      total: 0
    });

    return {
      base4: summary.base4,
      base10: summary.base10,
      base21: summary.base21,
      iva4: summary.iva4,
      iva10: summary.iva10,
      iva21: summary.iva21,
      retencion: summary.retencion,
      totalIva: summary.iva4 + summary.iva10 + summary.iva21,
      totalSinIva: summary.base4 + summary.base10 + summary.base21,
      totalConIva: summary.base4 + summary.base10 + summary.base21 + summary.iva4 + summary.iva10 + summary.iva21,
      total: summary.total
    };
  }

  function buildTotalsByType(rows) {
    const map = new Map();
    rows.forEach(function (row) {
      const tipo = row.tipo_compra_gasto || 'Otros';
      const sinIva = toNumber(row.base_4) + toNumber(row.base_10) + toNumber(row.base_21);
      const conIva = sinIva + toNumber(row.iva_4) + toNumber(row.iva_10) + toNumber(row.iva_21);
      const current = map.get(tipo) || { sinIva: 0, conIva: 0 };
      current.sinIva += sinIva;
      current.conIva += conIva;
      map.set(tipo, current);
    });

    return Array.from(new Set(TIPOS_COMPRA_GASTO.concat(Array.from(map.keys()))))
      .filter(function (tipo) {
        const values = map.get(tipo);
        return values && (values.sinIva !== 0 || values.conIva !== 0);
      })
      .map(function (tipo) {
        const values = map.get(tipo);
        return { tipo: tipo, sinIva: values.sinIva, conIva: values.conIva };
      });
  }

  function buildMod347Rows(rows, year) {
    const providers = new Map();
    rows
      .filter(function (row) { return getYear(row.fecha_factura) === year; })
      .filter(function (row) { return toNumber(row.retencion) === 0 && toNumber(row.ret_percent) === 0; })
      .forEach(function (row) {
        const nif = String(row.nif_cif || '').trim();
        const key = nif || String(row.proveedor_nombre || '').trim().toLowerCase();
        if (!key) return;
        const quarter = getQuarter(row.fecha_factura);
        const amount = toNumber(row.total_factura);
        const current = providers.get(key) || {
          nombre: row.proveedor_nombre || '',
          nif: nif,
          codigoPostal: row.codigo_postal || '',
          trimestres: [0, 0, 0, 0],
          anual: 0
        };
        if (quarter >= 1 && quarter <= 4) current.trimestres[quarter - 1] += amount;
        current.anual += amount;
        providers.set(key, current);
      });

    return Array.from(providers.values())
      .filter(function (provider) { return provider.anual > 3000; })
      .sort(function (a, b) { return b.anual - a.anual; });
  }

  function buildPdfHeader(doc, title, subtitle, rangeText) {
    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(10);
    if (subtitle) doc.text(subtitle, 40, 58);
    if (rangeText) doc.text(rangeText, 40, 72);
  }

  function ReactLibroApp() {
    const totalsRef = React.useRef(null);

    const [allRows, setAllRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [filters, setFilters] = React.useState({
      q: '',
      anio: String(new Date().getFullYear()),
      trimestre: 'todos',
      mes: 'todos',
      desde: '',
      hasta: '',
      pageSize: '50'
    });
    const [gastoView, setGastoView] = React.useState('comunes');
    const [visibleCount, setVisibleCount] = React.useState(0);
    const [isMobile, setIsMobile] = React.useState(window.matchMedia('(max-width: 680px)').matches);
    const [actionsOpen, setActionsOpen] = React.useState(false);
    const [filtrosOpen, setFiltrosOpen] = React.useState(false);
    const [alertState, setAlertState] = React.useState({ open: false, title: 'Aviso', message: '', type: 'info' });
    const [mod303Open, setMod303Open] = React.useState(false);
    const [mod303Year, setMod303Year] = React.useState(String(new Date().getFullYear()));
    const [mod347Open, setMod347Open] = React.useState(false);
    const [mod347Year, setMod347Year] = React.useState(String(new Date().getFullYear()));
    const [providerDetailRow, setProviderDetailRow] = React.useState(null);
    const [providerEdit, setProviderEdit] = React.useState({
      open: false,
      providerId: null,
      form: {
        nombre: '',
        nif: '',
        telefono: '',
        email: '',
        cp: '',
        direccion: '',
        ciudad: '',
        provincia: ''
      },
      status: '',
      saving: false
    });

    const years = React.useMemo(function () {
      return getYears(allRows);
    }, [allRows]);

    React.useEffect(function () {
      function onResize() {
        const mobile = window.matchMedia('(max-width: 680px)').matches;
        setIsMobile(mobile);
        if (!mobile) {
          setActionsOpen(false);
          setFiltrosOpen(false);
        }
      }

      window.addEventListener('resize', onResize);
      return function () {
        window.removeEventListener('resize', onResize);
      };
    }, []);

    React.useEffect(function () {
      if (!years.length) return;
      setFilters(function (current) {
        if (years.includes(Number(current.anio))) {
          return current;
        }
        return Object.assign({}, current, { anio: String(years[0]) });
      });
    }, [years]);

    React.useEffect(function () {
      function onKeyDown(event) {
        if (event.key !== 'Escape') return;
        if (alertState.open) {
          setAlertState(function (current) { return Object.assign({}, current, { open: false }); });
          return;
        }
        if (providerEdit.open) {
          closeProviderEdit();
          return;
        }
        if (providerDetailRow) {
          setProviderDetailRow(null);
          return;
        }
        if (mod347Open) {
          setMod347Open(false);
          return;
        }
        if (mod303Open) {
          setMod303Open(false);
          return;
        }
        if (filtrosOpen) {
          setFiltrosOpen(false);
        }
      }

      document.addEventListener('keydown', onKeyDown);
      return function () {
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [alertState.open, providerEdit.open, providerDetailRow, mod347Open, mod303Open, filtrosOpen]);

    const filteredRows = React.useMemo(function () {
      return buildProcessedRows(allRows, filters, gastoView);
    }, [allRows, filters, gastoView]);

    const pageSizeValue = React.useMemo(function () {
      return filters.pageSize === 'all' ? filteredRows.length : (Number(filters.pageSize) || 50);
    }, [filters.pageSize, filteredRows.length]);

    const effectiveVisibleCount = React.useMemo(function () {
      if (filters.pageSize === 'all') {
        return filteredRows.length;
      }
      return Math.min(Math.max(visibleCount || pageSizeValue, pageSizeValue), filteredRows.length);
    }, [filters.pageSize, filteredRows.length, pageSizeValue, visibleCount]);

    const currentRows = React.useMemo(function () {
      return filteredRows.slice(0, effectiveVisibleCount);
    }, [filteredRows, effectiveVisibleCount]);

    const hasMoreRows = currentRows.length < filteredRows.length && filters.pageSize !== 'all';
    const totals = React.useMemo(function () { return buildTotals(filteredRows); }, [filteredRows]);
    const totalsByType = React.useMemo(function () { return buildTotalsByType(filteredRows); }, [filteredRows]);
    const mod303Totals = React.useMemo(function () {
      const year = Number(mod303Year);
      return allRows
        .filter(function (row) { return getYear(row.fecha_factura) === year; })
        .reduce(function (acc, row) {
          const ivaFila = toNumber(row.iva_4) + toNumber(row.iva_10) + toNumber(row.iva_21);
          if (row.tipo_compra_gasto === 'Inversiones') acc.inversion += ivaFila;
          else acc.corriente += ivaFila;
          return acc;
        }, { corriente: 0, inversion: 0 });
    }, [allRows, mod303Year]);
    const mod347Rows = React.useMemo(function () {
      return buildMod347Rows(allRows, Number(mod347Year));
    }, [allRows, mod347Year]);

    async function fetchRows() {
      try {
        const response = await fetch('/admin/api/libro-gastos-compras', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.ok) return [];
        return Array.isArray(data.data) ? data.data.slice().sort(function (a, b) {
          return toDateValue(a.fecha_factura) - toDateValue(b.fecha_factura);
        }) : [];
      } catch (_error) {
        return [];
      }
    }

    async function refreshRows() {
      setLoading(true);
      const rows = await fetchRows();
      setAllRows(rows);
      setLoading(false);
    }

    React.useEffect(function () {
      refreshRows();
    }, []);

    React.useEffect(function () {
      setVisibleCount(0);
    }, [filters.pageSize, filters.anio, filters.trimestre, filters.mes, filters.q, filters.desde, filters.hasta, gastoView]);

    function updateFilter(name, value) {
      setFilters(function (current) {
        return Object.assign({}, current, { [name]: value });
      });
    }

    function showAlert(config) {
      setAlertState({
        open: true,
        title: config.title || 'Aviso',
        message: config.message || '',
        type: config.type || ((config.title || '').toLowerCase() === 'error' ? 'error' : 'info')
      });
    }

    function closeProviderEdit() {
      setProviderEdit({
        open: false,
        providerId: null,
        form: {
          nombre: '',
          nif: '',
          telefono: '',
          email: '',
          cp: '',
          direccion: '',
          ciudad: '',
          provincia: ''
        },
        status: '',
        saving: false
      });
    }

    function openProviderDetail(row) {
      setProviderDetailRow(row);
    }

    function openProviderEditFromRow(row) {
      if (!row || !row.proveedor_id) {
        showAlert({ title: 'Aviso', message: 'No se encontró el proveedor asociado.' });
        return;
      }
      setProviderDetailRow(null);
      setProviderEdit({
        open: true,
        providerId: row.proveedor_id,
        form: {
          nombre: row.proveedor_nombre || '',
          nif: row.nif_cif || '',
          telefono: row.proveedor_telefono || '',
          email: row.proveedor_email || '',
          cp: row.codigo_postal || '',
          direccion: row.proveedor_direccion || '',
          ciudad: row.proveedor_ciudad || '',
          provincia: row.proveedor_provincia || ''
        },
        status: '',
        saving: false
      });
    }

    function handleProviderEditChange(name, value) {
      setProviderEdit(function (current) {
        return Object.assign({}, current, {
          form: Object.assign({}, current.form, { [name]: name === 'nif' ? value.toUpperCase() : value })
        });
      });
    }

    async function saveProviderEdit(event) {
      event.preventDefault();
      const form = providerEdit.form;
      const nombre = String(form.nombre || '').trim();
      const nif = String(form.nif || '').trim().toUpperCase();
      const telefono = String(form.telefono || '').trim();
      const email = String(form.email || '').trim();
      if (!nombre) {
        setProviderEdit(function (current) { return Object.assign({}, current, { status: 'El nombre es obligatorio.' }); });
        return;
      }
      if (!nif || !isValidSpanishNif(nif)) {
        setProviderEdit(function (current) { return Object.assign({}, current, { status: 'El NIF es obligatorio y debe ser válido.' }); });
        return;
      }
      if (telefono && !/^\d{9}$/.test(telefono)) {
        setProviderEdit(function (current) { return Object.assign({}, current, { status: 'El teléfono debe tener exactamente 9 dígitos.' }); });
        return;
      }
      if (!isValidEmail(email)) {
        setProviderEdit(function (current) { return Object.assign({}, current, { status: 'Introduce un email válido.' }); });
        return;
      }

      setProviderEdit(function (current) { return Object.assign({}, current, { saving: true, status: '' }); });
      try {
        const response = await fetch('/admin/api/proveedores/' + encodeURIComponent(providerEdit.providerId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            nombre: nombre,
            nif: nif,
            telefono: telefono,
            email: email,
            cp: String(form.cp || '').trim(),
            direccion: String(form.direccion || '').trim(),
            ciudad: String(form.ciudad || '').trim(),
            provincia: String(form.provincia || '').trim()
          })
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.ok) {
          setProviderEdit(function (current) { return Object.assign({}, current, { saving: false, status: data.error || 'No se pudo guardar el proveedor.' }); });
          return;
        }
        closeProviderEdit();
        await refreshRows();
      } catch (_error) {
        setProviderEdit(function (current) { return Object.assign({}, current, { saving: false, status: 'No se pudo guardar el proveedor.' }); });
      }
    }

    async function deleteRow(id) {
      if (!window.confirm('¿Seguro que deseas eliminar este registro?')) return;
      try {
        const response = await fetch('/admin/api/libro-gastos-compras/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.ok) {
          showAlert({ title: 'Error', message: data.error || 'No se pudo eliminar el registro.', type: 'error' });
          return;
        }
        await refreshRows();
      } catch (_error) {
        showAlert({ title: 'Error', message: 'No se pudo eliminar el registro.', type: 'error' });
      }
    }

    function goToCreate() {
      window.location.href = '/admin/crear-registro-libro';
    }

    async function logout() {
      try {
        await fetch('/admin/logout', { method: 'POST' });
      } catch (_error) {}
      window.location.href = '/admin';
    }

    function loadMore() {
      const pageSize = Number(filters.pageSize) || 50;
      setVisibleCount(Math.min(effectiveVisibleCount + pageSize, filteredRows.length));
    }

    function scrollToTotals() {
      if (totalsRef.current) {
        totalsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function openMod303() {
      const preferredYear = Number(filters.anio) || new Date().getFullYear();
      setMod303Year(String(years.includes(preferredYear) ? preferredYear : years[0]));
      setMod303Open(true);
    }

    function openMod347() {
      const preferredYear = Number(filters.anio) || new Date().getFullYear();
      setMod347Year(String(years.includes(preferredYear) ? preferredYear : years[0]));
      setMod347Open(true);
    }

    function downloadCsv() {
      if (!currentRows.length) {
        showAlert({ title: 'Aviso', message: 'No hay registros para exportar.' });
        return;
      }
      const headers = [
        'Id', 'Nº registro', 'Fecha factura', 'Proveedor', 'N.I.F. / C.I.F.', 'Nº factura',
        'Tipo compra/gasto', 'Base 4%', 'IVA 4%', 'Base 10%', 'IVA 10%', 'Base 21%', 'IVA 21%', 'RET %', 'RETENCION', 'TOTAL FACTURA'
      ];
      const lines = currentRows.map(function (row) {
        return [
          row.id || '',
          row.numero_registro || '',
          formatDate(row.fecha_factura),
          row.proveedor_nombre || '',
          row.nif_cif || '',
          row.numero_factura || '',
          row.tipo_compra_gasto || '',
          toNumber(row.base_4).toFixed(2),
          toNumber(row.iva_4).toFixed(2),
          toNumber(row.base_10).toFixed(2),
          toNumber(row.iva_10).toFixed(2),
          toNumber(row.base_21).toFixed(2),
          toNumber(row.iva_21).toFixed(2),
          toNumber(row.ret_percent).toFixed(2),
          toNumber(row.retencion).toFixed(2),
          toNumber(row.total_factura).toFixed(2)
        ].map(function (value) {
          return '"' + String(value).replace(/"/g, '""') + '"';
        }).join(',');
      });
      const csv = [headers.join(','), lines.join('\n')].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'libro_gastos_compras_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function getRangeText() {
      const year = Number(filters.anio) || new Date().getFullYear();
      const quarter = filters.trimestre === 'todos' ? null : Number(filters.trimestre);
      const month = filters.mes === 'todos' ? null : Number(filters.mes);
      const fromInput = filters.desde;
      const toInput = filters.hasta;
      let fromValue = null;
      let toValue = null;
      if (fromInput || toInput) {
        fromValue = fromInput ? toDateValue(fromInput) : null;
        toValue = toInput ? toDateValue(toInput) : null;
      } else if (quarter) {
        const monthStart = (quarter - 1) * 3;
        fromValue = new Date(year, monthStart, 1).getTime();
        toValue = new Date(year, monthStart + 3, 0).getTime();
      } else if (month) {
        fromValue = new Date(year, month - 1, 1).getTime();
        toValue = new Date(year, month, 0).getTime();
      } else {
        fromValue = new Date(year, 0, 1).getTime();
        toValue = new Date(year, 11, 31).getTime();
      }

      if (fromValue !== null && toValue !== null) {
        return 'Desde el ' + new Date(fromValue).toLocaleDateString('es-ES') + ' al ' + new Date(toValue).toLocaleDateString('es-ES');
      }
      if (fromValue !== null) return 'Desde el ' + new Date(fromValue).toLocaleDateString('es-ES');
      if (toValue !== null) return 'Hasta el ' + new Date(toValue).toLocaleDateString('es-ES');
      return '';
    }

    function downloadPdf() {
      if (!window.jspdf || !window.jspdf.jsPDF || typeof window.jspdf.jsPDF !== 'function') {
        showAlert({ title: 'Error', message: 'No se pudo cargar la librería PDF. Inténtalo de nuevo.', type: 'error' });
        return;
      }
      if (!filteredRows.length) {
        showAlert({ title: 'Aviso', message: 'No hay registros para imprimir en PDF.' });
        return;
      }

      const jsPDF = window.jspdf.jsPDF;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const title = gastoView === 'inversiones' ? 'Libro de bienes de inversión' : 'Libro de gastos y compras';
      buildPdfHeader(doc, title, 'Roizmundo C.B. · N.I.F. E44632735 · 33002 Oviedo', getRangeText());

      doc.autoTable({
        startY: 86,
        head: [[
          'Nº', 'Fecha factura', 'Proveedor', 'N.I.F. / C.I.F.', 'Nº factura',
          'Tipo compra/gasto', 'Base 4%', 'IVA 4%', 'Base 10%', 'IVA 10%', 'Base 21%', 'IVA 21%', 'RET %', 'RETENCION', 'TOTAL FACTURA'
        ]],
        body: filteredRows.map(function (row) {
          return [
            row.numero_registro || '',
            formatDate(row.fecha_factura),
            row.proveedor_nombre || '',
            row.nif_cif || '',
            row.numero_factura || '',
            row.tipo_compra_gasto || '',
            formatMoneyPlain(row.base_4),
            formatMoneyPlain(row.iva_4),
            formatMoneyPlain(row.base_10),
            formatMoneyPlain(row.iva_10),
            formatMoneyPlain(row.base_21),
            formatMoneyPlain(row.iva_21),
            formatPercent(row.ret_percent),
            formatMoneyPlain(row.retencion),
            formatMoneyPlain(row.total_factura)
          ];
        }),
        foot: [[
          { content: 'TOTALES', colSpan: 6, styles: { halign: 'center', fontStyle: 'bold' } },
          formatMoneyPlain(totals.base4),
          formatMoneyPlain(totals.iva4),
          formatMoneyPlain(totals.base10),
          formatMoneyPlain(totals.iva10),
          formatMoneyPlain(totals.base21),
          formatMoneyPlain(totals.iva21),
          '',
          formatMoneyPlain(totals.retencion),
          formatMoneyPlain(totals.total)
        ]],
        columnStyles: {
          0: { cellWidth: 24, halign: 'center' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right' },
          11: { halign: 'right' },
          12: { halign: 'right' },
          13: { halign: 'right' },
          14: { halign: 'right' }
        },
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: PDF_THEME.fillColor, textColor: PDF_THEME.textColor, halign: 'center' },
        footStyles: { fillColor: PDF_THEME.fillColor, textColor: PDF_THEME.textColor, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        theme: 'striped'
      });

      const sectionsY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 100;
      doc.setFontSize(11);
      doc.text('Resumen general', 40, sectionsY + 24);
      doc.text('Totales por tipo de compra/gasto', 320, sectionsY + 24);

      doc.autoTable({
        startY: sectionsY + 32,
        margin: { left: 40 },
        tableWidth: 250,
        head: [['Concepto', 'Importe']],
        body: [
          ['Total base 4%', formatMoney(totals.base4)],
          ['Total IVA 4%', formatMoney(totals.iva4)],
          ['Total base 10%', formatMoney(totals.base10)],
          ['Total IVA 10%', formatMoney(totals.iva10)],
          ['Total base 21%', formatMoney(totals.base21)],
          ['Total IVA 21%', formatMoney(totals.iva21)],
          ['Total base imponible', formatMoney(totals.totalSinIva)],
          ['Total IVA', formatMoney(totals.totalIva)],
          ['Total retención', formatMoney(totals.retencion)],
          ['Total factura (con IVA)', formatMoney(totals.total)]
        ],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: PDF_THEME.fillColor, textColor: PDF_THEME.textColor, halign: 'center' },
        columnStyles: { 1: { halign: 'right' } },
        theme: 'grid'
      });

      doc.autoTable({
        startY: sectionsY + 32,
        margin: { left: 320 },
        tableWidth: 320,
        head: [['Tipo compra/gasto', 'Sin IVA', 'Con IVA']],
        body: totalsByType.map(function (row) {
          return [row.tipo, formatMoney(row.sinIva), formatMoney(row.conIva)];
        }),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: PDF_THEME.fillColor, textColor: PDF_THEME.textColor, halign: 'center' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        theme: 'grid'
      });

      doc.save((gastoView === 'inversiones' ? 'libro_bienes_inversion' : 'libro_gastos_compras') + '_' + (Number(filters.anio) || new Date().getFullYear()) + '.pdf');
    }

    function downloadMod347Pdf() {
      if (!window.jspdf || !window.jspdf.jsPDF || typeof window.jspdf.jsPDF !== 'function') {
        showAlert({ title: 'Error', message: 'No se pudo cargar la librería PDF. Inténtalo de nuevo.', type: 'error' });
        return;
      }
      if (!mod347Rows.length) {
        showAlert({ title: 'Aviso', message: 'No hay proveedores que cumplan los criterios para este año.' });
        return;
      }

      const jsPDF = window.jspdf.jsPDF;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.text('Modelo 347 - Proveedores con compras superiores a 3000 (' + mod347Year + ')', 40, 40);
      doc.autoTable({
        startY: 60,
        head: [['Proveedor', 'N.I.F.', 'C.P.', '1T', '2T', '3T', '4T', 'Anual']],
        body: mod347Rows.map(function (row) {
          return [
            row.nombre,
            row.nif,
            row.codigoPostal,
            formatMoney(row.trimestres[0]),
            formatMoney(row.trimestres[1]),
            formatMoney(row.trimestres[2]),
            formatMoney(row.trimestres[3]),
            formatMoney(row.anual)
          ];
        }),
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: PDF_THEME.fillColor, textColor: PDF_THEME.textColor, halign: 'center' },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        theme: 'striped'
      });
      doc.save('modelo_347_' + mod347Year + '.pdf');
    }

    function moneyStat(label, value, key, title) {
      return e(
        'div',
        { className: 'resultado-linea', title: title || undefined, key: key },
        [
          e('span', { key: 'label' }, label),
          e('output', { className: 'resultado-valor', key: 'value' }, value)
        ]
      );
    }

    function modalBackdrop(isOpen, onClose, className, children, key) {
      return e(
        'div',
        {
          className: 'confirm-modal-backdrop' + (className ? ' ' + className : '') + (isOpen ? '' : ' hidden'),
          'aria-hidden': isOpen ? 'false' : 'true',
          onClick: function (event) {
            if (event.target === event.currentTarget) onClose();
          },
          key: key
        },
        children
      );
    }

    return e(
      React.Fragment,
      null,
      [
        e(
          'div',
          { className: 'admin-bar', key: 'bar' },
          [
            e(
              'div',
              { key: 'head' },
              [
                e('h1', { key: 'title' }, 'Libro de gastos y compras')
              ]
            ),
            e('button', {
              type: 'button',
              className: 'menu-toggle-btn',
              'aria-label': 'Abrir menú',
              'aria-expanded': actionsOpen ? 'true' : 'false',
              'aria-controls': 'actionsMenu',
              onClick: function () { setActionsOpen(function (current) { return !current; }); },
              key: 'toggle'
            }, '☰'),
            e(
              'div',
              { className: 'actions' + (actionsOpen ? ' is-open' : ''), id: 'actionsMenu', key: 'actions' },
              [
                e('button', { type: 'button', onClick: logout, key: 'logout' }, 'Cerrar sesión'),
                e('button', { type: 'button', onClick: goToCreate, key: 'create' }, 'Crear registro'),
                e('button', { type: 'button', onClick: downloadCsv, key: 'csv' }, 'Exportar'),
                e('button', { type: 'button', onClick: downloadPdf, key: 'pdf' }, 'Imprimir PDF')
              ]
            )
          ]
        ),
        e(
          'div',
          { className: 'doc admin-doc', key: 'doc' },
          [
            e(
              'div',
              { className: 'filtros-backdrop' + (filtrosOpen ? ' is-open' : ''), key: 'filters-backdrop' },
              e(
                'div',
                { className: 'filtros-panel' },
                [
                  e(
                    'div',
                    { className: 'filtros-panel-head', key: 'filters-head' },
                    [
                      e('h2', { key: 'title' }, 'Filtros'),
                      e('button', { type: 'button', className: 'filtros-close-btn', 'aria-label': 'Cerrar', onClick: function () { setFiltrosOpen(false); }, key: 'close' }, '×')
                    ]
                  ),
                  e(
                    'section',
                    { className: 'admin-grid', key: 'filters' },
                    [
                      e('div', { className: 'field', key: 'q' }, [
                        e('label', { htmlFor: 'q', key: 'label' }, 'Buscar'),
                        e('input', { id: 'q', value: filters.q, onChange: function (event) { updateFilter('q', event.target.value); }, placeholder: 'proveedor, NIF/CIF, factura, tipo', key: 'input' })
                      ]),
                      e('div', { className: 'field', key: 'anio' }, [
                        e('label', { htmlFor: 'anio', key: 'label' }, 'Año'),
                        e('select', { id: 'anio', value: filters.anio, onChange: function (event) { updateFilter('anio', event.target.value); }, key: 'select' },
                          years.map(function (year) { return e('option', { value: String(year), key: year }, String(year)); })
                        )
                      ]),
                      e('div', { className: 'field', key: 'trimestre' }, [
                        e('label', { htmlFor: 'trimestre', key: 'label' }, 'Trimestre'),
                        e('select', { id: 'trimestre', value: filters.trimestre, onChange: function (event) { updateFilter('trimestre', event.target.value); }, key: 'select' }, [
                          e('option', { value: 'todos', key: 'todos' }, 'Todos'),
                          e('option', { value: '1', key: '1' }, '1T'),
                          e('option', { value: '2', key: '2' }, '2T'),
                          e('option', { value: '3', key: '3' }, '3T'),
                          e('option', { value: '4', key: '4' }, '4T')
                        ])
                      ]),
                      e('div', { className: 'field', key: 'mes' }, [
                        e('label', { htmlFor: 'mes', key: 'label' }, 'Mes'),
                        e('select', { id: 'mes', value: filters.mes, onChange: function (event) { updateFilter('mes', event.target.value); }, key: 'select' }, [
                          e('option', { value: 'todos', key: 'todos' }, 'Todos'),
                          ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map(function (month, index) {
                            return e('option', { value: String(index + 1), key: index + 1 }, month);
                          })
                        ].flat())
                      ]),
                      e('div', { className: 'field', key: 'desde' }, [
                        e('label', { htmlFor: 'desde', key: 'label' }, 'Desde'),
                        e('input', { id: 'desde', type: 'date', value: filters.desde, onChange: function (event) { updateFilter('desde', event.target.value); }, key: 'input' })
                      ]),
                      e('div', { className: 'field', key: 'hasta' }, [
                        e('label', { htmlFor: 'hasta', key: 'label' }, 'Hasta'),
                        e('input', { id: 'hasta', type: 'date', value: filters.hasta, onChange: function (event) { updateFilter('hasta', event.target.value); }, key: 'input' })
                      ]),
                      e('div', { className: 'field', key: 'pageSize' }, [
                        e('label', { htmlFor: 'pageSize', key: 'label' }, 'Resultados'),
                        e('select', { id: 'pageSize', value: filters.pageSize, onChange: function (event) { updateFilter('pageSize', event.target.value); }, key: 'select' }, [
                          e('option', { value: '20', key: '20' }, '20'),
                          e('option', { value: '50', key: '50' }, '50'),
                          e('option', { value: '100', key: '100' }, '100'),
                          e('option', { value: 'all', key: 'all' }, 'Todos')
                        ])
                      ]),
                      e('div', { className: 'field', key: 'buscar' }, [
                        e('label', { key: 'label' }, '\u00A0'),
                        e('button', { id: 'searchBtn', type: 'button', onClick: function () { setFiltrosOpen(false); setVisibleCount(0); }, key: 'button' }, 'Buscar')
                      ])
                    ]
                  )
                ]
              )
            ),
            e(
              'div',
              { className: 'admin-table-wrap', key: 'table-wrap' },
              [
                e(
                  'div',
                  { className: 'view-switch', 'aria-label': 'Cambiar vista del libro de gastos y compras', key: 'switch' },
                  [
                    e(
                      'div',
                      { className: 'view-switch-left', key: 'left' },
                      [
                        e('button', { type: 'button', id: 'filtrosToggleBtn', className: 'view-toggle', onClick: function () { setFiltrosOpen(true); }, key: 'filters' }, 'Filtros'),
                        e('button', { type: 'button', id: 'gastosComunesBtn', className: 'view-toggle' + (gastoView === 'comunes' ? ' is-active' : ''), onClick: function () { setGastoView('comunes'); }, key: 'common' }, 'Gastos comunes'),
                        e('button', { type: 'button', id: 'bienesInversionBtn', className: 'view-toggle' + (gastoView === 'inversiones' ? ' is-active' : ''), onClick: function () { setGastoView('inversiones'); }, key: 'investment' }, 'Bienes de inversión')
                      ]
                    ),
                    e(
                      'div',
                      { className: 'view-switch-right', key: 'right' },
                      [
                        e('button', { type: 'button', className: 'view-toggle', onClick: scrollToTotals, key: 'totals' }, 'Totales'),
                        e('button', { type: 'button', className: 'view-toggle', title: 'Suma del iva anual a declarar', onClick: openMod303, key: '303' }, 'Mod 303'),
                        e('button', { type: 'button', className: 'view-toggle', title: 'Suma de compras por proveedor por año cuyo resultado es mayor a 3000€', onClick: openMod347, key: '347' }, 'Mod 347')
                      ]
                    )
                  ]
                ),
                !isMobile && e(
                  'table',
                  { id: 'registrosTable', key: 'table' },
                  [
                    e('thead', { key: 'thead' }, e('tr', null, [
                      e('th', { className: 'col-id', key: 'id' }, 'Id'),
                      e('th', { key: 'num' }, 'Nº reg.'),
                      e('th', { key: 'fecha' }, 'Fecha'),
                      e('th', { key: 'prov' }, 'Proveedor'),
                      e('th', { key: 'nif' }, 'N.I.F. / C.I.F.'),
                      e('th', { key: 'fact' }, 'Nº factura'),
                      e('th', { key: 'tipo' }, 'Tipo C/G'),
                      e('th', { key: 'b4' }, 'Base 4%'),
                      e('th', { key: 'i4' }, 'IVA 4%'),
                      e('th', { key: 'b10' }, 'Base 10%'),
                      e('th', { key: 'i10' }, 'IVA 10%'),
                      e('th', { key: 'b21' }, 'Base 21%'),
                      e('th', { key: 'i21' }, 'IVA 21%'),
                      e('th', { key: 'retp' }, 'RET %'),
                      e('th', { key: 'ret' }, 'Retencion'),
                      e('th', { key: 'total' }, 'TOTAL'),
                      e('th', { key: 'actions' }, 'ACCIONES')
                    ])),
                    e('tbody', { key: 'tbody' },
                      currentRows.map(function (row) {
                        return e('tr', { key: row.id }, [
                          e('td', { className: 'col-id', key: 'id' }, row.id || ''),
                          e('td', { key: 'num' }, row.numero_registro || ''),
                          e('td', { key: 'fecha' }, formatDate(row.fecha_factura)),
                          e('td', { key: 'prov' }, e('button', { type: 'button', className: 'proveedor-link', onClick: function () { openProviderDetail(row); } }, row.proveedor_nombre || '')),
                          e('td', { key: 'nif' }, e('button', { type: 'button', className: 'proveedor-link', onClick: function () { openProviderDetail(row); } }, row.nif_cif || '')),
                          e('td', { key: 'fact' }, row.numero_factura || ''),
                          e('td', { key: 'tipo' }, row.tipo_compra_gasto || ''),
                          e('td', { key: 'b4' }, formatMoney(row.base_4)),
                          e('td', { key: 'i4' }, formatMoney(row.iva_4)),
                          e('td', { key: 'b10' }, formatMoney(row.base_10)),
                          e('td', { key: 'i10' }, formatMoney(row.iva_10)),
                          e('td', { key: 'b21' }, formatMoney(row.base_21)),
                          e('td', { key: 'i21' }, formatMoney(row.iva_21)),
                          e('td', { key: 'retp' }, formatPercent(row.ret_percent)),
                          e('td', { key: 'ret' }, formatMoney(row.retencion)),
                          e('td', { key: 'total' }, formatMoney(row.total_factura)),
                          e('td', { key: 'actions' }, e('span', { className: 'btn-row' }, e('button', { type: 'button', className: 'delete', onClick: function () { deleteRow(row.id); } }, 'Eliminar')))
                        ]);
                      })
                    )
                  ]
                ),
                e(
                  'div',
                  { className: 'cards-grid' + (isMobile ? ' is-visible' : ''), key: 'cards' },
                  currentRows.map(function (row) {
                    return e(
                      'article',
                      { className: 'registro-card', key: row.id },
                      [
                        e('div', { className: 'registro-card-head', key: 'head' }, [
                          e('span', { className: 'registro-card-id', key: 'id' }, '#' + (row.id || '') + ' · ' + (row.numero_registro || '-')),
                          e('span', { className: 'registro-card-tipo', key: 'tipo' }, row.tipo_compra_gasto || '-')
                        ]),
                        e(
                          'div',
                          { className: 'registro-card-grid', key: 'grid' },
                          [
                            ['Fecha factura', formatDate(row.fecha_factura)],
                            ['Proveedor', row.proveedor_nombre || ''],
                            ['N.I.F. / C.I.F.', row.nif_cif || ''],
                            ['Nº factura', row.numero_factura || ''],
                            ['Base 4%', formatMoney(row.base_4)],
                            ['IVA 4%', formatMoney(row.iva_4)],
                            ['Base 10%', formatMoney(row.base_10)],
                            ['IVA 10%', formatMoney(row.iva_10)],
                            ['Base 21%', formatMoney(row.base_21)],
                            ['IVA 21%', formatMoney(row.iva_21)],
                            ['RET %', formatPercent(row.ret_percent)],
                            ['RETENCION', formatMoney(row.retencion)],
                            ['TOTAL FACTURA', formatMoney(row.total_factura)]
                          ].map(function (item, index) {
                            return e('div', { className: 'registro-card-row', key: index }, [
                              e('span', { className: 'registro-card-label', key: 'label' }, item[0]),
                              item[0] === 'Proveedor' || item[0] === 'N.I.F. / C.I.F.'
                                ? e('button', { type: 'button', className: 'proveedor-link registro-card-value', onClick: function () { openProviderDetail(row); }, key: 'value' }, item[1])
                                : e('span', { className: 'registro-card-value', key: 'value' }, item[1])
                            ]);
                          })
                        ),
                        e('span', { className: 'btn-row', key: 'actions' }, e('button', { type: 'button', className: 'delete', onClick: function () { deleteRow(row.id); } }, 'Eliminar'))
                      ]
                    );
                  })
                ),
                e('div', { className: 'empty-state' + (currentRows.length === 0 ? ' is-visible' : ''), key: 'empty' }, loading ? 'Cargando registros...' : 'No hay registros en el libro de gastos y compras.'),
                e('button', { type: 'button', className: 'load-more-btn', style: { display: hasMoreRows ? '' : 'none' }, disabled: !hasMoreRows, onClick: loadMore, key: 'more' }, 'Cargar más')
              ]
            ),
            e(
              'fieldset',
              { id: 'totalesFieldset', className: 'resultado-fieldset', ref: totalsRef, key: 'totales' },
              [
                e('legend', { key: 'legend' }, 'Totales / sumas'),
                moneyStat('Total IVA', formatMoney(totals.totalIva), 'iva', 'A declarar en el mod. 303 anual'),
                moneyStat('Total sin IVA', formatMoney(totals.totalSinIva), 'sin', 'Neto/base imponible'),
                moneyStat('Total con IVA', formatMoney(totals.totalConIva), 'con', 'Bruto'),
                moneyStat('Total retención', formatMoney(totals.retencion), 'ret'),
                moneyStat('Total base 4% IVA', formatMoney(totals.base4), 'base4'),
                moneyStat('IVA 4%', formatMoney(totals.iva4), 'iva4'),
                moneyStat('Total base 10% IVA', formatMoney(totals.base10), 'base10'),
                moneyStat('IVA 10%', formatMoney(totals.iva10), 'iva10'),
                moneyStat('Total base 21% IVA', formatMoney(totals.base21), 'base21'),
                moneyStat('IVA 21%', formatMoney(totals.iva21), 'iva21')
              ]
            ),
            e(
              'fieldset',
              { className: 'resultado-fieldset tipos-fieldset', key: 'types' },
              [
                e('legend', { key: 'legend' }, 'Totales por tipo de compra/gasto'),
                e(
                  'div',
                  { className: 'tipos-totales-list', key: 'list' },
                  totalsByType.length
                    ? totalsByType.map(function (row) {
                        return e('div', { className: 'tipo-linea', key: row.tipo }, [
                          e('span', { className: 'tipo-linea-nombre', key: 'name' }, row.tipo),
                          e('span', { className: 'tipo-linea-valores', key: 'values' }, formatMoney(row.sinIva) + ' (sin IVA) · ' + formatMoney(row.conIva) + ' (con IVA)')
                        ]);
                      })
                    : e('p', { className: 'tipos-empty', key: 'empty' }, 'No hay registros.')
                )
              ]
            )
          ]
        ),
        modalBackdrop(
          alertState.open,
          function () { setAlertState(function (current) { return Object.assign({}, current, { open: false }); }); },
          '',
          e('div', { className: 'confirm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'actionAlertTitle' }, [
            e('div', { className: 'confirm-head', key: 'head' }, e('h2', { id: 'actionAlertTitle', className: 'confirm-title' }, alertState.title)),
            e('p', { className: 'confirm-status' + (alertState.type === 'error' ? ' error' : ''), key: 'text' }, alertState.message),
            e('div', { className: 'confirm-actions', key: 'actions' }, e('button', { type: 'button', onClick: function () { setAlertState(function (current) { return Object.assign({}, current, { open: false }); }); } }, 'Aceptar'))
          ]),
          'alert'
        ),
        modalBackdrop(
          mod303Open,
          function () { setMod303Open(false); },
          '',
          e('div', { className: 'confirm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mod303Title' }, [
            e('button', { type: 'button', className: 'confirm-close', 'aria-label': 'Cerrar', onClick: function () { setMod303Open(false); }, key: 'close' }, '×'),
            e('div', { className: 'confirm-header', key: 'header' }, e('h2', { id: 'mod303Title', className: 'confirm-title' }, 'Modelo 303 - Resumen anual de IVA')),
            e('div', { className: 'field', key: 'field' }, [
              e('label', { htmlFor: 'mod303Anio', key: 'label' }, 'Año'),
              e('select', { id: 'mod303Anio', value: mod303Year, onChange: function (event) { setMod303Year(event.target.value); }, key: 'select' },
                years.map(function (year) { return e('option', { value: String(year), key: year }, String(year)); })
              )
            ]),
            e('div', { className: 'resultado-fieldset', style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: '14px' }, key: 'stats' }, [
              moneyStat('Total IVA gastos corrientes', formatMoney(mod303Totals.corriente), 'corriente'),
              moneyStat('Total IVA bienes de inversión', formatMoney(mod303Totals.inversion), 'inversion')
            ]),
            e('div', { className: 'confirm-actions', key: 'actions' }, e('button', { type: 'button', className: 'ghost', onClick: function () { setMod303Open(false); } }, 'Cerrar'))
          ]),
          'mod303'
        ),
        modalBackdrop(
          mod347Open,
          function () { setMod347Open(false); },
          '',
          e('div', { className: 'confirm-modal mod347-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mod347Title' }, [
            e('button', { type: 'button', className: 'confirm-close', 'aria-label': 'Cerrar', onClick: function () { setMod347Open(false); }, key: 'close' }, '×'),
            e('div', { className: 'confirm-header', key: 'head' }, e('h2', { id: 'mod347Title', className: 'confirm-title' }, 'Modelo 347 - Proveedores con compras superiores a 3000')),
            e('div', { className: 'field', key: 'field' }, [
              e('label', { htmlFor: 'mod347Anio', key: 'label' }, 'Año'),
              e('select', { id: 'mod347Anio', value: mod347Year, onChange: function (event) { setMod347Year(event.target.value); }, key: 'select' },
                years.map(function (year) { return e('option', { value: String(year), key: year }, String(year)); })
              )
            ]),
            mod347Rows.length
              ? e('div', { className: 'mod347-table-wrap', key: 'table-wrap' }, e('table', { className: 'mod347-table' }, [
                  e('thead', { key: 'thead' }, e('tr', null, [
                    e('th', { key: 'prov' }, 'Proveedor'),
                    e('th', { key: 'nif' }, 'N.I.F.'),
                    e('th', { key: 'cp' }, 'C.P.'),
                    e('th', { key: '1t' }, '1T'),
                    e('th', { key: '2t' }, '2T'),
                    e('th', { key: '3t' }, '3T'),
                    e('th', { key: '4t' }, '4T'),
                    e('th', { key: 'anual' }, 'Anual')
                  ])),
                  e('tbody', { key: 'tbody' }, mod347Rows.map(function (row) {
                    return e('tr', { key: row.nif || row.nombre }, [
                      e('td', { key: 'nombre' }, row.nombre),
                      e('td', { key: 'nif' }, row.nif),
                      e('td', { key: 'cp' }, row.codigoPostal),
                      e('td', { key: 'q1' }, formatMoney(row.trimestres[0])),
                      e('td', { key: 'q2' }, formatMoney(row.trimestres[1])),
                      e('td', { key: 'q3' }, formatMoney(row.trimestres[2])),
                      e('td', { key: 'q4' }, formatMoney(row.trimestres[3])),
                      e('td', { key: 'anual' }, e('strong', null, formatMoney(row.anual)))
                    ]);
                  }))
                ]))
              : e('p', { className: 'mod347-empty', key: 'empty' }, 'No hay proveedores que cumplan los criterios para este año.'),
            e('div', { className: 'confirm-actions', key: 'actions' }, [
              e('button', { type: 'button', className: 'ghost', onClick: downloadMod347Pdf, key: 'print' }, 'Imprimir PDF'),
              e('button', { type: 'button', className: 'ghost', onClick: function () { setMod347Open(false); }, key: 'close' }, 'Cerrar')
            ])
          ]),
          'mod347'
        ),
        modalBackdrop(
          Boolean(providerDetailRow),
          function () { setProviderDetailRow(null); },
          '',
          providerDetailRow && e('div', { className: 'confirm-modal proveedor-detail-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'proveedorDetailTitle' }, [
            e('div', { className: 'confirm-header', key: 'head' }, e('h2', { id: 'proveedorDetailTitle', className: 'confirm-title' }, 'Detalle de proveedor')),
            e('div', { className: 'proveedor-detail-grid', key: 'grid' }, [
              ['ID', providerDetailRow.proveedor_id],
              ['NIF', providerDetailRow.nif_cif],
              ['Nombre', providerDetailRow.proveedor_nombre],
              ['Teléfono', providerDetailRow.proveedor_telefono],
              ['Email', providerDetailRow.proveedor_email],
              ['Dirección', providerDetailRow.proveedor_direccion],
              ['Ciudad', providerDetailRow.proveedor_ciudad],
              ['Provincia', providerDetailRow.proveedor_provincia],
              ['Código postal', providerDetailRow.codigo_postal],
              ['Registro', formatDate(providerDetailRow.proveedor_fecha_registro)]
            ].map(function (item, index) {
              return e('div', { className: 'proveedor-detail-item', key: index }, [
                e('p', { className: 'proveedor-detail-label', key: 'label' }, item[0]),
                e('p', { className: 'proveedor-detail-value', key: 'value' }, item[1] == null || item[1] === '' ? '-' : String(item[1]))
              ]);
            }))
            ,
            e('div', { className: 'confirm-actions', key: 'actions' }, [
              e('button', { type: 'button', className: 'ghost', onClick: function () { setProviderDetailRow(null); }, key: 'close' }, 'Cerrar'),
              e('button', { type: 'button', onClick: function () { openProviderEditFromRow(providerDetailRow); }, key: 'edit' }, 'Editar')
            ])
          ]),
          'provider-detail'
        ),
        modalBackdrop(
          providerEdit.open,
          closeProviderEdit,
          '',
          providerEdit.open && e('div', { className: 'confirm-modal proveedor-edit-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'proveedorEditTitle' }, [
            e('div', { className: 'confirm-header', key: 'head' }, e('h2', { id: 'proveedorEditTitle', className: 'confirm-title' }, 'Editar proveedor')),
            e('form', { onSubmit: saveProviderEdit, noValidate: true, key: 'form' }, [
              e('div', { className: 'proveedor-edit-grid', key: 'grid' }, [
                ['Nombre', 'nombre', true, 'field field-full'],
                ['NIF', 'nif', true, 'field'],
                ['Teléfono', 'telefono', false, 'field'],
                ['Email', 'email', false, 'field'],
                ['Código postal', 'cp', false, 'field'],
                ['Dirección', 'direccion', false, 'field field-full'],
                ['Ciudad', 'ciudad', false, 'field'],
                ['Provincia', 'provincia', false, 'field']
              ].map(function (field) {
                const name = field[1];
                return e('div', { className: field[3], key: name }, [
                  e('label', { htmlFor: 'edit-' + name, key: 'label' }, field[0]),
                  e('input', {
                    id: 'edit-' + name,
                    value: providerEdit.form[name],
                    required: field[2],
                    type: name === 'email' ? 'email' : 'text',
                    inputMode: name === 'telefono' ? 'numeric' : undefined,
                    maxLength: name === 'telefono' ? 9 : undefined,
                    onChange: function (event) { handleProviderEditChange(name, event.target.value); },
                    key: 'input'
                  })
                ]);
              }))
              ,
              e('p', { className: 'proveedor-edit-status', role: 'status', key: 'status' }, providerEdit.status),
              e('div', { className: 'confirm-actions', key: 'actions' }, [
                e('button', { type: 'button', className: 'ghost', onClick: closeProviderEdit, key: 'cancel' }, 'Cancelar'),
                e('button', { type: 'submit', disabled: providerEdit.saving, key: 'save' }, providerEdit.saving ? 'Guardando...' : 'Guardar')
              ])
            ])
          ]),
          'provider-edit'
        )
      ]
    );
  }

  const rootNode = document.getElementById('react-libro-root');
  if (!rootNode) return;

  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootNode).render(e(ReactLibroApp));
    return;
  }

  ReactDOM.render(e(ReactLibroApp), rootNode);
})();
