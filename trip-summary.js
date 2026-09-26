const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Não informada';

function renderTripSummary(trip,documents,company){
 const fields=[['Origem',trip.origin],['Destino',trip.destination],['Data início',date(trip.start_date)],['Data fim',date(trip.end_date)],['Quilometragem',trip.mileage==null?'Não informada':`${number.format(trip.mileage)} km`],['Valor do frete',trip.freight_value==null?'Não informado':money.format(trip.freight_value)],['Cliente',trip.customer_name||'Não informado'],['Motorista',trip.driver_name||'Não informado'],['Veículo',[trip.plate||trip.vehicle,trip.model].filter(Boolean).join(' · ')||'Não informado']];
 const rows=documents.map(doc=>`<tr><td>${esc(doc.document_type)}</td><td class="numeric">${doc.amount==null?'—':money.format(doc.amount)}</td><td class="numeric">${doc.km==null?'—':number.format(doc.km)}</td><td class="description">${esc(doc.description)}</td></tr>`).join('');
 const total=documents[0]?.total_amount??0;
 return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumo da viagem ${esc(trip.code)}</title><link rel="stylesheet" href="/trip-summary.css"></head>
<body><main><header><p class="company">${esc(company)}</p><h1>Resumo da viagem</h1><p class="code">${esc(trip.code)}</p></header>
<dl class="trip-fields">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
<table><caption>Documentos anexados à viagem</caption><thead><tr><th scope="col">Tipo</th><th scope="col" class="numeric">Valor</th><th scope="col" class="numeric">KM</th><th scope="col">Descrição</th></tr></thead>
<tbody>${rows||'<tr><td colspan="4" class="empty">Nenhum documento anexado à viagem.</td></tr>'}</tbody>
<tfoot><tr><th scope="row">Total</th><td class="numeric">${money.format(total)}</td><td colspan="2"></td></tr></tfoot></table>
<p class="footnote">Total referente aos valores dos documentos anexados à viagem.</p></main></body></html>`;
}
module.exports={renderTripSummary};
