const defaults = [
 ['CTE', 'credit', false, false],
 ['Abastecimento', 'debit', true, true],
 ['Outros gastos', 'debit', true, false],
 ['Pagamento cliente', 'credit', true, false],
];

async function seedDocumentTypes(client, companyId) {
 for (const [name, nature, requiresAmount, requiresFuel] of defaults) {
  await client.query(`INSERT INTO document_types (company_id,name,nature,requires_amount,requires_fuel)
   SELECT id,$1,$2,$4,$5 FROM companies WHERE ($3::integer IS NULL OR id=$3) AND NOT document_types_initialized
   ON CONFLICT (company_id,name) DO NOTHING`, [name,nature,companyId??null,requiresAmount,requiresFuel]);
 }
 await client.query('UPDATE companies SET document_types_initialized=true WHERE ($1::integer IS NULL OR id=$1) AND NOT document_types_initialized',[companyId??null]);
}

module.exports = {seedDocumentTypes};
