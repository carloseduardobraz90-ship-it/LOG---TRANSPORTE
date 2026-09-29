const FUEL_PRICE_PER_LITER = 7.49;

const S = {
  files: [],
  fuel: [],
  log: [],
  filteredFuel: [],
  filteredLog: [],
  dailyMetrics: [],
  filteredDaily: [],
  charts: {},
  map: null,
  routeLayer: null,
  markersLayer: null,
  routeRunId: 0,
  geocodeCache: {},
  manualAddresses: {},
  sources: { fuel: [], log: [] }
};

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const fmt = n => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';

function number(v) {
  if (v === null || v === undefined || v === '') return NaN;
  let s = String(v).trim().replace(/[^0-9,.-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return Number(s);
}

// Quilometragem das bases AppSheet vem em formato brasileiro, ex.: 626.134 = 626.134 km.
function mileage(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const s = String(v).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^\d+(,\d+)$/.test(s)) return Number(s.replace(',', '.'));
  return Number(s.replace(/[^0-9.-]/g, ''));
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function key(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
}

function dateTime(d) {
  return d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function cleanKey(k) {
  return String(k)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["\ufeff]/g, '')
    .trim();
}

function normalizeCode(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

// REGRA OFICIAL DA ROTA: entram COLETA e ENTREGA. RECEBIMENTO fica fora.
function isRouteType(type) {
  const normalized = cleanKey(String(type ?? ''));
  return normalized === 'coleta' || normalized === 'entrega';
}

function findKey(row, terms) {
  const normalizedTerms = terms.map(cleanKey);
  return Object.keys(row).find(k => normalizedTerms.some(t => cleanKey(k) === t || cleanKey(k).includes(t)));
}

function get(row, terms) {
  const k = findKey(row, terms);
  return k === undefined ? '' : row[k];
}

function positional(row, index) {
  return Object.values(row)[index] ?? '';
}

function sourceType(rows) {
  const r = rows[0] || {};
  const keys = Object.keys(r).map(cleanKey);

  const hasVehicle = keys.some(k => k === 'veiculo' || k.includes('veiculo') || k.includes('placa'));
  const hasKm = keys.some(k =>
    k.includes('quilometragem') ||
    k.includes('km_incial') ||
    k.includes('km_inicial') ||
    k.includes('km_final')
  );
  const hasFuelValue = keys.some(k => k.includes('valor_total') || k.includes('valor_abastecido'));
  const hasDailyDate = keys.some(k => k.includes('data e hora inicial e final'));

  const hasRouteSignals =
    keys.some(k => k === 'pedido_' || k === 'pedido' || k.includes('pedido')) &&
    keys.some(k => k === 'fornecedor' || k.includes('fornecedor')) &&
    (keys.some(k => k === 'agendamento' || k.includes('agendamento')) ||
     keys.some(k => k === 'tipo' || k.includes('tipo')));

  if (hasVehicle && hasKm && hasFuelValue && (hasDailyDate || keys.some(k => k.includes('valor_total')))) {
    return 'fuel';
  }

  if (hasRouteSignals) return 'log';
  return 'unknown';
}

function isFuel(rows) {
  return sourceType(rows) === 'fuel';
}

function fuelValueFromRow(r) {
  return number(get(r, [
    'valor_abastecido',
    'valor abastecido',
    'valor_total',
    'valor total'
  ]));
}

function vehicleFromRow(r, fileName) {
  return String(
    get(r, ['veiculo', 'placa']) ||
    positional(r, 2) ||
    fileName.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/i)?.[0] ||
    fileName.match(/fvb2c57|fcl9986/i)?.[0] ||
    'Não identificado'
  ).toUpperCase().trim();
}

function normalizeFuel(rows, fileName) {
  return rows.map((r, idx) => {
    const d = parseDate(
      get(r, ['data e hora inicial e final', 'data', 'data hora', 'data/hora']) ||
      positional(r, 0)
    );

    const vehicle = vehicleFromRow(r, fileName);

    const km = mileage(
      get(r, [
        'km_incial x km_final',
        'km_inicial x km_final',
        'quilometragem',
        'quilometragem atual',
        'km'
      ]) ||
      positional(r, 3)
    );

    const value = fuelValueFromRow(r);

    // Regra de negócio: litros = valor abastecido / R$ 7,49.
    const liters = Number.isFinite(value) && value > 0
      ? value / FUEL_PRICE_PER_LITER
      : NaN;

    return {
      date: d,
      dateText: d ? d.toLocaleDateString('pt-BR') : '',
      vehicle,
      value,
      price: FUEL_PRICE_PER_LITER,
      liters,
      km,
      sourceFile: fileName,
      sourceRow: idx + 2
    };
  }).filter(r => Number.isFinite(r.value) || Number.isFinite(r.km));
}

function normalizeLog(rows) {
  return rows.map(r => {
    const emission = parseDate(get(r, ['emissao']) || positional(r, 6));
    const forecast = parseDate(get(r, ['previsao']) || positional(r, 7));
    // COLUNA V da AppSheet = AGENDAMENTO. Índice 21 porque começa em 0.
    const schedule = parseDate(get(r, ['agendamento']) || positional(r, 21));
    const delivery = parseDate(get(r, ['entrega/coleta', 'entrega', 'coleta']) || positional(r, 23));
    // COLUNA J da AppSheet = FORNECEDOR. Índice 9 porque começa em 0.
    const supplierCode = normalizeCode(get(r, ['fornecedor']) || positional(r, 9));
    const supplierName = String(get(r, ['nome']) || positional(r, 8) || 'Não informado').trim();
    const city = String(get(r, ['cidade']) || positional(r, 10) || 'Não informado').trim();
    const buyer = String(get(r, ['comprador']) || positional(r, 20) || 'Não informado').trim();
    const order = String(get(r, ['pedido_', 'pedido']) || positional(r, 1) || '').trim();
    return {
      ...r,
      _date: emission,
      _scheduleDate: schedule,
      _forecastDate: forecast,
      _deliveryDate: delivery,
      _status: String(get(r, ['status']) || positional(r, 22) || 'Não informado').trim(),
      // COLUNA F da AppSheet = TIPO. É esta coluna que define COLETA para a rota.
      _type: String(get(r, ['tipo']) || positional(r, 5) || 'Não informado').trim(),
      _city: city || 'Não informado',
      _supplierCode: supplierCode,
      _supplierName: supplierName,
      _buyer: buyer,
      _order: order
    };
  });
}

async function read(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const fs = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const wb = XLSX.read(text, { type: 'string', FS: fs, raw: false });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

function toast(t) {
  const x = $('toast');
  x.textContent = t;
  x.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => x.style.display = 'none', 4500);
}

function destroy(n) {
  if (S.charts[n]) {
    S.charts[n].destroy();
    delete S.charts[n];
  }
}

function apply() {
  const y = $('year').value;
  const v = $('vehicle').value;
  const start = $('start').value;
  const end = $('end').value;

  S.filteredFuel = S.fuel.filter(r => {
    const k = key(r.date);
    return (y === 'todos' || r.date?.getFullYear() == y) &&
      (v === 'todos' || r.vehicle === v) &&
      (!start || k >= start) &&
      (!end || k <= end);
  });

  S.filteredLog = S.log.filter(r => {
    const k = key(r._date);
    return (y === 'todos' || r._date?.getFullYear() == y) &&
      (!start || k >= start) &&
      (!end || k <= end);
  });

  // O saldo de combustível é calculado sobre todo o histórico carregado,
  // para que filtros de data não quebrem a continuidade entre os dias.
  S.dailyMetrics = buildDailyMetrics(S.fuel);
  S.filteredDaily = S.dailyMetrics.filter(r => {
    return (y === 'todos' || r.date?.getFullYear() == y) &&
      (v === 'todos' || r.vehicle === v) &&
      (!start || r.dateKey >= start) &&
      (!end || r.dateKey <= end);
  });
}

function buildDailyMetrics(fuelRows) {
  const cleanRows = fuelRows
    .filter(r => r.date && r.vehicle)
    .slice()
    .sort((a, b) => a.date - b.date);

  const byVehicleDay = new Map();

  cleanRows.forEach(r => {
    const dateKey = key(r.date);
    const groupKey = `${r.vehicle}__${dateKey}`;

    if (!byVehicleDay.has(groupKey)) {
      byVehicleDay.set(groupKey, {
        vehicle: r.vehicle,
        dateKey,
        date: new Date(r.date),
        rows: [],
        totalValue: 0,
        actualLiters: 0
      });
    }

    const g = byVehicleDay.get(groupKey);
    g.rows.push(r);

    if (Number.isFinite(r.value)) g.totalValue += r.value;
    if (Number.isFinite(r.liters)) g.actualLiters += r.liters;
  });

  const rowsByVehicle = new Map();
  [...byVehicleDay.values()].forEach(g => {
    if (!rowsByVehicle.has(g.vehicle)) rowsByVehicle.set(g.vehicle, []);
    rowsByVehicle.get(g.vehicle).push(g);
  });

  const result = [];

  for (const [vehicle, groups] of rowsByVehicle.entries()) {
    groups.sort((a, b) => a.date - b.date);

    // A média de referência é construída progressivamente, usando apenas
    // dias anteriores (ou o próprio dia quando houve abastecimento real).
    let weightedDistance = 0;
    let weightedLiters = 0;
    let rollingAvgKmL = NaN;
    let balance = 0;
    let balanceKnown = false;

    for (const g of groups) {
      const rows = g.rows.slice().sort((a, b) => a.date - b.date);
      const first = rows[0];
      const last = rows[rows.length - 1];

      const kmInitial = Number.isFinite(first?.km) ? first.km : NaN;
      const kmFinal = Number.isFinite(last?.km) ? last.km : NaN;

      let kmDriven = NaN;
      let status = 'Sem par inicial/final';

      if (rows.length >= 2 && Number.isFinite(kmInitial) && Number.isFinite(kmFinal)) {
        kmDriven = kmFinal - kmInitial;
        if (kmDriven >= 0) status = 'Calculado';
        else {
          kmDriven = NaN;
          status = 'KM inconsistente';
        }
      }

      const actualLiters = Number.isFinite(g.actualLiters) && g.actualLiters > 0 ? g.actualLiters : 0;
      const dailyActualKmL = Number.isFinite(kmDriven) && kmDriven > 0 && actualLiters > 0
        ? kmDriven / actualLiters
        : NaN;

      if (Number.isFinite(dailyActualKmL) && dailyActualKmL > 0) {
        weightedDistance += kmDriven;
        weightedLiters += actualLiters;
        rollingAvgKmL = weightedDistance / weightedLiters;
      }

      // Em dia com abastecimento, mostramos o KM/L calculado pelo próprio dia.
      // Em dia sem abastecimento, usamos a média progressiva do veículo.
      const referenceKmL = Number.isFinite(dailyActualKmL) && dailyActualKmL > 0
        ? Number(dailyActualKmL.toFixed(2))
        : (Number.isFinite(rollingAvgKmL) && rollingAvgKmL > 0 ? Number(rollingAvgKmL.toFixed(2)) : NaN);

      let estimatedConsumption = NaN;
      if (Number.isFinite(kmDriven) && kmDriven > 0 && Number.isFinite(referenceKmL) && referenceKmL > 0) {
        estimatedConsumption = kmDriven / referenceKmL;
      }

      // Para o primeiro dia do histórico, o saldo inicial é uma convenção de 0 L,
      // pois não existe no arquivo um estoque anterior informado.
      const openingBalance = balanceKnown ? balance : 0;
      let closingBalance = NaN;

      if (Number.isFinite(estimatedConsumption) || actualLiters > 0) {
        closingBalance = openingBalance + actualLiters - (Number.isFinite(estimatedConsumption) ? estimatedConsumption : 0);
        balance = closingBalance;
        balanceKnown = true;
      }

      let dailyStatus = status;
      if (!Number.isFinite(referenceKmL) && Number.isFinite(kmDriven)) {
        dailyStatus = 'Sem média de KM/L';
      }
      if (Number.isFinite(closingBalance) && closingBalance < -0.01) {
        dailyStatus = 'Saldo negativo';
      } else if (dailyStatus === 'Calculado' && Number.isFinite(estimatedConsumption)) {
        dailyStatus = actualLiters > 0 ? 'Calculado' : 'Estimado pela média';
      }

      result.push({
        vehicle,
        dateKey: g.dateKey,
        date: g.date,
        start: first?.date || null,
        end: last?.date || null,
        kmInitial,
        kmFinal,
        kmDriven,
        totalValue: g.totalValue,
        // Este campo é abastecimento REAL (valor informado ÷ preço do litro).
        actualLiters,
        // Mantemos liters por compatibilidade com gráficos/rotinas existentes.
        liters: actualLiters,
        refuels: rows.length,
        dailyActualKmL,
        referenceKmL,
        estimatedConsumption,
        openingBalance,
        closingBalance,
        // KM/L exibido na tabela: real quando houve abastecimento; média quando não houve.
        kmPerLiter: referenceKmL,
        litersPer100: Number.isFinite(referenceKmL) && referenceKmL > 0 ? 100 / referenceKmL : NaN,
        status: dailyStatus
      });
    }
  }

  return result.sort((a, b) => a.date - b.date || a.vehicle.localeCompare(b.vehicle));
}

function summarizeConsumption(dailyRows) {
  // Distância do KPI considera todos os dias com início/fim válidos,
  // inclusive dias em que não houve abastecimento.
  const distanceValid = dailyRows.filter(r =>
    Number.isFinite(r.kmDriven) && r.kmDriven > 0
  );

  // A média de KM/L continua baseada somente nos dias em que existe
  // combustível realmente abastecido, para não transformar estimativas
  // em abastecimento real.
  const fuelValid = distanceValid.filter(r =>
    Number.isFinite(r.actualLiters) && r.actualLiters > 0
  );

  const totalValue = dailyRows.reduce(
    (sum, r) => sum + (Number.isFinite(r.totalValue) ? r.totalValue : 0),
    0
  );

  const totalLiters = dailyRows.reduce(
    (sum, r) => sum + (Number.isFinite(r.actualLiters) ? r.actualLiters : 0),
    0
  );

  const totalDistance = distanceValid.reduce((sum, r) => sum + r.kmDriven, 0);
  const fuelDistance = fuelValid.reduce((sum, r) => sum + r.kmDriven, 0);
  const fuelLiters = fuelValid.reduce((sum, r) => sum + r.actualLiters, 0);

  return {
    totalValue,
    totalLiters,
    totalDistance,
    avgKmL: fuelLiters > 0 ? fuelDistance / fuelLiters : NaN,
    validDays: distanceValid.length,
    fuelValidDays: fuelValid.length,
    incompleteDays: dailyRows.length - distanceValid.length,
    totalDays: dailyRows.length
  };
}

function monthLabel(k) {
  if (!k || !/^\d{4}-\d{2}$/.test(k)) return k || 'Sem data';

  const [y, m] = k.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return `${names[Number(m) - 1]}/${y}`;
}

function make(id, name, type, labels, data, label, indexAxis) {
  destroy(name);

  const canvas = $(id);
  if (!canvas) return;

  const isDoughnut = type === 'doughnut';

  S.charts[name] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderWidth: type === 'line' ? 2 : 1,
        tension: type === 'line' ? 0.28 : 0,
        fill: false,
        pointRadius: type === 'line' ? 2.5 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      indexAxis: indexAxis || 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: isDoughnut, position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const value = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
              const lname = String(name).toLowerCase();

              if (lname.includes('value')) return `${ctx.dataset.label}: ${money(value)}`;
              if (lname.includes('liters')) return `${ctx.dataset.label}: ${fmt(value)} L`;
              if (lname.includes('kml') || lname.includes('consumption')) return `${ctx.dataset.label}: ${fmt(value)} km/L`;

              return `${ctx.dataset.label}: ${fmt(value)}`;
            }
          }
        }
      },
      scales: isDoughnut ? {} : {
        x: { beginAtZero: true, ticks: { autoSkip: true, maxTicksLimit: 14 } },
        y: { beginAtZero: true, ticks: { autoSkip: true, maxTicksLimit: 14 } }
      }
    }
  });
}

