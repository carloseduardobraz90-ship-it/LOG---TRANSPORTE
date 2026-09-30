// Preço do combustível por ano.
// 2025 = R$ 6,49/L | 2026 = R$ 7,49/L
const FUEL_PRICES_PER_YEAR = {
  2025: 6.49,
  2026: 7.49
};

const DEFAULT_FUEL_PRICE_PER_LITER = 7.49;

function fuelPriceForDate(date) {
  const year = date instanceof Date && !isNaN(date)
    ? date.getFullYear()
    : null;

  return FUEL_PRICES_PER_YEAR[year] ?? DEFAULT_FUEL_PRICE_PER_LITER;
}

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
  cepCache: {},
  manualAddresses: {},
  routeOrderByDate: {},
  journey: [],
  filteredJourney: [],
  vehicleUploads: [],
  sources: { fuel: [], journey: [], log: [] }
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
  const keys = Object.keys(row);
  const normalizedTerms = terms.map(cleanKey);

  // Primeiro procura correspondência EXATA.
  // Isso evita que "veiculo" encontre, por exemplo,
  // "NA PHARMAINNOX ESSE VEICULO ESTA:" antes da coluna PLACA/VEICULO.
  for (const term of normalizedTerms) {
    const exact = keys.find(k => cleanKey(k) === term);
    if (exact !== undefined) return exact;
  }

  // Só depois faz a busca aproximada por parte do nome.
  for (const term of normalizedTerms) {
    const partial = keys.find(k => cleanKey(k).includes(term));
    if (partial !== undefined) return partial;
  }

  return undefined;
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

  const hasPlate = keys.some(k => k === 'placa' || k.includes('placa'));
  const hasVehicle = keys.some(k => k === 'veiculo' || k.includes('veiculo'));
  const hasKm = keys.some(k =>
    k === 'kilometragem' ||
    k === 'quilometragem' ||
    k.includes('quilometragem') ||
    k.includes('kilometragem') ||
    k.includes('km_incial') ||
    k.includes('km_inicial') ||
    k.includes('km_final')
  );
  const hasFuelValue = keys.some(k =>
    k === 'valor_total' ||
    k === 'valor_abastecido' ||
    k.includes('valor_total') ||
    k.includes('valor_abastecido')
  );
  const hasDate = keys.some(k =>
    k === 'data' ||
    k.includes('data e hora inicial e final') ||
    k.includes('data hora')
  );
  const hasCheckStatus = keys.some(k =>
    k.includes('na pharmainox esse veiculo esta') ||
    k.includes('veiculo esta')
  );

  const hasRouteSignals =
    keys.some(k => k === 'pedido_' || k === 'pedido' || k.includes('pedido')) &&
    keys.some(k => k === 'fornecedor' || k.includes('fornecedor')) &&
    (keys.some(k => k === 'agendamento' || k.includes('agendamento')) ||
     keys.some(k => k === 'tipo' || k.includes('tipo')));

  // Jornada / KM: PLACA + KILOMETRAGEM + DATA + campo de SAINDO/CHEGANDO.
  if (hasPlate && hasKm && hasDate && hasCheckStatus && !hasFuelValue) {
    return 'journey';
  }

  // Abastecimento: VEICULO + QUILOMETRAGEM + VALOR_TOTAL + DATA.
  if (hasVehicle && hasKm && hasFuelValue && hasDate) {
    return 'fuel';
  }

  if (hasRouteSignals) return 'log';
  return 'unknown';
}

function isFuel(rows) {
  return sourceType(rows) === 'fuel';
}

function isJourney(rows) {
  return sourceType(rows) === 'journey';
}

function fuelValueFromRow(r) {
  return number(get(r, [
    'valor_abastecido',
    'valor abastecido',
    'valor_total',
    'valor total'
  ]));
}

function vehicleFromRow(r, fileName, fallbackVehicle = '') {
  // O nome do arquivo NÃO identifica o veículo.
  // A identificação vem do conteúdo (PLACA/VEICULO).
  // fallbackVehicle representa apenas o campo/slot escolhido na tela.
  const internalVehicle = get(r, ['veiculo', 'placa']) || positional(r, 2);
  return String(internalVehicle || fallbackVehicle || 'Não identificado')
    .toUpperCase()
    .trim();
}

function normalizeFuel(rows, fileName, expectedVehicle = '') {
  return rows.map((r, idx) => {
    const d = parseDate(
      get(r, ['data e hora inicial e final', 'data', 'data hora', 'data/hora']) ||
      positional(r, 0)
    );

    const vehicle = vehicleFromRow(r, fileName, expectedVehicle);

    const km = mileage(
      get(r, [
        'km_incial x km_final',
        'km_inicial x km_final',
        'quilometragem',
        'quilometragem atual',
        'kilometragem',
        'km'
      ]) ||
      positional(r, 3)
    );

    const value = fuelValueFromRow(r);
    const price = fuelPriceForDate(d);

    const liters = Number.isFinite(value) && value > 0 && price > 0
      ? value / price
      : NaN;

    return {
      date: d,
      dateText: d ? d.toLocaleDateString('pt-BR') : '',
      vehicle,
      value,
      price,
      liters,
      km,
      sourceFile: fileName,
      sourceRow: idx + 2
    };
  }).filter(r => Number.isFinite(r.value) || Number.isFinite(r.km));
}

function journeyStatusFromRow(r) {
  return String(get(r, [
    'na pharmainox esse veiculo esta',
    'veiculo esta',
    'status'
  ]) || positional(r, 1) || '').trim();
}

function normalizeJourney(rows, fileName, expectedVehicle = '') {
  return rows.map((r, idx) => {
    const d = parseDate(get(r, ['data', 'data hora', 'data/hora']) || positional(r, 7));
    const vehicle = vehicleFromRow(r, fileName, expectedVehicle);
    const status = journeyStatusFromRow(r);
    const statusKey = cleanKey(status);
    const km = mileage(get(r, ['kilometragem', 'quilometragem', 'km atual', 'km']) || positional(r, 3));

    return {
      date: d,
      dateText: d ? d.toLocaleDateString('pt-BR') : '',
      vehicle,
      status,
      statusKey,
      km,
      sourceFile: fileName,
      sourceRow: idx + 2
    };
  }).filter(r =>
    r.date &&
    r.vehicle &&
    Number.isFinite(r.km) &&
    (r.statusKey === 'saindo' || r.statusKey === 'chegando')
  );
}

function valueFromVehicleField(row) {
  return String(get(row, ['placa', 'veiculo']) || positional(row, 2) || '').toUpperCase().trim();
}

function validateExpectedVehicle(rows, expectedVehicle) {
  const found = [...new Set(rows.map(valueFromVehicleField).filter(Boolean))];
  return {
    ok: found.length === 1 && found[0] === expectedVehicle,
    found
  };
}

function validateVehicleFile(rows, expectedVehicle, expectedType, fileName) {
  const type = sourceType(rows);

  if (type !== expectedType) {
    const labels = {
      journey: 'JORNADA / KM',
      fuel: 'ABASTECIMENTO'
    };
    throw new Error(
      `O conteúdo de "${fileName}" não corresponde ao campo ${labels[expectedType] || expectedType}. ` +
      'O nome do arquivo não é usado para identificar a categoria.'
    );
  }

  const check = validateExpectedVehicle(rows, expectedVehicle);

  if (!check.ok) {
    const found = check.found.length ? check.found.join(', ') : 'nenhuma placa/veículo encontrada';
    throw new Error(
      `O conteúdo selecionado para ${expectedVehicle} contém: ${found}. ` +
      'O veículo é identificado pelos dados internos do arquivo, não pelo nome.'
    );
  }
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
    const wb = XLSX.read(text, { type: 'string', FS: fs, raw: true });
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

  const inFilter = (date, vehicle = '') => {
    const k = key(date);
    return (y === 'todos' || date?.getFullYear() == y) &&
      (v === 'todos' || vehicle === v) &&
      (!start || k >= start) &&
      (!end || k <= end);
  };

  S.filteredFuel = S.fuel.filter(r => inFilter(r.date, r.vehicle));
  S.filteredJourney = S.journey.filter(r => inFilter(r.date, r.vehicle));
  S.filteredLog = S.log.filter(r => {
    const k = key(r._date);
    return (y === 'todos' || r._date?.getFullYear() == y) &&
      (!start || k >= start) &&
      (!end || k <= end);
  });

  S.filteredDaily = buildDailyMetrics(S.filteredJourney, S.filteredFuel);
}

