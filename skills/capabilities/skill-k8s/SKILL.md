---
name: skill-k8s
description: "Kubernetes container orchestration: writing manifests (Deployment, Service, Ingress, ConfigMap, Secret, HPA), multi-namespace environments, TLS/cert-manager, Cloudflare Tunnel (cloudflared), SQLite PVC, Redis StatefulSet, health checks, rolling deployments, resource limits. Use when: (1) deploying containerized apps to K8s, (2) writing or updating K8s YAML manifests, (3) setting up Cloudflare Tunnel instead of public Ingress, (4) configuring CI/CD for K8s, (5) troubleshooting pod/service issues. NOT for: AWS-specific infra (use skill-aws), pure Docker-only setups, or non-K8s container runtimes."
---

# Kubernetes Skill

## LifeCOM K8s 部署規範

- **Cluster**：LifeCOM 自建 K8s（需確認 ingress controller 與 cert-manager 狀態）
- **Namespace 命名**：`lifecom-<project>`（e.g. `lifecom-shopify`）
- **Image Registry**：確認後填入（自建 registry 或 Docker Hub）
- **TLS**：cert-manager + Let's Encrypt，或現有 wildcard cert

## 標準 Deployment 模板

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <app-name>
  namespace: lifecom-<project>
spec:
  replicas: 2
  selector:
    matchLabels:
      app: <app-name>
  template:
    metadata:
      labels:
        app: <app-name>
    spec:
      containers:
        - name: <app-name>
          image: <registry>/<image>:<tag>
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: <app-name>-config
            - secretRef:
                name: <app-name>-secret
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
```

## Ingress + TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <app-name>-ingress
  namespace: lifecom-<project>
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - <app-domain>
      secretName: <app-name>-tls
  rules:
    - host: <app-domain>
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <app-name>
                port:
                  number: 3000
```

## Secret（Base64 encode 必填）

```bash
# 生成 base64 值
echo -n 'my-secret-value' | base64
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: <app-name>-secret
  namespace: lifecom-<project>
type: Opaque
data:
  DB_PASSWORD: <base64>
  API_SECRET: <base64>
```

## Cloudflare Tunnel（無 Public IP 方案）

適用情境：K8s cluster 沒有外部 IP，透過 cloudflared 打通 Cloudflare edge。

```yaml
# cloudflared Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: lifecom-shopify
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args:
            - tunnel
            - --config
            - /etc/cloudflared/config.yaml
            - run
          volumeMounts:
            - name: config
              mountPath: /etc/cloudflared
              readOnly: true
            - name: creds
              mountPath: /etc/cloudflared/creds
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: cloudflared-config
        - name: creds
          secret:
            secretName: cloudflared-creds
---
# ConfigMap: tunnel config
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudflared-config
  namespace: lifecom-shopify
data:
  config.yaml: |
    tunnel: <TUNNEL_ID>
    credentials-file: /etc/cloudflared/creds/credentials.json
    ingress:
      - hostname: cvs.licodes.net
        service: http://shopify-cvs-app:3000
      - service: http_status:404
```

```bash
# 初始設定（一次性，本機執行）
cloudflared tunnel login
cloudflared tunnel create shopify-cvs
cloudflared tunnel route dns shopify-cvs cvs.licodes.net

# 取得 credentials.json 建立 K8s Secret
kubectl create secret generic cloudflared-creds \
  --from-file=credentials.json=~/.cloudflared/<TUNNEL_ID>.json \
  -n lifecom-shopify
```

## SQLite + PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shopify-cvs-sqlite
  namespace: lifecom-shopify
spec:
  accessModes:
    - ReadWriteOnce     # 只能單 pod 掛載（SQLite 限制）
  resources:
    requests:
      storage: 1Gi
```

> ⚠️ SQLite PVC 使用 ReadWriteOnce，Deployment replicas 必須設為 **1**。

## Redis Deployment（自建）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shopify-cvs-redis
  namespace: lifecom-shopify
spec:
  replicas: 1
  selector:
    matchLabels:
      app: shopify-cvs-redis
  template:
    metadata:
      labels:
        app: shopify-cvs-redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: shopify-cvs-redis
  namespace: lifecom-shopify
spec:
  selector:
    app: shopify-cvs-redis
  ports:
    - port: 6379
      targetPort: 6379
```

## 常用 kubectl 指令

```bash
# 查 pod 狀態
kubectl get pods -n lifecom-<project>

# 看 log
kubectl logs -f deployment/<app-name> -n lifecom-<project>

# 強制重啟
kubectl rollout restart deployment/<app-name> -n lifecom-<project>

# 查 ingress
kubectl get ingress -n lifecom-<project>

# 描述 pod（debug 用）
kubectl describe pod <pod-name> -n lifecom-<project>
```

## CI/CD 整合（GitHub Actions）

```yaml
- name: Deploy to K8s
  run: |
    kubectl set image deployment/<app-name> \
      <app-name>=${{ env.IMAGE }}:${{ github.sha }} \
      -n lifecom-<project>
    kubectl rollout status deployment/<app-name> -n lifecom-<project>
```
