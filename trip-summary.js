const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>value?String(value).slice(0,10).split('-').reverse().join('/'):'Não informada';

function renderTripSummary(trip,documents,company){
 const fields=[['Origem',trip.origin],['Destino',trip.destination],['Data início',date(trip.start_date)],['Data fim',date(trip.end_date)],['Quilometragem',trip.mileage==null?'Não informada':`${number.format(trip.mileage)} km`],['Valor do frete',trip.freight_value==null?'Não informado':money.format(trip.freight_value)],['Cliente',trip.customer_name||'Não informado'],['Motorista',trip.driver_name||'Não informado'],['Veículo',[trip.plate||trip.vehicle,trip.model].filter(Boolean).join(' · ')||'Não informado']];
 const rows=documents.map(doc=>`<tr><td>${esc(doc.document_type)}</td><td class="numeric${doc.amount==null?'':doc.nature==='credit'?' amount-credit':' amount-debit'}">${doc.amount==null?'—':money.format(doc.nature==='credit'?Math.abs(Number(doc.amount)):-Math.abs(Number(doc.amount)))}</td><td class="numeric">${doc.diesel_value==null?'—':money.format(doc.diesel_value)}</td><td class="numeric">${doc.km==null?'—':number.format(doc.km)}</td><td class="description">${esc(doc.description)}</td></tr>`).join('');
 const credit=documents[0]?.total_credit??0,debit=documents[0]?.total_debit??0;
 const total=documents[0]?.total_amount??0;
 const pending=trip.freight_value==null?null:(Math.round(Number(credit)*100)-Math.round(Number(trip.freight_value)*100))/100;
 const pendingField=`<dt class="pending-label">Valor pendente recebimento</dt><dd${pending>0?' class="amount-credit"':pending<0?' class="amount-debit"':''}>${pending==null?'Não informado':money.format(pending)}</dd>`;
 const commissionField=`<dt class="pending-label">Comissão do motorista pendente</dt><dd>${trip.driver_commission_pending==null?'Não informado':money.format(trip.driver_commission_pending)}</dd>`;
 return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumo da viagem ${esc(trip.code)}</title><link rel="stylesheet" href="/trip-summary.css"></head>
<body><main><header><p class="company">${esc(company)}</p><h1>Resumo da viagem</h1><p class="code">${esc(trip.code)}</p></header>
<dl class="trip-fields">${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd>${label==='Valor do frete'?pendingField:label==='Quilometragem'?commissionField:''}</div>`).join('')}</dl>
<table><caption>Documentos anexados à viagem</caption><thead><tr><th scope="col">Tipo</th><th scope="col" class="numeric">Valor</th><th scope="col" class="numeric">Valor Diesel</th><th scope="col" class="numeric">KM</th><th scope="col">Descrição</th></tr></thead>
<tbody>${rows||'<tr><td colspan="5" class="empty">Nenhum documento anexado à viagem.</td></tr>'}</tbody>
<tfoot><tr><th scope="row">Total de crédito</th><td class="numeric amount-credit">${money.format(credit)}</td><td colspan="3"></td></tr>
<tr><th scope="row">Total de débito</th><td class="numeric amount-debit">${money.format(Number(debit)===0?0:-Math.abs(Number(debit)))}</td><td colspan="3"></td></tr>
<tr class="balance"><th scope="row">Total</th><td class="numeric${Number(total)>0?' amount-credit':Number(total)<0?' amount-debit':''}">${money.format(total)}</td><td colspan="3"></td></tr></tfoot></table>
<p class="footnote">Total = créditos − débitos dos documentos anexados à viagem, conforme a natureza configurada para cada tipo.</p></main></body></html>`;
}
module.exports={renderTripSummary};