function buildDailyMetrics(journeyRows, fuelRows) {
  const journeyClean = journeyRows
    .filter(r => r.date && r.vehicle && Number.isFinite(r.km))
    .slice()
    .sort((a, b) => a.date - b.date);

  const fuelByDay = new Map();
  fuelRows
    .filter(r => r.date && r.vehicle)
    .forEach(r => {
      const groupKey = `${r.vehicle}__${key(r.date)}`;
      if (!fuelByDay.has(groupKey)) {
        fuelByDay.set(groupKey, { totalValue: 0, liters: 0, refuels: 0 });
      }
      const g = fuelByDay.get(groupKey);
      if (Number.isFinite(r.value)) g.totalValue += r.value;
      if (Number.isFinite(r.liters)) g.liters += r.liters;
      g.refuels += 1;
    });

  const byDay = new Map();
  journeyClean.forEach(r => {
    const dateKey = key(r.date);
    const groupKey = `${r.vehicle}__${dateKey}`;
    if (!byDay.has(groupKey)) {
      byDay.set(groupKey, {
        vehicle: r.vehicle,
        dateKey,
        date: new Date(r.date),
        leaving: [],
        arriving: []
      });
    }
    const g = byDay.get(groupKey);
    if (r.statusKey === 'saindo') g.leaving.push(r);
    if (r.statusKey === 'chegando') g.arriving.push(r);
  });

  return [...byDay.values()]
    .map(g => {
      g.leaving.sort((a, b) => a.date - b.date);
      g.arriving.sort((a, b) => a.date - b.date);

      const start = g.leaving[0] || null;
      const end = g.arriving[g.arriving.length - 1] || null;

      const kmInitial = Number.isFinite(start?.km) ? start.km : NaN;
      const kmFinal = Number.isFinite(end?.km) ? end.km : NaN;
      let kmDriven = NaN;
      let status = 'Sem saída e chegada';

      if (!start && !end) {
        status = 'Sem saída e chegada';
      } else if (!start) {
        status = 'Sem registro de SAINDO';
      } else if (!end) {
        status = 'Sem registro de CHEGANDO';
      } else if (kmFinal < kmInitial) {
        status = 'KM inconsistente';
      } else {
        kmDriven = kmFinal - kmInitial;
        status = 'Calculado';
      }

      const fuel = fuelByDay.get(`${g.vehicle}__${g.dateKey}`) || {
        totalValue: 0,
        liters: 0,
        refuels: 0
      };

      const kmPerLiter = Number.isFinite(kmDriven) && kmDriven > 0 && fuel.liters > 0
        ? kmDriven / fuel.liters
        : NaN;

      const litersPer100 = Number.isFinite(kmDriven) && kmDriven > 0 && fuel.liters > 0
        ? (fuel.liters / kmDriven) * 100
        : NaN;

      return {
        vehicle: g.vehicle,
        dateKey: g.dateKey,
        date: g.date,
        start: start?.date || null,
        end: end?.date || null,
        kmInitial,
        kmFinal,
        kmDriven,
        totalValue: fuel.totalValue,
        liters: fuel.liters,
        kmPerLiter,
        litersPer100,
        refuels: fuel.refuels,
        status,
        leavingCount: g.leaving.length,
        arrivingCount: g.arriving.length
      };
    })
    .sort((a, b) => a.date - b.date || a.vehicle.localeCompare(b.vehicle));
}

function summarizeConsumption(dailyRows) {
  const distanceValid = dailyRows.filter(r =>
    Number.isFinite(r.kmDriven) && r.kmDriven >= 0
  );

  const complete = dailyRows.filter(r =>
    Number.isFinite(r.kmDriven) &&
    r.kmDriven > 0 &&
    Number.isFinite(r.liters) &&
    r.liters > 0
  );

  const totalValue = dailyRows.reduce(
    (sum, r) => sum + (Number.isFinite(r.totalValue) ? r.totalValue : 0),
    0
  );

  const totalLiters = dailyRows.reduce(
    (sum, r) => sum + (Number.isFinite(r.liters) ? r.liters : 0),
    0
  );

  const totalDistance = distanceValid.reduce(
    (sum, r) => sum + (Number.isFinite(r.kmDriven) ? r.kmDriven : 0),
    0
  );

  const completeLiters = complete.reduce((sum, r) => sum + r.liters, 0);

  return {
    totalValue,
    totalLiters,
    totalDistance,
    avgKmL: completeLiters > 0 ? complete.reduce((sum, r) => sum + r.kmDriven, 0) / completeLiters : NaN,
    validDays: distanceValid.length,
    completeConsumptionDays: complete.length,
    incompleteDays: dailyRows.length - complete.length,
    totalDays: dailyRows.length
  };
}

function monthLabel(k) {
  if (!k || !/^\d{4}-\d{2}$/.test(k)) return k || 'Sem data';

  const [y, m] = k.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return `${names[Number(m) - 1]}/${y}`;
}

// Rótulos internos: os valores ficam visíveis no próprio gráfico, sem depender do hover.
const dataLabelsPlugin = {
  id: 'pharmainoxDataLabels',
  afterDatasetsDraw(chart) {
    const name = String(chart.canvas?.id || '').toLowerCase();
    const isDoughnut = chart.config.type === 'doughnut';
    const format = n => {
      if (name.includes('value')) return money(n);
      if (name.includes('liters')) return `${fmt(n)} L`;
      if (name.includes('kml') || name.includes('consumption')) return `${fmt(n)} km/L`;
      if (name.includes('distance')) return `${fmt(n)} km`;
      return fmt(n);
    };
    const ctx=chart.ctx; ctx.save(); ctx.font='700 10px Segoe UI,Arial,sans-serif'; ctx.textBaseline='middle';
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      meta.data.forEach((el,idx)=>{
        const value=Number(ds.data[idx]); if(!Number.isFinite(value)) return;
        const text=format(value); const p=el.tooltipPosition();
        if(isDoughnut){
          ctx.textAlign='center'; ctx.fillStyle='#172033'; ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=3;
          ctx.strokeText(text,p.x,p.y); ctx.fillText(text,p.x,p.y); return;
        }
        const horizontal=chart.options.indexAxis==='y'; let x=p.x, y=p.y-9, align='center';
        if(horizontal){x=p.x+7;y=p.y;align='left';}
        ctx.textAlign=align; const m=ctx.measureText(text); const pad=4,h=15; const bx=align==='left'?x-pad:x-m.width/2-pad;
        ctx.fillStyle='rgba(255,255,255,.92)'; ctx.strokeStyle='rgba(23,32,51,.12)'; ctx.lineWidth=1; ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(bx,y-h/2,m.width+pad*2,h,4); else ctx.rect(bx,y-h/2,m.width+pad*2,h); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#172033'; ctx.fillText(text,x,y);
      });
    }); ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('pharmainoxDataLabels')) Chart.register(dataLabelsPlugin);

function periodLabel(key,mode){
  if(!key) return '';
  if(mode==='year') return key;
  if(mode==='month') return monthLabel(key);
  const [y,w]=key.split('-W'); return `Sem ${w}/${y}`;
}
function startOfWeek(date){
  const d=new Date(date); d.setHours(0,0,0,0); const day=d.getDay(); const diff=day===0?-6:1-day; d.setDate(d.getDate()+diff); return d;
}
function isoWeekKey(date){
  const d=startOfWeek(date); const year=d.getFullYear(); const firstMonday=startOfWeek(new Date(year,0,4)); const week=Math.floor((d-firstMonday)/604800000)+1; return `${year}-W${String(week).padStart(2,'0')}`;
}
function aggregateTimeRows(rows,mode,valueFn){
  const out={}; rows.forEach(r=>{ if(!r.date) return; const k=mode==='year'?String(r.date.getFullYear()):mode==='week'?isoWeekKey(r.date):`${r.date.getFullYear()}-${String(r.date.getMonth()+1).padStart(2,'0')}`; const v=Number(valueFn(r)); if(Number.isFinite(v)) out[k]=(out[k]||0)+v; }); return out;
}

function make(id,name,type,labels,data,label,indexAxis){
  destroy(name); const canvas=$(id); if(!canvas) return; const isDoughnut=type==='doughnut';
  S.charts[name]=new Chart(canvas,{type,data:{labels,datasets:[{label,data,borderWidth:type==='line'?2:1,tension:type==='line'?.28:0,fill:false,pointRadius:type==='line'?3:0}]},options:{responsive:true,maintainAspectRatio:false,resizeDelay:100,indexAxis:indexAxis||'x',interaction:{mode:'index',intersect:false},layout:{padding:{top:22,right:26,bottom:8,left:8}},plugins:{legend:{display:isDoughnut,position:'bottom'},tooltip:{callbacks:{label:ctx=>{const value=ctx.parsed?.y??ctx.parsed??ctx.raw;const lname=String(name).toLowerCase();if(lname.includes('value'))return `${ctx.dataset.label}: ${money(value)}`;if(lname.includes('liters'))return `${ctx.dataset.label}: ${fmt(value)} L`;if(lname.includes('kml')||lname.includes('consumption'))return `${ctx.dataset.label}: ${fmt(value)} km/L`;if(lname.includes('distance'))return `${ctx.dataset.label}: ${fmt(value)} km`;return `${ctx.dataset.label}: ${fmt(value)}`;}}}},scales:isDoughnut?{}:{x:{beginAtZero:true,ticks:{autoSkip:true,maxTicksLimit:16}},y:{beginAtZero:true,ticks:{autoSkip:true,maxTicksLimit:14}}}}});
}

