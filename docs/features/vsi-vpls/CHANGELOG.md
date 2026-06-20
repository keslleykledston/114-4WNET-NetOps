# CHANGELOG

## 2026-06-19 - Perfis de usuário

- Corrigida a modelagem da tela `Usuários e Perfis`: agora existe CRUD de perfis de acesso separado do CRUD de usuários.
- Perfil de acesso passou a concentrar os módulos liberados por tenant.
- Cadastro/edição de usuário agora seleciona `profileId` especifico.
- Usuarios `admin` continuam com acesso total e ignoram perfil.
- Corrigido runtime risk no frontend: remoção de `SelectItem` com valor vazio na tela de usuários/perfis.
- `@workspace/db` foi rebuildado para expor `userAccessProfilesTable` no barrel tipado.
- `pnpm --filter @workspace/netops-manager exec tsc -p tsconfig.json --noEmit` passou.
- `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` passou.
- `pnpm --filter @workspace/api-server run build` passou.
- `tools/apply-containers.sh api web` recompilou e recriou os containers com sucesso.
- Validacao local: `http://127.0.0.1:3005/users` e `http://127.0.0.1:3005/vsi-vpls/` respondem `200`.
- O bundle do web contem os textos novos da tela de perfis, confirmando deploy do frontend atualizado.

## 2026-06-19 - Rota VSI/VPLS

- `L2 Circuits > VSI/VPLS` passou a apontar para o caminho canonico `/l2-circuits/vsi-vpls`.
- Adicionado redirect defensivo de `/vsi-vpls` para `/l2-circuits/vsi-vpls`.
- Validacao no nginx local: `/l2-circuits/vsi-vpls` e `/vsi-vpls` respondem `200`.
- `vsi-vpls` foi registrado no barrel de schema do DB.
- `l2circuits.routes.ts` agora monta o subrouter `vsi-vpls`, eliminando o 404 da API principal.
- Validacao real com cookie de admin: `GET /api/l2/vsi-vpls` retorna `200` com 89 servicos.

## 2026-06-19

- Fase 1 iniciada.
- Reconhecimento local concluido.
- Estrutura de docs base criada para `VSI/VPLS`.
- `ai-memory` consultado para o projeto, sem resultados relevantes para este recorte.
- Hermes local usado para revisar MVP/DATA_MODEL/STATUS_RULES.
- Saida aproveitada: precisao de integrar `discovery_snapshots` e `collected_configs` em vez de duplicar config/history.
- Hermes nao substituiu validacao por codigo; apenas guiou ajustes de docs.

## 2026-06-19 - Continuação

- Implementado submodulo `workspace/artifacts/api-server/src/modules/l2circuits/vsi-vpls/` com status, parser e service read-only.
- Implementada rota `/api/l2/vsi-vpls` com detalhe, members, configs, alarms, history e discovery snapshot.
- Implementada UI `VSI / VPLS` em `workspace/artifacts/netops-manager/src/pages/vsi-vpls.tsx`.
- Sidebar recebeu subitem `L2 Circuits > VSI/VPLS`.
- Adicionado selftest de status e parser Huawei VSI/VPLS.
- Config bruta passou a vir de `collected_configs` quando disponivel.
- `pnpm run typecheck` passou.
- `node tools/vsi-vpls-status-selftest.mjs` passou.
- `node tools/vsi-vpls-parser-selftest.mjs` passou.
- `bash scripts/vsi-vpls/01_run_tests.sh` passou.
- `cd workspace && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` passou.
- `cd workspace && pnpm --filter @workspace/api-server run build` passou.
- `cd workspace && pnpm run build` falhou apenas no `artifacts/mockup-sandbox` por falta de `PORT`/`BASE_PATH` no config desse pacote, sem impacto na feature VSI/VPLS.

## 2026-06-19 - Persistencia dedicada

