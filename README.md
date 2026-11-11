# PedDigital Print — Android APK

Impressão **ESC/POS direta** na Bematech (TCP `IP:9100`) **sem Mac**.

## Android (este APK)

1. Baixe o `app-debug.apk` do Actions (artifact `peddigital-print-debug`)
2. No celular: permita instalar apps desconhecidos
3. Instale, conecte na **mesma Wi‑Fi** da impressora
4. Em ⚙ confira o IP (`192.168.1.26`) → Enviar e imprimir

## iPhone — opções

| Opção | Como |
|--------|------|
| **A · Recomendada no piloto** | Android parado na tomada = “estação de impressão”. Pedidos saem nele. iPhone só consulta/pede depois via web. |
| **B · App iOS** | Mesmo Capacitor, build com Mac + Xcode + conta Apple Developer (TestFlight). |
| **C · Android como servidor** | (próximo passo) APK sobe HTTP na LAN; iPhone abre o PWA nesse IP. |

Navegador do iPhone **sozinho** não abre porta 9100 (limitação da Apple).

## Build local (com Android Studio)

```bash
npm install
npx cap sync android
npx cap open android
```
