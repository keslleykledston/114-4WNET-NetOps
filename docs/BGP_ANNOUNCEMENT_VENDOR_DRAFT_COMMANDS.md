# BGP Announcement Vendor Draft Commands

Fase documental para gerar `proposedCommands[]` no preview e no Change Plan de BGP Announcements.

**Status:** documentação apenas, sem execução.

## Objetivo

Produzir comandos propostos para revisão humana:

- aparecem no `preview`
- aparecem no `ticketMarkdown`
- são preservados no `Change Plan`
- são copiados como texto, mas nunca executados pelo sistema

## Forma

```json
{
  "vendor": "huawei_vrp",
  "scope": "documental_only",
  "safety": "not_executable",
  "commandSetName": "BGP announcement proposed change",
  "confidence": "low",
  "actionType": "set_prepend",
  "commands": [
    {
      "line": "# PROPOSTO - NAO EXECUTADO - REVISAR MANUALMENTE",
      "kind": "comment",
      "confidence": "low",
      "requiresHumanReview": true,
      "notes": ["Linha documental"]
    }
  ],
  "warnings": [
    "Comandos propostos para documentação. Não executar sem revisão humana.",
    "Nenhum comando foi executado pelo sistema."
  ]
}
```

## Regras de segurança

- `proposedCommands[]` é apenas documental.
- Não contém credenciais.
- Não contém IP de acesso.
- Não contém login, enable, commit automático, apply automático ou execução automatizada.
- Não chama SSH, SNMP, connector ou Controlled Execution.
- Preview bloqueado não gera `proposedCommands`.
- `provider`, `upstream`, `ix` e `cdn` não geram comandos propostos.
- `protected_global` nunca gera remoção.
- `protected_system` nunca gera comando.

## Vendor inicial

- `huawei_vrp`
- Se o vendor não for suportado, `proposedCommands[]` fica vazio e o preview recebe warning `unsupported_vendor`.

## Quando não gerar comandos

- target audit-only
- preview bloqueado
- global protegido
- dados insuficientes para inferir o ponto da policy
- `clear_prepend` com `before` desconhecido
- `set_prepend` sem route-policy/target suficiente
- `remove_community` quando a dependência não for `customer_specific` ou `circuit_specific`

## Checklist humano

- Confirmar target e vendor
- Conferir se o comando é só documental
- Verificar warnings do preview
- Validar impacto operacional
- Colar manualmente apenas após revisão

## Referências

- [`BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md`](./BGP_ANNOUNCEMENT_CHANGE_PREVIEW.md)
- [`BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md`](./BGP_ANNOUNCEMENT_CHANGE_PLAN_LINK.md)
- [`BGP_ANNOUNCEMENT_ACTION_COMPILER_PREPEND.md`](./BGP_ANNOUNCEMENT_ACTION_COMPILER_PREPEND.md)
