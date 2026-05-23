import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, totalPages } = await req.json();

    if (!documentId) {
      throw new Error('Document ID is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`[MERGE] Starting merge for document ${documentId} (${totalPages} pages expected)`);

    // Get all chunks for this document from document_chunks table
    console.log(`[MERGE] Fetching chunks from document_chunks table...`);
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (chunksError) {
      console.error('[MERGE] Error fetching chunks:', chunksError);
      throw new Error('Failed to fetch document chunks');
    }

    console.log(`[MERGE] Found ${chunks?.length || 0} chunks in document_chunks table`);

    if (!chunks || chunks.length === 0) {
      console.log('[MERGE] No chunks found - checking if document already processed');
      
      // Get the document to check if it has content
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('content_text, page_map')
        .eq('id', documentId)
        .single();

      if (docError || !document) {
        throw new Error('Document not found');
      }

      // If document already has content, just update status
      if (document.content_text && document.page_map) {
        const { error: updateError } = await supabase
          .from('documents')
          .update({ status: 'active' })
          .eq('id', documentId);

        if (updateError) {
          throw updateError;
        }

        console.log(`Document ${documentId} already has content, updated status to active`);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Document already processed',
            totalPages: document.page_map.length
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      throw new Error('No chunks found and document has no content');
    }

    console.log(`Found ${chunks.length} chunks to merge`);

    // Reconstruct full text and page_map from chunks
    const allPageMaps: Array<{ page: number, startIndex: number, endIndex: number }> = [];
    let fullText = '';
    let currentOffset = 0;

    for (const chunk of chunks) {
      const chunkText = chunk.content_text;
      const chunkPageMap = chunk.page_map as Array<{ page: number, startIndex: number, endIndex: number }>;

      // Add text with proper spacing
      if (fullText.length > 0) {
        fullText += '\n\n';
        currentOffset += 2; // Account for separator
      }

      // Adjust page map indices to account for concatenation
      for (const pageEntry of chunkPageMap) {
        allPageMaps.push({
          page: pageEntry.page,
          startIndex: pageEntry.startIndex + currentOffset,
          endIndex: pageEntry.endIndex + currentOffset
        });
      }

      fullText += chunkText;
      currentOffset += chunkText.length;
    }

    // Sort page map by page number
    const sortedPageMap = allPageMaps.sort((a, b) => a.page - b.page);

    console.log(`Reconstructed ${fullText.length} characters from ${sortedPageMap.length} pages`);

    // Update document with merged content
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        content_text: fullText,
        page_map: sortedPageMap,
        status: 'active'
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Error updating document:', updateError);
      throw updateError;
    }

    // Clean up chunks after successful merge
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('Error deleting chunks:', deleteError);
      // Don't throw - merge was successful
    }

    console.log(`Successfully merged ${sortedPageMap.length} pages for document ${documentId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Document chunks merged successfully',
        totalPages: sortedPageMap.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Merge chunks error:', error);
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