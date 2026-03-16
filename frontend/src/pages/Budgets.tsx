import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { budgets as initialBudgets, clients, products, calculateBudget, Budget, BudgetItem } from "@/data/mockData";
import { Plus, Trash2 } from "lucide-react";

const BudgetsPage = () => {
  const [data, setData] = useState<Budget[]>(initialBudgets);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    laborCost: 0,
    profitMargin: 0.35,
    items: [] as BudgetItem[],
  });
  const [newItem, setNewItem] = useState({ productId: "", quantity: 1 });

  const addItem = () => {
    const product = products.find(p => p.id === newItem.productId);
    if (!product) return;
    const item: BudgetItem = {
      productId: product.id,
      productName: product.name,
      quantity: newItem.quantity,
      unitPrice: product.price,
      subtotal: product.price * newItem.quantity,
    };
    setForm(f => ({ ...f, items: [...f.items, item] }));
    setNewItem({ productId: "", quantity: 1 });
  };

  const removeItem = (idx: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const calc = calculateBudget(form.items, form.laborCost, form.profitMargin);

  const saveBudget = () => {
    const client = clients.find(c => c.id === form.clientId);
    const budget: Budget = {
      id: `b${Date.now()}`,
      clientId: form.clientId,
      clientName: client?.name || "",
      items: form.items,
      materialCost: calc.materialCost,
      laborCost: form.laborCost,
      totalCost: calc.totalCost,
      profitMargin: form.profitMargin,
      finalPrice: calc.finalPrice,
      status: "draft",
      createdAt: new Date().toISOString().split("T")[0],
    };
    setData(d => [budget, ...d]);
    setModal(false);
    setForm({ clientId: "", laborCost: 0, profitMargin: 0.35, items: [] });
  };

  const convertToOrder = (b: Budget) => {
    setData(d => d.map(x => x.id === b.id ? { ...x, status: "approved" as const } : x));
  };

  const columns = [
    { key: "createdAt", header: "Data", mono: true },
    { key: "clientName", header: "Cliente" },
    { key: "materialCost", header: "Materiais", mono: true, render: (b: Budget) => `R$ ${b.materialCost.toFixed(2)}` },
    { key: "laborCost", header: "Mão de Obra", mono: true, render: (b: Budget) => `R$ ${b.laborCost.toFixed(2)}` },
    { key: "profitMargin", header: "Margem", mono: true, render: (b: Budget) => `${(b.profitMargin * 100).toFixed(0)}%` },
    { key: "finalPrice", header: "Preço Final", mono: true, render: (b: Budget) => `R$ ${b.finalPrice.toFixed(2)}` },
    { key: "status", header: "Status", render: (b: Budget) => <StatusBadge status={b.status} /> },
    {
      key: "actions", header: "",
      render: (b: Budget) => b.status === "draft" || b.status === "sent" ? (
        <button
          onClick={(e) => { e.stopPropagation(); convertToOrder(b); }}
          className="px-2 py-1 text-[11px] font-bold rounded bg-success/20 text-success hover:bg-success/30 transition-colors"
        >
          APROVAR
        </button>
      ) : null,
    },
  ];

  return (
    <DashboardLayout
      title="Orçamentos"
      action={
        <button onClick={() => setModal(true)} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NOVO ORÇAMENTO
        </button>
      }
    >
      <div className="animate-fade-in">
        <DataTable columns={columns} data={data} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Novo Orçamento" width="max-w-2xl">
        <div className="space-y-6">
          <FormField label="Cliente" as="select" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={clients.map(c => ({ value: c.id, label: c.name }))} />

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-3">Itens</p>
            {form.items.length > 0 && (
              <div className="border border-border rounded mb-3 divide-y divide-border/50">
                {form.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{item.productName} × {item.quantity}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs">R$ {item.subtotal.toFixed(2)}</span>
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <FormField label="Material" as="select" value={newItem.productId} onChange={e => setNewItem({ ...newItem, productId: e.target.value })} options={products.map(p => ({ value: p.id, label: `${p.name} - R$ ${p.price.toFixed(2)}` }))} />
              </div>
              <div className="w-24">
                <FormField label="Qtd." type="number" min={1} value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })} />
              </div>
              <div className="flex items-end">
                <button onClick={addItem} className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary transition-colors text-foreground">ADICIONAR</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Mão de Obra (R$)" type="number" step="0.01" value={form.laborCost} onChange={e => setForm({ ...form, laborCost: Number(e.target.value) })} />
            <FormField label="Margem de Lucro (%)" type="number" step="1" value={form.profitMargin * 100} onChange={e => setForm({ ...form, profitMargin: Number(e.target.value) / 100 })} />
          </div>

          <div className="border border-border rounded p-4 bg-secondary/20">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Materiais</p>
                <p className="font-mono font-bold text-foreground">R$ {calc.materialCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Custo Total</p>
                <p className="font-mono font-bold text-foreground">R$ {calc.totalCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Preço Final</p>
                <p className="font-mono font-bold text-primary text-lg">R$ {calc.finalPrice.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button onClick={saveBudget} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Criar Orçamento</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default BudgetsPage;
