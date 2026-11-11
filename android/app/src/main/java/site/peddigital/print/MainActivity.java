package site.peddigital.print;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TcpPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