function update() {
  apply();

  const f = S.filteredFuel;
  const l = S.filteredLog;
  const daily = S.filteredDaily;
  const summary = summarizeConsumption(daily);

  $('value').textContent = money(summary.totalValue);
  $('liters').textContent = summary.totalLiters > 0 ? `${fmt(summary.totalLiters)} L` : '—';
  $('refuels').textContent = f.length.toLocaleString('pt-BR');
  $('logCount').textContent = l.length.toLocaleString('pt-BR');
  $('distance').textContent = fmt(summary.totalDistance) + ' km';
  $('kml').textContent = fmt(summary.avgKmL);

  const dates = f.filter(r => r.date).map(r => r.date).sort((a, b) => a - b);
  $('period').textContent = dates.length
    ? `${dateTime(dates[0])} → ${dateTime(dates[dates.length - 1])}`
    : '—';

  const monthValue = {};
  const monthLiters = {};
  const monthDistance = {};
  const vehicleValue = {};
  const vehicleLiters = {};
  const vehicleDistance = {};
  const weekday = {};

  f.forEach(r => {
    const m = r.date
      ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`
      : 'Sem data';

    monthValue[m] = (monthValue[m] || 0) + (Number.isFinite(r.value) ? r.value : 0);
    monthLiters[m] = (monthLiters[m] || 0) + (Number.isFinite(r.liters) ? r.liters : 0);

    vehicleValue[r.vehicle] = (vehicleValue[r.vehicle] || 0) + (Number.isFinite(r.value) ? r.value : 0);
    vehicleLiters[r.vehicle] = (vehicleLiters[r.vehicle] || 0) + (Number.isFinite(r.liters) ? r.liters : 0);

    const w = r.date
      ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][r.date.getDay()]
      : 'Sem data';

    weekday[w] = (weekday[w] || 0) + 1;
  });

  daily.forEach(r => {
    if (Number.isFinite(r.kmDriven) && r.kmDriven > 0) {
      const m = r.dateKey.slice(0, 7);
      monthDistance[m] = (monthDistance[m] || 0) + r.kmDriven;
      vehicleDistance[r.vehicle] = (vehicleDistance[r.vehicle] || 0) + r.kmDriven;
    }
  });

  const sortedValue = Object.keys(monthValue).sort();
  make(
    'monthValue',
    'monthValue',
    'bar',
    sortedValue.map(monthLabel),
    sortedValue.map(k => monthValue[k]),
    'Valor abastecido'
  );

  const sortedLiters = Object.keys(monthLiters).sort();
  make(
    'monthLiters',
    'monthLiters',
    'line',
    sortedLiters.map(monthLabel),
    sortedLiters.map(k => monthLiters[k]),
    'Litros calculados'
  );

  make('vehicleValue', 'vehicleValue', 'doughnut',
    Object.keys(vehicleValue),
    Object.values(vehicleValue),
    'Valor abastecido'
  );

  make('vehicleLiters', 'vehicleLiters', 'bar',
    Object.keys(vehicleLiters),
    Object.values(vehicleLiters),
    'Litros calculados'
  );

  make('distanceVehicle', 'distanceVehicle', 'bar',
    Object.keys(vehicleDistance),
    Object.values(vehicleDistance),
    'KM rodados'
  );

  const vehicleKml = {};
  Object.keys(vehicleDistance).forEach(vehicle => {
    const valid = daily.filter(r =>
      r.vehicle === vehicle &&
      Number.isFinite(r.kmDriven) &&
      r.kmDriven > 0 &&
      Number.isFinite(r.liters) &&
      r.liters > 0
    );

    const dist = valid.reduce((sum, r) => sum + r.kmDriven, 0);
    const liters = valid.reduce((sum, r) => sum + r.liters, 0);

    if (liters > 0) vehicleKml[vehicle] = dist / liters;
  });

  make('kmlVehicle', 'kmlVehicle', 'bar',
    Object.keys(vehicleKml),
    Object.values(vehicleKml),
    'KM/L'
  );

  const dailyValid = daily.filter(r =>
    Number.isFinite(r.kmPerLiter) &&
    Number.isFinite(r.kmDriven) &&
    r.kmDriven > 0
  );

  make(
    'dailyConsumption',
    'dailyConsumption',
    'line',
    dailyValid.map(r => `${r.vehicle} · ${new Date(`${r.dateKey}T12:00:00`).toLocaleDateString('pt-BR')}`),
    dailyValid.map(r => r.kmPerLiter),
    'Consumo diário (KM/L)'
  );

  make(
    'dailyDistance',
    'dailyDistance',
    'bar',
    dailyValid.map(r => `${r.vehicle} · ${new Date(`${r.dateKey}T12:00:00`).toLocaleDateString('pt-BR')}`),
    dailyValid.map(r => r.kmDriven),
    'KM rodados no dia'
  );

  const statuses = {};
  const cities = {};

  l.forEach(r => {
    statuses[r._status] = (statuses[r._status] || 0) + 1;
    cities[r._city] = (cities[r._city] || 0) + 1;
  });

  const topCities = Object.entries(cities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  make('chartStatus', 'chartStatus', 'bar',
    Object.keys(statuses).slice(0, 20),
    Object.values(statuses).slice(0, 20),
    'Registros',
    'y'
  );

  make('city', 'city', 'bar',
    topCities.map(x => x[0]),
    topCities.map(x => x[1]),
    'Registros',
    'y'
  );

  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  make('weekday', 'weekday', 'bar',
    days,
    days.map(d => weekday[d] || 0),
    'Abastecimentos'
  );

  const dailyRowsForTable = daily
    .slice()
    .sort((a, b) => b.date - a.date || a.vehicle.localeCompare(b.vehicle));

  $('dailyTable').innerHTML = dailyRowsForTable.map(r => {
    const statusClass = r.status === 'Saldo negativo' ? 'daily-alert' : (r.status === 'Calculado' || r.status === 'Estimado pela média' ? 'daily-ok' : 'daily-warn');
    const statusText = r.status;

    return `<tr>
      <td>${new Date(`${r.dateKey}T12:00:00`).toLocaleDateString('pt-BR')}</td>
      <td>${escapeHtml(r.vehicle)}</td>
      <td>${r.start ? escapeHtml(dateTime(r.start)) : '—'}</td>
      <td>${Number.isFinite(r.kmInitial) ? r.kmInitial.toLocaleString('pt-BR') : '—'}</td>
      <td>${r.end ? escapeHtml(dateTime(r.end)) : '—'}</td>
      <td>${Number.isFinite(r.kmFinal) ? r.kmFinal.toLocaleString('pt-BR') : '—'}</td>
      <td><strong>${Number.isFinite(r.kmDriven) ? fmt(r.kmDriven) + ' km' : '—'}</strong></td>
      <td>${money(r.totalValue)}</td>
      <td>${Number.isFinite(r.actualLiters) && r.actualLiters > 0 ? fmt(r.actualLiters) + ' L' : '0 L'}</td>
      <td><strong>${Number.isFinite(r.referenceKmL) ? fmt(r.referenceKmL) + ' km/L' : '—'}</strong></td>
      <td>${Number.isFinite(r.estimatedConsumption) ? fmt(r.estimatedConsumption) + ' L' : '—'}</td>
      <td>${Number.isFinite(r.openingBalance) ? fmt(r.openingBalance) + ' L' : '—'}</td>
      <td><strong>${Number.isFinite(r.closingBalance) ? fmt(r.closingBalance) + ' L' : '—'}</strong></td>
      <td><span class="${statusClass}">${escapeHtml(statusText)}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="14">Nenhum dia encontrado.</td></tr>';


  $('fuelTable').innerHTML = f
    .slice()
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 300)
    .map(r => {
      const litersText = Number.isFinite(r.liters) ? `${fmt(r.liters)} L` : '—';

      return `<tr>
        <td>${r.dateText}</td>
        <td>${escapeHtml(r.vehicle)}</td>
        <td>${money(r.value)}</td>
        <td>${money(FUEL_PRICE_PER_LITER)}</td>
        <td>${litersText}</td>
        <td>${Number.isFinite(r.km) ? r.km.toLocaleString('pt-BR') : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">Nenhum registro.</td></tr>';

  const first = l[0] || {};
  const keys = Object.keys(first).filter(k => !k.startsWith('_')).slice(0, 8);

  $('logHead').innerHTML = keys.map(k => `<th>${escapeHtml(k)}</th>`).join('');
  $('logTable').innerHTML = l.slice(0, 100).map(r =>
    `<tr>${keys.map(k => `<td>${escapeHtml(String(r[k] ?? ''))}</td>`).join('')}</tr>`
  ).join('');

  const incompleteNote = summary.incompleteDays
    ? `${summary.validDays} dia(s) calculado(s) · ${summary.incompleteDays} dia(s) sem par inicial/final`
    : `${summary.validDays} dia(s) calculado(s)`;

  $('distance').title = incompleteNote;
  $('kml').title = `Consumo médio calculado apenas com dias completos. ${incompleteNote}`;
}

function normalizeText(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\b(LTDA|EIRELI|ME|EPP|S A|SA|INDUSTRIA|INDUSTRIAL|COMERCIO|DO|DA|DE|DOS|DAS|BRASIL)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean));
  const B = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / new Set([...A, ...B]).size;
}

function isGoodAddress(addr) {
  const value = String(addr || '').trim();
  if (!value) return false;
  if (value.toLowerCase() === 'endereço não encontrado') return false;
  // Evita tratar uma cidade isolada como endereço válido.
  if (value.length < 8) return false;
  if (!/\d/.test(value) && !/\bS\/?N\b/i.test(value) && !/\bKM\b/i.test(value)) return false;
  return true;
}

function manualKey(code) { return normalizeCode(code); }

function loadManualAddresses() {
  try {
    S.manualAddresses = JSON.parse(localStorage.getItem('pharmainox_manual_addresses_v1') || '{}') || {};
  } catch {
    S.manualAddresses = {};
  }
}

function saveManualAddresses() {
  try {
    localStorage.setItem('pharmainox_manual_addresses_v1', JSON.stringify(S.manualAddresses));
  } catch {
    toast('O navegador não permitiu salvar os endereços neste computador.');
  }
}

function getManualAddress(code) {
  const item = S.manualAddresses[manualKey(code)];
  return item && isGoodAddress(item.endereco) ? item : null;
}

function resolveSupplier(code, name) {
  const manual = getManualAddress(code);
  if (manual) return { state: 'ok', entry: manual, source: 'manual' };

  const entries = window.FORNECEDORES?.[normalizeCode(code)] || [];
  if (!entries.length) return { state: 'not-found', entry: null };

  const valid = entries.filter(e => isGoodAddress(e.endereco));
  if (!valid.length) return { state: 'missing-address', entry: null };

  const uniqueAddresses = [...new Map(valid.map(e => [normalizeText(e.endereco), e])).values()];
  if (uniqueAddresses.length === 1) return { state: 'ok', entry: uniqueAddresses[0], source: 'base' };

  const ranked = uniqueAddresses
    .map(e => ({ e, score: similarity(name, e.nome) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 0.08 || (second && top.score - second.score < 0.05)) {
    return { state: 'ambiguous', entry: top?.e || null, candidates: ranked.map(x => x.e) };
  }
  return { state: 'ok', entry: top.e, source: 'base' };
}

function groupRouteStops(dateKey) {
  // REGRA OFICIAL DA ROTA:
  // 1) Data vem exclusivamente de AGENDAMENTO (V).
  // 2) Pedidos com TIPO = COLETA ou ENTREGA entram na rota; RECEBIMENTO fica fora.
  const rows = S.log.filter(r => key(r._scheduleDate) === dateKey && isRouteType(r._type));
  const grouped = new Map();

  rows.forEach(r => {
    const code = normalizeCode(r._supplierCode);
    const groupKey = code || `NOME:${normalizeText(r._supplierName)}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        supplierCode: code,
        supplierName: r._supplierName,
        city: r._city,
        buyerSet: new Set(),
        orderSet: new Set(),
        rows: []
      });
    }
    const g = grouped.get(groupKey);
    g.rows.push(r);
    if (r._buyer && r._buyer !== 'Não informado') g.buyerSet.add(r._buyer);
    if (r._order) g.orderSet.add(r._order);
    if ((!g.supplierName || g.supplierName === 'Não informado') && r._supplierName) g.supplierName = r._supplierName;
  });

  return [...grouped.values()].map(g => {
    const resolved = resolveSupplier(g.supplierCode, g.supplierName);
    return {
      ...g,
      buyers: [...g.buyerSet],
      orders: [...g.orderSet],
      resolution: resolved
    };
  });
}

