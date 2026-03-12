---
name: skill-react
description: "React component development: hooks, TypeScript, component patterns, state management, UI extensions. Covers Shopify Polaris (admin UI), Shopify Checkout UI Extensions (@shopify/ui-extensions-react), Shopify Theme Extensions (Liquid + JS), and general React best practices. Use when: (1) building React components or pages, (2) implementing Shopify admin UI with Polaris, (3) building Checkout UI Extensions, (4) writing Theme Extension JavaScript that interacts with Liquid, (5) React TypeScript patterns. NOT for: pure server-side rendering without React, Vue/Svelte/Angular projects."
---

# React Skill

## Component 基本模式（TypeScript）

```typescript
interface Props {
  title: string;
  onSelect: (value: string) => void;
  isLoading?: boolean;
}

export function MyComponent({ title, onSelect, isLoading = false }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    onSelect(value);
  }, [value, onSelect]);

  if (isLoading) return <Spinner />;
  return (
    <div>
      <h2>{title}</h2>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
```

## Shopify Polaris（Admin UI）

```typescript
import {
  Page, Card, Button, TextField, Banner, Spinner, Layout, Text
} from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import { AppProvider } from '@shopify/polaris';

// App wrapper（Remix root.tsx 中）
export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Outlet />
    </AppProvider>
  );
}

// 典型設定頁
export default function SettingsPage() {
  const [cvsname, setCvsname] = useState('');
  return (
    <Page title="超商選店設定">
      <Layout>
        <Layout.Section>
          <Card>
            <TextField
              label="MCVS 站台名稱"
              value={cvsname}
              onChange={setCvsname}
              autoComplete="off"
            />
            <Button variant="primary" submit>儲存設定</Button>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Shopify Checkout UI Extension

```typescript
// extensions/cvs-pickup/src/index.tsx
import { reactExtension, useCartLines, Text, BlockStack, Banner } from '@shopify/ui-extensions-react/checkout';

export default reactExtension('purchase.checkout.delivery-address.render-before', () => <CvsPickupInfo />);

function CvsPickupInfo() {
  // 讀取 Cart Attributes
  const cartLines = useCartLines();
  // 實際上用 useAttributeValues 讀 pickup_store_name 等
  
  return (
    <BlockStack>
      <Banner status="info">
        <Text>取貨門市：全家大發店</Text>
        <Text size="small">苗栗縣苗栗市...</Text>
      </Banner>
    </BlockStack>
  );
}
```

## Theme Extension（Cart 頁 JS）

```javascript
// extensions/theme-cvs/assets/cvs-picker.js
(function () {
  const POPUP_URL = 'https://app.lifecom.com.tw/cvs/select';
  
  function openCvsPicker(cartToken, provider) {
    const sessionToken = generateUUID();
    const callbackUrl = `${APP_URL}/cvs/callback/${provider}`;
    
    const url = buildMcvsUrl({ sessionToken, cartToken, callbackUrl });
    const popup = window.open(url, 'cvs-picker', 'width=800,height=600');
    
    window.addEventListener('message', function handler(e) {
      if (e.data === 'cvs_selected') {
        window.removeEventListener('message', handler);
        popup?.close();
        refreshStoreInfo();
      }
    });
  }
  
  function refreshStoreInfo() {
    fetch('/cart.js')
      .then(r => r.json())
      .then(cart => {
        const attrs = cart.attributes;
        const name = attrs.pickup_store_name;
        if (name) {
          document.getElementById('cvs-store-name').textContent = name;
          document.getElementById('cvs-confirm').style.display = 'block';
        }
      });
  }
  
  // 初始化按鈕
  document.querySelectorAll('[data-cvs-picker]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cartToken = btn.dataset.cartToken;
      const provider = btn.dataset.provider || 'family';
      openCvsPicker(cartToken, provider);
    });
  });
  
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
})();
```

## useFetcher 非同步操作模式

```typescript
export default function Page() {
  const fetcher = useFetcher<ActionData>();
  const isSubmitting = fetcher.state !== 'idle';

  return (
    <fetcher.Form method="post">
      <Button submit loading={isSubmitting}>儲存</Button>
      {fetcher.data?.error && <Banner status="critical">{fetcher.data.error}</Banner>}
    </fetcher.Form>
  );
}
```
