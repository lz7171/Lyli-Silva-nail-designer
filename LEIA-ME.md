# Lyli Silva Nail Designer — site + painel + lembretes

## Como colocar no ar (5 passos)

1. **Suba esta pasta inteira** do mesmo jeito que você já subia (GitHub → Vercel). Não precisa instalar nada.
2. Na Vercel, abra o projeto → **Settings → Environment Variables** e cadastre (marque Production, Preview e Development):

   | Nome | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | a senha que você quer para o painel (mínimo 6 caracteres) |
   | `WAPITO_API_TOKEN` | o token da Wapito (**gere um novo**, veja o aviso abaixo) |
   | `CRON_SECRET` | qualquer texto longo e aleatório (ex.: 40 letras e números) |

   O banco (Upstash Redis) continua o mesmo de antes — se já estava funcionando, não mexa.
3. Vá em **Deployments → ⋯ → Redeploy** para as variáveis valerem.
4. Abra `seu-site.com/admin`, entre com a senha e vá na aba **Lembretes → Testar o WhatsApp**: digite o seu número e confira se a mensagem chega.
5. Pronto. Todo dia às **9h** o sistema envia os lembretes sozinho.

> ⚠️ **Segurança:** o token da Wapito foi colado numa conversa, então considere-o exposto. Entre na Wapito, **gere um token novo** e use o novo no passo 2. Nunca coloque senhas ou tokens dentro dos arquivos do site.

## O que mudou

- **Página inicial (`site/index.html`): arquivo idêntico ao original, nenhum byte alterado.** O fluxo de agendamento é o mesmo. O arquivo só mudou de pasta; o painel aplica as edições por cima na hora de entregar a página. Se não houver nenhuma edição salva (ou se o banco cair), sai exatamente o original.
- **Painel (`/admin`) completo**, em 4 abas:
  - **Agenda** — ver/buscar/cancelar, agendar manualmente (com WhatsApp), bloquear dia ou período, botão *Lembrar agora*.
  - **Horários e dias** — liga/desliga o agendamento, horários, dias da semana, prazo, **períodos especiais por mês/data** (ex.: dezembro), WhatsApp, link do mapa, frase de apresentação.
  - **Site** — todos os textos, logo, cores, seção *Sobre mim*, *Serviços e preços*, *Galeria de fotos*, linhas extras em *Informações* (Instagram, endereço…), biblioteca de fotos (reduzidas automaticamente).
  - **Lembretes** — mensagem editável com `{data}`, `{hora}`, `{nome}`, `{dia_semana}`, prévia, envio manual, teste e histórico.
- **Lembretes por WhatsApp (Wapito):** automático diário; ninguém recebe duas vezes; falha na Wapito não marca como enviado (tenta de novo no dia seguinte ou pelo botão). Clientes agendadas pelo site já informam o WhatsApp; para agendamentos manuais, preencha o número.
- **Segurança:** removida a senha padrão que existia no código (agora o painel só abre com `ADMIN_PASSWORD`); texto digitado nunca vira código na tela; fotos validadas; painel com proteção extra de navegador (CSP).
- **Código organizado** em arquivos separados (veja abaixo) e `package.json` incluído (o original não tinha).

## Duas observações honestas

1. **Wapito:** não consegui acessar a documentação da Wapito, então o formato do envio (`POST {api}/messages` com `to` e `message`, token `Bearer`) é o padrão mais comum, **não confirmado**. Use o **Testar o WhatsApp** (aba Lembretes): se a Wapito recusar, a tela mostra a resposta dela. Para ajustar **sem mexer em código**, cadastre na Vercel as variáveis opcionais `WAPITO_SEND_PATH`, `WAPITO_FIELD_PHONE`, `WAPITO_FIELD_TEXT` (veja `.env.example`) conforme a documentação da Wapito.
2. **Calendário da página inicial:** como a página inicial não pode ser alterada, ela continua mostrando terça a sábado por 60 dias. Se um dia você mudar os dias de atendimento no painel (ex.: abrir domingo), ligue a opção **"A página inicial segue estes dias e prazo"** na aba Horários e dias.

## Estrutura

```
site/index.html        Página inicial (intacta)
admin/                 Painel: index.html, css/admin.css, js/ (um arquivo por aba)
api/agenda.js          Agendamento público (inalterado)
api/admin.js           Painel (roteador)      api/lembretes.js  Envio diário
api/site.js            Entrega a home + edições   api/media.js  Fotos
lib/                   Regras do sistema (datas, config, site, whatsapp, lembretes...)
lib/handlers/          Uma ação do painel por função
tests/                 Testes automáticos (npm test)
vercel.json            Rotas, segurança e agendador diário
```

Testes: `npm install && npm test` (26 verificações do servidor). O teste de tela usa `npm i --no-save jsdom esbuild && node tests/ui.js`.
