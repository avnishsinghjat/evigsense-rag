import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Clock, XCircle, FileSignature } from "lucide-react";
import { format } from "date-fns";

interface SignatureRequest {
  id: string;
  status: string;
  message: string | null;
  due_date: string | null;
  created_at: string;
  signers: SignerStatus[];
}

interface SignerStatus {
  id: string;
  signer_email: string;
  order_index: number;
  status: string;
  signed_at: string | null;
  declined_reason: string | null;
}

interface SignatureStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
}

export const SignatureStatusDialog = ({
  open,
  onOpenChange,
  documentId,
  documentTitle,
}: SignatureStatusDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<SignatureRequest[]>([]);

  useEffect(() => {
    if (open) {
      loadSignatureRequests();
    }
  }, [open, documentId]);

  const loadSignatureRequests = async () => {
    try {
      setLoading(true);

      // Fetch signature requests
      const { data: requestsData, error: requestsError } = await supabase
        .from("signature_requests")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch signers for each request
      const requestsWithSigners = await Promise.all(
        (requestsData || []).map(async (request) => {
          const { data: signersData, error: signersError } = await supabase
            .from("document_signers")
            .select("*")
            .eq("signature_request_id", request.id)
            .order("order_index");

          if (signersError) throw signersError;

          return {
            ...request,
            signers: signersData || [],
          };
        })
      );

      setRequests(requestsWithSigners);
    } catch (error: any) {
      console.error("Error loading signature requests:", error);
      toast.error("Failed to load signature requests");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "signed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "declined":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      completed: "default",
      cancelled: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Signature Requests
          </DialogTitle>
          <DialogDescription>{documentTitle}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No signature requests for this document
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Created {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        {request.due_date && (
                          <p className="text-sm text-muted-foreground">
                            Due by {format(new Date(request.due_date), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      {getStatusBadge(request.status)}
                    </div>

                    {request.message && (
                      <div className="bg-muted/50 rounded-md p-3">
                        <p className="text-sm">{request.message}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Signers</p>
                      <div className="space-y-2">
                        {request.signers.map((signer, index) => (
                          <div
                            key={signer.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                                {index + 1}
                              </Badge>
                              <div>
                                <p className="font-medium">{signer.signer_email}</p>
                                {signer.signed_at && (
                                  <p className="text-xs text-muted-foreground">
                                    Signed {format(new Date(signer.signed_at), "MMM d, yyyy 'at' h:mm a")}
                                  </p>
                                )}
                                {signer.declined_reason && (
                                  <p className="text-xs text-red-500">
                                    Declined: {signer.declined_reason}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(signer.status)}
                              <span className="text-sm capitalize">{signer.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
