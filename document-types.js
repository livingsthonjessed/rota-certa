const defaults = [
 ['CTE', 'credit'],
 ['Abastecimento', 'debit'],
 ['Outros gastos', 'debit'],
 ['Pagamento cliente', 'credit'],
];

async function seedDocumentTypes(client, companyId) {
 for (const [name, nature] of defaults) {
  await client.query(`INSERT INTO document_types (company_id,name,nature)
   SELECT id,$1,$2 FROM companies WHERE ($3::integer IS NULL OR id=$3)
   ON CONFLICT (company_id,name) DO NOTHING`, [name,nature,companyId??null]);
 }
}

module.exports = {seedDocumentTypes};
