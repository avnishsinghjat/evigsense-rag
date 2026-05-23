-- One-shot re-embed: queue all documents that have extracted text for re-indexing.
-- Run after applying 20260524000000_embedding_dim_1024.sql and starting LM Studio.
--
-- Usage (from project root, with local Postgres on port 54322):
--   psql "postgresql://postgres:YOUR_PASSWORD@localhost:54322/postgres" -f scripts/requeue-documents-for-reembed.sql

UPDATE documents
SET status = 'draft'
WHERE content_text IS NOT NULL
  AND trim(content_text) <> ''
  AND content_text NOT LIKE '[%';

INSERT INTO document_processing_queue (document_id, user_id, status, priority)
SELECT
  d.id,
  d.created_by,
  'pending',
  1
FROM documents d
WHERE d.content_text IS NOT NULL
  AND trim(d.content_text) <> ''
  AND d.content_text NOT LIKE '[%'
  AND NOT EXISTS (
    SELECT 1
    FROM document_processing_queue q
    WHERE q.document_id = d.id
      AND q.status IN ('pending', 'processing')
  );
