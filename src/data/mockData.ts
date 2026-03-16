export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  minStock: number;
  supplier: string;
}

export interface BudgetItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Budget {
  id: string;
  clientId: string;
  clientName: string;
  items: BudgetItem[];
  materialCost: number;
  laborCost: number;
  totalCost: number;
  profitMargin: number;
  finalPrice: number;
  status: "draft" | "sent" | "approved" | "rejected";
  createdAt: string;
}

export interface Order {
  id: string;
  budgetId: string;
  clientName: string;
  productionStatus: "cutting" | "assembly" | "finishing" | "quality_check" | "delivered";
  deliveryDate: string;
  installationTeam: string;
  description: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: "entry" | "exit";
  quantity: number;
  date: string;
  note: string;
}

export const clients: Client[] = [
  { id: "c1", name: "Carlos Mendes", phone: "(11) 99887-6655", email: "carlos@email.com", address: "Rua Augusta, 1200 - SP", notes: "Cliente preferencial" },
  { id: "c2", name: "Ana Ferreira", phone: "(11) 98765-4321", email: "ana@email.com", address: "Av. Paulista, 800 - SP", notes: "Projeto de cozinha nova" },
  { id: "c3", name: "Roberto Lima", phone: "(21) 99876-5432", email: "roberto@email.com", address: "Rua Copacabana, 350 - RJ", notes: "Móveis para escritório" },
  { id: "c4", name: "Lucia Santos", phone: "(11) 97654-3210", email: "lucia@email.com", address: "Rua Oscar Freire, 500 - SP", notes: "Armários de quarto" },
  { id: "c5", name: "Pedro Oliveira", phone: "(31) 98765-1234", email: "pedro@email.com", address: "Av. Afonso Pena, 1000 - BH", notes: "" },
];

export const products: Product[] = [
  { id: "p1", name: "MDF 15mm Branco", category: "MDF", unit: "chapa", price: 89.90, stock: 45, minStock: 20, supplier: "Duratex" },
  { id: "p2", name: "MDF 18mm Cru", category: "MDF", unit: "chapa", price: 72.50, stock: 12, minStock: 15, supplier: "Eucatex" },
  { id: "p3", name: "Pinus 3x3cm", category: "Madeira Maciça", unit: "metro", price: 18.00, stock: 120, minStock: 50, supplier: "Madepar" },
  { id: "p4", name: "Fita de Borda Branca", category: "Acessórios", unit: "rolo", price: 25.00, stock: 8, minStock: 10, supplier: "Rehau" },
  { id: "p5", name: "Dobradiça Blum 35mm", category: "Ferragens", unit: "unidade", price: 12.50, stock: 200, minStock: 50, supplier: "Blum" },
  { id: "p6", name: "Corrediça 400mm", category: "Ferragens", unit: "par", price: 45.00, stock: 30, minStock: 20, supplier: "Hafele" },
  { id: "p7", name: "Laminado Carvalho", category: "Laminado", unit: "chapa", price: 135.00, stock: 5, minStock: 10, supplier: "Formica" },
  { id: "p8", name: "Cola PVA 5kg", category: "Adesivos", unit: "balde", price: 42.00, stock: 18, minStock: 5, supplier: "Cascola" },
];

export const budgets: Budget[] = [
  {
    id: "b1", clientId: "c1", clientName: "Carlos Mendes",
    items: [
      { productId: "p1", productName: "MDF 15mm Branco", quantity: 8, unitPrice: 89.90, subtotal: 719.20 },
      { productId: "p5", productName: "Dobradiça Blum 35mm", quantity: 12, unitPrice: 12.50, subtotal: 150.00 },
    ],
    materialCost: 869.20, laborCost: 1500, totalCost: 2369.20, profitMargin: 0.35, finalPrice: 3198.42,
    status: "approved", createdAt: "2026-03-10",
  },
  {
    id: "b2", clientId: "c2", clientName: "Ana Ferreira",
    items: [
      { productId: "p1", productName: "MDF 15mm Branco", quantity: 15, unitPrice: 89.90, subtotal: 1348.50 },
      { productId: "p6", productName: "Corrediça 400mm", quantity: 6, unitPrice: 45.00, subtotal: 270.00 },
      { productId: "p5", productName: "Dobradiça Blum 35mm", quantity: 20, unitPrice: 12.50, subtotal: 250.00 },
    ],
    materialCost: 1868.50, laborCost: 3200, totalCost: 5068.50, profitMargin: 0.30, finalPrice: 6589.05,
    status: "sent", createdAt: "2026-03-12",
  },
  {
    id: "b3", clientId: "c3", clientName: "Roberto Lima",
    items: [
      { productId: "p7", productName: "Laminado Carvalho", quantity: 4, unitPrice: 135.00, subtotal: 540.00 },
    ],
    materialCost: 540.00, laborCost: 800, totalCost: 1340.00, profitMargin: 0.40, finalPrice: 1876.00,
    status: "draft", createdAt: "2026-03-14",
  },
];

export const orders: Order[] = [
  { id: "o1", budgetId: "b1", clientName: "Carlos Mendes", productionStatus: "assembly", deliveryDate: "2026-03-25", installationTeam: "Equipe Alpha", description: "Armários de cozinha - 4 aéreos, 3 balcão" },
  { id: "o2", budgetId: "b2", clientName: "Ana Ferreira", productionStatus: "cutting", deliveryDate: "2026-04-05", installationTeam: "Equipe Beta", description: "Reforma completa de cozinha" },
];

export const stockMovements: StockMovement[] = [
  { id: "sm1", productId: "p1", productName: "MDF 15mm Branco", type: "entry", quantity: 20, date: "2026-03-08", note: "Reposição mensal" },
  { id: "sm2", productId: "p1", productName: "MDF 15mm Branco", type: "exit", quantity: 8, date: "2026-03-10", note: "Orçamento B1 - Carlos Mendes" },
  { id: "sm3", productId: "p5", productName: "Dobradiça Blum 35mm", type: "entry", quantity: 100, date: "2026-03-05", note: "Compra em atacado" },
  { id: "sm4", productId: "p2", productName: "MDF 18mm Cru", type: "exit", quantity: 5, date: "2026-03-11", note: "Uso na oficina" },
  { id: "sm5", productId: "p7", productName: "Laminado Carvalho", type: "exit", quantity: 3, date: "2026-03-13", note: "Amostra orçamento B3" },
];

// Services
export const calculateBudget = (items: BudgetItem[], laborCost: number, margin: number) => {
  const materialCost = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalCost = materialCost + laborCost;
  const finalPrice = totalCost * (1 + margin);
  return { materialCost, totalCost, finalPrice };
};

export const getLowStockProducts = (prods: Product[]) =>
  prods.filter(p => p.stock <= p.minStock);

export const getMonthlyRevenue = (bdgs: Budget[]) =>
  bdgs.filter(b => b.status === "approved").reduce((sum, b) => sum + b.finalPrice, 0);
