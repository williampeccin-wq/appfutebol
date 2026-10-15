// Notas da rodada: a média de cada jogador NAQUELE jogo, mostrada por pouco
// tempo depois que a votação de desempenho fecha.
//
// Linha do tempo de um jogo:
//   admin lança o resultado ──► votação aberta (settings.ratings_perf_window_hours)
//   ──► votação fecha ──► notas visíveis por NOTAS_RODADA_HORAS ──► somem
//
// Nunca durante a votação: a média parcial ancoraria quem ainda não votou.
// "Somem" é só da tela — os votos continuam alimentando a temporada e o sorteio.
//
// A Edge Function auto-open-games repete o cálculo da janela para mandar o push
// de "votação encerrada" (Deno não importa daqui). Mexeu aqui, mexa lá.

import { gameRatingAverages, TOP_MIN_VOTES } from '../../services/ratings.service.js';

export const NOTAS_RODADA_HORAS = 12;

// Quanto o clube expõe. Ranking completo é o padrão.
export const NOTAS_RODADA_MODOS = {
  completo: 'Ranking completo',
  so_minha: 'Só a minha nota e o top 3',
  desligado: 'Não mostrar',
};

export function modoNotasDaRodada(settings) {
  const modo = String(settings?.ratings_reveal_mode || '');
  return Object.prototype.hasOwnProperty.call(NOTAS_RODADA_MODOS, modo) ? modo : 'completo';
}

// Janela da votação de desempenho de um jogo: abre no lançamento do resultado
// (casado por DATA — o game_key do resultado é inconsistente) e dura `horas`.
// É a mesma regra que o getPerfWindow do app usa para abrir o modal de notas.
export function janelaDaVotacao(results, gameDate, horas) {
  const h = Number(horas) || 0;
  if (h <= 0) return null;
  const data = String(gameDate || '').slice(0, 10);
  if (!data) return null;
  const lancadoMs = (results || [])
    .filter((r) => String(r?.date || '').slice(0, 10) === data)
    .map((r) => Date.parse(r?.created_at || ''))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a)[0];
  if (!lancadoMs) return null;
  return { openMs: lancadoMs, closeMs: lancadoMs + h * 3600_000 };
}

// Janela em que as notas da rodada ficam à mostra: do fim da votação até
// NOTAS_RODADA_HORAS depois.
export function janelaDasNotas(results, gameDate, horas) {
  const votacao = janelaDaVotacao(results, gameDate, horas);
  if (!votacao) return null;
  return { openMs: votacao.closeMs, closeMs: votacao.closeMs + NOTAS_RODADA_HORAS * 3600_000 };
}

// Jogo cujas notas estão à mostra agora — o mais recente, se houver mais de um.
export function jogoComNotasAMostra(games, results, horas, agoraMs = Date.now()) {
  return (games || [])
    .slice()
    .sort((a, b) => String(b?.game_date || '').localeCompare(String(a?.game_date || '')))
    .find((game) => {
      const janela = janelaDasNotas(results, game?.game_date, horas);
      return !!janela && agoraMs >= janela.openMs && agoraMs < janela.closeMs;
    }) || null;
}

// Ranking da rodada. Quem tem menos de TOP_MIN_VOTES votos fica no fim, sem
// média: com 1 ou 2 votos o número praticamente aponta quem votou.
export function notasDaRodada(rows, gameKey) {
  const medias = gameRatingAverages(rows, gameKey);
  const linhas = Object.entries(medias).map(([id, { avg, votes }]) => ({
    id,
    media: avg,
    votos: votes,
    poucosVotos: votes < TOP_MIN_VOTES,
  }));
  linhas.sort((a, b) => {
    if (a.poucosVotos !== b.poucosVotos) return a.poucosVotos ? 1 : -1;
    if (a.poucosVotos) return 0;
    return (b.media - a.media) || (b.votos - a.votos);
  });
  let posicao = 0;
  for (const linha of linhas) linha.posicao = linha.poucosVotos ? null : ++posicao;
  return linhas;
}

// "7,4" — vírgula, uma casa.
export function formatarMedia(media) {
  return Number(media || 0).toFixed(1).replace('.', ',');
}
