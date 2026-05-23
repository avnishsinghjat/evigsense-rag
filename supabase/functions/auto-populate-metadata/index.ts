import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface EnrichedMetadata {
  document_type?: string;
  keywords?: string[];
  detected_entities?: {
    persons?: string[];
    organizations?: string[];
    locations?: string[];
    dates?: string[];
  };
  creation_date?: string;
  confidence_score?: number;
}

interface MetadataField {
  id: string;
  name: string;
  field_type: string;
  options?: { options?: string[] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal function secret for unauthenticated endpoints
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    
    if (!expectedSecret || internalSecret !== expectedSecret) {
      console.error('[AUTO-POPULATE] Unauthorized: Invalid or missing internal secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { document_id } = await req.json();

    if (!document_id) {
      throw new Error('document_id is required');
    }

    console.log(`Auto-populating metadata for document: ${document_id}`);

    // Fetch document info to check mime type
    const { data: documentInfo, error: docInfoError } = await supabase
      .from('documents')
      .select('mime_type')
      .eq('id', document_id)
      .single();

    if (docInfoError) {
      console.error('Error fetching document info:', docInfoError);
    }

    // Skip auto-tagging for audio/video files - they don't have enriched metadata
    const isAudioVideo = documentInfo?.mime_type?.startsWith('audio/') || 
                         documentInfo?.mime_type?.startsWith('video/');

    // Fetch enriched metadata
    const { data: enrichedData, error: enrichedError } = await supabase
      .from('document_enriched_metadata')
      .select('*')
      .eq('document_id', document_id)
      .single();

    if (enrichedError || !enrichedData) {
      console.log('No enriched metadata found for document');
      return new Response(
        JSON.stringify({ message: 'No enriched metadata available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all active metadata field definitions
    const { data: fields, error: fieldsError } = await supabase
      .from('metadata_field_definitions')
      .select('*')
      .eq('is_active', true);

    if (fieldsError || !fields || fields.length === 0) {
      console.log('No metadata field definitions found');
      return new Response(
        JSON.stringify({ message: 'No metadata fields configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const enriched = enrichedData as EnrichedMetadata;
    const metadataToInsert: { document_id: string; field_id: string; value: string }[] = [];

    // Map enriched metadata to structured fields
    for (const field of fields as MetadataField[]) {
      let value: string | null = null;

      switch (field.name.toLowerCase()) {
        case 'author':
          // Try to extract author from detected entities (persons)
          if (enriched.detected_entities?.persons && enriched.detected_entities.persons.length > 0) {
            value = enriched.detected_entities.persons[0];
          }
          break;

        case 'document_date':
        case 'date':
          // Use creation_date from enriched metadata
          if (enriched.creation_date) {
            value = new Date(enriched.creation_date).toISOString();
          }
          break;

        case 'document_type':
        case 'type':
          // Map document_type to dropdown if it matches one of the options
          if (enriched.document_type && field.field_type === 'dropdown') {
            const options = field.options?.options || [];
            const matchedOption = options.find((opt: string) => 
              opt.toLowerCase() === enriched.document_type?.toLowerCase()
            );
            if (matchedOption) {
              value = matchedOption;
            }
          }
          break;

        case 'keywords':
        case 'tags':
          // Join keywords array if field is text
          if (enriched.keywords && enriched.keywords.length > 0) {
            value = enriched.keywords.join(', ');
          }
          break;

        case 'status':
          // Default to 'Draft' for new documents if field is dropdown
          if (field.field_type === 'dropdown') {
            const options = field.options?.options || [];
            if (options.includes('Draft')) {
              value = 'Draft';
            }
          }
          break;

        case 'confidentiality_level':
        case 'confidentiality':
          // Default to 'Internal' if field is dropdown
          if (field.field_type === 'dropdown') {
            const options = field.options?.options || [];
            if (options.includes('Internal')) {
              value = 'Internal';
            }
          }
          break;

        case 'department':
          // Try to extract from organizations
          if (enriched.detected_entities?.organizations && enriched.detected_entities.organizations.length > 0) {
            const org = enriched.detected_entities.organizations[0];
            if (field.field_type === 'dropdown') {
              const options = field.options?.options || [];
              const matchedOption = options.find((opt: string) =>
                org.toLowerCase().includes(opt.toLowerCase())
              );
              if (matchedOption) {
                value = matchedOption;
              }
            }
          }
          break;
      }

      if (value) {
        metadataToInsert.push({
          document_id,
          field_id: field.id,
          value: value.trim(),
        });
      }
    }

    console.log(`Mapped ${metadataToInsert.length} metadata fields`);

    // Check if metadata already exists for this document
    const { data: existingMetadata } = await supabase
      .from('document_metadata')
      .select('field_id')
      .eq('document_id', document_id);

    const existingFieldIds = new Set(existingMetadata?.map(m => m.field_id) || []);

    // Only insert metadata for fields that don't have existing values
    const newMetadata = metadataToInsert.filter(m => !existingFieldIds.has(m.field_id));

    if (newMetadata.length > 0) {
      const { error: insertError } = await supabase
        .from('document_metadata')
        .insert(newMetadata);

      if (insertError) {
        console.error('Error inserting metadata:', insertError);
        throw insertError;
      }

      console.log(`Successfully auto-populated ${newMetadata.length} metadata fields`);
    } else {
      console.log('All fields already have values, skipping auto-population');
    }

    // Auto-assign intelligent tags based on document type and keywords
    // Skip for audio/video files since they don't have enriched metadata
    if (!isAudioVideo) {
      console.log('Auto-assigning tags based on document content...');
      try {
      const documentType = enriched.document_type?.toUpperCase() || '';
      const keywords = enriched.keywords || [];
      
      // Determine the best category tag based on content analysis
      // Using strict matching to avoid false positives
      let categoryTag: string | null = null;
      let matchStrength = 0;
      
      // Technical/Programming related (requires strong match)
      const technicalScore = (
        (documentType.includes('TECHNICAL') ? 2 : 0) +
        (documentType.includes('CODE') || documentType.includes('SOFTWARE') || documentType.includes('ALGORITHM') ? 2 : 0) +
        (keywords.filter(k => 
          k.toLowerCase().includes('algorithm') ||
          k.toLowerCase().includes('data structure') ||
          k.toLowerCase().includes('programming') ||
          k.toLowerCase().includes('code') ||
          k.toLowerCase().includes('software')
        ).length >= 2 ? 1 : 0)
      );
      
      // HR related (requires strong match)
      const hrScore = (
        (documentType.includes('HR') || documentType.includes('HUMAN RESOURCE') ? 2 : 0) +
        (keywords.filter(k => 
          k.toLowerCase().includes('employee') ||
          k.toLowerCase().includes('recruitment') ||
          k.toLowerCase().includes('payroll') ||
          k.toLowerCase().includes('hr policy') ||
          k.toLowerCase().includes('personnel')
        ).length >= 2 ? 1 : 0)
      );
      
      // Finance related (requires strong match)
      const financeScore = (
        (documentType.includes('FINANCE') || documentType.includes('FINANCIAL') ? 2 : 0) +
        (keywords.filter(k => 
          k.toLowerCase().includes('invoice') ||
          k.toLowerCase().includes('budget') ||
          k.toLowerCase().includes('accounting')
        ).length >= 2 ? 1 : 0)
      );
      
      // Legal related (requires strong match)
      const legalScore = (
        (documentType.includes('LEGAL') || documentType.includes('CONTRACT') ? 2 : 0) +
        (keywords.filter(k => 
          k.toLowerCase().includes('legal') ||
          k.toLowerCase().includes('contract') ||
          k.toLowerCase().includes('agreement') ||
          k.toLowerCase().includes('compliance')
        ).length >= 2 ? 1 : 0)
      );
      
      // Determine best match (minimum score of 2 required for confident assignment)
      const scores = [
        { tag: 'TECHNICAL', score: technicalScore },
        { tag: 'HR', score: hrScore },
        { tag: 'FINANCE', score: financeScore },
        { tag: 'LEGAL', score: legalScore }
      ];
      
      const bestMatch = scores.reduce((prev, current) => 
        current.score > prev.score ? current : prev
      );
      
      if (bestMatch.score >= 2) {
        categoryTag = bestMatch.tag;
        matchStrength = bestMatch.score;
      } else {
        // No confident match - assign "Other"
        categoryTag = 'Other';
        matchStrength = 0;
        console.log('No confident category match - assigning to Other');
      }

      if (categoryTag) {
        console.log(`Determined category tag: ${categoryTag} (confidence: ${matchStrength >= 2 ? 'high' : 'low'})`);
        
        // If assigning "Other", first remove any conflicting category tags
        if (categoryTag === 'Other') {
          const categoryTags = ['HR', 'FINANCE', 'LEGAL', 'TECHNICAL'];
          
          // Get all category tags
          const { data: conflictingTags } = await supabase
            .from('tags')
            .select('id')
            .in('name', categoryTags);
          
          if (conflictingTags && conflictingTags.length > 0) {
            const conflictingTagIds = conflictingTags.map(t => t.id);
            
            // Remove any conflicting category tags from this document
            const { error: removeError } = await supabase
              .from('document_tags')
              .delete()
              .eq('document_id', document_id)
              .in('tag_id', conflictingTagIds);
            
            if (removeError) {
              console.error('Error removing conflicting tags:', removeError);
            } else {
              console.log('Removed conflicting category tags before assigning Other');
            }
          }
        }
        
        // Check if tag exists, create if not
        let { data: existingTag, error: tagLookupError } = await supabase
          .from('tags')
          .select('id')
          .eq('name', categoryTag)
          .eq('type', categoryTag)
          .maybeSingle();

        if (tagLookupError) {
          console.error('Error looking up tag:', tagLookupError);
        }

        let tagId: string;
        
        if (!existingTag) {
          console.log(`Creating new tag: ${categoryTag}`);
          const { data: newTag, error: createTagError } = await supabase
            .from('tags')
            .insert({ name: categoryTag, type: categoryTag })
            .select('id')
            .single();

          if (createTagError || !newTag) {
            console.error('Error creating tag:', createTagError);
            throw createTagError;
          }
          
          tagId = newTag.id;
        } else {
          tagId = existingTag.id;
        }

        // Check if document already has this tag
        const { data: existingDocTag } = await supabase
          .from('document_tags')
          .select('id')
          .eq('document_id', document_id)
          .eq('tag_id', tagId)
          .maybeSingle();

        if (!existingDocTag) {
          // Assign tag to document
          const { error: assignTagError } = await supabase
            .from('document_tags')
            .insert({ document_id, tag_id: tagId });

          if (assignTagError) {
            console.error('Error assigning tag:', assignTagError);
          } else {
            console.log(`Successfully assigned ${categoryTag} tag to document`);
          }
        } else {
          console.log('Document already has this tag');
        }
      }
      } catch (tagError) {
        console.error('Error during auto-tag assignment:', tagError);
        // Don't fail the whole operation if tagging fails
      }
    } else {
      console.log('Skipping auto-tag assignment for audio/video file');
    }

    return new Response(
      JSON.stringify({
        success: true,
        populated_count: newMetadata.length,
        total_mapped: metadataToInsert.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-populate-metadata:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
