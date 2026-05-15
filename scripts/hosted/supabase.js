const FILE_KIND_BUCKETS = {
  leads: 'leads',
  crm: 'crm',
  'final-list': 'final-list',
  'fb-page-id-reports': 'fb-page-id-reports',
  'map-gap': 'map-gap',
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function supabaseHeaders(extra = {}) {
  const token = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

function supabaseUrl(path) {
  return `${requiredEnv('SUPABASE_URL').replace(/\/+$/, '')}${path}`;
}

async function rest(resource, options = {}) {
  const response = await fetch(supabaseUrl(`/rest/v1/${resource}`), {
    method: options.method || 'GET',
    headers: supabaseHeaders(options.headers),
    body: options.body,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST failed (${response.status})`);
  }
  return data;
}

async function getJob(jobId) {
  const rows = await rest(`jobs?select=*&id=eq.${encodeURIComponent(jobId)}`);
  if (!rows[0]) throw new Error(`Job not found: ${jobId}`);
  return rows[0];
}

async function updateJob(jobId, patch) {
  const rows = await rest(`jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  return rows[0];
}

async function appendProgress(jobId, message, progressStep = '') {
  const job = await getJob(jobId);
  const currentLog = Array.isArray(job.progress_log) ? job.progress_log : [];
  const nextLog = currentLog.concat(String(message || ''));
  const updated = await updateJob(jobId, {
    progress_log: nextLog,
    ...(progressStep ? { progress_step: progressStep } : {}),
  });
  return updated;
}

async function isCancellationRequested(jobId) {
  const job = await getJob(jobId);
  return job.status === 'cancel_requested';
}

function kindToBucket(kind) {
  const bucket = FILE_KIND_BUCKETS[kind];
  if (!bucket) throw new Error(`Unsupported file kind: ${kind}`);
  return bucket;
}

function safeName(name) {
  const base = String(name || '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .trim();
  const normalized = base || 'file';
  return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
}

function countRecords(data) {
  if (Array.isArray(data)) return data.length;
  if (data && Array.isArray(data.leads)) return data.leads.length;
  return 0;
}

async function findFileById(fileId) {
  const rows = await rest(`files?select=*&id=eq.${encodeURIComponent(fileId)}`);
  return rows[0] || null;
}

async function findFileByName(userId, kind, name) {
  const rows = await rest(
    `files?select=*&user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}&name=eq.${encodeURIComponent(name)}`
  );
  return rows[0] || null;
}

async function uploadFile(bucket, storagePath, data) {
  const body = JSON.stringify(data, null, 2);
  const response = await fetch(supabaseUrl(`/storage/v1/object/${bucket}/${storagePath}`), {
    method: 'POST',
    headers: supabaseHeaders({
      'content-type': 'application/json',
      'x-upsert': 'true',
    }),
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase storage upload failed (${response.status})`);
  return { sizeBytes: new TextEncoder().encode(body).byteLength };
}

async function downloadFile(file) {
  const response = await fetch(supabaseUrl(`/storage/v1/object/${kindToBucket(file.kind)}/${file.storage_path}`), {
    headers: supabaseHeaders(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase storage download failed (${response.status})`);
  return JSON.parse(text || 'null');
}

async function saveFileForUser(userId, kind, name, data, sourceJobId = null) {
  const normalizedName = safeName(name);
  const existing = await findFileByName(userId, kind, normalizedName);
  const storagePath = existing?.storage_path || `${userId}/${Date.now()}-${normalizedName}`;
  const upload = await uploadFile(kindToBucket(kind), storagePath, data);

  const payload = {
    user_id: userId,
    kind,
    name: normalizedName,
    storage_path: storagePath,
    record_count: countRecords(data),
    size_bytes: upload.sizeBytes,
    source_job_id: sourceJobId,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const rows = await rest(`files?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    return rows[0];
  }

  const rows = await rest('files', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function removeFileRecord(fileId) {
  await rest(`files?id=eq.${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

module.exports = {
  appendProgress,
  downloadFile,
  findFileById,
  getJob,
  isCancellationRequested,
  kindToBucket,
  removeFileRecord,
  rest,
  safeName,
  saveFileForUser,
  updateJob,
};
