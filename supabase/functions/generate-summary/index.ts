import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText } from "../_shared/ai.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { documentId } = validationResult.data;
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user context
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    console.log('Generating summary for document:', documentId);

    // Get document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, title, content_text, created_by')
      .eq('id', documentId)
      .eq('created_by', user.id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found or access denied');
    }

    if (!document.content_text) {
      throw new Error('Document has no text content to summarize');
    }

    console.log('Document content length:', document.content_text.length);

    // Generate summary using local LM Studio
    const summary = await chatCompletionText([
      { 
        role: 'system', 
        content: `You are an expert document summarizer. Create concise, informative summaries that:
- Capture the main purpose and key points of the document
- Are 2-4 sentences long (50-100 words)
- Use clear, professional language
- Focus on the most important information
- Are structured to be easily scannable`
      },
      { 
        role: 'user', 
        content: `Document Title: ${document.title}\n\nDocument Content:\n${document.content_text}\n\nGenerate a concise summary of this document.`
      }
    ]);

    console.log('Generated summary:', summary.substring(0, 100) + '...');

    // Update document with summary
    const { error: updateError } = await supabase
      .from('documents')
      .update({ summary })
      .eq('id', documentId)
      .eq('created_by', user.id);

    if (updateError) {
      console.error('Error updating document with summary:', updateError);
      throw updateError;
    }

    console.log('Successfully generated and saved summary for document:', documentId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        message: 'Summary generated successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Generate summary error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});