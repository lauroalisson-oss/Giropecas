import React from 'react';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

// Renders a print-optimized OS layout in a new window
export function printOrdem({ order, customer, vehicle, company }) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;

  const partsRows = (order.parts_items || []).map(item => `
    <tr>
      <td>${item.description || ''}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">${formatCurrency(item.unit_price)}</td>
      <td class="right">${formatCurrency(item.total_price)}</td>
    </tr>
  `).join('');

  const serviceRows = (order.service_items || []).map(item => `
    <tr>
      <td>${item.description || ''}</td>
      <td class="center">${item.hours}h</td>
      <td class="right">${formatCurrency(item.unit_price)}/h</td>
      <td class="right">${formatCurrency(item.total_price)}</td>
    </tr>
  `).join('');

  const openedAt = order.opened_at || order.created_date;

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>OS #${order.order_number || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 24px; }
    
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    .company-name { font-size: 18px; font-weight: 700; }
    .company-info { font-size: 11px; color: #444; margin-top: 4px; line-height: 1.5; }
    .os-title { text-align: right; }
    .os-number { font-size: 22px; font-weight: 700; color: #c00; }
    .os-date { font-size: 11px; color: #555; margin-top: 4px; }
    .os-status { display: inline-block; margin-top: 4px; background: #eee; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

    .section { margin-bottom: 14px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .info-block p { font-size: 11px; line-height: 1.6; }
    .info-block .label { font-size: 10px; color: #777; text-transform: uppercase; }
    .info-block .value { font-size: 12px; font-weight: 600; }

    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; padding: 5px 6px; text-align: left; border-bottom: 1px solid #ddd; }
    td { padding: 5px 6px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .center { text-align: center; }

    .totals { margin-left: auto; width: 260px; margin-top: 4px; }
    .totals table td { padding: 4px 6px; border: none; font-size: 12px; }
    .totals .grand { font-weight: 700; font-size: 14px; border-top: 2px solid #111; }
    .totals .grand td { padding-top: 6px; }

    .notes-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; font-size: 11px; min-height: 40px; line-height: 1.6; }

    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; }
    .sig-line { border-top: 1px solid #999; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 10px; color: #666; }

    .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }

    @media print {
      body { padding: 10px; }
      @page { size: A4; margin: 15mm; }
    }
  </style>
</head>
<body>
  <!-- HEADER: Company + OS info -->
  <div class="header">
    <div>
      <div class="company-name">${company?.name || 'Oficina'}</div>
      <div class="company-info">
        ${company?.cnpj ? `CNPJ: ${company.cnpj}<br>` : ''}
        ${company?.phone ? `Tel: ${company.phone}  ` : ''}${company?.email ? `E-mail: ${company.email}<br>` : ''}
        ${company?.address ? `${company.address}` : ''}${company?.city ? `, ${company.city}` : ''}${company?.state ? `/${company.state}` : ''}${company?.zip_code ? ` - CEP: ${company.zip_code}` : ''}
      </div>
    </div>
    <div class="os-title">
      <div class="os-number">OS #${order.order_number || ''}</div>
      <div class="os-date">Abertura: ${openedAt ? new Date(openedAt).toLocaleString('pt-BR') : ''}</div>
      <div class="os-status">${order.status?.toUpperCase().replace('_', ' ')}</div>
    </div>
  </div>

  <!-- CLIENT + VEHICLE -->
  <div class="grid2">
    <div class="info-block section">
      <div class="section-title">Cliente</div>
      ${customer ? `
        <p><span class="value">${customer.name}</span></p>
        ${customer.tax_id ? `<p class="label">CPF/CNPJ</p><p>${customer.tax_id}</p>` : ''}
        ${customer.phone ? `<p class="label">Telefone</p><p>${customer.phone}</p>` : ''}
        ${customer.email ? `<p class="label">E-mail</p><p>${customer.email}</p>` : ''}
        ${customer.address ? `<p class="label">Endereço</p><p>${customer.address}${customer.city ? `, ${customer.city}` : ''}</p>` : ''}
      ` : '<p>Não informado</p>'}
    </div>
    <div class="info-block section">
      <div class="section-title">Veículo</div>
      ${vehicle ? `
        <p><span class="value">${vehicle.brand} ${vehicle.model} ${vehicle.year || ''}</span></p>
        ${vehicle.plate ? `<p class="label">Placa</p><p>${vehicle.plate}</p>` : ''}
        ${vehicle.color ? `<p class="label">Cor</p><p>${vehicle.color}</p>` : ''}
        ${vehicle.chassis ? `<p class="label">Chassi</p><p>${vehicle.chassis}</p>` : ''}
        ${order.vehicle_km ? `<p class="label">KM</p><p>${order.vehicle_km?.toLocaleString('pt-BR')} km</p>` : ''}
      ` : '<p>Não informado</p>'}
    </div>
  </div>

  <!-- COMPLAINT + DIAGNOSIS -->
  ${(order.complaint || order.diagnosis || order.notes) ? `
  <div class="section">
    <div class="section-title">Reclamação & Diagnóstico</div>
    <div class="grid2">
      ${order.complaint ? `<div><div class="label">Reclamação do cliente</div><div class="notes-box">${order.complaint}</div></div>` : '<div></div>'}
      ${order.diagnosis ? `<div><div class="label">Diagnóstico técnico</div><div class="notes-box">${order.diagnosis}</div></div>` : '<div></div>'}
    </div>
    ${order.notes ? `<div style="margin-top:8px"><div class="label">Observações internas</div><div class="notes-box">${order.notes}</div></div>` : ''}
  </div>
  ` : ''}

  <!-- PARTS -->
  ${(order.parts_items?.length > 0) ? `
  <div class="section">
    <div class="section-title">Peças / Materiais</div>
    <table>
      <thead><tr><th>Descrição</th><th class="center">Qtd</th><th class="right">Preço Unit.</th><th class="right">Total</th></tr></thead>
      <tbody>${partsRows}</tbody>
    </table>
  </div>
  ` : ''}

  <!-- SERVICES -->
  ${(order.service_items?.length > 0) ? `
  <div class="section">
    <div class="section-title">Serviços / Mão de Obra</div>
    <table>
      <thead><tr><th>Descrição</th><th class="center">Tempo</th><th class="right">Valor/h</th><th class="right">Total</th></tr></thead>
      <tbody>${serviceRows}</tbody>
    </table>
  </div>
  ` : ''}

  <!-- TOTALS -->
  <div class="totals">
    <table>
      ${(order.parts_total > 0) ? `<tr><td>Subtotal Peças</td><td class="right">${formatCurrency(order.parts_total)}</td></tr>` : ''}
      ${(order.services_total > 0) ? `<tr><td>Subtotal Serviços</td><td class="right">${formatCurrency(order.services_total)}</td></tr>` : ''}
      ${(order.discount > 0) ? `<tr><td>Desconto</td><td class="right">- ${formatCurrency(order.discount)}</td></tr>` : ''}
      <tr class="grand"><td>TOTAL</td><td class="right">${formatCurrency(order.total)}</td></tr>
    </table>
  </div>

  <!-- SIGNATURES -->
  <div class="signatures">
    <div>
      <div class="sig-line">Assinatura do Cliente</div>
    </div>
    <div>
      <div class="sig-line">Assinatura do Responsável</div>
    </div>
  </div>

  <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} — ${company?.name || ''}</div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}