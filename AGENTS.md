# Orientações para trabalhar neste projeto

Leia `CONTEXTO-PROJETO.md` antes de implementar alterações. Ele reúne a visão do sistema, as regras de negócio e o estado registrado da entrega. Confira essas informações no código e no Git antes de agir: o documento pode estar desatualizado.

## Colaboração

- Comunique-se em português brasileiro, de forma direta e prática.
- O usuário descreve o resultado desejado. Quando ele pede uma alteração, implemente no projeto quando houver acesso às ferramentas, incluindo interface, API e persistência necessárias.
- Dê uma atualização curta antes de trabalhar e informe ao final o resultado, os testes executados e eventuais pendências reais.
- Faça escolhas rotineiras coerentes com o projeto. Pergunte quando faltar uma definição de negócio que possa mudar o resultado; não invente fórmulas financeiras.
- Preserve nomes de campos e fórmulas definidos pelo usuário. Não amplie o escopo com funcionalidades não solicitadas.
- Não afirme que executou testes, publicou commits, aplicou migrações ou validou telas sem evidência. Se não houver ferramentas, explique o limite e forneça instruções.

## Implementação

- Preserve a arquitetura atual: HTML/CSS/JavaScript, Node.js HTTP nativo e PostgreSQL com `pg`.
- Reutilize componentes visuais, `request()`, `notify()`, `esc()` e os padrões existentes.
- Toda consulta de negócio deve respeitar a empresa autenticada e as permissões do perfil.
- Use SQL parametrizado e escape textos ao gerar HTML. Nunca inclua credenciais, `.env`, tokens ou dados reais em documentação ou commits.
- Mudanças de banco precisam de migração repetível e compatível com registros existentes. Integre-a ao fluxo de implantação.
- Teste valores monetários, limites, edição e isolamento entre empresas quando a alteração afetar essas regras.
- Use `npm.cmd run check` no PowerShell e `npm run check` no Linux. Para os fluxos recentes, use `node scripts/test-document-types.js` com PostgreSQL local; ele usa schema temporário.
- Não execute testes destrutivos nos dados reais. Não confunda testes de API com validação visual.

## Git e implantação

- O fluxo usado é desenvolver em `dev` e, quando solicitado, integrar `dev` → `main` → `prod` e publicar no `origin`.
- Antes de integrar, confira `git status`, branches e referências remotas, revise o diff e rode os checks apropriados.
- Prefira fast-forward quando possível; se houver divergência, analise antes de resolver. Não use force-push ou descarte alterações do usuário.
- Faça staging explícito dos arquivos da entrega. Relatórios locais não rastreados não devem entrar por acidente.
- Quando o usuário pedir merges e envio, conclua a publicação e verifique os hashes remotos. Informe commit e branches.
- Publicação no GitHub e implantação na VPS são etapas distintas. Não anuncie atualização da VPS apenas porque houve push.
- Quando solicitado, forneça um bloco pronto de comandos da VPS, com migração antes de reiniciar o serviço.

## Continuidade

Ao concluir uma mudança relevante, atualize `CONTEXTO-PROJETO.md` com decisões, estado de publicação, validação e pendências. Diferencie fatos verificados, histórico e sugestões futuras.
