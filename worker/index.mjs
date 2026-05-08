const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const JOB_WORKFLOWS = {
  search: 'search.yml',
  enrich: 'enrich.yml',
  'fb-page-ids': 'fb-page-ids.yml',
  'find-ads': 'find-ads.yml',
};

const FILE_KIND_BUCKETS = {
  leads: 'leads',
  crm: 'crm',
  'final-list': 'final-list',
  'fb-page-id-reports': 'fb-page-id-reports',
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request) },
  });
}

function safeName(name) {
  const base = String(name || '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .trim();
  const normalized = base || 'file';
  return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
}

function kindToBucket(kind) {
  const bucket = FILE_KIND_BUCKETS[kind];
  if (!bucket) throw new Error(`Unsupported file kind: ${kind}`);
  return bucket;
}

function countRecords(data) {
  if (Array.isArray(data)) return data.length;
  if (data && Array.isArray(data.leads)) return data.leads.length;
  return 0;
}

function bytesOf(text) {
  return new TextEncoder().encode(text).byteLength;
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function verifyUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new Response(JSON.stringify({ error: 'Missing bearer token.' }), { status: 401, headers: JSON_HEADERS });

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    throw new Response(JSON.stringify({ error: 'Invalid Supabase session.' }), { status: 401, headers: JSON_HEADERS });
  }
  return data;
}

async function rest(env, resource, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${resource}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...options.headers,
  };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST failed (${response.status})`);
  }
  return data;
}

async function uploadJson(env, bucket, storagePath, data) {
  const body = JSON.stringify(data, null, 2);
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'x-upsert': 'true',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Storage upload failed (${response.status})`);
  }
  return { sizeBytes: bytesOf(body) };
}

async function downloadJson(env, bucket, storagePath) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Storage download failed (${response.status})`);
  }
  return JSON.parse(text || 'null');
}

async function deleteObject(env, bucket, storagePath) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(text || `Storage delete failed (${response.status})`);
  }
}

async function findFileById(env, userId, fileId) {
  const rows = await rest(env, `files?select=*&id=eq.${encodeURIComponent(fileId)}&user_id=eq.${encodeURIComponent(userId)}`);
  return rows[0] || null;
}

async function findFileByName(env, userId, kind, name) {
  const rows = await rest(
    env,
    `files?select=*&user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}&name=eq.${encodeURIComponent(name)}`
  );
  return rows[0] || null;
}

async function saveFile(env, userId, kind, name, data, extras = {}) {
  const bucket = kindToBucket(kind);
  const normalizedName = safeName(name);
  const existing = await findFileByName(env, userId, kind, normalizedName);
  const storagePath = existing?.storage_path || `${userId}/${Date.now()}-${normalizedName}`;
  const upload = await uploadJson(env, bucket, storagePath, data);

  const row = {
    user_id: userId,
    kind,
    name: normalizedName,
    storage_path: storagePath,
    record_count: countRecords(data),
    size_bytes: upload.sizeBytes,
    source_job_id: extras.source_job_id || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const updated = await rest(
      env,
      `files?id=eq.${encodeURIComponent(existing.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
      }
    );
    return updated[0];
  }

  const inserted = await rest(env, 'files', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  return inserted[0];
}

async function dispatchWorkflow(env, workflowName, jobId) {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${workflowName}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'leadfinder-worker',
        'X-GitHub-Api-Version': '2022-11-28',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ref: env.GITHUB_REF || 'main',
        inputs: { job_id: jobId },
      }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `GitHub dispatch failed (${response.status})`);
  }
}

async function createJob(request, env, user, type) {
  const workflow = JOB_WORKFLOWS[type];
  if (!workflow) return json(request, { error: `Unsupported job type: ${type}` }, 404);

  const payload = await readJsonBody(request);
  const inserted = await rest(env, 'jobs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: user.id,
      type,
      status: 'queued',
      input_json: payload,
      progress_step: 'Queued',
      progress_log: [],
    }),
  });

  const job = inserted[0];
  try {
    await dispatchWorkflow(env, workflow, job.id);
    return json(request, job, 202);
  } catch (error) {
    await rest(env, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'failed',
        error_message: error.message,
        finished_at: new Date().toISOString(),
      }),
    });
    return json(request, { error: error.message }, 500);
  }
}

async function handleListFiles(request, env, user, url) {
  const kind = url.searchParams.get('kind');
  if (!kind) return json(request, { error: 'Missing file kind.' }, 400);
  const files = await rest(
    env,
    `files?select=*&user_id=eq.${encodeURIComponent(user.id)}&kind=eq.${encodeURIComponent(kind)}&order=created_at.desc`
  );
  return json(request, files);
}

