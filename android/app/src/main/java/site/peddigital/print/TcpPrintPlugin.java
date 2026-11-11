package site.peddigital.print;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        executor.execute(() -> {
            try {
                PrintUtil.sendBase64(host, p, data);
                call.resolve();
            } catch (Exception e) {
                call.reject("Falha ao imprimir em " + host + ":" + p + " — " + e.getMessage());
            }
        });
    }
}
