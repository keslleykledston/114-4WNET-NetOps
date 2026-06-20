# Feature Flags — BGP Announcement Matrix

| Flag | Default homologação | Efeito | Risco se ON indevido | Pré-requisito |
|------|---------------------|--------|----------------------|---------------|
| `BGP_ANNOUNCEMENT_MATRIX_ENABLED` | `true` | Habilita latest/refresh/diff da matriz | Feature indisponível se OFF | — |
| `BGP_ANNOUNCEMENT_PREVIEW_ENABLED` | `true` | Habilita preview-change | Preview 503 se OFF | Matrix ON |
| `BGP_ANNOUNCEMENT_APPROVAL_ENABLED` | `true` | Habilita request/review approval | Approval 503 se OFF | Preview ON |
| `BGP_ANNOUNCEMENT_DRY_RUN_ENABLED` | `true` | Habilita dry-run scaffold | Dry-run 503 se OFF | Approval ON |
| `BGP_ANNOUNCEMENT_EXECUTION_ENABLED` | **`false`** | Permite execução real | **SSH/write em device** | Lab only: approval + dry-run + lock + postcheck + provider |
| `BGP_ANNOUNCEMENT_REQUIRE_APPROVAL` | `true` | Exige approval antes de dry-run/execute | Bypass governance se OFF | — |
| `BGP_ANNOUNCEMENT_REQUIRE_POSTCHECK` | `true` | Exige postcheck após mudança | Sem verificação observada se OFF | — |
| `BGP_ANNOUNCEMENT_REQUIRE_LOCK` | `true` | Exige lock operacional | Concorrência sem trava se OFF | — |
| `BGP_ANNOUNCEMENT_REQUIRE_MAINTENANCE_WINDOW` | `false` | Exige janela de manutenção para real | Extra gate produção | Execução real |
| `BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER` | `disabled` | Provider real: `disabled` \| `mock` \| `connector_scaffold` | Write path se não disabled | `EXECUTION_ENABLED=true` |
| `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED` | **`false`** | Permite rollback real | **Undo write em device** | Lab only |
| `BGP_ANNOUNCEMENT_ROLLBACK_DRY_RUN_ENABLED` | `true` | Habilita rollback dry-run | Rollback sim OFF se false | — |
| `BGP_ANNOUNCEMENT_ROLLBACK_REQUIRE_APPROVAL` | `true` | Exige approval de rollback | Bypass se OFF | — |
| `BGP_ANNOUNCEMENT_TIMELAPSE_ENABLED` | `true` | Habilita GET history | Histórico 503 se OFF | — |

## Configuração (.env)

Ver bloco em `.env.example` na raiz do repositório.

## Verificação rápida

```bash
grep BGP_ANNOUNCEMENT .env
```

Defaults seguros para homologação:

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
```