const PHARMAINNOX = {
  lat: -22.6859629,
  lng: -46.9777794,
  nome: 'Pharmainox',
  endereco: 'R. Maranhão, 2300 - Lot. São Pedro, Jaguariúna - SP, 13912-812'
};

function initMap() {
  if (S.map) return;
  S.map = L.map('routeMap', { zoomControl: true, scrollWheelZoom: true }).setView([PHARMAINNOX.lat, PHARMAINNOX.lng], 10);
  L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: 'OpenFreeMap · © OpenMapTiles · Data from OpenStreetMap contributors'
  }).addTo(S.map);
  S.markersLayer = L.layerGroup().addTo(S.map);
  S.routeLayer = L.layerGroup().addTo(S.map);
}

function clearMap() {
  initMap();
  S.markersLayer.clearLayers();
  S.routeLayer.clearLayers();
}

function markerIcon(label, isOrigin = false) {
  return L.divIcon({
    className: 'route-marker-wrap',
    html: `<div class="route-marker ${isOrigin ? 'origin' : ''}">${escapeHtml(label)}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function cacheKeyForGeo(address) {
  return normalizeText(address).replace(/\s+/g, ' ');
}

function loadGeoCache() {
  try { S.geocodeCache = JSON.parse(localStorage.getItem('pharmainox_geo_cache_v1') || '{}') || {}; }
  catch { S.geocodeCache = {}; }
}

function saveGeoCache() {
  try { localStorage.setItem('pharmainox_geo_cache_v1', JSON.stringify(S.geocodeCache)); } catch {}
}

let lastNominatimRequest = 0;
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocodeAddress(address, fallbackCity = '') {
  const full = [address, fallbackCity].filter(Boolean).join(', ');
  const keyCache = cacheKeyForGeo(full);
  if (S.geocodeCache[keyCache]) return S.geocodeCache[keyCache];

  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
  if (wait) await sleep(wait);
  lastNominatimRequest = Date.now();

  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    format: 'jsonv2',
    q: `${full}, Brasil`,
    countrycodes: 'br',
    limit: '1',
    addressdetails: '1'
  });

  const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
  if (!res.ok) throw new Error(`Geocodificação HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;

  const result = { lat: Number(data[0].lat), lng: Number(data[0].lon), displayName: data[0].display_name || full };
  if (Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
    S.geocodeCache[keyCache] = result;
    saveGeoCache();
    return result;
  }
  return null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function safeId(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function googleDirectionsUrl(orderedStops) {
  if (!orderedStops.length || orderedStops.length > 23) return '';
  const origin = `${PHARMAINNOX.lat},${PHARMAINNOX.lng}`;
  const destination = origin;
  const waypoints = orderedStops.map(s => `${s.lat},${s.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving&waypoints=${encodeURIComponent(waypoints)}`;
}

async function calculateRoute(points) {
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  if (points.length < 2) return null;
  const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&destination=first&roundtrip=true&steps=false&geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Roteamento HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.trips?.length) throw new Error(data.message || 'Não foi possível calcular a rota.');
  data.waypoints?.forEach((wp, i) => {
    const p = points[i];
    if (p) p._waypointIndex = Number.isFinite(wp.waypoint_index) ? wp.waypoint_index : i;
  });
  const orderedFinal = points.slice().sort((a, b) => (a._waypointIndex ?? 0) - (b._waypointIndex ?? 0));
  return { trip: data.trips[0], ordered: orderedFinal };
}

function routeIssueLabel(state) {
  if (state === 'missing-address') return 'Endereço não cadastrado';
  if (state === 'ambiguous') return 'Mais de um endereço';
  if (state === 'geocode-failed') return 'Endereço não localizado no mapa';
  return 'Fornecedor não localizado';
}

function renderRouteIssues(groupedRows) {
  const issues = groupedRows.filter(s => s.resolution.state !== 'ok');
  if (!issues.length) {
    $('routeIssues').innerHTML = '<div class="route-success">✓ Todos os fornecedores do dia estão com endereço pronto para o mapa.</div>';
    return;
  }

  const rows = issues.map(s => {
    const code = s.supplierCode || '';
    const id = `addr_${safeId(code || s.supplierName)}`;
    const manual = getManualAddress(code);
    const current = manual?.endereco || '';
    return `
      <div class="route-issue route-issue-editable">
        <div class="route-issue-main">
          <b>${escapeHtml(s.supplierName)}</b>
          <small>Código ${escapeHtml(code || 'não informado')} · ${escapeHtml(s.city)}</small>
          <small>Status: ${escapeHtml(routeIssueLabel(s.resolution.state))}</small>
        </div>
        <div class="route-address-editor">
          <input id="${id}" type="text" value="${escapeHtml(current)}" placeholder="Digite o endereço completo...">
          <button class="button secondary mini-button" onclick="saveRouteAddress('${escapeHtml(code)}','${id}','${escapeHtml(s.city)}')">Salvar endereço</button>
        </div>
      </div>`;
  }).join('');

  $('routeIssues').innerHTML = `<div class="route-issues-title">Pendências de endereço — você pode cadastrar aqui</div>${rows}`;
}

function renderStopsList(ordered) {
  const cards = ordered.map((s, i) => {
    const buyer = s.buyers.length ? s.buyers.join(', ') : '—';
    const orders = s.orders.length ? s.orders.join(', ') : '—';
    const source = s.resolution?.source === 'manual' ? ' · endereço manual' : '';
    return `<div class="route-stop"><div class="stop-number">${i + 1}</div><div class="stop-content"><strong>${escapeHtml(s.supplierName)}</strong><span>Cód. ${escapeHtml(s.supplierCode || '—')} · ${escapeHtml(s.city)}${escapeHtml(source)}</span><span>Comprador: ${escapeHtml(buyer)}</span><span>Pedido(s): ${escapeHtml(orders)}</span><small>${escapeHtml(s.address)}</small></div></div>`;
  }).join('');
  $('routeStopsList').innerHTML = cards || '<div class="empty-route">Nenhuma parada com endereço confirmado neste dia.</div>';
}

async function renderRoute() {
  const runId = ++S.routeRunId;
  const dateKey = $('routeDate').value;
  clearMap();
  $('openGoogleRoute').disabled = true;
  $('openGoogleRoute').onclick = null;

  if (!dateKey) {
    $('routeTitle').textContent = 'Mapa da rota';
    $('routeBadge').textContent = 'Aguardando data';
    $('routeOrders').textContent = '0';
    $('routeStops').textContent = '0';
    $('routeFound').textContent = '0';
    $('routeMissing').textContent = '0';
    $('routeDistance').textContent = '—';
    $('routeDuration').textContent = '—';
    $('routeStopsList').innerHTML = '<div class="empty-route">Selecione um dia para montar a rota.</div>';
    $('routeIssues').innerHTML = '';
    return;
  }

  const grouped = groupRouteStops(dateKey);
  const baseValid = grouped.filter(s => s.resolution.state === 'ok');
  // Contagem da rota: somente linhas com AGENDAMENTO na data e TIPO = COLETA ou ENTREGA.
  const scheduledRows = S.log.filter(r => key(r._scheduleDate) === dateKey && isRouteType(r._type));
  const uniqueOrders = new Set(scheduledRows.map(r => r._order).filter(Boolean));
  const ordersCount = uniqueOrders.size || scheduledRows.length;

  $('routeTitle').textContent = `Mapa da rota · ${new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR')}`;
  $('routeBadge').textContent = `${grouped.length} fornecedor(es) na rota`;
  $('routeOrders').textContent = ordersCount.toLocaleString('pt-BR');
  $('routeStops').textContent = grouped.length.toLocaleString('pt-BR');
  $('routeFound').textContent = baseValid.length.toLocaleString('pt-BR');
  $('routeMissing').textContent = (grouped.length - baseValid.length).toLocaleString('pt-BR');
  renderRouteIssues(grouped);

  if (!baseValid.length) {
    renderStopsList([]);
    return;
  }

  $('routeBadge').textContent = 'Localizando endereços…';
  const geoPoints = [];

  for (const s of baseValid) {
    if (runId !== S.routeRunId) return;
    try {
      const address = s.resolution.entry.endereco;
      const city = s.resolution.entry.cidade || s.city;
      const geo = await geocodeAddress(address, city);
      if (geo) {
        geoPoints.push({
          ...s,
          address,
          lat: geo.lat,
          lng: geo.lng,
          geocodeName: geo.displayName
        });
      } else {
        s.resolution.state = 'geocode-failed';
      }
    } catch (e) {
      console.warn('Geocode falhou', s.supplierName, e);
      s.resolution.state = 'geocode-failed';
    }
  }

  if (runId !== S.routeRunId) return;
  $('routeFound').textContent = geoPoints.length.toLocaleString('pt-BR');
  $('routeMissing').textContent = (grouped.length - geoPoints.length).toLocaleString('pt-BR');
  renderRouteIssues(grouped);

  const points = [{ ...PHARMAINNOX, isOrigin: true }, ...geoPoints];
  let ordered = geoPoints.slice();
  let trip = null;

  try {
    if (points.length > 1) {
      const calc = await calculateRoute(points);
      if (runId !== S.routeRunId) return;
      trip = calc.trip;
      ordered = calc.ordered.filter(p => !p.isOrigin);
      $('routeDistance').textContent = formatDistance(trip.distance);
      $('routeDuration').textContent = formatDuration(trip.duration);
      $('routeBadge').textContent = 'Rota calculada';
    }
  } catch (e) {
    console.error(e);
    $('routeBadge').textContent = 'Rota não calculada';
    $('routeDistance').textContent = '—';
    $('routeDuration').textContent = '—';
    toast('Não foi possível calcular a rota automaticamente. Os pontos encontrados continuam disponíveis no mapa.');
  }

  const orderedForMarkers = ordered.length ? ordered : geoPoints;
  renderStopsList(orderedForMarkers);

  clearMap();
  const bounds = [];
  L.marker([PHARMAINNOX.lat, PHARMAINNOX.lng], { icon: markerIcon('P', true) })
    .bindPopup(`<b>Pharmainox</b><br>${escapeHtml(PHARMAINNOX.endereco)}`)
    .addTo(S.markersLayer);
  bounds.push([PHARMAINNOX.lat, PHARMAINNOX.lng]);

  orderedForMarkers.forEach((s, idx) => {
    L.marker([s.lat, s.lng], { icon: markerIcon(String(idx + 1), false) })
      .bindPopup(`<b>${escapeHtml(s.supplierName)}</b><br>Cód. ${escapeHtml(s.supplierCode)}<br>${escapeHtml(s.address)}<br>Pedido(s): ${escapeHtml(s.orders.join(', ') || '—')}`)
      .addTo(S.markersLayer);
    bounds.push([s.lat, s.lng]);
  });

  if (trip?.geometry?.coordinates?.length) {
    const latlngs = trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(latlngs, { weight: 5, opacity: 0.82 }).addTo(S.routeLayer);
    latlngs.forEach(p => bounds.push(p));
  } else if (orderedForMarkers.length) {
    const latlngs = [[PHARMAINNOX.lat, PHARMAINNOX.lng], ...orderedForMarkers.map(s => [s.lat, s.lng]), [PHARMAINNOX.lat, PHARMAINNOX.lng]];
    L.polyline(latlngs, { weight: 4, dashArray: '8 8', opacity: 0.7 }).addTo(S.routeLayer);
  }

  if (bounds.length) S.map.fitBounds(bounds, { padding: [25, 25] });
  setTimeout(() => S.map.invalidateSize(), 150);

  const googleUrl = googleDirectionsUrl(orderedForMarkers);
  if (googleUrl) {
    $('openGoogleRoute').disabled = false;
    $('openGoogleRoute').onclick = () => window.open(googleUrl, '_blank', 'noopener,noreferrer');
  }
}

function populateRouteDate() {
  // O seletor de dia da rota mostra apenas datas de AGENDAMENTO
  // que possuem pelo menos um pedido com TIPO = COLETA ou ENTREGA.
  const dates = [...new Set(
    S.log
      .filter(r => isRouteType(r._type))
      .map(r => key(r._scheduleDate))
      .filter(Boolean)
  )].sort();
  if (!dates.length) {
    $('routeDate').value = '';
    return;
  }
  const current = $('routeDate').value;
  if (current && dates.includes(current)) return;
  const today = key(new Date());
  $('routeDate').value = dates.includes(today) ? today : dates[dates.length - 1];
}

function saveRouteAddress(code, inputId, fallbackCity) {
  const address = $(inputId)?.value.trim();
  if (!address) {
    toast('Digite um endereço antes de salvar.');
    return;
  }
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    toast('Este fornecedor está sem código. Para cadastrar manualmente, precisamos do código.');
    return;
  }
  S.manualAddresses[manualKey(normalizedCode)] = {
    endereco: address,
    cidade: fallbackCity || '',
    origem: 'manual'
  };
  saveManualAddresses();
  toast(`Endereço salvo para o fornecedor ${normalizedCode}.`);
  renderRoute();
}
window.saveRouteAddress = saveRouteAddress;

function exportManualAddresses() {
  const blob = new Blob([JSON.stringify(S.manualAddresses, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'enderecos_manuais_pharmainox.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importManualAddresses(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj || typeof obj !== 'object') throw new Error('Formato inválido');
      S.manualAddresses = { ...S.manualAddresses, ...obj };
      saveManualAddresses();
      toast('Endereços manuais importados.');
      renderRoute();
    } catch {
      toast('Não foi possível importar o arquivo de endereços.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function clearManualAddresses() {
  const count = Object.keys(S.manualAddresses).length;
  if (!count) {
    toast('Não há endereços manuais salvos.');
    return;
  }
  if (!confirm(`Excluir os ${count} endereços manuais salvos neste navegador?`)) return;
  S.manualAddresses = {};
  saveManualAddresses();
  toast('Endereços manuais removidos.');
  renderRoute();
}

document.addEventListener('DOMContentLoaded', () => {
  // Fontes separadas: placas/veículos e pedidos/logística.
  $('fuelFiles').addEventListener('change', e => {
    S.fuelFiles = [...e.target.files];
    $('fuelFileList').innerHTML = S.fuelFiles.map(f => `<span class="chip source-fuel">${escapeHtml(f.name)}</span>`).join('');
    $('status').textContent = `${S.fuelFiles.length} arquivo(s) de placas e ${S.logFiles?.length || 0} arquivo(s) de pedidos selecionados.`;
  });

  $('logFiles').addEventListener('change', e => {
    S.logFiles = [...e.target.files];
    $('logFileList').innerHTML = S.logFiles.map(f => `<span class="chip source-log">${escapeHtml(f.name)}</span>`).join('');
    $('status').textContent = `${S.fuelFiles?.length || 0} arquivo(s) de placas e ${S.logFiles.length} arquivo(s) de pedidos selecionados.`;
  });

  $('update').addEventListener('click', async () => {
    const fuelFiles = S.fuelFiles || [];
    const logFiles = S.logFiles || [];
    if (!fuelFiles.length || !logFiles.length) {
      toast('Adicione pelo menos 1 arquivo de placas e 1 arquivo de pedidos.');
      return;
    }

    try {
      S.fuel = [];
      S.log = [];
      S.sources = { fuel: [], log: [] };

      // Os arquivos já vêm separados pela área de upload.
      // Não misturamos mais as fontes nem dependemos da identificação automática para cruzá-las.
      for (const file of fuelFiles) {
        const rows = await read(file);
        const type = sourceType(rows);
        if (type !== 'fuel') {
          throw new Error(`O arquivo "${file.name}" não parece ser uma base de placa/veículo.`);
        }
        const normalized = normalizeFuel(rows, file.name);
        S.fuel.push(...normalized);
        S.sources.fuel.push({ file: file.name, rows: normalized.length });
      }

      for (const file of logFiles) {
        const rows = await read(file);
        const type = sourceType(rows);
        if (type !== 'log') {
          throw new Error(`O arquivo "${file.name}" não parece ser uma base de pedidos/logística.`);
        }
        const normalized = normalizeLog(rows);
        S.log.push(...normalized);
        S.sources.log.push({ file: file.name, rows: normalized.length });
      }

      const unknownFiles = [];

      // Evita somar a mesma linha duas vezes quando a exportação vier duplicada.
      const seen = new Set();

      S.fuel = S.fuel.filter(r => {
        const signature = [
          r.date?.getTime() || '',
          r.vehicle,
          r.km,
          Number.isFinite(r.value) ? r.value.toFixed(2) : ''
        ].join('|');

        if (seen.has(signature)) return false;

        seen.add(signature);
        return true;
      });

      $('fuelFileList').innerHTML = S.sources.fuel.map(x => `<span class="chip source-fuel">${escapeHtml(x.file)} · ${x.rows.toLocaleString('pt-BR')} registros</span>`).join('');
      $('logFileList').innerHTML = S.sources.log.map(x => `<span class="chip source-log">${escapeHtml(x.file)} · ${x.rows.toLocaleString('pt-BR')} registros</span>`).join('');

      const vehicles = [...new Set(S.fuel.map(r => r.vehicle))].sort();

      $('vehicle').innerHTML =
        '<option value="todos">Todos</option>' +
        vehicles.map(v => `<option>${escapeHtml(v)}</option>`).join('');

      populateRouteDate();
      update();

      await renderRoute();

      const scheduled = S.log.filter(
        r => r._scheduleDate && isRouteType(r._type)
      ).length;

      const sourceText = [
        ...S.sources.fuel.map(x => `Placas: ${x.file} (${x.rows} registros)`),
        ...S.sources.log.map(x => `Pedidos: ${x.file} (${x.rows} registros)`)
      ].join(' · ');

      toast(
        `Atualizado. ${sourceText || 'Nenhuma fonte identificada.'} · ` +
        `Rota: ${scheduled} registros com AGENDAMENTO em COLETA/ENTREGA.`
      );

    } catch (e) {
      console.error(e);
      toast('Não foi possível ler algum arquivo. Verifique o formato CSV/XLSX.');
    }
  });

  ['year', 'vehicle', 'start', 'end'].forEach(id => $(id).addEventListener('change', update));
  $('routeDate').addEventListener('change', renderRoute);
  $('routeRefresh').addEventListener('click', renderRoute);
  $('exportManualAddresses').addEventListener('click', exportManualAddresses);
  $('importManualAddresses').addEventListener('click', () => $('manualAddressFile').click());
  $('manualAddressFile').addEventListener('change', e => { if (e.target.files[0]) importManualAddresses(e.target.files[0]); e.target.value = ''; });
  $('clearManualAddresses').addEventListener('click', clearManualAddresses);

  $('clear').addEventListener('click', () => {
    $('year').value = 'todos';
    $('vehicle').value = 'todos';
    $('start').value = '';
    $('end').value = '';
    update();
  });

  $('export').addEventListener('click', () => {
    const rows = S.filteredFuel.map(r => ({
      Data: r.dateText,
      Veiculo: r.vehicle,
      Valor: r.value,
      PrecoPorLitro: Number.isFinite(r.price) ? r.price : '',
      Litros: Number.isFinite(r.liters) ? r.liters : '',
      KM: r.km
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Abastecimento');
    XLSX.writeFile(wb, 'abastecimentos_filtrados.xlsx');
  });

  loadManualAddresses();
  loadGeoCache();
  initMap();
  update();
});
