import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Wrench, Clock } from 'lucide-react';

const EMPTY_SERVICE = {
  name: '', description: '', standard_time_hours: 1, labor_price: 0, category: '', code: '',
  // Manutencao preventiva
  interval_months: '', interval_km: '',
  // Fiscais (NFS-e / ISS municipal)
  service_code_lc116: '14.01', municipal_service_code: '', iss_rate: '', iss_retido: false, cnae: '',
};

// Itens da lista da LC 116/2003 mais usados por oficina. O contador confirma
// qual se aplica a cada serviço — a prefeitura usa o código municipal próprio.
const LC116_OFICINA = [
  { code: '14.01', label: 'Conserto, manutenção e conservação de veículos e máquinas' },
  { code: '14.02', label: 'Assistência técnica' },
  { code: '14.03', label: 'Recondicionamento de motores' },
  { code: '14.05', label: 'Restauração, recondicionamento, pintura, polimento e congêneres' },
  { code: '14.06', label: 'Instalação e montagem com material fornecido pelo cliente' },
];

export default function Servicos() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_SERVICE });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company?.id) loadServices();
  }, [company]);

  const loadServices = async () => {
    setLoading(true);
    const data = await base44.entities.Service.filter({ company_id: company.id });
    setServices(data);
    setLoading(false);
  };

  const filtered = services.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.code?.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      company_id: company.id,
      labor_price: parseFloat(form.labor_price) || 0,
      standard_time_hours: parseFloat(form.standard_time_hours) || 1,
      iss_rate: form.iss_rate === '' ? 0 : (parseFloat(form.iss_rate) || 0),
      // Vazio significa "nao se repete" — nao pode virar zero.
      interval_months: form.interval_months === '' ? null : (parseFloat(form.interval_months) || null),
      interval_km: form.interval_km === '' ? null : (parseFloat(form.interval_km) || null),
    };
    if (editId) await base44.entities.Service.update(editId, payload);
    else await base44.entities.Service.create(payload);
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm({ ...EMPTY_SERVICE });
    loadServices();
  };

  const handleEdit = (svc) => {
    // Mescla com o padrão para serviços antigos, que não têm os campos fiscais
    setForm({ ...EMPTY_SERVICE, ...svc,
      iss_rate: svc.iss_rate ?? '',
      interval_months: svc.interval_months ?? '',
      interval_km: svc.interval_km ?? '' });
    setEditId(svc.id);
    setShowForm(true);
  };

  const handleDelete = async (svc) => {
    if (!confirm(`Excluir serviço "${svc.name}"?`)) return;
    await base44.entities.Service.delete(svc.id);
    loadServices();
  };

  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Serviços</h1>
          <p className="text-gray-500 text-sm">{services.length} serviços cadastrados</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_SERVICE }); }}>
          <Plus className="w-4 h-4 mr-2" />Novo
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 border-red-200">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">{editId ? 'Editar Serviço' : 'Novo Serviço'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nome *</label>
                <Input className="mt-1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Troca de óleo" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Categoria</label>
                <Input className="mt-1" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Manutenção" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tempo padrão (horas)</label>
                <Input className="mt-1" type="number" step="0.5" min="0" value={form.standard_time_hours} onChange={e => setForm(p => ({ ...p, standard_time_hours: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Valor mão de obra (R$)</label>
                <Input className="mt-1" type="number" step="0.01" min="0" value={form.labor_price} onChange={e => setForm(p => ({ ...p, labor_price: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">Descrição</label>
                <Input className="mt-1" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>

            {/* Manutenção preventiva: alimenta o aviso de revisão */}
            <div className="pt-3 mt-1 border-t">
              <p className="text-xs font-semibold text-gray-700">Manutenção preventiva</p>
              <p className="text-xs text-gray-400 mb-2">
                De quanto em quanto tempo ou km este serviço precisa ser refeito. O
                sistema avisa quando chegar perto — vence pelo que vier primeiro.
                Deixe em branco se o serviço não se repete.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Refazer a cada (meses)</label>
                  <Input className="mt-1" type="number" min="0" step="1" value={form.interval_months}
                    onChange={e => setForm(p => ({ ...p, interval_months: e.target.value }))} placeholder="Ex: 6" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Refazer a cada (km)</label>
                  <Input className="mt-1" type="number" min="0" step="100" value={form.interval_km}
                    onChange={e => setForm(p => ({ ...p, interval_km: e.target.value }))} placeholder="Ex: 5000" />
                </div>
              </div>
            </div>

            {/* Dados fiscais — usados na emissão de NFS-e (ISS municipal) */}
            <div className="pt-3 mt-1 border-t">
              <p className="text-xs font-semibold text-gray-700">Dados fiscais (NFS-e)</p>
              <p className="text-xs text-gray-400 mb-2">
                Usados na emissão da nota de serviço. Confirme os códigos e a alíquota com o contador ou a prefeitura.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600">Item da lista de serviços (LC 116/2003)</label>
                  <Input className="mt-1" list="lc116-oficina" value={form.service_code_lc116}
                    onChange={e => setForm(p => ({ ...p, service_code_lc116: e.target.value }))} placeholder="14.01" />
                  <datalist id="lc116-oficina">
                    {LC116_OFICINA.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
                  </datalist>
                  <p className="text-xs text-gray-400 mt-1">
                    Oficina normalmente usa <strong>14.01</strong> (conserto e manutenção de veículos).
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Código de tributação do município</label>
                  <Input className="mt-1" value={form.municipal_service_code}
                    onChange={e => setForm(p => ({ ...p, municipal_service_code: e.target.value }))} placeholder="varia por prefeitura" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Alíquota ISS (%)</label>
                  <Input className="mt-1" type="number" step="0.01" min="0" max="5" value={form.iss_rate}
                    onChange={e => setForm(p => ({ ...p, iss_rate: e.target.value }))} placeholder="Ex: 3" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">CNAE (opcional)</label>
                  <Input className="mt-1" value={form.cnae}
                    onChange={e => setForm(p => ({ ...p, cnae: e.target.value }))} placeholder="4520-0/01" />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input id="iss_retido" type="checkbox" className="w-4 h-4 accent-red-600"
                    checked={!!form.iss_retido} onChange={e => setForm(p => ({ ...p, iss_retido: e.target.checked }))} />
                  <label htmlFor="iss_retido" className="text-xs font-medium text-gray-600">ISS retido na fonte</label>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving ? 'Salvando...' : 'Salvar'}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar serviços..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Carregando...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <Wrench className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum serviço cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(svc => (
              <Card key={svc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{svc.name}</p>
                    <div className="flex gap-3 mt-0.5">
                      {svc.category && <span className="text-xs text-gray-400">{svc.category}</span>}
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{svc.standard_time_hours}h</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(svc.labor_price)}</p>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => handleEdit(svc)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => handleDelete(svc)} className="text-xs text-red-600 hover:underline">Excluir</button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      }
    </div>
  );
}