function update() {
  apply();
  const f=S.filteredFuel,l=S.filteredLog,daily=S.filteredDaily,summary=summarizeConsumption(daily),mode=$('periodicity')?.value||'month';
  $('value').textContent=money(summary.totalValue); $('liters').textContent=summary.totalLiters>0?`${fmt(summary.totalLiters)} L`:'—'; $('refuels').textContent=f.length.toLocaleString('pt-BR'); $('logCount').textContent=l.length.toLocaleString('pt-BR'); $('distance').textContent=fmt(summary.totalDistance)+' km'; $('kml').textContent=fmt(summary.avgKmL);
  const dates=(S.filteredJourney.length?S.filteredJourney:f).filter(r=>r.date).map(r=>r.date).sort((a,b)=>a-b); $('period').textContent=dates.length?`${dateTime(dates[0])} → ${dateTime(dates[dates.length-1])}`:'—';
  const keyFor=(date)=>mode==='year'?String(date.getFullYear()):mode==='week'?isoWeekKey(date):`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const timeValue=aggregateTimeRows(f,mode,r=>r.value), timeLiters=aggregateTimeRows(f,mode,r=>r.liters), timeDistance={};
  daily.forEach(r=>{if(Number.isFinite(r.kmDriven)&&r.kmDriven>0&&r.date){const k=keyFor(r.date);timeDistance[k]=(timeDistance[k]||0)+r.kmDriven;}});
  const vehicleValue={},vehicleLiters={},vehicleDistance={};
  f.forEach(r=>{vehicleValue[r.vehicle]=(vehicleValue[r.vehicle]||0)+(Number.isFinite(r.value)?r.value:0);vehicleLiters[r.vehicle]=(vehicleLiters[r.vehicle]||0)+(Number.isFinite(r.liters)?r.liters:0);});
  daily.forEach(r=>{if(Number.isFinite(r.kmDriven)&&r.kmDriven>0)vehicleDistance[r.vehicle]=(vehicleDistance[r.vehicle]||0)+r.kmDriven;});
  const timeKeys=[...new Set([...Object.keys(timeValue),...Object.keys(timeLiters),...Object.keys(timeDistance)])].sort(),labels=timeKeys.map(k=>periodLabel(k,mode)),suffix=mode==='month'?'mês':mode==='week'?'semana':'ano';
  $('titleMonthValue').textContent=`Valor por ${suffix}`; $('titleMonthLiters').textContent=`Litros calculados por ${suffix}`; $('titleDailyConsumption').textContent=`Consumo por ${suffix}`; $('titleDailyDistance').textContent=`KM rodados por ${suffix}`;
  make('monthValue','monthValue','bar',labels,timeKeys.map(k=>timeValue[k]||0),'Valor abastecido'); make('monthLiters','monthLiters','line',labels,timeKeys.map(k=>timeLiters[k]||0),'Litros calculados');
  make('vehicleValue','vehicleValue','doughnut',Object.keys(vehicleValue),Object.values(vehicleValue),'Valor abastecido'); make('vehicleLiters','vehicleLiters','bar',Object.keys(vehicleLiters),Object.values(vehicleLiters),'Litros calculados'); make('distanceVehicle','distanceVehicle','bar',Object.keys(vehicleDistance),Object.values(vehicleDistance),'KM rodados');
  const vehicleKml={}; Object.keys(vehicleDistance).forEach(v=>{const rows=daily.filter(r=>r.vehicle===v&&Number.isFinite(r.kmDriven)&&r.kmDriven>0&&Number.isFinite(r.liters)&&r.liters>0);const dist=rows.reduce((s,r)=>s+r.kmDriven,0),lit=rows.reduce((s,r)=>s+r.liters,0);if(lit>0)vehicleKml[v]=dist/lit;}); make('kmlVehicle','kmlVehicle','bar',Object.keys(vehicleKml),Object.values(vehicleKml),'KM/L');
  const timeKml={}; daily.forEach(r=>{if(!r.date||!Number.isFinite(r.kmDriven)||r.kmDriven<=0||!Number.isFinite(r.liters)||r.liters<=0)return;const k=keyFor(r.date);timeKml[k]=(timeKml[k]||0)+r.kmDriven/r.liters;});
  // Consumo do período: usa KM e litros agregados, não a média das médias.
  const distAgg={},litAgg={}; daily.forEach(r=>{if(!r.date||!Number.isFinite(r.kmDriven)||r.kmDriven<=0||!Number.isFinite(r.liters)||r.liters<=0)return;const k=keyFor(r.date);distAgg[k]=(distAgg[k]||0)+r.kmDriven;litAgg[k]=(litAgg[k]||0)+r.liters;}); Object.keys(distAgg).forEach(k=>{timeKml[k]=litAgg[k]>0?distAgg[k]/litAgg[k]:NaN;});
  const kmlKeys=Object.keys(timeKml).filter(k=>Number.isFinite(timeKml[k])).sort(); make('dailyConsumption','dailyConsumption','line',kmlKeys.map(k=>periodLabel(k,mode)),kmlKeys.map(k=>timeKml[k]),'KM/L'); const distKeys=Object.keys(timeDistance).sort(); make('dailyDistance','dailyDistance','bar',distKeys.map(k=>periodLabel(k,mode)),distKeys.map(k=>timeDistance[k]),'KM rodados');
  const statuses={},cities={}; l.forEach(r=>{statuses[r._status]=(statuses[r._status]||0)+1;cities[r._city]=(cities[r._city]||0)+1;}); const topCities=Object.entries(cities).sort((a,b)=>b[1]-a[1]).slice(0,15); make('chartStatus','chartStatus','bar',Object.keys(statuses).slice(0,20),Object.values(statuses).slice(0,20),'Registros','y'); make('city','city','bar',topCities.map(x=>x[0]),topCities.map(x=>x[1]),'Registros','y'); const weekday={}; f.forEach(r=>{const w=r.date?['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][r.date.getDay()]:'Sem data';weekday[w]=(weekday[w]||0)+1;}); const days=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']; make('weekday','weekday','bar',days,days.map(d=>weekday[d]||0),'Abastecimentos');
  const dailyRowsForTable=daily.slice().sort((a,b)=>b.date-a.date||a.vehicle.localeCompare(b.vehicle)); $('dailyTable').innerHTML=dailyRowsForTable.map(r=>{const statusClass=r.status==='Calculado'?'daily-ok':'daily-warn';return `<tr><td>${new Date(`${r.dateKey}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${escapeHtml(r.vehicle)}</td><td>${r.start?escapeHtml(dateTime(r.start)):'—'}</td><td>${Number.isFinite(r.kmInitial)?r.kmInitial.toLocaleString('pt-BR'):'—'}</td><td>${r.end?escapeHtml(dateTime(r.end)):'—'}</td><td>${Number.isFinite(r.kmFinal)?r.kmFinal.toLocaleString('pt-BR'):'—'}</td><td><strong>${Number.isFinite(r.kmDriven)?fmt(r.kmDriven)+' km':'—'}</strong></td><td>${money(r.totalValue)}</td><td>${Number.isFinite(r.liters)?fmt(r.liters)+' L':'—'}</td><td><strong>${Number.isFinite(r.kmPerLiter)?fmt(r.kmPerLiter)+' km/L':'—'}</strong></td><td>${Number.isFinite(r.litersPer100)?fmt(r.litersPer100)+' L/100 km':'—'}</td><td><span class="${statusClass}">${escapeHtml(r.status)}</span></td></tr>`;}).join('')||'<tr><td colspan="12">Nenhum dia encontrado.</td></tr>';
  $('fuelTable').innerHTML=f.slice().sort((a,b)=>(b.date||0)-(a.date||0)).slice(0,300).map(r=>`<tr><td>${r.dateText}</td><td>${escapeHtml(r.vehicle)}</td><td>${money(r.value)}</td><td>${money(r.price)}</td><td>${Number.isFinite(r.liters)?fmt(r.liters)+' L':'—'}</td><td>${Number.isFinite(r.km)?r.km.toLocaleString('pt-BR'):'—'}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum registro.</td></tr>';
  const first=l[0]||{};const keys=Object.keys(first).filter(k=>!k.startsWith('_')).slice(0,8);$('logHead').innerHTML=keys.map(k=>`<th>${escapeHtml(k)}</th>`).join('');$('logTable').innerHTML=l.slice(0,100).map(r=>`<tr>${keys.map(k=>`<td>${escapeHtml(String(r[k]??''))}</td>`).join('')}</tr>`).join('');
  const incompleteNote=summary.incompleteDays?`${summary.validDays} dia(s) calculado(s) · ${summary.incompleteDays} dia(s) sem par inicial/final`:`${summary.validDays} dia(s) calculado(s)`;$('distance').title=incompleteNote;$('kml').title=`Consumo médio calculado apenas com dias completos. ${incompleteNote}`;
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
  if (value.length < 8) return false;
  // Para endereços da base, ainda exigimos algum indicador concreto de localização.
  return /\d/.test(value) || /\bS\/?N\b/i.test(value) || /\bKM\b/i.test(value);
}

function isGoodManualAddress(addr) {
  const value = String(addr || '').trim();
  if (!value) return false;
  if (value.toLowerCase() === 'endereço não encontrado') return false;
  // Cadastro manual pode ser uma referência válida sem número (ex.: condomínio, rodovia, galpão, ponto conhecido).
  return value.length >= 5;
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

// Carrega o arquivo JSON que acompanha o projeto.
// Ele funciona como uma base inicial de endereços manuais, especialmente útil
// para novos dispositivos/GitHub Pages que ainda não possuem localStorage.
async function loadBundledManualAddresses() {
  try {
    const res = await fetch('./enderecos_manuais_pharmainox.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bundled = await res.json();
    if (!bundled || typeof bundled !== 'object' || Array.isArray(bundled)) return;

    const current = S.manualAddresses || {};
    const merged = { ...bundled };

    // Coordenadas presentes no JSON acompanham o cadastro e são carregadas
    // para o cache permanente do fornecedor.
    for (const [code, item] of Object.entries(bundled)) {
      if (item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))) {
        setSupplierCoords(code, Number(item.lat), Number(item.lng), item.origemCoordenada || 'json');
      }
    }

    // O que já foi alterado/salvo no navegador continua tendo prioridade
    // quando possuir uma data de atualização igual ou mais recente.
    for (const [code, localItem] of Object.entries(current)) {
      if (!localItem || typeof localItem !== 'object') continue;
      const bundleItem = merged[code];
      const localTime = Date.parse(localItem.atualizadoEm || '') || 0;
      const bundleTime = Date.parse(bundleItem?.atualizadoEm || '') || 0;
      if (!bundleItem || localTime >= bundleTime) merged[code] = localItem;
    }

    S.manualAddresses = merged;
    saveManualAddresses();
  } catch (e) {
    // Abrindo diretamente por arquivo (file://), o navegador pode bloquear fetch.
    // Nesse caso, usamos normalmente o localStorage já existente.
    console.warn('Não foi possível carregar a base JSON de endereços:', e);
  }
}

function getManualAddress(code) {
  const item = S.manualAddresses[manualKey(code)];
  return item && isGoodManualAddress(item.endereco) ? item : null;
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
        routeKey: groupKey,
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
  S.map = L.map('routeMap', {
    zoomControl: true,
    scrollWheelZoom: true,
    preferCanvas: true
  }).setView([PHARMAINNOX.lat, PHARMAINNOX.lng], 10);

  // Mapa base simples e estável. A rota é desenhada separadamente pelo OSRM.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(S.map);

  S.markersLayer = L.layerGroup().addTo(S.map);
  S.routeLayer = L.layerGroup().addTo(S.map);
  S.map.on('click', handleMapPick);
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
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20]
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

function loadCepCache() {
  try { S.cepCache = JSON.parse(localStorage.getItem('pharmainox_cep_cache_v1') || '{}') || {}; }
  catch { S.cepCache = {}; }
}

function saveCepCache() {
  try { localStorage.setItem('pharmainox_cep_cache_v1', JSON.stringify(S.cepCache)); } catch {}
}

// Coordenadas confirmadas manualmente por fornecedor.
// Isso evita depender de um geocodificador toda vez que a rota é aberta.
function loadSupplierCoords() {
  try { S.supplierCoords = JSON.parse(localStorage.getItem('pharmainox_supplier_coords_v1') || '{}') || {}; }
  catch { S.supplierCoords = {}; }
}

function saveSupplierCoords() {
  try { localStorage.setItem('pharmainox_supplier_coords_v1', JSON.stringify(S.supplierCoords)); } catch {}
}

// Ordem manual das paradas por dia. Quando o usuário arrasta uma parada,
// a nova sequência fica salva neste navegador e passa a ter prioridade
// sobre a otimização automática do OSRM para aquele dia.
function routeStorageKey(dateKey) {
  return `pharmainox_route_order_${dateKey}`;
}

function loadRouteOrder(dateKey) {
  if (!dateKey) return [];
  try {
    const raw = localStorage.getItem(routeStorageKey(dateKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveRouteOrder(dateKey, order) {
  if (!dateKey) return;
  const clean = [...new Set((order || []).map(String).filter(Boolean))];
  S.routeOrderByDate[dateKey] = clean;
  try { localStorage.setItem(routeStorageKey(dateKey), JSON.stringify(clean)); } catch {}
}

function clearRouteOrder(dateKey) {
  if (!dateKey) return;
  delete S.routeOrderByDate[dateKey];
  try { localStorage.removeItem(routeStorageKey(dateKey)); } catch {}
}

function getRouteStopKey(stop) {
  return String(stop?.routeKey || stop?.supplierCode || `NOME:${normalizeText(stop?.supplierName || '')}`);
}

function applyManualRouteOrder(stops, savedOrder) {
  if (!savedOrder?.length) return stops.slice();
  const rank = new Map(savedOrder.map((key, i) => [String(key), i]));
  return stops
    .map((stop, originalIndex) => ({
      stop,
      originalIndex,
      rank: rank.has(getRouteStopKey(stop)) ? rank.get(getRouteStopKey(stop)) : Number.POSITIVE_INFINITY
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.originalIndex - b.originalIndex;
    })
    .map(x => x.stop);
}

function getRouteOrder(dateKey) {
  if (!dateKey) return [];
  if (!Object.prototype.hasOwnProperty.call(S.routeOrderByDate, dateKey)) {
    S.routeOrderByDate[dateKey] = loadRouteOrder(dateKey);
  }
  return S.routeOrderByDate[dateKey] || [];
}

function getManualRouteMode(dateKey) {
  return getRouteOrder(dateKey).length > 0;
}

function getSupplierCoords(code) {
  const item = S.supplierCoords?.[normalizeCode(code)];
  if (!item) return null;
  const lat = Number(item.lat), lng = Number(item.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function setSupplierCoords(code, lat, lng, origem = 'manual-mapa') {
  const keyCode = normalizeCode(code);
  if (!keyCode) return false;
  const nlat = Number(lat), nlng = Number(lng);
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return false;
  S.supplierCoords[keyCode] = { lat: nlat, lng: nlng, origem, atualizadoEm: new Date().toISOString() };
  saveSupplierCoords();
  return true;
}

let lastNominatimRequest = 0;
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCep(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function extractCep(address) {
  const m = String(address || '').match(/\b(\d{5})[-. ]?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : '';
}

function extractHouseNumber(address) {
  const s = String(address || '').replace(/\b(\d{5})[-. ]?\d{3}\b/g, '');
  const m = s.match(/(?:^|[,\-])\s*(?:n[ºo°]?\s*)?(\d{1,6})(?:\s*[-/]\s*\d+)?(?:\s|,|$)/i);
  return m ? m[1] : '';
}

function parseBrazilianAddress(address, fallbackCity = '') {
  const raw = String(address || '').trim();
  const cep = extractCep(raw);
  const pieces = raw.replace(/\b\d{5}[-. ]?\d{3}\b/g, '').split(/\s+-\s+|\s*,\s*/).map(x => x.trim()).filter(Boolean);
  const number = extractHouseNumber(raw);

  let uf = '';
  let city = String(fallbackCity || '').trim();
  const ufMatch = raw.match(/(?:^|[\s,\-])([A-Z]{2})(?:\s*,|\s|$)/i);
  if (ufMatch) uf = ufMatch[1].toUpperCase();

  const cityMatch = raw.match(/,\s*([^,\-]+?)\s*-\s*([A-Z]{2})\b/i);
  if (cityMatch) city = cityMatch[1].trim();
  else {
    const alt = raw.match(/-\s*([^,\-]+?)\s*,\s*([A-Z]{2})\b/i);
    if (alt) city = alt[1].trim();
  }

  let street = '';
  let neighborhood = '';
  if (pieces.length) {
    street = cleanStreetAbbreviations(pieces[0]);
    // Remove o número do começo da linha da rua, se houver.
    street = street.replace(/^[^,\d]*,?\s*\d{1,6}\s*(?:\/\d+)?\s*/,'').trim();
    if (pieces.length >= 2) neighborhood = pieces[1];
  }

  return { raw, cep, number, street, neighborhood, city, uf: uf || 'SP' };
}

function buildStructuredNominatimQueries(parts) {
  const out = [];
  const base = {
    format: 'jsonv2',
    countrycodes: 'br',
    limit: '5',
    addressdetails: '1'
  };

  if (parts.street && parts.city) {
    const params = new URLSearchParams({
      ...base,
      street: parts.number ? `${parts.street}, ${parts.number}` : parts.street,
      city: parts.city,
      state: parts.uf || 'SP'
    });
    if (parts.cep) params.set('postalcode', parts.cep);
    out.push('https://nominatim.openstreetmap.org/search?' + params.toString());
  }

  if (parts.cep) {
    const params = new URLSearchParams({
      ...base,
      postalcode: parts.cep,
      country: 'Brazil'
    });
    out.push('https://nominatim.openstreetmap.org/search?' + params.toString());
  }

  return [...new Set(out)];
}

async function geocodeNominatimStructured(parts) {
  const urls = buildStructuredNominatimQueries(parts);
  for (const url of urls) {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
    if (wait) await sleep(wait);
    lastNominatimRequest = Date.now();

    const res = await fetchWithTimeout(url, {
      headers: {
        'Accept-Language': 'pt-BR',
        'X-Requested-With': 'Pharmainox-Logistica'
      }
    }, 10000);
    if (!res.ok) throw new Error(`Geocodificação HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) continue;

    return data.map(item => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      displayName: item.display_name || '',
      type: item.type || '',
      importance: Number(item.importance) || 0,
      address: item.address || {}
    })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  }
  return [];
}

