-- Sem EXECUTE para anon, consultas não autenticadas falhavam com
-- "permission denied for function current_company_id" — erro interno feio
-- que ainda expõe nomes de funções (verificado em teste real).
--
-- Liberar é seguro: para o anônimo auth.uid() é nulo, então
-- current_company_id() devolve null e is_super_admin() devolve false.
-- As políticas avaliam como falso e a consulta retorna vazio.
grant execute on function public.current_company_id() to anon;
grant execute on function public.is_super_admin() to anon;
