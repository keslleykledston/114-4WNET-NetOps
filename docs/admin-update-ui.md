# Admin Update UI

Tela: `/admin/system-update`

## Blocos

- versão instalada
- última versão disponível
- status do sistema
- último update
- último rollback
- canal configurado

## Ações

- verificar nova versão
- atualizar agora
- copiar resumo para ticket
- rollback manual

## Execução

- update exige confirmação explícita
- botão habilita só com update disponível e sem execução ativa
- progresso aparece por SSE com etapa por etapa

## Histórico

- tabela com runs
- detalhes técnicos por run
- logs sanitizados
- backups associados

## UX

- foco em leitura rápida
- estados por badge
- sem poluição visual
