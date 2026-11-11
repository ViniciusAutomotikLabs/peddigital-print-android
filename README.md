# PedDigital Print — Android (QR + impressão)

APK que:
1. Imprime ESC/POS na Bematech (TCP `9100`) **sem Mac**
2. Sobe um **servidor Wi‑Fi** na porta `8787`
3. Mostra **QR da mesa** para o cliente abrir o cardápio no celular
4. Lê QR (botão **QR**) para carregar mesa/comanda

## Fluxo

```
Cliente lê QR  →  http://IP_DO_ANDROID:8787/?mesa=12
               →  monta pedido
               →  Android imprime na Bematech
```

O Android fica na tomada, mesma Wi‑Fi da impressora.

## Instalar

Release: https://github.com/ViniciusAutomotikLabs/peddigital-print-android/releases

1. Instale o APK  
2. Abra o app (permite câmera se for ler QR)  
3. ⚙ → copie/mostre o QR da mesa  
4. No outro celular: leia o QR → peça → **Enviar e imprimir**

## iPhone

Abre o QR na Wi‑Fi do salão (Safari). Quem imprime é o **Android**; o iPhone só faz o pedido.
