import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2 } from "lucide-react";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { format } from "date-fns";

interface SignerInfo {
  id: string;
  signature_request_id: string;
  signer_email: string;
  order_index: number;
  status: string;
  signatureRequest: {
    id: string;
    document_id: string;
    message: string | null;
    due_date: string | null;
    document: {
      title: string;
      original_filename: string;
      mime_type: string;
    };
  };
}

const Sign = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const signerId = searchParams.get("signer");
  
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signerInfo, setSignerInfo] = useState<SignerInfo | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  useEffect(() => {
    if (signerId) {
      loadSignerInfo();
    } else {
      toast.error("Invalid signature request link");
      navigate("/");
    }
  }, [signerId]);

  const loadSignerInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("document_signers")
        .select(`
          *,
          signatureRequest:signature_requests (
            id,
            document_id,
            message,
            due_date,
            document:documents (
              title,
              original_filename,
              mime_type
            )
          )
        `)
        .eq("id", signerId)
        .single();

      if (error) throw error;
      
      if (!data) {
        toast.error("Signature request not found");
        navigate("/");
        return;
      }

      setSignerInfo(data as any);
    } catch (error: any) {
      console.error("Error loading signer info:", error);
      toast.error("Failed to load signature request");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (signatureData: string, signatureType: 'drawn' | 'typed' | 'uploaded') => {
    if (!signerInfo) return;

    setSigning(true);
    const signedAt = new Date().toISOString();
    
    try {
      // Create signature record
      const { error: signatureError } = await supabase
        .from("signatures")
        .insert({
          document_signer_id: signerInfo.id,
          signature_data: signatureData,
          signature_type: signatureType,
          ip_address: null, // Could be populated via an edge function
          user_agent: navigator.userAgent,
        });

      if (signatureError) throw signatureError;

      // Update signer status
      const { error: updateError } = await supabase
        .from("document_signers")
        .update({
          status: "signed",
          signed_at: signedAt,
        })
        .eq("id", signerInfo.id);

      if (updateError) throw updateError;

      // Append signature page to PDF
      try {
        const { error: appendError } = await supabase.functions.invoke('append-signature-page', {
          body: {
            documentId: signerInfo.signatureRequest.document_id,
            signerId: signerInfo.id,
            signatureData: signatureData,
            signerEmail: signerInfo.signer_email,
            signedAt: signedAt,
          },
        });

        if (appendError) {
          console.error("Error appending signature page:", appendError);
          // Don't fail the signing process if page append fails
        }
      } catch (appendErr) {
        console.error("Error calling append-signature-page:", appendErr);
        // Don't fail the signing process if page append fails
      }

      toast.success("Document signed successfully!");
      loadSignerInfo(); // Reload to show updated status
      setShowSignaturePad(false);
    } catch (error: any) {
      console.error("Error signing document:", error);
      toast.error(error.message || "Failed to sign document");
    } finally {
      setSigning(false);
    }
  };

  const handlePreviewDocument = async () => {
    if (!signerInfo) return;

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", signerInfo.signatureRequest.document_id)
        .single();

      if (error) throw error;

      const { data: signedUrl, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 3600);

      if (urlError) throw urlError;

      window.open(signedUrl.signedUrl, "_blank");
    } catch (error: any) {
      console.error("Error previewing document:", error);
      toast.error("Failed to preview file");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!signerInfo) {
    return null;
  }

  const isAlreadySigned = signerInfo.status === "signed";
  const isExpired = signerInfo.signatureRequest.due_date && 
    new Date(signerInfo.signatureRequest.due_date) < new Date();

  return (
    <Layout>
      <div className="container max-w-4xl py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Document Signature Request</h1>
          <p className="text-muted-foreground">
            You've been requested to sign the following document
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {signerInfo.signatureRequest.document.title}
                </CardTitle>
                <CardDescription>
                  {signerInfo.signatureRequest.document.original_filename}
                </CardDescription>
              </div>
              {isAlreadySigned && (
                <Badge className="bg-green-500">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Signed
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Signer Email</p>
              <p className="text-sm text-muted-foreground">{signerInfo.signer_email}</p>
            </div>

            {signerInfo.signatureRequest.due_date && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Due Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(signerInfo.signatureRequest.due_date), "MMMM d, yyyy")}
                  {isExpired && <Badge variant="destructive" className="ml-2">Expired</Badge>}
                </p>
              </div>
            )}

            {signerInfo.signatureRequest.message && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Message</p>
                <div className="bg-muted/50 rounded-md p-3">
                  <p className="text-sm">{signerInfo.signatureRequest.message}</p>
                </div>
              </div>
            )}

            {isAlreadySigned && signerInfo.status === "signed" && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-4">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✓ You signed this document on {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={handlePreviewDocument} className="flex-1">
                Preview File
              </Button>
              
              {!isAlreadySigned && !isExpired && (
                <Button 
                  onClick={() => setShowSignaturePad(true)} 
                  className="flex-1"
                  disabled={signing}
                >
                  {signing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    "Sign Document"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {showSignaturePad && !isAlreadySigned && (
          <SignaturePad
            onSave={handleSign}
            onCancel={() => setShowSignaturePad(false)}
          />
        )}
      </div>
    </Layout>
  );
};

export default Sign;
