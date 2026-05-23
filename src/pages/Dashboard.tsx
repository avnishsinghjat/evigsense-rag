import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Search, MessageSquare, TrendingUp, Upload, Edit, Users, Clock, CheckCircle, AlertCircle, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    documents: 0,
    recentSearches: 0,
    assistantQueries: 0,
    pendingSignatures: 0,
    documentsByStatus: [] as { name: string; value: number; color: string }[],
  });
  const [queryTrend, setQueryTrend] = useState<{ date: string; queries: number }[]>([]);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);

  useEffect(() => {
    checkAuth();
    loadStats();
  }, []);

  const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/auth");
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get documents count and by status
      const { data: documents } = await supabase
        .from("documents")
        .select("id, status, created_at, title");
      
      const docCount = documents?.length || 0;
      
      // Group documents by status
      const statusGroups = documents?.reduce((acc: any, doc) => {
        const status = doc.status || 'draft';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {};

      const statusColors: Record<string, string> = {
        active: 'hsl(var(--chart-1))',
        draft: 'hsl(var(--chart-2))',
        archived: 'hsl(var(--chart-3))',
      };

      const documentsByStatus = Object.entries(statusGroups).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: value as number,
        color: statusColors[name] || 'hsl(var(--chart-4))',
      }));
      
      // Get recent documents
      const recentDocuments = documents
        ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5) || [];
      
      // Get recent searches (queries from last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: recentQueries } = await supabase
        .from("analytics_queries")
        .select("id", { count: "exact" })
        .gte("created_at", sevenDaysAgo.toISOString());
      
      // Get total AI queries count
      const { data: allQueries } = await supabase
        .from("analytics_queries")
        .select("id, created_at", { count: "exact" });

      // Calculate query trend for last 7 days
      const trend: { date: string; queries: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const dayQueries = allQueries?.filter(q => {
          const qDate = new Date(q.created_at);
          return qDate.toDateString() === date.toDateString();
        }).length || 0;
        
        trend.push({ date: dateStr, queries: dayQueries });
      }

      // Get pending signatures
      const { count: pendingSigCount } = await supabase
        .from("document_signers")
        .select("*", { count: "exact", head: true })
        .or(`signer_user_id.eq.${user.id},signer_email.eq.${user.email}`)
        .eq("status", "pending");
      
      setStats({
        documents: docCount,
        recentSearches: recentQueries?.length || 0,
        assistantQueries: allQueries?.length || 0,
        pendingSignatures: pendingSigCount || 0,
        documentsByStatus,
      });
      setQueryTrend(trend);
      setRecentDocs(recentDocuments);
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Total Files",
      value: stats.documents,
      icon: FileText,
      description: "Files in library",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Recent Searches",
      value: stats.recentSearches,
      icon: Search,
      description: "This week",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "AI Queries",
      value: stats.assistantQueries,
      icon: MessageSquare,
      description: "Total asked",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Pending Signatures",
      value: stats.pendingSignatures,
      icon: FileSignature,
      description: "Awaiting your action",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const quickActions = [
    {
      title: "Upload File",
      icon: Upload,
      description: "Add new files",
      action: () => navigate("/documents"),
      variant: "default" as const,
    },
    {
      title: "Search",
      icon: Search,
      description: "Find files",
      action: () => navigate("/search"),
      variant: "secondary" as const,
    },
    {
      title: "AI Assistant",
      icon: MessageSquare,
      description: "Ask questions",
      action: () => navigate("/assistant"),
      variant: "secondary" as const,
    },
    {
      title: "Sign Files",
      icon: FileSignature,
      description: "Pending signatures",
      action: () => navigate("/signature-requests"),
      variant: "secondary" as const,
    },
    {
      title: "Manage Metadata",
      icon: Edit,
      description: "Organize files",
      action: () => navigate("/document-management"),
      variant: "outline" as const,
    },
    {
      title: "Analytics",
      icon: TrendingUp,
      description: "View insights",
      action: () => navigate("/analytics"),
      variant: "outline" as const,
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to EVIGSENSE - Your intelligent file management system
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Query Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                AI Query Activity
              </CardTitle>
              <CardDescription>Queries over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={queryTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="queries" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Document Status Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                File Status
              </CardTitle>
              <CardDescription>Files by current status</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {stats.documentsByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.documentsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {stats.documentsByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No files yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Access common tasks quickly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickActions.map((action) => (
                <Button
                  key={action.title}
                  variant={action.variant}
                  onClick={action.action}
                  className="h-auto flex-col gap-2 p-4"
                >
                  <action.icon className="h-6 w-6" />
                  <div className="text-center">
                    <div className="font-semibold text-sm">{action.title}</div>
                    <div className="text-xs opacity-70">{action.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Files
            </CardTitle>
            <CardDescription>Your latest uploads</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDocs.length > 0 ? (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => navigate("/documents")}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {doc.status === 'active' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : doc.status === 'draft' ? (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No files yet. Upload your first file to get started!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;