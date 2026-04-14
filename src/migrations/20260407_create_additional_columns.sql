ALTER TABLE mr_rfc ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE mr_patient_portal ADD COLUMN IF NOT EXISTS comments TEXT;

ALTER TABLE mr_patient_portal ADD COLUMN IF NOT EXISTS got_mr_notes text;

-- -- Add post_hrg_dev_status and post_hrg_requirements columns to hearings
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS post_hrg_dev_status varchar DEFAULT NULL;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS post_hrg_requirements text DEFAULT NULL;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS post_hrg_deadline_prev date DEFAULT NULL;
ALTER TABLE hearings ADD COLUMN IF NOT EXISTS post_hrg_deadline_changed_by varchar DEFAULT NULL;


ALTER TABLE hearings ADD COLUMN IF NOT EXISTS chronicle_link TEXT;

ALTER TABLE hearings ADD COLUMN IF NOT EXISTS ovh_link TEXT;