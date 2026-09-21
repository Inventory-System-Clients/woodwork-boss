import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { listProjects, type ProjectListItem } from "@/services/projects";
import {
  DayWorkHours,
  formatMinutes,
  getMyWorkHours,
  OTHER_ACTIVITY_SUGGESTIONS,
  saveMyWorkHours,
  type WorkHoursEntryInput,
} from "@/services/workHours";

interface Row {
  key: string;
  /** projectId for project rows, free text for activity rows. */
  ref: string;
  hours: string;
  minutes: string;
}

const inputClass =
  "block w-full rounded border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

// Limit for the whole day, summing every project and activity.
const MAX_DAY_MINUTES = 8 * 60;

let keyCounter = 0;
const nextKey = () => `row-${(keyCounter += 1)}`;

const emptyRow = (ref = ""): Row => ({ key: nextKey(), ref, hours: "", minutes: "" });

const rowFromMinutes = (ref: string, total: number): Row => ({
  key: nextKey(),
  ref,
  hours: total >= 60 ? String(Math.floor(total / 60)) : "",
  minutes: total % 60 > 0 ? String(total % 60) : "",
});

const rowMinutes = (row: Row) => Math.round(Number(row.hours || 0) * 60 + Number(row.minutes || 0));

const isRowValid = (row: Row) => {
  const hours = Number(row.hours || 0);
  const minutes = Number(row.minutes || 0);
  return Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && minutes >= 0 && minutes <= 59;
};

