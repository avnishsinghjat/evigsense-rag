import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Search, MessageSquare, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <FileText className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              EVIGSENSE
            </h1>
          </div>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Your intelligent file management system powered by AI. Store, search, and understand
            your files with advanced RAG technology.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="shadow-lg">
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
              <FileText className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">File Management</h3>
              <p className="text-sm text-muted-foreground">
                Upload, organize, and manage your files with version control and tagging
              </p>
            </div>

            <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
              <Search className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Semantic Search</h3>
              <p className="text-sm text-muted-foreground">
                Find files instantly with hybrid keyword and vector-based search
              </p>
            </div>

            <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
              <MessageSquare className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">AI Assistant</h3>
              <p className="text-sm text-muted-foreground">
                Ask questions and get answers strictly from your indexed files
              </p>
            </div>
          </div>

          <div className="mt-16 p-6 rounded-lg border bg-card/50">
            <Shield className="h-10 w-10 text-primary mb-4 mx-auto" />
            <h3 className="font-semibold mb-2">Enterprise-Grade Security</h3>
            <p className="text-sm text-muted-foreground">
              Role-based access control, file sensitivity levels, and comprehensive audit logging
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
