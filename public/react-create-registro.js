(function () {
  const e = React.createElement;

  const TIPOS_COMPRA_GASTO = [
    { value: '', label: 'Selecciona una opción', title: '', disabled: true },
    { value: 'Compras y servicios', label: 'Compras y servicios', title: 'Harina, vasos, asesoría...' },
    { value: 'Alquileres', label: 'Alquileres', title: 'Tiene retención.' },
    { value: 'Reparaciones', label: 'Reparaciones', title: 'Reparaciones.' },
    { value: 'Suministros', label: 'Suministros', title: 'Agua, luz, teléfono...' },
    { value: 'Tributos', label: 'Tributos', title: 'IRPF, IBI, tasas de ayuntamiento... Sin IVA.' },
    { value: 'Sueldos/salarios', label: 'Sueldos/salarios', title: 'Incluye IRPF y S.S. de empleados. Sin IVA.' },
    { value: 'S.S/autónomos', label: 'S.S/autónomos', title: 'S.S. a cargo de la empresa de empleados y cuota de autónomo propia. Sin IVA.' },
    { value: 'Inversiones', label: 'Inversiones', title: 'Mobiliario, máquinas, vehículos...' },
    { value: 'Otros', label: 'Otros', title: 'Incluye seguros y bancos que no llevan IVA.' }
  ];

  const TIPO_AYUDAS = {
    'Compras y servicios': 'Harina, vasos, asesoría...',
    'Alquileres': 'Tiene retención.',
    'Reparaciones': 'Reparaciones.',
    'Suministros': 'Agua, luz, teléfono...',
    'Tributos': 'IRPF, IBI, tasas de ayuntamiento... Sin IVA.',
    'Sueldos/salarios': 'Incluye IRPF y S.S. de empleados. Sin IVA.',
    'S.S/autónomos': 'S.S. a cargo de la empresa de empleados y cuota de autónomo propia. Sin IVA.',
    'Inversiones': 'Mobiliario, máquinas, vehículos...',
    'Otros': 'Incluye seguros y bancos que no llevan IVA.'
  };

  const INITIAL_FORM = {
    fecha_text: '',
    fecha_picker: '',
    proveedor_nombre: '',
    nif_cif: '',
    numero_factura: '',
    tipo_compra_gasto: '',
    iva4: '0',
    iva10: '0',
    iva21: '0',
    iva0: '0',
    retPercent: '0'
  };

  function normalizeNif(value) {
    return String(value || '').trim().toUpperCase();
  }

  function isValidNif(value) {
    const nif = normalizeNif(value);
    if (!nif) return false;
    return /^(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9])$/.test(nif);
  }

  function parseDDMMYY(text) {
    const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(text || '').trim());
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = 2000 + parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function isoToShortDate(value) {
    if (!value) return '';
    const parts = String(value).split('-');
    if (parts.length !== 3) return '';
    return parts[2] + '/' + parts[1] + '/' + parts[0].slice(2);
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isValidMoneyInput(value) {
    const raw = String(value || '').trim();
    if (raw === '') return true;
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return false;
    return Number(raw) >= 0;
  }

  function readNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatMoney(value) {
    return Number(value || 0).toFixed(2).replace('.', ',') + ' €';
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function computeTotals(form) {
    const base4 = readNumber(form.iva4);
    const base10 = readNumber(form.iva10);
    const base21 = readNumber(form.iva21);
    const base0 = readNumber(form.iva0);
    const retPercent = readNumber(form.retPercent);
    const cuota4 = round2(base4 * 0.04);
    const cuota10 = round2(base10 * 0.10);
    const cuota21 = round2(base21 * 0.21);
    const totalSinIva = round2(base4 + base10 + base21 + base0);
    const totalIva = round2(cuota4 + cuota10 + cuota21);
    const retencion = round2(totalSinIva * (retPercent / 100));
    const totalFactura = round2(totalSinIva + totalIva - retencion);
    return {
      cuota4: cuota4,
      cuota10: cuota10,
      cuota21: cuota21,
      totalSinIva: totalSinIva,
      totalIva: totalIva,
      retencion: retencion,
      totalFactura: totalFactura
    };
  }

  function ReactCreateRegistroApp() {
    const formRef = React.useRef(null);
    const datePickerRef = React.useRef(null);
    const searchInputRef = React.useRef(null);

    const [form, setForm] = React.useState(INITIAL_FORM);
    const [status, setStatus] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [pickerLoading, setPickerLoading] = React.useState(false);
    const [pickerError, setPickerError] = React.useState('');
    const [pickerSearch, setPickerSearch] = React.useState('');
    const [proveedores, setProveedores] = React.useState([]);
    const [selectedProveedorNif, setSelectedProveedorNif] = React.useState('');

    const totals = React.useMemo(function () {
      return computeTotals(form);
    }, [form]);

    const tipoAyuda = TIPO_AYUDAS[form.tipo_compra_gasto] || '';

    const filteredProveedores = React.useMemo(function () {
      const term = normalizeSearchText(pickerSearch);
      if (!term) return proveedores;
      return proveedores.filter(function (proveedor) {
        const nombre = normalizeSearchText(proveedor && proveedor.nombre);
        const nif = normalizeSearchText(proveedor && proveedor.nif);
        return nombre.includes(term) || nif.includes(term);
      });
    }, [pickerSearch, proveedores]);

    const selectedProveedor = React.useMemo(function () {
      return proveedores.find(function (proveedor) {
        return String(proveedor.nif || '') === String(selectedProveedorNif || '');
      }) || null;
    }, [proveedores, selectedProveedorNif]);

    React.useEffect(function () {
      if (!pickerOpen) {
        return undefined;
      }

      const timeoutId = window.setTimeout(function () {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 0);

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          setPickerOpen(false);
        }
      }

      document.addEventListener('keydown', onKeyDown);
      return function () {
        window.clearTimeout(timeoutId);
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [pickerOpen]);

    function updateField(name, value) {
      setForm(function (current) {
        return Object.assign({}, current, { [name]: value });
      });
    }

    function handleTextInput(event) {
      const target = event.target;
      let nextValue = target.value;
      if (target.name === 'nif_cif') {
        nextValue = nextValue.toUpperCase();
      }
      updateField(target.name, nextValue);
    }

    function handleDatePickerChange(event) {
      const value = event.target.value || '';
      updateField('fecha_picker', value);
      updateField('fecha_text', isoToShortDate(value));
    }

    function openDatePicker(event) {
      event.preventDefault();
      if (!datePickerRef.current) return;
      datePickerRef.current.focus({ preventScroll: true });
      if (typeof datePickerRef.current.showPicker === 'function') {
        datePickerRef.current.showPicker();
      } else {
        datePickerRef.current.click();
      }
    }

    function goToLibro() {
      window.location.href = '/admin/libro-gastos-compras';
    }

    async function openProveedorPicker() {
      setPickerOpen(true);
      setPickerLoading(true);
      setPickerError('');
      setPickerSearch('');
      setSelectedProveedorNif('');

      try {
        const response = await fetch('/admin/api/proveedores?page=1&pageSize=500&sort=nombre&dir=asc', {
          credentials: 'same-origin'
        });
        const data = await response.json().catch(function () {
          return {};
        });
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || 'No se pudieron cargar los proveedores.');
        }
        setProveedores(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        console.error('Error cargando proveedores para selector:', error);
        setProveedores([]);
        setPickerError(error && error.message ? error.message : 'desconocido');
      } finally {
        setPickerLoading(false);
      }
    }

    function closeProveedorPicker() {
      setPickerOpen(false);
    }

    function applySelectedProveedor() {
      if (!selectedProveedor) return;
      setForm(function (current) {
        return Object.assign({}, current, {
          proveedor_nombre: selectedProveedor.nombre || '',
          nif_cif: normalizeNif(selectedProveedor.nif || '')
        });
      });
      setPickerOpen(false);
    }

    function validateForm() {
      if (formRef.current && !formRef.current.reportValidity()) {
        return false;
      }

      if (!parseDDMMYY(form.fecha_text)) {
        setStatus('Indica una fecha de factura valida en formato dd/mm/aa.');
        return false;
      }

      if (!isValidNif(form.nif_cif)) {
        setStatus('Introduce un N.I.F. / C.I.F. valido.');
        return false;
      }

      const moneyFields = [
        { key: 'iva4', label: 'Base IVA 4%' },
        { key: 'iva10', label: 'Base IVA 10%' },
        { key: 'iva21', label: 'Base IVA 21%' },
        { key: 'iva0', label: 'Base IVA 0%' }
      ];

      for (let index = 0; index < moneyFields.length; index += 1) {
        const field = moneyFields[index];
        if (!isValidMoneyInput(form[field.key])) {
          setStatus(field.label + ' debe ser un importe igual o mayor que 0 y con un maximo de dos decimales.');
          return false;
        }
      }

      const retencion = readNumber(form.retPercent);
      if (!isValidMoneyInput(form.retPercent) || retencion < 0 || retencion > 100) {
        setStatus('La retencion debe estar entre 0% y 100%.');
        return false;
      }

      return true;
    }

    async function handleSubmit(event) {
      event.preventDefault();
      setStatus('');

      if (!validateForm()) {
        return;
      }

      const parsedDate = parseDDMMYY(form.fecha_text);
      const payload = {
        fecha_factura: formatIsoDate(parsedDate),
        proveedor_nombre: String(form.proveedor_nombre || '').trim(),
        nif_cif: normalizeNif(form.nif_cif),
        numero_factura: String(form.numero_factura || '').trim(),
        tipo_compra_gasto: form.tipo_compra_gasto,
        base_4: readNumber(form.iva4),
        base_10: readNumber(form.iva10),
        base_21: readNumber(form.iva21),
        base_0: readNumber(form.iva0),
        ret_percent: readNumber(form.retPercent)
      };

      setSaving(true);
      setStatus('Guardando registro...');

      try {
        const response = await fetch('/admin/api/libro-gastos-compras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(function () {
          return {};
        });
        if (!response.ok || !data.ok) {
          setStatus(data.error || 'No se pudo guardar el registro.');
          setSaving(false);
          return;
        }
        window.location.href = '/admin/libro-gastos-compras';
      } catch (_error) {
        setStatus('Error de conexion. Intentalo de nuevo.');
        setSaving(false);
      }
    }

    const pickerStatusText = pickerLoading
      ? 'Cargando proveedores...'
      : pickerError
        ? 'Error al cargar proveedores: ' + pickerError
        : filteredProveedores.length === 0
          ? 'No hay coincidencias para la busqueda actual.'
          : filteredProveedores.length === proveedores.length
            ? proveedores.length + ' proveedor(es) cargado(s). Selecciona uno y pulsa Aceptar.'
            : filteredProveedores.length + ' resultado(s) de ' + proveedores.length + ' proveedor(es).';

    return e(
      React.Fragment,
      null,
      [
        e(
          'main',
          { className: 'crear-page', key: 'main' },
          [
            e(
              'header',
              { className: 'crear-head', key: 'header' },
              [
                e(
                  'div',
                  { key: 'heading' },
                  [
                    e('h1', { key: 'title' }, 'Crear registro'),
                  ]
                ),
                e(
                  'div',
                  { className: 'crear-head-actions', key: 'actions' },
                  [
                    e('button', { type: 'button', onClick: openProveedorPicker, key: 'select' }, 'Seleccionar proveedor'),
                    e('button', { type: 'button', onClick: goToLibro, key: 'back' }, 'Volver al libro')
                  ]
                )
              ]
            ),
            e(
              'form',
              { className: 'registro-form', onSubmit: handleSubmit, ref: formRef, noValidate: true, key: 'form' },
              [
                e(
                  'div',
                  { className: 'registro-form-grid', key: 'grid' },
                  [
                    e(
                      'div',
                      { className: 'field field-full', key: 'fecha' },
                      [
                        e('label', { htmlFor: 'fecha_text', key: 'label' }, 'Fecha factura'),
                        e(
                          'div',
                          { className: 'input-with-icon', key: 'input-wrap' },
                          [
                            e('input', {
                              id: 'fecha_text',
                              name: 'fecha_text',
                              inputMode: 'numeric',
                              placeholder: 'dd/mm/aa',
                              pattern: '\\d{2}/\\d{2}/\\d{2}',
                              required: true,
                              value: form.fecha_text,
                              onChange: handleTextInput,
                              disabled: saving,
                              key: 'input'
                            }),
                            e('button', {
                              type: 'button',
                              id: 'open-cal',
                              className: 'icon-btn',
                              'aria-label': 'Abrir calendario',
                              title: 'Abrir calendario',
                              onClick: openDatePicker,
                              disabled: saving,
                              key: 'button'
                            }, '📅'),
                            e('input', {
                              type: 'date',
                              id: 'fecha_picker',
                              className: 'visually-hidden',
                              value: form.fecha_picker,
                              onChange: handleDatePickerChange,
                              ref: datePickerRef,
                              disabled: saving,
                              key: 'picker'
                            })
                          ]
                        ),
                        e('div', { className: 'hint', key: 'hint' }, 'Formato: dd/mm/aa (ej. 03/02/26)')
                      ]
                    ),
                    e(
                      'div',
                      { className: 'field field-full', key: 'proveedor' },
                      [
                        e('label', { htmlFor: 'proveedorNombre', key: 'label' }, 'Proveedor (nombre)'),
                        e('input', {
                          id: 'proveedorNombre',
                          name: 'proveedor_nombre',
                          type: 'text',
                          maxLength: 150,
                          autoComplete: 'organization',
                          required: true,
                          value: form.proveedor_nombre,
                          onChange: handleTextInput,
                          disabled: saving,
                          key: 'input'
                        })
                      ]
                    ),
                    e(
                      'div',
                      { className: 'field', key: 'nif' },
                      [
                        e('label', { htmlFor: 'nifCif', key: 'label' }, 'N.I.F. / C.I.F. (Sin espacios ni guiones)'),
                        e('input', {
                          id: 'nifCif',
                          name: 'nif_cif',
                          type: 'text',
                          maxLength: 20,
                          autoComplete: 'off',
                          required: true,
                          value: form.nif_cif,
                          onChange: handleTextInput,
                          disabled: saving,
                          key: 'input'
                        })
                      ]
                    ),
                    e(
                      'div',
                      { className: 'field', key: 'factura' },
                      [
                        e('label', { htmlFor: 'numeroFactura', key: 'label' }, 'Nº factura'),
                        e('input', {
                          id: 'numeroFactura',
                          name: 'numero_factura',
                          type: 'text',
                          maxLength: 50,
                          required: true,
                          value: form.numero_factura,
                          onChange: handleTextInput,
                          disabled: saving,
                          key: 'input'
                        })
                      ]
                    ),
                    e(
                      'div',
                      { className: 'field field-full', key: 'tipo' },
                      [
                        e('label', { htmlFor: 'tipoCompraGasto', key: 'label' }, 'Tipo compra/gasto'),
                        e(
                          'select',
                          {
                            id: 'tipoCompraGasto',
                            name: 'tipo_compra_gasto',
                            required: true,
                            value: form.tipo_compra_gasto,
                            onChange: handleTextInput,
                            disabled: saving,
                            key: 'select'
                          },
                          TIPOS_COMPRA_GASTO.map(function (tipo, index) {
                            return e(
                              'option',
                              {
                                value: tipo.value,
                                title: tipo.title,
                                disabled: tipo.disabled,
                                key: 'option-' + index
                              },
                              tipo.label
                            );
                          })
                        ),
                        e(
                          'div',
                          {
                            className: 'tipo-ayuda' + (tipoAyuda ? ' is-visible' : ''),
                            role: 'status',
                            'aria-live': 'polite',
                            key: 'help'
                          },
                          tipoAyuda
                        )
                      ]
                    ),
                    [
                      { key: 'iva4', label: 'Base IVA 4%' },
                      { key: 'iva10', label: 'Base IVA 10%' },
                      { key: 'iva21', label: 'Base IVA 21%' },
                      { key: 'iva0', label: 'Base IVA 0% (Sin IVA)' },
                      { key: 'retPercent', label: 'RETENCION %', max: '100' }
                    ].map(function (field) {
                      return e(
                        'div',
                        { className: 'field', key: field.key },
                        [
                          e('label', { htmlFor: field.key, key: 'label' }, field.label),
                          e('input', {
                            id: field.key,
                            name: field.key,
                            type: 'number',
                            min: '0',
                            max: field.max || undefined,
                            step: '0.01',
                            inputMode: 'decimal',
                            value: form[field.key],
                            onChange: handleTextInput,
                            disabled: saving,
                            key: 'input'
                          })
                        ]
                      );
                    })
                  ].flat()
                ),
                e(
                  'fieldset',
                  { className: 'resultado-fieldset', key: 'results' },
                  [
                    e('legend', { key: 'legend' }, 'Resultados'),
                    e('div', { className: 'resultado-linea', key: 'r1' }, [e('span', { key: 'l' }, 'Cuota IVA 4%'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.cuota4))]),
                    e('div', { className: 'resultado-linea', key: 'r2' }, [e('span', { key: 'l' }, 'Cuota IVA 10%'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.cuota10))]),
                    e('div', { className: 'resultado-linea', key: 'r3' }, [e('span', { key: 'l' }, 'Cuota IVA 21%'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.cuota21))]),
                    e('div', { className: 'resultado-linea', key: 'r4' }, [e('span', { key: 'l' }, 'Retención'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.retencion))]),
                    e('div', { className: 'resultado-linea', key: 'r5' }, [e('span', { key: 'l' }, 'Total IVA'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.totalIva))]),
                    e('div', { className: 'resultado-linea', key: 'r6' }, [e('span', { key: 'l' }, 'Total sin IVA'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.totalSinIva))]),
                    e('div', { className: 'resultado-linea total', key: 'r7' }, [e('span', { key: 'l' }, 'Total de la factura'), e('output', { className: 'resultado-valor', key: 'v' }, formatMoney(totals.totalFactura))]),
                    e('p', { className: 'resultado-ayuda', key: 'help' }, 'Compruebe que el total coincide con el Total de la factura impresa o en pdf')
                  ]
                ),
                e('p', { className: 'registro-status', 'aria-live': 'polite', key: 'status' }, status),
                e(
                  'div',
                  { className: 'registro-form-actions', key: 'form-actions' },
                  [
                    e('button', { type: 'button', onClick: goToLibro, disabled: saving, key: 'cancel' }, 'Cancelar'),
                    e('button', { type: 'submit', disabled: saving, key: 'save' }, saving ? 'Guardando...' : 'Guardar registro')
                  ]
                )
              ]
            )
          ]
        ),
        e(
          'div',
          {
            className: 'confirm-modal-backdrop' + (pickerOpen ? '' : ' hidden'),
            'aria-hidden': pickerOpen ? 'false' : 'true',
            onClick: function (event) {
              if (event.target === event.currentTarget) {
                closeProveedorPicker();
              }
            },
            key: 'modal'
          },
          e(
            'div',
            { className: 'confirm-modal proveedor-picker-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'proveedor-picker-title' },
            [
              e('button', { type: 'button', className: 'confirm-close', 'aria-label': 'Cerrar', onClick: closeProveedorPicker, key: 'close' }, '×'),
              e('h2', { id: 'proveedor-picker-title', key: 'title' }, 'Seleccionar proveedor'),
              e('p', { className: 'confirm-intro', key: 'intro' }, 'Elige un proveedor para rellenar su nombre y N.I.F. / C.I.F.'),
              e('input', {
                type: 'search',
                className: 'proveedor-picker-search',
                placeholder: 'Buscar por nombre o NIF/CIF',
                autoComplete: 'off',
                'aria-label': 'Buscar proveedor',
                value: pickerSearch,
                onChange: function (event) { setPickerSearch(event.target.value); },
                ref: searchInputRef,
                key: 'search'
              }),
              e(
                'p',
                { className: 'proveedor-picker-status' + (pickerError ? ' error' : ''), 'aria-live': 'polite', key: 'status' },
                pickerStatusText
              ),
              e(
                'div',
                { className: 'proveedor-picker-table-wrap', key: 'table-wrap' },
                e(
                  'table',
                  { className: 'proveedor-picker-table', 'aria-label': 'Proveedores disponibles' },
                  [
                    e(
                      'thead',
                      { key: 'thead' },
                      e('tr', null, [
                        e('th', { key: 'h1' }, 'Nombre'),
                        e('th', { key: 'h2' }, 'N.I.F. / C.I.F.'),
                        e('th', { key: 'h3' }, 'Teléfono')
                      ])
                    ),
                    e(
                      'tbody',
                      { key: 'tbody' },
                      filteredProveedores.length
                        ? filteredProveedores.map(function (proveedor) {
                            const proveedorNif = String(proveedor.nif || '');
                            const selected = proveedorNif === selectedProveedorNif;
                            return e(
                              'tr',
                              {
                                className: 'proveedor-picker-row' + (selected ? ' is-selected' : ''),
                                onClick: function () { setSelectedProveedorNif(proveedorNif); },
                                key: proveedorNif || proveedor.id || proveedor.nombre
                              },
                              [
                                e('td', { key: 'name' }, String(proveedor.nombre || '').trim() || '—'),
                                e('td', { key: 'nif' }, String(proveedor.nif || '').trim() || '—'),
                                e('td', { key: 'phone' }, String(proveedor.telefono || '').trim() || '—')
                              ]
                            );
                          })
                        : e(
                            'tr',
                            { key: 'empty' },
                            e('td', { colSpan: 3, className: 'proveedor-picker-empty' }, 'No hay proveedores disponibles.')
                          )
                    )
                  ]
                )
              ),
              e(
                'div',
                { className: 'confirm-actions', key: 'actions' },
                [
                  e('button', { type: 'button', className: 'ghost', onClick: closeProveedorPicker, key: 'cancel' }, 'Cancelar'),
                  e('button', { type: 'button', onClick: applySelectedProveedor, disabled: !selectedProveedor, key: 'accept' }, 'Aceptar')
                ]
              )
            ]
          )
        )
      ]
    );
  }

  const rootNode = document.getElementById('react-create-registro-root');
  if (!rootNode) return;

  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootNode).render(e(ReactCreateRegistroApp));
    return;
  }

  ReactDOM.render(e(ReactCreateRegistroApp), rootNode);
})();
