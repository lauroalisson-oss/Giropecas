-- Guardar os DOIS documentos da nota, não só o último.
--
-- xml_content guardava o XML da DPS enquanto a nota estava sendo emitida
-- e depois era SOBRESCRITO pelo XML da NFS-e. Duas consequências ruins:
--
--   1. a DPS assinada — o que a oficina declarou e assinou — some;
--   2. se o Sefin não devolvesse o XML da nota, a gravação salvava NULL
--      por cima da DPS, e a oficina ficava com uma nota autorizada e
--      NENHUM documento: nada para o contador, nada para o cliente.
--
-- Agora cada documento tem o seu lugar.
alter table public.nfe_records add column xml_dps text;

comment on column public.nfe_records.xml_dps is
  'DPS assinada que a oficina enviou (o que foi declarado).';
comment on column public.nfe_records.xml_content is
  'XML da NFS-e devolvido pelo governo (o documento que vale).';
