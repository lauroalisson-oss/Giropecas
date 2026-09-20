import { formatCurrency } from '@/lib/formatters';

// Tudo que vem do cadastro entra numa string de HTML. Nome de cliente,
// reclamação e descrição de item são digitados na oficina: um "<" solto
// já quebra o documento, e uma tag fecharia a porta para script rodando
// na janela de impressão, que herda a origem do sistema.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro', cartao_debito: 'Cartão Débito', cartao_credito: 'Cartão Crédito',
  pix: 'PIX', crediario: 'Crediário', misto: 'Misto',
};

const STATUS_LABELS = {
  aberta: 'Aberta', em_andamento: 'Em Andamento', aguardando_peca: 'Ag. Peça',
  finalizada: 'Finalizada', faturada: 'Faturada', cancelada: 'Cancelada',
  pago: 'Pago', pendente: 'Pendente',
};

function buildA4Html({ type, doc, company, customer, technician, revisoes = [] }) {
  const isOS = type === 'os';
  const title = isOS ? `OS #${doc.order_number || ''}` : `Venda PDV #${doc.sale_number || doc.id?.slice(-6) || ''}`;

  const partsItems = isOS ? (doc.parts_items || []) : (doc.items || []).filter(i => i.type === 'part' || !i.type);
  const serviceItems = isOS ? (doc.service_items || []) : [];

  const partsRows = partsItems.map(item => `
    <tr>
      <td>${esc(item.description)}</td>
      <td class="center">${esc(item.quantity)}</td>
      <td class="right">${formatCurrency(item.unit_price)}</td>
      <td class="right">${formatCurrency(item.total_price)}</td>
    </tr>`).join('');

  const serviceRows = serviceItems.map(item => `
    <tr>
      <td>${esc(item.description)}</td>
      <td class="center">${esc(item.hours || '1')}h</td>
      <td class="right">${formatCurrency(item.unit_price)}/h</td>
      <td class="right">${formatCurrency(item.total_price)}</td>
    </tr>`).join('');

  const payMethod = doc.payment_method ? PAYMENT_LABELS[doc.payment_method] || doc.payment_method : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size:12px; color:#111; background:#fff; padding:24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:12px; margin-bottom:16px; }
    .company-name { font-size:18px; font-weight:700; }
    .company-info { font-size:11px; color:#444; margin-top:4px; line-height:1.5; }
    .doc-title { text-align:right; }
    .doc-number { font-size:22px; font-weight:700; color:#c00; }
    .doc-date { font-size:11px; color:#555; margin-top:4px; }
    .doc-status { display:inline-block; margin-top:4px; background:#eee; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:600; }
    .section { margin-bottom:14px; }
    .section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#555; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .info-block p { font-size:11px; line-height:1.6; }
    .label { font-size:10px; color:#777; text-transform:uppercase; }
    .value { font-size:12px; font-weight:600; }
    table { width:100%; border-collapse:collapse; }
    th { background:#f3f3f3; font-size:10px; text-transform:uppercase; padding:5px 6px; text-align:left; border-bottom:1px solid #ddd; }
    td { padding:5px 6px; border-bottom:1px solid #eee; font-size:11px; vertical-align:top; }
    tr:last-child td { border-bottom:none; }
    .right { text-align:right; }
    .center { text-align:center; }
    .totals { margin-left:auto; width:260px; margin-top:4px; }
    .totals table td { padding:4px 6px; border:none; font-size:12px; }
    .totals .grand { font-weight:700; font-size:14px; border-top:2px solid #111; }
    .totals .grand td { padding-top:6px; }
    .notes-box { border:1px solid #ddd; border-radius:4px; padding:10px; font-size:11px; min-height:36px; line-height:1.6; }
    .payment-box { background:#f9f9f9; border:1px solid #ddd; border-radius:4px; padding:10px; font-size:11px; }
    .signatures { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px; }
    .sig-line { border-top:1px solid #999; margin-top:40px; padding-top:4px; text-align:center; font-size:10px; color:#666; }
    .revisao-box { border:1px solid #c7d2fe; background:#eef2ff; border-radius:4px; padding:10px; font-size:11px; line-height:1.7; }
    .revisao-obs { margin-top:6px; font-size:10px; color:#555; }
    .footer { margin-top:20px; text-align:center; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:8px; }
    @media print { body { padding:10px; } @page { size:A4; margin:15mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${esc(company?.name || 'Oficina')}</div>
      <div class="company-info">
        ${company?.cnpj ? `CNPJ: ${esc(company.cnpj)}<br>` : ''}
        ${company?.phone ? `Tel: ${esc(company.phone)}  ` : ''}${company?.email ? `E-mail: ${esc(company.email)}<br>` : ''}
        ${esc(company?.address || '')}${company?.city ? `, ${esc(company.city)}` : ''}${company?.state ? `/${esc(company.state)}` : ''}${company?.zip_code ? ` - CEP: ${esc(company.zip_code)}` : ''}
      </div>
    </div>
    <div class="doc-title">
      <div class="doc-number">${esc(title)}</div>
      <div class="doc-date">${new Date(doc.opened_at || doc.created_date || Date.now()).toLocaleString('pt-BR')}</div>
      ${doc.status ? `<div class="doc-status">${esc(STATUS_LABELS[doc.status] || doc.status)}</div>` : ''}
    </div>
  </div>

  <div class="grid2">
    <div class="info-block section">
      <div class="section-title">Cliente</div>
      ${customer ? `
        <p><span class="value">${esc(customer.name)}</span></p>
        ${customer.tax_id ? `<p class="label">CPF/CNPJ</p><p>${esc(customer.tax_id)}</p>` : ''}
        ${customer.phone ? `<p class="label">Telefone</p><p>${esc(customer.phone)}</p>` : ''}
        ${customer.address ? `<p class="label">Endereço</p><p>${esc(customer.address)}${customer.city ? `, ${esc(customer.city)}` : ''}</p>` : ''}
      ` : '<p>Balcão / Não identificado</p>'}
    </div>
    ${isOS && doc.vehicle ? `
    <div class="info-block section">
      <div class="section-title">Veículo</div>
      <p><span class="value">${esc(doc.vehicle.brand)} ${esc(doc.vehicle.model)} ${esc(doc.vehicle.year)}</span></p>
      ${doc.vehicle.plate ? `<p class="label">Placa</p><p>${esc(doc.vehicle.plate)}</p>` : ''}
      ${doc.vehicle.color ? `<p class="label">Cor</p><p>${esc(doc.vehicle.color)}</p>` : ''}
      ${doc.vehicle_km ? `<p class="label">KM</p><p>${doc.vehicle_km.toLocaleString('pt-BR')} km</p>` : ''}
    </div>` : '<div></div>'}
  </div>

  ${technician ? `
  <div class="section">
    <div class="section-title">Técnico Responsável</div>
    <p><span class="value">${esc(technician.name)}</span>${technician.specialty ? ` — ${esc(technician.specialty)}` : ''}</p>
  </div>` : ''}

  ${isOS && (doc.complaint || doc.diagnosis) ? `
  <div class="section">
    <div class="section-title">Reclamação & Diagnóstico</div>
    <div class="grid2">
      ${doc.complaint ? `<div><div class="label">Reclamação do cliente</div><div class="notes-box">${esc(doc.complaint)}</div></div>` : '<div></div>'}
      ${doc.diagnosis ? `<div><div class="label">Diagnóstico técnico</div><div class="notes-box">${esc(doc.diagnosis)}</div></div>` : '<div></div>'}
    </div>
  </div>` : ''}

  ${partsItems.length > 0 ? `
  <div class="section">
    <div class="section-title">Peças / Materiais</div>
    <table>
      <thead><tr><th>Descrição</th><th class="center">Qtd</th><th class="right">Preço Unit.</th><th class="right">Total</th></tr></thead>
      <tbody>${partsRows}</tbody>
    </table>
  </div>` : ''}

  ${serviceItems.length > 0 ? `
  <div class="section">
    <div class="section-title">Serviços / Mão de Obra</div>
    <table>
      <thead><tr><th>Descrição</th><th class="center">Tempo</th><th class="right">Valor/h</th><th class="right">Total</th></tr></thead>
      <tbody>${serviceRows}</tbody>
    </table>
  </div>` : ''}

  <div class="totals">
    <table>
      ${isOS && doc.parts_total > 0 ? `<tr><td>Subtotal Peças</td><td class="right">${formatCurrency(doc.parts_total)}</td></tr>` : ''}
      ${isOS && doc.services_total > 0 ? `<tr><td>Subtotal Serviços</td><td class="right">${formatCurrency(doc.services_total)}</td></tr>` : ''}
      ${!isOS && doc.subtotal > 0 ? `<tr><td>Subtotal</td><td class="right">${formatCurrency(doc.subtotal)}</td></tr>` : ''}
      ${(doc.discount || 0) > 0 ? `<tr><td>Desconto</td><td class="right">- ${formatCurrency(doc.discount)}</td></tr>` : ''}
      <tr class="grand"><td>TOTAL</td><td class="right">${formatCurrency(doc.total)}</td></tr>
    </table>
  </div>

  ${payMethod ? `
  <div class="section" style="margin-top:14px">
    <div class="section-title">Pagamento</div>
    <div class="payment-box">${esc(payMethod)}</div>
  </div>` : ''}

  ${isOS && revisoes.length > 0 ? `
  <div class="section revisoes" style="margin-top:14px">
    <div class="section-title">Próximas revisões</div>
    <div class="revisao-box">
      ${revisoes.map(r => `<p>• ${esc(r)}</p>`).join('')}
      <p class="revisao-obs">Prazos contados a partir deste atendimento. Vale o que vencer primeiro — tempo ou quilometragem.</p>
    </div>
  </div>` : ''}

  ${isOS ? `
  <div class="signatures">
    <div><div class="sig-line">Assinatura do Cliente</div></div>
    <div><div class="sig-line">Assinatura do Técnico</div></div>
  </div>` : ''}

  <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} — ${esc(company?.name)}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
}

function buildCupomHtml({ type, doc, company, customer, technician, revisoes = [] }) {
  const isOS = type === 'os';
  const title = isOS ? `OS #${doc.order_number || ''}` : `PDV #${doc.sale_number || doc.id?.slice(-6) || ''}`;
  const partsItems = isOS ? (doc.parts_items || []) : (doc.items || []);
  const serviceItems = isOS ? (doc.service_items || []) : [];
  const payMethod = doc.payment_method ? PAYMENT_LABELS[doc.payment_method] || doc.payment_method : '';

  const itemRows = [...partsItems, ...serviceItems].map(item => `
    <tr>
      <td>${esc(item.description)}</td>
      <td class="right">${esc(item.quantity || item.hours || 1)}${item.hours ? 'h' : 'x'}</td>
      <td class="right">${formatCurrency(item.total_price)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size:11px; color:#000; background:#fff; width:80mm; margin:0 auto; padding:6px 8px; }
    .center { text-align:center; }
    .right { text-align:right; }
    .bold { font-weight:700; }
    .line { border-top:1px dashed #999; margin:6px 0; }
    .company { font-size:13px; font-weight:700; text-align:center; margin-bottom:2px; }
    .sub { font-size:10px; text-align:center; color:#333; line-height:1.5; }
    .doc-num { font-size:14px; font-weight:700; text-align:center; margin:6px 0; }
    table { width:100%; border-collapse:collapse; }
    th { font-size:10px; text-transform:uppercase; border-bottom:1px solid #ccc; padding:2px 0; }
    td { padding:2px 0; font-size:10px; vertical-align:top; }
    .total-row td { font-size:12px; font-weight:700; border-top:1px solid #000; padding-top:4px; margin-top:4px; }
    .footer { margin-top:8px; font-size:9px; text-align:center; color:#666; }
    @media print { body { width:80mm; } @page { size:80mm auto; margin:0; } }
  </style>
</head>
<body>
  <div class="company">${esc(company?.name || 'Oficina')}</div>
  ${company?.cnpj ? `<div class="sub">CNPJ: ${esc(company.cnpj)}</div>` : ''}
  ${company?.phone ? `<div class="sub">Tel: ${esc(company.phone)}</div>` : ''}
  ${company?.address ? `<div class="sub">${esc(company.address)}${company.city ? `, ${esc(company.city)}` : ''}</div>` : ''}
  <div class="line"></div>
  <div class="doc-num">${esc(title)}</div>
  <div class="sub">${new Date(doc.opened_at || doc.created_date || Date.now()).toLocaleString('pt-BR')}</div>
  ${doc.status ? `<div class="sub bold">${esc(STATUS_LABELS[doc.status] || doc.status)}</div>` : ''}
  <div class="line"></div>
  ${customer ? `<div class="sub bold">Cliente: ${esc(customer.name)}</div>` : '<div class="sub">Balcão</div>'}
  ${customer?.tax_id ? `<div class="sub">CPF: ${esc(customer.tax_id)}</div>` : ''}
  ${technician ? `<div class="sub bold">Técnico: ${esc(technician.name)}</div>` : ''}
  ${isOS && doc.vehicle ? `<div class="sub">Veículo: ${esc(doc.vehicle.brand)} ${esc(doc.vehicle.model)} ${doc.vehicle.plate ? `- ${esc(doc.vehicle.plate)}` : ''}</div>` : ''}
  <div class="line"></div>
  <table>
    <thead><tr><th>Item</th><th class="right">Qtd</th><th class="right">Vlr</th></tr></thead>
    <tbody>${itemRows}</tbody>
    ${(doc.discount || 0) > 0 ? `<tr><td>Desconto</td><td></td><td class="right">-${formatCurrency(doc.discount)}</td></tr>` : ''}
    <tr class="total-row"><td class="bold">TOTAL</td><td></td><td class="right bold">${formatCurrency(doc.total)}</td></tr>
  </table>
  <div class="line"></div>
  ${payMethod ? `<div class="sub bold">Pagamento: ${esc(payMethod)}</div>` : ''}
  <div class="line"></div>
  ${isOS && revisoes.length > 0 ? `
  <div class="sub bold">PRÓXIMAS REVISÕES</div>
  ${revisoes.map(r => `<div class="sub">• ${esc(r)}</div>`).join('')}
  <div class="sub" style="font-size:9px">Vale o que vencer primeiro: tempo ou km.</div>
  <div class="line"></div>` : ''}
  <div class="footer">Obrigado pela preferência!<br>${new Date().toLocaleString('pt-BR')}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
}

// Monta o HTML do documento. Exportado para poder ser conferido sem
// abrir janela de impressão.
export function buildPrintHtml({ type, doc, company, customer, technician, revisoes = [], format = 'a4' }) {
  return format === 'cupom'
    ? buildCupomHtml({ type, doc, company, customer, technician, revisoes })
    : buildA4Html({ type, doc, company, customer, technician, revisoes });
}

export function printDocument({ type, doc, company, customer, technician, revisoes = [], format = 'a4' }) {
  const html = format === 'cupom'
    ? buildCupomHtml({ type, doc, company, customer, technician, revisoes })
    : buildA4Html({ type, doc, company, customer, technician, revisoes });

  const w = format === 'cupom'
    ? window.open('', '_blank', 'width=340,height=700')
    : window.open('', '_blank', 'width=850,height=1000');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}