async function geocodeNominatim(query) {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
  if (wait) await sleep(wait);
  lastNominatimRequest = Date.now();

  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    format: 'jsonv2',
    q: query,
    countrycodes: 'br',
    limit: '5',
    addressdetails: '1'
  });

  const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'pt-BR' } }, 10000);
  if (!res.ok) throw new Error(`Geocodificação HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map(item => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    displayName: item.display_name || query,
    type: item.type || '',
    importance: Number(item.importance) || 0,
    address: item.address || {}
  })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

async function geocodePhoton(query) {
  const url = 'https://photon.komoot.io/api/?' + new URLSearchParams({
    q: query,
    limit: '5',
    lang: 'pt'
  });
  const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'pt-BR' } }, 10000);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data?.features)) return [];
  return data.features.map(f => ({
    lat: Number(f.geometry?.coordinates?.[1]),
    lng: Number(f.geometry?.coordinates?.[0]),
    displayName: [f.properties?.name, f.properties?.street, f.properties?.city, f.properties?.state].filter(Boolean).join(', ') || query,
    type: f.properties?.type || '',
    importance: Number(f.properties?.importance) || 0,
    address: f.properties || {}
  })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

async function lookupCep(cep) {
  const keyCep = normalizeCep(cep);
  if (!keyCep) return null;
  if (S.cepCache[keyCep]) return S.cepCache[keyCep];
  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${keyCep}/json/`, { headers: { 'Accept-Language': 'pt-BR' } }, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.erro) return null;
    const result = {
      cep: data.cep || keyCep,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
      complemento: data.complemento || ''
    };
    S.cepCache[keyCep] = result;
    saveCepCache();
    return result;
  } catch (e) {
    console.warn('ViaCEP falhou:', e);
    return null;
  }
}

