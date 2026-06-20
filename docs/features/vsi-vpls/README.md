# VSI / VPLS

Biblioteca operacional de serviços multiponto descoberta no Tenant, integrada como submodulo de `L2 Circuits`.

## Escopo

- Listar e detalhar VSIs/VPLS consolidadas por `tenant_id + vs_id`.
- Persistir membros, ACs, PWs, configs, eventos e historico.
- Classificar status consolidado de forma deterministica.
- Expor API read-only para UI e automacao interna.
- Preservar config bruta como evidencia com redaction.

## Estado

- Fase 1: reconhecimento e documentacao base.
- Proxima etapa: fixture, parser e modelo de dados.

## Documentos

- [`MVP.md`](./MVP.md)
- [`PRD.md`](./PRD.md)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`DATA_MODEL.md`](./DATA_MODEL.md)
- [`API_CONTRACT.md`](./API_CONTRACT.md)
- [`FRONTEND_UX.md`](./FRONTEND_UX.md)
- [`PARSER_SPEC.md`](./PARSER_SPEC.md)
- [`STATUS_RULES.md`](./STATUS_RULES.md)
- [`TEST_PLAN.md`](./TEST_PLAN.md)
- [`HOMOLOGATION.md`](./HOMOLOGATION.md)
- [`RUNBOOK.md`](./RUNBOOK.md)
- [`SECURITY.md`](./SECURITY.md)
- [`CHANGELOG.md`](./CHANGELOG.md)
- [`FINAL_REPORT.md`](./FINAL_REPORT.md)

## Regras

- Sem apply real no MVP.
- Sem acesso a device real sem aprovacao e flags corretas.
- Sem alterar o comportamento atual de L2 Circuits fora do novo submodulo.