- Adicionado schema dedicado em `workspace/lib/db/src/schema/vsi_vpls.ts` com tabelas `vsi_services`, `vsi_service_members`, `vsi_service_configs`, `vsi_service_status_history` e `vsi_service_events`.
- Adicionada migration `workspace/lib/db/migrations/0053_vsi_vpls_library.sql`.
- `runVsiVplsDiscoverySnapshot` agora persiste snapshot completo em banco.
- `listVsiVplsServices` e `getVsiVplsServiceDetail` leem de persistencia quando possivel, com fallback para inventario vivo.
- `pnpm run typecheck` passou apos integracao da persistencia.
- `bash scripts/vsi-vpls/01_run_tests.sh` passou novamente.
- `bash scripts/vsi-vpls/03_validate_migrations.sh` passou.
- `cd workspace && pnpm --filter @workspace/api-server run build` passou novamente.
- `cd workspace && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` passou novamente.
- Frontend `VSI / VPLS` validado no build atual com rota `/l2-circuits/vsi-vpls` e detalhe em sheet.
- Adicionado CTA explicito em `L2 Circuits` para abrir `VSI/VPLS` direto da pagina pai.
- Aba `Configurações` agora filtra config por VSI/VPLS e `interface Vlanif*`; config global do device nao vaza na detail.
- Adicionado selftest `tools/vsi-vpls-config-selftest.mjs`.
- `Configurações` agora filtra por `VS-ID` exato da detail, mais `interface Vlanif*` agregadas.
- `Configurações` agora preserva apenas `vsi <nome>` com `vsi-id` selecionado e `Vlanif` com `l2 binding vsi <nome>`.
- Aba `Configurações` no frontend agora renderiza cada bloco separado com copy por bloco.
- Aba `Configurações` ganhou resumo abstrato de entrega `tagged/untagged` por `Vlanif`.
- Adicionado selftest `tools/vsi-vpls-config-summary-selftest.mjs`.
- Aba `Configurações` agora mostra resumo estilo `display vlan` com interfaces onde cada VLANIF entrega trafego.
- Rota direta `/l2-circuits/vsi-vpls` restaurada no `App`.
- Sidebar ganhou item `VSI/VPLS` sob `L2 Circuits`.
- Sidebar de admin agora mostra `Usuários` e `Perfis` com rótulos claros.
- Rota `VSI/VPLS` foi movida antes de `/l2-circuits` para evitar captura indevida.
- `Users` ganhou painel de módulos visíveis por usuário com `permissionsJson`.
- API de users passou a serializar e persistir `permissionsJson`.
- Adicionado redirect defensivo para `/vsi-vpls/` e `/l2-circuits/vsi-vpls/` para reduzir 404 de navegação.
- Sidebar de administração agora mostra `Usuários e Perfis` com rótulo mais explícito.
- Dialog de criação de usuário passou a expor `Módulos visíveis`, não só o edit.
- `pnpm --filter @workspace/netops-manager run typecheck` passou.
- `cd workspace && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` passou.
- `tools/apply-containers.sh web` recompilou e recriou o container web com sucesso.
- Validação local: `/vsi-vpls`, `/vsi-vpls/` e `/l2-circuits/vsi-vpls/` respondem `200` no web.
- Rota `VSI/VPLS` passou a abrir a pagina real sem tela intermediaria de redirect.
- `VsiVplsPage` agora atende também URLs com barra final.
- `Users` ganhou `tenant_id` persistido no banco para separar CRUD e gestao de perfil por tenant.
- Pagina de usuarios foi organizada em abas `CRUD` e `Perfis por tenant`.
- Aba `Perfis por tenant` ganhou resumo operacional e chips compactos de modulos visiveis.
- Migration `0054_users_tenant_scope.sql` criada para suportar tenant no usuario.
- `pnpm --filter @workspace/netops-manager run typecheck` passou apos a reorganizacao.
- `cd workspace && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` passou apos a reorganizacao.
- Validação final: `/vsi-vpls/` e `/l2-circuits/vsi-vpls/` respondem `200` e o bundle nao contem mais a string de redirect intermediario.
