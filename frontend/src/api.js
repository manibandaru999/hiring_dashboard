const API_BASE = import.meta.env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000`;

export async function apiGet(path, params = {}, signal) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'All') {
      url.searchParams.set(key, value);
    }
  });
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`API error ${response.status}: ${path}`);
  return response.json();
}
