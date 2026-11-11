package site.peddigital.print;

import android.util.Base64;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

public final class PrintUtil {
    private PrintUtil() {}

    public static void sendRaw(String host, int port, byte[] bytes) throws Exception {
        Socket socket = null;
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setSoTimeout(5000);
            OutputStream out = socket.getOutputStream();
            out.write(bytes);
            out.flush();
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    public static void sendBase64(String host, int port, String base64) throws Exception {
        sendRaw(host, port, Base64.decode(base64, Base64.DEFAULT));
    }
}