const formatToday = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`);

  if (!date || Number.isNaN(parsed.getTime())) {
    return "Hoje";
  }

  return parsed.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
};

interface TimeInputsProps {
  row: Row;
  onChange: (next: Row) => void;
}

const TimeInputs = ({ row, onChange }: TimeInputsProps) => (
  <div className="flex items-end gap-2">
    <label className="text-xs text-muted-foreground w-20">
      Horas
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={24}
        value={row.hours}
        onChange={(event) => onChange({ ...row, hours: event.target.value })}
        placeholder="0"
        className={`${inputClass} mt-1`}
      />
    </label>
    <label className="text-xs text-muted-foreground w-20">
      Min
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        step={5}
        value={row.minutes}
        onChange={(event) => onChange({ ...row, minutes: event.target.value })}
        placeholder="0"
        className={`${inputClass} mt-1`}
      />
    </label>
  </div>
);

const WorkHoursPage = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [day, setDay] = useState<DayWorkHours | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [projectRows, setProjectRows] = useState<Row[]>([emptyRow()]);
  const [activityRows, setActivityRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const applyDay = (next: DayWorkHours) => {
    setDay(next);

    // Rows always mirror the saved day, so switching days never shows the other day's values.
    const savedProjects = next.entries.filter((entry) => entry.productionId);
    const savedActivities = next.entries.filter((entry) => !entry.productionId && entry.activity);

    setProjectRows(
      savedProjects.length > 0
        ? savedProjects.map((entry) => rowFromMinutes(entry.productionId as string, entry.minutes))
        : [emptyRow()],
    );
    setActivityRows(savedActivities.map((entry) => rowFromMinutes(entry.activity as string, entry.minutes)));
  };

  const load = async () => {
    setIsLoading(true);
    setError("");

    try {
      const [list, dayHours] = await Promise.all([listProjects(), getMyWorkHours(selectedDate)]);
      setProjects(list);
      applyDay(dayHours);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar suas horas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [selectedDate]);

  // Active projects, plus projects already logged that have since been finished (kept so the line stays visible).
  const projectOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const project of projects) {
      options.set(project.id, `${project.clientName} - ${project.name}`);
    }

    for (const entry of day?.entries ?? []) {
      if (entry.productionId && !options.has(entry.productionId)) {
        options.set(entry.productionId, entry.productionLabel || "Projeto encerrado");
      }
    }

    return [...options.entries()].map(([id, label]) => ({ id, label }));
  }, [projects, day]);

  const totalMinutes = [...projectRows, ...activityRows].reduce(
    (sum, row) => sum + (isRowValid(row) ? rowMinutes(row) : 0),
    0,
  );

  const updateRow = (setter: typeof setProjectRows) => (next: Row) =>
    setter((current) => current.map((row) => (row.key === next.key ? next : row)));

  const removeRow = (setter: typeof setProjectRows, key: string) =>
    setter((current) => current.filter((row) => row.key !== key));

  const save = async () => {
    const allRows = [...projectRows, ...activityRows];

    if (allRows.some((row) => !isRowValid(row))) {
      toast({
        variant: "destructive",
        title: "Valor inválido",
        description: "Informe horas e minutos válidos (minutos de 0 a 59).",
      });
      return;
    }

    if (totalMinutes > MAX_DAY_MINUTES) {
      toast({
        variant: "destructive",
        title: "O total do dia não pode passar de 8h.",
        description: "Some todos os projetos e atividades lançados no dia.",
      });
      return;
    }

    const entries: WorkHoursEntryInput[] = [
      ...projectRows
        .filter((row) => row.ref && rowMinutes(row) > 0)
        .map((row) => ({ projectId: row.ref, minutes: rowMinutes(row) })),
      ...activityRows
        .filter((row) => row.ref.trim() && rowMinutes(row) > 0)
        .map((row) => ({ activity: row.ref.trim(), minutes: rowMinutes(row) })),
    ];

    setIsSaving(true);

    try {
      applyDay(await saveMyWorkHours(entries, day?.date));
      toast({ title: "Horas salvas" });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: saveError instanceof Error ? saveError.message : "Falha ao salvar horas.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const usedSuggestions = new Set(activityRows.map((row) => row.ref.trim().toLowerCase()));

  return (
    <DashboardLayout title="Bater ponto" subtitle={formatToday(day?.date ?? "")}>
      <div className="animate-fade-in space-y-4 max-w-2xl">
        {error && (
          <div className="border border-destructive/40 bg-destructive/10 rounded px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => void load()}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/30 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded border border-border overflow-hidden text-sm font-bold">
            {[
              { label: "HOJE", date: day?.today },
              { label: "ONTEM", date: day?.yesterday },
            ].map((option) => {
              const isActive = Boolean(option.date) && day?.date === option.date;

              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={isLoading || !option.date}
                  onClick={() => setSelectedDate(option.label === "HOJE" ? undefined : option.date)}
                  className={`px-5 py-2 transition-colors disabled:opacity-60 ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Funcionário: <span className="text-foreground font-medium">{user?.name}</span>
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>}

        <section className="border border-border rounded bg-card p-4 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Projetos</h2>

          {projectRows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
                Projeto
                <select
                  value={row.ref}
                  onChange={(event) => updateRow(setProjectRows)({ ...row, ref: event.target.value })}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Selecione...</option>
                  {projectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <TimeInputs row={row} onChange={updateRow(setProjectRows)} />
              <button
                type="button"
                onClick={() => removeRow(setProjectRows, row.key)}
                className="p-2.5 rounded border border-border text-muted-foreground hover:text-destructive hover:bg-secondary"
                aria-label="Remover linha"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {!isLoading && projectOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum projeto em andamento no momento.</p>
          )}

          <button
            type="button"
            onClick={() => setProjectRows((current) => [...current, emptyRow()])}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-border hover:bg-secondary transition-colors"
          >
            <Plus className="h-4 w-4" /> Adicionar outro projeto
          </button>
        </section>

        <section className="border border-border rounded bg-card p-4 space-y-3">
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
            Outra atividade (fora de projeto)
          </h2>

          {activityRows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
                Descrição
                <input
                  value={row.ref}
                  maxLength={160}
                  onChange={(event) => updateRow(setActivityRows)({ ...row, ref: event.target.value })}
                  placeholder="Ex.: Limpeza"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <TimeInputs row={row} onChange={updateRow(setActivityRows)} />
              <button
                type="button"
                onClick={() => removeRow(setActivityRows, row.key)}
                className="p-2.5 rounded border border-border text-muted-foreground hover:text-destructive hover:bg-secondary"
                aria-label="Remover linha"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {OTHER_ACTIVITY_SUGGESTIONS.filter((item) => !usedSuggestions.has(item.toLowerCase())).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActivityRows((current) => [...current, emptyRow(item === "Outro" ? "" : item)])}
                className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                + {item}
              </button>
            ))}
          </div>
        </section>

        <div className="border border-border rounded bg-card px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {day?.date && day.date === day.yesterday ? "Total de ontem" : "Total do dia"}
          </span>
          <span
            className={`font-mono text-lg font-bold ${totalMinutes > MAX_DAY_MINUTES ? "text-destructive" : "text-primary"}`}
          >
            {formatMinutes(totalMinutes)} / {formatMinutes(MAX_DAY_MINUTES)}
          </span>
        </div>

        <button
          onClick={() => void save()}
          disabled={isSaving || isLoading || totalMinutes > MAX_DAY_MINUTES}
          className="w-full sm:w-auto px-6 py-3 text-sm rounded bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </DashboardLayout>
  );
};

export default WorkHoursPage;
