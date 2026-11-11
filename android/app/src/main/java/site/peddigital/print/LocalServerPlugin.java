package site.peddigital.print;

import android.content.res.AssetManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "LocalServer")
public class LocalServerPlugin extends Plugin {
    private static final String TAG = "LocalServer";
    private final ExecutorService acceptPool = Executors.newCachedThreadPool();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private ServerSocket serverSocket;
    private int port = 8787;
    private String kitchenIp = "192.168.1.26";
    private String barIp = "192.168.1.26";
    private int printerPort = 9100;

    @PluginMethod
    public void start(PluginCall call) {
        Integer p = call.getInt("port", 8787);
        String k = call.getString("kitchenIp", kitchenIp);
        String b = call.getString("barIp", barIp);
        Integer pp = call.getInt("printerPort", 9100);
        if (p != null) port = p;
        if (k != null && !k.isEmpty()) kitchenIp = k;
        if (b != null && !b.isEmpty()) barIp = b;
        if (pp != null) printerPort = pp;

        if (running.get()) {
            call.resolve(statusObject());
            return;
        }

        acceptPool.execute(() -> {
            try {
                serverSocket = new ServerSocket(port);
                running.set(true);
                Log.i(TAG, "Listening on " + port);
                getActivity().runOnUiThread(() -> call.resolve(statusObject()));
                while (running.get()) {
                    try {
                        Socket client = serverSocket.accept();
                        acceptPool.execute(() -> handleClient(client));
                    } catch (Exception e) {
                        if (running.get()) Log.e(TAG, "accept failed", e);
                    }
                }
            } catch (Exception e) {
                running.set(false);
                getActivity().runOnUiThread(() -> call.reject("Falha ao abrir servidor: " + e.getMessage()));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        running.set(false);
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (Exception ignored) {
        }
        call.resolve(statusObject());
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    private JSObject statusObject() {
        JSObject o = new JSObject();
        String ip = lanIPv4();
        o.put("running", running.get());
        o.put("port", port);
        o.put("lanIp", ip);
        o.put("url", "http://" + ip + ":" + port);
        o.put("kitchenIp", kitchenIp);
        o.put("barIp", barIp);
        return o;
    }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(15000);
            InputStream in = client.getInputStream();
            ByteArrayOutputStream headerBuf = new ByteArrayOutputStream();
            int state = 0;
            int b;
            while ((b = in.read()) != -1) {
                headerBuf.write(b);
                byte[] arr = headerBuf.toByteArray();
                int n = arr.length;
                if (n >= 4
                        && arr[n - 4] == '\r'
                        && arr[n - 3] == '\n'
                        && arr[n - 2] == '\r'
                        && arr[n - 1] == '\n') {
                    break;
                }
                if (headerBuf.size() > 65536) break;
            }

            String headers = headerBuf.toString(StandardCharsets.ISO_8859_1.name());
            String[] lines = headers.split("\r\n");
            if (lines.length == 0) {
                client.close();
                return;
            }
            String[] req = lines[0].split(" ");
            String method = req.length > 0 ? req[0] : "GET";
            String path = req.length > 1 ? req[1] : "/";
            int q = path.indexOf('?');
            String query = q >= 0 ? path.substring(q + 1) : "";
            if (q >= 0) path = path.substring(0, q);

            int contentLength = 0;
            for (String line : lines) {
                if (line.toLowerCase(Locale.US).startsWith("content-length:")) {
                    contentLength = Integer.parseInt(line.substring(15).trim());
                }
            }
            byte[] body = new byte[Math.max(contentLength, 0)];
            int read = 0;
            while (read < body.length) {
                int r = in.read(body, read, body.length - read);
                if (r < 0) break;
                read += r;
            }

            if ("OPTIONS".equalsIgnoreCase(method)) {
                writeResponse(client, 204, "text/plain", new byte[0], true);
                return;
            }

            if ("/api/health".equals(path)) {
                JSObject st = statusObject();
                writeJson(client, 200, st.toString());
                return;
            }

            if ("/api/print".equals(path) && "POST".equalsIgnoreCase(method)) {
                handlePrint(client, new String(body, StandardCharsets.UTF_8));
                return;
            }

            serveAsset(client, path);
        } catch (Exception e) {
            Log.e(TAG, "client error", e);
            try {
                client.close();
            } catch (Exception ignored) {
            }
        }
    }

    private void handlePrint(Socket client, String json) throws Exception {
        JSONObject body = new JSONObject(json);
        String mesa = body.optString("mesa", "12");
        String comanda = body.optString("comanda", "T");
        String note = body.optString("note", "");
        String kIp = body.optString("kitchenIp", kitchenIp);
        String bIp = body.optString("barIp", barIp);
        JSONArray tickets = body.getJSONArray("tickets");

        JSONArray results = new JSONArray();
        for (int i = 0; i < tickets.length(); i++) {
            JSONObject ticket = tickets.getJSONObject(i);
            String station = ticket.optString("station", "COZINHA").toUpperCase(Locale.US);
            String host = "BAR".equals(station) ? bIp : kIp;
            byte[] payload = EscPosBuilder.build(
                    station,
                    mesa,
                    comanda,
                    note,
                    ticket.optJSONArray("items")
            );
            PrintUtil.sendRaw(host, printerPort, payload);
            JSONObject r = new JSONObject();
            r.put("station", station);
            r.put("host", host);
            r.put("bytes", payload.length);
            results.put(r);
        }
        JSONObject ok = new JSONObject();
        ok.put("ok", true);
        ok.put("results", results);
        writeJson(client, 200, ok.toString());
    }

    private void serveAsset(Socket client, String path) throws IOException {
        if (path.equals("/")) path = "/index.html";
        String assetPath = "public" + path;
        AssetManager am = getContext().getAssets();
        try (InputStream stream = am.open(assetPath)) {
            byte[] data = readAll(stream);
            writeResponse(client, 200, mime(path), data, true);
        } catch (IOException e) {
            // SPA fallback
            try (InputStream stream = am.open("public/index.html")) {
                writeResponse(client, 200, "text/html; charset=utf-8", readAll(stream), true);
            }
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static String mime(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private void writeJson(Socket client, int code, String json) throws IOException {
        writeResponse(client, code, "application/json; charset=utf-8", json.getBytes(StandardCharsets.UTF_8), true);
    }

    private void writeResponse(Socket client, int code, String contentType, byte[] body, boolean cors) throws IOException {
        OutputStream out = client.getOutputStream();
        PrintWriter writer = new PrintWriter(new OutputStreamWriter(out, StandardCharsets.US_ASCII), false);
        String reason = code == 200 ? "OK" : code == 204 ? "No Content" : "Error";
        writer.print("HTTP/1.1 " + code + " " + reason + "\r\n");
        writer.print("Content-Type: " + contentType + "\r\n");
        writer.print("Content-Length: " + body.length + "\r\n");
        writer.print("Connection: close\r\n");
        if (cors) {
            writer.print("Access-Control-Allow-Origin: *\r\n");
            writer.print("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            writer.print("Access-Control-Allow-Headers: Content-Type\r\n");
        }
        writer.print("\r\n");
        writer.flush();
        out.write(body);
        out.flush();
        client.close();
    }

    private static String lanIPv4() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "127.0.0.1";
    }
}
