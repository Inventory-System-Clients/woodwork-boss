import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { stockMovements as initialMovements, products, StockMovement } from "@/data/mockData";
import { INVENTORY_REFRESH_EVENT, type InventoryRefreshEventDetail } from "@/lib/inventory-events";
import { Plus, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const StockPage = () => {
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ productId: "", type: "entry" as "entry" | "exit", quantity: 0, note: "" });
  const [syncNotice, setSyncNotice] = useState("");
  const processedProductionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleInventoryRefresh = (event: Event) => {
      const detail = (event as CustomEvent<InventoryRefreshEventDetail>).detail;

      if (!detail || !detail.productionId || processedProductionIdsRef.current.has(detail.productionId)) {
        return;
      }

      processedProductionIdsRef.current.add(detail.productionId);

      const date = new Date().toISOString().split("T")[0];
      const autoMovements: StockMovement[] = detail.materials
        .filter((material) => Boolean(material.productId) && Number(material.quantity) > 0)
        .map((material, index) => ({
          id: `auto-${detail.productionId}-${index}-${Date.now()}`,
          productId: material.productId,
          productName: material.productName,
          type: "exit",
          quantity: Number(material.quantity),
          date,
          note: `Baixa automatica por aprovacao da producao ${detail.productionId}`,
        }));

      if (autoMovements.length === 0) {
        return;
      }

      setMovements((current) => [...autoMovements, ...current]);
      setSyncNotice(`Movimentacoes de saida registradas para a producao ${detail.productionId}.`);
    };

    window.addEventListener(INVENTORY_REFRESH_EVENT, handleInventoryRefresh as EventListener);

    return () => {
      window.removeEventListener(INVENTORY_REFRESH_EVENT, handleInventoryRefresh as EventListener);
    };
  }, []);

  const addMovement = () => {
    const product = products.find(p => p.id === form.productId);
    if (!product) return;
    setMovements(m => [{
      id: `sm${Date.now()}`,
      productId: form.productId,
      productName: product.name,
      type: form.type,
      quantity: form.quantity,
      date: new Date().toISOString().split("T")[0],
      note: form.note,
    }, ...m]);
    setModal(false);
    setForm({ productId: "", type: "entry", quantity: 0, note: "" });
  };

  const columns = [
    { key: "date", header: "Data", mono: true },
    { key: "productName", header: "Material" },
    { key: "type", header: "Tipo", render: (m: StockMovement) => <StatusBadge status={m.type} /> },
    { key: "quantity", header: "Qtd.", mono: true, render: (m: StockMovement) => (
      <span className="flex items-center gap-1.5">
        {m.type === "entry" ? <ArrowUpCircle className="h-3.5 w-3.5 text-success" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />}
        {m.quantity}
      </span>
    )},
    { key: "note", header: "Observação" },
  ];

  return (
    <DashboardLayout
      title="Estoque"
      subtitle="Controle de Inventário"
      action={
        <button onClick={() => setModal(true)} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NOVA MOVIMENTAÇÃO
        </button>
      }
    >
      <div className="animate-fade-in">
        {syncNotice && (
          <div className="mb-4 border border-success/30 bg-success/10 rounded px-3 py-2 text-sm text-success">
            {syncNotice}
          </div>
        )}

        <DataTable columns={columns} data={movements} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nova Movimentação de Estoque">
        <div className="space-y-4">
          <FormField label="Material" as="select" value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} options={products.map(p => ({ value: p.id, label: `${p.name} (Estoque: ${p.stock})` }))} />
          <FormField label="Tipo" as="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as "entry" | "exit" })} options={[{ value: "entry", label: "Entrada" }, { value: "exit", label: "Saída" }]} />
          <FormField label="Quantidade" type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
          <FormField label="Observação" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Motivo da movimentação" />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button onClick={addMovement} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Registrar</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default StockPage;
