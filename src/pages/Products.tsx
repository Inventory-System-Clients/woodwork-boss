import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { FormField } from "@/components/FormField";
import { products as initialProducts, Product } from "@/data/mockData";
import { Plus, Pencil, Trash2 } from "lucide-react";

const emptyProduct: Omit<Product, "id"> = { name: "", category: "", unit: "unit", price: 0, stock: 0, minStock: 0, supplier: "" };
const categories = ["MDF", "Solid Wood", "Laminate", "Hardware", "Accessories", "Adhesives", "Other"];
const units = ["sheet", "meter", "unit", "pair", "roll", "bucket", "kg", "liter"];

const ProductsPage = () => {
  const [data, setData] = useState<Product[]>(initialProducts);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);

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
    { key: "category", header: "Category" },
    { key: "unit", header: "Unit" },
    { key: "price", header: "Price (R$)", mono: true, render: (p: Product) => `R$ ${p.price.toFixed(2)}` },
    { key: "stock", header: "Stock", mono: true },
    { key: "minStock", header: "Min", mono: true },
    { key: "supplier", header: "Supplier" },
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
      title="Products"
      subtitle="Materials & Hardware"
      action={
        <button onClick={openNew} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> NEW PRODUCT
        </button>
      }
    >
      <div className="animate-fade-in">
        <DataTable
          columns={columns}
          data={data}
          rowHighlight={(p: Product) => p.stock <= p.minStock ? "border-l-2 border-l-primary" : ""}
        />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Product" : "New Product"}>
        <div className="space-y-4">
          <FormField label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Material name" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category" as="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={categories.map(c => ({ value: c, label: c }))} />
            <FormField label="Unit" as="select" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} options={units.map(u => ({ value: u, label: u }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Price (R$)" type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
            <FormField label="Stock" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
            <FormField label="Min Stock" type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} />
          </div>
          <FormField label="Supplier" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(false)} className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancel</button>
            <button onClick={save} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">Save</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProductsPage;