async function lookupCepByAddress(uf, city, street) {
  const cleanUf = String(uf || 'SP').trim().toUpperCase();
  const cleanCity = String(city || '').trim();
  const cleanStreet = String(street || '').replace(/\s+/g, ' ').trim();
  if (!cleanCity || cleanStreet.length < 5) return null;

  const cacheKey = `addr:${cleanUf}:${normalizeText(cleanCity)}:${normalizeText(cleanStreet)}`;
  if (S.cepCache[cacheKey]) return S.cepCache[cacheKey];

  try {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(cleanUf)}/${encodeURIComponent(cleanCity)}/${encodeURIComponent(cleanStreet)}/json/`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'pt-BR' } }, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const target = normalizeText(cleanStreet);
    const ranked = data.map(item => {
      const streetText = normalizeText(item.logradouro || '');
      const overlap = target.split(' ').filter(t => t.length > 2 && streetText.includes(t)).length;
      return { item, score: overlap };
    }).sort((a,b) => b.score - a.score);

    const best = ranked[0]?.item;
    if (!best) return null;

    const result = {
      cep: best.cep || '',
      logradouro: best.logradouro || '',
      bairro: best.bairro || '',
      localidade: best.localidade || cleanCity,
      uf: best.uf || cleanUf,
      complemento: best.complemento || ''
    };
    S.cepCache[cacheKey] = result;
    saveCepCache();
    return result;
  } catch (e) {
    console.warn('ViaCEP por endereço falhou:', e);
    return null;
  }
}

function candidateScore(result, parts, supplierName = '') {
  const display = normalizeText(result.displayName || '');
  const street = normalizeText(parts.street || '');
  const city = normalizeText(parts.city || '');
  const cep = normalizeCep(parts.cep || '');
  let score = Number(result.importance || 0) * 2;

  if (street) {
    const tokens = street.split(' ').filter(t => t.length > 2);
    const matched = tokens.filter(t => display.includes(t)).length;
    score += matched * 3;
    if (tokens.length && matched / tokens.length >= 0.7) score += 6;
  }
  if (city && display.includes(city)) score += 7;
  if (cep && display.replace(/\D/g, '').includes(cep)) score += 9;

  const expectedNumber = String(parts.number || '').replace(/\D/g, '');
  const candidateNumber = String(result.address?.house_number || '').replace(/\D/g, '');
  const candidateText = String(result.displayName || '');
  if (expectedNumber) {
    if (candidateNumber === expectedNumber) score += 12;
    else if (new RegExp(`\\b${expectedNumber}\\b`).test(candidateText)) score += 8;
    else if (candidateNumber) score -= 6;
  }

  if (supplierName) {
    const name = normalizeText(supplierName);
    const nameTokens = name.split(' ').filter(t => t.length > 3 && !['LTDA','COMERCIO','INDUSTRIA','BRASIL'].includes(t));
    const matchedName = nameTokens.filter(t => display.includes(t)).length;
    score += Math.min(8, matchedName * 1.5);
  }

  if (['house','building','industrial','commercial'].includes(result.type)) score += 2;
  return score;
}

async function geocodeAddress(address, fallbackCity = '', supplierCode = '', supplierName = '', options = {}) {
  const force = Boolean(options.force);
  if (!force) {
    const saved = getSupplierCoords(supplierCode);
    if (saved) return { ...saved, displayName: [address, fallbackCity].filter(Boolean).join(', '), source: 'saved' };
  }

  const parts = parseBrazilianAddress(address, fallbackCity);
  let cepData = await lookupCep(parts.cep);
  if (!cepData && parts.city && parts.street) {
    cepData = await lookupCepByAddress(parts.uf || 'SP', parts.city, parts.street);
  }
  if (cepData) {
    if (!parts.street && cepData.logradouro) parts.street = cepData.logradouro;
    if (!parts.neighborhood && cepData.bairro) parts.neighborhood = cepData.bairro;
    if (!parts.city && cepData.localidade) parts.city = cepData.localidade;
    if (!parts.uf && cepData.uf) parts.uf = cepData.uf;
    if (!parts.cep && cepData.cep) parts.cep = normalizeCep(cepData.cep);
  }

  const full = [parts.street && `${parts.street}${parts.number ? ', ' + parts.number : ''}`, parts.neighborhood, parts.city, parts.uf || 'SP', parts.cep, 'Brasil'].filter(Boolean).join(', ');
  const rawFull = [address, fallbackCity, 'Brasil'].filter(Boolean).join(', ');
  const keyCache = cacheKeyForGeo(`${supplierName}|${full || rawFull}`);
  if (!force && S.geocodeCache[keyCache]) return S.geocodeCache[keyCache];

  let candidates = [];

  // 1) Nominatim estruturado: rua + número + cidade + UF + CEP.
  try {
    candidates = await geocodeNominatimStructured(parts);
  } catch (e) {
    console.warn('Nominatim estruturado falhou:', e);
  }

  // 2) Nominatim livre com o endereço já normalizado.
  if (!candidates.length) {
    for (const q of [full, rawFull, [supplierName, full].filter(Boolean).join(', ')]) {
      if (!q) continue;
      try {
        const r = await geocodeNominatim(q);
        candidates.push(...r);
        if (r.length) break;
      } catch (e) {
        console.warn('Nominatim livre falhou:', e);
      }
    }
  }

  // 3) Photon como segundo geocodificador gratuito, útil quando o OSM/Nominatim não acha.
  if (!candidates.length) {
    for (const q of [full, rawFull, [supplierName, full].filter(Boolean).join(', ')]) {
      if (!q) continue;
      try {
        const r = await geocodePhoton(q);
        candidates.push(...r);
        if (r.length) break;
      } catch (e) {
        console.warn('Photon falhou:', e);
      }
    }
  }

  if (!candidates.length) return null;

  const ranked = candidates
    .map(r => ({ r, score: candidateScore(r, parts, supplierName) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;

  // Evita salvar um ponto obviamente genérico. Exige um mínimo de correspondência.
  const normalizedDisplay = normalizeText(best.r.displayName || '');
  const streetTokens = normalizeText(parts.street || '').split(' ').filter(t => t.length > 2);
  const streetHits = streetTokens.filter(t => normalizedDisplay.includes(t)).length;
  const cityHit = parts.city ? normalizedDisplay.includes(normalizeText(parts.city)) : true;
  const expectedNumber = String(parts.number || '').replace(/\D/g, '');
  const candidateNumber = String(best.r.address?.house_number || '').replace(/\D/g, '');
  const candidateDigits = String(best.r.displayName || '').replace(/\D/g, '');
  const exactNumber = expectedNumber && (candidateNumber === expectedNumber || new RegExp(`\\b${expectedNumber}\\b`).test(String(best.r.displayName || '')));
  const exactCep = normalizeCep(parts.cep) && candidateDigits.includes(normalizeCep(parts.cep));
  // Segurança: não aceita automaticamente um simples centro de rua quando
  // o endereço tem número/CEP. Exige correspondência forte de rua/cidade e
  // pelo menos número exato ou CEP. Isso evita marcar um ponto errado só
  // porque a rua existe.
  const addressIdentityOk = !expectedNumber || exactNumber || exactCep;
  const strongEnough = best.score >= 8 && streetHits >= Math.max(1, Math.ceil(streetTokens.length * 0.5)) && cityHit && addressIdentityOk;
  if (!strongEnough) return null;

  const result = {
    lat: best.r.lat,
    lng: best.r.lng,
    displayName: best.r.displayName || full,
    score: best.score,
    source: 'geocode'
  };

  S.geocodeCache[keyCache] = result;
  saveGeoCache();
  return result;
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

async function osrmRoute(points) {
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Roteamento HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'Não foi possível encontrar uma rota pelas ruas.');
  }
  return data.routes[0];
}

async function calculateRoute(points, allowOptimization = true) {
  if (points.length < 2) return null;

  let ordered = points.slice();
  let optimized = false;

  // 1) Tenta otimizar a sequência quando o volume é compatível com o serviço público.
  if (allowOptimization && points.length <= 60) {
    try {
      const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&destination=first&roundtrip=true&steps=false&geometries=geojson&overview=full`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.trips?.length) {
          data.waypoints?.forEach((wp, i) => {
            const p = points[i];
            if (p) p._waypointIndex = Number.isFinite(wp.waypoint_index) ? wp.waypoint_index : i;
          });
          ordered = points.slice().sort((a, b) => (a._waypointIndex ?? 0) - (b._waypointIndex ?? 0));
          optimized = true;
        }
      }
    } catch (e) {
      console.warn('Otimização OSRM falhou; usando ordem atual.', e);
    }
  }

  // 2) Calcula a geometria seguindo as ruas. Primeiro tenta uma chamada única.
  const routePoints = ordered.concat([{ ...points[0], isReturn: true }]);
  try {
    const route = await osrmRoute(routePoints);
    return { route, ordered, optimized };
  } catch (e) {
    console.warn('Rota completa falhou; usando cálculo por trechos.', e);
  }

  // 3) Fallback robusto: calcula trecho a trecho. Assim, um limite do serviço
  // para uma rota muito grande não derruba o mapa inteiro.
  const legs = [];
  let totalDistance = 0;
  let totalDuration = 0;
  const geometry = [];

  for (let i = 0; i < routePoints.length - 1; i++) {
    const legPoints = [routePoints[i], routePoints[i + 1]];
    const leg = await osrmRoute(legPoints);
    legs.push(leg);
    totalDistance += Number(leg.distance) || 0;
    totalDuration += Number(leg.duration) || 0;
    const coords = leg.geometry?.coordinates || [];
    if (!coords.length) continue;
    if (geometry.length) geometry.push(...coords.slice(1));
    else geometry.push(...coords);
  }

  if (!geometry.length) throw new Error('Não foi possível obter a geometria dos trechos da rota.');
  return {
    route: {
      distance: totalDistance,
      duration: totalDuration,
      geometry: { type: 'LineString', coordinates: geometry }
    },
    ordered,
    optimized
  };
}

