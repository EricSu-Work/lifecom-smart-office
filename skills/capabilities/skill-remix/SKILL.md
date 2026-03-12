---
name: skill-remix
description: "Remix full-stack web framework: route structure, loaders, actions, TypeScript, session management, OAuth flows, database integration, error boundaries, streaming. Use when: (1) building full-stack web apps with Remix, (2) implementing server-side rendering with loaders/actions, (3) OAuth / session management in Remix apps, (4) integrating Remix with PostgreSQL or external APIs, (5) Remix app structure and best practices. NOT for: Next.js projects (different paradigm), pure client-side React SPAs (no server), or static site generation."
---

# Remix Skill

## App 結構

```
app/
├── root.tsx              # Root layout, global error boundary
├── routes/
│   ├── _index.tsx        # / 首頁
│   ├── auth.callback.tsx # OAuth callback
│   ├── api.webhook.tsx   # Webhook endpoint
│   └── app._index.tsx    # Embedded app index (Shopify 用)
├── lib/
│   ├── db.server.ts      # DB connection（server only）
│   ├── session.server.ts # Session management
│   └── api/              # External API clients
└── components/           # Shared React components
```

## Loader / Action 模式

```typescript
// Loader：GET 資料
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await getSession(request);
  const data = await db.query('SELECT ...', [session.shopId]);
  return json({ data });
};

// Action：處理 POST/PUT/DELETE
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const result = await processData(formData);
  return json({ success: true, result });
};

export default function Page() {
  const { data } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  return <div>...</div>;
}
```

## Session Management

```typescript
// app/lib/session.server.ts
import { createCookieSessionStorage } from '@remix-run/node';

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: '__session',
      secrets: [process.env.SESSION_SECRET!],
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  });
```

## DB 整合（PostgreSQL + pg）

```typescript
// app/lib/db.server.ts
import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

// 使用
const result = await db.query('SELECT * FROM merchants WHERE shop = $1', [shop]);
```

## Webhook Handler（HMAC 驗證）

```typescript
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.text();
  const hmac = request.headers.get('X-Webhook-Hmac') ?? '';
  
  const hash = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(body, 'utf8')
    .digest('base64');
  
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const payload = JSON.parse(body);
  // process payload...
  return new Response('OK', { status: 200 });
};
```

## OAuth Flow

```typescript
// routes/auth.tsx → 導向 OAuth provider
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const state = crypto.randomUUID();
  const session = await getSession(request);
  session.set('oauth_state', state);
  
  const authUrl = buildOAuthUrl({ state, redirectUri: CALLBACK_URL });
  return redirect(authUrl, {
    headers: { 'Set-Cookie': await commitSession(session) },
  });
};

// routes/auth.callback.tsx → 接收 code，換 token
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const token = await exchangeCodeForToken(code!);
  await saveToken(token);
  return redirect('/app');
};
```

## 環境變數（.env）

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
SESSION_SECRET=<random-32-chars>
NODE_ENV=production
PORT=3000
```

## 部署（Docker）

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```
