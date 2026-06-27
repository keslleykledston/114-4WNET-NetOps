# NetOps no Telegram

Guia rápido para operar a plataforma NetOps pelo bot Hermes no Telegram.

## Setup (uma vez)

```bash
./hermes/scripts/telegram-setup.sh
```

Isso instala o profile `netops`, publica skills curtas no gateway e reinicia o bot.

## Comandos instantâneos

Resposta direta, **sem passar pelo LLM** (rápido):

| Comando | Resultado |
|---------|-----------|
| `/health` | API online? |
| `/devices` | Lista de equipamentos |
| `/flags` | Feature flags ativas |
| `/docker` | Status dos containers |

## Sub-agentes (com LLM + skill)

| Comando | Papel | Exemplo |
|---------|-------|---------|
| `/nop` | Orquestrador | `/nop diagnosticar device 3` |
| `/ndiag` | Ping/latência/jitter | `/ndiag teste ping www.google.com.br` |
| `/netops` | Igual `/nop` | `/netops status geral` |
| `/nssh` | SSH read-only | `/nssh 1 display interface brief` |
| `/nq` | Consultas API | `/nq device 5` |
| `/ntest` | Testes | `/ntest ci` |

### Atalhos com argumentos

```
/nssh 3 display bgp peer
/nq connector-jobs 1
/ntest domain connectors
/nq devices-stats
```

## Português natural (sem /)

Também funciona escrever normalmente:

- **"teste o ping pra www.google.com.br"** → diagnóstico com latência e jitter
- "lista os devices"
- "qual o health da api?"
- "ssh no device 1 display version"
- "roda testes de l2"

O orquestrador classifica a intenção e aciona o sub-agente `netops-diag` para ping/latência/jitter.

## Menu do Telegram

O bot registra comandos no menu (ícone `/` ao lado do campo de texto).  
Hermes limita ~30 entradas visíveis; use `/commands` para ver a lista completa.

Nomes curtos (`nssh`, `nq`, `ntest`, `nop`) foram escolhidos para caber no menu.

## Segurança

- SSH apenas read-only (`display`, `show`, `ping`)
- Sem credenciais na conversa
- Sem `configure` / `commit` em equipamentos

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Comando desconhecido | Rodar `./hermes/scripts/telegram-setup.sh` |
| `/devices` vazio ou erro | API down ou credenciais — verificar `.env` |
| SSH falha | Connector WG ou device ID incorreto |
| Bot não responde | `hermes gateway status` e `hermes gateway restart` |

## Reiniciar gateway após atualizar skills

```bash
hermes profile install ./hermes --name netops --force -y
./hermes/scripts/telegram-setup.sh
```
