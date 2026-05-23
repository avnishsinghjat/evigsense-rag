-- Add DELETE policy for user_messages so users can delete their own messages
CREATE POLICY "Users can delete messages they sent or received"
ON public.user_messages
FOR DELETE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);