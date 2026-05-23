import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BarChart3, MessageSquare, FileText, TrendingUp, Clock, Target, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface AnalyticsSummary {
  totalQueries: number;
  totalConversations: number;
  avgResponseTime: number;
  avgDocsReferenced: number;
  queriesLast7Days: number;
  queriesLast30Days: number;
}

interface PopularQuery {
  query_text: string;
  query_count: number;
  avg_response_length: number;
  avg_documents_referenced: number;
}

interface DocumentAccess {
  document_id: string;
  document_title: string;
  access_count: number;
  avg_relevance: number;
  last_accessed: string;
}

const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [popularQueries, setPopularQueries] = useState<PopularQuery[]>([]);
  const [documentAccess, setDocumentAccess] = useState<DocumentAccess[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load summary statistics
      // @ts-ignore - Supabase types not yet regenerated
      const { data: queries } = await supabase
        .from('analytics_queries')
        .select('*')
        .eq('user_id', user.id);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const queriesLast7Days = (queries || []).filter(
        (q: any) => new Date(q.created_at) >= sevenDaysAgo
      ).length;

      const queriesLast30Days = (queries || []).filter(
        (q: any) => new Date(q.created_at) >= thirtyDaysAgo
      ).length;

      // @ts-ignore - Supabase types not yet regenerated
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id);

      const avgResponseTime = queries && queries.length > 0
        ? queries.reduce((sum: number, q: any) => sum + (q.execution_time_ms || 0), 0) / queries.length
        : 0;

      const avgDocsReferenced = queries && queries.length > 0
        ? queries.reduce((sum: number, q: any) => sum + (q.documents_referenced || 0), 0) / queries.length
        : 0;

      setSummary({
        totalQueries: queries?.length || 0,
        totalConversations: conversations?.length || 0,
        avgResponseTime: Math.round(avgResponseTime),
        avgDocsReferenced: Math.round(avgDocsReferenced * 10) / 10,
        queriesLast7Days,
        queriesLast30Days,
      });

      // Load popular queries
      // @ts-ignore - Supabase types not yet regenerated
      const { data: popular } = await supabase.rpc('get_popular_queries', {
        filter_user_id: user.id,
        limit_count: 10
      });

      setPopularQueries(popular || []);

      // Load document access stats
      // @ts-ignore - Supabase types not yet regenerated
      const { data: docStats } = await supabase.rpc('get_document_access_stats', {
        filter_user_id: user.id,
        limit_count: 10
      });

      setDocumentAccess(docStats || []);
    } catch (error: any) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track your AI assistant usage and file access patterns
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalQueries || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.queriesLast7Days || 0} in last 7 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalConversations || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active chat sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.avgResponseTime || 0}ms</div>
              <p className="text-xs text-muted-foreground mt-1">
                Per query average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Files Referenced</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.avgDocsReferenced || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Files per query
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Popular Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Popular Queries
              </CardTitle>
              <CardDescription>Most frequently asked questions (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {popularQueries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No queries yet. Start using the AI assistant!
                </div>
              ) : (
                <div className="space-y-4">
                  {popularQueries.map((query, index) => (
                    <div key={index} className="border-b border-border pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium line-clamp-2 flex-1">
                          {query.query_text}
                        </p>
                        <Badge variant="secondary" className="flex-shrink-0">
                          {query.query_count}x
                        </Badge>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Avg response: {Math.round(query.avg_response_length)} chars</span>
                        <span>•</span>
                        <span>Docs: {query.avg_documents_referenced.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document Access Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Most Accessed Files
              </CardTitle>
              <CardDescription>Files referenced by AI queries (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {documentAccess.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No file access data yet
                </div>
              ) : (
                <div className="space-y-4">
                  {documentAccess.map((doc, index) => (
                    <div key={doc.document_id} className="border-b border-border pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1">
                          <p className="text-sm font-medium line-clamp-1">
                            {doc.document_title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last accessed: {format(new Date(doc.last_accessed), "MMM d, yyyy")}
                          </p>
                        </div>
                        <Badge variant="outline" className="flex-shrink-0">
                          {doc.access_count}x
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${Math.min(doc.avg_relevance * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {(doc.avg_relevance * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Trends</CardTitle>
            <CardDescription>Query activity over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Last 7 days</span>
                <span className="text-sm font-medium">{summary?.queriesLast7Days || 0} queries</span>
              </div>
              <div className="flex-1 bg-muted rounded-full h-3">
                <div
                  className="bg-primary rounded-full h-3 transition-all"
                  style={{
                    width: `${summary?.totalQueries ? (summary.queriesLast7Days / summary.totalQueries) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Last 30 days</span>
                <span className="text-sm font-medium">{summary?.queriesLast30Days || 0} queries</span>
              </div>
              <div className="flex-1 bg-muted rounded-full h-3">
                <div
                  className="bg-secondary rounded-full h-3 transition-all"
                  style={{
                    width: `${summary?.totalQueries ? (summary.queriesLast30Days / summary.totalQueries) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Analytics;