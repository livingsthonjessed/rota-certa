# Rota Certa

MVP web responsivo para controle de despesas das viagens de uma transportadora.

## Executar

O aplicativo agora depende do servidor para autenticação e banco de dados. Execute:

```powershell
node server.js
```

Depois acesse `http://localhost:8000`.

## Usuários de demonstração

- Motorista: `motorista@rotacerta.com` / `Motorista123`
- Administrador: `admin@rotacerta.com` / `Admin123`

## O que já funciona

- login com perfis de motorista e administrador;
- viagens atribuídas ao motorista e controle de estados;
- cadastro e exclusão de despesas com foto do comprovante;
- envio da viagem para validação administrativa;
- aprovação, encerramento ou devolução para correção;
- cadastros administrativos de usuários, clientes, veículos e viagens;
- cadastro público de empresas com criação automática do primeiro administrador;
- isolamento multiempresa de usuários, clientes, veículos, viagens e despesas;
- categorias de gasto;
- total consumido e saldo da viagem;
- persistência em PostgreSQL com credenciais protegidas no `.env`;
- layout adaptado para celular e desktop.

## Próximas etapas sugeridas

1. Edição, inativação e exclusão controlada dos cadastros administrativos.
2. Armazenar os comprovantes e fotos em serviço de arquivos quando houver publicação em nuvem.
3. Recuperação de senha, trilha de auditoria e políticas de senha.
4. Relatórios exportáveis e transformação em PWA instalável.

## Banco de dados

O servidor utiliza a variável `DATABASE_URL` do arquivo `.env`. Para preparar uma nova instalação local do PostgreSQL, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-postgres.ps1
```

O banco SQLite anterior é mantido apenas como cópia local da migração e não é mais utilizado pelo servidor.

### Migração completa para Supabase/produção

Com a variável `DATABASE_URL` configurada para o PostgreSQL de destino, execute:

```powershell
npm.cmd run migrate:deploy
```

No Render/Linux, o mesmo comando é:

```bash
npm run migrate:deploy
```

O comando executa todas as migrações na ordem correta e pode ser repetido com segurança durante novos deploys. Em um banco vazio, nenhum usuário ou empresa fictícia é criado; a primeira empresa e seu administrador devem ser cadastrados pela tela inicial.
