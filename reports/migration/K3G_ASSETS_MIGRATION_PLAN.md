# K3G Assets Migration Plan

## Contexto

Projeto destino: `114-4WNET-NetOps`.

Referencia visual pontual: `60-bgp_manager`.

Objetivo futuro: aplicar identidade K3G de forma compativel com o design atual do 114, sem trocar layout, tema, Tailwind, shadcn/ui, spacing ou sidebar global.

## Assets localizados no 60-bgp_manager

Busca feita em `../60-bgp_manager`.

Assets encontrados:

- `../60-bgp_manager/frontend/public/favicon-light.png`
- `../60-bgp_manager/frontend/public/favicon-dark.png`
- `../60-bgp_manager/frontend/public/apple-touch-icon-light.png`
- `../60-bgp_manager/frontend/public/apple-touch-icon-dark.png`

Referencias no HTML do 60:

- `../60-bgp_manager/frontend/index.html`
  - usa favicon light/dark por `prefers-color-scheme`;
  - usa apple touch icon light/dark por `prefers-color-scheme`.

Observacao: nesta busca inicial nao apareceu logo K3G separado alem dos favicons/apple-touch icons. Antes da implementacao, repetir busca em profundidade total e validar se ha asset em outro diretorio privado/interno.

## Assets existentes no 114

Assets atuais encontrados:

- `workspace/artifacts/netops-manager/public/favicon.svg`
- `workspace/artifacts/netops-manager/public/opengraph.jpg`

HTML atual:

- `workspace/artifacts/netops-manager/index.html`
  - usa `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

Regra: nao sobrescrever estes arquivos sem backup. Preferir adicionar novos assets com nomes K3G claros.

## Destinos planejados

Copiar/adaptar para:

```text
workspace/artifacts/netops-manager/public/k3g-favicon-light.png
workspace/artifacts/netops-manager/public/k3g-favicon-dark.png
workspace/artifacts/netops-manager/public/k3g-apple-touch-icon-light.png
workspace/artifacts/netops-manager/public/k3g-apple-touch-icon-dark.png
```

Se for necessario manter `favicon.svg`, deixar arquivo original intacto e adicionar links PNG antes/depois conforme comportamento testado no navegador.

## Mudancas planejadas em index.html

Adicionar links sem remover metadados existentes:

```html
<link rel="icon" type="image/png" href="/k3g-favicon-light.png" media="(prefers-color-scheme: light)" />
<link rel="icon" type="image/png" href="/k3g-favicon-dark.png" media="(prefers-color-scheme: dark)" />
<link rel="apple-touch-icon" href="/k3g-apple-touch-icon-light.png" media="(prefers-color-scheme: light)" />
<link rel="apple-touch-icon" href="/k3g-apple-touch-icon-dark.png" media="(prefers-color-scheme: dark)" />
```

Manter fallback existente ou definir fallback explicito para light, sem apagar asset antigo antes de validar.

## Uso no frontend

Aplicar icone K3G somente em pontos pequenos e compativeis:

- dashboard: header ou card de contexto se ja houver area visual adequada;
- sidebar: somente se substituir/adaptar icone existente sem alterar altura/largura/spacing;
- header: somente se houver slot natural para marca.

Nao permitido:

- trocar sidebar global;
- aumentar header;
- alterar tokens CSS;
- trocar paleta;
- criar hero/landing;
- copiar layout do 60;
- inserir imagem grande que mude densidade operacional.

## Licenca e autoria interna

Antes de copiar:

- confirmar que assets pertencem ao uso interno K3G/4WNET;
- registrar origem no commit/PR;
- manter nomes que indiquem origem K3G;
- nao baixar asset externo sem autorizacao.

## Checklist de implementacao futura

- [ ] Repetir busca de assets em `../60-bgp_manager`.
- [ ] Confirmar dimensoes e transparencia dos PNGs.
- [ ] Copiar com nomes claros para `public/`.
- [ ] Nao sobrescrever `favicon.svg` nem `opengraph.jpg`.
- [ ] Atualizar `index.html`.
- [ ] Aplicar icone pequeno no dashboard/header/sidebar se encaixar no layout atual.
- [ ] Validar favicon na aba do navegador.
- [ ] Validar icone K3G visivel sem quebra visual.
- [ ] Rodar `pnpm run typecheck`.
- [ ] Rodar `BASE_PATH=/ PORT=5000 pnpm run build`.
- [ ] Rodar `tools/netops-audit.sh`.
- [ ] Aplicar container `web` se houver alteracao runtime.

## Criterio de aceite

- Favicon aparece na aba do navegador.
- Icone K3G aparece na dashboard ou sidebar conforme padrao atual.
- Build OK.
- Typecheck OK.
- Audit OK.
- Sem quebra visual.