function routeIssueLabel(state) {
  if (state === 'missing-address') return 'Endereço não cadastrado';
  if (state === 'ambiguous') return 'Mais de um endereço';
  if (state === 'geocode-pending') return 'Localização pendente — clique em Localizar ou Marcar no mapa';
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
    const current = manual?.endereco || s.resolution?.entry?.endereco || '';
    const hasAddress = isGoodManualAddress(current);
    const savedCoords = getSupplierCoords(code);
    const mapButtonDisabled = !code || !hasAddress ? 'disabled' : '';
    const coordinateText = savedCoords
      ? `<small class="route-coord-saved">📍 Coordenadas salvas: ${savedCoords.lat.toFixed(6)}, ${savedCoords.lng.toFixed(6)}</small>`
      : '';

    return `
      <div class="route-issue route-issue-editable">
        <div class="route-issue-main">
          <b>${escapeHtml(s.supplierName)}</b>
          <small>Código ${escapeHtml(code || 'não informado')} · ${escapeHtml(s.city)}</small>
          <small>Status: ${escapeHtml(routeIssueLabel(s.resolution.state))}</small>
          ${coordinateText}
        </div>
        <div class="route-address-editor">
          <input id="${id}" type="text" value="${escapeHtml(current)}" placeholder="Digite o endereço completo...">
          <div class="route-address-actions">
            <button type="button" class="button secondary mini-button save-route-address" data-code="${escapeHtml(code)}" data-input="${escapeHtml(id)}" data-city="${escapeHtml(s.city)}" data-supplier="${escapeHtml(s.supplierName)}">Salvar endereço</button>
            <button type="button" class="button secondary mini-button locate-route-address" data-code="${escapeHtml(code)}" data-input="${escapeHtml(id)}" data-city="${escapeHtml(s.city)}" data-supplier="${escapeHtml(s.supplierName)}" ${mapButtonDisabled}>Localizar</button>
            <button type="button" class="button secondary mini-button mark-map-address" data-code="${escapeHtml(code)}" data-input="${escapeHtml(id)}" data-city="${escapeHtml(s.city)}" data-supplier="${escapeHtml(s.supplierName)}" ${mapButtonDisabled}>Marcar no mapa</button>
            <button type="button" class="button secondary mini-button open-address-search" data-input="${escapeHtml(id)}" data-city="${escapeHtml(s.city)}" data-supplier="${escapeHtml(s.supplierName)}">Google Maps</button>
          </div>
        </div>
      </div>`;
  }).join('');

  $('routeIssues').innerHTML = `<div class="route-issues-title">Pendências de endereço — você pode cadastrar e confirmar a localização aqui</div>${rows}`;

  $('routeIssues').querySelectorAll('.save-route-address').forEach(btn => {
    btn.addEventListener('click', () => saveRouteAddress(
      btn.dataset.code || '',
      btn.dataset.input || '',
      btn.dataset.city || '',
      btn.dataset.supplier || ''
    ));
  });

  $('routeIssues').querySelectorAll('.locate-route-address').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = $(btn.dataset.input || '');
      const code = btn.dataset.code || '';
      const address = input?.value.trim();
      if (!code || !address) {
        toast('Informe e salve um endereço antes de localizar.');
        return;
      }
      btn.disabled = true;
      try {
        const geo = await geocodeAddress(address, btn.dataset.city || '', code, btn.dataset.supplier || '', { force: true });
        if (geo) {
          setSupplierCoords(code, geo.lat, geo.lng, 'geocode');
          const manual = getManualAddress(code);
          if (!manual) {
            S.manualAddresses[manualKey(code)] = {
              endereco: address,
              cidade: btn.dataset.city || '',
              origem: 'geocode',
              atualizadoEm: new Date().toISOString()
            };
            saveManualAddresses();
          }
          toast(`Fornecedor ${normalizeCode(code)} localizado e salvo.`);
        } else {
          toast('Não foi encontrado automaticamente. Use “Marcar no mapa”.');
        }
      } catch (e) {
        console.warn('Falha na localização manual:', e);
        toast('Não foi possível localizar automaticamente. Use “Marcar no mapa”.');
      } finally {
        btn.disabled = false;
      }
      await renderRoute();
    });
  });

  $('routeIssues').querySelectorAll('.mark-map-address').forEach(btn => {
    btn.addEventListener('click', () => startMapPick(
      btn.dataset.code || '',
      btn.dataset.input || '',
      btn.dataset.city || '',
      btn.dataset.supplier || ''
    ));
  });

  $('routeIssues').querySelectorAll('.open-address-search').forEach(btn => {
    btn.addEventListener('click', () => openAddressSearch(
      btn.dataset.input || '',
      btn.dataset.city || '',
      btn.dataset.supplier || ''
    ));
  });
}

function renderStopsList(ordered, dateKey = '') {
  const cards = ordered.map((s, i) => {
    const buyer = s.buyers.length ? s.buyers.join(', ') : '—';
    const orders = s.orders.length ? s.orders.join(', ') : '—';
    const source = s.resolution?.source === 'manual' ? ' · endereço manual' : '';
    const routeKey = getRouteStopKey(s);
    const code = normalizeCode(s.supplierCode);
    const buttons = code ? `
      <div class="route-stop-actions">
        <button type="button" class="button secondary mini-button relocate-stop" data-code="${escapeHtml(code)}" data-city="${escapeHtml(s.city || '')}" data-supplier="${escapeHtml(s.supplierName || '')}" data-address="${escapeHtml(s.address || '')}">Localizar endereço</button>
        <button type="button" class="button secondary mini-button correct-stop-map" data-code="${escapeHtml(code)}" data-city="${escapeHtml(s.city || '')}" data-supplier="${escapeHtml(s.supplierName || '')}" data-address="${escapeHtml(s.address || '')}">Corrigir ponto</button>
      </div>` : '';
    return `
      <div class="route-stop route-stop-draggable" draggable="true" data-route-key="${escapeHtml(routeKey)}" title="Arraste para alterar a ordem da parada">
        <div class="stop-drag-handle" aria-hidden="true">⋮⋮</div>
        <div class="stop-number">${i + 1}</div>
        <div class="stop-content">
          <strong>${escapeHtml(s.supplierName)}</strong>
          <span>Cód. ${escapeHtml(s.supplierCode || '—')} · ${escapeHtml(s.city)}${escapeHtml(source)}</span>
          <span>Comprador: ${escapeHtml(buyer)}</span>
          <span>Pedido(s): ${escapeHtml(orders)}</span>
          <small>${escapeHtml(s.address)}</small>
          ${buttons}
        </div>
      </div>`;
  }).join('');
  $('routeStopsList').innerHTML = cards || '<div class="empty-route">Nenhuma parada com endereço confirmado neste dia.</div>';

  $('routeStopsList').querySelectorAll('.relocate-stop').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const geo = await geocodeAddress(btn.dataset.address || '', btn.dataset.city || '', btn.dataset.code || '', btn.dataset.supplier || '', { force: true });
        if (!geo) {
          toast('Não encontrei uma localização suficientemente confiável para esse endereço. Use “Corrigir ponto”.');
          return;
        }
        setSupplierCoords(btn.dataset.code || '', geo.lat, geo.lng, 'geocode-confirmado');
        toast(`Localização do fornecedor ${btn.dataset.code} atualizada pelo endereço.`);
        await renderRoute();
      } catch (e) {
        console.warn('Relocalização falhou:', e);
        toast('Não foi possível localizar automaticamente. Use “Corrigir ponto”.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  $('routeStopsList').querySelectorAll('.correct-stop-map').forEach(btn => {
    btn.addEventListener('click', () => startMapPick(btn.dataset.code || '', '', btn.dataset.city || '', btn.dataset.supplier || '', btn.dataset.address || '', { overwrite: true }));
  });

  bindRouteStopDrag(dateKey);
}

