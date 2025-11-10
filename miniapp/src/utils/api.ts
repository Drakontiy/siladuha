const resolveApiBase = (): string => {
  const envBase = (process.env.MINIAPP_API_BASE ?? '').trim();

  let runtimeBase: string | undefined;
  if (typeof window !== 'undefined') {
    const globalAny = window as unknown as Record<string, unknown>;
    const candidate =
      globalAny.__MAX_API_BASE__ ??
      globalAny.MAX_API_BASE ??
      (globalAny.MAX as Record<string, unknown> | undefined)?.apiBase ??
      (globalAny.MAX_APP as Record<string, unknown> | undefined)?.apiBase;
    if (typeof candidate === 'string') {
      runtimeBase = candidate;
    }
  }

  const fallbackBase =
    typeof window !== 'undefined'
      ? `${window.location.origin}`.replace(/\/+$/, '')
      : '';

  const base = envBase || runtimeBase || fallbackBase;
  return base.replace(/\/+$/, '');
};

export const getApiBaseUrl = (): string => resolveApiBase();

export const buildApiUrl = (path: string): string => {
  const base = resolveApiBase();
  if (!path.startsWith('/')) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
};


