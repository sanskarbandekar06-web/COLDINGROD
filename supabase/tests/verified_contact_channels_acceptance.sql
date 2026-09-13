-- Synthetic users, contacts and drafts only. Always roll back.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_state(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, received %',expected,actual; END IF;
END $$;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('a5110000-0000-4000-8000-000000000001','authenticated','authenticated','contact-repair@coldingrod.test','{}','{"full_name":"Contact Repair Test"}',now(),now());
CREATE TEMP TABLE repair_context AS SELECT id AS workspace_id, 'a5110000-0000-4000-8000-000000000010'::uuid AS lead_id
FROM public.workspaces WHERE created_by='a5110000-0000-4000-8000-000000000001' AND is_personal;
GRANT SELECT ON repair_context TO authenticated,anon;
SELECT set_config('request.jwt.claim.sub','a5110000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"a5110000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.leads(id,workspace_id,company_name,status,source)
SELECT lead_id,workspace_id,'Contact Repair Business','new','acceptance_test' FROM repair_context;
INSERT INTO public.browser_extension_connections(workspace_id,user_id,token_hash,device_name,expires_at)
SELECT workspace_id,'a5110000-0000-4000-8000-000000000001',repeat('6',64),'Repair test browser',now()+interval '1 day' FROM repair_context;
SELECT public.save_public_contact_research(workspace_id,lead_id,
  '{"phone":"+912223456789","phoneType":"landline","email":"hello@business.example","finalUrl":"https://business.example/contact","owners":[{"name":"Asha Kumar","role":"Founder","phone":"+919876543210","phoneType":"mobile","sourceUrl":"https://business.example/team"}]}'::jsonb)
FROM repair_context;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.lead_contacts WHERE lead_id=(SELECT lead_id FROM repair_context)), 'Business and owner are separate');
SELECT pg_temp.assert_true((SELECT whatsapp_number IS NULL FROM public.lead_contacts WHERE lead_id=(SELECT lead_id FROM repair_context) AND contact_kind='business'),'Telephone not converted to WhatsApp');
SELECT pg_temp.expect_state(format('INSERT INTO public.outreach_messages(workspace_id,lead_id,contact_id,platform,direction,content,status) VALUES(%L,%L,%L,''whatsapp'',''outbound'',''Synthetic test'',''draft'')', workspace_id,lead_id,(SELECT id FROM public.lead_contacts WHERE lead_id=c.lead_id AND contact_kind='business')),'22023') FROM repair_context c;
SELECT pg_temp.expect_state(format('UPDATE public.lead_contacts SET whatsapp_status=''published'',whatsapp_number=''+919876543210'',whatsapp_source_url=NULL WHERE lead_id=%L',lead_id),'23514') FROM repair_context;
SELECT public.save_public_contact_research(workspace_id,lead_id,
  '{"phone":"+912223456789","phoneType":"landline","whatsappNumber":"+919876543210","whatsappSourceUrl":"https://business.example/contact","finalUrl":"https://business.example/contact"}'::jsonb)
FROM repair_context;
SELECT pg_temp.assert_true((SELECT whatsapp_status='published' AND whatsapp_number='+919876543210' AND phone='+912223456789' FROM public.lead_contacts WHERE lead_id=(SELECT lead_id FROM repair_context) AND contact_kind='business'),'Distinct WhatsApp persisted');
UPDATE public.lead_contacts SET whatsapp_status='unavailable',whatsapp_number=NULL WHERE lead_id=(SELECT lead_id FROM repair_context) AND contact_kind='business';
SELECT public.save_public_contact_research(workspace_id,lead_id,'{"whatsappNumber":"+919876543210","whatsappSourceUrl":"https://business.example/contact"}'::jsonb) FROM repair_context;
SELECT pg_temp.assert_true((SELECT whatsapp_status='unavailable' AND whatsapp_number IS NULL FROM public.lead_contacts WHERE lead_id=(SELECT lead_id FROM repair_context) AND contact_kind='business'),'Research does not undo user correction');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE anon;
SELECT public.browser_extension_save_contact_research(repeat('6',64),(SELECT lead_id FROM repair_context),'{}');
SELECT pg_temp.assert_true(public.browser_extension_get_outreach_basis(repeat('6',64),(SELECT lead_id FROM repair_context))->'contacts' @> '[{"contact_kind":"owner"}]','Extension receives owner contacts');
SELECT pg_temp.expect_state(format('SELECT public.browser_extension_save_contact_research(%L,%L,''{}'')',repeat('7',64),lead_id),'28000') FROM repair_context;
SELECT pg_temp.expect_state(format('SELECT public.save_public_contact_research(%L,%L,''{}'')',workspace_id,lead_id),'42501') FROM repair_context;
RESET ROLE;
SELECT 'PASS: contact separation, WhatsApp evidence, correction persistence, extension access, invalid token and anonymous denial' AS result;
ROLLBACK;
