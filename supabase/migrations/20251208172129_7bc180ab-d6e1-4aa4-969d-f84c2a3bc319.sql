-- Add replied_to_message_id column for message replies
ALTER TABLE public.user_messages 
ADD COLUMN replied_to_message_id uuid REFERENCES public.user_messages(id) ON DELETE SET NULL;

-- Add index for faster reply lookups
CREATE INDEX idx_user_messages_replied_to ON public.user_messages(replied_to_message_id) WHERE replied_to_message_id IS NOT NULL;