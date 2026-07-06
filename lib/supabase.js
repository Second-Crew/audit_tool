// Server-side Supabase REST helper shared by audit persistence and
// report-send tracking. Uses the service role key, so it must never be
// imported from client components.
export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export async function supabaseRequest(config, path, options = {}) {
  const baseUrl = config.url.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase request failed with ${response.status}`);
  }

  return data;
}
