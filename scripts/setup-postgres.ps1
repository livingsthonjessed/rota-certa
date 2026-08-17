$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path $psql)) { throw 'psql do PostgreSQL 18 não foi encontrado.' }

$credential = Get-Credential -UserName 'postgres' -Message 'Digite a senha criada durante a instalação do PostgreSQL'
$adminPassword = $credential.GetNetworkCredential().Password
$bytes = New-Object byte[] 24
$appPassword = [Convert]::ToBase64String($bytes).Replace('+','A').Replace('/','B').TrimEnd('=')
$env:PGPASSWORD = $adminPassword

try {
  $roleExists = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='rota_certa_app'"
  if (-not $roleExists) { & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE rota_certa_app LOGIN PASSWORD '$appPassword'" }
  else { & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE rota_certa_app PASSWORD '$appPassword'" }
  $databaseExists = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='rota_certa'"
  if (-not $databaseExists) { & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE rota_certa OWNER rota_certa_app' }
  $envText = "DATABASE_URL=postgresql://rota_certa_app:$appPassword@localhost:5432/rota_certa`r`nPORT=8000`r`n"
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '..\.env'), $envText)
  Write-Host 'Banco e usuário criados. Migrando dados...'
  & node (Join-Path $PSScriptRoot 'migrate-to-postgres.js')
  if ($LASTEXITCODE -ne 0) { throw 'A migração retornou erro.' }
  & node (Join-Path $PSScriptRoot 'migrate-admin-modules.js')
  if ($LASTEXITCODE -ne 0) { throw 'A migração dos módulos administrativos retornou erro.' }
  & node (Join-Path $PSScriptRoot 'migrate-multicompany.js')
  if ($LASTEXITCODE -ne 0) { throw 'A migração multiempresa retornou erro.' }
  Write-Host 'Configuração concluída com sucesso.' -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $adminPassword = $null
}
