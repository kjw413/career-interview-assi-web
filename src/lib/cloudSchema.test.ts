import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function save(id: string, revision = 0, value = 'first') {
  return db.query<{ revision: number }>('select * from public.save_folio_project($1,$2::jsonb,$3,null)', [id, JSON.stringify({ id, company: value }), revision]);
}

beforeAll(async () => {
  db = new PGlite();
  // Supabase-managed schemas are represented here; the application migration is unmodified.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${first}'),('${second}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth, storage to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id serial primary key,bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant usage on sequence storage.objects_id_seq to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
  `);
  await db.exec(readFileSync('supabase/migrations/202610270001_folio_cloud.sql', 'utf8'));
}, 30_000);
afterAll(async () => { await db?.close(); });

describe('cloud database permissions and optimistic concurrency', () => {
  it('applies idempotently and keeps the PDF bucket private with its size limit', async () => {
    await db.exec(readFileSync('supabase/migrations/202610270001_folio_cloud.sql', 'utf8'));
    const { rows } = await db.query<{ public: boolean; file_size_limit: number }>("select public,file_size_limit from storage.buckets where id='resumes'");
    expect(rows[0].public).toBe(false);
    expect(Number(rows[0].file_size_limit)).toBe(20 * 1024 * 1024);
  });
  it('creates and updates an owned project and rejects stale updates atomically', async () => {
    await login(first);
    expect(Number((await save('project-1')).rows[0].revision)).toBe(1);
    expect(Number((await save('project-1', 1, 'updated')).rows[0].revision)).toBe(2);
    await expect(save('project-1', 1, 'stale')).rejects.toThrow('FOLIO_CONFLICT');
    const { rows } = await db.query<{ data: { company: string } }>("select data from public.folio_projects where id='project-1'");
    expect(rows[0].data.company).toBe('updated');
  });
  it('isolates two users even if they use the same project ID', async () => {
    await login(second);
    expect((await db.query('select * from public.folio_projects')).rows).toHaveLength(0);
    await save('project-1', 0, 'second user');
    const { rows } = await db.query<{ data: { company: string } }>('select data from public.folio_projects');
    expect(rows).toHaveLength(1); expect(rows[0].data.company).toBe('second user');
    await expect(db.query('insert into public.folio_projects(user_id,id,data) values($1,$2,$3::jsonb)', [first, 'stolen', '{"id":"stolen"}'])).rejects.toThrow('row-level security');
    expect((await db.query('delete from public.folio_projects where user_id=$1 returning id', [first])).rows).toHaveLength(0);
  });
  it('protects PDF objects by user folder for reads, writes and deletes', async () => {
    await login(first);
    await db.query("insert into storage.objects(bucket_id,name) values('resumes',$1)", [`${first}/project-1/document.pdf`]);
    await login(second);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await expect(db.query("insert into storage.objects(bucket_id,name) values('resumes',$1)", [`${first}/project-1/bad.pdf`])).rejects.toThrow('row-level security');
    expect((await db.query('delete from storage.objects returning id')).rows).toHaveLength(0);
    await db.query("insert into storage.objects(bucket_id,name) values('resumes',$1)", [`${second}/project-1/mine.pdf`]);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
  });
  it('rejects cross-owner PDF paths and unauthenticated reads and writes', async () => {
    await login(first);
    await expect(db.query('select * from public.save_folio_project($1,$2::jsonb,0,$3)', ['bad-path', '{"id":"bad-path"}', `${second}/bad-path/document.pdf`])).rejects.toThrow('own_pdf_path');
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec('set role anon');
    await expect(db.query('select * from public.folio_projects')).rejects.toThrow('permission denied');
    await expect(save('anonymous')).rejects.toThrow('permission denied');
  });
});
