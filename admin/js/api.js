// Comunicação com o servidor (/api/admin).
const CHAVE = "lyli_admin_pass";
const ler = () => { try { return sessionStorage.getItem(CHAVE) || ""; } catch (e) { return ""; } };
const gravar = (v) => { try { v ? sessionStorage.setItem(CHAVE, v) : sessionStorage.removeItem(CHAVE); } catch (e) {} };

let senha = ler();
export const temSenha = () => !!senha;
export function definirSenha(s, lembrar) { senha = s; if (lembrar !== false) gravar(s); }
export function esquecerSenha() { senha = ""; gravar(""); }

// Nunca lança erro: falha de rede vira status 0
export async function chamar(opt) {
  const c = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => c && c.abort(), 25000);
  try {
    const r = await fetch("/api/admin", {
      ...(opt || {}), cache: "no-store", signal: c ? c.signal : undefined,
      headers: { "Content-Type": "application/json", "x-admin-pass": encodeURIComponent(senha) },
    });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { r, j };
  } catch (e) {
    return { r: { ok: false, status: 0 }, j: { error: "Sem conexão com o servidor." } };
  } finally { clearTimeout(t); }
}
export const acao = (body) => chamar({ method: "POST", body: JSON.stringify(body) });

let aoExpirar = () => {};
export const quandoExpirar = (fn) => (aoExpirar = fn);
// Devolve null se deu certo, ou o texto do erro
export function erroDe(r, j, padrao) {
  if (r.ok) return null;
  if (r.status === 401) { aoExpirar(); return "Sessão expirada."; }
  if (r.status === 0) return "Sem conexão. Verifique a internet e tente de novo.";
  return j.error || padrao;
}
