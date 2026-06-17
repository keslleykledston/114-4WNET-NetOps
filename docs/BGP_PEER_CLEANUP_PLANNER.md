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
- Dependências globais -> `global` e nunca entram no script
- Dependência ambígua -> `skip`, risco `high`

## Taxonomia de dependências

- `EXCLUSIVE`: usada apenas pelo peer removido
- `SHARED`: usada por mais de um peer e pode exigir revisão humana
- `GLOBAL`: preservada por desenho operacional; não entra no script
- `AMBIGUOUS`: uso insuficiente para prova de exclusividade

Regras de classificação:

1. A route-policy é o objeto principal da análise.
2. Se uma route-policy é usada apenas pelo peer removido, ela fica como `EXCLUSIVE`.
3. Para `ip-prefix`, `ipv6-prefix`, `community-filter`, `as-path-filter` e `extcommunity-filter`, o `usage_count` é calculado por referência de policy, não por peer.
4. Se um prefixo for usado somente por uma route-policy exclusiva, ele também fica como `EXCLUSIVE`.
5. Objetos globais como `DEFAULT`, `FULL-ROUTE-ALL`, `GLOBAL-*`, `IXBR-*` e `Cxx-RECEIVED` ficam como `GLOBAL`.
6. `GLOBAL` não entra em `SHARED` e nunca entra no script.

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
    "global": [],
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

- `partial`: remove o peer e inclui toda dependência `EXCLUSIVE` segura antes do `commit`
- `full`: remove o peer, sai do bloco BGP, remove objetos exclusivos e finaliza com `commit`
- ordem do script:
  - `undo peer`
  - `undo route-policy` exclusiva
  - `undo ip ip-prefix` exclusivo
  - `undo ip ipv6-prefix` exclusivo
  - `undo ip community-filter` exclusivo
  - `undo ip as-path-filter` exclusivo
  - `undo ip extcommunity-filter` exclusivo
- `GLOBAL` e `SHARED` nunca entram no script
- peers em VRF continuam entrando na address-family correspondente antes do `undo peer`
- se uma route-policy exclusiva não aparecer no script, o backend registra warning e o item é destacado no modal

## Globais / Preservados

Quando houver dependências `GLOBAL`, o planner mostra um painel próprio:

- `GLOBAIS / PRESERVADOS`
- mensagem fixa: `Dependência global compartilhada por desenho operacional.`

## Fixtures validadas

- `10.20.0.30`: remoção apenas da sessão
- `10.20.255.10`: cleanup completo com twin IPv6
- `45.169.161.138`: `partial` por policies compartilhadas `C15`
- `172.28.0.14`: cleanup completo `XPAND-CDN`
- `172.28.1.22`: `skip`/revisão humana para dependência ambígua `ALLFIBER`
- `172.22.151.22`: route-policies exclusivas entram no script mesmo com prefixo compartilhado
- `10.20.255.2`: peer global sem `ipv4-family unicast`, com `y` na confirmação do `undo peer`
- `2001:db8::10`: `ipv6-prefix` exclusivo entra no script como `undo ip ipv6-prefix <NAME>`

## Validação

- Typecheck do `api-server`: OK
- Typecheck do `netops-manager`: OK
- Build agregado do workspace: OK
- Selftest dedicado do planner: OK
