# Application Logging System

## Overview

The application includes a comprehensive logging system for debugging and monitoring. Logs are automatically collected, buffered, and sent to the backend for persistent storage.

## Features

- **5 Log Levels**: debug, info, warn, error, fatal
- **Automatic Buffering**: Logs are batched and sent every 5 seconds or when buffer is full (50 entries)
- **Session Tracking**: Each browser session gets a unique ID
- **User Association**: Logs are automatically linked to authenticated users
- **Context Support**: Add structured metadata to any log entry
- **Development Console**: Logs also appear in browser console during development
- **Persistent Storage**: All logs stored in database with 30-day retention
- **Real-time Monitoring**: View and filter logs through the UI

## Usage

### Basic Logging

```typescript
import { logger } from "@/lib/logger";

// Log levels
logger.debug('ComponentName', 'Detailed debug information');
logger.info('ComponentName', 'Informational message');
logger.warn('ComponentName', 'Warning message');
logger.error('ComponentName', 'Error occurred');
logger.fatal('ComponentName', 'Critical system failure');
```

### Logging with Context

Add structured metadata to provide additional information:

```typescript
// Simple context
logger.info('Upload', 'File uploaded', { 
  fileName: 'document.pdf',
  fileSize: 1024000 
});

// Error with stack trace
try {
  // some code
} catch (error) {
  logger.error('Processing', 'Failed to process document', {
    error: error.message,
    stack: error.stack,
    documentId: doc.id
  });
}

// Performance tracking
const startTime = Date.now();
// ... do work ...
logger.debug('Performance', 'Operation completed', {
  duration: Date.now() - startTime,
  operation: 'embeddings'
});
```

### Source Names

Use descriptive source names that identify where the log came from:
- Component names: `'DocumentUpload'`, `'PDFViewer'`
- Feature names: `'Search'`, `'Authentication'`
- Edge function names: `'generate-embeddings'`, `'rag-assistant'`

## Monitoring Logs

### Access the Logs Page

Navigate to `/logs` or click "Logs" in the sidebar to access the monitoring interface.

### Features

- **Real-time Updates**: Logs appear automatically as they're generated
- **Search**: Filter logs by message content or source
- **Level Filter**: View only specific log levels (debug, info, warn, error, fatal)
- **Source Filter**: Filter by specific components or features
- **Detail View**: Click any log to see full details including context, user info, and session data
- **Export**: Download logs as CSV for external analysis

### Security

- **RLS Policies**: Users can only view their own logs (unless admin)
- **Admin Access**: Admins can view all system logs
- **Automatic Cleanup**: Logs older than 30 days are automatically deleted

## Edge Function Logging

For edge functions, use standard console methods - they're automatically captured:

```typescript
// In edge functions
console.log('Info message');
console.warn('Warning message');
console.error('Error message');
```

View edge function logs via:
```
Lovable Cloud → Functions → [function-name] → Logs
```

## Best Practices

1. **Use Appropriate Levels**
   - `debug`: Detailed info for debugging (e.g., variable values)
   - `info`: Normal operational messages (e.g., "User logged in")
   - `warn`: Unexpected but handled situations (e.g., "Retry attempt 2")
   - `error`: Errors that need attention (e.g., "Failed to upload file")
   - `fatal`: Critical failures requiring immediate action

2. **Meaningful Messages**
   - Good: `'Upload failed due to network timeout'`
   - Bad: `'Error'`

3. **Add Context**
   - Always include relevant IDs, timestamps, or state information
   - Help future debugging by including what was being attempted

4. **Avoid Sensitive Data**
   - Don't log passwords, tokens, or PII
   - Be careful with user data in context objects

5. **Performance Considerations**
   - Logs are buffered automatically - don't worry about performance
   - Use `debug` level for verbose logging
   - Production environments can filter out debug logs

## Database Schema

Logs are stored in `application_logs` table:

```sql
- id: UUID (primary key)
- created_at: Timestamp
- level: Text (debug|info|warn|error|fatal)
- source: Text (component/feature name)
- message: Text (log message)
- context: JSONB (structured metadata)
- user_id: UUID (linked to auth.users)
- session_id: Text (browser session)
- url: Text (page URL)
- user_agent: Text (browser info)
- ip_address: Text (user IP)
```

## Maintenance

### Cleanup Old Logs

Automatically runs every 30 days, or manually execute:

```sql
SELECT public.cleanup_old_logs();
```

### Query Logs Directly

```sql
-- Recent errors
SELECT * FROM application_logs 
WHERE level IN ('error', 'fatal') 
ORDER BY created_at DESC 
LIMIT 50;

-- Logs by source
SELECT source, count(*) 
FROM application_logs 
GROUP BY source 
ORDER BY count DESC;

-- User activity
SELECT user_id, count(*) as log_count
FROM application_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY user_id;
```

## Troubleshooting

### Logs Not Appearing

1. Check edge function is deployed: `ingest-logs`
2. Verify table exists: `application_logs`
3. Check RLS policies are enabled
4. Look for errors in browser console

### Performance Issues

1. Increase flush interval: Edit `flushInterval` in `src/lib/logger.ts`
2. Increase buffer size: Edit `maxBufferSize` in `src/lib/logger.ts`
3. Check database indexes are present
4. Consider implementing log level filtering in production

## Example Integration

See `src/pages/Documents.tsx` for a complete example of logging integration in a component.
