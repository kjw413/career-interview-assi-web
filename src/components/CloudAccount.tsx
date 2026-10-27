import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, Cloud, LoaderCircle, LockKeyhole } from 'lucide-react';
import { cloudConfig, supabase } from '../lib/supabase';
import { createCloudStore } from '../lib/cloudStore';
import type { ProjectStore } from '../lib/projectStore';
import './cloud.css';

function AccountCard({ children }: { children: ReactNode }) {
  return <main className="account-screen"><section className="account-card"><a className="account-brand" href="/">folio<span>.</span></a><div className="account-symbol"><Cloud size={27} /></div>{children}</section><p className="account-footer"><LockKeyhole size={12} />나의 경험을, 나만의 공간에.</p></main>;
}

export function CloudSetupError() {
  return <AccountCard><h1>연결 준비가 필요해요</h1><p>{cloudConfig.mode === 'invalid' ? cloudConfig.message : '클라우드 연결을 확인해 주세요.'}</p><p>기존 브라우저 자료는 삭제되지 않았습니다.</p></AccountCard>;
}

export default function CloudAccount({ children }: { children: (store: ProjectStore, email: string, signOut: () => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'password'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, value) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') setMode('password');
      setSession(value); setLoading(false);
    });
    supabase!.auth.getSession().then(({ data, error: authError }) => {
      if (!alive) return;
      setSession(data.session); setLoading(false);
      if (authError) setError('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  const store = useMemo(() => session ? createCloudStore(supabase!, session.user.id) : null, [session?.user.id]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const redirectTo = `${window.location.origin}/`;
      if (mode === 'reset') {
        const result = await supabase!.auth.resetPasswordForEmail(email, { redirectTo });
        if (result.error) throw result.error;
        setMessage('비밀번호 재설정 안내를 요청했습니다. 가입한 이메일의 수신함을 확인해 주세요.');
      } else if (mode === 'password') {
        const result = await supabase!.auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword(''); setMode('signin');
      } else if (mode === 'signup') {
        const result = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (result.error) throw result.error;
        setPassword(''); setMessage('가입 안내를 요청했습니다. 이메일의 확인 링크를 눌러 가입을 완료한 뒤 로그인해 주세요.');
      } else {
        const result = await supabase!.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        setPassword('');
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'invalid_credentials' ? '이메일 또는 비밀번호를 확인해 주세요.' : code === 'email_not_confirmed' ? '가입 확인 이메일의 링크를 먼저 눌러 주세요.' : code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' ? '요청이 많습니다. 잠시 뒤 다시 시도해 주세요.' : '요청을 완료하지 못했습니다. 연결 상태와 입력 정보를 확인해 주세요.');
    } finally { setBusy(false); }
  }
  if (loading) return <AccountCard><LoaderCircle className="spin" /><p>로그인 정보를 확인하고 있어요.</p></AccountCard>;
  if (session && store && mode !== 'password') return <>{children(store, session.user.email ?? '', async () => { const result = await supabase!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; setSession(null); })}</>;
  return <AccountCard><p className="eyebrow">YOUR STORY, EVERYWHERE</p><h1>{mode === 'signup' ? '나만의 준비 공간 만들기' : mode === 'reset' ? '비밀번호를 잊으셨나요?' : mode === 'password' ? '새 비밀번호를 입력하세요' : '어디서든, 이어서 준비하세요.'}</h1><p>{mode === 'signin' ? '같은 계정으로 로그인하면 이력서와 면접 준비를 이어갈 수 있어요.' : mode === 'signup' ? '이메일과 비밀번호로 계정을 만들어 주세요.' : '가입한 계정의 비밀번호를 변경합니다.'}</p>
    {(mode === 'signin' || mode === 'signup') && <div className="account-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setMessage(''); }}>로그인</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setMessage(''); }}>회원가입</button></div>}
    <form onSubmit={submit}>{mode !== 'password' && <><label htmlFor="account-email">이메일</label><input id="account-email" type="email" value={email} required autoComplete="email" onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></>}{mode !== 'reset' && <><label htmlFor="account-password">비밀번호</label><input id="account-password" type="password" value={password} required minLength={mode === 'signin' ? 1 : 8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signin' ? '비밀번호' : '8자 이상 입력해 주세요'} /></>}
    {error && <p role="alert" className="account-error">{error}</p>}{message && <p role="status" className="account-message">{message}</p>}
    <button className="button button-primary form-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <>{mode === 'signup' ? '계정 만들기' : mode === 'reset' ? '재설정 이메일 보내기' : mode === 'password' ? '새 비밀번호 저장' : '로그인'}<ArrowRight size={16} /></>}</button></form>
    <button className="account-reset" onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setError(''); setMessage(''); }}>{mode === 'reset' ? '로그인으로 돌아가기' : '비밀번호 재설정'}</button>
  </AccountCard>;
}
