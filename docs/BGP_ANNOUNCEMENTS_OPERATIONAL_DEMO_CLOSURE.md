# BGP Announcements - Operational Demo Closure

Data: 2026-06-14

Status: closed - ready for operational demo, documental only

> Consolidated closure for full BGP Announcement Matrix trail. Read-only, preview-only, draft-only. No execution path.

---

## 1. Executive summary

The BGP Announcement Matrix now supports operational analysis end-to-end:

- view announcements from persisted data
- classify targets semantically
- compare snapshots
- generate read-only change previews
- generate documented proposed commands
- create draft change plans
- review and approve manual implementation steps

All data is derived from persisted snapshots and catalog state. The module does not execute commands, does not apply configuration, and does not route through Controlled Execution. It is ready for demo, review, and manual implementation planning.

---

## 2. Delivered scope

- Matrix
- Snapshots
- Semantic View
- Protected Globals
- Upstream Audit
- Change Preview
- Prepend Preview
- Vendor Draft Commands
- Draft Change Plan
- Review Workflow
- Timelapse / Diff
- UI manual smoke
- Audit / history

---

## 3. Operational flow validated

Open BGP Announcements
-> load latest snapshot
-> refresh matrix
-> review Clientes / ORIGIN
-> review Upstreams in audit mode
-> review protected globals
-> compare snapshots
-> generate Change Preview
-> inspect documented proposedCommands[]
-> copy commands with confirmation
-> create Draft Change Plan
-> submit review
-> approve for manual implementation

This flow stays read-only until a human performs manual implementation outside the system.

---

## 4. Layered architecture

- Snapshot Layer
- Matrix Read Model
- Semantic Classifier
- Change Preview Compiler
- Prepend Logical Compiler
- Vendor Draft Compiler
- Change Plan Adapter
- Manual Review Workflow
- Timeline / Diff Layer
- UI Layer
- Audit Layer

Key services:

- `announcement-vendor-draft.service.ts`
- `announcement-change-preview.service.ts`
- `announcement-prepend-preview.service.ts`
- `announcement-change-plan-link.service.ts`
- `semantic-matrix-view.service.ts`
- `announcement-snapshot-diff.service.ts`

---

## 5. proposedCommands[] format

`proposedCommands[]` is documentary only.

```json
{
  "vendor": "huawei_vrp",
  "scope": "documental_only",
  "safety": "not_executable",
  "commandSetName": "BGP announcement proposed change",
  "confidence": "medium",
  "commands": [
    {
      "line": "# PROPOSTO - NAO EXECUTADO - REVISAR MANUALMENTE",
      "kind": "comment",
      "confidence": "medium",
      "requiresHumanReview": true,
      "notes": []
    }
  ],
  "warnings": [
    "Comandos propostos para documentacao. Nao executar sem revisao humana.",
    "Nenhum comando foi executado pelo sistema."
  ]
}
```

Required fields:

- `vendor`
- `scope=documental_only`
- `safety=not_executable`
- `confidence`
- `commands`
- `warnings`

---

## 6. Supported actions in this phase

- `add_community`, when target and dependency are specific enough
- `remove_community`, when dependency is customer_specific or circuit_specific
- `block_announcement`, when target is Cliente / ORIGIN and route-policy is specific
- `set_prepend`, when route-policy / target are known
- `clear_prepend`, when before state is known enough to document safely

If confidence is too low, the compiler returns empty `proposedCommands[]` and explains why.

---

## 7. Semantic safety

- Cliente / ORIGIN eligible
- provider / upstream / IX / CDN blocked
- `protected_global` blocked for removal
- `protected_system` blocked for command generation
- blocked preview does not create an eligible command set

This is a safety boundary, not a best-effort hint.

---

## 8. UI delivered

Routes:

- `/bgp-announcements`
- `/netops-operations?view=bgp-announcements&deviceId=`
- `/change-plans`

Visible UI:

- tabs Clientes / ORIGIN, Auditoria Upstreams, Dependencias Globais, Conflitos, Historico
- Change Preview Modal
- section `Comandos Propostos / Nao Executados`
- badges `Documental only` and confidence
- copy confirmation before clipboard write
- no `Executar`
- no `Aplicar`

The browser smoke validated the modal, copy warning, proposedCommands display, and draft plan preservation.

