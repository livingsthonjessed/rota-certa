require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const {seedDocumentTypes}=require('../document-types');

async function migrateDocumentTypes(client) {
 await client.query(`CREATE TABLE IF NOT EXISTS document_types (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name VARCHAR(30) NOT NULL,
  nature VARCHAR(6) NOT NULL CHECK (nature IN ('credit','debit')),
  PRIMARY KEY (company_id,name)
 )`);
 await seedDocumentTypes(client);
 await client.query(`ALTER TABLE trip_documents DROP CONSTRAINT IF EXISTS trip_documents_document_type_check`);
 const existing=await client.query(`SELECT 1 FROM pg_constraint
  WHERE conrelid='trip_documents'::regclass AND conname='trip_documents_document_type_fk'`);
 if(!existing.rowCount)await client.query(`ALTER TABLE trip_documents
  ADD CONSTRAINT trip_documents_document_type_fk FOREIGN KEY (company_id,document_type)
  REFERENCES document_types(company_id,name)`);
}

async function main() {
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await migrateDocumentTypes(client);
  await client.query('COMMIT');
  console.log('Tipos de documento configurados.');
 } catch(error) {
  await client.query('ROLLBACK');
  throw error;
 } finally {client.release();await pool.end()}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={migrateDocumentTypes};
