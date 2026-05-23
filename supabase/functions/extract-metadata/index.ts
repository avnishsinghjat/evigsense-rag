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

    // Check if metadata already exists
    const { data: existingMetadata, error: existingError } = await supabase
      .from('document_enriched_metadata')
      .select('*')
      .eq('document_id', documentId)
      .single();

    if (!existingError && existingMetadata) {
      console.log('Metadata already exists, returning cached version');
      return new Response(
        JSON.stringify({ 
          success: true,
          metadata: existingMetadata,
          cached: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get document with content
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    if (!document.content_text || document.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Document must be active with extracted text' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get file from storage to extract inherent metadata
    const { data: fileData, error: fileError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);

    if (fileError) {
      console.error('Error downloading file:', fileError);
    }

    // Extract file properties (inherent metadata)
    const fileSize = fileData?.size || 0;
    const fileType = document.mime_type || 'unknown';
    const creationDate = document.created_at;
    
    // Get page count from page_map if available
    let pageCount = 0;
    if (document.page_map) {
      const pageMap = typeof document.page_map === 'string' 
        ? JSON.parse(document.page_map) 
        : document.page_map;
      pageCount = Array.isArray(pageMap) ? pageMap.length : 0;
    }

    // Create prompt for AI to extract contextual metadata
    const prompt = `Analyze the following document and extract metadata in JSON format.

Document Title: ${document.title}
Document Filename: ${document.original_filename}
Document Content (first 3000 chars): ${document.content_text.substring(0, 3000)}

Extract the following metadata:
1. keywords: Array of 5-10 relevant keywords that describe the document content
2. detected_entities: Array of objects with "text" and "type" (types: PERSON, ORGANIZATION, LOCATION, DATE, MONETARY_VALUE, PRODUCT, EVENT, OTHER)
3. document_type: Classification (e.g., "invoice", "contract", "report", "letter", "resume", "presentation", "technical_document", "legal_document", "financial_statement", "policy", "other")
4. priority_indicator: Assessment of document importance ("high", "medium", "low")
5. confidence_score: Your confidence in the classification (0.00 to 1.00)

Return ONLY valid JSON in this exact format:
{
  "keywords": ["keyword1", "keyword2", ...],
  "detected_entities": [{"text": "Entity Name", "type": "PERSON"}, ...],
  "document_type": "document_type",
  "priority_indicator": "medium",
  "confidence_score": 0.85
}`;

    console.log('Calling LM Studio for metadata extraction...');

    const aiContent = await chatCompletionText([
      {
        role: 'system',
        content: 'You are a document analysis assistant. Extract metadata from documents and return only valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], { temperature: 0.3, response_format: { type: 'json_object' } });

    console.log('AI Response:', aiContent);

    // Parse AI response
    let extractedMetadata: any;
    try {
      // Try to extract JSON from response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedMetadata = JSON.parse(jsonMatch[0]);
      } else {
        extractedMetadata = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse AI metadata extraction' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate extracted metadata
    if (!extractedMetadata.keywords || !Array.isArray(extractedMetadata.keywords)) {
      extractedMetadata.keywords = [];
    }
    if (!extractedMetadata.detected_entities || !Array.isArray(extractedMetadata.detected_entities)) {
      extractedMetadata.detected_entities = [];
    }
    if (!extractedMetadata.document_type) {
      extractedMetadata.document_type = 'other';
    }
    if (!extractedMetadata.priority_indicator) {
      extractedMetadata.priority_indicator = 'medium';
    }
    if (!extractedMetadata.confidence_score) {
      extractedMetadata.confidence_score = 0.5;
    }

    // Store enriched metadata in database
    const { error: insertError } = await supabase
      .from('document_enriched_metadata')
      .upsert({
        document_id: documentId,
        file_size_bytes: fileSize,
        file_type: fileType,
        creation_date: creationDate,
        last_modified_date: document.updated_at,
        page_count: pageCount,
        keywords: extractedMetadata.keywords,
        detected_entities: extractedMetadata.detected_entities,
        document_type: extractedMetadata.document_type,
        priority_indicator: extractedMetadata.priority_indicator,
        confidence_score: parseFloat(extractedMetadata.confidence_score),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'document_id'
      });

    if (insertError) {
      console.error('Error storing metadata:', insertError);
      throw insertError;
    }

    const metadata = {
      file_size_bytes: fileSize,
      file_type: fileType,
      creation_date: creationDate,
      last_modified_date: document.updated_at,
      page_count: pageCount,
      keywords: extractedMetadata.keywords,
      detected_entities: extractedMetadata.detected_entities,
      document_type: extractedMetadata.document_type,
      priority_indicator: extractedMetadata.priority_indicator,
      confidence_score: extractedMetadata.confidence_score,
    };

    // Apply organization rules
    console.log('Applying organization rules...');
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    try {
      await supabase.functions.invoke('apply-organization-rules', {
        body: { 
          documentId,
          metadata 
        },
        headers: { 'x-internal-secret': internalSecret || '' }
      });
    } catch (ruleError) {
      console.error('Error applying rules:', ruleError);
      // Don't fail the whole operation if rules fail
    }

    // Auto-populate structured metadata fields
    console.log('Auto-populating structured metadata fields...');
    try {
      await supabase.functions.invoke('auto-populate-metadata', {
        body: { document_id: documentId },
        headers: { 'x-internal-secret': internalSecret || '' }
      });
    } catch (populateError) {
      console.error('Error auto-populating metadata:', populateError);
      // Don't fail the whole operation if auto-population fails
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        metadata,
        cached: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Extract metadata error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
