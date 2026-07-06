# Network Map Validation Protocol

Use este protocolo antes de qualquer nova mudança em `/network-map`.

## Fluxos Manuais Obrigatórios

| Passo | Resultado esperado | Resultado observado | Evidência | Observação | Status |
|---|---|---|---|---|---|
| Abrir `/network-map` | Tela carrega sem erro e mostra mapa |  |  |  | BLOCKED |
| Alternar visualização/edição | UI troca modo sem quebrar layout |  |  |  | BLOCKED |
| Criar link manual | Link nasce preso ao device e ao handle |  |  |  | BLOCKED |
| Criar link planejado | Link planejado nasce com mesmo contrato visual |  |  |  | BLOCKED |
| Mover device com link conectado | Link acompanha o device sem drift |  |  |  | BLOCKED |
| Selecionar link | Painel lateral mostra detalhes corretos |  |  |  | BLOCKED |
| Editar link | Interfaces/atributos atualizam sem soltar edge |  |  |  | BLOCKED |
| Remover link | Link some da tela e do estado local |  |  |  | BLOCKED |
| Remover device conectado | Links ligados ao device são removidos/invalidados |  |  |  | BLOCKED |
| Salvar layout | Posicão dos devices e geometria dos links persistem |  |  |  | BLOCKED |
| Recarregar página | Mapa volta igual ao salvo |  |  |  | BLOCKED |
| Validar links presos | Links continuam ancorados após reload |  |  |  | BLOCKED |
| Zoom in | Geometria permanece estável |  |  |  | BLOCKED |
| Zoom out | Geometria permanece estável |  |  |  | BLOCKED |
| Pan | Geometria permanece estável |  |  |  | BLOCKED |
| Repetir drag com zoom diferente de 100% | Sem drift ou offset acumulado |  |  |  | BLOCKED |
| Validar minimap | MiniMap reflete estado correto |  |  |  | BLOCKED |
| Validar painel lateral | Detalhes seguem seleção atual |  |  |  | BLOCKED |
| Validar filtros | Filtros continuam consistentes com nodes/links |  |  |  | BLOCKED |
| Validar modal de link | Modal abre, edita e fecha sem corromper estado |  |  |  | BLOCKED |
| Validar ausência de handles no modo visualização | Handles não poluem tela fora de edição |  |  |  | BLOCKED |

## Matriz De Critérios

Status possíveis:

- `PASS`
- `FAIL`
- `NOT_TESTED`
- `BLOCKED`

Use estes campos para cada item:

- passo
- resultado esperado
- resultado observado
- evidência
- observação

## Contrato Geométrico Atual

- Node position pertence ao React Flow.
- `sourceHandle` / `targetHandle` são referência principal de conexão.
- `sourceX` / `sourceY` / `targetX` / `targetY` são calculados pelo React Flow.
- `waypoints`, quando existirem, são coordenadas absolutas do canvas.
- `zoom` / `pan` não devem alterar geometria salva.
- `save` / `load` não devem converter absoluto/relativo repetidamente.

## Não Fazer

- Não converter waypoint absoluto para relativo.
- Não recalcular waypoint com base em zoom.
- Não salvar delta de waypoint relativo ao node.
- Não criar edge sem `source` / `target`.
- Não criar link duplicado idêntico.
- Não misturar stencil, Zabbix ou NetBox nesta etapa.

## Uso Rápido

1. Rode `bash workspace/artifacts/netops-manager/scripts/check-network-map.sh`.
2. Execute smoke visual no browser.
3. Preencha tabela acima com `PASS`, `FAIL`, `NOT_TESTED` ou `BLOCKED`.

## Smoke Manual Rápido - Execucao Pelo Operador

Marque cada passo com `PASS`, `FAIL`, `BLOCKED` e anote observacao curta.

| Passo | Resultado esperado | Status | Observacao |
|---|---|---|---|
| 1. Subir frontend | Frontend responde em `http://localhost:3000/` |  |  |
| 2. Abrir `http://localhost:3000/map` | Mapa carrega |  |  |
| 3. Autenticar, se necessario | Sessao valida |  |  |
| 4. Entrar em modo edicao | Handles aparecem |  |  |
| 5. Criar link entre dois devices | Link nasce preso ao device |  |  |
| 6. Arrastar device conectado | Link acompanha sem drift |  |  |
| 7. Confirmar que link acompanha | Sem soltar no canvas |  |  |
| 8. Dar zoom in | Geometria continua correta |  |  |
| 9. Arrastar device conectado | Sem drift em zoom alto |  |  |
| 10. Dar zoom out | Geometria continua correta |  |  |
| 11. Fazer pan | Geometria continua correta |  |  |
| 12. Arrastar device conectado | Sem drift apos pan |  |  |
| 13. Selecionar link | Painel lateral correto |  |  |
| 14. Abrir modal do link | Modal abre com dados certos |  |  |
| 15. Remover link | Link some da tela e estado |  |  |
| 16. Criar link planejado | Link planejado funciona |  |  |
| 17. Salvar layout | Posicao e geometria persistem |  |  |
| 18. Recarregar pagina | Mapa volta igual |  |  |
| 19. Confirmar persistencia de posicao e links | Devices e links permanecem corretos |  |  |
| 20. Alternar para visualizacao | Handles somem |  |  |
| 21. Confirmar que handles/ancoras somem | Tela limpa |  |  |
| 22. Voltar para edicao | Ediçao volta a funcionar |  |  |
| 23. Confirmar edicao volta a funcionar | Link/device editaveis |  |  |
