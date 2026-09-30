# Contexto de continuidade — LA Transportes / Central do Motorista

Registro preparado em 30/09/2026, após a publicação da comissão do motorista. Este documento serve para retomar o trabalho em outro chat ou após perda de contexto. Não é uma transcrição integral da conversa nem uma garantia de comportamento idêntico entre modelos. Revalide o estado atual no repositório.

## 1. Como usar em outro chat

Se o assistente tiver acesso ao projeto, envie:

> Vamos continuar o projeto LA Transportes / Central do Motorista. Leia AGENTS.md e CONTEXTO-PROJETO.md, confira os arquivos e o estado do Git e use essas informações para retomar o trabalho. Preserve as regras de negócio documentadas. Diferencie o que está implementado localmente, publicado no GitHub e implantado na VPS. Minha próxima solicitação é: [descreva a alteração].

Se o novo chat não tiver acesso ao projeto, anexe este arquivo ou cole seu conteúdo e forneça os arquivos relevantes à próxima tarefa. Um caminho local escrito na mensagem, sozinho, não entrega o conteúdo dos arquivos ao outro chat.

O `AGENTS.md` contém as orientações curtas para o assistente no repositório. O Codex usa esse nome para descobrir instruções do projeto, conforme a [documentação oficial](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Em outros ambientes, forneça os dois arquivos explicitamente.

## 2. Forma de colaboração que queremos preservar

O usuário orienta a evolução do produto em português, com pedidos curtos e incrementais. O assistente atua como colaborador de desenvolvimento: inspeciona o código, implementa, valida e explica o resultado com linguagem simples.

O padrão desta conversa foi:

1. Explicar brevemente a alteração que será feita.
2. Conferir a implementação existente e seguir seus padrões.
3. Alterar as partes necessárias de interface, servidor e banco.
4. Testar a funcionalidade e preservar os dados anteriores.
5. Informar o que foi concluído e quais limites de verificação existem.
6. Quando solicitado, criar commit, integrar as branches e publicar no GitHub.
7. Quando solicitado, entregar os comandos prontos para o usuário atualizar a VPS.

Perguntas são úteis quando uma regra de negócio está indefinida; escolhas rotineiras não precisam interromper o trabalho. O assistente deve ser transparente sobre o que conseguiu executar. As permissões e ferramentas disponíveis em cada chat podem ser diferentes.

## 3. Visão do sistema

O projeto reúne um site institucional da LA Transportes e um sistema administrativo e operacional chamado Central do Motorista. O nome técnico do pacote/repositório é `rota-certa`.

Principais módulos existentes:

- Site institucional, com acesso ao sistema.
- Cadastro de empresas e criação do primeiro administrador.
- Autenticação de administradores e motoristas.
- Cadastros de usuários, clientes, veículos e viagens.
- Operação de viagens e registro de despesas com comprovantes e localização.
- Envio da viagem para análise, aprovação ou devolução para correção.
- Documentos anexados às viagens e cadastro de tipos de documento.
- Resumo financeiro da viagem em HTML, com estilo para impressão.
- Cálculo de frete e histórico de cotações, com integração Google quando configurada.
- Agregador de notas de compras e rateio por cliente.

É um sistema multiempresa: os registros devem respeitar o `company_id` da sessão. Perfil de motorista não dá acesso às rotas administrativas.

As despesas operacionais (`expenses`), os documentos de viagem (`trip_documents`) e as notas de compras são módulos distintos. Anexar um documento não cria automaticamente uma despesa.

## 4. Arquitetura e arquivos

Stack: Node.js >= 22.5, servidor HTTP nativo, JavaScript sem framework no frontend e PostgreSQL. Dependências diretas: `pg` e `dotenv`. Não existe etapa de build do frontend. O SQLite local é legado e pode ser utilizado pelo script de migração inicial em condições específicas; não é o banco atual do servidor.

| Arquivo | Função |
| --- | --- |
| `index.html`, `site.css`, `assets/` | Site institucional |
| `motorista.html` | Estrutura do sistema, login, menu e diálogos |
| `app.js` | Formulários, navegação, estado e chamadas à API |
| `styles.css` | Estilos e responsividade do sistema |
| `server.js` | API, autenticação, permissões, SQL e arquivos estáticos |
| `document-types.js` | Tipos iniciais de documento para cada empresa |
| `trip-summary.js` | Renderização HTML do resumo da viagem |
| `trip-summary.css` | Aparência e impressão do resumo |
| `scripts/migrate-*.js` | Evolução do banco |
| `scripts/test-document-types.js` | Testes isolados de documentos, resumo e comissão |
| `scripts/validate-flows.js` | Roteiro histórico mais amplo de validação |
| `deployment/` | Exemplos de serviços, Nginx e backup |

Convenções: interface pt-BR, moeda BRL, banco em `snake_case`, entradas da API normalmente em `camelCase`. Cadastros usam formulários montados em `app.js`. O fato de `index.html` estar aberto no IDE não significa que uma alteração no sistema deve ser feita nele.

## 5. Regras de tipos de documento

Menu administrativo: **Tipo documento**. Tem inclusão, listagem, edição e exclusão por empresa.

- Nome com até 30 caracteres, sem duplicidade na empresa, inclusive com diferença de maiúsculas/minúsculas.
- Natureza `credit` (crédito) ou `debit` (débito).
- Renomear um tipo atualiza o nome nos documentos vinculados.
- Não é permitido excluir um tipo utilizado por documentos de viagens.
- Mudar a natureza afeta a classificação dos documentos existentes e novos.
- Migrações repetidas não devem recriar tipos excluídos ou renomeados.
- Novos tipos exigem valor, descrição e anexo.

Padrões iniciais:

| Tipo | Natureza inicial | Campos do documento |
| --- | --- | --- |
| CTE | Crédito | Descrição e anexo; sem valor |
| Abastecimento | Débito | Valor, valor do diesel, KM, descrição e anexo |
| Outros gastos | Débito | Valor, descrição e anexo |
| Pagamento cliente | Crédito | Valor, descrição e anexo |

Os padrões podem ser editados. Regras especiais persistem por `requires_amount` e `requires_fuel`, mesmo após renomeação; não voltar a identificar essas regras apenas pelo nome.

A tabela `document_types` tem ID, empresa, nome, natureza e essas flags. A relação de documentos usa empresa + nome e propaga renomeações com `ON UPDATE CASCADE`. A empresa tem o marcador `document_types_initialized` para não recriar os padrões a cada migração.

Rotas principais: `GET/POST /api/admin/document-types`, `PUT/DELETE /api/admin/document-types/:id`. Há compatibilidade com a antiga atualização de natureza por `PUT /api/admin/document-types`.

## 6. Regras do resumo de viagem

Rota: `GET /api/admin/trips/:id/summary`. Acesso administrativo limitado à empresa. Retorna HTML sem cache.

Valores dos documentos:

- Crédito: positivo, verde escuro `#166534`.
- Débito: negativo, sinal de menos e vermelho `#b91c1c`.
- Documento sem valor: traço; não contribui para as somas.
- As cores também possuem regras para impressão.

Rodapé:

```text
Total de crédito = soma de todos os documentos classificados como crédito
Total de débito  = soma dos débitos, apresentada com sinal negativo
Total            = créditos − magnitude dos débitos
```

O total de crédito não depende do nome “Pagamento cliente”; inclui qualquer tipo configurado como crédito. As somas são feitas em PostgreSQL com NUMERIC. Valor do diesel, KM e valor do frete não são somados como documentos. Saldo positivo é verde, negativo vermelho e zero tem cor neutra.

No cabeçalho, imediatamente abaixo de **Valor do frete**, existe **Valor pendente recebimento**:

```text
Valor pendente recebimento = total de créditos − valor do frete
```

Essa ordem de subtração foi expressamente solicitada pelo usuário. Não inverter a fórmula com base no nome do campo. Positivo é verde, negativo vermelho e zero neutro. Sem valor de frete informado, apresenta “Não informado”. O cálculo atual subtrai valores convertidos em centavos.

## 7. Comissão motorista — última funcionalidade entregue

No cadastro e edição de viagens existe **Comissão motorista**, campo numérico com `%` à direita.

- Percentual entre 0 e 100, com até duas casas decimais.
- Campo opcional: vazio é salvo como NULL.
- API: `driverCommission`.
- Banco: `trips.driver_commission NUMERIC(5,2)` com limite de 0 a 100.
- A listagem administrativa retorna `driver_commission` para preencher a edição.
- Em atualização de API que omita o campo, conserva o valor anterior; campo enviado vazio permite limpá-lo.
- A coluna está na migração `scripts/migrate-admin-modules.js`, incluída em `migrate:deploy`.

O cabeçalho do resumo agora apresenta **Comissão do motorista pendente** imediatamente abaixo de **Quilometragem**:

```text
Comissão do motorista pendente = ROUND(valor do frete × percentual / 100, 2)
                                − soma dos débitos de Pagamento motorista da viagem
```

O cálculo usa NUMERIC no PostgreSQL e considera apenas documentos da mesma viagem e empresa cujo tipo se chama “Pagamento motorista” (sem diferenciar maiúsculas/minúsculas) e cuja natureza atual é débito. Outros débitos e documentos desse tipo classificados como crédito não reduzem a comissão. Sem frete ou percentual informado, mostra “Não informado”; percentual zero é válido. Pagamento excedente gera saldo negativo, sem truncar para zero. O campo usa a cor padrão do cabeçalho.

O tipo “Pagamento motorista” pode ser cadastrado pelo usuário no CRUD de tipos com natureza débito; não foi adicionado automaticamente aos padrões. Renomeá-lo para outro nome deixa de incluí-lo nesse cálculo. O campo não cria despesas nem altera os totais existentes do rodapé.

Esta alteração foi implementada após `d33d0bb` e integra a entrega “Comissão do motorista pendente”. Consulte o histórico e as referências remotas para obter o hash atual e confirmar sua publicação.

## 8. Git e estado da entrega

### Layout gerencial de viagens (entrega posterior a `3419cdc`)

Entrega posterior a `a19b94a`: “Comissão motorista” exibe o valor monetário arredondado de frete × percentual / 100, com o percentual abaixo. A nova coluna adjacente “Comissão pendente” usa a mesma expressão SQL do resumo (comissão calculada menos débitos de Pagamento motorista da viagem/empresa). A API administrativa retorna `driver_commission_amount` e `driver_commission_pending`; valores desconhecidos aparecem como traço. São 12 colunas, mantendo ordenação e paginação de 10 registros. Checagem de sintaxe, testes de lógica do grid e 310 verificações de integração passaram, incluindo igualdade do saldo entre tabela e resumo. Sem nova migração. O usuário solicitou integração em dev, main e prod e publicação no GitHub; confira as referências remotas ao retomar. Validação visual em navegador não realizada e implantação na VPS não confirmada.

Entrega posterior a `2504317`: tabela gerencial ordenada por data de início decrescente (desempate por ID decrescente, datas ausentes ao final), com até 10 registros por página, controles Anterior/Próxima, indicador de página e faixa de resultados. A busca filtra todas as viagens antes de paginar e volta à primeira página quando alterada. Paginação no frontend; sem mudança de API/banco ou dos cartões móveis. Testes de lógica da paginação, ordenação, filtro e estados vazios passaram, assim como a checagem de sintaxe. O usuário solicitou integração em dev, main e prod e envio ao GitHub; confira os hashes remotos ao retomar. Implantação na VPS não confirmada.

Correção local após `19d1082`: o seletor genérico `.trip-grid` da lista antiga aplicava `display:grid` à nova tabela, desalinhando cabeçalho e dados. O estilo da tabela agora usa `table.trip-grid` com `display:table`, preservando a lista antiga e impedindo que a largura mínima de 1500 px afete seus cartões. Os títulos das três colunas numéricas são alinhados à direita, como seus valores. Correção ainda sem publicação.

A partir de 1280 px de largura do viewport, o cadastro de viagens usa tabela com Origem, Destino, Data início, Data fim, Quilometragem, Valor do frete, Comissão motorista, Cliente, Motorista, Veículo e Ações. O navegador não determina com precisão as polegadas físicas do monitor; o breakpoint foi adotado como aproximação para a solicitação de monitores a partir de 14 polegadas.

O botão **Adicionar** e a ação **Editar** abrem um `<dialog>` com o formulário existente. Há Cancelar, fechar e Esc, foco inicial no primeiro campo e erros dentro do diálogo. A tabela tem busca textual sem distinção de acentos, contagem de resultados, rolagem, cabeçalho fixo e ações fixas à direita (Editar, Resumo e Documento). Valores numéricos ficam alinhados à direita.

Abaixo de 1280 px, mantém formulário e cartões existentes. O mesmo formulário é movido ao alternar os layouts para preservar os dados; ao ampliar a tela com dados preenchidos, abre o diálogo. A API e as regras de negócio não mudaram. Não há migração de banco nesta entrega.

Validação específica: `node scripts/test-trip-layout.js` verifica geração das 11 colunas, valores, ações, escape HTML, estado vazio, edição e preservação do formulário ao redimensionar. Checagem `npm.cmd run check` aprovada. Testes com DOM simulado não equivalem à validação visual; nenhum navegador estava conectado nesta sessão.

Referências de interface: [tabelas do Carbon Design System](https://v10.carbondesignsystem.com/components/data-table/usage/) e [diálogo HTML nativo na W3C](https://www.w3.org/WAI/WCAG22/Techniques/html/H102). O usuário solicitou a integração e publicação desta entrega em dev, main e prod; consulte os hashes remotos ao retomar.

Repositório: https://github.com/livingsthonjessed/rota-certa

Workspace usado: `C:\Users\livin\OneDrive\Documentos\Projeto1`, PowerShell. Branch de trabalho: `dev`.

Histórico recente:

| Commit | Entrega |
| --- | --- |
| `071a5a4` | Classificação de crédito/débito e Pagamento cliente |
| `6b360d2` | CRUD dos tipos de documento |
| `dd94781` | Créditos, débitos e saldo no resumo |
| `07b65b4` | Valor pendente recebimento no cabeçalho |
| `d33d0bb` | Comissão motorista no cadastro da viagem |

Último commit publicado e conferido nesta conversa: `d33d0bb3d90dea978ce2cf410d43b94af4d2b5d0`. As três branches `dev`, `main` e `prod` foram sincronizadas com ele no GitHub. Na preparação deste documento, as referências locais continuavam nesse commit; reconsultar o remoto antes de outra integração.

Os arquivos `ARQUITETURA.md`, `VALIDACAO-FLUXOS.md` e `VALIDACAO-FLUXOS.json` já eram locais e não rastreados, e ficaram fora dos commits das funcionalidades. Este arquivo e `AGENTS.md` fazem parte da entrega da comissão pendente para preservar o contexto no repositório.

O usuário costuma pedir explicitamente “fazer os merges e subir pro GitHub” após aprovar cada alteração. Não confundir esse passo com implantação na VPS.

## 9. Testes e limitações conhecidas

Última execução registrada antes deste documento:

```powershell
npm.cmd run check
node scripts/test-document-types.js
git diff --check
```

Resultado mais recente, após incluir a comissão pendente: checagem de sintaxe aprovada e **286 verificações de integração aprovadas**. Inclui pagamentos parciais, quitação, pagamento excedente, exclusão de outros débitos, mudança de natureza, arredondamento e valores ausentes. Esse número pertence àquela execução; não o reutilize como resultado de testes futuros sem rodá-los.

O teste usa PostgreSQL local, schema temporário exclusivo e servidor na porta 18081, com limpeza ao final. Cobre documentos, CRUD de tipos, limites entre empresas/perfis, migrações, somas, cores/classes no HTML, valor pendente e comissão. Não equivale a uma auditoria completa ou a testes visuais.

Não havia navegador conectado durante as últimas implementações; a aparência, cliques e responsividade dessas telas não foram conferidos visualmente pelo assistente.

Pendências anteriores registradas, fora do escopo das últimas entregas:

- Logout: o código expira o cookie, mas não revoga a sessão no banco. O relatório histórico aponta que uma cópia do token continua válida até expirar.
- `ARQUITETURA.md` e o relatório histórico apontam exposição de arquivos internos no servidor estático. Revalidar e tratar em tarefa específica; não afirmar que já foi corrigida.
- O roteiro histórico `validate-flows.js` e seus relatórios antecedem parte das alterações. Podem precisar de atualização; não são substitutos do teste recente.
- Google Maps, câmera e GPS reais não foram verificados pelos testes recentes.
- O README contém informações históricas. Para divergências, conferir código, migrações e decisões mais recentes; não assumir credenciais de demonstração válidas em produção.

## 10. Banco e implantação

As alterações de schema de tipos e comissão foram aplicadas no PostgreSQL local durante esta conversa. Não houve acesso à VPS nem confirmação de que o usuário executou a última atualização.

O ambiente descrito nos arquivos de implantação usa:

- Diretório `/var/www/la-transportes`.
- Usuário de serviço `deploy`.
- Branch `prod`.
- Serviço systemd `la-transportes`.
- PostgreSQL e configuração em `.env`.
- Node ouvindo normalmente na porta 8000, com Nginx à frente.

Não registrar senhas ou conteúdo do `.env` neste documento. A configuração efetiva da VPS deve ser confirmada se houver divergência.

Bloco de atualização entregue ao usuário, para rodar na VPS com acesso ao sudo:

```bash
(
  set -e
  cd /var/www/la-transportes

  sudo -u deploy git fetch origin prod
  sudo -u deploy git checkout prod
  sudo -u deploy git pull --ff-only origin prod

  sudo -u deploy npm ci --omit=dev
  sudo -u deploy npm run check
  sudo -u deploy npm run migrate:deploy

  sudo systemctl restart la-transportes
  sudo systemctl status la-transportes --no-pager

  sudo -u deploy git log -1 --oneline
)
```

O commit esperado naquela entrega era `d33d0bb`; futuras entregas terão outro hash. A migração deve preceder o reinício para criar a coluna da comissão. O serviço deve aparecer como `active (running)`. Atualizar a página com Ctrl + F5 após implantação.

O script inicial `migrate-to-postgres.js` pode importar o SQLite legado quando o banco não tem usuários e `rotacerta.db` existe. Não presumir que uma instalação nova seja sempre vazia; examine essas condições antes de preparar outro ambiente.

## 11. Roteiro de retomada e atualização deste contexto

1. Ler `AGENTS.md`, este documento e os arquivos relacionados ao próximo pedido.
2. Conferir branch, alterações locais e histórico recente; não descartar arquivos existentes.
3. Identificar o pedido atual do usuário. Pendências históricas não autorizam automaticamente ampliar a tarefa.
4. Implementar e testar no escopo necessário.
5. Registrar mudanças nas regras, novas migrações e resultados efetivamente observados.
6. Quando houver publicação, atualizar commit/branches e separar o estado da VPS.

Entrega anterior: comissão pendente e arquivos de continuidade, commit `3419cdc`, integrado em dev, main e prod. Entrega atual: layout gerencial do cadastro de viagens para telas a partir de 1280 px, com tabela e formulário em diálogo. Publicação solicitada em dev, main e prod. Antes dos merges, passaram os checks de sintaxe, testes específicos de lógica do layout e 286 verificações de integração. Validação visual indisponível por falta de navegador conectado. Confira as referências remotas para confirmar o commit atual. A confirmação de implantação na VPS continua ausente.
