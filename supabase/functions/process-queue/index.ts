import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept either internal secret OR valid JWT for authenticated users
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let isAuthorized = false;
    
    // Check internal secret first (for function-to-function calls)
    if (expectedSecret && internalSecret === expectedSecret) {
      isAuthorized = true;
      console.log('[QUEUE] Authorized via internal secret');
    }
    
    // If no secret, check for valid JWT (for client calls)
    if (!isAuthorized && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (user && !authError) {
        isAuthorized = true;
        console.log(`[QUEUE] Authorized via JWT for user: ${user.id}`);
      }
    }
    
    if (!isAuthorized) {
      console.error('[QUEUE] Unauthorized: Invalid or missing credentials');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[QUEUE] Starting queue processor...');

    // Get next pending item from queue
    const { data: queueItem, error: queueError } = await supabase
      .from('document_processing_queue')
      .select('*, documents(*)')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queueError) {
      console.error('[QUEUE] Error fetching queue:', queueError);
      throw queueError;
    }

    if (!queueItem) {
      console.log('[QUEUE] No pending items in queue');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending items' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[QUEUE] Processing document ${queueItem.document_id}`);

    // Check if document still exists
    const document = queueItem.documents;
    if (!document) {
      console.log(`[QUEUE] Document ${queueItem.document_id} no longer exists, removing from queue`);
      await supabase
        .from('document_processing_queue')
        .delete()
        .eq('document_id', queueItem.document_id);
      
      // Continue processing next item (internal call with secret)
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecret || '' }
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'Document no longer exists, removed from queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as processing
    await supabase
      .from('document_processing_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);

    // Update document status
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', queueItem.document_id);

    try {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      // Get file size to determine if we need chunking
      const storagePath = document.storage_path.split('/');
      const { data: fileList } = await supabase.storage
        .from('documents')
        .list(storagePath[0], {
          search: storagePath[1]
        });
      
      const fileSize = fileList?.[0]?.metadata?.size || 0;
      const fileSizeMB = fileSize / (1024 * 1024);
      
      console.log(`[QUEUE] Document size: ${fileSizeMB.toFixed(2)}MB`);

      // For large files (>1MB), extract in chunks to avoid timeout
      if (fileSizeMB > 1) {
        console.log('[QUEUE] Large document detected, extracting in chunks');
        
        // Get total pages first
        const { data: initialExtract, error: initialError } = await supabase.functions.invoke(
          'extract-document-text',
          { 
            body: { 
              documentId: queueItem.document_id,
              startPage: 1,
              endPage: 1
            },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (initialError || !initialExtract?.totalPages) {
          throw new Error('Failed to determine document size');
        }

        const totalPages = initialExtract.totalPages;
        const CHUNK_SIZE = 100;
        const numChunks = Math.ceil(totalPages / CHUNK_SIZE);
        
        console.log(`[QUEUE] Document has ${totalPages} pages, processing in ${numChunks} chunks`);

        // Process chunks sequentially to avoid timeout
        for (let i = 0; i < numChunks; i++) {
          const startPage = i * CHUNK_SIZE + 1;
          const endPage = Math.min((i + 1) * CHUNK_SIZE, totalPages);
          
          console.log(`[QUEUE] Processing chunk ${i + 1}/${numChunks}: pages ${startPage}-${endPage}`);
          
          const { data: extractResult, error: chunkError } = await supabase.functions.invoke(
            'extract-document-text',
            {
              body: { 
                documentId: queueItem.document_id,
                startPage,
                endPage
              },
              headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
            }
          );

          if (chunkError) throw chunkError;
          
          // Check if the document was already converted (has 'converted' flag)
          if (extractResult?.converted) {
            console.log('[QUEUE] Document was converted, text extracted, and PDF replaced - generating embeddings');
            // Text is already extracted and stored, PDF file has been replaced with searchable version
            // Skip the progress update and continue to embeddings
            break; // Exit the chunk loop
          }
          
          // Update progress for chunked processing (only if not converted)
          await supabase
            .from('documents')
            .update({ 
              content_text: `Extracting text: ${i + 1}/${numChunks} chunks completed`
            })
            .eq('id', queueItem.document_id);
        }

        console.log('[QUEUE] Text extraction completed, generating embeddings in parallel');

        // Generate embeddings for all chunks in parallel
        const { error: embeddingError } = await supabase.functions.invoke(
          'generate-embeddings',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (embeddingError) throw embeddingError;

      } else {
        // Standard processing for small files
        console.log('[QUEUE] Processing small document in single pass');
        
        const { error: extractError } = await supabase.functions.invoke(
          'extract-document-text',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (extractError) throw extractError;

        console.log('[QUEUE] Text extraction completed, generating embeddings');

        // Generate embeddings
        const { error: embeddingError } = await supabase.functions.invoke(
          'generate-embeddings',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (embeddingError) throw embeddingError;
      }

      // Mark as completed
      await supabase
        .from('document_processing_queue')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', queueItem.id);

      console.log(`[QUEUE] Successfully processed document ${queueItem.document_id}`);

      // Immediately trigger next queue processing (internal call with secret)
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecret || '' }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          documentId: queueItem.document_id,
          message: 'Document processed successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      console.error(`[QUEUE] Error processing document:`, processingError);

      // Increment retry count
      const newRetryCount = queueItem.retry_count + 1;
      
      if (newRetryCount >= queueItem.max_retries) {
        // Max retries reached, mark as failed
        await supabase
          .from('document_processing_queue')
          .update({ 
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString()
          })
          .eq('id', queueItem.id);

        await supabase
          .from('documents')
          .update({ 
            status: 'error',
            content_text: `Processing failed: ${errorMessage}`
          })
          .eq('id', queueItem.document_id);

        console.log(`[QUEUE] Document ${queueItem.document_id} failed after ${newRetryCount} retries`);
      } else {
        // Reset to pending for retry
        await supabase
          .from('document_processing_queue')
          .update({ 
            status: 'pending',
            retry_count: newRetryCount,
            error_message: errorMessage
          })
          .eq('id', queueItem.id);

        console.log(`[QUEUE] Document ${queueItem.document_id} will be retried (attempt ${newRetryCount}/${queueItem.max_retries})`);
      }

      // Continue processing queue even if this item failed (internal call with secret)
      const internalSecretRetry = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecretRetry || '' }
      });

      throw processingError;
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[QUEUE] Queue processor error:', error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
