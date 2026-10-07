"use strict";
// Erro "esperado" com código HTTP: vira resposta JSON amigável, sem derrubar a função.
class HttpError extends Error {
  constructor(status, mensagem, extra) {
    super(mensagem);
    this.status = status;
    this.extra = extra || {};
  }
}
module.exports = { HttpError };
