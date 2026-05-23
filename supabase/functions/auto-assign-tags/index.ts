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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get document with content
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    if (!document.content_text) {
      console.log('Document has no content text yet');
      return new Response(
        JSON.stringify({ success: false, error: 'No content to analyze' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all available tags
    const { data: availableTags, error: tagsError } = await supabase
      .from('tags')
      .select('*')
      .order('name');

    if (tagsError) throw tagsError;

    if (!availableTags || availableTags.length === 0) {
      console.log('No tags available in database');
      return new Response(
        JSON.stringify({ success: true, message: 'No tags available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare tags list for AI
    const tagsList = availableTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      type: tag.type || 'general'
    }));

    // Create prompt for AI
    const prompt = `Analyze the following document and assign the most relevant tags and category from the available options.

Document Title: ${document.title}
Document Filename: ${document.original_filename}
Document Content (first 2000 chars): ${document.content_text.substring(0, 2000)}

Available Tags:
${JSON.stringify(tagsList, null, 2)}

Based on the document content, filename, and title, select the 2-5 most relevant tag IDs that best describe this document. Consider the tag types (categories) as well.

Return ONLY the tag IDs as a JSON array, nothing else.`;

    console.log('Calling LM Studio for tag suggestions...');

    const aiContent = await chatCompletionText([
      {
        role: 'system',
        content: 'You are a document classification assistant. Analyze documents and suggest relevant tags. Return only a JSON array of tag IDs.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], { temperature: 0.3 });

    console.log('AI Response:', aiContent);

    // Parse tag IDs from AI response
    let suggestedTagIds: string[] = [];
    try {
      // Try to extract JSON array from response
      const jsonMatch = aiContent.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestedTagIds = JSON.parse(jsonMatch[0]);
      } else {
        suggestedTagIds = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse AI suggestions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate tag IDs exist
    const validTagIds = suggestedTagIds.filter(id => 
      availableTags.some(tag => tag.id === id)
    );

    console.log(`Assigning ${validTagIds.length} tags to document`);

    // Check if document already has tags
    const { data: existingTags } = await supabase
      .from('document_tags')
      .select('tag_id')
      .eq('document_id', documentId);

    const existingTagIds = existingTags?.map(t => t.tag_id) || [];
    
    // Only add tags that don't already exist
    const newTagIds = validTagIds.filter(id => !existingTagIds.includes(id));

    if (newTagIds.length > 0) {
      const tagInserts = newTagIds.map(tagId => ({
        document_id: documentId,
        tag_id: tagId,
      }));

      const { error: insertError } = await supabase
        .from('document_tags')
        .insert(tagInserts);

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        tagsAssigned: newTagIds.length,
        totalTags: validTagIds.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Auto-assign tags error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
