export function isPublishableKey(key: string): boolean {
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) return true;
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) return false;
  try {
    const body = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body)).role === 'anon';
  } catch {
    return false;
  }
}
