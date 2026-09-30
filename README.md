# LA Transportes e Central do Motorista

Site institucional da LA Transportes com a Central do Motorista, um MVP web responsivo para controle de despesas das viagens.

## Executar

O aplicativo agora depende do servidor para autenticação e banco de dados. Execute:

```powershell
node server.js
```

Depois acesse `http://localhost:8000`. A Central do Motorista fica em `http://localhost:8000/motorista.html`.

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

### Tipos de documento

O menu administrativo **Tipo documento** permite incluir, listar, editar e excluir tipos por empresa, com nome de até 30 caracteres e natureza crédito ou débito. Nomes duplicados são rejeitados, inclusive com diferenças de maiúsculas/minúsculas. A renomeação atualiza os documentos vinculados; a exclusão é bloqueada quando o tipo está em uso. A alteração da natureza vale para documentos existentes e novos da empresa.

Os padrões iniciais são CTE e Pagamento cliente como crédito; Abastecimento e Outros gastos como débito. Novos tipos exigem valor, descrição e anexo. As regras especiais de CTE (sem valor) e Abastecimento (valor, KM e valor do diesel) são preservadas mesmo que seus nomes sejam alterados.

**Pagamento cliente** exige valor positivo, descrição e anexo. CTE continua sem valor; Abastecimento mantém valor, KM e valor do diesel. A natureza aparece na seleção e na listagem dos documentos. No resumo, créditos aparecem positivos em verde escuro e débitos negativos em vermelho. O rodapé mostra Total de crédito, Total de débito e Total (créditos menos débitos), com somas exatas no PostgreSQL. Todos os tipos classificados como crédito entram no total de crédito. Documentos sem valor não entram nas somas; valor do diesel e valor do frete são apenas informativos nesse cálculo.

Para atualizar uma instalação existente, execute `npm.cmd run migrate:document-types` e reinicie o servidor. A migração também faz parte de `migrate:deploy`, preserva documentos existentes e pode ser repetida sem sobrescrever as configurações nem recriar tipos excluídos ou renomeados. Novas empresas recebem os quatro tipos automaticamente.

Validação isolada no PostgreSQL local: `node scripts/test-document-types.js`.

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