async function handleCreateFile(request, env, user) {
  const body = await readJsonBody(request);
  if (!body.kind || !body.name) return json(request, { error: 'Missing file kind or name.' }, 400);
  const file = await saveFile(env, user.id, body.kind, body.name, body.data, {
    source_job_id: body.source_job_id,
  });
  return json(request, file, 201);
}

async function handleGetFile(request, env, user, fileId) {
  const file = await findFileById(env, user.id, fileId);
  if (!file) return json(request, { error: 'File not found.' }, 404);
  const data = await downloadJson(env, kindToBucket(file.kind), file.storage_path);
  return json(request, { file, data });
}

async function handlePatchFile(request, env, user, fileId) {
  const current = await findFileById(env, user.id, fileId);
  if (!current) return json(request, { error: 'File not found.' }, 404);
  const body = await readJsonBody(request);
  const updated = await saveFile(env, user.id, current.kind, body.name || current.name, body.data, {
    source_job_id: current.source_job_id,
  });
  return json(request, updated);
}

async function handleDeleteFile(request, env, user, fileId) {
  const current = await findFileById(env, user.id, fileId);
  if (!current) return json(request, { error: 'File not found.' }, 404);
  await deleteObject(env, kindToBucket(current.kind), current.storage_path);
  await rest(
    env,
    `files?id=eq.${encodeURIComponent(fileId)}&user_id=eq.${encodeURIComponent(user.id)}`,
    { method: 'DELETE' }
  );
  return json(request, { success: true });
}

async function handleGetJob(request, env, user, jobId) {
  const rows = await rest(
    env,
    `jobs?select=*&id=eq.${encodeURIComponent(jobId)}&user_id=eq.${encodeURIComponent(user.id)}`
  );
  const job = rows[0];
  if (!job) return json(request, { error: 'Job not found.' }, 404);
  return json(request, job);
}

async function handleCancelJob(request, env, user, jobId) {
  const rows = await rest(
    env,
    `jobs?select=*&id=eq.${encodeURIComponent(jobId)}&user_id=eq.${encodeURIComponent(user.id)}`
  );
  const job = rows[0];
  if (!job) return json(request, { error: 'Job not found.' }, 404);
  await rest(env, `jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status: 'cancel_requested',
      progress_step: 'Cancellation requested',
    }),
  });
  return json(request, { success: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health') return json(request, { status: 'ok', timestamp: new Date().toISOString() });
      if (url.pathname === '/') {
        return json(request, {
          status: 'ok',
          service: 'leadfinder-worker',
          message: 'Worker is running. API routes require a signed-in Supabase session.',
          health: '/api/health',
        });
      }

      const user = await verifyUser(request, env);

      if (request.method === 'POST' && url.pathname === '/api/jobs/search') return createJob(request, env, user, 'search');
      if (request.method === 'POST' && url.pathname === '/api/jobs/enrich') return createJob(request, env, user, 'enrich');
      if (request.method === 'POST' && url.pathname === '/api/jobs/fb-page-ids') return createJob(request, env, user, 'fb-page-ids');
      if (request.method === 'POST' && url.pathname === '/api/jobs/find-ads') return createJob(request, env, user, 'find-ads');

      if (request.method === 'GET' && url.pathname === '/api/files') return handleListFiles(request, env, user, url);
      if (request.method === 'POST' && url.pathname === '/api/files') return handleCreateFile(request, env, user);
      if (request.method === 'POST' && url.pathname === '/api/files/import') return handleCreateFile(request, env, user);

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(cancel))?$/);
      if (jobMatch) {
        const [, jobId, action] = jobMatch;
        if (request.method === 'GET' && !action) return handleGetJob(request, env, user, jobId);
        if (request.method === 'POST' && action === 'cancel') return handleCancelJob(request, env, user, jobId);
      }

      const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
      if (fileMatch) {
        const [, fileId] = fileMatch;
        if (request.method === 'GET') return handleGetFile(request, env, user, fileId);
        if (request.method === 'PATCH') return handlePatchFile(request, env, user, fileId);
        if (request.method === 'DELETE') return handleDeleteFile(request, env, user, fileId);
      }

      return json(request, { error: 'Not found.' }, 404);
    } catch (error) {
      if (error instanceof Response) {
        const responseText = await error.text();
        return new Response(responseText, {
          status: error.status,
          headers: { ...JSON_HEADERS, ...corsHeaders(request) },
        });
      }
      return json(request, { error: error.message || 'Internal error.' }, 500);
    }
  },
};
