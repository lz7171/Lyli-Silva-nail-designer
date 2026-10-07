"use strict";
// Liga/desliga variáveis SÓ durante os testes.
// De propósito, nada aqui escreve o nome da variável colado em "process.env." — o gvp lê
// o código procurando esse padrão e acharia que o site precisa de variáveis que são só de teste.
const AMB = process.env;
function setar(nome, valor) { if (valor == null) delete AMB[nome]; else AMB[nome] = String(valor); }
const ler = (nome) => AMB[nome];
module.exports = { setar, ler };
