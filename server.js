require('dotenv').config();
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const PORT=Number(process.env.PORT||8000),ROOT=__dirname;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada no arquivo .env.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,idleTimeoutMillis:30000});
pool.on('error',err=>console.error('Erro inesperado no PostgreSQL:',err.message));

function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`}
function verifyPassword(password,stored){const [salt,expected]=stored.split(':'),actual=crypto.scryptSync(password,salt,64);return actual.length===Buffer.from(expected,'hex').length&&crypto.timingSafeEqual(actual,Buffer.from(expected,'hex'))}
const digits=value=>String(value||'').replace(/\D/g,'');
function isValidCpf(value){const cpf=digits(value);if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return false;for(let size=9;size<=10;size++){let sum=0;for(let i=0;i<size;i++)sum+=Number(cpf[i])*(size+1-i);const digit=(sum*10)%11%10;if(digit!==Number(cpf[size]))return false}return true}
function isValidEmail(value){const email=String(value||'').trim();return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)}
function isValidCnpj(value){const cnpj=digits(value);if(cnpj.length!==14||/^(\d)\1{13}$/.test(cnpj))return false;const calc=size=>{let sum=0,pos=size-7;for(let i=size;i>=1;i--){sum+=Number(cnpj[size-i])*pos--;if(pos<2)pos=9}const result=sum%11;return result<2?0:11-result};return calc(12)===Number(cnpj[12])&&calc(13)===Number(cnpj[13])}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
function send(res,status,data,headers={}){const value=typeof data==='string'?data:JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(value)}
function readBody(req){return new Promise((resolve,reject)=>{let value='';req.on('data',chunk=>{value+=chunk;if(value.length>8_000_000){reject(new Error('Payload muito grande'));req.destroy()}});req.on('end',()=>{try{resolve(value?JSON.parse(value):{})}catch{reject(new Error('JSON inválido'))}});req.on('error',reject)})}
async function auth(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(!token)return null;const hash=crypto.createHash('sha256').update(token).digest('hex');const result=await pool.query(`SELECT u.id,u.name,u.email,u.role,u.company_id,c.name company_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[hash]);return result.rows[0]||null}
async function tripAccess(id,user){const result=user.role==='admin'?await pool.query('SELECT id,code,origin,destination,vehicle,budget::float8 budget,driver_id,status,started_at,submitted_at,closed_at,review_notes,company_id FROM trips WHERE id=$1 AND company_id=$2',[id,user.company_id]):await pool.query('SELECT id,code,origin,destination,vehicle,budget::float8 budget,driver_id,status,started_at,submitted_at,closed_at,review_notes,company_id FROM trips WHERE id=$1 AND driver_id=$2 AND company_id=$3',[id,user.id,user.company_id]);return result.rows[0]}

