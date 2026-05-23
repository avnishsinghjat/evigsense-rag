import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw, Check } from "lucide-react";

interface SignaturePadProps {
  onSave: (signatureData: string, signatureType: 'drawn' | 'typed' | 'uploaded') => void;
  onCancel: () => void;
}

export const SignaturePad = ({ onSave, onCancel }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePadLib | null>(null);
  const [typedName, setTypedName] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current && !signaturePadRef.current) {
      signaturePadRef.current = new SignaturePadLib(canvasRef.current, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(0, 0, 0)",
      });

      // Resize canvas to match container
      const resizeCanvas = () => {
        if (canvasRef.current && signaturePadRef.current) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          const canvas = canvasRef.current;
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d")?.scale(ratio, ratio);
          signaturePadRef.current.clear();
        }
      };

      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);

      return () => {
        window.removeEventListener("resize", resizeCanvas);
      };
    }
  }, []);

  const handleClear = () => {
    signaturePadRef.current?.clear();
  };

  const handleSaveDrawn = () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL();
      onSave(dataUrl, 'drawn');
    }
  };

  const handleSaveTyped = () => {
    if (!typedName.trim()) return;

    // Create a canvas to render the typed signature
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "48px 'Dancing Script', cursive";
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
      
      const dataUrl = canvas.toDataURL();
      onSave(dataUrl, 'typed');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setUploadedImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveUploaded = () => {
    if (uploadedImage) {
      onSave(uploadedImage, 'uploaded');
    }
  };

  return (
    <Card className="p-6">
      <Tabs defaultValue="draw" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw">Draw</TabsTrigger>
          <TabsTrigger value="type">Type</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="space-y-4">
          <div className="border border-border rounded-lg overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              className="w-full touch-none"
              style={{ height: "200px" }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClear}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveDrawn}>
              <Check className="h-4 w-4 mr-2" />
              Sign Document
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="type" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="typed-name">Type your full name</Label>
            <Input
              id="typed-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="John Doe"
              className="text-2xl font-serif"
              style={{ fontFamily: "'Dancing Script', cursive" }}
            />
          </div>
          {typedName && (
            <div className="border border-border rounded-lg p-8 bg-white text-center">
              <p
                className="text-5xl"
                style={{ fontFamily: "'Dancing Script', cursive" }}
              >
                {typedName}
              </p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveTyped} disabled={!typedName.trim()}>
              <Check className="h-4 w-4 mr-2" />
              Sign Document
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signature-upload">Upload signature image</Label>
            <Input
              id="signature-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>
          {uploadedImage && (
            <div className="border border-border rounded-lg p-4 bg-white text-center">
              <img
                src={uploadedImage}
                alt="Uploaded signature"
                className="max-h-32 mx-auto"
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveUploaded} disabled={!uploadedImage}>
              <Check className="h-4 w-4 mr-2" />
              Sign Document
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};
