# V0.3.3 Community-Filter Live Proof Hotfix

## Causa raiz

O compliance de BGP estava tratando a ausencia de catalogo de community-filters no snapshot como falha operacional. Em cenarios Huawei VRP, isso gerava falso positivo porque a route-policy so referencia `if-match community-filter X` quando `X` existe no dispositivo. O parser de running-config tambem estava lendo o conteudo como fluxo linear e podia misturar blocos separados por `#`.

## Regra antiga

- Mensagem gerada: `Nao foi possivel comprovar community-filters no snapshot para <POLICY>`.
- Se a community nao aparecia no snapshot, o check podia virar `fail` ou `unknown` sem tentativa de prova viva.
- A decisao dependia apenas do snapshot.

## Regra nova

- Se a community-filter existe no snapshot, nao gera finding.
- Se nao existe no snapshot, o compliance tenta prova viva read-only com `display ip community-filter <NAME>`.
- Se a prova viva confirma existencia, nao gera finding.
- Se a prova viva confirma inexistencia, gera `fail`.
- Se a prova viva falha ou nao pode ser executada, gera `unknown`/`warning` de baixa confianca.
- Se nao ha catalogo no snapshot e nao ha prova viva, o resultado fica `unknown` com mensagem de catalogo ausente.

## Parser de blocos Huawei

- Implementado `splitHuaweiConfigBlocks(config)` e `classifyHuaweiConfigBlock(block)`.
- Os parsers de community, policy e VRF passaram a respeitar blocos delimitados por `#`.
- Isso evita misturar contexto de VRF, BGP, route-policy e community-filter no mesmo fluxo.

## Exemplo parseado do display

Entrada:

```text
Named Community basic filter: C16-EXPORT-P1 (ListID = 283)
         permit 64777:51601
```

Saida parseada:

```json
{
  "exists": true,
  "name": "C16-EXPORT-P1",
  "type": "basic",
  "listId": 283,
  "entries": [
    {
      "action": "permit",
      "value": "64777:51601"
    }
  ]
}
```

## Comportamento com snapshot vazio

- Se o snapshot nao tem catalogo de community-filters e nao ha prova viva, o finding fica `unknown`/`warning`.
- Se a prova viva confirma a community-filter, o finding some.
- O BGP check nao assume mais que a ausencia no snapshot prova inexistencia no dispositivo.

## Resultado no device 1

- Executei um job de compliance BGP no device 1.
- O alvo `MALHA-RX-Import-V6-CDN` com match `C16-EXPORT-P1` nao gerou mais o falso positivo:
  - nao apareceu `Nao foi possivel comprovar community-filters no snapshot para MALHA-RX-Import-V6-CDN`
  - nao apareceu `referencia community ausente: C16-EXPORT-P1`
- No job testado, nao houve community findings para esse caso.

## Riscos restantes

- A prova viva depende de SSH read-only funcional e credenciais validas.
- O caminho de `community-list` continua com a semantica antiga de snapshot-only.
- A deteccao de inexistencia no `display ip community-filter` depende dos padroes de saida Huawei observados; se o firmware mudar a mensagem, o parser pode cair em `unknown`.
- Ha um limite de 50 provas SSH por job para evitar excesso de comandos.
