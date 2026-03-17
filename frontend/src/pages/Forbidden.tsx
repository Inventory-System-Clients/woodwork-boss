import { Link } from "react-router-dom";

const ForbiddenPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg border border-border rounded-lg bg-card p-8 text-center">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Erro 403</p>
        <h1 className="text-2xl font-bold text-foreground mb-3">Acesso Negado</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Você não tem permissão para acessar este módulo.
        </p>

        <div className="flex justify-center gap-3">
          <Link
            to="/production"
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            Ir para Produção
          </Link>
          <Link
            to="/"
            className="px-4 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors text-muted-foreground"
          >
            Voltar ao Painel
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForbiddenPage;
