// Estado compartilhado entre as abas.
export const E = {
  hoje: "", agendamentos: [], bloqueios: [], times: [],
  cfg: null, site: null, midias: [], lembretes: { whatsappConfigurado: false, proximaData: "", log: [] }, diag: {},
};
export function aplicar(j) {
  Object.assign(E, {
    hoje: j.hoje || E.hoje, agendamentos: j.agendamentos || [], bloqueios: j.bloqueios || [], times: j.times || [],
    cfg: j.cfg, site: j.site, midias: j.midias || [], lembretes: j.lembretes || E.lembretes, diag: j.diag || {},
  });
}
