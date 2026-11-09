CREATE FUNCTION public.validate_report_field_label() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE label_key text;
BEGIN
 label_key=regexp_replace(lower(trim(NEW.label)),'[ _-]+','.','g');
 IF label_key=ANY(ARRAY['school.name','school.motto','school.location','school.tel','school.email','motto','schoolmotto','house','conduct','age','sex','class','stream','term','year','academic.year','learner.name','student.name','pupil.name','full.name','name','learner.full.name','learner.age','learner.sex','learner.house','learner.conduct','learner.co.curricular','co.curricular','lin.no','reg.no','pay.code','class.teacher.comment','class.teacher.remarks','class.teacher.remark','class.teacher''s.remarks','head.teacher.comment','report.class.teacher.comment','report.head.teacher.comment','next.term.begins','term.next.begins.on','term.ends.on']) THEN RAISE EXCEPTION 'This information already exists; choose an existing data source in Template associations'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_report_field_label() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_report_label BEFORE INSERT OR UPDATE OF label ON public.report_field_definitions FOR EACH ROW EXECUTE FUNCTION public.validate_report_field_label();