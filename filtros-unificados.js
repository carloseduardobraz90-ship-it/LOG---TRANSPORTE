/* Estado único: os controles da operação são a fonte dos filtros de todas as abas. */
(() => {
 'use strict';
 const val=id=>document.getElementById(id)?.value||'';
 const specific=['statusFilter','categoryFilter','supplierFilter','serviceFilter','projectFilter','regionFilter'];
 const defaults={statusFilter:'TODOS',categoryFilter:'TODAS',supplierFilter:'TODOS',serviceFilter:'TODOS',projectFilter:'TODOS',regionFilter:'TODAS'};
 function orderFilters(){return {year:val('year'),month:val('analysisMonth'),week:val('analysisWeek'),weekday:val('analysisWeekday'),start:val('start'),end:val('end'),status:val('lg-statusFilter'),category:val('lg-categoryFilter'),supplier:val('lg-supplierFilter'),service:val('lg-serviceFilter'),project:val('lg-projectFilter'),region:val('lg-regionFilter')};}
 function refreshOptions(){
  const el=document.getElementById('year');if(!el)return;
  const current=el.value,dates=[...S.journey.map(r=>r.date),...S.fuel.map(r=>r.date),...S.log.map(r=>r._scheduleDate)].filter(d=>d&&!isNaN(d));
  const years=[...new Set([...dates.map(d=>String(d.getFullYear())),...(current&&current!=='todos'?[current]:[])])].sort();
  el.innerHTML='<option value="todos">Todos os anos</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');el.value=current||'todos';
 }
 function renderScope(){
  const el=document.getElementById('unifiedScope');if(!el)return;const labels=[];
  if(val('year')!=='todos')labels.push('Ano '+val('year'));
  if(val('analysisMonth'))labels.push('Mês '+val('analysisMonth').split('-').reverse().join('/'));
  if(val('analysisWeek'))labels.push('Semana '+val('analysisWeek'));
  if(val('analysisWeekday'))labels.push(['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][Number(val('analysisWeekday'))]);
  if(val('start'))labels.push('De '+val('start').split('-').reverse().join('/'));
  if(val('end'))labels.push('Até '+val('end').split('-').reverse().join('/'));
  if(val('vehicle')!=='todos')labels.push('Veículo '+val('vehicle'));
  const count=specific.filter(x=>val('lg-'+x)!==defaults[x]&&val('lg-'+x)).length;
  if(count)labels.push(count+' refinamento(s) de pedidos');
  const invalid=val('start')&&val('end')&&val('start')>val('end');
  el.textContent=invalid?'A data inicial é posterior à final. Ajuste o intervalo para consultar os dados.':labels.length?labels.join(' · '):'Toda a operação · sem filtros';
  el.classList.toggle('invalid',Boolean(invalid));document.getElementById('unifiedOrderCount').textContent=count?'('+count+' ativo'+(count>1?'s':'')+')':'';
 }
 function refreshRoutes(){populateRouteDate();if(isRouteViewActive())renderRoute();}
 function clearAll(){
  for(const [id,value] of Object.entries({year:'todos',vehicle:'todos',start:'',end:'',analysisMonth:'',analysisWeek:'',analysisWeekday:'',periodicity:'month'}))document.getElementById(id).value=value;
  for(const id of specific)document.getElementById('lg-'+id).value=defaults[id];
  refreshAnalysisWeeks();update();refreshRoutes();renderScope();
 }
 window.PharmainoxFilters={orderFilters,refreshOptions,renderScope,clear:clearAll};
 // Paleta fixa por significado. A mesma placa mantém a cor em todas as visualizações.
 const palette=['#2675CE','#DD7D20','#29856B','#8D58B3','#0891B2','#C84E69'];
 const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const hash=s=>[...String(s)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
 function vehicleColor(v){const vehicles=[...new Set([...S.journey,...S.fuel].map(r=>r.vehicle))].sort();const i=vehicles.indexOf(v);return palette[i>=0?i%palette.length:hash(v)%palette.length];}
 function semantic(s){const n=fold(s);if(n.includes('finaliz')||n.includes('entregue'))return '#29856B';if(n.includes('cancel')||n.includes('atras')||n.includes('vencid'))return '#C84E69';if(n.includes('pend')||n.includes('aguard'))return '#DD7D20';if(n==='coleta')return '#2675CE';if(n==='entrega')return '#29856B';if(n==='recebimento')return '#8D58B3';return palette[hash(n)%palette.length];}
 function chartColors(chart){const id=chart.canvas?.id||'',labels=chart.data.labels||[],isVehicle=['vehicleValue','vehicleLiters','distanceVehicle','kmlVehicle','distanceWeekday','kmlWeekday'].includes(id),isStatus=id==='lg-chartStatus',isCategory=id==='lg-chartCategoria';
  chart.data.datasets.forEach((ds,i)=>{let c;
   if(isStatus||isCategory)c=labels.map(semantic);
   else if(['vehicleValue','vehicleLiters'].includes(id))c=labels.map(vehicleColor);
   else if(isVehicle)c=vehicleColor(ds.label);
   else if(id==='lg-chartVisitasSemana')c=palette[hash(ds.label)%palette.length];
   else c=/liters/i.test(id)?'#29856B':/consumption|kml/i.test(id)?'#8D58B3':'#2675CE';
   ds.borderColor=c;ds.backgroundColor=Array.isArray(c)?c:c+(chart.config.type==='line'?'22':'BB');
  });
 }
 if(typeof Chart!=='undefined')Chart.register({id:'pharmainoxUnifiedColors',beforeUpdate:chartColors});
 document.addEventListener('DOMContentLoaded',()=>{
  // Move a barra para fora das páginas: trocar de aba não recria os controles.
  document.getElementById('clear').addEventListener('click',clearAll);
  for(const id of specific)document.getElementById('lg-'+id).addEventListener('change',()=>{update();refreshRoutes();});
  for(const id of ['year','vehicle','start','end','analysisMonth','analysisWeek','analysisWeekday','periodicity'])document.getElementById(id).addEventListener('change',()=>{refreshRoutes();renderScope();});
  document.querySelectorAll('[data-app-view]').forEach(link=>link.addEventListener('click',renderScope));
  refreshOptions();renderScope();update();
 });
})();
