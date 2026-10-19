-- M008 · v2 · comercial, postventa y auditoría (tablas)
-- Crea de una vez las tablas de los módulos de la v2: clientes, leads (oportunidades), visitas técnicas
-- y propuestas (a nivel de empresa: obra_id nulo hasta la adjudicación), solicitudes de postventa y
-- auditorías mensuales. Misma estructura genérica, RLS por membresía y realtime que 0001 y 0005–0007.
-- Además amplía los roles admitidos en miembros e invitaciones con R06 (estudios / comercial).
-- Idempotente: se puede ejecutar más de una vez.

do $$
declare t text;
begin
  foreach t in array array['clientes','leads','visitas_tecnicas','propuestas','solicitudes_postventa','auditorias'] loop
    execute format($f$
      create table if not exists public.%1$I (
        empresa_id uuid not null references public.empresas(id) on delete cascade,
        id text not null,
        obra_id text,
        data jsonb not null,
        actualizado_en timestamptz not null default now(),
        actualizado_por uuid default auth.uid(),
        primary key (empresa_id, id)
      );
      create index if not exists %1$s_obra_idx on public.%1$I(empresa_id, obra_id);
      alter table public.%1$I enable row level security;
      alter table public.%1$I replica identity full;
      drop trigger if exists %1$s_tocar on public.%1$I;
      create trigger %1$s_tocar before insert or update on public.%1$I
        for each row execute function public.tocar_actualizado();
      drop policy if exists %1$s_leer on public.%1$I;
      create policy %1$s_leer on public.%1$I for select using (es_miembro(empresa_id));
      drop policy if exists %1$s_insertar on public.%1$I;
      create policy %1$s_insertar on public.%1$I for insert with check (es_miembro(empresa_id));
      drop policy if exists %1$s_editar on public.%1$I;
      create policy %1$s_editar on public.%1$I for update using (es_miembro(empresa_id)) with check (es_miembro(empresa_id));
      drop policy if exists %1$s_borrar on public.%1$I;
      create policy %1$s_borrar on public.%1$I for delete using (es_miembro(empresa_id));
    $f$, t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Roles de la v2
alter table public.miembros drop constraint if exists miembros_rol_check;
alter table public.miembros add constraint miembros_rol_check
  check (rol in ('R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11'));
alter table public.invitaciones drop constraint if exists invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check
  check (rol in ('R01','R02','R03','R04','R05','R06','R07','R08','R09','R10','R11'));
