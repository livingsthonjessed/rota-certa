// Real HTTP and PostgreSQL checks, isolated from business data in a temporary schema.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {migrateDocumentTypes}=require('./migrate-document-types');
const root=path.join(__dirname,'..'),schemaName=`document_types_qa_${Date.now()}`;
let admin,db,server,created=false,checks=0;
async function main(){
 const url=new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only local PostgreSQL is supported');
 admin=new Client({connectionString:url.href});await admin.connect();
 await admin.query(`CREATE SCHEMA "${schemaName}"`);created=true;
 url.searchParams.set('options',`-c search_path=${schemaName}`);
 const env={...process.env,DATABASE_URL:url.href,PORT:'18081',NODE_ENV:'test',GOOGLE_MAPS_API_KEY:''};
 db=new Client({connectionString:url.href});await db.connect();
 const schema=fs.readFileSync(path.join(__dirname,'migrate-to-postgres.js'),'utf8').match(/const schema = `([\s\S]*?)`;/)[1];
 await db.query(schema);
 for(const file of ['migrate-admin-modules.js','migrate-multicompany.js']){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{env,cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,`Migration ${file}: ${result.stderr}`);
 }
 const company=(await db.query("INSERT INTO companies(name,cep,cnpj,responsible_email,responsible_name) VALUES ('Legacy','01001000','11222333000181','legacy@example.test','Legacy') RETURNING id")).rows[0].id;
 const legacyUser=(await db.query("INSERT INTO users(name,email,password_hash,role,company_id) VALUES ('Legacy','legacy@example.test','unused','driver',$1) RETURNING id",[company])).rows[0].id;
 const legacyTrip=(await db.query("INSERT INTO trips(code,origin,destination,vehicle,budget,driver_id,company_id) VALUES ('LEGACY','A','B','ABC1D23',100,$1,$2) RETURNING id",[legacyUser,company])).rows[0].id;
 await db.query("INSERT INTO trip_documents(trip_id,company_id,created_by,document_type,description,amount,file_name,file_type,file_data) VALUES ($1,$2,$3,'Outros gastos','Legacy',42.50,'legacy.pdf','application/pdf','data:application/pdf;base64,AA==')",[legacyTrip,company,legacyUser]);
 const before=(await db.query('SELECT * FROM trip_documents WHERE trip_id=$1',[legacyTrip])).rows;
 await migrateDocumentTypes(db);
 assert.deepEqual((await db.query('SELECT * FROM trip_documents WHERE trip_id=$1',[legacyTrip])).rows,before);checks++;
 await db.query("UPDATE document_types SET nature='debit' WHERE company_id=$1 AND name='CTE'",[company]);
 await migrateDocumentTypes(db);
 assert.equal((await db.query("SELECT nature FROM document_types WHERE company_id=$1 AND name='CTE'",[company])).rows[0].nature,'debit');
 assert.equal((await db.query('SELECT COUNT(*)::int total FROM document_types WHERE company_id=$1',[company])).rows[0].total,4);checks+=2;
 server=spawn(process.execPath,['server.js'],{env,cwd:root,stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);
  server.stdout.on('data',data=>{if(data.toString().includes('disponíveis')){clearTimeout(timer);resolve()}});
  server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`))});
 });
 async function req(route,method='GET',body,cookie='',status=200){
  const response=await fetch('http://127.0.0.1:18081'+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,status,`${method} ${route}: ${JSON.stringify(data)}`);checks++;
  return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const password='TemporaryTest123!';
 for(const [email,cnpj] of [['a@example.test','12345678000195'],['b@example.test','98765432000198']]){
  await req('/api/companies','POST',{name:'QA',cep:'01001000',cnpj,email,responsibleName:'Admin',password},'',201);
 }
 const a=(await req('/api/login','POST',{email:'a@example.test',password})).cookie;
 const b=(await req('/api/login','POST',{email:'b@example.test',password})).cookie;
 const endpoint='/api/admin/document-types';
 await req(endpoint,'GET',undefined,'',401);
 const types=(await req(endpoint,'GET',undefined,a)).data.items;
 assert.equal(types.length,4);assert.equal(types.find(t=>t.name==='Pagamento cliente').nature,'credit');checks+=2;
 await req(endpoint,'PUT',{name:'Pagamento cliente',nature:'debit'},a);
 assert.equal((await req(endpoint,'GET',undefined,a)).data.items.find(t=>t.name==='Pagamento cliente').nature,'debit');
 assert.equal((await req(endpoint,'GET',undefined,b)).data.items.find(t=>t.name==='Pagamento cliente').nature,'credit');checks+=2;
 await req(endpoint,'PUT',{name:'Pagamento cliente',nature:'invalid'},a,400);
 await req(endpoint,'PUT',{name:'Unknown',nature:'credit'},a,404);
 await req('/api/admin/users','POST',{name:'Driver',email:'driver@example.test',password,cpf:'52998224725',role:'driver'},a,201);
 const driverCookie=(await req('/api/login','POST',{email:'driver@example.test',password})).cookie;
 await req(endpoint,'GET',undefined,driverCookie,403);
 await req(endpoint,'PUT',{name:'Pagamento cliente',nature:'credit'},driverCookie,403);
 const driver=(await db.query("SELECT id,company_id FROM users WHERE email='driver@example.test'")).rows[0];
 const trip=(await db.query("INSERT INTO trips(code,origin,destination,vehicle,budget,driver_id,company_id,status) VALUES ('QA-DOC','A','B','ABC1D23',100,$1,$2,'available') RETURNING id",[driver.id,driver.company_id])).rows[0].id;
 const route=`/api/admin/trips/${trip}/documents`;
 const doc={documentType:'Pagamento cliente',description:'Pagamento parcial',amount:123.45,fileName:'test.png',fileType:'image/png',fileData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
 for(const amount of [null,0,-10,'Infinity',10000000000])await req(route,'POST',{...doc,amount},a,400);
 const id=(await req(route,'POST',doc,a,201)).data.id;
 let item=(await req(route,'GET',undefined,a)).data.items[0];
 assert.equal(item.amount,123.45);assert.equal(item.nature,'debit');assert.equal(item.km,null);checks+=3;
 await req(endpoint,'PUT',{name:'Pagamento cliente',nature:'credit'},a);
 assert.equal((await req(route,'GET',undefined,a)).data.items[0].nature,'credit');checks++;
 await req(`/api/admin/trip-documents/${id}`,'PUT',{documentType:'Pagamento cliente',description:'Atualizado',amount:50},a);
 item=(await req(route,'GET',undefined,a)).data.items[0];assert.equal(item.amount,50);assert.equal(item.file_name,'test.png');checks+=2;
 await req(route,'POST',doc,b,404);
 await req(`/api/admin/trip-documents/${id}`,'PUT',{documentType:'Pagamento cliente',description:'Proibido',amount:1},b,404);
 assert.deepEqual((await req(route,'GET',undefined,b)).data.items,[]);checks++;
 await req(route,'POST',{...doc,documentType:'CTE',amount:null},a,201);
 await req(route,'POST',{...doc,documentType:'Abastecimento',km:100,dieselValue:6.5},a,201);
 await req(route,'POST',{...doc,documentType:'Outros gastos'},a,201);
 await req(route,'POST',{...doc,documentType:'Unknown'},a,400);
 await req(`/api/admin/trip-documents/${id}`,'DELETE',undefined,a);
 console.log(`${checks} verificações passaram: migração, persistência, documentos e isolamento por empresa/perfil.`);
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
 if(server&&server.exitCode===null){await new Promise(resolve=>{server.once('exit',resolve);server.kill()})}
 if(db)await db.end();
 if(created)await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
 if(admin)await admin.end();
});
