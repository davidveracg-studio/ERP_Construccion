-- VPAI — Demo sin correo ni contraseña
-- Ejecutar en Supabase → SQL Editor después de 0001. Es idempotente.
-- Requiere: Authentication → Sign In / Providers → "Allow anonymous sign-ins" activado.
--
-- La app abre una sesión anónima de Supabase y llama a unirse_demo(), que agrega esa sesión
-- como miembro de la empresa de demostración. El RLS por membresía de 0001 sigue aplicando:
-- sin sesión no se puede leer ni escribir nada, y ninguna sesión anónima puede ver otras empresas.

insert into public.empresas (id, nombre, rut)
values ('00000000-0000-0000-0000-000000000001', 'Constructora Demo SpA', '76.123.456-7')
on conflict (id) do nothing;

create or replace function public.unirse_demo()
returns uuid language plpgsql security definer set search_path = public as $$
declare demo constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión'; end if;
  -- R01 para que cualquier visitante pueda recorrer todas las vistas y reiniciar la demo;
  -- el rol que se ve en la app se elige en la pantalla de ingreso
  insert into miembros(empresa_id, user_id, rol, nombre)
  values (demo, auth.uid(), 'R01', 'Visitante demo')
  on conflict (empresa_id, user_id) do nothing;
  return demo;
end $$;

revoke execute on function public.unirse_demo() from public, anon;
grant execute on function public.unirse_demo() to authenticated;
