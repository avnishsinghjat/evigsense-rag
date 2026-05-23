-- Add sources column to conversation_messages to store document references
ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb;