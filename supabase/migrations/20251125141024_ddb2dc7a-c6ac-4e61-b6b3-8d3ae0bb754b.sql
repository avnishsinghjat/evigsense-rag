-- Add page_map column to documents table to store page mapping information
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_map jsonb DEFAULT '[]'::jsonb;