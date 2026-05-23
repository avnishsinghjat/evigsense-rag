import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { documentId, signerId, signatureData, signerEmail, signedAt } = await req.json();

    console.log(`Appending signature page for document: ${documentId}, signer: ${signerEmail}`);

    // Get document storage path
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path, title, original_filename, mime_type')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error('Document not found:', docError);
      throw new Error('Document not found');
    }

    // Only process PDFs
    if (!document.mime_type?.includes('pdf')) {
      console.log('Not a PDF, skipping signature page append');
      return new Response(
        JSON.stringify({ success: true, message: 'Signature page only applies to PDFs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download the PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !pdfData) {
      console.error('Failed to download PDF:', downloadError);
      throw new Error('Failed to download PDF');
    }

    console.log('PDF downloaded successfully');

    // Load the PDF
    const pdfBytes = await pdfData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Add a new page for the signature
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    // Embed fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Draw header
    page.drawText('SIGNATURE VERIFICATION PAGE', {
      x: 50,
      y: height - 60,
      size: 18,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.4),
    });

    // Draw separator line
    page.drawLine({
      start: { x: 50, y: height - 75 },
      end: { x: width - 50, y: height - 75 },
      thickness: 2,
      color: rgb(0.1, 0.1, 0.4),
    });

    // Document info section
    let yPosition = height - 120;
    const lineHeight = 25;

    page.drawText('Document Information', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight;

    page.drawText(`Document Title: ${document.title}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight;

    page.drawText(`Original Filename: ${document.original_filename}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight * 1.5;

    // Signature details section
    page.drawText('Signature Details', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= lineHeight;

    page.drawText(`Signer Email: ${signerEmail}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight;

    const signedDate = new Date(signedAt);
    const formattedDate = signedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = signedDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    page.drawText(`Signed Date: ${formattedDate}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight;

    page.drawText(`Signed Time: ${formattedTime}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight;

    page.drawText(`Signer ID: ${signerId}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= lineHeight * 1.5;

    // Signature image section
    page.drawText('Signature:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    // Draw signature box
    const signatureBoxWidth = 300;
    const signatureBoxHeight = 100;
    page.drawRectangle({
      x: 50,
      y: yPosition - signatureBoxHeight,
      width: signatureBoxWidth,
      height: signatureBoxHeight,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    });

    // Embed the signature image if it's a data URL
    if (signatureData && signatureData.startsWith('data:image')) {
      try {
        const base64Data = signatureData.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        let image;
        if (signatureData.includes('image/png')) {
          image = await pdfDoc.embedPng(imageBytes);
        } else if (signatureData.includes('image/jpeg') || signatureData.includes('image/jpg')) {
          image = await pdfDoc.embedJpg(imageBytes);
        }

        if (image) {
          const scaleFactor = Math.min(
            (signatureBoxWidth - 20) / image.width,
            (signatureBoxHeight - 20) / image.height
          );
          const scaledWidth = image.width * scaleFactor;
          const scaledHeight = image.height * scaleFactor;

          page.drawImage(image, {
            x: 50 + (signatureBoxWidth - scaledWidth) / 2,
            y: yPosition - signatureBoxHeight + (signatureBoxHeight - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight,
          });
        }
      } catch (imgError) {
        console.error('Error embedding signature image:', imgError);
        // Continue without the image
        page.drawText('[Signature on file]', {
          x: 100,
          y: yPosition - 55,
          size: 12,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });
      }
    }

    yPosition -= signatureBoxHeight + 40;

    // Legal text
    page.drawText('This document has been electronically signed.', {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    yPosition -= 18;

    page.drawText('The signature above constitutes a legally binding electronic signature under applicable law.', {
      x: 50,
      y: yPosition,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Footer
    page.drawLine({
      start: { x: 50, y: 50 },
      end: { x: width - 50, y: 50 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    page.drawText(`Page ${pdfDoc.getPageCount()} - Signature Verification`, {
      x: 50,
      y: 30,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    const generationDate = new Date().toISOString();
    page.drawText(`Generated: ${generationDate}`, {
      x: width - 200,
      y: 30,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    
    console.log('Signature page added, uploading modified PDF');

    // Upload the modified PDF back to storage (overwrite)
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(document.storage_path, modifiedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Failed to upload modified PDF:', uploadError);
      throw new Error('Failed to upload modified PDF');
    }

    console.log('Modified PDF uploaded successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Signature page appended successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error appending signature page:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to append signature page';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
