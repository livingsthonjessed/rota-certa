// Targeted frontend logic checks; these do not replace browser/visual testing.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
function functionSource(name,next){return source.slice(source.indexOf(`function ${name}(`),source.indexOf(next,source.indexOf(`function ${name}(`)))}
const nodes={},context={
 money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),
 esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 formatDate:v=>v?new Date(v.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'Não informada',
 $:selector=>nodes[selector],tripDesktop:{matches:true},opened:0,
 openTripAdminDialog:()=>context.opened++,
};
vm.createContext(context);
vm.runInContext(functionSource('renderTripGrid','function setupTripDesktop'),context);
const trip={id:17,code:'VG-17',origin:'<img onerror=alert(1)>',destination:'São Paulo',start_date:'2026-09-30',end_date:'2026-10-01',mileage:1234.5,freight_value:1500.25,driver_commission:0,driver_commission_amount:0,driver_commission_pending:-25,customer_name:'Cliente',driver_name:'Motorista',plate:'ABC1D23'};
const html=context.renderTripGrid([trip]);
assert.equal((html.match(/<td[ >]/g)||[]).length,12);
assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
assert.ok(!html.includes('<img'));
for(const value of ['São Paulo','30/09/2026','01/10/2026','1.234,5','0%','Cliente','Motorista','ABC1D23',context.money.format(1500.25),context.money.format(0),context.money.format(-25),'data-admin-edit="17"','/api/admin/trips/17/summary','data-trip-documents="17"'])assert.ok(html.includes(value),value);
assert.ok(context.renderTripGrid([]).includes('colspan="12"'));
assert.ok(context.renderTripGrid([{...trip,driver_commission:null,driver_commission_amount:null,driver_commission_pending:null}]).includes('<td class="trip-number">—</td>'));
// Resizing moves the same form rather than rebuilding/clearing it.
const form={elements:[{tagName:'INPUT',value:'Dados em edição'}]},host={append(child){child.parentElement=this}},dialog={open:false,append(child){child.parentElement=this},close(){this.open=false}};
form.parentElement=host;nodes['#admin-form']=form;nodes['#trip-inline-form']=host;nodes['#trip-admin-dialog']=dialog;nodes['#admin-view']={hidden:false};nodes['#admin-cancel-edit']={};context.editingAdminId=null;
vm.runInContext(functionSource('syncTripLayout',"tripDesktop.addEventListener"),context);
context.syncTripLayout();assert.equal(form.parentElement,dialog);assert.equal(context.opened,1);
dialog.open=true;context.tripDesktop.matches=false;context.syncTripLayout();assert.equal(dialog.open,false);assert.equal(form.parentElement,host);assert.equal(form.elements[0].value,'Dados em edição');
form.elements[0].value='';context.tripDesktop.matches=true;context.syncTripLayout();assert.equal(context.opened,1);
// Editing a trip opens the modal on desktop and scrolls to the inline form on mobile.
context.currentAdminItems=[{...trip,origin:'Origem',freight_value:1500,customer_id:1,driver_id:2,vehicle_id:3}];context.currentAdminResource='trips';
const fields=['origin','destination','startDate','endDate','mileage','freightValue','driverCommission','customerId','driverId','vehicleId'];
form.elements=Object.fromEntries(fields.map(name=>[name,{value:''}]));form.scrollIntoView=()=>context.scrolled=true;
for(const name of ['admin-form-label','admin-form-title','admin-save','admin-cancel-edit'])nodes['#'+name]={};
context.adminTitles={trips:'Cadastro de viagens'};
vm.runInContext(functionSource('startAdminEdit',"$('#login-form').addEventListener"),context);
context.startAdminEdit(17);assert.equal(context.opened,2);assert.equal(form.elements.driverCommission.value,0);assert.equal(form.elements.vehicleId.value,3);
context.tripDesktop.matches=false;context.startAdminEdit(17);assert.equal(context.scrolled,true);assert.equal(context.opened,2);
console.log('Layout: 12 colunas, valores, ações, escape HTML, estado vazio, edição e preservação de dados ao redimensionar passaram.');
const trips=Array.from({length:23},(_,i)=>({...trip,id:i+1,start_date:`2026-09-${String(i+1).padStart(2,'0')}`,origin:i<11?'Belém':'Curitiba'}));
let page=context.tripGridPageData(trips);
assert.equal(page.items.length,10);assert.equal(page.items[0].id,23);assert.equal(page.items[9].id,14);assert.equal(page.pages,3);
page=context.tripGridPageData(trips,'',2);assert.equal(page.items[0].id,13);assert.equal(page.items.length,10);
page=context.tripGridPageData(trips,'',3);assert.equal(page.items.length,3);assert.equal(page.items[2].id,1);
page=context.tripGridPageData(trips,'belem',99);assert.equal(page.total,11);assert.equal(page.page,2);assert.equal(page.items.length,1);
page=context.tripGridPageData(trips,'inexistente');assert.equal(page.total,0);assert.equal(page.first,0);assert.equal(page.last,0);assert.equal(page.pages,1);
page=context.tripGridPageData([{...trip,id:1},{...trip,id:2},{...trip,id:3,start_date:null}]);assert.equal(page.items[0].id,2);assert.equal(page.items[2].id,3);
assert.equal(trips[0].id,1,'Source order must remain unchanged');
console.log('Ordenação decrescente, desempate, filtro, limite de 10, última página e estado vazio passaram.');
