import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/lib/CompanyContext';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Clock, User, Trash2, CheckCircle2, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { hoje, diaLocal } from '@/lib/datas';

const HOURS = Array.from({ length: 12 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`); // 08:00 - 19:00

const STATUS_CONFIG = {
  agendado: { label: 'Agendado', color: 'bg-blue-100 text-blue-700', border: 'border-blue-300' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700', border: 'border-green-300' },
  em_andamento: { label: 'Em Andamento', color: 'bg-orange-100 text-orange-700', border: 'border-orange-300' },
  concluido: { label: 'Concluído', color: 'bg-gray-100 text-gray-700', border: 'border-gray-300' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700', border: 'border-red-300' },
  no_show: { label: 'Não Compareceu', color: 'bg-red-100 text-red-700', border: 'border-red-300' },
};

export default function Agenda() {
  const { company } = useCompany();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(hoje());
  const [viewMode, setViewMode] = useState('day'); // day | mechanic
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetTime, setPresetTime] = useState('08:00');

  const [form, setForm] = useState({
    customer_id: '', vehicle_id: '', mechanic_id: '',
    scheduled_date: currentDate, scheduled_time: '08:00',
    duration_hours: 1, service_description: '', status: 'agendado', notes: ''
  });

  useEffect(() => { loadData(); }, [company, currentDate]);

  const loadData = async () => {
    if (!company?.id) return;
    setLoading(true);
    const [appts, custs, techs] = await Promise.all([
      base44.entities.Appointment.filter({ company_id: company.id, scheduled_date: currentDate }),
      base44.entities.Customer.filter({ company_id: company.id, is_active: true }),
      base44.entities.Technician.filter({ company_id: company.id, is_active: true }, 'name'),
    ]);
    setAppointments(appts);
    setCustomers(custs);
    setMechanics(techs);
    // Load vehicles for selected customer
    if (form.customer_id) {
      const vs = await base44.entities.Vehicle.filter({ customer_id: form.customer_id });
      setVehicles(vs);
    }
    setLoading(false);
  };

  const loadVehicles = async (customerId) => {
    if (!customerId) { setVehicles([]); return; }
    const vs = await base44.entities.Vehicle.filter({ customer_id: customerId });
    setVehicles(vs);
  };

  const set = (f, v) => {
    setForm(prev => ({ ...prev, [f]: v }));
    if (f === 'customer_id') loadVehicles(v);
  };

  const openModal = (time = '08:00') => {
    setPresetTime(time);
    setForm({
      customer_id: '', vehicle_id: '', mechanic_id: '',
      scheduled_date: currentDate, scheduled_time: time,
      duration_hours: 1, service_description: '', status: 'agendado', notes: ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.service_description.trim()) {
      toast({ title: 'Descrição do serviço é obrigatória', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const cust = customers.find(c => c.id === form.customer_id);
      const mech = mechanics.find(m => m.id === form.mechanic_id);
      const veh = vehicles.find(v => v.id === form.vehicle_id);
      await base44.entities.Appointment.create({
        ...form,
        company_id: company.id,
        customer_name: cust?.name || '',
        mechanic_name: mech?.name || '',
        vehicle_desc: veh ? `${veh.brand} ${veh.model} - ${veh.plate}` : '',
        duration_hours: parseFloat(form.duration_hours) || 1,
      });
      toast({ title: 'Agendamento criado!' });
      setShowModal(false);
      loadData();
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const updateStatus = async (appt, status) => {
    await base44.entities.Appointment.update(appt.id, { status });
    toast({ title: 'Status atualizado' });
    loadData();
  };

  const handleDelete = async (appt) => {
    if (!confirm('Excluir este agendamento?')) return;
    await base44.entities.Appointment.delete(appt.id);
    toast({ title: 'Agendamento excluído' });
    loadData();
  };

  const changeDay = (delta) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    setCurrentDate(diaLocal(d));
  };

  const goToToday = () => setCurrentDate(hoje());

  const dateLabel = new Date(currentDate + 'T00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  const isToday = currentDate === hoje();

  // Group by mechanic
  const byMechanic = mechanics.map(m => ({
    mechanic: m,
    appts: appointments.filter(a => a.mechanic_id === m.id).sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''))
  }));
  const unassigned = appointments.filter(a => !a.mechanic_id).sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''));

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">Agenda de Serviços</h1>
        <Button onClick={() => openModal()} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Novo Agendamento
        </Button>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="icon" onClick={() => changeDay(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
        <Button variant="outline" size="icon" onClick={() => changeDay(1)}><ChevronRight className="w-4 h-4" /></Button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-gray-800 capitalize">{dateLabel}</p>
          {isToday && <Badge className="bg-red-100 text-red-700 text-xs mt-0.5">Hoje</Badge>}
        </div>
        <Select value={viewMode} onValueChange={setViewMode}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Por Horário</SelectItem>
            <SelectItem value="mechanic">Por Mecânico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Carregando...</div>
      ) : viewMode === 'day' ? (
        /* Day view: time slots */
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {HOURS.map(hour => {
                const appts = appointments.filter(a => (a.scheduled_time || '').startsWith(hour.split(':')[0]));
                return (
                  <div key={hour} className="flex gap-3 p-3 min-h-16 hover:bg-gray-50">
                    <div className="w-12 shrink-0 text-xs font-medium text-gray-500 pt-1">{hour}</div>
                    <div className="flex-1 flex flex-wrap gap-2">
                      {appts.length === 0 ? (
                        <button onClick={() => openModal(hour)} className="text-xs text-gray-300 hover:text-red-600 transition-colors">
                          + agendar
                        </button>
                      ) : (
                        appts.map(appt => (
                          <div key={appt.id} className={`flex-1 min-w-48 rounded-lg border p-2 ${STATUS_CONFIG[appt.status]?.border || 'border-gray-200'} ${STATUS_CONFIG[appt.status]?.color || ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{appt.service_description}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs opacity-80">
                                  {appt.customer_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{appt.customer_name}</span>}
                                  {appt.mechanic_name && <span>• {appt.mechanic_name}</span>}
                                </div>
                                {appt.vehicle_desc && <p className="text-xs opacity-60 mt-0.5">{appt.vehicle_desc}</p>}
                                <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                                  <Clock className="w-3 h-3" />{appt.scheduled_time} • {appt.duration_hours}h
                                </div>
                              </div>
                              <Badge className={`text-xs ${STATUS_CONFIG[appt.status]?.color || ''}`}>{STATUS_CONFIG[appt.status]?.label}</Badge>
                            </div>
                            <div className="flex gap-1 mt-2">
                              {appt.status === 'agendado' && (
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-green-600" onClick={() => updateStatus(appt, 'confirmado')}>Confirmar</Button>
                              )}
                              {appt.status === 'confirmado' && (
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-orange-600" onClick={() => updateStatus(appt, 'em_andamento')}>Iniciar</Button>
                              )}
                              {appt.status === 'em_andamento' && (
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-600" onClick={() => updateStatus(appt, 'concluido')}>Concluir</Button>
                              )}
                              {!appt.work_order_id && appt.status !== 'concluido' && (
                                <Link to={`/ordens/nova?customer_id=${appt.customer_id || ''}`}>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-600">Virar OS</Button>
                                </Link>
                              )}
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400" onClick={() => handleDelete(appt)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Mechanic view: columns per mechanic */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {byMechanic.map(({ mechanic, appts }) => (
            <Card key={mechanic.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{mechanic.name}</p>
                    <p className="text-xs text-gray-500">{appts.length} agendamento(s)</p>
                  </div>
                </div>
                {appts.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-4">Sem agendamentos</p>
                ) : (
                  <div className="space-y-2">
                    {appts.map(appt => (
                      <div key={appt.id} className={`rounded-lg border p-2 ${STATUS_CONFIG[appt.status]?.border || ''} ${STATUS_CONFIG[appt.status]?.color || ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{appt.scheduled_time}</span>
                          <Badge className={`text-xs ${STATUS_CONFIG[appt.status]?.color || ''}`}>{STATUS_CONFIG[appt.status]?.label}</Badge>
                        </div>
                        <p className="text-sm font-medium mt-1 truncate">{appt.service_description}</p>
                        {appt.customer_name && <p className="text-xs opacity-70">{appt.customer_name}</p>}
                        {appt.vehicle_desc && <p className="text-xs opacity-50">{appt.vehicle_desc}</p>}
                        <div className="flex gap-1 mt-1">
                          {appt.status === 'agendado' && <Button size="sm" variant="ghost" className="h-5 text-xs" onClick={() => updateStatus(appt, 'confirmado')}>✓</Button>}
                          {appt.status === 'confirmado' && <Button size="sm" variant="ghost" className="h-5 text-xs" onClick={() => updateStatus(appt, 'em_andamento')}>▶</Button>}
                          {appt.status === 'em_andamento' && <Button size="sm" variant="ghost" className="h-5 text-xs" onClick={() => updateStatus(appt, 'concluido')}><CheckCircle2 className="w-3 h-3" /></Button>}
                          <Button size="sm" variant="ghost" className="h-5 text-xs text-red-400" onClick={() => handleDelete(appt)}><X className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {/* Unassigned column */}
          {unassigned.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <CalIcon className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Sem mecânico</p>
                </div>
                <div className="space-y-2">
                  {unassigned.map(appt => (
                    <div key={appt.id} className={`rounded-lg border p-2 ${STATUS_CONFIG[appt.status]?.border || ''} ${STATUS_CONFIG[appt.status]?.color || ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{appt.scheduled_time}</span>
                        <Badge className={`text-xs ${STATUS_CONFIG[appt.status]?.color || ''}`}>{STATUS_CONFIG[appt.status]?.label}</Badge>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{appt.service_description}</p>
                      {appt.customer_name && <p className="text-xs opacity-70">{appt.customer_name}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Serviço *</Label>
              <Input className="mt-1" value={form.service_description} onChange={e => set('service_description', e.target.value)} placeholder="Ex: Troca de óleo e revisão" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input className="mt-1" type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} />
              </div>
              <div>
                <Label>Horário</Label>
                <Input className="mt-1" type="time" value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duração (h)</Label>
                <Input className="mt-1" type="number" step="0.5" min="0.5" value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} />
              </div>
              <div>
                <Label>Técnico</Label>
                <Select value={form.mechanic_id} onValueChange={v => set('mechanic_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="— Nenhum —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Nenhum —</SelectItem>
                    {mechanics.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select value={form.customer_id} onValueChange={v => set('customer_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— Sem cliente —</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {vehicles.length > 0 && (
              <div>
                <Label>Veículo</Label>
                <Select value={form.vehicle_id} onValueChange={v => set('vehicle_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Sem veículo —</SelectItem>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} - {v.plate}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea className="mt-1" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? 'Salvando...' : 'Agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}