-- Fotos propias de los productos (spec 27): bucket privado, una carpeta por usuario (<user_id>/<foto>.jpg)

-- JPEG de hasta 300 KB (la app comprime a 200 KB y acepta hasta 300 KB como mucho)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-propias', 'fotos-propias', false, 307200, array['image/jpeg']);

-- Cada usuario ve, sube y borra solo su carpeta (<user_id>/…); sin update: cada foto nueva es un archivo nuevo
create policy "fotos propias: leer" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos propias: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos propias: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
