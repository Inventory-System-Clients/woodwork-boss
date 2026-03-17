import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { products as initialProducts, Product } from "@/data/mockData";
import { INVENTORY_REFRESH_EVENT, type InventoryRefreshEventDetail } from "@/lib/inventory-events";
import { Plus, Pencil, Trash2 } from "lucide-react";

const emptyProduct: Omit<Product, "id"> = { name: "", category: "", unit: "unidade", price: 0, stock: 0, minStock: 0, supplier: "" };
const categories = ["MDF", "Madeira Maciça", "Laminado", "Ferragens", "Acessórios", "Adesivos", "Outros"];
const units = ["chapa", "metro", "unidade", "par", "rolo", "balde", "kg", "litro"];

const ProductsPage = () => {
  const [data, setData] = useState<Product[]>(initialProducts);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [syncNotice, setSyncNotice] = useState("");
  const processedProductionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleInventoryRefresh = (event: Event) => {
      const detail = (event as CustomEvent<InventoryRefreshEventDetail>).detail;

      if (!detail || !detail.productionId || processedProductionIdsRef.current.has(detail.productionId)) {
        return;
      }

      processedProductionIdsRef.current.add(detail.productionId);

      const quantityByProduct = detail.materials.reduce<Record<string, number>>((acc, material) => {
        if (!material.productId) {
          return acc;
        }

        const quantity = Number(material.quantity);

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return acc;
        }

        acc[material.productId] = (acc[material.productId] || 0) + quantity;
        return acc;
      }, {});

      setData((current) =>
        current.map((product) => {
          const consumed = quantityByProduct[product.id] || 0;

          if (consumed <= 0) {
            return product;
          }

          return {
            ...product,
            stock: Math.max(0, product.stock - consumed),
          };
        }),
      );

      setSyncNotice(`Estoque atualizado apos aprovacao da producao ${detail.productionId}.`);
    };

    window.addEventListener(INVENTORY_REFRESH_EVENT, handleInventoryRefresh as EventListener);

    return () => {
      window.removeEventListener(INVENTORY_REFRESH_EVENT, handleInventoryRefresh as EventListener);
    };
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyProduct); setModal(true); };
  const openEdit = (p: Product) => { setEditing(p); setForm(p); setModal(true); };
  const save = () => {
    if (editing) {
      setData(d => d.map(p => p.id === editing.id ? { ...p, ...form } : p));
    } else {
      setData(d => [...d, { ...form, id: `p${Date.now()}` }]);
    }
    setModal(false);
  };
  const remove = (id: string) => setData(d => d.filter(p => p.id !== id));

  const columns = [
    { key: "name", header: "Material" },
    { key: "category", header: "Categoria" },
    { key: "unit", header: "Unidade" },
    { key: "price", header: "Preço (R$)", mono: true, render: (p: Product) => `R$ ${p.price.toFixed(2)}` },
    { key: "stock", header: "Estoque", mono: true },
    { key: "minStock", header: "Mín.", mono: true },
    { key: "supplier", header: "Fornecedor" },
    {
      key: "actions", header: "",
      render: (p: Product) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Produtos"
      subtitle="Materiais e Ferragens"
      action={
        <button onClick={openNew} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NOVO PRODUTO
        </button>
      }
    >
      <div className="animate-fade-in">
        {syncNotice && (
          <div className="mb-4 border border-success/30 bg-success/10 rounded px-3 py-2 text-sm text-success">
            {syncNotice}
          </div>
        )}

        <DataTable
          columns={columns}
          data={data}
          rowHighlight={(p: Product) => p.stock <= p.minStock ? "border-l-2 border-l-primary" : ""}
        />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Editar Produto" : "Novo Produto"}>
        <div className="space-y-4">
          <FormField label="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome do material" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Categoria" as="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={categories.map(c => ({ value: c, label: c }))} />
            <FormField label="Unidade" as="select" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} options={units.map(u => ({ value: u, label: u }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Preço (R$)" type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
            <FormField label="Estoque" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
            <FormField label="Estoque Mín." type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} />
          </div>
          <FormField label="Fornecedor" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Nome do fornecedor" />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancelar</button>
            <button onClick={save} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Salvar</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProductsPage;
