import { createClient } from '@supabase/supabase-js';

type Config = { mode: 'local' } | { mode: 'invalid'; message: string } | { mode: 'cloud'; url: string; key: string };
export function readCloudConfig(env: Record<string, string | undefined>): Config {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return { mode: 'local' };
  if (!url || !key) return { mode: 'invalid', message: '클라우드 연결 설정이 아직 완료되지 않았습니다. 관리자에게 연결 설정을 확인해 달라고 요청해 주세요.' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
  } catch { return { mode: 'invalid', message: '클라우드 주소가 올바르지 않습니다.' }; }
  if (key.startsWith('sb_secret_')) return { mode: 'invalid', message: '공개용 Publishable Key로 연결해야 합니다. Secret Key를 제거해 주세요.' };
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error();
    } catch { return { mode: 'invalid', message: '공개용 Publishable Key 또는 기존 anon 키를 확인해 주세요.' }; }
  }
  return { mode: 'cloud', url, key };
}

export const cloudConfig = readCloudConfig(import.meta.env);
export const supabase = cloudConfig.mode === 'cloud' ? createClient(cloudConfig.url, cloudConfig.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;
