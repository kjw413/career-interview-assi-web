-- Run the complete file in Supabase Dashboard > SQL Editor.
-- Each user's documents and project snapshots are isolated by their auth.uid().
begin;
create table if not exists public.folio_projects (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ? 'id' and data->>'id' = id),
  revision bigint not null default 1 check (revision > 0),
  pdf_path text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint own_pdf_path check (pdf_path is null or pdf_path like user_id::text || '/' || id || '/%')
);
alter table public.folio_projects enable row level security;
revoke all on public.folio_projects from anon;
grant select, insert, update, delete on public.folio_projects to authenticated;
drop policy if exists "owners_manage_projects" on public.folio_projects;
create policy "owners_manage_projects" on public.folio_projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.save_folio_project(
  project_id text, project_data jsonb, expected_revision bigint, new_pdf_path text default null
) returns setof public.folio_projects
language plpgsql security invoker set search_path = '' as $$
declare saved public.folio_projects;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if expected_revision = 0 then
    insert into public.folio_projects(user_id,id,data,revision,pdf_path)
    values(auth.uid(),project_id,project_data,1,new_pdf_path)
    on conflict(user_id,id) do nothing returning * into saved;
  else
    update public.folio_projects p set data=project_data,revision=p.revision+1,pdf_path=new_pdf_path,updated_at=now()
    where p.user_id=auth.uid() and p.id=project_id and p.revision=expected_revision returning * into saved;
  end if;
  if saved.id is null then raise exception 'FOLIO_CONFLICT'; end if;
  return next saved;
end;
$$;
revoke all on function public.save_folio_project(text,jsonb,bigint,text) from public, anon;
grant execute on function public.save_folio_project(text,jsonb,bigint,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('resumes','resumes',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "owners_manage_resumes" on storage.objects;
create policy "owners_manage_resumes" on storage.objects for all to authenticated
using (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
