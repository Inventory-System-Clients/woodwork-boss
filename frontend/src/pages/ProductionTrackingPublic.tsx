import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ProductionShareError,
  SharedProductionImage,
  SharedProductionSnapshot,
  getPublicProductionByToken,
} from "@/services/productions";

const POLLING_INTERVAL_MS = 30000;
const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
const apiBaseUrl = rawApiUrl
  ? (rawApiUrl.endsWith("/api") ? rawApiUrl : `${rawApiUrl}/api`)
  : "/api";

interface PublicImageCardData {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  candidateUrls: string[];
}

interface SelectedImage {
  src: string;
  fileName: string;
  createdAt: string;
}

const getSnapshotUpdatedAt = (snapshot: SharedProductionSnapshot) => {
  const parsed = new Date(snapshot.updatedAt);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date();
};

const formatDateTime = (value: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
};

const formatDate = (value: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("pt-BR");
};

const formatImageSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
};

const resolveImageUrl = (value: string) => {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    if (!rawApiUrl) {
      return normalized;
    }

    if (rawApiUrl.endsWith("/api") && normalized.startsWith("/api/")) {
      return `${rawApiUrl}${normalized.slice(4)}`;
    }

    return `${rawApiUrl}${normalized}`;
  }

  if (!rawApiUrl) {
    return normalized;
  }

  return `${rawApiUrl}/${normalized.replace(/^\/+/, "")}`;
};

const buildImageAliasUrls = (token: string, imageId: string) => {
  const encodedToken = encodeURIComponent(token.trim());
  const encodedImageId = encodeURIComponent(imageId.trim());

  if (!encodedToken || !encodedImageId) {
    return [];
  }

  return [
    `${apiBaseUrl}/public/productions/${encodedToken}/images/${encodedImageId}`,
    `${apiBaseUrl}/productions/public/${encodedToken}/images/${encodedImageId}`,
    `${apiBaseUrl}/productions/shared/${encodedToken}/images/${encodedImageId}`,
  ];
};

const buildImageCandidateUrls = (token: string, image: SharedProductionImage) => {
  const fromPayload = resolveImageUrl(image.url || "");
  const fromAliases = buildImageAliasUrls(token, image.id);

  return Array.from(new Set([fromPayload, ...fromAliases].filter(Boolean)));
};

