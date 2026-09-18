import { useEffect, useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { EmployeeProduction, listProductions } from "@/services/productions";
import { DayWorkHours, formatMinutes, getMyWorkHours, setMyWorkHours } from "@/services/workHours";

interface RowInput {
  hours: string;
  minutes: string;
}

const splitMinutes = (total: number): RowInput => ({
  hours: total > 0 ? String(Math.floor(total / 60)) : "",
  minutes: total > 0 ? String(total % 60) : "",
});

const formatToday = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`);

  if (!date || Number.isNaN(parsed.getTime())) {
    return "Hoje";
  }

  return parsed.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
};

const WorkHoursPage = () => {
  const { user } = useAuth();
  const [productions, setProductions] = useState<EmployeeProduction[]>([]);
  const [today, setToday] = useState<DayWorkHours | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const applyToday = (next: DayWorkHours) => {
    setToday(next);
    // Inputs always mirror the selected day, so switching days never shows the other day's values.
    setInputs(
      Object.fromEntries(next.entries.map((entry) => [entry.productionId, splitMinutes(entry.minutes)])),
    );
  };

  const load = async () => {
    if (!user?.id) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const [list, todayHours] = await Promise.all([
        listProductions({ employeeId: user.id, active: true }),
        getMyWorkHours(selectedDate),
      ]);

      setProductions(list);
      applyToday(todayHours);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar suas horas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id, selectedDate]);

  const save = async (productionId: string) => {
    const input = inputs[productionId] ?? { hours: "", minutes: "" };
    const hours = Number(input.hours || 0);
    const minutes = Number(input.minutes || 0);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
      toast({
        variant: "destructive",
        title: "Valor invalido",
        description: "Informe horas e minutos validos (minutos de 0 a 59).",
      });
      return;
    }

    setSavingId(productionId);

    try {
      const next = await setMyWorkHours(productionId, Math.round(hours * 60 + minutes), today?.date);
      applyToday(next);

      toast({ title: "Horas salvas" });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Nao foi possivel salvar",
        description: saveError instanceof Error ? saveError.message : "Falha ao salvar horas.",
      });
    } finally {
      setSavingId(null);
    }
  };

  const savedByProduction = new Map((today?.entries ?? []).map((entry) => [entry.productionId, entry]));
  const listedIds = new Set(productions.map((production) => production.id));
  // Hours logged today on productions that already left "in progress" stay visible, read-only.
  const finishedEntries = (today?.entries ?? []).filter((entry) => !listedIds.has(entry.productionId));

  return (
    <DashboardLayout title="Minhas horas" subtitle={formatToday(today?.date ?? "")}>
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

        <div className="inline-flex rounded border border-border overflow-hidden text-sm font-bold">
          {[
            { label: "HOJE", date: today?.today },
            { label: "ONTEM", date: today?.yesterday },
          ].map((option) => {
            const isActive = Boolean(option.date) && today?.date === option.date;

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

        <div className="border border-border rounded bg-card px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {today?.date && today.date === today.yesterday ? "Total de ontem" : "Total de hoje"}
          </span>
          <span className="font-mono text-lg font-bold text-primary">{formatMinutes(today?.totalMinutes ?? 0)}</span>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground animate-pulse">Carregando...</p>}

        {!isLoading && productions.length === 0 && finishedEntries.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            Nenhuma produção em andamento para a sua equipe.
          </p>
        )}

        {productions.map((production) => {
          const input = inputs[production.id] ?? { hours: "", minutes: "" };
          const saved = savedByProduction.get(production.id);
          const isSaving = savingId === production.id;

          return (
            <div key={production.id} className="border border-border rounded bg-card p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-foreground">{production.clientName}</p>
                <p className="text-xs text-muted-foreground">{production.description}</p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-muted-foreground">
                  Horas
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    step={1}
                    value={input.hours}
                    onChange={(e) =>
                      setInputs((current) => ({ ...current, [production.id]: { ...input, hours: e.target.value } }))
                    }
                    placeholder="0"
                    className="mt-1 block w-24 rounded border border-border bg-background px-3 py-2 text-base text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Minutos
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={5}
                    value={input.minutes}
                    onChange={(e) =>
                      setInputs((current) => ({ ...current, [production.id]: { ...input, minutes: e.target.value } }))
                    }
                    placeholder="0"
                    className="mt-1 block w-24 rounded border border-border bg-background px-3 py-2 text-base text-foreground"
                  />
                </label>
                <button
                  onClick={() => void save(production.id)}
                  disabled={isSaving || Boolean(savingId)}
                  className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>

              {saved && (
                <p className="text-xs text-success">Registrado: {formatMinutes(saved.minutes)}</p>
              )}
            </div>
          );
        })}

        {finishedEntries.map((entry) => (
          <div key={entry.id} className="border border-border rounded bg-card px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{entry.productionLabel || "Produção encerrada"}</span>
            <span className="font-mono text-sm">{formatMinutes(entry.minutes)}</span>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default WorkHoursPage;
