// Que ações uma OS oferece, conforme o estado.
//
// A tela decidia isso inline: `isActive = status !== 'cancelada' &&
// status !== 'faturada'`, e o botão Cancelar morava dentro desse bloco.
// Todo pagamento marca a OS como faturada — então, depois de paga, o botão
// sumia. O estorno (devolver o dinheiro ao cliente ao cancelar uma OS paga)
// estava pronto e testado, e nenhuma tela chegava até ele.
//
// A decisão mora aqui para que a suíte possa perguntar o que importa: toda
// OS que ainda não foi cancelada tem um caminho para ser cancelada?

export const ESTADOS_OS = ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada', 'faturada', 'cancelada'];

export function acoesDaOrdem(ordem) {
  const s = ordem?.status;
  const conhecido = ESTADOS_OS.includes(s);
  const emAberto = conhecido && s !== 'cancelada' && s !== 'faturada';
  return {
    // Mudar estado, editar e receber: só enquanto não foi paga nem cancelada.
    podeMudarEstado: emAberto,
    podeReceber: emAberto,
    // Cancelar: sempre, exceto o que já está cancelado.
    podeCancelar: conhecido && s !== 'cancelada',
    // Paga: cancelar é estorno — o dinheiro volta ao cliente.
    cancelarDevolveDinheiro: s === 'faturada',
  };
}
