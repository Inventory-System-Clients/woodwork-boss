import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { FormField } from "@/components/FormField";
import { toast } from "@/components/ui/use-toast";
import { Client, listClients } from "@/services/clients";
import { Product, createProduct, listProducts } from "@/services/products";
import {
  EmployeeProduction,
  ProductionCostReport,
  setProductionMaterials,
  updateProduction,
} from "@/services/productions";

interface MaterialRow {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

interface ProductionEditPanelProps {
  order: EmployeeProduction;
  report: ProductionCostReport;
  teams: { id: string; name: string }[];
  /** Called with the fresh production after any successful save. */
  onUpdated: (production: EmployeeProduction) => void | Promise<void>;
}

const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toDateInput = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : "");

const toRows = (order: EmployeeProduction): MaterialRow[] =>
  order.materials.map((material) => ({
    productId: material.productId || undefined,
    productName: material.productName,
    quantity: Number(material.quantity) || 0,
    unit: material.unit || "unidade",
    unitPrice: Number(material.unitPrice) || 0,
  }));

const cellInput =
  "w-full px-2 py-1.5 bg-secondary/50 border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/** Everything about a production that can still change after it was created. */
export function ProductionEditPanel({ order, report, teams, onUpdated }: ProductionEditPanelProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [details, setDetails] = useState({
    clientName: order.clientName,
    description: order.description,
    deliveryDate: toDateInput(order.deliveryDate),
    installationTeamId: order.installationTeamId || "",
    initialCost: String(order.initialCost ?? 0),
    profitPercent: String(report.profitPercent),
    commissionPercent: String(report.commissionPercent),
  });
  const [materials, setMaterials] = useState<MaterialRow[]>(() => toRows(order));
  const [pickedProductId, setPickedProductId] = useState("");
  const [newMaterialName, setNewMaterialName] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingMaterials, setIsSavingMaterials] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listClients().then(setClients).catch(() => setClients([]));
    void listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const clientOptions = clients.map((client) => client.name);

  if (details.clientName && !clientOptions.includes(details.clientName)) {
    clientOptions.unshift(details.clientName);
  }

  const notifyError = (title: string, cause: unknown) => {
    const message = cause instanceof Error ? cause.message : "Tente novamente.";
    setError(`${title}: ${message}`);
    toast({ variant: "destructive", title, description: message });
  };

  const saveDetails = async () => {
    const initialCost = Number(details.initialCost || 0);
    const profitPercent = Number(details.profitPercent || 0);
    const commissionPercent = Number(details.commissionPercent || 0);

    if (!details.clientName.trim() || !details.description.trim()) {
      setError("Informe cliente e descrição.");
      return;
    }

    if (
      ![initialCost, profitPercent, commissionPercent].every(Number.isFinite) ||
      initialCost < 0 ||
      profitPercent < 0 ||
      profitPercent > 100 ||
      commissionPercent < 0 ||
      commissionPercent > 100
    ) {
      setError("Valores inválidos: percentuais vão de 0 a 100 e o custo inicial não pode ser negativo.");
      return;
    }

    setIsSavingDetails(true);
    setError("");

    try {
      const updated = await updateProduction(order.id, {
        clientName: details.clientName.trim(),
        description: details.description.trim(),
        deliveryDate: details.deliveryDate ? new Date(`${details.deliveryDate}T00:00:00`).toISOString() : null,
        installationTeamId: details.installationTeamId || undefined,
        initialCost,
        profitPercent,
        commissionPercent,
      });

      toast({ title: "Dados da produção salvos" });
      await onUpdated(updated);
    } catch (cause) {
      notifyError("Não foi possível salvar os dados", cause);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const updateMaterial = (index: number, patch: Partial<MaterialRow>) =>
    setMaterials((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addCatalogMaterial = () => {
    const product = products.find((item) => item.id === pickedProductId);

    if (!product) {
      return;
    }

    setMaterials((current) => [
      ...current,
      { productId: product.id, productName: product.name, quantity: 1, unit: "unidade", unitPrice: 0 },
    ]);
    setPickedProductId("");
  };

  const addNewMaterial = async () => {
    const name = newMaterialName.trim();

    if (!name) {
      return;
    }

    try {
      const created = await createProduct({ name, supplier: null });
      setProducts((current) => [created, ...current]);
      setMaterials((current) => [
        ...current,
        { productId: created.id, productName: created.name, quantity: 1, unit: "unidade", unitPrice: 0 },
      ]);
      setNewMaterialName("");
    } catch (cause) {
      notifyError("Não foi possível cadastrar o material", cause);
    }
  };

  const saveMaterials = async () => {
    if (materials.some((row) => !row.productName.trim() || !(row.quantity > 0) || !row.unit.trim() || row.unitPrice < 0)) {
      setError("Cada material precisa de nome, quantidade maior que zero, unidade e preço válido.");
      return;
    }

    setIsSavingMaterials(true);
    setError("");

    try {
      const updated = await setProductionMaterials(
        order.id,
        materials.map((row) => ({
          productId: row.productId,
          productName: row.productName.trim(),
          quantity: row.quantity,
          unit: row.unit.trim(),
          unitPrice: row.unitPrice,
        })),
      );

      toast({ title: "Materiais salvos" });
      await onUpdated(updated);
    } catch (cause) {
      notifyError("Não foi possível salvar os materiais", cause);
    } finally {
      setIsSavingMaterials(false);
    }
  };

  const materialsTotal = materials.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="border border-border rounded p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Dados da produção</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField
            label="Cliente"
            as="select"
            value={details.clientName}
            onChange={(e) => setDetails((current) => ({ ...current, clientName: e.target.value }))}
            options={clientOptions.map((name) => ({ value: name, label: name }))}
          />
          <FormField
            label="Prazo de Entrega"
            type="date"
            value={details.deliveryDate}
            onChange={(e) => setDetails((current) => ({ ...current, deliveryDate: e.target.value }))}
          />
          <FormField
            label="Descrição do Projeto"
            as="textarea"
            value={details.description}
            onChange={(e) => setDetails((current) => ({ ...current, description: e.target.value }))}
          />
          <div className="space-y-3">
            <FormField
              label="Equipe"
              as="select"
              value={details.installationTeamId}
              onChange={(e) => setDetails((current) => ({ ...current, installationTeamId: e.target.value }))}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
            />
            <FormField
              label="Custo Inicial (R$)"
              type="number"
              min={0}
              step="0.01"
              value={details.initialCost}
              onChange={(e) => setDetails((current) => ({ ...current, initialCost: e.target.value }))}
            />
          </div>
          <FormField
            label="Lucro (%) sobre o total gasto"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={details.profitPercent}
            onChange={(e) => setDetails((current) => ({ ...current, profitPercent: e.target.value }))}
          />
          <FormField
            label="Comissão de funcionário (%) sobre o lucro"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={details.commissionPercent}
            onChange={(e) => setDetails((current) => ({ ...current, commissionPercent: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Preço de venda</p>
            <p className="font-mono font-bold">{formatCurrency(report.salePrice)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lucro</p>
            <p className="font-mono font-bold">{formatCurrency(report.profitValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Comissão</p>
            <p className="font-mono font-bold">{formatCurrency(report.commissionValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lucro líquido</p>
            <p className="font-mono font-bold text-primary">{formatCurrency(report.netProfit)}</p>
          </div>
        </div>

        <button
          onClick={() => void saveDetails()}
          disabled={isSavingDetails}
          className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSavingDetails ? "SALVANDO..." : "SALVAR DADOS"}
        </button>
      </div>

      <div className="border border-border rounded p-3 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Materiais</p>
          <span className="font-mono text-xs">{formatCurrency(materialsTotal)}</span>
        </div>

        {materials.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum material. Adicione abaixo e salve.</p>
        ) : (
          <div className="space-y-2">
            {materials.map((row, index) => (
              <div key={`${row.productId ?? row.productName}-${index}`} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className={`${cellInput} col-span-12 md:col-span-4`}
                  value={row.productName}
                  onChange={(e) => updateMaterial(index, { productName: e.target.value })}
                  aria-label="Material"
                />
                <input
                  className={`${cellInput} col-span-4 md:col-span-2`}
                  type="number"
                  min={0}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateMaterial(index, { quantity: Number(e.target.value) })}
                  aria-label="Quantidade"
                />
                <input
                  className={`${cellInput} col-span-4 md:col-span-2`}
                  value={row.unit}
                  onChange={(e) => updateMaterial(index, { unit: e.target.value })}
                  aria-label="Unidade"
                />
                <input
                  className={`${cellInput} col-span-3 md:col-span-3`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unitPrice}
                  onChange={(e) => updateMaterial(index, { unitPrice: Number(e.target.value) })}
                  aria-label="Preço unitário"
                />
                <button
                  type="button"
                  onClick={() => setMaterials((current) => current.filter((_, i) => i !== index))}
                  className="col-span-1 text-muted-foreground hover:text-destructive justify-self-center"
                  aria-label="Remover material"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormField
                label="Adicionar material cadastrado"
                as="select"
                value={pickedProductId}
                onChange={(e) => setPickedProductId(e.target.value)}
                options={products.map((product) => ({
                  value: product.id,
                  label: product.supplier ? `${product.name} (${product.supplier})` : product.name,
                }))}
              />
            </div>
            <button
              onClick={addCatalogMaterial}
              disabled={!pickedProductId}
              className="px-3 py-2 text-xs font-bold rounded border border-border hover:bg-secondary disabled:opacity-60"
            >
              ADICIONAR
            </button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormField
                label="Ou cadastrar material novo"
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                placeholder="Nome do material"
              />
            </div>
            <button
              onClick={() => void addNewMaterial()}
              disabled={!newMaterialName.trim()}
              className="px-3 py-2 text-xs font-bold rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              CADASTRAR
            </button>
          </div>
        </div>

        <button
          onClick={() => void saveMaterials()}
          disabled={isSavingMaterials}
          className="px-3 py-2 text-xs font-bold rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isSavingMaterials ? "SALVANDO..." : "SALVAR MATERIAIS"}
        </button>
      </div>
    </div>
  );
}
