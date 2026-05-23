import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RequestSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  onSuccess: () => void;
}

interface Signer {
  email: string;
  order: number;
}

export const RequestSignatureDialog = ({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onSuccess,
}: RequestSignatureDialogProps) => {
  const [signers, setSigners] = useState<Signer[]>([{ email: "", order: 0 }]);
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddSigner = () => {
    setSigners([...signers, { email: "", order: signers.length }]);
  };

  const handleRemoveSigner = (index: number) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const handleSignerEmailChange = (index: number, email: string) => {
    const newSigners = [...signers];
    newSigners[index].email = email;
    setSigners(newSigners);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate signers
    const validSigners = signers.filter((s) => s.email.trim() !== "");
    if (validSigners.length === 0) {
      toast.error("Please add at least one signer");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validSigners.filter((s) => !emailRegex.test(s.email));
    if (invalidEmails.length > 0) {
      toast.error("Please enter valid email addresses");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create signature request
      const { data: signatureRequest, error: requestError } = await supabase
        .from("signature_requests")
        .insert({
          document_id: documentId,
          requested_by: user.id,
          message: message || null,
          due_date: dueDate || null,
          status: "pending",
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Add signers
      const signersData = validSigners.map((signer, index) => ({
        signature_request_id: signatureRequest.id,
        signer_email: signer.email.toLowerCase().trim(),
        order_index: index,
        status: "pending",
      }));

      const { error: signersError } = await supabase
        .from("document_signers")
        .insert(signersData);

      if (signersError) throw signersError;

      toast.success(`Signature request sent to ${validSigners.length} recipient(s)`);
      onSuccess();
      onOpenChange(false);
      
      // Reset form
      setSigners([{ email: "", order: 0 }]);
      setMessage("");
      setDueDate("");
    } catch (error: any) {
      console.error("Error creating signature request:", error);
      toast.error(error.message || "Failed to create signature request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request Signatures</DialogTitle>
          <DialogDescription>
            Request signatures for: <span className="font-medium">{documentTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Signers</Label>
            {signers.map((signer, index) => (
              <div key={index} className="flex gap-2 items-center">
                <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                  {index + 1}
                </Badge>
                <Input
                  type="email"
                  placeholder="signer@example.com"
                  value={signer.email}
                  onChange={(e) => handleSignerEmailChange(index, e.target.value)}
                  className="flex-1"
                />
                {signers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSigner(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSigner}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Signer
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message for the signers..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="due-date">Due Date (Optional)</Label>
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Request"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
