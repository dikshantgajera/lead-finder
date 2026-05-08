(function () {
  const cfg = window.__LEADFINDER_CONFIG__ || {};
  const hosted = cfg.mode === 'hosted';
  let client = null;
  const listeners = new Set();

  function ensureClient() {
    if (!hosted) return null;
    if (client) return client;
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('Hosted mode is enabled, but Supabase is not configured.');
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    client.auth.onAuthStateChange((_event, session) => {
      for (const listener of listeners) listener(session);
    });
    return client;
  }

  async function getSession() {
    if (!hosted) return null;
    const supabase = ensureClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || '';
  }

  async function request(path, options = {}) {
    if (!hosted) throw new Error('Hosted API is unavailable in local mode.');
    if (!cfg.apiBaseUrl) throw new Error('Hosted API base URL is not configured.');

    const token = await getAccessToken();
    if (!token) throw new Error('Sign in to use the hosted workspace.');

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${cfg.apiBaseUrl.replace(/\/+$/, '')}${path}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    let data = {};
    if (raw && contentType.toLowerCase().includes('application/json')) {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error(`Hosted API returned invalid JSON: ${error.message}`);
      }
    }

    if (!response.ok) {
      throw new Error(data.error || raw || `Hosted request failed with ${response.status}`);
    }

    return data;
  }

  function normalizeKind(kind) {
    if (kind === 'emails') return 'fb-page-id-reports';
    return kind;
  }

  const api = {
    isHosted() {
      return hosted;
    },
    config() {
      return { ...cfg };
    },
    async init() {
      if (!hosted) return { mode: 'local', session: null };
      ensureClient();
      return { mode: 'hosted', session: await getSession() };
    },
    async getSession() {
      return getSession();
    },
    async signInWithEmail(email) {
      const supabase = ensureClient();
      const redirectTo = window.location.href.split('#')[0];
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      return true;
    },
    async signOut() {
      if (!hosted) return;
      const supabase = ensureClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onAuthChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async listFiles(kind) {
      return request(`/api/files?kind=${encodeURIComponent(normalizeKind(kind))}`);
    },
    async readFileById(id) {
      return request(`/api/files/${encodeURIComponent(id)}`);
    },
    async saveFile(kind, name, data, extras = {}) {
      return request('/api/files', {
        method: 'POST',
        body: JSON.stringify({
          kind: normalizeKind(kind),
          name,
          data,
          ...extras,
        }),
      });
    },
    async updateFile(id, data, extras = {}) {
      return request(`/api/files/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data,
          ...extras,
        }),
      });
    },
    async deleteFile(id) {
      return request(`/api/files/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    async importFile(kind, file) {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Import file must contain valid JSON.');
      }
      return api.saveFile(kind, file.name, data, { source: 'import' });
    },
    async startJob(type, payload) {
      return request(`/api/jobs/${encodeURIComponent(type)}`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      });
    },
    async getJob(id) {
      return request(`/api/jobs/${encodeURIComponent(id)}`);
    },
    async cancelJob(id) {
      return request(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });
    },
    async pollJob(id, options = {}) {
      const intervalMs = options.intervalMs || 4000;
      for (;;) {
        const job = await api.getJob(id);
        if (typeof options.onUpdate === 'function') options.onUpdate(job);
        if (['completed', 'failed', 'cancel_requested', 'cancelled'].includes(job.status)) return job;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    },
  };

  window.LeadFinderHosted = api;
})();
