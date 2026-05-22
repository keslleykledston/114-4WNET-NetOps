# UX Guardrails

## Regras

- Nao substituir layout global.
- Nao trocar tema, Tailwind, shadcn/ui ou tokens CSS.
- Nao reescrever sidebar global.
- Nao remover rotas existentes.
- Nao copiar frontend do `60-bgp_manager`.
- Usar `60-bgp_manager` como referencia de fluxo e comportamento, nao de layout.
- Novas telas devem parecer parte do `114-4WNET-NetOps`.
- Preferir componentes shadcn/ui ja existentes.
- Preferir icones `lucide-react`.
- Evitar cores hardcoded; usar tokens `background`, `card`, `muted`, `border`, `primary`, `sidebar`.
- Cards so para paineis ou itens repetidos. Nao criar card dentro de card.
- Identidade K3G pode ser aplicada somente como asset compativel: favicon, icone pequeno no header/dashboard/sidebar, ou marca discreta onde o layout atual ja tiver ponto visual equivalente.
- Nao usar assets K3G para trocar estrutura, spacing, tema ou hierarquia visual.
- Nao sobrescrever assets existentes sem backup ou novo nome claro.

## Arquivos protegidos

- `workspace/artifacts/netops-manager/src/index.css`
- `workspace/artifacts/netops-manager/src/components/layout.tsx`
- `workspace/artifacts/netops-manager/src/components/theme-provider.tsx`
- `workspace/artifacts/netops-manager/src/components/ui/*`
- `workspace/artifacts/netops-manager/src/App.tsx`
- `workspace/artifacts/netops-manager/public/favicon.svg`
- `workspace/artifacts/netops-manager/public/opengraph.jpg`

Alteracao permitida:

- `App.tsx`: adicionar rota nova sem remover rotas.
- `layout.tsx`: adicionar item de navegacao novo sem mudar estrutura.
- `index.html`: adicionar links de favicon/apple-touch-icon sem remover metadados existentes.
- `public/*`: adicionar assets K3G com nomes claros; preservar arquivos existentes.

## Padrao visual da arvore operacional

- Arvore dentro de pagina, nao na sidebar global.
- Grupo cliente/empresa colapsavel.
- Dispositivo colapsavel.
- Subitens com icones pequenos.
- Item ativo com `bg-primary/10`, `text-primary`, borda sutil.
- Itens inativos com `text-muted-foreground`, hover `bg-muted/50`.
- Indentacao clara por nivel.
- Labels curtos, sem texto instrucional longo dentro da arvore.
- Deve funcionar em dark mode atual.

## Padrao para identidade K3G

- Fonte funcional/visual pontual: `../60-bgp_manager/frontend/public`.
- Assets identificados no 60:
  - `favicon-light.png`
  - `favicon-dark.png`
  - `apple-touch-icon-light.png`
  - `apple-touch-icon-dark.png`
- Antes de copiar:
  - confirmar dimensoes e transparencia;
  - registrar origem em `reports/migration/K3G_ASSETS_MIGRATION_PLAN.md`;
  - usar nomes claros no 114, por exemplo `k3g-favicon-light.png`;
  - nao substituir `favicon.svg` sem preservar backup ou manter arquivo intacto;
  - preferir links adicionais em `index.html`.
- Onde aplicar:
  - aba do navegador como favicon;
  - header/dashboard/sidebar somente se encaixar no padrao atual;
  - tamanho pequeno e discreto, sem mudar altura de header/sidebar.

## Pontos de extensao aprovados

- `workspace/artifacts/netops-manager/src/features/netops-tree`
- `workspace/artifacts/netops-manager/src/features/device-inventory`
- `workspace/artifacts/netops-manager/src/features/bgp`
- `workspace/artifacts/netops-manager/src/features/communities`
- `workspace/artifacts/netops-manager/src/pages/netops-operations.tsx`

## Discovery UI

- Mostrar discovery como bloco operacional no detalhe do device, usando cards compactos.
- BGP deve consumir dados estruturados da API; nao interpretar CLI nem OID no frontend.
- Evidence deve aparecer como source/confidence curto, sem payload bruto grande.
- Alertas de compliance/confianca devem usar `Alert` compacto e manter densidade NOC.
- Empty state de BGP sem snapshot deve orientar "Execute discovery para carregar peers BGP."
- Snapshot vindo de cache persistido deve aparecer como aviso operacional, nao como erro visual.

## Compliance grouping UI

- Agrupamento de findings deve consumir `/api/compliance-findings-groups`; nao calcular grupos como fonte primaria se o endpoint existir.
- Drawer de grupo deve listar objetos afetados e evidencias individuais sanitizadas, sem `rawReference` ou payload bruto.
- Actionable only deve incluir apenas `BLOCKER_REAL`, `RISCO_OPERACIONAL`, `PADRONIZACAO` e `CUSTOMIZACAO`.
- Categorias operacionais devem usar labels em portugues na UI e codigos canonicos na API.