async function api(req,res,url){
 if(req.method==='POST'&&url.pathname==='/api/companies'){
  const d=await readBody(req),cnpj=digits(d.cnpj),cep=digits(d.cep);if(!d.name||!isValidCnpj(cnpj)||cep.length!==8||!isValidEmail(d.email)||!d.responsibleName||String(d.password||'').length<8)return send(res,400,{error:'Preencha os dados, informe CNPJ e e-mail válidos e senha com ao menos 8 caracteres.'});
  const client=await pool.connect();try{await client.query('BEGIN');const company=(await client.query('INSERT INTO companies (name,cep,cnpj,responsible_email,responsible_name) VALUES ($1,$2,$3,$4,$5) RETURNING id',[d.name.trim(),cep,cnpj,d.email.trim().toLowerCase(),d.responsibleName.trim()])).rows[0];await client.query("INSERT INTO users (name,email,password_hash,role,company_id) VALUES ($1,$2,$3,'admin',$4)",[d.responsibleName.trim(),d.email.trim().toLowerCase(),hashPassword(d.password),company.id]);await client.query('COMMIT');return send(res,201,{ok:true})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 if(req.method==='POST'&&url.pathname==='/api/login'){
  const data=await readBody(req);if(!isValidEmail(data.email))return send(res,400,{error:'Informe um e-mail válido.'});const result=await pool.query('SELECT * FROM users WHERE email=$1',[String(data.email).trim().toLowerCase()]),loginUser=result.rows[0];
  if(!loginUser||!verifyPassword(String(data.password||''),loginUser.password_hash))return send(res,401,{error:'E-mail ou senha inválidos.'});
  const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
  await pool.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '7 days')",[hash,loginUser.id]);
  const company=(await pool.query('SELECT name FROM companies WHERE id=$1',[loginUser.company_id])).rows[0];return send(res,200,{user:{id:loginUser.id,name:loginUser.name,email:loginUser.email,role:loginUser.role,company_id:loginUser.company_id,company_name:company.name}},{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`});
 }
 const user=await auth(req);if(!user)return send(res,401,{error:'Sessão não autenticada.'});
 if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user});
 if(req.method==='POST'&&url.pathname==='/api/logout')return send(res,200,{ok:true},{'Set-Cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 if(url.pathname.startsWith('/api/admin/')){
  if(user.role!=='admin')return send(res,403,{error:'Acesso exclusivo para administradores.'});
  const resource=url.pathname.slice('/api/admin/'.length);
  if(req.method==='GET'&&resource==='options'){
   const [drivers,customers,vehicles]=await Promise.all([
    pool.query("SELECT id,name FROM users WHERE role='driver' AND company_id=$1 ORDER BY name",[user.company_id]),
    pool.query('SELECT id,name,cnpj FROM customers WHERE company_id=$1 ORDER BY name',[user.company_id]),
    pool.query('SELECT id,plate,model FROM vehicles WHERE company_id=$1 ORDER BY plate',[user.company_id])
   ]);return send(res,200,{drivers:drivers.rows,customers:customers.rows,vehicles:vehicles.rows});
  }
  if(req.method==='GET'&&resource==='users'){const result=await pool.query("SELECT id,name,email,cpf,role,(photo_data IS NOT NULL) has_photo FROM users WHERE company_id=$1 ORDER BY name",[user.company_id]);return send(res,200,{items:result.rows})}
  if(req.method==='GET'&&resource==='customers'){const result=await pool.query('SELECT * FROM customers WHERE company_id=$1 ORDER BY name',[user.company_id]);return send(res,200,{items:result.rows})}
  if(req.method==='GET'&&resource==='vehicles'){const result=await pool.query('SELECT * FROM vehicles WHERE company_id=$1 ORDER BY plate',[user.company_id]);return send(res,200,{items:result.rows})}
  if(req.method==='GET'&&resource==='trips'){
   const result=await pool.query(`SELECT t.id,t.code,t.origin,t.destination,t.mileage::float8 mileage,t.freight_value::float8 freight_value,t.status,c.name customer_name,u.name driver_name,COALESCE(v.plate,t.vehicle) plate FROM trips t JOIN users u ON u.id=t.driver_id LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN vehicles v ON v.id=t.vehicle_id WHERE t.company_id=$1 ORDER BY t.id DESC`,[user.company_id]);return send(res,200,{items:result.rows});
  }
  if(req.method==='PUT'&&resource==='users'){
   const d=await readBody(req),targetId=Number(url.searchParams.get('id')),rawCpf=String(d.cpf||''),cpf=digits(rawCpf);if(!targetId||!d.name||!/^\d{11}$/.test(rawCpf)||!isValidCpf(cpf)||!['admin','driver'].includes(d.role)||!isValidEmail(d.email)||d.password&&String(d.password).length<8)return send(res,400,{error:'Informe nome, CPF válido, tipo, e-mail válido e, se alterada, senha com ao menos 8 caracteres.'});
   if(targetId===user.id&&d.role!=='admin')return send(res,400,{error:'Você não pode remover sua própria permissão de administrador.'});
   if(d.photoData&&(!/^data:image\/(jpeg|png|webp);base64,/.test(d.photoData)||d.photoData.length>3_000_000))return send(res,400,{error:'Foto inválida ou maior que 2 MB.'});
   const password=d.password?hashPassword(d.password):null,result=await pool.query(`UPDATE users SET name=$1,email=$2,role=$3,cpf=$4,password_hash=COALESCE($5,password_hash),photo_data=COALESCE($6,photo_data) WHERE id=$7 AND company_id=$8`,[d.name.trim(),d.email.trim().toLowerCase(),d.role,cpf,password,d.photoData||null,targetId,user.company_id]);return result.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Usuário não encontrado.'});
  }
  if(req.method==='PUT'&&resource==='customers'){
   const d=await readBody(req),targetId=Number(url.searchParams.get('id')),cnpj=digits(d.cnpj),cep=digits(d.cep);if(!targetId||!d.name||cnpj.length!==14||cep.length!==8||!d.number||!d.phone||!d.contactName)return send(res,400,{error:'Preencha os campos obrigatórios e confira CNPJ e CEP.'});
   const result=await pool.query('UPDATE customers SET name=$1,cnpj=$2,cep=$3,address_number=$4,complement=$5,phone=$6,contact_name=$7 WHERE id=$8 AND company_id=$9',[d.name.trim(),cnpj,cep,d.number.trim(),d.complement?.trim()||'',d.phone.trim(),d.contactName.trim(),targetId,user.company_id]);return result.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Cliente não encontrado.'});
  }
  if(req.method==='PUT'&&resource==='vehicles'){
   const d=await readBody(req),targetId=Number(url.searchParams.get('id')),plate=String(d.plate||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase(),renavam=digits(d.renavam);if(!targetId||plate.length!==7||!d.model||!d.chassis||renavam.length<9||renavam.length>11)return send(res,400,{error:'Preencha os dados e confira placa e Renavam.'});
   const result=await pool.query('UPDATE vehicles SET plate=$1,model=$2,chassis=$3,renavam=$4 WHERE id=$5 AND company_id=$6',[plate,d.model.trim(),d.chassis.trim().toUpperCase(),renavam,targetId,user.company_id]);if(result.rowCount)await pool.query('UPDATE trips SET vehicle=$1 WHERE vehicle_id=$2 AND company_id=$3',[plate,targetId,user.company_id]);return result.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Veículo não encontrado.'});
  }
  if(req.method==='POST'&&resource==='users'){
   const d=await readBody(req),rawCpf=String(d.cpf||''),cpf=digits(rawCpf);if(!d.name||!/^\d{11}$/.test(rawCpf)||!isValidCpf(cpf)||!['admin','driver'].includes(d.role)||!isValidEmail(d.email)||String(d.password||'').length<8)return send(res,400,{error:'Informe nome, CPF válido com exatamente 11 números, tipo, e-mail válido e senha com ao menos 8 caracteres.'});
   if(d.photoData&&(!/^data:image\/(jpeg|png|webp);base64,/.test(d.photoData)||d.photoData.length>3_000_000))return send(res,400,{error:'Foto inválida ou maior que 2 MB.'});
   await pool.query('INSERT INTO users (name,email,password_hash,role,cpf,photo_data,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',[d.name.trim(),d.email.trim().toLowerCase(),hashPassword(d.password),d.role,cpf,d.photoData||null,user.company_id]);return send(res,201,{ok:true});
  }
  if(req.method==='POST'&&resource==='customers'){
   const d=await readBody(req),cnpj=digits(d.cnpj),cep=digits(d.cep);if(!d.name||cnpj.length!==14||cep.length!==8||!d.number||!d.phone||!d.contactName)return send(res,400,{error:'Preencha os campos obrigatórios e confira CNPJ e CEP.'});
   await pool.query('INSERT INTO customers (name,cnpj,cep,address_number,complement,phone,contact_name,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[d.name.trim(),cnpj,cep,d.number.trim(),d.complement?.trim()||'',d.phone.trim(),d.contactName.trim(),user.company_id]);return send(res,201,{ok:true});
  }
  if(req.method==='POST'&&resource==='vehicles'){
   const d=await readBody(req),plate=String(d.plate||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase(),renavam=digits(d.renavam);if(plate.length!==7||!d.model||!d.chassis||renavam.length<9||renavam.length>11)return send(res,400,{error:'Preencha os dados e confira placa e Renavam.'});
   await pool.query('INSERT INTO vehicles (plate,model,chassis,renavam,company_id) VALUES ($1,$2,$3,$4,$5)',[plate,d.model.trim(),d.chassis.trim().toUpperCase(),renavam,user.company_id]);return send(res,201,{ok:true});
  }
  if(req.method==='POST'&&resource==='trips'){
   const d=await readBody(req),mileage=Number(d.mileage),freight=Number(d.freightValue),driverId=Number(d.driverId),vehicleId=Number(d.vehicleId),customerId=Number(d.customerId);if(!d.origin||!d.destination||!(mileage>0)||!(freight>0)||!driverId||!vehicleId||!customerId)return send(res,400,{error:'Preencha todos os campos da viagem.'});
   const options=await pool.query(`SELECT u.role,v.plate FROM users u CROSS JOIN vehicles v WHERE u.id=$1 AND v.id=$2 AND u.company_id=$3 AND v.company_id=$3`,[driverId,vehicleId,user.company_id]);if(!options.rowCount||options.rows[0].role!=='driver')return send(res,400,{error:'Motorista ou veículo inválido.'});
   const customer=await pool.query('SELECT 1 FROM customers WHERE id=$1 AND company_id=$2',[customerId,user.company_id]);if(!customer.rowCount)return send(res,400,{error:'Cliente inválido.'});
   const seq=(await pool.query("SELECT nextval('trip_code_seq') value")).rows[0].value,code=`VG-${seq}`;
   await pool.query('INSERT INTO trips (code,origin,destination,vehicle,budget,driver_id,mileage,freight_value,customer_id,vehicle_id,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[code,d.origin.trim(),d.destination.trim(),options.rows[0].plate,freight,driverId,mileage,freight,customerId,vehicleId,user.company_id]);return send(res,201,{ok:true,code});
  }
  return send(res,404,{error:'Cadastro administrativo não encontrado.'});
 }
 if(req.method==='GET'&&url.pathname==='/api/trips'){
  const base=`SELECT t.id,t.code,t.origin,t.destination,t.vehicle,t.budget::float8 budget,t.driver_id,t.status,t.started_at,t.submitted_at,t.closed_at,t.review_notes,u.name driver_name,COALESCE(SUM(e.amount),0)::float8 total FROM trips t JOIN users u ON u.id=t.driver_id LEFT JOIN expenses e ON e.trip_id=t.id`;
  const result=user.role==='admin'?await pool.query(`${base} WHERE t.company_id=$1 GROUP BY t.id,u.name ORDER BY t.id DESC`,[user.company_id]):await pool.query(`${base} WHERE t.driver_id=$1 AND t.company_id=$2 GROUP BY t.id,u.name ORDER BY t.id DESC`,[user.id,user.company_id]);
  return send(res,200,{trips:result.rows});
 }
 const match=url.pathname.match(/^\/api\/trips\/(\d+)(?:\/(start|expenses|submit|review))?$/);if(!match)return send(res,404,{error:'Rota não encontrada.'});
 const id=Number(match[1]),action=match[2],trip=await tripAccess(id,user);if(!trip)return send(res,404,{error:'Viagem não encontrada.'});
 if(req.method==='GET'&&!action){const result=await pool.query(`SELECT id,trip_id,category,description,amount::float8 amount,occurred_at,notes,receipt_name,receipt_type,receipt_data,(receipt_data IS NOT NULL) has_receipt,latitude,longitude,location_accuracy FROM expenses WHERE trip_id=$1 AND company_id=$2 ORDER BY occurred_at DESC`,[id,user.company_id]);return send(res,200,{trip,expenses:result.rows})}
 if(req.method==='POST'&&action==='start'&&user.role==='driver'){
  const result=await pool.query("UPDATE trips SET status='in_progress',started_at=NOW() WHERE id=$1 AND driver_id=$2 AND company_id=$3 AND status='available'",[id,user.id,user.company_id]);
  return result.rowCount?send(res,200,{ok:true}):send(res,409,{error:'Esta viagem não está disponível para início.'});
 }
 if(action==='expenses'&&req.method==='POST'&&user.role==='driver'){
  if(trip.status!=='in_progress')return send(res,409,{error:'A viagem precisa estar em andamento.'});const d=await readBody(req),amount=Number(d.amount);
  if(!d.description||!d.category||!d.occurredAt||!(amount>0))return send(res,400,{error:'Preencha os campos obrigatórios.'});
  if(d.receiptData&&(!/^data:image\/(jpeg|png|webp);base64,/.test(d.receiptData)||d.receiptData.length>7_000_000))return send(res,400,{error:'Comprovante inválido ou maior que 5 MB.'});
  const latitude=d.latitude===''||d.latitude==null?null:Number(d.latitude),longitude=d.longitude===''||d.longitude==null?null:Number(d.longitude),accuracy=d.locationAccuracy===''||d.locationAccuracy==null?null:Number(d.locationAccuracy);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude > 90||longitude < -180||longitude > 180)return send(res,400,{error:'Capture uma localização GPS válida antes de salvar a despesa.'});
  await pool.query('INSERT INTO expenses (trip_id,category,description,amount,occurred_at,notes,receipt_name,receipt_type,receipt_data,latitude,longitude,location_accuracy,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,d.category,d.description,amount,d.occurredAt,d.notes||'',d.receiptName||null,d.receiptType||null,d.receiptData||null,latitude,longitude,accuracy,user.company_id]);return send(res,201,{ok:true});
 }
 if(action==='expenses'&&req.method==='PUT'&&user.role==='driver'){
  if(trip.status!=='in_progress')return send(res,409,{error:'A viagem não permite alterações.'});const d=await readBody(req),expenseId=Number(url.searchParams.get('id')),amount=Number(d.amount),latitude=Number(d.latitude),longitude=Number(d.longitude),accuracy=d.locationAccuracy===''||d.locationAccuracy==null?null:Number(d.locationAccuracy);
  if(!expenseId||!d.description||!d.category||!d.occurredAt||!(amount>0))return send(res,400,{error:'Preencha os campos obrigatórios.'});
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude > 90||longitude < -180||longitude > 180)return send(res,400,{error:'Capture uma localização GPS válida antes de salvar a despesa.'});
  if(d.receiptData&&(!/^data:image\/(jpeg|png|webp);base64,/.test(d.receiptData)||d.receiptData.length>7_000_000))return send(res,400,{error:'Comprovante inválido ou maior que 5 MB.'});
  const result=await pool.query(`UPDATE expenses SET category=$1,description=$2,amount=$3,occurred_at=$4,notes=$5,receipt_name=COALESCE($6,receipt_name),receipt_type=COALESCE($7,receipt_type),receipt_data=COALESCE($8,receipt_data),latitude=$9,longitude=$10,location_accuracy=$11 WHERE id=$12 AND trip_id=$13 AND company_id=$14`,[d.category,d.description,amount,d.occurredAt,d.notes||'',d.receiptName||null,d.receiptType||null,d.receiptData||null,latitude,longitude,accuracy,expenseId,id,user.company_id]);
  return result.rowCount?send(res,200,{ok:true}):send(res,404,{error:'Despesa não encontrada.'});
 }
 if(action==='expenses'&&req.method==='DELETE'&&user.role==='driver'){
  if(trip.status!=='in_progress')return send(res,409,{error:'A viagem não permite alterações.'});await pool.query('DELETE FROM expenses WHERE id=$1 AND trip_id=$2 AND company_id=$3',[Number(url.searchParams.get('id')),id,user.company_id]);return send(res,200,{ok:true});
 }
 if(req.method==='POST'&&action==='submit'&&user.role==='driver'){
  if(trip.status!=='in_progress')return send(res,409,{error:'A viagem não está em andamento.'});const count=await pool.query('SELECT 1 FROM expenses WHERE trip_id=$1 AND company_id=$2 LIMIT 1',[id,user.company_id]);if(!count.rowCount)return send(res,400,{error:'Inclua ao menos uma despesa.'});
  await pool.query("UPDATE trips SET status='submitted',submitted_at=NOW() WHERE id=$1 AND company_id=$2",[id,user.company_id]);return send(res,200,{ok:true});
 }
 if(req.method==='POST'&&action==='review'&&user.role==='admin'){
  if(trip.status!=='submitted')return send(res,409,{error:'A viagem não aguarda validação.'});const d=await readBody(req);
  if(d.approved)await pool.query("UPDATE trips SET status='closed',closed_at=NOW(),review_notes=$1 WHERE id=$2 AND company_id=$3",[d.notes||'',id,user.company_id]);else await pool.query("UPDATE trips SET status='in_progress',submitted_at=NULL,review_notes=$1 WHERE id=$2 AND company_id=$3",[d.notes||'Correções solicitadas',id,user.company_id]);return send(res,200,{ok:true});
 }
 return send(res,403,{error:'Operação não permitida.'});
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');try{if(url.pathname.startsWith('/api/'))return await api(req,res,url);const pathname=url.pathname==='/'?'/index.html':url.pathname,file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return send(res,404,'Não encontrado');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Permissions-Policy':'camera=(self), geolocation=(self)'});fs.createReadStream(file).pipe(res)}catch(err){console.error(err);if(!res.headersSent)send(res,err.code==='23505'?409:500,{error:err.code==='23505'?'Já existe um cadastro com um dos dados únicos informados.':'Erro interno do servidor.'})}});
async function shutdown(){server.close();await pool.end();process.exit(0)}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
pool.query('SELECT 1').then(()=>server.listen(PORT,()=>console.log(`Rota Certa (PostgreSQL) disponível em http://localhost:${PORT}`))).catch(err=>{console.error('Não foi possível conectar ao PostgreSQL:',err.message);process.exit(1)});
