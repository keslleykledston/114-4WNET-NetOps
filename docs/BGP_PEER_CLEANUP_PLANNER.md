# BGP Peer Cleanup Planner

Feature read-only para analisar peerings BGP que não estão `Established`, levantar dependências e gerar um script de remoção para revisão humana.

## Garantias de segurança

- Nenhum comando é executado pelo sistema.
- Nenhuma configuração é aplicada.
- Nenhum rollback é executado.
- Nenhum `system-view` é aberto automaticamente no backend.
- O script é apenas para cópia manual e revisão humana.

## Endpoints

- `POST /api/devices/:id/bgp/peers/:peerIp/cleanup/analyze`
- `GET /api/bgp-cleanup-analyses/:id`
- `POST /api/bgp-cleanup-analyses/:id/export`

## Permissões

- `bgp.read` para analisar
- `bgp.cleanup.plan` para exportar o script

## Classificação

- `Established` -> `skip`, risco `high`, bloqueio `Peer está Established`
- `IPv4 inativo + IPv6 ativo` -> `skip`, risco `high`, bloqueio `Twin AF ainda ativo`
- Sem policies -> `partial`
- Dependências exclusivas -> `full`
- Dependências compartilhadas -> `partial`
- Dependência ambígua -> `skip`, risco `high`

## Estrutura do resultado

```json
{
  "analysisId": "...",
  "deviceId": 1,
  "peerIp": "10.20.255.10",
  "vrf": "CDN",
  "state": "Active",
  "recommendation": "full",
  "riskLevel": "low",
  "dependencies": {
    "exclusive": [],
    "shared": [],
    "ambiguous": []
  },
  "script": {
    "removalCommands": [],
    "validationBefore": [],
    "validationAfter": []
  },
  "warnings": [],
  "blockedReasons": []
}
```

## Script gerado

- `partial`: remove apenas o peer e finaliza com `commit`
- `full`: remove o peer, finaliza o bloco e remove objetos exclusivos antes do `commit`
- objetos compartilhados nunca entram no script

## Fixtures validadas

- `10.20.0.30`: remoção apenas da sessão
- `10.20.255.10`: cleanup completo com twin IPv6
- `45.169.161.138`: `partial` por policies compartilhadas `C15`
- `172.28.0.14`: cleanup completo `XPAND-CDN`
- `172.28.1.22`: `skip`/revisão humana para dependência ambígua `ALLFIBER`

## Validação

- Typecheck do `api-server`: OK
- Typecheck do `netops-manager`: OK
- Build agregado do workspace: OK
- Selftest dedicado do planner: OK

