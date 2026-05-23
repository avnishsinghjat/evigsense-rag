import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { transcribeAudio } from '../_shared/ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let document_id: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    document_id = body.document_id;

    if (!document_id) {
      throw new Error('document_id is required');
    }

    console.log(`Transcribing audio for document: ${document_id}`);

    // Get document details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path, mime_type, original_filename, created_by')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    // Validate file type
    const audioVideoTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a',
      'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
    ];

    if (!document.mime_type || !audioVideoTypes.includes(document.mime_type)) {
      throw new Error('File is not an audio or video file');
    }

    console.log(`Processing ${document.mime_type} file: ${document.original_filename}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !fileData) {
      throw new Error('Failed to download file from storage');
    }

    console.log('File downloaded, size:', fileData.size);

    // Convert file to base64 in chunks to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const chunkSize = 65536; // Process 64KB at a time
    let binary = '';
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64Audio = btoa(binary);

    console.log('File converted to base64, calling local transcription service...');

    const transcription = await transcribeAudio(base64Audio, document.mime_type);

    if (!transcription) {
      throw new Error('No transcription returned from local audio service');
    }

    console.log('Transcription successful, length:', transcription.length);

    // Find or create "Audio Transcription" metadata field
    let { data: field, error: fieldError } = await supabase
      .from('metadata_field_definitions')
      .select('id')
      .eq('name', 'audio_transcription')
      .maybeSingle();

    if (!field) {
      console.log('Creating audio_transcription field...');
      const { data: newField, error: createError } = await supabase
        .from('metadata_field_definitions')
        .insert({
          name: 'audio_transcription',
          label: 'Audio Transcription',
          field_type: 'text',
          help_text: 'Automatically transcribed audio content',
          is_active: true,
          created_by: document.created_by || '00000000-0000-0000-0000-000000000000'
        })
        .select('id')
        .single();

      if (createError || !newField) {
        console.error('Failed to create field:', createError);
        throw createError;
      }
      field = newField;
    }

    // Save transcription as metadata
    const { data: existingMetadata } = await supabase
      .from('document_metadata')
      .select('id')
      .eq('document_id', document_id)
      .eq('field_id', field.id)
      .maybeSingle();

    if (existingMetadata) {
      // Update existing
      const { error: updateError } = await supabase
        .from('document_metadata')
        .update({ value: transcription, updated_at: new Date().toISOString() })
        .eq('id', existingMetadata.id);

      if (updateError) {
        console.error('Failed to update metadata:', updateError);
        throw updateError;
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('document_metadata')
        .insert({
          document_id,
          field_id: field.id,
          value: transcription
        });

      if (insertError) {
        console.error('Failed to insert metadata:', insertError);
        throw insertError;
      }
    }

    console.log('Transcription saved to document metadata');

    // Update document status to generating_embeddings
    const { error: statusError } = await supabase
      .from('documents')
      .update({ 
        status: 'generating_embeddings',
        content_text: transcription.substring(0, 10000) // Store first 10k chars as content
      })
      .eq('id', document_id);

    if (statusError) {
      console.error('Failed to update document status:', statusError);
      // Don't throw - transcription was successful
    } else {
      console.log('Document status updated to generating_embeddings');
    }

    // Trigger embedding generation
    console.log('Triggering embedding generation for transcribed audio...');
    supabase.functions.invoke('generate-embeddings', {
      body: { documentId: document_id }
    }).catch((error) => {
      console.error('Failed to invoke generate-embeddings:', error);
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transcription completed, generating embeddings',
        transcription,
        length: transcription.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in transcribe-audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Update document status to failed if we have document_id
    if (document_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('documents')
          .update({ status: 'failed' })
          .eq('id', document_id);
        
        console.log('Document status updated to failed');
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});