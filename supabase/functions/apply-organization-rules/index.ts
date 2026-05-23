import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const requestSchema = z.object({
  documentId: z.string().uuid("Invalid document ID"),
  metadata: z.object({
    document_type: z.string(),
    priority_indicator: z.string(),
    keywords: z.array(z.string()),
    detected_entities: z.array(z.any()),
    confidence_score: z.number(),
  }),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal function secret for unauthenticated endpoints
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    
    if (!expectedSecret || internalSecret !== expectedSecret) {
      console.error('[APPLY-RULES] Unauthorized: Invalid or missing internal secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { documentId, metadata } = validationResult.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all existing tags
    const { data: existingTags, error: tagsError } = await supabase
      .from('tags')
      .select('*');

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      throw tagsError;
    }

    const tagsToAssign = new Set<string>();

    // Helper function for fuzzy matching
    const fuzzyMatch = (keyword: string, tagName: string): boolean => {
      const kw = keyword.toLowerCase();
      const tag = tagName.toLowerCase();
      
      // Exact match
      if (kw === tag) return true;
      
      // Partial match (keyword contains tag or vice versa)
      if (kw.includes(tag) || tag.includes(kw)) return true;
      
      // Common synonyms/abbreviations
      const synonyms: Record<string, string[]> = {
        'hr': ['human resources', 'personnel', 'people'],
        'finance': ['financial', 'accounting', 'budget'],
        'legal': ['law', 'compliance', 'regulatory'],
        'contracts': ['contract', 'agreement', 'terms'],
        'it': ['information technology', 'technology', 'tech'],
      };
      
      // Check if tag has synonyms and keyword matches any
      const tagSynonyms = synonyms[tag] || [];
      if (tagSynonyms.some(syn => kw.includes(syn) || syn.includes(kw))) return true;
      
      // Check if keyword has synonyms and tag matches any
      const kwSynonyms = synonyms[kw] || [];
      if (kwSynonyms.some(syn => tag.includes(syn) || syn.includes(tag))) return true;
      
      return false;
    };

    // Match document type to tags (only match existing tags, don't create new ones)
    if (metadata.document_type) {
      const docTypeTag = existingTags?.find(
        (tag) => fuzzyMatch(metadata.document_type, tag.name)
      );
      if (docTypeTag) {
        tagsToAssign.add(docTypeTag.id);
        console.log(`Matched document type "${metadata.document_type}" to tag: ${docTypeTag.name}`);
      } else {
        console.log(`No existing tag found for document type: ${metadata.document_type}`);
      }
    }

    // Match keywords to tags (check all keywords against all tags)
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      for (const keyword of metadata.keywords) {
        const matchingTag = existingTags?.find(
          (tag) => fuzzyMatch(keyword, tag.name)
        );
        if (matchingTag && !tagsToAssign.has(matchingTag.id)) {
          tagsToAssign.add(matchingTag.id);
          console.log(`Matched keyword "${keyword}" to tag: ${matchingTag.name}`);
        }
      }
    }

    // Match entity types to tags
    if (metadata.detected_entities && Array.isArray(metadata.detected_entities)) {
      const entityTypes = [...new Set(metadata.detected_entities.map((e: any) => e.type))];
      for (const entityType of entityTypes) {
        const matchingTag = existingTags?.find(
          (tag) => fuzzyMatch(entityType, tag.name)
        );
        if (matchingTag && !tagsToAssign.has(matchingTag.id)) {
          tagsToAssign.add(matchingTag.id);
          console.log(`Matched entity type "${entityType}" to tag: ${matchingTag.name}`);
        }
      }
    }

    if (tagsToAssign.size === 0) {
      console.log('No matching tags found');
      return new Response(
        JSON.stringify({ success: true, message: 'No tags assigned' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Assigning ${tagsToAssign.size} tags to document`);
    
    // Assign tags to document
    const tagInserts = Array.from(tagsToAssign).map((tagId) => ({
      document_id: documentId,
      tag_id: tagId,
    }));

    const { error: assignError } = await supabase
      .from('document_tags')
      .upsert(tagInserts, { onConflict: 'document_id,tag_id', ignoreDuplicates: true });

    if (assignError) {
      console.error('Error assigning tags:', assignError);
      throw assignError;
    }

    // Create audit log
    const { error: auditError } = await supabase
      .from('organization_audit')
      .insert({
        document_id: documentId,
        action: 'auto_tag_assignment',
        is_automatic: true,
        metadata_snapshot: metadata,
        reason: `Auto-assigned ${tagsToAssign.size} tags based on metadata`,
      });

    if (auditError) {
      console.error('Error creating audit record:', auditError);
      // Don't fail the operation if audit fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        tags_assigned: tagsToAssign.size,
        message: 'Tags assigned based on metadata',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Apply organization rules error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
