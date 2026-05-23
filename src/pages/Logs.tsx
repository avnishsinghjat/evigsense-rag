import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RefreshCw, Download } from "lucide-react";
import { format } from "date-fns";

interface Log {
  id: string;
  created_at: string;
  level: string;
  source: string;
  message: string;
  context: any;
  user_id: string | null;
  session_id: string | null;
  url: string | null;
  user_agent: string | null;
}

export default function Logs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['application-logs', levelFilter, sourceFilter],
    queryFn: async () => {
      let query = supabase
        .from('application_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (levelFilter !== 'all') {
        query = query.eq('level', levelFilter);
      }

      if (sourceFilter !== 'all') {
        query = query.eq('source', sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Log[];
    },
  });

  const { data: sources } = useQuery({
    queryKey: ['log-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('application_logs')
        .select('source')
        .order('source');
      
      if (error) throw error;
      
      // Get unique sources
      const uniqueSources = [...new Set(data.map(item => item.source))];
      return uniqueSources;
    },
  });

  const filteredLogs = logs?.filter(log => 
    searchTerm === "" || 
    log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.source.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'debug': return 'bg-muted text-muted-foreground';
      case 'info': return 'bg-blue-500/10 text-blue-500';
      case 'warn': return 'bg-yellow-500/10 text-yellow-500';
      case 'error': return 'bg-red-500/10 text-red-500';
      case 'fatal': return 'bg-red-900/10 text-red-900';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const exportLogs = () => {
    if (!filteredLogs) return;
    
    const csv = [
      ['Timestamp', 'Level', 'Source', 'Message', 'User ID', 'Session ID'],
      ...filteredLogs.map(log => [
        log.created_at,
        log.level,
        log.source,
        log.message,
        log.user_id || '',
        log.session_id || '',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    a.click();
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Application Logs</h1>
            <p className="text-muted-foreground">Monitor and debug application events</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="fatal">Fatal</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sources?.map(source => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ScrollArea className="h-[600px] pr-4">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
                ) : filteredLogs && filteredLogs.length > 0 ? (
                  <div className="space-y-2">
                    {filteredLogs.map((log) => (
                      <Card
                        key={log.id}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedLog?.id === log.id ? 'border-primary' : ''
                        }`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <Badge className={getLevelColor(log.level)}>
                              {log.level.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                            </span>
                          </div>
                          <div className="text-sm font-medium mb-1">{log.source}</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {log.message}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No logs found matching your filters
                  </div>
                )}
              </ScrollArea>

              <Card className="h-[600px]">
                <CardHeader>
                  <CardTitle>Log Details</CardTitle>
                  <CardDescription>
                    {selectedLog ? 'Full log entry information' : 'Select a log to view details'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedLog ? (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm font-medium mb-1">Timestamp</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(selectedLog.created_at), 'PPpp')}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-1">Level</div>
                          <Badge className={getLevelColor(selectedLog.level)}>
                            {selectedLog.level.toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-1">Source</div>
                          <div className="text-sm text-muted-foreground">{selectedLog.source}</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-1">Message</div>
                          <div className="text-sm text-muted-foreground">{selectedLog.message}</div>
                        </div>
                        {selectedLog.url && (
                          <div>
                            <div className="text-sm font-medium mb-1">URL</div>
                            <div className="text-sm text-muted-foreground break-all">{selectedLog.url}</div>
                          </div>
                        )}
                        {selectedLog.user_id && (
                          <div>
                            <div className="text-sm font-medium mb-1">User ID</div>
                            <div className="text-sm text-muted-foreground font-mono">{selectedLog.user_id}</div>
                          </div>
                        )}
                        {selectedLog.session_id && (
                          <div>
                            <div className="text-sm font-medium mb-1">Session ID</div>
                            <div className="text-sm text-muted-foreground font-mono">{selectedLog.session_id}</div>
                          </div>
                        )}
                        {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                          <div>
                            <div className="text-sm font-medium mb-1">Context</div>
                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                              {JSON.stringify(selectedLog.context, null, 2)}
                            </pre>
                          </div>
                        )}
                        {selectedLog.user_agent && (
                          <div>
                            <div className="text-sm font-medium mb-1">User Agent</div>
                            <div className="text-xs text-muted-foreground break-all">{selectedLog.user_agent}</div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-[500px] text-muted-foreground">
                      Select a log entry to view details
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
