-- M003 · fase2 · modelos IFC (Storage)
-- Bucket privado para los modelos BIM (IFC) de la simulación 4D.
-- Ruta de cada archivo: <empresa_id>/<obra_id>/<archivo>.ifc
-- Solo los miembros de la empresa pueden leer, subir y borrar sus archivos.
-- Idempotente: se puede ejecutar más de una vez.

insert into storage.buckets (id, name, public, file_size_limit)
values ('modelos-ifc', 'modelos-ifc', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Empresa dueña de un archivo según el primer segmento de la ruta (null si no es un uuid)
create or replace function public.empresa_de_ruta(ruta text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(ruta, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists modelos_ifc_leer on storage.objects;
create policy modelos_ifc_leer on storage.objects for select to authenticated
  using (bucket_id = 'modelos-ifc' and public.es_miembro(public.empresa_de_ruta(name)));

drop policy if exists modelos_ifc_subir on storage.objects;
create policy modelos_ifc_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'modelos-ifc' and public.es_miembro(public.empresa_de_ruta(name)));

drop policy if exists modelos_ifc_borrar on storage.objects;
create policy modelos_ifc_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'modelos-ifc' and public.es_miembro(public.empresa_de_ruta(name)));
