export type AppLanguage = "pt-BR" | "it-IT";

const IT_TRANSLATIONS: Record<string, string> = {
  "Painel": "Dashboard",
  "Visão Geral": "Panoramica",
  "Visao Geral": "Panoramica",
  "Clientes": "Clienti",
  "Funcionários": "Dipendenti",
  "Funcionarios": "Dipendenti",
  "Equipes": "Squadre",
  "Estoque": "Magazzino",
  "Movimentação de Estoque": "Movimentazione di Magazzino",
  "Movimentacao de Estoque": "Movimentazione di Magazzino",
  "Orçamentos": "Preventivi",
  "Orcamentos": "Preventivi",
  "Produção": "Produzione",
  "Producao": "Produzione",
  "Logística": "Logistica",
  "Logistica": "Logistica",
  "Entregas e Instalação": "Consegne e Installazione",
  "Entregas e Instalacao": "Consegne e Installazione",
  "Resumo de Produções Ativas": "Riepilogo Produzioni Attive",
  "Resumo de Producoes Ativas": "Riepilogo Produzioni Attive",
  "Total de Orçamentos": "Totale Preventivi",
  "Total de Orcamentos": "Totale Preventivi",
  "Produção Ativa": "Produzione Attiva",
  "Producao Ativa": "Produzione Attiva",
  "Sair": "Esci",
  "Selecione...": "Seleziona...",
  "Sem dados. Clique para adicionar o primeiro item.": "Nessun dato. Clicca per aggiungere il primo elemento.",
  "Rascunho": "Bozza",
  "Pendente": "In attesa",
  "Pre-aprovado": "Pre-approvato",
  "Enviado": "Inviato",
  "Aprovado": "Approvato",
  "Rejeitado": "Rifiutato",
  "Corte": "Taglio",
  "Montagem": "Montaggio",
  "Acabamento": "Finitura",
  "Controle": "Controllo",
  "Entregue": "Consegnato",
  "Entrada": "Entrata",
  "Saída": "Uscita",
  "Saida": "Uscita",
  "Filtrar por categoria": "Filtra per categoria",
  "Categoria": "Categoria",
  "Descrição": "Descrizione",
  "Descricao": "Descrizione",
  "Status": "Stato",
  "Data": "Data",
  "Cliente": "Cliente",
  "Entrega": "Consegna",
  "Preço Final": "Prezzo finale",
  "Preco Final": "Prezzo finale",
  "Acesso negado": "Accesso negato",
  "Carregando": "Caricamento",
  "TENTAR NOVAMENTE": "RIPROVA",
  "Cancelar": "Annulla",
  "Fechar": "Chiudi",
  "Salvar Alterações": "Salva modifiche",
  "Salvar Alteracoes": "Salva modifiche",
  "Novo Orçamento": "Nuovo preventivo",
  "Novo Orcamento": "Nuovo preventivo",
  "Marcenaria v1.0": "Falegnameria v1.0",
};

const REPLACEMENT_ENTRIES: Array<[string, string]> = [
  ["Carregando", "Caricamento"],
  ["Visão Geral", "Panoramica"],
  ["Visao Geral", "Panoramica"],
  ["Entregas e Instalação", "Consegne e Installazione"],
  ["Entregas e Instalacao", "Consegne e Installazione"],
  ["administrativo", "amministrativo"],
  ["Aprovado", "Approvato"],
  ["Aprovar", "Approvare"],
  ["Rejeitado", "Rifiutato"],
  ["Descrição", "Descrizione"],
  ["descricao", "descrizione"],
  ["Descrição", "Descrizione"],
  ["Observações", "Osservazioni"],
  ["Observacoes", "Osservazioni"],
  ["Produção", "Produzione"],
  ["Producao", "Produzione"],
  ["Orçamento", "Preventivo"],
  ["Orcamento", "Preventivo"],
  ["Orçamentos", "Preventivi"],
  ["Orcamentos", "Preventivi"],
  ["Clientes", "Clienti"],
  ["Funcionários", "Dipendenti"],
  ["Funcionarios", "Dipendenti"],
  ["Equipes", "Squadre"],
  ["Estoque", "Magazzino"],
  ["Logística", "Logistica"],
  ["Logistica", "Logistica"],
  ["Salvar", "Salvare"],
  ["Fechar", "Chiudi"],
  ["Cancelar", "Annulla"],
  ["Buscar", "Cercare"],
  ["Nome", "Nome"],
  ["Valor", "Valore"],
  ["Data", "Data"],
  ["Status", "Stato"],
  ["Pendente", "In attesa"],
  ["Rascunho", "Bozza"],
  ["Entrada", "Entrata"],
  ["Saída", "Uscita"],
  ["Saida", "Uscita"],
  ["Cliente", "Cliente"],
  ["Categoria", "Categoria"],
  ["Preço", "Prezzo"],
  ["Preco", "Prezzo"],
  ["Custo", "Costo"],
  ["Custos", "Costi"],
  ["Entrega", "Consegna"],
  ["Sair", "Esci"],
];

export const translateText = (value: string, language: AppLanguage) => {
  if (language !== "it-IT") {
    return value;
  }

  const exact = IT_TRANSLATIONS[value];
  if (exact) {
    return exact;
  }

  let translated = value;
  REPLACEMENT_ENTRIES.forEach(([from, to]) => {
    translated = translated.split(from).join(to);
  });

  return translated;
};

const PT_EXACT_TRANSLATIONS: Record<string, string> = Object.entries(IT_TRANSLATIONS).reduce(
  (acc, [pt, it]) => {
    if (!acc[it]) {
      acc[it] = pt;
    }
    return acc;
  },
  {} as Record<string, string>,
);

const REVERSE_REPLACEMENT_ENTRIES: Array<[string, string]> = REPLACEMENT_ENTRIES.map(
  ([from, to]) => [to, from],
);

export const reverseTranslateText = (value: string) => {
  const exact = PT_EXACT_TRANSLATIONS[value];
  if (exact) {
    return exact;
  }

  let translated = value;
  REVERSE_REPLACEMENT_ENTRIES.forEach(([from, to]) => {
    translated = translated.split(from).join(to);
  });

  return translated;
};
