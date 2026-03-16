import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { clients as initialClients, Client } from "@/data/mockData";
import { Plus, Pencil, Trash2 } from "lucide-react";

const emptyClient: Omit<Client, "id"> = { name: "", phone: "", email: "", address: "", notes: "" };

const ClientsPage = () => {
  const [data, setData] = useState<Client[]>(initialClients);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);

  const openNew = () => { setEditing(null); setForm(emptyClient); setModal(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm(c); setModal(true); };
  const save = () => {
    if (editing) {
      setData(d => d.map(c => c.id === editing.id ? { ...c, ...form } : c));
    } else {
      setData(d => [...d, { ...form, id: `c${Date.now()}` }]);
    }
    setModal(false);
  };
  const remove = (id: string) => setData(d => d.filter(c => c.id !== id));

  const columns = [
    { key: "name", header: "Nome" },
    { key: "phone", header: "Telefone", mono: true },
    { key: "email", header: "E-mail" },
    { key: "address", header: "Endereço" },
    { key: "notes", header: "Observações", className: "max-w-[200px] truncate" },
    {
      key: "actions", header: "Ações",
      render: (c: Client) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Clientes"
      action={
        <button onClick={openNew} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NOVO CLIENTE
        </button>
      }
    >
      <div className="animate-fade-in">
        <DataTable columns={columns} data={data} emptyMessage="Nenhum cliente. Clique em + para adicionar." />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar Cliente" : "Novo Cliente"}>
        <div className="space-y-4">
          <FormField label="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome do cliente" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Telefone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
            <FormField label="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" placeholder="email@exemplo.com" />
          </div>
          <FormField label="Endereço" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Endereço completo" />
          <FormField label="Observações" as="textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionais" />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button onClick={save} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Salvar</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ClientsPage;
