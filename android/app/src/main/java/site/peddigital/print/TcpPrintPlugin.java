package site.peddigital.print;

import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TcpPrint")
public class TcpPrintPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void send(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 9100);
        String data = call.getString("data");

        if (host == null || host.isEmpty()) {
            call.reject("host obrigatório");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("data (base64) obrigatório");
            return;
        }

        final int p = port == null ? 9100 : port;
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("base64 inválido: " + e.getMessage());
            return;
        }

        executor.execute(() -> {
            Socket socket = null;
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(host, p), 5000);
                socket.setSoTimeout(5000);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                socket.close();
                call.resolve();
            } catch (Exception e) {
                call.reject("Falha ao imprimir em " + host + ":" + p + " — " + e.getMessage());
            } finally {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }
}