function bindRouteStopDrag(dateKey) {
  const list = $('routeStopsList');
  if (!list) return;

  let dragged = null;

  list.querySelectorAll('.route-stop[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragged = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.routeKey || '');
    });

    card.addEventListener('dragend', async () => {
      if (!dragged) return;
      dragged.classList.remove('dragging');
      dragged = null;
      const order = [...list.querySelectorAll('.route-stop[draggable="true"]')]
        .map(el => el.dataset.routeKey)
        .filter(Boolean);
      if (order.length) {
        saveRouteOrder(dateKey, order);
        toast('Ordem da rota atualizada. Recalculando o mapa...');
        await renderRoute();
      }
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragged || dragged === card) return;
      const rect = card.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (after) card.after(dragged);
      else card.before(dragged);
    });
  });
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

  $('routeBadge').textContent = getManualRouteMode(dateKey)
    ? 'Usando ordem manual salva…'
    : 'Usando endereços já confirmados…';
  const geoPoints = [];

  for (const s of baseValid) {
    if (runId !== S.routeRunId) return;
    const address = s.resolution.entry.endereco;
    const city = s.resolution.entry.cidade || s.city;
    const saved = getSupplierCoords(s.supplierCode);
    const cached = S.geocodeCache[cacheKeyForGeo(`${s.supplierName}|${[address, city].filter(Boolean).join(', ')}`)] || S.geocodeCache[cacheKeyForGeo([address, city].filter(Boolean).join(', '))];
    const geo = saved || cached;

    if (geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng))) {
      geoPoints.push({
        ...s,
        address,
        lat: Number(geo.lat),
        lng: Number(geo.lng),
        geocodeName: geo.displayName || address
      });
    } else {
      s.resolution.state = 'geocode-pending';
    }
  }

  if (runId !== S.routeRunId) return;
  $('routeFound').textContent = geoPoints.length.toLocaleString('pt-BR');
  $('routeMissing').textContent = (grouped.length - geoPoints.length).toLocaleString('pt-BR');
  renderRouteIssues(grouped);

  const points = [{ ...PHARMAINNOX, isOrigin: true }, ...geoPoints];
  let ordered = geoPoints.slice();
  let route = null;
  let optimized = false;
  const manualOrder = getRouteOrder(dateKey);
  const manualMode = manualOrder.length > 0;

  // Se o usuário já definiu uma ordem manual para este dia, essa ordem
  // é respeitada e o OSRM não tenta reorganizar as paradas automaticamente.
  if (manualMode) {
    ordered = applyManualRouteOrder(geoPoints, manualOrder);
    const currentOrder = ordered.map(getRouteStopKey);
    if (currentOrder.length) saveRouteOrder(dateKey, currentOrder);
  }

  try {
    if (points.length > 2) {
      const routePoints = [{ ...PHARMAINNOX, isOrigin: true }, ...ordered];
      const calc = await calculateRoute(routePoints, !manualMode);
      if (runId !== S.routeRunId) return;
      route = calc.route;
      optimized = calc.optimized;
      ordered = calc.ordered.filter(p => !p.isOrigin);
      $('routeDistance').textContent = formatDistance(route.distance);
      $('routeDuration').textContent = formatDuration(route.duration);
      $('routeBadge').textContent = manualMode
        ? 'Ordem manual · rota recalculada pelas ruas'
        : (optimized ? 'Rota otimizada pelas ruas' : 'Rota calculada pelas ruas');
    }
  } catch (e) {
    console.error('Erro no roteamento:', e);
    $('routeBadge').textContent = 'Rota não calculada';
    $('routeDistance').textContent = '—';
    $('routeDuration').textContent = '—';
    toast('Os endereços foram localizados, mas o roteamento não conseguiu ligar todas as paradas. Verifique se algum ponto está fora da malha rodoviária e use o Google Maps para conferir.');
  }

  const orderedForMarkers = ordered.length ? ordered : geoPoints;
  renderStopsList(orderedForMarkers, dateKey);

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

  // Nunca desenha uma linha reta como se fosse uma rota rodoviária.
  // A geometria abaixo é a geometria real retornada pelo OSRM.
  if (route?.geometry?.coordinates?.length) {
    const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(latlngs, { weight: 10, opacity: 0.35, color: '#ffffff', lineCap: 'round', lineJoin: 'round' }).addTo(S.routeLayer);
    L.polyline(latlngs, { weight: 5, opacity: 0.95, color: '#2f80ed', lineCap: 'round', lineJoin: 'round' }).addTo(S.routeLayer);
    latlngs.forEach(p => bounds.push(p));
  }

  if (bounds.length) S.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
  setTimeout(() => S.map.invalidateSize(), 200);

  const googleUrl = googleDirectionsUrl(orderedForMarkers);
  if (googleUrl) {
    $('openGoogleRoute').disabled = false;
    $('openGoogleRoute').onclick = () => window.open(googleUrl, '_blank', 'noopener,noreferrer');
  }
}

function resetRouteOrder() {
  const dateKey = $('routeDate')?.value || '';
  if (!dateKey || !getManualRouteMode(dateKey)) {
    toast('Este dia já está usando a ordem automática.');
    return;
  }
  clearRouteOrder(dateKey);
  toast('Ordem manual removida. A rota voltará a usar a otimização automática.');
  renderRoute();
}
window.resetRouteOrder = resetRouteOrder;

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

function markAddressSaved(inputId, message = 'Endereço salvo. Será usado na próxima atualização da rota.') {
  const input = $(inputId);
  if (!input) return;
  input.dataset.saved = 'true';
  input.title = message;
  input.style.borderColor = '#63b18b';
  input.style.background = '#f2fbf6';
}

async function saveRouteAddress(code, inputId, fallbackCity, supplierName = '') {
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
  if (!isGoodManualAddress(address)) {
    toast('Digite um endereço ou referência válida.');
    return;
  }

  // 1) Salva primeiro, sem depender da internet.
  const previous = getManualAddress(normalizedCode);
  const addressChanged = !previous || normalizeText(previous.endereco) !== normalizeText(address);
  S.manualAddresses[manualKey(normalizedCode)] = {
    endereco: address,
    cidade: fallbackCity || '',
    origem: 'manual',
    atualizadoEm: new Date().toISOString()
  };
  const geoKey = cacheKeyForGeo(`${supplierName}|${[address, fallbackCity].filter(Boolean).join(', ')}`);
  delete S.geocodeCache[geoKey];
  if (addressChanged) {
    delete S.supplierCoords[normalizedCode];
    saveSupplierCoords();
  }
  saveManualAddresses();
  saveGeoCache();
  markAddressSaved(inputId, 'Endereço salvo. Localizando no mapa...');

  // 2) Cancela qualquer localização anterior para não deixar o indicador preso
  // em "Localizando endereços..." enquanto uma consulta antiga ainda roda.
  S.routeRunId++;
  $('routeBadge').textContent = 'Localizando endereço salvo...';
  toast(`Endereço do fornecedor ${normalizedCode} salvo. Localizando no mapa...`);

  // 3) Tenta localizar imediatamente o endereço que acabou de ser informado.
  try {
    const geo = await geocodeAddress(address, fallbackCity, normalizedCode, supplierName, { force: true });
    if (geo) {
      S.geocodeCache[geoKey] = geo;
      saveGeoCache();
      setSupplierCoords(normalizedCode, geo.lat, geo.lng, 'geocode');
      markAddressSaved(inputId, 'Endereço localizado. Atualizando a rota...');
      toast(`Endereço do fornecedor ${normalizedCode} localizado. Atualizando a rota...`);
    } else {
      markAddressSaved(inputId, 'Endereço salvo. Não foi possível obter coordenadas automaticamente.');
      toast(`Endereço do fornecedor ${normalizedCode} foi salvo, mas não foi localizado automaticamente.`);
    }
  } catch (e) {
    console.warn('Falha ao localizar endereço manual:', e);
    markAddressSaved(inputId, 'Endereço salvo. Falha temporária ao localizar no mapa.');
    toast(`Endereço do fornecedor ${normalizedCode} foi salvo. Falha temporária ao localizar no mapa.`);
  }

  // 4) Recalcula a rota usando o endereço salvo.
  await renderRoute();
}
window.saveRouteAddress = saveRouteAddress;

let activeMapPick = null;
let activeMapPickMarker = null;

function clearMapPickMode(message = '') {
  activeMapPick = null;
  if (activeMapPickMarker) {
    try { S.map.removeLayer(activeMapPickMarker); } catch {}
    activeMapPickMarker = null;
  }
  if (S.map?.getContainer()) S.map.getContainer().style.cursor = '';
  if (message) toast(message);
}

function startMapPick(code, inputId = '', city = '', supplierName = '', addressOverride = '', options = {}) {
  if (!S.map) {
    toast('O mapa ainda está carregando. Aguarde um instante.');
    return;
  }
  if (!normalizeCode(code)) {
    toast('Este fornecedor está sem código e não pode ter coordenada salva.');
    return;
  }

  const address = String(addressOverride || $(inputId)?.value || '').trim();
  if (!isGoodManualAddress(address)) {
    toast('Não há endereço válido para esta parada.');
    return;
  }

  activeMapPick = { code: normalizeCode(code), inputId, city, supplierName, address, overwrite: Boolean(options.overwrite) };
  S.map.getContainer().style.cursor = 'crosshair';
  $('routeBadge').textContent = `Clique no mapa para ${activeMapPick.overwrite ? 'corrigir' : 'marcar'}: ${supplierName || code}`;
  toast(`Modo de marcação ativo para ${supplierName || code}. Clique no ponto correto no mapa.`);
}
window.startMapPick = startMapPick;

function handleMapPick(e) {
  if (!activeMapPick) return;
  const { code, address, city, supplierName } = activeMapPick;
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;

  if (activeMapPickMarker) {
    try { S.map.removeLayer(activeMapPickMarker); } catch {}
  }

  activeMapPickMarker = L.marker([lat, lng], { icon: markerIcon('?', false) }).addTo(S.map)
    .bindPopup(`<b>${escapeHtml(supplierName || code)}</b><br>${escapeHtml(address)}<br>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}<br><br>Localização provisória. Clique novamente em outro ponto para substituir.`)
    .openPopup();

  const ok = setSupplierCoords(code, lat, lng, 'manual-mapa');
  if (!ok) {
    clearMapPickMode('Não foi possível salvar a coordenada.');
    return;
  }

  const keyCode = manualKey(code);
  const existing = getManualAddress(code);
  S.manualAddresses[keyCode] = {
    endereco: address,
    cidade: city || existing?.cidade || '',
    origem: 'manual-mapa',
    atualizadoEm: new Date().toISOString()
  };
  saveManualAddresses();

  clearMapPickMode(`Localização salva para ${supplierName || code}.`);
  renderRoute();
}

