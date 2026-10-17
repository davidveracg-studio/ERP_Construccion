-- M005 · v1.1 · oficina técnica y contrato (tablas y bucket de documentos)
-- Crea de una vez las tablas de los módulos de la v1.1: órdenes de cambio, obligaciones,
-- garantías, recepciones, riesgos, documentos (planos y EETT), RFI, submittals, folios del
-- libro de obra y tareas semanales (Last Planner). Misma estructura genérica, RLS por membresía
-- y realtime que las tablas de 0001. Además, el bucket privado de documentos de obra.
-- Idempotente: se puede ejecutar más de una vez.

do $$
declare t text;
begin
  foreach t in array array['ordenes_cambio','obligaciones','garantias','recepciones','riesgos',
                           'documentos','rfis','submittals','folios','tareas_semanales'] loop
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

-- Bucket privado para planos, EETT y respaldos. Ruta: <empresa_id>/<obra_id>/<archivo>
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos-obra', 'documentos-obra', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- public.empresa_de_ruta() viene de 0003
drop policy if exists documentos_obra_leer on storage.objects;
create policy documentos_obra_leer on storage.objects for select to authenticated
  using (bucket_id = 'documentos-obra' and public.es_miembro(public.empresa_de_ruta(name)));

drop policy if exists documentos_obra_subir on storage.objects;
create policy documentos_obra_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-obra' and public.es_miembro(public.empresa_de_ruta(name)));

drop policy if exists documentos_obra_borrar on storage.objects;
create policy documentos_obra_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-obra' and public.es_miembro(public.empresa_de_ruta(name)));
