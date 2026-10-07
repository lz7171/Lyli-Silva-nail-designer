"use strict";
// Ponto único de importação (mantém compatibilidade com api/agenda.js).
const datas = require("./datas");
const redis = require("./redis");
const util = require("./util");
const seg = require("./seguranca");
const cfg = require("./config");

module.exports = {
  ...datas, ...util, ...seg, ...cfg,
  credenciais: redis.credenciais, getRedis: redis.getRedis, K: redis.K,
  chaveAgenda: redis.K.agenda, chaveBloqueio: redis.K.bloqueio,
  CHAVE_CFG: redis.K.config,
  JANELA_DIAS: cfg.DEFAULT_CFG.janela, TIMES: cfg.DEFAULT_CFG.times,
};
