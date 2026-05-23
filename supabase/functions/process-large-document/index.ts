import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_SIZE = 100; // Process 100 pages at a time
const MAX_RETRY_ATTEMPTS = 3; // Retry failed chunks up to 3 times
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second delay

// Helper function to sleep for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operation: string,
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        console.error(`${operation} failed after ${maxAttempts} attempts:`, lastError);
        throw lastError;
      }
      
      // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, etc.
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`${operation} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`, lastError.message);
      
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

// Process chunks sequentially (one by one)
async function processChunksSequentially<T>(
  items: T[],
  processFn: (item: T) => Promise<void>
): Promise<void> {
  for (const item of items) {
    await processFn(item);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      throw new Error('Document ID is required');
    }

    // Use service role key for background processing
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if this is an internal call (from process-queue with service role key)
    const authHeader = req.headers.get('Authorization') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isInternalCall = authHeader.includes(serviceRoleKey);

    let user = null;

    // Only authenticate user for external calls
    if (!isInternalCall) {
      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user: authenticatedUser } } = await supabaseAuth.auth.getUser();
      if (!authenticatedUser) throw new Error('Not authenticated');
      user = authenticatedUser;
    }

    console.log('Starting chunked processing for document:', documentId, isInternalCall ? '(internal call)' : '(external call)');

    // Get document details
    let documentQuery = supabase
      .from('documents')
      .select('id, title, storage_path, mime_type, created_by')
      .eq('id', documentId);
    
    // Only filter by user for external calls
    if (!isInternalCall && user) {
      documentQuery = documentQuery.eq('created_by', user.id);
    }

    const { data: document, error: docError } = await documentQuery.maybeSingle();

    if (docError || !document) {
      throw new Error('Document not found or access denied');
    }

    // Check file size before attempting to process
    console.log('Checking file size...');
    const { data: fileInfo } = await supabase.storage
      .from('documents')
      .list(document.storage_path.split('/')[0], {
        search: document.storage_path.split('/')[1]
      });
    
    const fileSize = fileInfo?.[0]?.metadata?.size || 0;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Reject files over 100MB as they're too large for edge function processing
    const MAX_FILE_SIZE_MB = 100;
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      await supabase
        .from('documents')
        .update({ 
          status: 'error',
          content_text: `File too large for processing (${fileSizeMB.toFixed(2)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB. Please split the PDF into smaller files or reduce file size.`
        })
        .eq('id', documentId);
      
      throw new Error(`File is too large (${fileSizeMB.toFixed(2)}MB). Maximum supported size is ${MAX_FILE_SIZE_MB}MB`);
    }

    // First, get total pages by doing a quick check
    const extractAuthHeader = isInternalCall 
      ? `Bearer ${serviceRoleKey}` 
      : authHeader;
    
    const { data: initialExtract, error: initialError } = await supabase.functions.invoke(
      'extract-document-text',
      { 
        body: { 
          documentId: documentId,
          startPage: 1,
          endPage: 1
        },
        headers: { Authorization: extractAuthHeader }
      }
    );

    if (initialError || !initialExtract?.totalPages) {
      throw new Error('Failed to determine document size');
    }

    const totalPages = initialExtract.totalPages;
    console.log(`Document has ${totalPages} pages. Will process sequentially in chunks of ${CHUNK_SIZE}`);

    // Update document status to indicate processing
    await supabase
      .from('documents')
      .update({ 
        status: 'processing',
        content_text: `Processing large document: 0/${totalPages} pages completed`
      })
      .eq('id', documentId);

    // Start background processing (don't await)
    (async () => {
      try {
        // Create chunk definitions
        const chunks: Array<{ startPage: number; endPage: number }> = [];
        for (let startPage = 1; startPage <= totalPages; startPage += CHUNK_SIZE) {
          const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages);
          chunks.push({ startPage, endPage });
        }

        let completedPages = 0;
        const completedChunks = new Set<number>();
        const failedChunks: Array<{ startPage: number; endPage: number; error: string }> = [];

        // Process chunks sequentially to avoid race conditions
        await processChunksSequentially(
          chunks,
          async (chunk) => {
            const { startPage, endPage } = chunk;
            
            try {
              // Wrap chunk processing with retry logic
              const chunkData = await retryWithBackoff(
                async () => {
                  console.log(`[SEQUENTIAL] Processing chunk: pages ${startPage}-${endPage}`);
                  
                  const { data: chunkData, error: chunkError } = await supabase.functions.invoke(
                    'extract-document-text',
                    { 
                      body: { 
                        documentId: documentId,
                        startPage: startPage,
                        endPage: endPage
                      },
                      headers: { Authorization: extractAuthHeader }
                    }
                  );

                  if (chunkError) {
                    throw new Error(`Chunk processing error: ${chunkError.message || JSON.stringify(chunkError)}`);
                  }
                  
                  if (!chunkData?.success) {
                    throw new Error(`Chunk processing returned unsuccessful result`);
                  }

                  console.log(`[SEQUENTIAL] Completed chunk: pages ${startPage}-${endPage}`);
                  return chunkData;
                },
                `Chunk ${startPage}-${endPage}`
              );
              
              // Track progress on success
              completedChunks.add(startPage);
              completedPages = Math.max(completedPages, endPage);
              
              // Update progress
              await supabase
                .from('documents')
                .update({ 
                  content_text: `Processing: ${completedPages}/${totalPages} pages extracted, generating embeddings...`
                })
                .eq('id', documentId);

              // Get the chunk ID from the database to generate embeddings for this specific chunk
              const { data: dbChunk } = await supabase
                .from('document_chunks')
                .select('id')
                .eq('document_id', documentId)
                .eq('start_page', startPage)
                .eq('end_page', endPage)
                .maybeSingle();

              if (dbChunk) {
                // Generate embeddings for this chunk immediately after extraction
                console.log(`[SEQUENTIAL] Generating embeddings for chunk ${startPage}-${endPage}`);
                try {
                  await retryWithBackoff(
                    async () => {
                      const { error: embeddingError } = await supabase.functions.invoke(
                        'generate-embeddings',
                        { 
                          body: { 
                            documentId: documentId,
                            chunkId: dbChunk.id 
                          }
                        }
                      );
                      
                      if (embeddingError) {
                        throw new Error(`Embedding generation error: ${embeddingError.message || JSON.stringify(embeddingError)}`);
                      }
                      console.log(`[SEQUENTIAL] Embeddings completed for chunk ${startPage}-${endPage}`);
                    },
                    `Embeddings for chunk ${startPage}-${endPage}`,
                    2 // Only retry embeddings twice
                  );
                } catch (embError) {
                  // Log embedding errors but don't fail the whole process
                  console.warn(`[SEQUENTIAL] Embedding generation failed for chunk ${startPage}-${endPage}:`, embError);
                }
              }
                
            } catch (error) {
              // After all retries failed, record the failure
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`[SEQUENTIAL] Chunk ${startPage}-${endPage} permanently failed:`, errorMessage);
              
              failedChunks.push({ 
                startPage, 
                endPage, 
                error: errorMessage 
              });
              
              // Update document to show which chunks failed
              await supabase
                .from('documents')
                .update({ 
                  content_text: `Processing large document: ${completedPages}/${totalPages} pages completed (${completedChunks.size}/${chunks.length} chunks, ${failedChunks.length} failed)`
                })
                .eq('id', documentId);
            }
          }
        );

        console.log(`All chunks processed. Completed: ${completedChunks.size}, Failed: ${failedChunks.length}`);

        // Check if any chunks failed permanently
        if (failedChunks.length > 0) {
          console.error(`Document processing completed with ${failedChunks.length} failed chunks:`, failedChunks);
          
          // Update document with partial completion status
          await supabase
            .from('documents')
            .update({ 
              status: 'error',
              content_text: `Processing partially failed: ${completedChunks.size}/${chunks.length} chunks completed. Failed chunks: ${failedChunks.map(c => `pages ${c.startPage}-${c.endPage}`).join(', ')}`
            })
            .eq('id', documentId);
          
          throw new Error(`Processing failed for ${failedChunks.length} chunks out of ${chunks.length}`);
        }

        console.log(`All chunks processed successfully. Total chunks: ${chunks.length}`);

        // Merge all chunks and finalize document with retry
        await retryWithBackoff(
          async () => {
            console.log('Merging chunks...');
            const { data: mergeData, error: mergeError } = await supabase.functions.invoke(
              'merge-document-chunks',
              { 
                body: { documentId: documentId, totalPages: totalPages },
                headers: { Authorization: extractAuthHeader }
              }
            );

            if (mergeError) {
              throw new Error(`Merge error: ${mergeError.message || JSON.stringify(mergeError)}`);
            }
            
            if (!mergeData?.success) {
              throw new Error('Merge operation returned unsuccessful result');
            }
            
            return mergeData;
          },
          'Chunk merging'
        );

        console.log(`Document ${documentId} processing complete. All embeddings generated during chunk processing.`);

      } catch (error) {
        console.error('Background processing error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Update document with error status
        await supabase
          .from('documents')
          .update({ 
            status: 'error',
            content_text: `Processing failed: ${errorMessage}`
          })
          .eq('id', documentId);
      }
    })().catch(err => console.error('Background task error:', err));

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Started background processing for ${totalPages} pages`,
        totalPages: totalPages,
        chunkSize: CHUNK_SIZE
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Process large document error:', error);
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