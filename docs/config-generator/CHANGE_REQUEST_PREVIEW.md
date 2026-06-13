# Config Generator — Change Request Preview (preview-only)

> MVP fechado: [CONFIG_GENERATOR_MVP_CLOSURE.md](./CONFIG_GENERATOR_MVP_CLOSURE.md)

Fase `CONFIG-GENERATOR.CHANGE-REQUEST-PREVIEW`: consolida script candidato, validações, ID Allocator, diff/precheck, riscos, postcheck e rollback placeholder em um pacote revisável por humano.

## O que é

Um **pacote documental** (`change_request_preview`) gerado a partir de um `config_generator_run` salvo ou preview persistido. Inclui:

- Resumo e escopo (tenant/site/device, VLANs, peers, IDs)
- `fieldOrigins` (manual vs sugerido)
- Validações e alocação de IDs
- Diff/precheck (baseline, summary, blocking)
- Script candidato, postcheck, rollback manual
- `riskLevel` determinístico + fatores
- `ticketMarkdown` para colar em ticket NOC

## O que não é

- **Não** é aprovação real
- **Não** executa comandos em device
- **Não** chama Controlled Execution
- **Não** habilita apply quando `CONFIG_WRITE_ENABLED=false`

## Artefatos (append-only)

Salvos em `config_generator_artifacts` sem sobrescrever versões anteriores:

| artifact_type | Conteúdo |
|---------------|----------|
| `change_request_preview` | JSON do pacote completo |
| `ticket_markdown` | Markdown enriquecido |
| `risk_assessment` | Score + factors |
| `implementation_package` | Metadados + checksums |

## Endpoints

- `POST /api/config-generator/runs/:id/change-request-preview` — operator/admin (`configGenerator.validate`)
- `GET /api/config-generator/runs/:id/change-request-preview` — viewer+ (`configGenerator.read`)

## Risk levels

| Nível | Exemplos |
|-------|----------|
| `blocked` | Erros de validação bloqueantes, diff blocking |
| `high` | Conflito route-policy/VLAN, baseline ausente, ID ocupado |
| `medium` | Global missing, interface down, fora do range, partial_match |
| `low` | Sem conflitos, baseline presente, candidato new-only |

## Relação futura com Controlled Execution

Este pacote é insumo para revisão humana. Uma fase posterior poderá referenciar o mesmo run/artifact como entrada de plano controlado — **fora do escopo atual**.

## Limitações

- Depende de run + artifacts já gerados (candidate_config, diff opcional)
- Rollback permanece placeholder; objetos globais nunca entram em remoção automática
- Secrets sanitizados (`<SECRET_NOT_STORED>`)

## Testes

```bash
DATABASE_URL=postgres://selftest:selftest@127.0.0.1:1/selftest \
  pnpm --dir ./workspace/scripts exec tsx \
  ../artifacts/api-server/src/modules/config-generator/config-generator.change-request-preview.selftest.ts
```
