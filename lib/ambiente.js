"use strict";
// Configurações do sistema. NENHUM valor secreto fica em arquivo: tudo vem das
// variáveis de ambiente, que o gvp guarda no cofre e envia para a Vercel.
//
// OBRIGATÓRIAS (o gvp detecta sozinho e pede/gera na hora do deploy):
//   ADMIN_PASSWORD     senha do painel /admin            → gvp admin setup (Enter = gera uma forte)
//   WAPITO_API_TOKEN   token da Wapito (começa com wpt_) → gvp env set WAPITO_API_TOKEN
//   CRON_SECRET        protege o envio automático das 9h → o gvp GERA sozinho
//
// OPCIONAIS (só se precisar mudar algo; não precisam existir):
//   WAPITO_API_URL     padrão: https://api.wapito.com/v1
//   WAPITO_SEND_PATH, WAPITO_FIELD_PHONE, WAPITO_FIELD_TEXT  (formato fixo da Wapito)
//   Banco Upstash: a Vercel cria sozinha ao conectar o Storage (UPSTASH_REDIS_REST_* ou KV_REST_API_*)

// remove espaços e aspas que às vezes vêm junto ao colar o valor
function limpar(v) {
  return String(v == null ? "" : v).trim().replace(/^["']+|["']+$/g, "").trim();
}

// Obrigatórias: lidas pelo nome exato, para o gvp reconhecer (gvp env detect)
const senhaAdmin = () => limpar(process.env.ADMIN_PASSWORD);
const tokenWapito = () => limpar(process.env.WAPITO_API_TOKEN);
const segredoCron = () => limpar(process.env.CRON_SECRET);

// Opcionais e avançadas: lidas pelo nome (o gvp não precisa cobrá-las)
function opcional(nome) { return limpar(process.env[nome]); }

module.exports = { limpar, senhaAdmin, tokenWapito, segredoCron, opcional };