const getPublicTrackingErrorMessage = (error: unknown) => {
  if (error instanceof ProductionShareError) {
    switch (error.status) {
      case 404:
        return "Link invalido ou expirado.";
      case 500:
        return "Erro interno ao carregar dados da producao. Tente novamente em instantes.";
      default:
        return error.message || "Nao foi possivel carregar o acompanhamento da producao.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar o acompanhamento da producao.";
};

interface PublicImageCardProps {
  image: PublicImageCardData;
  onOpen: (image: SelectedImage) => void;
}

const PublicImageCard = ({ image, onOpen }: PublicImageCardProps) => {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFailed, setIsFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setIsLoaded(false);
    setIsFailed(false);
  }, [image.id, image.candidateUrls.join("|")]);

  const activeSrc = isFailed ? "" : image.candidateUrls[candidateIndex] || "";

  const handleError = () => {
    if (candidateIndex < image.candidateUrls.length - 1) {
      setCandidateIndex((current) => current + 1);
      setIsLoaded(false);
      return;
    }

    setIsFailed(true);
  };

  return (
    <article className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="block w-full text-left"
        disabled={!activeSrc || isFailed}
        onClick={() => {
          if (!activeSrc || isFailed) {
            return;
          }

          onOpen({
            src: activeSrc,
            fileName: image.fileName,
            createdAt: image.createdAt,
          });
        }}
      >
        <div className="relative aspect-[4/3] bg-secondary/30 border-b border-border overflow-hidden">
          {!isLoaded && !isFailed && (
            <div className="absolute inset-0 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
              Carregando imagem...
            </div>
          )}

          {activeSrc && !isFailed ? (
            <img
              src={activeSrc}
              loading="lazy"
              alt={image.fileName}
              onLoad={() => setIsLoaded(true)}
              onError={handleError}
              className={`h-full w-full object-cover transition-opacity ${isLoaded ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
              Imagem indisponivel neste ambiente.
            </div>
          )}
        </div>
      </button>

      <div className="p-3 space-y-1">
        <p className="text-sm font-medium text-foreground truncate" title={image.fileName}>
          {image.fileName}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(image.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          {image.mimeType || "image/*"} - {formatImageSize(image.fileSize)}
        </p>
      </div>
    </article>
  );
};

const ProductionTrackingPublicPage = () => {
  const { token = "" } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedProductionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  const normalizedToken = useMemo(() => token.trim(), [token]);
  const publicImages = useMemo<PublicImageCardData[]>(() => {
    if (!data) {
      return [];
    }

    return data.images.map((image) => ({
      id: image.id,
      fileName: image.fileName || `imagem-${image.id}`,
      mimeType: image.mimeType || "image/*",
      fileSize: image.fileSize || 0,
      createdAt: image.createdAt || "",
      candidateUrls: buildImageCandidateUrls(normalizedToken, image),
    }));
  }, [data, normalizedToken]);

  const loadSnapshot = async ({ refresh = false, silentError = false }: { refresh?: boolean; silentError?: boolean } = {}) => {
    if (!normalizedToken) {
      setRequestError("Link invalido ou expirado.");
      setData(null);
      setIsLoading(false);
      return;
    }

    if (!silentError) {
      setRequestError("");
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const snapshot = await getPublicProductionByToken(normalizedToken);
      setData(snapshot);
      setLastUpdatedAt(getSnapshotUpdatedAt(snapshot));
      setRequestError("");
    } catch (error) {
      if (!silentError) {
        setRequestError(getPublicTrackingErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [normalizedToken]);

  useEffect(() => {
    if (!normalizedToken) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSnapshot({ refresh: true, silentError: true });
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [normalizedToken]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-secondary/20 to-background">
      <section className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <header className="mb-6 sm:mb-8 rounded-xl border border-border bg-card/80 backdrop-blur px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Acompanhamento em tempo real
              </p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold text-foreground">Status da sua producao</h1>
            </div>
            <button
              onClick={() => {
                void loadSnapshot({ refresh: true });
              }}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded border border-border bg-background text-xs font-bold text-foreground hover:bg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRefreshing ? "ATUALIZANDO..." : "ATUALIZAR"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {lastUpdatedAt
              ? `Ultima atualizacao: ${lastUpdatedAt.toLocaleString("pt-BR")}`
              : "Aguardando primeira atualizacao..."}
          </p>
        </header>

        {requestError && (
          <div className="mb-6 rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{requestError}</span>
            <button
              onClick={() => {
                void loadSnapshot();
              }}
              className="px-2 py-1 text-[11px] font-bold rounded border border-destructive/40 hover:bg-destructive/20"
            >
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        {!data && isLoading && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Carregando dados da producao...
          </div>
        )}

        {data && (
          <div className="space-y-4 sm:space-y-5">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Cliente</p>
                  <p className="text-base sm:text-lg font-semibold text-foreground">{data.clientName}</p>
                </div>
                <StatusBadge status={data.productionStatus} />
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-border bg-secondary/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Entrega prevista</p>
                  <p className="mt-1 font-medium text-foreground">{formatDate(data.deliveryDate)}</p>
                </div>
                <div className="rounded border border-border bg-secondary/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Equipe responsavel</p>
                  <p className="mt-1 font-medium text-foreground">{data.installationTeam || "A definir"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Projeto</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {data.description || "Sem descricao informada."}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Observacoes</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {data.observations || "Sem observacoes registradas ate o momento."}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Materiais utilizados</p>

              {data.materials.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum material registrado.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 text-left font-semibold">Material</th>
                        <th className="py-2 text-right font-semibold">Quantidade</th>
                        <th className="py-2 text-right font-semibold">Unidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {data.materials.map((material, index) => (
                        <tr key={`${material.productId}-${index}`}>
                          <td className="py-2 pr-2 text-foreground/90">{material.productName}</td>
                          <td className="py-2 pr-2 text-right font-mono text-foreground/80">{material.quantity}</td>
                          <td className="py-2 text-right text-foreground/80">{material.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Imagens da producao</p>
                {isRefreshing && <span className="text-xs text-muted-foreground">Atualizando...</span>}
              </div>

              {publicImages.length === 0 ? (
                <div className="mt-3 rounded border border-border bg-secondary/20 px-3 py-4 text-sm text-muted-foreground">
                  Nenhuma imagem foi adicionada a esta producao ate o momento.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {publicImages.map((image) => (
                    <PublicImageCard
                      key={image.id}
                      image={image}
                      onOpen={(selected) => {
                        setSelectedImage(selected);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 text-xs text-muted-foreground">
              Registro atualizado no sistema em {formatDateTime(data.updatedAt)}.
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Este link e atualizado automaticamente a cada 30 segundos.
        </footer>
      </section>

      {selectedImage && (
        <Modal
          open={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          title={selectedImage.fileName}
          width="max-w-5xl"
        >
          <div className="space-y-3">
            <div className="rounded border border-border bg-secondary/20 p-2 sm:p-3 max-h-[75dvh] overflow-auto">
              <img
                src={selectedImage.src}
                alt={selectedImage.fileName}
                className="mx-auto w-auto max-h-[68dvh] object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enviado em {formatDateTime(selectedImage.createdAt)}.
            </p>
          </div>
        </Modal>
      )}
    </main>
  );
};

export default ProductionTrackingPublicPage;
