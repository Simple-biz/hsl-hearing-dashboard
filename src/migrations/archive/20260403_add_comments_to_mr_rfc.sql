-- Add comments column to mr_rfc for storing TL approval notes / Excel cell comments
ALTER TABLE mr_rfc ADD COLUMN IF NOT EXISTS comments TEXT;
