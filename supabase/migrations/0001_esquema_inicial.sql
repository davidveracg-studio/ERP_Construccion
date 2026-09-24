-- VPAI — Esquema inicial (multi-empresa con RLS)
-- Ejecutar una vez en Supabase → SQL Editor. Es idempotente: se puede volver a correr.
--
-- Modelo: cada empresa (tenant) tiene miembros con un rol R01…R05.
-- Las entidades del dominio se guardan como documentos JSONB en una tabla por colección,
-- con empresa_id y obra_id como columnas para RLS, filtros y realtime.

create extension if not exists pgcrypto;

-- ───────────────────────── Empresas y miembros ─────────────────────────
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  config jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.miembros (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null check (rol in ('R01','R02','R03','R04','R05')),
  nombre text not null default '',
  email text,
  creado_en timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
alter table public.miembros add column if not exists email text;
create index if not exists miembros_user_idx on public.miembros(user_id);

create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  rol text not null check (rol in ('R01','R02','R03','R04','R05')),
  nombre text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, email)
);

-- Funciones auxiliares para RLS (security definer evita recursión en miembros)
create or replace function public.es_miembro(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where empresa_id = e and user_id = auth.uid())
$$;

create or replace function public.rol_en(e uuid) returns text
language sql stable security definer set search_path = public as $$
  select rol from miembros where empresa_id = e and user_id = auth.uid()
$$;

-- Crea una empresa y deja al usuario actual como Gerencia (R01)
create or replace function public.crear_empresa(p_nombre text, p_rut text, p_nombre_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into empresas(nombre, rut) values (p_nombre, p_rut) returning id into e;
  insert into miembros(empresa_id, user_id, rol, nombre, email) values (e, auth.uid(), 'R01', coalesce(p_nombre_usuario, ''), auth.jwt() ->> 'email');
  return e;
end $$;

-- Convierte las invitaciones pendientes al email del usuario en membresías
create or replace function public.aceptar_invitaciones()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  insert into miembros(empresa_id, user_id, rol, nombre, email)
    select i.empresa_id, auth.uid(), i.rol, i.nombre, auth.jwt() ->> 'email' from invitaciones i
    where lower(i.email) = lower(auth.jwt() ->> 'email')
  on conflict (empresa_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from invitaciones where lower(email) = lower(auth.jwt() ->> 'email');
  return n;
end $$;

alter table public.empresas enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;

drop policy if exists empresas_leer on public.empresas;
create policy empresas_leer on public.empresas for select using (es_miembro(id));
drop policy if exists empresas_editar on public.empresas;
create policy empresas_editar on public.empresas for update using (rol_en(id) in ('R01','R05'));

drop policy if exists miembros_leer on public.miembros;
create policy miembros_leer on public.miembros for select using (es_miembro(empresa_id));
drop policy if exists miembros_admin on public.miembros;
create policy miembros_admin on public.miembros for all using (rol_en(empresa_id) = 'R01') with check (rol_en(empresa_id) = 'R01');

drop policy if exists invitaciones_admin on public.invitaciones;
create policy invitaciones_admin on public.invitaciones for all using (rol_en(empresa_id) = 'R01') with check (rol_en(empresa_id) = 'R01');

-- ───────────────────────── Colecciones del dominio ─────────────────────────
create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['obras','partidas','programas','cuadrillas','rdos','costos','compromisos',
                           'reglas_mapeo','ajustes','periodos','alertas'] loop
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
    $f$, t);

    -- Los períodos cerrados son inmutables (10 §30): solo insertar; borrar solo Gerencia (reinicio de demo)
    if t = 'periodos' then
      execute format($f$
        drop policy if exists %1$s_editar on public.%1$I;
        drop policy if exists %1$s_borrar on public.%1$I;
        create policy %1$s_borrar on public.%1$I for delete using (rol_en(empresa_id) = 'R01');
      $f$, t);
    else
      execute format($f$
        drop policy if exists %1$s_editar on public.%1$I;
        create policy %1$s_editar on public.%1$I for update using (es_miembro(empresa_id)) with check (es_miembro(empresa_id));
        drop policy if exists %1$s_borrar on public.%1$I;
        create policy %1$s_borrar on public.%1$I for delete using (es_miembro(empresa_id));
      $f$, t);
    end if;

    -- Realtime: los cambios de otros usuarios llegan en vivo
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- La configuración de la empresa (umbrales) también se comparte en vivo
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'empresas') then
    alter publication supabase_realtime add table public.empresas;
  end if;
end $$;

grant execute on function public.crear_empresa(text, text, text) to authenticated;
grant execute on function public.aceptar_invitaciones() to authenticated;
