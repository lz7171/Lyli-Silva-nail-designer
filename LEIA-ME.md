# Lyli Silva Nail Designer — site + painel + lembretes (compatível com o GVP 7)

Nenhuma senha ou token fica nos arquivos. Tudo fica no **cofre do gvp**, que envia para a Vercel.

## Variáveis que o site usa (o gvp detecta sozinho)

| Variável | Para quê | Como preencher |
|---|---|---|
| `ADMIN_PASSWORD` | senha do painel `/admin` | o gvp pergunta (Enter = gera uma forte e mostra uma vez) |
| `WAPITO_API_TOKEN` | enviar os lembretes por WhatsApp | o gvp pergunta: cole o token da Wapito (começa com `wpt_`) |
| `CRON_SECRET` | proteger o envio automático das 9h | **o gvp gera sozinho** |

O endereço da Wapito (`https://api.wapito.com/v1`) já vem no código (não é segredo).
O banco (Upstash Redis) é ligado pela própria Vercel em **Storage** — o gvp não precisa dele.

## Atualizar o site pelo gvp

1. `gvp` → **Meus sites** → `Lyli-Silva-nail-designer` → **📦 Atualizar com novo ZIP** → escolha este ZIP → `s`.
2. **Fazer deploy agora?** → `s`.
3. O preflight vai avisar *Variáveis ausentes*. Em **Aplicar as correções automáticas?** responda `s`:
   - **Senha do administrador**: digite uma (mínimo 10 caracteres) ou aperte **Enter** para gerar. **Anote.**
   - **Valor de WAPITO_API_TOKEN**: cole o token da Wapito.
   - `CRON_SECRET` é gerado sozinho.
4. O gvp publica e testa o site de verdade (`/` e `/api/health`).

Prefere preencher antes? Dentro da pasta do site: `gvp admin setup` e `gvp env set WAPITO_API_TOKEN`, depois `gvp deploy`.

## Depois de publicar

- `gvp admin test` → confirma que a senha certa entra e a errada é recusada.
- No painel (`seu-site/admin`) → aba **Lembretes** → **Testar o WhatsApp** com o seu número.

## Se aparecer erro

| O gvp mostra | O que fazer |
|---|---|
| `HTTP 503 em /api/health` | O banco não está ligado neste projeto da Vercel. Vercel → projeto → **Storage** → conecte o **Upstash Redis** → rode `gvp deploy` de novo. Abra `seu-site/api/health` para ver o motivo exato. |
| `Variáveis ausentes` | `gvp preflight --fix` (ele pergunta só o que falta). |
| Lembrete: "A Wapito recusou o token" | Gere um token novo na Wapito e rode `gvp env set WAPITO_API_TOKEN` e `gvp deploy`. |
| Lembrete: "não reconheceu o endereço" | Mande ao suporte da Wapito o texto que apareceu e pergunte o endereço e os campos de envio de texto. Depois: `gvp env set WAPITO_SEND_PATH`, `WAPITO_FIELD_PHONE`, `WAPITO_FIELD_TEXT`. |

## Painel — como usar

- Ao entrar aparece só a **Agenda**. As outras partes ficam no botão **☰ Menu** (Horários e dias, Site, Lembretes, Ver o site, Sair).
- **Horários padrão**: toque no **×** para tirar; para pôr de volta, toque em **+ Adicionar horário** e escolha na lista
  (ou "Outro horário…" para digitar, ex.: 10h40). Depois toque em **Salvar alterações**.
  Enquanto não salvar, aparece *"Você tem alterações não salvas"* e um pontinho vermelho no Menu.
- **Fechar um horário de um dia** (ex.: só a quinta às 14h30): Agenda → *Fechar dias e horários* → *Um horário*.
  Ele aparece na lista como "Horário fechado", com o botão **Reabrir**. Também dá para fechar um dia inteiro ou vários dias.
- **Lembretes**: cada cliente recebe **uma** mensagem só (1 dia antes, por volta das 9h, ou no próprio dia).

## Como funciona o envio pela Wapito

A Wapito não tem documentação pública. Na **primeira** mensagem o sistema testa sozinho os formatos mais
usados e guarda o que funcionou; depois usa sempre esse. Nenhuma tentativa errada envia mensagem.

## Estrutura

```
site/index.html        Página inicial (intacta)
admin/                 Painel (telas intactas)
api/agenda.js          Agendamento público          api/admin.js        Painel
api/lembretes.js       Envio diário (9h)            api/site.js         Entrega a home + edições
api/media.js           Fotos                        api/health.js       Saúde do site (teste do gvp)
api/admin-login.js     Confere a senha (gvp admin test)
lib/ambiente.js        ★ Único lugar que lê as variáveis (process.env)
lib/                   Regras do sistema          tests/   Testes (npm test) — não vão para a Vercel
vercel.json            Rotas, bloqueios, segurança e agendador diário
```

Testes: `npm install && npm test` (45 verificações). Tela: `npm i --no-save jsdom esbuild && node tests/ui.js`.
