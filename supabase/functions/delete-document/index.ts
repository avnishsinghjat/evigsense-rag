import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10; // Very small batches to avoid timeout
const BATCH_DELAY = 200; // Longer delay between batches

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      throw new Error('Document ID is required');
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use service role for deletion operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`[DELETE] Starting deletion for document: ${documentId}`);

    // First check if document exists at all
    const { data: documentCheck, error: checkError } = await supabase
      .from('documents')
      .select('id, storage_path, created_by')
      .eq('id', documentId)
      .maybeSingle();

    if (checkError) {
      console.error('[DELETE] Error fetching document:', checkError);
      throw new Error('Failed to fetch document: ' + checkError.message);
    }

    if (!documentCheck) {
      console.error('[DELETE] Document not found:', documentId);
      throw new Error('Document not found. It may have already been deleted.');
    }

    // Then verify ownership
    if (documentCheck.created_by !== user.id) {
      console.error('[DELETE] Access denied for user:', user.id, 'document owner:', documentCheck.created_by);
      throw new Error('Access denied. You do not have permission to delete this document.');
    }

    const document = documentCheck;

    // Step 1: Delete embeddings in small batches with delays
    console.log(`[DELETE] Deleting embeddings in batches of ${BATCH_SIZE}...`);
    let deletedEmbeddings = 0;
    let hasMore = true;
    let batchNumber = 0;

    while (hasMore) {
      batchNumber++;
      
      // Fetch a small batch of IDs
      const { data: embeddingBatch, error: fetchError } = await supabase
        .from('document_embeddings')
        .select('id')
        .eq('document_id', documentId)
        .limit(BATCH_SIZE);

      if (fetchError) {
        console.error('[DELETE] Error fetching embeddings:', fetchError);
        throw fetchError;
      }

      if (!embeddingBatch || embeddingBatch.length === 0) {
        hasMore = false;
        break;
      }

      // Delete this small batch
      const embeddingIds = embeddingBatch.map(e => e.id);
      const { error: deleteError } = await supabase
        .from('document_embeddings')
        .delete()
        .in('id', embeddingIds);

      if (deleteError) {
        console.error('[DELETE] Error deleting embeddings batch:', deleteError);
        throw deleteError;
      }

      deletedEmbeddings += embeddingBatch.length;
      
      if (batchNumber % 10 === 0) {
        console.log(`[DELETE] Deleted ${deletedEmbeddings} embeddings so far...`);
      }

      // If we got fewer than BATCH_SIZE, we're done
      if (embeddingBatch.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        // Small delay between batches to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`[DELETE] Deleted total of ${deletedEmbeddings} embeddings`);

    // Step 2: Delete any remaining chunks (should be none after merge, but just in case)
    console.log('[DELETE] Deleting document chunks...');
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (chunksError) {
      console.error('[DELETE] Error deleting chunks:', chunksError);
      // Don't throw - chunks might not exist
    }

    // Step 3: Delete storage file
    console.log(`[DELETE] Deleting storage file: ${document.storage_path}`);
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.storage_path]);

    if (storageError) {
      console.error('[DELETE] Error deleting storage file:', storageError);
      // Don't throw - continue with document deletion
    }

    // Step 4: Delete document record
    console.log('[DELETE] Deleting document record...');
    const { error: docDeleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (docDeleteError) {
      console.error('[DELETE] Error deleting document:', docDeleteError);
      throw docDeleteError;
    }

    console.log(`[DELETE] Successfully deleted document ${documentId} with ${deletedEmbeddings} embeddings`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Document deleted successfully',
        deletedEmbeddings: deletedEmbeddings
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('[DELETE] Error:', error);
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
