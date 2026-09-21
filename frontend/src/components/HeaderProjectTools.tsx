import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateOnly, listProjects, type ProjectListItem } from "@/services/projects";

const iconButtonClass =
  "inline-flex p-2 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground relative";

const useProjects = () =>
  useQuery({ queryKey: ["header-projects"], queryFn: listProjects, staleTime: 30_000, refetchOnWindowFocus: true });

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const todayLocal = () => new Date().toLocaleDateString("en-CA");

/** Projects still running whose deadline (YYYY-MM-DD) is before today. */
export const getOverdueProjects = (projects: ProjectListItem[]) => {
  const today = todayLocal();

  return projects
    .filter((project) => project.status === "Em andamento" && project.deadline && project.deadline < today)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
};

const daysLate = (deadline: string) => {
  const diff = Math.floor((new Date(`${todayLocal()}T00:00:00`).getTime() - new Date(`${deadline}T00:00:00`).getTime()) / 86_400_000);
  return Math.max(1, diff);
};

/** Header search by project or client name (admin only). */
export function HeaderSearch() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const query = normalize(term.trim());
  const results = query
    ? projects.filter((project) => normalize(`${project.name} ${project.clientName}`).includes(query)).slice(0, 8)
    : [];

  const openProject = (project: ProjectListItem) => {
    setOpen(false);
    setTerm("");
    navigate(`/projects/${project.id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={iconButtonClass} aria-label="Buscar projetos">
          <Search className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-2">
        <input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por projeto ou cliente..."
          className="w-full px-3 py-2 bg-secondary/50 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {isLoading && <p className="px-2 py-3 text-xs text-muted-foreground">Carregando...</p>}
          {!isLoading && query && results.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum projeto encontrado.</p>
          )}
          {results.map((project) => (
            <button
              key={project.id}
              onClick={() => openProject(project)}
              className="w-full text-left px-2 py-2 rounded hover:bg-secondary transition-colors"
            >
              <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {project.clientName} · {project.status}
              </p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Header bell: projects in progress with an overdue deadline (admin only). */
export function HeaderAlerts() {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const [open, setOpen] = useState(false);
  const overdue = getOverdueProjects(projects);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={iconButtonClass} aria-label={`Alertas de prazo vencido (${overdue.length})`}>
          <Bell className="h-4 w-4" />
          {overdue.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-4 text-center">
              {overdue.length > 9 ? "9+" : overdue.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-2">
        <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Projetos com prazo vencido
        </p>
        <div className="max-h-80 overflow-y-auto">
          {overdue.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum projeto com prazo vencido.</p>
          ) : (
            overdue.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/projects/${project.id}`);
                }}
                className="w-full text-left px-2 py-2 rounded hover:bg-secondary transition-colors"
              >
                <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground truncate">{project.clientName}</p>
                <p className="text-xs text-destructive">
                  Venceu em {formatDateOnly(project.deadline)} · {daysLate(project.deadline as string)} dia(s) de atraso
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
