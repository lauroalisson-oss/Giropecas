/* Giropeças Offline — aplicativo autônomo com armazenamento local.
   Requer chave de acesso (licença) gerada pelo super-admin do sistema online. */
(function () {
  'use strict';

  var L = window.GiroLicense;
  var root = document.getElementById('root');

  /* ================= Armazenamento local ================= */
  var DB_PREFIX = 'giro_';

  function dbGet(name, fallback) {
    try {
      var raw = localStorage.getItem(DB_PREFIX + name);
      return raw ? JSON.parse(raw) : (fallback !== undefined ? fallback : []);
    } catch (e) { return fallback !== undefined ? fallback : []; }
  }
  function dbSet(name, value) {
    localStorage.setItem(DB_PREFIX + name, JSON.stringify(value));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ================= Utilitários ================= */
  function money(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function dateBR(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show' + (isError ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = ''; }, 2600);
  }

  /* ================= Modal ================= */
  function openModal(html, onMount) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' + html + '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
    if (onMount) onMount(overlay);
  }
  function closeModal() {
    var el = document.getElementById('modal-overlay');
    if (el) el.remove();
  }
  window._closeModal = closeModal;

  /* ================= Gate de licença ================= */
  function renderGate() {
    var expired = L.isExpired();
    root.innerHTML =
      '<div class="gate"><div class="gate-card">' +
      '<div class="gate-icon">' + (expired ? '⚠️' : '🔧') + '</div>' +
      '<h1>' + (expired ? 'Sua licença expirou' : 'Giropeças Offline') + '</h1>' +
      '<p>' + (expired
        ? 'O período da sua chave de acesso terminou. Informe uma nova chave para continuar.'
        : 'Para usar o aplicativo você precisa de uma chave de acesso. Solicite a sua ao administrador.') + '</p>' +
      '<div id="gate-error"></div>' +
      '<input id="gate-key" class="gate-input" placeholder="GIRO-XXXX-XXXX-XXXX" maxlength="19" autocomplete="off" />' +
      '<button id="gate-btn" class="btn" style="width:100%;height:46px;justify-content:center">Ativar chave</button>' +
      '</div></div>';

    var input = document.getElementById('gate-key');
    input.focus();
    function tryActivate() {
      var res = L.activate(input.value);
      if (res.ok) {
        toast('Licença ativada! Válida por ' + L.durationLabel(res.license.durationDays) + '.');
        render();
  if (location.hash === '#/config') carregarCertificado();
      } else {
        document.getElementById('gate-error').innerHTML =
          '<div class="gate-error">' + esc(res.reason) + '</div>';
      }
    }
    document.getElementById('gate-btn').addEventListener('click', tryActivate);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryActivate(); });
  }

  /* ================= Navegação ================= */
  var NAV = [
    { hash: '#/', label: 'Dashboard', icon: '📊' },
    { hash: '#/clientes', label: 'Clientes', icon: '👥' },
    { hash: '#/pecas', label: 'Peças & Estoque', icon: '📦' },
    { hash: '#/ordens', label: 'Ordens de Serviço', icon: '📋' },
    { hash: '#/pdv', label: 'PDV Rápido', icon: '🛒' },
    { hash: '#/vendas', label: 'Vendas', icon: '💰' },
    { hash: '#/relatorios', label: 'Relatórios', icon: '📈' },
    { hash: '#/config', label: 'Configurações', icon: '⚙️' },
  ];

  function currentRoute() {
    var h = location.hash || '#/';
    return h.split('?')[0];
  }

  function renderShell(pageHtml) {
    var lic = L.getLicense();
    var days = lic ? L.daysRemaining(lic.expiresAt) : 0;
    var config = dbGet('config', {});
    var route = currentRoute();

    root.innerHTML =
      '<div class="app">' +
      '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-logo"><div class="logo-badge">🔧</div>' +
      '<div><b>Giropeças</b><small>' + esc(config.nome || 'Modo offline') + '</small></div></div>' +
      '<nav>' + NAV.map(function (n) {
        return '<a href="' + n.hash + '" class="' + (route === n.hash ? 'active' : '') + '">' +
          '<span>' + n.icon + '</span>' + n.label + '</a>';
      }).join('') + '</nav>' +
      '<div class="sidebar-license">Licença: <b class="' + (days <= 5 ? 'warn' : '') + '">' +
      days + (days === 1 ? ' dia' : ' dias') + ' restantes</b><br>' +
      'Expira em ' + dateBR(lic && lic.expiresAt) + '</div>' +
      '</aside>' +
      '<div class="main">' +
      '<header class="topbar">' +
      '<button class="menu-btn" id="menu-btn">☰</button>' +
      '<span class="offline-badge">● Aplicativo offline — dados salvos neste dispositivo</span>' +
      '</header>' +
      '<div class="content" id="content">' + pageHtml + '</div>' +
      '</div></div>';

    document.getElementById('menu-btn').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('open');
    });
    root.querySelectorAll('.sidebar nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.getElementById('sidebar').classList.remove('open');
      });
    });
  }

  /* ================= Dashboard ================= */
  function pageDashboard() {
    var clientes = dbGet('clientes');
    var pecas = dbGet('pecas');
    var ordens = dbGet('ordens');
    var vendas = dbGet('vendas');
    var hoje = new Date().toDateString();
    var vendasHoje = vendas.filter(function (v) { return new Date(v.data).toDateString() === hoje; });
    var totalHoje = vendasHoje.reduce(function (s, v) { return s + v.total; }, 0);
    var abertas = ordens.filter(function (o) { return o.status === 'aberta' || o.status === 'em_andamento'; });
    var baixoEstoque = pecas.filter(function (p) { return (p.estoque || 0) <= (p.estoqueMin || 1); });

    return '<div class="page-header"><div><h1>Dashboard</h1>' +
      '<div class="sub">Visão geral da oficina</div></div></div>' +
      '<div class="cards-grid">' +
      stat('Vendas hoje', money(totalHoje)) +
      stat('OS em aberto', abertas.length) +
      stat('Clientes', clientes.length) +
      stat('Peças em estoque baixo', baixoEstoque.length) +
      '</div>' +
      '<div class="card"><h3 style="margin-bottom:12px">Estoque baixo</h3>' +
      (baixoEstoque.length === 0
        ? '<p style="color:var(--gray-400)">Nenhuma peça com estoque baixo. 👍</p>'
        : '<div class="table-wrap"><table class="data"><tr><th>Peça</th><th>Estoque</th><th>Mínimo</th></tr>' +
          baixoEstoque.slice(0, 8).map(function (p) {
            return '<tr><td>' + esc(p.descricao) + '</td><td><span class="badge red">' + (p.estoque || 0) +
              '</span></td><td>' + (p.estoqueMin || 1) + '</td></tr>';
          }).join('') + '</table></div>') +
      '</div>';

    function stat(label, value) {
      return '<div class="card stat-card"><div class="stat-label">' + label +
        '</div><div class="stat-value">' + value + '</div></div>';
    }
  }

  /* ================= Clientes ================= */
  function pageClientes() {
    var clientes = dbGet('clientes');
    return '<div class="page-header"><div><h1>Clientes</h1>' +
      '<div class="sub">' + clientes.length + ' cadastrados</div></div>' +
      '<button class="btn" onclick="_clienteForm()">+ Novo Cliente</button></div>' +
      '<input class="search-input" placeholder="Buscar cliente..." oninput="_filterTable(this.value, \'tbl-clientes\')" />' +
      (clientes.length === 0
        ? empty('👥', 'Nenhum cliente cadastrado')
        : '<div class="table-wrap"><table class="data" id="tbl-clientes">' +
          '<tr><th>Nome</th><th>Telefone</th><th>Veículo</th><th></th></tr>' +
          clientes.map(function (c) {
            return '<tr><td><b>' + esc(c.nome) + '</b></td><td>' + esc(c.telefone || '—') +
              '</td><td>' + esc(c.veiculo || '—') + '</td>' +
              '<td style="text-align:right;white-space:nowrap">' +
              '<button class="btn ghost small" onclick="_clienteForm(\'' + c.id + '\')">✏️</button>' +
              '<button class="btn ghost small" onclick="_clienteDel(\'' + c.id + '\')">🗑️</button></td></tr>';
          }).join('') + '</table></div>');
  }

  window._clienteForm = function (id) {
    var clientes = dbGet('clientes');
    var c = clientes.find(function (x) { return x.id === id; }) || {};
    openModal(
      '<h2>' + (id ? 'Editar' : 'Novo') + ' Cliente</h2>' +
      '<div class="form-grid">' +
      field('Nome *', 'f-nome', c.nome, 'full') +
      field('Telefone', 'f-telefone', c.telefone) +
      field('CPF/CNPJ', 'f-doc', c.doc) +
      field('Veículo (modelo/placa)', 'f-veiculo', c.veiculo, 'full') +
      field('Endereço', 'f-endereco', c.endereco, 'full') +
      '</div><div class="modal-actions">' +
      '<button class="btn secondary" onclick="_closeModal()">Cancelar</button>' +
      '<button class="btn" id="f-save">Salvar</button></div>',
      function (overlay) {
        overlay.querySelector('#f-save').addEventListener('click', function () {
          var nome = val('f-nome');
          if (!nome) { toast('Informe o nome.', true); return; }
          var data = { nome: nome, telefone: val('f-telefone'), doc: val('f-doc'), veiculo: val('f-veiculo'), endereco: val('f-endereco') };
          if (id) {
            Object.assign(c, data);
          } else {
            data.id = uid();
            data.criadoEm = new Date().toISOString();
            clientes.push(data);
          }
          dbSet('clientes', clientes);
          closeModal(); toast('Cliente salvo!'); render();
        });
      }
    );
  };

  window._clienteDel = function (id) {
    if (!confirm('Excluir este cliente?')) return;
    dbSet('clientes', dbGet('clientes').filter(function (c) { return c.id !== id; }));
    toast('Cliente excluído.'); render();
  };

  /* ================= Peças ================= */
  function pagePecas() {
    var pecas = dbGet('pecas');
    return '<div class="page-header"><div><h1>Peças & Estoque</h1>' +
      '<div class="sub">' + pecas.length + ' itens</div></div>' +
      '<button class="btn" onclick="_pecaForm()">+ Nova Peça</button></div>' +
      '<input class="search-input" placeholder="Buscar peça..." oninput="_filterTable(this.value, \'tbl-pecas\')" />' +
      (pecas.length === 0
        ? empty('📦', 'Nenhuma peça cadastrada')
        : '<div class="table-wrap"><table class="data" id="tbl-pecas">' +
          '<tr><th>Descrição</th><th>Código</th><th>Preço</th><th>Estoque</th><th></th></tr>' +
          pecas.map(function (p) {
            var low = (p.estoque || 0) <= (p.estoqueMin || 1);
            return '<tr><td><b>' + esc(p.descricao) + '</b></td><td>' + esc(p.codigo || '—') +
              '</td><td>' + money(p.preco) + '</td>' +
              '<td><span class="badge ' + (low ? 'red' : 'green') + '">' + (p.estoque || 0) + '</span></td>' +
              '<td style="text-align:right;white-space:nowrap">' +
              '<button class="btn ghost small" onclick="_pecaForm(\'' + p.id + '\')">✏️</button>' +
              '<button class="btn ghost small" onclick="_pecaDel(\'' + p.id + '\')">🗑️</button></td></tr>';
          }).join('') + '</table></div>');
  }

  window._pecaForm = function (id) {
    var pecas = dbGet('pecas');
    var p = pecas.find(function (x) { return x.id === id; }) || {};
    openModal(
      '<h2>' + (id ? 'Editar' : 'Nova') + ' Peça</h2>' +
      '<div class="form-grid">' +
      field('Descrição *', 'f-desc', p.descricao, 'full') +
      field('Código/SKU', 'f-cod', p.codigo) +
      field('Marca', 'f-marca', p.marca) +
      fieldNum('Preço de custo (R$)', 'f-custo', p.custo) +
      fieldNum('Preço de venda (R$) *', 'f-preco', p.preco) +
      fieldNum('Estoque', 'f-estoque', p.estoque) +
      fieldNum('Estoque mínimo', 'f-min', p.estoqueMin != null ? p.estoqueMin : 1) +
      '</div><div class="modal-actions">' +
      '<button class="btn secondary" onclick="_closeModal()">Cancelar</button>' +
      '<button class="btn" id="f-save">Salvar</button></div>',
      function (overlay) {
        overlay.querySelector('#f-save').addEventListener('click', function () {
          var desc = val('f-desc');
          if (!desc) { toast('Informe a descrição.', true); return; }
          var data = {
            descricao: desc, codigo: val('f-cod'), marca: val('f-marca'),
            custo: num('f-custo'), preco: num('f-preco'),
            estoque: num('f-estoque'), estoqueMin: num('f-min'),
          };
          if (id) { Object.assign(p, data); }
          else { data.id = uid(); data.criadoEm = new Date().toISOString(); pecas.push(data); }
          dbSet('pecas', pecas);
          closeModal(); toast('Peça salva!'); render();
        });
      }
    );
  };

  window._pecaDel = function (id) {
    if (!confirm('Excluir esta peça?')) return;
    dbSet('pecas', dbGet('pecas').filter(function (p) { return p.id !== id; }));
    toast('Peça excluída.'); render();
  };

  /* ================= Ordens de Serviço ================= */
  var OS_STATUS = {
    aberta: { label: 'Aberta', badge: 'blue', next: 'em_andamento', nextLabel: 'Iniciar' },
    em_andamento: { label: 'Em andamento', badge: 'orange', next: 'concluida', nextLabel: 'Concluir' },
    concluida: { label: 'Concluída', badge: 'green' },
    cancelada: { label: 'Cancelada', badge: 'gray' },
  };

  function pageOrdens() {
    var ordens = dbGet('ordens').slice().reverse();
    return '<div class="page-header"><div><h1>Ordens de Serviço</h1>' +
      '<div class="sub">' + ordens.length + ' ordens</div></div>' +
      '<button class="btn" onclick="_osForm()">+ Nova OS</button></div>' +
      (ordens.length === 0
        ? empty('📋', 'Nenhuma ordem de serviço')
        : '<div class="table-wrap"><table class="data">' +
          '<tr><th>Nº</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Total</th><th></th></tr>' +
          ordens.map(function (o) {
            var st = OS_STATUS[o.status] || OS_STATUS.aberta;
            return '<tr><td><b>#' + o.numero + '</b></td><td>' + esc(o.cliente) +
              '</td><td>' + esc(o.veiculo || '—') + '</td>' +
              '<td><span class="badge ' + st.badge + '">' + st.label + '</span></td>' +
              '<td>' + money(osTotal(o)) + '</td>' +
              '<td style="text-align:right;white-space:nowrap">' +
              '<button class="btn ghost small" onclick="_osView(\'' + o.id + '\')">👁️</button>' +
              (o.status !== 'concluida' && o.status !== 'cancelada'
                ? '<button class="btn ghost small" onclick="_osDel(\'' + o.id + '\')">🗑️</button>' : '') +
              '</td></tr>';
          }).join('') + '</table></div>');
  }

  function osTotal(o) {
    return (o.itens || []).reduce(function (s, i) { return s + i.preco * i.qtd; }, 0);
  }

  window._osForm = function () {
    var clientes = dbGet('clientes');
    openModal(
      '<h2>Nova Ordem de Serviço</h2>' +
      '<div class="form-grid">' +
      '<div class="field full"><label>Cliente *</label><select id="f-cliente">' +
      '<option value="">— selecione ou digite abaixo —</option>' +
      clientes.map(function (c) { return '<option value="' + esc(c.nome) + '">' + esc(c.nome) + '</option>'; }).join('') +
      '</select></div>' +
      field('Ou nome do cliente', 'f-cliente-txt', '') +
      field('Veículo/placa', 'f-veiculo', '') +
      '<div class="field full"><label>Descrição do problema</label>' +
      '<textarea id="f-desc" rows="3"></textarea></div>' +
      '</div><div class="modal-actions">' +
      '<button class="btn secondary" onclick="_closeModal()">Cancelar</button>' +
      '<button class="btn" id="f-save">Criar OS</button></div>',
      function (overlay) {
        overlay.querySelector('#f-save').addEventListener('click', function () {
          var cliente = val('f-cliente-txt') || val('f-cliente');
          if (!cliente) { toast('Informe o cliente.', true); return; }
          var ordens = dbGet('ordens');
          var numero = (dbGet('config', {}).osSeq || 0) + 1;
          var config = dbGet('config', {});
          config.osSeq = numero;
          dbSet('config', config);
          var os = {
            id: uid(), numero: numero, cliente: cliente,
            veiculo: val('f-veiculo'), descricao: val('f-desc'),
            status: 'aberta', itens: [], criadaEm: new Date().toISOString(),
          };
          ordens.push(os);
          dbSet('ordens', ordens);
          closeModal(); toast('OS #' + numero + ' criada!');
          window._osView(os.id);
        });
      }
    );
  };

  window._osView = function (id) {
    var ordens = dbGet('ordens');
    var o = ordens.find(function (x) { return x.id === id; });
    if (!o) return;
    var pecas = dbGet('pecas');
    var st = OS_STATUS[o.status] || OS_STATUS.aberta;
    var editable = o.status === 'aberta' || o.status === 'em_andamento';

    openModal(
      '<h2>OS #' + o.numero + ' — ' + esc(o.cliente) +
      ' <span class="badge ' + st.badge + '">' + st.label + '</span></h2>' +
      '<p style="color:var(--gray-500);margin-bottom:4px">Veículo: ' + esc(o.veiculo || '—') + '</p>' +
      '<p style="color:var(--gray-500);margin-bottom:14px">' + esc(o.descricao || '') + '</p>' +
      '<h3 style="font-size:14px;margin-bottom:8px">Itens</h3>' +
      ((o.itens || []).length === 0 ? '<p style="color:var(--gray-400);margin-bottom:10px">Nenhum item adicionado.</p>' :
        '<table class="data" style="margin-bottom:10px"><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Subtotal</th>' +
        (editable ? '<th></th>' : '') + '</tr>' +
        o.itens.map(function (i, idx) {
          return '<tr><td>' + esc(i.nome) + (i.tipo === 'servico' ? ' <span class="badge gray">serviço</span>' : '') +
            '</td><td>' + i.qtd + '</td><td>' + money(i.preco) + '</td><td>' + money(i.preco * i.qtd) + '</td>' +
            (editable ? '<td><button class="btn ghost small" onclick="_osRemoveItem(\'' + o.id + '\',' + idx + ')">✖</button></td>' : '') +
            '</tr>';
        }).join('') + '</table>') +
      '<div class="cart-total"><span>Total</span><span>' + money(osTotal(o)) + '</span></div>' +
      (editable ?
        '<div class="form-grid" style="margin-top:10px">' +
        '<div class="field full"><label>Adicionar peça do estoque</label><select id="os-peca">' +
        '<option value="">— selecione —</option>' +
        pecas.map(function (p) {
          return '<option value="' + p.id + '">' + esc(p.descricao) + ' (' + money(p.preco) + ' | est: ' + (p.estoque || 0) + ')</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Qtd</label><input id="os-qtd" type="number" value="1" min="1"/></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn small" style="height:38px" id="os-add-peca">+ Peça</button></div>' +
        field('Serviço (mão de obra)', 'os-serv', '') +
        fieldNum('Valor do serviço (R$)', 'os-serv-val', '') +
        '<div class="field full"><button class="btn secondary small" id="os-add-serv">+ Adicionar serviço</button></div>' +
        '</div>' : '') +
      '<div class="modal-actions">' +
      '<button class="btn secondary" onclick="_closeModal()">Fechar</button>' +
      (editable && st.next ?
        '<button class="btn secondary" id="os-cancel">Cancelar OS</button>' +
        '<button class="btn" id="os-next">' + st.nextLabel + '</button>' : '') +
      '</div>',
      function (overlay) {
        var addPeca = overlay.querySelector('#os-add-peca');
        if (addPeca) addPeca.addEventListener('click', function () {
          var pid = val('os-peca');
          var qtd = Math.max(1, num('os-qtd') || 1);
          var p = pecas.find(function (x) { return x.id === pid; });
          if (!p) { toast('Selecione uma peça.', true); return; }
          if ((p.estoque || 0) < qtd) { toast('Estoque insuficiente (' + (p.estoque || 0) + ' un).', true); return; }
          o.itens.push({ tipo: 'peca', pecaId: p.id, nome: p.descricao, qtd: qtd, preco: p.preco });
          dbSet('ordens', ordens);
          window._osView(id);
        });
        var addServ = overlay.querySelector('#os-add-serv');
        if (addServ) addServ.addEventListener('click', function () {
          var nome = val('os-serv');
          var valor = num('os-serv-val');
          if (!nome || !valor) { toast('Informe o serviço e o valor.', true); return; }
          o.itens.push({ tipo: 'servico', nome: nome, qtd: 1, preco: valor });
          dbSet('ordens', ordens);
          window._osView(id);
        });
        var nextBtn = overlay.querySelector('#os-next');
        if (nextBtn) nextBtn.addEventListener('click', function () {
          if (st.next === 'concluida') {
            // Baixa de estoque + registro de venda.
            //
            // O saldo pode ficar negativo: a peça foi conferida ao ser
            // adicionada, mas pode ter sido vendida no balcão enquanto a
            // OS ficou aberta. Zerar escondia a diferença — a oficina
            // continuava achando que a contagem batia.
            var allPecas = dbGet('pecas');
            var faltas = [];
            o.itens.forEach(function (i) {
              if (i.tipo === 'peca') {
                var p = allPecas.find(function (x) { return x.id === i.pecaId; });
                if (!p) return;
                var saldo = p.estoque || 0;
                if (i.qtd > saldo) {
                  faltas.push(i.nome + ' (tinha ' + saldo + ', saiu ' + i.qtd + ')');
                }
                p.estoque = saldo - i.qtd;
              }
            });
            dbSet('pecas', allPecas);
            if (faltas.length) {
              toast('Estoque negativo: ' + faltas.join('; ') + '. Confira a contagem.', true);
            }
            var vendas = dbGet('vendas');
            vendas.push({
              id: uid(), origem: 'ordem', ref: 'OS #' + o.numero, cliente: o.cliente,
              itens: o.itens, total: osTotal(o), pagamento: 'os',
              data: new Date().toISOString(),
            });
            dbSet('vendas', vendas);
            o.concluidaEm = new Date().toISOString();
          }
          o.status = st.next;
          dbSet('ordens', ordens);
          closeModal(); toast('OS #' + o.numero + ' atualizada!'); render();
        });
        var cancelBtn = overlay.querySelector('#os-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function () {
          if (!confirm('Cancelar esta OS?')) return;
          o.status = 'cancelada';
          dbSet('ordens', ordens);
          closeModal(); toast('OS cancelada.'); render();
        });
      }
    );
  };

  window._osRemoveItem = function (osId, idx) {
    var ordens = dbGet('ordens');
    var o = ordens.find(function (x) { return x.id === osId; });
    if (!o) return;
    o.itens.splice(idx, 1);
    dbSet('ordens', ordens);
    window._osView(osId);
  };

  window._osDel = function (id) {
    if (!confirm('Excluir esta OS?')) return;
    dbSet('ordens', dbGet('ordens').filter(function (o) { return o.id !== id; }));
    toast('OS excluída.'); render();
  };

  /* ================= PDV ================= */
  var cart = [];

  function pagePDV() {
    var pecas = dbGet('pecas').filter(function (p) { return (p.estoque || 0) > 0; });
    var total = cart.reduce(function (s, i) { return s + i.preco * i.qtd; }, 0);
    return '<div class="page-header"><div><h1>PDV Rápido</h1>' +
      '<div class="sub">Venda balcão com baixa automática de estoque</div></div></div>' +
      '<div class="pdv-grid">' +
      '<div><input class="search-input" placeholder="Buscar peça..." oninput="_pdvFilter(this.value)" />' +
      '<div class="pdv-parts" id="pdv-parts">' +
      pecas.map(pdvPartCard).join('') +
      (pecas.length === 0 ? '<p style="color:var(--gray-400)">Nenhuma peça com estoque.</p>' : '') +
      '</div></div>' +
      '<div class="card"><h3 style="margin-bottom:10px">🛒 Carrinho</h3>' +
      (cart.length === 0 ? '<p style="color:var(--gray-400)">Carrinho vazio.</p>' :
        cart.map(function (i, idx) {
          return '<div class="cart-item"><span class="ci-name">' + esc(i.nome) + '<br><small style="color:var(--gray-500)">' +
            money(i.preco) + '</small></span>' +
            '<input type="number" min="1" value="' + i.qtd + '" onchange="_pdvQtd(' + idx + ', this.value)"/>' +
            '<button class="btn ghost small" onclick="_pdvRemove(' + idx + ')">✖</button></div>';
        }).join('')) +
      '<div class="cart-total"><span>Total</span><span>' + money(total) + '</span></div>' +
      '<div class="field" style="margin-bottom:10px"><label>Pagamento</label><select id="pdv-pag">' +
      '<option value="dinheiro">Dinheiro</option><option value="pix">PIX</option>' +
      '<option value="debito">Cartão débito</option><option value="credito">Cartão crédito</option>' +
      '</select></div>' +
      '<button class="btn" style="width:100%;justify-content:center;height:44px" onclick="_pdvFinish()"' +
      (cart.length === 0 ? ' disabled style="width:100%;justify-content:center;height:44px;opacity:.5"' : '') +
      '>Finalizar venda</button>' +
      '</div></div>';
  }

  function pdvPartCard(p) {
    return '<div class="pdv-part" data-name="' + esc((p.descricao + ' ' + (p.codigo || '')).toLowerCase()) +
      '" onclick="_pdvAdd(\'' + p.id + '\')">' +
      '<div class="p-name">' + esc(p.descricao) + '</div>' +
      '<div class="p-price">' + money(p.preco) + '</div>' +
      '<div class="p-stock">Estoque: ' + (p.estoque || 0) + '</div></div>';
  }

  window._pdvFilter = function (q) {
    q = q.toLowerCase();
    document.querySelectorAll('#pdv-parts .pdv-part').forEach(function (el) {
      el.style.display = el.getAttribute('data-name').indexOf(q) !== -1 ? '' : 'none';
    });
  };

  window._pdvAdd = function (pid) {
    var p = dbGet('pecas').find(function (x) { return x.id === pid; });
    if (!p) return;
    var item = cart.find(function (i) { return i.pecaId === pid; });
    var inCart = item ? item.qtd : 0;
    if (inCart + 1 > (p.estoque || 0)) { toast('Estoque insuficiente.', true); return; }
    if (item) item.qtd++;
    else cart.push({ pecaId: pid, nome: p.descricao, preco: p.preco, qtd: 1, tipo: 'peca' });
    render();
  };

  window._pdvQtd = function (idx, v) {
    var item = cart[idx];
    if (!item) return;
    var p = dbGet('pecas').find(function (x) { return x.id === item.pecaId; });
    var qtd = Math.max(1, parseInt(v, 10) || 1);
    if (p && qtd > (p.estoque || 0)) { toast('Estoque insuficiente.', true); qtd = p.estoque || 1; }
    item.qtd = qtd;
    render();
  };

  window._pdvRemove = function (idx) { cart.splice(idx, 1); render(); };

  window._pdvFinish = function () {
    if (cart.length === 0) return;
    var pecas = dbGet('pecas');
    for (var i = 0; i < cart.length; i++) {
      var p = pecas.find(function (x) { return x.id === cart[i].pecaId; });
      if (!p || (p.estoque || 0) < cart[i].qtd) {
        toast('Estoque insuficiente para ' + cart[i].nome + '.', true);
        return;
      }
    }
    cart.forEach(function (item) {
      var p = pecas.find(function (x) { return x.id === item.pecaId; });
      p.estoque = (p.estoque || 0) - item.qtd;
    });
    dbSet('pecas', pecas);
    var vendas = dbGet('vendas');
    var total = cart.reduce(function (s, it) { return s + it.preco * it.qtd; }, 0);
    vendas.push({
      id: uid(), origem: 'pdv', itens: cart.slice(), total: total,
      pagamento: val('pdv-pag') || 'dinheiro', data: new Date().toISOString(),
    });
    dbSet('vendas', vendas);
    cart = [];
    toast('Venda finalizada: ' + money(total));
    render();
  };

  /* ================= Vendas ================= */
  var PAG_LABEL = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', os: 'Ordem de Serviço' };

  function pageVendas() {
    var vendas = dbGet('vendas').slice().reverse();
    var total = vendas.reduce(function (s, v) { return s + v.total; }, 0);
    return '<div class="page-header"><div><h1>Vendas</h1>' +
      '<div class="sub">' + vendas.length + ' vendas — total ' + money(total) + '</div></div></div>' +
      (vendas.length === 0
        ? empty('💰', 'Nenhuma venda registrada')
        : '<div class="table-wrap"><table class="data">' +
          '<tr><th>Data</th><th>Origem</th><th>Itens</th><th>Pagamento</th><th>Total</th></tr>' +
          vendas.map(function (v) {
            return '<tr><td>' + new Date(v.data).toLocaleString('pt-BR') + '</td>' +
              '<td>' + (v.origem === 'pdv' ? 'PDV' : esc(v.ref || 'OS')) + '</td>' +
              '<td>' + v.itens.map(function (i) { return i.qtd + '× ' + esc(i.nome); }).join(', ') + '</td>' +
              '<td>' + (PAG_LABEL[v.pagamento] || v.pagamento) + '</td>' +
              '<td><b>' + money(v.total) + '</b></td></tr>';
          }).join('') + '</table></div>');
  }

  /* ================= Relatórios ================= */
  function pageRelatorios() {
    var vendas = dbGet('vendas');
    var now = new Date();
    var mesAtual = vendas.filter(function (v) {
      var d = new Date(v.data);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    var totalMes = mesAtual.reduce(function (s, v) { return s + v.total; }, 0);
    var porPagamento = {};
    mesAtual.forEach(function (v) {
      porPagamento[v.pagamento] = (porPagamento[v.pagamento] || 0) + v.total;
    });
    var porPeca = {};
    mesAtual.forEach(function (v) {
      v.itens.forEach(function (i) {
        if (i.tipo === 'peca') porPeca[i.nome] = (porPeca[i.nome] || 0) + i.qtd;
      });
    });
    var top = Object.keys(porPeca).map(function (k) { return { nome: k, qtd: porPeca[k] }; })
      .sort(function (a, b) { return b.qtd - a.qtd; }).slice(0, 10);

    return '<div class="page-header"><div><h1>Relatórios</h1>' +
      '<div class="sub">Resumo de ' + now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + '</div></div></div>' +
      '<div class="cards-grid">' +
      '<div class="card stat-card"><div class="stat-label">Faturamento do mês</div><div class="stat-value">' + money(totalMes) + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Vendas no mês</div><div class="stat-value">' + mesAtual.length + '</div></div>' +
      '<div class="card stat-card"><div class="stat-label">Ticket médio</div><div class="stat-value">' +
      money(mesAtual.length ? totalMes / mesAtual.length : 0) + '</div></div></div>' +
      '<div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">' +
      '<div class="card"><h3 style="margin-bottom:12px">Por forma de pagamento</h3>' +
      (Object.keys(porPagamento).length === 0 ? '<p style="color:var(--gray-400)">Sem dados.</p>' :
        '<table class="data">' + Object.keys(porPagamento).map(function (k) {
          return '<tr><td>' + (PAG_LABEL[k] || k) + '</td><td style="text-align:right"><b>' + money(porPagamento[k]) + '</b></td></tr>';
        }).join('') + '</table>') + '</div>' +
      '<div class="card"><h3 style="margin-bottom:12px">Peças mais vendidas</h3>' +
      (top.length === 0 ? '<p style="color:var(--gray-400)">Sem dados.</p>' :
        '<table class="data">' + top.map(function (t) {
          return '<tr><td>' + esc(t.nome) + '</td><td style="text-align:right"><b>' + t.qtd + ' un</b></td></tr>';
        }).join('') + '</table>') + '</div></div>';
  }

  /* ================= Configurações ================= */
  function pageConfig() {
    var config = dbGet('config', {});
    var lic = L.getLicense();
    return '<div class="page-header"><div><h1>Configurações</h1></div></div>' +
      '<div class="cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">' +

      '<div class="card"><h3 style="margin-bottom:12px">🏢 Dados da empresa</h3>' +
      '<div class="form-grid" style="grid-template-columns:1fr">' +
      field('Nome da oficina', 'cfg-nome', config.nome) +
      field('CNPJ', 'cfg-cnpj', config.cnpj) +
      field('Telefone', 'cfg-tel', config.telefone) +
      field('Endereço', 'cfg-end', config.endereco) +
      '</div><div style="margin-top:12px"><button class="btn" onclick="_cfgSave()">Salvar</button></div></div>' +

      '<div class="card"><h3 style="margin-bottom:12px">🔑 Licença</h3>' +
      '<p style="line-height:1.9">Chave: <code>' + esc(lic ? lic.key : '—') + '</code><br>' +
      'Duração: <b>' + (lic ? L.durationLabel(lic.durationDays) : '—') + '</b><br>' +
      'Ativada em: <b>' + dateBR(lic && lic.activatedAt) + '</b><br>' +
      'Expira em: <b>' + dateBR(lic && lic.expiresAt) + '</b> (' +
      (lic ? L.daysRemaining(lic.expiresAt) : 0) + ' dias restantes)</p>' +
      '<div style="margin-top:12px"><button class="btn secondary" onclick="_cfgNewKey()">Ativar nova chave</button></div></div>' +

      cardCertificado() +

      '<div class="card"><h3 style="margin-bottom:12px">💾 Backup dos dados</h3>' +
      '<p style="color:var(--gray-500);margin-bottom:12px">Os dados ficam salvos apenas neste dispositivo. Exporte backups regularmente.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn secondary" onclick="_backupExport()">⬇ Exportar backup</button>' +
      '<button class="btn secondary" onclick="_backupImport()">⬆ Importar backup</button>' +
      '<button class="btn secondary" style="color:var(--red)" onclick="_dataReset()">🗑 Apagar todos os dados</button>' +
      '</div><input type="file" id="backup-file" accept=".json" style="display:none"/></div>' +
      '</div>';
  }

  /* ---- Certificado digital (só existe dentro do app desktop) ----
     O certificado e a senha ficam NESTE computador. A emissão de NFS-e
     acontece aqui, e não num servidor — por isso o provedor nunca guarda
     certificado de cliente nenhum. */
  var _certInfo = null;

  function cardCertificado() {
    if (!window.giropecasNFSe) {
      // No navegador não há como emitir: o Sefin exige certificado no
      // handshake TLS, coisa que página web não faz.
      return '<div class="card"><h3 style="margin-bottom:12px">📄 Certificado digital</h3>' +
        '<p style="color:var(--gray-500);line-height:1.7">A emissão de NFS-e só funciona no ' +
        '<b>aplicativo instalado no computador</b> da oficina, porque o certificado precisa ' +
        'ficar nesta máquina.</p></div>';
    }

    var c = _certInfo;
    var corpo;

    if (!c) {
      corpo = '<p style="color:var(--gray-500)">Verificando...</p>';
    } else if (!c.configurado) {
      corpo = '<p style="color:var(--gray-500);margin-bottom:12px">Nenhum certificado configurado. ' +
        'Envie o arquivo <b>.pfx</b> (certificado A1) da oficina para emitir NFS-e.</p>' +
        '<button class="btn" onclick="_certEscolher()">Configurar certificado</button>';
    } else {
      var alerta = '';
      if (c.expirado) {
        alerta = '<p style="color:var(--red);font-weight:600">⚠ Certificado VENCIDO — renove para voltar a emitir.</p>';
      } else if (typeof c.diasParaVencer === 'number' && c.diasParaVencer <= 30) {
        alerta = '<p style="color:#b45309;font-weight:600">⚠ Vence em ' + c.diasParaVencer + ' dia(s). Providencie a renovação.</p>';
      }
      var senhaAviso = c.senhaGuardada
        ? '<span style="color:var(--green,#15803d)">senha guardada com segurança neste computador</span>'
        : '<span style="color:#b45309">senha não guardada — será pedida a cada emissão</span>';

      corpo = alerta +
        '<p style="line-height:1.9">' +
        (c.titular ? 'Titular: <b>' + esc(String(c.titular).slice(0, 60)) + '</b><br>' : '') +
        (c.validoAte ? 'Válido até: <b>' + dateBR(c.validoAte) + '</b><br>' : '') +
        'Proteção: ' + senhaAviso + '</p>' +
        (c.erro ? '<p style="color:var(--red)">' + esc(c.erro) + '</p>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
        '<button class="btn secondary" onclick="_certEscolher()">Trocar certificado</button>' +
        '<button class="btn secondary" style="color:var(--red)" onclick="_certRemover()">Remover</button>' +
        '</div>';
    }

    return '<div class="card"><h3 style="margin-bottom:12px">📄 Certificado digital (NFS-e)</h3>' +
      corpo +
      '<p style="color:var(--gray-500);font-size:12px;margin-top:12px;line-height:1.6">' +
      'O arquivo e a senha ficam <b>somente neste computador</b> e nunca são enviados para a internet. ' +
      'Por isso a emissão de nota só funciona daqui.</p></div>';
  }

  // Busca a situação e redesenha quando a tela de config abre.
  function carregarCertificado() {
    if (!window.giropecasNFSe) return;
    window.giropecasNFSe.situacaoCertificado().then(function (r) {
      _certInfo = r && r.ok ? r.dados : { configurado: false, erro: r && r.erro };
      if (location.hash === '#/config') render();
    });
  }

  window._certEscolher = function () {
    window.giropecasNFSe.escolherArquivo().then(function (caminho) {
      if (!caminho) return;
      var nome = String(caminho).split(/[\\/]/).pop();
      openModal(
        '<h3>Senha do certificado</h3>' +
        '<p style="color:var(--gray-500);margin:8px 0 12px">Arquivo: <b>' + esc(nome) + '</b></p>' +
        '<div class="form-grid" style="grid-template-columns:1fr">' +
        '<label>Senha<input type="password" id="cert-senha" autocomplete="off"/></label>' +
        '</div>' +
        '<p id="cert-erro" style="color:var(--red);margin-top:8px"></p>' +
        '<div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn" id="cert-ok">Salvar</button></div>'
      );
      document.getElementById('cert-ok').onclick = function () {
        var senha = val('cert-senha');
        if (!senha) { document.getElementById('cert-erro').textContent = 'Informe a senha.'; return; }
        this.disabled = true; this.textContent = 'Verificando...';
        var botao = this;
        window.giropecasNFSe.salvarCertificado(caminho, senha).then(function (r) {
          if (!r.ok) {
            // A senha é conferida AQUI, não na hora de emitir com o
            // cliente esperando no balcão.
            document.getElementById('cert-erro').textContent = r.erro;
            botao.disabled = false; botao.textContent = 'Salvar';
            return;
          }
          closeModal();
          toast('Certificado configurado!');
          carregarCertificado();
        });
      };
    });
  };

  window._certRemover = function () {
    if (!confirm('Remover o certificado deste computador? A oficina não poderá emitir NFS-e até configurar de novo.')) return;
    window.giropecasNFSe.removerCertificado().then(function () {
      toast('Certificado removido.');
      carregarCertificado();
    });
  };

  window._cfgSave = function () {
    var config = dbGet('config', {});
    config.nome = val('cfg-nome');
    config.cnpj = val('cfg-cnpj');
    config.telefone = val('cfg-tel');
    config.endereco = val('cfg-end');
    dbSet('config', config);
    toast('Configurações salvas!'); render();
  };

  window._cfgNewKey = function () {
    openModal(
      '<h2>Ativar nova chave</h2>' +
      '<p style="color:var(--gray-500);margin-bottom:12px">A nova chave substituirá a licença atual.</p>' +
      '<input id="nk-key" class="gate-input" placeholder="GIRO-XXXX-XXXX-XXXX" maxlength="19"/>' +
      '<div class="modal-actions">' +
      '<button class="btn secondary" onclick="_closeModal()">Cancelar</button>' +
      '<button class="btn" id="nk-save">Ativar</button></div>',
      function (overlay) {
        overlay.querySelector('#nk-save').addEventListener('click', function () {
          var res = L.activate(val('nk-key'));
          if (res.ok) { closeModal(); toast('Nova licença ativada!'); render(); }
          else toast(res.reason, true);
        });
      }
    );
  };

  var COLLECTIONS = ['clientes', 'pecas', 'ordens', 'vendas', 'config'];

  window._backupExport = function () {
    var data = { app: 'giropecas-offline', version: 1, exportedAt: new Date().toISOString() };
    COLLECTIONS.forEach(function (c) { data[c] = dbGet(c, c === 'config' ? {} : []); });
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'giropecas-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup exportado!');
  };

  window._backupImport = function () {
    var input = document.getElementById('backup-file');
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (data.app !== 'giropecas-offline') throw new Error('Arquivo não é um backup do Giropeças.');
          if (!confirm('Importar backup de ' + dateBR(data.exportedAt) + '? Os dados atuais serão substituídos.')) return;
          COLLECTIONS.forEach(function (c) {
            if (data[c] !== undefined) dbSet(c, data[c]);
          });
          toast('Backup importado!'); render();
        } catch (e) {
          toast('Erro ao importar: ' + e.message, true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  window._dataReset = function () {
    if (!confirm('Apagar TODOS os dados (clientes, peças, ordens e vendas)? Esta ação não pode ser desfeita.')) return;
    if (!confirm('Tem certeza? Recomendamos exportar um backup antes.')) return;
    COLLECTIONS.forEach(function (c) { localStorage.removeItem(DB_PREFIX + c); });
    toast('Dados apagados.'); render();
  };

  /* ================= Helpers de formulário ================= */
  function field(label, id, value, cls) {
    return '<div class="field ' + (cls || '') + '"><label>' + label + '</label>' +
      '<input id="' + id + '" value="' + esc(value || '') + '"/></div>';
  }
  function fieldNum(label, id, value, cls) {
    return '<div class="field ' + (cls || '') + '"><label>' + label + '</label>' +
      '<input id="' + id + '" type="number" step="0.01" min="0" value="' + esc(value != null ? value : '') + '"/></div>';
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function num(id) {
    return parseFloat(val(id).replace(',', '.')) || 0;
  }
  function empty(icon, msg) {
    return '<div class="empty"><div class="empty-icon">' + icon + '</div><p>' + msg + '</p></div>';
  }

  window._filterTable = function (q, tableId) {
    q = q.toLowerCase();
    var rows = document.querySelectorAll('#' + tableId + ' tr');
    rows.forEach(function (tr, i) {
      if (i === 0) return; // cabeçalho
      tr.style.display = tr.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  };

  /* ================= Router ================= */
  var PAGES = {
    '#/': pageDashboard,
    '#/clientes': pageClientes,
    '#/pecas': pagePecas,
    '#/ordens': pageOrdens,
    '#/pdv': pagePDV,
    '#/vendas': pageVendas,
    '#/relatorios': pageRelatorios,
    '#/config': pageConfig,
  };

  function render() {
    if (!L.isLicensed()) { renderGate(); return; }
    var page = PAGES[currentRoute()] || pageDashboard;
    renderShell(page());
  }

  window.addEventListener('hashchange', function () {
    render();
    // Ao abrir Configurações, busca a situação do certificado local.
    // Só faz sentido no app desktop; no navegador giropecasNFSe não existe.
    if (location.hash === '#/config' && _certInfo === null) carregarCertificado();
  });

  // Verifica expiração periodicamente (a cada minuto)
  setInterval(function () {
    if (!L.isLicensed() && document.querySelector('.app')) render();
  }, 60000);

  render();
  // Se o app abrir já em Configurações, busca a situação do certificado.
  if (location.hash === '#/config') carregarCertificado();
})();