---

## 9. Runtime smoke

Validated in real browser and API-backed flow:

- device 94
- snapshot 193
- `set_prepend`
- `proposedCommands[]` generated
- Draft Change Plan preserved `ticketMarkdown` and `proposedCommands`

Smoke result:

- UI loaded
- preview modal worked
- copy confirmation worked
- draft plan worked
- no execution path was triggered

---

## 10. Selftests

Validated by module selftests and closure checks:

- change preview selftest
- prepend preview selftest
- change plan link selftest
- review workflow selftest
- vendor draft selftest
- UI manual smoke

Typecheck: OK.

---

## 11. Guarantees

- no command executed
- no SSH
- no SNMP
- no connector
- no discovery real
- no apply
- no execute
- no Controlled Execution
- `proposedCommands[]` is documentary only
- `approved_for_manual_implementation` does not execute anything

---

## 12. Known limitations

- commands are documentation, not execution
- human review still required
- output depends on persisted snapshot quality
- Huawei VRP support is initial
- unknown vendor can return `unsupported_vendor`
- `clear_prepend` can remain low-confidence when `before` is unknown
- traffic-engineering impact is not globally simulated
- implementation remains manual
- browser click/copy smoke is validated, but visual demo still benefits from a live human walkthrough

---

## 13. Human checklist

- confirm API healthy
- confirm Web healthy
- confirm DB healthy
- confirm feature flag enabled
- confirm snapshot exists
- confirm user has operator or admin role
- confirm no execute/apply control visible
- confirm proposed commands are documentary
- confirm draft plan created from preview
- confirm logs stay free of execution calls from this flow

---

## 14. Repeatable manual smoke

1. Open `/netops-operations?view=bgp-announcements&deviceId=94`
2. Log in
3. Open BGP Announcements
4. Show latest snapshot
5. Open Clientes / ORIGIN
6. Generate `set_prepend` preview
7. Show risk hints and logical diff
8. Show `proposedCommands[]`
9. Copy commands and confirm warning
10. Create Draft Change Plan
11. Show preserved markdown and proposed commands
12. Show no `Executar` / `Aplicar`

---

## 15. Main commits

| Commit | Description | Phase |
|--------|-------------|-------|
| `f489173` | Add announcement matrix and policy graph foundation | Foundation |
| `552c33d` | Wire announcement matrix API and UI | Wiring |
| `7185807` | Add database snapshot refresh flow | Snapshot refresh |
| `e4a04a7` | Add semantic matrix view and protected globals | Semantic view |
| `e42ad0e` | Add read-only announcement change preview | Change preview |
| `17ea664` | Link change previews to draft change plans | Change plan link |
| `d3f537e` | Close read-only MVP runtime validation | MVP closure |
| `c6df3be` | Add manual review workflow for BGP announcement plans | Review workflow |
| `bd6c89e` | Close manual review workflow validation | Review closure |
| `4cabd2c` | Add snapshot timelapse diff | Timelapse diff |
| `d6789c0` | Close snapshot timelapse diff validation | Timelapse closure |
| `6b37e77` | Add read-only prepend action previews | Prepend preview |
| `48f8192` | Close prepend preview validation | Prepend closure |
| `99fe887` | Verify prepend blocks provider targets | Prepend safety |
| `5ecb916` | Add documental vendor draft commands | Vendor draft |
| `f20853d` | Close vendor draft commands validation | Vendor draft closure |

---

## 16. Demo recommendation

Suggested demo path:

1. Open dashboard
2. Open BGP Announcements for device 94
3. Show last snapshot
4. Show semantic tabs
5. Compare snapshots
6. Generate `set_prepend` preview
7. Show `riskHints`
8. Show `proposedCommands[]`
9. Copy with confirmation
10. Create Draft Change Plan
11. Approve for manual implementation
12. Show no execution button exists

---

## 17. Next phases

- UI polish and empty states
- more vendors in Vendor Draft Compiler
- deeper route-policy / prepend parsing
- advanced visual diff
- external ticket integration
- consultative Copilot for NetOps
- Controlled Execution only in a future phase with strong approval

---

## 18. Security decision

This delivery is ready for operational demo and documental use.

It is not approved for automatic configuration execution.