function openAddressSearch(inputId, city = '', supplierName = '') {
  const address = $(inputId)?.value.trim();
  const query = address
    ? [address, city, 'SP', 'Brasil'].filter(Boolean).join(', ')
    : [supplierName, city, 'SP', 'Brasil'].filter(Boolean).join(', ');
  if (!query) {
    toast('Informe o fornecedor ou endereço para pesquisar no Google Maps.');
    return;
  }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
window.openAddressSearch = openAddressSearch;

function exportManualAddresses() {
  const exportData = {};
  for (const [code, item] of Object.entries(S.manualAddresses || {})) {
    const coords = getSupplierCoords(code);
    exportData[code] = {
      ...(item || {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng, origemCoordenada: coords.origem || 'manual-mapa' } : {})
    };
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
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
      for (const [code, item] of Object.entries(obj)) {
        if (item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))) {
          setSupplierCoords(code, Number(item.lat), Number(item.lng), item.origemCoordenada || 'importado-json');
        }
      }
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

document.addEventListener('DOMContentLoaded', async () => {
  const renderVehicleFiles=()=>{const list=$('vehicleFileList');if(!list)return;if(!S.vehicleUploads.length){list.innerHTML='<div class="upload-empty-state">Nenhum arquivo selecionado.</div>';return;}list.innerHTML=S.vehicleUploads.map((item,idx)=>{const kind=item.type==='journey'?'JORNADA / KM':item.type==='fuel'?'ABASTECIMENTO':'NÃO IDENTIFICADO';const cls=item.type==='journey'?'source-journey':item.type==='fuel'?'source-fuel':'source-unknown';return `<div class="detected-file-card ${cls}"><div class="detected-file-icon">${item.type==='journey'?'🛣️':item.type==='fuel'?'⛽':'📄'}</div><div class="detected-file-main"><strong>${escapeHtml(item.vehicle||'Veículo não identificado')}</strong><span>${kind}</span><em>${escapeHtml(item.file.name)}</em>${item.error?`<small class="detected-error">${escapeHtml(item.error)}</small>`:`<small>${item.rows.toLocaleString('pt-BR')} registros detectados</small>`}</div><button type="button" class="remove-file-button" data-remove-vehicle-file="${idx}" title="Remover">×</button></div>`;}).join('');list.querySelectorAll('[data-remove-vehicle-file]').forEach(btn=>btn.addEventListener('click',()=>{S.vehicleUploads.splice(Number(btn.dataset.removeVehicleFile),1);renderVehicleFiles();updateSourceStatus();}));};
  const updateSourceStatus=()=>{const valid=S.vehicleUploads.filter(x=>!x.error&&(x.type==='journey'||x.type==='fuel'));$('status').textContent=`${valid.length}/4 arquivos de veículos identificados e ${S.logFiles?.length||0} arquivo(s) de pedidos selecionados.`;};
  $('vehicleFiles').addEventListener('change',async e=>{const files=[...(e.target.files||[])];e.target.value='';for(const file of files){try{const rows=await read(file),type=sourceType(rows);if(type!=='journey'&&type!=='fuel'){S.vehicleUploads.push({file,rows:0,type:'unknown',vehicle:'',error:'Formato não reconhecido como Jornada ou Abastecimento.'});continue;}const vehicleValues=rows.map(r=>String(get(r,type==='journey'?['placa']:['veiculo','placa'])||'').toUpperCase().trim()).filter(Boolean);const allVehicles=[...new Set(vehicleValues)];const vehicle=allVehicles.length===1?allVehicles[0]:'';S.vehicleUploads.push({file,rows:rows.length,type,vehicle,error:allVehicles.length>1?`Mais de um veículo encontrado: ${allVehicles.join(', ')}`:'',parsedRows:rows});}catch(err){S.vehicleUploads.push({file,rows:0,type:'unknown',vehicle:'',error:err?.message||'Não foi possível ler o arquivo.'});}}renderVehicleFiles();updateSourceStatus();});
  $('logFiles').addEventListener('change',e=>{S.logFiles=[...e.target.files];$('logFileList').innerHTML=S.logFiles.map(f=>`<span class="chip source-log">${escapeHtml(f.name)}</span>`).join('');updateSourceStatus();});
  $('update').addEventListener('click',async()=>{const valid=S.vehicleUploads.filter(x=>!x.error&&(x.type==='journey'||x.type==='fuel')),bad=S.vehicleUploads.filter(x=>x.error),logs=S.logFiles||[];const journeys=valid.filter(x=>x.type==='journey'),fuels=valid.filter(x=>x.type==='fuel');if(valid.length!==4||bad.length||!logs.length||journeys.length!==2||fuels.length!==2){toast(`Selecione 4 arquivos válidos de veículos (2 Jornada + 2 Abastecimento). Encontrados: ${journeys.length} jornada e ${fuels.length} abastecimento${logs.length?'':' · falta o arquivo de pedidos'}.`);return;}try{S.fuel=[];S.journey=[];S.log=[];S.sources={fuel:[],journey:[],log:[]};const detectedVehicles=[...new Set(valid.map(x=>x.vehicle).filter(Boolean))].sort();if(detectedVehicles.length!==2||!detectedVehicles.every(v=>valid.some(x=>x.vehicle===v&&x.type==='journey')&&valid.some(x=>x.vehicle===v&&x.type==='fuel')))throw new Error(`Os 4 arquivos não formam dois pares completos por veículo. Veículos encontrados: ${detectedVehicles.join(', ')||'nenhum'}.`);for(const item of valid){const rows=item.parsedRows||await read(item.file);if(item.type==='journey'){const n=normalizeJourney(rows,item.file.name,item.vehicle);S.journey.push(...n);S.sources.journey.push({vehicle:item.vehicle,file:item.file.name,rows:n.length});}else{const n=normalizeFuel(rows,item.file.name,item.vehicle);S.fuel.push(...n);S.sources.fuel.push({vehicle:item.vehicle,file:item.file.name,rows:n.length});}}for(const file of logs){const rows=await read(file),type=sourceType(rows);if(type!=='log')throw new Error(`O arquivo "${file.name}" não parece ser uma base de pedidos/logística.`);const n=normalizeLog(rows);S.log.push(...n);S.sources.log.push({file:file.name,rows:n.length});}
    const seenFuel=new Set();S.fuel=S.fuel.filter(r=>{const sig=[r.date?.getTime()||'',r.vehicle,r.km,Number.isFinite(r.value)?r.value.toFixed(2):''].join('|');if(seenFuel.has(sig))return false;seenFuel.add(sig);return true;});
    const seenJourney=new Set();S.journey=S.journey.filter(r=>{const sig=[r.date?.getTime()||'',r.vehicle,r.statusKey,r.km].join('|');if(seenJourney.has(sig))return false;seenJourney.add(sig);return true;});
    $('vehicleFileList').innerHTML=valid.map(x=>`<div class="detected-file-card ${x.type==='journey'?'source-journey':'source-fuel'}"><div class="detected-file-icon">${x.type==='journey'?'🛣️':'⛽'}</div><div class="detected-file-main"><strong>${escapeHtml(x.vehicle)}</strong><span>${x.type==='journey'?'JORNADA / KM':'ABASTECIMENTO'}</span><em>${escapeHtml(x.file.name)}</em><small>Dados carregados: ${x.rows.toLocaleString('pt-BR')} registros</small></div></div>`).join('');$('logFileList').innerHTML=S.sources.log.map(x=>`<span class="chip source-log">${escapeHtml(x.file)} · ${x.rows.toLocaleString('pt-BR')} registros</span>`).join('');$('vehicle').innerHTML='<option value="todos">Todos</option>'+detectedVehicles.map(v=>`<option>${escapeHtml(v)}</option>`).join('');populateRouteDate();update();await renderRoute();toast(`Atualizado. ${S.sources.journey.length} jornada(s), ${S.sources.fuel.length} abastecimento(s) e ${S.sources.log.length} arquivo(s) de pedidos.`);}catch(e){console.error(e);toast(e?.message||'Não foi possível carregar os arquivos selecionados.');}});
  ['year','vehicle','start','end','periodicity'].forEach(id=>$(id).addEventListener('change',update));$('routeDate').addEventListener('change',renderRoute);$('routeRefresh').addEventListener('click',renderRoute);$('resetRouteOrder').addEventListener('click',resetRouteOrder);$('exportManualAddresses').addEventListener('click',exportManualAddresses);$('importManualAddresses').addEventListener('click',()=>$('manualAddressFile').click());$('manualAddressFile').addEventListener('change',e=>{if(e.target.files[0])importManualAddresses(e.target.files[0]);e.target.value='';});$('clearManualAddresses').addEventListener('click',clearManualAddresses);$('clearGeoCache').addEventListener('click',()=>{S.geocodeCache={};saveGeoCache();toast('Cache automático limpo. As coordenadas confirmadas manualmente foram mantidas.');renderRoute();});$('clear').addEventListener('click',()=>{$('year').value='todos';$('vehicle').value='todos';$('start').value='';$('end').value='';$('periodicity').value='month';update();});$('export').addEventListener('click',()=>{const rows=S.filteredFuel.map(r=>({Data:r.dateText,Veiculo:r.vehicle,Valor:r.value,PrecoPorLitro:Number.isFinite(r.price)?r.price:'',Litros:Number.isFinite(r.liters)?r.liters:'',KM:r.km}));const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Abastecimento');XLSX.writeFile(wb,'abastecimentos_filtrados.xlsx');});loadManualAddresses();loadGeoCache();loadCepCache();loadSupplierCoords();await loadBundledManualAddresses();initMap();renderVehicleFiles();update();
});
