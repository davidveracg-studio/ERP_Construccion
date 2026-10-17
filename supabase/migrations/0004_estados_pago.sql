-- M004 · fase3 · estados de pago (flujo de caja)
-- Tabla de estados de pago (EP) al mandante para el módulo de caja. Misma estructura, RLS por
-- membresía y realtime que las tablas de 0001. Idempotente: se puede ejecutar más de una vez.

create table if not exists public.estados_pago (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  id text not null,
  obra_id text,
  data jsonb not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (empresa_id, id)
);
create index if not exists estados_pago_obra_idx on public.estados_pago(empresa_id, obra_id);
alter table public.estados_pago enable row level security;
alter table public.estados_pago replica identity full;

drop trigger if exists estados_pago_tocar on public.estados_pago;
create trigger estados_pago_tocar before insert or update on public.estados_pago
  for each row execute function public.tocar_actualizado();

drop policy if exists estados_pago_leer on public.estados_pago;
create policy estados_pago_leer on public.estados_pago for select using (es_miembro(empresa_id));
drop policy if exists estados_pago_insertar on public.estados_pago;
create policy estados_pago_insertar on public.estados_pago for insert with check (es_miembro(empresa_id));
drop policy if exists estados_pago_editar on public.estados_pago;
create policy estados_pago_editar on public.estados_pago for update using (es_miembro(empresa_id)) with check (es_miembro(empresa_id));
drop policy if exists estados_pago_borrar on public.estados_pago;
create policy estados_pago_borrar on public.estados_pago for delete using (es_miembro(empresa_id));

-- Realtime: los cambios de otros usuarios llegan en vivo
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'estados_pago') then
    alter publication supabase_realtime add table public.estados_pago;
  end if;
end $$;
