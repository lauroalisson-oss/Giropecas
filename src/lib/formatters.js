export const formatCurrency = (value) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('pt-BR');
};

export const formatCPF = (cpf) => {
  if (!cpf) return '';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

export const formatCNPJ = (cnpj) => {
  if (!cnpj) return '';
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

export const formatPhone = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
};

export const maskCPF = (value) => {
  return value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const maskCNPJ = (value) => {
  return value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

export const maskPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
};

export const getStatusColor = (status) => {
  const colors = {
    aberta: 'bg-blue-100 text-blue-800',
    em_andamento: 'bg-orange-100 text-orange-800',
    aguardando_peca: 'bg-yellow-100 text-yellow-800',
    finalizada: 'bg-green-100 text-green-800',
    faturada: 'bg-purple-100 text-purple-800',
    cancelada: 'bg-red-100 text-red-800',
    a_vencer: 'bg-blue-100 text-blue-800',
    vencido: 'bg-red-100 text-red-800',
    pago: 'bg-green-100 text-green-800',
    pago_parcial: 'bg-yellow-100 text-yellow-800',
    pendente: 'bg-yellow-100 text-yellow-800',
    ativo: 'bg-green-100 text-green-800',
    inativo: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

export const getStatusLabel = (status) => {
  const labels = {
    aberta: 'Aberta',
    em_andamento: 'Em Andamento',
    aguardando_peca: 'Aguardando Peça',
    finalizada: 'Finalizada',
    faturada: 'Faturada',
    cancelada: 'Cancelada',
    a_vencer: 'A Vencer',
    vencido: 'Vencido',
    pago: 'Pago',
    pago_parcial: 'Pago Parcial',
    pendente: 'Pendente',
    fisica: 'Pessoa Física',
    juridica: 'Pessoa Jurídica',
    simples_nacional: 'Simples Nacional',
    lucro_presumido: 'Lucro Presumido',
    lucro_real: 'Lucro Real',
    dinheiro: 'Dinheiro',
    cartao_debito: 'Cartão Débito',
    cartao_credito: 'Cartão Crédito',
    pix: 'PIX',
    crediario: 'Crediário',
    misto: 'Misto',
    os: 'OS',
    pdv: 'PDV',
    entrada: 'Entrada',
    saida: 'Saída',
    ajuste: 'Ajuste',
    devolucao: 'Devolução',
  };
  return labels[status] || status;
};