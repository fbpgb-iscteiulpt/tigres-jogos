/* ============================================================
   Tigres — Golos esperados (xG) por equipa e por jogo
   Cada remate vale uma probabilidade de golo conforme a ZONA (dentro/fora
   da área) e o RESULTADO do remate (à baliza / fora / bloqueado).
   Penáltis = 0.76. Os remates à baliza são calibrados com os golos
   desta liga (conversão mais alta do que no futebol profissional).
   ============================================================ */

/* Valores de referência (futebol profissional, aproximados) */
const XG_PRIOR = {
  baliza:    { dentro: 0.35, fora: 0.10 },
  fora:      { dentro: 0.07, fora: 0.02 },
  bloqueado: { dentro: 0.05, fora: 0.02 },
};
const XG_PENALTI = 0.76;
const XG_K = 20; // peso da referência na calibração (≈ 20 remates à baliza)

/* Classifica uma ação de remate. Devolve null se não for remate.
   { lado: "tigres"|"adv", res: "baliza"|"fora"|"bloqueado", zona: "dentro"|"fora"|null } */
function classifyShot(acao) {
  const a = String(acao || "").toLowerCase();
  if (!a.startsWith("remate")) return null;
  const lado = a.startsWith("remate sofrido") ? "adv" : "tigres";
  const zona = /dentro de [aá]rea/.test(a) ? "dentro" : /fora de [aá]rea/.test(a) ? "fora" : null;
  const res = a.includes("bloqueado") ? "bloqueado" : a.includes("à baliza") || a.includes("a baliza") ? "baliza" : "fora";
  return { lado, res, zona };
}

/* Remates à baliza de um jogador (para precisão / notas), em qualquer zona */
function isOwnShotOnTarget(acao) { const c = classifyShot(acao); return !!c && c.lado === "tigres" && c.res === "baliza"; }

/* Contagem de remates por categoria para um lado, num jogo.
   Cada penálti substitui um remate à baliza de dentro da área (se registado) para não contar duas vezes. */
const XG_CATS = ["baliza-dentro", "baliza-fora", "fora-dentro", "fora-fora", "bloqueado-dentro", "bloqueado-fora", "sem-zona", "penalti"];
const XG_CAT_LABELS = {
  "baliza-dentro": "À baliza, dentro da área", "baliza-fora": "À baliza, fora da área",
  "fora-dentro": "Para fora, dentro da área", "fora-fora": "Para fora, fora da área",
  "bloqueado-dentro": "Bloqueado, dentro da área", "bloqueado-fora": "Bloqueado, fora da área",
  "sem-zona": "Sem zona registada", "penalti": "Penálti",
};
function shotsJornada(j, lado) {
  const c = Object.fromEntries(XG_CATS.map((k) => [k, 0]));
  for (const e of j.eventos || []) {
    if ((lado === "tigres" && e.acao === "Penalti ganho") || (lado === "adv" && e.acao === "Penalti feito")) { c.penalti++; continue; }
    const s = classifyShot(e.acao);
    if (!s || s.lado !== lado) continue;
    if (!s.zona) c["sem-zona"]++;
    else c[`${s.res}-${s.zona}`]++;
  }
  for (let p = 0; p < c.penalti; p++) if (c["baliza-dentro"] > 0) c["baliza-dentro"]--;
  return c;
}

/* Fator de calibração dos remates à baliza, a partir de todos os jogos (ambas as equipas). */
function calibrateXG(data) {
  let prior = 0, golos = 0, nBal = 0;
  for (const j of data.jornadas || []) {
    for (const lado of ["tigres", "adv"]) {
      const c = shotsJornada(j, lado);
      prior += c["baliza-dentro"] * XG_PRIOR.baliza.dentro + c["baliza-fora"] * XG_PRIOR.baliza.fora;
      nBal += c["baliza-dentro"] + c["baliza-fora"];
      const g = +(j.matchStats?.Resultado?.[lado === "tigres" ? "tigres" : "adversario"] ?? 0);
      golos += Math.max(0, g - c.penalti * XG_PENALTI);
    }
  }
  if (nBal <= 0 || prior <= 0) return 1;
  const pMed = prior / nBal; // valor médio de referência de um remate à baliza
  return (golos + XG_K * pMed) / (prior + XG_K * pMed);
}

/* Valor de cada categoria, dado o fator de calibração */
function xgValues(fator) {
  return {
    "baliza-dentro": XG_PRIOR.baliza.dentro * fator, "baliza-fora": XG_PRIOR.baliza.fora * fator,
    "fora-dentro": XG_PRIOR.fora.dentro, "fora-fora": XG_PRIOR.fora.fora,
    "bloqueado-dentro": XG_PRIOR.bloqueado.dentro, "bloqueado-fora": XG_PRIOR.bloqueado.fora,
    "sem-zona": (XG_PRIOR.fora.dentro + XG_PRIOR.fora.fora) / 2,
    "penalti": XG_PENALTI,
  };
}

/* xG de um jogo para os dois lados, com o detalhe por categoria */
function xgJornada(j, fator) {
  const v = xgValues(fator);
  const lado = (l) => {
    const c = shotsJornada(j, l);
    const linhas = XG_CATS.filter((k) => c[k] > 0).map((k) => ({ cat: k, label: XG_CAT_LABELS[k], n: c[k], valor: v[k], xg: c[k] * v[k] }));
    return { linhas, remates: XG_CATS.reduce((s, k) => s + c[k], 0), xg: linhas.reduce((s, r) => s + r.xg, 0) };
  };
  return { tigres: lado("tigres"), adv: lado("adv") };
}

/* xG da época: fator + xG por jornada */
function xgSeason(data) {
  const fator = calibrateXG(data);
  const porJornada = {};
  for (const j of data.jornadas || []) porJornada[j.numero] = xgJornada(j, fator);
  return { fator, valores: xgValues(fator), porJornada };
}

/* Golos de um jogo com minuto: [{ minuto, lado, bolaParada, jogador }] */
function goalEvents(j) {
  return (j.eventos || [])
    .filter((e) => /^Golo (marcado|sofrido)/.test(e.acao))
    .map((e) => ({ minuto: e.minuto == null ? null : +e.minuto, lado: e.acao.startsWith("Golo marcado") ? "tigres" : "adv", bolaParada: /bola parada/.test(e.acao), jogador: e.jogador || null }));
}

const TigresXG = { XG_PRIOR, XG_PENALTI, XG_CATS, XG_CAT_LABELS, classifyShot, isOwnShotOnTarget, shotsJornada, calibrateXG, xgValues, xgJornada, xgSeason, goalEvents };
if (typeof window !== "undefined") window.TigresXG = TigresXG;
if (typeof module !== "undefined" && module.exports) module.exports = TigresXG;
