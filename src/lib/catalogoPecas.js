// Catálogo pré-definido de peças para motos e carros com informações tributárias (NCM)
// Organizado por tipo de veículo e categoria. O lojista pode importar itens ao estoque
// informando apenas a quantidade, ou baixar a lista em CSV.

export const CATALOGO_PECAS = {
  motos: {
    label: 'Motos',
    categorias: [
      {
        nome: 'Motor',
        pecas: [
          { description: 'Pistão (kit) - std', ncm: '84073190', unit: 'cj', cfop: '5102' },
          { description: 'Anéis de pistão (jogo) - std', ncm: '84099190', unit: 'cj', cfop: '5102' },
          { description: 'Bielas', ncm: '84099140', unit: 'un', cfop: '5102' },
          { description: 'Virabrequim', ncm: '84099140', unit: 'un', cfop: '5102' },
          { description: 'Válvulas (admissão/escape)', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Mola de válvula', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Comando de válvulas', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Junta do motor (completa)', ncm: '84099190', unit: 'cj', cfop: '5102' },
          { description: 'Retentor de válvula', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Bucha de biela', ncm: '84099190', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Transmissão e Embreagem',
        pecas: [
          { description: 'Kit embreagem (3 peças)', ncm: '84831010', unit: 'cj', cfop: '5102' },
          { description: 'Platô', ncm: '84831010', unit: 'un', cfop: '5102' },
          { description: 'Disco de embreagem', ncm: '84831010', unit: 'un', cfop: '5102' },
          { description: 'Cabo de embreagem', ncm: '84139090', unit: 'un', cfop: '5102' },
          { description: 'Corrente de transmissão', ncm: '73151290', unit: 'un', cfop: '5102' },
          { description: 'Coroa de transmissão', ncm: '84839000', unit: 'un', cfop: '5102' },
          { description: 'Pinhão de transmissão', ncm: '84839000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Suspensão e Chassi',
        pecas: [
          { description: 'Amortecedor traseiro', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Amortecedor dianteiro (garfo)', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Óleo de garfo', ncm: '27101982', unit: 'lt', cfop: '5102' },
          { description: 'Retentor de garfo', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Mata-cachorro (pedal lateral)', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Cavalete lateral', ncm: '87141000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Freios',
        pecas: [
          { description: 'Pastilha de freio dianteiro', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Pastilha de freio traseiro', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Disco de freio', ncm: '87083011', unit: 'un', cfop: '5102' },
          { description: 'Lona de freio (sapata)', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Fluido de freio DOT4', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Cilindro mestre de freio', ncm: '87083090', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Elétrica e Ignição',
        pecas: [
          { description: 'Vela de ignição (NGK/Bosch)', ncm: '85111010', unit: 'un', cfop: '5102' },
          { description: 'Bobina de ignição', ncm: '85113090', unit: 'un', cfop: '5102' },
          { description: 'Bateria 12V', ncm: '85072000', unit: 'un', cfop: '5102' },
          { description: 'Motor de partida', ncm: '85114000', unit: 'un', cfop: '5102' },
          { description: 'Alternador/Estator', ncm: '85112000', unit: 'un', cfop: '5102' },
          { description: 'Regulador de voltagem', ncm: '85112000', unit: 'un', cfop: '5102' },
          { description: 'Lâmpada farol LED', ncm: '85392990', unit: 'un', cfop: '5102' },
          { description: 'Lâmpada lanterna', ncm: '85392990', unit: 'un', cfop: '5102' },
          { description: 'Interruptor de partida', ncm: '85365090', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Combustível e Admissão',
        pecas: [
          { description: 'Carburador', ncm: '84099090', unit: 'un', cfop: '5102' },
          { description: 'Bomba de combustível', ncm: '84132090', unit: 'un', cfop: '5102' },
          { description: 'Filtro de ar', ncm: '84212300', unit: 'un', cfop: '5102' },
          { description: 'Filtro de combustível', ncm: '84212300', unit: 'un', cfop: '5102' },
          { description: 'Bico injetor', ncm: '84099090', unit: 'un', cfop: '5102' },
          { description: 'Tanque de combustível', ncm: '87141000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Pneus e Rodas',
        pecas: [
          { description: 'Pneu dianteiro 90/90-17', ncm: '40112000', unit: 'un', cfop: '5102' },
          { description: 'Pneu traseiro 120/80-17', ncm: '40112000', unit: 'un', cfop: '5102' },
          { description: 'Câmara de ar', ncm: '40132000', unit: 'un', cfop: '5102' },
          { description: 'Roda dianteira (aro)', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Roda traseira (aro)', ncm: '87141000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Exaustão e Escape',
        pecas: [
          { description: 'Escape (silencioso)', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Curva de escape', ncm: '87141000', unit: 'un', cfop: '5102' },
          { description: 'Abafador de escape', ncm: '87141000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Lubrificação e Filtros',
        pecas: [
          { description: 'Óleo de motor 20W50 (1L)', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Óleo de motor 10W40 (1L)', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Filtro de óleo', ncm: '84212300', unit: 'un', cfop: '5102' },
        ],
      },
    ],
  },
  carros: {
    label: 'Carros',
    categorias: [
      {
        nome: 'Motor',
        pecas: [
          { description: 'Kit pistão (std)', ncm: '84099140', unit: 'cj', cfop: '5102' },
          { description: 'Anéis de pistão (jogo std)', ncm: '84099190', unit: 'cj', cfop: '5102' },
          { description: 'Jogo de bronzinas (mancal)', ncm: '84099190', unit: 'cj', cfop: '5102' },
          { description: 'Junta de cabeçote', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Retentor de válvula', ncm: '84099190', unit: 'cj', cfop: '5102' },
          { description: 'Válvula de admissão', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Válvula de escape', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Comando de válvulas', ncm: '84099190', unit: 'un', cfop: '5102' },
          { description: 'Bomba de óleo', ncm: '84136090', unit: 'un', cfop: '5102' },
          { description: 'Bomba d\'água', ncm: '84135090', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Freios',
        pecas: [
          { description: 'Pastilha de freio dianteiro', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Pastilha de freio traseiro', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Disco de freio', ncm: '87083011', unit: 'un', cfop: '5102' },
          { description: 'Lona de freio (sapata)', ncm: '68138100', unit: 'cj', cfop: '5102' },
          { description: 'Cilindro de roda', ncm: '87083090', unit: 'un', cfop: '5102' },
          { description: 'Cilindro mestre de freio', ncm: '87083090', unit: 'un', cfop: '5102' },
          { description: 'Fluido de freio DOT4', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Latinha de freio (pinça)', ncm: '87083090', unit: 'un', cfop: '5102' },
          { description: 'Mangueira de freio', ncm: '40093100', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Suspensão e Direção',
        pecas: [
          { description: 'Amortecedor dianteiro', ncm: '87088000', unit: 'un', cfop: '5102' },
          { description: 'Amortecedor traseiro', ncm: '87088000', unit: 'un', cfop: '5102' },
          { description: 'Kit de suspensão dianteira', ncm: '87088000', unit: 'cj', cfop: '5102' },
          { description: 'Terminal de direção', ncm: '87089990', unit: 'un', cfop: '5102' },
          { description: 'Axial de direção', ncm: '87089990', unit: 'un', cfop: '5102' },
          { description: 'Homocinética (tripoide)', ncm: '87089990', unit: 'un', cfop: '5102' },
          { description: 'Bucha de suspensão', ncm: '87089990', unit: 'un', cfop: '5102' },
          { description: 'Rolamento de roda', ncm: '84821010', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Embreagem e Transmissão',
        pecas: [
          { description: 'Kit embreagem (3 peças)', ncm: '87089300', unit: 'cj', cfop: '5102' },
          { description: 'Platô', ncm: '87089300', unit: 'un', cfop: '5102' },
          { description: 'Disco de embreagem', ncm: '87089300', unit: 'un', cfop: '5102' },
          { description: 'Cabo de embreagem', ncm: '84139090', unit: 'un', cfop: '5102' },
          { description: 'Cilindro escravo (hidráulica)', ncm: '87089300', unit: 'un', cfop: '5102' },
          { description: 'Volante do motor', ncm: '87089400', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Elétrica e Ignição',
        pecas: [
          { description: 'Vela de ignição', ncm: '85111010', unit: 'un', cfop: '5102' },
          { description: 'Bobina de ignição', ncm: '85113090', unit: 'un', cfop: '5102' },
          { description: 'Bateria 60Ah', ncm: '85072000', unit: 'un', cfop: '5102' },
          { description: 'Motor de partida', ncm: '85114000', unit: 'un', cfop: '5102' },
          { description: 'Alternador', ncm: '85112000', unit: 'un', cfop: '5102' },
          { description: 'Lâmpada farol H4', ncm: '85392990', unit: 'un', cfop: '5102' },
          { description: 'Lâmpada farol LED', ncm: '85392990', unit: 'un', cfop: '5102' },
          { description: 'Fusível', ncm: '85361000', unit: 'un', cfop: '5102' },
          { description: 'Sensor de oxigênio (sonda lambda)', ncm: '90271000', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Combustível e Admissão',
        pecas: [
          { description: 'Bomba de combustível', ncm: '84132090', unit: 'un', cfop: '5102' },
          { description: 'Filtro de ar', ncm: '84212300', unit: 'un', cfop: '5102' },
          { description: 'Filtro de combustível', ncm: '84212300', unit: 'un', cfop: '5102' },
          { description: 'Bico injetor', ncm: '84099090', unit: 'un', cfop: '5102' },
          { description: 'Borboleta de aceleração (TBI)', ncm: '84099090', unit: 'un', cfop: '5102' },
          { description: 'Tanque de combustível', ncm: '87089990', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Arrefecimento',
        pecas: [
          { description: 'Radiador', ncm: '87089100', unit: 'un', cfop: '5102' },
          { description: 'Mangueira do radiador', ncm: '40093100', unit: 'un', cfop: '5102' },
          { description: 'Termostato', ncm: '84818090', unit: 'un', cfop: '5102' },
          { description: 'Líquido de arrefecimento (1L)', ncm: '38200000', unit: 'un', cfop: '5102' },
          { description: 'Ventoinha do radiador', ncm: '84145990', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Exaustão e Escape',
        pecas: [
          { description: 'Catalisador', ncm: '87089200', unit: 'un', cfop: '5102' },
          { description: 'Escape (silencioso)', ncm: '87089200', unit: 'un', cfop: '5102' },
          { description: 'Coletor de escape', ncm: '87089200', unit: 'un', cfop: '5102' },
          { description: 'Junta de escape', ncm: '87089200', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Pneus e Rodas',
        pecas: [
          { description: 'Pneu 175/70 R14', ncm: '40111000', unit: 'un', cfop: '5102' },
          { description: 'Pneu 195/65 R15', ncm: '40111000', unit: 'un', cfop: '5102' },
          { description: 'Pneu 205/55 R16', ncm: '40111000', unit: 'un', cfop: '5102' },
          { description: 'Câmara de ar', ncm: '40132000', unit: 'un', cfop: '5102' },
          { description: 'Roda de liga leve 15"', ncm: '87087090', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Lubrificação e Filtros',
        pecas: [
          { description: 'Óleo de motor 5W30 sintético (1L)', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Óleo de motor 10W40 (1L)', ncm: '27101982', unit: 'un', cfop: '5102' },
          { description: 'Filtro de óleo', ncm: '84212300', unit: 'un', cfop: '5102' },
        ],
      },
      {
        nome: 'Carroceria e Para-choques',
        pecas: [
          { description: 'Para-choque dianteiro', ncm: '87081000', unit: 'un', cfop: '5102' },
          { description: 'Para-choque traseiro', ncm: '87081000', unit: 'un', cfop: '5102' },
          { description: 'Retrovisor (espelho) lado direito', ncm: '87082949', unit: 'un', cfop: '5102' },
          { description: 'Retrovisor (espelho) lado esquerdo', ncm: '87082949', unit: 'un', cfop: '5102' },
          { description: 'Grade frontal', ncm: '87082949', unit: 'un', cfop: '5102' },
          { description: 'Farol completo', ncm: '85122000', unit: 'un', cfop: '5102' },
          { description: 'Lanterna traseira', ncm: '85122000', unit: 'un', cfop: '5102' },
        ],
      },
    ],
  },
};

// Gera CSV de todo o catálogo (ou de um tipo de veículo) para download
export function gerarCSVCatalogo(tipoVeiculo = null) {
  const linhas = ['Tipo Veiculo,Categoria,Descricao,NCM,Unidade,CFOP,Quantidade,Custo,Venda'];
  const tipos = tipoVeiculo ? { [tipoVeiculo]: CATALOGO_PECAS[tipoVeiculo] } : CATALOGO_PECAS;
  Object.entries(tipos).forEach(([key, grupo]) => {
    grupo.categorias.forEach(cat => {
      cat.pecas.forEach(p => {
        linhas.push([
          grupo.label,
          cat.nome,
          `"${p.description}"`,
          p.ncm,
          p.unit,
          p.cfop,
          '', // quantidade - lojista preenche
          '', // custo
          '', // venda
        ].join(','));
      });
    });
  });
  return linhas.join('\n');
}

export function baixarCSVCatalogo(tipoVeiculo = null) {
  const csv = gerarCSVCatalogo(tipoVeiculo);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalogo-pecas-${tipoVeiculo || 'completo'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}