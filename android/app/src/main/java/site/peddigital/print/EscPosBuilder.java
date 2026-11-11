package site.peddigital.print;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public final class EscPosBuilder {
    private static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    private EscPosBuilder() {}

    public static byte[] build(String station, String mesa, String comanda, String note, JSONArray items) throws Exception {
        List<Byte> out = new ArrayList<>();
        add(out, 0x1b, 0x40);
        add(out, 0x1b, 0x61, 0x01);
        add(out, 0x1b, 0x21, 0x30);
        text(out, "PedDigital\n");
        add(out, 0x1b, 0x21, 0x00);
        text(out, station.toUpperCase(Locale.US) + "\n");
        text(out, "--------------------------------\n");
        add(out, 0x1b, 0x61, 0x00);
        String when = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.US).format(new Date());
        text(out, "Data: " + when + "\n");
        if (mesa != null && !mesa.isEmpty()) text(out, "Mesa: " + mesa + "\n");
        if (comanda != null && !comanda.isEmpty()) text(out, "Comanda: " + comanda + "\n");
        text(out, "--------------------------------\n");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                int qty = item.optInt("qty", 1);
                String name = item.optString("name", "Item");
                add(out, 0x1b, 0x45, 0x01);
                text(out, qty + "x  " + name + "\n");
                add(out, 0x1b, 0x45, 0x00);
                String itemNote = item.optString("note", "");
                if (!itemNote.isEmpty()) text(out, "   Obs: " + itemNote + "\n");
            }
        }
        if (note != null && !note.isEmpty()) {
            text(out, "--------------------------------\n");
            text(out, "Obs geral: " + note + "\n");
        }
        text(out, "--------------------------------\n");
        add(out, 0x1b, 0x61, 0x01);
        text(out, "Pedido via QR / Wi-Fi\n");
        add(out, 0x1b, 0x64, 0x04);
        add(out, 0x1d, 0x56, 0x00);

        byte[] bytes = new byte[out.size()];
        for (int i = 0; i < out.size(); i++) bytes[i] = out.get(i);
        return bytes;
    }

    private static void text(List<Byte> out, String s) {
        for (byte b : s.getBytes(LATIN1)) out.add(b);
    }

    private static void add(List<Byte> out, int... vals) {
        for (int v : vals) out.add((byte) v);
    }
}
