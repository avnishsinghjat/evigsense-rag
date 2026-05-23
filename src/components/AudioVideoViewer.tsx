import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface AudioVideoViewerProps {
  url: string;
  mimeType: string;
  title: string;
  transcription?: string;
}

export function AudioVideoViewer({ url, mimeType, title, transcription }: AudioVideoViewerProps) {
  const [activeTab, setActiveTab] = useState("player");
  const isVideo = mimeType?.startsWith('video/');

  return (
    <div className="w-full h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="player">
            {isVideo ? 'Video Player' : 'Audio Player'}
          </TabsTrigger>
          <TabsTrigger value="transcription">
            Transcription
            {transcription && <Badge variant="secondary" className="ml-2">Available</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="player" className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {isVideo ? 'Video playback' : 'Audio playback'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {isVideo ? (
                <video
                  controls
                  className="w-full max-h-[600px]"
                  src={url}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <audio
                  controls
                  className="w-full"
                  src={url}
                >
                  Your browser does not support the audio tag.
                </audio>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcription" className="flex-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Transcription</CardTitle>
              <CardDescription>
                {transcription ? 'AI-generated transcription' : 'No transcription available'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transcription ? (
                <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                  <p className="whitespace-pre-wrap">{transcription}</p>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <p>No transcription available for this media file.</p>
                  <p className="text-sm mt-2">Use the "Extract Audio" button to generate transcription.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
