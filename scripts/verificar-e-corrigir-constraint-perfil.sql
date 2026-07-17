-- 1) Rode isso primeiro pra ver se existe uma constraint travando os valores
--    aceitos na coluna "perfil" (comum em bancos criados via Django/legado):
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'usuarios_usuario'::regclass
  AND contype = 'c';

-- 2) Se aparecer uma constraint tipo "perfil IN ('administrador','pcp','lider','operador')"
--    (ou parecido, sem o 'vendedor'), troque NOME_DA_CONSTRAINT abaixo pelo nome
--    exato retornado no passo 1 e rode:
--
-- ALTER TABLE usuarios_usuario DROP CONSTRAINT NOME_DA_CONSTRAINT;
-- ALTER TABLE usuarios_usuario ADD CONSTRAINT NOME_DA_CONSTRAINT
--   CHECK (perfil IN ('administrador','pcp','lider','operador','vendedor'));
