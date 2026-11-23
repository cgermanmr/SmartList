-- La función del trigger de grupos (spec 22) no se llama por RPC: sin execute para nadie (el trigger la sigue usando)
revoke execute on function public.group_members_after_delete() from public, anon, authenticated;
